-- Global card inventory with owner-approved pack allocation.
--
-- This migration keeps public.cards as catalog metadata and moves physical card
-- stock into card_stock_units. Draft random packs store planned quantities only;
-- stock is reserved on owner-review submit and materialized into
-- draw_round_prize_units only after owner approval.
--
-- Production apply remains gated by the repository backup/PITR/restore drill
-- rule in Database/README.md.

alter table if exists public.draw_round_prizes
  add column if not exists planned_quantity integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_planned_quantity_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_planned_quantity_check
      check (planned_quantity >= 0 and planned_quantity <= 10000);
  end if;
end $$;

create table if not exists public.card_stock_units (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  status text not null default 'available' check (status in ('available', 'reserved', 'allocated', 'archived', 'deleted')),
  source_type text not null default 'admin_adjustment',
  source_id text,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  reserved_by_admin_id uuid references public.admin_users(id) on delete set null,
  allocated_draw_round_id uuid references public.draw_rounds(id) on delete set null,
  allocated_draw_round_prize_id uuid references public.draw_round_prizes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  stock_unit_id uuid not null references public.card_stock_units(id) on delete restrict,
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  draw_round_prize_id uuid not null references public.draw_round_prizes(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'allocated', 'released', 'expired', 'cancelled')),
  reserved_by_admin_id uuid references public.admin_users(id) on delete set null,
  allocated_by_admin_id uuid references public.admin_users(id) on delete set null,
  released_by_admin_id uuid references public.admin_users(id) on delete set null,
  reserved_at timestamptz not null default now(),
  allocated_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  stock_unit_id uuid references public.card_stock_units(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  draw_round_id uuid references public.draw_rounds(id) on delete set null,
  draw_round_prize_id uuid references public.draw_round_prizes(id) on delete set null,
  event_type text not null check (event_type in (
    'stock_created',
    'reserved',
    'reservation_released',
    'allocated',
    'unit_materialized',
    'archived',
    'deleted',
    'approval_failed'
  )),
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.draw_round_prize_units
  add column if not exists card_stock_unit_id uuid references public.card_stock_units(id) on delete set null;

create index if not exists card_stock_units_card_status_idx
  on public.card_stock_units(card_id, status, created_at);
create index if not exists card_stock_units_allocated_campaign_idx
  on public.card_stock_units(allocated_draw_round_id, allocated_draw_round_prize_id)
  where allocated_draw_round_id is not null;
create index if not exists card_stock_reservations_campaign_status_idx
  on public.card_stock_reservations(draw_round_id, status, created_at);
create index if not exists card_stock_reservations_prize_status_idx
  on public.card_stock_reservations(draw_round_prize_id, status);
create index if not exists card_stock_ledger_card_created_idx
  on public.card_stock_ledger(card_id, created_at desc);
create index if not exists draw_round_prize_units_stock_unit_idx
  on public.draw_round_prize_units(card_stock_unit_id)
  where card_stock_unit_id is not null;

create unique index if not exists card_stock_reservations_one_active_unit_idx
  on public.card_stock_reservations(stock_unit_id)
  where status in ('reserved', 'allocated');

create unique index if not exists draw_round_prize_units_one_active_stock_unit_idx
  on public.draw_round_prize_units(card_stock_unit_id)
  where card_stock_unit_id is not null and status <> 'void';

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'touch_updated_at'
  ) then
    drop trigger if exists card_stock_units_touch_updated_at on public.card_stock_units;
    create trigger card_stock_units_touch_updated_at
      before update on public.card_stock_units
      for each row execute function app_private.touch_updated_at();

    drop trigger if exists card_stock_reservations_touch_updated_at on public.card_stock_reservations;
    create trigger card_stock_reservations_touch_updated_at
      before update on public.card_stock_reservations
      for each row execute function app_private.touch_updated_at();
  end if;
end;
$$;

-- Backfill existing pack units into the new global stock model. These units
-- already represented committed pack stock, so they become allocated legacy
-- stock without changing campaign visibility or approval state.
with counts as (
  select
    draw_round_prize_id,
    count(*) filter (where status <> 'void')::integer as unit_count
  from public.draw_round_prize_units
  group by draw_round_prize_id
)
update public.draw_round_prizes prizes
set planned_quantity = greatest(prizes.planned_quantity, counts.unit_count)
from counts
where prizes.id = counts.draw_round_prize_id
  and counts.unit_count > 0;

insert into public.card_stock_units(
  card_id,
  status,
  source_type,
  source_id,
  allocated_draw_round_id,
  allocated_draw_round_prize_id,
  metadata,
  created_at,
  updated_at
)
select
  units.card_id,
  case when units.status = 'void' then 'archived' else 'allocated' end,
  'legacy_prize_unit',
  units.id::text,
  units.draw_round_id,
  units.draw_round_prize_id,
  jsonb_build_object(
    'legacyPrizeUnitId', units.id,
    'legacyPrizeUnitStatus', units.status,
    'backfilledAt', now()
  ),
  units.created_at,
  units.updated_at
