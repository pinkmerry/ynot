create table if not exists public.pending_signup_email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  setup_token_hash text,
  expires_at timestamptz not null,
  setup_expires_at timestamptz,
  attempts smallint not null default 0 check (attempts >= 0),
  resend_count smallint not null default 0 check (resend_count >= 0),
  last_sent_at timestamptz,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  constraint pending_signup_email_codes_email_lowercase
    check (email = lower(email)),
  constraint pending_signup_email_codes_setup_after_verify
    check (setup_token_hash is null or verified_at is not null)
);

create unique index if not exists pending_signup_email_codes_active_email_unique_idx
  on public.pending_signup_email_codes (lower(email))
  where consumed_at is null;

create unique index if not exists pending_signup_email_codes_active_setup_token_unique_idx
  on public.pending_signup_email_codes (setup_token_hash)
  where consumed_at is null and setup_token_hash is not null;

create index if not exists pending_signup_email_codes_expires_at_idx
  on public.pending_signup_email_codes (expires_at);

create index if not exists pending_signup_email_codes_setup_expires_at_idx
  on public.pending_signup_email_codes (setup_expires_at)
  where setup_expires_at is not null;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'touch_updated_at'
  ) then
    drop trigger if exists pending_signup_email_codes_touch_updated_at
      on public.pending_signup_email_codes;
    create trigger pending_signup_email_codes_touch_updated_at
      before update on public.pending_signup_email_codes
      for each row execute function app_private.touch_updated_at();
  end if;
end $$;

alter table public.pending_signup_email_codes enable row level security;

revoke all on table public.pending_signup_email_codes from public;
revoke all on table public.pending_signup_email_codes from anon;
revoke all on table public.pending_signup_email_codes from authenticated;
grant select, insert, update, delete on table public.pending_signup_email_codes to service_role;

create or replace function public.purge_expired_pending_signup_email_codes(
  p_retention interval default interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.pending_signup_email_codes
  where coalesce(consumed_at, setup_expires_at, expires_at) < now() - p_retention
     or (expires_at < now() - p_retention and verified_at is null)
  ;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_pending_signup_email_codes(interval) from public;
revoke all on function public.purge_expired_pending_signup_email_codes(interval) from anon;
revoke all on function public.purge_expired_pending_signup_email_codes(interval) from authenticated;
grant execute on function public.purge_expired_pending_signup_email_codes(interval) to service_role;
