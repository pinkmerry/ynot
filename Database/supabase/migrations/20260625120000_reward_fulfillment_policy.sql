-- Reward fulfillment policy: explicit ship/sell behavior per prize and per won reward.
-- The policy is snapshotted onto collection_items so admin edits only affect future rewards.

alter table public.draw_round_prizes
  add column if not exists fulfillment_policy text not null default 'ship_or_convert';

alter table public.collection_items
  add column if not exists fulfillment_policy_snapshot text not null default 'ship_or_convert';

update public.draw_round_prizes
set fulfillment_policy = case
  when coalesce(convert_coin_value, 0) > 0 then 'ship_or_convert'
  else 'ship_only'
end
where fulfillment_policy = 'ship_or_convert'
  and coalesce(convert_coin_value, 0) <= 0;

update public.collection_items
set fulfillment_policy_snapshot = case
  when coalesce(convert_coin_value_snapshot, 0) > 0 then 'ship_or_convert'
  else 'ship_only'
end
where fulfillment_policy_snapshot = 'ship_or_convert'
  and coalesce(convert_coin_value_snapshot, 0) <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_fulfillment_policy_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_fulfillment_policy_check
      check (fulfillment_policy in ('ship_or_convert', 'ship_only', 'convert_only'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'collection_items_fulfillment_policy_snapshot_check'
      and conrelid = 'public.collection_items'::regclass
  ) then
    alter table public.collection_items
      add constraint collection_items_fulfillment_policy_snapshot_check
      check (fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only', 'convert_only'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_convertible_policy_requires_value_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_convertible_policy_requires_value_check
      check (fulfillment_policy = 'ship_only' or convert_coin_value > 0);
  end if;
end $$;

create or replace function app_private.snapshot_collection_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fulfillment_policy text;
begin
  if new.source_type <> 'gacha_open' then
    return new;
  end if;

  select dp.fulfillment_policy
    into v_fulfillment_policy
  from public.gacha_open_items goi
  join public.draw_round_prizes dp on dp.id = goi.draw_round_prize_id
  where goi.id = new.gacha_open_item_id
     or (new.gacha_open_item_id is null and goi.gacha_open_id = new.source_id)
  order by case when goi.id = new.gacha_open_item_id then 0 else 1 end,
           goi.result_position
  limit 1;

  new.fulfillment_policy_snapshot := coalesce(
    v_fulfillment_policy,
    new.fulfillment_policy_snapshot,
    'ship_or_convert'
  );

  return new;
end;
$$;

revoke all on function app_private.snapshot_collection_fulfillment() from public, anon, authenticated;

drop trigger if exists collection_items_fulfillment_snapshot_before_insert
  on public.collection_items;

create trigger collection_items_fulfillment_snapshot_before_insert
  before insert on public.collection_items
  for each row execute function app_private.snapshot_collection_fulfillment();

create or replace function app_private.last_prize_fulfillment_policy(last_prize_metadata jsonb)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when last_prize_metadata ->> 'fulfillmentPolicy' in ('ship_or_convert', 'ship_only', 'convert_only')
      then last_prize_metadata ->> 'fulfillmentPolicy'
    when coalesce(last_prize_metadata ->> 'convertCoinValue', '') ~ '^[0-9]+$'
      and (last_prize_metadata ->> 'convertCoinValue')::integer > 0
      then 'ship_or_convert'
    else 'ship_only'
  end;
$$;

revoke all on function app_private.last_prize_fulfillment_policy(jsonb) from public, anon, authenticated;
grant execute on function app_private.last_prize_fulfillment_policy(jsonb) to service_role;

create or replace function app_private.sync_last_prize_fulfillment_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.last_prize_collection_item_id is null then
    return new;
  end if;

  update public.collection_items item
  set fulfillment_policy_snapshot = app_private.last_prize_fulfillment_policy(new.last_prize_metadata),
      updated_at = now()
  where item.id = new.last_prize_collection_item_id;

  return new;
end;
$$;

revoke all on function app_private.sync_last_prize_fulfillment_policy() from public, anon, authenticated;

drop trigger if exists draw_rounds_sync_last_prize_fulfillment_policy
  on public.draw_rounds;

create trigger draw_rounds_sync_last_prize_fulfillment_policy
  after insert or update of last_prize_metadata, last_prize_collection_item_id
  on public.draw_rounds
  for each row
  execute function app_private.sync_last_prize_fulfillment_policy();

update public.collection_items item
set fulfillment_policy_snapshot = app_private.last_prize_fulfillment_policy(round.last_prize_metadata)
from public.draw_rounds round
where item.id = round.last_prize_collection_item_id
  and round.last_prize_collection_item_id is not null
  and round.last_prize_metadata is not null;

create index if not exists collection_items_shipping_eligible_policy_idx
  on public.collection_items(profile_id, acquired_at, id)
  include (convert_coin_value_snapshot, card_id, fulfillment_policy_snapshot)
  where status = 'owned'
    and fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only');

create index if not exists collection_items_conversion_eligible_policy_idx
  on public.collection_items(profile_id, acquired_at, id)
  include (convert_coin_value_snapshot, convert_expires_at, fulfillment_policy_snapshot)
  where status = 'owned'
    and fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
    and convert_coin_value_snapshot is not null
    and convert_coin_value_snapshot > 0;


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
  ship_only_count integer := 0;
  min_id text;
  max_id text;
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
      coalesce(sum(case when ci.fulfillment_policy_snapshot = 'ship_or_convert' then coalesce(ci.convert_coin_value_snapshot, 0) else 0 end), 0)::int,
      (count(*) filter (where ci.fulfillment_policy_snapshot = 'ship_only'))::int,
      md5(coalesce(string_agg(ci.id::text || ':' || coalesce(ci.convert_coin_value_snapshot, 0)::text || ':' || ci.fulfillment_policy_snapshot::text, ',' order by ci.acquired_at, ci.id), 'empty'))
    into selected_ids, quoted_count, quoted_total, ship_only_count, quoted_hash
    from public.collection_items ci
    where ci.profile_id = p_profile_id
      and ci.status = 'owned'
      and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
      and ci.shipping_request_job_id is null
      and ci.id = any(p_collection_item_ids);
  else
    selected_ids := '{}'::uuid[];
    select
      count(*)::int,
      coalesce(sum(case when ci.fulfillment_policy_snapshot = 'ship_or_convert' then coalesce(ci.convert_coin_value_snapshot, 0) else 0 end), 0)::int,
      (count(*) filter (where ci.fulfillment_policy_snapshot = 'ship_only'))::int,
      min(ci.id::text),
      max(ci.id::text),
      min(ci.acquired_at),
      max(ci.acquired_at)
    into quoted_count, quoted_total, ship_only_count, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items ci
    where ci.profile_id = p_profile_id
      and ci.status = 'owned'
      and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
      and ci.shipping_request_job_id is null
      and ci.acquired_at <= selection_fence_at;

    quoted_hash := md5(
      quoted_count::text || ':' ||
      quoted_total::text || ':' ||
      ship_only_count::text || ':' ||
      coalesce(min_id, '') || ':' ||
      coalesce(max_id, '') || ':' ||
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
  if ship_only_count = 0 and quoted_total < minimum_coin_value then
    raise exception 'shipping_minimum_not_met';
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
      'selectionFenceAcquiredAt', selection_fence_at,
      'shipOnlyCount', ship_only_count
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
  min_id text;
  max_id text;
  min_acquired_at public.collection_items.acquired_at%type;
  max_acquired_at public.collection_items.acquired_at%type;
  selection_fence_at timestamptz;
  current_ship_only_count integer := 0;
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
      coalesce(sum(case when ci.fulfillment_policy_snapshot = 'ship_or_convert' then coalesce(ci.convert_coin_value_snapshot, 0) else 0 end), 0)::int,
      (count(*) filter (where ci.fulfillment_policy_snapshot = 'ship_only'))::int,
      md5(coalesce(string_agg(ci.id::text || ':' || coalesce(ci.convert_coin_value_snapshot, 0)::text || ':' || ci.fulfillment_policy_snapshot::text, ',' order by ci.acquired_at, ci.id), 'empty'))
    into current_count, current_total, current_ship_only_count, current_hash
    from public.collection_items ci
    where ci.profile_id = quote_row.profile_id
      and ci.status = 'owned'
      and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
      and ci.shipping_request_job_id is null
      and exists (
        select 1
        from unnest(quote_row.collection_item_ids) as selected_id
        where selected_id = ci.id
      );
  else
    select
      count(*)::int,
      coalesce(sum(case when ci.fulfillment_policy_snapshot = 'ship_or_convert' then coalesce(ci.convert_coin_value_snapshot, 0) else 0 end), 0)::int,
      (count(*) filter (where ci.fulfillment_policy_snapshot = 'ship_only'))::int,
      min(ci.id::text),
      max(ci.id::text),
      min(ci.acquired_at),
      max(ci.acquired_at)
    into current_count, current_total, current_ship_only_count, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items ci
    where ci.profile_id = quote_row.profile_id
      and ci.status = 'owned'
      and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
      and ci.shipping_request_job_id is null
      and ci.acquired_at <= selection_fence_at;

    current_hash := md5(
      current_count::text || ':' ||
      current_total::text || ':' ||
      current_ship_only_count::text || ':' ||
      coalesce(min_id, '') || ':' ||
      coalesce(max_id, '') || ':' ||
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
          and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
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
    and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
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
    and fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
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

create or replace function public.prepare_reward_conversion_quote(
  p_profile_id uuid,
  p_selection_mode text,
  p_collection_item_ids uuid[] default null,
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
  min_id text;
  max_id text;
  min_acquired_at public.collection_items.acquired_at%type;
  max_acquired_at public.collection_items.acquired_at%type;
  selection_fence_at timestamptz;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_selection_mode not in ('selected', 'all_eligible') then
    raise exception 'reward_conversion_selection_mode_required';
  end if;
  if p_selection_mode = 'selected' and (p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0) then
    raise exception 'collection_items_required';
  end if;

  if exists (
    select 1
    from public.shipping_request_jobs active_shipping
    where active_shipping.profile_id = p_profile_id
      and active_shipping.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_blocks_conversion';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_exists';
  end if;

  selection_fence_at := now();

  if p_selection_mode = 'selected' then
    select count(distinct item_id) into requested_count
    from unnest(p_collection_item_ids) as item_id;
    if requested_count <> cardinality(p_collection_item_ids) then
      raise exception 'duplicate_collection_items';
    end if;

    select
      coalesce(array_agg(id order by id), '{}'::uuid[]),
      count(*)::int,
      coalesce(sum(convert_coin_value_snapshot), 0)::int,
      md5(coalesce(string_agg(id::text || ':' || convert_coin_value_snapshot::text || ':' || fulfillment_policy_snapshot::text, ',' order by id), 'empty'))
    into selected_ids, quoted_count, quoted_total, quoted_hash
    from public.collection_items
    where profile_id = p_profile_id
      and status = 'owned'
      and fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
      and convert_coin_value_snapshot is not null
      and convert_coin_value_snapshot > 0
      and (convert_expires_at is null or convert_expires_at > now())
      and id = any(p_collection_item_ids);
  else
    selected_ids := '{}'::uuid[];
    select
      count(*)::int,
      coalesce(sum(convert_coin_value_snapshot), 0)::int,
      min(id::text),
      max(id::text),
      min(acquired_at),
      max(acquired_at)
    into quoted_count, quoted_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items
    where profile_id = p_profile_id
      and status = 'owned'
      and fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
      and convert_coin_value_snapshot is not null
      and convert_coin_value_snapshot > 0
      and (convert_expires_at is null or convert_expires_at > now())
      and acquired_at <= selection_fence_at;

    quoted_hash := md5(
      quoted_count::text || ':' ||
      quoted_total::text || ':' ||
      coalesce(min_id, '') || ':' ||
      coalesce(max_id, '') || ':' ||
      coalesce(min_acquired_at::text, '') || ':' ||
      coalesce(max_acquired_at::text, '')
    );
  end if;

  if p_selection_mode = 'selected' and quoted_count <> requested_count then
    raise exception 'collection_items_not_convertible';
  end if;
  if quoted_count = 0 then
    raise exception 'collection_items_required';
  end if;
  if quoted_total <= 0 then
    raise exception 'no_convert_value';
  end if;

  insert into public.reward_conversion_quote_tokens(
    profile_id,
    selection_mode,
    collection_item_ids,
    item_count,
    total_coins,
    quote_hash,
    idempotency_key,
    expires_at,
    metadata
  ) values (
    p_profile_id,
    p_selection_mode,
    case
      when p_selection_mode = 'selected' then selected_ids
      else '{}'::uuid[]
    end,
    quoted_count,
    quoted_total,
    quoted_hash,
    p_idempotency_key,
    now() + interval '15 minutes',
    jsonb_build_object(
      'source', 'prepare_reward_conversion_quote',
      'selectionFenceAcquiredAt', selection_fence_at
    )
  )
  returning id into quote_id;

  return jsonb_build_object(
    'quoteToken', quote_id,
    'selectionMode', p_selection_mode,
    'itemCount', quoted_count,
    'totalCoins', quoted_total,
    'expiresAt', (now() + interval '15 minutes')
  );
end;
$$;

create or replace function public.start_reward_conversion(
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
  quote_row public.reward_conversion_quote_tokens%rowtype;
  existing_job public.reward_conversion_jobs%rowtype;
  current_count integer;
  current_total integer;
  current_hash text;
  new_job_id uuid;
  min_id text;
  max_id text;
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
  from public.reward_conversion_quote_tokens
  where id = p_quote_token_id
  for update;

  if quote_row.id is null then
    raise exception 'quote_token_not_found';
  end if;
  if quote_row.profile_id <> p_profile_id then
    raise exception 'quote_token_not_found';
  end if;
  if quote_row.consumed_by_job_id is not null then
    select * into existing_job
    from public.reward_conversion_jobs
    where id = quote_row.consumed_by_job_id
    for update;

    return jsonb_build_object(
        'status', existing_job.status,
        'jobId', existing_job.id,
        'itemCount', existing_job.item_count,
        'convertedCount', existing_job.converted_count,
        'totalCoins', existing_job.total_coins,
        'creditedTotalCoins', existing_job.credited_total_coins,
        'completed', existing_job.status = 'completed',
        'shouldContinue', existing_job.status <> 'completed',
        'replayed', true
    );
  end if;
  if quote_row.expires_at <= now() then
    raise exception 'reward_conversion_quote_expired';
  end if;

  selection_fence_at := coalesce(
    nullif(quote_row.metadata->>'selectionFenceAcquiredAt', '')::timestamptz,
    quote_row.created_at
  );

  if exists (
    select 1
    from public.shipping_request_jobs active_shipping
    where active_shipping.profile_id = quote_row.profile_id
      and active_shipping.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_blocks_conversion';
  end if;

  if quote_row.selection_mode = 'selected' then
    select
      count(*)::int,
      coalesce(sum(eligible.convert_coin_value_snapshot), 0)::int,
      md5(coalesce(string_agg(eligible.id::text || ':' || eligible.convert_coin_value_snapshot::text || ':' || eligible.fulfillment_policy_snapshot::text, ',' order by eligible.id), 'empty'))
    into current_count, current_total, current_hash
    from public.collection_items eligible
    where eligible.profile_id = quote_row.profile_id
      and eligible.status = 'owned'
      and eligible.fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
      and eligible.convert_coin_value_snapshot is not null
      and eligible.convert_coin_value_snapshot > 0
      and (eligible.convert_expires_at is null or eligible.convert_expires_at > now())
      and eligible.id = any(quote_row.collection_item_ids);
  else
    select
      count(*)::int,
      coalesce(sum(eligible.convert_coin_value_snapshot), 0)::int,
      min(eligible.id::text),
      max(eligible.id::text),
      min(eligible.acquired_at),
      max(eligible.acquired_at)
    into current_count, current_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items eligible
    where eligible.profile_id = quote_row.profile_id
      and eligible.status = 'owned'
      and eligible.fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
      and eligible.convert_coin_value_snapshot is not null
      and eligible.convert_coin_value_snapshot > 0
      and (eligible.convert_expires_at is null or eligible.convert_expires_at > now())
      and eligible.acquired_at <= selection_fence_at;

    current_hash := md5(
      current_count::text || ':' ||
      current_total::text || ':' ||
      coalesce(min_id, '') || ':' ||
      coalesce(max_id, '') || ':' ||
      coalesce(min_acquired_at::text, '') || ':' ||
      coalesce(max_acquired_at::text, '')
    );
  end if;

  if current_count <> quote_row.item_count
     or current_total <> quote_row.total_coins
     or current_hash <> quote_row.quote_hash then
    raise exception 'reward_conversion_quote_changed';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_exists';
  end if;

  if coalesce(p_idempotency_key, quote_row.idempotency_key) is not null then
    select * into existing_job
    from public.reward_conversion_jobs
    where profile_id = p_profile_id
      and idempotency_key = coalesce(p_idempotency_key, quote_row.idempotency_key)
    limit 1;

    if existing_job.id is not null then
      return jsonb_build_object(
        'status', existing_job.status,
        'jobId', existing_job.id,
        'itemCount', existing_job.item_count,
        'convertedCount', existing_job.converted_count,
        'totalCoins', existing_job.total_coins,
        'creditedTotalCoins', existing_job.credited_total_coins,
        'completed', existing_job.status = 'completed',
        'shouldContinue', existing_job.status <> 'completed',
        'replayed', true
      );
    end if;
  end if;

  insert into public.reward_conversion_jobs(
    profile_id,
    quote_token_id,
    status,
    selection_mode,
    item_count,
    total_coins,
    quote_hash,
    idempotency_key,
    queue_job_id,
    started_at,
    metadata
  ) values (
    quote_row.profile_id,
    quote_row.id,
    'queued',
    quote_row.selection_mode,
    quote_row.item_count,
    quote_row.total_coins,
    quote_row.quote_hash,
    coalesce(p_idempotency_key, quote_row.idempotency_key),
    null,
    now(),
    jsonb_build_object(
      'source', 'start_reward_conversion',
      'selectionFenceAcquiredAt', selection_fence_at
    )
  )
  returning id into new_job_id;

  update public.reward_conversion_quote_tokens
  set consumed_at = now(),
      consumed_by_job_id = new_job_id
  where id = quote_row.id;

  return jsonb_build_object(
    'status', 'queued',
    'jobId', new_job_id,
    'itemCount', quote_row.item_count,
    'convertedCount', 0,
    'totalCoins', quote_row.total_coins,
    'creditedTotalCoins', 0,
    'completed', false,
    'shouldContinue', true,
    'replayed', false
  );
end;
$$;

create or replace function public.process_reward_conversion_chunk(
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
  job_row public.reward_conversion_jobs%rowtype;
  quote_row public.reward_conversion_quote_tokens%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  chunk_snapshot_ids uuid[];
  chunk_item_ids uuid[];
  chunk_count integer;
  chunk_total integer;
  snapshot_total_count integer;
  claim_limit integer;
  v_ledger_id uuid;
  chunk_idempotency_key text;
  updated_count integer;
  snapshot_updated_count integer;
  selection_fence_at timestamptz;
begin
  if p_job_id is null then
    raise exception 'conversion_job_required';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 5000 then
    raise exception 'invalid_process_limit';
  end if;

  select * into job_row
  from public.reward_conversion_jobs
  where id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'conversion_job_not_found';
  end if;
  if job_row.status in ('completed', 'failed') then
    return jsonb_build_object(
      'status', job_row.status,
      'jobId', job_row.id,
      'processedCount', 0,
      'convertedCount', job_row.converted_count,
      'creditedTotalCoins', job_row.credited_total_coins,
      'totalCoins', job_row.total_coins,
      'completed', job_row.status = 'completed',
      'failed', job_row.status = 'failed',
      'shouldContinue', false
    );
  end if;
  if job_row.status not in ('queued', 'processing', 'retry_required') then
    raise exception 'conversion_job_not_processable';
  end if;

  update public.reward_conversion_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      heartbeat_at = now(),
      updated_at = now()
  where id = job_row.id;

  select * into quote_row
  from public.reward_conversion_quote_tokens
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
    count(*)::int,
    coalesce(sum(chunk.coin_value), 0)::int
  into chunk_snapshot_ids, chunk_item_ids, chunk_count, chunk_total
  from (
    select snapshot.id, snapshot.collection_item_id, snapshot.coin_value, snapshot.created_at
    from public.reward_conversion_job_items snapshot
    where snapshot.job_id = job_row.id
      and snapshot.status = 'pending'
    order by snapshot.created_at, snapshot.id
    limit p_limit
    for update skip locked
  ) chunk;

  if chunk_count = 0 then
    select count(*)::int
    into snapshot_total_count
    from public.reward_conversion_job_items snapshot
    where snapshot.job_id = job_row.id;

    claim_limit := least(p_limit, greatest(job_row.item_count - snapshot_total_count, 0));

    if claim_limit > 0 then
      with claimable as (
        select
          eligible.id,
          eligible.convert_coin_value_snapshot,
          eligible.acquired_at
        from public.collection_items eligible
        where eligible.profile_id = job_row.profile_id
          and eligible.status = 'owned'
          and eligible.fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only')
          and eligible.convert_coin_value_snapshot is not null
          and eligible.convert_coin_value_snapshot > 0
          and (
            (
              job_row.selection_mode = 'all_eligible'
              and eligible.acquired_at <= selection_fence_at
            )
            or (
              job_row.selection_mode = 'selected'
              and eligible.id = any(quote_row.collection_item_ids)
            )
          )
          and not exists (
            select 1
            from public.reward_conversion_job_items existing
            where existing.job_id = job_row.id
              and existing.collection_item_id = eligible.id
          )
        order by eligible.acquired_at, eligible.id
        limit claim_limit
        for update skip locked
      ),
      inserted as (
        insert into public.reward_conversion_job_items(
          job_id,
          collection_item_id,
          profile_id,
          coin_value
        )
        select
          job_row.id,
          claimable.id,
          job_row.profile_id,
          claimable.convert_coin_value_snapshot
        from claimable
        on conflict (job_id, collection_item_id) do nothing
        returning id, collection_item_id, coin_value, created_at
      )
      select
        coalesce(array_agg(inserted.id order by inserted.created_at, inserted.id), '{}'::uuid[]),
        coalesce(array_agg(inserted.collection_item_id order by inserted.created_at, inserted.id), '{}'::uuid[]),
        count(*)::int,
        coalesce(sum(inserted.coin_value), 0)::int
      into chunk_snapshot_ids, chunk_item_ids, chunk_count, chunk_total
      from inserted;
    end if;
  end if;

  if chunk_count = 0 then
    if job_row.converted_count = job_row.item_count
       and job_row.credited_total_coins = job_row.total_coins then
      update public.reward_conversion_jobs
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          locked_by = null,
          heartbeat_at = null,
          updated_at = now()
      where id = job_row.id
      returning * into job_row;
    else
      raise exception 'reward_conversion_claim_mismatch';
    end if;

    return jsonb_build_object(
      'status', job_row.status,
      'jobId', job_row.id,
      'processedCount', 0,
      'convertedCount', job_row.converted_count,
      'creditedTotalCoins', job_row.credited_total_coins,
      'totalCoins', job_row.total_coins,
      'completed', job_row.status = 'completed',
      'failed', false,
      'shouldContinue', job_row.status <> 'completed'
    );
  end if;

  insert into public.wallet_accounts(profile_id)
  values (job_row.profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = job_row.profile_id
  for update;

  chunk_idempotency_key := job_row.id::text || ':' || (job_row.converted_count + 1)::text || ':' || chunk_count::text;

  insert into public.coin_ledger(
    profile_id,
    wallet_profile_id,
    entry_type,
    amount_coins,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) values (
    job_row.profile_id,
    job_row.profile_id,
    'exchange_credit',
    chunk_total,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins + chunk_total,
    'reward_conversion',
    null,
    chunk_idempotency_key,
    jsonb_build_object(
      'jobId', job_row.id,
      'itemCount', chunk_count,
      'collectionItemIds', to_jsonb(chunk_item_ids),
      'source', 'process_reward_conversion_chunk'
    )
  )
  returning id into v_ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + chunk_total,
      version = version + 1
  where profile_id = job_row.profile_id;

  update public.collection_items
  set status = 'exchanged',
      conversion_job_id = job_row.id
  where id = any(chunk_item_ids)
    and profile_id = job_row.profile_id
    and status = 'owned'
    and fulfillment_policy_snapshot in ('ship_or_convert', 'convert_only');

  get diagnostics updated_count = row_count;
  if updated_count <> chunk_count then
    raise exception 'reward_conversion_claim_mismatch';
  end if;

  update public.reward_conversion_job_items snapshot
  set status = 'converted',
      ledger_id = v_ledger_id,
      converted_at = now()
  where snapshot.id = any(chunk_snapshot_ids)
    and snapshot.job_id = job_row.id
    and snapshot.status = 'pending';

  get diagnostics snapshot_updated_count = row_count;
  if snapshot_updated_count <> chunk_count then
    raise exception 'reward_conversion_claim_mismatch';
  end if;

  update public.reward_conversion_jobs
  set converted_count = converted_count + chunk_count,
      credited_total_coins = credited_total_coins + chunk_total,
      status = case
        when converted_count + chunk_count = item_count
          and credited_total_coins + chunk_total = total_coins
          and not exists (
            select 1
            from public.reward_conversion_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then 'completed'
        else 'processing'
      end,
      completed_at = case
        when converted_count + chunk_count = item_count
          and credited_total_coins + chunk_total = total_coins
          and not exists (
            select 1
            from public.reward_conversion_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then now()
        else completed_at
      end,
      locked_by = case
        when converted_count + chunk_count = item_count
          and credited_total_coins + chunk_total = total_coins
          and not exists (
            select 1
            from public.reward_conversion_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then null
        else p_worker_id
      end,
      heartbeat_at = case
        when converted_count + chunk_count = item_count
          and credited_total_coins + chunk_total = total_coins
          and not exists (
            select 1
            from public.reward_conversion_job_items remaining
            where remaining.job_id = job_row.id
              and remaining.status = 'pending'
          ) then null
        else now()
      end,
      updated_at = now()
  where id = job_row.id
  returning * into job_row;

  insert into public.audit_events(actor_profile_id, event_type, metadata)
  values (
    job_row.profile_id,
    'reward_conversion_processed',
    jsonb_build_object(
      'jobId', job_row.id,
      'itemCount', chunk_count,
      'totalCoins', chunk_total,
      'ledgerId', v_ledger_id
    )
  );

  return jsonb_build_object(
    'status', job_row.status,
    'jobId', job_row.id,
    'processedCount', chunk_count,
    'convertedCount', job_row.converted_count,
    'creditedTotalCoins', job_row.credited_total_coins,
    'totalCoins', job_row.total_coins,
    'completed', job_row.status = 'completed',
    'failed', false,
    'shouldContinue', job_row.status <> 'completed'
  );
exception
  when others then
    if sqlerrm = 'reward_conversion_claim_mismatch' then
      update public.reward_conversion_jobs
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
        and status not in ('completed', 'failed')
      returning * into job_row;
    else
      update public.reward_conversion_jobs
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
        and status not in ('completed', 'failed')
      returning * into job_row;
    end if;

    if job_row.status = 'failed' then
      return jsonb_build_object(
        'status', 'failed',
        'jobId', p_job_id,
        'processedCount', 0,
        'convertedCount', coalesce(job_row.converted_count, 0),
        'creditedTotalCoins', coalesce(job_row.credited_total_coins, 0),
        'totalCoins', coalesce(job_row.total_coins, 0),
        'completed', false,
        'failed', true,
        'shouldContinue', false,
        'retryRequired', false
      );
    end if;

    return jsonb_build_object(
      'status', coalesce(job_row.status, 'retry_required'),
      'jobId', p_job_id,
      'processedCount', 0,
      'convertedCount', coalesce(job_row.converted_count, 0),
      'creditedTotalCoins', coalesce(job_row.credited_total_coins, 0),
      'totalCoins', coalesce(job_row.total_coins, 0),
      'completed', false,
      'failed', false,
      'shouldContinue', false,
      'retryRequired', true
    );
end;
$$;

create or replace function public.edit_live_campaign_inventory(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_prizes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  v_admin_is_active boolean;
  desired record;
  existing public.draw_round_prizes%rowtype;
  v_prize_id uuid;
  v_planned_total integer := 0;
  v_awarded integer;
  v_nonvoid integer;
  v_delta integer;
  v_got integer;
  v_removed integer;
  v_consumed_slots integer;
  v_total_awarded integer;
  v_materialized_total integer;
  v_available_units integer;
  v_slot_rows integer;
  v_mismatch integer;
  v_identity_changed boolean;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;
  if p_admin_id is null then
    raise exception 'active_admin_required';
  end if;
  select exists (
    select 1 from public.admin_users admin
    where admin.id = p_admin_id and admin.is_active
  ) into v_admin_is_active;
  if not v_admin_is_active then
    raise exception 'active_admin_required';
  end if;
  if jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) = 0 then
    raise exception 'prize_inventory_required';
  end if;

  -- 1. Serialize against concurrent opens by locking the round first.
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.status <> 'live' or campaign.approval_status <> 'approved' then
    raise exception 'campaign_not_live_editable';
  end if;

  -- 2. Stage the desired prize list. seed_run_id stays text here and is cast to
  --    uuid at each insert into a uuid column.
  create temporary table _desired_prizes on commit drop as
  select
    row_number() over () as ord,
    (x."cardId")::uuid as card_id,
    x.tier as tier,
    x.rank as rank,
    x."valueThb" as value_thb,
    x."convertCoinValue" as convert_coin_value,
    coalesce(nullif(x."fulfillmentPolicy", ''), 'ship_or_convert') as fulfillment_policy,
    coalesce(x.weight, 1)::numeric as weight,
    coalesce(x."unlockAtSoldPct", 0)::numeric as unlock_at_sold_pct,
    greatest(coalesce(x."plannedQuantity", 0), 0)::integer as planned_quantity,
    coalesce(x."isTest", false) as is_test,
    nullif(btrim(x."seedRunId"), '')::uuid as seed_run_id,
    coalesce(x.metadata, '{}'::jsonb) as metadata,
    coalesce(x.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb as hidden
  from jsonb_to_recordset(p_prizes) as x(
    "cardId" text,
    tier text,
    rank integer,
    "valueThb" integer,
    "convertCoinValue" integer,
    "fulfillmentPolicy" text,
    weight numeric,
    "unlockAtSoldPct" numeric,
    "plannedQuantity" integer,
    "isTest" boolean,
    "seedRunId" text,
    metadata jsonb
  );

  if exists (
    select 1 from _desired_prizes where card_id is null or tier is null or rank is null
  ) then
    raise exception 'invalid_prize_row';
  end if;
  if exists (
    select 1 from _desired_prizes
    where fulfillment_policy not in ('ship_or_convert', 'ship_only', 'convert_only')
       or ((fulfillment_policy = 'ship_or_convert' or fulfillment_policy = 'convert_only') and coalesce(convert_coin_value, 0) <= 0)
  ) then
    raise exception 'invalid_fulfillment_policy';
  end if;
  if exists (
    select tier, rank from _desired_prizes group by tier, rank having count(*) > 1
  ) then
    raise exception 'duplicate_prize_tier_rank';
  end if;

  -- 3. Remove prizes dropped from the desired list. Reject if any have awarded
  --    units; otherwise release their available units and hide them (planned 0)
  --    rather than DELETE — draw_round_prize_units reference prizes with
  --    on delete restrict, and hidden rows preserve the void/audit history.
  for existing in
    select p.* from public.draw_round_prizes p
    where p.draw_round_id = p_draw_round_id
      and not exists (
        select 1 from _desired_prizes d where d.tier = p.tier and d.rank = p.rank
      )
    for update
  loop
    select count(*)::integer into v_awarded
    from public.draw_round_prize_units
    where draw_round_prize_id = existing.id and status = 'awarded';
    if v_awarded > 0 then
      raise exception 'prize_has_awarded_units';
    end if;
    perform public._release_live_prize_units(
      p_draw_round_id, existing.id, p_admin_id, null
    );
    update public.draw_round_prizes
    set planned_quantity = 0,
        metadata = coalesce(metadata, '{}'::jsonb) || '{"adminHidden": true}'::jsonb
    where id = existing.id;
  end loop;

  -- 4. Reconcile each desired prize.
  for desired in select * from _desired_prizes order by ord loop
    select * into existing
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id and tier = desired.tier and rank = desired.rank
    for update;

    v_awarded := 0;
    if found then
      select count(*)::integer into v_awarded
      from public.draw_round_prize_units
      where draw_round_prize_id = existing.id and status = 'awarded';

      if v_awarded > 0 then
        if not desired.hidden and desired.planned_quantity < v_awarded then
          raise exception 'cannot_reduce_below_awarded';
        end if;
        v_identity_changed :=
          desired.card_id <> existing.card_id
          or coalesce(desired.metadata ->> 'stockUnitGroupKey', '')
             <> coalesce(existing.metadata ->> 'stockUnitGroupKey', '')
          or coalesce(desired.metadata -> 'stockUnitFilter', '{}'::jsonb)
             <> coalesce(existing.metadata -> 'stockUnitFilter', '{}'::jsonb);
        if v_identity_changed then
          raise exception 'prize_identity_locked_after_award';
        end if;
      end if;
    end if;

    insert into public.draw_round_prizes(
      draw_round_id, card_id, tier, rank, value_thb, convert_coin_value, fulfillment_policy,
      weight, unlock_at_sold_pct, planned_quantity, is_test, seed_run_id, metadata
    )
    values (
      p_draw_round_id, desired.card_id, desired.tier, desired.rank,
      desired.value_thb, desired.convert_coin_value, desired.fulfillment_policy, desired.weight,
      desired.unlock_at_sold_pct, desired.planned_quantity, desired.is_test,
      desired.seed_run_id, desired.metadata
    )
    on conflict (draw_round_id, tier, rank) do update
      set card_id = excluded.card_id,
          value_thb = excluded.value_thb,
          convert_coin_value = excluded.convert_coin_value,
          fulfillment_policy = excluded.fulfillment_policy,
          weight = excluded.weight,
          unlock_at_sold_pct = excluded.unlock_at_sold_pct,
          planned_quantity = excluded.planned_quantity,
          is_test = excluded.is_test,
          seed_run_id = excluded.seed_run_id,
          metadata = excluded.metadata
    returning id into v_prize_id;

    if desired.hidden then
      v_delta := v_awarded;
    else
      v_delta := desired.planned_quantity;
    end if;
    v_planned_total := v_planned_total + v_delta;

    select count(*)::integer into v_nonvoid
    from public.draw_round_prize_units
    where draw_round_prize_id = v_prize_id and status <> 'void';

    v_delta := v_delta - v_nonvoid;

    if v_delta > 0 then
      v_got := public._materialize_live_prize_units(
        p_draw_round_id, v_prize_id, desired.card_id, v_delta, p_admin_id,
        desired.seed_run_id, desired.metadata
      );
      if v_got < v_delta then
        raise exception 'insufficient_card_stock';
      end if;
    elsif v_delta < 0 then
      v_removed := public._release_live_prize_units(
        p_draw_round_id, v_prize_id, p_admin_id, (-v_delta)
      );
    end if;
  end loop;

  if v_planned_total <= 0 then
    raise exception 'launch_prize_pool_required';
  end if;

  -- 5. Slot floor: never shrink below already-consumed slots or total awards.
  select count(*)::integer into v_consumed_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status not in ('available', 'void');

  select count(*)::integer into v_total_awarded
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id and status = 'awarded';

  if v_planned_total < greatest(v_consumed_slots, v_total_awarded) then
    raise exception 'cannot_reduce_slots_below_consumed';
  end if;

  -- 6. Sync total_slots + draw_slots to the new planned total.
  update public.draw_rounds
  set total_slots = v_planned_total
  where id = p_draw_round_id;

  perform public.create_draw_slots(p_draw_round_id);

  delete from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available'
    and slot_number > v_planned_total;

  -- 7. Re-assert the publish invariants; any mismatch rolls the tx back.
  select
    count(*) filter (where status <> 'void')::integer,
    count(*) filter (where status = 'available')::integer
  into v_materialized_total, v_available_units
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  if v_materialized_total <> v_planned_total then
    raise exception 'materialized_stock_must_match_planned_quantity';
  end if;

  select count(*)::integer into v_mismatch
  from public.draw_round_prizes prizes
  left join lateral (
    select count(*)::integer as unit_count
    from public.draw_round_prize_units units
    where units.draw_round_prize_id = prizes.id and units.status <> 'void'
  ) c on true
  where prizes.draw_round_id = p_draw_round_id
    and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    and coalesce(c.unit_count, 0) <> prizes.planned_quantity;

  if v_mismatch > 0 then
    raise exception 'prize_units_must_match_planned_quantity';
  end if;

  select count(*)::integer into v_slot_rows
  from public.draw_slots
  where draw_round_id = p_draw_round_id and status <> 'void';

  if v_slot_rows <> v_planned_total then
    raise exception 'slots_must_match_planned_quantity';
  end if;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id,
    'live_campaign_inventory_edited',
    jsonb_build_object(
      'drawRoundId', p_draw_round_id,
      'plannedTotal', v_planned_total,
      'awardedUnits', v_total_awarded,
      'availableUnits', v_available_units
    )
  );

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'status', 'live',
    'totalSlots', v_planned_total,
    'awardedUnits', v_total_awarded,
    'availableUnits', v_available_units
  );
end;
$$;


revoke all on function public.prepare_shipping_request_quote(uuid, uuid, text, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.start_shipping_request_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_shipping_request_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.start_reward_conversion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_reward_conversion_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.edit_live_campaign_inventory(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.prepare_shipping_request_quote(uuid, uuid, text, uuid[], text, text) to service_role;
grant execute on function public.start_shipping_request_job(uuid, uuid, text) to service_role;
grant execute on function public.process_shipping_request_chunk(uuid, integer, text) to service_role;
grant execute on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) to service_role;
grant execute on function public.start_reward_conversion(uuid, uuid, text) to service_role;
grant execute on function public.process_reward_conversion_chunk(uuid, integer, text) to service_role;
grant execute on function public.edit_live_campaign_inventory(uuid, uuid, jsonb) to service_role;
