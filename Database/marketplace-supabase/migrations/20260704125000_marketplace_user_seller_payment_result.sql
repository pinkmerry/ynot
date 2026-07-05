-- User-seller counterpart to marketplace_record_official_payment_result
-- (20260628100000_marketplace_official_shop.sql, lines ~1241-1447).
--
-- Why this exists: admin manual payment approval currently only works for
-- official orders. A user_seller order whose slip fails Slip2GO verification
-- sits in payment_state = 'payment_submitted' with no admin approve/reject
-- path -- marketplace_apply_provider_payment_event (20260628130000_marketplace_
-- ops_hardening.sql) only logs provider events into
-- marketplace_reconciliation_items / marketplace_provider_payment_events, it
-- never flips marketplace_orders.payment_state. The RPC that actually moves
-- money for user_seller orders is marketplace_submit_marketplace_payment_proof
-- (20260628120000_marketplace_user_seller_purchase.sql, lines ~868-960), which
-- an admin cannot call directly (it requires a buyer-submitted payment proof
-- row and buyer account/session context).
--
-- This migration adds marketplace_record_user_seller_payment_result, which
-- copies the admin-command skeleton of marketplace_record_official_payment_
-- result (owner-only guard, payment_state/evidence guards, idempotency
-- insert-or-replay, for-update row locks, audit event, cached response
-- replay) and reproduces the exact paid/failed money-state transitions of
-- marketplace_submit_marketplace_payment_proof's valid and reject branches,
-- scoped to listing_source = 'user_seller' orders and additionally flipping
-- the marketplace_seller_payouts row that only exists for user_seller orders.

create or replace function public.marketplace_record_user_seller_payment_result(
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
  payout_row public.marketplace_seller_payouts%rowtype;
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
    p_admin_profile_id, 'user_seller_order.payment_result', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'user_seller_order.payment_result'
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
    and listing_source = 'user_seller'
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

  select * into payout_row
  from public.marketplace_seller_payouts
  where order_id = order_row.id
  for update;

  if order_row.payment_state not in ('pending_payment', 'payment_submitted') then
    raise exception 'marketplace_payment_state_invalid';
  end if;

  if normalized_payment_state = 'paid' then
    if p_provider_amount_satang <> order_row.buyer_total_satang then
      raise exception 'marketplace_payment_amount_mismatch';
    end if;

    update public.marketplace_pending_payment_orders
    set order_state = 'paid'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'paid',
        seller_payout_state = 'held',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentApprovedAt', now(),
          'manualPaymentApprovedBy', p_admin_profile_id,
          'manualPaymentProviderReference', normalized_provider_reference,
          'manualPaymentProviderAmountSatang', p_provider_amount_satang,
          'manualPaymentProviderCurrency', normalized_provider_currency,
          'adminNote', nullif(trim(coalesce(p_admin_note, '')), ''),
          'paidAt', now()
        )
    where id = order_row.id
    returning * into order_row;

    update public.marketplace_listing_snapshots
    set listing_state = 'sold',
        seller_payout_state = 'held'
    where listing_id = order_row.listing_id;

    if payout_row.id is not null then
      update public.marketplace_seller_payouts
      set payout_state = 'held',
          release_eligible_at = now()
      where id = payout_row.id
      returning * into payout_row;
    end if;
  else
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
    where listing_id = pending_row.listing_id;

    if payout_row.id is not null then
      update public.marketplace_seller_payouts
      set payout_state = 'cancelled'
      where id = payout_row.id
      returning * into payout_row;
    end if;

    update public.marketplace_pending_payment_orders
    set order_state = 'cancelled'
    where id = pending_row.id
    returning * into pending_row;

    update public.marketplace_orders
    set payment_state = 'failed',
        fulfilment_state = 'cancelled',
        seller_payout_state = 'cancelled',
        money_snapshot = money_snapshot || jsonb_build_object(
          'manualPaymentRejectedAt', now(),
          'manualPaymentRejectedBy', p_admin_profile_id,
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
    'marketplace_user_seller_payment_manual_result',
    jsonb_build_object(
      'orderId', order_row.id,
      'pendingPaymentOrderId', pending_row.id,
      'payoutId', payout_row.id,
      'paymentState', order_row.payment_state,
      'sellerPayoutState', order_row.seller_payout_state,
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
    'payoutId', payout_row.id,
    'paymentState', order_row.payment_state,
    'fulfilmentState', order_row.fulfilment_state,
    'sellerPayoutState', order_row.seller_payout_state,
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

revoke all on function public.marketplace_record_user_seller_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_record_user_seller_payment_result(uuid, text, text, text, uuid, text, text, text, integer, text, text)
to service_role;
