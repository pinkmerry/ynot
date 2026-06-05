-- Add per-win bundled reward counts without exposing owner stock metadata.

alter table if exists public.draw_round_prizes
  add column if not exists bundle_quantity integer not null default 1;

alter table if exists public.gacha_open_items
  add column if not exists bundle_quantity integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_bundle_quantity_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_bundle_quantity_check
      check (bundle_quantity between 1 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gacha_open_items_bundle_quantity_check'
      and conrelid = 'public.gacha_open_items'::regclass
  ) then
    alter table public.gacha_open_items
      add constraint gacha_open_items_bundle_quantity_check
      check (bundle_quantity between 1 and 100);
  end if;
end $$;

revoke select on public.draw_round_prizes from anon, authenticated;

grant select (
  id,
  draw_round_id,
  card_id,
  tier,
  rank,
  value_thb,
  convert_coin_value,
  planned_quantity,
  bundle_quantity,
  is_test,
  seed_run_id,
  created_at,
  updated_at
) on public.draw_round_prizes to anon, authenticated;

create or replace function public.submit_campaign_review(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_logic_snapshot jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  prize_row public.draw_round_prizes%rowtype;
  selected_ids uuid[];
  selected_count integer;
  planned_total integer;
  visible_prize_count integer;
  initial_eligible_units integer;
  next_logic_snapshot jsonb;
  logic_mode text;
  reserved_total integer := 0;
  required_units integer;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.status <> 'draft' then
    raise exception 'campaign_must_be_draft';
  end if;
  if campaign.approval_status = 'approved' then
    raise exception 'approved_campaign_inventory_locked';
  end if;

  next_logic_snapshot := coalesce(p_logic_snapshot, campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb);
  logic_mode := coalesce(next_logic_snapshot ->> 'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
    next_logic_snapshot := jsonb_set(next_logic_snapshot, '{mode}', to_jsonb(logic_mode), true);
  end if;

  select
    count(*)::integer,
    coalesce(sum(planned_quantity), 0)::integer,
    coalesce(sum(
      case
        when planned_quantity <= 0 then 0
        when logic_mode = 'pure_random' then planned_quantity
        when coalesce(weight, 1) <= 0 then 0
        when logic_mode = 'inventory_gated' and coalesce(unlock_at_sold_pct, 0) > 0 then 0
        else planned_quantity
      end
    ), 0)::integer
  into visible_prize_count, planned_total, initial_eligible_units
  from public.draw_round_prizes
  where draw_round_id = p_draw_round_id
    and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb);

  if visible_prize_count <= 0 then
    raise exception 'prize_inventory_required';
  end if;
  if planned_total <> campaign.total_slots then
    raise exception 'planned_prize_quantity_must_equal_total_slots';
  end if;
  if initial_eligible_units <= 0 then
    raise exception 'launch_prize_pool_required';
  end if;

  perform public.release_campaign_reservations(
    p_draw_round_id,
    p_admin_id,
    'resubmitted',
    'Released old reservations before owner review resubmission.'
  );

  for prize_row in
    select *
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id
      and planned_quantity > 0
      and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    order by tier, rank
    for update
  loop
    required_units := greatest(coalesce(prize_row.planned_quantity, 0), 0)
      * greatest(coalesce(prize_row.bundle_quantity, 1), 1);

    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select stock.id
      from public.card_stock_units stock
      where stock.card_id = prize_row.card_id
        and stock.status = 'available'
        and public.card_stock_unit_matches_prize_filter(stock, prize_row.metadata)
      order by stock.created_at, stock.id
      limit required_units
      for update skip locked
    ) selected;

    selected_count := coalesce(array_length(selected_ids, 1), 0);
    if selected_count < required_units then
      insert into public.card_stock_ledger(card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
      values (
        prize_row.card_id,
        p_draw_round_id,
        prize_row.id,
        'approval_failed',
        p_admin_id,
        jsonb_strip_nulls(jsonb_build_object(
          'reason', 'insufficient_matching_card_stock',
          'requiredUnits', required_units,
          'plannedQuantity', prize_row.planned_quantity,
          'bundleQuantity', greatest(coalesce(prize_row.bundle_quantity, 1), 1),
          'availableUnits', selected_count,
          'stockSku', prize_row.metadata ->> 'stockSku',
          'stockLabel', prize_row.metadata ->> 'stockLabel',
          'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey',
          'stockUnitFilter', prize_row.metadata -> 'stockUnitFilter'
        ))
      );
      raise exception 'insufficient_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'reserved',
        reserved_by_admin_id = p_admin_id,
        metadata = units.metadata || jsonb_strip_nulls(jsonb_build_object(
          'reservedByAdminId', p_admin_id,
          'reservedForStockSku', prize_row.metadata ->> 'stockSku'
        )),
        updated_at = now()
    where units.id = any(selected_ids);

    insert into public.card_stock_reservations(
      stock_unit_id,
      draw_round_id,
      draw_round_prize_id,
      status,
      reserved_by_admin_id,
      metadata
    )
    select
      unnest(selected_ids),
      p_draw_round_id,
      prize_row.id,
      'reserved',
      p_admin_id,
      jsonb_strip_nulls(jsonb_build_object(
        'logicMode', logic_mode,
        'plannedQuantity', prize_row.planned_quantity,
        'bundleQuantity', greatest(coalesce(prize_row.bundle_quantity, 1), 1),
        'requiredUnits', required_units,
        'stockSku', prize_row.metadata ->> 'stockSku',
        'stockLabel', prize_row.metadata ->> 'stockLabel',
        'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey',
        'stockUnitFilter', prize_row.metadata -> 'stockUnitFilter'
      ));

    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select
      unnest(selected_ids),
      prize_row.card_id,
      p_draw_round_id,
      prize_row.id,
      'reserved',
      p_admin_id,
      jsonb_strip_nulls(jsonb_build_object(
        'logicMode', logic_mode,
        'stockSku', prize_row.metadata ->> 'stockSku',
        'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey'
      ));

    reserved_total := reserved_total + selected_count;
  end loop;

  update public.draw_rounds
  set logic_snapshot = next_logic_snapshot,
      approval_status = 'pending_review',
      approval_requested_by = p_admin_id,
      approval_requested_at = now(),
      approved_by = null,
      approved_at = null,
      rejected_by = null,
      rejected_at = null,
      approval_notes = p_note,
      status = 'draft',
      visibility = 'private'
  where id = p_draw_round_id;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'approvalStatus', 'pending_review',
    'status', 'draft',
    'visibility', 'private',
    'logicMode', logic_mode,
    'plannedUnits', planned_total,
    'reservedUnits', reserved_total
  );
