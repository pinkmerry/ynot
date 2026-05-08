-- Phase 1 production foundation for the unified web + LINE platform.
-- Safe local migration artifact only: apply to Supabase after review/backups.

create extension if not exists pgcrypto;
create schema if not exists app_private;

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists profile_status text not null default 'active' check (profile_status in ('active', 'disabled', 'merged')),
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  alter column line_user_id drop not null;

update public.profiles
set
  display_name = coalesce(display_name, line_display_name),
  avatar_url = coalesce(avatar_url, line_picture_url)
where display_name is null
   or avatar_url is null;

create unique index if not exists profiles_auth_user_id_unique_idx
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists profiles_email_lower_idx
  on public.profiles(lower(email))
  where email is not null;

create index if not exists profiles_profile_status_idx
  on public.profiles(profile_status);

create table if not exists public.user_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('email', 'google', 'line')),
  provider_subject text not null,
  email text,
  email_verified boolean not null default false,
  display_name text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (provider, provider_subject),
  unique (profile_id, provider, provider_subject)
);

create index if not exists user_identities_profile_id_idx
  on public.user_identities(profile_id);

create index if not exists user_identities_auth_user_id_idx
  on public.user_identities(auth_user_id)
  where auth_user_id is not null;

insert into public.user_identities (
  profile_id,
  provider,
  provider_subject,
  display_name,
  avatar_url,
  metadata,
  last_seen_at
)
select
  p.id,
  'line',
  p.line_user_id,
  p.line_display_name,
  p.line_picture_url,
  jsonb_build_object('source', 'profiles.line_user_id'),
  p.updated_at
from public.profiles p
where p.line_user_id is not null
on conflict (provider, provider_subject) do update
set
  profile_id = excluded.profile_id,
  display_name = coalesce(excluded.display_name, public.user_identities.display_name),
  avatar_url = coalesce(excluded.avatar_url, public.user_identities.avatar_url),
  metadata = public.user_identities.metadata || excluded.metadata,
  last_seen_at = greatest(
    coalesce(public.user_identities.last_seen_at, '-infinity'::timestamptz),
    coalesce(excluded.last_seen_at, '-infinity'::timestamptz)
  );

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Default',
  recipient_name text,
  phone text,
  address_line1 text not null,
  address_line2 text,
  subdistrict text,
  district text,
  province text,
  postal_code text,
  country text not null default 'Thailand',
  delivery_note text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_addresses_profile_id_idx
  on public.user_addresses(profile_id);

create unique index if not exists user_addresses_one_default_per_profile_idx
  on public.user_addresses(profile_id)
  where is_default;

insert into public.user_addresses (
  profile_id,
  label,
  recipient_name,
  phone,
  address_line1,
  address_line2,
  subdistrict,
  district,
  province,
  postal_code,
  country,
  delivery_note,
  is_default
)
select
  p.id,
  'Default',
  p.full_name,
  p.phone,
  p.address_line1,
  p.address_line2,
  p.subdistrict,
  p.district,
  p.province,
  p.postal_code,
  coalesce(p.country, 'Thailand'),
  p.delivery_note,
  true
from public.profiles p
where p.address_line1 is not null
  and not exists (
    select 1
    from public.user_addresses ua
    where ua.profile_id = p.id
      and ua.is_default
  );

create or replace function app_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.profile_status = 'active'
  limit 1
$$;

create or replace function app_private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users au
    join public.profiles p on p.id = au.profile_id
    where p.auth_user_id = (select auth.uid())
      and p.profile_status = 'active'
      and au.is_active
      and au.role in ('owner', 'admin', 'staff')
  )
$$;

revoke all on function app_private.current_profile_id() from public, anon, authenticated;
revoke all on function app_private.is_active_admin() from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.current_profile_id() to authenticated, service_role;
grant execute on function app_private.is_active_admin() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.user_identities enable row level security;
alter table public.user_addresses enable row level security;

revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (
  preferred_language,
  full_name,
  phone,
  address_line1,
  address_line2,
  subdistrict,
  district,
  province,
  postal_code,
  country,
  delivery_note
) on public.profiles to authenticated;
grant select on public.user_identities to authenticated;
grant select, insert, update, delete on public.user_addresses to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can update their own safe profile fields" on public.profiles;
create policy "Users can update their own safe profile fields"
on public.profiles
for update
to authenticated
using (id = app_private.current_profile_id())
with check (id = app_private.current_profile_id());

