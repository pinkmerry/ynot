-- Slice 4 Marketplace user-seller purchase and payout hold/release.
--
-- Rollback posture:
-- - Hide user-seller listings by setting listing_state to hidden/archived.
-- - Stop checkout/payout routes through feature/owner-only gates.
-- - Keep orders, proofs, payout rows, and audit rows for accounting history.

create extension if not exists pgcrypto;

alter table public.marketplace_orders
  add column if not exists seller_marketplace_account_id uuid
    references public.marketplace_accounts(id) on delete restrict,
  add column if not exists seller_fee_satang integer not null default 0
    check (seller_fee_satang >= 0),
  add column if not exists seller_fee_bps integer not null default 0
    check (seller_fee_bps between 0 and 10000),
  add column if not exists seller_payout_state text not null default 'not_applicable'
    check (seller_payout_state in ('not_applicable', 'held', 'eligible', 'released', 'paid', 'cancelled'));

alter table public.marketplace_pending_payment_orders
  add column if not exists seller_marketplace_account_id uuid
    references public.marketplace_accounts(id) on delete restrict,
  add column if not exists seller_fee_satang integer not null default 0
    check (seller_fee_satang >= 0),
  add column if not exists seller_fee_bps integer not null default 0
    check (seller_fee_bps between 0 and 10000);

create table if not exists public.marketplace_seller_payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  pending_payment_order_id uuid not null references public.marketplace_pending_payment_orders(id) on delete restrict,
  listing_id uuid not null,
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  seller_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  seller_ynot_profile_id uuid not null,
  payout_state text not null default 'held'
    check (payout_state in ('held', 'eligible', 'released', 'paid', 'cancelled')),
  item_price_satang integer not null check (item_price_satang >= 0),
  seller_fee_bps integer not null check (seller_fee_bps between 0 and 10000),
  seller_fee_satang integer not null check (seller_fee_satang >= 0),
  payout_amount_satang integer not null check (payout_amount_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  release_eligible_at timestamptz,
  released_by_ynot_profile_id uuid,
  released_at timestamptz,
  paid_by_ynot_profile_id uuid,
  paid_at timestamptz,
  transfer_reference text,
  admin_note text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payout_amount_satang = item_price_satang - seller_fee_satang)
);

create index if not exists marketplace_listing_user_seller_active_idx
  on public.marketplace_listing_snapshots(visible_from desc, listing_id)
  where listing_source = 'user_seller' and listing_state = 'active';
create index if not exists marketplace_orders_user_seller_payout_idx
  on public.marketplace_orders(listing_source, seller_payout_state, payment_state, fulfilment_state, updated_at desc)
  where listing_source = 'user_seller';
create index if not exists marketplace_seller_payouts_queue_idx
  on public.marketplace_seller_payouts(payout_state, release_eligible_at, updated_at desc);
create index if not exists marketplace_seller_payouts_seller_idx
  on public.marketplace_seller_payouts(seller_marketplace_account_id, payout_state, created_at desc);

drop trigger if exists marketplace_seller_payouts_touch_updated_at on public.marketplace_seller_payouts;
create trigger marketplace_seller_payouts_touch_updated_at
before update on public.marketplace_seller_payouts
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_seller_payouts enable row level security;

revoke all on public.marketplace_seller_payouts
from public, anon, authenticated;

grant all on public.marketplace_seller_payouts
to service_role;

