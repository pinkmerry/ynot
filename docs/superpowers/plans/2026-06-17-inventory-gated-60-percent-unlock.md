# Inventory-Gated 60 Percent Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the inventory-gated reward unlock contract so chase/high rewards unlock after 60% sold while preserving normal pack opening, Last Prize bonus behavior, and public/private data boundaries.

**Architecture:** Add one shared Website-safe unlock contract module, then replace duplicated 30% labels/defaults with that shared 60% value. Keep runtime selection data-driven through `unlock_at_sold_pct <= sold_pct`; this lets existing persisted rows keep their stored odds while new/admin defaults move to 60% sold. Add regression tests that prove the 60% threshold, admin labels, tier defaults, DB-side percent-sold comparison, public response privacy, and Last Prize final-open bonus all remain correct.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres migrations, Node `node:test` static regression scripts.

---

## Scope Decisions

- Interpret "after 60%" as **60% sold**, which is the same point as **40% remaining**.
- Change all new inventory-gated chase/high defaults to 60% sold: Rainbow, Gold, Silver, owner mock top/high rewards, category/admin labels, and owner-review lifecycle labels.
- Keep Bronze/normal rewards at 0% sold so packs are still openable before 60% sold.
- Keep Last Prize as the final-open bonus. Last Prize remains separate from the inventory-gated high-tier unlock defaults.
- Do not add a Supabase data backfill in this change. Existing `draw_round_prizes.unlock_at_sold_pct` values remain the source of truth for already-created packs, especially live or reviewed packs. Existing packs that need new odds should use the current owner-reviewed edit/live-revision flow.
- Do not expose `unlockAtSoldPct`, weights, stock proof, or internal house data in public open responses.

## File Structure

- Create: `Website/src/features/ynot/reward-unlock.ts`
  - Shared constants and tiny helpers for inventory-gated sold-percent unlock behavior.
  - No client-only or server-only imports, so it can be used from client components and API routes.

- Modify: `Website/src/features/ynot/prize-tier.ts`
  - Use the shared 60% constant for Rainbow, Gold, and Silver `defaultUnlockAtSoldPct`.
  - Keep Bronze at `0`.
  - Keep Last Prize at `100`.

- Modify: `Website/src/features/ynot/client.tsx`
  - Use shared 60% label and percent value in the admin random logic selector.
  - Existing draft-prize creation already reads `config.defaultUnlockAtSoldPct`, so the tier config update drives new pack defaults.

- Modify: `Website/src/features/ynot/StorefrontAdminControls.tsx`
  - Use shared 60% label for category/admin random logic choices.

- Modify: `Website/src/features/ynot/data.ts`
  - Use shared 60% value for local owner mock prize lineups.
  - Rename 30% local mock review packs to 60% examples and update sold checkpoints.

- Modify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`
  - Use shared 60% label when owner review/lifecycle responses describe inventory-gated mode.

- Create: `Website/scripts/test-inventory-gated-60-unlock.mjs`
  - Node test locking the shared contract, admin labels/defaults, public privacy boundary, RPC percent-sold comparison, and Last Prize bonus invariant.

- Modify: `Website/package.json`
  - Add `test:inventory-gated-60-unlock`.

- Read-only references:
  - `Website/src/features/ynot/prize-readiness.ts`
  - `Website/src/app/api/ynot/gacha/open/route.ts`
  - `Database/supabase/migrations/20260605210000_last_prize_final_slot.sql`
  - `Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql`

---

### Task 1: Add the Shared 60% Unlock Contract

**Files:**
- Create: `Website/src/features/ynot/reward-unlock.ts`
- Create: `Website/scripts/test-inventory-gated-60-unlock.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Add the package script**

In `Website/package.json`, add this script near the existing `test:*` scripts:

```json
"test:inventory-gated-60-unlock": "node --test scripts/test-inventory-gated-60-unlock.mjs",
```

- [ ] **Step 2: Write the failing contract test**

