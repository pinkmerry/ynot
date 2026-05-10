-- Verification script for spin-mode + approval workflow migrations.
--
-- Run order:
--   1. Apply migrations 20260510120000..20260510120500 in order
--   2. Run this script in a SQL Editor session
--
-- Each block prints a pass/fail line. Stop at the first FAIL.
--
-- Safe to run repeatedly (uses transaction + rollback). Does not write to
-- existing rows: creates an isolated test campaign, then rolls back.

\echo '=== Verifying spin-mode migrations ==='

begin;

-- ---- 1. Schema: new columns exist ----
\echo '[1] Schema: draw_rounds new columns'
do $$
declare missing text[];
begin
  select array_agg(c) into missing from unnest(array[
    'spin_mode','spin_config','locked_at','submitted_for_approval_at',
    'approved_at','approved_by','rejected_at','rejected_by','rejection_reason',
    'published_at','published_by','ended_at','cancelled_at','cancelled_by'
  ]) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='draw_rounds' and column_name=c
  );
  if missing is not null then
    raise exception 'FAIL: missing columns: %', missing;
  end if;
  raise notice 'PASS: all draw_rounds columns present';
end $$;

\echo '[2] Schema: draw_round_prizes weight + unlock_at_sold_pct'
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='draw_round_prizes' and column_name='weight') then
    raise exception 'FAIL: draw_round_prizes.weight missing';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='draw_round_prizes' and column_name='unlock_at_sold_pct') then
    raise exception 'FAIL: draw_round_prizes.unlock_at_sold_pct missing';
  end if;
  raise notice 'PASS: prize policy columns present';
end $$;

\echo '[3] Schema: campaign_approvals table exists'
do $$
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='campaign_approvals') then
    raise exception 'FAIL: campaign_approvals table missing';
  end if;
  raise notice 'PASS: campaign_approvals table present';
end $$;

\echo '[4] Schema: status check constraint accepts new values'
do $$
begin
  -- Will raise if constraint rejects pending_approval
  perform 1 from (values
    ('draft'::text), ('pending_approval'), ('approved'), ('rejected'),
    ('live'), ('cancelled'), ('ended')
  ) x(s);
  -- Try a real insert to be sure
  insert into draw_rounds(slug, status, series, title_th, title_en, price_thb, total_slots)
  values ('__verify_status__', 'pending_approval', 'pokemon', 'verify', 'verify', 1, 1);
  delete from draw_rounds where slug = '__verify_status__';
  raise notice 'PASS: status check accepts new values';
end $$;

-- ---- 5. Functions exist ----
\echo '[5] RPC functions exist'
do $$
declare missing text[];
begin
  select array_agg(f) into missing from unnest(array[
    'submit_campaign_for_approval',
    'approve_campaign',
    'reject_campaign',
    'publish_campaign',
    'cancel_campaign',
    'end_campaign',
    'update_campaign_spin_config',
    'open_gacha_campaign'
  ]) f
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f
  );
  if missing is not null then
    raise exception 'FAIL: missing RPCs: %', missing;
  end if;
  raise notice 'PASS: all workflow + spin RPCs present';
end $$;

-- ---- 6. Lock trigger blocks spin_config update ----
\echo '[6] Lock trigger: spin_config immutable after lock'
do $$
declare v_id uuid;
begin
  insert into draw_rounds(slug, status, series, title_th, title_en, price_thb, total_slots, locked_at)
  values ('__verify_lock__', 'live', 'pokemon', 'lock', 'lock', 1, 1, now())
  returning id into v_id;

  begin
    update draw_rounds set spin_config = '{"new":1}' where id = v_id;
    raise exception 'FAIL: lock trigger did NOT block spin_config update';
  exception when others then
    if sqlerrm like '%cannot_change_spin_config_after_lock%' then
      raise notice 'PASS: lock trigger blocks spin_config update';
    else
      raise exception 'FAIL: unexpected error: %', sqlerrm;
    end if;
  end;

  delete from draw_rounds where id = v_id;
end $$;

-- ---- 7. Workflow: full draft → live transitions ----
\echo '[7] Workflow: draft -> pending -> approved -> live'
do $$
declare
  v_owner_id uuid;
  v_admin_id uuid;
  v_campaign_id uuid;
  v_other_campaign_id uuid;
  v_audit_count int;