end;
$$;

create or replace function public.approve_campaign_inventory(
  p_draw_round_id uuid,
  p_owner_admin_id uuid,
  p_logic_snapshot jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  planned_total integer;
  required_stock_total integer;
  reserved_total integer;
  materialized_total integer;
  next_logic_snapshot jsonb;
  logic_mode text;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.status <> 'draft' then
    raise exception 'campaign_must_be_draft';
  end if;
  if campaign.approval_status <> 'pending_review' then
    raise exception 'campaign_must_be_pending_review';
  end if;

  next_logic_snapshot := coalesce(p_logic_snapshot, campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb);
  logic_mode := coalesce(next_logic_snapshot ->> 'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
    next_logic_snapshot := jsonb_set(next_logic_snapshot, '{mode}', to_jsonb(logic_mode), true);
  end if;

  select
    coalesce(sum(planned_quantity), 0)::integer,
    coalesce(sum(planned_quantity * greatest(coalesce(bundle_quantity, 1), 1)), 0)::integer
  into planned_total, required_stock_total
  from public.draw_round_prizes
  where draw_round_id = p_draw_round_id
    and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb);

  select count(*)::integer
  into reserved_total
  from public.card_stock_reservations
  where draw_round_id = p_draw_round_id
    and status = 'reserved';

  if planned_total <> campaign.total_slots or reserved_total <> required_stock_total then
    raise exception 'reserved_stock_must_match_planned_quantity';
  end if;

  with reserved as (
    select
      reservations.id as reservation_id,
      reservations.stock_unit_id,
      reservations.draw_round_id,
      reservations.draw_round_prize_id,
      stock.card_id,
      prizes.seed_run_id
    from public.card_stock_reservations reservations
    join public.card_stock_units stock on stock.id = reservations.stock_unit_id
    join public.draw_round_prizes prizes on prizes.id = reservations.draw_round_prize_id
    where reservations.draw_round_id = p_draw_round_id
      and reservations.status = 'reserved'
      and stock.status = 'reserved'
    for update of reservations, stock, prizes
  ),
  inserted_units as (
    insert into public.draw_round_prize_units(
      draw_round_id,
      draw_round_prize_id,
      card_id,
      card_stock_unit_id,
      status,
      seed_run_id,
      metadata
    )
    select
      draw_round_id,
      draw_round_prize_id,
      card_id,
      stock_unit_id,
      'available',
      seed_run_id,
      jsonb_build_object('materializedByAdminId', p_owner_admin_id)
    from reserved
    returning id, card_stock_unit_id, card_id, draw_round_id, draw_round_prize_id
  ),
  allocated_stock as (
    update public.card_stock_units stock
    set status = 'allocated',
        allocated_draw_round_id = reserved.draw_round_id,
        allocated_draw_round_prize_id = reserved.draw_round_prize_id,
        metadata = stock.metadata || jsonb_build_object('allocatedByAdminId', p_owner_admin_id),
        updated_at = now()
    from reserved
    where stock.id = reserved.stock_unit_id
    returning stock.id, stock.card_id, reserved.draw_round_id, reserved.draw_round_prize_id
  ),
  allocated_reservations as (
    update public.card_stock_reservations reservations
    set status = 'allocated',
        allocated_by_admin_id = p_owner_admin_id,
        allocated_at = now(),
        metadata = reservations.metadata || jsonb_build_object('logicMode', logic_mode)
    from reserved
    where reservations.id = reserved.reservation_id
    returning reservations.stock_unit_id, reservations.draw_round_id, reservations.draw_round_prize_id
  ),
  ledger_allocated as (
    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select id, card_id, draw_round_id, draw_round_prize_id, 'allocated', p_owner_admin_id, jsonb_build_object('logicMode', logic_mode)
    from allocated_stock
    returning 1
  ),
  ledger_materialized as (
    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select card_stock_unit_id, card_id, draw_round_id, draw_round_prize_id, 'unit_materialized', p_owner_admin_id, jsonb_build_object('logicMode', logic_mode)
    from inserted_units
    returning 1
  )
  select count(*)::integer into materialized_total
  from inserted_units;

  if materialized_total <> required_stock_total then
    raise exception 'materialized_stock_must_match_planned_quantity';
  end if;

  update public.draw_rounds
  set logic_snapshot = next_logic_snapshot,
      approval_status = 'approved',
      approved_by = p_owner_admin_id,
      approved_at = now(),
      rejected_by = null,
      rejected_at = null,
      approval_notes = p_note,
      status = 'draft',
      visibility = 'private'
  where id = p_draw_round_id;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'approvalStatus', 'approved',
    'status', 'draft',
    'visibility', 'private',
    'logicMode', logic_mode,
    'materializedUnits', materialized_total
  );
