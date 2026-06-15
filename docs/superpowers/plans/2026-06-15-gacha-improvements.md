# Gacha Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the gacha/pack experience in four areas — lock the last-prize bonus model with real tests, remove duplicate data fetches on hot paths, add a customer "Pull All" button, and lock the admin pack-form slot math — without changing any house-leak boundary or breaking stock / creation / edit-live / open / image flows.

**Architecture:** Four ordered, independently-shippable phases. Phase 1 (verification) ships first because it de-risks every later change. Phase 2 (dedupe) and Phase 4 (admin lock) are isolated. Phase 3 (Pull All) depends on Phase 1's locked semantics. Pure logic lives in `open-quantity.ts` (already runtime-tested by transpiling the TS in a `node:test` VM); SQL invariants are locked with source-text guards (the repo's established pattern).

**Tech Stack:** Next.js (App Router), TypeScript, Supabase Postgres (`open_gacha_campaign` RPC), `node:test` `.mjs` guards (some transpile TS via `typescript` + `vm`).

**Acceptance criteria (owner directive — every phase must hold all three):**
1. **No house-data leak.** No task adds a field to any customer projection. Pull-All uses only already-public `remainingSlots`/`totalSlots`/`hasLastPrize`. `test:pack-open-privacy`, `test:campaign-detail-privacy`, and `verify:platform` MUST stay green after every task (each task that touches a customer surface runs them).
2. **No duplicate API/RPC.** Every duplicate this plan addresses gets a check that the duplicate site is gone: one unioned `card_stock_units` query in history (2.2), `Promise.all` instead of the serial loop (2.1), one shared `draw_round_prizes` fetch on detail (2.3). The open-path hydration (Finding 5) is the **largest** remaining duplicate, but it is a risky, prod-gated `open_gacha_campaign` RPC enrichment — too sensitive to bolt onto this plan. It is committed as its **own dedicated gated plan** (see Deferred), authored only after a focused RPC investigation with full open-flow parity tests.
3. **Performs well.** Dedup + parallelize independent fetches; **do not touch** the existing `unstable_cache` shields on the public list/detail (they are the primary perf defense).

---

## Critical context (read before starting)

- **House-leak invariant (do not regress):** odds/`weight`, `unlock_at_sold_pct`, `logicMode`, raw tier, stock identity / internal UUIDs, `cardId`/`prizeUnitId` must never reach non-admin customers. The `remaining` object (`remainingSlots/eligibleUnits/availableWinSlots/availablePrizeUnits`) IS allowed — it powers continuous-pull gating (see `client.tsx` → `openQuantityLimit`). Do not add new house fields to any public projection.
- **Last-prize bonus model (already implemented):** `Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql` patches `open_gacha_campaign` so the last prize is a BONUS extra item (`normal_units_needed := p_quantity`, bonus at `result_position = p_quantity + 1`, appended after the loop), with a `last_prize_substitutes` fallback when the final pull is short on normal stock. We are LOCKING this, not changing it.
- **Verification reality:** `npm run check` cannot go green locally (missing `.omx` docs + `SUPABASE_AUTH_PASSWORD_MIN_VERIFIED` env). Use these as the green signal after each task: `npm run typecheck`, `npm run verify:platform`, `npm run build`, and the relevant `test:*` guards. Run `npm ci` in `Website/` first if `node_modules` is absent.
- **Sensitive file:** `src/features/ynot/prize-readiness.ts` is the readiness gate used by BOTH pack creation and edit-live. Phase 2 Task 2.3 touches it — gate it with the journey tests before/after.
- **Two pack-detail components exist:** `PackDetailArena.tsx` (newer, has `intent` param + partial Pull-All plumbing) and `PackDetailExperience.tsx` (legacy). Phase 3 Task 3.0 confirms which is customer-live and targets that one.

All work happens in the worktree: `/Users/pinkmerry/Project X/YNOTT/.claude/worktrees/intelligent-mccarthy-c32e1d`. Commands below assume `cd Website` unless noted.

---

## File Structure

