-- Marketplace money policy: trust controls (payout hold, dispute window,
-- auto-live listings, Slip2GO auto verification toggle).

alter table public.marketplace_money_policies
  add column if not exists payout_hold_days integer not null default 10,
  add column if not exists dispute_window_days integer not null default 3,
  add column if not exists listing_auto_live boolean not null default true,
  add column if not exists slip_auto_verify boolean not null default true;

alter table public.marketplace_money_policies
  drop constraint if exists marketplace_money_policies_payout_hold_days_check,
  add constraint marketplace_money_policies_payout_hold_days_check
    check (payout_hold_days between 0 and 30),
  drop constraint if exists marketplace_money_policies_dispute_window_days_check,
  add constraint marketplace_money_policies_dispute_window_days_check
    check (dispute_window_days between 0 and 14);

create or replace function public.marketplace_money_policy_json(policy_row public.marketplace_money_policies)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'policyId', policy_row.id,
    'sellerFeeBps', policy_row.seller_fee_bps,
    'buyerServiceFeeBps', policy_row.buyer_service_fee_bps,
    'shippingFeeSatang', policy_row.shipping_fee_satang,
    'currency', policy_row.currency,
    'calculationVersion', policy_row.calculation_version,
    'effectiveFrom', policy_row.effective_from,
    'adminNote', policy_row.admin_note,
    'payoutHoldDays', policy_row.payout_hold_days,
    'disputeWindowDays', policy_row.dispute_window_days,
    'listingAutoLive', policy_row.listing_auto_live,
    'slipAutoVerify', policy_row.slip_auto_verify
  );
$$;

drop function if exists public.marketplace_admin_set_money_policy(
  text,
  text,
  text,
  uuid,
  text,
  integer,
  integer,
  integer,
  text
);

create or replace function public.marketplace_admin_set_money_policy(
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_seller_fee_bps integer,
  p_buyer_service_fee_bps integer,
  p_shipping_fee_satang integer,
  p_admin_note text default null,
  p_payout_hold_days integer default null,
  p_dispute_window_days integer default null,
  p_listing_auto_live boolean default null,
  p_slip_auto_verify boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_idempotency public.marketplace_idempotency_keys;
  current_policy public.marketplace_money_policies;
  new_policy public.marketplace_money_policies;
  response jsonb;
  resolved_payout_hold_days integer;
  resolved_dispute_window_days integer;
  resolved_listing_auto_live boolean;
  resolved_slip_auto_verify boolean;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;

  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  if p_request_hash is null or length(p_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;

  if p_seller_fee_bps is null or p_seller_fee_bps < 0 or p_seller_fee_bps > 10000 then
    raise exception 'marketplace_seller_fee_invalid';
  end if;

  if p_buyer_service_fee_bps is null or p_buyer_service_fee_bps < 0 or p_buyer_service_fee_bps > 10000 then
    raise exception 'marketplace_buyer_service_fee_invalid';
  end if;

  if p_shipping_fee_satang is null or p_shipping_fee_satang < 0 or p_shipping_fee_satang > 1000000 then
    raise exception 'marketplace_shipping_fee_invalid';
  end if;

  if p_payout_hold_days is not null and (p_payout_hold_days < 0 or p_payout_hold_days > 30) then
    raise exception 'marketplace_payout_hold_days_invalid';
  end if;

  if p_dispute_window_days is not null and (p_dispute_window_days < 0 or p_dispute_window_days > 14) then
    raise exception 'marketplace_dispute_window_days_invalid';
  end if;

  select *
  into existing_idempotency
  from public.marketplace_idempotency_keys
  where ynot_profile_id = p_admin_profile_id
    and scope = 'money_policy.update'
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing_idempotency.request_hash <> p_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    return existing_idempotency.response_payload;
  end if;

  perform pg_advisory_xact_lock(hashtext('marketplace_money_policy_active'));

  select *
  into current_policy
  from public.marketplace_money_policies
  where policy_state = 'active'
  order by effective_from desc
  limit 1;

  resolved_payout_hold_days := coalesce(p_payout_hold_days, current_policy.payout_hold_days, 10);
  resolved_dispute_window_days := coalesce(p_dispute_window_days, current_policy.dispute_window_days, 3);
  resolved_listing_auto_live := coalesce(p_listing_auto_live, current_policy.listing_auto_live, true);
  resolved_slip_auto_verify := coalesce(p_slip_auto_verify, current_policy.slip_auto_verify, true);

  update public.marketplace_money_policies
  set
    policy_state = 'archived',
    effective_to = now()
  where policy_state = 'active';

  insert into public.marketplace_money_policies (
    policy_state,
    seller_fee_bps,
    buyer_service_fee_bps,
    shipping_fee_satang,
    currency,
    calculation_version,
    created_by_ynot_profile_id,
    created_by_admin_role,
    admin_note,
    payout_hold_days,
    dispute_window_days,
    listing_auto_live,
    slip_auto_verify
  )
  values (
    'active',
    p_seller_fee_bps,
    p_buyer_service_fee_bps,
    p_shipping_fee_satang,
    'THB',
    1,
    p_admin_profile_id,
    p_admin_role,
    nullif(left(coalesce(p_admin_note, ''), 1000), ''),
    resolved_payout_hold_days,
    resolved_dispute_window_days,
    resolved_listing_auto_live,
    resolved_slip_auto_verify
  )
  returning * into new_policy;

  insert into public.marketplace_audit_events (
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  )
  values (
    p_admin_profile_id,
    p_admin_role,
    'money_policy_updated',
    jsonb_build_object(
      'policyId', new_policy.id,
      'sellerFeeBps', new_policy.seller_fee_bps,
      'buyerServiceFeeBps', new_policy.buyer_service_fee_bps,
      'shippingFeeSatang', new_policy.shipping_fee_satang,
      'currency', new_policy.currency,
      'calculationVersion', new_policy.calculation_version,
      'payoutHoldDays', new_policy.payout_hold_days,
      'disputeWindowDays', new_policy.dispute_window_days,
      'listingAutoLive', new_policy.listing_auto_live,
      'slipAutoVerify', new_policy.slip_auto_verify
    ),
    p_request_id
  );

  response := jsonb_build_object(
    'policy', public.marketplace_money_policy_json(new_policy)
  );

  insert into public.marketplace_idempotency_keys (
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    response_payload
  )
  values (
    p_admin_profile_id,
    'money_policy.update',
    p_idempotency_key,
    p_request_hash,
    response
  );

  return response;
end;
$$;

revoke all on function public.marketplace_admin_set_money_policy(
  text,
  text,
  text,
  uuid,
  text,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  boolean,
  boolean
)
from public, anon, authenticated;

grant execute on function public.marketplace_admin_set_money_policy(
  text,
  text,
  text,
  uuid,
  text,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  boolean,
  boolean
)
to service_role;
