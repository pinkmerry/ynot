-- Reconcile the seller payout release gate with buyer disputes.
--
-- 20260704123000_marketplace_dispute_open_and_admin_reads.sql let buyers open
-- a dispute, which sets order.refund_state = 'requested'. An admin resolves
-- it via marketplace_record_refund_transition, moving refund_state to one of
-- 'approved' | 'rejected' | 'refunded'. A 'rejected' dispute means the
-- buyer's complaint was denied and the seller SHOULD still be paid, but the
-- release gate in marketplace_release_seller_payout (added in
-- 20260628130000_marketplace_ops_hardening.sql, carried over unchanged from
-- 20260628120000_marketplace_user_seller_purchase.sql) checks
-- `order_row.refund_state <> 'none'`, which stays tripped forever once a
-- dispute has been opened and rejected -- the honest seller's payout is
-- permanently stranded with no path to release.
--
-- The official-shop fulfilment RPC (marketplace_admin_update_official_order_
-- fulfilment, in 20260628100000_marketplace_official_shop.sql) already treats
-- a rejected dispute as a non-blocker via `refund_state in ('none', 'rejected')`.
-- This migration re-creates marketplace_release_seller_payout with the exact
-- same body, changing only that one clause so both RPCs agree: release is
-- blocked while a refund is pending ('requested') or granted ('approved',
-- 'refunded'), but allowed once a dispute has been rejected.

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

  select exists (
    select 1
    from public.marketplace_reconciliation_items item
    where item.reconciliation_state = 'open'
      and (
        item.order_id = order_row.id
        or (item.target_type = 'order' and item.target_id = order_row.id)
        or (item.target_type = 'payout' and item.target_id = payout_row.id)
        or (item.target_type = 'listing' and item.target_id = payout_row.listing_id)
      )
  ) into has_open_reconciliation;

  if payout_row.payout_state not in ('held', 'eligible')
    or order_row.payment_state <> 'paid'
    or order_row.fulfilment_state not in ('shipped', 'completed')
    or order_row.refund_state not in ('none', 'rejected')
    or has_open_reconciliation then
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

revoke all on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
to service_role;
