-- Top-up idempotency and atomic submit RPC.
-- This migration does not touch pack-opening RPCs, prize metadata, or private pack logic.

create unique index if not exists top_up_requests_profile_idempotency_unique_idx
on public.top_up_requests(profile_id, idempotency_key)
where idempotency_key is not null;

create or replace function public.submit_top_up_request(
  p_top_up_id uuid,
  p_profile_id uuid,
  p_payment_method_id uuid,
  p_amount_thb integer,
  p_coin_amount integer,
  p_amount_source text,
  p_package_id text,
  p_customer_note text,
  p_idempotency_key text,
  p_slip_file_path text,
  p_slip_original_filename text,
  p_slip_file_sha256 text,
  p_slip_storage_provider text default 'supabase',
  p_slip_verification_status text default 'unverified',
  p_slip_provider_code text default null,
  p_slip_provider_message text default null,
  p_slip_provider_response jsonb default '{}'::jsonb,
  p_slip_duplicate_of_slip_id uuid default null,
  p_slip_verified_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  top_up_row public.top_up_requests%rowtype;
  slip_row public.payment_slips%rowtype;
begin
  if p_top_up_id is null then
    raise exception 'top_up_id_required';
  end if;
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_payment_method_id is null then
    raise exception 'payment_method_required';
  end if;
  if p_amount_thb is null or p_amount_thb <= 0 then
    raise exception 'invalid_top_up_amount';
  end if;
  if p_coin_amount is null or p_coin_amount <= 0 then
    raise exception 'invalid_coin_amount';
  end if;
  if trim(coalesce(p_amount_source, '')) not in ('package', 'custom') then
    raise exception 'invalid_amount_source';
  end if;
  if trim(p_amount_source) = 'package' and nullif(trim(coalesce(p_package_id, '')), '') is null then
    raise exception 'package_id_required';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_slip_file_path is null or length(trim(p_slip_file_path)) = 0 then
    raise exception 'slip_file_path_required';
  end if;
  if p_slip_original_filename is null or length(trim(p_slip_original_filename)) = 0 then
    raise exception 'slip_original_filename_required';
  end if;
  if p_slip_file_sha256 is null or length(trim(p_slip_file_sha256)) <> 64 then
    raise exception 'slip_file_sha256_required';
  end if;

  select *
  into top_up_row
  from public.top_up_requests
  where profile_id = p_profile_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if top_up_row.id is not null then
    select *
    into slip_row
    from public.payment_slips
    where top_up_request_id = top_up_row.id
    order by uploaded_at desc
    limit 1;

    return jsonb_build_object(
      'status', top_up_row.status,
      'topUpId', top_up_row.id,
      'paymentSlipId', slip_row.id,
      'replayed', true
    );
  end if;

  insert into public.top_up_requests(
    id,
    profile_id,
    payment_method_id,
    amount_thb,
    coin_amount,
    status,
    submitted_at,
    customer_note,
    idempotency_key
  )
  values (
    p_top_up_id,
    p_profile_id,
    p_payment_method_id,
    p_amount_thb,
    p_coin_amount,
    'pending_review',
    now(),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    trim(p_idempotency_key)
  )
  returning * into top_up_row;

  insert into public.payment_slips(
    top_up_request_id,
    storage_provider,
    file_path,
    original_filename,
    file_sha256,
    verification_status,
    provider_code,
    provider_message,
    provider_response,
    duplicate_of_slip_id,
    verified_at
  )
  values (
    top_up_row.id,
    coalesce(nullif(trim(p_slip_storage_provider), ''), 'supabase'),
    trim(p_slip_file_path),
    trim(p_slip_original_filename),
    lower(trim(p_slip_file_sha256)),
    coalesce(nullif(trim(p_slip_verification_status), ''), 'unverified'),
    nullif(trim(coalesce(p_slip_provider_code, '')), ''),
    nullif(trim(coalesce(p_slip_provider_message, '')), ''),
    coalesce(p_slip_provider_response, '{}'::jsonb),
    p_slip_duplicate_of_slip_id,
    p_slip_verified_at
  )
  returning * into slip_row;

  insert into public.audit_events(
    actor_profile_id,
    event_type,
    top_up_request_id,
    metadata
  )
  values (
    p_profile_id,
    'top_up_submitted',
    top_up_row.id,
    jsonb_build_object(
      'public_code', top_up_row.public_code,
      'amount_thb', p_amount_thb,
      'coin_amount', p_coin_amount,
      'amount_source', trim(p_amount_source),
      'package_id', nullif(trim(coalesce(p_package_id, '')), '')
    )
  );

  return jsonb_build_object(
    'status', top_up_row.status,
    'topUpId', top_up_row.id,
    'paymentSlipId', slip_row.id,
    'replayed', false
  );
exception
  when unique_violation then
    select *
    into top_up_row
    from public.top_up_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if top_up_row.id is null then
      raise;
    end if;

    select *
    into slip_row
    from public.payment_slips
    where top_up_request_id = top_up_row.id
    order by uploaded_at desc
    limit 1;

    return jsonb_build_object(
      'status', top_up_row.status,
      'topUpId', top_up_row.id,
      'paymentSlipId', slip_row.id,
      'replayed', true
    );
end;
$$;

revoke all on function public.submit_top_up_request(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.submit_top_up_request(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  timestamptz
) to service_role;
