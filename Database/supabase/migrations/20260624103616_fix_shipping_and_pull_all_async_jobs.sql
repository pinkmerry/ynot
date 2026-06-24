-- Repair async shipping and Pull All job processors observed stuck in production:
-- SH-1006 failed because collection_items.shipping_request_id was referenced by shipping RPCs but absent.
-- BO-1001 failed because process_bulk_open_chunk had an ambiguous result_payload reference.

alter table public.collection_items
  add column if not exists shipping_request_id uuid references public.shipping_requests(id) on delete set null;

create index if not exists collection_items_shipping_request_id_idx
  on public.collection_items(shipping_request_id, acquired_at, id)
  where shipping_request_id is not null;

create or replace function public.process_bulk_open_chunk(
  p_bulk_open_session_id uuid,
  p_limit integer default 1000,
  p_worker_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  session_row public.gacha_bulk_open_sessions%rowtype;
  campaign public.draw_rounds%rowtype;
  open_row public.gacha_opens%rowtype;
  chunk_limit integer;
  chunk_target integer;
  inserted_count integer := 0;
  slot_update_count integer := 0;
  open_item_count integer := 0;
  collection_item_count integer := 0;
  position_index integer;
  bulk_sequence integer;
  slot_id uuid;
  open_item_id uuid;
  first_collection_item_id uuid;
  new_collection_item_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_stock_unit_id uuid;
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
  claimed_unit_ids uuid[];
  bundle_index integer;
  sold_pct numeric := 0;
  logic_mode text := 'pure_random';
  result_payload_value jsonb;
  highlight_items jsonb := '[]'::jsonb;
  completed_now boolean := false;
  available_slot_count integer;
  lp_stock_unit_id uuid;
  lp_unit_image_url text;
  lp_card_name text;
  lp_card_image_url text;
  lp_open_item_id uuid;
  lp_collection_item_id uuid;
  lp_bonus_sequence integer;
  normal_bonus_available boolean := false;
begin
  if p_bulk_open_session_id is null then
    raise exception 'bulk_open_session_required';
  end if;

  chunk_limit := least(greatest(coalesce(p_limit, 1000), 1), 1000);

  select * into session_row
  from public.gacha_bulk_open_sessions
  where id = p_bulk_open_session_id
  for update;

  if session_row.id is null then
    raise exception 'bulk_open_session_not_found';
  end if;
  if session_row.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', true,
      'shouldContinue', false
    );
  end if;
  if session_row.processed_slots >= session_row.target_slots then
    update public.gacha_bulk_open_sessions
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        locked_by = null,
        heartbeat_at = now(),
        updated_at = now()
    where id = session_row.id
    returning * into session_row;

    return jsonb_build_object(
      'status', session_row.status,
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', true,
      'shouldContinue', false
    );
  end if;

  select * into campaign
  from public.draw_rounds
  where id = session_row.draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'bulk_open_campaign_not_found';
  end if;

  logic_mode := coalesce(campaign.logic_snapshot->>'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
  end if;

  chunk_target := least(
    chunk_limit,
    greatest(session_row.target_slots - session_row.processed_slots, 0)
  );
  if chunk_target < 1 then
    raise exception 'bulk_open_chunk_empty';
  end if;

  update public.gacha_bulk_open_sessions
  set status = 'processing',
      locked_by = p_worker_id,
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  insert into public.gacha_opens(
    profile_id,
    draw_round_id,
    cost_coins,
    quantity,
    status,
    ledger_entry_id,
    idempotency_key,
    bulk_open_session_id,
    metadata
  )
  values (
    session_row.profile_id,
    session_row.draw_round_id,
    session_row.cost_per_open_snapshot * chunk_target,
    chunk_target,
    'completed',
    session_row.ledger_entry_id,
    'bulk-open-' || session_row.id::text || '-' || session_row.next_bulk_open_sequence::text,
    session_row.id,
    jsonb_build_object(
      'source', 'bulk_open_chunk',
      'bulkOpenSessionId', session_row.id,
      'bulkOpenPublicCode', session_row.public_code,
      'bulkOpenStartSequence', session_row.next_bulk_open_sequence,
      'bulkOpenChunkTarget', chunk_target
    )
  )
  returning * into open_row;

  for position_index in 1..chunk_target loop
    bulk_sequence := session_row.next_bulk_open_sequence + position_index - 1;
    first_collection_item_id := null;
    open_item_id := null;

    select id into slot_id
    from public.draw_slots
    where draw_round_id = session_row.draw_round_id
      and status = 'available'
    order by slot_number asc
    limit 1
    for update skip locked;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    update public.draw_slots
    set status = 'opened',
        opened_at = now()
    where id = slot_id
      and status = 'available';

    get diagnostics slot_update_count = row_count;
    if slot_update_count <> 1 then
      raise exception 'bulk_open_slot_claim_failed';
    end if;

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
    where draw_round_id = session_row.draw_round_id;

    if campaign.last_prize_card_id is not null
       and campaign.last_prize_awarded_at is null
       and sold_pct >= 100 then
      select u.id, u.image_url, cards.name, cards.image_url
      into lp_stock_unit_id, lp_unit_image_url, lp_card_name, lp_card_image_url
      from public.card_stock_units u
      join public.cards cards on cards.id = u.card_id
      where u.card_id = campaign.last_prize_card_id
        and u.status = 'available'
        and public.card_stock_unit_matches_prize_filter(u, campaign.last_prize_metadata)
      order by
        coalesce(u.id = campaign.last_prize_stock_unit_id, false) desc,
        (nullif(u.image_url, '') is not null) desc,
        u.created_at asc,
        u.id asc
      limit 1
      for update of u;

      if lp_stock_unit_id is null then
        raise exception 'not_enough_prize_inventory';
      end if;

      select exists(
        select 1
        from public.draw_round_prize_units units
        join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
        where units.draw_round_id = session_row.draw_round_id
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
        limit 1
      )
      into normal_bonus_available;

      lp_bonus_sequence := case when normal_bonus_available then bulk_sequence + 1 else bulk_sequence end;

      insert into public.gacha_open_items(
        gacha_open_id,
        card_id,
        draw_round_prize_id,
        draw_round_prize_unit_id,
        tier,
        value_thb,
        result_position,
        bundle_quantity,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        open_row.id,
        campaign.last_prize_card_id,
        null,
        null,
        'last_prize',
        null,
        case when normal_bonus_available then position_index + 1 else position_index end,
        1,
        session_row.id,
        lp_bonus_sequence
      )
      returning id into lp_open_item_id;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        campaign.last_prize_card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-LP',
        lp_stock_unit_id,
        lp_open_item_id,
        session_row.id,
        lp_bonus_sequence
      )
      returning id into lp_collection_item_id;

      update public.card_stock_units
      set status = 'allocated',
          allocated_draw_round_id = session_row.draw_round_id,
          allocated_draw_round_prize_id = null,
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'lastPrizeAward', jsonb_build_object(
              'drawRoundId', session_row.draw_round_id,
              'profileId', session_row.profile_id,
              'gachaOpenId', open_row.id,
              'gachaOpenItemId', lp_open_item_id,
              'collectionItemId', lp_collection_item_id,
              'bulkOpenSessionId', session_row.id,
              'bulkOpenSequence', lp_bonus_sequence,
              'awardedAt', now()
            )
          )
      where id = lp_stock_unit_id;

      update public.draw_rounds
      set last_prize_awarded_at = now(),
          last_prize_awarded_open_id = open_row.id,
          last_prize_stock_unit_id = lp_stock_unit_id,
          last_prize_collection_item_id = lp_collection_item_id,
          status = 'closed',
          updated_at = now()
      where id = session_row.draw_round_id
      returning * into campaign;

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
        session_row.draw_round_id,
        null,
        'allocated',
        null,
        jsonb_build_object(
          'reason', 'bulk_open_last_prize_final_slot',
          'gachaOpenId', open_row.id,
          'collectionItemId', lp_collection_item_id,
          'bulkOpenSessionId', session_row.id,
          'bulkOpenSequence', lp_bonus_sequence
        )
      );

      result_payload_value := jsonb_build_object(
        'name', lp_card_name,
        'imageUrl', coalesce(nullif(lp_unit_image_url, ''), lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', lp_bonus_sequence,
        'bundleQuantity', 1
      );

      insert into public.gacha_bulk_open_results(
        bulk_open_session_id,
        draw_slot_id,
        bulk_open_sequence,
        status,
        gacha_open_id,
        gacha_open_item_id,
        collection_item_id,
        result_payload
      )
      values (
        session_row.id,
        case when normal_bonus_available then null::uuid else slot_id end,
        lp_bonus_sequence,
        'awarded',
        open_row.id,
        lp_open_item_id,
        lp_collection_item_id,
        result_payload_value
      )
      on conflict (bulk_open_session_id, draw_slot_id) do update
      set bulk_open_sequence = excluded.bulk_open_sequence,
          status = 'awarded',
          gacha_open_id = excluded.gacha_open_id,
          gacha_open_item_id = excluded.gacha_open_item_id,
          collection_item_id = excluded.collection_item_id,
          result_payload = excluded.result_payload,
          error_code = null,
          updated_at = now();

      open_item_count := open_item_count + 1;
      collection_item_count := collection_item_count + 1;

      if not normal_bonus_available then
        inserted_count := inserted_count + 1;
        continue;
      end if;
    end if;

    select
      units.id,
      units.draw_round_prize_id,
      units.card_id,
      units.card_stock_unit_id,
      cards.name,
      coalesce(nullif(stock.image_url, ''), cards.image_url),
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
      unit_stock_unit_id,
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
    left join public.card_stock_units stock on stock.id = units.card_stock_unit_id
    where units.draw_round_id = session_row.draw_round_id
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

    insert into public.gacha_open_items(
      gacha_open_id,
      card_id,
      draw_round_prize_id,
      draw_round_prize_unit_id,
      tier,
      value_thb,
      result_position,
      bundle_quantity,
      bulk_open_session_id,
      bulk_open_sequence
    )
    values (
      open_row.id,
      unit_card_id,
      unit_prize_id,
      unit_id,
      unit_tier,
      unit_value_thb,
      position_index,
      selected_bundle_quantity,
      session_row.id,
      bulk_sequence
    )
    returning id into open_item_id;

    bundle_index := 0;
    first_collection_item_id := null;
    for claimed_unit in
      select units.id, units.card_id, units.card_stock_unit_id
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
        convert_coin_value_snapshot,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        claimed_unit.card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-' || lpad(position_index::text, 3, '0') || '-' || lpad(bundle_index::text, 2, '0'),
        unit_convert_coin_value,
        claimed_unit.card_stock_unit_id,
        open_item_id,
        session_row.id,
        bulk_sequence
      )
      returning id into new_collection_item_id;

      if first_collection_item_id is null then
        first_collection_item_id := new_collection_item_id;
      end if;

      update public.draw_round_prize_units
      set status = 'awarded',
          profile_id = session_row.profile_id,
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
            'bundleOpenItemId', open_item_id,
            'bulkOpenSessionId', session_row.id,
            'bulkOpenSequence', bulk_sequence
          )
      where id = claimed_unit.id;
    end loop;

    result_payload_value := jsonb_build_object(
      'name', unit_card_name,
      'imageUrl', unit_card_image_url,
      'tier', unit_tier,
      'displayTier', unit_display_tier,
      'valueThb', unit_value_thb,
      'position', bulk_sequence,
      'bundleQuantity', selected_bundle_quantity
    );

    insert into public.gacha_bulk_open_results(
      bulk_open_session_id,
      draw_slot_id,
      bulk_open_sequence,
      status,
      gacha_open_id,
      gacha_open_item_id,
      collection_item_id,
      result_payload
    )
    values (
      session_row.id,
      slot_id,
      bulk_sequence,
      'awarded',
      open_row.id,
      open_item_id,
      first_collection_item_id,
      result_payload_value
    )
    on conflict (bulk_open_session_id, draw_slot_id) do update
    set bulk_open_sequence = excluded.bulk_open_sequence,
        status = 'awarded',
        gacha_open_id = excluded.gacha_open_id,
        gacha_open_item_id = excluded.gacha_open_item_id,
        collection_item_id = excluded.collection_item_id,
        result_payload = excluded.result_payload,
        error_code = null,
        updated_at = now();

    inserted_count := inserted_count + 1;
    open_item_count := open_item_count + 1;
    collection_item_count := collection_item_count + 1;
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, bulk_open_session_id, metadata)
  values (
    session_row.profile_id,
    'gacha_opened',
    session_row.draw_round_id,
    open_row.id,
    session_row.id,
    jsonb_build_object(
      'quantity', chunk_target,
      'cost_coins', open_row.cost_coins,
      'isTest', coalesce(campaign.is_test, false),
      'logicMode', logic_mode,
      'source', 'bulk_open_chunk'
    )
  );

  select coalesce(
    jsonb_agg(public_payload order by priority asc, value_for_sort desc nulls last, ranked_bulk_open_sequence asc),
    '[]'::jsonb
  )
  into highlight_items
  from (
    select
      results.result_payload as public_payload,
      results.bulk_open_sequence as ranked_bulk_open_sequence,
      case
        when coalesce((results.result_payload->>'isLastPrize')::boolean, false) then 0
        when results.result_payload->>'displayTier' = 'last_prize' then 0
        when results.result_payload->>'displayTier' = 'rainbow' then 1
        when results.result_payload->>'displayTier' = 'gold' then 2
        when results.result_payload->>'displayTier' = 'silver' then 3
        else 4
      end as priority,
      nullif(results.result_payload->>'valueThb', '')::numeric as value_for_sort
    from public.gacha_bulk_open_results results
    where results.bulk_open_session_id = session_row.id
      and results.status = 'awarded'
    order by priority asc, value_for_sort desc nulls last, results.bulk_open_sequence asc
    limit 100
  ) ranked;

  select count(*)::integer into available_slot_count
  from public.draw_slots
  where draw_round_id = session_row.draw_round_id
    and status = 'available';

  completed_now := session_row.processed_slots + inserted_count >= session_row.target_slots
    or available_slot_count = 0;

  update public.gacha_bulk_open_sessions
  set processed_slots = least(target_slots, processed_slots + inserted_count),
      next_bulk_open_sequence = next_bulk_open_sequence + inserted_count,
      open_items_awarded = least(target_slots, open_items_awarded + open_item_count),
      collection_items_created = least(target_slots, collection_items_created + collection_item_count),
      highlight_rewards_public = highlight_items,
      status = case when completed_now then 'completed' else 'processing' end,
      completed_at = case when completed_now then coalesce(completed_at, now()) else completed_at end,
      retry_scheduled_at = null,
      last_error_code = null,
      last_error_at = null,
      locked_by = case when completed_now then null else p_worker_id end,
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  if completed_now then
    update public.draw_rounds
    set status = 'closed',
        updated_at = now()
    where id = session_row.draw_round_id
      and status <> 'closed';

    insert into public.audit_events(actor_profile_id, event_type, draw_round_id, bulk_open_session_id, metadata)
    values (
      session_row.profile_id,
      'bulk_open_completed',
      session_row.draw_round_id,
      session_row.id,
      jsonb_build_object(
        'targetSlots', session_row.target_slots,
        'processedSlots', session_row.processed_slots,
        'publicCode', session_row.public_code
      )
    );
  end if;

  return jsonb_build_object(
    'status', session_row.status,
    'sessionId', session_row.id,
    'processedSlots', session_row.processed_slots,
    'targetSlots', session_row.target_slots,
    'inserted', inserted_count,
    'openItemsAwarded', session_row.open_items_awarded,
    'collectionItemsCreated', session_row.collection_items_created,
    'completed', completed_now,
    'shouldContinue', not completed_now
  );
