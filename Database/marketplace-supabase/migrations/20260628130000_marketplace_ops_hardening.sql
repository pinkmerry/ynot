-- Slice 5 Marketplace money/ops hardening.
--
-- Rollback posture:
-- - Disable webhook/admin ops routes at the application layer.
-- - Keep provider event, command, reconciliation, refund, and audit rows for
--   accounting evidence.

create extension if not exists pgcrypto;

create or replace function public.marketplace_admin_command_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'UPDATE'
    and OLD.result_payload is null
    and NEW.result_payload is not null
    and NEW.id is not distinct from OLD.id
    and NEW.command_name is not distinct from OLD.command_name
    and NEW.target_type is not distinct from OLD.target_type
    and NEW.target_id is not distinct from OLD.target_id
    and NEW.actor_ynot_profile_id is not distinct from OLD.actor_ynot_profile_id
    and NEW.actor_admin_role is not distinct from OLD.actor_admin_role
    and NEW.idempotency_key is not distinct from OLD.idempotency_key
    and NEW.request_hash is not distinct from OLD.request_hash
    and NEW.command_payload is not distinct from OLD.command_payload
    and NEW.request_id is not distinct from OLD.request_id
    and NEW.created_at is not distinct from OLD.created_at then
    return NEW;
  end if;

  raise exception 'marketplace_admin_commands_append_only';
end;
$$;

