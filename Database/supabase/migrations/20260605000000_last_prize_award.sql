-- Last One Prize — Phase 3: award the bonus card to whoever opens the final pack.
--
-- The last prize lives on draw_rounds columns (last_prize_card_id /
-- last_prize_metadata), NOT in the draw_round_prizes pool, so slot/odds/unit
-- invariants are completely untouched. This migration:
--   1. Adds award-bookkeeping columns to draw_rounds (idempotent guard + trace).
--   2. Recreates open_gacha_campaign — a byte-for-byte copy of 20260526000001
--      with TWO additions:
--        (a) the idempotency-replay projection flags the last-prize item, and
--        (b) after the normal pull loop, if this open consumed the final
--            available slot, the bonus card is awarded on top.
--
-- Race safety: open_gacha_campaign locks the draw_rounds row FOR UPDATE for the
-- whole transaction, so exactly one open ever observes "0 slots remaining" — the
-- award cannot double-fire. last_prize_awarded_at is a belt-and-suspenders guard.
--
-- Inventory: the chosen physical slab (card_stock_units) is moved to 'allocated'
-- (there is no 'awarded' status on that table — the normal pool tracks awards on
-- draw_round_prize_units, which the last prize deliberately does not use) so it
-- can never be handed out twice; the award trace is recorded in its metadata.
-- If no matching available slab exists at award time, the last prize is silently
-- skipped and the customer's normal pull is unaffected.

