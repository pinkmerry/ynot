-- M2: per-profile session revocation counter.
--
-- The HMAC-signed lucky_draw_session cookie has no per-user revocation lever
-- today — once minted, it's valid for the full 30-day Max-Age. A stolen
-- cookie can only be killed by rotating LINE_SESSION_SECRET (which logs out
-- every user). After this migration, the application signs the current
-- profiles.session_version into each cookie and validates it on read.
-- Incrementing session_version invalidates every existing cookie for that
-- profile without touching anyone else.
--
-- Backward compatibility: existing cookies will not include sessionVersion.
-- The application treats absent sessionVersion as "legacy, accept" so
-- already-logged-in users are not bounced. After the cookie's natural
-- 30-day Max-Age expires, all sessions will have the new field. Operators
-- who need to revoke a specific legacy session immediately can still rotate
-- LINE_SESSION_SECRET as a last resort.

alter table public.profiles
  add column if not exists session_version integer not null default 0;

-- Index small enough to be a non-issue, but added because every signed-cookie
-- read does a lookup by profile id + version compare.
create index if not exists profiles_session_version_idx
  on public.profiles(id, session_version);

-- Admin-only RPC to bump the counter. Marked SECURITY DEFINER so a non-admin
-- caller cannot bypass the admin gate by calling it directly — the function
-- itself checks the caller is an active admin via app_private.is_active_admin.
create or replace function public.revoke_profile_sessions(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  new_version integer;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;

  -- Require the caller to be an active admin in any of the three roles,
  -- OR to be running as service_role (in which case auth.uid() is null
  -- and is_active_admin() returns false, but service_role bypasses RLS by
  -- design). We allow service_role explicitly so server-side maintenance
  -- jobs (e.g. compromised-account response) can revoke without a session.
  if current_setting('role', true) <> 'service_role'
     and not app_private.is_active_admin() then
    raise exception 'admin_access_required';
  end if;

  update public.profiles
  set session_version = session_version + 1
  where id = p_profile_id
  returning session_version into new_version;

  if new_version is null then
    raise exception 'profile_not_found';
  end if;

  insert into public.audit_events(event_type, actor_profile_id, metadata)
  values (
    'profile_sessions_revoked',
    p_profile_id,
    jsonb_build_object('newSessionVersion', new_version)
  );

  return new_version;
end;
$$;

revoke all on function public.revoke_profile_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_profile_sessions(uuid) to service_role;

-- Optional: also expose a read-only helper for the server to fetch the
-- current version without pulling the whole profile row. Useful in hot paths.
create or replace function public.get_profile_session_version(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select session_version from public.profiles where id = p_profile_id
$$;

revoke all on function public.get_profile_session_version(uuid) from public, anon, authenticated;
grant execute on function public.get_profile_session_version(uuid) to service_role;
