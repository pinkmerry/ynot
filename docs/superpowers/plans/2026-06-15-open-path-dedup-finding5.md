# Open-Path Dedup (Finding 5) — Replay-Subquery Enrichment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpower-subagent-driven-development or superpower-executing-plans. The migration here is PRODUCTION-GATED (an `open_gacha_campaign` RPC change) — author + commit it, but apply to prod only via the gated runbook (`2026-06-15-apply-drop-unused-tables-migration.md` gate model). The website side is safe to merge as-is because `hydrateItems` remains a fallback.

**Goal:** Eliminate the 4–5 backfill queries (`hydrateItems`) on the gacha-open **replay** path by enriching the `open_gacha_campaign` RPC's idempotency-replay subquery to carry the same reveal fields the draw path already emits. Keep `hydrateItems` as the fallback.

**Scope correction (important):** Contrary to the original audit framing, a NORMAL pull does NOT trigger hydration — the draw-loop `jsonb_build_object` already emits `name`, `imageUrl` (`coalesce(stock.image_url, cards.image_url)`), `imageResolvedFromStockUnit`, `displayTier`, `tier`, `valueThb`, `position`, `bundleQuantity` (added by `20260606020000` + `20260607011450`). Only the **idempotency-replay** subquery in `open_gacha_campaign` is missing the stock-unit join, so replayed opens fail `hasPublicRevealFields` and hit `hydrateItems`. This plan closes only that gap.

**No leak / no logic change:** The enrichment adds fields that are ALREADY shown to customers (the same fields the draw path emits and `hydrateItems` backfills). It does not touch the random/award/last-prize logic — only the SHAPE of the replay payload. Customer-visible output is identical; only the query count drops.

---

## Critical context

- **Hydration gate** — `Website/src/app/api/ynot/gacha/open/route.ts`, `hasPublicRevealFields` (lines 242–258): an item skips hydration when it has non-empty `name`, non-empty `displayTier`, finite `position`, the `valueThb` key, AND (`isLastPrize === true` OR (`imageResolvedFromStockUnit === true` AND non-empty `imageUrl`)). The replay items lack `imageResolvedFromStockUnit`, so the batch triggers `hydrateItems`.
- **Resolution parity (verified, must hold):**
  - Image: SQL `coalesce(stock.image_url, cards.image_url)` + `imageResolvedFromStockUnit = nullif(stock.image_url,'') is not null` ≡ TS `publicSubSkuImageUrl(stockImageUrl, item.imageUrl ?? card?.image_url)` (stock wins; empty string treated as absent).
  - displayTier: SQL `coalesce(prizes.metadata->>'displayTier', case when tier='high' and rank<=3 then 'rainbow' when tier='high' then 'gold' else 'bronze' end)` ≡ TS `deriveDisplayTier`. Match confirmed.
- **Last-prize replay items** already pass the gate via `isLastPrize === true` (their `draw_round_prize_unit_id` is null, so no stock join is needed for them).
- **Migration style:** `open_gacha_campaign` is patched by `pg_get_functiondef` → `position(anchor in fn)=0` asserts → `fn := replace(fn, before, after)` → post-asserts → `execute fn` (see `20260612090000_last_prize_bonus_award.sql` lines 58–201). Follow this idempotent pattern; the anchors must be extracted from the LIVE function definition at apply time (verified by the Phase-1 dry run).

---

## File Structure

- **Create** `Database/supabase/migrations/20260616000000_open_gacha_replay_reveal_image.sql` — string-patch that enriches the replay subquery. Production-gated.
- **Create** `Website/scripts/test-open-replay-reveal-invariants.mjs` — guard asserting the new migration adds the stock join + `imageResolvedFromStockUnit` to the replay path.
- **Modify** `Website/package.json` — register the guard.
- (No website logic change. `hydrateItems` stays as the fallback.)

---

## Task 1: Extract the exact replay-subquery anchor

**Files:** none (investigation)

- [ ] **Step 1: Read the canonical replay subquery**

Open `Database/supabase/migrations/20260605210000_last_prize_final_slot.sql` (the last full rewrite) and locate the idempotency-replay block (~lines 235–263) — the `select coalesce(jsonb_agg(jsonb_build_object(...) order by ...), '[]'::jsonb) ... from public.gacha_open_items items join public.cards cards ... join public.draw_round_prizes prizes ... where items.gacha_open_id = existing_open.id`. Copy its EXACT current text (the `from`/`join` clause and the `jsonb_build_object(...)`) — this is the anchor the migration will `replace`. Confirm no later migration already altered it (grep the migrations for `gacha_open_id = existing_open` / replay edits).

Expected: you have the verbatim `from ... where items.gacha_open_id = existing_open.id` FROM clause and the replay `jsonb_build_object(...)` keys.

## Task 2: Write the gated enrichment migration

**Files:**
- Create: `Database/supabase/migrations/20260616000000_open_gacha_replay_reveal_image.sql`

- [ ] **Step 1: Write the string-patch migration**