exception
  when others then
    update public.gacha_bulk_open_sessions
    set status = 'retry_required',
        retry_count = retry_count + 1,
        retry_scheduled_at = now() + interval '1 minute',
        last_error_code = left(sqlstate || ':' || sqlerrm, 200),
        last_error_at = now(),
        heartbeat_at = now(),
        updated_at = now()
    where id = p_bulk_open_session_id
      and status <> 'completed'
    returning * into session_row;

    if session_row.id is null then
      raise;
    end if;

    return jsonb_build_object(
      'status', 'retry_required',
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', false,
      'shouldContinue', true,
      'retryScheduledAt', session_row.retry_scheduled_at,
      'errorCode', session_row.last_error_code
    );
end;
$$;

create or replace function public.finalize_bulk_open_session(
  p_bulk_open_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  session_row public.gacha_bulk_open_sessions%rowtype;
  awarded_result_count integer;
begin
  if p_bulk_open_session_id is null then
    raise exception 'bulk_open_session_required';
  end if;

  select * into session_row
  from public.gacha_bulk_open_sessions
  where id = p_bulk_open_session_id
  for update;

  if session_row.id is null then
    raise exception 'bulk_open_session_not_found';
  end if;

  select count(*)::integer into awarded_result_count
  from public.gacha_bulk_open_results
  where bulk_open_session_id = session_row.id
    and status = 'awarded'
    and gacha_open_item_id is not null
    and collection_item_id is not null;

  if awarded_result_count < session_row.target_slots then
    return jsonb_build_object(
      'status', session_row.status,
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'openItemsAwarded', awarded_result_count,
      'collectionItemsCreated', awarded_result_count,
      'targetSlots', session_row.target_slots,
      'completed', false
    );
  end if;

  update public.gacha_bulk_open_sessions
  set status = 'completed',
      processed_slots = greatest(processed_slots, awarded_result_count),
      open_items_awarded = session_row.target_slots,
      collection_items_created = session_row.target_slots,
      completed_at = coalesce(completed_at, now()),
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, bulk_open_session_id, metadata)
  values (
    session_row.profile_id,
    'bulk_open_completed',
    session_row.draw_round_id,
    session_row.id,
    jsonb_build_object(
      'targetSlots', session_row.target_slots,
      'processedSlots', session_row.processed_slots,
      'publicCode', session_row.public_code
    )
  );

  return jsonb_build_object(
    'status', session_row.status,
    'sessionId', session_row.id,
    'processedSlots', session_row.processed_slots,
    'targetSlots', session_row.target_slots,
    'completed', true
  );
