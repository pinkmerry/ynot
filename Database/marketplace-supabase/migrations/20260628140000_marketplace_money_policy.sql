-- Marketplace money policy.
--
-- Keeps seller fee, buyer service fee, and MVP fixed shipping configurable by
-- owner/admin dashboard while checkout snapshots still freeze the applied rule.

create table if not exists public.marketplace_money_policies (
  id uuid primary key default gen_random_uuid(),
  policy_state text not null default 'active'
    check (policy_state in ('active', 'archived')),
  seller_fee_bps integer not null default 1000
    check (seller_fee_bps between 0 and 10000),
  buyer_service_fee_bps integer not null default 1000
    check (buyer_service_fee_bps between 0 and 10000),
  shipping_fee_satang integer not null default 15000
    check (shipping_fee_satang between 0 and 1000000),
  currency text not null default 'THB' check (currency = 'THB'),
  calculation_version integer not null default 1 check (calculation_version > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by_ynot_profile_id uuid,
  created_by_admin_role text check (created_by_admin_role in ('owner', 'admin')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists marketplace_money_policies_one_active_idx
  on public.marketplace_money_policies(policy_state)
  where policy_state = 'active';

create index if not exists marketplace_money_policies_effective_idx
  on public.marketplace_money_policies(policy_state, effective_from desc);

drop trigger if exists marketplace_money_policies_touch_updated_at on public.marketplace_money_policies;
create trigger marketplace_money_policies_touch_updated_at
before update on public.marketplace_money_policies
for each row execute function public.marketplace_touch_updated_at();

insert into public.marketplace_money_policies (
  policy_state,
  seller_fee_bps,
  buyer_service_fee_bps,
  shipping_fee_satang,
  currency,
  calculation_version,
  admin_note
)
select
  'active',
  1000,
  1000,
  15000,
  'THB',
  1,
  'Seeded MVP default policy'
where not exists (
  select 1
  from public.marketplace_money_policies
  where policy_state = 'active'
);

alter table public.marketplace_money_policies enable row level security;

revoke all on public.marketplace_money_policies from public, anon, authenticated;
grant select, insert, update on public.marketplace_money_policies to service_role;

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
    'adminNote', policy_row.admin_note
  );
$$;

create or replace function public.marketplace_get_active_money_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  policy_row public.marketplace_money_policies;
begin
  select *
  into policy_row
  from public.marketplace_money_policies
  where policy_state = 'active'
  order by effective_from desc
  limit 1;

  if not found then
    insert into public.marketplace_money_policies (
      policy_state,
      seller_fee_bps,
      buyer_service_fee_bps,
      shipping_fee_satang,
      currency,
      calculation_version,
      admin_note
    )
    values (
      'active',
      1000,
      1000,
      15000,
      'THB',
      1,
      'Auto-created MVP default policy'
    )
    returning * into policy_row;
  end if;

  return public.marketplace_money_policy_json(policy_row);
end;
$$;

create or replace function public.marketplace_admin_set_money_policy(
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_seller_fee_bps integer,
  p_buyer_service_fee_bps integer,
  p_shipping_fee_satang integer,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_idempotency public.marketplace_idempotency_keys;
  new_policy public.marketplace_money_policies;
  response jsonb;
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
    admin_note
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
    nullif(left(coalesce(p_admin_note, ''), 1000), '')
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
      'calculationVersion', new_policy.calculation_version
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

revoke all on function public.marketplace_money_policy_json(public.marketplace_money_policies)
from public, anon, authenticated;
revoke all on function public.marketplace_get_active_money_policy()
from public, anon, authenticated;
revoke all on function public.marketplace_admin_set_money_policy(
  text,
  text,
  text,
  uuid,
  text,
  integer,
  integer,
  integer,
  text
)
from public, anon, authenticated;

grant execute on function public.marketplace_money_policy_json(public.marketplace_money_policies)
to service_role;
grant execute on function public.marketplace_get_active_money_policy()
to service_role;
grant execute on function public.marketplace_admin_set_money_policy(
  text,
  text,
  text,
  uuid,
  text,
  integer,
  integer,
  integer,
  text
)
to service_role;
