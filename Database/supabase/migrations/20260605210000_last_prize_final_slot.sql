-- Last One Prize is the final reward slot, not a bonus item.
-- Normal prize rows cover total_slots - 1 when a Last Prize card is configured.

create or replace function app_private.last_prize_normal_prize_target(
  p_total_slots integer,
  p_last_prize_card_id uuid
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(p_total_slots, 0) - case when p_last_prize_card_id is null then 0 else 1 end, 0)::integer;
$$;

create or replace function app_private.last_prize_available_stock_count(
  p_draw_round_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  available_count integer := 0;
begin
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id;

  if campaign.id is null or campaign.last_prize_card_id is null or campaign.last_prize_awarded_at is not null then
    return 1;
  end if;

  select count(*)::integer
  into available_count
  from public.card_stock_units u
  where u.card_id = campaign.last_prize_card_id
    and u.status = 'available'
    and public.card_stock_unit_matches_prize_filter(u, campaign.last_prize_metadata);

  return coalesce(available_count, 0);
end;
$$;

grant execute on function app_private.last_prize_normal_prize_target(integer, uuid) to service_role;
grant execute on function app_private.last_prize_available_stock_count(uuid) to service_role;

do $$
declare
  fn text;
begin
  select pg_get_functiondef('public.submit_campaign_review(uuid, uuid, jsonb, text)'::regprocedure) into fn;
  if position('planned_total <> campaign.total_slots' in fn) = 0
     or position('if initial_eligible_units <= 0 then' in fn) = 0 then
    raise exception 'last_prize_patch_anchor_missing_submit_campaign_review';
  end if;
  fn := replace(
    fn,
    'planned_total <> campaign.total_slots',
    'planned_total <> app_private.last_prize_normal_prize_target(campaign.total_slots, campaign.last_prize_card_id)'
  );
  fn := replace(
    fn,
    'if initial_eligible_units <= 0 then',
    'if campaign.last_prize_card_id is not null and campaign.last_prize_awarded_at is null and app_private.last_prize_available_stock_count(p_draw_round_id) <= 0 then
    raise exception ''last_prize_stock_required'';
  end if;

  if initial_eligible_units <= 0 then'
  );
  execute fn;

  select pg_get_functiondef('public.approve_campaign_inventory(uuid, uuid, jsonb, text)'::regprocedure) into fn;
  if position('planned_total <> campaign.total_slots or reserved_total <> required_stock_total' in fn) = 0
     or position('with reserved as (' in fn) = 0 then
    raise exception 'last_prize_patch_anchor_missing_approve_campaign_inventory';
  end if;
  fn := replace(
    fn,
    'planned_total <> campaign.total_slots or reserved_total <> required_stock_total',
    'planned_total <> app_private.last_prize_normal_prize_target(campaign.total_slots, campaign.last_prize_card_id) or reserved_total <> required_stock_total'
  );
  fn := replace(
    fn,
    'with reserved as (',
    'if campaign.last_prize_card_id is not null and campaign.last_prize_awarded_at is null and app_private.last_prize_available_stock_count(p_draw_round_id) <= 0 then
    raise exception ''last_prize_stock_required'';
  end if;

  with reserved as ('
  );
  execute fn;

  select pg_get_functiondef('public.publish_campaign(uuid, uuid, text)'::regprocedure) into fn;
  if position('if campaign.total_slots <= 0 or materialized_total <> required_stock_total or available_total <= 0 then' in fn) = 0 then
    raise exception 'last_prize_patch_anchor_missing_publish_campaign';
  end if;
  fn := replace(
    fn,
    'if campaign.total_slots <= 0 or materialized_total <> required_stock_total or available_total <= 0 then',
    'if campaign.last_prize_card_id is not null and campaign.last_prize_awarded_at is null and app_private.last_prize_available_stock_count(p_draw_round_id) <= 0 then
    raise exception ''last_prize_stock_required'';
  end if;

  if campaign.total_slots <= 0 or materialized_total <> required_stock_total or available_total <= 0 then'
  );
  execute fn;

  select pg_get_functiondef('public.edit_live_campaign_inventory(uuid, uuid, jsonb)'::regprocedure) into fn;
  if position('v_planned_total integer := 0;' in fn) = 0
     or position('if v_planned_total <= 0 then
    raise exception ''launch_prize_pool_required'';
  end if;' in fn) = 0
     or position('if v_planned_total < v_consumed_slots then
    raise exception ''cannot_reduce_slots_below_consumed'';
  end if;

  update public.draw_rounds
  set total_slots = v_planned_total' in fn) = 0
     or position('and slot_number > v_planned_total;' in fn) = 0
     or position('if v_slot_rows <> v_planned_total then' in fn) = 0
     or position('''totalSlots'', v_planned_total,' in fn) = 0 then
    raise exception 'last_prize_patch_anchor_missing_edit_live_campaign_inventory';
  end if;
  fn := replace(fn, 'v_planned_total integer := 0;', 'v_planned_total integer := 0;
  v_public_total_slots integer := 0;');
  fn := replace(
    fn,
    'if v_planned_total <= 0 then
    raise exception ''launch_prize_pool_required'';
  end if;',
    'if v_planned_total <= 0 then
    raise exception ''launch_prize_pool_required'';
  end if;

  if campaign.last_prize_card_id is not null and campaign.last_prize_awarded_at is null and app_private.last_prize_available_stock_count(p_draw_round_id) <= 0 then
    raise exception ''last_prize_stock_required'';
  end if;'
  );
  fn := replace(
    fn,
    'if v_planned_total < v_consumed_slots then
    raise exception ''cannot_reduce_slots_below_consumed'';
  end if;

  update public.draw_rounds
  set total_slots = v_planned_total',
    'v_public_total_slots := v_planned_total + case when campaign.last_prize_card_id is null then 0 else 1 end;

  if v_public_total_slots < v_consumed_slots then
    raise exception ''cannot_reduce_slots_below_consumed'';
  end if;

  update public.draw_rounds
  set total_slots = v_public_total_slots'
  );
  fn := replace(fn, 'and slot_number > v_planned_total;', 'and slot_number > v_public_total_slots;');
  fn := replace(fn, 'if v_slot_rows <> v_planned_total then', 'if v_slot_rows <> v_public_total_slots then');
  fn := replace(fn, '''totalSlots'', v_planned_total,', '''totalSlots'', v_public_total_slots,');
  execute fn;
end;
$$;

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
  unit_convert_coin_value integer;
  unit_weight numeric;
  unit_unlock_at_sold_pct numeric;
  effective_unit_weight numeric;
  effective_unit_unlock_at_sold_pct numeric;
  selected_bundle_quantity integer;
  claimed_unit record;
  claimed_unit_ids uuid[] := array[]::uuid[];
  bundle_index integer;
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
  last_prize_needed boolean := false;
  normal_units_needed integer;
  lp_stock_unit_id uuid;
  lp_unit_image_url text;
  lp_card_name text;
  lp_card_image_url text;
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
      select coalesce(jsonb_agg(item order by item->>'position'), '[]'::jsonb)
      into replay_items
      from (
        select jsonb_build_object(
          'cardId', items.card_id,
          'name', cards.name,
          'imageUrl', cards.image_url,
          'tier', items.tier,
          'displayTier', case
            when items.draw_round_prize_id is null or items.tier = 'last_prize' then 'last_prize'
            else coalesce(
              prizes.metadata->>'displayTier',
              case
                when items.tier = 'high' and coalesce(prizes.rank, 99) <= 3 then 'rainbow'
                when items.tier = 'high' then 'gold'
                else 'bronze'
              end
            )
          end,
          'isLastPrize', (items.draw_round_prize_id is null or items.tier = 'last_prize'),
          'valueThb', items.value_thb,
          'position', items.result_position,
          'bundleQuantity', greatest(coalesce(items.bundle_quantity, 1), 1)
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

  last_prize_needed := campaign.last_prize_card_id is not null
    and campaign.last_prize_awarded_at is null
    and available_slot_count <= p_quantity;
  normal_units_needed := p_quantity - case when last_prize_needed then 1 else 0 end;

  if last_prize_needed then
    select u.id, u.image_url, cards.name, cards.image_url
    into lp_stock_unit_id, lp_unit_image_url, lp_card_name, lp_card_image_url
    from public.card_stock_units u
    join public.cards cards on cards.id = u.card_id
    where u.card_id = campaign.last_prize_card_id
      and u.status = 'available'
      and public.card_stock_unit_matches_prize_filter(u, campaign.last_prize_metadata)
    order by
      (u.id = campaign.last_prize_stock_unit_id) desc,
      (u.image_url is not null) desc,
      u.created_at asc,
      u.id asc
    limit 1
    for update of u;

    if lp_stock_unit_id is null then
      raise exception 'not_enough_prize_inventory';
    end if;
  end if;

  select count(*)::integer into available_unit_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id
    and status = 'available';

  if available_unit_count < normal_units_needed then
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

    if last_prize_needed and lp_collection_item_id is null and sold_pct >= 100 then
      insert into public.gacha_open_items(
        gacha_open_id,
        card_id,
        draw_round_prize_id,
        draw_round_prize_unit_id,
        tier,
        value_thb,
        result_position,
        bundle_quantity
      )
      values (
        open_row.id,
        campaign.last_prize_card_id,
        null,
        null,
        'last_prize',
        null,
        position_index,
        1
      )
      returning id into lp_open_item_id;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no
      )
      values (
        p_profile_id,
        campaign.last_prize_card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-LP'
      )
      returning id into lp_collection_item_id;

      update public.card_stock_units
      set status = 'allocated',
          allocated_draw_round_id = p_draw_round_id,
          allocated_draw_round_prize_id = null,
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'lastPrizeAward', jsonb_build_object(
              'drawRoundId', p_draw_round_id,
              'profileId', p_profile_id,
              'gachaOpenId', open_row.id,
              'gachaOpenItemId', lp_open_item_id,
              'collectionItemId', lp_collection_item_id,
              'awardedAt', now()
            )
          )
      where id = lp_stock_unit_id;

      update public.draw_rounds
      set last_prize_awarded_at = now(),
          last_prize_awarded_open_id = open_row.id,
          last_prize_stock_unit_id = lp_stock_unit_id,
          last_prize_collection_item_id = lp_collection_item_id
      where id = p_draw_round_id;

      insert into public.card_stock_ledger(
        stock_unit_id,
        card_id,
        draw_round_id,
        draw_round_prize_id,
        event_type,
        actor_admin_id,
        metadata
      )
      values (
        lp_stock_unit_id,
        campaign.last_prize_card_id,
        p_draw_round_id,
        null,
        'allocated',
        null,
        jsonb_build_object(
          'reason', 'last_prize_final_slot',
          'gachaOpenId', open_row.id,
          'collectionItemId', lp_collection_item_id
        )
      );

      result_items := result_items || jsonb_build_array(jsonb_build_object(
        'cardId', campaign.last_prize_card_id,
        'name', lp_card_name,
        'imageUrl', coalesce(lp_unit_image_url, lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', position_index,
        'bundleQuantity', 1
      ));

      continue;
    end if;

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
      prizes.convert_coin_value,
      prizes.weight,
      prizes.unlock_at_sold_pct,
      case
        when logic_mode = 'pure_random' then 1::numeric
        else coalesce(prizes.weight, 1)
      end as effective_weight,
      case
        when logic_mode = 'inventory_gated' then coalesce(prizes.unlock_at_sold_pct, 0)
        else 0::numeric
      end as effective_unlock_at_sold_pct,
      greatest(coalesce(prizes.bundle_quantity, 1), 1)
    into
      unit_id,
      unit_prize_id,
      unit_card_id,
      unit_card_name,
      unit_card_image_url,
      unit_display_tier,
      unit_tier,
      unit_value_thb,
      unit_convert_coin_value,
      unit_weight,
      unit_unlock_at_sold_pct,
      effective_unit_weight,
      effective_unit_unlock_at_sold_pct,
      selected_bundle_quantity
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
      and (
        select count(*)
        from public.draw_round_prize_units siblings
        where siblings.draw_round_prize_id = prizes.id
          and siblings.status = 'available'
      ) >= greatest(coalesce(prizes.bundle_quantity, 1), 1)
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

    claimed_unit_ids := array[unit_id];

    for claimed_unit in
      select units.id
      from public.draw_round_prize_units units
      where units.draw_round_prize_id = unit_prize_id
        and units.status = 'available'
        and units.id <> unit_id
      order by units.created_at, units.id
      limit greatest(selected_bundle_quantity - 1, 0)
      for update skip locked
    loop
      claimed_unit_ids := array_append(claimed_unit_ids, claimed_unit.id);
    end loop;

    if coalesce(array_length(claimed_unit_ids, 1), 0) <> selected_bundle_quantity then
      raise exception 'not_enough_prize_inventory';
    end if;

    -- bundle_quantity_snapshot: one visible open item snapshots how many
    -- physical stock units were awarded for this win.
    insert into public.gacha_open_items(
      gacha_open_id,
      card_id,
      draw_round_prize_id,
      draw_round_prize_unit_id,
      tier,
      value_thb,
      result_position,
      bundle_quantity
    )
    values (
      open_row.id,
      unit_card_id,
      unit_prize_id,
      unit_id,
      unit_tier,
      unit_value_thb,
      position_index,
      selected_bundle_quantity
    )
    returning id into open_item_id;

    bundle_index := 0;
    for claimed_unit in
      select units.id, units.card_id
      from public.draw_round_prize_units units
      where units.id = any(claimed_unit_ids)
      order by case when units.id = unit_id then 0 else 1 end, units.created_at, units.id
    loop
      bundle_index := bundle_index + 1;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        convert_coin_value_snapshot
      )
      values (
        p_profile_id,
        claimed_unit.card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-' || lpad(position_index::text, 2, '0') || '-' || lpad(bundle_index::text, 2, '0'),
        unit_convert_coin_value
      )
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
            'effectiveUnlockAtSoldPct', effective_unit_unlock_at_sold_pct,
            'bundleQuantity', selected_bundle_quantity,
            'bundleIndex', bundle_index,
            'bundleOpenItemId', open_item_id
          )
      where id = claimed_unit.id;
    end loop;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', unit_card_id,
      'name', unit_card_name,
      'imageUrl', unit_card_image_url,
      'tier', unit_tier,
      'displayTier', unit_display_tier,
      'valueThb', unit_value_thb,
      'position', position_index,
      'bundleQuantity', selected_bundle_quantity
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
      'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb),
      'entropy', 'csprng'
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
