-- Phase 2+ production platform foundation for YNot website.
-- Adds wallet/top-up/payment, gacha opening, collection, exchange, shipping,
-- account merge, idempotency, ranking/settings, RLS, and service-role RPCs.
-- Local artifact only: apply to Supabase after backup/staging verification.

create extension if not exists pgcrypto;
create schema if not exists app_private;

alter table public.draw_rounds
  add column if not exists mode text not null default 'slot_pick' check (mode in ('slot_pick', 'instant_gacha')),
  add column if not exists cost_coins integer check (cost_coins is null or cost_coins > 0),
  add column if not exists opens_total_limit integer check (opens_total_limit is null or opens_total_limit > 0),
  add column if not exists per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  add column if not exists ends_at timestamptz,
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'hidden', 'private')),
  add column if not exists sort_order integer not null default 0;

update public.draw_rounds
set
  mode = coalesce(mode, 'slot_pick'),
  cost_coins = coalesce(cost_coins, greatest(1, ceil(price_thb::numeric / 100)::integer)),
  visibility = coalesce(visibility, 'public')
where cost_coins is null
   or visibility is null;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null check (type in ('bank_transfer', 'promptpay_qr')),
  display_name text not null,
  bank_name text,
  account_name text,
  account_number text,
  promptpay_id text,
  qr_image_path text,
  instructions text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_methods (
  code,
  type,
  display_name,
  bank_name,
  account_name,
  account_number,
  promptpay_id,
  instructions,
  is_active,
  sort_order
)
select
  'legacy-main-transfer',
  case when max(promptpay_id) is not null then 'promptpay_qr' else 'bank_transfer' end,
  'YNot main transfer',
  max(bank_name),
  max(bank_account_name),
  max(bank_account_number),
  max(promptpay_id),
  'Transfer manually, then upload the slip for admin confirmation.',
  true,
  10
from public.draw_rounds
having count(*) > 0
on conflict (code) do update
set
  type = excluded.type,
  display_name = excluded.display_name,
  bank_name = coalesce(public.payment_methods.bank_name, excluded.bank_name),
  account_name = coalesce(public.payment_methods.account_name, excluded.account_name),
  account_number = coalesce(public.payment_methods.account_number, excluded.account_number),
  promptpay_id = coalesce(public.payment_methods.promptpay_id, excluded.promptpay_id),
  instructions = excluded.instructions,
  is_active = true,
  updated_at = now();

create sequence if not exists public.top_up_public_code_seq start with 1001;
create table if not exists public.top_up_requests (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('TU-' || nextval('public.top_up_public_code_seq')::text),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount_thb integer not null check (amount_thb > 0),
  coin_amount integer not null check (coin_amount > 0),
  status text not null default 'pending_review' check (status in ('pending_slip', 'pending_review', 'approved', 'rejected', 'cancelled', 'expired')),
  submitted_at timestamptz,
  reviewed_by_admin_id uuid references public.admin_users(id),
  reviewed_at timestamptz,
  admin_note text,
  customer_note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_slips
  alter column order_id drop not null,
  add column if not exists top_up_request_id uuid references public.top_up_requests(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_slips_exactly_one_owner_ck'
      and conrelid = 'public.payment_slips'::regclass
  ) then
    alter table public.payment_slips
      add constraint payment_slips_exactly_one_owner_ck
      check ((order_id is not null)::integer + (top_up_request_id is not null)::integer = 1);
  end if;
end $$;

create table if not exists public.wallet_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  balance_coins integer not null default 0 check (balance_coins >= 0),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wallet_accounts (profile_id)
select p.id from public.profiles p
on conflict (profile_id) do nothing;

create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wallet_profile_id uuid not null references public.wallet_accounts(profile_id) on delete cascade,
  entry_type text not null check (entry_type in ('top_up', 'gacha_spend', 'refund', 'admin_adjustment', 'exchange_fee', 'shipping_fee', 'exchange_credit')),
  amount_coins integer not null check (amount_coins <> 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  created_by_admin_id uuid references public.admin_users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (wallet_profile_id = profile_id)
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  request_hash text,
  response_snapshot jsonb,
  status text not null default 'started' check (status in ('started', 'completed', 'failed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key)
);

create table if not exists public.account_merge_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  source_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  reason text,
  risk_summary jsonb not null default '{}'::jsonb,
  approved_by_admin_id uuid references public.admin_users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_profile_id <> target_profile_id)
);

create table if not exists public.account_merge_events (
  id uuid primary key default gen_random_uuid(),
  merge_request_id uuid not null references public.account_merge_requests(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'risk_reviewed', 'approved', 'rejected', 'completed', 'cancelled', 'failed')),
  status_from text,
  status_to text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create sequence if not exists public.gacha_open_public_code_seq start with 1001;
create table if not exists public.gacha_opens (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('GO-' || nextval('public.gacha_open_public_code_seq')::text),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draw_round_id uuid not null references public.draw_rounds(id) on delete restrict,
  cost_coins integer not null check (cost_coins > 0),
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'completed' check (status in ('reserved', 'completed', 'failed', 'refunded')),
  ledger_entry_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, idempotency_key)
);