end;
$$;

create or replace function public.list_bulk_open_recovery_sessions(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  safe_limit integer;
  sessions jsonb;
begin
  safe_limit := least(greatest(coalesce(p_limit, 10), 1), 50);

  select coalesce(jsonb_agg(session_payload order by sort_created_at asc), '[]'::jsonb)
  into sessions
  from (
    select
      jsonb_build_object(
        'sessionId', session.id,
        'status', session.status
      ) as session_payload,
      session.created_at as sort_created_at
    from public.gacha_bulk_open_sessions session
    where session.status = 'queued'
      or (
        session.status = 'retry_required'
        and coalesce(session.retry_scheduled_at, session.created_at) <= now()
      )
      or (
        session.status = 'processing'
        and coalesce(session.heartbeat_at, session.updated_at, session.created_at) < now() - interval '5 minutes'
      )
    order by session.created_at asc
    limit safe_limit
  ) recovery;

  return coalesce(sessions, '[]'::jsonb);
end;
$$;

revoke all on function public.has_active_bulk_open_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_bulk_open_start_token(uuid, uuid, integer, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bulk_open_settlement_enabled() from public, anon, authenticated;
revoke all on function public.prepare_bulk_open_quote(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_bulk_open_highlights_seen(uuid, text) from public, anon, authenticated;
revoke all on function public.start_bulk_open_session(uuid, uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.process_bulk_open_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_bulk_open_session(uuid) from public, anon, authenticated;
revoke all on function public.list_bulk_open_recovery_sessions(integer) from public, anon, authenticated;

grant execute on function public.has_active_bulk_open_session(uuid, uuid) to service_role;
grant execute on function public.create_bulk_open_start_token(uuid, uuid, integer, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.bulk_open_settlement_enabled() to service_role;
grant execute on function public.prepare_bulk_open_quote(uuid, uuid, timestamptz) to service_role;
grant execute on function public.mark_bulk_open_highlights_seen(uuid, text) to service_role;
grant execute on function public.start_bulk_open_session(uuid, uuid, uuid, integer, integer, text, text) to service_role;
grant execute on function public.process_bulk_open_chunk(uuid, integer, text) to service_role;
