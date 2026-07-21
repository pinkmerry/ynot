-- Irreversible forward migration: seller terms acceptance is the documented
-- authorization for consignment intake. Suspended accounts remain suspended.
create or replace function public.marketplace_accept_seller_terms(
  p_marketplace_account_id uuid,
  p_ynot_profile_id uuid,
  p_terms_version text,
  p_request_id text default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_row public.marketplace_accounts%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_terms_version text := nullif(trim(coalesce(p_terms_version, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_marketplace_account_id is null or p_ynot_profile_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if normalized_terms_version is null then
    raise exception 'marketplace_seller_terms_version_required';
  end if;
  if normalized_idempotency_key is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null then
    raise exception 'marketplace_request_hash_required';
  end if;
  if length(normalized_idempotency_key) < 8 or length(normalized_idempotency_key) > 200 then
    raise exception 'marketplace_idempotency_key_invalid';
  end if;
  if length(normalized_request_hash) < 16 or length(normalized_request_hash) > 200 then
    raise exception 'marketplace_request_hash_invalid';
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
    p_marketplace_account_id,
    p_ynot_profile_id,
    'seller_terms.accept',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select *
    into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_ynot_profile_id
      and scope = 'seller_terms.accept'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;

    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  update public.marketplace_accounts
  set
    seller_status = case
      when seller_status in ('none', 'pending_terms', 'pending_review') then 'active'
      else seller_status
    end,
    seller_terms_version = normalized_terms_version,
    seller_terms_accepted_at = now(),
    last_seen_at = now(),
    last_profile_verified_at = now()
  where id = p_marketplace_account_id
    and ynot_profile_id = p_ynot_profile_id
    and profile_status_snapshot = 'active'
  returning * into account_row;

  if account_row.id is null then
    raise exception 'marketplace_account_not_found';
  end if;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    account_row.id,
    account_row.ynot_profile_id,
    account_row.ynot_profile_id,
    'marketplace_seller_terms_accepted',
    jsonb_build_object('termsVersion', normalized_terms_version),
    p_request_id
  );

  rpc_response_payload := public.marketplace_account_response(account_row);

  update public.marketplace_idempotency_keys
  set
    marketplace_account_id = account_row.id,
    response_payload = rpc_response_payload,
    locked_at = now(),
    expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_accept_seller_terms(uuid, uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_accept_seller_terms(uuid, uuid, text, text, text, text)
to service_role;
