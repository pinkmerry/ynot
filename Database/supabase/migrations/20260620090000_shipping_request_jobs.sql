-- Service-owned customer shipping request pipeline.
--
-- Quotes are non-committing. Requests enter a customer-visible preparing state
-- only after confirmation, then service-role workers progressively attach
-- shipping items and submit the request for admin fulfilment.

create table if not exists public.shipping_request_quote_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  address_id uuid not null references public.user_addresses(id) on delete restrict,
  selection_mode text not null check (selection_mode in ('selected', 'all_eligible')),
  collection_item_ids uuid[] not null default '{}'::uuid[],
  item_count integer not null check (item_count > 0),
  total_coin_value integer not null check (total_coin_value >= 0),
  selected_coin_value integer not null check (selected_coin_value >= 0),
  minimum_coin_value integer not null default 1000 check (minimum_coin_value > 0),
  quote_hash text not null,
  address_snapshot jsonb not null,
  customer_note text,
  idempotency_key text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_job_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (consumed_at is null and consumed_by_job_id is null)
    or (consumed_at is not null and consumed_by_job_id is not null)
  )
);

create table if not exists public.shipping_request_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  quote_token_id uuid not null unique references public.shipping_request_quote_tokens(id) on delete restrict,
  shipping_request_id uuid not null unique references public.shipping_requests(id) on delete restrict,
  public_code text not null,
  status text not null default 'preparing' check (status in ('preparing', 'processing', 'retry_required', 'submitted', 'failed')),
  selection_mode text not null check (selection_mode in ('selected', 'all_eligible')),
  item_count integer not null check (item_count > 0),
  prepared_count integer not null default 0 check (prepared_count >= 0),
  total_coin_value integer not null check (total_coin_value >= 0),
  selected_coin_value integer not null check (selected_coin_value >= 0),
  minimum_coin_value integer not null default 1000 check (minimum_coin_value > 0),
  quote_hash text not null,
  idempotency_key text,
  queue_job_id text,
  locked_by text,
  heartbeat_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  retry_scheduled_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (prepared_count <= item_count)
);

create table if not exists public.shipping_request_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shipping_request_jobs(id) on delete restrict,
  collection_item_id uuid not null references public.collection_items(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  coin_value integer not null check (coin_value >= 0),
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  claimed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipping_request_quote_tokens_job_fk'
      and conrelid = 'public.shipping_request_quote_tokens'::regclass
  ) then
    alter table public.shipping_request_quote_tokens
      add constraint shipping_request_quote_tokens_job_fk
      foreign key (consumed_by_job_id)
      references public.shipping_request_jobs(id)
      on delete set null;
  end if;
end $$;

alter table public.collection_items
  add column if not exists shipping_request_job_id uuid references public.shipping_request_jobs(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'collection_items_status_check'
      and conrelid = 'public.collection_items'::regclass
  ) then
    alter table public.collection_items
      drop constraint collection_items_status_check;
  end if;

  alter table public.collection_items
    add constraint collection_items_status_check
    check (status in ('owned', 'locked', 'exchange_requested', 'exchanged', 'shipping_preparing', 'shipping_requested', 'shipped', 'void', 'converting'));
end $$;

alter table public.shipping_requests
  drop constraint if exists shipping_requests_status_check;

alter table public.shipping_requests
  add constraint shipping_requests_status_check
  check (
    status in (
      'draft',
      'preparing',
      'submitted',
      'packing',
      'ready_for_pickup',
      'picked_up',
      'shipped',
      'delivered',
      'cancelled'
    )
  );

create unique index if not exists shipping_request_jobs_active_profile_idx
  on public.shipping_request_jobs(profile_id)
  where status in ('preparing', 'processing', 'retry_required');

create unique index if not exists shipping_request_jobs_profile_idempotency_unique_idx
  on public.shipping_request_jobs(profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists shipping_request_jobs_retry_idx
  on public.shipping_request_jobs(retry_scheduled_at, created_at)
  where status = 'retry_required';

create index if not exists shipping_request_jobs_heartbeat_idx
  on public.shipping_request_jobs(heartbeat_at, updated_at)
  where status = 'processing';

create unique index if not exists shipping_request_job_items_job_item_unique_idx
  on public.shipping_request_job_items(job_id, collection_item_id);

create index if not exists shipping_request_job_items_pending_idx
  on public.shipping_request_job_items(job_id, created_at, id)
  where status = 'pending';

create index if not exists shipping_request_quote_tokens_expiry_idx
  on public.shipping_request_quote_tokens(expires_at)
  where consumed_at is null;

create index if not exists collection_items_shipping_eligible_idx
  on public.collection_items(profile_id, acquired_at, id)
  include (convert_coin_value_snapshot, card_id)
  where status = 'owned';

create index if not exists collection_items_shipping_request_job_idx
  on public.collection_items(shipping_request_job_id, acquired_at, id)
  where status = 'shipping_requested';

alter table public.shipping_request_quote_tokens enable row level security;
alter table public.shipping_request_jobs enable row level security;
alter table public.shipping_request_job_items enable row level security;

create or replace function public.shipping_address_snapshot(address_row public.user_addresses)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'label', address_row.label,
    'recipientName', address_row.recipient_name,
    'phone', address_row.phone,
    'addressLine1', address_row.address_line1,
    'addressLine2', address_row.address_line2,
    'subdistrict', address_row.subdistrict,
    'district', address_row.district,
    'province', address_row.province,
    'postalCode', address_row.postal_code,
    'country', address_row.country,
    'deliveryNote', address_row.delivery_note
  );