create table if not exists public.gacha_open_items (
  id uuid primary key default gen_random_uuid(),
  gacha_open_id uuid not null references public.gacha_opens(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  draw_round_prize_id uuid references public.draw_round_prizes(id) on delete set null,
  tier text,
  value_thb integer,
  result_position integer not null default 1,
  created_at timestamptz not null default now(),
  unique (gacha_open_id, result_position)
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  source_type text not null check (source_type in ('gacha_open', 'admin_grant', 'legacy_import')),
  source_id uuid,
  status text not null default 'owned' check (status in ('owned', 'locked', 'exchange_requested', 'exchanged', 'shipping_requested', 'shipped', 'void')),
  serial_no text,
  acquired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.exchange_order_public_code_seq start with 1001;
create table if not exists public.exchange_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('EX-' || nextval('public.exchange_order_public_code_seq')::text),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'approved', 'rejected', 'completed', 'cancelled')),
  requested_coin_value integer not null default 0 check (requested_coin_value >= 0),
  approved_coin_value integer check (approved_coin_value is null or approved_coin_value >= 0),
  reviewed_by_admin_id uuid references public.admin_users(id),
  customer_note text,
  admin_note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, idempotency_key)
);

create table if not exists public.exchange_order_items (
  exchange_order_id uuid not null references public.exchange_orders(id) on delete cascade,
  collection_item_id uuid not null references public.collection_items(id) on delete restrict,
  card_id uuid not null references public.cards(id) on delete restrict,
  coin_value_snapshot integer not null default 0 check (coin_value_snapshot >= 0),
  created_at timestamptz not null default now(),
  primary key (exchange_order_id, collection_item_id)
);

create sequence if not exists public.shipping_request_public_code_seq start with 1001;
create table if not exists public.shipping_requests (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('SH-' || nextval('public.shipping_request_public_code_seq')::text),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  address_id uuid references public.user_addresses(id) on delete set null,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'packing', 'shipped', 'delivered', 'cancelled')),
  shipping_fee_coins integer not null default 0 check (shipping_fee_coins >= 0),
  tracking_provider text,
  tracking_number text,
  customer_note text,
  admin_note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, idempotency_key)
);

