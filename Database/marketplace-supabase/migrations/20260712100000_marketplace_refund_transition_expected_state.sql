-- Optimistic-concurrency guard for the refund-transition money path.
--
-- Review finding on ee419d7d: marketplace_record_refund_transition
-- (20260628130000_marketplace_ops_hardening.sql:603-756) takes no
-- expected-state parameter and never conditions its update on the refund
-- request's current refund_state. The admin Disputes screen
-- (DisputeActions.tsx) derives its action buttons from the refund_state it
-- last rendered, so two admins with the same dispute open in separate tabs
-- can both fire a transition: a stale "approved" tab can re-fire
-- approved -> refunded after another admin already marked it refunded
-- (double-appending admin_note and overwriting money_snapshot.
-- refundProviderReference), or a stale "requested" tab can fire "rejected"
-- after another admin already approved it.
--
-- marketplace_admin_resolve_listing_report (20260704121000_marketplace_
-- listing_reports.sql:98-107) is this codebase's existing stale-guard
-- convention: `where id = p_report_id and report_state = 'open'` plus
-- `raise exception 'marketplace_report_not_open'` when the conditional
-- update finds no row. This migration applies the same idea to the refund
-- transition RPC, but as an explicit precondition rather than folding it
-- into a WHERE clause -- the original function already does a
-- `select ... for update` read of the refund row before its state-machine
-- checks, and moving the staleness check into the WHERE clause of the
-- later `update` would change lock semantics and make a "0 rows updated"
-- result ambiguous with other failure modes further down (idempotency
-- replay, order-not-found). Checking right after the row is loaded keeps
-- that read/lock structure intact and gives a specific, distinguishable
-- error.
--
-- The function's parameter list changes (a trailing
-- p_expected_refund_state text default null is appended), so per this
-- codebase's convention for widening an RPC signature (see e.g.
-- 20260630143000_marketplace_pending_order_expiry.sql,
-- 20260628150000_marketplace_official_admin_controls.sql), the old
-- 9-parameter overload is dropped first -- otherwise `create or replace`
-- with a different parameter list creates a second overload instead of
-- replacing the original, and PostgREST's named-parameter RPC dispatch
-- would become ambiguous between the two.
--
-- default null preserves every existing caller unchanged: omitting the
-- new parameter (or passing null) skips the precondition entirely, same
-- as today.

drop function if exists public.marketplace_record_refund_transition(uuid, text, text, text, uuid, text, text, text, text);

create or replace function public.marketplace_record_refund_transition(
  p_refund_request_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_refund_state text,
  p_provider_reference text,
  p_admin_note text,
  p_expected_refund_state text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  refund_row public.marketplace_refund_requests%rowtype;
  order_row public.marketplace_orders%rowtype;
  command_row public.marketplace_admin_commands%rowtype;
  normalized_state text := nullif(trim(coalesce(p_refund_state, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_state not in ('approved', 'rejected', 'refunded') then
    raise exception 'marketplace_refund_state_invalid';
  end if;
  if normalized_state = 'refunded' and nullif(trim(coalesce(p_provider_reference, '')), '') is null then
    raise exception 'marketplace_evidence_required';
  end if;
  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'marketplace_admin_note_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  select * into refund_row
  from public.marketplace_refund_requests
  where id = p_refund_request_id
  for update;

  if refund_row.id is null then
    raise exception 'marketplace_refund_not_found';
  end if;

  if p_expected_refund_state is not null and refund_row.refund_state is distinct from p_expected_refund_state then
    raise exception 'marketplace_refund_state_stale';
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = refund_row.order_id
  for update;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;
  if refund_row.refund_amount_satang > order_row.buyer_total_satang then
    raise exception 'marketplace_refund_amount_invalid';
  end if;

  insert into public.marketplace_admin_commands(
    command_name,
    target_type,
    target_id,
    actor_ynot_profile_id,
    actor_admin_role,
    idempotency_key,
    request_hash,
    command_payload,
    request_id
  ) values (
    'refund.record_result',
    'refund',
    p_refund_request_id,
    p_admin_profile_id,
    p_admin_role,
    normalized_idempotency_key,
    normalized_request_hash,
    jsonb_build_object('refundState', normalized_state),
    p_request_id
  )
  on conflict (actor_ynot_profile_id, command_name, idempotency_key) do nothing
  returning * into command_row;

  if command_row.id is null then
    select * into command_row
    from public.marketplace_admin_commands
    where actor_ynot_profile_id = p_admin_profile_id
      and command_name = 'refund.record_result'
      and idempotency_key = normalized_idempotency_key;
    if command_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if command_row.result_payload is not null then
      return command_row.result_payload;
    end if;
    raise exception 'marketplace_admin_command_replay_incomplete';
  end if;

  update public.marketplace_refund_requests
  set refund_state = normalized_state,
      admin_note = concat_ws(E'\n', nullif(admin_note, ''), trim(p_admin_note))
  where id = refund_row.id
  returning * into refund_row;

  update public.marketplace_orders
  set refund_state = normalized_state,
      payment_state = case when normalized_state = 'refunded' then 'refunded' else payment_state end,
      fulfilment_state = case when normalized_state = 'refunded' then 'refunded' else fulfilment_state end,
      money_snapshot = money_snapshot || jsonb_build_object(
        'refundRequestId', refund_row.id,
        'refundState', normalized_state,
        'refundProviderReference', nullif(trim(coalesce(p_provider_reference, '')), '')
      )
  where id = order_row.id
  returning * into order_row;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    order_row.buyer_marketplace_account_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_refund_result_recorded',
    jsonb_build_object(
      'orderId', order_row.id,
      'refundRequestId', refund_row.id,
      'refundState', refund_row.refund_state,
      'refundAmountSatang', refund_row.refund_amount_satang
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'orderId', order_row.id,
    'refundRequestId', refund_row.id,
    'refundState', refund_row.refund_state,
    'paymentState', order_row.payment_state
  );

  update public.marketplace_admin_commands
  set result_payload = rpc_response_payload
  where id = command_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_record_refund_transition(uuid, text, text, text, uuid, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_record_refund_transition(uuid, text, text, text, uuid, text, text, text, text, text)
to service_role;
