-- Enforce owner-configured open button quantities inside the RPC after the
-- live/public/approved/test-access gate, so private campaign settings are not
-- exposed by the API before access is authorized.

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
  unit_weight numeric;
  unit_unlock_at_sold_pct numeric;
  effective_unit_weight numeric;
  effective_unit_unlock_at_sold_pct numeric;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  open_item_id uuid;
  new_collection_item_id uuid;
  available_slot_count integer;
  available_unit_count integer;
  sold_pct numeric := 0;
  logic_mode text := 'pure_random';
  open_quantity_options integer[] := array[1, 10, 100];
  result_items jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'invalid_open_quantity';
  end if;

  if p_idempotency_key is not null then
    select * into existing_open
    from public.gacha_opens
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_open.id is not null then
      return jsonb_build_object('status', existing_open.status, 'openId', existing_open.id, 'publicCode', existing_open.public_code, 'replayed', true);
    end if;
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
    and approval_status = 'approved'
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  logic_mode := coalesce(campaign.logic_snapshot->>'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
  end if;

  if coalesce(campaign.is_test, false) = true and not public.profile_can_open_test_draw_round(p_draw_round_id, p_profile_id) then
    raise exception 'test_campaign_not_allowed';
  end if;

  select coalesce(array_agg(option order by option), array[1, 10, 100]::integer[])
  into open_quantity_options
  from (
    select distinct
      least(100, greatest(1, round((option_value #>> '{}')::numeric)::integer)) as option
    from jsonb_array_elements(
      case
        when jsonb_typeof(campaign.logic_snapshot->'openQuantityOptions') = 'array'
          then campaign.logic_snapshot->'openQuantityOptions'
        else '[1, 10, 100]'::jsonb
      end
    ) as raw_options(option_value)
    where jsonb_typeof(option_value) in ('number', 'string')
      and (option_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
    order by option
    limit 5
  ) normalized_options;

  if not p_quantity = any(open_quantity_options) then
    raise exception 'invalid_open_quantity_option';
  end if;

  select count(*)::integer into available_slot_count
  from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available';

  if available_slot_count < p_quantity then
    raise exception 'not_enough_available_slots';
  end if;

  select count(*)::integer into available_unit_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id
    and status = 'available';

  if available_unit_count < p_quantity then
    raise exception 'not_enough_prize_inventory';
  end if;

  total_cost := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer)) * p_quantity;

  insert into public.wallet_accounts(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = p_profile_id
  for update;

  if locked_wallet.balance_coins < total_cost then
    raise exception 'insufficient_balance';
  end if;

  insert into public.gacha_opens(profile_id, draw_round_id, cost_coins, quantity, status, idempotency_key, metadata)
  values (
    p_profile_id,
    p_draw_round_id,
    total_cost,
    p_quantity,
    'completed',
    p_idempotency_key,
    jsonb_build_object(
      'campaignSlug', campaign.slug,
      'isTest', coalesce(campaign.is_test, false),
      'logicMode', logic_mode,
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb)
    )
  )
  returning * into open_row;

  insert into public.coin_ledger(
    profile_id,
    wallet_profile_id,
    entry_type,
    amount_coins,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) values (
    p_profile_id,
    p_profile_id,
    'gacha_spend',
    -total_cost,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins - total_cost,
    'gacha_open',
    open_row.id,
    p_idempotency_key,
    jsonb_build_object(
      'drawRoundId', p_draw_round_id,
      'quantity', p_quantity,
      'isTest', coalesce(campaign.is_test, false),
      'logicMode', logic_mode,
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb)
    )
  )
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins - total_cost,
      version = version + 1
  where profile_id = p_profile_id;

  update public.gacha_opens
  set ledger_entry_id = ledger_id
  where id = open_row.id;

  for position_index in 1..p_quantity loop
    select id into slot_id
    from public.draw_slots
    where draw_round_id = p_draw_round_id
      and status = 'available'
    order by slot_number asc
    limit 1
    for update skip locked;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    update public.draw_slots
    set status = 'opened', opened_at = now()
    where id = slot_id;

    select
      case
        when coalesce(campaign.total_slots, 0) <= 0 then 100::numeric
        else least(
          100::numeric,
          (
            count(*) filter (where status in ('picked', 'opened'))::numeric
            / greatest(campaign.total_slots, 1)::numeric
          ) * 100
        )
      end
    into sold_pct
    from public.draw_slots
    where draw_round_id = p_draw_round_id;

    select
      units.id,
      units.draw_round_prize_id,
      units.card_id,
      prizes.tier,
      prizes.value_thb,
      prizes.weight,
      prizes.unlock_at_sold_pct,
      case
        when logic_mode = 'pure_random' then 1::numeric
        else coalesce(prizes.weight, 1)
      end as effective_weight,
      case
        when logic_mode = 'inventory_gated' then coalesce(prizes.unlock_at_sold_pct, 0)
        else 0::numeric
      end as effective_unlock_at_sold_pct
    into
      unit_id,
      unit_prize_id,
      unit_card_id,
      unit_tier,
      unit_value_thb,
      unit_weight,
      unit_unlock_at_sold_pct,
      effective_unit_weight,
      effective_unit_unlock_at_sold_pct
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    where units.draw_round_id = p_draw_round_id
      and units.status = 'available'
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
      and (logic_mode = 'pure_random' or coalesce(prizes.weight, 1) > 0)
      and (
        logic_mode <> 'inventory_gated'
        or coalesce(prizes.unlock_at_sold_pct, 0) <= sold_pct
      )
    order by
      -ln(greatest(random(), 0.000000000001)) /
      greatest(
        case
          when logic_mode = 'pure_random' then 1::double precision
          else coalesce(prizes.weight, 1)::double precision
        end,
        0.000000000001
      )
    limit 1
    for update of units skip locked;

    if unit_id is null then
      raise exception 'not_enough_unlocked_prize_inventory';
    end if;

    insert into public.gacha_open_items(gacha_open_id, card_id, draw_round_prize_id, draw_round_prize_unit_id, tier, value_thb, result_position)
    values (open_row.id, unit_card_id, unit_prize_id, unit_id, unit_tier, unit_value_thb, position_index)
    returning id into open_item_id;

    insert into public.collection_items(profile_id, card_id, source_type, source_id, status, serial_no)
    values (p_profile_id, unit_card_id, 'gacha_open', open_row.id, 'owned', open_row.public_code || '-' || lpad(position_index::text, 2, '0'))
    returning id into new_collection_item_id;

    update public.draw_round_prize_units
    set status = 'awarded',
        profile_id = p_profile_id,
        gacha_open_id = open_row.id,
        gacha_open_item_id = open_item_id,
        collection_item_id = new_collection_item_id,
        awarded_at = now(),
        metadata = metadata || jsonb_build_object(
          'slotId', slot_id,
          'position', position_index,
          'soldPctAtAward', sold_pct,
          'logicMode', logic_mode,
          'weight', unit_weight,
          'effectiveWeight', effective_unit_weight,
          'unlockAtSoldPct', unit_unlock_at_sold_pct,
          'effectiveUnlockAtSoldPct', effective_unit_unlock_at_sold_pct
        )
    where id = unit_id;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', unit_card_id,
      'tier', unit_tier,
      'valueThb', unit_value_thb,
      'position', position_index,
      'prizeUnitId', unit_id,
      'soldPct', sold_pct,
      'logicMode', logic_mode,
      'weight', unit_weight,
      'effectiveWeight', effective_unit_weight,
      'unlockAtSoldPct', unit_unlock_at_sold_pct,
      'effectiveUnlockAtSoldPct', effective_unit_unlock_at_sold_pct
    ));
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)
  values (
    p_profile_id,
    'gacha_opened',
    p_draw_round_id,
    open_row.id,
    jsonb_build_object(
      'quantity', p_quantity,
      'cost_coins', total_cost,
      'isTest', coalesce(campaign.is_test, false),
      'logicMode', logic_mode,
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb)
    )
  );

  return jsonb_build_object(
    'status', 'completed',
    'openId', open_row.id,
    'publicCode', open_row.public_code,
    'costCoins', total_cost,
    'logicMode', logic_mode,
    'items', result_items,
    'remaining', (
      select coalesce(summary, '{}'::jsonb)
      from jsonb_array_elements(public.get_draw_round_inventory_summary(p_draw_round_id, p_profile_id)) with ordinality as s(summary, ord)
      order by ord
      limit 1
    )
  );
end;
$$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