create table if not exists public.shipping_request_items (
  shipping_request_id uuid not null references public.shipping_requests(id) on delete cascade,
  collection_item_id uuid not null references public.collection_items(id) on delete restrict,
  card_id uuid not null references public.cards(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (shipping_request_id, collection_item_id)
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by_admin_id uuid references public.admin_users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global',
  period_start timestamptz,
  period_end timestamptz,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  metric text not null,
  rank integer not null check (rank > 0),
  value integer not null default 0,
  generated_at timestamptz not null default now(),
  unique (scope, metric, profile_id, generated_at)
);

alter table public.audit_events
  add column if not exists top_up_request_id uuid references public.top_up_requests(id) on delete set null,
  add column if not exists gacha_open_id uuid references public.gacha_opens(id) on delete set null,
  add column if not exists collection_item_id uuid references public.collection_items(id) on delete set null,
  add column if not exists exchange_order_id uuid references public.exchange_orders(id) on delete set null,
  add column if not exists shipping_request_id uuid references public.shipping_requests(id) on delete set null,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists draw_rounds_mode_status_idx on public.draw_rounds(mode, status, sort_order);
create index if not exists payment_methods_active_sort_idx on public.payment_methods(is_active, sort_order);
create index if not exists top_up_requests_profile_status_idx on public.top_up_requests(profile_id, status, created_at desc);
create index if not exists top_up_requests_status_created_idx on public.top_up_requests(status, created_at desc);
create index if not exists payment_slips_top_up_request_id_idx on public.payment_slips(top_up_request_id);
create index if not exists wallet_accounts_balance_idx on public.wallet_accounts(balance_coins desc);
create index if not exists coin_ledger_profile_created_idx on public.coin_ledger(profile_id, created_at desc);
create unique index if not exists coin_ledger_profile_idempotency_unique_idx on public.coin_ledger(profile_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists coin_ledger_reference_effect_unique_idx on public.coin_ledger(reference_type, reference_id, entry_type) where reference_id is not null;
create index if not exists idempotency_keys_profile_scope_idx on public.idempotency_keys(profile_id, scope, created_at desc);
create index if not exists account_merge_requests_profiles_idx on public.account_merge_requests(source_profile_id, target_profile_id, status);
create index if not exists gacha_opens_profile_created_idx on public.gacha_opens(profile_id, created_at desc);
create index if not exists gacha_open_items_open_idx on public.gacha_open_items(gacha_open_id);
create index if not exists collection_items_profile_status_idx on public.collection_items(profile_id, status, acquired_at desc);
create index if not exists exchange_orders_profile_status_idx on public.exchange_orders(profile_id, status, created_at desc);
create index if not exists shipping_requests_profile_status_idx on public.shipping_requests(profile_id, status, created_at desc);
create index if not exists ranking_snapshots_scope_metric_rank_idx on public.ranking_snapshots(scope, metric, rank);

-- Touch updated_at for mutable tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'payment_methods', 'top_up_requests', 'wallet_accounts', 'idempotency_keys',
    'account_merge_requests', 'collection_items', 'exchange_orders',
    'shipping_requests', 'site_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.touch_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end $$;

-- Realtime triggers for private platform events.
create or replace function app_private.emit_platform_realtime_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  event_topic text;
  event_profile_id uuid;
  event_entity_type text;
  event_entity_id uuid;
begin
  if tg_table_name = 'top_up_requests' then
    event_topic := 'topups';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'top_up_request';
    event_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'wallet_accounts' then
    event_topic := 'wallet';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'wallet_account';
    event_entity_id := event_profile_id;
  elsif tg_table_name = 'gacha_opens' then
    event_topic := 'gacha';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'gacha_open';
    event_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'collection_items' then
    event_topic := 'collection';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'collection_item';
    event_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'exchange_orders' then
    event_topic := 'exchange';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'exchange_order';
    event_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'shipping_requests' then
    event_topic := 'shipping';
    event_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    event_entity_type := 'shipping_request';
    event_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  if event_topic is not null and event_profile_id is not null then
    insert into public.app_realtime_events(topic, profile_id, entity_type, entity_id, admin_only)
    values (event_topic, event_profile_id, event_entity_type, event_entity_id, false);
    insert into public.app_realtime_events(topic, profile_id, entity_type, entity_id, admin_only)
    values ('admin', event_profile_id, event_entity_type, event_entity_id, true);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'top_up_requests', 'wallet_accounts', 'gacha_opens', 'collection_items', 'exchange_orders', 'shipping_requests'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_emit_platform_realtime_event', table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.emit_platform_realtime_event()',
      table_name || '_emit_platform_realtime_event',
      table_name
    );
  end loop;
end $$;

-- Service-role RPCs. These are security invoker and execution is revoked from public/anon/authenticated.
create or replace function public.approve_top_up_request(
  p_top_up_request_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_topup public.top_up_requests%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  inserted_ledger_id uuid;
  existing_ledger public.coin_ledger%rowtype;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into locked_topup
  from public.top_up_requests
  where id = p_top_up_request_id
  for update;

  if locked_topup.id is null then
    raise exception 'top_up_not_found';
  end if;

  if locked_topup.status = 'approved' then
    select * into existing_ledger
    from public.coin_ledger
    where reference_type = 'top_up_request'
      and reference_id = locked_topup.id
      and entry_type = 'top_up'
    limit 1;
    return jsonb_build_object('status', 'approved', 'topUpId', locked_topup.id, 'ledgerId', existing_ledger.id);
  end if;

  if locked_topup.status not in ('pending_slip', 'pending_review', 'rejected') then
    raise exception 'top_up_not_reviewable';
  end if;

  insert into public.wallet_accounts(profile_id)
  values (locked_topup.profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = locked_topup.profile_id
  for update;

  update public.top_up_requests
  set
    status = 'approved',
    reviewed_by_admin_id = p_admin_id,
    reviewed_at = now(),
    admin_note = p_admin_note,
    submitted_at = coalesce(submitted_at, now())
  where id = locked_topup.id
  returning * into locked_topup;

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
    created_by_admin_id,
    metadata
  ) values (
    locked_topup.profile_id,
    locked_topup.profile_id,
    'top_up',
    locked_topup.coin_amount,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins + locked_topup.coin_amount,
    'top_up_request',
    locked_topup.id,
    locked_topup.idempotency_key,
    p_admin_id,
    jsonb_build_object('public_code', locked_topup.public_code, 'amount_thb', locked_topup.amount_thb)
  )
  returning id into inserted_ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + locked_topup.coin_amount,
      version = version + 1
  where profile_id = locked_topup.profile_id;

  update public.payment_slips
  set reviewed_by = p_admin_id,
      reviewed_at = now(),
      verification_status = case when verification_status = 'unverified' then 'manual_review' else verification_status end
  where top_up_request_id = locked_topup.id;

  insert into public.audit_events(actor_admin_id, event_type, top_up_request_id, metadata)
  values (p_admin_id, 'top_up_approved', locked_topup.id, jsonb_build_object('public_code', locked_topup.public_code, 'coin_amount', locked_topup.coin_amount));

  return jsonb_build_object('status', 'approved', 'topUpId', locked_topup.id, 'ledgerId', inserted_ledger_id);
end;
$$;

create or replace function public.reject_top_up_request(
  p_top_up_request_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_topup public.top_up_requests%rowtype;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into locked_topup
  from public.top_up_requests
  where id = p_top_up_request_id
  for update;

  if locked_topup.id is null then
    raise exception 'top_up_not_found';
  end if;
  if locked_topup.status = 'approved' then
    raise exception 'approved_top_up_cannot_be_rejected';
  end if;

  update public.top_up_requests
  set status = 'rejected',
      reviewed_by_admin_id = p_admin_id,
      reviewed_at = now(),
      admin_note = p_admin_note
  where id = locked_topup.id
  returning * into locked_topup;

  update public.payment_slips
  set reviewed_by = p_admin_id,
      reviewed_at = now()
  where top_up_request_id = locked_topup.id;

  insert into public.audit_events(actor_admin_id, event_type, top_up_request_id, metadata)
  values (p_admin_id, 'top_up_rejected', locked_topup.id, jsonb_build_object('public_code', locked_topup.public_code, 'admin_note', p_admin_note));

  return jsonb_build_object('status', 'rejected', 'topUpId', locked_topup.id);
end;
$$;

create or replace function public.open_gacha_campaign(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_quantity integer default 1,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  existing_open public.gacha_opens%rowtype;
  open_row public.gacha_opens%rowtype;
  prize_row public.draw_round_prizes%rowtype;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  result_items jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'invalid_open_quantity';
  end if;

  if p_idempotency_key is not null then
    select * into existing_open
    from public.gacha_opens
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_open.id is not null then
      return jsonb_build_object('status', existing_open.status, 'openId', existing_open.id, 'publicCode', existing_open.public_code, 'replayed', true);
    end if;
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
  for share;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  total_cost := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer)) * p_quantity;

  insert into public.wallet_accounts(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = p_profile_id
  for update;

  if locked_wallet.balance_coins < total_cost then
    raise exception 'insufficient_balance';
  end if;

  insert into public.gacha_opens(profile_id, draw_round_id, cost_coins, quantity, status, idempotency_key, metadata)
  values (p_profile_id, p_draw_round_id, total_cost, p_quantity, 'completed', p_idempotency_key, jsonb_build_object('campaignSlug', campaign.slug))
  returning * into open_row;

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
    -total_cost,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins - total_cost,
    'gacha_open',
    open_row.id,
    p_idempotency_key,
    jsonb_build_object('drawRoundId', p_draw_round_id, 'quantity', p_quantity)
  )
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins - total_cost,
      version = version + 1
  where profile_id = p_profile_id;

  update public.gacha_opens
  set ledger_entry_id = ledger_id
  where id = open_row.id;

  for position_index in 1..p_quantity loop
    select * into prize_row
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id
    order by random()
    limit 1;

    if prize_row.id is null then
      raise exception 'campaign_has_no_prizes';
    end if;

    insert into public.gacha_open_items(gacha_open_id, card_id, draw_round_prize_id, tier, value_thb, result_position)
    values (open_row.id, prize_row.card_id, prize_row.id, prize_row.tier, prize_row.value_thb, position_index);

    insert into public.collection_items(profile_id, card_id, source_type, source_id, status, serial_no)
    values (p_profile_id, prize_row.card_id, 'gacha_open', open_row.id, 'owned', open_row.public_code || '-' || lpad(position_index::text, 2, '0'));

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', prize_row.card_id,
      'tier', prize_row.tier,
      'valueThb', prize_row.value_thb,
      'position', position_index
    ));
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)
  values (p_profile_id, 'gacha_opened', p_draw_round_id, open_row.id, jsonb_build_object('quantity', p_quantity, 'cost_coins', total_cost));

  return jsonb_build_object('status', 'completed', 'openId', open_row.id, 'publicCode', open_row.public_code, 'costCoins', total_cost, 'items', result_items);
