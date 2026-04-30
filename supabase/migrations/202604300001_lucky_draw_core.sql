create extension if not exists pgcrypto;

create schema if not exists app_private;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  line_display_name text,
  line_picture_url text,
  preferred_language text not null default 'th' check (preferred_language in ('th', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id)
);

create table if not exists public.draw_rounds (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'closed', 'archived')),
  series text not null check (series in ('one_piece', 'pokemon')),
  title_th text not null,
  title_en text not null,
  price_thb integer not null check (price_thb > 0),
  total_slots integer not null check (total_slots > 0),
  facebook_live_url text,
  youtube_embed_url text,
  promptpay_id text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  starts_at timestamptz,
  created_by uuid references public.admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draw_slots (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  slot_number integer not null check (slot_number >= 1),
  status text not null default 'available' check (status in ('available', 'picked', 'opened', 'void')),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (draw_round_id, slot_number)
);

create sequence if not exists public.order_public_code_seq start with 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('LD-' || nextval('public.order_public_code_seq')::text),
  draw_round_id uuid not null references public.draw_rounds(id),
  profile_id uuid not null references public.profiles(id),
  quantity integer not null check (quantity > 0),
  amount_thb integer not null check (amount_thb > 0),
  status text not null default 'pending_payment_review' check (
    status in (
      'pending_payment_review',
      'payment_rejected',
      'approved_for_pick',
      'picked',
      'opened',
      'cancelled'
    )
  ),
  admin_note text,
  customer_note text,
  approved_by uuid references public.admin_users(id),
  approved_at timestamptz,
  rejected_by uuid references public.admin_users(id),
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_slips (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_provider text not null default 'manual_line' check (storage_provider in ('supabase', 'cloudinary', 'manual_line')),
  file_path text,
  file_url text,
  original_filename text,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references public.admin_users(id),
  reviewed_at timestamptz
);

