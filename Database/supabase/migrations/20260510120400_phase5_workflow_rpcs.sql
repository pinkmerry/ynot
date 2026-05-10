-- Phase 5: Approval workflow RPCs
--
-- All callable from API routes via service-role. Each function:
--   - takes p_admin_id (admin_users.id) explicitly (caller resolves it)
--   - validates the admin's role + is_active
--   - validates state transition
--   - performs the update
--   - inserts a campaign_approvals audit row
--
-- Functions raise on failure with stable error codes (e.g. 'forbidden_role',
-- 'invalid_state'). Callers map these to HTTP responses.
--
-- Allowed transitions:
--   draft           -> pending_approval        (admin or owner; owner-of-draft)
--   pending_approval-> approved | rejected     (owner only)
--   approved        -> live | draft (revert)   (owner only; revert if config edited)
--   live            -> ended | cancelled       (owner only)
--   pending_approval-> cancelled               (owner only)
--   approved        -> cancelled               (owner only)

begin;

-- Helper: assert admin is active and return role
create or replace function app_private.assert_admin_role(
  p_admin_id uuid,
  p_required_roles text[]
) returns text
language plpgsql
security invoker
as $$
declare
  v_role text;
  v_active boolean;
begin
  select role, is_active into v_role, v_active
  from public.admin_users where id = p_admin_id;

  if v_role is null then
    raise exception 'admin_not_found';
  end if;
  if not v_active then
    raise exception 'admin_inactive';
  end if;
  if not (v_role = any(p_required_roles)) then
    raise exception 'forbidden_role';
  end if;
  return v_role;
end;
$$;