end;
$$;

create or replace function public.publish_campaign(
  p_draw_round_id uuid,
  p_owner_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  materialized_total integer;
  available_total integer;
  required_stock_total integer;
  mismatched_prize_count integer;
begin
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.approval_status <> 'approved' then
    raise exception 'campaign_must_be_approved';
  end if;

  select
    count(*) filter (where status <> 'void')::integer,
    count(*) filter (where status = 'available')::integer
  into materialized_total, available_total
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  select coalesce(sum(planned_quantity * greatest(coalesce(bundle_quantity, 1), 1)), 0)::integer
  into required_stock_total
  from public.draw_round_prizes
  where draw_round_id = p_draw_round_id
    and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb);

  if campaign.total_slots <= 0 or materialized_total <> required_stock_total or available_total <= 0 then
    raise exception 'approved_inventory_not_ready_for_publish';
  end if;

  select count(*)::integer
  into mismatched_prize_count
  from public.draw_round_prizes prizes
  left join lateral (
    select count(*)::integer as unit_count
    from public.draw_round_prize_units units
    where units.draw_round_prize_id = prizes.id
      and units.status <> 'void'
  ) unit_counts on true
  where prizes.draw_round_id = p_draw_round_id
    and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    and coalesce(unit_counts.unit_count, 0) <> prizes.planned_quantity * greatest(coalesce(prizes.bundle_quantity, 1), 1);

  if mismatched_prize_count > 0 then
    raise exception 'approved_prize_units_must_match_planned_quantity';
  end if;

  update public.draw_rounds
  set status = 'live',
      visibility = 'public',
      approval_status = 'approved',
      approval_notes = coalesce(p_note, approval_notes)
  where id = p_draw_round_id;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'approvalStatus', 'approved',
    'status', 'live',
    'visibility', 'public',
    'publishedByAdminId', p_owner_admin_id
  );
