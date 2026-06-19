create sequence if not exists public.gacha_bulk_open_public_code_seq start with 1001;

create table if not exists public.gacha_bulk_open_sessions (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('BO-' || nextval('public.gacha_bulk_open_public_code_seq')::text),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draw_round_id uuid not null references public.draw_rounds(id) on delete restrict,
  start_token_id uuid unique,
  ledger_entry_id uuid,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry_required', 'completed')),
  target_slots integer not null check (target_slots > 0),
  processed_slots integer not null default 0 check (processed_slots >= 0),
  open_items_awarded integer not null default 0 check (open_items_awarded >= 0),
  collection_items_created integer not null default 0 check (collection_items_created >= 0),
  total_cost_coins integer not null check (total_cost_coins > 0),
  cost_per_open_snapshot integer not null check (cost_per_open_snapshot > 0),
  quote_hash text not null,
  pack_open_contract_hash_snapshot text not null,
  idempotency_key text not null,
  next_bulk_open_sequence integer not null default 1 check (next_bulk_open_sequence > 0),
  highlight_rewards_public jsonb not null default '[]'::jsonb check (jsonb_typeof(highlight_rewards_public) = 'array'),
  queue_job_id text,
  locked_by text,
  heartbeat_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  retry_scheduled_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  highlights_seen_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (processed_slots <= target_slots),
  check (open_items_awarded <= processed_slots),
  check (collection_items_created <= processed_slots)
);

create table if not exists public.gacha_bulk_open_start_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draw_round_id uuid not null references public.draw_rounds(id) on delete restrict,
  target_slots integer not null check (target_slots > 0),
  total_cost_coins integer not null check (total_cost_coins > 0),
  quote_hash text not null,
  pack_open_contract_hash text not null,
  idempotency_key text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_session_id uuid references public.gacha_bulk_open_sessions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (consumed_at is null and consumed_by_session_id is null)
    or (consumed_at is not null and consumed_by_session_id is not null)
  )
);

create table if not exists public.gacha_bulk_open_results (
  id uuid primary key default gen_random_uuid(),
  bulk_open_session_id uuid not null references public.gacha_bulk_open_sessions(id) on delete cascade,
  draw_slot_id uuid not null references public.draw_slots(id) on delete restrict,
  bulk_open_sequence integer not null check (bulk_open_sequence > 0),
  status text not null default 'reserved' check (status in ('reserved', 'awarded', 'skipped', 'failed')),
  gacha_open_id uuid references public.gacha_opens(id) on delete set null,
  gacha_open_item_id uuid references public.gacha_open_items(id) on delete set null,
  collection_item_id uuid references public.collection_items(id) on delete set null,
  result_payload jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gacha_bulk_open_sessions_start_token_fk'
      and conrelid = 'public.gacha_bulk_open_sessions'::regclass
  ) then
    alter table public.gacha_bulk_open_sessions
      add constraint gacha_bulk_open_sessions_start_token_fk
      foreign key (start_token_id)
      references public.gacha_bulk_open_start_tokens(id)
      on delete set null;
  end if;
end $$;

alter table public.draw_rounds
  add column if not exists pull_all_enabled boolean not null default false,
  add column if not exists pull_all_requested boolean not null default false,
  add column if not exists pull_all_allowlisted boolean not null default false,
  add column if not exists pull_all_readiness_status text not null default 'disabled'
    check (pull_all_readiness_status in ('disabled', 'not_ready', 'ready', 'blocked')),
  add column if not exists pull_all_config jsonb not null default '{}'::jsonb;

do $migration$
declare
  fn text;
  anchor text := $anchor$    logic_snapshot = coalesce(revision.logic_snapshot, campaign.logic_snapshot),$anchor$;
  patch text := $patch$    pull_all_enabled = case
      when revision.scalar_patch ? 'pull_all_enabled'
      then (revision.scalar_patch->>'pull_all_enabled')::boolean
      else campaign.pull_all_enabled
    end,
    pull_all_requested = case
      when revision.scalar_patch ? 'pull_all_requested'
      then (revision.scalar_patch->>'pull_all_requested')::boolean
      else campaign.pull_all_requested
    end,
    pull_all_allowlisted = case
      when revision.scalar_patch ? 'pull_all_allowlisted'
      then (revision.scalar_patch->>'pull_all_allowlisted')::boolean
      else campaign.pull_all_allowlisted
    end,
    pull_all_readiness_status = case
      when revision.scalar_patch ? 'pull_all_readiness_status'
        and revision.scalar_patch->>'pull_all_readiness_status' in ('disabled', 'not_ready', 'ready', 'blocked')
      then revision.scalar_patch->>'pull_all_readiness_status'
      else campaign.pull_all_readiness_status
    end,
    pull_all_config = case
      when revision.scalar_patch ? 'pull_all_config'
        and jsonb_typeof(revision.scalar_patch->'pull_all_config') = 'object'
      then revision.scalar_patch->'pull_all_config'
      else campaign.pull_all_config
    end,
    logic_snapshot = coalesce(revision.logic_snapshot, campaign.logic_snapshot),$patch$;
begin
  select pg_get_functiondef(
    'public.publish_live_campaign_revision(uuid,uuid,text)'::regprocedure
  )
  into fn;

  if fn is null or position(anchor in fn) = 0 then
    raise exception 'publish_live_campaign_revision_pull_all_patch_anchor_missing';
  end if;

  if position('pull_all_enabled = case' in fn) = 0 then
    fn := replace(fn, anchor, patch);
  end if;

  if position('pull_all_enabled = case' in fn) = 0
     or position('pull_all_config = case' in fn) = 0 then
    raise exception 'publish_live_campaign_revision_pull_all_patch_failed';
  end if;

  execute fn;
end;
$migration$;

alter table public.gacha_opens
  add column if not exists bulk_open_session_id uuid references public.gacha_bulk_open_sessions(id) on delete set null;

alter table public.gacha_open_items
  add column if not exists bulk_open_session_id uuid references public.gacha_bulk_open_sessions(id) on delete set null,
  add column if not exists bulk_open_sequence integer check (bulk_open_sequence is null or bulk_open_sequence > 0);

