-- Service-owned reward-to-coin conversion pipeline.
--
-- Quotes are non-committing. Rewards are locked only after the user confirms a
-- quote, then service-role workers progressively credit wallet chunks and mark
-- collection_items exchanged.

create table if not exists public.reward_conversion_quote_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  selection_mode text not null check (selection_mode in ('selected', 'all_eligible')),
  collection_item_ids uuid[] not null default '{}'::uuid[],
  item_count integer not null check (item_count > 0),
  total_coins integer not null check (total_coins > 0),
  quote_hash text not null,
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

create table if not exists public.reward_conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  quote_token_id uuid not null unique references public.reward_conversion_quote_tokens(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry_required', 'completed')),
  selection_mode text not null check (selection_mode in ('selected', 'all_eligible')),
  item_count integer not null check (item_count > 0),
  converted_count integer not null default 0 check (converted_count >= 0),
  total_coins integer not null check (total_coins > 0),
  credited_total_coins integer not null default 0 check (credited_total_coins >= 0),
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
  check (converted_count <= item_count),
  check (credited_total_coins <= total_coins)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reward_conversion_quote_tokens_job_fk'
      and conrelid = 'public.reward_conversion_quote_tokens'::regclass
  ) then
    alter table public.reward_conversion_quote_tokens
      add constraint reward_conversion_quote_tokens_job_fk
      foreign key (consumed_by_job_id)
      references public.reward_conversion_jobs(id)
      on delete set null;
  end if;
end $$;

alter table public.collection_items
  add column if not exists conversion_job_id uuid references public.reward_conversion_jobs(id) on delete set null;

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
    check (status in ('owned', 'locked', 'exchange_requested', 'exchanged', 'shipping_requested', 'shipped', 'void', 'converting'));
end $$;

create unique index if not exists reward_conversion_jobs_active_profile_idx
  on public.reward_conversion_jobs(profile_id)
  where status in ('queued', 'processing', 'retry_required');