$$;

create or replace function public.prepare_shipping_request_quote(
  p_profile_id uuid,
  p_address_id uuid,
  p_selection_mode text,
  p_collection_item_ids uuid[] default null,
  p_customer_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  requested_count integer;
  selected_ids uuid[];
  quoted_count integer;
  quoted_total integer;
  quoted_hash text;
  quote_id uuid;
  address_row public.user_addresses%rowtype;
  address_snapshot jsonb;
  minimum_coin_value integer := 1000;
  min_id uuid;
  max_id uuid;
  min_acquired_at public.collection_items.acquired_at%type;
  max_acquired_at public.collection_items.acquired_at%type;
  selection_fence_at timestamptz;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_selection_mode not in ('selected', 'all_eligible') then
    raise exception 'shipping_selection_mode_required';
  end if;
  if p_selection_mode = 'selected' and (p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0) then
    raise exception 'collection_items_required';
  end if;

  if exists (
    select 1
    from public.shipping_request_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_exists';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_conversion
    where active_conversion.profile_id = p_profile_id
      and active_conversion.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_blocks_shipping';
  end if;

  selection_fence_at := now();

  select *
  into address_row
  from public.user_addresses ua
  where ua.id = p_address_id
    and ua.profile_id = p_profile_id;

  if not found
    or nullif(btrim(coalesce(address_row.recipient_name, '')), '') is null
    or nullif(btrim(coalesce(address_row.phone, '')), '') is null
    or nullif(btrim(coalesce(address_row.address_line1, '')), '') is null
    or nullif(btrim(coalesce(address_row.subdistrict, '')), '') is null
    or nullif(btrim(coalesce(address_row.district, '')), '') is null
    or nullif(btrim(coalesce(address_row.province, '')), '') is null
    or nullif(btrim(coalesce(address_row.postal_code, '')), '') is null
    or nullif(btrim(coalesce(address_row.country, '')), '') is null
  then
    raise exception 'valid_shipping_address_required';
  end if;

  if p_selection_mode = 'selected' then
    select count(distinct item_id) into requested_count
    from unnest(p_collection_item_ids) as item_id;
    if requested_count <> cardinality(p_collection_item_ids) then
      raise exception 'duplicate_collection_items';
    end if;
    select
      coalesce(array_agg(ci.id order by ci.acquired_at, ci.id), '{}'::uuid[]),
      count(*)::int,
      coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)::int,
      md5(coalesce(string_agg(ci.id::text || ':' || coalesce(ci.convert_coin_value_snapshot, 0)::text, ',' order by ci.acquired_at, ci.id), 'empty'))
    into selected_ids, quoted_count, quoted_total, quoted_hash
    from public.collection_items ci
    where ci.profile_id = p_profile_id
      and ci.status = 'owned'
      and ci.shipping_request_job_id is null
      and ci.id = any(p_collection_item_ids);
  else
    selected_ids := '{}'::uuid[];
    select
      count(*)::int,
      coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)::int,
      min(ci.id),
      max(ci.id),
      min(ci.acquired_at),
      max(ci.acquired_at)
    into quoted_count, quoted_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items ci
    where ci.profile_id = p_profile_id
      and ci.status = 'owned'
      and ci.shipping_request_job_id is null
      and ci.acquired_at <= selection_fence_at;

    quoted_hash := md5(
      quoted_count::text || ':' ||
      quoted_total::text || ':' ||
      coalesce(min_id::text, '') || ':' ||
      coalesce(max_id::text, '') || ':' ||
      coalesce(min_acquired_at::text, '') || ':' ||
      coalesce(max_acquired_at::text, '')
    );
  end if;

  if p_selection_mode = 'selected' and quoted_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;
  if quoted_count = 0 then
    raise exception 'collection_items_required';
  end if;
  if quoted_total < minimum_coin_value then
    raise exception 'shipping_minimum_coin_value_required';
  end if;

  address_snapshot := public.shipping_address_snapshot(address_row);

  insert into public.shipping_request_quote_tokens(
    profile_id,
    address_id,
    selection_mode,
    collection_item_ids,
    item_count,
    total_coin_value,
    selected_coin_value,
    minimum_coin_value,
    quote_hash,
    address_snapshot,
    customer_note,
    idempotency_key,
    expires_at,
    metadata
  ) values (
    p_profile_id,
    p_address_id,
    p_selection_mode,
    case
      when p_selection_mode = 'selected' then selected_ids
      else '{}'::uuid[]
    end,
    quoted_count,
    quoted_total,
    quoted_total,
    minimum_coin_value,
    quoted_hash,
    address_snapshot,
    nullif(left(btrim(coalesce(p_customer_note, '')), 500), ''),
    p_idempotency_key,
    now() + interval '15 minutes',
    jsonb_build_object(
      'source', 'prepare_shipping_request_quote',
      'selectionFenceAcquiredAt', selection_fence_at
    )
  )
  returning id into quote_id;

  return jsonb_build_object(
    'quoteToken', quote_id,
    'selectionMode', p_selection_mode,
    'itemCount', quoted_count,
    'totalCoinValue', quoted_total,
    'selectedCoinValue', quoted_total,
    'minimumCoinValue', minimum_coin_value,
    'expiresAt', (now() + interval '15 minutes'),
    'address', jsonb_build_object(
      'label', address_row.label,
      'recipientName', address_row.recipient_name,
      'phone', address_row.phone,
      'summary', concat_ws(', ', address_row.address_line1, address_row.subdistrict, address_row.district, address_row.province, address_row.postal_code, address_row.country)
    )
  );
