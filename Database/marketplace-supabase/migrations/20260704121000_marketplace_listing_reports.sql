-- Community listing reports: buyers flag a live listing; admins resolve by
-- dismissing or unlisting. Listings are never auto-removed by a report.

create table if not exists public.marketplace_listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listing_snapshots(listing_id) on delete cascade,
  reporter_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  reason_code text not null
    check (reason_code in ('fake_or_cert_mismatch', 'stolen_photos', 'wrong_item', 'pricing_abuse', 'other')),
  reason_note text check (reason_note is null or char_length(reason_note) <= 1000),
  report_state text not null default 'open'
    check (report_state in ('open', 'dismissed', 'unlisted')),
  resolved_by_ynot_profile_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listing_reports_state_idx
  on public.marketplace_listing_reports(report_state, created_at desc);
create unique index if not exists marketplace_listing_reports_dedupe_idx
  on public.marketplace_listing_reports(listing_id, reporter_account_id)
  where report_state = 'open';

drop trigger if exists marketplace_listing_reports_touch_updated_at on public.marketplace_listing_reports;
create trigger marketplace_listing_reports_touch_updated_at
before update on public.marketplace_listing_reports
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_listing_reports enable row level security;
revoke all on public.marketplace_listing_reports from public, anon, authenticated;
grant select, insert, update on public.marketplace_listing_reports to service_role;

-- Idempotency dedupe mirrors marketplace_watch_listing (see
-- 20260630133000_marketplace_customer_cart_rpc.sql): this is a
-- customer-initiated action, not an admin one, so it uses the
-- marketplace_idempotency_keys ledger (scope = 'listing.report', keyed by
-- the reporter's ynot_profile_id) rather than marketplace_admin_commands,
-- which requires an actor_admin_role. This is independent of, and layered
-- on top of, the existing (listing_id, reporter_account_id) where
-- report_state = 'open' natural-key dedupe below -- that constraint still
-- owns the business rule "one open report per reporter per listing"; the
-- idempotency ledger owns "a retried request with the same key replays the
-- same response instead of being re-evaluated".
create or replace function public.marketplace_report_listing(
  p_listing_id uuid,
  p_reporter_account_id uuid,
  p_reporter_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_reason_code text,
  p_reason_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_report public.marketplace_listing_reports%rowtype;
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
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
    p_reporter_account_id,
    p_reporter_profile_id,
    'listing.report',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_reporter_profile_id
      and scope = 'listing.report'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  if not exists (
    select 1 from public.marketplace_listing_snapshots
    where listing_id = p_listing_id and listing_state = 'active'
  ) then
    raise exception 'marketplace_listing_not_reportable';
  end if;
  insert into public.marketplace_listing_reports
    (listing_id, reporter_account_id, reason_code, reason_note)
  values (p_listing_id, p_reporter_account_id, p_reason_code, p_reason_note)
  on conflict do nothing
  returning * into v_report;
  if v_report.id is null then
    select * into v_report from public.marketplace_listing_reports
    where listing_id = p_listing_id and reporter_account_id = p_reporter_account_id
      and report_state = 'open';
    if v_report.id is null then
      raise exception 'marketplace_report_not_open';
    end if;
  end if;

  rpc_response_payload := to_jsonb(v_report);

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end $$;

drop function if exists public.marketplace_admin_list_listing_reports(text);

create or replace function public.marketplace_admin_list_listing_reports(
  p_state text default 'open',
  p_limit integer default 100
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.marketplace_listing_reports
    where p_state is null or report_state = p_state
    order by created_at desc
    limit greatest(p_limit, 1)
  ) r;
$$;

-- Idempotency dedupe mirrors marketplace_record_refund_transition (see
-- 20260628130000_marketplace_ops_hardening.sql): insert into the shared
-- marketplace_admin_commands ledger keyed on (actor, command_name,
-- idempotency_key), replay the cached result_payload on a retried request
-- with a matching hash, and reject a reused key whose hash differs. The
-- admin_commands.target_type check constraint predates the reports domain
-- and has no 'report' bucket, so the command is filed under 'listing'
-- (target_id = the reported listing) -- resolving a report is fundamentally
-- an action against that listing, and this keeps the command visible from
-- the listing's audit timeline alongside its other admin actions.
create or replace function public.marketplace_admin_resolve_listing_report(
  p_report_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_resolution text,             -- 'dismissed' | 'unlisted'
  p_resolution_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_report public.marketplace_listing_reports%rowtype;
  command_row public.marketplace_admin_commands%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_resolution not in ('dismissed', 'unlisted') then
    raise exception 'marketplace_report_resolution_invalid';
  end if;
  if p_admin_profile_id is null or p_admin_role is null then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;

  select * into v_report
  from public.marketplace_listing_reports
  where id = p_report_id
  for update;

  if v_report.id is null then
    raise exception 'marketplace_report_not_open';
  end if;

  insert into public.marketplace_admin_commands(
    command_name,
    target_type,
    target_id,
    actor_ynot_profile_id,
    actor_admin_role,
    idempotency_key,
    request_hash,
    command_payload,
    request_id
  ) values (
    'report.resolve',
    'listing',
    v_report.listing_id,
    p_admin_profile_id,
    p_admin_role,
    normalized_idempotency_key,
    normalized_request_hash,
    jsonb_build_object('resolution', p_resolution),
    p_request_id
  )
  on conflict (actor_ynot_profile_id, command_name, idempotency_key) do nothing
  returning * into command_row;

  if command_row.id is null then
    select * into command_row
    from public.marketplace_admin_commands
    where actor_ynot_profile_id = p_admin_profile_id
      and command_name = 'report.resolve'
      and idempotency_key = normalized_idempotency_key;
    if command_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if command_row.result_payload is not null then
      return command_row.result_payload;
    end if;
    raise exception 'marketplace_admin_command_replay_incomplete';
  end if;

  update public.marketplace_listing_reports
     set report_state = p_resolution,
         resolved_by_ynot_profile_id = p_admin_profile_id,
         resolution_note = p_resolution_note,
         resolved_at = now()
   where id = p_report_id and report_state = 'open'
   returning * into v_report;
  if v_report.id is null then
    raise exception 'marketplace_report_not_open';
  end if;
  if p_resolution = 'unlisted' then
    update public.marketplace_listing_snapshots
       set listing_state = 'hidden'
     where listing_id = v_report.listing_id and listing_state = 'active';
  end if;

  rpc_response_payload := to_jsonb(v_report);

  update public.marketplace_admin_commands
  set result_payload = rpc_response_payload
  where id = command_row.id;

  return rpc_response_payload;
end $$;

revoke all on function public.marketplace_report_listing(uuid, uuid, uuid, text, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_list_listing_reports(text, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_resolve_listing_report(uuid, text, text, text, uuid, text, text, text)
from public, anon, authenticated;

grant execute on function public.marketplace_report_listing(uuid, uuid, uuid, text, text, text, text, text)
to service_role;
grant execute on function public.marketplace_admin_list_listing_reports(text, integer)
to service_role;
grant execute on function public.marketplace_admin_resolve_listing_report(uuid, text, text, text, uuid, text, text, text)
to service_role;