alter table public.collection_items
  add column if not exists bulk_open_session_id uuid references public.gacha_bulk_open_sessions(id) on delete set null,
  add column if not exists bulk_open_sequence integer check (bulk_open_sequence is null or bulk_open_sequence > 0);

alter table public.audit_events
  add column if not exists bulk_open_session_id uuid references public.gacha_bulk_open_sessions(id) on delete set null;

create unique index if not exists gacha_bulk_open_sessions_active_profile_idx
  on public.gacha_bulk_open_sessions(profile_id)
  where status in ('queued', 'processing', 'retry_required');

create index if not exists gacha_bulk_open_sessions_active_round_idx
  on public.gacha_bulk_open_sessions(draw_round_id)
  where status in ('queued', 'processing', 'retry_required');

create unique index if not exists gacha_bulk_open_sessions_profile_idempotency_unique_idx
  on public.gacha_bulk_open_sessions(profile_id, idempotency_key);

create index if not exists gacha_bulk_open_sessions_retry_idx
  on public.gacha_bulk_open_sessions(retry_scheduled_at, created_at)
  where status = 'retry_required';

create index if not exists gacha_bulk_open_sessions_heartbeat_idx
  on public.gacha_bulk_open_sessions(heartbeat_at, updated_at)
  where status = 'processing';

create index if not exists gacha_bulk_open_sessions_unseen_completed_idx
  on public.gacha_bulk_open_sessions(profile_id, completed_at desc, created_at desc)
  where status = 'completed' and highlights_seen_at is null;

create index if not exists gacha_bulk_open_sessions_cursor_idx
  on public.gacha_bulk_open_sessions(status, draw_round_id, next_bulk_open_sequence);

create unique index if not exists gacha_bulk_open_start_tokens_active_idempotency_idx
  on public.gacha_bulk_open_start_tokens(profile_id, draw_round_id, idempotency_key)
  where consumed_at is null;

create index if not exists gacha_bulk_open_start_tokens_expiry_idx
  on public.gacha_bulk_open_start_tokens(expires_at)
  where consumed_at is null;

create unique index if not exists gacha_bulk_open_results_session_slot_unique_idx
  on public.gacha_bulk_open_results(bulk_open_session_id, draw_slot_id);

create unique index if not exists gacha_bulk_open_results_session_sequence_unique_idx
  on public.gacha_bulk_open_results(bulk_open_session_id, bulk_open_sequence);

create index if not exists gacha_bulk_open_results_session_status_idx
  on public.gacha_bulk_open_results(bulk_open_session_id, status, bulk_open_sequence);

create index if not exists gacha_opens_bulk_open_session_idx
  on public.gacha_opens(bulk_open_session_id)
  where bulk_open_session_id is not null;

create index if not exists gacha_open_items_bulk_open_session_sequence_idx
  on public.gacha_open_items(bulk_open_session_id, bulk_open_sequence)
  where bulk_open_session_id is not null;

create index if not exists collection_items_bulk_open_session_sequence_idx
  on public.collection_items(bulk_open_session_id, bulk_open_sequence)
  where bulk_open_session_id is not null;

create index if not exists audit_events_bulk_open_session_idx
  on public.audit_events(bulk_open_session_id)
  where bulk_open_session_id is not null;

do $migration$
declare
  fn text;
  anchor text := $anchor$  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

$anchor$;
  guard text := $guard$  if exists (
    select 1
    from public.gacha_bulk_open_sessions bulk_session
    where bulk_session.status in ('queued', 'processing', 'retry_required')
      and (
        bulk_session.profile_id = p_profile_id
        or bulk_session.draw_round_id = p_draw_round_id
      )
  ) then
    raise exception 'active_bulk_open_session_exists';
  end if;

$guard$;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null or position(anchor in fn) = 0 then
    raise exception 'open_gacha_campaign_active_bulk_guard_anchor_missing';
  end if;

  if position('bulk_session.profile_id = p_profile_id' in fn) = 0 then
    fn := replace(fn, anchor, anchor || guard);
  end if;

  if position('bulk_session.profile_id = p_profile_id' in fn) = 0
     or position('bulk_session.draw_round_id = p_draw_round_id' in fn) = 0
     or position('active_bulk_open_session_exists' in fn) = 0 then
    raise exception 'open_gacha_campaign_active_bulk_guard_patch_failed';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
  anchor text := $anchor$  if campaign.status <> 'live' then
    raise exception 'campaign_not_live_editable';
  end if;