Create `Website/scripts/test-inventory-gated-60-unlock.mjs` with this initial content:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function loadTsModule(path) {
  const source = read(path);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

const unlockContract = loadTsModule("../src/features/ynot/reward-unlock.ts");

test("inventory-gated unlock contract is 60% sold, equal to 40% remaining", () => {
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_AT_SOLD_PCT, 60);
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_REMAINING_PCT, 40);
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_LABEL, "60% sold unlock");
  assert.equal(unlockContract.clampSoldPercent(-20), 0);
  assert.equal(unlockContract.clampSoldPercent("62.5"), 62.5);
  assert.equal(unlockContract.clampSoldPercent(140), 100);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(59.99), false);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(60), true);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(100), true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock
```

Expected: FAIL because `Website/src/features/ynot/reward-unlock.ts` does not exist yet.

- [ ] **Step 4: Implement the shared contract**

Create `Website/src/features/ynot/reward-unlock.ts`:

```ts
export const INVENTORY_GATED_UNLOCK_AT_SOLD_PCT = 60;
export const INVENTORY_GATED_UNLOCK_REMAINING_PCT =
  100 - INVENTORY_GATED_UNLOCK_AT_SOLD_PCT;
export const INVENTORY_GATED_UNLOCK_LABEL = `${INVENTORY_GATED_UNLOCK_AT_SOLD_PCT}% sold unlock`;

export function clampSoldPercent(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function hasReachedInventoryGatedUnlock(
  soldPct: unknown,
  unlockAtSoldPct: unknown = INVENTORY_GATED_UNLOCK_AT_SOLD_PCT,
) {
  return clampSoldPercent(soldPct) >= clampSoldPercent(unlockAtSoldPct);
}
```

- [ ] **Step 5: Run the contract test to verify it passes**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock
```

Expected: PASS.

---

### Task 2: Replace Duplicated 30% Defaults and Labels

**Files:**
- Modify: `Website/scripts/test-inventory-gated-60-unlock.mjs`
- Modify: `Website/src/features/ynot/prize-tier.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/StorefrontAdminControls.tsx`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`

- [ ] **Step 1: Extend the test with admin/default coverage**

Replace `Website/scripts/test-inventory-gated-60-unlock.mjs` with:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function loadTsModule(path) {
  const source = read(path);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

function between(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${label}`);
  return source.slice(startIndex, endIndex);
}

const unlockContract = loadTsModule("../src/features/ynot/reward-unlock.ts");
const clientSource = read("../src/features/ynot/client.tsx");
const storefrontAdminSource = read("../src/features/ynot/StorefrontAdminControls.tsx");
const dataSource = read("../src/features/ynot/data.ts");
const prizeTierSource = read("../src/features/ynot/prize-tier.ts");
const lifecycleRouteSource = read(
  "../src/app/api/ynot/admin/campaigns/lifecycle/route.ts",
);

test("inventory-gated unlock contract is 60% sold, equal to 40% remaining", () => {
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_AT_SOLD_PCT, 60);
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_REMAINING_PCT, 40);
  assert.equal(unlockContract.INVENTORY_GATED_UNLOCK_LABEL, "60% sold unlock");
  assert.equal(unlockContract.clampSoldPercent(-20), 0);
  assert.equal(unlockContract.clampSoldPercent("62.5"), 62.5);
  assert.equal(unlockContract.clampSoldPercent(140), 100);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(59.99), false);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(60), true);
  assert.equal(unlockContract.hasReachedInventoryGatedUnlock(100), true);
});