from public.draw_round_prize_units units
where units.card_stock_unit_id is null
  and not exists (
    select 1
    from public.card_stock_units existing
    where existing.source_type = 'legacy_prize_unit'
      and existing.source_id = units.id::text
  );

update public.draw_round_prize_units units
set card_stock_unit_id = stock.id
from public.card_stock_units stock
where stock.source_type = 'legacy_prize_unit'
  and stock.source_id = units.id::text
  and units.card_stock_unit_id is null;

insert into public.card_stock_reservations(
  stock_unit_id,
  draw_round_id,
  draw_round_prize_id,
  status,
  reserved_at,
  allocated_at,
  released_at,
  metadata
)
select
  units.card_stock_unit_id,
  units.draw_round_id,
  units.draw_round_prize_id,
  case when units.status = 'void' then 'released' else 'allocated' end,
  units.created_at,
  case when units.status = 'void' then null else units.created_at end,
  case when units.status = 'void' then coalesce(units.voided_at, units.updated_at) else null end,
  jsonb_build_object('legacyBackfill', true, 'legacyPrizeUnitId', units.id)
from public.draw_round_prize_units units
where units.card_stock_unit_id is not null
  and not exists (
    select 1
    from public.card_stock_reservations existing
    where existing.stock_unit_id = units.card_stock_unit_id
  );

insert into public.card_stock_ledger(
  stock_unit_id,
  card_id,
  draw_round_id,
  draw_round_prize_id,
  event_type,
  metadata
)
select
  units.card_stock_unit_id,
  units.card_id,
  units.draw_round_id,
  units.draw_round_prize_id,
  case when units.status = 'void' then 'archived' else 'unit_materialized' end,
  jsonb_build_object('legacyBackfill', true, 'legacyPrizeUnitId', units.id)
from public.draw_round_prize_units units
where units.card_stock_unit_id is not null
  and not exists (
    select 1
    from public.card_stock_ledger existing
    where existing.stock_unit_id = units.card_stock_unit_id
      and existing.metadata @> jsonb_build_object('legacyPrizeUnitId', units.id)
  );

alter table public.card_stock_units enable row level security;
alter table public.card_stock_reservations enable row level security;
alter table public.card_stock_ledger enable row level security;

revoke all on table public.card_stock_units from public, anon, authenticated;
revoke all on table public.card_stock_reservations from public, anon, authenticated;
revoke all on table public.card_stock_ledger from public, anon, authenticated;
grant all on table public.card_stock_units to service_role;
grant all on table public.card_stock_reservations to service_role;
grant all on table public.card_stock_ledger to service_role;

create or replace function public.get_card_stock_summary(
  p_card_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with unit_counts as (
    select
      card_id,
      count(*) filter (where status <> 'deleted')::integer as total_units,
      count(*) filter (where status = 'available')::integer as available_units,
      count(*) filter (where status = 'reserved')::integer as reserved_units,
      count(*) filter (where status = 'allocated')::integer as allocated_units,
      count(*) filter (where status = 'archived')::integer as archived_units,
      count(*) filter (where status = 'deleted')::integer as deleted_units
    from public.card_stock_units
    where p_card_id is null or card_id = p_card_id
    group by card_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cardId', cards.id,
    'totalUnits', coalesce(unit_counts.total_units, 0),
    'availableUnits', coalesce(unit_counts.available_units, 0),
    'reservedUnits', coalesce(unit_counts.reserved_units, 0),
    'allocatedUnits', coalesce(unit_counts.allocated_units, 0),
    'archivedUnits', coalesce(unit_counts.archived_units, 0),
    'deletedUnits', coalesce(unit_counts.deleted_units, 0)
  ) order by cards.updated_at desc), '[]'::jsonb)
  from public.cards cards
  left join unit_counts on unit_counts.card_id = cards.id
  where p_card_id is null or cards.id = p_card_id;
$$;