$anchor$;
  guard text := $guard$  if exists (
    select 1
    from public.gacha_bulk_open_sessions bulk_session
    where bulk_session.draw_round_id = revision.draw_round_id
      and bulk_session.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'active_bulk_open_session_exists';
  end if;

$guard$;
begin
  select pg_get_functiondef(
    'public.publish_live_campaign_revision(uuid,uuid,text)'::regprocedure
  )
  into fn;

  if fn is null or position(anchor in fn) = 0 then
    raise exception 'publish_live_campaign_revision_active_bulk_guard_anchor_missing';
  end if;

  if position('bulk_session.draw_round_id = revision.draw_round_id' in fn) = 0 then
    fn := replace(fn, anchor, anchor || guard);
  end if;

  if position('bulk_session.draw_round_id = revision.draw_round_id' in fn) = 0
     or position('active_bulk_open_session_exists' in fn) = 0 then
    raise exception 'publish_live_campaign_revision_active_bulk_guard_patch_failed';
  end if;

  execute fn;
end;
$migration$;

alter table public.gacha_bulk_open_sessions enable row level security;
alter table public.gacha_bulk_open_start_tokens enable row level security;
alter table public.gacha_bulk_open_results enable row level security;

revoke all on public.gacha_bulk_open_sessions, public.gacha_bulk_open_start_tokens, public.gacha_bulk_open_results from public, anon, authenticated;
grant all on public.gacha_bulk_open_sessions, public.gacha_bulk_open_start_tokens, public.gacha_bulk_open_results to service_role;
grant usage, select on sequence public.gacha_bulk_open_public_code_seq to service_role;

create or replace function public.has_active_bulk_open_session(
  p_profile_id uuid,
  p_draw_round_id uuid
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.gacha_bulk_open_sessions session
    where (
        session.profile_id = p_profile_id
        or session.draw_round_id = p_draw_round_id
      )
      and session.status in ('queued', 'processing', 'retry_required')
  );
$$;

create or replace function public.create_bulk_open_start_token(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_target_slots integer,
  p_total_cost_coins integer,
  p_quote_hash text,
  p_pack_open_contract_hash text,
  p_idempotency_key text,
  p_expires_at timestamptz default now() + interval '5 minutes'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  token_row public.gacha_bulk_open_start_tokens%rowtype;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_draw_round_id is null then
    raise exception 'draw_round_required';
  end if;
  if p_target_slots is null or p_target_slots < 1 then
    raise exception 'invalid_target_slots';
  end if;
  if p_total_cost_coins is null or p_total_cost_coins < 1 then
    raise exception 'invalid_total_cost';
  end if;
  if p_quote_hash is null or length(trim(p_quote_hash)) < 12 then
    raise exception 'invalid_quote_hash';
  end if;
  if p_pack_open_contract_hash is null or length(trim(p_pack_open_contract_hash)) < 12 then
    raise exception 'invalid_contract_hash';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_expiry';
  end if;

  insert into public.gacha_bulk_open_start_tokens(
    profile_id,
    draw_round_id,
    target_slots,
    total_cost_coins,
    quote_hash,
    pack_open_contract_hash,
    idempotency_key,
    expires_at
  ) values (
    p_profile_id,
    p_draw_round_id,
    p_target_slots,
    p_total_cost_coins,
    trim(p_quote_hash),
    trim(p_pack_open_contract_hash),
    trim(p_idempotency_key),
    p_expires_at
  )
  returning * into token_row;

  return jsonb_build_object(
    'tokenId', token_row.id,
    'drawRoundId', token_row.draw_round_id,
    'targetSlots', token_row.target_slots,
    'totalCostCoins', token_row.total_cost_coins,
    'expiresAt', token_row.expires_at
  );
end;
$$;

create or replace function public.bulk_open_settlement_enabled()
returns boolean
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select true;
$$;

create or replace function public.prepare_bulk_open_quote(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_expires_at timestamptz default now() + interval '2 minutes'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  total_slots integer;
  available_slots integer;
  sold_slots integer;
  sold_pct numeric;
  cost_per_reward integer;
  total_cost_coins integer;
  quote_hash text;
  pack_open_contract_hash text;
  quote_token jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_draw_round_id is null then
    raise exception 'draw_round_required';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_expiry';
  end if;
  if not public.bulk_open_settlement_enabled() then
    raise exception 'bulk_open_settlement_not_ready';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
    and approval_status = 'approved'
    and coalesce(pull_all_enabled, false) = true
    and coalesce(pull_all_requested, false) = true
    and coalesce(pull_all_allowlisted, false) = true
    and pull_all_readiness_status = 'ready'
  for update;

  if campaign.id is null then
    raise exception 'bulk_open_not_available';
  end if;

  if public.has_active_bulk_open_session(p_profile_id, p_draw_round_id) then
    raise exception 'active_bulk_open_session_exists';
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'available')::integer
  into total_slots, available_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id;

  sold_slots := greatest(total_slots - available_slots, 0);
  sold_pct := case
    when total_slots > 0 then round((sold_slots::numeric / total_slots::numeric) * 100, 2)
    else 0
  end;

  if available_slots < 1 then
    raise exception 'not_enough_available_slots';
  end if;
  if sold_pct < 60 then
    raise exception 'bulk_open_sold_threshold_not_met';
  end if;

  cost_per_reward := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer));
  if cost_per_reward < 1 then
    raise exception 'invalid_campaign_cost';
  end if;

  total_cost_coins := cost_per_reward * available_slots;
  quote_hash := md5(concat_ws(
    ':',
    p_profile_id::text,
    p_draw_round_id::text,
    available_slots::text,
    total_cost_coins::text,
    sold_pct::text,
    extract(epoch from p_expires_at)::text
  ));
  pack_open_contract_hash := md5(concat_ws(
    ':',
    p_draw_round_id::text,
    cost_per_reward::text,
    coalesce(campaign.pull_all_config::text, '{}')
  ));

  quote_token := public.create_bulk_open_start_token(
    p_profile_id,
    p_draw_round_id,
    available_slots,
    total_cost_coins,
    quote_hash,
    pack_open_contract_hash,
    concat('bulk-open-quote-', gen_random_uuid()::text),
    p_expires_at
  );

  return jsonb_build_object(
    'tokenId', quote_token ->> 'tokenId',
    'drawRoundId', p_draw_round_id,
    'targetRewards', available_slots,
    'targetSlots', available_slots,
    'totalCostCoins', total_cost_coins,
    'costPerReward', cost_per_reward,
    'expiresAt', p_expires_at,
    'soldPct', sold_pct
  );
end;
$$;

