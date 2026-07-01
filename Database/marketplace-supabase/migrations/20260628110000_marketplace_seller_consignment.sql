-- Slice 3 Marketplace seller consignment intake.
--
-- Rollback posture:
-- - Disable seller entry points through marketplace owner-only/feature gates.
-- - Keep submitted rows, private photo metadata, handoff confirmations, and audit
--   events for return/communication history. Do not delete intake evidence.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'marketplace-seller-submission-photos',
  'marketplace-seller-submission-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.marketplace_seller_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  ynot_profile_id uuid not null,
  terms_version text not null check (length(terms_version) between 3 and 80),
  request_id text,
  accepted_at timestamptz not null default now(),
  unique (marketplace_account_id, terms_version)
);

create table if not exists public.marketplace_seller_submissions (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  ynot_profile_id uuid not null,
  submission_number text unique not null,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'submitted',
        'intake_instruction_sent',
        'handoff_confirmed',
        'received',
        'inspection_passed',
        'inspection_failed',
        'inventory_created',
        'listed',
        'sold',
        'cancelled',
        'returned'
      )
    ),
  item_type text not null check (item_type in ('card', 'sealed_box', 'sealed_pack')),
  reference_source text,
  reference_card_id text,
  reference_variant_id text,
  title_snapshot text not null check (length(title_snapshot) between 1 and 240),
  condition_code text not null check (length(condition_code) between 1 and 80),
  condition_notes text,
  variant_snapshot jsonb not null default '{}'::jsonb,
  reference_snapshot jsonb not null default '{}'::jsonb,
  grade_label text,
  language text,
  cert_number text,
  asking_price_satang integer not null check (asking_price_satang > 0),
  currency text not null default 'THB' check (currency = 'THB'),
  seller_marketplace_fee_bps integer not null default 1000
    check (seller_marketplace_fee_bps between 0 and 10000),
  seller_marketplace_fee_satang integer not null check (seller_marketplace_fee_satang >= 0),
  payout_preview_satang integer not null check (payout_preview_satang >= 0),
  source_kind text not null default 'seller_physical_intake'
    check (source_kind = 'seller_physical_intake'),
  intake_instruction_id uuid,
  approved_inventory_id uuid references public.marketplace_inventory_items(id) on delete restrict,
  listing_id uuid,
  seller_note text,
  admin_visible_note text,
  request_id text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payout_preview_satang = asking_price_satang - seller_marketplace_fee_satang),
  check (approved_inventory_id is null or status in ('inventory_created', 'listed', 'sold')),
  check (listing_id is null or status in ('listed', 'sold'))
);

