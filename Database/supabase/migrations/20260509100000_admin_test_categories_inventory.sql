-- Admin production-test readiness: database-backed categories, test isolation,
-- prize-unit inventory, and transactional gacha opening.
-- Production apply remains gated by backup/RLS/seed dry-run/owner go-no-go runbook.

create table if not exists public.seed_runs (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique not null,
  label text not null,
  environment text not null default 'local' check (environment in ('local', 'staging', 'production')),
  status text not null default 'planned' check (status in ('planned', 'dry_run', 'applied', 'hidden', 'cleanup_started', 'cleaned', 'failed')),
  applied_by_admin_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seed_run_items (
  id uuid primary key default gen_random_uuid(),
  seed_run_id uuid not null references public.seed_runs(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  row_key text,
  action text not null check (action in ('planned', 'upserted', 'hidden', 'voided', 'skipped', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_th text not null,
  name_en text not null,
  description text,
  image_url text,
  icon text,
  legacy_series text check (legacy_series in ('pokemon', 'one_piece')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  is_test boolean not null default false,
  seed_run_id uuid references public.seed_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draw_round_categories (
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  category_id uuid not null references public.store_categories(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (draw_round_id, category_id)
);

create table if not exists public.draw_round_testers (
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by_admin_id uuid references public.admin_users(id) on delete set null,
  seed_run_id uuid references public.seed_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (draw_round_id, profile_id)
);

alter table public.draw_rounds
  add column if not exists is_test boolean not null default false,
  add column if not exists seed_run_id uuid references public.seed_runs(id) on delete set null,
  add column if not exists test_metadata jsonb not null default '{}'::jsonb;

alter table public.cards
  add column if not exists is_test boolean not null default false,
  add column if not exists seed_run_id uuid references public.seed_runs(id) on delete set null,
  add column if not exists asset_source text,
  add column if not exists asset_license text,
  add column if not exists asset_manifest_key text;

alter table public.draw_round_prizes
  add column if not exists is_test boolean not null default false,
  add column if not exists seed_run_id uuid references public.seed_runs(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.draw_round_prize_units (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  draw_round_prize_id uuid not null references public.draw_round_prizes(id) on delete restrict,
  card_id uuid not null references public.cards(id) on delete restrict,
  status text not null default 'available' check (status in ('available', 'reserved', 'awarded', 'void')),
  profile_id uuid references public.profiles(id) on delete set null,
  gacha_open_id uuid references public.gacha_opens(id) on delete set null,
  gacha_open_item_id uuid references public.gacha_open_items(id) on delete set null,
  collection_item_id uuid references public.collection_items(id) on delete set null,
  seed_run_id uuid references public.seed_runs(id) on delete set null,
  awarded_at timestamptz,
  voided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gacha_open_items
  add column if not exists draw_round_prize_unit_id uuid references public.draw_round_prize_units(id) on delete set null;

create index if not exists seed_run_items_run_table_idx on public.seed_run_items(seed_run_id, table_name, action);
create index if not exists store_categories_public_idx on public.store_categories(is_active, is_test, sort_order, slug);
create index if not exists store_categories_legacy_series_idx on public.store_categories(legacy_series) where legacy_series is not null;
create index if not exists draw_round_categories_category_idx on public.draw_round_categories(category_id, draw_round_id);
create index if not exists draw_round_testers_profile_idx on public.draw_round_testers(profile_id, draw_round_id);
create index if not exists draw_rounds_public_test_idx on public.draw_rounds(status, visibility, is_test, sort_order);
create index if not exists cards_test_catalog_idx on public.cards(is_test, series, search_name);
create index if not exists draw_round_prizes_test_idx on public.draw_round_prizes(draw_round_id, is_test, tier, rank);
create index if not exists draw_round_prize_units_round_status_idx on public.draw_round_prize_units(draw_round_id, status, created_at);
create index if not exists draw_round_prize_units_prize_status_idx on public.draw_round_prize_units(draw_round_prize_id, status);
create index if not exists draw_round_prize_units_open_item_idx on public.draw_round_prize_units(gacha_open_item_id) where gacha_open_item_id is not null;

-- Keep touch timestamps consistent with earlier migrations when the helper exists.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and p.proname = 'touch_updated_at') then
    drop trigger if exists seed_runs_touch_updated_at on public.seed_runs;
    create trigger seed_runs_touch_updated_at before update on public.seed_runs for each row execute function app_private.touch_updated_at();
    drop trigger if exists store_categories_touch_updated_at on public.store_categories;
    create trigger store_categories_touch_updated_at before update on public.store_categories for each row execute function app_private.touch_updated_at();
    drop trigger if exists draw_round_prize_units_touch_updated_at on public.draw_round_prize_units;
    create trigger draw_round_prize_units_touch_updated_at before update on public.draw_round_prize_units for each row execute function app_private.touch_updated_at();
  end if;
end;
$$;

insert into public.store_categories (slug, name_th, name_en, description, icon, legacy_series, sort_order, is_active, is_test, metadata)
values
  ('pokemon', 'POKEMON', 'Pokemon', 'Core Pokemon storefront category.', '⚡', 'pokemon', 10, true, false, jsonb_build_object('systemSeed', 'legacy-series')),
  ('one-piece', 'ONE PIECE', 'One Piece', 'Core One Piece storefront category.', '☠️', 'one_piece', 20, true, false, jsonb_build_object('systemSeed', 'legacy-series'))
on conflict (slug) do update
set name_th = excluded.name_th,
    name_en = excluded.name_en,
    description = excluded.description,
    icon = excluded.icon,
    legacy_series = excluded.legacy_series,
    sort_order = excluded.sort_order,
    is_active = true,
    is_test = false,
    updated_at = now();

insert into public.draw_round_categories(draw_round_id, category_id, is_primary)
select dr.id, sc.id, true
from public.draw_rounds dr
join public.store_categories sc on sc.legacy_series = dr.series
where not exists (
  select 1 from public.draw_round_categories existing
  where existing.draw_round_id = dr.id and existing.category_id = sc.id
);

-- RLS and API exposure. New public tables need explicit grants on newer Supabase
-- projects, while RLS keeps test/sensitive rows hidden.
alter table public.seed_runs enable row level security;
alter table public.seed_run_items enable row level security;
alter table public.store_categories enable row level security;
alter table public.draw_round_categories enable row level security;
alter table public.draw_round_testers enable row level security;
alter table public.draw_round_prize_units enable row level security;

revoke all on table public.seed_runs from public, anon, authenticated;
revoke all on table public.seed_run_items from public, anon, authenticated;
revoke all on table public.draw_round_testers from public, anon, authenticated;
revoke all on table public.draw_round_prize_units from public, anon, authenticated;
grant all on table public.seed_runs to service_role;
grant all on table public.seed_run_items to service_role;
grant all on table public.draw_round_testers to service_role;
grant all on table public.draw_round_prize_units to service_role;
grant select on table public.store_categories to anon, authenticated;
grant select on table public.draw_round_categories to anon, authenticated;
grant all on table public.store_categories to service_role;
grant all on table public.draw_round_categories to service_role;

drop policy if exists "Public can read active non-test categories" on public.store_categories;
create policy "Public can read active non-test categories"
on public.store_categories
for select
to anon, authenticated
using (is_active = true and is_test = false);

drop policy if exists "Public can read public campaign categories" on public.draw_round_categories;
create policy "Public can read public campaign categories"
on public.draw_round_categories
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.draw_rounds dr
    join public.store_categories sc on sc.id = draw_round_categories.category_id
    where dr.id = draw_round_categories.draw_round_id
      and dr.status in ('live', 'closed')
      and dr.visibility = 'public'
      and coalesce(dr.is_test, false) = false
      and sc.is_active = true
      and sc.is_test = false
  )
);

-- Replace older permissive public policies so direct anon/auth Data API reads do
-- not leak test categories/packs/cards/prizes/slots.
drop policy if exists "Anyone can read live draw rounds" on public.draw_rounds;
create policy "Anyone can read live draw rounds"
on public.draw_rounds
for select
to anon, authenticated
using (status = 'live' and visibility = 'public' and coalesce(is_test, false) = false);

drop policy if exists "Anyone can read public live slot status" on public.draw_slots;
create policy "Anyone can read public live slot status"
on public.draw_slots
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.draw_rounds dr
    where dr.id = draw_slots.draw_round_id
      and dr.status = 'live'
      and dr.visibility = 'public'
      and coalesce(dr.is_test, false) = false
  )
);

drop policy if exists "Anyone can read card catalog" on public.cards;
create policy "Anyone can read card catalog"
on public.cards
for select
to anon, authenticated
using (coalesce(is_test, false) = false);

drop policy if exists "Anyone can read public live draw prizes" on public.draw_round_prizes;
create policy "Anyone can read public live draw prizes"
on public.draw_round_prizes
for select
to anon, authenticated
using (
  coalesce(is_test, false) = false
  and exists (
    select 1
    from public.draw_rounds dr
    where dr.id = draw_round_prizes.draw_round_id
      and dr.status = 'live'
      and dr.visibility = 'public'
      and coalesce(dr.is_test, false) = false
  )
);

create or replace function public.profile_can_open_test_draw_round(
  p_draw_round_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.draw_round_testers tester
    where tester.draw_round_id = p_draw_round_id
      and tester.profile_id = p_profile_id
  )
  or exists (
    select 1 from public.admin_users au
    where au.profile_id = p_profile_id
      and au.is_active = true
      and au.role in ('owner', 'admin', 'staff')
  );
$$;

create or replace function public.get_draw_round_inventory_summary(
  p_draw_round_id uuid default null,
  p_profile_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with slot_counts as (
    select
      draw_round_id,
      count(*)::integer as total_slots,
      count(*) filter (where status = 'available')::integer as available_slots,
      count(*) filter (where status in ('picked', 'opened'))::integer as claimed_slots,
      count(*) filter (where status = 'void')::integer as void_slots
    from public.draw_slots
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  ),
  unit_counts as (
    select
      draw_round_id,
      count(*)::integer as total_units,
      count(*) filter (where status = 'available')::integer as available_units,
      count(*) filter (where status = 'awarded')::integer as awarded_units,
      count(*) filter (where status = 'reserved')::integer as reserved_units,
      count(*) filter (where status = 'void')::integer as void_units
    from public.draw_round_prize_units
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'drawRoundId', dr.id,
    'totalSlots', coalesce(sc.total_slots, dr.total_slots, 0),
    'remainingSlots', coalesce(sc.available_slots, dr.total_slots, 0),
    'claimedSlots', coalesce(sc.claimed_slots, 0),
    'voidSlots', coalesce(sc.void_slots, 0),
    'totalUnits', coalesce(uc.total_units, 0),
    'availableUnits', coalesce(uc.available_units, 0),
    'awardedUnits', coalesce(uc.awarded_units, 0),
    'reservedUnits', coalesce(uc.reserved_units, 0),
    'voidUnits', coalesce(uc.void_units, 0)
  ) order by dr.sort_order, dr.created_at desc), '[]'::jsonb)
  from public.draw_rounds dr
  left join slot_counts sc on sc.draw_round_id = dr.id
  left join unit_counts uc on uc.draw_round_id = dr.id
  where p_draw_round_id is null or dr.id = p_draw_round_id;
$$;

create or replace function public.ensure_draw_round_prize_units(
  p_draw_round_prize_id uuid,
  p_total_units integer,
  p_admin_id uuid,
  p_seed_run_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  prize_row public.draw_round_prizes%rowtype;
  current_total integer;
  awarded_count integer;
  available_count integer;
  insert_count integer;
  void_count integer;
begin
  if p_draw_round_prize_id is null then
    raise exception 'prize_required';
  end if;
  if p_total_units is null or p_total_units < 0 or p_total_units > 10000 then
    raise exception 'invalid_prize_unit_quantity';
  end if;

  select * into prize_row
  from public.draw_round_prizes
  where id = p_draw_round_prize_id
  for update;

  if prize_row.id is null then
    raise exception 'prize_not_found';
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'awarded')::integer,
    count(*) filter (where status = 'available')::integer
  into current_total, awarded_count, available_count
  from public.draw_round_prize_units
  where draw_round_prize_id = p_draw_round_prize_id
    and status <> 'void';

  if p_total_units < awarded_count then
    raise exception 'quantity_below_awarded_inventory';
  end if;

  insert_count := greatest(0, p_total_units - current_total);
  if insert_count > 0 then
    insert into public.draw_round_prize_units(draw_round_id, draw_round_prize_id, card_id, status, seed_run_id, metadata)
    select prize_row.draw_round_id, prize_row.id, prize_row.card_id, 'available', coalesce(p_seed_run_id, prize_row.seed_run_id), jsonb_build_object('createdByAdminId', p_admin_id)
    from generate_series(1, insert_count);
  end if;

  void_count := greatest(0, current_total - p_total_units);
  if void_count > available_count then
    raise exception 'quantity_below_reserved_or_awarded_inventory';
  end if;
  if void_count > 0 then
    with units_to_void as (
      select id
      from public.draw_round_prize_units
      where draw_round_prize_id = p_draw_round_prize_id
        and status = 'available'
      order by created_at desc
      limit void_count
      for update skip locked
    )
    update public.draw_round_prize_units units
    set status = 'void',
        voided_at = now(),
        metadata = units.metadata || jsonb_build_object('voidedByAdminId', p_admin_id, 'reason', 'admin_quantity_reduced')
    from units_to_void
    where units.id = units_to_void.id;
  end if;

  return (
    select jsonb_build_object(
      'drawRoundPrizeId', p_draw_round_prize_id,
      'targetUnits', p_total_units,
      'totalUnits', count(*)::integer,
      'availableUnits', count(*) filter (where status = 'available'),
      'awardedUnits', count(*) filter (where status = 'awarded'),
      'voidUnits', count(*) filter (where status = 'void')
    )
    from public.draw_round_prize_units
    where draw_round_prize_id = p_draw_round_prize_id
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
  unit_tier text;
  unit_value_thb integer;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  open_item_id uuid;
  new_collection_item_id uuid;
  available_slot_count integer;
  available_unit_count integer;
  result_items jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
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
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  if coalesce(campaign.is_test, false) = true and not public.profile_can_open_test_draw_round(p_draw_round_id, p_profile_id) then
    raise exception 'test_campaign_not_allowed';
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
  values (p_profile_id, p_draw_round_id, total_cost, p_quantity, 'completed', p_idempotency_key, jsonb_build_object('campaignSlug', campaign.slug, 'isTest', coalesce(campaign.is_test, false)))
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
    jsonb_build_object('drawRoundId', p_draw_round_id, 'quantity', p_quantity, 'isTest', coalesce(campaign.is_test, false))
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

    select units.id, units.draw_round_prize_id, units.card_id, prizes.tier, prizes.value_thb
    into unit_id, unit_prize_id, unit_card_id, unit_tier, unit_value_thb
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    where units.draw_round_id = p_draw_round_id
      and units.status = 'available'
    order by random()
    limit 1
    for update of units skip locked;

    if unit_id is null then
      raise exception 'not_enough_prize_inventory';
    end if;

    update public.draw_slots
    set status = 'opened', opened_at = now()
    where id = slot_id;

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
  values (p_profile_id, 'gacha_opened', p_draw_round_id, open_row.id, jsonb_build_object('quantity', p_quantity, 'cost_coins', total_cost, 'isTest', coalesce(campaign.is_test, false)));

  return jsonb_build_object(
    'status', 'completed',
    'openId', open_row.id,
    'publicCode', open_row.public_code,
    'costCoins', total_cost,
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

revoke all on function public.profile_can_open_test_draw_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_draw_round_inventory_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ensure_draw_round_prize_units(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.profile_can_open_test_draw_round(uuid, uuid) to service_role;
grant execute on function public.get_draw_round_inventory_summary(uuid, uuid) to service_role;
grant execute on function public.ensure_draw_round_prize_units(uuid, integer, uuid, uuid) to service_role;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