Following the `20260612090000` pattern, create the migration that:
1. `select pg_get_functiondef('public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure) into fn;` and raise if null.
2. Assert the replay anchors exist (`position(<replay FROM clause> in fn) = 0 ... raise exception 'open_replay_reveal_anchor_missing';`).
3. `replace` the replay FROM clause to add the two left joins:
```sql
  left join public.draw_round_prize_units prize_unit
    on prize_unit.id = items.draw_round_prize_unit_id
  left join public.card_stock_units stock
    on stock.id = prize_unit.card_stock_unit_id
```
4. `replace` the replay `jsonb_build_object(...)` to add the two image keys (place them next to the existing `'imageUrl'`/`'name'` keys):
```sql
    'imageUrl', coalesce(stock.image_url, cards.image_url),
    'imageResolvedFromStockUnit', nullif(stock.image_url, '') is not null,
```
   (If the replay object already has an `'imageUrl'` key from `cards.image_url`, REPLACE that single line rather than adding a duplicate.)
5. Post-assert the new text is present (`position('imageResolvedFromStockUnit' in fn) = 0 ... raise exception 'open_replay_reveal_patch_failed';`).
6. `execute fn;`

Use exact verbatim anchors from Task 1 (the `replace` must match the live function text or it raises — which is a SAFE failure caught by the dry run). Do NOT touch the draw-loop path (already complete) or any award/last-prize logic.

- [ ] **Step 2: Static check (the migration file parses as expected)**

Run: `cd "Website" && node --test scripts/test-open-replay-reveal-invariants.mjs` (written in Task 3) — for now confirm the file exists and contains the two added keys.

## Task 3: Guard test

**Files:**
- Create: `Website/scripts/test-open-replay-reveal-invariants.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the guard**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sql = readFileSync(
  fileURLToPath(new URL("../../Database/supabase/migrations/20260616000000_open_gacha_replay_reveal_image.sql", import.meta.url)),
  "utf8",
);

test("replay enrichment joins card_stock_units via the prize unit", () => {
  assert.match(sql, /left join public\.draw_round_prize_units prize_unit/);
  assert.match(sql, /left join public\.card_stock_units stock\s*\n\s*on stock\.id = prize_unit\.card_stock_unit_id/);
});

test("replay items gain stock-resolved image fields", () => {
  assert.match(sql, /'imageUrl', coalesce\(stock\.image_url, cards\.image_url\)/);
  assert.match(sql, /'imageResolvedFromStockUnit', nullif\(stock\.image_url, ''\) is not null/);
});

test("migration follows the idempotent functiondef-patch pattern with post-asserts", () => {
  assert.match(sql, /pg_get_functiondef/);
  assert.match(sql, /raise exception 'open_replay_reveal_patch_failed'/);
});
```

- [ ] **Step 2: Register + run**

Add to `Website/package.json` scripts:
```json
    "test:open-replay-reveal": "node --test scripts/test-open-replay-reveal-invariants.mjs",
```
Run: `cd "Website" && npm run test:open-replay-reveal` → 3 pass.

## Task 4: Commit (website-safe; migration gated for prod)

- [ ] **Step 1: Commit**

```bash
git add Database/supabase/migrations/20260616000000_open_gacha_replay_reveal_image.sql \
        Website/scripts/test-open-replay-reveal-invariants.mjs Website/package.json \
        docs/superpowers/plans/2026-06-15-open-path-dedup-finding5.md
git commit -m "perf(gated): enrich open_gacha_campaign replay payload to skip hydration

Adds the card_stock_units join + imageUrl/imageResolvedFromStockUnit to the
idempotency-replay subquery so replayed opens carry reveal fields and skip the
hydrateItems backfill. Draw path already emits these; hydrateItems stays as a
fallback, so merging is safe pre-migration. Production application is GATED."
```

## Task 5: Production application (GATED — do not run until the gate is open)

- [ ] Use the gate + dry-run model from `docs/superpowers/plans/2026-06-15-apply-drop-unused-tables-migration.md`:
  1. Phase 0 gate (backup/PITR + owner go).
  2. **Phase 1 dry run on a non-prod branch is MANDATORY here** — it is the only way to confirm the string-replace anchors match the live function. If the migration raises `open_replay_reveal_anchor_missing`, re-extract the anchor from the live `pg_get_functiondef` and fix the `replace` before prod.
  3. Verify on the branch: trigger an open, then replay the same idempotency key; confirm the API response is identical AND the server made no `card_stock_units` hydration query for the replay (check `get_logs`).
  4. Apply to prod; re-verify; record evidence.

---

## Self-Review

- **Scope:** only the replay subquery is enriched (draw path already complete); award/last-prize logic untouched.
- **No leak / no logic change:** fields added are already customer-visible via the draw path + hydration; resolution logic matches TS exactly (verified). Output identical, fewer queries.
- **Safety:** `hydrateItems` fallback remains, so partial/failed enrichment degrades to current behavior; the string-replace fails safely (raises) if anchors drift, caught by the mandatory dry run.
- **Placeholders:** Task 1 extracts the verbatim anchor (a real step, not a TBD); the migration body is fully specified except the verbatim anchor which MUST come from the live function text.
