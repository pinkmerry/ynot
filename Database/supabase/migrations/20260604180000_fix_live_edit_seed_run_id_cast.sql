-- Fix: edit_live_campaign_inventory failed with
--   "column seed_run_id is of type uuid but expression is of type text"
-- because the RPC inserts the prize seed_run_id (parsed from the JSON payload as
-- text) straight into the uuid seed_run_id columns. plpgsql does not implicitly
-- cast text -> uuid inside INSERT ... SELECT (the REST/draft path works only
-- because PostgREST casts for it). Re-create the two functions that touch
-- seed_run_id with an explicit nullif(...)::uuid cast.
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
  v_awarded integer;
  v_nonvoid integer;
  v_delta integer;
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

  -- 1. Serialize against concurrent opens by locking the round first.
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

  -- 2. Stage the desired prize list. seed_run_id stays text here and is cast to
  --    uuid at each insert into a uuid column.
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

  -- 3. Remove prizes dropped from the desired list. Reject if any have awarded
  --    units; otherwise release their available units and hide them (planned 0)
  --    rather than DELETE — draw_round_prize_units reference prizes with
  --    on delete restrict, and hidden rows preserve the void/audit history.
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

  -- 4. Reconcile each desired prize.
  for desired in select * from _desired_prizes order by ord loop
    select * into existing
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id and tier = desired.tier and rank = desired.rank
    for update;

    v_awarded := 0;
    if found then
      select count(*)::integer into v_awarded
      from public.draw_round_prize_units
      where draw_round_prize_id = existing.id and status = 'awarded';

      if v_awarded > 0 then
        if not desired.hidden and desired.planned_quantity < v_awarded then
          raise exception 'cannot_reduce_below_awarded';
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
      weight, unlock_at_sold_pct, planned_quantity, is_test, seed_run_id, metadata
    )
    values (
      p_draw_round_id, desired.card_id, desired.tier, desired.rank,
      desired.value_thb, desired.convert_coin_value, desired.weight,
      desired.unlock_at_sold_pct, desired.planned_quantity, desired.is_test,
      desired.seed_run_id, desired.metadata
    )
    on conflict (draw_round_id, tier, rank) do update
      set card_id = excluded.card_id,
          value_thb = excluded.value_thb,
          convert_coin_value = excluded.convert_coin_value,
          weight = excluded.weight,
          unlock_at_sold_pct = excluded.unlock_at_sold_pct,
          planned_quantity = excluded.planned_quantity,
          is_test = excluded.is_test,
          seed_run_id = excluded.seed_run_id,
          metadata = excluded.metadata
    returning id into v_prize_id;

    if desired.hidden then
      v_delta := v_awarded;
    else
      v_delta := desired.planned_quantity;
    end if;
    v_planned_total := v_planned_total + v_delta;

    select count(*)::integer into v_nonvoid
    from public.draw_round_prize_units
    where draw_round_prize_id = v_prize_id and status <> 'void';

    v_delta := v_delta - v_nonvoid;

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

  -- 5. Slot floor: never shrink below already-consumed slots or total awards.
  select count(*)::integer into v_consumed_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status not in ('available', 'void');

  select count(*)::integer into v_total_awarded
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id and status = 'awarded';

  if v_planned_total < greatest(v_consumed_slots, v_total_awarded) then
    raise exception 'cannot_reduce_slots_below_consumed';
  end if;

  -- 6. Sync total_slots + draw_slots to the new planned total.
  update public.draw_rounds
  set total_slots = v_planned_total
  where id = p_draw_round_id;

  perform public.create_draw_slots(p_draw_round_id);

  delete from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available'
    and slot_number > v_planned_total;

  -- 7. Re-assert the publish invariants; any mismatch rolls the tx back.
  select
    count(*) filter (where status <> 'void')::integer,
    count(*) filter (where status = 'available')::integer
  into v_materialized_total, v_available_units
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  if v_materialized_total <> v_planned_total then
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
    and coalesce(c.unit_count, 0) <> prizes.planned_quantity;

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
      'awardedUnits', v_total_awarded,
      'availableUnits', v_available_units
    )
  );

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'status', 'live',
    'totalSlots', v_planned_total,
    'awardedUnits', v_total_awarded,
    'availableUnits', v_available_units
  );
end;
$$;

create or replace function public._materialize_live_prize_units(
  p_draw_round_id uuid,
  p_prize_id uuid,
  p_card_id uuid,
  p_count integer,
  p_admin_id uuid,
  p_seed_run_id text,
  p_metadata jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_got integer;
begin
  if p_count <= 0 then
    return 0;
  end if;

  with picked as (
    select stock.id, stock.card_id
    from public.card_stock_units stock
    where stock.card_id = p_card_id
      and stock.status = 'available'
      and public.card_stock_unit_matches_prize_filter(stock, p_metadata)
    order by stock.created_at, stock.id
    limit p_count
    for update skip locked
  ),
  alloc as (
    update public.card_stock_units stock
    set status = 'allocated',
        allocated_draw_round_id = p_draw_round_id,
        allocated_draw_round_prize_id = p_prize_id,
        reserved_by_admin_id = p_admin_id,
        metadata = stock.metadata || jsonb_build_object('allocatedByAdminId', p_admin_id, 'liveEdited', true),
        updated_at = now()
    from picked
    where stock.id = picked.id
    returning stock.id, stock.card_id
  ),
  ins_units as (
    insert into public.draw_round_prize_units(
      draw_round_id, draw_round_prize_id, card_id, card_stock_unit_id, status, seed_run_id, metadata
    )
    select p_draw_round_id, p_prize_id, alloc.card_id, alloc.id, 'available',
           nullif(btrim(p_seed_run_id), '')::uuid,
           jsonb_build_object('materializedByAdminId', p_admin_id, 'liveEdited', true)
    from alloc
    returning card_stock_unit_id
  ),
  ins_resv as (
    insert into public.card_stock_reservations(
      stock_unit_id, draw_round_id, draw_round_prize_id, status,
      reserved_by_admin_id, allocated_by_admin_id, allocated_at, metadata
    )
    select alloc.id, p_draw_round_id, p_prize_id, 'allocated', p_admin_id, p_admin_id, now(),
      jsonb_strip_nulls(jsonb_build_object(
        'liveEdited', true,
        'stockSku', p_metadata ->> 'stockSku',
        'stockUnitGroupKey', p_metadata ->> 'stockUnitGroupKey',
        'stockUnitFilter', p_metadata -> 'stockUnitFilter'
      ))
    from alloc
    returning 1
  ),
  led as (
    insert into public.card_stock_ledger(
      stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata
    )
    select alloc.id, alloc.card_id, p_draw_round_id, p_prize_id, 'unit_materialized', p_admin_id,
           jsonb_build_object('liveEdited', true)
    from alloc
    returning 1
  )
  select count(*)::integer into v_got from ins_units;

  return coalesce(v_got, 0);
end;
$$;