end;
$$;

create or replace function public.edit_live_campaign_inventory(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_prizes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  v_admin_is_active boolean;
  desired record;
  existing public.draw_round_prizes%rowtype;
  v_prize_id uuid;
  v_planned_total integer := 0;
  v_required_stock_total integer := 0;
  v_awarded integer;
  v_awarded_slots integer;
  v_nonvoid integer;
  v_delta integer;
  v_target_slots integer;
  v_target_units integer;
  v_got integer;
  v_removed integer;
  v_consumed_slots integer;
  v_total_awarded integer;
  v_materialized_total integer;
  v_available_units integer;
  v_slot_rows integer;
  v_mismatch integer;
  v_identity_changed boolean;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;
  if p_admin_id is null then
    raise exception 'active_admin_required';
  end if;
  select exists (
    select 1 from public.admin_users admin
    where admin.id = p_admin_id and admin.is_active
  ) into v_admin_is_active;
  if not v_admin_is_active then
    raise exception 'active_admin_required';
  end if;
  if jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) = 0 then
    raise exception 'prize_inventory_required';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.status <> 'live' or campaign.approval_status <> 'approved' then
    raise exception 'campaign_not_live_editable';
  end if;

  create temporary table _desired_prizes on commit drop as
  select
    row_number() over () as ord,
    (x."cardId")::uuid as card_id,
    x.tier as tier,
    x.rank as rank,
    x."valueThb" as value_thb,
    x."convertCoinValue" as convert_coin_value,
    coalesce(x.weight, 1)::numeric as weight,
    coalesce(x."unlockAtSoldPct", 0)::numeric as unlock_at_sold_pct,
    greatest(coalesce(x."plannedQuantity", 0), 0)::integer as planned_quantity,
    least(greatest(coalesce(x."bundleQuantity", 1), 1), 100)::integer as bundle_quantity,
    coalesce(x."isTest", false) as is_test,
    nullif(btrim(x."seedRunId"), '')::uuid as seed_run_id,
    coalesce(x.metadata, '{}'::jsonb) as metadata,
    coalesce(x.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb as hidden
  from jsonb_to_recordset(p_prizes) as x(
    "cardId" text,
    tier text,
    rank integer,
    "valueThb" integer,
    "convertCoinValue" integer,
    weight numeric,
    "unlockAtSoldPct" numeric,
    "plannedQuantity" integer,
    "bundleQuantity" integer,
    "isTest" boolean,
    "seedRunId" text,
    metadata jsonb
  );

  if exists (
    select 1 from _desired_prizes where card_id is null or tier is null or rank is null
  ) then
    raise exception 'invalid_prize_row';
  end if;
  if exists (
    select tier, rank from _desired_prizes group by tier, rank having count(*) > 1
  ) then
    raise exception 'duplicate_prize_tier_rank';
  end if;

  for existing in
    select p.* from public.draw_round_prizes p
    where p.draw_round_id = p_draw_round_id
      and not exists (
        select 1 from _desired_prizes d where d.tier = p.tier and d.rank = p.rank
      )
    for update
  loop
    select count(*)::integer into v_awarded
    from public.draw_round_prize_units
    where draw_round_prize_id = existing.id and status = 'awarded';
    if v_awarded > 0 then
      raise exception 'prize_has_awarded_units';
    end if;
    perform public._release_live_prize_units(
      p_draw_round_id, existing.id, p_admin_id, null
    );
    update public.draw_round_prizes
    set planned_quantity = 0,
        metadata = coalesce(metadata, '{}'::jsonb) || '{"adminHidden": true}'::jsonb
    where id = existing.id;
  end loop;

  for desired in select * from _desired_prizes order by ord loop
    select * into existing
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id and tier = desired.tier and rank = desired.rank
    for update;

    v_awarded := 0;
    v_awarded_slots := 0;
    if found then
      select
        count(*) filter (where status = 'awarded')::integer,
        count(distinct coalesce(gacha_open_item_id, id)) filter (where status = 'awarded')::integer
      into v_awarded, v_awarded_slots
      from public.draw_round_prize_units
      where draw_round_prize_id = existing.id;

      if v_awarded > 0 then
        if not desired.hidden and desired.planned_quantity < v_awarded_slots then
          raise exception 'cannot_reduce_below_awarded';
        end if;
        if coalesce(existing.bundle_quantity, 1) <> desired.bundle_quantity then
          raise exception 'prize_bundle_locked_after_award';
        end if;
        v_identity_changed :=
          desired.card_id <> existing.card_id
          or coalesce(desired.metadata ->> 'stockUnitGroupKey', '')
             <> coalesce(existing.metadata ->> 'stockUnitGroupKey', '')
          or coalesce(desired.metadata -> 'stockUnitFilter', '{}'::jsonb)
             <> coalesce(existing.metadata -> 'stockUnitFilter', '{}'::jsonb);
        if v_identity_changed then
          raise exception 'prize_identity_locked_after_award';
        end if;
      end if;
    end if;

    insert into public.draw_round_prizes(
      draw_round_id, card_id, tier, rank, value_thb, convert_coin_value,
      weight, unlock_at_sold_pct, planned_quantity, bundle_quantity,
      is_test, seed_run_id, metadata
    )
    values (
      p_draw_round_id, desired.card_id, desired.tier, desired.rank,
      desired.value_thb, desired.convert_coin_value, desired.weight,
      desired.unlock_at_sold_pct, desired.planned_quantity,
      desired.bundle_quantity, desired.is_test, desired.seed_run_id,
      desired.metadata
    )
    on conflict (draw_round_id, tier, rank) do update
      set card_id = excluded.card_id,
          value_thb = excluded.value_thb,
          convert_coin_value = excluded.convert_coin_value,
          weight = excluded.weight,
          unlock_at_sold_pct = excluded.unlock_at_sold_pct,
          planned_quantity = excluded.planned_quantity,
          bundle_quantity = excluded.bundle_quantity,
          is_test = excluded.is_test,
          seed_run_id = excluded.seed_run_id,
          metadata = excluded.metadata
    returning id into v_prize_id;

    if desired.hidden then
      v_target_slots := v_awarded_slots;
      v_target_units := v_awarded;
    else
      v_target_slots := desired.planned_quantity;
      v_target_units := desired.planned_quantity * desired.bundle_quantity;
    end if;
    v_planned_total := v_planned_total + v_target_slots;
    v_required_stock_total := v_required_stock_total + v_target_units;

    select count(*)::integer into v_nonvoid
    from public.draw_round_prize_units
    where draw_round_prize_id = v_prize_id and status <> 'void';

    v_delta := v_target_units - v_nonvoid;

    if v_delta > 0 then
      v_got := public._materialize_live_prize_units(
        p_draw_round_id, v_prize_id, desired.card_id, v_delta, p_admin_id,
        desired.seed_run_id, desired.metadata
      );
      if v_got < v_delta then
        raise exception 'insufficient_card_stock';
      end if;
    elsif v_delta < 0 then
      v_removed := public._release_live_prize_units(
        p_draw_round_id, v_prize_id, p_admin_id, (-v_delta)
      );
    end if;
  end loop;

  if v_planned_total <= 0 then
    raise exception 'launch_prize_pool_required';
  end if;

  select count(*)::integer into v_consumed_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status not in ('available', 'void');

  select count(*)::integer into v_total_awarded
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id and status = 'awarded';

  if v_planned_total < v_consumed_slots then
    raise exception 'cannot_reduce_slots_below_consumed';
  end if;

  update public.draw_rounds
  set total_slots = v_planned_total
  where id = p_draw_round_id;

  perform public.create_draw_slots(p_draw_round_id);

  delete from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available'
    and slot_number > v_planned_total;

  select
    count(*) filter (where status <> 'void')::integer,
    count(*) filter (where status = 'available')::integer
  into v_materialized_total, v_available_units
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  if v_materialized_total <> v_required_stock_total then
    raise exception 'materialized_stock_must_match_planned_quantity';
  end if;

  select count(*)::integer into v_mismatch
  from public.draw_round_prizes prizes
  left join lateral (
    select count(*)::integer as unit_count
    from public.draw_round_prize_units units
    where units.draw_round_prize_id = prizes.id and units.status <> 'void'
  ) c on true
  where prizes.draw_round_id = p_draw_round_id
    and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    and coalesce(c.unit_count, 0) <> prizes.planned_quantity * greatest(coalesce(prizes.bundle_quantity, 1), 1);

  if v_mismatch > 0 then
    raise exception 'prize_units_must_match_planned_quantity';
  end if;

  select count(*)::integer into v_slot_rows
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status <> 'void';

  if v_slot_rows <> v_planned_total then
    raise exception 'slots_must_match_planned_quantity';
  end if;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id,
    'live_campaign_inventory_edited',
    jsonb_build_object(
      'drawRoundId', p_draw_round_id,
      'plannedTotal', v_planned_total,
      'requiredStockUnits', v_required_stock_total,
      'awardedUnits', v_total_awarded,
      'availableUnits', v_available_units
    )
  );

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'status', 'live',
    'totalSlots', v_planned_total,
    'requiredStockUnits', v_required_stock_total,
    'awardedUnits', v_total_awarded,
    'availableUnits', v_available_units
  );
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
          'displayTier', coalesce(
            prizes.metadata->>'displayTier',
            case
              when items.tier = 'high' and coalesce(prizes.rank, 99) <= 3 then 'rainbow'
              when items.tier = 'high' then 'gold'
              else 'bronze'
            end
          ),
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

