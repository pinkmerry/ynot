-- L1: align audit_events.actor_profile_id with its name. The previous
-- definition of revoke_profile_sessions wrote the *target* profile id into
-- actor_profile_id, which made forensic queries like
--   select * from audit_events where actor_profile_id = '...'
-- miss the events the queried profile actually caused. The target moves into
-- metadata.targetProfileId; the caller's profile id is captured via
-- app_private.current_profile_id() (null when invoked by service_role, which
-- is the correct semantic — no human actor).

create or replace function public.revoke_profile_sessions(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  new_version integer;
  caller_profile_id uuid;
  caller_admin_id uuid;
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

  -- Capture caller identity for the audit row. Null when service_role
  -- invokes the function (no human actor).
  caller_profile_id := app_private.current_profile_id();
  select au.id into caller_admin_id
  from public.admin_users au
  where au.profile_id = caller_profile_id
    and au.is_active
  limit 1;

  update public.profiles
  set session_version = session_version + 1
  where id = p_profile_id
  returning session_version into new_version;

  if new_version is null then
    raise exception 'profile_not_found';
  end if;

  insert into public.audit_events(
    event_type,
    actor_profile_id,
    actor_admin_id,
    metadata
  )
  values (
    'profile_sessions_revoked',
    caller_profile_id,
    caller_admin_id,
    jsonb_build_object(
      'targetProfileId', p_profile_id,
      'newSessionVersion', new_version
    )
  );

  return new_version;
end;
$$;

revoke all on function public.revoke_profile_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_profile_sessions(uuid) to service_role;
