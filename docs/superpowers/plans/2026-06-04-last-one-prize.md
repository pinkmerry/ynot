# Plan: Last One Prize (bonus) for random packs

Date: 2026-06-04
Status: AWAITING APPROVAL — this touches the live open + materialization logic
across ~5 RPC migrations; do not implement before sign-off.

## Concept (owner-approved)

A random pack can have ONE optional "Last Prize" (ichiban-kuji ラストワン賞).
The customer whose open consumes the LAST available slot gets their normal
pull(s) PLUS this Last Prize as a bonus. It does NOT consume a slot and does NOT
change odds — it is a separate, single, guaranteed bonus unit.

## Data model (REVISED — store OUTSIDE the prize pool, much safer)

The Last Prize is NOT a `draw_round_prizes` row — keeping it out of the pool
means the existing slot/unit invariants are untouched ("logic ไม่พัง" by
construction). Instead it lives in dedicated `draw_rounds` columns:

- `last_prize_card_id uuid references cards(id)` — the bonus card (nullable).
- `last_prize_metadata jsonb` — the selected sub-SKU identity (stockUnitGroupKey
  / stockSku / label / stockUnitFilter), same shape used in prize metadata.

A representative available unit is chosen at AWARD time (open RPC) by matching
`last_prize_card_id` + the sub-SKU filter, so no reservation bookkeeping is
needed and no materialization RPC changes are required. If no matching unit is
available at award time, the last prize is simply skipped (never blocks the
customer's normal pull).

Result: submit_campaign_review / approve_campaign_inventory / publish_campaign /
edit_live_campaign_inventory are ALL unchanged. Only the open RPC + UI change.

## The careful part: invariants

Today every materialization step asserts
`planned/reserved/materialized total == total_slots` and per-prize
`units == planned_quantity` over non-`adminHidden` prizes. The last-prize prize
and its unit must be **excluded from the total_slots comparison** while still
being reserved/materialized. Concretely, change the relevant counts to add
`and not (coalesce(metadata,'{}') @> '{"lastPrize": true}')`, and count the
last-prize unit separately. Affected RPCs (each a migration):

- `submit_campaign_review` — reserve the last-prize unit too, but exclude it
  from `planned_total == total_slots`.
- `approve_campaign_inventory` — materialize it, exclude from invariant.
- `publish_campaign` — exclude last-prize units from `materialized == total_slots`
  and from the per-prize unit-count check.
- `edit_live_campaign_inventory` (my live-edit RPC) — treat a last-prize prize as
  target = 1 unit, excluded from `v_planned_total` / slot math.
- `create_draw_slots` — unchanged (last prize is not a slot).

## Open RPC (`open_gacha_campaign`, latest 20260526000001)

After the normal pull loop, in the SAME transaction (round already locked
`for update`, so the last-slot detection is race-safe — a second concurrent
open sees 0 available slots and raises `not_enough_available_slots` first):

1. Count remaining `draw_slots status='available'`. If `= 0` (this open took the
   final slot) AND a `draw_round_prize_units` last-prize unit is still
   `available` for this round:
2. Mark that unit `awarded` (profile/open links), insert `gacha_open_items` +
   `collection_items`, and append it to `result_items` with
   `displayTier='last_prize'` and `isLastPrize=true`.
3. Mirror the same in the idempotency-replay branch.

## Prize builder UI

- Add `last_prize` to `prizeDisplayTierOptions` (prize-tier.ts) with
  `defaultCount: 0` so it is optional.
- Render a "LAST PRIZE" section: 1 row / 1 unit, NO slot grid (it is not a slot),
  clear copy "Awarded to whoever opens the final pack — bonus, on top of their
  normal pull."
- Readiness: count the last prize as its own 1-unit requirement, not part of slot
  coverage.

## Display (customer)

- Pack detail page: a "Last Prize" tier card labelled as the final-buyer bonus.
- Reveal: show the bonus distinctly ("LAST ONE PRIZE!") when awarded.

## Phasing (test each before the next)

1. Tier + prize-builder UI + types — admin can define a last prize (no award
   logic yet; it just won't be materialized/awarded).
2. Materialization migrations (reserve/materialize the unit, exclude from
   invariants) + live-edit RPC.
3. Open RPC award-on-last + reveal/display.

## Risks / mitigations

- Core money logic. Every existing invariant must keep holding for the normal
  pool; the last prize is carved out by the `lastPrize` metadata flag.
- ~5 migrations, each needs manual apply in Supabase SQL editor (the project's
  migration auto-apply lags). Plan to hand the SQL over per phase.
- Race on "last slot": already serialized by the round `for update` lock in the
  open RPC.
- Edge cases: pack with NO last prize defined (skip entirely); last prize unit
  out of stock at award time (skip, log — never block the customer's normal
  pull); a multi-pull open that consumes the last slot mid-batch (award once,
  after the loop).
