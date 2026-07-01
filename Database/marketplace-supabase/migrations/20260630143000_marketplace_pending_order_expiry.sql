-- Expire unpaid marketplace bank-transfer orders and release reserved inventory.
--
-- This job is intentionally service-role only. Browser users can cancel their
-- own pending order through the release RPC, but scheduled expiry is an
-- operational action because it scans multiple buyers.

create index if not exists marketplace_pending_orders_expiry_job_idx
  on public.marketplace_pending_payment_orders(expires_at, id)
  where order_state = 'pending_payment';

drop function if exists public.marketplace_expire_pending_payment_orders(text, integer);

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
    select *
    from public.marketplace_pending_payment_orders
    where order_state = 'pending_payment'
      and expires_at <= now()
    order by expires_at asc, id asc
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

revoke all on function public.marketplace_expire_pending_payment_orders(text, integer)
from public, anon, authenticated;

grant execute on function public.marketplace_expire_pending_payment_orders(text, integer)
to service_role;