end;
$$;

create or replace function public.start_shipping_request_job(
  p_profile_id uuid,
  p_quote_token_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  quote_row public.shipping_request_quote_tokens%rowtype;
  existing_job public.shipping_request_jobs%rowtype;
  shipping_row public.shipping_requests%rowtype;
  current_count integer;
  current_total integer;
  current_hash text;
  new_job_id uuid;
  min_id uuid;
  max_id uuid;
  min_acquired_at public.collection_items.acquired_at%type;
  max_acquired_at public.collection_items.acquired_at%type;
  selection_fence_at timestamptz;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quote_token_id is null then
    raise exception 'quote_token_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ynot-profile-action:' || p_profile_id::text, 0));

  select * into quote_row
  from public.shipping_request_quote_tokens
  where id = p_quote_token_id
  for update;

  if quote_row.id is null or quote_row.profile_id <> p_profile_id then
    raise exception 'quote_token_not_found';
  end if;
  if quote_row.consumed_by_job_id is not null then
    select * into existing_job
    from public.shipping_request_jobs
    where id = quote_row.consumed_by_job_id
    for update;

    return jsonb_build_object(
      'status', existing_job.status,
      'jobId', existing_job.id,
      'shippingRequestId', existing_job.shipping_request_id,
      'publicCode', existing_job.public_code,
      'itemCount', existing_job.item_count,
      'preparedCount', existing_job.prepared_count,
      'totalCoinValue', existing_job.total_coin_value,
      'completed', existing_job.status = 'submitted',
      'shouldContinue', existing_job.status <> 'submitted',
      'replayed', true
    );
  end if;
  if quote_row.expires_at <= now() then
    raise exception 'shipping_quote_expired';
  end if;

  selection_fence_at := coalesce(
    nullif(quote_row.metadata->>'selectionFenceAcquiredAt', '')::timestamptz,
    quote_row.created_at
  );

  if coalesce(p_idempotency_key, quote_row.idempotency_key) is not null then
    select * into existing_job
    from public.shipping_request_jobs
    where profile_id = p_profile_id
      and idempotency_key = coalesce(p_idempotency_key, quote_row.idempotency_key)
    limit 1;

    if existing_job.id is not null then
      return jsonb_build_object(
        'status', existing_job.status,
        'jobId', existing_job.id,
        'shippingRequestId', existing_job.shipping_request_id,
        'publicCode', existing_job.public_code,
        'itemCount', existing_job.item_count,
        'preparedCount', existing_job.prepared_count,
        'totalCoinValue', existing_job.total_coin_value,
        'completed', existing_job.status = 'submitted',
        'shouldContinue', existing_job.status <> 'submitted',
        'replayed', true
      );
    end if;
  end if;

  if exists (
    select 1
    from public.shipping_request_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_exists';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_conversion
    where active_conversion.profile_id = p_profile_id
      and active_conversion.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_blocks_shipping';
  end if;

  if quote_row.selection_mode = 'selected' then
    select
      count(*)::int,
      coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)::int,
      md5(coalesce(string_agg(ci.id::text || ':' || coalesce(ci.convert_coin_value_snapshot, 0)::text, ',' order by ci.acquired_at, ci.id), 'empty'))
    into current_count, current_total, current_hash
    from public.collection_items ci
    where ci.profile_id = quote_row.profile_id
      and ci.status = 'owned'
      and ci.shipping_request_job_id is null
      and exists (
        select 1
        from unnest(quote_row.collection_item_ids) as selected_id
        where selected_id = ci.id
      );
  else
    select
      count(*)::int,
      coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)::int,
      min(ci.id),
      max(ci.id),
      min(ci.acquired_at),
      max(ci.acquired_at)
    into current_count, current_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items ci
    where ci.profile_id = quote_row.profile_id
      and ci.status = 'owned'
      and ci.shipping_request_job_id is null
      and ci.acquired_at <= selection_fence_at;

    current_hash := md5(
      current_count::text || ':' ||
      current_total::text || ':' ||
      coalesce(min_id::text, '') || ':' ||
      coalesce(max_id::text, '') || ':' ||
      coalesce(min_acquired_at::text, '') || ':' ||
      coalesce(max_acquired_at::text, '')
    );
  end if;

  if current_count <> quote_row.item_count
     or current_total <> quote_row.total_coin_value
     or current_hash <> quote_row.quote_hash then
    raise exception 'shipping_quote_changed';
  end if;

  insert into public.shipping_requests(
    profile_id,
    address_id,
    address_snapshot,
    status,
    customer_note,
    idempotency_key
  )
  values (
    quote_row.profile_id,
    quote_row.address_id,
    quote_row.address_snapshot,
    'preparing',
    quote_row.customer_note,
    coalesce(p_idempotency_key, quote_row.idempotency_key)
  )
  returning * into shipping_row;

  insert into public.shipping_request_jobs(
    profile_id,
    quote_token_id,
    shipping_request_id,
    public_code,
    status,
    selection_mode,
    item_count,
    total_coin_value,
    selected_coin_value,
    minimum_coin_value,
    quote_hash,
    idempotency_key,
    started_at,
    metadata
  ) values (
    quote_row.profile_id,
    quote_row.id,
    shipping_row.id,
    shipping_row.public_code,
    'preparing',
    quote_row.selection_mode,
    quote_row.item_count,
    quote_row.total_coin_value,
    quote_row.selected_coin_value,
    quote_row.minimum_coin_value,
    quote_row.quote_hash,
    coalesce(p_idempotency_key, quote_row.idempotency_key),
    now(),
    jsonb_build_object(
      'source', 'start_shipping_request_job',
      'selectionFenceAcquiredAt', selection_fence_at
    )
  )
  returning id into new_job_id;

  update public.shipping_request_quote_tokens
  set consumed_at = now(),
      consumed_by_job_id = new_job_id
  where id = quote_row.id;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (
    quote_row.profile_id,
    'shipping_preparing',
    shipping_row.id,
    jsonb_build_object(
      'jobId', new_job_id,
      'itemCount', quote_row.item_count,
      'selectedCoinValue', quote_row.selected_coin_value,
      'minimumCoinValue', quote_row.minimum_coin_value
    )
  );

  return jsonb_build_object(
    'status', 'preparing',
    'jobId', new_job_id,
    'shippingRequestId', shipping_row.id,
    'publicCode', shipping_row.public_code,
    'itemCount', quote_row.item_count,
    'preparedCount', 0,
    'totalCoinValue', quote_row.total_coin_value,
    'completed', false,
    'shouldContinue', true,
    'replayed', false
  );
