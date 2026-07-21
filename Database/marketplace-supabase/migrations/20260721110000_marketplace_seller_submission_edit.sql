-- Sellers may correct a draft before it is submitted for YNOTT intake.
-- Submitted and later intake states remain immutable so the handoff and audit
-- trail always describe the item that was actually sent.

create or replace function public.marketplace_update_seller_submission(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
  p_expected_version bigint,
  p_item_type text,
  p_title_snapshot text,
  p_condition_code text,
  p_asking_price_satang integer,
  p_reference_source text default null,
  p_reference_card_id text default null,
  p_reference_variant_id text default null,
  p_variant_snapshot jsonb default '{}'::jsonb,
  p_reference_snapshot jsonb default '{}'::jsonb,
  p_condition_notes text default null,
  p_grade_label text default null,
  p_language text default null,
  p_cert_number text default null,
  p_seller_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_row public.marketplace_accounts%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_title text := nullif(trim(coalesce(p_title_snapshot, '')), '');
  fee_satang integer;
  combined_source_text text;
  rpc_response_payload jsonb;
begin
  if p_submission_id is null or p_ynot_profile_id is null or p_marketplace_account_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'marketplace_version_invalid';
  end if;
  if p_item_type not in ('card', 'sealed_box', 'sealed_pack') then
    raise exception 'marketplace_seller_item_type_invalid';
  end if;
  if normalized_title is null then
    raise exception 'marketplace_title_required';
  end if;
  if nullif(trim(coalesce(p_condition_code, '')), '') is null then
    raise exception 'marketplace_condition_required';
  end if;
  if p_asking_price_satang is null or p_asking_price_satang <= 0 then
    raise exception 'marketplace_price_invalid';
  end if;

  combined_source_text := concat_ws(
    ' ',
    p_reference_source,
    p_reference_card_id,
    p_reference_variant_id,
    coalesce(p_variant_snapshot, '{}'::jsonb)::text,
    coalesce(p_reference_snapshot, '{}'::jsonb)::text
  );
  if combined_source_text ~* '(customer_bag|customer-bag|gacha|reward|wallet|draw|collection|conversion)' then
    raise exception 'marketplace_seller_source_forbidden';
  end if;

  select *
  into account_row
  from public.marketplace_accounts
  where id = p_marketplace_account_id
    and ynot_profile_id = p_ynot_profile_id
    and profile_status_snapshot = 'active'
  for update;
  if account_row.id is null then
    raise exception 'marketplace_account_required';
  end if;
  if account_row.seller_status <> 'active' then
    raise exception 'marketplace_seller_terms_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id, ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_marketplace_account_id, p_ynot_profile_id, 'seller_submission.update', normalized_idempotency_key, normalized_request_hash, now(), now() + interval '24 hours'
  ) on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_ynot_profile_id
      and scope = 'seller_submission.update'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into submission_row
  from public.marketplace_seller_submissions
  where id = p_submission_id
    and marketplace_account_id = p_marketplace_account_id
    and ynot_profile_id = p_ynot_profile_id
  for update;
  if submission_row.id is null then
    raise exception 'marketplace_seller_submission_not_found';
  end if;
  if submission_row.status <> 'draft' then
    raise exception 'marketplace_seller_submission_not_editable';
  end if;
  if submission_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if submission_row.item_type <> p_item_type then
    raise exception 'marketplace_seller_item_type_invalid';
  end if;

  fee_satang := floor((p_asking_price_satang::numeric * submission_row.seller_marketplace_fee_bps::numeric) / 10000)::integer;

  update public.marketplace_seller_submissions
  set
    title_snapshot = normalized_title,
    condition_code = trim(p_condition_code),
    condition_notes = nullif(trim(coalesce(p_condition_notes, '')), ''),
    reference_source = nullif(trim(coalesce(p_reference_source, '')), ''),
    reference_card_id = nullif(trim(coalesce(p_reference_card_id, '')), ''),
    reference_variant_id = nullif(trim(coalesce(p_reference_variant_id, '')), ''),
    variant_snapshot = coalesce(p_variant_snapshot, '{}'::jsonb),
    reference_snapshot = coalesce(p_reference_snapshot, '{}'::jsonb),
    grade_label = nullif(trim(coalesce(p_grade_label, '')), ''),
    language = nullif(trim(coalesce(p_language, '')), ''),
    cert_number = nullif(trim(coalesce(p_cert_number, '')), ''),
    seller_note = nullif(trim(coalesce(p_seller_note, '')), ''),
    asking_price_satang = p_asking_price_satang,
    seller_marketplace_fee_satang = fee_satang,
    payout_preview_satang = p_asking_price_satang - fee_satang,
    version = submission_row.version + 1,
    request_id = p_request_id
  where id = submission_row.id
  returning * into submission_row;

  insert into public.marketplace_seller_submission_events(
    submission_id, marketplace_account_id, ynot_profile_id, actor_ynot_profile_id,
    event_type, before_status, after_status, event_payload, request_id
  ) values (
    submission_row.id, p_marketplace_account_id, p_ynot_profile_id, p_ynot_profile_id,
    'marketplace_seller_submission_updated', 'draft', 'draft',
    jsonb_build_object('askingPriceSatang', submission_row.asking_price_satang, 'version', submission_row.version),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'submissionNumber', submission_row.submission_number,
    'status', submission_row.status,
    'askingPriceSatang', submission_row.asking_price_satang,
    'sellerMarketplaceFeeSatang', submission_row.seller_marketplace_fee_satang,
    'payoutPreviewSatang', submission_row.payout_preview_satang,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload, locked_at = now(), expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_update_seller_submission(
  uuid, text, text, text, uuid, uuid, bigint, text, text, text, integer,
  text, text, text, jsonb, jsonb, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.marketplace_update_seller_submission(
  uuid, text, text, text, uuid, uuid, bigint, text, text, text, integer,
  text, text, text, jsonb, jsonb, text, text, text, text, text
) to service_role;