create or replace function public.adjust_card_stock_units(
  p_card_id uuid,
  p_quantity_delta integer,
  p_admin_id uuid,
  p_source_type text default 'admin_adjustment',
  p_source_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  selected_ids uuid[];
  archived_count integer := 0;
  normalized_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_card_id is null then
    raise exception 'card_required';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then
    raise exception 'invalid_stock_quantity_delta';
  end if;
  if not exists (select 1 from public.cards where id = p_card_id) then
    raise exception 'card_not_found';
  end if;

  if p_quantity_delta > 0 then
    with inserted as (
      insert into public.card_stock_units(
        card_id,
        status,
        source_type,
        source_id,
        created_by_admin_id,
        metadata
      )
      select
        p_card_id,
        'available',
        coalesce(nullif(p_source_type, ''), 'admin_adjustment'),
        nullif(p_source_id, ''),
        p_admin_id,
        normalized_metadata || jsonb_build_object('createdByAdminId', p_admin_id)
      from generate_series(1, p_quantity_delta)
      returning id, card_id
    ),
    ledgered as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'stock_created', p_admin_id, normalized_metadata
      from inserted
      returning 1
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into selected_ids
    from inserted;
  else
    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select id
      from public.card_stock_units
      where card_id = p_card_id
        and status = 'available'
      order by created_at desc, id desc
      limit abs(p_quantity_delta)
      for update skip locked
    ) selected;

    if coalesce(array_length(selected_ids, 1), 0) < abs(p_quantity_delta) then
      raise exception 'insufficient_available_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'archived',
        metadata = units.metadata || normalized_metadata || jsonb_build_object('archivedByAdminId', p_admin_id),
        updated_at = now()
    where units.id = any(selected_ids);
    get diagnostics archived_count = row_count;

    insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
    select id, card_id, 'archived', p_admin_id, normalized_metadata
    from public.card_stock_units
    where id = any(selected_ids);
  end if;

  return jsonb_build_object(
    'cardId', p_card_id,
    'quantityDelta', p_quantity_delta,
    'changedUnits', greatest(p_quantity_delta, archived_count),
    'stock', public.get_card_stock_summary(p_card_id)
  );
end;
$$;

create or replace function public.release_campaign_reservations(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_reason text default 'released',
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  release_status text := case
    when p_reason = 'cancelled' then 'cancelled'
    when p_reason = 'expired' then 'expired'
    else 'released'
  end;
  released_count integer := 0;
  awarded_count integer := 0;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;

  select count(*)::integer
  into awarded_count
  from public.card_stock_reservations reservations
  join public.draw_round_prize_units units
    on units.card_stock_unit_id = reservations.stock_unit_id
  where reservations.draw_round_id = p_draw_round_id
    and reservations.status in ('reserved', 'allocated')
    and units.status = 'awarded';

  if awarded_count > 0 then
    raise exception 'campaign_has_awarded_inventory';
  end if;

  with active as (
    select
      reservations.id,
      reservations.stock_unit_id,
      stock.card_id,
      reservations.draw_round_id,
      reservations.draw_round_prize_id
    from public.card_stock_reservations reservations
    join public.card_stock_units stock on stock.id = reservations.stock_unit_id
    where reservations.draw_round_id = p_draw_round_id
      and reservations.status in ('reserved', 'allocated')
    for update of reservations, stock
  ),
  voided_units as (
    update public.draw_round_prize_units units
    set status = 'void',
        voided_at = coalesce(units.voided_at, now()),
        metadata = units.metadata || jsonb_build_object('reason', p_reason, 'voidedByAdminId', p_admin_id)
    from active
    where units.card_stock_unit_id = active.stock_unit_id
      and units.status <> 'void'
    returning units.card_stock_unit_id
  ),
  released_units as (
    update public.card_stock_units units
    set status = 'available',
        reserved_by_admin_id = null,
        allocated_draw_round_id = null,
        allocated_draw_round_prize_id = null,
        metadata = units.metadata || jsonb_build_object('releasedByAdminId', p_admin_id, 'reason', p_reason),
        updated_at = now()
    from active
    where units.id = active.stock_unit_id
      and units.status in ('reserved', 'allocated')
    returning units.id, units.card_id
  ),
  released_reservations as (
    update public.card_stock_reservations reservations
    set status = release_status,
        released_by_admin_id = p_admin_id,
        released_at = now(),
        metadata = reservations.metadata || jsonb_build_object('reason', p_reason, 'note', p_note)
    from active
    where reservations.id = active.id
    returning reservations.stock_unit_id, active.card_id, reservations.draw_round_id, reservations.draw_round_prize_id
  ),
  ledgered as (
    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select
      stock_unit_id,
      card_id,
      draw_round_id,
      draw_round_prize_id,
      'reservation_released',
      p_admin_id,
      jsonb_build_object('reason', p_reason, 'note', p_note)
    from released_reservations
    returning 1
  )
  select count(*)::integer into released_count
  from released_reservations;

  if p_reason = 'rejected' then
    update public.draw_rounds
    set approval_status = 'rejected',
        rejected_by = p_admin_id,
        rejected_at = now(),
        approval_notes = p_note,
        status = 'draft',
        visibility = 'private'
    where id = p_draw_round_id;
  elsif p_reason = 'changes_requested' then
    update public.draw_rounds
    set approval_status = 'changes_requested',
        rejected_by = p_admin_id,
        rejected_at = now(),
        approval_notes = p_note,
        status = 'draft',
        visibility = 'private'
    where id = p_draw_round_id;
  elsif p_reason = 'cancelled' then
    update public.draw_rounds
    set approval_status = 'not_submitted',
        approval_notes = p_note,
        status = 'draft',
        visibility = 'private'
    where id = p_draw_round_id;
  end if;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'releasedReservations', released_count,
    'reason', p_reason
  );
