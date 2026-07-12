-- Optimistic-concurrency guard for the money-policy money path.
--
-- Review finding on d678a267: marketplace_admin_set_money_policy
-- (20260704120000_marketplace_money_policy_trust_controls.sql:55-231) takes
-- no expected-state parameter and never conditions its write on which
-- policy row is currently active. Both admin writers of this RPC --
-- FeesSettingsForm.tsx (the fuller settings screen) and the overview
-- page's MarketplaceMoneyPolicyControls.tsx -- always send sellerFeeBps/
-- buyerServiceFeeBps/shippingFeeSatang sourced from whatever policy they
-- last rendered, so two admins (or one admin in two tabs) editing at the
-- same time can silently clobber each other: the RPC always archives
-- whatever row is currently policy_state = 'active' and inserts a
-- brand-new row (lines 146-182), so a stale save from one tab can archive
-- the just-saved row from the other tab and revert its fee changes, with
-- no error raised to either admin.
--
-- marketplace_record_refund_transition's p_expected_refund_state
-- (20260712100000_marketplace_refund_transition_expected_state.sql) is
-- this codebase's existing convention for this exact class of guard. This
-- migration applies the same idea here, adapted to how this RPC
-- identifies "the current state": the refund RPC keys off a single row's
-- id passed in by the caller and compares a status column on that row;
-- this RPC instead takes no caller-supplied row id at all -- it looks up
-- "the active policy" itself (`where policy_state = 'active' order by
-- effective_from desc limit 1`) and always creates a brand-new row on
-- every write, archiving whatever was active before. So the "current
-- active policy" is keyed by that lookup's id, and the guard compares the
-- id of the row the lookup just found (current_policy.id) against the id
-- the caller says it expects (p_expected_policy_id) -- not a status
-- column, since this RPC has no per-row status to go stale, only "is this
-- still the active row."
--
-- The precondition sits immediately after the current_policy lookup and
-- before any of its columns are read for the coalesce() fallbacks that
-- follow (resolved_payout_hold_days etc.) -- same placement rationale as
-- the refund migration: keep the existing read structure intact, and
-- fail before any field of a possibly-stale row is used for anything.
--
-- The function's parameter list changes (a trailing p_expected_policy_id
-- uuid default null is appended), so per this codebase's convention for
-- widening an RPC signature (see 20260712100000_marketplace_refund_
-- transition_expected_state.sql and its own cited precedents), the old
-- 13-parameter overload is dropped first -- otherwise `create or replace`
-- with a different parameter list creates a second overload instead of
-- replacing the original, and PostgREST's named-parameter RPC dispatch
-- would become ambiguous between the two.
--
-- default null preserves every existing caller unchanged: omitting the
-- new parameter (or passing null) skips the precondition entirely, same
-- as today.

drop function if exists public.marketplace_admin_set_money_policy(
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
  p_slip_auto_verify boolean default null,
  p_expected_policy_id uuid default null
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

  if p_expected_policy_id is not null and current_policy.id is distinct from p_expected_policy_id then
    raise exception 'marketplace_money_policy_stale';
  end if;

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
  boolean,
  uuid
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
  boolean,
  uuid
)
to service_role;