create or replace function public.mark_bulk_open_highlights_seen(
  p_profile_id uuid,
  p_public_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  session_row public.gacha_bulk_open_sessions%rowtype;
  updated_session_id uuid;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_public_code is null or length(trim(p_public_code)) < 1 then
    raise exception 'public_code_required';
  end if;

  select * into session_row
  from public.gacha_bulk_open_sessions
  where profile_id = p_profile_id
    and public_code = trim(p_public_code)
    and status = 'completed'
    and jsonb_typeof(highlight_rewards_public) = 'array'
    and jsonb_array_length(highlight_rewards_public) > 0
  limit 1
  for update;

  if session_row.id is null then
    return jsonb_build_object('ok', false, 'updated', false, 'alreadySeen', false);
  end if;

  if session_row.highlights_seen_at is not null then
    return jsonb_build_object('ok', true, 'updated', false, 'alreadySeen', true);
  end if;

  update public.gacha_bulk_open_sessions
  set highlights_seen_at = now(),
      updated_at = now()
  where id = session_row.id
    and highlights_seen_at is null
  returning id into updated_session_id;

  return jsonb_build_object(
    'ok', updated_session_id is not null,
    'updated', updated_session_id is not null,
    'alreadySeen', false
  );
end;
$$;

create or replace function public.start_bulk_open_session(
  p_start_token_id uuid,
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_target_slots integer,
  p_total_cost_coins integer,
  p_quote_hash text,
  p_pack_open_contract_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  token_row public.gacha_bulk_open_start_tokens%rowtype;
  campaign public.draw_rounds%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  session_row public.gacha_bulk_open_sessions%rowtype;
  existing_session public.gacha_bulk_open_sessions%rowtype;
  available_target integer;
  total_slots integer;
  sold_slots integer;
  sold_pct numeric;
  cost_per_open integer;
  ledger_id uuid;
begin
  if p_start_token_id is null then
    raise exception 'start_token_required';
  end if;

  select * into token_row
  from public.gacha_bulk_open_start_tokens
  where id = p_start_token_id
  for update;

  if token_row.id is null then
    raise exception 'start_token_not_found';
  end if;

  if token_row.consumed_by_session_id is not null then
    select * into existing_session
    from public.gacha_bulk_open_sessions
    where id = token_row.consumed_by_session_id;

    if existing_session.id is not null then
      return jsonb_build_object(
        'status', existing_session.status,
        'sessionId', existing_session.id,
        'publicCode', existing_session.public_code,
        'targetSlots', existing_session.target_slots,
        'processedSlots', existing_session.processed_slots,
        'openItemsAwarded', existing_session.open_items_awarded,
        'collectionItemsCreated', existing_session.collection_items_created,
        'totalCostCoins', existing_session.total_cost_coins,
        'highlightRewardsPublic', existing_session.highlight_rewards_public,
        'replayed', true
      );
    end if;
  end if;

  if token_row.consumed_at is not null then
    raise exception 'start_token_consumed';
  end if;
  if token_row.expires_at <= now() then
    raise exception 'start_token_expired';
  end if;
  if token_row.profile_id <> p_profile_id
    or token_row.draw_round_id <> p_draw_round_id
    or token_row.target_slots <> p_target_slots
    or token_row.total_cost_coins <> p_total_cost_coins
    or token_row.quote_hash <> trim(p_quote_hash)
    or token_row.pack_open_contract_hash <> trim(p_pack_open_contract_hash) then
    raise exception 'start_token_mismatch';
  end if;
  if not public.bulk_open_settlement_enabled() then
    raise exception 'bulk_open_settlement_not_ready';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
    and approval_status = 'approved'
    and coalesce(pull_all_enabled, false) = true
    and coalesce(pull_all_requested, false) = true
    and coalesce(pull_all_allowlisted, false) = true
    and pull_all_readiness_status = 'ready'
  for update;

  if campaign.id is null then
    raise exception 'bulk_open_not_available';
  end if;

  if public.has_active_bulk_open_session(p_profile_id, p_draw_round_id) then
    raise exception 'active_bulk_open_session_exists';
  end if;

  select count(*)::integer into available_target
  from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available';

  select count(*)::integer into total_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id;

  sold_slots := greatest(total_slots - available_target, 0);
  sold_pct := case
    when total_slots > 0 then (sold_slots::numeric / total_slots::numeric) * 100
    else 0
  end;

  if available_target < 1 then
    raise exception 'not_enough_available_slots';
  end if;
  if sold_pct < 60 then
    raise exception 'bulk_open_sold_threshold_not_met';
  end if;
  if available_target <> p_target_slots then
    raise exception 'bulk_open_quote_stale';
  end if;

  cost_per_open := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer));
  if cost_per_open < 1 then
    raise exception 'invalid_campaign_cost';
  end if;
  if p_total_cost_coins <> cost_per_open * available_target then
    raise exception 'bulk_open_quote_stale';
  end if;

  insert into public.wallet_accounts(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = p_profile_id
  for update;

  if locked_wallet.balance_coins < p_total_cost_coins then
    raise exception 'insufficient_balance';
  end if;

  insert into public.gacha_bulk_open_sessions(
    profile_id,
    draw_round_id,
    start_token_id,
    target_slots,
    total_cost_coins,
    cost_per_open_snapshot,
    quote_hash,
    pack_open_contract_hash_snapshot,
    idempotency_key,
    started_at,
    heartbeat_at,
    metadata
  ) values (
    p_profile_id,
    p_draw_round_id,
    token_row.id,
    available_target,
    p_total_cost_coins,
    cost_per_open,
    token_row.quote_hash,
    token_row.pack_open_contract_hash,
    token_row.idempotency_key,
    now(),
    now(),
    jsonb_build_object('campaignSlug', campaign.slug, 'source', 'bulk_open_start')
  )
  returning * into session_row;

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
    p_profile_id,
    p_profile_id,
    'gacha_spend',
    -p_total_cost_coins,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins - p_total_cost_coins,
    'bulk_open_session',
    session_row.id,
    token_row.idempotency_key,
    jsonb_build_object(
      'drawRoundId', p_draw_round_id,
      'targetSlots', available_target,
      'publicCode', session_row.public_code
    )
  )
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = locked_wallet.balance_coins - p_total_cost_coins,
      version = version + 1
  where profile_id = p_profile_id;

  update public.gacha_bulk_open_sessions
  set ledger_entry_id = ledger_id,
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  update public.gacha_bulk_open_start_tokens
  set consumed_at = now(),
      consumed_by_session_id = session_row.id
  where id = token_row.id;

  update public.draw_rounds
  set status = 'closed',
      updated_at = now()
  where id = p_draw_round_id
    and status = 'live';

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, bulk_open_session_id, metadata)
  values (
    p_profile_id,
    'bulk_open_started',
    p_draw_round_id,
    session_row.id,
    jsonb_build_object(
      'targetSlots', session_row.target_slots,
      'totalCostCoins', session_row.total_cost_coins,
      'publicCode', session_row.public_code
    )
  );

  return jsonb_build_object(
    'status', session_row.status,
    'sessionId', session_row.id,
    'publicCode', session_row.public_code,
    'targetSlots', session_row.target_slots,
    'processedSlots', session_row.processed_slots,
    'openItemsAwarded', session_row.open_items_awarded,
    'collectionItemsCreated', session_row.collection_items_created,
    'totalCostCoins', session_row.total_cost_coins,
    'highlightRewardsPublic', session_row.highlight_rewards_public,
    'ledgerId', ledger_id,
    'replayed', false
  );