create or replace function app_private.snapshot_collection_convert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  match_position integer;
  v_coin_value integer;
  v_deadline_days integer;
begin
  if new.source_type <> 'gacha_open' or new.source_id is null then
    return new;
  end if;

  -- serial_no supports old '<public_code>-NN' and bundled
  -- '<public_code>-NN-BB'; NN is the visible result position.
  match_position := nullif(
    regexp_replace(
      coalesce(new.serial_no, ''),
      '^.*-(\d{2})(?:-\d{2})?$',
      '\1'
    ),
    coalesce(new.serial_no, '')
  )::int;
  if match_position is null then
    return new;
  end if;

  select dp.convert_coin_value, dr.convert_deadline_days
    into v_coin_value, v_deadline_days
  from public.gacha_open_items goi
  join public.draw_round_prizes dp on dp.id = goi.draw_round_prize_id
  join public.draw_rounds dr on dr.id = dp.draw_round_id
  where goi.gacha_open_id = new.source_id
    and goi.result_position = match_position
  limit 1;

  if v_coin_value is not null and new.convert_coin_value_snapshot is null then
    new.convert_coin_value_snapshot := v_coin_value;
  end if;
  if v_deadline_days is not null and v_deadline_days > 0 and new.convert_expires_at is null then
    new.convert_expires_at := coalesce(new.acquired_at, now()) + (v_deadline_days || ' days')::interval;
  end if;

  return new;
end;
$$;

update public.collection_items ci
set convert_coin_value_snapshot = dp.convert_coin_value
from public.gacha_open_items goi
join public.draw_round_prizes dp on dp.id = goi.draw_round_prize_id
where ci.source_type = 'gacha_open'
  and ci.source_id = goi.gacha_open_id
  and ci.status = 'owned'
  and ci.convert_coin_value_snapshot is null
  and goi.result_position = nullif(
    regexp_replace(
      coalesce(ci.serial_no, ''),
      '^.*-(\d{2})(?:-\d{2})?$',
      '\1'
    ),
    coalesce(ci.serial_no, '')
  )::int
  and dp.convert_coin_value > 0;

revoke all on function public.submit_campaign_review(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.approve_campaign_inventory(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.edit_live_campaign_inventory(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.submit_campaign_review(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.approve_campaign_inventory(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.publish_campaign(uuid, uuid, text) to service_role;
grant execute on function public.edit_live_campaign_inventory(uuid, uuid, jsonb) to service_role;
