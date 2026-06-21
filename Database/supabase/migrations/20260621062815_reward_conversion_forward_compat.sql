-- Forward-only production migration for the reward conversion background worker.
-- The original 20260619130000 migration was already applied before these
-- compatibility changes were added, so keep this file idempotent for linked DBs
-- while preserving fresh-database replay after the shipping job migration.

alter table public.reward_conversion_jobs
  drop constraint if exists reward_conversion_jobs_status_check;

alter table public.reward_conversion_jobs
  add constraint reward_conversion_jobs_status_check
  check (status in ('queued', 'processing', 'retry_required', 'completed', 'failed'));

create table if not exists public.reward_conversion_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.reward_conversion_jobs(id) on delete restrict,
  collection_item_id uuid not null references public.collection_items(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  coin_value integer not null check (coin_value > 0),
  status text not null default 'pending' check (status in ('pending', 'converted')),
  ledger_id uuid references public.coin_ledger(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the conversion status compatible with the newer shipping background job
-- migration, which also owns shipping_preparing.
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
    check (status in (
      'owned',
      'locked',
      'exchange_requested',
      'exchanged',
      'shipping_preparing',
      'shipping_requested',
      'shipped',
      'void',
      'converting'
    ));
end $$;

create unique index if not exists reward_conversion_job_items_job_item_unique_idx
  on public.reward_conversion_job_items(job_id, collection_item_id);

create index if not exists reward_conversion_job_items_pending_idx
  on public.reward_conversion_job_items(job_id, created_at, id)
  where status = 'pending';

create index if not exists collection_items_conversion_eligible_idx
  on public.collection_items(profile_id, acquired_at, id)
  where status = 'owned'
    and convert_coin_value_snapshot is not null
    and convert_coin_value_snapshot > 0;

alter table public.reward_conversion_job_items enable row level security;

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
      md5(coalesce(string_agg(id::text || ':' || convert_coin_value_snapshot::text, ',' order by id), 'empty'))
    into selected_ids, quoted_count, quoted_total, quoted_hash
    from public.collection_items
    where profile_id = p_profile_id
      and status = 'owned'
      and convert_coin_value_snapshot is not null
      and convert_coin_value_snapshot > 0
      and (convert_expires_at is null or convert_expires_at > now())
      and id = any(p_collection_item_ids);
  else
    selected_ids := '{}'::uuid[];
    select
      count(*)::int,
      coalesce(sum(convert_coin_value_snapshot), 0)::int,
      min(id),
      max(id),
      min(acquired_at),
      max(acquired_at)
    into quoted_count, quoted_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items
    where profile_id = p_profile_id
      and status = 'owned'
      and convert_coin_value_snapshot is not null
      and convert_coin_value_snapshot > 0
      and (convert_expires_at is null or convert_expires_at > now())
      and acquired_at <= selection_fence_at;

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
      md5(coalesce(string_agg(eligible.id::text || ':' || eligible.convert_coin_value_snapshot::text, ',' order by eligible.id), 'empty'))
    into current_count, current_total, current_hash
    from public.collection_items eligible
    where eligible.profile_id = quote_row.profile_id
      and eligible.status = 'owned'
      and eligible.convert_coin_value_snapshot is not null
      and eligible.convert_coin_value_snapshot > 0
      and (eligible.convert_expires_at is null or eligible.convert_expires_at > now())
      and eligible.id = any(quote_row.collection_item_ids);
  else
    select
      count(*)::int,
      coalesce(sum(eligible.convert_coin_value_snapshot), 0)::int,
      min(eligible.id),
      max(eligible.id),
      min(eligible.acquired_at),
      max(eligible.acquired_at)
    into current_count, current_total, min_id, max_id, min_acquired_at, max_acquired_at
    from public.collection_items eligible
    where eligible.profile_id = quote_row.profile_id
      and eligible.status = 'owned'
      and eligible.convert_coin_value_snapshot is not null
      and eligible.convert_coin_value_snapshot > 0
      and (eligible.convert_expires_at is null or eligible.convert_expires_at > now())
      and eligible.acquired_at <= selection_fence_at;

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
    and status = 'owned';

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

revoke all on public.reward_conversion_quote_tokens, public.reward_conversion_jobs, public.reward_conversion_job_items from public, anon, authenticated;
grant all on public.reward_conversion_quote_tokens, public.reward_conversion_jobs, public.reward_conversion_job_items to service_role;

revoke all on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.start_reward_conversion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_reward_conversion_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.list_reward_conversion_recovery_jobs(integer) from public, anon, authenticated;

grant execute on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) to service_role;
grant execute on function public.start_reward_conversion(uuid, uuid, text) to service_role;
grant execute on function public.process_reward_conversion_chunk(uuid, integer, text) to service_role;
grant execute on function public.list_reward_conversion_recovery_jobs(integer) to service_role;