end;
$$;

create or replace function public.submit_exchange_order(
  p_profile_id uuid,
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
  exchange_row public.exchange_orders%rowtype;
  existing_order public.exchange_orders%rowtype;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select count(distinct item_id) into requested_count
  from unnest(p_collection_item_ids) as item_id;
  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  if p_idempotency_key is not null then
    select * into existing_order
    from public.exchange_orders
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_order.id is not null then
      return jsonb_build_object('status', existing_order.status, 'exchangeOrderId', existing_order.id, 'publicCode', existing_order.public_code, 'replayed', true);
    end if;
  end if;

  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
  for update;

  select count(*) into valid_count
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned';

  if valid_count <> requested_count then
    raise exception 'collection_item_not_exchangeable';
  end if;

  insert into public.exchange_orders(profile_id, status, requested_coin_value, customer_note, idempotency_key)
  values (p_profile_id, 'submitted', requested_count * 10, p_customer_note, p_idempotency_key)
  returning * into exchange_row;

  insert into public.exchange_order_items(exchange_order_id, collection_item_id, card_id, coin_value_snapshot)
  select exchange_row.id, ci.id, ci.card_id, 10
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id;

  update public.collection_items
  set status = 'exchange_requested'
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id;

  insert into public.audit_events(actor_profile_id, event_type, exchange_order_id, metadata)
  values (p_profile_id, 'exchange_submitted', exchange_row.id, jsonb_build_object('item_count', requested_count));

  return jsonb_build_object('status', 'submitted', 'exchangeOrderId', exchange_row.id, 'publicCode', exchange_row.public_code, 'itemCount', requested_count);
end;
$$;

create or replace function public.approve_exchange_order(
  p_exchange_order_id uuid,
  p_admin_id uuid,
  p_approved_coin_value integer default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_exchange public.exchange_orders%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  inserted_ledger_id uuid;
  existing_ledger public.coin_ledger%rowtype;
  approved_value integer;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into locked_exchange
  from public.exchange_orders
  where id = p_exchange_order_id
  for update;

  if locked_exchange.id is null then
    raise exception 'exchange_order_not_found';
  end if;

  if locked_exchange.status = 'approved' then
    select * into existing_ledger
    from public.coin_ledger
    where reference_type = 'exchange_order'
      and reference_id = locked_exchange.id
      and entry_type = 'exchange_credit'
    limit 1;
    return jsonb_build_object('status', 'approved', 'exchangeOrderId', locked_exchange.id, 'ledgerId', existing_ledger.id);
  end if;

  if locked_exchange.status <> 'submitted' then
    raise exception 'exchange_order_not_reviewable';
  end if;

  approved_value := coalesce(p_approved_coin_value, locked_exchange.requested_coin_value);
  if approved_value is null or approved_value <= 0 then
    raise exception 'invalid_exchange_coin_value';
  end if;

  insert into public.wallet_accounts(profile_id)
  values (locked_exchange.profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = locked_exchange.profile_id
  for update;

  update public.exchange_orders
  set status = 'approved',
      approved_coin_value = approved_value,
      reviewed_by_admin_id = p_admin_id,
      admin_note = p_admin_note
  where id = locked_exchange.id
  returning * into locked_exchange;

  update public.collection_items ci
  set status = 'exchanged'
  from public.exchange_order_items eoi
  where eoi.exchange_order_id = locked_exchange.id
    and eoi.collection_item_id = ci.id
    and ci.profile_id = locked_exchange.profile_id
    and ci.status = 'exchange_requested';

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
    created_by_admin_id,
    metadata
  ) values (
    locked_exchange.profile_id,
    locked_exchange.profile_id,
    'exchange_credit',
    approved_value,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins + approved_value,
    'exchange_order',
    locked_exchange.id,
    locked_exchange.idempotency_key,
    p_admin_id,
    jsonb_build_object('public_code', locked_exchange.public_code, 'requested_coin_value', locked_exchange.requested_coin_value)
  )
  returning id into inserted_ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + approved_value,
      version = version + 1
  where profile_id = locked_exchange.profile_id;

  insert into public.audit_events(actor_admin_id, event_type, exchange_order_id, metadata)
  values (p_admin_id, 'exchange_approved', locked_exchange.id, jsonb_build_object('public_code', locked_exchange.public_code, 'approved_coin_value', approved_value, 'admin_note', p_admin_note));

  return jsonb_build_object('status', 'approved', 'exchangeOrderId', locked_exchange.id, 'ledgerId', inserted_ledger_id, 'approvedCoinValue', approved_value);
end;
$$;

create or replace function public.reject_exchange_order(
  p_exchange_order_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_exchange public.exchange_orders%rowtype;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into locked_exchange
  from public.exchange_orders
  where id = p_exchange_order_id
  for update;

  if locked_exchange.id is null then
    raise exception 'exchange_order_not_found';
  end if;

  if locked_exchange.status = 'rejected' then
    return jsonb_build_object('status', 'rejected', 'exchangeOrderId', locked_exchange.id);
  end if;
  if locked_exchange.status in ('approved', 'completed') then
    raise exception 'approved_exchange_cannot_be_rejected';
  end if;
  if locked_exchange.status <> 'submitted' then
    raise exception 'exchange_order_not_reviewable';
  end if;

  update public.exchange_orders
  set status = 'rejected',
      reviewed_by_admin_id = p_admin_id,
      admin_note = p_admin_note
  where id = locked_exchange.id
  returning * into locked_exchange;

  update public.collection_items ci
  set status = 'owned'
  from public.exchange_order_items eoi
  where eoi.exchange_order_id = locked_exchange.id
    and eoi.collection_item_id = ci.id
    and ci.profile_id = locked_exchange.profile_id
    and ci.status = 'exchange_requested';

  insert into public.audit_events(actor_admin_id, event_type, exchange_order_id, metadata)
  values (p_admin_id, 'exchange_rejected', locked_exchange.id, jsonb_build_object('public_code', locked_exchange.public_code, 'admin_note', p_admin_note));

  return jsonb_build_object('status', 'rejected', 'exchangeOrderId', locked_exchange.id);
end;
$$;

create or replace function public.complete_account_merge_request(
  p_merge_request_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  merge_row public.account_merge_requests%rowtype;
  source_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  source_wallet public.wallet_accounts%rowtype;
  target_wallet public.wallet_accounts%rowtype;
  inserted_ledger_id uuid;
  admin_is_active boolean;
  target_has_admin boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into merge_row
  from public.account_merge_requests
  where id = p_merge_request_id
  for update;

  if merge_row.id is null then
    raise exception 'merge_request_not_found';
  end if;
  if merge_row.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'mergeRequestId', merge_row.id, 'replayed', true);
  end if;
  if merge_row.status not in ('pending', 'approved') then
    raise exception 'merge_request_not_approvable';
  end if;

  select * into source_profile from public.profiles where id = merge_row.source_profile_id for update;
  select * into target_profile from public.profiles where id = merge_row.target_profile_id for update;
  if source_profile.id is null or target_profile.id is null then
    raise exception 'merge_profiles_not_found';
  end if;
  if source_profile.id = target_profile.id then
    raise exception 'merge_profiles_must_differ';
  end if;

  insert into public.wallet_accounts(profile_id) values (source_profile.id) on conflict (profile_id) do nothing;
  insert into public.wallet_accounts(profile_id) values (target_profile.id) on conflict (profile_id) do nothing;

  select * into source_wallet from public.wallet_accounts where profile_id = source_profile.id for update;
  select * into target_wallet from public.wallet_accounts where profile_id = target_profile.id for update;

  if source_wallet.balance_coins > 0 then
    insert into public.coin_ledger(
      profile_id,
      wallet_profile_id,
      entry_type,
      amount_coins,
      balance_before,
      balance_after,
      reference_type,
      reference_id,
      created_by_admin_id,
      metadata
    ) values (
      target_profile.id,
      target_profile.id,
      'admin_adjustment',
      source_wallet.balance_coins,
      target_wallet.balance_coins,
      target_wallet.balance_coins + source_wallet.balance_coins,
      'account_merge_request',
      merge_row.id,
      p_admin_id,
      jsonb_build_object('sourceProfileId', source_profile.id, 'adminNote', p_admin_note)
    )
    returning id into inserted_ledger_id;

    update public.wallet_accounts
    set balance_coins = balance_coins + source_wallet.balance_coins,
        version = version + 1
    where profile_id = target_profile.id;

    update public.wallet_accounts
    set balance_coins = 0,
        version = version + 1
    where profile_id = source_profile.id;
  end if;

  delete from public.user_identities source_identity
  using public.user_identities target_identity
  where source_identity.profile_id = source_profile.id
    and target_identity.profile_id = target_profile.id
    and target_identity.provider = source_identity.provider
    and target_identity.provider_subject = source_identity.provider_subject;

  update public.user_identities set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.user_addresses set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.top_up_requests set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.gacha_opens set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.collection_items set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.exchange_orders set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.shipping_requests set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.ranking_snapshots set profile_id = target_profile.id where profile_id = source_profile.id;
  update public.orders set profile_id = target_profile.id where profile_id = source_profile.id;

  select exists(select 1 from public.admin_users where profile_id = target_profile.id)
  into target_has_admin;
  if target_has_admin then
    update public.admin_users set is_active = false where profile_id = source_profile.id;
  else
    update public.admin_users set profile_id = target_profile.id where profile_id = source_profile.id;
  end if;

  update public.profiles
  set line_user_id = null,
      auth_user_id = null,
      profile_status = 'merged'
  where id = source_profile.id;

  update public.profiles
  set line_user_id = coalesce(target_profile.line_user_id, source_profile.line_user_id),
      auth_user_id = coalesce(target_profile.auth_user_id, source_profile.auth_user_id),
      email = coalesce(target_profile.email, source_profile.email),
      display_name = coalesce(target_profile.display_name, source_profile.display_name, source_profile.line_display_name),
      avatar_url = coalesce(target_profile.avatar_url, source_profile.avatar_url, source_profile.line_picture_url),
      profile_status = 'active',
      last_seen_at = now()
  where id = target_profile.id;

  update public.account_merge_requests
  set status = 'completed',
      approved_by_admin_id = p_admin_id,
      completed_at = now(),
      reason = coalesce(reason, p_admin_note)
  where id = merge_row.id
  returning * into merge_row;

  insert into public.account_merge_events(merge_request_id, event_type, status_from, status_to, actor_admin_id, metadata)
  values (merge_row.id, 'completed', 'pending', 'completed', p_admin_id, jsonb_build_object('ledgerId', inserted_ledger_id, 'adminNote', p_admin_note));

  insert into public.audit_events(actor_admin_id, actor_profile_id, event_type, metadata)
  values (p_admin_id, target_profile.id, 'account_merge_completed', jsonb_build_object('mergeRequestId', merge_row.id, 'sourceProfileId', source_profile.id));

  return jsonb_build_object('status', 'completed', 'mergeRequestId', merge_row.id, 'targetProfileId', target_profile.id, 'ledgerId', inserted_ledger_id);
end;
$$;

create or replace function public.reject_account_merge_request(
  p_merge_request_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  merge_row public.account_merge_requests%rowtype;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into merge_row
  from public.account_merge_requests
  where id = p_merge_request_id
  for update;

  if merge_row.id is null then
    raise exception 'merge_request_not_found';
  end if;
  if merge_row.status = 'rejected' then
    return jsonb_build_object('status', 'rejected', 'mergeRequestId', merge_row.id, 'replayed', true);
  end if;
  if merge_row.status = 'completed' then
    raise exception 'completed_merge_cannot_be_rejected';
  end if;

  update public.account_merge_requests
  set status = 'rejected',
      approved_by_admin_id = p_admin_id,
      reason = coalesce(p_admin_note, reason)
  where id = merge_row.id
  returning * into merge_row;

  insert into public.account_merge_events(merge_request_id, event_type, status_from, status_to, actor_admin_id, metadata)
  values (merge_row.id, 'rejected', 'pending', 'rejected', p_admin_id, jsonb_build_object('adminNote', p_admin_note));

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (p_admin_id, 'account_merge_rejected', jsonb_build_object('mergeRequestId', merge_row.id));

  return jsonb_build_object('status', 'rejected', 'mergeRequestId', merge_row.id);
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
  address_ok boolean;
  shipping_row public.shipping_requests%rowtype;
  existing_request public.shipping_requests%rowtype;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select exists(select 1 from public.user_addresses ua where ua.id = p_address_id and ua.profile_id = p_profile_id)
  into address_ok;
  if not address_ok then
    raise exception 'valid_shipping_address_required';
  end if;

  select count(distinct item_id) into requested_count
  from unnest(p_collection_item_ids) as item_id;
  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  if p_idempotency_key is not null then
    select * into existing_request
    from public.shipping_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_request.id is not null then
      return jsonb_build_object('status', existing_request.status, 'shippingRequestId', existing_request.id, 'publicCode', existing_request.public_code, 'replayed', true);
    end if;
  end if;

  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
  for update;

  select count(*) into valid_count
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned';

  if valid_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;

  insert into public.shipping_requests(profile_id, address_id, status, customer_note, idempotency_key)
  values (p_profile_id, p_address_id, 'submitted', p_customer_note, p_idempotency_key)
  returning * into shipping_row;

  insert into public.shipping_request_items(shipping_request_id, collection_item_id, card_id)
  select shipping_row.id, ci.id, ci.card_id
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id;

  update public.collection_items
  set status = 'shipping_requested'
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (p_profile_id, 'shipping_submitted', shipping_row.id, jsonb_build_object('item_count', requested_count));

  return jsonb_build_object('status', 'submitted', 'shippingRequestId', shipping_row.id, 'publicCode', shipping_row.public_code, 'itemCount', requested_count);
end;
$$;

revoke all on function public.approve_top_up_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_top_up_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.submit_exchange_order(uuid, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.approve_exchange_order(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.reject_exchange_order(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_account_merge_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_account_merge_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.approve_top_up_request(uuid, uuid, text) to service_role;
grant execute on function public.reject_top_up_request(uuid, uuid, text) to service_role;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
grant execute on function public.submit_exchange_order(uuid, uuid[], text, text) to service_role;
grant execute on function public.approve_exchange_order(uuid, uuid, integer, text) to service_role;
grant execute on function public.reject_exchange_order(uuid, uuid, text) to service_role;
grant execute on function public.complete_account_merge_request(uuid, uuid, text) to service_role;
grant execute on function public.reject_account_merge_request(uuid, uuid, text) to service_role;
grant execute on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) to service_role;

-- RLS and grants.
alter table public.payment_methods enable row level security;
alter table public.top_up_requests enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.account_merge_requests enable row level security;
alter table public.account_merge_events enable row level security;
alter table public.gacha_opens enable row level security;
alter table public.gacha_open_items enable row level security;
alter table public.collection_items enable row level security;
alter table public.exchange_orders enable row level security;
alter table public.exchange_order_items enable row level security;
alter table public.shipping_requests enable row level security;
alter table public.shipping_request_items enable row level security;
alter table public.site_settings enable row level security;
alter table public.ranking_snapshots enable row level security;

grant select on public.payment_methods to anon, authenticated;
grant select on public.top_up_requests, public.wallet_accounts, public.coin_ledger, public.idempotency_keys,
  public.account_merge_requests, public.account_merge_events, public.gacha_opens, public.gacha_open_items,
  public.collection_items, public.exchange_orders, public.exchange_order_items, public.shipping_requests,
  public.shipping_request_items, public.site_settings, public.ranking_snapshots to authenticated;
grant select on public.ranking_snapshots to anon;
grant all on public.payment_methods, public.top_up_requests, public.wallet_accounts, public.coin_ledger,
  public.idempotency_keys, public.account_merge_requests, public.account_merge_events, public.gacha_opens,
  public.gacha_open_items, public.collection_items, public.exchange_orders, public.exchange_order_items,
  public.shipping_requests, public.shipping_request_items, public.site_settings, public.ranking_snapshots to service_role;

drop policy if exists "Public can read active payment methods" on public.payment_methods;
create policy "Public can read active payment methods"
on public.payment_methods
for select
to anon, authenticated
using (is_active or app_private.is_active_admin());

drop policy if exists "Users can read own top ups" on public.top_up_requests;
create policy "Users can read own top ups"
on public.top_up_requests
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own wallet" on public.wallet_accounts;
create policy "Users can read own wallet"
on public.wallet_accounts
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own ledger" on public.coin_ledger;
create policy "Users can read own ledger"
on public.coin_ledger
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own idempotency keys" on public.idempotency_keys;
create policy "Users can read own idempotency keys"
on public.idempotency_keys
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own merge requests" on public.account_merge_requests;
create policy "Users can read own merge requests"
on public.account_merge_requests
for select
to authenticated
using (
  requested_by_profile_id = app_private.current_profile_id()
  or source_profile_id = app_private.current_profile_id()
  or target_profile_id = app_private.current_profile_id()
  or app_private.is_active_admin()
);

drop policy if exists "Users can read own merge events" on public.account_merge_events;
create policy "Users can read own merge events"
on public.account_merge_events
for select
to authenticated
using (
  exists (
    select 1 from public.account_merge_requests mr
    where mr.id = account_merge_events.merge_request_id
      and (
        mr.requested_by_profile_id = app_private.current_profile_id()
        or mr.source_profile_id = app_private.current_profile_id()
        or mr.target_profile_id = app_private.current_profile_id()
        or app_private.is_active_admin()
      )
  )
);

drop policy if exists "Users can read own gacha opens" on public.gacha_opens;
create policy "Users can read own gacha opens"
on public.gacha_opens
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own gacha open items" on public.gacha_open_items;
create policy "Users can read own gacha open items"
on public.gacha_open_items
for select
to authenticated
using (
  exists (
    select 1 from public.gacha_opens go
    where go.id = gacha_open_items.gacha_open_id
      and (go.profile_id = app_private.current_profile_id() or app_private.is_active_admin())
  )
);

drop policy if exists "Users can read own collection" on public.collection_items;
create policy "Users can read own collection"
on public.collection_items
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own exchanges" on public.exchange_orders;
create policy "Users can read own exchanges"
on public.exchange_orders
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own exchange items" on public.exchange_order_items;
create policy "Users can read own exchange items"
on public.exchange_order_items
for select
to authenticated
using (
  exists (
    select 1 from public.exchange_orders eo
    where eo.id = exchange_order_items.exchange_order_id
      and (eo.profile_id = app_private.current_profile_id() or app_private.is_active_admin())
  )
);

drop policy if exists "Users can read own shipping" on public.shipping_requests;
create policy "Users can read own shipping"
on public.shipping_requests
for select
to authenticated
using (profile_id = app_private.current_profile_id() or app_private.is_active_admin());

drop policy if exists "Users can read own shipping items" on public.shipping_request_items;
create policy "Users can read own shipping items"
on public.shipping_request_items
for select
to authenticated
using (
  exists (
    select 1 from public.shipping_requests sr
    where sr.id = shipping_request_items.shipping_request_id
      and (sr.profile_id = app_private.current_profile_id() or app_private.is_active_admin())
  )
);

drop policy if exists "Public can read public rankings" on public.ranking_snapshots;
create policy "Public can read public rankings"
on public.ranking_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can read settings" on public.site_settings;
create policy "Admins can read settings"
on public.site_settings
for select
to authenticated
using (app_private.is_active_admin());

drop policy if exists "Users can read own top up slips" on public.payment_slips;
create policy "Users can read own top up slips"
on public.payment_slips
for select
to authenticated
using (
  app_private.is_active_admin()
  or exists (
    select 1 from public.orders o
    where o.id = payment_slips.order_id
      and o.profile_id = app_private.current_profile_id()
  )
  or exists (
    select 1 from public.top_up_requests tu
    where tu.id = payment_slips.top_up_request_id
      and tu.profile_id = app_private.current_profile_id()
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    perform 1;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'top_up_requests') then
      alter publication supabase_realtime add table public.top_up_requests;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_accounts') then
      alter publication supabase_realtime add table public.wallet_accounts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gacha_opens') then
      alter publication supabase_realtime add table public.gacha_opens;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'collection_items') then
      alter publication supabase_realtime add table public.collection_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exchange_orders') then
      alter publication supabase_realtime add table public.exchange_orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shipping_requests') then
      alter publication supabase_realtime add table public.shipping_requests;
    end if;
  end if;
end;
$$;
