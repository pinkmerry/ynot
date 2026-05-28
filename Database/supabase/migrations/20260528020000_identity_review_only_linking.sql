-- Identity review only linking.
--
-- Account merging is intentionally disabled: approving a provider conflict may
-- move only the conflicting user_identities row. Financial balances, ledgers,
-- orders, collection items, shipping, addresses, admin rows, and profile status
-- must stay with their original profile.

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
begin
  raise exception 'account_merge_disabled_use_identity_review';
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
begin
  raise exception 'account_merge_disabled_use_identity_review';
end;
$$;

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
begin
  raise exception 'account_merge_disabled_use_identity_review';
end;
$$;

create or replace function public.approve_identity_review_request(
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
  identity_row public.user_identities%rowtype;
  admin_is_active boolean;
  identity_id uuid;
  review_provider text;
  review_subject text;
  previous_profile_id uuid;
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
    raise exception 'identity_review_request_not_found';
  end if;
  if merge_row.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'mergeRequestId', merge_row.id, 'replayed', true);
  end if;
  if merge_row.status <> 'pending' then
    raise exception 'identity_review_request_not_approvable';
  end if;

  select * into source_profile
  from public.profiles
  where id = merge_row.source_profile_id
  for update;

  select * into target_profile
  from public.profiles
  where id = merge_row.target_profile_id
  for update;

  if source_profile.id is null or target_profile.id is null then
    raise exception 'identity_review_profiles_not_found';
  end if;
  if source_profile.id = target_profile.id then
    raise exception 'identity_review_profiles_must_differ';
  end if;

  review_provider := nullif(merge_row.risk_summary->>'provider', '');
  review_subject := nullif(merge_row.risk_summary->>'providerSubject', '');
  if nullif(merge_row.risk_summary->>'identityId', '') is not null then
    identity_id := (merge_row.risk_summary->>'identityId')::uuid;
  end if;

  if identity_id is not null then
    select * into identity_row
    from public.user_identities
    where id = identity_id
    for update;
  elsif review_provider is not null and review_subject is not null then
    select * into identity_row
    from public.user_identities
    where profile_id = source_profile.id
      and provider = review_provider
      and provider_subject = review_subject
    for update;
  else
    raise exception 'identity_review_identity_metadata_required';
  end if;

  if identity_row.id is null then
    raise exception 'identity_review_identity_not_found';
  end if;
  if identity_row.profile_id <> source_profile.id then
    raise exception 'identity_review_source_mismatch';
  end if;
  if review_provider is not null and identity_row.provider <> review_provider then
    raise exception 'identity_review_provider_mismatch';
  end if;
  if review_subject is not null and identity_row.provider_subject <> review_subject then
    raise exception 'identity_review_subject_mismatch';
  end if;
  if exists (
    select 1
    from public.user_identities existing_target_identity
    where existing_target_identity.profile_id = target_profile.id
      and existing_target_identity.provider = identity_row.provider
      and existing_target_identity.provider_subject = identity_row.provider_subject
      and existing_target_identity.id <> identity_row.id
  ) then
    raise exception 'identity_review_target_identity_already_exists';
  end if;

  previous_profile_id := identity_row.profile_id;

  update public.user_identities
  set profile_id = target_profile.id,
      auth_user_id = coalesce(identity_row.auth_user_id, target_profile.auth_user_id),
      last_seen_at = now(),
      metadata = coalesce(identity_row.metadata, '{}'::jsonb) || jsonb_build_object(
        'identityReviewRequestId', merge_row.id,
        'identityReviewApprovedAt', now(),
        'previousProfileId', previous_profile_id,
        'approvedByAdminId', p_admin_id
      )
  where id = identity_row.id
  returning * into identity_row;

  update public.account_merge_requests
  set status = 'completed',
      approved_by_admin_id = p_admin_id,
      completed_at = now(),
      reason = coalesce(p_admin_note, reason),
      risk_summary = risk_summary || jsonb_build_object(
        'mode', 'identity_review_only',
        'approvedIdentityId', identity_row.id,
        'previousProfileId', previous_profile_id,
        'targetProfileId', target_profile.id
      )
  where id = merge_row.id
  returning * into merge_row;

  insert into public.account_merge_events(merge_request_id, event_type, status_from, status_to, actor_admin_id, metadata)
  values (
    merge_row.id,
    'completed',
    'pending',
    'completed',
    p_admin_id,
    jsonb_build_object(
      'mode', 'identity_review_only',
      'identityId', identity_row.id,
      'provider', identity_row.provider,
      'providerSubject', identity_row.provider_subject,
      'sourceProfileId', previous_profile_id,
      'targetProfileId', target_profile.id,
      'adminNote', p_admin_note
    )
  );

  insert into public.audit_events(actor_admin_id, actor_profile_id, event_type, metadata)
  values (
    p_admin_id,
    target_profile.id,
    'identity_review_approved',
    jsonb_build_object(
      'mergeRequestId', merge_row.id,
      'identityId', identity_row.id,
      'sourceProfileId', previous_profile_id,
      'targetProfileId', target_profile.id
    )
  );

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'identity_review_only',
    'mergeRequestId', merge_row.id,
    'identityId', identity_row.id,
    'sourceProfileId', previous_profile_id,
    'targetProfileId', target_profile.id
  );
end;
$$;

create or replace function public.reject_identity_review_request(
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
    raise exception 'identity_review_request_not_found';
  end if;
  if merge_row.status = 'rejected' then
    return jsonb_build_object('status', 'rejected', 'mergeRequestId', merge_row.id, 'replayed', true);
  end if;
  if merge_row.status = 'completed' then
    raise exception 'completed_identity_review_cannot_be_rejected';
  end if;

  update public.account_merge_requests
  set status = 'rejected',
      approved_by_admin_id = p_admin_id,
      completed_at = now(),
      reason = coalesce(p_admin_note, reason),
      risk_summary = risk_summary || jsonb_build_object('mode', 'identity_review_only')
  where id = merge_row.id
  returning * into merge_row;

  insert into public.account_merge_events(merge_request_id, event_type, status_from, status_to, actor_admin_id, metadata)
  values (
    merge_row.id,
    'rejected',
    'pending',
    'rejected',
    p_admin_id,
    jsonb_build_object('mode', 'identity_review_only', 'adminNote', p_admin_note)
  );

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id,
    'identity_review_rejected',
    jsonb_build_object('mergeRequestId', merge_row.id)
  );

  return jsonb_build_object('status', 'rejected', 'mode', 'identity_review_only', 'mergeRequestId', merge_row.id);
end;
$$;

revoke all on function public.complete_account_merge_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_account_merge_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.approve_identity_review_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_identity_review_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.link_identity_to_existing_profile(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.complete_account_merge_request(uuid, uuid, text) to service_role;
grant execute on function public.reject_account_merge_request(uuid, uuid, text) to service_role;
grant execute on function public.approve_identity_review_request(uuid, uuid, text) to service_role;
grant execute on function public.reject_identity_review_request(uuid, uuid, text) to service_role;
grant execute on function app_private.link_identity_to_existing_profile(uuid, uuid, text) to service_role;
