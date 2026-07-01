-- Slice 1 Marketplace foundation.
--
-- This migration creates the minimum service-owned bridge and guardrail schema
-- needed before marketplace UI, checkout, seller intake, or admin queues are
-- allowed to launch.

create extension if not exists pgcrypto;

create or replace function public.marketplace_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.marketplace_audit_events_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'marketplace_audit_events_append_only';
end;
$$;

create table if not exists public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  ynot_profile_id uuid not null,
  profile_status_snapshot text not null default 'active'
    check (profile_status_snapshot in ('active', 'disabled', 'merged', 'blocked')),
  display_name_snapshot text,
  avatar_url_snapshot text,
  auth_source_snapshot text not null default 'supabase'
    check (auth_source_snapshot in ('supabase', 'line')),
  buyer_status text not null default 'active'
    check (buyer_status in ('active', 'blocked')),
  seller_status text not null default 'none'
    check (seller_status in ('none', 'pending_terms', 'pending_review', 'active', 'suspended')),
  payout_status text not null default 'not_started'
    check (payout_status in ('not_started', 'pending_provider', 'verified', 'on_hold', 'blocked')),
  seller_terms_version text,
  seller_terms_accepted_at timestamptz,
  buyer_terms_version text,
  buyer_terms_accepted_at timestamptz,
  last_profile_verified_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_accounts_ynot_profile_unique unique (ynot_profile_id),
  check (
    (seller_terms_version is null and seller_terms_accepted_at is null)
    or (seller_terms_version is not null and seller_terms_accepted_at is not null)
  ),
  check (
    (buyer_terms_version is null and buyer_terms_accepted_at is null)
    or (buyer_terms_version is not null and buyer_terms_accepted_at is not null)
  )
);

create table if not exists public.marketplace_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete cascade,
  ynot_profile_id uuid not null,
  scope text not null check (length(scope) between 3 and 80),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_hash text not null check (length(request_hash) between 16 and 200),
  response_payload jsonb,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ynot_profile_id, scope, idempotency_key)
);

create table if not exists public.marketplace_audit_events (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  ynot_profile_id uuid,
  actor_ynot_profile_id uuid,
  actor_admin_role text check (actor_admin_role in ('owner', 'admin', 'staff')),
  event_type text not null check (length(event_type) between 3 and 120),
  event_payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_inventory_sources (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('official_stock', 'seller_consignment', 'marketplace_purchase')),
  source_state text not null default 'draft'
    check (source_state in ('draft', 'approved', 'locked', 'archived')),
  source_payload jsonb not null default '{}'::jsonb,
  created_by_ynot_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, source_kind)
);

create table if not exists public.marketplace_inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_marketplace_account_id uuid references public.marketplace_accounts(id) on delete restrict,
  inventory_source_id uuid not null,
  source_kind text not null check (source_kind in ('official_stock', 'seller_consignment', 'marketplace_purchase')),
  item_type text not null default 'card'
    check (item_type in ('card', 'sealed_box', 'sealed_pack')),
  item_state text not null default 'draft'
    check (item_state in ('draft', 'intake_pending', 'received', 'inspection_passed', 'inspection_failed', 'listed', 'sold', 'archived')),
  title_snapshot text not null check (length(title_snapshot) between 1 and 240),
  reference_snapshot jsonb not null default '{}'::jsonb,
  created_by_ynot_profile_id uuid,
  inspected_by_ynot_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_inventory_items_source_fk
    foreign key (inventory_source_id, source_kind)
    references public.marketplace_inventory_sources(id, source_kind)
    on delete restrict,
  unique (inventory_source_id)
);

