# Plan: Edit a LIVE random pack in place (safe stock re-materialization)

Date: 2026-06-04
Status: AWAITING APPROVAL — do not implement until the owner signs off on the
edge-case rules in §5.

## Goal

Let admins edit a random pack (`draw_rounds`) that is already `live` —
including title/slug/tags, price/cost coins, slots, mode/logic, and the prize
pool (add/remove/resize prizes, weights, unlock %, sub-SKU identity) — without
taking it offline, and atomically re-materialize prize stock so concurrent
customer opens never double-award, lose awards, or see broken odds.

Owner decisions already made:
- Scope = ALL fields (incl. slot count + prize pool).
- Mechanism = in-place while LIVE (not unpublish→edit→republish).

## Why this is delicate

A live pack has materialized stock: each `draw_round_prize_units` row binds one
`card_stock_unit` to a prize; `card_stock_units` are `allocated`; slots live in
`draw_slots`. Customer opens (`open_gacha_campaign`) consume these live with a
CSPRNG weighted draw. The current draft-edit PATCH does a blunt
`delete draw_round_prize_units + delete draw_round_prizes + reinsert`, which is
only safe because a draft has no awarded units. That path MUST NOT be used on a
live pack.

Invariant enforced at publish (must be preserved after every live edit):
`count(units status<>'void') == total_slots == count(available+consumed slots)`
and per non-hidden prize `count(non-void units) == planned_quantity`.

## Key safety lever (concurrency)

`open_gacha_campaign` does `SELECT … FROM draw_rounds WHERE id=… FOR UPDATE`
and holds it for the whole open transaction. So a re-materialize RPC that does
the same `SELECT … FOR UPDATE` on the round FIRST is fully serialized against
every concurrent open — no open can be mid-flight or start until the edit
commits. This eliminates the award race. The whole edit runs in one
transaction.

## Design overview

New SECURITY DEFINER RPC `edit_live_campaign_inventory(p_draw_round_id,
p_admin_id, p_config jsonb)` that, in one transaction:

1. `SELECT … FOR UPDATE` the `draw_rounds` row (serialize vs opens). Require
   `status='live'` (and `approval_status='approved'`); else raise.
2. `FOR UPDATE` all `draw_round_prize_units` for the round + active
   `card_stock_reservations`. Partition units by status: `awarded` (immutable)
   vs `available` (releasable) vs `void` (ignore).
3. Diff new prize config against current prizes, keyed by `(tier, rank)`:
   - **Weight / unlock % / display-only changes** → just UPDATE the
     `draw_round_prizes` row (no unit churn).
   - **planned_quantity increase** → reserve+materialize the delta: pick N more
     `available` `card_stock_units` matching
     `card_stock_unit_matches_prize_filter(stock, prize.metadata)`
     `FOR UPDATE SKIP LOCKED`, flip `reserved`→`allocated`, insert
     `draw_round_prize_units(status='available')` + `card_stock_reservations`
     (`allocated`) + ledger rows. Fail `insufficient_card_stock` if short.
   - **planned_quantity decrease** → void only `available` units down to the new
     count, return their stock to `available`, release their reservations
     (mirror `release_campaign_reservations` per-prize). Reject
     `cannot_reduce_below_awarded` if `awarded_count > new planned_quantity`.
   - **New prize** → insert `draw_round_prizes` row, then materialize its units.
   - **Removed prize** → reject `prize_has_awarded_units` if it has awarded
     units (FK is `on delete restrict`); else void its available units, release
     stock, then delete the prize row.
4. Adjust slots:
   - `new_total_slots := sum(new planned_quantity over non-hidden prizes)`.
   - Reject `cannot_reduce_slots_below_consumed` if
     `new_total_slots < count(draw_slots status in ('opened','picked'))` or
     `< total awarded units`.
   - Grow: `create_draw_slots` (additive). Shrink: delete/void only
     `available` high-numbered `draw_slots`.
5. Update `draw_rounds`: `price_thb`, `cost_coins`, `total_slots`,
   `logic_snapshot` (mode, openQuantityOptions), title/slug/tags/series/sort —
   keep `status='live'`, `visibility='public'`, `approval_status='approved'`.
6. Re-assert publish invariants (mirror `publish_campaign` checks). Raise on
   mismatch → whole tx rolls back.
7. Write audit_events + ledger (`live_pack_edited`).

## Files to change

- **DB migration** `Database/supabase/migrations/2026060414XXXX_edit_live_campaign_inventory.sql`
  — the new RPC above + grants to `service_role`.
- **API** `Website/src/app/api/ynot/admin/campaigns/route.ts`
  — relax the PATCH `CAMPAIGN_MUST_BE_DRAFT` guard: when `status==='live'`,
    route through a new server path that calls `edit_live_campaign_inventory`
    (passing the full config incl. prizes) instead of the blunt delete+reinsert.
    Keep blocking `archived`. Keep `CAMPAIGN_DIRECT_PUBLISH_LOCKED` for
    visibility/status flips.
- **Full editor page** `Website/src/app/admin/campaigns/[id]/edit/page.tsx`
  — allow `status==='live'` (and `closed`?) into the editor; show a clear
    "LIVE — changes apply immediately to customers" banner. Keep `archived`
    locked.
- **List UI** `Website/src/features/ynot/client.tsx` (AdminCampaignTable ~10944)
  — show "Edit all" (and maybe "Quick edit") for `live` packs, with a warning
    affordance; keep current behavior for draft.
- **Tests** `Website/scripts/test-*` — SQL assertions on the new RPC guards
  (awarded-aware reject rules, FOR UPDATE on the round) + route guard change.

## §5 Edge-case rules needing owner sign-off

1. Reduce slots/planned below already-awarded count → **reject** (protect wins).
2. Remove a prize that has awarded units → **reject** (can only hide it).
3. Change a prize's sub-SKU identity after some units awarded → **REJECT**
   (`prize_identity_locked_after_award`). Owner decision: do not allow changing
   the sub-SKU filter on a prize that already has awarded units. Identity edits
   are only allowed on prizes with zero awarded units. (To change identity after
   awards, hide/replace the prize instead.)
4. Weight / unlock-% / hidden toggles → applied live with no unit churn.
5. Price/cost-coin changes → apply immediately (affects opens after commit;
   in-flight opens already serialized by the round lock).

## Risks / mitigations

- Mis-materialization on a live money system → mitigated by: single tx, round
  FOR UPDATE serialization, awarded-preserving deltas, invariant re-assertion
  with rollback, no blunt deletes.
- Deploy ordering: the RPC migration must be applied before the API path goes
  live (host applies Supabase migrations separately from the Cloudflare deploy
  — see memory `ynot-deploy-process`). If the API ships first and calls a
  missing RPC, edits fail closed (safe).

## Test/verification plan

- Unit/SQL assertion tests for each reject rule + the FOR UPDATE lock + invariant
  re-assertion.
- Manual: edit a live pack with 0 opens (clean), then a live pack with ≥1 open
  (awarded preserved, slots floor respected), verify customer open still works
  and odds reflect new weights.