create unique index if not exists reward_conversion_jobs_profile_idempotency_unique_idx
  on public.reward_conversion_jobs(profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists reward_conversion_jobs_retry_idx
  on public.reward_conversion_jobs(retry_scheduled_at, created_at)
  where status = 'retry_required';

create index if not exists reward_conversion_jobs_heartbeat_idx
  on public.reward_conversion_jobs(heartbeat_at, updated_at)
  where status = 'processing';

create index if not exists reward_conversion_quote_tokens_expiry_idx
  on public.reward_conversion_quote_tokens(expires_at)
  where consumed_at is null;

create index if not exists collection_items_conversion_job_idx
  on public.collection_items(conversion_job_id, acquired_at, id)
  where status = 'converting';

alter table public.reward_conversion_quote_tokens enable row level security;
alter table public.reward_conversion_jobs enable row level security;

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

  if p_selection_mode = 'selected' then
    select count(distinct item_id) into requested_count
    from unnest(p_collection_item_ids) as item_id;
    if requested_count <> cardinality(p_collection_item_ids) then
      raise exception 'duplicate_collection_items';
    end if;
  end if;

  select
    coalesce(array_agg(id order by id), '{}'::uuid[]),
    count(*)::int,
    coalesce(sum(convert_coin_value_snapshot), 0)::int,
    md5(coalesce(string_agg(id::text || ':' || convert_coin_value_snapshot::text, ',' order by id), 'empty'))
  into selected_ids, quoted_count, quoted_total, quoted_hash
  from public.collection_items
  where profile_id = p_profile_id
    and status = 'owned'
    and convert_coin_value_snapshot is not null
    and convert_coin_value_snapshot > 0
    and (convert_expires_at is null or convert_expires_at > now())
    and (
      p_selection_mode = 'all_eligible'
      or id = any(p_collection_item_ids)
    );

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
    selected_ids,
    quoted_count,
    quoted_total,
    quoted_hash,
    p_idempotency_key,
    now() + interval '15 minutes',
    jsonb_build_object('source', 'prepare_reward_conversion_quote')
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
  job_id uuid;
  locked_count integer;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quote_token_id is null then
    raise exception 'quote_token_required';
  end if;

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

  select
    count(*)::int,
    coalesce(sum(eligible.convert_coin_value_snapshot), 0)::int,
    md5(coalesce(string_agg(eligible.id::text || ':' || eligible.convert_coin_value_snapshot::text, ',' order by eligible.id), 'empty'))
  into current_count, current_total, current_hash
  from public.collection_items eligible
  where eligible.profile_id = quote_row.profile_id
    and eligible.status = 'owned'
    and eligible.convert_coin_value_snapshot is not null
    and eligible.convert_coin_value_snapshot > 0
    and (eligible.convert_expires_at is null or eligible.convert_expires_at > now())
    and (
      quote_row.selection_mode = 'all_eligible'
      or eligible.id = any(quote_row.collection_item_ids)
    );

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
    jsonb_build_object('source', 'start_reward_conversion')
  )
  returning id into job_id;

  update public.collection_items
  set status = 'converting',
      conversion_job_id = job_id
  where id = any(quote_row.collection_item_ids)
    and profile_id = quote_row.profile_id
    and status = 'owned'
    and convert_coin_value_snapshot is not null
    and convert_coin_value_snapshot > 0
    and (convert_expires_at is null or convert_expires_at > now());

  get diagnostics locked_count = row_count;
  if locked_count <> quote_row.item_count then
    raise exception 'reward_conversion_quote_changed';
  end if;

  update public.reward_conversion_quote_tokens
  set consumed_at = now(),
      consumed_by_job_id = job_id
  where id = quote_row.id;

  return jsonb_build_object(
    'status', 'queued',
    'jobId', job_id,
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
  locked_wallet public.wallet_accounts%rowtype;
  chunk_item_ids uuid[];
  chunk_count integer;
  chunk_total integer;
  remaining_count integer;
  ledger_id uuid;
  chunk_idempotency_key text;
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
  if job_row.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'jobId', job_row.id,
      'processedCount', 0,
      'convertedCount', job_row.converted_count,
      'creditedTotalCoins', job_row.credited_total_coins,
      'totalCoins', job_row.total_coins,
      'completed', true,
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

  select
    coalesce(array_agg(chunk.id order by chunk.acquired_at, chunk.id), '{}'::uuid[]),
    count(*)::int,
    coalesce(sum(chunk.convert_coin_value_snapshot), 0)::int
  into chunk_item_ids, chunk_count, chunk_total
  from (
    select ci.id, ci.acquired_at, ci.convert_coin_value_snapshot
    from public.collection_items ci
    where ci.conversion_job_id = job_row.id
      and ci.profile_id = job_row.profile_id
      and ci.status = 'converting'
    order by ci.acquired_at, ci.id
    limit p_limit
    for update skip locked
  ) chunk;

  if chunk_count = 0 then
    select count(*)::int into remaining_count
    from public.collection_items ci
    where ci.conversion_job_id = job_row.id
      and ci.profile_id = job_row.profile_id
      and ci.status = 'converting';

    if remaining_count = 0 then
      update public.reward_conversion_jobs
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          locked_by = null,
          heartbeat_at = null,
          updated_at = now()
      where id = job_row.id
      returning * into job_row;
    end if;

    return jsonb_build_object(
      'status', job_row.status,
      'jobId', job_row.id,
      'processedCount', 0,
      'convertedCount', job_row.converted_count,
      'creditedTotalCoins', job_row.credited_total_coins,
      'totalCoins', job_row.total_coins,
      'completed', job_row.status = 'completed',
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
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + chunk_total,
      version = version + 1
  where profile_id = job_row.profile_id;

  update public.collection_items
  set status = 'exchanged'
  where id = any(chunk_item_ids)
    and profile_id = job_row.profile_id
    and conversion_job_id = job_row.id
    and status = 'converting';

  update public.reward_conversion_jobs
  set converted_count = converted_count + chunk_count,
      credited_total_coins = credited_total_coins + chunk_total,
      status = case
        when converted_count + chunk_count >= item_count then 'completed'
        else 'processing'
      end,
      completed_at = case
        when converted_count + chunk_count >= item_count then now()
        else completed_at
      end,
      locked_by = case
        when converted_count + chunk_count >= item_count then null
        else p_worker_id
      end,
      heartbeat_at = case
        when converted_count + chunk_count >= item_count then null
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
      'ledgerId', ledger_id
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
    'shouldContinue', job_row.status <> 'completed'
  );
exception
  when others then
    update public.reward_conversion_jobs
    set status = 'retry_required',
        retry_count = retry_count + 1,
        retry_scheduled_at = now() + interval '30 seconds',
        last_error_code = left(sqlstate || ':' || sqlerrm, 200),
        last_error_at = now(),
        locked_by = null,
        heartbeat_at = null,
        updated_at = now()
    where id = p_job_id
      and status <> 'completed'
    returning * into job_row;

    return jsonb_build_object(
      'status', coalesce(job_row.status, 'retry_required'),
      'jobId', p_job_id,
      'processedCount', 0,
      'convertedCount', coalesce(job_row.converted_count, 0),
      'creditedTotalCoins', coalesce(job_row.credited_total_coins, 0),
      'totalCoins', coalesce(job_row.total_coins, 0),
      'completed', false,
      'shouldContinue', false,
      'retryRequired', true
    );
end;
$$;

create or replace function public.list_reward_conversion_recovery_jobs(
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
      'convertedCount', recovery.converted_count,
      'totalCoins', recovery.total_coins,
      'creditedTotalCoins', recovery.credited_total_coins,
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
    from public.reward_conversion_jobs
    where status = 'queued'
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
        when 'queued' then 0
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

revoke all on public.reward_conversion_quote_tokens, public.reward_conversion_jobs from public, anon, authenticated;
grant all on public.reward_conversion_quote_tokens, public.reward_conversion_jobs to service_role;

revoke all on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.start_reward_conversion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_reward_conversion_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.list_reward_conversion_recovery_jobs(integer) from public, anon, authenticated;

grant execute on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) to service_role;
grant execute on function public.start_reward_conversion(uuid, uuid, text) to service_role;
grant execute on function public.process_reward_conversion_chunk(uuid, integer, text) to service_role;
grant execute on function public.list_reward_conversion_recovery_jobs(integer) to service_role;