create table if not exists public.marketplace_seller_submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.marketplace_seller_submissions(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  status text not null default 'uploaded'
    check (
      status in (
        'uploaded',
        'seller_attached',
        'admin_approved',
        'rejected',
        'public_derivative_ready'
      )
    ),
  storage_bucket text not null default 'marketplace-seller-submission-photos',
  storage_path text not null check (length(storage_path) between 8 and 500),
  file_sha256 text check (file_sha256 is null or length(file_sha256) = 64),
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes between 1 and 10485760),
  content_type text check (content_type is null or content_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.marketplace_seller_submissions(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  ynot_profile_id uuid,
  actor_ynot_profile_id uuid,
  actor_admin_role text check (actor_admin_role in ('owner', 'admin', 'staff')),
  event_type text not null check (length(event_type) between 3 and 120),
  before_status text,
  after_status text,
  event_payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_handoff_confirmations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.marketplace_seller_submissions(id) on delete restrict,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  handoff_method text not null check (handoff_method in ('ship_to_store', 'bring_to_store')),
  carrier text,
  tracking_code text,
  seller_note text,
  confirmed_at timestamptz not null default now(),
  request_id text
);

create index if not exists marketplace_seller_submissions_seller_idx
  on public.marketplace_seller_submissions(marketplace_account_id, status, created_at desc);
create index if not exists marketplace_seller_submissions_admin_queue_idx
  on public.marketplace_seller_submissions(status, updated_at desc);
create index if not exists marketplace_seller_submissions_number_idx
  on public.marketplace_seller_submissions(submission_number);
create index if not exists marketplace_seller_submissions_approved_inventory_idx
  on public.marketplace_seller_submissions(approved_inventory_id)
  where approved_inventory_id is not null;
create index if not exists marketplace_seller_submissions_listing_idx
  on public.marketplace_seller_submissions(listing_id)
  where listing_id is not null;
create index if not exists marketplace_seller_photos_submission_idx
  on public.marketplace_seller_submission_photos(submission_id, created_at desc);
create index if not exists marketplace_seller_events_submission_idx
  on public.marketplace_seller_submission_events(submission_id, created_at desc);
create index if not exists marketplace_seller_events_type_idx
  on public.marketplace_seller_submission_events(event_type, created_at desc);
create index if not exists marketplace_seller_handoff_submission_idx
  on public.marketplace_seller_handoff_confirmations(submission_id, confirmed_at desc);
create unique index if not exists marketplace_seller_handoff_one_per_submission_idx
  on public.marketplace_seller_handoff_confirmations(submission_id);

drop trigger if exists marketplace_seller_submissions_touch_updated_at on public.marketplace_seller_submissions;
create trigger marketplace_seller_submissions_touch_updated_at
before update on public.marketplace_seller_submissions
for each row execute function public.marketplace_touch_updated_at();

create or replace function public.marketplace_seller_submission_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'marketplace_seller_submission_events_append_only';
end;
$$;

drop trigger if exists marketplace_seller_submission_events_no_update on public.marketplace_seller_submission_events;
create trigger marketplace_seller_submission_events_no_update
before update on public.marketplace_seller_submission_events
for each row execute function public.marketplace_seller_submission_events_append_only();

drop trigger if exists marketplace_seller_submission_events_no_delete on public.marketplace_seller_submission_events;
create trigger marketplace_seller_submission_events_no_delete
before delete on public.marketplace_seller_submission_events
for each row execute function public.marketplace_seller_submission_events_append_only();

alter table public.marketplace_seller_terms_acceptances enable row level security;
alter table public.marketplace_seller_submissions enable row level security;
alter table public.marketplace_seller_submission_photos enable row level security;
alter table public.marketplace_seller_submission_events enable row level security;
alter table public.marketplace_seller_handoff_confirmations enable row level security;

revoke all on
  public.marketplace_seller_terms_acceptances,
  public.marketplace_seller_submissions,
  public.marketplace_seller_submission_photos,
  public.marketplace_seller_submission_events,
  public.marketplace_seller_handoff_confirmations
from public, anon, authenticated;

grant all on
  public.marketplace_seller_terms_acceptances,
  public.marketplace_seller_submissions,
  public.marketplace_seller_submission_photos,
  public.marketplace_seller_submission_events,
  public.marketplace_seller_handoff_confirmations
to service_role;

create or replace function public.marketplace_create_seller_submission(
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
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
  p_seller_note text default null,
  p_submit_now boolean default false,
  p_seller_marketplace_fee_bps integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  account_row public.marketplace_accounts%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_title text := nullif(trim(coalesce(p_title_snapshot, '')), '');
  combined_source_text text;
  fee_satang integer;
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
  if p_seller_marketplace_fee_bps is null or p_seller_marketplace_fee_bps < 0 or p_seller_marketplace_fee_bps > 10000 then
    raise exception 'marketplace_fee_invalid';
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
    'seller_submission.create',
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
      and scope = 'seller_submission.create'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  fee_satang := floor((p_asking_price_satang::numeric * p_seller_marketplace_fee_bps::numeric) / 10000)::integer;

  insert into public.marketplace_seller_submissions(
    marketplace_account_id,
    ynot_profile_id,
    submission_number,
    status,
    item_type,
    reference_source,
    reference_card_id,
    reference_variant_id,
    title_snapshot,
    condition_code,
    condition_notes,
    variant_snapshot,
    reference_snapshot,
    grade_label,
    language,
    cert_number,
    asking_price_satang,
    currency,
    seller_marketplace_fee_bps,
    seller_marketplace_fee_satang,
    payout_preview_satang,
    source_kind,
    seller_note,
    request_id
  ) values (
    p_marketplace_account_id,
    p_ynot_profile_id,
    'MSC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    case when coalesce(p_submit_now, false) then 'submitted' else 'draft' end,
    p_item_type,
    nullif(trim(coalesce(p_reference_source, '')), ''),
    nullif(trim(coalesce(p_reference_card_id, '')), ''),
    nullif(trim(coalesce(p_reference_variant_id, '')), ''),
    normalized_title,
    trim(p_condition_code),
    nullif(trim(coalesce(p_condition_notes, '')), ''),
    coalesce(p_variant_snapshot, '{}'::jsonb),
    coalesce(p_reference_snapshot, '{}'::jsonb),
    nullif(trim(coalesce(p_grade_label, '')), ''),
    nullif(trim(coalesce(p_language, '')), ''),
    nullif(trim(coalesce(p_cert_number, '')), ''),
    p_asking_price_satang,
    'THB',
    p_seller_marketplace_fee_bps,
    fee_satang,
    p_asking_price_satang - fee_satang,
    'seller_physical_intake',
    nullif(trim(coalesce(p_seller_note, '')), ''),
    p_request_id
  )
  returning * into submission_row;

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
    case when submission_row.status = 'submitted'
      then 'marketplace_seller_submission_submitted'
      else 'marketplace_seller_submission_draft_created'
    end,
    null,
    submission_row.status,
    jsonb_build_object(
      'itemType', submission_row.item_type,
      'sourceKind', submission_row.source_kind,
      'sellerMarketplaceFeeBps', submission_row.seller_marketplace_fee_bps,
      'payoutPreviewSatang', submission_row.payout_preview_satang
    ),
    p_request_id
  );

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_marketplace_account_id,
    p_ynot_profile_id,
    p_ynot_profile_id,
    'marketplace_seller_submission_created',
    jsonb_build_object(
      'submissionId', submission_row.id,
      'submissionNumber', submission_row.submission_number,
      'status', submission_row.status,
      'sourceKind', submission_row.source_kind
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'submissionNumber', submission_row.submission_number,
    'status', submission_row.status,
    'itemType', submission_row.item_type,
    'sourceKind', submission_row.source_kind,
    'askingPriceSatang', submission_row.asking_price_satang,
    'sellerMarketplaceFeeBps', submission_row.seller_marketplace_fee_bps,
    'sellerMarketplaceFeeSatang', submission_row.seller_marketplace_fee_satang,
    'payoutPreviewSatang', submission_row.payout_preview_satang,
    'currency', submission_row.currency,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_quote_seller_payout_preview(
  p_asking_price_satang integer,
  p_seller_marketplace_fee_bps integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fee_satang integer;
begin
  if p_asking_price_satang is null or p_asking_price_satang <= 0 then
    raise exception 'marketplace_price_invalid';
  end if;
  if p_seller_marketplace_fee_bps is null or p_seller_marketplace_fee_bps < 0 or p_seller_marketplace_fee_bps > 10000 then
    raise exception 'marketplace_fee_invalid';
  end if;

  fee_satang := floor((p_asking_price_satang::numeric * p_seller_marketplace_fee_bps::numeric) / 10000)::integer;

  return jsonb_build_object(
    'currency', 'THB',
    'askingPriceSatang', p_asking_price_satang,
    'sellerMarketplaceFeeBps', p_seller_marketplace_fee_bps,
    'sellerMarketplaceFeeSatang', fee_satang,
    'payoutPreviewSatang', p_asking_price_satang - fee_satang
  );
end;
$$;

create or replace function public.marketplace_mutate_seller_submission_state(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
  p_action text,
  p_expected_version bigint default null,
  p_seller_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  before_status text;
  after_status text;
  event_name text;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_ynot_profile_id is null or p_marketplace_account_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if p_action not in ('submit', 'cancel') then
    raise exception 'marketplace_seller_submission_action_invalid';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
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
    'seller_submission.' || p_action,
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
      and scope = 'seller_submission.' || p_action
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

  before_status := submission_row.status;
  if p_action = 'submit' then
    if submission_row.status <> 'draft' then
      raise exception 'marketplace_seller_submission_state_invalid';
    end if;
    if not exists (
      select 1
      from public.marketplace_seller_submission_photos
      where submission_id = submission_row.id
        and marketplace_account_id = p_marketplace_account_id
        and status in ('seller_attached', 'approved')
    ) then
      raise exception 'marketplace_seller_photo_required';
    end if;
    after_status := 'submitted';
    event_name := 'marketplace_seller_submission_submitted';
  else
    if submission_row.status not in ('draft', 'submitted', 'intake_instruction_sent') then
      raise exception 'marketplace_seller_submission_state_invalid';
    end if;
    after_status := 'cancelled';
    event_name := 'marketplace_seller_submission_cancelled';
  end if;

  update public.marketplace_seller_submissions
  set status = after_status,
      seller_note = coalesce(nullif(trim(coalesce(p_seller_note, '')), ''), seller_note),
      version = version + 1
  where id = submission_row.id
  returning * into submission_row;

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
    event_name,
    before_status,
    after_status,
    jsonb_build_object('sourceKind', submission_row.source_kind),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'submissionNumber', submission_row.submission_number,
    'status', submission_row.status,
    'sourceKind', submission_row.source_kind,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_confirm_seller_handoff(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
  p_expected_version bigint,
  p_handoff_method text,
  p_carrier text default null,
  p_tracking_code text default null,
  p_seller_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  handoff_row public.marketplace_seller_handoff_confirmations%rowtype;
  before_status text;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_ynot_profile_id is null or p_marketplace_account_id is null then
    raise exception 'marketplace_account_required';
  end if;
  if p_handoff_method not in ('ship_to_store', 'bring_to_store') then
    raise exception 'marketplace_handoff_method_invalid';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
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
    'seller_submission.handoff',
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
      and scope = 'seller_submission.handoff'
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
  if submission_row.status not in ('submitted', 'intake_instruction_sent') then
    raise exception 'marketplace_seller_submission_state_invalid';
  end if;

  before_status := submission_row.status;

  insert into public.marketplace_seller_handoff_confirmations(
    submission_id,
    marketplace_account_id,
    handoff_method,
    carrier,
    tracking_code,
    seller_note,
    request_id
  ) values (
    submission_row.id,
    p_marketplace_account_id,
    p_handoff_method,
    nullif(trim(coalesce(p_carrier, '')), ''),
    nullif(trim(coalesce(p_tracking_code, '')), ''),
    nullif(trim(coalesce(p_seller_note, '')), ''),
    p_request_id
  )
  on conflict (submission_id) do update
  set handoff_method = excluded.handoff_method,
      carrier = excluded.carrier,
      tracking_code = excluded.tracking_code,
      seller_note = excluded.seller_note,
      request_id = excluded.request_id,
      confirmed_at = now()
  returning * into handoff_row;

  update public.marketplace_seller_submissions
  set status = 'handoff_confirmed',
      seller_note = coalesce(nullif(trim(coalesce(p_seller_note, '')), ''), seller_note),
      version = version + 1
  where id = submission_row.id
  returning * into submission_row;

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
    'marketplace_seller_handoff_confirmed',
    before_status,
    'handoff_confirmed',
    jsonb_build_object(
      'handoffMethod', handoff_row.handoff_method,
      'hasTrackingCode', handoff_row.tracking_code is not null,
      'sourceKind', submission_row.source_kind
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'handoffConfirmationId', handoff_row.id,
    'status', submission_row.status,
    'handoffMethod', handoff_row.handoff_method,
    'sourceKind', submission_row.source_kind,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_attach_seller_submission_photo(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_ynot_profile_id uuid,
  p_marketplace_account_id uuid,
  p_expected_version bigint,
  p_storage_path text,
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
    storage_path,
    file_sha256,
    file_size_bytes,
    content_type
  ) values (
    submission_row.id,
    p_marketplace_account_id,
    'seller_attached',
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
    'storageBucket', photo_row.storage_bucket,
    'storagePath', photo_row.storage_path,
    'contentType', photo_row.content_type,
    'fileSizeBytes', photo_row.file_size_bytes,
    'sourceKind', submission_row.source_kind,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_admin_transition_seller_intake(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint,
  p_target_status text,
  p_admin_note text default null,
  p_intake_instruction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  before_status text;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if p_target_status not in ('intake_instruction_sent', 'received', 'inspection_passed', 'inspection_failed') then
    raise exception 'marketplace_intake_status_invalid';
  end if;
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'seller_intake.transition',
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
    where ynot_profile_id = p_admin_profile_id
      and scope = 'seller_intake.transition'
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
  for update;

  if submission_row.id is null then
    raise exception 'marketplace_seller_submission_not_found';
  end if;
  if submission_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if p_target_status = 'intake_instruction_sent'
    and submission_row.status not in ('submitted', 'handoff_confirmed') then
    raise exception 'marketplace_seller_intake_transition_invalid';
  end if;
  if p_target_status = 'received'
    and submission_row.status not in ('intake_instruction_sent', 'handoff_confirmed') then
    raise exception 'marketplace_seller_intake_transition_invalid';
  end if;
  if p_target_status in ('inspection_passed', 'inspection_failed')
    and submission_row.status <> 'received' then
    raise exception 'marketplace_seller_intake_transition_invalid';
  end if;

  before_status := submission_row.status;

  update public.marketplace_seller_submissions
  set status = p_target_status,
      intake_instruction_id = coalesce(p_intake_instruction_id, intake_instruction_id),
      admin_visible_note = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), admin_visible_note),
      version = version + 1
  where id = submission_row.id
  returning * into submission_row;

  insert into public.marketplace_seller_submission_events(
    submission_id,
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    before_status,
    after_status,
    event_payload,
    request_id
  ) values (
    submission_row.id,
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_intake_' || p_target_status,
    before_status,
    p_target_status,
    jsonb_build_object(
      'intakeInstructionId', submission_row.intake_instruction_id,
      'hasAdminNote', submission_row.admin_visible_note is not null,
      'sourceKind', submission_row.source_kind
    ),
    p_request_id
  );

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_intake_' || p_target_status,
    jsonb_build_object(
      'submissionId', submission_row.id,
      'submissionNumber', submission_row.submission_number,
      'beforeStatus', before_status,
      'afterStatus', p_target_status,
      'sourceKind', submission_row.source_kind
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'submissionNumber', submission_row.submission_number,
    'status', submission_row.status,
    'sourceKind', submission_row.source_kind,
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_create_seller_submission(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  boolean,
  integer
) from public, anon, authenticated;
revoke all on function public.marketplace_quote_seller_payout_preview(integer, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_mutate_seller_submission_state(uuid, text, text, text, uuid, uuid, text, bigint, text)
from public, anon, authenticated;
revoke all on function public.marketplace_confirm_seller_handoff(uuid, text, text, text, uuid, uuid, bigint, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_attach_seller_submission_photo(uuid, text, text, text, uuid, uuid, bigint, text, text, integer, text)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_transition_seller_intake(uuid, text, text, text, uuid, text, bigint, text, text, uuid)
from public, anon, authenticated;

grant execute on function public.marketplace_create_seller_submission(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  boolean,
  integer
) to service_role;
grant execute on function public.marketplace_quote_seller_payout_preview(integer, integer)
to service_role;
grant execute on function public.marketplace_mutate_seller_submission_state(uuid, text, text, text, uuid, uuid, text, bigint, text)
to service_role;
grant execute on function public.marketplace_confirm_seller_handoff(uuid, text, text, text, uuid, uuid, bigint, text, text, text, text)
to service_role;
grant execute on function public.marketplace_attach_seller_submission_photo(uuid, text, text, text, uuid, uuid, bigint, text, text, integer, text)
to service_role;
grant execute on function public.marketplace_admin_transition_seller_intake(uuid, text, text, text, uuid, text, bigint, text, text, uuid)
to service_role;
