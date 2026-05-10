-- Phase 1: Campaign lifecycle columns + widened status enum
--
-- Adds approval-workflow columns to draw_rounds. Pure additive: no behavior
-- changes for existing live campaigns. The lock trigger that enforces
-- spin-config immutability is added in a later phase, after spin_mode columns
-- exist.
--
-- Strategy:
--   - widen status check to include pending_approval/approved/rejected/cancelled/ended
--   - keep legacy values 'closed' and 'archived' so existing rows remain valid
--   - backfill status='live' rows with published_at = locked_at = created_at
--     so once the future trigger ships, those rows are already in their final
--     locked state (spin_config will default to {} which is valid for the
--     default spin_mode 'pure_random' added in phase 2)

begin;

-- 1. Drop old check constraint
alter table public.draw_rounds
  drop constraint if exists draw_rounds_status_check;

-- 2. Add wider check (legacy values kept as aliases)
alter table public.draw_rounds
  add constraint draw_rounds_status_check
  check (status in (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'live',
    'cancelled',
    'ended',
    -- legacy values kept for backward compatibility:
    'closed',
    'archived'
  ));

-- 3. Add lifecycle columns
alter table public.draw_rounds
  add column if not exists submitted_for_approval_at timestamptz,
  add column if not exists submitted_by uuid references public.admin_users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.admin_users(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.admin_users(id),
  add column if not exists rejection_reason text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.admin_users(id),
  add column if not exists locked_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.admin_users(id);

-- 4. Backfill: existing live/closed/archived rounds are considered already
--    published and locked. We use created_at as a best-effort timestamp.
update public.draw_rounds
set
  published_at = coalesce(published_at, created_at),
  locked_at    = coalesce(locked_at, created_at)
where status in ('live', 'closed', 'archived');

-- 5. Helpful indexes for admin queue queries
create index if not exists draw_rounds_status_idx
  on public.draw_rounds(status, created_at desc);

create index if not exists draw_rounds_pending_approval_idx
  on public.draw_rounds(submitted_for_approval_at desc)
  where status = 'pending_approval';

commit;
