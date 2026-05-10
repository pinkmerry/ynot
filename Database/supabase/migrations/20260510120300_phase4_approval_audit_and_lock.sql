-- Phase 4: campaign_approvals audit table + lock trigger
--
-- Two things:
--   1. campaign_approvals: append-only log of every workflow action
--      (submit/approve/reject/publish/cancel/edit_config/edit_content).
--   2. draw_rounds_lock_check trigger: once draw_rounds.locked_at is set,
--      spin_mode/spin_config/cost_coins/total_slots/mode/price_thb cannot
--      change. Content fields (titles, images, urls, ends_at) remain
--      editable.
--   3. draw_round_prizes_lock_check trigger: when parent campaign is locked,
--      block updates to weight/unlock_at_sold_pct/rank/tier and block
--      inserts/deletes. Image and label updates are allowed via the same
--      pattern (allowlist below).

begin;

-- 1. Audit table
create table if not exists public.campaign_approvals (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  action text not null check (action in (
    'submitted',
    'approved',
    'rejected',
    'published',
    'cancelled',
    'ended',
    'edited_config',
    'edited_content',
    'reverted_to_draft'
  )),
  actor_admin_id uuid references public.admin_users(id),
  actor_role text check (actor_role in ('owner', 'admin', 'staff')),
  from_status text,
  to_status text,
  notes text,
  payload_diff jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_approvals_round_idx
  on public.campaign_approvals(draw_round_id, created_at desc);
create index if not exists campaign_approvals_actor_idx
  on public.campaign_approvals(actor_admin_id, created_at desc);

alter table public.campaign_approvals enable row level security;

-- Only authenticated admin/owner can read; writes go through SECURITY DEFINER
-- RPCs added in phase 5, so no policy needed for inserts (service_role only).
drop policy if exists campaign_approvals_admin_read on public.campaign_approvals;
create policy campaign_approvals_admin_read on public.campaign_approvals
  for select
  using (
    exists (
      select 1 from public.admin_users au
      where au.profile_id = app_private.current_profile_id()
        and au.is_active
        and au.role in ('owner', 'admin')
    )
  );

-- 2. Lock trigger on draw_rounds
create or replace function app_private.draw_rounds_lock_check()
returns trigger
language plpgsql
as $$
begin
  -- Allow if not locked yet
  if old.locked_at is null then
    return new;
  end if;

  -- After lock: block changes to mechanics fields
  if new.spin_mode is distinct from old.spin_mode then
    raise exception 'cannot_change_spin_mode_after_lock';
  end if;
  if new.spin_config is distinct from old.spin_config then
    raise exception 'cannot_change_spin_config_after_lock';
  end if;
  if new.cost_coins is distinct from old.cost_coins then
    raise exception 'cannot_change_cost_coins_after_lock';
  end if;
  if new.price_thb is distinct from old.price_thb then
    raise exception 'cannot_change_price_thb_after_lock';
  end if;
  if new.total_slots is distinct from old.total_slots then
    raise exception 'cannot_change_total_slots_after_lock';
  end if;
  if new.mode is distinct from old.mode then
    raise exception 'cannot_change_mode_after_lock';
  end if;
  if new.series is distinct from old.series then
    raise exception 'cannot_change_series_after_lock';
  end if;

  -- Block un-locking
  if new.locked_at is null then
    raise exception 'cannot_unlock_campaign';
  end if;

  return new;
end;
$$;

drop trigger if exists draw_rounds_lock_check on public.draw_rounds;
create trigger draw_rounds_lock_check
  before update on public.draw_rounds
  for each row execute function app_private.draw_rounds_lock_check();

-- 3. Lock trigger on draw_round_prizes (template)
create or replace function app_private.draw_round_prizes_lock_check()
returns trigger
language plpgsql
as $$
declare
  v_locked timestamptz;
  v_round_id uuid;
begin
  v_round_id := coalesce(new.draw_round_id, old.draw_round_id);
  select locked_at into v_locked
  from public.draw_rounds where id = v_round_id;

  if v_locked is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'cannot_insert_prize_after_lock';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'cannot_delete_prize_after_lock';
  end if;

  -- UPDATE: block mechanics fields, allow card_id/value_thb/etc.
  if new.weight is distinct from old.weight then
    raise exception 'cannot_change_prize_weight_after_lock';
  end if;
  if new.unlock_at_sold_pct is distinct from old.unlock_at_sold_pct then
    raise exception 'cannot_change_prize_unlock_after_lock';
  end if;
  if new.rank is distinct from old.rank then
    raise exception 'cannot_change_prize_rank_after_lock';
  end if;
  if new.tier is distinct from old.tier then
    raise exception 'cannot_change_prize_tier_after_lock';
  end if;
  if new.draw_round_id is distinct from old.draw_round_id then
    raise exception 'cannot_change_prize_round_after_lock';
  end if;

  return new;
end;
$$;

drop trigger if exists draw_round_prizes_lock_check on public.draw_round_prizes;
create trigger draw_round_prizes_lock_check
  before insert or update or delete on public.draw_round_prizes
  for each row execute function app_private.draw_round_prizes_lock_check();

-- 4. Lock trigger on draw_round_prize_units: cannot insert/delete units after
--    lock; status updates from 'available' -> 'claimed' are allowed (that's
--    how spinning works).
create or replace function app_private.draw_round_prize_units_lock_check()
returns trigger
language plpgsql
as $$
declare
  v_locked timestamptz;
  v_round_id uuid;
begin
  v_round_id := coalesce(new.draw_round_id, old.draw_round_id);
  select locked_at into v_locked
  from public.draw_rounds where id = v_round_id;

  if v_locked is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'cannot_insert_prize_unit_after_lock';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'cannot_delete_prize_unit_after_lock';
  end if;

  -- UPDATE: allow only the runtime award transition. Generic admin APIs must
  -- not void/tamper with locked live inventory after publish.
  if new.draw_round_id is distinct from old.draw_round_id then
    raise exception 'cannot_change_prize_unit_round_after_lock';
  end if;
  if new.draw_round_prize_id is distinct from old.draw_round_prize_id then
    raise exception 'cannot_change_prize_unit_prize_after_lock';
  end if;

  if old.status = 'available' and new.status = 'awarded' then
    if new.card_id is distinct from old.card_id then
      raise exception 'cannot_change_prize_unit_card_after_lock';
    end if;
    if new.profile_id is null
       or new.gacha_open_id is null
       or new.gacha_open_item_id is null
       or new.collection_item_id is null
       or new.awarded_at is null then
      raise exception 'invalid_prize_unit_award_after_lock';
    end if;
    if new.voided_at is distinct from old.voided_at then
      raise exception 'cannot_void_prize_unit_after_lock';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'cannot_change_prize_unit_status_after_lock';
  end if;
  if new.card_id is distinct from old.card_id then
    raise exception 'cannot_change_prize_unit_card_after_lock';
  end if;
  if new.profile_id is distinct from old.profile_id
     or new.gacha_open_id is distinct from old.gacha_open_id
     or new.gacha_open_item_id is distinct from old.gacha_open_item_id
     or new.collection_item_id is distinct from old.collection_item_id
     or new.awarded_at is distinct from old.awarded_at
     or new.voided_at is distinct from old.voided_at then
    raise exception 'cannot_change_prize_unit_claim_metadata_after_lock';
  end if;
  if new.metadata is distinct from old.metadata then
    raise exception 'cannot_change_prize_unit_metadata_after_lock';
  end if;

  return new;
end;
$$;

drop trigger if exists draw_round_prize_units_lock_check on public.draw_round_prize_units;
create trigger draw_round_prize_units_lock_check
  before insert or update or delete on public.draw_round_prize_units
  for each row execute function app_private.draw_round_prize_units_lock_check();

commit;
