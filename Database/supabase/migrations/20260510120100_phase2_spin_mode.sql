-- Phase 2: Spin mode + spin config on draw_rounds
--
-- Adds two columns that decide how prizes are drawn for a campaign. The
-- columns are read by the gacha-open RPC at draw time; client never sees them.
--
-- Modes:
--   pure_random    - uniform pick from available draw_round_prize_units.
--                    spin_config = {}
--   weighted       - weighted pick by draw_round_prizes.weight.
--                    spin_config = {} (weight lives on prize rows)
--   inventory_gate - same as weighted, but rank-banded prizes are gated by
--                    a sold-percentage threshold so high-value prizes do not
--                    drop until the campaign reaches X% sold.
--                    spin_config = {
--                      "bands": [
--                        { "rankStart": 1, "rankEnd": 3,  "unlockAtSoldPct": 30 },
--                        { "rankStart": 4, "rankEnd": 6,  "unlockAtSoldPct": 10 },
--                        { "rankStart": 7, "rankEnd": 999,"unlockAtSoldPct": 0  }
--                      ]
--                    }
--
-- Default: 'pure_random' with empty config preserves today's behavior.

begin;

alter table public.draw_rounds
  add column if not exists spin_mode text not null default 'pure_random'
    check (spin_mode in ('pure_random', 'weighted', 'inventory_gate')),
  add column if not exists spin_config jsonb not null default '{}'::jsonb;

-- Helpful comment for future readers
comment on column public.draw_rounds.spin_mode is
  'How prizes are drawn. See migration 20260510120100 for accepted shapes.';
comment on column public.draw_rounds.spin_config is
  'Mode-specific JSON. Validated at publish time. Locked once locked_at is set.';

-- Existing live/closed/archived rows already have locked_at backfilled in
-- phase 1; keep them on pure_random with empty config (current behavior).
-- No backfill needed: defaults apply on add column.

commit;