- **Modify** `Website/scripts/test-final-open-quantity.mjs` — add Pull-All sizing cases (pure-function, real execution).
- **Create** `Website/scripts/test-last-prize-bonus-award-invariants.mjs` — SQL-text guard locking the bonus RPC invariants.
- **Modify** `Website/package.json` — register the new guard script.
- **Modify** `Website/src/features/ynot/data.ts` — parallelize the prize-lineup fallback (2.1); union the history stock-unit queries (2.2); thread preloaded prizes (2.3).
- **Modify** `Website/src/features/ynot/prize-readiness.ts` — accept `preloaded.prizes` (2.3).
- **Modify** `Website/src/features/ynot/open-quantity.ts` — add a pure `pullAllQuantity` helper (3.2).
- **Modify** the live pack-detail component (`PackDetailArena.tsx`, confirm in 3.0) — render the Pull-All button (3.3).
- **Create** `Website/scripts/test-admin-last-prize-slot-math.mjs` — guard locking the admin slot math (4.1).

---

## PHASE 1 — Lock the last-prize bonus model

### Task 1.1: Pure-function Pull-All sizing tests

**Files:**
- Modify: `Website/scripts/test-final-open-quantity.mjs`

- [ ] **Step 1: Add failing tests**

Append inside `test-final-open-quantity.mjs` (it already exposes `openQuantity` via the `loadOpenQuantityModule()` pattern — reuse the existing loaded module variable):
```js
test("pull-all of N remaining is allowed when N normal win slots plus one last prize fill them", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 10, finalPrizeAvailableUnits: 1 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 10);
  assert.equal(openQuantity.isOpenQuantityAvailable(10, inventory), true);
});

test("pull-all of N remaining is allowed with no last prize when N normal win slots exist", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 10, finalPrizeAvailableUnits: 0 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 10);
});

test("pull-all is capped at available when normal stock is short and no last prize", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 7, finalPrizeAvailableUnits: 0 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 7);
});
```

- [ ] **Step 2: Run — expect PASS (these assert current correct behavior, locking it)**

Run: `cd "Website" && npm run test:final-open-quantity` (or `node --test scripts/test-final-open-quantity.mjs` if no npm alias)
Expected: all tests pass, including the three new ones. (If `test:final-open-quantity` is not a script, run the node command and note it.)

- [ ] **Step 3: Commit**

```bash
git add Website/scripts/test-final-open-quantity.mjs
git commit -m "test: lock pull-all open-quantity sizing semantics"
```

### Task 1.2: SQL-text guard for the bonus-award RPC invariants

**Files:**
- Create: `Website/scripts/test-last-prize-bonus-award-invariants.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the guard test**

Create `Website/scripts/test-last-prize-bonus-award-invariants.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("last prize consumes no extra normal slot (no minus-one)", () => {
  assert.match(sql, /normal_units_needed := p_quantity;/);
  assert.doesNotMatch(sql, /normal_units_needed := p_quantity - 1;/);
});

test("last prize is appended as a bonus item at position p_quantity + 1", () => {
  assert.match(sql, /p_quantity \+ 1/);
  assert.match(sql, /lp_bonus_item is not null/);
  assert.match(sql, /result_items := result_items \|\| jsonb_build_array\(lp_bonus_item\)/);
});

