-- Buyer-opened disputes and admin order/GMV read RPCs.
--
-- Buyer disputes reuse marketplace_refund_requests (originally admin-only
-- shaped) rather than a new table: a dispute IS a refund request, just one
-- opened by the buyer instead of an admin. The existing admin resolution
-- RPC (marketplace_record_refund_transition, in the ops-hardening
-- migration) already reads admin_note null-safely via concat_ws and takes
-- p_admin_role as a parameter rather than reading the row's
-- actor_admin_role column, so relaxing those two columns to nullable does
-- not change any existing admin flow.
--
-- Also adds two read-only admin aggregates (order list, daily GMV) that
-- follow the same bounded jsonb_agg-over-a-limited-subquery shape as
-- marketplace_admin_list_listing_reports, to avoid the PostgREST 1000-row
-- response cap on an unbounded select.

alter table public.marketplace_refund_requests
  add column if not exists opened_by text not null default 'admin'
    check (opened_by in ('buyer', 'admin')),
  add column if not exists buyer_marketplace_account_id uuid
    references public.marketplace_accounts(id) on delete restrict,
  add column if not exists buyer_reason text
    check (buyer_reason is null or char_length(buyer_reason) between 10 and 1000);

alter table public.marketplace_refund_requests
  alter column admin_note drop not null,
  alter column actor_admin_role drop not null;

-- The two dropped-and-recreated constraints below were originally inline
-- single-column checks in 20260628100000_marketplace_official_shop.sql, so
-- Postgres auto-named them "<table>_<column>_check". Recreate them tolerant
-- of null so buyer-opened rows (which carry no admin_note/actor_admin_role)
-- remain valid, while admin-authored rows keep the original bounds.
alter table public.marketplace_refund_requests
  drop constraint if exists marketplace_refund_requests_admin_note_check,
  add constraint marketplace_refund_requests_admin_note_check
    check (admin_note is null or char_length(admin_note) between 3 and 2000),
  drop constraint if exists marketplace_refund_requests_actor_admin_role_check,
  add constraint marketplace_refund_requests_actor_admin_role_check
    check (actor_admin_role is null or actor_admin_role in ('owner', 'admin', 'staff'));

-- One open dispute/refund per order, whether opened by a buyer or an
-- admin. This index only fails to create if duplicate open requests
-- already exist for the same order; on a fresh apply there are none.
create unique index if not exists marketplace_refund_requests_one_open_per_order_idx
  on public.marketplace_refund_requests(order_id)
  where refund_state = 'requested';

create or replace function public.marketplace_open_buyer_refund_request(
  p_order_id uuid,
  p_account_id uuid,
  p_reason text,
  p_buyer_ynot_profile_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
  policy_row public.marketplace_money_policies%rowtype;
  v_window_days integer;
  v_refund public.marketplace_refund_requests%rowtype;
begin
  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;

  if order_row.buyer_marketplace_account_id <> p_account_id then
    -- Do not distinguish "not yours" from "does not exist" to avoid
    -- leaking order existence to a buyer who is not the owner.
    raise exception 'marketplace_order_not_found';
  end if;

  if order_row.fulfilment_state <> 'completed' then
    raise exception 'marketplace_dispute_not_deliverable';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'marketplace_dispute_reason_invalid';
  end if;

  select *
  into policy_row
  from public.marketplace_money_policies
  where policy_state = 'active'
  order by effective_from desc
  limit 1;

  v_window_days := coalesce(policy_row.dispute_window_days, 3);

  -- WARNING: updated_at is an imprecise delivery proxy. marketplace_orders
  -- has no dedicated completion timestamp, and the touch-updated-at trigger
  -- bumps updated_at on EVERY order write, so any later update (e.g. a payout
  -- release writing money_snapshot) pushes updated_at forward and thereby
  -- EXTENDS the buyer's dispute window (it can never shrink it). The correct
  -- future fix is a dedicated completed_at anchor set exactly once at
  -- fulfilment completion and read here instead of updated_at.
  if now() > order_row.updated_at + (v_window_days || ' days')::interval then
    raise exception 'marketplace_dispute_window_closed';
  end if;

  insert into public.marketplace_refund_requests(
    order_id,
    refund_state,
    reason_code,
    admin_note,
    refund_amount_satang,
    actor_ynot_profile_id,
    actor_admin_role,
    opened_by,
    buyer_marketplace_account_id,
    buyer_reason
  ) values (
    p_order_id,
    'requested',
    'buyer_dispute',
    null,
    order_row.buyer_total_satang,
    p_buyer_ynot_profile_id,
    null,
    'buyer',
    p_account_id,
    trim(p_reason)
  )
  on conflict do nothing
  returning * into v_refund;

  if v_refund.id is null then
    raise exception 'marketplace_dispute_already_open';
  end if;

  update public.marketplace_orders
  set refund_state = 'requested'
  where id = p_order_id;

  -- Defense-in-depth: pull any not-yet-released payout for this order back
  -- to 'held' so it cannot be released while a dispute is open. This covers
  -- a still-'held' payout (the only state the schema currently produces,
  -- since the held->eligible maturation implied by payout_hold_days is not
  -- built yet) and a matured 'eligible' payout once that path exists. A
  -- payout already 'released' or 'paid' is left alone because the money has
  -- already moved. The authoritative protection is the
  -- refund_state not in ('none', 'rejected') gate in
  -- marketplace_release_seller_payout (see 20260704124000), which the order's
  -- refund_state = 'requested' set just above already trips under the
  -- order-row lock held by this transaction.
  update public.marketplace_seller_payouts
  set payout_state = 'held'
  where order_id = p_order_id
    and payout_state in ('held', 'eligible');

  -- Buyer-safe minimal projection: never return amounts, seller
  -- identity, or admin fields to the buyer who opened the dispute.
  return jsonb_build_object(
    'id', v_refund.id,
    'refund_state', v_refund.refund_state,
    'created_at', v_refund.created_at
  );
end $$;

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
      ord.buyer_total_satang,
      ord.payment_state,
      ord.fulfilment_state,
      ord.created_at
    from public.marketplace_orders ord
    left join public.marketplace_seller_payouts pay on pay.order_id = ord.id
    where p_state is null or ord.payment_state = p_state
    order by ord.created_at desc
    limit greatest(p_limit, 1)
  ) o;
$$;

create or replace function public.marketplace_admin_daily_gmv(
  p_days integer default 30
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc), '[]'::jsonb)
  from (
    select
      date_trunc('day', created_at) as day,
      sum(buyer_total_satang)::bigint as gmv_satang,
      count(*)::int as order_count
    from public.marketplace_orders
    where payment_state = 'paid'
      -- marketplace_orders has no paid_at column; created_at is used as
      -- the payment-day proxy, which is close enough for a trailing-
      -- window admin dashboard.
      and created_at >= now() - (greatest(p_days, 1) || ' days')::interval
    group by 1
  ) d;
$$;

revoke all on function public.marketplace_open_buyer_refund_request(uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_list_orders(text, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_daily_gmv(integer)
from public, anon, authenticated;

grant execute on function public.marketplace_open_buyer_refund_request(uuid, uuid, text, uuid)
to service_role;
grant execute on function public.marketplace_admin_list_orders(text, integer)
to service_role;
grant execute on function public.marketplace_admin_daily_gmv(integer)
to service_role;