create table if not exists public.marketplace_listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique default gen_random_uuid(),
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  seller_marketplace_account_id uuid references public.marketplace_accounts(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  listing_state text not null default 'draft'
    check (listing_state in ('draft', 'active', 'hidden', 'pending_payment', 'sold', 'archived')),
  public_slug text unique,
  title text not null check (length(title) between 1 and 240),
  item_price_satang integer not null check (item_price_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  snapshot_payload jsonb not null default '{}'::jsonb,
  snapshot_version integer not null default 1 check (snapshot_version > 0),
  visible_from timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_accounts_ynot_profile_idx
  on public.marketplace_accounts(ynot_profile_id);
create index if not exists marketplace_accounts_capability_idx
  on public.marketplace_accounts(buyer_status, seller_status, payout_status);
create index if not exists marketplace_idempotency_expiry_idx
  on public.marketplace_idempotency_keys(expires_at);
create index if not exists marketplace_idempotency_account_idx
  on public.marketplace_idempotency_keys(marketplace_account_id, scope, idempotency_key);
create index if not exists marketplace_audit_events_profile_time_idx
  on public.marketplace_audit_events(ynot_profile_id, created_at desc);
create index if not exists marketplace_audit_events_type_time_idx
  on public.marketplace_audit_events(event_type, created_at desc);
create index if not exists marketplace_inventory_sources_kind_state_idx
  on public.marketplace_inventory_sources(source_kind, source_state, updated_at desc);
create index if not exists marketplace_inventory_items_source_idx
  on public.marketplace_inventory_items(source_kind, inventory_source_id);
create index if not exists marketplace_inventory_items_owner_state_idx
  on public.marketplace_inventory_items(owner_marketplace_account_id, item_state, updated_at desc);
create index if not exists marketplace_listing_snapshots_state_idx
  on public.marketplace_listing_snapshots(listing_state, updated_at desc);
create index if not exists marketplace_listing_snapshots_inventory_idx
  on public.marketplace_listing_snapshots(inventory_item_id);
create unique index if not exists marketplace_listing_snapshots_one_open_per_inventory_idx
  on public.marketplace_listing_snapshots(inventory_item_id)
  where listing_state in ('active', 'pending_payment');

drop trigger if exists marketplace_accounts_touch_updated_at on public.marketplace_accounts;
create trigger marketplace_accounts_touch_updated_at
before update on public.marketplace_accounts
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_idempotency_keys_touch_updated_at on public.marketplace_idempotency_keys;
create trigger marketplace_idempotency_keys_touch_updated_at
before update on public.marketplace_idempotency_keys
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_inventory_items_touch_updated_at on public.marketplace_inventory_items;
create trigger marketplace_inventory_items_touch_updated_at
before update on public.marketplace_inventory_items
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_inventory_sources_touch_updated_at on public.marketplace_inventory_sources;
create trigger marketplace_inventory_sources_touch_updated_at
before update on public.marketplace_inventory_sources
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_listing_snapshots_touch_updated_at on public.marketplace_listing_snapshots;
create trigger marketplace_listing_snapshots_touch_updated_at
before update on public.marketplace_listing_snapshots
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_audit_events_no_update on public.marketplace_audit_events;
create trigger marketplace_audit_events_no_update
before update on public.marketplace_audit_events
for each row execute function public.marketplace_audit_events_append_only();

drop trigger if exists marketplace_audit_events_no_delete on public.marketplace_audit_events;
create trigger marketplace_audit_events_no_delete
before delete on public.marketplace_audit_events
for each row execute function public.marketplace_audit_events_append_only();

alter table public.marketplace_accounts enable row level security;
alter table public.marketplace_idempotency_keys enable row level security;
alter table public.marketplace_audit_events enable row level security;
alter table public.marketplace_inventory_sources enable row level security;
alter table public.marketplace_inventory_items enable row level security;
alter table public.marketplace_listing_snapshots enable row level security;

revoke all on
  public.marketplace_accounts,
  public.marketplace_idempotency_keys,
  public.marketplace_audit_events,
  public.marketplace_inventory_sources,
  public.marketplace_inventory_items,
  public.marketplace_listing_snapshots
from public, anon, authenticated;

grant all on
  public.marketplace_accounts,
  public.marketplace_idempotency_keys,
  public.marketplace_audit_events,
  public.marketplace_inventory_sources,
  public.marketplace_inventory_items,
  public.marketplace_listing_snapshots
to service_role;

create or replace function public.marketplace_account_response(
  p_account public.marketplace_accounts
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_account.id,
    'buyerStatus', p_account.buyer_status,
    'sellerStatus', p_account.seller_status,
    'payoutStatus', p_account.payout_status,
    'sellerTermsVersion', p_account.seller_terms_version,
    'sellerTermsAcceptedAt', p_account.seller_terms_accepted_at,
    'buyerTermsVersion', p_account.buyer_terms_version,
    'buyerTermsAcceptedAt', p_account.buyer_terms_accepted_at,
    'lastProfileVerifiedAt', p_account.last_profile_verified_at,
    'lastSeenAt', p_account.last_seen_at,
    'createdAt', p_account.created_at,
    'updatedAt', p_account.updated_at,
    'capabilities', jsonb_build_object(
      'canBrowse', true,
      'canCheckout', p_account.buyer_status = 'active',
      'canSell', p_account.seller_status = 'active',
      'canAcceptSellerTerms', p_account.seller_status in ('none', 'pending_terms'),
      'canReceivePayout', p_account.payout_status = 'verified'
    )
  );
$$;

create or replace function public.marketplace_get_or_create_account(
  p_ynot_profile_id uuid,
  p_display_name text default null,
  p_avatar_url text default null,
  p_auth_source text default 'supabase',
  p_profile_status text default 'active',
  p_request_id text default null,
  p_actor_ynot_profile_id uuid default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_row public.marketplace_accounts%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_auth_source text := coalesce(nullif(p_auth_source, ''), 'supabase');
  normalized_profile_status text := coalesce(nullif(p_profile_status, ''), 'active');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_ynot_profile_id is null then
    raise exception 'ynot_profile_required';
  end if;
  if normalized_profile_status <> 'active' then
    raise exception 'marketplace_profile_not_active';
  end if;
  if normalized_auth_source not in ('supabase', 'line') then
    raise exception 'marketplace_auth_source_invalid';
  end if;
  if normalized_idempotency_key is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null then
    raise exception 'marketplace_request_hash_required';
  end if;
  if length(normalized_idempotency_key) < 8 or length(normalized_idempotency_key) > 200 then
    raise exception 'marketplace_idempotency_key_invalid';
  end if;
  if length(normalized_request_hash) < 16 or length(normalized_request_hash) > 200 then
    raise exception 'marketplace_request_hash_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_ynot_profile_id,
    'account.ensure',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select *
    into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_ynot_profile_id
      and scope = 'account.ensure'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;

    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  insert into public.marketplace_accounts(
    ynot_profile_id,
    profile_status_snapshot,
    display_name_snapshot,
    avatar_url_snapshot,
    auth_source_snapshot,
    last_profile_verified_at,
    last_seen_at,
    metadata
  ) values (
    p_ynot_profile_id,
    normalized_profile_status,
    nullif(p_display_name, ''),
    nullif(p_avatar_url, ''),
    normalized_auth_source,
    now(),
    now(),
    jsonb_build_object('created_by', 'marketplace_get_or_create_account')
  )
  on conflict (ynot_profile_id) do update
  set
    profile_status_snapshot = excluded.profile_status_snapshot,
    display_name_snapshot = excluded.display_name_snapshot,
    avatar_url_snapshot = excluded.avatar_url_snapshot,
    auth_source_snapshot = excluded.auth_source_snapshot,
    last_profile_verified_at = now(),
    last_seen_at = now(),
    metadata = public.marketplace_accounts.metadata || jsonb_build_object('last_bridge_sync', now())
  returning * into account_row;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    account_row.id,
    account_row.ynot_profile_id,
    coalesce(p_actor_ynot_profile_id, account_row.ynot_profile_id),
    'marketplace_account_ensured',
    jsonb_build_object(
      'authSource', normalized_auth_source,
      'profileStatus', normalized_profile_status
    ),
    p_request_id
  );

  rpc_response_payload := public.marketplace_account_response(account_row);

  update public.marketplace_idempotency_keys
  set
    marketplace_account_id = account_row.id,
    response_payload = rpc_response_payload,
    locked_at = now(),
    expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_accept_seller_terms(
  p_marketplace_account_id uuid,
  p_ynot_profile_id uuid,
  p_terms_version text,
  p_request_id text default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_row public.marketplace_accounts%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_terms_version text := nullif(trim(coalesce(p_terms_version, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_marketplace_account_id is null or p_ynot_profile_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if normalized_terms_version is null then
    raise exception 'marketplace_seller_terms_version_required';
  end if;
  if normalized_idempotency_key is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null then
    raise exception 'marketplace_request_hash_required';
  end if;
  if length(normalized_idempotency_key) < 8 or length(normalized_idempotency_key) > 200 then
    raise exception 'marketplace_idempotency_key_invalid';
  end if;
  if length(normalized_request_hash) < 16 or length(normalized_request_hash) > 200 then
    raise exception 'marketplace_request_hash_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_marketplace_account_id,
    p_ynot_profile_id,
    'seller_terms.accept',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select *
    into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_ynot_profile_id
      and scope = 'seller_terms.accept'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;

    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  update public.marketplace_accounts
  set
    seller_status = case
      when seller_status in ('none', 'pending_terms') then 'pending_review'
      else seller_status
    end,
    seller_terms_version = normalized_terms_version,
    seller_terms_accepted_at = now(),
    last_seen_at = now(),
    last_profile_verified_at = now()
  where id = p_marketplace_account_id
    and ynot_profile_id = p_ynot_profile_id
    and profile_status_snapshot = 'active'
  returning * into account_row;

  if account_row.id is null then
    raise exception 'marketplace_account_not_found';
  end if;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    account_row.id,
    account_row.ynot_profile_id,
    account_row.ynot_profile_id,
    'marketplace_seller_terms_accepted',
    jsonb_build_object('termsVersion', normalized_terms_version),
    p_request_id
  );

  rpc_response_payload := public.marketplace_account_response(account_row);

  update public.marketplace_idempotency_keys
  set
    marketplace_account_id = account_row.id,
    response_payload = rpc_response_payload,
    locked_at = now(),
    expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_account_response(public.marketplace_accounts)
from public, anon, authenticated;
revoke all on function public.marketplace_get_or_create_account(uuid, text, text, text, text, text, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_accept_seller_terms(uuid, uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_account_response(public.marketplace_accounts)
to service_role;
grant execute on function public.marketplace_get_or_create_account(uuid, text, text, text, text, text, uuid, text, text)
to service_role;
grant execute on function public.marketplace_accept_seller_terms(uuid, uuid, text, text, text, text)
to service_role;
