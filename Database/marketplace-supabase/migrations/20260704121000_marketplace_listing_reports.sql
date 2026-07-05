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

create or replace function public.marketplace_report_listing(
  p_listing_id uuid,
  p_reporter_account_id uuid,
  p_reason_code text,
  p_reason_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_report public.marketplace_listing_reports%rowtype;
begin
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
  return to_jsonb(v_report);
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

create or replace function public.marketplace_admin_resolve_listing_report(
  p_report_id uuid,
  p_resolution text,             -- 'dismissed' | 'unlisted'
  p_admin_profile_id uuid,
  p_resolution_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_report public.marketplace_listing_reports%rowtype;
begin
  if p_resolution not in ('dismissed', 'unlisted') then
    raise exception 'marketplace_report_resolution_invalid';
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
  return to_jsonb(v_report);
end $$;

revoke all on function public.marketplace_report_listing(uuid, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_list_listing_reports(text, integer)
from public, anon, authenticated;
revoke all on function public.marketplace_admin_resolve_listing_report(uuid, text, uuid, text)
from public, anon, authenticated;

grant execute on function public.marketplace_report_listing(uuid, uuid, text, text)
to service_role;
grant execute on function public.marketplace_admin_list_listing_reports(text, integer)
to service_role;
grant execute on function public.marketplace_admin_resolve_listing_report(uuid, text, uuid, text)
to service_role;