end;
$$;

create or replace function public.process_shipping_request_chunk(
  p_job_id uuid,
  p_limit integer default 5000,
  p_worker_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job_row public.shipping_request_jobs%rowtype;
  quote_row public.shipping_request_quote_tokens%rowtype;
  chunk_snapshot_ids uuid[];
  chunk_item_ids uuid[];
  chunk_count integer;
  claimed_count integer;
  snapshot_claimed_count integer;
  snapshot_total_count integer;
  claim_limit integer;
  selection_fence_at timestamptz;
begin
  if p_job_id is null then
    raise exception 'shipping_job_required';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 5000 then
    raise exception 'invalid_process_limit';
  end if;

  select * into job_row
  from public.shipping_request_jobs
  where id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'shipping_job_not_found';
  end if;
  if job_row.status = 'submitted' then
    return jsonb_build_object(
      'status', 'submitted',
      'jobId', job_row.id,
      'shippingRequestId', job_row.shipping_request_id,
      'publicCode', job_row.public_code,
      'processedCount', 0,
      'preparedCount', job_row.prepared_count,
      'itemCount', job_row.item_count,
      'totalCoinValue', job_row.total_coin_value,
      'completed', true,
      'shouldContinue', false
    );
  end if;
  if job_row.status = 'failed' then
    return jsonb_build_object(
      'status', 'failed',
      'jobId', job_row.id,
      'shippingRequestId', job_row.shipping_request_id,
      'publicCode', job_row.public_code,
      'processedCount', 0,
      'preparedCount', job_row.prepared_count,
      'itemCount', job_row.item_count,
      'totalCoinValue', job_row.total_coin_value,
      'completed', false,
      'shouldContinue', false,
      'retryRequired', false
    );
  end if;
  if job_row.status not in ('preparing', 'processing', 'retry_required') then
    raise exception 'shipping_job_not_processable';
  end if;

  update public.shipping_request_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      heartbeat_at = now(),
      updated_at = now()
  where id = job_row.id;

  select * into quote_row
  from public.shipping_request_quote_tokens
  where id = job_row.quote_token_id;

  if quote_row.id is null then
    raise exception 'quote_token_not_found';
  end if;

  selection_fence_at := coalesce(
    nullif(job_row.metadata->>'selectionFenceAcquiredAt', '')::timestamptz,
    nullif(quote_row.metadata->>'selectionFenceAcquiredAt', '')::timestamptz,
    job_row.started_at,
    job_row.created_at
  );

  select
    coalesce(array_agg(chunk.id order by chunk.created_at, chunk.id), '{}'::uuid[]),
    coalesce(array_agg(chunk.collection_item_id order by chunk.created_at, chunk.id), '{}'::uuid[]),
    count(*)::int
  into chunk_snapshot_ids, chunk_item_ids, chunk_count
  from (
    select snapshot.id, snapshot.collection_item_id, snapshot.created_at
    from public.shipping_request_job_items snapshot
    where snapshot.job_id = job_row.id
      and snapshot.status = 'pending'
    order by snapshot.created_at, snapshot.id
    limit p_limit
    for update skip locked
  ) chunk;

  if chunk_count = 0 then
    select count(*)::int
    into snapshot_total_count
    from public.shipping_request_job_items snapshot
    where snapshot.job_id = job_row.id;

    claim_limit := least(p_limit, greatest(job_row.item_count - snapshot_total_count, 0));

    if claim_limit > 0 then
      with claimable as (
        select
          ci.id,
          ci.card_id,
          coalesce(ci.convert_coin_value_snapshot, 0) as coin_value,
          ci.acquired_at
        from public.collection_items ci
        where ci.profile_id = job_row.profile_id
          and ci.status = 'owned'
          and ci.shipping_request_job_id is null
          and (
            (
              job_row.selection_mode = 'all_eligible'
              and ci.acquired_at <= selection_fence_at
            )
            or (
              job_row.selection_mode = 'selected'
              and ci.id = any(quote_row.collection_item_ids)
            )
          )
          and not exists (
            select 1
            from public.shipping_request_job_items existing
            where existing.job_id = job_row.id
              and existing.collection_item_id = ci.id
          )
        order by ci.acquired_at, ci.id
        limit claim_limit
        for update skip locked
      ),
      inserted as (
        insert into public.shipping_request_job_items(
          job_id,
          collection_item_id,
          profile_id,
          card_id,
          coin_value
        )
        select
          job_row.id,
          claimable.id,
          job_row.profile_id,
          claimable.card_id,
          claimable.coin_value
        from claimable
        on conflict (job_id, collection_item_id) do nothing
        returning id, collection_item_id, created_at
      )
      select
        coalesce(array_agg(inserted.id order by inserted.created_at, inserted.id), '{}'::uuid[]),
        coalesce(array_agg(inserted.collection_item_id order by inserted.created_at, inserted.id), '{}'::uuid[]),
        count(*)::int
      into chunk_snapshot_ids, chunk_item_ids, chunk_count
      from inserted;
    end if;
  end if;

  if chunk_count = 0 then
    if job_row.prepared_count = job_row.item_count then
      update public.shipping_request_jobs
      set status = 'submitted',
          completed_at = coalesce(completed_at, now()),
          locked_by = null,
          heartbeat_at = null,
          updated_at = now()
      where id = job_row.id
      returning * into job_row;

      update public.shipping_requests
      set status = 'submitted',
          updated_at = now()
      where id = job_row.shipping_request_id
        and status = 'preparing';
    else
      raise exception 'shipping_claim_mismatch';
    end if;

    return jsonb_build_object(
      'status', job_row.status,
      'jobId', job_row.id,
      'shippingRequestId', job_row.shipping_request_id,
      'publicCode', job_row.public_code,
      'processedCount', 0,
      'preparedCount', job_row.prepared_count,
      'itemCount', job_row.item_count,
      'totalCoinValue', job_row.total_coin_value,
      'completed', job_row.status = 'submitted',
      'shouldContinue', job_row.status <> 'submitted'
    );
  end if;

  insert into public.shipping_request_items(shipping_request_id, collection_item_id, card_id)
  select job_row.shipping_request_id, ci.id, ci.card_id
  from public.collection_items ci
  where ci.id = any(chunk_item_ids)
    and ci.profile_id = job_row.profile_id
    and ci.status = 'owned'
    and ci.shipping_request_job_id is null
  on conflict do nothing;

  update public.collection_items
  set status = 'shipping_requested',
      shipping_request_job_id = job_row.id,
      shipping_request_id = job_row.shipping_request_id,
      updated_at = now()
  where id = any(chunk_item_ids)
    and profile_id = job_row.profile_id
    and status = 'owned'
    and shipping_request_job_id is null;

  get diagnostics claimed_count = row_count;
  if claimed_count <> chunk_count then
    raise exception 'shipping_claim_mismatch';
  end if;

  update public.shipping_request_job_items snapshot
  set status = 'claimed',
      claimed_at = now()
  where snapshot.id = any(chunk_snapshot_ids)
    and snapshot.job_id = job_row.id
    and snapshot.status = 'pending';

  get diagnostics snapshot_claimed_count = row_count;
  if snapshot_claimed_count <> chunk_count then
    raise exception 'shipping_claim_mismatch';
  end if;

  update public.shipping_request_jobs
  set prepared_count = prepared_count + claimed_count,
      status = case
        when prepared_count + claimed_count = item_count
          and not exists (
            select 1
            from public.shipping_request_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then 'submitted'
        else 'processing'
      end,
      completed_at = case
        when prepared_count + claimed_count = item_count
          and not exists (
            select 1
            from public.shipping_request_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then now()
        else completed_at
      end,
      locked_by = case
        when prepared_count + claimed_count = item_count
          and not exists (
            select 1
            from public.shipping_request_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then null
        else p_worker_id
      end,
      heartbeat_at = case
        when prepared_count + claimed_count = item_count
          and not exists (
            select 1
            from public.shipping_request_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then null
        else now()
      end,
      updated_at = now()
  where id = job_row.id
  returning * into job_row;

  if job_row.status = 'submitted' then
    update public.shipping_requests
    set status = 'submitted',
        updated_at = now()
    where id = job_row.shipping_request_id
      and status = 'preparing';

    insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
    values (
      job_row.profile_id,
      'shipping_submitted',
      job_row.shipping_request_id,
      jsonb_build_object(
        'jobId', job_row.id,
        'itemCount', job_row.item_count,
        'selectedCoinValue', job_row.selected_coin_value,
        'minimumCoinValue', job_row.minimum_coin_value
      )
    );
  end if;

  return jsonb_build_object(
    'status', job_row.status,
    'jobId', job_row.id,
    'shippingRequestId', job_row.shipping_request_id,
    'publicCode', job_row.public_code,
    'processedCount', chunk_count,
    'preparedCount', job_row.prepared_count,
    'itemCount', job_row.item_count,
    'totalCoinValue', job_row.total_coin_value,
    'completed', job_row.status = 'submitted',
    'shouldContinue', job_row.status <> 'submitted'
  );
exception
  when others then
    if sqlerrm = 'shipping_claim_mismatch' then
      update public.shipping_request_jobs
      set status = 'failed',
          retry_count = retry_count + 1,
          retry_scheduled_at = null,
          last_error_code = left(sqlstate || ':' || sqlerrm, 200),
          last_error_at = now(),
          locked_by = null,
          heartbeat_at = null,
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where id = p_job_id
        and status not in ('submitted', 'failed')
      returning * into job_row;
    else
      update public.shipping_request_jobs
      set status = case
            when retry_count + 1 >= 5 then 'failed'
            else 'retry_required'
          end,
          retry_count = retry_count + 1,
          retry_scheduled_at = case
            when retry_count + 1 >= 5 then null
            else now() + interval '30 seconds'
          end,
          last_error_code = left(sqlstate || ':' || sqlerrm, 200),
          last_error_at = now(),
          locked_by = null,
          heartbeat_at = null,
          completed_at = case
            when retry_count + 1 >= 5 then coalesce(completed_at, now())
            else completed_at
          end,
          updated_at = now()
      where id = p_job_id
        and status not in ('submitted', 'failed')
      returning * into job_row;
    end if;

    if job_row.status = 'failed' then
      update public.shipping_requests
      set status = 'cancelled',
          updated_at = now()
      where id = job_row.shipping_request_id
        and status = 'preparing';

      update public.collection_items
      set status = 'owned',
          shipping_request_job_id = null,
          shipping_request_id = null,
          updated_at = now()
      where profile_id = job_row.profile_id
        and shipping_request_job_id = job_row.id
        and status in ('shipping_requested', 'shipping_preparing');

      return jsonb_build_object(
        'status', 'failed',
        'jobId', p_job_id,
        'shippingRequestId', job_row.shipping_request_id,
        'processedCount', 0,
        'preparedCount', coalesce(job_row.prepared_count, 0),
        'itemCount', coalesce(job_row.item_count, 0),
        'totalCoinValue', coalesce(job_row.total_coin_value, 0),
        'completed', false,
        'shouldContinue', false,
        'retryRequired', false
      );
    end if;

    return jsonb_build_object(
      'status', coalesce(job_row.status, 'retry_required'),
      'jobId', p_job_id,
      'processedCount', 0,
      'preparedCount', coalesce(job_row.prepared_count, 0),
      'itemCount', coalesce(job_row.item_count, 0),
      'totalCoinValue', coalesce(job_row.total_coin_value, 0),
      'completed', false,
      'shouldContinue', false,
      'retryRequired', true
    );
end;
$$;

create or replace function public.list_shipping_request_recovery_jobs(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  jobs jsonb;
begin
  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'invalid_recovery_limit';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'jobId', recovery.id,
      'profileId', recovery.profile_id,
      'status', recovery.status,
      'itemCount', recovery.item_count,
      'preparedCount', recovery.prepared_count,
      'totalCoinValue', recovery.total_coin_value,
      'retryScheduledAt', recovery.retry_scheduled_at,
      'lastErrorCode', recovery.last_error_code,
      'lastErrorAt', recovery.last_error_at,
      'createdAt', recovery.created_at,
      'updatedAt', recovery.updated_at
    )
    order by recovery.retry_scheduled_at nulls first, recovery.created_at
  ), '[]'::jsonb)
  into jobs
  from (
    select *
    from public.shipping_request_jobs
    where status = 'preparing'
      or (
        status = 'retry_required'
        and (retry_scheduled_at is null or retry_scheduled_at <= now())
      )
      or (
        status = 'processing'
        and coalesce(heartbeat_at, updated_at, created_at) < now() - interval '2 minutes'
      )
    order by
      case status
        when 'preparing' then 0
        when 'retry_required' then 1
        else 2
      end,
      retry_scheduled_at nulls first,
      created_at
    limit p_limit
  ) recovery;

  return jsonb_build_object('jobs', jobs);
end;
$$;

create or replace function public.update_shipping_request_status(
  p_shipping_request_id uuid,
  p_admin_id uuid,
  p_status text,
  p_tracking_provider text default null,
  p_tracking_number text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.shipping_requests%rowtype;
  v_cancel_job public.shipping_request_jobs%rowtype;
  v_previous_status text;
  v_item_count integer := 0;
  v_tracking_provider text := nullif(left(btrim(coalesce(p_tracking_provider, '')), 120), '');
  v_tracking_number text := nullif(left(btrim(coalesce(p_tracking_number, '')), 120), '');
  v_admin_note text := nullif(left(btrim(coalesce(p_admin_note, '')), 500), '');
  v_next_tracking_provider text;
  v_next_tracking_number text;
  v_cancelled_preparing_job boolean := false;
begin
  if p_shipping_request_id is null then
    raise exception 'shipping_request_required' using errcode = '22023';
  end if;

  if p_admin_id is null then
    raise exception 'admin_required' using errcode = '22023';
  end if;

  if p_status not in (
    'submitted',
    'packing',
    'ready_for_pickup',
    'picked_up',
    'shipped',
    'delivered',
    'cancelled'
  ) then
    raise exception 'invalid_shipping_status' using errcode = '22023';
  end if;

  perform 1
  from public.admin_users admin
  where admin.id = p_admin_id
    and admin.is_active;

  if not found then
    raise exception 'active_admin_required' using errcode = '28000';
  end if;

  if p_status = 'cancelled' then
    select *
    into v_cancel_job
    from public.shipping_request_jobs cancel_job
    where cancel_job.shipping_request_id = p_shipping_request_id
      and cancel_job.status in ('preparing', 'processing', 'retry_required')
    order by cancel_job.created_at, cancel_job.id
    limit 1
    for update;

    if v_cancel_job.id is not null then
      update public.shipping_request_jobs
      set status = 'failed',
          retry_scheduled_at = null,
          last_error_code = 'admin_cancelled_preparing',
          last_error_at = now(),
          locked_by = null,
          heartbeat_at = null,
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where id = v_cancel_job.id
        and status in ('preparing', 'processing', 'retry_required')
      returning * into v_cancel_job;

      v_cancelled_preparing_job := found;
    end if;
  end if;

  select *
  into v_request
  from public.shipping_requests
  where id = p_shipping_request_id
  for update;

  if not found then
    raise exception 'shipping_request_not_found' using errcode = 'P0002';
  end if;

  v_previous_status := v_request.status;

  if v_cancelled_preparing_job and v_previous_status <> 'preparing' then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  end if;

  if v_previous_status = 'preparing' then
    if p_status <> 'cancelled' then
      raise exception 'invalid_shipping_transition' using errcode = '22023';
    end if;
  end if;
  if v_previous_status in ('delivered', 'picked_up', 'cancelled') and p_status <> v_previous_status then
    raise exception 'shipping_request_terminal' using errcode = '22023';
  end if;

  if v_previous_status = 'draft' and p_status not in ('submitted', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'submitted' and p_status not in ('submitted', 'packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'packing' and p_status not in ('packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'ready_for_pickup' and p_status not in ('ready_for_pickup', 'picked_up', 'delivered', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'shipped' and p_status not in ('shipped', 'delivered') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  end if;

  v_next_tracking_provider := coalesce(v_tracking_provider, v_request.tracking_provider);
  v_next_tracking_number := coalesce(v_tracking_number, v_request.tracking_number);

  if p_status = 'shipped'
    and (v_next_tracking_provider is null or v_next_tracking_number is null)
  then
    raise exception 'shipping_tracking_required' using errcode = '22023';
  end if;

  select count(*)
  into v_item_count
  from public.shipping_request_items
  where shipping_request_id = p_shipping_request_id;

  update public.shipping_requests
  set
    status = p_status,
    tracking_provider = v_next_tracking_provider,
    tracking_number = v_next_tracking_number,
    admin_note = coalesce(v_admin_note, admin_note),
    updated_at = now()
  where id = p_shipping_request_id
  returning * into v_request;

  if p_status in ('shipped', 'delivered', 'picked_up') then
    update public.collection_items item
    set
      status = 'shipped',
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status in ('shipping_requested', 'shipped');
  elsif p_status = 'cancelled' then
    update public.collection_items item
    set
      status = 'owned',
      shipping_request_job_id = null,
      shipping_request_id = null,
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status in ('shipping_requested', 'shipping_preparing');
  end if;

  insert into public.audit_events (
    actor_admin_id,
    event_type,
    shipping_request_id,
    metadata
  ) values (
    p_admin_id,
    'shipping_status_updated',
    p_shipping_request_id,
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'status', v_request.status,
      'trackingProvider', v_next_tracking_provider,
      'trackingNumber', v_next_tracking_number,
      'adminNote', v_admin_note,
      'itemCount', v_item_count
    )
  );

  return jsonb_build_object(
    'shippingRequestId', v_request.id,
    'publicCode', v_request.public_code,
    'previousStatus', v_previous_status,
    'status', v_request.status,
    'itemCount', v_item_count
  );
end;
$$;

create or replace function public.request_shipping_for_items(
  p_profile_id uuid,
  p_address_id uuid,
  p_collection_item_ids uuid[],
  p_customer_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  requested_count integer;
  valid_count integer;
  updated_count integer;
  shipping_row public.shipping_requests%rowtype;
  existing_request public.shipping_requests%rowtype;
  address_row public.user_addresses%rowtype;
  selected_coin_value integer := 0;
  minimum_coin_value integer := 1000;
  address_snapshot jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ynot-profile-action:' || p_profile_id::text, 0));

  if p_idempotency_key is not null then
    select *
    into existing_request
    from public.shipping_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_request.id is not null then
      return jsonb_build_object(
        'status', existing_request.status,
        'shippingRequestId', existing_request.id,
        'publicCode', existing_request.public_code,
        'replayed', true
      );
    end if;
  end if;

  if exists (
    select 1
    from public.shipping_request_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_exists';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_conversion
    where active_conversion.profile_id = p_profile_id
      and active_conversion.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_blocks_shipping';
  end if;

  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select *
  into address_row
  from public.user_addresses ua
  where ua.id = p_address_id
    and ua.profile_id = p_profile_id;

  if not found
    or nullif(btrim(coalesce(address_row.recipient_name, '')), '') is null
    or nullif(btrim(coalesce(address_row.phone, '')), '') is null
    or nullif(btrim(coalesce(address_row.address_line1, '')), '') is null
    or nullif(btrim(coalesce(address_row.subdistrict, '')), '') is null
    or nullif(btrim(coalesce(address_row.district, '')), '') is null
    or nullif(btrim(coalesce(address_row.province, '')), '') is null
    or nullif(btrim(coalesce(address_row.postal_code, '')), '') is null
    or nullif(btrim(coalesce(address_row.country, '')), '') is null
  then
    raise exception 'valid_shipping_address_required';
  end if;

  select count(distinct item_id)
  into requested_count
  from unnest(p_collection_item_ids) as item_id;

  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
    and ci.shipping_request_job_id is null
  for update;

  select
    count(*),
    coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)
  into valid_count, selected_coin_value
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
    and ci.shipping_request_job_id is null;

  if valid_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;

  if selected_coin_value < minimum_coin_value then
    raise exception 'shipping_minimum_coin_value_required';
  end if;

  address_snapshot := public.shipping_address_snapshot(address_row);

  insert into public.shipping_requests(
    profile_id,
    address_id,
    address_snapshot,
    status,
    customer_note,
    idempotency_key
  )
  values (
    p_profile_id,
    p_address_id,
    address_snapshot,
    'submitted',
    p_customer_note,
    p_idempotency_key
  )
  returning * into shipping_row;

  insert into public.shipping_request_items(shipping_request_id, collection_item_id, card_id)
  select shipping_row.id, ci.id, ci.card_id
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
    and ci.shipping_request_job_id is null;

  update public.collection_items
  set
    status = 'shipping_requested',
    shipping_request_id = shipping_row.id,
    shipping_request_job_id = null,
    updated_at = now()
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id
    and status = 'owned'
    and shipping_request_job_id is null;

  get diagnostics updated_count = row_count;
  if updated_count <> requested_count then
    raise exception 'shipping_claim_mismatch';
  end if;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (
    p_profile_id,
    'shipping_submitted',
    shipping_row.id,
    jsonb_build_object(
      'item_count', requested_count,
      'selectedCoinValue', selected_coin_value,
      'minimumCoinValue', minimum_coin_value,
      'legacyFallback', true
    )
  );

  return jsonb_build_object(
    'status', 'submitted',
    'shippingRequestId', shipping_row.id,
    'publicCode', shipping_row.public_code,
    'itemCount', requested_count
  );
end;
$$;

create or replace function public.list_shipping_request_item_previews(
  p_shipping_request_ids uuid[],
  p_limit_per_request integer default 250
)
returns setof public.shipping_request_items
language sql
security invoker
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      request_item.shipping_request_id,
      request_item.collection_item_id,
      request_item.card_id,
      request_item.created_at,
      row_number() over (
        partition by request_item.shipping_request_id
        order by request_item.created_at asc, request_item.collection_item_id asc
      ) as preview_rank
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = any(coalesce(p_shipping_request_ids, '{}'::uuid[]))
  )
  select
    ranked.shipping_request_id,
    ranked.collection_item_id,
    ranked.card_id,
    ranked.created_at
  from ranked
  where ranked.preview_rank <= greatest(1, least(coalesce(p_limit_per_request, 250), 250))
  order by ranked.shipping_request_id asc, ranked.created_at asc, ranked.collection_item_id asc;
$$;

revoke all on public.shipping_request_quote_tokens, public.shipping_request_jobs, public.shipping_request_job_items from public, anon, authenticated;
grant all on public.shipping_request_quote_tokens, public.shipping_request_jobs, public.shipping_request_job_items to service_role;

revoke all on function public.shipping_address_snapshot(public.user_addresses) from public, anon, authenticated;
revoke all on function public.prepare_shipping_request_quote(uuid, uuid, text, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.start_shipping_request_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_shipping_request_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.list_shipping_request_recovery_jobs(integer) from public, anon, authenticated;
revoke all on function public.list_shipping_request_item_previews(uuid[], integer) from public, anon, authenticated;
revoke all on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) from public, anon, authenticated;

grant execute on function public.shipping_address_snapshot(public.user_addresses) to service_role;
grant execute on function public.prepare_shipping_request_quote(uuid, uuid, text, uuid[], text, text) to service_role;
grant execute on function public.start_shipping_request_job(uuid, uuid, text) to service_role;
grant execute on function public.process_shipping_request_chunk(uuid, integer, text) to service_role;
grant execute on function public.list_shipping_request_recovery_jobs(integer) to service_role;
grant execute on function public.list_shipping_request_item_previews(uuid[], integer) to service_role;
grant execute on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) to service_role;
