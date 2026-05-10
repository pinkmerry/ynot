-- Phase 3: Prize-level weight + unlock policy
--
-- Adds two columns to draw_round_prizes (the prize template, not the per-unit
-- inventory rows in draw_round_prize_units):
--
--   weight numeric default 1
--     - Used by spin_mode='weighted' and 'inventory_gate'.
--     - Higher weight = more likely to be picked.
--     - 0 = effectively disabled (won't be picked).
--
--   unlock_at_sold_pct numeric default 0
--     - Used by spin_mode='inventory_gate'.
--     - Prize cannot be drawn until this % of total units are claimed.
--     - 0 = available from the start (current behavior).
--     - Range 0-100.
--
-- Defaults preserve today's uniform-pick behavior across all modes.

begin;

alter table public.draw_round_prizes
  add column if not exists weight numeric not null default 1
    check (weight >= 0),
  add column if not exists unlock_at_sold_pct numeric not null default 0
    check (unlock_at_sold_pct >= 0 and unlock_at_sold_pct <= 100);

comment on column public.draw_round_prizes.weight is
  'Relative draw weight for weighted/inventory_gate modes. 0 disables.';
comment on column public.draw_round_prizes.unlock_at_sold_pct is
  'For inventory_gate mode: prize is locked until this % of units are sold.';

-- Index for inventory_gate filtering: WHERE unlock_at_sold_pct <= sold_pct
create index if not exists draw_round_prizes_unlock_idx
  on public.draw_round_prizes(draw_round_id, unlock_at_sold_pct);

commit;
