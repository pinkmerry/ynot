-- Slice 2 Marketplace official shop functional path.
--
-- Additive-only rollback posture:
-- - Disable public browse/checkout through marketplace feature flags.
-- - Hide official listings by moving listing_state to hidden/archived.
-- - Keep orders, money snapshots, audit, refund, and reconciliation rows for
--   fulfilment/accounting history. Do not delete money records as rollback.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'marketplace-payment-proofs',
  'marketplace-payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.marketplace_inventory_sources
  add column if not exists source_reference_id text,
  add column if not exists procurement_note text,
  add column if not exists private_admin_note text;

alter table public.marketplace_inventory_items
  add column if not exists seller_type text not null default 'user_seller'
    check (seller_type in ('official_shop', 'user_seller')),
  add column if not exists condition_code text,
  add column if not exists quantity_total integer not null default 1
    check (quantity_total > 0),
  add column if not exists quantity_available integer not null default 1
    check (quantity_available >= 0),
  add column if not exists item_price_satang integer not null default 0
    check (item_price_satang >= 0),
  add column if not exists currency text not null default 'THB'
    check (currency = 'THB'),
  add column if not exists public_description text,
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists admin_note text,
  add column if not exists seller_payout_state text not null default 'not_applicable'
    check (seller_payout_state in ('not_applicable', 'pending', 'held', 'eligible', 'released', 'paid')),
  add column if not exists version bigint not null default 1,
  add constraint marketplace_inventory_quantity_available_lte_total
    check (quantity_available <= quantity_total),
  add constraint marketplace_official_inventory_source_kind_check
    check (
      seller_type <> 'official_shop'
      or (
        source_kind = 'official_stock'
        and seller_payout_state = 'not_applicable'
        and owner_marketplace_account_id is null
      )
    );

alter table public.marketplace_listing_snapshots
  add column if not exists quantity_available_snapshot integer not null default 0,
  add column if not exists public_description text,
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists seller_payout_state text not null default 'not_applicable'
    check (seller_payout_state in ('not_applicable', 'pending', 'held', 'eligible', 'released', 'paid'));

create table if not exists public.marketplace_pending_payment_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  order_state text not null default 'pending_payment'
    check (order_state in ('pending_payment', 'payment_submitted', 'paid', 'expired', 'cancelled', 'converted')),
  quantity integer not null default 1 check (quantity > 0),
  item_price_satang integer not null check (item_price_satang >= 0),
  shipping_fee_satang integer not null check (shipping_fee_satang >= 0),
  buyer_service_fee_satang integer not null check (buyer_service_fee_satang >= 0),
  buyer_total_satang integer not null check (buyer_total_satang >= 0),
  seller_payout_satang integer not null default 0 check (seller_payout_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  shipping_snapshot jsonb not null default '{}'::jsonb,
  money_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  request_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_marketplace_account_id, idempotency_key),
  check (
    listing_source <> 'official_shop'
    or seller_payout_satang = 0
  )
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  pending_payment_order_id uuid not null unique references public.marketplace_pending_payment_orders(id) on delete restrict,
  listing_id uuid not null,
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  payment_state text not null default 'pending_payment'
    check (payment_state in ('pending_payment', 'payment_submitted', 'paid', 'failed', 'refunded')),
  fulfilment_state text not null default 'unfulfilled'
    check (fulfilment_state in ('unfulfilled', 'packed', 'shipped', 'completed', 'cancelled', 'refunded')),
  refund_state text not null default 'none'
    check (refund_state in ('none', 'requested', 'approved', 'rejected', 'refunded')),
  item_price_satang integer not null check (item_price_satang >= 0),
  shipping_fee_satang integer not null check (shipping_fee_satang >= 0),
  buyer_service_fee_satang integer not null check (buyer_service_fee_satang >= 0),
  buyer_total_satang integer not null check (buyer_total_satang >= 0),
  seller_payout_satang integer not null default 0 check (seller_payout_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  shipping_snapshot jsonb not null default '{}'::jsonb,
  money_snapshot jsonb not null default '{}'::jsonb,
  fulfilment_snapshot jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    listing_source <> 'official_shop'
    or seller_payout_satang = 0
  )
);