alter table public.draw_rounds
  add column if not exists last_prize_awarded_at timestamptz,
  add column if not exists last_prize_awarded_open_id uuid
    references public.gacha_opens(id) on delete set null,
  add column if not exists last_prize_stock_unit_id uuid
    references public.card_stock_units(id) on delete set null,
  add column if not exists last_prize_collection_item_id uuid
    references public.collection_items(id) on delete set null;

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
  unit_card_name text;
  unit_card_image_url text;
  unit_display_tier text;
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
  replay_items jsonb;
  -- Last One Prize locals.
  lp_stock_unit_id uuid;
  lp_unit_image text;
  lp_card_name text;
  lp_card_image text;
  lp_open_item_id uuid;
  lp_collection_item_id uuid;
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
      select coalesce(jsonb_agg(item order by (item->>'position')::int), '[]'::jsonb)
      into replay_items
      from (
        select jsonb_build_object(
          'cardId', items.card_id,
          'name', cards.name,
          'imageUrl', cards.image_url,
          'tier', items.tier,
          'displayTier', case
            when items.draw_round_prize_id is null then 'last_prize'
            else coalesce(
              prizes.metadata->>'displayTier',
              case
                when items.tier = 'high' and coalesce(prizes.rank, 99) <= 3 then 'rainbow'
                when items.tier = 'high' then 'gold'
                else 'bronze'
              end
            )
          end,
          'isLastPrize', (items.draw_round_prize_id is null),
          'valueThb', items.value_thb,
          'position', items.result_position,
          'prizeUnitId', items.draw_round_prize_unit_id
        ) as item
        from public.gacha_open_items items
        join public.cards cards on cards.id = items.card_id
        left join public.draw_round_prizes prizes on prizes.id = items.draw_round_prize_id
        where items.gacha_open_id = existing_open.id
      ) hydrated;

      return jsonb_build_object(
        'status', existing_open.status,
        'openId', existing_open.id,
        'publicCode', existing_open.public_code,
        'replayed', true,
        'items', coalesce(replay_items, '[]'::jsonb)
      );
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
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb),
      'entropy', 'csprng'
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

    -- Weighted prize selection. The single change vs the previous migration is
    -- `random()` -> `app_private.secure_random()` inside the ORDER BY key.
    -- Distribution is identical (uniform on [0, 1)) — only the entropy source
    -- changes.
    select
      units.id,
      units.draw_round_prize_id,
      units.card_id,
      cards.name,
      cards.image_url,
      coalesce(
        prizes.metadata->>'displayTier',
        case
          when prizes.tier = 'high' and coalesce(prizes.rank, 99) <= 3 then 'rainbow'
          when prizes.tier = 'high' then 'gold'
          else 'bronze'
        end
      ),
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
      unit_card_name,
      unit_card_image_url,
      unit_display_tier,
      unit_tier,
      unit_value_thb,
      unit_weight,
      unit_unlock_at_sold_pct,
      effective_unit_weight,
      effective_unit_unlock_at_sold_pct
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    join public.cards cards on cards.id = units.card_id
    where units.draw_round_id = p_draw_round_id
      and units.status = 'available'
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
      and (logic_mode = 'pure_random' or coalesce(prizes.weight, 1) > 0)
      and (
        logic_mode <> 'inventory_gated'
        or coalesce(prizes.unlock_at_sold_pct, 0) <= sold_pct
      )
    order by
      -ln(greatest(app_private.secure_random(), 0.000000000001)) /
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
      'name', unit_card_name,
      'imageUrl', unit_card_image_url,
      'tier', unit_tier,
      'displayTier', unit_display_tier,
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

  -- ── Last One Prize (bonus) ─────────────────────────────────────────────────
  -- If this open consumed the FINAL available slot, the buyer also receives the
  -- optional bonus card on top of their normal pull(s). Guarded by both the
  -- per-round FOR UPDATE lock (only one open ever sees 0 remaining) and the
  -- last_prize_awarded_at column. The bonus does NOT touch the slot pool,
  -- draw_round_prizes, or draw_round_prize_units, so odds/invariants are intact.
  -- is_test rounds are opened by testers/admins to validate mechanics; they must
  -- NEVER consume a real physical slab. Award the bonus only on real (non-test)
  -- live rounds.
  if campaign.last_prize_card_id is not null
     and campaign.last_prize_awarded_at is null
     and coalesce(campaign.is_test, false) = false then
    select count(*)::integer into available_slot_count
    from public.draw_slots
    where draw_round_id = p_draw_round_id
      and status = 'available';

    if available_slot_count = 0 then
      -- Pick one available physical slab matching the admin's sub-SKU choice
      -- using the SAME canonical matcher the pool/materialization paths use
      -- (condition-only for raw, condition+grade+service+cert+gemrate for graded;
      -- matches any unit when no filter is set). Prefer a unit that has an image.
      -- Plain FOR UPDATE (no SKIP LOCKED): a momentarily-locked slab briefly
      -- blocks rather than being permanently forfeited for the round.
      select u.id, u.image_url
      into lp_stock_unit_id, lp_unit_image
      from public.card_stock_units u
      where u.card_id = campaign.last_prize_card_id
        and u.status = 'available'
        and public.card_stock_unit_matches_prize_filter(u, campaign.last_prize_metadata)
      order by (u.image_url is not null) desc, u.created_at asc
      limit 1
      for update of u;

      if lp_stock_unit_id is not null then
        select name, image_url into lp_card_name, lp_card_image
        from public.cards where id = campaign.last_prize_card_id;

        insert into public.gacha_open_items(
          gacha_open_id, card_id, draw_round_prize_id, draw_round_prize_unit_id,
          tier, value_thb, result_position)
        values (
          open_row.id, campaign.last_prize_card_id, null, null,
          'last_prize', null, p_quantity + 1)
        returning id into lp_open_item_id;

        insert into public.collection_items(
          profile_id, card_id, source_type, source_id, status, serial_no)
        values (
          p_profile_id, campaign.last_prize_card_id, 'gacha_open', open_row.id,
          'owned', open_row.public_code || '-LP')
        returning id into lp_collection_item_id;

        -- Consume the slab. There is no 'awarded' status on card_stock_units;
        -- 'allocated' (+ allocated_draw_round_id) removes it from available
        -- inventory exactly like a pool allocation, and the award trace lives in
        -- metadata so fulfilment can find the exact slab for this collection item.
        update public.card_stock_units
        set status = 'allocated',
            allocated_draw_round_id = p_draw_round_id,
            updated_at = now(),
            metadata = metadata || jsonb_build_object(
              'lastPrizeAward', jsonb_build_object(
                'drawRoundId', p_draw_round_id,
                'profileId', p_profile_id,
                'gachaOpenId', open_row.id,
                'gachaOpenItemId', lp_open_item_id,
                'collectionItemId', lp_collection_item_id,
                'awardedAt', now()
              ))
        where id = lp_stock_unit_id;

        update public.draw_rounds
        set last_prize_awarded_at = now(),
            last_prize_awarded_open_id = open_row.id,
            last_prize_stock_unit_id = lp_stock_unit_id,
            last_prize_collection_item_id = lp_collection_item_id
        where id = p_draw_round_id;

        -- Ledger the slab consumption so inventory history is complete, matching
        -- the pool allocation paths (actor_admin_id null = customer-driven award).
        insert into public.card_stock_ledger(
          stock_unit_id, card_id, draw_round_id, draw_round_prize_id,
          event_type, actor_admin_id, metadata)
        values (
          lp_stock_unit_id, campaign.last_prize_card_id, p_draw_round_id, null,
          'allocated', null,
          jsonb_build_object(
            'reason', 'last_prize_award',
            'gachaOpenId', open_row.id,
            'collectionItemId', lp_collection_item_id));

        result_items := result_items || jsonb_build_array(jsonb_build_object(
          'cardId', campaign.last_prize_card_id,
          'name', lp_card_name,
          'imageUrl', coalesce(lp_unit_image, lp_card_image),
          'tier', 'last_prize',
          'displayTier', 'last_prize',
          'isLastPrize', true,
          'valueThb', null,
          'position', p_quantity + 1,
          'stockUnitId', lp_stock_unit_id
        ));
      end if;
    end if;
  end if;

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
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb),
      'entropy', 'csprng',
      'lastPrizeAwarded', lp_collection_item_id is not null
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
