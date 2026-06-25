-- Fix all-eligible reward conversion quotes on Postgres builds without min(uuid).
-- The UUID bounds are only used for a deterministic quote hash, so text bounds
-- preserve the stale-quote guard without relying on UUID aggregates.

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
      min(id::text),
      max(id::text),
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
      min(eligible.id::text),
      max(eligible.id::text),
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

revoke all on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.start_reward_conversion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_reward_conversion_quote(uuid, text, uuid[], text) to service_role;
grant execute on function public.start_reward_conversion(uuid, uuid, text) to service_role;
