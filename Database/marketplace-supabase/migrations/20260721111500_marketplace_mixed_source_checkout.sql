-- Allow one buyer payment for up to three listings, including official-shop
-- and user-seller inventory. Each distinct fulfilment source is charged the
-- configured shipping fee once; individual child orders and seller payouts
-- remain the accounting and fulfilment source of truth.

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
  group_row public.marketplace_checkout_groups%rowtype;
  child_response jsonb;
  child_item jsonb;
  listing_count integer := coalesce(array_length(p_listing_ids, 1), 0);
  locked_listing_count integer := 0;
  item_position integer := 0;
  shipping_party_key text;
  charged_shipping_party_keys text[] := '{}'::text[];
  allocated_shipping_fee_satang integer;
  item_subtotal_satang integer := 0;
  service_fee_total_satang integer := 0;
  shipping_fee_total_satang integer := 0;
  buyer_total_satang integer := 0;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  checkout_expires_at timestamptz := now() + interval '30 minutes';
  canonical_pending_payment_order_id uuid;
  canonical_order_id uuid;
  items_payload jsonb := '[]'::jsonb;
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
    if listing_row.listing_state <> 'active'
      or listing_row.quantity_available_snapshot < 1
      or listing_row.currency <> 'THB'
      or listing_row.listing_source not in ('official_shop', 'user_seller') then
      raise exception 'marketplace_listing_not_available';
    end if;

    if listing_row.listing_source = 'official_shop' then
      shipping_party_key := 'official_shop';
    elsif listing_row.seller_marketplace_account_id is not null then
      shipping_party_key := 'user_seller:' || listing_row.seller_marketplace_account_id::text;
    else
      raise exception 'marketplace_seller_account_invalid';
    end if;

    allocated_shipping_fee_satang := case
      when shipping_party_key = any(charged_shipping_party_keys) then 0
      else p_shipping_fee_satang
    end;
    if not shipping_party_key = any(charged_shipping_party_keys) then
      charged_shipping_party_keys := array_append(charged_shipping_party_keys, shipping_party_key);
    end if;

    item_position := item_position + 1;
    if listing_row.listing_source = 'official_shop' then
      child_response := public.marketplace_create_pending_payment_order(
        listing_row.listing_id,
        p_buyer_marketplace_account_id,
        p_buyer_ynot_profile_id,
        p_request_id,
        'checkout-group:' || normalized_idempotency_key || ':item:' || item_position::text,
        encode(digest(normalized_request_hash || ':' || listing_row.listing_id::text, 'sha256'), 'hex'),
        1,
        allocated_shipping_fee_satang,
        p_buyer_service_fee_bps,
        p_shipping_snapshot
      );
    else
      child_response := public.marketplace_create_user_seller_pending_payment_order(
        listing_row.listing_id,
        p_buyer_marketplace_account_id,
        p_buyer_ynot_profile_id,
        p_request_id,
        'checkout-group:' || normalized_idempotency_key || ':item:' || item_position::text,
        encode(digest(normalized_request_hash || ':' || listing_row.listing_id::text, 'sha256'), 'hex'),
        1,
        allocated_shipping_fee_satang,
        p_buyer_service_fee_bps,
        p_shipping_snapshot
      );
    end if;

    item_subtotal_satang := item_subtotal_satang + coalesce((child_response ->> 'itemPriceSatang')::integer, 0);
    service_fee_total_satang := service_fee_total_satang + coalesce((child_response ->> 'buyerServiceFeeSatang')::integer, 0);
    shipping_fee_total_satang := shipping_fee_total_satang + coalesce((child_response ->> 'shippingFeeSatang')::integer, 0);
    buyer_total_satang := buyer_total_satang + coalesce((child_response ->> 'buyerTotalSatang')::integer, 0);
    items_payload := items_payload || jsonb_build_array(jsonb_build_object(
      'position', item_position,
      'listingId', child_response ->> 'listingId',
      'listingSource', child_response ->> 'listingSource',
      'shippingPartyKey', shipping_party_key,
      'pendingPaymentOrderId', child_response ->> 'pendingPaymentOrderId',
      'orderId', child_response ->> 'orderId',
      'itemPriceSatang', coalesce((child_response ->> 'itemPriceSatang')::integer, 0),
      'shippingFeeSatang', coalesce((child_response ->> 'shippingFeeSatang')::integer, 0),
      'buyerServiceFeeSatang', coalesce((child_response ->> 'buyerServiceFeeSatang')::integer, 0),
      'buyerTotalSatang', coalesce((child_response ->> 'buyerTotalSatang')::integer, 0),
      'currency', 'THB'
    ));
  end loop;

  if locked_listing_count <> listing_count then
    raise exception 'marketplace_listing_not_available';
  end if;
  if buyer_total_satang <> item_subtotal_satang + shipping_fee_total_satang + service_fee_total_satang then
    raise exception 'marketplace_checkout_total_mismatch';
  end if;

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
    shipping_fee_total_satang,
    service_fee_total_satang,
    buyer_total_satang,
    'THB',
    p_shipping_snapshot || jsonb_build_object('shipmentCount', cardinality(charged_shipping_party_keys)),
    jsonb_build_object(
      'currency', 'THB',
      'itemSubtotalSatang', item_subtotal_satang,
      'shippingFeeSatang', shipping_fee_total_satang,
      'buyerServiceFeeSatang', service_fee_total_satang,
      'buyerTotalSatang', buyer_total_satang,
      'buyerServiceFeeBps', p_buyer_service_fee_bps,
      'shippingFeePerFulfilmentSourceSatang', p_shipping_fee_satang,
      'shipmentCount', cardinality(charged_shipping_party_keys)
    ),
    checkout_expires_at,
    p_request_id,
    normalized_idempotency_key
  )
  returning * into group_row;

  for child_item in
    select value
    from jsonb_array_elements(items_payload)
  loop
    if canonical_pending_payment_order_id is null then
      canonical_pending_payment_order_id := (child_item ->> 'pendingPaymentOrderId')::uuid;
      canonical_order_id := (child_item ->> 'orderId')::uuid;
    end if;

    update public.marketplace_pending_payment_orders
    set shipping_snapshot = shipping_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'checkoutPosition', (child_item ->> 'position')::integer,
          'shippingPartyKey', child_item ->> 'shippingPartyKey'
        ),
        money_snapshot = money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'checkoutPosition', (child_item ->> 'position')::integer,
          'shippingPartyKey', child_item ->> 'shippingPartyKey'
        )
    where id = (child_item ->> 'pendingPaymentOrderId')::uuid;

    update public.marketplace_orders
    set shipping_snapshot = shipping_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'checkoutPosition', (child_item ->> 'position')::integer,
          'shippingPartyKey', child_item ->> 'shippingPartyKey'
        ),
        money_snapshot = money_snapshot || jsonb_build_object(
          'checkoutGroupId', group_row.id,
          'checkoutPosition', (child_item ->> 'position')::integer,
          'shippingPartyKey', child_item ->> 'shippingPartyKey'
        )
    where id = (child_item ->> 'orderId')::uuid;

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
    )
    select
      group_row.id,
      (child_item ->> 'position')::integer,
      pending_order.listing_id,
      pending_order.inventory_item_id,
      pending_order.id,
      child_order.id,
      pending_order.item_price_satang,
      pending_order.shipping_fee_satang,
      pending_order.buyer_service_fee_satang,
      pending_order.buyer_total_satang,
      'THB'
    from public.marketplace_pending_payment_orders pending_order
    join public.marketplace_orders child_order
      on child_order.pending_payment_order_id = pending_order.id
    where pending_order.id = (child_item ->> 'pendingPaymentOrderId')::uuid
      and child_order.id = (child_item ->> 'orderId')::uuid;
  end loop;

  if canonical_pending_payment_order_id is null or canonical_order_id is null then
    raise exception 'marketplace_checkout_group_invalid';
  end if;
  if (
    select count(*)
    from public.marketplace_checkout_items checkout_item
    where checkout_item.checkout_group_id = group_row.id
  ) <> listing_count then
    raise exception 'marketplace_checkout_group_invalid';
  end if;

  delete from public.marketplace_cart_items
  where buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_id = any(p_listing_ids);

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
      'shipmentCount', cardinality(charged_shipping_party_keys),
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