-- ---- submit_campaign_for_approval -----------------------------------------
create or replace function public.submit_campaign_for_approval(
  p_admin_id uuid,
  p_round_id uuid
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_round public.draw_rounds%rowtype;
begin
  v_role := app_private.assert_admin_role(p_admin_id, array['owner', 'admin']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status <> 'draft' then raise exception 'invalid_state'; end if;

  -- Admins (non-owner) can only submit drafts they created
  if v_role = 'admin' and v_round.created_by is distinct from p_admin_id then
    raise exception 'not_draft_owner';
  end if;

  update public.draw_rounds
  set status = 'pending_approval',
      submitted_for_approval_at = now(),
      submitted_by = p_admin_id,
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status
  ) values (
    p_round_id, 'submitted', p_admin_id, v_role,
    'draft', 'pending_approval'
  );
end;
$$;

-- ---- approve_campaign (owner only) ----------------------------------------
create or replace function public.approve_campaign(
  p_admin_id uuid,
  p_round_id uuid,
  p_notes text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_round public.draw_rounds%rowtype;
begin
  perform app_private.assert_admin_role(p_admin_id, array['owner']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status <> 'pending_approval' then raise exception 'invalid_state'; end if;

  update public.draw_rounds
  set status = 'approved',
      approved_at = now(),
      approved_by = p_admin_id,
      rejected_at = null,
      rejected_by = null,
      rejection_reason = null,
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status, notes
  ) values (
    p_round_id, 'approved', p_admin_id, 'owner',
    'pending_approval', 'approved', p_notes
  );
end;
$$;

-- ---- reject_campaign (owner only) -----------------------------------------
create or replace function public.reject_campaign(
  p_admin_id uuid,
  p_round_id uuid,
  p_reason text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_round public.draw_rounds%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'rejection_reason_required';
  end if;
  perform app_private.assert_admin_role(p_admin_id, array['owner']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status <> 'pending_approval' then raise exception 'invalid_state'; end if;

  update public.draw_rounds
  set status = 'draft',
      rejected_at = now(),
      rejected_by = p_admin_id,
      rejection_reason = p_reason,
      submitted_for_approval_at = null,
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status, notes
  ) values (
    p_round_id, 'rejected', p_admin_id, 'owner',
    'pending_approval', 'draft', p_reason
  );
end;
$$;

-- ---- publish_campaign (owner only) ----------------------------------------
-- Validates that:
--   - status = 'approved'
--   - spin_config shape matches spin_mode (basic check, expand later)
--   - inventory exists for inventory_gate / weighted (>= 1 prize unit available)
-- Sets locked_at = now() so triggers from phase 4 take effect.
create or replace function public.publish_campaign(
  p_admin_id uuid,
  p_round_id uuid
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_round public.draw_rounds%rowtype;
  v_unit_count integer;
  v_band jsonb;
begin
  perform app_private.assert_admin_role(p_admin_id, array['owner']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status <> 'approved' then raise exception 'invalid_state'; end if;

  -- Validate spin_config shape
  if v_round.spin_mode = 'pure_random' then
    -- empty object accepted; nothing to validate
    null;
  elsif v_round.spin_mode = 'weighted' then
    -- weight lives on prize rows; ensure at least one prize has weight > 0
    if not exists (
      select 1 from public.draw_round_prizes
      where draw_round_id = p_round_id and weight > 0
    ) then
      raise exception 'no_prizes_with_weight';
    end if;
  elsif v_round.spin_mode = 'inventory_gate' then
    if not (v_round.spin_config ? 'bands' and jsonb_typeof(v_round.spin_config->'bands') = 'array') then
      raise exception 'invalid_spin_config_bands_required';
    end if;
    -- Each band must have rankStart, rankEnd, unlockAtSoldPct
    for v_band in select * from jsonb_array_elements(v_round.spin_config->'bands') loop
      if not (v_band ? 'rankStart' and v_band ? 'rankEnd' and v_band ? 'unlockAtSoldPct') then
        raise exception 'invalid_spin_config_band_missing_fields';
      end if;
      if (v_band->>'unlockAtSoldPct')::numeric < 0
         or (v_band->>'unlockAtSoldPct')::numeric > 100 then
        raise exception 'invalid_spin_config_unlock_pct_range';
      end if;
    end loop;
  end if;

  -- For instant_gacha mode: must have at least one prize unit available
  if v_round.mode = 'instant_gacha' then
    select count(*) into v_unit_count
    from public.draw_round_prize_units
    where draw_round_id = p_round_id and status = 'available';
    if v_unit_count = 0 then
      raise exception 'no_available_prize_units';
    end if;
  end if;

  update public.draw_rounds
  set status = 'live',
      published_at = now(),
      published_by = p_admin_id,
      locked_at = now(),
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status
  ) values (
    p_round_id, 'published', p_admin_id, 'owner',
    'approved', 'live'
  );
end;
$$;

-- ---- cancel_campaign (owner only) -----------------------------------------
create or replace function public.cancel_campaign(
  p_admin_id uuid,
  p_round_id uuid,
  p_reason text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_round public.draw_rounds%rowtype;
begin
  perform app_private.assert_admin_role(p_admin_id, array['owner']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status not in ('pending_approval', 'approved', 'live') then
    raise exception 'invalid_state';
  end if;

  update public.draw_rounds
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_admin_id,
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status, notes
  ) values (
    p_round_id, 'cancelled', p_admin_id, 'owner',
    v_round.status, 'cancelled', p_reason
  );
end;
$$;

-- ---- end_campaign (owner only) --------------------------------------------
create or replace function public.end_campaign(
  p_admin_id uuid,
  p_round_id uuid
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_round public.draw_rounds%rowtype;
begin
  perform app_private.assert_admin_role(p_admin_id, array['owner']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.status <> 'live' then raise exception 'invalid_state'; end if;

  update public.draw_rounds
  set status = 'ended',
      ended_at = now(),
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status
  ) values (
    p_round_id, 'ended', p_admin_id, 'owner',
    'live', 'ended'
  );
end;
$$;

-- ---- update_campaign_spin_config (admin if draft, owner if approved) ------
-- Editing config when status='approved' auto-reverts to 'draft' (forces
-- re-approval), per design.
create or replace function public.update_campaign_spin_config(
  p_admin_id uuid,
  p_round_id uuid,
  p_spin_mode text,
  p_spin_config jsonb
) returns text  -- returns new status
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_round public.draw_rounds%rowtype;
  v_new_status text;
  v_action text;
begin
  v_role := app_private.assert_admin_role(p_admin_id, array['owner', 'admin']);

  select * into v_round from public.draw_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'campaign_not_found'; end if;
  if v_round.locked_at is not null then raise exception 'campaign_locked'; end if;
  if v_round.status not in ('draft', 'pending_approval', 'approved') then
    raise exception 'invalid_state';
  end if;

  if p_spin_mode not in ('pure_random', 'weighted', 'inventory_gate') then
    raise exception 'invalid_spin_mode';
  end if;

  -- Admin (non-owner) can only edit drafts they created.
  -- Owners may edit approved/pending config; that reverts to draft below.
  if v_role = 'admin'
     and (v_round.status <> 'draft' or v_round.created_by is distinct from p_admin_id) then
    raise exception 'not_draft_owner';
  end if;

  -- If editing while approved/pending, revert to draft (forces re-approval)
  if v_round.status in ('approved', 'pending_approval') then
    v_new_status := 'draft';
    v_action := 'reverted_to_draft';
  else
    v_new_status := v_round.status;
    v_action := 'edited_config';
  end if;

  update public.draw_rounds
  set spin_mode = p_spin_mode,
      spin_config = p_spin_config,
      status = v_new_status,
      submitted_for_approval_at = case when v_new_status = 'draft' then null else submitted_for_approval_at end,
      approved_at = case when v_new_status = 'draft' then null else approved_at end,
      approved_by = case when v_new_status = 'draft' then null else approved_by end,
      updated_at = now()
  where id = p_round_id;

  insert into public.campaign_approvals(
    draw_round_id, action, actor_admin_id, actor_role,
    from_status, to_status,
    payload_diff
  ) values (
    p_round_id, v_action, p_admin_id, v_role,
    v_round.status, v_new_status,
    jsonb_build_object(
      'spin_mode', jsonb_build_object('from', v_round.spin_mode, 'to', p_spin_mode),
      'spin_config', jsonb_build_object('from', v_round.spin_config, 'to', p_spin_config)
    )
  );

  return v_new_status;
end;
$$;

-- Permissions: only service_role
revoke all on function public.submit_campaign_for_approval(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.publish_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.end_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_campaign_spin_config(uuid, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.submit_campaign_for_approval(uuid, uuid) to service_role;
grant execute on function public.approve_campaign(uuid, uuid, text) to service_role;
grant execute on function public.reject_campaign(uuid, uuid, text) to service_role;
grant execute on function public.publish_campaign(uuid, uuid) to service_role;
grant execute on function public.cancel_campaign(uuid, uuid, text) to service_role;
grant execute on function public.end_campaign(uuid, uuid) to service_role;
grant execute on function public.update_campaign_spin_config(uuid, uuid, text, jsonb) to service_role;

commit;