end;
$$;

create or replace function public.process_bulk_open_chunk(
  p_bulk_open_session_id uuid,
  p_limit integer default 1000,
  p_worker_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  session_row public.gacha_bulk_open_sessions%rowtype;
  campaign public.draw_rounds%rowtype;
  open_row public.gacha_opens%rowtype;
  chunk_limit integer;
  chunk_target integer;
  inserted_count integer := 0;
  slot_update_count integer := 0;
  open_item_count integer := 0;
  collection_item_count integer := 0;
  position_index integer;
  bulk_sequence integer;
  slot_id uuid;
  open_item_id uuid;
  first_collection_item_id uuid;
  new_collection_item_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_stock_unit_id uuid;
  unit_card_name text;
  unit_card_image_url text;
  unit_display_tier text;
  unit_tier text;
  unit_value_thb integer;
  unit_convert_coin_value integer;
  unit_weight numeric;
  unit_unlock_at_sold_pct numeric;
  effective_unit_weight numeric;
  effective_unit_unlock_at_sold_pct numeric;
  selected_bundle_quantity integer;
  claimed_unit record;
  claimed_unit_ids uuid[];
  bundle_index integer;
  sold_pct numeric := 0;
  logic_mode text := 'pure_random';
  result_payload jsonb;
  highlight_items jsonb := '[]'::jsonb;
  completed_now boolean := false;
  available_slot_count integer;
  lp_stock_unit_id uuid;
  lp_unit_image_url text;
  lp_card_name text;
  lp_card_image_url text;
  lp_open_item_id uuid;
  lp_collection_item_id uuid;
begin
  if p_bulk_open_session_id is null then
    raise exception 'bulk_open_session_required';
  end if;

  chunk_limit := least(greatest(coalesce(p_limit, 1000), 1), 1000);

  select * into session_row
  from public.gacha_bulk_open_sessions
  where id = p_bulk_open_session_id
  for update;

  if session_row.id is null then
    raise exception 'bulk_open_session_not_found';
  end if;
  if session_row.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', true,
      'shouldContinue', false
    );
  end if;
  if session_row.processed_slots >= session_row.target_slots then
    update public.gacha_bulk_open_sessions
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        locked_by = null,
        heartbeat_at = now(),
        updated_at = now()
    where id = session_row.id
    returning * into session_row;

    return jsonb_build_object(
      'status', session_row.status,
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', true,
      'shouldContinue', false
    );
  end if;

  select * into campaign
  from public.draw_rounds
  where id = session_row.draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'bulk_open_campaign_not_found';
  end if;

  logic_mode := coalesce(campaign.logic_snapshot->>'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
  end if;

  chunk_target := least(
    chunk_limit,
    greatest(session_row.target_slots - session_row.processed_slots, 0)
  );
  if chunk_target < 1 then
    raise exception 'bulk_open_chunk_empty';
  end if;

  update public.gacha_bulk_open_sessions
  set status = 'processing',
      locked_by = p_worker_id,
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  insert into public.gacha_opens(
    profile_id,
    draw_round_id,
    cost_coins,
    quantity,
    status,
    ledger_entry_id,
    idempotency_key,
    bulk_open_session_id,
    metadata
  )
  values (
    session_row.profile_id,
    session_row.draw_round_id,
    session_row.cost_per_open_snapshot * chunk_target,
    chunk_target,
    'completed',
    session_row.ledger_entry_id,
    'bulk-open-' || session_row.id::text || '-' || session_row.next_bulk_open_sequence::text,
    session_row.id,
    jsonb_build_object(
      'source', 'bulk_open_chunk',
      'bulkOpenSessionId', session_row.id,
      'bulkOpenPublicCode', session_row.public_code,
      'bulkOpenStartSequence', session_row.next_bulk_open_sequence,
      'bulkOpenChunkTarget', chunk_target
    )
  )
  returning * into open_row;

  for position_index in 1..chunk_target loop
    bulk_sequence := session_row.next_bulk_open_sequence + position_index - 1;
    first_collection_item_id := null;
    open_item_id := null;

    select id into slot_id
    from public.draw_slots
    where draw_round_id = session_row.draw_round_id
      and status = 'available'
    order by slot_number asc
    limit 1
    for update skip locked;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    update public.draw_slots
    set status = 'opened',
        opened_at = now()
    where id = slot_id
      and status = 'available';

    get diagnostics slot_update_count = row_count;
    if slot_update_count <> 1 then
      raise exception 'bulk_open_slot_claim_failed';
    end if;

    select
      case
        when coalesce(campaign.total_slots, 0) <= 0 then 100::numeric
        else least(
          100::numeric,
          (
            count(*) filter (where status in ('picked', 'opened'))::numeric
            / greatest(campaign.total_slots, 1)::numeric
          ) * 100
        )
      end
    into sold_pct
    from public.draw_slots
    where draw_round_id = session_row.draw_round_id;

    if campaign.last_prize_card_id is not null
       and campaign.last_prize_awarded_at is null
       and sold_pct >= 100 then
      select u.id, u.image_url, cards.name, cards.image_url
      into lp_stock_unit_id, lp_unit_image_url, lp_card_name, lp_card_image_url
      from public.card_stock_units u
      join public.cards cards on cards.id = u.card_id
      where u.card_id = campaign.last_prize_card_id
        and u.status = 'available'
        and public.card_stock_unit_matches_prize_filter(u, campaign.last_prize_metadata)
      order by
        coalesce(u.id = campaign.last_prize_stock_unit_id, false) desc,
        (nullif(u.image_url, '') is not null) desc,
        u.created_at asc,
        u.id asc
      limit 1
      for update of u;

      if lp_stock_unit_id is null then
        raise exception 'not_enough_prize_inventory';
      end if;

      insert into public.gacha_open_items(
        gacha_open_id,
        card_id,
        draw_round_prize_id,
        draw_round_prize_unit_id,
        tier,
        value_thb,
        result_position,
        bundle_quantity,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        open_row.id,
        campaign.last_prize_card_id,
        null,
        null,
        'last_prize',
        null,
        position_index,
        1,
        session_row.id,
        bulk_sequence
      )
      returning id into lp_open_item_id;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        campaign.last_prize_card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-LP',
        lp_stock_unit_id,
        lp_open_item_id,
        session_row.id,
        bulk_sequence
      )
      returning id into lp_collection_item_id;

      update public.card_stock_units
      set status = 'allocated',
          allocated_draw_round_id = session_row.draw_round_id,
          allocated_draw_round_prize_id = null,
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'lastPrizeAward', jsonb_build_object(
              'drawRoundId', session_row.draw_round_id,
              'profileId', session_row.profile_id,
              'gachaOpenId', open_row.id,
              'gachaOpenItemId', lp_open_item_id,
              'collectionItemId', lp_collection_item_id,
              'bulkOpenSessionId', session_row.id,
              'bulkOpenSequence', bulk_sequence,
              'awardedAt', now()
            )
          )
      where id = lp_stock_unit_id;

      update public.draw_rounds
      set last_prize_awarded_at = now(),
          last_prize_awarded_open_id = open_row.id,
          last_prize_stock_unit_id = lp_stock_unit_id,
          last_prize_collection_item_id = lp_collection_item_id,
          status = 'closed',
          updated_at = now()
      where id = session_row.draw_round_id
      returning * into campaign;

      insert into public.card_stock_ledger(
        stock_unit_id,
        card_id,
        draw_round_id,
        draw_round_prize_id,
        event_type,
        actor_admin_id,
        metadata
      )
      values (
        lp_stock_unit_id,
        campaign.last_prize_card_id,
        session_row.draw_round_id,
        null,
        'allocated',
        null,
        jsonb_build_object(
          'reason', 'bulk_open_last_prize_final_slot',
          'gachaOpenId', open_row.id,
          'collectionItemId', lp_collection_item_id,
          'bulkOpenSessionId', session_row.id,
          'bulkOpenSequence', bulk_sequence
        )
      );

      result_payload := jsonb_build_object(
        'name', lp_card_name,
        'imageUrl', coalesce(nullif(lp_unit_image_url, ''), lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', bulk_sequence,
        'bundleQuantity', 1
      );

      insert into public.gacha_bulk_open_results(
        bulk_open_session_id,
        draw_slot_id,
        bulk_open_sequence,
        status,
        gacha_open_id,
        gacha_open_item_id,
        collection_item_id,
        result_payload
      )
      values (
        session_row.id,
        slot_id,
        bulk_sequence,
        'awarded',
        open_row.id,
        lp_open_item_id,
        lp_collection_item_id,
        result_payload
      )
      on conflict (bulk_open_session_id, draw_slot_id) do update
      set bulk_open_sequence = excluded.bulk_open_sequence,
          status = 'awarded',
          gacha_open_id = excluded.gacha_open_id,
          gacha_open_item_id = excluded.gacha_open_item_id,
          collection_item_id = excluded.collection_item_id,
          result_payload = excluded.result_payload,
          error_code = null,
          updated_at = now();

      inserted_count := inserted_count + 1;
      open_item_count := open_item_count + 1;
      collection_item_count := collection_item_count + 1;
      continue;
    end if;

    select
      units.id,
      units.draw_round_prize_id,
      units.card_id,
      units.card_stock_unit_id,
      cards.name,
      coalesce(nullif(stock.image_url, ''), cards.image_url),
      coalesce(
        prizes.metadata->>'displayTier',
        case
          when prizes.tier = 'high' and coalesce(prizes.rank, 99) <= 3 then 'rainbow'
          when prizes.tier = 'high' then 'gold'
          else 'bronze'
        end
      ),
      prizes.tier,
      prizes.value_thb,
      prizes.convert_coin_value,
      prizes.weight,
      prizes.unlock_at_sold_pct,
      case
        when logic_mode = 'pure_random' then 1::numeric
        else coalesce(prizes.weight, 1)
      end as effective_weight,
      case
        when logic_mode = 'inventory_gated' then coalesce(prizes.unlock_at_sold_pct, 0)
        else 0::numeric
      end as effective_unlock_at_sold_pct,
      greatest(coalesce(prizes.bundle_quantity, 1), 1)
    into
      unit_id,
      unit_prize_id,
      unit_card_id,
      unit_stock_unit_id,
      unit_card_name,
      unit_card_image_url,
      unit_display_tier,
      unit_tier,
      unit_value_thb,
      unit_convert_coin_value,
      unit_weight,
      unit_unlock_at_sold_pct,
      effective_unit_weight,
      effective_unit_unlock_at_sold_pct,
      selected_bundle_quantity
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    join public.cards cards on cards.id = units.card_id
    left join public.card_stock_units stock on stock.id = units.card_stock_unit_id
    where units.draw_round_id = session_row.draw_round_id
      and units.status = 'available'
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
      and (logic_mode = 'pure_random' or coalesce(prizes.weight, 1) > 0)
      and (
        logic_mode <> 'inventory_gated'
        or coalesce(prizes.unlock_at_sold_pct, 0) <= sold_pct
      )
      and (
        select count(*)
        from public.draw_round_prize_units siblings
        where siblings.draw_round_prize_id = prizes.id
          and siblings.status = 'available'
      ) >= greatest(coalesce(prizes.bundle_quantity, 1), 1)
    order by
      -ln(greatest(app_private.secure_random(), 0.000000000001)) /
      greatest(
        case
          when logic_mode = 'pure_random' then 1::double precision
          else coalesce(prizes.weight, 1)::double precision
        end,
        0.000000000001
      )
    limit 1
    for update of units skip locked;

    if unit_id is null then
      raise exception 'not_enough_unlocked_prize_inventory';
    end if;

    claimed_unit_ids := array[unit_id];

    for claimed_unit in
      select units.id
      from public.draw_round_prize_units units
      where units.draw_round_prize_id = unit_prize_id
        and units.status = 'available'
        and units.id <> unit_id
      order by units.created_at, units.id
      limit greatest(selected_bundle_quantity - 1, 0)
      for update skip locked
    loop
      claimed_unit_ids := array_append(claimed_unit_ids, claimed_unit.id);
    end loop;

    if coalesce(array_length(claimed_unit_ids, 1), 0) <> selected_bundle_quantity then
      raise exception 'not_enough_prize_inventory';
    end if;

    insert into public.gacha_open_items(
      gacha_open_id,
      card_id,
      draw_round_prize_id,
      draw_round_prize_unit_id,
      tier,
      value_thb,
      result_position,
      bundle_quantity,
      bulk_open_session_id,
      bulk_open_sequence
    )
    values (
      open_row.id,
      unit_card_id,
      unit_prize_id,
      unit_id,
      unit_tier,
      unit_value_thb,
      position_index,
      selected_bundle_quantity,
      session_row.id,
      bulk_sequence
    )
    returning id into open_item_id;

    bundle_index := 0;
    first_collection_item_id := null;
    for claimed_unit in
      select units.id, units.card_id, units.card_stock_unit_id
      from public.draw_round_prize_units units
      where units.id = any(claimed_unit_ids)
      order by case when units.id = unit_id then 0 else 1 end, units.created_at, units.id
    loop
      bundle_index := bundle_index + 1;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        convert_coin_value_snapshot,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        claimed_unit.card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-' || lpad(position_index::text, 3, '0') || '-' || lpad(bundle_index::text, 2, '0'),
        unit_convert_coin_value,
        claimed_unit.card_stock_unit_id,
        open_item_id,
        session_row.id,
        bulk_sequence
      )
      returning id into new_collection_item_id;

      if first_collection_item_id is null then
        first_collection_item_id := new_collection_item_id;
      end if;

      update public.draw_round_prize_units
      set status = 'awarded',
          profile_id = session_row.profile_id,
          gacha_open_id = open_row.id,
          gacha_open_item_id = open_item_id,
          collection_item_id = new_collection_item_id,
          awarded_at = now(),
          metadata = metadata || jsonb_build_object(
            'slotId', slot_id,
            'position', position_index,
            'soldPctAtAward', sold_pct,
            'logicMode', logic_mode,
            'weight', unit_weight,
            'effectiveWeight', effective_unit_weight,
            'unlockAtSoldPct', unit_unlock_at_sold_pct,
            'effectiveUnlockAtSoldPct', effective_unit_unlock_at_sold_pct,
            'bundleQuantity', selected_bundle_quantity,
            'bundleIndex', bundle_index,
            'bundleOpenItemId', open_item_id,
            'bulkOpenSessionId', session_row.id,
            'bulkOpenSequence', bulk_sequence
          )
      where id = claimed_unit.id;
    end loop;

    result_payload := jsonb_build_object(
      'name', unit_card_name,
      'imageUrl', unit_card_image_url,
      'tier', unit_tier,
      'displayTier', unit_display_tier,
      'valueThb', unit_value_thb,
      'position', bulk_sequence,
      'bundleQuantity', selected_bundle_quantity
    );

    insert into public.gacha_bulk_open_results(
      bulk_open_session_id,
      draw_slot_id,
      bulk_open_sequence,
      status,
      gacha_open_id,
      gacha_open_item_id,
      collection_item_id,
      result_payload
    )
    values (
      session_row.id,
      slot_id,
      bulk_sequence,
      'awarded',
      open_row.id,
      open_item_id,
      first_collection_item_id,
      result_payload
    )
    on conflict (bulk_open_session_id, draw_slot_id) do update
    set bulk_open_sequence = excluded.bulk_open_sequence,
        status = 'awarded',
        gacha_open_id = excluded.gacha_open_id,
        gacha_open_item_id = excluded.gacha_open_item_id,
        collection_item_id = excluded.collection_item_id,
        result_payload = excluded.result_payload,
        error_code = null,
        updated_at = now();

    inserted_count := inserted_count + 1;
    open_item_count := open_item_count + 1;
    collection_item_count := collection_item_count + 1;
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, bulk_open_session_id, metadata)
  values (
    session_row.profile_id,
    'gacha_opened',
    session_row.draw_round_id,
    open_row.id,
    session_row.id,
    jsonb_build_object(
      'quantity', chunk_target,
      'cost_coins', open_row.cost_coins,
      'isTest', coalesce(campaign.is_test, false),
      'logicMode', logic_mode,
      'source', 'bulk_open_chunk'
    )
  );

  select coalesce(jsonb_agg(public_payload order by priority asc, value_for_sort desc nulls last, bulk_open_sequence asc), '[]'::jsonb)
  into highlight_items
  from (
    select
      result_payload as public_payload,
      bulk_open_sequence,
      case
        when coalesce((result_payload->>'isLastPrize')::boolean, false) then 0
        when result_payload->>'displayTier' = 'last_prize' then 0
        when result_payload->>'displayTier' = 'rainbow' then 1
        when result_payload->>'displayTier' = 'gold' then 2
        when result_payload->>'displayTier' = 'silver' then 3
        else 4
      end as priority,
      nullif(result_payload->>'valueThb', '')::numeric as value_for_sort
    from public.gacha_bulk_open_results
    where bulk_open_session_id = session_row.id
      and status = 'awarded'
    order by priority asc, value_for_sort desc nulls last, bulk_open_sequence asc
    limit 100
  ) ranked;

  select count(*)::integer into available_slot_count
  from public.draw_slots
  where draw_round_id = session_row.draw_round_id
    and status = 'available';

  completed_now := session_row.processed_slots + inserted_count >= session_row.target_slots
    or available_slot_count = 0;

  update public.gacha_bulk_open_sessions
  set processed_slots = least(target_slots, processed_slots + inserted_count),
      next_bulk_open_sequence = next_bulk_open_sequence + inserted_count,
      open_items_awarded = least(target_slots, open_items_awarded + open_item_count),
      collection_items_created = least(target_slots, collection_items_created + collection_item_count),
      highlight_rewards_public = highlight_items,
      status = case when completed_now then 'completed' else 'processing' end,
      completed_at = case when completed_now then coalesce(completed_at, now()) else completed_at end,
      retry_scheduled_at = null,
      last_error_code = null,
      last_error_at = null,
      locked_by = case when completed_now then null else p_worker_id end,
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  if completed_now then
    update public.draw_rounds
    set status = 'closed',
        updated_at = now()
    where id = session_row.draw_round_id
      and status <> 'closed';

    insert into public.audit_events(actor_profile_id, event_type, draw_round_id, bulk_open_session_id, metadata)
    values (
      session_row.profile_id,
      'bulk_open_completed',
      session_row.draw_round_id,
      session_row.id,
      jsonb_build_object(
        'targetSlots', session_row.target_slots,
        'processedSlots', session_row.processed_slots,
        'publicCode', session_row.public_code
      )
    );
  end if;

  return jsonb_build_object(
    'status', session_row.status,
    'sessionId', session_row.id,
    'processedSlots', session_row.processed_slots,
    'targetSlots', session_row.target_slots,
    'inserted', inserted_count,
    'openItemsAwarded', session_row.open_items_awarded,
    'collectionItemsCreated', session_row.collection_items_created,
    'completed', completed_now,
    'shouldContinue', not completed_now
  );
