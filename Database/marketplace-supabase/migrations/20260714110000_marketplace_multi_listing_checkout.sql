-- Additive multi-listing payment obligation for the official-shop cart.
-- Existing marketplace_pending_payment_orders and marketplace_orders remain the
-- per-listing fulfilment, refund, and accounting records.

create table if not exists public.marketplace_checkout_groups (
  id uuid primary key default gen_random_uuid(),
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  checkout_state text not null default 'pending_payment'
    check (checkout_state in ('pending_payment', 'payment_submitted', 'paid', 'expired', 'cancelled')),
  payment_state text not null default 'pending_payment'
    check (payment_state in ('pending_payment', 'payment_submitted', 'paid', 'failed')),
  item_count integer not null check (item_count between 2 and 3),
  item_subtotal_satang integer not null check (item_subtotal_satang >= 0),
  shipping_fee_satang integer not null check (shipping_fee_satang >= 0),
  buyer_service_fee_satang integer not null check (buyer_service_fee_satang >= 0),
  buyer_total_satang integer not null check (buyer_total_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  shipping_snapshot jsonb not null default '{}'::jsonb,
  money_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  request_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_marketplace_account_id, idempotency_key),
  check (
    buyer_total_satang = item_subtotal_satang + shipping_fee_satang + buyer_service_fee_satang
  )
);

