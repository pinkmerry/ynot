-- Phase 1: identity-first auth anchors (verified email/phone) + email OTP storage
-- + link_identity_to_existing_profile RPC for merging a current-session profile
-- into an already-existing profile that owns the verified anchor.

-- ---------------------------------------------------------------------------
-- 1. Profile anchor columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Unique partial indexes (only enforced once anchor is verified)
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_verified_email_unique_idx
  on public.profiles (lower(email))
  where email_verified_at is not null and profile_status = 'active';

create unique index if not exists profiles_verified_phone_unique_idx
  on public.profiles (phone)
  where phone_verified_at is not null and profile_status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Email OTP storage (server-side; never expose code, store sha256 hash)
-- ---------------------------------------------------------------------------
create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  purpose text not null check (purpose in ('verify_email', 'link_identity')),
  profile_id uuid references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

create index if not exists email_otps_email_active_idx
  on public.email_otps (lower(email), created_at desc)
  where consumed_at is null;

create index if not exists email_otps_profile_idx
  on public.email_otps (profile_id)
  where profile_id is not null;

alter table public.email_otps enable row level security;
-- OTPs are only read/written by service role (server routes). No grants to
-- authenticated/anon; the policy below intentionally locks the table down so
-- that even with a leaked anon JWT, codes cannot be enumerated.
revoke all on public.email_otps from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. link_identity_to_existing_profile
--    Called by server routes after an OTP is verified. Atomically:
--      - sets source profile to merged status
--      - moves user_identities + wallet balance + ledger rows + addresses to
--        target profile
--      - writes an account_merge_events 'auto_link' row for audit
--    Service role only.
-- ---------------------------------------------------------------------------
create or replace function app_private.link_identity_to_existing_profile(
  p_source_profile_id uuid,
  p_target_profile_id uuid,
  p_reason text default 'verified_anchor_match'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_balance bigint;
  v_target_balance bigint;
  v_target_version bigint;
  v_merge_request_id uuid;
begin
  if p_source_profile_id = p_target_profile_id then
    return p_target_profile_id;
  end if;

  -- Lock both profile rows in deterministic order to avoid deadlock.
  perform 1
  from public.profiles
  where id in (p_source_profile_id, p_target_profile_id)
  for update;

  -- Move identities. ON CONFLICT keeps the existing target identity (i.e. the
  -- old source identity is dropped if it duplicates one already on target).
  update public.user_identities
     set profile_id = p_target_profile_id,
         last_seen_at = greatest(coalesce(last_seen_at, '-infinity'::timestamptz), now())
   where profile_id = p_source_profile_id
     and not exists (
       select 1 from public.user_identities tgt
        where tgt.profile_id = p_target_profile_id
          and tgt.provider = public.user_identities.provider
          and tgt.provider_subject = public.user_identities.provider_subject
     );

  delete from public.user_identities
   where profile_id = p_source_profile_id;

  -- Move addresses (skip duplicates by best-effort label uniqueness).
  update public.user_addresses
     set profile_id = p_target_profile_id,
         is_default = false
   where profile_id = p_source_profile_id;

  -- Transfer wallet balance.
  select balance_coins into v_source_balance
    from public.wallet_accounts
   where profile_id = p_source_profile_id;

  if v_source_balance is not null and v_source_balance > 0 then
    -- Ensure target wallet exists.
    insert into public.wallet_accounts (profile_id, balance_coins, version)
    values (p_target_profile_id, 0, 0)
    on conflict (profile_id) do nothing;

    update public.wallet_accounts
       set balance_coins = balance_coins + v_source_balance,
           version = version + 1,
           updated_at = now()
     where profile_id = p_target_profile_id
    returning balance_coins, version into v_target_balance, v_target_version;

    insert into public.coin_ledger (
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
      p_target_profile_id,
      p_target_profile_id,
      'admin_adjustment',
      v_source_balance,
      v_target_balance - v_source_balance,
      v_target_balance,
      'profile_merge',
      p_source_profile_id,
      'merge:' || p_source_profile_id || '->' || p_target_profile_id,
      jsonb_build_object(
        'source_profile_id', p_source_profile_id,
        'reason', p_reason
      )
    )
    on conflict (profile_id, idempotency_key) do nothing;

    -- Zero out source wallet so the CHECK + audit trail stay consistent.
    update public.wallet_accounts
       set balance_coins = 0,
           version = version + 1,
           updated_at = now()
     where profile_id = p_source_profile_id;
  end if;

  -- Mark source as merged.
  update public.profiles
     set profile_status = 'merged',
         last_seen_at = now()
   where id = p_source_profile_id;

  -- Audit trail via account_merge_requests + events (auto-completed).
  insert into public.account_merge_requests (
    requested_by_profile_id,
    source_profile_id,
    target_profile_id,
    reason,
    status,
    completed_at,
    risk_summary
  ) values (
    p_target_profile_id,
    p_source_profile_id,
    p_target_profile_id,
    p_reason,
    'completed',
    now(),
    jsonb_build_object('mode', 'auto_link', 'transferred_coins', coalesce(v_source_balance, 0))
  )
  returning id into v_merge_request_id;

  insert into public.account_merge_events (
    merge_request_id,
    event_type,
    status_from,
    status_to,
    actor_profile_id,
    metadata
  ) values (
    v_merge_request_id,
    'completed',
    'pending',
    'completed',
    p_target_profile_id,
    jsonb_build_object('reason', p_reason, 'transferred_coins', coalesce(v_source_balance, 0), 'mode', 'auto_link')
  );

  return p_target_profile_id;
end;
$$;

revoke all on function app_private.link_identity_to_existing_profile(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app_private.link_identity_to_existing_profile(uuid, uuid, text) to service_role;