create table if not exists public.marketplace_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  pending_payment_order_id uuid not null references public.marketplace_pending_payment_orders(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  verification_status text not null
    check (
      verification_status in (
        'submitted',
        'valid',
        'manual_review',
        'provider_error',
        'amount_mismatch',
        'receiver_mismatch',
        'date_mismatch',
        'not_found',
        'fraud',
        'duplicate',
        'rejected'
      )
    ),
  provider text not null default 'slip2go',
  provider_code text,
  provider_message text,
  provider_response jsonb not null default '{}'::jsonb,
  provider_reference_id text,
  decoded_qr_hash text,
  file_sha256 text not null check (length(file_sha256) = 64),
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  proof_storage_path text not null check (length(proof_storage_path) between 8 and 500),
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  refund_state text not null default 'requested'
    check (refund_state in ('requested', 'approved', 'rejected', 'refunded')),
  reason_code text not null check (length(reason_code) between 3 and 80),
  admin_note text not null check (length(admin_note) between 3 and 2000),
  refund_amount_satang integer not null check (refund_amount_satang >= 0),
  actor_ynot_profile_id uuid not null,
  actor_admin_role text not null check (actor_admin_role in ('owner', 'admin', 'staff')),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.marketplace_orders(id) on delete restrict,
  reconciliation_state text not null default 'open'
    check (reconciliation_state in ('open', 'resolved', 'cancelled')),
  reason_code text not null check (length(reason_code) between 3 and 80),
  reconciliation_payload jsonb not null default '{}'::jsonb,
  actor_ynot_profile_id uuid,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.marketplace_public_listing_snapshots
with (security_invoker = true)
as
select
  listing_id,
  inventory_item_id,
  listing_source,
  listing_state,
  public_slug,
  title,
  item_price_satang,
  currency,
  quantity_available_snapshot,
  public_description,
  photo_urls,
  snapshot_payload - 'privateAdminNote' - 'procurementNote' - 'sellerPayoutState' as snapshot_payload,
  snapshot_version,
  visible_from,
  updated_at
from public.marketplace_listing_snapshots
where listing_state = 'active';

create index if not exists marketplace_inventory_official_admin_idx
  on public.marketplace_inventory_items(seller_type, item_state, updated_at desc);
create index if not exists marketplace_inventory_official_source_ref_idx
  on public.marketplace_inventory_sources(source_kind, source_reference_id);
create index if not exists marketplace_inventory_official_price_idx
  on public.marketplace_inventory_items(seller_type, item_state, item_price_satang);
create index if not exists marketplace_listing_official_active_idx
  on public.marketplace_listing_snapshots(visible_from desc, listing_id)
  where listing_source = 'official_shop' and listing_state = 'active';
create index if not exists marketplace_listing_browse_idx
  on public.marketplace_listing_snapshots(listing_source, listing_state, item_price_satang, updated_at desc);
create index if not exists marketplace_pending_orders_state_expiry_idx
  on public.marketplace_pending_payment_orders(order_state, expires_at);
create index if not exists marketplace_pending_orders_buyer_state_idx
  on public.marketplace_pending_payment_orders(buyer_marketplace_account_id, order_state, updated_at desc);
create index if not exists marketplace_orders_buyer_time_idx
  on public.marketplace_orders(buyer_marketplace_account_id, created_at desc);
create index if not exists marketplace_orders_admin_state_idx
  on public.marketplace_orders(listing_source, payment_state, fulfilment_state, updated_at desc);
create index if not exists marketplace_payment_proofs_pending_status_idx
  on public.marketplace_payment_proofs(pending_payment_order_id, verification_status, created_at desc);
create index if not exists marketplace_payment_proofs_order_idx
  on public.marketplace_payment_proofs(order_id, created_at desc);
create index if not exists marketplace_payment_proofs_reference_idx
  on public.marketplace_payment_proofs(provider_reference_id)
  where provider_reference_id is not null;
create index if not exists marketplace_payment_proofs_decoded_qr_idx
  on public.marketplace_payment_proofs(decoded_qr_hash)
  where decoded_qr_hash is not null;
create index if not exists marketplace_payment_proofs_file_sha_idx
  on public.marketplace_payment_proofs(file_sha256);
create index if not exists marketplace_refund_requests_state_idx
  on public.marketplace_refund_requests(refund_state, updated_at desc);
create index if not exists marketplace_reconciliation_items_state_idx
  on public.marketplace_reconciliation_items(reconciliation_state, updated_at desc);

create or replace function public.marketplace_payment_proofs_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'marketplace_payment_proofs_append_only';
end;
$$;

drop trigger if exists marketplace_pending_payment_orders_touch_updated_at on public.marketplace_pending_payment_orders;
create trigger marketplace_pending_payment_orders_touch_updated_at
before update on public.marketplace_pending_payment_orders
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_orders_touch_updated_at on public.marketplace_orders;
create trigger marketplace_orders_touch_updated_at
before update on public.marketplace_orders
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_payment_proofs_append_only on public.marketplace_payment_proofs;
create trigger marketplace_payment_proofs_append_only
before update or delete on public.marketplace_payment_proofs
for each row execute function public.marketplace_payment_proofs_append_only();

drop trigger if exists marketplace_refund_requests_touch_updated_at on public.marketplace_refund_requests;
create trigger marketplace_refund_requests_touch_updated_at
before update on public.marketplace_refund_requests
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_reconciliation_items_touch_updated_at on public.marketplace_reconciliation_items;
create trigger marketplace_reconciliation_items_touch_updated_at
before update on public.marketplace_reconciliation_items
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_pending_payment_orders enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_payment_proofs enable row level security;
alter table public.marketplace_refund_requests enable row level security;
alter table public.marketplace_reconciliation_items enable row level security;

revoke all on
  public.marketplace_pending_payment_orders,
  public.marketplace_orders,
  public.marketplace_payment_proofs,
  public.marketplace_refund_requests,
  public.marketplace_reconciliation_items
from public, anon, authenticated;

revoke all on public.marketplace_public_listing_snapshots
from public, anon, authenticated;

grant all on
  public.marketplace_pending_payment_orders,
  public.marketplace_orders,
  public.marketplace_payment_proofs,
  public.marketplace_refund_requests,
  public.marketplace_reconciliation_items
to service_role;

grant select on public.marketplace_public_listing_snapshots to service_role;

create or replace function public.marketplace_create_official_inventory(
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_item_type text,
  p_title text,
  p_condition_code text,
  p_quantity_total integer,
  p_item_price_satang integer,
  p_public_description text default null,
  p_photo_urls jsonb default '[]'::jsonb,
  p_reference_snapshot jsonb default '{}'::jsonb,
  p_source_reference_id text default null,
  p_procurement_note text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  source_row public.marketplace_inventory_sources%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_title text := nullif(trim(coalesce(p_title, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;
  if p_item_type not in ('card', 'sealed_box', 'sealed_pack') then
    raise exception 'marketplace_item_type_invalid';
  end if;
  if normalized_title is null then
    raise exception 'marketplace_title_required';
  end if;
  if p_quantity_total is null or p_quantity_total < 1 then
    raise exception 'marketplace_quantity_invalid';
  end if;
  if p_item_price_satang is null or p_item_price_satang <= 0 then
    raise exception 'marketplace_price_invalid';
  end if;
  if coalesce(p_reference_snapshot, '{}'::jsonb)::text ~* '(customer_bag|gacha|reward|draw)' then
    raise exception 'marketplace_official_stock_only';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'official_inventory.create',
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
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_inventory.create'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  insert into public.marketplace_inventory_sources(
    source_kind,
    source_state,
    source_reference_id,
    source_payload,
    procurement_note,
    private_admin_note,
    created_by_ynot_profile_id
  ) values (
    'official_stock',
    'draft',
    nullif(trim(coalesce(p_source_reference_id, '')), ''),
    jsonb_build_object('officialSource', true),
    nullif(trim(coalesce(p_procurement_note, '')), ''),
    nullif(trim(coalesce(p_admin_note, '')), ''),
    p_admin_profile_id
  )
  returning * into source_row;

  insert into public.marketplace_inventory_items(
    inventory_source_id,
    source_kind,
    seller_type,
    item_type,
    item_state,
    title_snapshot,
    condition_code,
    reference_snapshot,
    quantity_total,
    quantity_available,
    item_price_satang,
    currency,
    public_description,
    photo_urls,
    admin_note,
    seller_payout_state,
    created_by_ynot_profile_id
  ) values (
    source_row.id,
    'official_stock',
    'official_shop',
    p_item_type,
    'draft',
    normalized_title,
    nullif(trim(coalesce(p_condition_code, '')), ''),
    coalesce(p_reference_snapshot, '{}'::jsonb),
    p_quantity_total,
    p_quantity_total,
    p_item_price_satang,
    'THB',
    nullif(trim(coalesce(p_public_description, '')), ''),
    coalesce(p_photo_urls, '[]'::jsonb),
    nullif(trim(coalesce(p_admin_note, '')), ''),
    'not_applicable',
    p_admin_profile_id
  )
  returning * into inventory_row;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_inventory_created',
    jsonb_build_object(
      'inventoryItemId', inventory_row.id,
      'sourceKind', 'official_stock',
      'sellerType', 'official_shop'
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'inventoryId', inventory_row.id,
    'sourceId', source_row.id,
    'itemState', inventory_row.item_state,
    'sellerType', inventory_row.seller_type,
    'sourceKind', inventory_row.source_kind,
    'quantityAvailable', inventory_row.quantity_available,
    'currency', inventory_row.currency
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_publish_official_listing(
  p_inventory_item_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'official_listing.publish', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_listing.publish'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = p_inventory_item_id
    and seller_type = 'official_shop'
    and source_kind = 'official_stock'
  for update;

  if inventory_row.id is null then
    raise exception 'marketplace_inventory_not_found';
  end if;
  if inventory_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if inventory_row.item_state not in ('draft', 'inspection_passed', 'listed') then
    raise exception 'marketplace_inventory_state_invalid';
  end if;
  if inventory_row.quantity_available < 1
    or inventory_row.item_price_satang <= 0
    or jsonb_array_length(coalesce(inventory_row.photo_urls, '[]'::jsonb)) < 1 then
    raise exception 'marketplace_inventory_not_publishable';
  end if;

  update public.marketplace_inventory_sources
  set source_state = 'approved'
  where id = inventory_row.inventory_source_id
    and source_kind = 'official_stock';

  insert into public.marketplace_listing_snapshots(
    inventory_item_id,
    seller_marketplace_account_id,
    listing_source,
    listing_state,
    public_slug,
    title,
    item_price_satang,
    currency,
    quantity_available_snapshot,
    public_description,
    photo_urls,
    seller_payout_state,
    snapshot_payload,
    snapshot_version,
    visible_from
  ) values (
    inventory_row.id,
    null,
    'official_shop',
    'active',
    'official-' || replace(inventory_row.id::text, '-', ''),
    inventory_row.title_snapshot,
    inventory_row.item_price_satang,
    'THB',
    inventory_row.quantity_available,
    inventory_row.public_description,
    inventory_row.photo_urls,
    'not_applicable',
    jsonb_build_object(
      'sourceBadge', 'Official shop',
      'itemType', inventory_row.item_type,
      'conditionCode', inventory_row.condition_code,
      'sourceKind', 'official_stock'
    ),
    inventory_row.version,
    now()
  )
  on conflict (inventory_item_id) where listing_state in ('active', 'pending_payment')
  do update set
    listing_state = 'active',
    title = excluded.title,
    item_price_satang = excluded.item_price_satang,
    quantity_available_snapshot = excluded.quantity_available_snapshot,
    public_description = excluded.public_description,
    photo_urls = excluded.photo_urls,
    snapshot_payload = excluded.snapshot_payload,
    snapshot_version = public.marketplace_listing_snapshots.snapshot_version + 1,
    visible_from = coalesce(public.marketplace_listing_snapshots.visible_from, now())
  returning * into listing_row;

  update public.marketplace_inventory_items
  set item_state = 'listed',
      version = version + 1
  where id = inventory_row.id;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_listing_published',
    jsonb_build_object('inventoryItemId', inventory_row.id, 'listingId', listing_row.listing_id),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'listingId', listing_row.listing_id,
    'inventoryId', inventory_row.id,
    'listingState', listing_row.listing_state,
    'sourceBadge', 'Official shop',
    'currency', 'THB'
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_create_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer);

create or replace function public.marketplace_create_pending_payment_order(
  p_listing_id uuid,
  p_buyer_marketplace_account_id uuid,
  p_buyer_ynot_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_quantity integer default 1,
  p_shipping_fee_satang integer default 15000,
  p_buyer_service_fee_bps integer default 1000,
  p_shipping_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  pending_row public.marketplace_pending_payment_orders%rowtype;
  order_row public.marketplace_orders%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  service_fee_satang integer;
  total_satang integer;
  rpc_response_payload jsonb;
begin
  if p_buyer_marketplace_account_id is null or p_buyer_ynot_profile_id is null then
    raise exception 'marketplace_login_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if p_quantity is null or p_quantity <> 1 then
    raise exception 'marketplace_quantity_invalid';
  end if;
  if p_shipping_fee_satang is null or p_shipping_fee_satang < 0 then
    raise exception 'marketplace_shipping_fee_invalid';
  end if;
  if p_shipping_snapshot is null or jsonb_typeof(p_shipping_snapshot) <> 'object' then
    raise exception 'marketplace_shipping_snapshot_invalid';
  end if;
  if p_buyer_service_fee_bps is null or p_buyer_service_fee_bps < 0 or p_buyer_service_fee_bps > 10000 then
    raise exception 'marketplace_fee_invalid';
  end if;
  if not exists (
    select 1
    from public.marketplace_accounts account
    where account.id = p_buyer_marketplace_account_id
      and account.ynot_profile_id = p_buyer_ynot_profile_id
      and account.profile_status_snapshot = 'active'
      and account.buyer_status = 'active'
  ) then
    raise exception 'marketplace_account_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id, ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_buyer_marketplace_account_id, p_buyer_ynot_profile_id, 'pending_order.create',
    normalized_idempotency_key, normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_buyer_ynot_profile_id
      and scope = 'pending_order.create'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = p_listing_id
    and listing_source = 'official_shop'
    and listing_state = 'active'
  for update;

  if listing_row.id is null then
    raise exception 'marketplace_listing_not_available';
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = listing_row.inventory_item_id
    and seller_type = 'official_shop'
    and source_kind = 'official_stock'
  for update;

  if inventory_row.id is null or inventory_row.quantity_available < p_quantity then
    raise exception 'marketplace_listing_not_available';
  end if;

  service_fee_satang := floor((inventory_row.item_price_satang * p_buyer_service_fee_bps)::numeric / 10000)::integer;
  total_satang := inventory_row.item_price_satang + p_shipping_fee_satang + service_fee_satang;

  update public.marketplace_inventory_items
  set quantity_available = quantity_available - p_quantity,
      item_state = case when quantity_available - p_quantity = 0 then 'sold' else item_state end,
      version = version + 1
  where id = inventory_row.id;

  update public.marketplace_listing_snapshots
  set quantity_available_snapshot = greatest(quantity_available_snapshot - p_quantity, 0),
      listing_state = case when quantity_available_snapshot - p_quantity = 0 then 'pending_payment' else listing_state end
  where id = listing_row.id;

  insert into public.marketplace_pending_payment_orders(
    listing_id,
    inventory_item_id,
    buyer_marketplace_account_id,
    listing_source,
    quantity,
    item_price_satang,
    shipping_fee_satang,
    buyer_service_fee_satang,
    buyer_total_satang,
    seller_payout_satang,
    currency,
    shipping_snapshot,
    money_snapshot,
    request_id,
    idempotency_key
  ) values (
    listing_row.listing_id,
    inventory_row.id,
    p_buyer_marketplace_account_id,
    'official_shop',
    p_quantity,
    inventory_row.item_price_satang,
    p_shipping_fee_satang,
    service_fee_satang,
    total_satang,
    0,
    'THB',
    p_shipping_snapshot,
    jsonb_build_object(
      'currency', 'THB',
      'itemPriceSatang', inventory_row.item_price_satang,
      'shippingFeeSatang', p_shipping_fee_satang,
      'buyerServiceFeeSatang', service_fee_satang,
      'buyerTotalSatang', total_satang,
      'sellerPayoutSatang', 0,
      'sellerPayoutState', 'not_applicable'
    ),
    p_request_id,
    normalized_idempotency_key
  )
  returning * into pending_row;

  insert into public.marketplace_orders(
    pending_payment_order_id,
    listing_id,
    inventory_item_id,
    buyer_marketplace_account_id,
    listing_source,
    payment_state,
    fulfilment_state,
    item_price_satang,
    shipping_fee_satang,
    buyer_service_fee_satang,
    buyer_total_satang,
    seller_payout_satang,
    currency,
    shipping_snapshot,
    money_snapshot,
    request_id
  ) values (
    pending_row.id,
    listing_row.listing_id,
    inventory_row.id,
    p_buyer_marketplace_account_id,
    'official_shop',
    'pending_payment',
    'unfulfilled',
    pending_row.item_price_satang,
    pending_row.shipping_fee_satang,
    pending_row.buyer_service_fee_satang,
    pending_row.buyer_total_satang,
    0,
    'THB',
    p_shipping_snapshot || jsonb_build_object('shippingFeeSatang', p_shipping_fee_satang, 'currency', 'THB'),
    pending_row.money_snapshot,
    p_request_id
  )
  returning * into order_row;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_buyer_ynot_profile_id,
    p_buyer_ynot_profile_id,
    'marketplace_official_pending_payment_order_created',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'listingId', listing_row.listing_id,
      'sellerPayoutSatang', 0
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'pendingPaymentOrderId', pending_row.id,
    'orderId', order_row.id,
    'listingId', listing_row.listing_id,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'currency', 'THB',
    'itemPriceSatang', pending_row.item_price_satang,
    'shippingFeeSatang', pending_row.shipping_fee_satang,
    'buyerServiceFeeSatang', pending_row.buyer_service_fee_satang,
    'buyerTotalSatang', pending_row.buyer_total_satang,
    'sellerPayoutSatang', 0,
    'sellerPayoutState', 'not_applicable',
    'nextAction', 'upload_payment_proof'
  );

  update public.marketplace_idempotency_keys
  set marketplace_account_id = p_buyer_marketplace_account_id,
      response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_submit_official_payment_proof(
  p_pending_payment_order_id uuid,
  p_buyer_marketplace_account_id uuid,
  p_buyer_ynot_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_file_sha256 text,
  p_file_size_bytes integer,
  p_content_type text,
  p_proof_storage_path text,
  p_verification_status text,
  p_provider_code text default null,
  p_provider_message text default null,
  p_provider_response jsonb default '{}'::jsonb,
  p_reference_id text default null,
  p_decoded_qr_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  pending_row public.marketplace_pending_payment_orders%rowtype;
  order_row public.marketplace_orders%rowtype;
  proof_row public.marketplace_payment_proofs%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_status text := nullif(trim(coalesce(p_verification_status, '')), '');
  normalized_file_sha256 text := lower(nullif(trim(coalesce(p_file_sha256, '')), ''));
  normalized_storage_path text := nullif(trim(coalesce(p_proof_storage_path, '')), '');
  normalized_content_type text := lower(nullif(trim(coalesce(p_content_type, '')), ''));
  next_action text;
  rpc_response_payload jsonb;
begin
  if p_buyer_marketplace_account_id is null or p_buyer_ynot_profile_id is null then
    raise exception 'marketplace_login_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_status not in (
    'submitted',
    'valid',
    'manual_review',
    'provider_error',
    'amount_mismatch',
    'receiver_mismatch',
    'date_mismatch',
    'not_found',
    'fraud',
    'duplicate',
    'rejected'
  ) then
    raise exception 'marketplace_payment_status_invalid';
  end if;
  if normalized_file_sha256 is null or normalized_file_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'marketplace_payment_proof_invalid';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 10485760 then
    raise exception 'marketplace_payment_proof_invalid';
  end if;
  if normalized_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'marketplace_payment_proof_invalid';
  end if;
  if normalized_storage_path is null then
    raise exception 'marketplace_payment_proof_required';
  end if;
  if not exists (
    select 1
    from public.marketplace_accounts account
    where account.id = p_buyer_marketplace_account_id
      and account.ynot_profile_id = p_buyer_ynot_profile_id
      and account.profile_status_snapshot = 'active'
      and account.buyer_status = 'active'
  ) then
    raise exception 'marketplace_account_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id, ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_buyer_marketplace_account_id, p_buyer_ynot_profile_id, 'payment_proof.submit',
    normalized_idempotency_key, normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_buyer_ynot_profile_id
      and scope = 'payment_proof.submit'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into pending_row
  from public.marketplace_pending_payment_orders
  where id = p_pending_payment_order_id
    and buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_source = 'official_shop'
  for update;

  if pending_row.id is null then
    raise exception 'marketplace_pending_order_not_found';
  end if;
  if pending_row.expires_at <= now() then
    raise exception 'marketplace_pending_order_expired';
  end if;
  if pending_row.order_state not in ('pending_payment', 'payment_submitted') then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  select * into order_row
  from public.marketplace_orders
  where pending_payment_order_id = pending_row.id
    and buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_source = 'official_shop'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;
  if order_row.payment_state not in ('pending_payment', 'payment_submitted') then
    raise exception 'marketplace_payment_state_invalid';
  end if;
  if p_reference_id is not null and exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.provider_reference_id = p_reference_id
      and proof.pending_payment_order_id <> pending_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;
  if p_decoded_qr_hash is not null and exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.decoded_qr_hash = p_decoded_qr_hash
      and proof.pending_payment_order_id <> pending_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;
  if exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.file_sha256 = normalized_file_sha256
      and proof.pending_payment_order_id <> pending_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;

  insert into public.marketplace_payment_proofs(
    pending_payment_order_id,
    order_id,
    buyer_marketplace_account_id,
    listing_source,
    verification_status,
    provider,
    provider_code,
    provider_message,
    provider_response,
    provider_reference_id,
    decoded_qr_hash,
    file_sha256,
    file_size_bytes,
    content_type,
    proof_storage_path,
    request_id
  ) values (
    pending_row.id,
    order_row.id,
    p_buyer_marketplace_account_id,
    'official_shop',
    normalized_status,
    'slip2go',
    nullif(trim(coalesce(p_provider_code, '')), ''),
    nullif(trim(coalesce(p_provider_message, '')), ''),
    coalesce(p_provider_response, '{}'::jsonb),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_decoded_qr_hash, '')), ''),
    normalized_file_sha256,
    p_file_size_bytes,
    normalized_content_type,
    normalized_storage_path,
    p_request_id
  )
  returning * into proof_row;

  if normalized_status = 'valid' then
    update public.marketplace_pending_payment_orders
    set order_state = 'paid'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'paid',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paidAt', now(),
          'paymentProvider', 'slip2go'
        )
    where id = order_row.id
    returning * into order_row;

    update public.marketplace_listing_snapshots
    set listing_state = case when quantity_available_snapshot = 0 then 'sold' else 'active' end
    where listing_id = pending_row.listing_id
      and listing_source = 'official_shop';

    next_action := 'await_fulfilment';
  elsif normalized_status in ('submitted', 'manual_review', 'provider_error') then
    update public.marketplace_pending_payment_orders
    set order_state = 'payment_submitted'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'payment_submitted',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paymentSubmittedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    where id = order_row.id
    returning * into order_row;

    next_action := 'admin_payment_review';
  else
    update public.marketplace_inventory_items
    set quantity_available = least(quantity_total, quantity_available + pending_row.quantity),
        item_state = case when item_state = 'sold' then 'listed' else item_state end,
        version = version + 1
    where id = pending_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
        listing_state = 'active'
    where listing_id = pending_row.listing_id
      and listing_source = 'official_shop';

    update public.marketplace_pending_payment_orders
    set order_state = 'cancelled'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paymentRejectedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    where id = order_row.id
    returning * into order_row;

    next_action := 'payment_rejected';
  end if;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_buyer_ynot_profile_id,
    p_buyer_ynot_profile_id,
    'marketplace_official_payment_proof_submitted',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'paymentProofId', proof_row.id,
      'verificationStatus', proof_row.verification_status,
      'paymentState', order_row.payment_state,
      'nextAction', next_action
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'pendingPaymentOrderId', pending_row.id,
    'orderId', order_row.id,
    'paymentProofId', proof_row.id,
    'verificationStatus', proof_row.verification_status,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'buyerTotalSatang', order_row.buyer_total_satang,
    'currency', order_row.currency,
    'nextAction', next_action
  );

  update public.marketplace_idempotency_keys
  set marketplace_account_id = p_buyer_marketplace_account_id,
      response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_record_official_payment_result(uuid, text, text, text, uuid, text, text, text);