create or replace function public.marketplace_admin_activate_seller_listing(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint,
  p_public_description text default null,
  p_photo_urls jsonb default '[]'::jsonb,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  source_row public.marketplace_inventory_sources%rowtype;
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
    p_admin_profile_id, 'seller_listing.activate', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'seller_listing.activate'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into submission_row
  from public.marketplace_seller_submissions
  where id = p_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'marketplace_seller_submission_not_found';
  end if;
  if submission_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if submission_row.status <> 'inspection_passed' then
    raise exception 'marketplace_listing_activation_guard_failed';
  end if;
  if submission_row.approved_inventory_id is not null or submission_row.listing_id is not null then
    raise exception 'marketplace_listing_activation_guard_failed';
  end if;

  insert into public.marketplace_inventory_sources(
    source_kind,
    source_state,
    source_reference_id,
    source_payload,
    private_admin_note,
    created_by_ynot_profile_id
  ) values (
    'seller_consignment',
    'approved',
    submission_row.submission_number,
    jsonb_build_object(
      'sellerConsignment', true,
      'submissionId', submission_row.id,
      'submissionNumber', submission_row.submission_number
    ),
    nullif(trim(coalesce(p_admin_note, '')), ''),
    p_admin_profile_id
  )
  returning * into source_row;

  insert into public.marketplace_inventory_items(
    owner_marketplace_account_id,
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
    created_by_ynot_profile_id,
    inspected_by_ynot_profile_id
  ) values (
    submission_row.marketplace_account_id,
    source_row.id,
    'seller_consignment',
    'user_seller',
    submission_row.item_type,
    'listed',
    submission_row.title_snapshot,
    submission_row.condition_code,
    submission_row.reference_snapshot,
    1,
    1,
    submission_row.asking_price_satang,
    'THB',
    nullif(trim(coalesce(p_public_description, '')), ''),
    coalesce(p_photo_urls, '[]'::jsonb),
    nullif(trim(coalesce(p_admin_note, '')), ''),
    'pending',
    submission_row.ynot_profile_id,
    p_admin_profile_id
  )
  returning * into inventory_row;

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
    submission_row.marketplace_account_id,
    'user_seller',
    'active',
    'seller-' || replace(inventory_row.id::text, '-', ''),
    submission_row.title_snapshot,
    submission_row.asking_price_satang,
    'THB',
    1,
    nullif(trim(coalesce(p_public_description, '')), ''),
    coalesce(p_photo_urls, '[]'::jsonb),
    'pending',
    jsonb_build_object(
      'sourceBadge', 'Seller consignment',
      'itemType', submission_row.item_type,
      'conditionCode', submission_row.condition_code,
      'sourceKind', 'seller_consignment',
      'sellerMarketplaceFeeBps', submission_row.seller_marketplace_fee_bps
    ),
    submission_row.version,
    now()
  )
  returning * into listing_row;

  update public.marketplace_seller_submissions
  set status = 'listed',
      approved_inventory_id = inventory_row.id,
      listing_id = listing_row.listing_id,
      admin_visible_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      version = version + 1
  where id = submission_row.id
  returning * into submission_row;

  insert into public.marketplace_seller_submission_events(
    submission_id,
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    before_status,
    after_status,
    event_payload,
    request_id
  ) values (
    submission_row.id,
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_listing_activated',
    'inspection_passed',
    'listed',
    jsonb_build_object('inventoryItemId', inventory_row.id, 'listingId', listing_row.listing_id),
    p_request_id
  );

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_listing_activated',
    jsonb_build_object(
      'submissionId', submission_row.id,
      'inventoryItemId', inventory_row.id,
      'listingId', listing_row.listing_id,
      'sourceKind', 'seller_consignment'
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'inventoryId', inventory_row.id,
    'listingId', listing_row.listing_id,
    'listingState', listing_row.listing_state,
    'sourceBadge', 'Seller consignment',
    'currency', 'THB',
    'sellerPayoutState', 'pending',
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_create_user_seller_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer);