create table if not exists public.marketplace_provider_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('slip2go', 'manual')),
  provider_event_id text not null check (length(provider_event_id) between 6 and 200),
  provider_event_key text not null unique check (length(provider_event_key) between 10 and 260),
  payload_hash text not null check (length(payload_hash) = 64),
  event_type text not null check (length(event_type) between 3 and 120),
  processing_state text not null default 'received'
    check (processing_state in ('received', 'applied', 'replayed', 'conflict', 'reconciliation_required', 'rejected')),
  order_id uuid references public.marketplace_orders(id) on delete restrict,
  pending_payment_order_id uuid references public.marketplace_pending_payment_orders(id) on delete restrict,
  payment_state text check (payment_state in ('paid', 'failed', 'payment_submitted')),
  provider_amount_satang integer check (provider_amount_satang is null or provider_amount_satang >= 0),
  provider_currency text check (provider_currency is null or provider_currency = 'THB'),
  receiver_reference text check (receiver_reference is null or length(receiver_reference) <= 120),
  payload_redacted jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  request_id text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.marketplace_admin_commands (
  id uuid primary key default gen_random_uuid(),
  command_name text not null check (length(command_name) between 3 and 120),
  target_type text not null check (target_type in ('inventory', 'listing', 'order', 'payment', 'refund', 'shipment', 'payout', 'reconciliation')),
  target_id uuid not null,
  actor_ynot_profile_id uuid not null,
  actor_admin_role text not null check (actor_admin_role in ('owner', 'admin', 'staff')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_hash text not null check (length(request_hash) between 16 and 200),
  command_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  unique (actor_ynot_profile_id, command_name, idempotency_key)
);

create table if not exists public.marketplace_audit_event_targets (
  id uuid primary key default gen_random_uuid(),
  audit_event_id uuid not null references public.marketplace_audit_events(id) on delete cascade,
  target_type text not null check (target_type in ('inventory', 'listing', 'order', 'payment', 'refund', 'shipment', 'payout', 'reconciliation')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (audit_event_id, target_type, target_id)
);

alter table public.marketplace_reconciliation_items
  add column if not exists target_type text not null default 'order'
    check (target_type in ('order', 'payment', 'refund', 'payout', 'listing', 'inventory')),
  add column if not exists target_id uuid,
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists assigned_admin_profile_id uuid,
  add column if not exists resolution_note text,
  add column if not exists resolved_by_ynot_profile_id uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists reopened_at timestamptz;

update public.marketplace_reconciliation_items
set target_id = coalesce(target_id, order_id)
where target_id is null
  and order_id is not null;

create index if not exists marketplace_provider_payment_events_key_idx
  on public.marketplace_provider_payment_events(provider_event_key);
create index if not exists marketplace_provider_payment_events_order_idx
  on public.marketplace_provider_payment_events(order_id, received_at desc);
create index if not exists marketplace_provider_payment_events_state_idx
  on public.marketplace_provider_payment_events(processing_state, received_at desc);
create index if not exists marketplace_admin_commands_target_idx
  on public.marketplace_admin_commands(target_type, target_id, created_at desc);
create index if not exists marketplace_admin_commands_actor_idx
  on public.marketplace_admin_commands(actor_ynot_profile_id, created_at desc);
create index if not exists marketplace_audit_event_targets_lookup_idx
  on public.marketplace_audit_event_targets(target_type, target_id, created_at desc, audit_event_id);
create index if not exists marketplace_reconciliation_items_target_state_idx
  on public.marketplace_reconciliation_items(target_type, target_id, reconciliation_state, updated_at desc);
create index if not exists marketplace_reconciliation_items_open_order_idx
  on public.marketplace_reconciliation_items(order_id, reconciliation_state)
  where reconciliation_state = 'open';

insert into public.marketplace_audit_event_targets(
  audit_event_id,
  target_type,
  target_id,
  created_at
)
select
  audit_event.id,
  mapping.target_type,
  (audit_event.event_payload ->> mapping.payload_key)::uuid,
  audit_event.created_at
from public.marketplace_audit_events audit_event
cross join (
  values
    ('order', 'orderId'),
    ('listing', 'listingId'),
    ('inventory', 'inventoryItemId'),
    ('payment', 'paymentId'),
    ('refund', 'refundRequestId'),
    ('shipment', 'shipmentId'),
    ('payout', 'payoutId'),
    ('payout', 'sellerPayoutId'),
    ('reconciliation', 'reconciliationItemId')
) as mapping(target_type, payload_key)
where (audit_event.event_payload ->> mapping.payload_key) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
on conflict (audit_event_id, target_type, target_id) do nothing;

create or replace function public.marketplace_collect_audit_event_targets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mapping record;
  candidate_id text;
begin
  for mapping in
    select * from (
      values
        ('order', 'orderId'),
        ('listing', 'listingId'),
        ('inventory', 'inventoryItemId'),
        ('payment', 'paymentId'),
        ('refund', 'refundRequestId'),
        ('shipment', 'shipmentId'),
        ('payout', 'payoutId'),
        ('payout', 'sellerPayoutId'),
        ('reconciliation', 'reconciliationItemId')
    ) as target_mapping(target_type, payload_key)
  loop
    candidate_id := NEW.event_payload ->> mapping.payload_key;
    if candidate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$' then
      insert into public.marketplace_audit_event_targets(
        audit_event_id,
        target_type,
        target_id,
        created_at
      ) values (
        NEW.id,
        mapping.target_type,
        candidate_id::uuid,
        NEW.created_at
      )
      on conflict (audit_event_id, target_type, target_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists marketplace_audit_events_collect_targets on public.marketplace_audit_events;
create trigger marketplace_audit_events_collect_targets
after insert on public.marketplace_audit_events
for each row execute function public.marketplace_collect_audit_event_targets();

drop trigger if exists marketplace_provider_payment_events_touch_updated_at on public.marketplace_provider_payment_events;
create trigger marketplace_provider_payment_events_touch_updated_at
before update on public.marketplace_provider_payment_events
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_admin_commands_no_update on public.marketplace_admin_commands;
create trigger marketplace_admin_commands_no_update
before update on public.marketplace_admin_commands
for each row execute function public.marketplace_admin_command_append_only();

drop trigger if exists marketplace_admin_commands_no_delete on public.marketplace_admin_commands;
create trigger marketplace_admin_commands_no_delete
before delete on public.marketplace_admin_commands
for each row execute function public.marketplace_admin_command_append_only();

alter table public.marketplace_provider_payment_events enable row level security;
alter table public.marketplace_admin_commands enable row level security;
alter table public.marketplace_audit_event_targets enable row level security;

revoke all on
  public.marketplace_provider_payment_events,
  public.marketplace_admin_commands,
  public.marketplace_audit_event_targets,
  public.marketplace_reconciliation_items
from public, anon, authenticated;

grant all on
  public.marketplace_provider_payment_events,
  public.marketplace_admin_commands,
  public.marketplace_audit_event_targets,
  public.marketplace_reconciliation_items
to service_role;

create or replace function public.marketplace_apply_provider_payment_event(
  p_provider text,
  p_provider_event_id text,
  p_payload_hash text,
  p_event_type text,
  p_order_id uuid,
  p_payment_state text,
  p_provider_amount_satang integer,
  p_provider_currency text,
  p_receiver_reference text default null,
  p_payload_redacted jsonb default '{}'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_provider text := nullif(trim(coalesce(p_provider, '')), '');
  normalized_event_id text := nullif(trim(coalesce(p_provider_event_id, '')), '');
  normalized_event_key text;
  normalized_payload_hash text := lower(nullif(trim(coalesce(p_payload_hash, '')), ''));
  normalized_payment_state text := nullif(trim(coalesce(p_payment_state, '')), '');
  normalized_currency text := upper(nullif(trim(coalesce(p_provider_currency, '')), ''));
  normalized_receiver_reference text := nullif(trim(coalesce(p_receiver_reference, '')), '');
  provider_row public.marketplace_provider_payment_events%rowtype;
  order_row public.marketplace_orders%rowtype;
  reconciliation_reason text;
  reconciliation_priority text := 'normal';
  rpc_response_payload jsonb;
begin
  if normalized_provider not in ('slip2go', 'manual') then
    raise exception 'marketplace_provider_invalid';
  end if;
  if normalized_event_id is null then
    raise exception 'marketplace_provider_event_id_required';
  end if;
  if normalized_payload_hash is null or normalized_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'marketplace_provider_payload_hash_invalid';
  end if;
  if normalized_payment_state not in ('paid', 'failed', 'payment_submitted') then
    raise exception 'marketplace_payment_state_invalid';
  end if;
  if p_provider_amount_satang is null or p_provider_amount_satang < 0 then
    raise exception 'marketplace_provider_amount_invalid';
  end if;
  if normalized_currency <> 'THB' then
    raise exception 'marketplace_provider_currency_invalid';
  end if;

  normalized_event_key := normalized_provider || ':' || normalized_event_id;

  insert into public.marketplace_provider_payment_events(
    provider,
    provider_event_id,
    provider_event_key,
    payload_hash,
    event_type,
    processing_state,
    order_id,
    payment_state,
    provider_amount_satang,
    provider_currency,
    receiver_reference,
    payload_redacted,
    request_id
  ) values (
    normalized_provider,
    normalized_event_id,
    normalized_event_key,
    normalized_payload_hash,
    p_event_type,
    'received',
    null,
    normalized_payment_state,
    p_provider_amount_satang,
    normalized_currency,
    normalized_receiver_reference,
    coalesce(p_payload_redacted, '{}'::jsonb),
    p_request_id
  )
  on conflict (provider_event_key) do nothing
  returning * into provider_row;

  if provider_row.id is null then
    select * into provider_row
    from public.marketplace_provider_payment_events
    where provider_event_key = normalized_event_key
    for update;

    if provider_row.payload_hash <> normalized_payload_hash then
      update public.marketplace_provider_payment_events
      set processing_state = 'conflict'
      where id = provider_row.id;
      raise exception 'marketplace_provider_event_payload_conflict';
    end if;

    if provider_row.result_payload is not null then
      return provider_row.result_payload || jsonb_build_object('replayed', true);
    end if;
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
  for update;

  if order_row.id is null then
    insert into public.marketplace_reconciliation_items(
      order_id,
      target_type,
      target_id,
      reconciliation_state,
      reason_code,
      reconciliation_payload,
      request_id
    ) values (
      null,
      'payment',
      provider_row.id,
      'open',
      'provider_order_not_found',
      jsonb_build_object(
        'provider', normalized_provider,
        'providerEventId', normalized_event_id,
        'payloadHash', normalized_payload_hash,
        'providerAmountSatang', p_provider_amount_satang,
        'providerCurrency', normalized_currency
      ),
      p_request_id
    );

    rpc_response_payload := jsonb_build_object(
      'providerEventId', normalized_event_id,
      'processingState', 'reconciliation_required'
    );

    update public.marketplace_provider_payment_events
    set processing_state = 'reconciliation_required',
        result_payload = rpc_response_payload
    where id = provider_row.id;

    return rpc_response_payload;
  end if;

  update public.marketplace_provider_payment_events
  set order_id = order_row.id,
      pending_payment_order_id = order_row.pending_payment_order_id
  where id = provider_row.id
  returning * into provider_row;

  reconciliation_reason := 'provider_payment_requires_admin_review';
  if order_row.buyer_total_satang <> p_provider_amount_satang
    or order_row.currency <> normalized_currency then
    reconciliation_reason := 'provider_money_mismatch';
    reconciliation_priority := 'high';
  end if;

  insert into public.marketplace_reconciliation_items(
    order_id,
    target_type,
    target_id,
    priority,
    reconciliation_state,
    reason_code,
    reconciliation_payload,
    request_id
  ) values (
    order_row.id,
    'payment',
    provider_row.id,
    reconciliation_priority,
    'open',
    reconciliation_reason,
    jsonb_build_object(
      'orderId', order_row.id,
      'pendingPaymentOrderId', order_row.pending_payment_order_id,
      'provider', normalized_provider,
      'providerEventId', normalized_event_id,
      'payloadHash', normalized_payload_hash,
      'providerPaymentState', normalized_payment_state,
      'providerAmountSatang', p_provider_amount_satang,
      'providerCurrency', normalized_currency,
      'orderTotalSatang', order_row.buyer_total_satang,
      'orderCurrency', order_row.currency,
      'receiverReference', normalized_receiver_reference
    ),
    p_request_id
  );

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    order_row.buyer_marketplace_account_id,
    null,
    'marketplace_provider_payment_event_received',
    jsonb_build_object(
      'orderId', order_row.id,
      'pendingPaymentOrderId', order_row.pending_payment_order_id,
      'provider', normalized_provider,
      'providerEventId', normalized_event_id,
      'payloadHash', normalized_payload_hash,
      'providerPaymentState', normalized_payment_state,
      'paymentState', order_row.payment_state,
      'nextAction', 'admin_payment_review'
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'providerEventId', normalized_event_id,
    'processingState', 'reconciliation_required',
    'orderId', order_row.id,
    'pendingPaymentOrderId', order_row.pending_payment_order_id,
    'paymentState', order_row.payment_state,
    'reasonCode', reconciliation_reason,
    'nextAction', 'admin_payment_review'
  );

  update public.marketplace_provider_payment_events
  set processing_state = 'reconciliation_required',
      result_payload = rpc_response_payload
  where id = provider_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_resolve_reconciliation_item(
  p_reconciliation_item_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_action text,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item_row public.marketplace_reconciliation_items%rowtype;
  command_row public.marketplace_admin_commands%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_action text := nullif(trim(coalesce(p_action, '')), '');
  normalized_note text := nullif(trim(coalesce(p_resolution_note, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_action not in ('resolve', 'reopen') then
    raise exception 'marketplace_reconciliation_action_invalid';
  end if;
  if normalized_note is null then
    raise exception 'marketplace_admin_note_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
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
    'reconciliation.' || normalized_action,
    'reconciliation',
    p_reconciliation_item_id,
    p_admin_profile_id,
    p_admin_role,
    normalized_idempotency_key,
    normalized_request_hash,
    jsonb_build_object('action', normalized_action),
    p_request_id
  )
  on conflict (actor_ynot_profile_id, command_name, idempotency_key) do nothing
  returning * into command_row;

  if command_row.id is null then
    select * into command_row
    from public.marketplace_admin_commands
    where actor_ynot_profile_id = p_admin_profile_id
      and command_name = 'reconciliation.' || normalized_action
      and idempotency_key = normalized_idempotency_key;
    if command_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if command_row.result_payload is not null then
      return command_row.result_payload;
    end if;
    raise exception 'marketplace_admin_command_replay_incomplete';
  end if;

  select * into item_row
  from public.marketplace_reconciliation_items
  where id = p_reconciliation_item_id
  for update;

  if item_row.id is null then
    raise exception 'marketplace_reconciliation_not_found';
  end if;

  if normalized_action = 'resolve' then
    update public.marketplace_reconciliation_items
    set reconciliation_state = 'resolved',
        resolution_note = normalized_note,
        resolved_by_ynot_profile_id = p_admin_profile_id,
        resolved_at = now()
    where id = item_row.id
    returning * into item_row;
  else
    update public.marketplace_reconciliation_items
    set reconciliation_state = 'open',
        resolution_note = normalized_note,
        resolved_by_ynot_profile_id = null,
        resolved_at = null,
        reopened_at = now()
    where id = item_row.id
    returning * into item_row;
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
    'marketplace_reconciliation_' || normalized_action,
    jsonb_build_object(
      'reconciliationItemId', item_row.id,
      'targetType', item_row.target_type,
      'targetId', item_row.target_id,
      'reconciliationState', item_row.reconciliation_state
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'reconciliationItemId', item_row.id,
    'targetType', item_row.target_type,
    'targetId', item_row.target_id,
    'reconciliationState', item_row.reconciliation_state
  );

  update public.marketplace_admin_commands
  set result_payload = rpc_response_payload
  where id = command_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_record_refund_transition(
  p_refund_request_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_refund_state text,
  p_provider_reference text,
  p_admin_note text
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
    or order_row.refund_state <> 'none'
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

create or replace function public.marketplace_get_bag_summary(
  p_marketplace_account_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'accountId', p_marketplace_account_id,
    'ordersTotal', (
      select count(*)
      from public.marketplace_orders
      where buyer_marketplace_account_id = p_marketplace_account_id
    ),
    'pendingPaymentOrders', (
      select count(*)
      from public.marketplace_pending_payment_orders
      where buyer_marketplace_account_id = p_marketplace_account_id
        and order_state in ('pending_payment', 'payment_submitted')
    ),
    'paidOrders', (
      select count(*)
      from public.marketplace_orders
      where buyer_marketplace_account_id = p_marketplace_account_id
        and payment_state = 'paid'
    ),
    'refundOrders', (
      select count(*)
      from public.marketplace_orders
      where buyer_marketplace_account_id = p_marketplace_account_id
        and refund_state <> 'none'
    ),
    'sellerSubmissions', (
      select count(*)
      from public.marketplace_seller_submissions
      where marketplace_account_id = p_marketplace_account_id
    ),
    'sellerListings', (
      select count(*)
      from public.marketplace_listing_snapshots
      where seller_marketplace_account_id = p_marketplace_account_id
    ),
    'sellerPayouts', (
      select count(*)
      from public.marketplace_seller_payouts
      where seller_marketplace_account_id = p_marketplace_account_id
    )
  );
$$;

revoke all on function public.marketplace_admin_command_append_only()
from public, anon, authenticated;
revoke all on function public.marketplace_collect_audit_event_targets()
from public, anon, authenticated;
revoke all on function public.marketplace_apply_provider_payment_event(text, text, text, text, uuid, text, integer, text, text, jsonb, text)
from public, anon, authenticated;
revoke all on function public.marketplace_resolve_reconciliation_item(uuid, text, text, text, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_record_refund_transition(uuid, text, text, text, uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_get_bag_summary(uuid)
from public, anon, authenticated;

grant execute on function public.marketplace_apply_provider_payment_event(text, text, text, text, uuid, text, integer, text, text, jsonb, text)
to service_role;
grant execute on function public.marketplace_collect_audit_event_targets()
to service_role;
grant execute on function public.marketplace_resolve_reconciliation_item(uuid, text, text, text, uuid, text, text, text)
to service_role;
grant execute on function public.marketplace_record_refund_transition(uuid, text, text, text, uuid, text, text, text, text)
to service_role;
grant execute on function public.marketplace_release_seller_payout(uuid, text, text, text, uuid, text, text)
to service_role;
grant execute on function public.marketplace_get_bag_summary(uuid)
to service_role;