create or replace function public.marketplace_record_official_payment_result(
  p_order_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_payment_state text,
  p_provider_reference text,
  p_provider_amount_satang integer,
  p_provider_currency text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
  pending_row public.marketplace_pending_payment_orders%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_payment_state text := nullif(trim(coalesce(p_payment_state, '')), '');
  normalized_provider_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
  normalized_provider_currency text := upper(nullif(trim(coalesce(p_provider_currency, '')), ''));
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role <> 'owner' then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_payment_state not in ('paid', 'failed') then
    raise exception 'marketplace_payment_result_invalid';
  end if;
  if p_provider_amount_satang is not null and p_provider_amount_satang < 1 then
    raise exception 'marketplace_provider_amount_invalid';
  end if;
  if normalized_provider_currency is not null and normalized_provider_currency <> 'THB' then
    raise exception 'marketplace_provider_currency_invalid';
  end if;
  if normalized_payment_state = 'paid' and (
    normalized_provider_reference is null
    or p_provider_amount_satang is null
    or normalized_provider_currency <> 'THB'
  ) then
    raise exception 'marketplace_payment_evidence_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'official_order.payment_result', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_order.payment_result'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
    and listing_source = 'official_shop'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;

  select * into pending_row
  from public.marketplace_pending_payment_orders
  where id = order_row.pending_payment_order_id
  for update;

  if pending_row.id is null then
    raise exception 'marketplace_pending_order_not_found';
  end if;

  if normalized_payment_state = 'paid' then
    if order_row.payment_state = 'failed' or pending_row.order_state in ('expired', 'cancelled') then
      raise exception 'marketplace_payment_state_invalid';
    end if;
    if p_provider_amount_satang <> order_row.buyer_total_satang then
      raise exception 'marketplace_payment_amount_mismatch';
    end if;

    update public.marketplace_pending_payment_orders
    set order_state = 'paid'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'paid',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentApprovedAt', now(),
          'manualPaymentApprovedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    where id = order_row.id
    returning * into order_row;

    update public.marketplace_listing_snapshots
    set listing_state = case when quantity_available_snapshot = 0 then 'sold' else 'active' end
    where listing_id = order_row.listing_id
      and listing_source = 'official_shop';
  else
    if order_row.payment_state = 'paid' then
      raise exception 'marketplace_payment_state_invalid';
    end if;

    if pending_row.order_state in ('pending_payment', 'payment_submitted') then
      update public.marketplace_inventory_items
      set quantity_available = least(quantity_total, quantity_available + pending_row.quantity),
          item_state = case when item_state = 'sold' then 'listed' else item_state end,
          version = version + 1
      where id = pending_row.inventory_item_id;

      update public.marketplace_listing_snapshots
      set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
          listing_state = 'active'
      where listing_id = pending_row.listing_id
        and listing_source = 'official_shop';

      update public.marketplace_pending_payment_orders
      set order_state = 'cancelled'
      where id = pending_row.id
      returning * into pending_row;
    end if;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentRejectedAt', now(),
          'manualPaymentRejectedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    where id = order_row.id
    returning * into order_row;
  end if;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_payment_result_recorded',
    jsonb_build_object(
      'orderId', order_row.id,
      'pendingPaymentOrderId', pending_row.id,
      'paymentState', order_row.payment_state,
      'providerReferencePresent', normalized_provider_reference is not null,
      'providerAmountSatang', p_provider_amount_satang,
      'providerCurrency', normalized_provider_currency,
      'adminNotePresent', nullif(trim(coalesce(p_admin_note, '')), '') is not null
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'orderId', order_row.id,
    'pendingPaymentOrderId', pending_row.id,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'currency', order_row.currency,
    'buyerTotalSatang', order_row.buyer_total_satang,
    'providerReference', normalized_provider_reference,
    'providerAmountSatang', p_provider_amount_satang,
    'providerCurrency', normalized_provider_currency
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_release_pending_payment_order(
  p_pending_payment_order_id uuid,
  p_actor_marketplace_account_id uuid,
  p_actor_ynot_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_release_reason text default 'buyer_cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pending_row public.marketplace_pending_payment_orders%rowtype;
  order_row public.marketplace_orders%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_reason text := nullif(trim(coalesce(p_release_reason, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  next_pending_state text;
  rpc_response_payload jsonb;
begin
  if p_actor_marketplace_account_id is null or p_actor_ynot_profile_id is null then
    raise exception 'marketplace_login_required';
  end if;
  if not exists (
    select 1
    from public.marketplace_accounts account
    where account.id = p_actor_marketplace_account_id
      and account.ynot_profile_id = p_actor_ynot_profile_id
      and account.profile_status_snapshot = 'active'
  ) then
    raise exception 'marketplace_account_required';
  end if;
  if normalized_reason is null or normalized_reason not in ('buyer_cancelled', 'expired') then
    raise exception 'marketplace_release_reason_invalid';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  next_pending_state := case when normalized_reason = 'expired' then 'expired' else 'cancelled' end;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id, ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_actor_marketplace_account_id, p_actor_ynot_profile_id, 'pending_order.release',
    normalized_idempotency_key, normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_actor_ynot_profile_id
      and scope = 'pending_order.release'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into pending_row
  from public.marketplace_pending_payment_orders
  where id = p_pending_payment_order_id
    and buyer_marketplace_account_id = p_actor_marketplace_account_id
    and listing_source = 'official_shop'
  for update;

  if pending_row.id is null then
    raise exception 'marketplace_pending_order_not_found';
  end if;

  select * into order_row
  from public.marketplace_orders
  where pending_payment_order_id = pending_row.id
    and listing_source = 'official_shop'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;

  if order_row.payment_state = 'paid' or pending_row.order_state = 'paid' then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  if pending_row.order_state in ('pending_payment', 'payment_submitted') then
    update public.marketplace_inventory_items
    set quantity_available = least(quantity_total, quantity_available + pending_row.quantity),
        item_state = case when item_state = 'sold' then 'listed' else item_state end,
        version = version + 1
    where id = pending_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
        listing_state = 'active'
    where listing_id = pending_row.listing_id
      and listing_source = 'official_shop';

    update public.marketplace_pending_payment_orders
    set order_state = next_pending_state
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = money_snapshot || jsonb_build_object(
          'releasedAt', now(),
          'releaseReason', normalized_reason
        )
    where id = order_row.id
    returning * into order_row;
  end if;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_actor_marketplace_account_id,
    p_actor_ynot_profile_id,
    p_actor_ynot_profile_id,
    'marketplace_official_pending_payment_order_released',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'releaseReason', normalized_reason,
      'paymentState', order_row.payment_state
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'pendingPaymentOrderId', pending_row.id,
    'orderId', order_row.id,
    'orderState', pending_row.order_state,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'releaseReason', normalized_reason
  );

  update public.marketplace_idempotency_keys
  set marketplace_account_id = p_actor_marketplace_account_id,
      response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_record_official_fulfilment(
  p_order_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_fulfilment_state text,
  p_tracking_code text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if p_fulfilment_state not in ('packed', 'shipped', 'completed') then
    raise exception 'marketplace_fulfilment_state_invalid';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'official_order.fulfilment', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_order.fulfilment'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  update public.marketplace_orders
  set fulfilment_state = p_fulfilment_state,
      fulfilment_snapshot = fulfilment_snapshot || jsonb_build_object(
        'trackingCode', nullif(trim(coalesce(p_tracking_code, '')), ''),
        'adminNote', nullif(trim(coalesce(p_admin_note, '')), ''),
        'updatedBy', p_admin_profile_id,
        'updatedAt', now()
      )
  where id = p_order_id
    and listing_source = 'official_shop'
    and payment_state = 'paid'
    and refund_state in ('none', 'rejected')
  returning * into order_row;

  if order_row.id is null then
    raise exception 'marketplace_order_not_paid';
  end if;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_order_fulfilled',
    jsonb_build_object(
      'orderId', order_row.id,
      'fulfilmentState', order_row.fulfilment_state,
      'paymentState', order_row.payment_state,
      'sellerPayoutSatang', 0
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'orderId', order_row.id,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'sellerPayoutSatang', 0,
    'sellerPayoutState', 'not_applicable'
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_create_official_refund(
  p_order_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_reason_code text,
  p_admin_note text,
  p_refund_amount_satang integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
  refund_row public.marketplace_refund_requests%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception 'marketplace_refund_reason_required';
  end if;
  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'marketplace_admin_note_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
    and listing_source = 'official_shop'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;
  if p_refund_amount_satang is null
    or p_refund_amount_satang < 0
    or p_refund_amount_satang > order_row.buyer_total_satang then
    raise exception 'marketplace_refund_amount_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'official_order.refund', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_order.refund'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  insert into public.marketplace_refund_requests(
    order_id,
    refund_state,
    reason_code,
    admin_note,
    refund_amount_satang,
    actor_ynot_profile_id,
    actor_admin_role,
    request_id
  ) values (
    order_row.id,
    'requested',
    p_reason_code,
    p_admin_note,
    p_refund_amount_satang,
    p_admin_profile_id,
    p_admin_role,
    p_request_id
  )
  returning * into refund_row;

  update public.marketplace_orders
  set refund_state = 'requested'
  where id = order_row.id;

  insert into public.marketplace_reconciliation_items(
    order_id,
    reconciliation_state,
    reason_code,
    reconciliation_payload,
    actor_ynot_profile_id,
    request_id
  ) values (
    order_row.id,
    'open',
    'official_refund_review',
    jsonb_build_object('refundRequestId', refund_row.id, 'refundAmountSatang', refund_row.refund_amount_satang),
    p_admin_profile_id,
    p_request_id
  );

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_refund_requested',
    jsonb_build_object(
      'orderId', order_row.id,
      'refundRequestId', refund_row.id,
      'refundAmountSatang', refund_row.refund_amount_satang,
      'sellerPayoutSatang', 0
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'orderId', order_row.id,
    'refundRequestId', refund_row.id,
    'refundState', refund_row.refund_state,
    'reconciliationState', 'open',
    'sellerPayoutSatang', 0,
    'sellerPayoutState', 'not_applicable'
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_create_official_inventory(text, text, text, uuid, text, text, text, text, integer, integer, text, jsonb, jsonb, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_publish_official_listing(uuid, text, text, text, uuid, text, bigint)
from public, anon, authenticated;
revoke all on function public.marketplace_create_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer, jsonb)
from public, anon, authenticated;
revoke all on function public.marketplace_submit_official_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_record_official_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_release_pending_payment_order(uuid, uuid, uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_record_official_fulfilment(uuid, text, text, text, uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_create_official_refund(uuid, text, text, text, uuid, text, text, text, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_payment_proofs_append_only()
from public, anon, authenticated;

grant execute on function public.marketplace_create_official_inventory(text, text, text, uuid, text, text, text, text, integer, integer, text, jsonb, jsonb, text, text, text)
to service_role;
grant execute on function public.marketplace_publish_official_listing(uuid, text, text, text, uuid, text, bigint)
to service_role;
grant execute on function public.marketplace_create_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer, jsonb)
to service_role;
grant execute on function public.marketplace_submit_official_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
to service_role;
grant execute on function public.marketplace_record_official_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
to service_role;
grant execute on function public.marketplace_release_pending_payment_order(uuid, uuid, uuid, text, text, text, text)
to service_role;
grant execute on function public.marketplace_record_official_fulfilment(uuid, text, text, text, uuid, text, text, text, text)
to service_role;
grant execute on function public.marketplace_create_official_refund(uuid, text, text, text, uuid, text, text, text, integer)
to service_role;
