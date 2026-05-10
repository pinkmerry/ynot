-- Phase 6: Replace open_gacha_campaign with spin-mode aware version
--
-- Same wallet/cost/idempotency/audit semantics as the v2 in
-- 20260509100000_admin_test_categories_inventory.sql, but the per-iteration
-- prize-unit selection now branches on draw_rounds.spin_mode:
--
--   pure_random    : ORDER BY random()  (current behavior)
--   weighted       : weighted reservoir using prizes.weight
--                    sort key = -ln(1 - random()) / weight  (skip weight<=0)
--   inventory_gate : same as weighted, plus a WHERE clause that filters out
--                    prizes whose unlock_at_sold_pct > current_sold_pct.
--                    current_sold_pct is computed once per spin from
--                    draw_round_prize_units (claimed/total).
--
-- All branches still use FOR UPDATE OF units SKIP LOCKED to stay race-safe.
-- Wallet lock is taken first (per profile) so ordering is consistent.
--
-- Backward compatibility: existing live campaigns have spin_mode='pure_random'
-- (default from phase 2) and weight=1, unlock_at_sold_pct=0 (defaults from
-- phase 3), which makes the new query equivalent to the old uniform pick.

begin;

create or replace function public.open_gacha_campaign(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_quantity integer default 1,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  existing_open public.gacha_opens%rowtype;
  open_row public.gacha_opens%rowtype;
  slot_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_tier text;
  unit_value_thb integer;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  open_item_id uuid;
  new_collection_item_id uuid;
  available_slot_count integer;
  available_unit_count integer;
  current_sold_pct numeric;
  total_units integer;
  awarded_units integer;
  result_items jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'invalid_open_quantity';
  end if;

  -- Idempotency replay
  if p_idempotency_key is not null then
    select * into existing_open
    from public.gacha_opens
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_open.id is not null then
      return jsonb_build_object(
        'status', existing_open.status,
        'openId', existing_open.id,
        'publicCode', existing_open.public_code,
        'replayed', true
      );
    end if;
  end if;

  -- Lock campaign row
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  if coalesce(campaign.is_test, false) = true
     and not public.profile_can_open_test_draw_round(p_draw_round_id, p_profile_id) then
    raise exception 'test_campaign_not_allowed';
  end if;

  -- Pre-flight: enough slots + units
  select count(*)::integer into available_slot_count
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status = 'available';
  if available_slot_count < p_quantity then
    raise exception 'not_enough_available_slots';
  end if;

  select count(*)::integer into available_unit_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id and status = 'available';
  if available_unit_count < p_quantity then
    raise exception 'not_enough_prize_inventory';
  end if;

  total_cost := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer)) * p_quantity;

  -- Wallet lock + balance check
  insert into public.wallet_accounts(profile_id) values (p_profile_id)
    on conflict (profile_id) do nothing;
  select * into locked_wallet from public.wallet_accounts
    where profile_id = p_profile_id for update;

  if locked_wallet.balance_coins < total_cost then
    raise exception 'insufficient_balance';
  end if;

  -- Create open row + ledger
  insert into public.gacha_opens(profile_id, draw_round_id, cost_coins, quantity, status, idempotency_key, metadata)
  values (p_profile_id, p_draw_round_id, total_cost, p_quantity, 'completed', p_idempotency_key,
          jsonb_build_object('campaignSlug', campaign.slug,
                             'isTest', coalesce(campaign.is_test, false),
                             'spinMode', campaign.spin_mode))
  returning * into open_row;

  insert into public.coin_ledger(
    profile_id, wallet_profile_id, entry_type, amount_coins,
    balance_before, balance_after, reference_type, reference_id,
    idempotency_key, metadata
  ) values (
    p_profile_id, p_profile_id, 'gacha_spend', -total_cost,
    locked_wallet.balance_coins, locked_wallet.balance_coins - total_cost,
    'gacha_open', open_row.id, p_idempotency_key,
    jsonb_build_object('drawRoundId', p_draw_round_id, 'quantity', p_quantity,
                       'isTest', coalesce(campaign.is_test, false),
                       'spinMode', campaign.spin_mode)
  ) returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins - total_cost, version = version + 1
  where profile_id = p_profile_id;

  update public.gacha_opens set ledger_entry_id = ledger_id where id = open_row.id;

  -- Spin loop: branch on spin_mode
  for position_index in 1..p_quantity loop
    -- Take next available slot in order
    select id into slot_id
    from public.draw_slots
    where draw_round_id = p_draw_round_id and status = 'available'
    order by slot_number asc
    limit 1 for update skip locked;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    -- Pick a prize unit per spin_mode
    if campaign.spin_mode = 'pure_random' then
      select units.id, units.draw_round_prize_id, units.card_id, prizes.tier, prizes.value_thb
      into unit_id, unit_prize_id, unit_card_id, unit_tier, unit_value_thb
      from public.draw_round_prize_units units
      join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
      where units.draw_round_id = p_draw_round_id
        and units.status = 'available'
      order by random()
      limit 1
      for update of units skip locked;

    elsif campaign.spin_mode = 'weighted' then
      -- Weighted reservoir: skip weight<=0; sort key = -ln(1-r)/weight
      -- (smaller key = more likely; weight=0 disabled)
      select units.id, units.draw_round_prize_id, units.card_id, prizes.tier, prizes.value_thb
      into unit_id, unit_prize_id, unit_card_id, unit_tier, unit_value_thb
      from public.draw_round_prize_units units
      join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
      where units.draw_round_id = p_draw_round_id
        and units.status = 'available'
        and prizes.weight > 0
      order by -ln(greatest(1.0 - random(), 1e-12)) / prizes.weight asc
      limit 1
      for update of units skip locked;

    elsif campaign.spin_mode = 'inventory_gate' then
      -- Compute current sold % once per spin (recomputed each iteration so
      -- bands unlock progressively within a multi-pull batch as well)
      select count(*)::integer,
             count(*) filter (where status = 'awarded')::integer
        into total_units, awarded_units
        from public.draw_round_prize_units
        where draw_round_id = p_draw_round_id;

      if total_units = 0 then
        current_sold_pct := 0;
      else
        current_sold_pct := awarded_units::numeric * 100.0 / total_units::numeric;
      end if;

      select units.id, units.draw_round_prize_id, units.card_id, prizes.tier, prizes.value_thb
      into unit_id, unit_prize_id, unit_card_id, unit_tier, unit_value_thb
      from public.draw_round_prize_units units
      join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
      where units.draw_round_id = p_draw_round_id
        and units.status = 'available'
        and prizes.weight > 0
        and prizes.unlock_at_sold_pct <= current_sold_pct
      order by -ln(greatest(1.0 - random(), 1e-12)) / prizes.weight asc
      limit 1
      for update of units skip locked;

      -- No fallback to locked prize bands: if no unlocked weighted unit can be
      -- selected, fail the spin instead of awarding a prize before its unlock
      -- threshold. This preserves the inventory-gate guarantee under both
      -- normal and concurrent pulls.
    else
      raise exception 'unknown_spin_mode';
    end if;

    if unit_id is null then
      raise exception 'not_enough_prize_inventory';
    end if;

    -- Apply: mark slot opened, write open_item, collection_item, claim unit
    update public.draw_slots
    set status = 'opened', opened_at = now()
    where id = slot_id;

    insert into public.gacha_open_items(
      gacha_open_id, card_id, draw_round_prize_id, draw_round_prize_unit_id,
      tier, value_thb, result_position
    ) values (
      open_row.id, unit_card_id, unit_prize_id, unit_id,
      unit_tier, unit_value_thb, position_index
    ) returning id into open_item_id;

    insert into public.collection_items(profile_id, card_id, source_type, source_id, status, serial_no)
    values (p_profile_id, unit_card_id, 'gacha_open', open_row.id, 'owned',
            open_row.public_code || '-' || lpad(position_index::text, 2, '0'))
    returning id into new_collection_item_id;

    update public.draw_round_prize_units
    set status = 'awarded',
        profile_id = p_profile_id,
        gacha_open_id = open_row.id,
        gacha_open_item_id = open_item_id,
        collection_item_id = new_collection_item_id,
        awarded_at = now(),
        metadata = metadata || jsonb_build_object('slotId', slot_id, 'position', position_index)
    where id = unit_id;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', unit_card_id,
      'tier', unit_tier,
      'valueThb', unit_value_thb,
      'position', position_index,
      'prizeUnitId', unit_id
    ));
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)
  values (p_profile_id, 'gacha_opened', p_draw_round_id, open_row.id,
          jsonb_build_object('quantity', p_quantity, 'cost_coins', total_cost,
                             'isTest', coalesce(campaign.is_test, false),
                             'spinMode', campaign.spin_mode));

  return jsonb_build_object(
    'status', 'completed',
    'openId', open_row.id,
    'publicCode', open_row.public_code,
    'costCoins', total_cost,
    'spinMode', campaign.spin_mode,
    'items', result_items
  );
end;
$$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;

commit;