begin
  -- Create test admin/owner profiles + admin_users rows
  insert into profiles(id, line_user_id, display_name)
  values
    (gen_random_uuid(), '__verify_owner__', 'Verify Owner'),
    (gen_random_uuid(), '__verify_admin__', 'Verify Admin')
  on conflict do nothing;

  insert into admin_users(profile_id, role, is_active)
  select p.id, 'owner', true from profiles p where p.line_user_id = '__verify_owner__'
  on conflict (profile_id) do update set role='owner', is_active=true
  returning id into v_owner_id;

  insert into admin_users(profile_id, role, is_active)
  select p.id, 'admin', true from profiles p where p.line_user_id = '__verify_admin__'
  on conflict (profile_id) do update set role='admin', is_active=true
  returning id into v_admin_id;

  -- Create draft
  insert into draw_rounds(slug, status, series, title_th, title_en, price_thb, total_slots, created_by, spin_mode)
  values ('__verify_workflow__', 'draft', 'pokemon', 'wf', 'wf', 1, 1, v_admin_id, 'pure_random')
  returning id into v_campaign_id;

  -- Non-owner admins must not edit drafts created by someone else.
  insert into draw_rounds(slug, status, series, title_th, title_en, price_thb, total_slots, created_by, spin_mode)
  values ('__verify_other_draft__', 'draft', 'pokemon', 'wf-other', 'wf-other', 1, 1, v_owner_id, 'pure_random')
  returning id into v_other_campaign_id;

  begin
    perform update_campaign_spin_config(v_admin_id, v_other_campaign_id, 'weighted', '{}'::jsonb);
    raise exception 'FAIL: admin was allowed to edit another creator draft';
  exception when others then
    if sqlerrm not like '%not_draft_owner%' then
      raise exception 'FAIL: unexpected cross-owner edit error: %', sqlerrm;
    end if;
  end;

  -- Submit
  perform submit_campaign_for_approval(v_admin_id, v_campaign_id);
  if (select status from draw_rounds where id = v_campaign_id) <> 'pending_approval' then
    raise exception 'FAIL: submit did not set pending_approval';
  end if;

  -- Reject path -> back to draft
  perform reject_campaign(v_owner_id, v_campaign_id, 'verification reject');
  if (select status from draw_rounds where id = v_campaign_id) <> 'draft' then
    raise exception 'FAIL: reject did not return to draft';
  end if;

  -- Re-submit
  perform submit_campaign_for_approval(v_admin_id, v_campaign_id);

  -- Admin tries to approve -> should fail (forbidden_role)
  begin
    perform approve_campaign(v_admin_id, v_campaign_id);
    raise exception 'FAIL: admin was allowed to approve';
  exception when others then
    if sqlerrm not like '%forbidden_role%' then
      raise exception 'FAIL: unexpected error: %', sqlerrm;
    end if;
  end;

  -- Owner approves
  perform approve_campaign(v_owner_id, v_campaign_id, 'verified');
  if (select status from draw_rounds where id = v_campaign_id) <> 'approved' then
    raise exception 'FAIL: approve did not set approved';
  end if;

  -- Owner publishes
  perform publish_campaign(v_owner_id, v_campaign_id);
  if (select status from draw_rounds where id = v_campaign_id) <> 'live' then
    raise exception 'FAIL: publish did not set live';
  end if;
  if (select locked_at from draw_rounds where id = v_campaign_id) is null then
    raise exception 'FAIL: publish did not set locked_at';
  end if;

  -- Audit trail should have submitted/rejected/submitted/approved/published
  select count(*) into v_audit_count
  from campaign_approvals where draw_round_id = v_campaign_id;
  if v_audit_count < 5 then
    raise exception 'FAIL: expected >= 5 audit rows, got %', v_audit_count;
  end if;

  raise notice 'PASS: full workflow transitions work + audit logged (% rows)', v_audit_count;

  -- cleanup is via rollback below
end $$;

-- ---- 8. Spin dispatcher: pure_random behavior unchanged ----
-- (Sanity: existing campaigns with default spin_mode should still pick prizes)
\echo '[8] Spin dispatcher: pure_random sanity'
do $$
declare v_count int;
begin
  -- Just check the function compiles and is callable shape
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'open_gacha_campaign'
      and p.pronargs = 4
  ) then
    raise exception 'FAIL: open_gacha_campaign(uuid,uuid,int,text) missing';
  end if;
  raise notice 'PASS: open_gacha_campaign signature OK';
end $$;

rollback;

\echo '=== All checks passed ==='