exception
  when others then
    update public.gacha_bulk_open_sessions
    set status = 'retry_required',
        retry_count = retry_count + 1,
        retry_scheduled_at = now() + interval '1 minute',
        last_error_code = sqlstate,
        last_error_at = now(),
        heartbeat_at = now(),
        updated_at = now()
    where id = p_bulk_open_session_id
      and status <> 'completed'
    returning * into session_row;

    if session_row.id is null then
      raise;
    end if;

    return jsonb_build_object(
      'status', 'retry_required',
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'targetSlots', session_row.target_slots,
      'inserted', 0,
      'completed', false,
      'shouldContinue', true,
      'retryScheduledAt', session_row.retry_scheduled_at,
      'errorCode', session_row.last_error_code
    );
end;
$$;

create or replace function public.finalize_bulk_open_session(
  p_bulk_open_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  session_row public.gacha_bulk_open_sessions%rowtype;
  awarded_result_count integer;
begin
  if p_bulk_open_session_id is null then
    raise exception 'bulk_open_session_required';
  end if;

  select * into session_row
  from public.gacha_bulk_open_sessions
  where id = p_bulk_open_session_id
  for update;

  if session_row.id is null then
    raise exception 'bulk_open_session_not_found';
  end if;

  select count(*)::integer into awarded_result_count
  from public.gacha_bulk_open_results
  where bulk_open_session_id = session_row.id
    and status = 'awarded'
    and gacha_open_item_id is not null
    and collection_item_id is not null;

  if awarded_result_count < session_row.target_slots then
    return jsonb_build_object(
      'status', session_row.status,
      'sessionId', session_row.id,
      'processedSlots', session_row.processed_slots,
      'openItemsAwarded', awarded_result_count,
      'collectionItemsCreated', awarded_result_count,
      'targetSlots', session_row.target_slots,
      'completed', false
    );
  end if;

  update public.gacha_bulk_open_sessions
  set status = 'completed',
      processed_slots = greatest(processed_slots, awarded_result_count),
      open_items_awarded = session_row.target_slots,
      collection_items_created = session_row.target_slots,
      completed_at = coalesce(completed_at, now()),
      heartbeat_at = now(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, bulk_open_session_id, metadata)
  values (
    session_row.profile_id,
    'bulk_open_completed',
    session_row.draw_round_id,
    session_row.id,
    jsonb_build_object(
      'targetSlots', session_row.target_slots,
      'processedSlots', session_row.processed_slots,
      'publicCode', session_row.public_code
    )
  );

  return jsonb_build_object(
    'status', session_row.status,
    'sessionId', session_row.id,
    'processedSlots', session_row.processed_slots,
    'targetSlots', session_row.target_slots,
    'completed', true
  );
end;
$$;

create or replace function public.list_bulk_open_recovery_sessions(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  safe_limit integer;
  sessions jsonb;
begin
  safe_limit := least(greatest(coalesce(p_limit, 10), 1), 50);

  select coalesce(jsonb_agg(session_payload order by sort_created_at asc), '[]'::jsonb)
  into sessions
  from (
    select
      jsonb_build_object(
        'sessionId', session.id,
        'status', session.status
      ) as session_payload,
      session.created_at as sort_created_at
    from public.gacha_bulk_open_sessions session
    where session.status = 'queued'
      or (
        session.status = 'retry_required'
        and coalesce(session.retry_scheduled_at, session.created_at) <= now()
      )
      or (
        session.status = 'processing'
        and coalesce(session.heartbeat_at, session.updated_at, session.created_at) < now() - interval '5 minutes'
      )
    order by session.created_at asc
    limit safe_limit
  ) recovery;

  return coalesce(sessions, '[]'::jsonb);
end;
$$;

revoke all on function public.has_active_bulk_open_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_bulk_open_start_token(uuid, uuid, integer, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bulk_open_settlement_enabled() from public, anon, authenticated;
revoke all on function public.prepare_bulk_open_quote(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_bulk_open_highlights_seen(uuid, text) from public, anon, authenticated;
revoke all on function public.start_bulk_open_session(uuid, uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.process_bulk_open_chunk(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_bulk_open_session(uuid) from public, anon, authenticated;
revoke all on function public.list_bulk_open_recovery_sessions(integer) from public, anon, authenticated;

grant execute on function public.has_active_bulk_open_session(uuid, uuid) to service_role;
grant execute on function public.create_bulk_open_start_token(uuid, uuid, integer, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.bulk_open_settlement_enabled() to service_role;
grant execute on function public.prepare_bulk_open_quote(uuid, uuid, timestamptz) to service_role;
grant execute on function public.mark_bulk_open_highlights_seen(uuid, text) to service_role;
grant execute on function public.start_bulk_open_session(uuid, uuid, uuid, integer, integer, text, text) to service_role;
grant execute on function public.process_bulk_open_chunk(uuid, integer, text) to service_role;
grant execute on function public.finalize_bulk_open_session(uuid) to service_role;
grant execute on function public.list_bulk_open_recovery_sessions(integer) to service_role;