create or replace function public.marketplace_create_user_seller_pending_payment_order(
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
  seller_account_row public.marketplace_accounts%rowtype;
  pending_row public.marketplace_pending_payment_orders%rowtype;
  order_row public.marketplace_orders%rowtype;
  payout_row public.marketplace_seller_payouts%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  seller_fee_bps integer;
  seller_fee_satang integer;
  seller_payout_satang integer;
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
    p_buyer_marketplace_account_id, p_buyer_ynot_profile_id, 'pending_order.create.user_seller',
    normalized_idempotency_key, normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_buyer_ynot_profile_id
      and scope = 'pending_order.create.user_seller'
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
    and listing_source = 'user_seller'
    and listing_state = 'active'
  for update;

  if listing_row.id is null then
    raise exception 'marketplace_listing_not_available';
  end if;
  if listing_row.seller_marketplace_account_id = p_buyer_marketplace_account_id then
    raise exception 'marketplace_self_purchase_rejected';
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = listing_row.inventory_item_id
    and seller_type = 'user_seller'
    and source_kind = 'seller_consignment'
    and owner_marketplace_account_id = listing_row.seller_marketplace_account_id
  for update;

  if inventory_row.id is null or inventory_row.quantity_available < p_quantity then
    raise exception 'marketplace_listing_not_available';
  end if;

  select * into seller_account_row
  from public.marketplace_accounts
  where id = listing_row.seller_marketplace_account_id
    and profile_status_snapshot = 'active'
  for update;

  if seller_account_row.id is null then
    raise exception 'marketplace_seller_account_invalid';
  end if;

  seller_fee_bps := coalesce((listing_row.snapshot_payload ->> 'sellerMarketplaceFeeBps')::integer, 1000);
  if seller_fee_bps < 0 or seller_fee_bps > 10000 then
    raise exception 'marketplace_fee_invalid';
  end if;
  seller_fee_satang := floor((inventory_row.item_price_satang::numeric * seller_fee_bps::numeric) / 10000)::integer;
  seller_payout_satang := inventory_row.item_price_satang - seller_fee_satang;
  service_fee_satang := floor((inventory_row.item_price_satang::numeric * p_buyer_service_fee_bps::numeric) / 10000)::integer;
  total_satang := inventory_row.item_price_satang + p_shipping_fee_satang + service_fee_satang;
  if seller_payout_satang < 0 then
    raise exception 'marketplace_money_invariant_failed';
  end if;

  update public.marketplace_inventory_items
  set quantity_available = quantity_available - p_quantity,
      item_state = 'sold',
      seller_payout_state = 'held',
      version = version + 1
  where id = inventory_row.id;

  update public.marketplace_listing_snapshots
  set quantity_available_snapshot = 0,
      listing_state = 'pending_payment',
      seller_payout_state = 'held'
  where id = listing_row.id;

  insert into public.marketplace_pending_payment_orders(
    listing_id,
    inventory_item_id,
    buyer_marketplace_account_id,
    seller_marketplace_account_id,
    listing_source,
    quantity,
    item_price_satang,
    shipping_fee_satang,
    buyer_service_fee_satang,
    buyer_total_satang,
    seller_fee_bps,
    seller_fee_satang,
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
    seller_account_row.id,
    'user_seller',
    p_quantity,
    inventory_row.item_price_satang,
    p_shipping_fee_satang,
    service_fee_satang,
    total_satang,
    seller_fee_bps,
    seller_fee_satang,
    seller_payout_satang,
    'THB',
    p_shipping_snapshot,
    jsonb_build_object(
      'currency', 'THB',
      'itemPriceSatang', inventory_row.item_price_satang,
      'shippingFeeSatang', p_shipping_fee_satang,
      'buyerServiceFeeSatang', service_fee_satang,
      'buyerTotalSatang', total_satang,
      'sellerFeeBps', seller_fee_bps,
      'sellerFeeSatang', seller_fee_satang,
      'sellerPayoutSatang', seller_payout_satang,
      'sellerPayoutState', 'held',
      'payoutExcludesBuyerShipping', true,
      'payoutExcludesBuyerServiceFee', true
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
    seller_marketplace_account_id,
    listing_source,
    payment_state,
    fulfilment_state,
    item_price_satang,
    shipping_fee_satang,
    buyer_service_fee_satang,
    buyer_total_satang,
    seller_fee_bps,
    seller_fee_satang,
    seller_payout_satang,
    seller_payout_state,
    currency,
    shipping_snapshot,
    money_snapshot,
    request_id
  ) values (
    pending_row.id,
    listing_row.listing_id,
    inventory_row.id,
    p_buyer_marketplace_account_id,
    seller_account_row.id,
    'user_seller',
    'pending_payment',
    'unfulfilled',
    pending_row.item_price_satang,
    pending_row.shipping_fee_satang,
    pending_row.buyer_service_fee_satang,
    pending_row.buyer_total_satang,
    seller_fee_bps,
    seller_fee_satang,
    seller_payout_satang,
    'held',
    'THB',
    p_shipping_snapshot || jsonb_build_object('shippingFeeSatang', p_shipping_fee_satang, 'currency', 'THB'),
    pending_row.money_snapshot,
    p_request_id
  )
  returning * into order_row;

  insert into public.marketplace_seller_payouts(
    order_id,
    pending_payment_order_id,
    listing_id,
    inventory_item_id,
    seller_marketplace_account_id,
    seller_ynot_profile_id,
    payout_state,
    item_price_satang,
    seller_fee_bps,
    seller_fee_satang,
    payout_amount_satang,
    currency,
    request_id
  ) values (
    order_row.id,
    pending_row.id,
    listing_row.listing_id,
    inventory_row.id,
    seller_account_row.id,
    seller_account_row.ynot_profile_id,
    'held',
    inventory_row.item_price_satang,
    seller_fee_bps,
    seller_fee_satang,
    seller_payout_satang,
    'THB',
    p_request_id
  )
  returning * into payout_row;

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
    'marketplace_user_seller_pending_payment_order_created',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'listingId', listing_row.listing_id,
      'sellerPayoutId', payout_row.id,
      'sellerPayoutSatang', seller_payout_satang,
      'shippingExcludedFromPayout', true,
      'buyerServiceFeeExcludedFromPayout', true
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
    'sellerFeeSatang', seller_fee_satang,
    'sellerPayoutSatang', seller_payout_satang,
    'sellerPayoutState', 'held',
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

create or replace function public.marketplace_submit_marketplace_payment_proof(
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
  payout_row public.marketplace_seller_payouts%rowtype;
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
    pending_row.listing_source,
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
        seller_payout_state = case when listing_source = 'user_seller' then 'held' else seller_payout_state end,
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paidAt', now(),
          'paymentProvider', 'slip2go'
        )
    where id = order_row.id
    returning * into order_row;

    update public.marketplace_listing_snapshots
    set listing_state = case when pending_row.listing_source = 'user_seller' then 'sold'
                             when quantity_available_snapshot = 0 then 'sold'
                             else 'active' end,
        seller_payout_state = case when pending_row.listing_source = 'user_seller' then 'held' else seller_payout_state end
    where listing_id = pending_row.listing_id;

    if pending_row.listing_source = 'user_seller' then
      update public.marketplace_seller_payouts
      set payout_state = 'held',
          release_eligible_at = now()
      where order_id = order_row.id
      returning * into payout_row;
    end if;

    next_action := case when pending_row.listing_source = 'user_seller'
      then 'await_owner_payout_release'
      else 'await_fulfilment'
    end;
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
        seller_payout_state = case when pending_row.listing_source = 'user_seller' then 'pending' else seller_payout_state end,
        version = version + 1
    where id = pending_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
        listing_state = 'active',
        seller_payout_state = case when pending_row.listing_source = 'user_seller' then 'pending' else seller_payout_state end
    where listing_id = pending_row.listing_id;

    update public.marketplace_seller_payouts
    set payout_state = 'cancelled'
    where order_id = order_row.id
      and pending_row.listing_source = 'user_seller';

    update public.marketplace_pending_payment_orders
    set order_state = 'cancelled'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        seller_payout_state = case when listing_source = 'user_seller' then 'cancelled' else seller_payout_state end,
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
    'marketplace_payment_proof_submitted',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'paymentProofId', proof_row.id,
      'listingSource', pending_row.listing_source,
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
    'listingSource', pending_row.listing_source,
    'verificationStatus', proof_row.verification_status,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'sellerPayoutState', order_row.seller_payout_state,
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

create or replace function public.marketplace_release_user_seller_pending_payment_order(
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
    and listing_source = 'user_seller'
  for update;

  if pending_row.id is null then
    raise exception 'marketplace_pending_order_not_found';
  end if;

  select * into order_row
  from public.marketplace_orders
  where pending_payment_order_id = pending_row.id
    and listing_source = 'user_seller'
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
        seller_payout_state = 'pending',
        version = version + 1
    where id = pending_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
        listing_state = 'active',
        seller_payout_state = 'pending'
    where listing_id = pending_row.listing_id
      and listing_source = 'user_seller';

    update public.marketplace_seller_payouts
    set payout_state = 'cancelled',
        admin_note = concat_ws(
          E'\n',
          nullif(admin_note, ''),
          concat('Pending payment released: ', normalized_reason)
        )
    where order_id = order_row.id;

    update public.marketplace_pending_payment_orders
    set order_state = next_pending_state
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        seller_payout_state = 'cancelled',
        money_snapshot = money_snapshot || jsonb_build_object(
          'releasedAt', now(),
          'releaseReason', normalized_reason,
          'sellerPayoutCancelled', true
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
    'marketplace_user_seller_pending_payment_order_released',
    jsonb_build_object(
      'pendingPaymentOrderId', pending_row.id,
      'orderId', order_row.id,
      'releaseReason', normalized_reason,
      'paymentState', order_row.payment_state,
      'sellerPayoutState', order_row.seller_payout_state
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'pendingPaymentOrderId', pending_row.id,
    'orderId', order_row.id,
    'listingSource', pending_row.listing_source,
    'orderState', pending_row.order_state,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'sellerPayoutState', order_row.seller_payout_state,
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

create or replace function public.marketplace_release_seller_payout(
  p_payout_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payout_row public.marketplace_seller_payouts%rowtype;
  order_row public.marketplace_orders%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  has_open_reconciliation boolean := false;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role <> 'owner' then
    raise exception 'marketplace_owner_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'seller_payout.release', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'seller_payout.release'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into payout_row
  from public.marketplace_seller_payouts
  where id = p_payout_id
  for update;

  if payout_row.id is null then
    raise exception 'marketplace_payout_not_found';
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = payout_row.order_id
    and listing_source = 'user_seller'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;
  if payout_row.payout_state not in ('held', 'eligible')
    or order_row.payment_state <> 'paid'
    or order_row.fulfilment_state not in ('shipped', 'completed')
    or order_row.refund_state <> 'none' then
    raise exception 'marketplace_payout_not_eligible';
  end if;

  update public.marketplace_seller_payouts
  set payout_state = 'released',
      released_by_ynot_profile_id = p_admin_profile_id,
      released_at = now(),
      admin_note = nullif(trim(coalesce(p_admin_note, '')), '')
  where id = payout_row.id
  returning * into payout_row;

  update public.marketplace_orders
  set seller_payout_state = 'released',
      money_snapshot = money_snapshot || jsonb_build_object(
        'sellerPayoutReleasedAt', payout_row.released_at,
        'sellerPayoutReleasedBy', p_admin_profile_id
      )
  where id = order_row.id
  returning * into order_row;

  update public.marketplace_inventory_items
  set seller_payout_state = 'released'
  where id = order_row.inventory_item_id;

  update public.marketplace_listing_snapshots
  set seller_payout_state = 'released'
  where listing_id = order_row.listing_id;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    payout_row.seller_marketplace_account_id,
    payout_row.seller_ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_payout_released',
    jsonb_build_object(
      'payoutId', payout_row.id,
      'orderId', order_row.id,
      'payoutAmountSatang', payout_row.payout_amount_satang
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'payoutId', payout_row.id,
    'orderId', order_row.id,
    'payoutState', payout_row.payout_state,
    'fulfilmentState', order_row.fulfilment_state,
    'payoutAmountSatang', payout_row.payout_amount_satang,
    'currency', payout_row.currency
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_mark_seller_payout_paid(
  p_payout_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_transfer_reference text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payout_row public.marketplace_seller_payouts%rowtype;
  order_row public.marketplace_orders%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  has_open_reconciliation boolean := false;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_transfer_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role <> 'owner' then
    raise exception 'marketplace_owner_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_transfer_reference is null then
    raise exception 'marketplace_payout_evidence_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'seller_payout.paid', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'seller_payout.paid'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into payout_row
  from public.marketplace_seller_payouts
  where id = p_payout_id
  for update;

  if payout_row.id is null then
    raise exception 'marketplace_payout_not_found';
  end if;
  if payout_row.payout_state <> 'released' then
    raise exception 'marketplace_payout_state_invalid';
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = payout_row.order_id
    and listing_source = 'user_seller'
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;
  if to_regclass('public.marketplace_reconciliation_items') is not null then
    execute $query$
      select exists (
        select 1
        from public.marketplace_reconciliation_items item
        where item.reconciliation_state = 'open'
          and (
            item.order_id = $1
            or (item.target_type = 'order' and item.target_id = $1)
            or (item.target_type = 'payout' and item.target_id = $2)
            or (item.target_type = 'listing' and item.target_id = $3)
          )
      )
    $query$
    into has_open_reconciliation
    using order_row.id, payout_row.id, payout_row.listing_id;
  end if;
  if order_row.payment_state <> 'paid'
    or order_row.refund_state <> 'none'
    or order_row.seller_payout_state <> 'released'
    or has_open_reconciliation then
    raise exception 'marketplace_payout_not_eligible';
  end if;

  update public.marketplace_seller_payouts
  set payout_state = 'paid',
      paid_by_ynot_profile_id = p_admin_profile_id,
      paid_at = now(),
      transfer_reference = normalized_transfer_reference,
      admin_note = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), admin_note)
  where id = payout_row.id
  returning * into payout_row;

  update public.marketplace_orders
  set seller_payout_state = 'paid',
      money_snapshot = money_snapshot || jsonb_build_object(
        'sellerPayoutPaidAt', payout_row.paid_at,
        'sellerPayoutPaidBy', p_admin_profile_id
      )
  where id = order_row.id
  returning * into order_row;

  update public.marketplace_inventory_items
  set seller_payout_state = 'paid'
  where id = order_row.inventory_item_id;

  update public.marketplace_listing_snapshots
  set seller_payout_state = 'paid'
  where listing_id = order_row.listing_id;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    payout_row.seller_marketplace_account_id,
    payout_row.seller_ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_payout_paid',
    jsonb_build_object(
      'payoutId', payout_row.id,
      'orderId', order_row.id,
      'payoutAmountSatang', payout_row.payout_amount_satang,
      'transferReferencePresent', true
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'payoutId', payout_row.id,
    'orderId', order_row.id,
    'payoutState', payout_row.payout_state,
    'payoutAmountSatang', payout_row.payout_amount_satang,
    'currency', payout_row.currency
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_admin_activate_seller_listing(uuid, text, text, text, uuid, text, bigint, text, jsonb, text)
from public, anon, authenticated;
revoke all on function public.marketplace_create_user_seller_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer, jsonb)
from public, anon, authenticated;
revoke all on function public.marketplace_submit_marketplace_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_release_user_seller_pending_payment_order(uuid, uuid, uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_mark_seller_payout_paid(uuid, text, text, text, uuid, text, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_admin_activate_seller_listing(uuid, text, text, text, uuid, text, bigint, text, jsonb, text)
to service_role;
grant execute on function public.marketplace_create_user_seller_pending_payment_order(uuid, uuid, uuid, text, text, text, integer, integer, integer, jsonb)
to service_role;
grant execute on function public.marketplace_submit_marketplace_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
to service_role;
grant execute on function public.marketplace_release_user_seller_pending_payment_order(uuid, uuid, uuid, text, text, text, text)
to service_role;
grant execute on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
to service_role;
grant execute on function public.marketplace_mark_seller_payout_paid(uuid, text, text, text, uuid, text, text, text)
to service_role;