test("admin and owner review surfaces use the shared 60% sold unlock label", () => {
  const editableSources = [
    clientSource,
    storefrontAdminSource,
    dataSource,
    lifecycleRouteSource,
  ].join("\n");

  assert.doesNotMatch(
    editableSources,
    /30% sold unlock|Owner Mock 30%|mock-owner-pack-(locked|unlocked)-30|before 30% sold/,
  );
  assert.match(clientSource, /INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(clientSource, /label: INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(clientSource, /INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/);
  assert.match(storefrontAdminSource, /INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(storefrontAdminSource, /label: INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(lifecycleRouteSource, /INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(lifecycleRouteSource, /return INVENTORY_GATED_UNLOCK_LABEL/);
  assert.match(dataSource, /INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/);
  assert.match(dataSource, /usesSoldUnlock \? INVENTORY_GATED_UNLOCK_AT_SOLD_PCT : 0/);
  assert.match(dataSource, /mock-owner-pack-locked-60/);
  assert.match(dataSource, /Owner Mock 60% Locked Chase/);
  assert.match(dataSource, /soldPct: 40/);
  assert.match(dataSource, /mock-owner-pack-unlocked-60/);
  assert.match(dataSource, /Owner Mock 60% Unlocked/);
  assert.match(dataSource, /soldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/);
});

test("new inventory-gated high-tier prize defaults unlock at 60% sold", () => {
  const tierOptions = between(
    prizeTierSource,
    "export const prizeDisplayTierOptions",
    "export const prizeDisplayTierValues",
    "prize display tier options",
  );

  assert.match(prizeTierSource, /INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/);
  assert.match(
    tierOptions,
    /value: "rainbow"[\s\S]*defaultUnlockAtSoldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/,
  );
  assert.match(
    tierOptions,
    /value: "gold"[\s\S]*defaultUnlockAtSoldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/,
  );
  assert.match(
    tierOptions,
    /value: "silver"[\s\S]*defaultUnlockAtSoldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT/,
  );
  assert.match(tierOptions, /value: "bronze"[\s\S]*defaultUnlockAtSoldPct: 0/);
  assert.match(
    prizeTierSource,
    /value: "last_prize"[\s\S]*defaultUnlockAtSoldPct: 100/,
  );
});
```

- [ ] **Step 2: Run the extended test to verify it fails on old 30% code**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock
```

Expected: FAIL with matches for old 30% labels/defaults.

- [ ] **Step 3: Update `Website/src/features/ynot/prize-tier.ts`**

Add this import at the top:

```ts
import { INVENTORY_GATED_UNLOCK_AT_SOLD_PCT } from "./reward-unlock";
```

Change Rainbow, Gold, and Silver tier defaults to:

```ts
defaultUnlockAtSoldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT,
```

Keep Bronze unchanged:

```ts
defaultUnlockAtSoldPct: 0,
```

Keep Last Prize unchanged:

```ts
defaultUnlockAtSoldPct: 100,
```

- [ ] **Step 4: Update `Website/src/features/ynot/client.tsx`**

Add this import near the other local feature imports:

```ts
import {
  INVENTORY_GATED_UNLOCK_AT_SOLD_PCT,
  INVENTORY_GATED_UNLOCK_LABEL,
} from "./reward-unlock";
```

Replace the `inventory_gated` choice with:

```ts
  {
    value: "inventory_gated",
    label: INVENTORY_GATED_UNLOCK_LABEL,
    description: `High-tier pool starts locked, then opens after ${INVENTORY_GATED_UNLOCK_AT_SOLD_PCT}% sold.`,
  },
```

- [ ] **Step 5: Update `Website/src/features/ynot/StorefrontAdminControls.tsx`**

Add this import near the existing local imports:

```ts
import { INVENTORY_GATED_UNLOCK_LABEL } from "./reward-unlock";
```

Replace the `inventory_gated` choice with:

```ts
  { value: "inventory_gated", label: INVENTORY_GATED_UNLOCK_LABEL },
```

- [ ] **Step 6: Update `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`**

Add this import with the other app imports:

```ts
import { INVENTORY_GATED_UNLOCK_LABEL } from "@/features/ynot/reward-unlock";
```

Replace `randomLogicLabel` with:

```ts
function randomLogicLabel(logicMode: RandomLogicMode) {
  if (logicMode === "weighted_templates") return "Weighted high tier";
  if (logicMode === "inventory_gated") return INVENTORY_GATED_UNLOCK_LABEL;
  return "Pure random";
}
```

- [ ] **Step 7: Update `Website/src/features/ynot/data.ts`**

Add this import near the other `./features/ynot` local imports:

```ts
import { INVENTORY_GATED_UNLOCK_AT_SOLD_PCT } from "./reward-unlock";
```

Replace the local mock unlock assignment with:

```ts
  const unlockAtSoldPct = usesSoldUnlock ? INVENTORY_GATED_UNLOCK_AT_SOLD_PCT : 0;
```

Replace the two 30% mock owner review configs with:

```ts
    {
      id: "mock-owner-pack-locked-60",
      title: "Owner Mock 60% Locked Chase",
      logicMode: "inventory_gated",
      soldPct: 40,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        `Rank 1-3 chase rewards stay private before ${INVENTORY_GATED_UNLOCK_AT_SOLD_PCT}% sold.`,
        "Locked prize units remain in Postgres but cannot drop.",
        "Base rewards remain available for early openings.",
      ],
    },
    {
      id: "mock-owner-pack-unlocked-60",
      title: "Owner Mock 60% Unlocked",
      logicMode: "inventory_gated",
      soldPct: INVENTORY_GATED_UNLOCK_AT_SOLD_PCT,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        "Sold checkpoint is reached, so locked rewards can enter odds.",
        "High-tier rewards use their configured weights after unlock.",
        "Customer preview can show only unlocked rewards.",
      ],
    },
```

- [ ] **Step 8: Run the extended test to verify it passes**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock
```

Expected: PASS.

---

### Task 3: Lock Runtime, Privacy, and Last Prize Boundaries

**Files:**
- Modify: `Website/scripts/test-inventory-gated-60-unlock.mjs`

- [ ] **Step 1: Add runtime and Last Prize guard reads**

In `Website/scripts/test-inventory-gated-60-unlock.mjs`, add these constants after `lifecycleRouteSource`:

```js
const prizeReadinessSource = read("../src/features/ynot/prize-readiness.ts");
const openRouteSource = read("../src/app/api/ynot/gacha/open/route.ts");
const openRpcSource = read(
  "../../Database/supabase/migrations/20260605210000_last_prize_final_slot.sql",
);
const lastPrizeBonusMigration = read(
  "../../Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql",
);
```

- [ ] **Step 2: Add runtime and privacy tests**

Append these tests to `Website/scripts/test-inventory-gated-60-unlock.mjs`:

```js
test("runtime reward gating stays data-driven by stored percent-sold unlock", () => {
  assert.match(
    prizeReadinessSource,
    /effectivePrizeUnlockAtSoldPct\(prize, logicMode\) <= soldPct/,
  );
  assert.match(
    openRpcSource,
    /logic_mode <> 'inventory_gated'[\s\S]*coalesce\(prizes\.unlock_at_sold_pct, 0\) <= sold_pct/,
  );
});

test("public pack open responses still hide house odds and unlock fields", () => {
  const publicOpenItem = between(
    openRouteSource,
    "type PublicOpenItem = {",
    "type PublicOpenResult = {",
    "public open item type",
  );
  const publicMapper = between(
    openRouteSource,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
    "public open item mapper",
  );

  assert.doesNotMatch(
    publicOpenItem,
    /unlockAtSoldPct|unlock_at_sold_pct|weight|cardId|prizeUnitId|draw_round|card_stock/i,
  );
  assert.doesNotMatch(
    publicMapper,
    /unlockAtSoldPct|unlock_at_sold_pct|weight|cardId:|prizeUnitId:|draw_round_prize_unit_id|card_stock_unit_id/i,
  );
});

test("Last Prize remains a final-open bonus and is not moved by the 60% unlock change", () => {
  assert.match(lastPrizeBonusMigration, /normal_units_needed := p_quantity;/);
  assert.match(lastPrizeBonusMigration, /last_prize_substitutes boolean := false/);
  assert.match(lastPrizeBonusMigration, /if lp_bonus_item is not null then/);
  assert.match(
    lastPrizeBonusMigration,
    /'position', case when last_prize_substitutes then position_index else p_quantity \+ 1 end/,
  );
});
```

- [ ] **Step 3: Run the full focused test**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock
```

Expected: PASS.

---

### Task 4: Verification and Commit

**Files:**
- Verify: `Website/scripts/test-inventory-gated-60-unlock.mjs`
- Verify: `Website/scripts/test-pack-open-pull-contract.mjs`
- Verify: `Website/scripts/test-gacha-open-launch-safety.mjs`
- Verify: `Website/scripts/test-pack-open-privacy.mjs`
- Verify: `Website/src/features/ynot/*`
- Verify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`

- [ ] **Step 1: Run targeted unlock and pack-open regression tests**

Run:

```bash
cd Website && npm run test:inventory-gated-60-unlock && npm run test:pack-open-pull-contract && npm run test:gacha-open-launch-safety && npm run test:pack-open-privacy
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd Website && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Search for stale 30% inventory-gated wording/defaults**

Run:

```bash
rg -n "30% sold unlock|Owner Mock 30%|mock-owner-pack-(locked|unlocked)-30|defaultUnlockAtSoldPct: (20|30)" Website/src/features/ynot Website/src/app/api/ynot/admin/campaigns
```

Expected: no matches.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff -- Website/src/features/ynot/reward-unlock.ts Website/src/features/ynot/prize-tier.ts Website/src/features/ynot/client.tsx Website/src/features/ynot/StorefrontAdminControls.tsx Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts Website/scripts/test-inventory-gated-60-unlock.mjs Website/package.json
```

Expected:
- New shared unlock contract is the only new production module.
- No Supabase migration backfills existing prize rows.
- Runtime gate still compares stored `unlock_at_sold_pct` to `sold_pct`.
- Last Prize SQL remains final-open bonus logic.
- Public open response still excludes unlock and weight internals.

- [ ] **Step 5: Commit the completed change**

Run:

```bash
git add Website/src/features/ynot/reward-unlock.ts Website/src/features/ynot/prize-tier.ts Website/src/features/ynot/client.tsx Website/src/features/ynot/StorefrontAdminControls.tsx Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts Website/scripts/test-inventory-gated-60-unlock.mjs Website/package.json
git commit -F - <<'MSG'
Require inventory-gated rewards to unlock after 60 percent sold

Constraint: Existing persisted unlock_at_sold_pct rows remain the source of truth for live packs.
Rejected: Hardcode the RPC to 60 percent | it would silently change audited live pack odds and break per-prize overrides.
Confidence: high
Scope-risk: moderate
Directive: Keep Last Prize as final-open bonus and keep public open responses free of weight and unlock fields.
Tested: npm run test:inventory-gated-60-unlock; npm run test:pack-open-pull-contract; npm run test:gacha-open-launch-safety; npm run test:pack-open-privacy; npm run typecheck
Not-tested: production data backfill, intentionally out of scope
MSG
```

Expected: commit succeeds with a Lore-protocol message.

---

## Self-Review

**Spec coverage:** The change request is covered by Task 1 and Task 2: all new/admin inventory-gated chase/high unlock defaults and labels move to 60% sold. Task 3 covers the user’s reward-logic safety requirement by proving the runtime gate remains percent-sold based, public data remains sanitized, and Last Prize stays final-open bonus logic.

**Placeholder scan:** The plan contains exact files, exact snippets, exact commands, and expected results. It does not use placeholder implementation steps.

**Type consistency:** The shared constants are exported from `reward-unlock.ts` and imported by both client and server files. The threshold remains a number named `INVENTORY_GATED_UNLOCK_AT_SOLD_PCT`; labels use `INVENTORY_GATED_UNLOCK_LABEL`.

**Privacy and house-info boundary:** Tests verify public open item types/mappers do not include unlock percentages, weights, card IDs, stock unit IDs, or internal proof fields.

**Execution caution:** The working tree already has unrelated uncommitted YNOTT edits. During implementation, inspect each target file before patching and keep these unlock changes separate from unrelated admin/category/top-up changes.