end;
$$;

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
    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select id
      from public.card_stock_units
      where card_id = prize_row.card_id
        and status = 'available'
      order by created_at, id
      limit prize_row.planned_quantity
      for update skip locked
    ) selected;

    selected_count := coalesce(array_length(selected_ids, 1), 0);
    if selected_count < prize_row.planned_quantity then
      insert into public.card_stock_ledger(card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
      values (
        prize_row.card_id,
        p_draw_round_id,
        prize_row.id,
        'approval_failed',
        p_admin_id,
        jsonb_build_object(
          'reason', 'insufficient_card_stock',
          'requiredUnits', prize_row.planned_quantity,
          'availableUnits', selected_count
        )
      );
      raise exception 'insufficient_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'reserved',
        reserved_by_admin_id = p_admin_id,
        metadata = units.metadata || jsonb_build_object('reservedByAdminId', p_admin_id),
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
      jsonb_build_object('logicMode', logic_mode, 'plannedQuantity', prize_row.planned_quantity);

    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select
      unnest(selected_ids),
      prize_row.card_id,
      p_draw_round_id,
      prize_row.id,
      'reserved',
      p_admin_id,
      jsonb_build_object('logicMode', logic_mode);

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

  select coalesce(sum(planned_quantity), 0)::integer
  into planned_total
  from public.draw_round_prizes
  where draw_round_id = p_draw_round_id
    and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb);

  select count(*)::integer
  into reserved_total
  from public.card_stock_reservations
  where draw_round_id = p_draw_round_id
    and status = 'reserved';

  if planned_total <> campaign.total_slots or reserved_total <> planned_total then
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

  if materialized_total <> planned_total then
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

  if materialized_total <> campaign.total_slots or available_total <= 0 then
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
    and coalesce(unit_counts.unit_count, 0) <> prizes.planned_quantity;

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

create or replace function public.cancel_campaign_review(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.release_campaign_reservations(p_draw_round_id, p_admin_id, 'cancelled', p_note);
  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'approvalStatus', 'not_submitted',
    'status', 'draft',
    'visibility', 'private'
  );
end;
$$;

create or replace function public.archive_campaign_inventory(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  awarded_count integer;
begin
  select count(*)::integer
  into awarded_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id
    and status = 'awarded';

  if awarded_count = 0 then
    perform public.release_campaign_reservations(p_draw_round_id, p_admin_id, 'archived', p_note);
  end if;

  update public.draw_rounds
  set status = 'archived',
      visibility = 'private',
      approval_notes = coalesce(p_note, approval_notes)
  where id = p_draw_round_id;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'status', 'archived',
    'visibility', 'private',
    'releasedStock', awarded_count = 0
  );
end;
$$;

create or replace function public.delete_campaign_inventory(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  archive_result jsonb;
begin
  archive_result := public.archive_campaign_inventory(p_draw_round_id, p_admin_id, p_note);

  update public.draw_rounds
  set test_metadata = coalesce(test_metadata, '{}'::jsonb) || jsonb_build_object(
        'ownerRemovedAt', now(),
        'ownerRemovedByAdminId', p_admin_id,
        'ownerRemovedNote', p_note
      )
  where id = p_draw_round_id;

  return archive_result || jsonb_build_object('ownerRemoved', true);
end;
$$;

revoke all on function public.get_card_stock_summary(uuid) from public, anon, authenticated;
revoke all on function public.adjust_card_stock_units(uuid, integer, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_campaign_reservations(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_campaign_review(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.approve_campaign_inventory(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_campaign_review(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.archive_campaign_inventory(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_campaign_inventory(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_card_stock_summary(uuid) to service_role;
grant execute on function public.adjust_card_stock_units(uuid, integer, uuid, text, text, jsonb) to service_role;
grant execute on function public.release_campaign_reservations(uuid, uuid, text, text) to service_role;
grant execute on function public.submit_campaign_review(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.approve_campaign_inventory(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.publish_campaign(uuid, uuid, text) to service_role;
grant execute on function public.cancel_campaign_review(uuid, uuid, text) to service_role;
grant execute on function public.archive_campaign_inventory(uuid, uuid, text) to service_role;
grant execute on function public.delete_campaign_inventory(uuid, uuid, text) to service_role;