create table if not exists public.order_picks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  draw_slot_id uuid not null references public.draw_slots(id),
  picked_by_profile_id uuid references public.profiles(id),
  picked_by_admin_id uuid references public.admin_users(id),
  pick_source text not null check (pick_source in ('customer', 'admin', 'system')),
  created_at timestamptz not null default now(),
  unique (draw_slot_id),
  unique (order_id, draw_slot_id),
  check (
    (pick_source = 'customer' and picked_by_profile_id is not null and picked_by_admin_id is null)
    or (pick_source = 'admin' and picked_by_profile_id is null and picked_by_admin_id is not null)
    or (pick_source = 'system')
  )
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id),
  actor_admin_id uuid references public.admin_users(id),
  event_type text not null,
  draw_round_id uuid references public.draw_rounds(id),
  order_id uuid references public.orders(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_line_user_id_idx on public.profiles(line_user_id);
create index if not exists admin_users_profile_id_idx on public.admin_users(profile_id) where is_active;
create index if not exists draw_rounds_status_idx on public.draw_rounds(status);
create index if not exists draw_slots_round_status_idx on public.draw_slots(draw_round_id, status);
create index if not exists orders_round_status_idx on public.orders(draw_round_id, status);
create index if not exists orders_profile_status_idx on public.orders(profile_id, status);
create index if not exists payment_slips_order_id_idx on public.payment_slips(order_id);
create index if not exists order_picks_order_id_idx on public.order_picks(order_id);
create index if not exists audit_events_order_id_idx on public.audit_events(order_id);
create index if not exists audit_events_draw_round_id_idx on public.audit_events(draw_round_id);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function app_private.touch_updated_at();

drop trigger if exists draw_rounds_touch_updated_at on public.draw_rounds;
create trigger draw_rounds_touch_updated_at
before update on public.draw_rounds
for each row execute function app_private.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function app_private.touch_updated_at();

create or replace function public.create_draw_slots(p_draw_round_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  slot_total integer;
  inserted_count integer;
begin
  select total_slots
  into slot_total
  from public.draw_rounds
  where id = p_draw_round_id;

  if slot_total is null then
    raise exception 'draw_round_not_found';
  end if;

  insert into public.draw_slots (draw_round_id, slot_number)
  select p_draw_round_id, generate_series(1, slot_total)
  on conflict (draw_round_id, slot_number) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.claim_order_slots(
  p_order_id uuid,
  p_slot_numbers integer[],
  p_actor_profile_id uuid default null,
  p_actor_admin_id uuid default null
)
returns table(order_id uuid, slot_number integer, pick_source text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_order public.orders%rowtype;
  requested_count integer;
  existing_pick_count integer;
  actor_is_admin boolean;
  source_value text;
  bad_slot_count integer;
begin
  if p_slot_numbers is null or cardinality(p_slot_numbers) = 0 then
    raise exception 'slot_numbers_required';
  end if;

  select count(distinct slot_number)
  into requested_count
  from unnest(p_slot_numbers) as slot_number;

  if requested_count <> cardinality(p_slot_numbers) then
    raise exception 'duplicate_slot_numbers';
  end if;

  select coalesce(exists (
    select 1
    from public.admin_users au
    where au.id = p_actor_admin_id
      and au.is_active
  ), false)
  into actor_is_admin;

  select *
  into locked_order
  from public.orders
  where id = p_order_id
  for update;

  if locked_order.id is null then
    raise exception 'order_not_found';
  end if;

  if locked_order.status not in ('approved_for_pick', 'picked') then
    raise exception 'order_not_approved_for_pick';
  end if;

  if not actor_is_admin and locked_order.profile_id is distinct from p_actor_profile_id then
    raise exception 'not_allowed_to_pick_for_order';
  end if;

  select count(*)
  into bad_slot_count
  from unnest(p_slot_numbers) as requested(slot_number)
  left join public.draw_slots ds
    on ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = requested.slot_number
  where ds.id is null or ds.status in ('opened', 'void');

  if bad_slot_count > 0 then
    raise exception 'invalid_slot_numbers';
  end if;

  perform 1
  from public.draw_slots ds
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers)
  for update;

  if exists (
    select 1
    from public.order_picks op
    join public.draw_slots ds on ds.id = op.draw_slot_id
    where ds.draw_round_id = locked_order.draw_round_id
      and ds.slot_number = any(p_slot_numbers)
      and op.order_id <> locked_order.id
  ) then
    raise exception 'slot_already_picked';
  end if;

  select count(*)
  into existing_pick_count
  from public.order_picks op
  where op.order_id = locked_order.id
    and not exists (
      select 1
      from public.draw_slots ds
      where ds.id = op.draw_slot_id
        and ds.slot_number = any(p_slot_numbers)
    );

  if existing_pick_count + requested_count > locked_order.quantity then
    raise exception 'pick_count_exceeds_order_quantity';
  end if;

  delete from public.order_picks op
  using public.draw_slots ds
  where op.draw_slot_id = ds.id
    and op.order_id = locked_order.id
    and ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number <> all(p_slot_numbers)
    and locked_order.status <> 'opened';

  update public.draw_slots ds
  set status = 'available'
  where ds.draw_round_id = locked_order.draw_round_id
    and not exists (
      select 1
      from public.order_picks op
      where op.draw_slot_id = ds.id
    )
    and ds.status = 'picked';

  source_value := case when actor_is_admin then 'admin' else 'customer' end;

  insert into public.order_picks (
    order_id,
    draw_slot_id,
    picked_by_profile_id,
    picked_by_admin_id,
    pick_source
  )
  select
    locked_order.id,
    ds.id,
    case when source_value = 'customer' then p_actor_profile_id else null end,
    case when source_value = 'admin' then p_actor_admin_id else null end,
    source_value
  from public.draw_slots ds
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers)
  on conflict (order_id, draw_slot_id) do nothing;

  update public.draw_slots ds
  set status = 'picked'
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers);

  update public.orders o
  set status = case
      when (
        select count(*)
        from public.order_picks op
        where op.order_id = locked_order.id
      ) = locked_order.quantity then 'picked'
      else 'approved_for_pick'
    end
  where o.id = locked_order.id;

  insert into public.audit_events (
    actor_profile_id,
    actor_admin_id,
    event_type,
    draw_round_id,
    order_id,
    metadata
  )
  values (
    case when source_value = 'customer' then p_actor_profile_id else null end,
    case when source_value = 'admin' then p_actor_admin_id else null end,
    'slot_picked',
    locked_order.draw_round_id,
    locked_order.id,
    jsonb_build_object('slot_numbers', p_slot_numbers, 'source', source_value)
  );

  return query
  select op.order_id, ds.slot_number, op.pick_source
  from public.order_picks op
  join public.draw_slots ds on ds.id = op.draw_slot_id
  where op.order_id = locked_order.id
  order by ds.slot_number;
end;
$$;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.draw_rounds enable row level security;
alter table public.draw_slots enable row level security;
alter table public.orders enable row level security;
alter table public.payment_slips enable row level security;
alter table public.order_picks enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Anyone can read live draw rounds" on public.draw_rounds;
create policy "Anyone can read live draw rounds"
on public.draw_rounds
for select
to anon, authenticated
using (status = 'live');

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
  )
);

revoke all on function public.create_draw_slots(uuid) from public, anon, authenticated;
revoke all on function public.claim_order_slots(uuid, integer[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_draw_slots(uuid) to service_role;
grant execute on function public.claim_order_slots(uuid, integer[], uuid, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-slips',
  'payment-slips',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draw_rounds'
    ) then
      alter publication supabase_realtime add table public.draw_rounds;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draw_slots'
    ) then
      alter publication supabase_realtime add table public.draw_slots;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_picks'
    ) then
      alter publication supabase_realtime add table public.order_picks;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_slips'
    ) then
      alter publication supabase_realtime add table public.payment_slips;
    end if;
  end if;
end;
$$;