drop policy if exists "Users can read their linked identities" on public.user_identities;
create policy "Users can read their linked identities"
on public.user_identities
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read their own addresses" on public.user_addresses;
create policy "Users can read their own addresses"
on public.user_addresses
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can create their own addresses" on public.user_addresses;
create policy "Users can create their own addresses"
on public.user_addresses
for insert
to authenticated
with check (profile_id = app_private.current_profile_id());

drop policy if exists "Users can update their own addresses" on public.user_addresses;
create policy "Users can update their own addresses"
on public.user_addresses
for update
to authenticated
using (profile_id = app_private.current_profile_id())
with check (profile_id = app_private.current_profile_id());

drop policy if exists "Users can delete their own addresses" on public.user_addresses;
create policy "Users can delete their own addresses"
on public.user_addresses
for delete
to authenticated
using (profile_id = app_private.current_profile_id());

drop trigger if exists user_addresses_touch_updated_at on public.user_addresses;
create trigger user_addresses_touch_updated_at
before update on public.user_addresses
for each row execute function app_private.touch_updated_at();

create table if not exists public.app_realtime_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('profile', 'wallet', 'topups', 'gacha', 'collection', 'exchange', 'shipping', 'admin', 'orders', 'payments', 'slots')),
  profile_id uuid references public.profiles(id) on delete cascade,
  draw_round_id uuid references public.draw_rounds(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  admin_only boolean not null default false,
  created_at timestamptz not null default now(),
  check (profile_id is not null or admin_only)
);

create index if not exists app_realtime_events_profile_created_at_idx
  on public.app_realtime_events(profile_id, created_at desc);

create index if not exists app_realtime_events_order_id_idx
  on public.app_realtime_events(order_id)
  where order_id is not null;

alter table public.app_realtime_events enable row level security;
grant select on public.app_realtime_events to authenticated;

drop policy if exists "Users can receive their private app events" on public.app_realtime_events;
create policy "Users can receive their private app events"
on public.app_realtime_events
for select
to authenticated
using (
  (not admin_only and profile_id = app_private.current_profile_id())
  or app_private.is_active_admin()
);

drop policy if exists "Anyone can receive lucky draw refresh events" on public.lucky_draw_realtime_events;
create policy "Anyone can receive public lucky draw refresh events"
on public.lucky_draw_realtime_events
for select
to anon, authenticated
using (
  topic in ('draw', 'slots', 'cards')
  and order_id is null
);

grant select on public.lucky_draw_realtime_events to anon, authenticated;

create or replace function app_private.emit_lucky_draw_realtime_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  public_topic text;
  public_draw_round_id uuid;
  private_topic text;
  private_draw_round_id uuid;
  private_order_id uuid;
  private_profile_id uuid;
  private_entity_type text;
  private_entity_id uuid;
begin
  if tg_table_name = 'draw_rounds' then
    public_topic := 'draw';
    public_draw_round_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'draw_round_prizes' then
    public_topic := 'cards';
    public_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'draw_slots' then
    public_topic := 'slots';
    public_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'orders' then
    private_topic := 'orders';
    private_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
    private_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
    private_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    private_entity_type := 'order';
    private_entity_id := private_order_id;
    public_topic := 'draw';
    public_draw_round_id := private_draw_round_id;
  elsif tg_table_name = 'payment_slips' then
    private_topic := 'payments';
    private_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    private_entity_type := 'payment_slip';
    private_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

    select o.draw_round_id, o.profile_id
    into private_draw_round_id, private_profile_id
    from public.orders o
    where o.id = private_order_id;

    public_topic := 'draw';
    public_draw_round_id := private_draw_round_id;
  elsif tg_table_name = 'order_picks' then
    private_topic := 'slots';
    private_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    private_entity_type := 'order_pick';
    private_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

    select o.draw_round_id, o.profile_id
    into private_draw_round_id, private_profile_id
    from public.orders o
    where o.id = private_order_id;

    public_topic := 'slots';
    public_draw_round_id := private_draw_round_id;
  end if;

  if public_topic is not null and public_draw_round_id is not null then
    insert into public.lucky_draw_realtime_events (topic, draw_round_id, order_id)
    values (public_topic, public_draw_round_id, null);
  end if;

  if private_topic is not null and private_profile_id is not null then
    insert into public.app_realtime_events (
      topic,
      profile_id,
      draw_round_id,
      order_id,
      entity_type,
      entity_id,
      admin_only
    )
    values (
      private_topic,
      private_profile_id,
      private_draw_round_id,
      private_order_id,
      private_entity_type,
      private_entity_id,
      false
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_realtime_events'
    ) then
      alter publication supabase_realtime add table public.app_realtime_events;
    end if;
  end if;
end;
$$;