-- Existing grouped payment/release/expiry RPCs already transition every child
-- atomically. This companion trigger adds the user-seller payout state those
-- generic group transitions intentionally did not need while groups were
-- official-shop-only.
create or replace function public.marketplace_sync_grouped_user_seller_payout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.listing_source <> 'user_seller'
    or new.payment_state is not distinct from old.payment_state
    or not exists (
      select 1
      from public.marketplace_checkout_items checkout_item
      where checkout_item.order_id = new.id
    ) then
    return new;
  end if;

  if new.payment_state = 'paid' then
    update public.marketplace_orders
    set seller_payout_state = 'held'
    where id = new.id;

    update public.marketplace_seller_payouts
    set payout_state = 'held',
        release_eligible_at = now()
    where order_id = new.id;

    update public.marketplace_inventory_items
    set seller_payout_state = 'held'
    where id = new.inventory_item_id;

    update public.marketplace_listing_snapshots
    set listing_state = 'sold',
        seller_payout_state = 'held'
    where listing_id = new.listing_id;
  elsif new.payment_state = 'failed' then
    update public.marketplace_orders
    set seller_payout_state = 'cancelled'
    where id = new.id;

    update public.marketplace_seller_payouts
    set payout_state = 'cancelled',
        admin_note = concat_ws(E'\\n', nullif(admin_note, ''), 'Grouped checkout ended without payment.')
    where order_id = new.id;

    update public.marketplace_inventory_items
    set seller_payout_state = 'pending'
    where id = new.inventory_item_id;

    update public.marketplace_listing_snapshots
    set listing_state = 'active',
        seller_payout_state = 'pending'
    where listing_id = new.listing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_orders_sync_grouped_user_seller_payout
on public.marketplace_orders;

create trigger marketplace_orders_sync_grouped_user_seller_payout
after update of payment_state on public.marketplace_orders
for each row
execute function public.marketplace_sync_grouped_user_seller_payout();

revoke all on function public.marketplace_create_multi_listing_checkout(uuid[], uuid, uuid, text, text, text, integer, integer, jsonb)
from public, anon, authenticated;
revoke all on function public.marketplace_sync_grouped_user_seller_payout()
from public, anon, authenticated;

grant execute on function public.marketplace_create_multi_listing_checkout(uuid[], uuid, uuid, text, text, text, integer, integer, jsonb)
to service_role;
grant execute on function public.marketplace_sync_grouped_user_seller_payout()
to service_role;
