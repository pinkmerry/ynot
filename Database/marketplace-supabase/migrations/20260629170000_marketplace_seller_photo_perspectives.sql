-- Marketplace seller submission photo role/order metadata.
-- Keeps seller upload UI photo order aligned through API, RPC, and private
-- Storage metadata without exposing seller-uploaded originals publicly.

alter table public.marketplace_seller_submission_photos
  add column if not exists photo_role text not null default 'other'
    check (
      photo_role in (
        'front',
        'back',
        'left_edge',
        'right_edge',
        'top_bottom_edges',
        'corners',
        'surface',
        'serial_or_cert',
        'other'
      )
    ),
  add column if not exists display_order integer not null default 1
    check (display_order between 1 and 10);

create index if not exists marketplace_seller_photos_order_idx
  on public.marketplace_seller_submission_photos(
    submission_id,
    display_order,
    created_at
  );

drop function if exists public.marketplace_attach_seller_submission_photo(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  integer,
  text
);

create or replace function public.marketplace_attach_seller_submission_photo(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
  p_expected_version bigint,
  p_storage_path text,
  p_photo_role text default 'other',
  p_display_order integer default 1,
  p_file_sha256 text default null,
  p_file_size_bytes integer default null,
  p_content_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  photo_row public.marketplace_seller_submission_photos%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_storage_path text := nullif(trim(coalesce(p_storage_path, '')), '');
  normalized_photo_role text := nullif(trim(coalesce(p_photo_role, '')), '');
  normalized_display_order integer := coalesce(p_display_order, 1);
  rpc_response_payload jsonb;
begin
  if p_ynot_profile_id is null or p_marketplace_account_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;
  if normalized_storage_path is null or length(normalized_storage_path) < 8 or length(normalized_storage_path) > 500 then
    raise exception 'marketplace_photo_storage_path_invalid';
  end if;
  if normalized_storage_path not like p_marketplace_account_id::text || '/' || p_submission_id::text || '/%' then
    raise exception 'marketplace_photo_storage_path_invalid';
  end if;
  if normalized_storage_path like '/%' or normalized_storage_path like '%://%' or normalized_storage_path like '%..%' or normalized_storage_path like '%//%' then
    raise exception 'marketplace_photo_storage_path_invalid';
  end if;
  if normalized_storage_path !~ '^[A-Za-z0-9._/-]+$' then
    raise exception 'marketplace_photo_storage_path_invalid';
  end if;
  if normalized_photo_role is null then
    normalized_photo_role := 'other';
  end if;
  if normalized_photo_role not in (
    'front',
    'back',
    'left_edge',
    'right_edge',
    'top_bottom_edges',
    'corners',
    'surface',
    'serial_or_cert',
    'other'
  ) then
    raise exception 'marketplace_photo_role_invalid';
  end if;
  if normalized_display_order < 1 or normalized_display_order > 10 then
    raise exception 'marketplace_photo_display_order_invalid';
  end if;
  if p_file_sha256 is null or lower(p_file_sha256) !~ '^[a-f0-9]{64}$' then
    raise exception 'marketplace_photo_sha256_invalid';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 10485760 then
    raise exception 'marketplace_photo_size_invalid';
  end if;
  if p_content_type is null or p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'marketplace_photo_content_type_invalid';
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
    'seller_submission.photo.attach',
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
      and scope = 'seller_submission.photo.attach'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select *
  into submission_row
  from public.marketplace_seller_submissions
  where id = p_submission_id
    and marketplace_account_id = p_marketplace_account_id
    and ynot_profile_id = p_ynot_profile_id
  for update;

  if submission_row.id is null then
    raise exception 'marketplace_seller_submission_not_found';
  end if;
  if p_expected_version is not null and submission_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if submission_row.status not in ('draft', 'submitted', 'intake_instruction_sent', 'handoff_confirmed') then
    raise exception 'marketplace_seller_submission_state_invalid';
  end if;

  insert into public.marketplace_seller_submission_photos(
    submission_id,
    marketplace_account_id,
    status,
    photo_role,
    display_order,
    storage_path,
    file_sha256,
    file_size_bytes,
    content_type
  ) values (
    submission_row.id,
    p_marketplace_account_id,
    'seller_attached',
    normalized_photo_role,
    normalized_display_order,
    normalized_storage_path,
    lower(nullif(trim(coalesce(p_file_sha256, '')), '')),
    p_file_size_bytes,
    p_content_type
  )
  returning * into photo_row;

  insert into public.marketplace_seller_submission_events(
    submission_id,
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    before_status,
    after_status,
    event_payload,
    request_id
  ) values (
    submission_row.id,
    p_marketplace_account_id,
    p_ynot_profile_id,
    p_ynot_profile_id,
    'marketplace_seller_submission_photo_attached',
    submission_row.status,
    submission_row.status,
    jsonb_build_object(
      'photoId', photo_row.id,
      'photoRole', photo_row.photo_role,
      'displayOrder', photo_row.display_order,
      'storageBucket', photo_row.storage_bucket,
      'contentType', photo_row.content_type,
      'fileSizeBytes', photo_row.file_size_bytes,
      'sourceKind', submission_row.source_kind
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'photoId', photo_row.id,
    'status', photo_row.status,
    'photoRole', photo_row.photo_role,
    'displayOrder', photo_row.display_order,
    'storageBucket', photo_row.storage_bucket,
    'storagePath', photo_row.storage_path,
    'contentType', photo_row.content_type,
    'fileSizeBytes', photo_row.file_size_bytes,
    'sourceKind', submission_row.source_kind,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set
    status = 'completed',
    response_payload = rpc_response_payload,
    completed_at = now(),
    expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_attach_seller_submission_photo(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  integer,
  text,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.marketplace_attach_seller_submission_photo(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  integer,
  text,
  integer,
  text
) to service_role;