test("legacy substitute fallback is preserved for short final pulls", () => {
  assert.match(sql, /last_prize_substitutes := true/);
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd "Website" && node --test scripts/test-last-prize-bonus-award-invariants.mjs`
Expected: 3 tests pass.

- [ ] **Step 3: Register the script in package.json**

Add to the `scripts` object, after `test:final-open-quantity` (or after `test:gacha-open-bundle` if the former is absent):
```json
    "test:last-prize-bonus-award": "node --test scripts/test-last-prize-bonus-award-invariants.mjs",
```

- [ ] **Step 4: Run via npm + commit**

```bash
cd "Website" && npm run test:last-prize-bonus-award
git add Website/scripts/test-last-prize-bonus-award-invariants.mjs Website/package.json
git commit -m "test: lock last-prize bonus-award RPC invariants"
```

---

## PHASE 2 — Duplicate-data fixes

### Task 2.1: Parallelize the prize-lineup fallback (Finding 4)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (`getPublicPrizeLineupsIndividually`, ~lines 1170–1194)

- [ ] **Step 1: Replace the serial loop with parallel fetches**

Replace the `for (const row of rows) { ... }` body with:
```ts
  await Promise.all(
    rows.map(async (row) => {
      try {
        out.set(
          row.id,
          await getPublicPrizeLineup(supabase, row, inventoryByCampaign.get(row.id), options),
        );
      } catch (error) {
        recordDataIssue(`campaign_owner_prize_lineup_${row.slug}`, error);
        out.set(row.id, []);
      }
    }),
  );
  return out;
```

- [ ] **Step 2: Typecheck + journey tests**

Run: `cd "Website" && npm run typecheck && npm run test:campaign-detail-privacy && npm run test:pack-open-privacy`
Expected: exit 0. (This fallback path only fires when the batch RPC throws; behavior is identical, just parallel.)

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/ynot/data.ts
git commit -m "perf: parallelize prize-lineup individual fallback"
```

### Task 2.2: Union the two history stock-unit queries (Finding 8)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (`getGachaOpenHistory`, ~lines 3254–3296)

- [ ] **Step 1: Fetch `card_stock_units` once for the union of reward + collection IDs**

Replace the two separate `card_stock_units` queries with a single query over the unique union, then build both lookup maps from the single result. Concretely: collect `const stockUnitIds = [...new Set([...rewardStockUnitIds, ...collectionStockUnitIds])];`, run one `readOrEmpty("gacha_history_stock_unit_images", ...)` selecting `id,image_url` `.in("id", stockUnitIds)`, then derive `rewardStockUnits`/`collectionStockUnits` (or a single `Map<string,string>` keyed by id used by both downstream consumers). Preserve the existing empty-guard (skip the query when `stockUnitIds.length === 0`).

- [ ] **Step 2: Typecheck + open-history behavior**

Run: `cd "Website" && npm run typecheck && npm run test:gacha-open-launch-safety && npm run test:pack-open-privacy`
Expected: exit 0. Manually confirm the reward image + collection image still resolve (the map must serve both ID sets).

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/ynot/data.ts
git commit -m "perf: merge gacha-history stock-unit image queries into one"
```

### Task 2.3: Share the `draw_round_prizes` fetch on pack detail (Finding 1) — SENSITIVE

**Files:**
- Modify: `Website/src/features/ynot/prize-readiness.ts` (`getCampaignPrizeReadiness`, signature ~625–633, fetch ~662–669)
- Modify: `Website/src/features/ynot/data.ts` (call sites ~2194–2199 and ~2524–2529; plus the `getPublicPrizeLineup` raw fetch it shares with)

> This touches the readiness gate used by creation AND edit-live. Run the full journey set before and after.

- [ ] **Step 1: Record the baseline (must be green)**

Run: `cd "Website" && npm run test:stock-sku-usage && npm run test:campaign-detail-privacy && npm run test:gacha-open-launch-safety && npm run test:pack-open-privacy && npm run verify:platform`
Expected: all exit 0.

- [ ] **Step 2: Extend `getCampaignPrizeReadiness` to accept preloaded prize rows**

In `prize-readiness.ts`, extend the `preloaded` param type with `prizes?: DrawRoundPrizeRow[];` (use the existing raw row type the `select("*")` returns — confirm its name; if none, type as the row shape already used internally). In the `Promise.all` that fetches `draw_round_prizes`, short-circuit when `preloaded?.prizes !== undefined`:
```ts
preloaded?.prizes !== undefined
  ? Promise.resolve(preloaded.prizes)
  : (async () => {
      const { data, error } = await supabase
        .from("draw_round_prizes")
        .select("*")
        .eq("draw_round_id", campaignId);
      if (error) throw error;
      return data ?? [];
    })(),
```

- [ ] **Step 3: Fetch the raw prize rows once in the caller and pass to both consumers**

In each `data.ts` call site, fetch `draw_round_prizes` (`select("*").eq("draw_round_id", row.id)`) once into `const rawPrizes`, pass `prizes: rawPrizes` into `getCampaignPrizeReadiness`, AND pass the same rows into `getPublicPrizeLineup` via a new optional `preloadedPrizes` parameter (extend `getPublicPrizeLineup` to skip its own `draw_round_prizes` fetch when given). Keep the customer projection/mapping unchanged — only the fetch is shared.

- [ ] **Step 4: Re-run the journey set — must match the baseline exactly**

Run the same commands as Step 1.
Expected: all exit 0, identical to baseline. If anything differs, the shared rows are not equivalent to the per-function fetches — revert and report.

- [ ] **Step 5: Typecheck, build, commit**

```bash
cd "Website" && npm run typecheck && npm run build
git add Website/src/features/ynot/prize-readiness.ts Website/src/features/ynot/data.ts
git commit -m "perf: share draw_round_prizes fetch between lineup and readiness on pack detail"
```

> If Step 3 proves too entangled (e.g. `getPublicPrizeLineup` mapping needs fields the readiness fetch omits), STOP and report — the single saved round-trip is not worth risking the readiness gate. This task is optional relative to 2.1/2.2.

---

## PHASE 3 — Pull-All button

### Task 3.0: Confirm the customer-live pack-detail component

**Files:** none (investigation)

- [ ] **Step 1: Determine which component the customer pack route renders**

Run:
```bash
cd "Website" && grep -rn "PackDetailArena\|PackDetailExperience" src/app/ src/features/ynot/cr/PackDetail*.tsx | grep -i "import\|<PackDetail"
```
Expected: identifies whether `(store)/packs/[slug]/page.tsx` (or its child) renders `PackDetailArena` (expected live) or `PackDetailExperience`. Target the live one in 3.3. If both render in different routes, apply 3.3 to both.

### Task 3.1: Pure `pullAllQuantity` helper test

**Files:**
- Modify: `Website/scripts/test-final-open-quantity.mjs`

- [ ] **Step 1: Write failing tests for a new exported helper**

Add:
```js
test("pullAllQuantity returns remaining when below threshold and a last prize exists", () => {
  assert.equal(openQuantity.pullAllQuantity({ remainingSlots: 30, totalSlots: 100, hasLastPrize: true }), 30);
});
test("pullAllQuantity returns null at or above 40% remaining", () => {
  assert.equal(openQuantity.pullAllQuantity({ remainingSlots: 40, totalSlots: 100, hasLastPrize: true }), null);
});
test("pullAllQuantity returns null without a last prize", () => {
  assert.equal(openQuantity.pullAllQuantity({ remainingSlots: 10, totalSlots: 100, hasLastPrize: false }), null);
});
test("pullAllQuantity returns null when nothing remains", () => {
  assert.equal(openQuantity.pullAllQuantity({ remainingSlots: 0, totalSlots: 100, hasLastPrize: true }), null);
});
```

- [ ] **Step 2: Run — expect FAIL (`pullAllQuantity` not defined)**

Run: `cd "Website" && node --test scripts/test-final-open-quantity.mjs`
Expected: the four new tests fail.

### Task 3.2: Implement `pullAllQuantity`

**Files:**
- Modify: `Website/src/features/ynot/open-quantity.ts`

- [ ] **Step 1: Add the pure helper**

```ts
const PULL_ALL_THRESHOLD = 0.4;

export function pullAllQuantity(input: {
  remainingSlots?: number;
  totalSlots?: number;
  hasLastPrize?: boolean;
}): number | null {
  const remaining = Math.max(0, Math.floor(Number(input.remainingSlots) || 0));
  const total = Math.max(0, Math.floor(Number(input.totalSlots) || 0));
  if (!input.hasLastPrize || remaining <= 0 || total <= 0) return null;
  if (remaining / total >= PULL_ALL_THRESHOLD) return null;
  return remaining;
}
```

- [ ] **Step 2: Run — expect PASS**

Run: `cd "Website" && node --test scripts/test-final-open-quantity.mjs`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/ynot/open-quantity.ts Website/scripts/test-final-open-quantity.mjs
git commit -m "feat: add pure pullAllQuantity helper (<40% remaining + last prize)"
```

### Task 3.3: Wire the Pull-All button into the live component

**Files:**
- Modify: the live component from 3.0 (default `Website/src/features/ynot/cr/PackDetailArena.tsx`)

- [ ] **Step 1: Compute the pull-all quantity and render a gated button**

Import `pullAllQuantity` from `../open-quantity`. Near the existing quantity dock (Arena ~line 473), compute:
```ts
const pullAll = pullAllQuantity({
  remainingSlots: campaign.remainingSlots ?? campaign.totalSlots,
  totalSlots: campaign.totalSlots,
  hasLastPrize: campaign.hasLastPrize,
});
```
Render a "Pull All" button only when `pullAll !== null`, calling `setQty(pullAll)` (Arena's `qty` guard at line ~90 already accepts `rawQty === remainingNow`; if `pullAll` can differ from `remainingNow` due to rounding, extend that guard to `|| rawQty === pullAll`). Reuse the existing `confirmAndOpen()` trigger. Match the existing button styling/states (hover/focus/active/disabled).

- [ ] **Step 2: Typecheck + build + image/launch guards**

Run: `cd "Website" && npm run typecheck && npm run build && npm run test:gacha-open-launch-safety && npm run test:pack-open-privacy`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/ynot/cr/PackDetailArena.tsx
git commit -m "feat: customer Pull-All button when a pack is below 40% with a last prize"
```

---

## PHASE 4 — Lock the admin pack slot math

### Task 4.1: Guard the admin last-prize slot alignment

**Files:**
- Create: `Website/scripts/test-admin-last-prize-slot-math.mjs`
- Modify: `Website/package.json`

> The admin form + API are already correct (`normalPrizeTarget` returns `totalSlots`, no `+1`; the last prize is an extra bonus). This guard locks that so it can't drift.

- [ ] **Step 1: Write the guard**

Create `Website/scripts/test-admin-last-prize-slot-math.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const client = read("../src/features/ynot/client.tsx");
const route = read("../src/app/api/ynot/admin/campaigns/route.ts");

test("normal prize target equals total slots (no +1 for the last prize)", () => {
  assert.match(client, /function normalPrizeTarget\([\s\S]*?return Math\.max\(1, Math\.round\(Number\(totalSlots\) \|\| 1\)\)/);
  assert.match(route, /function lastPrizeNormalPrizeTarget\([\s\S]*?return Math\.max\(1, Math\.round\(Number\(totalSlots\) \|\| 1\)\)/);
  assert.doesNotMatch(client, /normalPrizeTarget[\s\S]{0,80}totalSlots\s*\+\s*1/);
});

test("reward-unit validation requires normal prizes to equal total slots (last prize excluded)", () => {
  assert.match(client, /configuredRewardUnits !== totalSlots/);
});

test("the admin form describes the last prize as an extra bonus on top", () => {
  assert.match(client, /Last Prize is an extra bonus on top/i);
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `cd "Website" && node --test scripts/test-admin-last-prize-slot-math.mjs`
Expected: 3 tests pass. (If a regex misses due to formatting, adjust it to the exact current source — do not change app code.)

- [ ] **Step 3: Register + commit**

Add to `package.json` scripts:
```json
    "test:admin-last-prize-slot-math": "node --test scripts/test-admin-last-prize-slot-math.mjs",
```
```bash
cd "Website" && npm run test:admin-last-prize-slot-math
git add Website/scripts/test-admin-last-prize-slot-math.mjs Website/package.json
git commit -m "test: lock admin last-prize slot math to the bonus model"
```

---

## Deferred (separate, gated)

- **Finding 5 — eliminate open-route hydration (the largest remaining duplicate; committed as the NEXT dedicated plan):** enrich `open_gacha_campaign` to always return `displayTier/name/imageUrl/imageResolvedFromStockUnit` so `needsOpenItemHydration` is false and the 4–5 backfill queries in `route.ts:264` are skipped on every pull. **Keep `hydrateItems` as a fallback** (add fields to the payload; do not remove the safety net) so there is zero behavior risk until the migration is applied. This is a Postgres RPC migration → production-gated per `AGENTS.md` (apply after the Phase-1 backup/PITR drill). Needs its own focused RPC investigation + full open-flow parity tests before authoring — which is why it is not a task in this plan.
- **Finding 3 — slug→UUID on open:** REJECTED. Putting the internal `draw_round` UUID in customer URLs conflicts with the leak invariant. Keep the slug lookup.

---

## Self-Review

- **Spec coverage:** "everything" = duplicate-data (Phase 2: Findings 1/4/8; Finding 5 deferred with rationale), Pull-All (Phase 3, <40% + last-prize gated, sized to remaining), last-prize verification (Phase 1, pure-function + SQL guard), admin alignment (Phase 4, lock the already-correct math). All four covered.
- **Placeholder scan:** every task has exact files, code, commands, and expected output. Task 3.0 and the 2.3 type name are explicit verification steps (confirm-then-use), not placeholders.
- **Type/name consistency:** `pullAllQuantity` is defined in 3.2 and consumed in 3.1 (test) and 3.3 (UI) with the same `{ remainingSlots, totalSlots, hasLastPrize }` shape. `openQuantityLimit`/`isOpenQuantityAvailable` match `open-quantity.ts`. The SQL guard strings match the verbatim migration anchors (`normal_units_needed := p_quantity;`, `p_quantity + 1`, `lp_bonus_item is not null`, `last_prize_substitutes := true`).
- **Risk:** Task 2.3 is the only sensitive change (readiness gate) and is explicitly baseline-gated and marked optional. Phases 1 and 4 are tests-only. Phase 3 logic is pure and unit-tested before UI wiring.