create table if not exists public.marketplace_checkout_items (
  id uuid primary key default gen_random_uuid(),
  checkout_group_id uuid not null references public.marketplace_checkout_groups(id) on delete restrict,
  position integer not null check (position between 1 and 3),
  listing_id uuid not null references public.marketplace_listing_snapshots(listing_id) on delete restrict,
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  pending_payment_order_id uuid not null unique references public.marketplace_pending_payment_orders(id) on delete restrict,
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  item_price_satang integer not null check (item_price_satang >= 0),
  allocated_shipping_fee_satang integer not null check (allocated_shipping_fee_satang >= 0),
  buyer_service_fee_satang integer not null check (buyer_service_fee_satang >= 0),
  buyer_total_satang integer not null check (buyer_total_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  created_at timestamptz not null default now(),
  unique (checkout_group_id, position),
  unique (checkout_group_id, listing_id),
  check (
    buyer_total_satang = item_price_satang + allocated_shipping_fee_satang + buyer_service_fee_satang
  )
);

alter table public.marketplace_payment_proofs
  add column if not exists checkout_group_id uuid references public.marketplace_checkout_groups(id) on delete restrict;

alter table public.marketplace_provider_payment_events
  add column if not exists checkout_group_id uuid references public.marketplace_checkout_groups(id) on delete restrict;

create index if not exists marketplace_checkout_groups_buyer_state_idx
  on public.marketplace_checkout_groups(buyer_marketplace_account_id, checkout_state, updated_at desc);
create index if not exists marketplace_checkout_groups_expiry_idx
  on public.marketplace_checkout_groups(checkout_state, expires_at);
create index if not exists marketplace_checkout_items_group_position_idx
  on public.marketplace_checkout_items(checkout_group_id, position);
create index if not exists marketplace_checkout_items_listing_idx
  on public.marketplace_checkout_items(listing_id);
create index if not exists marketplace_payment_proofs_checkout_group_idx
  on public.marketplace_payment_proofs(checkout_group_id, created_at desc)
  where checkout_group_id is not null;
create index if not exists marketplace_provider_payment_events_checkout_group_idx
  on public.marketplace_provider_payment_events(checkout_group_id, received_at desc)
  where checkout_group_id is not null;

drop trigger if exists marketplace_checkout_groups_touch_updated_at on public.marketplace_checkout_groups;
create trigger marketplace_checkout_groups_touch_updated_at
before update on public.marketplace_checkout_groups
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_checkout_groups enable row level security;
alter table public.marketplace_checkout_items enable row level security;

revoke all on
  public.marketplace_checkout_groups,
  public.marketplace_checkout_items
from public, anon, authenticated;

grant all on
  public.marketplace_checkout_groups,
  public.marketplace_checkout_items
to service_role;

-- Grouped child orders must only move through the aggregate checkout RPCs.
-- The transaction-local setting is written by those RPCs after they have
-- locked and validated the complete group.
create or replace function public.marketplace_require_checkout_group_operation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_group_id uuid;
  order_linked_group_id uuid;
  operation_group_id text := nullif(
    current_setting('marketplace.checkout_group_id', true),
    ''
  );
begin
  if tg_table_name = 'marketplace_pending_payment_orders' then
    select checkout_item.checkout_group_id
    into linked_group_id
    from public.marketplace_checkout_items checkout_item
    where checkout_item.pending_payment_order_id = new.id;
  elsif tg_table_name = 'marketplace_payment_proofs' then
    select checkout_item.checkout_group_id
    into linked_group_id
    from public.marketplace_checkout_items checkout_item
    where checkout_item.pending_payment_order_id = new.pending_payment_order_id;

    select checkout_item.checkout_group_id
    into order_linked_group_id
    from public.marketplace_checkout_items checkout_item
    where checkout_item.order_id = new.order_id;
  elsif tg_table_name = 'marketplace_provider_payment_events' then
    select checkout_item.checkout_group_id
    into linked_group_id
    from public.marketplace_checkout_items checkout_item
    where checkout_item.pending_payment_order_id = new.pending_payment_order_id;

    select checkout_item.checkout_group_id
    into order_linked_group_id
    from public.marketplace_checkout_items checkout_item
    where checkout_item.order_id = new.order_id;
  end if;

  if linked_group_id is null then
    linked_group_id := order_linked_group_id;
  elsif order_linked_group_id is not null
    and order_linked_group_id is distinct from linked_group_id then
    raise exception 'marketplace_checkout_group_operation_required';
  end if;

  if linked_group_id is null then
    return new;
  end if;

  if operation_group_id is distinct from linked_group_id::text then
    raise exception 'marketplace_checkout_group_operation_required';
  end if;

  if tg_table_name in ('marketplace_payment_proofs', 'marketplace_provider_payment_events') then
    if new.checkout_group_id is distinct from linked_group_id then
      raise exception 'marketplace_checkout_group_operation_required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_pending_order_group_operation_guard
  on public.marketplace_pending_payment_orders;
create trigger marketplace_pending_order_group_operation_guard
before update of order_state on public.marketplace_pending_payment_orders
for each row execute function public.marketplace_require_checkout_group_operation();

drop trigger if exists marketplace_payment_proof_group_operation_guard
  on public.marketplace_payment_proofs;
create trigger marketplace_payment_proof_group_operation_guard
before insert on public.marketplace_payment_proofs
for each row execute function public.marketplace_require_checkout_group_operation();

drop trigger if exists marketplace_provider_event_group_operation_guard
  on public.marketplace_provider_payment_events;
create trigger marketplace_provider_event_group_operation_guard
before update of order_id, pending_payment_order_id, checkout_group_id
on public.marketplace_provider_payment_events
for each row execute function public.marketplace_require_checkout_group_operation();

comment on function public.marketplace_apply_provider_payment_event(text, text, text, text, uuid, text, integer, text, text, jsonb, text)
is 'Single-order provider events reject grouped child orders with marketplace_checkout_group_operation_required. Grouped payment evidence must use marketplace_submit_checkout_payment_proof or marketplace_record_checkout_payment_result.';

create or replace function public.marketplace_create_multi_listing_checkout(
  p_listing_ids uuid[],
  p_buyer_marketplace_account_id uuid,
  p_buyer_ynot_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
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
  group_row public.marketplace_checkout_groups%rowtype;
  child_row record;
  listing_count integer := coalesce(array_length(p_listing_ids, 1), 0);
  locked_listing_count integer := 0;
  locked_inventory_count integer := 0;
  inventory_ids uuid[] := '{}'::uuid[];
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  item_position integer := 0;
  allocated_shipping_fee_satang integer;
  child_service_fee_satang integer;
  child_buyer_total_satang integer;
  item_subtotal_satang integer := 0;
  service_fee_total_satang integer := 0;
  group_total_satang integer;
  child_total_satang integer := 0;
  checkout_expires_at timestamptz := now() + interval '30 minutes';
  canonical_pending_payment_order_id uuid;
  canonical_order_id uuid;
  items_payload jsonb;
  rpc_response_payload jsonb;
begin
  if p_buyer_marketplace_account_id is null or p_buyer_ynot_profile_id is null then
    raise exception 'marketplace_login_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if listing_count not between 2 and 3
    or array_length(p_listing_ids, 1) not between 2 and 3 then
    raise exception 'marketplace_checkout_listing_count_invalid';
  end if;
  if (select count(distinct listing_id) from unnest(p_listing_ids) as listing_id) <> listing_count then
    raise exception 'marketplace_checkout_duplicate_listing';
  end if;
  if p_shipping_fee_satang is null or p_shipping_fee_satang < 0 then
    raise exception 'marketplace_shipping_fee_invalid';
  end if;
  if p_buyer_service_fee_bps is null or p_buyer_service_fee_bps < 0 or p_buyer_service_fee_bps > 10000 then
    raise exception 'marketplace_fee_invalid';
  end if;
  if p_shipping_snapshot is null or jsonb_typeof(p_shipping_snapshot) <> 'object' then
    raise exception 'marketplace_shipping_snapshot_invalid';
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
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_buyer_ynot_profile_id,
    'checkout_group.create',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_buyer_ynot_profile_id
      and scope = 'checkout_group.create'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  for listing_row in
    select listing.*
    from public.marketplace_listing_snapshots listing
    where listing.listing_id = any(p_listing_ids)
    order by listing.listing_id
    for update
  loop
    locked_listing_count := locked_listing_count + 1;
    if listing_row.listing_source <> 'official_shop' then
      raise exception 'marketplace_group_user_seller_unsupported';
    end if;
    if listing_row.listing_state <> 'active'
      or listing_row.quantity_available_snapshot < 1
      or listing_row.currency <> 'THB' then
      raise exception 'marketplace_listing_not_available';
    end if;
    inventory_ids := array_append(inventory_ids, listing_row.inventory_item_id);
  end loop;

  if locked_listing_count <> listing_count then
    raise exception 'marketplace_listing_not_available';
  end if;

  for inventory_row in
    select inventory.*
    from public.marketplace_inventory_items inventory
    where inventory.id = any(inventory_ids)
    order by inventory.id
    for update
  loop
    locked_inventory_count := locked_inventory_count + 1;
    if inventory_row.seller_type <> 'official_shop'
      or inventory_row.source_kind <> 'official_stock'
      or inventory_row.quantity_available < 1
      or inventory_row.currency <> 'THB' then
      raise exception 'marketplace_listing_not_available';
    end if;
    item_subtotal_satang := item_subtotal_satang + inventory_row.item_price_satang;
    service_fee_total_satang := service_fee_total_satang
      + floor((inventory_row.item_price_satang::numeric * p_buyer_service_fee_bps) / 10000)::integer;
  end loop;

  if locked_inventory_count <> listing_count then
    raise exception 'marketplace_listing_not_available';
  end if;

  group_total_satang := item_subtotal_satang + p_shipping_fee_satang + service_fee_total_satang;

  insert into public.marketplace_checkout_groups(
    buyer_marketplace_account_id,
    checkout_state,
    payment_state,
    item_count,
    item_subtotal_satang,
    shipping_fee_satang,
    buyer_service_fee_satang,
    buyer_total_satang,
    currency,
    shipping_snapshot,
    money_snapshot,
    expires_at,
    request_id,
    idempotency_key
  ) values (
    p_buyer_marketplace_account_id,
    'pending_payment',
    'pending_payment',
    listing_count,
    item_subtotal_satang,
    p_shipping_fee_satang,
    service_fee_total_satang,
    group_total_satang,
    'THB',
    p_shipping_snapshot,
    jsonb_build_object(
      'currency', 'THB',
      'itemSubtotalSatang', item_subtotal_satang,
      'shippingFeeSatang', p_shipping_fee_satang,
      'buyerServiceFeeSatang', service_fee_total_satang,
      'buyerTotalSatang', group_total_satang,
      'buyerServiceFeeBps', p_buyer_service_fee_bps
    ),
    checkout_expires_at,
    p_request_id,
    normalized_idempotency_key
  )
  returning * into group_row;

  for child_row in
    select listing.*, inventory.item_price_satang as inventory_price_satang
    from public.marketplace_listing_snapshots listing
    join public.marketplace_inventory_items inventory
      on inventory.id = listing.inventory_item_id
    where listing.listing_id = any(p_listing_ids)
    order by listing.listing_id
  loop
    item_position := item_position + 1;
    if child_row.item_price_satang <> child_row.inventory_price_satang then
      raise exception 'marketplace_listing_not_available';
    end if;

    allocated_shipping_fee_satang := case when item_position = 1 then p_shipping_fee_satang else 0 end;
    child_service_fee_satang := floor(
      (child_row.inventory_price_satang::numeric * p_buyer_service_fee_bps) / 10000
    )::integer;
    child_buyer_total_satang := child_row.inventory_price_satang
      + allocated_shipping_fee_satang
      + child_service_fee_satang;
    child_total_satang := child_total_satang + child_buyer_total_satang;

    update public.marketplace_inventory_items
    set quantity_available = quantity_available - 1,
        item_state = case when quantity_available - 1 = 0 then 'sold' else item_state end,
        version = version + 1
    where id = child_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = greatest(quantity_available_snapshot - 1, 0),
        listing_state = case when quantity_available_snapshot - 1 = 0 then 'pending_payment' else listing_state end
    where listing_id = child_row.listing_id;

    insert into public.marketplace_pending_payment_orders(
      listing_id,
      inventory_item_id,
      buyer_marketplace_account_id,
      listing_source,
      order_state,
      quantity,
      item_price_satang,
      shipping_fee_satang,
      buyer_service_fee_satang,
      buyer_total_satang,
      seller_payout_satang,
      currency,
      shipping_snapshot,
      money_snapshot,
      expires_at,
      request_id,
      idempotency_key
    ) values (
      child_row.listing_id,
      child_row.inventory_item_id,
      p_buyer_marketplace_account_id,
      'official_shop',
      'pending_payment',
      1,
      child_row.inventory_price_satang,
      allocated_shipping_fee_satang,
      child_service_fee_satang,
      child_buyer_total_satang,
      0,
      'THB',
      p_shipping_snapshot,
      jsonb_build_object(
        'checkoutGroupId', group_row.id,
        'checkoutPosition', item_position,
        'currency', 'THB',
        'itemPriceSatang', child_row.inventory_price_satang,
        'shippingFeeSatang', allocated_shipping_fee_satang,
        'buyerServiceFeeSatang', child_service_fee_satang,
        'buyerTotalSatang', child_buyer_total_satang,
        'sellerPayoutSatang', 0,
        'sellerPayoutState', 'not_applicable'
      ),
      checkout_expires_at,
      p_request_id,
      'group:' || group_row.id::text || ':item:' || item_position::text
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
      child_row.listing_id,
      child_row.inventory_item_id,
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
      p_shipping_snapshot || jsonb_build_object(
        'checkoutGroupId', group_row.id,
        'checkoutPosition', item_position,
        'shippingFeeSatang', allocated_shipping_fee_satang,
        'currency', 'THB'
      ),
      pending_row.money_snapshot,
      p_request_id
    )
    returning * into order_row;

    insert into public.marketplace_checkout_items(
      checkout_group_id,
      position,
      listing_id,
      inventory_item_id,
      pending_payment_order_id,
      order_id,
      item_price_satang,
      allocated_shipping_fee_satang,
      buyer_service_fee_satang,
      buyer_total_satang,
      currency
    ) values (
      group_row.id,
      item_position,
      child_row.listing_id,
      child_row.inventory_item_id,
      pending_row.id,
      order_row.id,
      pending_row.item_price_satang,
      pending_row.shipping_fee_satang,
      pending_row.buyer_service_fee_satang,
      pending_row.buyer_total_satang,
      'THB'
    );

    if item_position = 1 then
      canonical_pending_payment_order_id := pending_row.id;
      canonical_order_id := order_row.id;
    end if;
  end loop;

  if group_total_satang <> child_total_satang then
    raise exception 'marketplace_checkout_total_mismatch';
  end if;

  delete from public.marketplace_cart_items
  where buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_id = any(p_listing_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', checkout_item.position,
        'listingId', checkout_item.listing_id,
        'pendingPaymentOrderId', checkout_item.pending_payment_order_id,
        'orderId', checkout_item.order_id,
        'itemPriceSatang', checkout_item.item_price_satang,
        'shippingFeeSatang', checkout_item.allocated_shipping_fee_satang,
        'buyerServiceFeeSatang', checkout_item.buyer_service_fee_satang,
        'buyerTotalSatang', checkout_item.buyer_total_satang,
        'currency', checkout_item.currency
      ) order by checkout_item.position
    ),
    '[]'::jsonb
  ) into items_payload
  from public.marketplace_checkout_items checkout_item
  where checkout_item.checkout_group_id = group_row.id;

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
    'marketplace_multi_listing_checkout_created',
    jsonb_build_object(
      'checkoutGroupId', group_row.id,
      'itemCount', group_row.item_count,
      'buyerTotalSatang', group_row.buyer_total_satang,
      'currency', group_row.currency
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'checkoutGroupId', group_row.id,
    'pendingPaymentOrderId', canonical_pending_payment_order_id,
    'orderId', canonical_order_id,
    'items', items_payload,
    'totals', jsonb_build_object(
      'itemSubtotalSatang', group_row.item_subtotal_satang,
      'shippingFeeSatang', group_row.shipping_fee_satang,
      'buyerServiceFeeSatang', group_row.buyer_service_fee_satang,
      'buyerTotalSatang', group_row.buyer_total_satang
    ),
    'currency', group_row.currency,
    'expiresAt', group_row.expires_at,
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

create or replace function public.marketplace_release_checkout_group(
  p_checkout_group_id uuid,
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
  group_row public.marketplace_checkout_groups%rowtype;
  checkout_item_row public.marketplace_checkout_items%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_reason text := nullif(trim(coalesce(p_release_reason, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  next_pending_state text;
  next_group_state text;
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
  if normalized_reason not in ('buyer_cancelled', 'expired') then
    raise exception 'marketplace_release_reason_invalid';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  next_pending_state := case when normalized_reason = 'expired' then 'expired' else 'cancelled' end;
  next_group_state := case when normalized_reason = 'expired' then 'expired' else 'cancelled' end;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_actor_marketplace_account_id,
    p_actor_ynot_profile_id,
    'checkout_group.release',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_actor_ynot_profile_id
      and scope = 'checkout_group.release'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into group_row
  from public.marketplace_checkout_groups
  where id = p_checkout_group_id
    and buyer_marketplace_account_id = p_actor_marketplace_account_id
  for update;

  if group_row.id is null then
    raise exception 'marketplace_checkout_group_not_found';
  end if;
  if group_row.payment_state = 'paid' or group_row.checkout_state = 'paid' then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  perform set_config('marketplace.checkout_group_id', group_row.id::text, true);

  for checkout_item_row in
    select checkout_item.*
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
    order by checkout_item.position
    for update
  loop
    null;
  end loop;

  perform 1
  from public.marketplace_pending_payment_orders pending_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.pending_payment_order_id = pending_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of pending_order;

  perform 1
  from public.marketplace_orders child_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.order_id = child_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of child_order;

  perform 1
  from public.marketplace_inventory_items inventory
  join public.marketplace_checkout_items checkout_item
    on checkout_item.inventory_item_id = inventory.id
  where checkout_item.checkout_group_id = group_row.id
  order by inventory.id
  for update of inventory;

  if exists (
    select 1
    from public.marketplace_orders child_order
    join public.marketplace_checkout_items checkout_item on checkout_item.order_id = child_order.id
    where checkout_item.checkout_group_id = group_row.id
      and child_order.payment_state = 'paid'
  ) then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  if group_row.checkout_state in ('pending_payment', 'payment_submitted') then
    update public.marketplace_inventory_items inventory
    set quantity_available = least(inventory.quantity_total, inventory.quantity_available + pending_order.quantity),
        item_state = case when inventory.item_state = 'sold' then 'listed' else inventory.item_state end,
        version = inventory.version + 1
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and inventory.id = checkout_item.inventory_item_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_listing_snapshots listing
    set quantity_available_snapshot = listing.quantity_available_snapshot + pending_order.quantity,
        listing_state = 'active'
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_pending_payment_orders pending_order
    set order_state = next_pending_state
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_orders child_order
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'releasedAt', now(),
          'releaseReason', normalized_reason,
          'checkoutGroupId', group_row.id
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id
      and child_order.payment_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_checkout_groups
    set checkout_state = next_group_state,
        payment_state = 'failed',
        money_snapshot = money_snapshot || jsonb_build_object(
          'releasedAt', now(),
          'releaseReason', normalized_reason
        )
    where id = group_row.id
    returning * into group_row;
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
    'marketplace_checkout_group_released',
    jsonb_build_object(
      'checkoutGroupId', group_row.id,
      'releaseReason', normalized_reason,
      'checkoutState', group_row.checkout_state,
      'paymentState', group_row.payment_state,
      'itemCount', group_row.item_count
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'checkoutGroupId', group_row.id,
    'checkoutState', group_row.checkout_state,
    'paymentState', group_row.payment_state,
    'releaseReason', normalized_reason,
    'itemCount', group_row.item_count
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

create or replace function public.marketplace_submit_checkout_payment_proof(
  p_checkout_group_id uuid,
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
  group_row public.marketplace_checkout_groups%rowtype;
  checkout_item_row public.marketplace_checkout_items%rowtype;
  canonical_item public.marketplace_checkout_items%rowtype;
  proof_row public.marketplace_payment_proofs%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
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
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_buyer_ynot_profile_id,
    'checkout_group.payment_proof',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_buyer_ynot_profile_id
      and scope = 'checkout_group.payment_proof'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into group_row
  from public.marketplace_checkout_groups
  where id = p_checkout_group_id
    and buyer_marketplace_account_id = p_buyer_marketplace_account_id
  for update;

  if group_row.id is null then
    raise exception 'marketplace_checkout_group_not_found';
  end if;
  if group_row.expires_at <= now() then
    raise exception 'marketplace_pending_order_expired';
  end if;
  if group_row.checkout_state not in ('pending_payment', 'payment_submitted')
    or group_row.payment_state not in ('pending_payment', 'payment_submitted') then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  perform set_config('marketplace.checkout_group_id', group_row.id::text, true);

  for checkout_item_row in
    select checkout_item.*
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
    order by checkout_item.position
    for update
  loop
    if checkout_item_row.position = 1 then
      canonical_item := checkout_item_row;
    end if;
  end loop;

  if canonical_item.id is null then
    raise exception 'marketplace_checkout_group_invalid';
  end if;

  perform 1
  from public.marketplace_pending_payment_orders pending_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.pending_payment_order_id = pending_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of pending_order;

  perform 1
  from public.marketplace_orders child_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.order_id = child_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of child_order;

  if exists (
    select 1
    from public.marketplace_pending_payment_orders pending_order
    join public.marketplace_checkout_items checkout_item
      on checkout_item.pending_payment_order_id = pending_order.id
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.order_state not in ('pending_payment', 'payment_submitted')
  ) or exists (
    select 1
    from public.marketplace_orders child_order
    join public.marketplace_checkout_items checkout_item
      on checkout_item.order_id = child_order.id
    where checkout_item.checkout_group_id = group_row.id
      and child_order.payment_state not in ('pending_payment', 'payment_submitted')
  ) then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  if p_reference_id is not null and exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.provider_reference_id = p_reference_id
      and proof.checkout_group_id is distinct from group_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;
  if p_decoded_qr_hash is not null and exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.decoded_qr_hash = p_decoded_qr_hash
      and proof.checkout_group_id is distinct from group_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;
  if exists (
    select 1
    from public.marketplace_payment_proofs proof
    where proof.file_sha256 = normalized_file_sha256
      and proof.checkout_group_id is distinct from group_row.id
      and proof.verification_status in ('submitted', 'valid', 'manual_review')
  ) then
    raise exception 'marketplace_payment_duplicate';
  end if;

  insert into public.marketplace_payment_proofs(
    pending_payment_order_id,
    order_id,
    checkout_group_id,
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
    canonical_item.pending_payment_order_id,
    canonical_item.order_id,
    group_row.id,
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
    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'paid'
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id;

    update public.marketplace_orders child_order
    set payment_state = 'paid',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'paymentProofId', proof_row.id,
          'paidAt', now(),
          'paymentProvider', 'slip2go'
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id;

    update public.marketplace_listing_snapshots listing
    set listing_state = case when listing.quantity_available_snapshot = 0 then 'sold' else 'active' end
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id;

    update public.marketplace_checkout_groups
    set checkout_state = 'paid',
        payment_state = 'paid',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paidAt', now(),
          'paymentProvider', 'slip2go'
        )
    where id = group_row.id
    returning * into group_row;

    next_action := 'await_fulfilment';
  elsif normalized_status in ('submitted', 'manual_review', 'provider_error') then
    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'payment_submitted'
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id;

    update public.marketplace_orders child_order
    set payment_state = 'payment_submitted',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'paymentProofId', proof_row.id,
          'paymentSubmittedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id;

    update public.marketplace_checkout_groups
    set checkout_state = 'payment_submitted',
        payment_state = 'payment_submitted',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paymentSubmittedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    where id = group_row.id
    returning * into group_row;

    next_action := 'admin_payment_review';
  else
    perform 1
    from public.marketplace_inventory_items inventory
    join public.marketplace_checkout_items checkout_item
      on checkout_item.inventory_item_id = inventory.id
    where checkout_item.checkout_group_id = group_row.id
    order by inventory.id
    for update of inventory;

    update public.marketplace_inventory_items inventory
    set quantity_available = least(inventory.quantity_total, inventory.quantity_available + pending_order.quantity),
        item_state = case when inventory.item_state = 'sold' then 'listed' else inventory.item_state end,
        version = inventory.version + 1
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and inventory.id = checkout_item.inventory_item_id;

    update public.marketplace_listing_snapshots listing
    set quantity_available_snapshot = listing.quantity_available_snapshot + pending_order.quantity,
        listing_state = 'active'
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id;

    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'cancelled'
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id;

    update public.marketplace_orders child_order
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'paymentProofId', proof_row.id,
          'paymentRejectedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id;

    update public.marketplace_checkout_groups
    set checkout_state = 'cancelled',
        payment_state = 'failed',
        money_snapshot = money_snapshot || jsonb_build_object(
          'paymentProofId', proof_row.id,
          'paymentRejectedAt', now(),
          'paymentProvider', 'slip2go',
          'verificationStatus', normalized_status
        )
    where id = group_row.id
    returning * into group_row;

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
    'marketplace_checkout_payment_proof_submitted',
    jsonb_build_object(
      'checkoutGroupId', group_row.id,
      'paymentProofId', proof_row.id,
      'verificationStatus', proof_row.verification_status,
      'paymentState', group_row.payment_state,
      'nextAction', next_action
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'checkoutGroupId', group_row.id,
    'pendingPaymentOrderId', canonical_item.pending_payment_order_id,
    'orderId', canonical_item.order_id,
    'paymentProofId', proof_row.id,
    'verificationStatus', proof_row.verification_status,
    'paymentState', group_row.payment_state,
    'buyerTotalSatang', group_row.buyer_total_satang,
    'currency', group_row.currency,
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

create or replace function public.marketplace_record_checkout_payment_result(
  p_checkout_group_id uuid,
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
  group_row public.marketplace_checkout_groups%rowtype;
  checkout_item_row public.marketplace_checkout_items%rowtype;
  canonical_item public.marketplace_checkout_items%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_payment_state text := nullif(trim(coalesce(p_payment_state, '')), '');
  normalized_provider_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
  normalized_provider_currency text := upper(nullif(trim(coalesce(p_provider_currency, '')), ''));
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  eligible_pending_count integer := 0;
  eligible_order_count integer := 0;
  affected_pending_count integer := 0;
  affected_order_count integer := 0;
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
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'checkout_group.payment_result',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'checkout_group.payment_result'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into group_row
  from public.marketplace_checkout_groups
  where id = p_checkout_group_id
  for update;

  if group_row.id is null then
    raise exception 'marketplace_checkout_group_not_found';
  end if;

  for checkout_item_row in
    select checkout_item.*
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
    order by checkout_item.position
    for update
  loop
    if checkout_item_row.position = 1 then
      canonical_item := checkout_item_row;
    end if;
  end loop;

  if canonical_item.id is null then
    raise exception 'marketplace_checkout_group_invalid';
  end if;

  perform 1
  from public.marketplace_pending_payment_orders pending_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.pending_payment_order_id = pending_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of pending_order;

  perform 1
  from public.marketplace_orders child_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.order_id = child_order.id
  where checkout_item.checkout_group_id = group_row.id
  order by checkout_item.position
  for update of child_order;

  if normalized_payment_state = 'paid' then
    if group_row.payment_state = 'failed'
      or group_row.checkout_state in ('expired', 'cancelled') then
      raise exception 'marketplace_payment_state_invalid';
    end if;
    if p_provider_amount_satang <> group_row.buyer_total_satang then
      raise exception 'marketplace_payment_amount_mismatch';
    end if;
  elsif group_row.payment_state = 'paid' or group_row.checkout_state = 'paid' then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  select count(*)
  into eligible_pending_count
  from public.marketplace_pending_payment_orders pending_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.pending_payment_order_id = pending_order.id
  where checkout_item.checkout_group_id = group_row.id
    and pending_order.order_state in ('pending_payment', 'payment_submitted');

  select count(*)
  into eligible_order_count
  from public.marketplace_orders child_order
  join public.marketplace_checkout_items checkout_item
    on checkout_item.order_id = child_order.id
  where checkout_item.checkout_group_id = group_row.id
    and child_order.payment_state in ('pending_payment', 'payment_submitted');

  if eligible_pending_count <> group_row.item_count
    or eligible_order_count <> group_row.item_count then
    raise exception 'marketplace_checkout_group_invalid';
  end if;

  perform set_config('marketplace.checkout_group_id', group_row.id::text, true);

  if normalized_payment_state = 'paid' then

    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'paid'
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    get diagnostics affected_pending_count = row_count;

    update public.marketplace_orders child_order
    set payment_state = 'paid',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'manualPaymentApprovedAt', now(),
          'manualPaymentApprovedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id
      and child_order.payment_state in ('pending_payment', 'payment_submitted');

    get diagnostics affected_order_count = row_count;

    update public.marketplace_listing_snapshots listing
    set listing_state = case when listing.quantity_available_snapshot = 0 then 'sold' else 'active' end
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id;

    if affected_pending_count <> group_row.item_count
      or affected_order_count <> group_row.item_count then
      raise exception 'marketplace_checkout_group_invalid';
    end if;

    update public.marketplace_checkout_groups
    set checkout_state = 'paid',
        payment_state = 'paid',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentApprovedAt', now(),
          'manualPaymentApprovedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    where id = group_row.id
    returning * into group_row;
  else
    perform 1
    from public.marketplace_inventory_items inventory
    join public.marketplace_checkout_items checkout_item
      on checkout_item.inventory_item_id = inventory.id
    where checkout_item.checkout_group_id = group_row.id
    order by inventory.id
    for update of inventory;

    update public.marketplace_inventory_items inventory
    set quantity_available = least(inventory.quantity_total, inventory.quantity_available + pending_order.quantity),
        item_state = case when inventory.item_state = 'sold' then 'listed' else inventory.item_state end,
        version = inventory.version + 1
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and inventory.id = checkout_item.inventory_item_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_listing_snapshots listing
    set quantity_available_snapshot = listing.quantity_available_snapshot + pending_order.quantity,
        listing_state = 'active'
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'cancelled'
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted');

    get diagnostics affected_pending_count = row_count;

    update public.marketplace_orders child_order
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'manualPaymentRejectedAt', now(),
          'manualPaymentRejectedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id
      and child_order.payment_state in ('pending_payment', 'payment_submitted');

    get diagnostics affected_order_count = row_count;

    if affected_pending_count <> group_row.item_count
      or affected_order_count <> group_row.item_count then
      raise exception 'marketplace_checkout_group_invalid';
    end if;

    update public.marketplace_checkout_groups
    set checkout_state = 'cancelled',
        payment_state = 'failed',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentRejectedAt', now(),
          'manualPaymentRejectedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), '')
        )
    where id = group_row.id
    returning * into group_row;
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
    'marketplace_checkout_payment_result_recorded',
    jsonb_build_object(
      'checkoutGroupId', group_row.id,
      'paymentState', group_row.payment_state,
      'providerReferencePresent', normalized_provider_reference is not null,
      'providerAmountSatang', p_provider_amount_satang,
      'providerCurrency', normalized_provider_currency,
      'itemCount', group_row.item_count
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'checkoutGroupId', group_row.id,
    'pendingPaymentOrderId', canonical_item.pending_payment_order_id,
    'orderId', canonical_item.order_id,
    'checkoutState', group_row.checkout_state,
    'paymentState', group_row.payment_state,
    'currency', group_row.currency,
    'buyerTotalSatang', group_row.buyer_total_satang,
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

create or replace function public.marketplace_expire_checkout_groups(
  p_request_id text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  group_row public.marketplace_checkout_groups%rowtype;
  checkout_item_row public.marketplace_checkout_items%rowtype;
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  actual_item_count integer := 0;
  expired_count integer := 0;
  expired_checkout_group_ids jsonb := '[]'::jsonb;
begin
  for group_row in
    select *
    from public.marketplace_checkout_groups
    where checkout_state = 'pending_payment'
      and payment_state = 'pending_payment'
      and expires_at <= now()
    order by expires_at asc, id asc
    limit bounded_limit
    for update skip locked
  loop
    for checkout_item_row in
      select checkout_item.*
      from public.marketplace_checkout_items checkout_item
      where checkout_item.checkout_group_id = group_row.id
      order by checkout_item.position
      for update
    loop
      null;
    end loop;

    perform 1
    from public.marketplace_pending_payment_orders pending_order
    join public.marketplace_checkout_items checkout_item
      on checkout_item.pending_payment_order_id = pending_order.id
    where checkout_item.checkout_group_id = group_row.id
    order by checkout_item.position
    for update of pending_order;

    perform 1
    from public.marketplace_orders child_order
    join public.marketplace_checkout_items checkout_item
      on checkout_item.order_id = child_order.id
    where checkout_item.checkout_group_id = group_row.id
    order by checkout_item.position
    for update of child_order;

    perform 1
    from public.marketplace_inventory_items inventory
    join public.marketplace_checkout_items checkout_item
      on checkout_item.inventory_item_id = inventory.id
    where checkout_item.checkout_group_id = group_row.id
    order by inventory.id
    for update of inventory;

    select count(*)
    into actual_item_count
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id;

    if actual_item_count <> group_row.item_count or exists (
      select 1
      from public.marketplace_pending_payment_orders pending_order
      join public.marketplace_checkout_items checkout_item
        on checkout_item.pending_payment_order_id = pending_order.id
      where checkout_item.checkout_group_id = group_row.id
        and pending_order.order_state <> 'pending_payment'
    ) or exists (
      select 1
      from public.marketplace_orders child_order
      join public.marketplace_checkout_items checkout_item
        on checkout_item.order_id = child_order.id
      where checkout_item.checkout_group_id = group_row.id
        and child_order.payment_state <> 'pending_payment'
    ) then
      insert into public.marketplace_reconciliation_items(
        order_id,
        target_type,
        target_id,
        priority,
        reconciliation_state,
        reason_code,
        reconciliation_payload,
        request_id
      )
      select
        null,
        'payment',
        group_row.id,
        'high',
        'open',
        'checkout_group_expiry_inconsistent',
        jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'expectedItemCount', group_row.item_count,
          'actualItemCount', actual_item_count,
          'checkoutState', group_row.checkout_state,
          'paymentState', group_row.payment_state,
          'expiresAt', group_row.expires_at
        ),
        p_request_id
      where not exists (
        select 1
        from public.marketplace_reconciliation_items reconciliation_item
        where reconciliation_item.target_type = 'payment'
          and reconciliation_item.target_id = group_row.id
          and reconciliation_item.reason_code = 'checkout_group_expiry_inconsistent'
          and reconciliation_item.reconciliation_state = 'open'
      );

      insert into public.marketplace_audit_events(
        marketplace_account_id,
        event_type,
        event_payload,
        request_id
      ) values (
        group_row.buyer_marketplace_account_id,
        'marketplace_checkout_group_expiry_skipped',
        jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'expectedItemCount', group_row.item_count,
          'actualItemCount', actual_item_count,
          'checkoutState', group_row.checkout_state,
          'paymentState', group_row.payment_state,
          'nextAction', 'admin_reconciliation'
        ),
        p_request_id
      );

      continue;
    end if;

    perform set_config('marketplace.checkout_group_id', group_row.id::text, true);

    update public.marketplace_inventory_items inventory
    set quantity_available = least(inventory.quantity_total, inventory.quantity_available + pending_order.quantity),
        item_state = case when inventory.item_state = 'sold' then 'listed' else inventory.item_state end,
        version = inventory.version + 1
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and inventory.id = checkout_item.inventory_item_id;

    update public.marketplace_listing_snapshots listing
    set quantity_available_snapshot = listing.quantity_available_snapshot + pending_order.quantity,
        listing_state = 'active'
    from public.marketplace_checkout_items checkout_item
    join public.marketplace_pending_payment_orders pending_order
      on pending_order.id = checkout_item.pending_payment_order_id
    where checkout_item.checkout_group_id = group_row.id
      and listing.listing_id = checkout_item.listing_id;

    update public.marketplace_pending_payment_orders pending_order
    set order_state = 'expired',
        money_snapshot = pending_order.money_snapshot || jsonb_build_object(
          'expiredAt', now(),
          'releaseReason', 'expired',
          'releaseActor', 'marketplace_checkout_group_expiry_job',
          'checkoutGroupId', group_row.id
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and pending_order.id = checkout_item.pending_payment_order_id;

    update public.marketplace_orders child_order
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        money_snapshot = child_order.money_snapshot || jsonb_build_object(
          'expiredAt', now(),
          'releaseReason', 'expired',
          'releaseActor', 'marketplace_checkout_group_expiry_job',
          'checkoutGroupId', group_row.id
        )
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
      and child_order.id = checkout_item.order_id;

    update public.marketplace_checkout_groups
    set checkout_state = 'expired',
        payment_state = 'failed',
        money_snapshot = money_snapshot || jsonb_build_object(
          'expiredAt', now(),
          'releaseReason', 'expired',
          'releaseActor', 'marketplace_checkout_group_expiry_job'
        )
    where id = group_row.id
    returning * into group_row;

    insert into public.marketplace_audit_events(
      marketplace_account_id,
      ynot_profile_id,
      actor_ynot_profile_id,
      event_type,
      event_payload,
      request_id
    ) values (
      group_row.buyer_marketplace_account_id,
      null,
      null,
      'marketplace_checkout_group_expired',
      jsonb_build_object(
        'checkoutGroupId', group_row.id,
        'itemCount', group_row.item_count,
        'buyerTotalSatang', group_row.buyer_total_satang,
        'currency', group_row.currency
      ),
      p_request_id
    );

    expired_count := expired_count + 1;
    expired_checkout_group_ids := expired_checkout_group_ids || jsonb_build_array(group_row.id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'expiredCount', expired_count,
    'limit', bounded_limit,
    'expiredCheckoutGroupIds', expired_checkout_group_ids
  );
end;
$$;

-- Keep the legacy single-order expiry worker compatible while preventing it
-- from releasing only one child of a grouped checkout. Grouped rows are owned
-- exclusively by marketplace_expire_checkout_groups.
create or replace function public.marketplace_expire_pending_payment_orders(
  p_request_id text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pending_row public.marketplace_pending_payment_orders%rowtype;
  order_row public.marketplace_orders%rowtype;
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  expired_count integer := 0;
  official_count integer := 0;
  user_seller_count integer := 0;
  expired_ids jsonb := '[]'::jsonb;
begin
  for pending_row in
    select pending_row.*
    from public.marketplace_pending_payment_orders pending_row
    where pending_row.order_state = 'pending_payment'
      and pending_row.expires_at <= now()
      and not exists (
        select 1
        from public.marketplace_checkout_items checkout_item
        where checkout_item.pending_payment_order_id = pending_row.id
      )
    order by pending_row.expires_at asc, pending_row.id asc
    limit bounded_limit
    for update skip locked
  loop
    select *
    into order_row
    from public.marketplace_orders
    where pending_payment_order_id = pending_row.id
    for update;

    if order_row.id is null
      or order_row.payment_state <> 'pending_payment' then
      continue;
    end if;

    update public.marketplace_inventory_items
    set quantity_available = least(quantity_total, quantity_available + pending_row.quantity),
        item_state = case when item_state = 'sold' then 'listed' else item_state end,
        seller_payout_state = case
          when pending_row.listing_source = 'user_seller' then 'pending'
          else seller_payout_state
        end,
        version = version + 1
    where id = pending_row.inventory_item_id;

    update public.marketplace_listing_snapshots
    set quantity_available_snapshot = quantity_available_snapshot + pending_row.quantity,
        listing_state = 'active',
        seller_payout_state = case
          when pending_row.listing_source = 'user_seller' then 'pending'
          else seller_payout_state
        end
    where listing_id = pending_row.listing_id;

    update public.marketplace_seller_payouts
    set payout_state = 'cancelled',
        admin_note = concat_ws(
          E'\n',
          nullif(admin_note, ''),
          'Pending payment expired before slip approval.'
        )
    where order_id = order_row.id
      and pending_row.listing_source = 'user_seller';

    update public.marketplace_pending_payment_orders
    set order_state = 'expired',
        money_snapshot = money_snapshot || jsonb_build_object(
          'expiredAt', now(),
          'releaseReason', 'expired',
          'releaseActor', 'marketplace_expiry_job'
        )
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        seller_payout_state = case
          when listing_source = 'user_seller' then 'cancelled'
          else seller_payout_state
        end,
        money_snapshot = money_snapshot || jsonb_build_object(
          'expiredAt', now(),
          'releaseReason', 'expired',
          'releaseActor', 'marketplace_expiry_job'
        )
    where id = order_row.id
    returning * into order_row;

    insert into public.marketplace_audit_events(
      marketplace_account_id,
      ynot_profile_id,
      actor_ynot_profile_id,
      event_type,
      event_payload,
      request_id
    ) values (
      pending_row.buyer_marketplace_account_id,
      null,
      null,
      'marketplace_pending_payment_order_expired',
      jsonb_build_object(
        'pendingPaymentOrderId', pending_row.id,
        'orderId', order_row.id,
        'listingId', pending_row.listing_id,
        'listingSource', pending_row.listing_source,
        'quantityReleased', pending_row.quantity,
        'sellerPayoutState', order_row.seller_payout_state
      ),
      p_request_id
    );

    expired_count := expired_count + 1;
    if pending_row.listing_source = 'user_seller' then
      user_seller_count := user_seller_count + 1;
    else
      official_count := official_count + 1;
    end if;
    expired_ids := expired_ids || jsonb_build_array(pending_row.id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'expiredCount', expired_count,
    'officialCount', official_count,
    'userSellerCount', user_seller_count,
    'limit', bounded_limit,
    'expiredPendingOrderIds', expired_ids
  );
end;
$$;

-- Keep child order totals unchanged for fulfilment and GMV, while exposing the
-- one aggregate obligation that admins must compare against a grouped slip.
create or replace function public.marketplace_admin_list_orders(
  p_state text default null,
  p_limit integer default 100
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  from (
    select
      ord.id as order_id,
      ord.id::text as order_code,
      ord.listing_source as source,
      ord.buyer_marketplace_account_id as buyer_account_id,
      pay.seller_marketplace_account_id as seller_account_id,
      checkout_item.checkout_group_id,
      ord.buyer_total_satang,
      coalesce(checkout_group.buyer_total_satang, ord.buyer_total_satang) as payment_review_amount_satang,
      ord.payment_state,
      ord.fulfilment_state,
      ord.created_at
    from public.marketplace_orders ord
    left join public.marketplace_seller_payouts pay
      on pay.order_id = ord.id
    left join public.marketplace_checkout_items checkout_item
      on checkout_item.order_id = ord.id
    left join public.marketplace_checkout_groups checkout_group
      on checkout_group.id = checkout_item.checkout_group_id
    where p_state is null or ord.payment_state = p_state
    order by ord.created_at desc
    limit greatest(p_limit, 1)
  ) o;
$$;

revoke all on function public.marketplace_create_multi_listing_checkout(uuid[], uuid, uuid, text, text, text, integer, integer, jsonb)
from public, anon, authenticated;
revoke all on function public.marketplace_release_checkout_group(uuid, uuid, uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_submit_checkout_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_record_checkout_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_expire_checkout_groups(text, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_require_checkout_group_operation()
from public, anon, authenticated;
revoke all on function public.marketplace_admin_list_orders(text, integer)
from public, anon, authenticated;

grant execute on function public.marketplace_create_multi_listing_checkout(uuid[], uuid, uuid, text, text, text, integer, integer, jsonb)
to service_role;
grant execute on function public.marketplace_release_checkout_group(uuid, uuid, uuid, text, text, text, text)
to service_role;
grant execute on function public.marketplace_submit_checkout_payment_proof(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, text, text)
to service_role;
grant execute on function public.marketplace_record_checkout_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
to service_role;
grant execute on function public.marketplace_expire_checkout_groups(text, integer)
to service_role;
grant execute on function public.marketplace_admin_list_orders(text, integer)
to service_role;
