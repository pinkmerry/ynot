# Low Risk DB Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve low-risk database performance without changing pack-opening behavior or exposing house/private data.

**Architecture:** Keep `open_gacha_campaign` and the pack-open public DTO unchanged. Make only low-risk read-path and maintenance improvements: explicit projections for narrow query results, server-side aggregate reuse for admin stock counts, and one targeted index for `draw_round_categories` lookups. Use static regression tests to block house fields from entering public responses and to block accidental open RPC edits.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS, PostgreSQL migrations, Node `node:test`.

---

## Scope

In scope:
- Replace selected broad `select("*")` calls with explicit columns in low-risk read paths.
- Reuse existing `get_card_stock_summary` RPC for admin card usage/delete checks instead of fetching up to 50,000 stock status rows.
- Add a targeted index for `draw_round_categories(draw_round_id, category_id)`.
- Add a regression test script proving the low-risk optimization did not touch `open_gacha_campaign` or widen public pack-open fields.

Out of scope:
- No edits to any migration that creates or patches `public.open_gacha_campaign`.
- No change to pack-opening randomness, wallet debit, idempotency, bundle logic, Last Prize behavior, or result mapping.
- No caching or materialized inventory summary in this pass.
- No production Supabase apply during plan writing.

Stop condition:
- Tests pass.
- `git diff` shows no changes to the open RPC implementation beyond unrelated comments in the plan file.
- Public pack-open response still excludes private fields: `imageResolvedFromStockUnit`, raw card IDs, prize IDs, stock IDs, weights, and unlock thresholds.

## File Structure

- Create: `Website/scripts/test-low-risk-db-optimization.mjs`
  - Static regression tests for this scoped optimization.
  - Reads source/migration files and checks exact low-risk shapes.

- Modify: `Website/package.json`
  - Add `test:low-risk-db-optimization`.

- Modify: `Website/src/features/ynot/data.ts`
  - Add explicit select constants for category links and audit timeline rows.
  - Replace narrow `draw_round_categories.select("*")` calls with `draw_round_id,category_id`.
  - Replace shipping/admin-user audit timeline `audit_events.select("*")` calls with timeline fields only.

- Modify: `Website/src/app/api/ynot/admin/cards/route.ts`
  - Replace high-row stock status fetches with the existing aggregate RPC `get_card_stock_summary`.
  - Keep the same response fields and delete safety rules.

- Create through Supabase CLI at execution time: `Database/supabase/migrations/<generated>_low_risk_db_optimization.sql`
  - Use `npx supabase migration new low_risk_db_optimization` from `Database/`.
  - Put the SQL shown in Task 4 into the generated file.
  - Do not hand-create the migration filename.

---

### Task 1: Add Low-Risk Optimization Guard Tests

**Files:**
- Create: `Website/scripts/test-low-risk-db-optimization.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the failing test file**

Create `Website/scripts/test-low-risk-db-optimization.mjs`:

```js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const dataSource = read("src/features/ynot/data.ts");
const adminCardsRoute = read("src/app/api/ynot/admin/cards/route.ts");
const openRouteSource = read("src/app/api/ynot/gacha/open/route.ts");
const packageJson = JSON.parse(read("package.json"));

function latestMigrationWithSuffix(suffix) {
  const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const name = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .at(-1);
  assert.ok(name, `missing migration ending with ${suffix}`);
  return {
    name,
    source: readFileSync(new URL(name, migrationsDir), "utf8"),
  };
}

function sourceBlock(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing block end: ${label}`);
  return source.slice(startIndex, endIndex);
}

test("package exposes the scoped low-risk optimization test script", () => {
  assert.equal(
    packageJson.scripts["test:low-risk-db-optimization"],
    "node --test scripts/test-low-risk-db-optimization.mjs",
  );
});

test("low-risk migration adds only the category-link index and avoids open RPC surfaces", () => {
  const { source } = latestMigrationWithSuffix("_low_risk_db_optimization.sql");

  assert.match(
    source,
    /create index if not exists draw_round_categories_round_category_idx\s+on public\.draw_round_categories\s*\(\s*draw_round_id,\s*category_id\s*\)/i,
  );
  assert.doesNotMatch(source, /open_gacha_campaign/i);
  assert.doesNotMatch(source, /create\s+or\s+replace\s+function\s+public\.open_gacha_campaign/i);
  assert.doesNotMatch(source, /imageResolvedFromStockUnit|weight|unlock_at_sold_pct/i);
  assert.doesNotMatch(source, /alter\s+table\s+public\.draw_round_prize_units/i);
  assert.doesNotMatch(source, /alter\s+table\s+public\.gacha_opens/i);
});

test("category and audit timeline reads use explicit projections", () => {
  assert.match(
    dataSource,
    /const DRAW_ROUND_CATEGORY_LINK_SELECT = "draw_round_id,category_id";/,
  );
  assert.match(
    dataSource,
    /const AUDIT_EVENT_TIMELINE_SELECT = "id,event_type,metadata,created_at";/,
  );

  const categoryReads = [...dataSource.matchAll(/\.from\("draw_round_categories"\)[\s\S]{0,180}?\.select\(([^)]*)\)/g)];
  assert.ok(categoryReads.length >= 3, "expected existing category-link reads");
  for (const match of categoryReads) {
    assert.match(match[1], /DRAW_ROUND_CATEGORY_LINK_SELECT/);
    assert.doesNotMatch(match[1], /"\*"/);
  }

  assert.doesNotMatch(
    sourceBlock(
      dataSource,
      'readOrEmpty("shipping_audit_events"',
      "const events = auditEvents",
      "shipping audit timeline query",
    ),
    /\.select\("\*"\)/,
  );
  assert.doesNotMatch(
    sourceBlock(
      dataSource,
      'readOrEmpty("admin_user_audit"',
      "const auditTimelineById",
      "admin user audit timeline query",
    ),
    /\.select\("\*"\)/,
  );
});

test("admin card usage uses aggregate stock summary instead of loading status rows", () => {
  const cardUsageSummary = sourceBlock(
    adminCardsRoute,
    "async function cardUsageSummary",
    "async function duplicateCardResponse",
    "card usage summary",
  );
  assert.match(cardUsageSummary, /rpc\("get_card_stock_summary"/);
  assert.doesNotMatch(cardUsageSummary, /\.limit\(50000\)/);

  const deleteHandler = sourceBlock(
    adminCardsRoute,
    "export async function DELETE",
    "export async function PATCH",
    "admin card delete handler",
  );
  assert.match(deleteHandler, /cardUsageSummary\(supabase,\s*cardId\)/);
  assert.doesNotMatch(deleteHandler, /\.limit\(50000\)/);
});

test("pack open public response and RPC contract are not widened by this pass", () => {
  const publicOpenItemType = sourceBlock(
    openRouteSource,
    "type PublicOpenItem = {",
    "type PublicOpenResult = {",
    "public open item type",
  );
  const publicMapper = sourceBlock(
    openRouteSource,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
    "public open item mapper",
  );
  const postHandler = sourceBlock(
    openRouteSource,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
    "open route handler",
  );

  assert.doesNotMatch(
    `${publicOpenItemType}\n${publicMapper}`,
    /imageResolvedFromStockUnit|cardId|prizeUnitId|draw_round|card_stock|weight|unlockAtSoldPct/,
  );
  assert.match(postHandler, /rpc\("open_gacha_campaign"/);
  assert.doesNotMatch(postHandler, /cache|materialized|chunk|open_quantity_chunk_required/i);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: the command fails because `package.json` does not yet contain `test:low-risk-db-optimization`.

- [ ] **Step 3: Add the package script**

Modify `Website/package.json` inside the `scripts` object by adding:

```json
"test:low-risk-db-optimization": "node --test scripts/test-low-risk-db-optimization.mjs"
```

Place it near the other `test:*` scripts. Keep the surrounding JSON comma-valid.

- [ ] **Step 4: Run the test and verify the next expected failure**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: the command fails with `missing migration ending with _low_risk_db_optimization.sql`.

- [ ] **Step 5: Commit the test harness**

```bash
git add Website/package.json Website/scripts/test-low-risk-db-optimization.mjs
git commit -m $'Guard low-risk database optimization boundaries\n\nConstraint: pack opening behavior and public response shape must remain unchanged.\nRejected: relying on manual review for house-field leakage | static tests make the boundary repeatable.\nConfidence: high\nScope-risk: narrow\nDirective: Keep this test focused on low-risk read/index changes and do not encode open RPC internals beyond public-safety checks.\nTested: npm run test:low-risk-db-optimization (expected failure: missing migration)\nNot-tested: production Supabase apply'
```

---

### Task 2: Replace Low-Risk Broad Reads with Explicit Projections

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-low-risk-db-optimization.mjs`

- [ ] **Step 1: Confirm the projection test still fails on data-source checks after Task 1**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: if Task 4 has not been completed yet, the test still fails on the missing migration. If Task 4 has been completed first, it fails because `DRAW_ROUND_CATEGORY_LINK_SELECT` and `AUDIT_EVENT_TIMELINE_SELECT` are missing.

- [ ] **Step 2: Add explicit select constants**

Modify `Website/src/features/ynot/data.ts` after `const dataIssueStorage = new AsyncLocalStorage<YnotDataIssue[]>();`:

```ts
const dataIssueStorage = new AsyncLocalStorage<YnotDataIssue[]>();

const DRAW_ROUND_CATEGORY_LINK_SELECT = "draw_round_id,category_id";
const AUDIT_EVENT_TIMELINE_SELECT = "id,event_type,metadata,created_at";
```

- [ ] **Step 3: Replace category-link star selects**

In `Website/src/features/ynot/data.ts`, replace each `draw_round_categories` category-link read:

```ts
.from("draw_round_categories")
.select("*")
```

with:

```ts
.from("draw_round_categories")
.select(DRAW_ROUND_CATEGORY_LINK_SELECT)
```

Apply this to the reads labeled:
- `campaign_categories`
- `campaign_detail_public_categories`
- `campaign_detail_categories`

- [ ] **Step 4: Replace shipping audit timeline star select**

In `Website/src/features/ynot/data.ts`, in the `readOrEmpty("shipping_audit_events", ...)` query, replace:

```ts
.from("audit_events")
.select("*")
```

with:

```ts
.from("audit_events")
.select(AUDIT_EVENT_TIMELINE_SELECT)
```

This is safe because `shippingTimelineEvent()` reads only `id`, `event_type`, `metadata`, and `created_at`.

- [ ] **Step 5: Replace admin user audit timeline star select**

In `Website/src/features/ynot/data.ts`, in the `readOrEmpty("admin_user_audit", ...)` query, replace:

```ts
.from("audit_events")
.select("*")
```

with:

```ts
.from("audit_events")
.select(AUDIT_EVENT_TIMELINE_SELECT)
```

This is safe because the admin user 360 timeline also passes rows through `shippingTimelineEvent()`, which reads only `id`, `event_type`, `metadata`, and `created_at`.

- [ ] **Step 6: Run the focused test**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: the data-source projection assertions pass. If Task 4 is not complete, the only remaining failure is the missing low-risk migration.

- [ ] **Step 7: Run TypeScript**

Run:

```bash
cd Website
npm run typecheck
```

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 8: Commit projection cleanup**

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-low-risk-db-optimization.mjs
git commit -m $'Narrow low-risk YNOTT read projections\n\nConstraint: customer-visible pack data must not gain private house fields.\nRejected: broad select star cleanup across every loader | that would widen review scope and risk behavior drift.\nConfidence: high\nScope-risk: narrow\nDirective: Expand this pattern incrementally with per-path tests instead of large projection rewrites.\nTested: npm run test:low-risk-db-optimization; npm run typecheck\nNot-tested: live Supabase query timings'
```

---

### Task 3: Reuse Existing Stock Summary RPC for Admin Card Usage Checks

**Files:**
- Modify: `Website/src/app/api/ynot/admin/cards/route.ts`
- Test: `Website/scripts/test-low-risk-db-optimization.mjs`

- [ ] **Step 1: Confirm the admin-card test fails before implementation**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: the admin-card assertion fails because `cardUsageSummary` still fetches stock rows with `.limit(50000)`.

- [ ] **Step 2: Add stock summary parser helpers**

In `Website/src/app/api/ynot/admin/cards/route.ts`, near the existing local helpers above `cardUsageSummary`, add:

```ts
function numberFromSummary(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stockSummaryFromRpc(value: unknown, cardId: string) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (row.cardId !== cardId) continue;
    return {
      stockTotal: numberFromSummary(row.totalUnits),
      stockAvailable: numberFromSummary(row.availableUnits),
      stockReserved: numberFromSummary(row.reservedUnits),
      stockAllocated: numberFromSummary(row.allocatedUnits),
    };
  }
  return null;
}
```

- [ ] **Step 3: Replace `cardUsageSummary` stock row loading**

Replace the stock-row section in `cardUsageSummary` with this implementation:

```ts
async function cardUsageSummary(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  cardId: string,
): Promise<{ usage?: CardUsageSummary; error?: string }> {
  const { data: stockSummaryRows, error: stockError } = await supabase.rpc(
    "get_card_stock_summary",
    { p_card_id: cardId },
  );
  if (stockError) return { error: stockError.message };

  const { count: prizeAssignmentCount, error: prizeError } = await supabase
    .from("draw_round_prizes")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId);
  if (prizeError) return { error: prizeError.message };

  const stockSummary = stockSummaryFromRpc(stockSummaryRows, cardId);
  const usage: CardUsageSummary = {
    stockTotal: stockSummary?.stockTotal ?? 0,
    stockAvailable: stockSummary?.stockAvailable ?? 0,
    stockReserved: stockSummary?.stockReserved ?? 0,
    stockAllocated: stockSummary?.stockAllocated ?? 0,
    prizeAssignmentCount: prizeAssignmentCount ?? 0,
  };
  return { usage };
}
```

- [ ] **Step 4: Replace delete-handler stock status loading**

In `Website/src/app/api/ynot/admin/cards/route.ts`, inside `export async function DELETE`, replace the block that loads `card_stock_units.select("status").eq("card_id", cardId).limit(50000)` and computes `activeStock` with:

```ts
  const { usage, error: usageError } = await cardUsageSummary(supabase, cardId);
  if (usageError) return Response.json({ error: usageError }, { status: 409 });
  const usageSummary =
    usage ??
    ({
      stockTotal: 0,
      stockAvailable: 0,
      stockReserved: 0,
      stockAllocated: 0,
      prizeAssignmentCount: 0,
    } satisfies CardUsageSummary);
  const activeStockCount =
    usageSummary.stockAvailable +
    usageSummary.stockReserved +
    usageSummary.stockAllocated;
  if (activeStockCount > 0) {
    const breakdown = {
      available: usageSummary.stockAvailable,
      reserved: usageSummary.stockReserved,
      allocated: usageSummary.stockAllocated,
    };
    return Response.json(
      {
        error: "Cannot delete card with active stock units.",
        code: "CARD_HAS_ACTIVE_STOCK",
        usage: {
          stockTotal: usageSummary.stockTotal,
          stockAvailable: usageSummary.stockAvailable,
          stockReserved: usageSummary.stockReserved,
          stockAllocated: usageSummary.stockAllocated,
          prizeAssignmentCount: usageSummary.prizeAssignmentCount,
          breakdown,
        },
      },
      { status: 409 },
    );
  }
```

Keep the existing prize-assignment guard if it runs before this block. If it runs after this block, remove the duplicated `prizeAssignmentCount` query and rely on `usageSummary.prizeAssignmentCount` for the same response shape.

- [ ] **Step 5: Run the focused test**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: the admin-card usage assertions pass. If Task 4 is not complete, the only remaining failure is the missing low-risk migration.

- [ ] **Step 6: Run admin stock regression tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: all admin stock API shape tests pass.

- [ ] **Step 7: Run TypeScript**

Run:

```bash
cd Website
npm run typecheck
```

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 8: Commit admin aggregate count reuse**

```bash
git add Website/src/app/api/ynot/admin/cards/route.ts Website/scripts/test-low-risk-db-optimization.mjs
git commit -m $'Reuse stock summary aggregates for admin card checks\n\nConstraint: card delete safety must still block active stock and prize usage.\nRejected: loading physical stock rows for counts | existing aggregate RPC returns the same count surface with less payload.\nConfidence: high\nScope-risk: narrow\nDirective: Keep delete decisions count-based here; do not inspect or expose physical unit identity in this route.\nTested: npm run test:low-risk-db-optimization; npm run test:stock-subsku-admin-api; npm run typecheck\nNot-tested: live admin delete request'
```

---

### Task 4: Add Targeted Category-Link Index Migration

**Files:**
- Create via CLI: `Database/supabase/migrations/<generated>_low_risk_db_optimization.sql`
- Test: `Website/scripts/test-low-risk-db-optimization.mjs`

- [ ] **Step 1: Create the migration file with Supabase CLI**

Run:

```bash
cd Database
npx supabase migration new low_risk_db_optimization
```

Expected: Supabase prints a new file path ending in `_low_risk_db_optimization.sql` under `Database/supabase/migrations/`.

- [ ] **Step 2: Put this exact SQL into the generated migration**

Replace the generated migration file contents with:

```sql
-- low_risk_db_optimization
--
-- Low-risk read-path optimization only. This migration must not touch
-- open_gacha_campaign, prize-unit assignment, wallet debit, idempotency, or
-- public pack-open response fields.

create index if not exists draw_round_categories_round_category_idx
  on public.draw_round_categories(draw_round_id, category_id);
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: all assertions in `test-low-risk-db-optimization.mjs` pass.

- [ ] **Step 4: Run a local migration dry check**

Run:

```bash
cd Database
npx supabase migration list --local
```

Expected: the generated `_low_risk_db_optimization.sql` file appears in the local migration list.

- [ ] **Step 5: Commit the migration**

```bash
git add Database/supabase/migrations/*_low_risk_db_optimization.sql Website/scripts/test-low-risk-db-optimization.mjs
git commit -m $'Index category links for pack read paths\n\nConstraint: low-risk database optimization must not alter pack-open logic or customer-visible odds boundaries.\nRejected: broad index additions without a mapped query | this index targets existing draw_round_id category-link reads.\nConfidence: high\nScope-risk: narrow\nDirective: Run linked dry-run and advisors before any production apply.\nTested: npm run test:low-risk-db-optimization; npx supabase migration list --local\nNot-tested: linked Supabase migration dry-run'
```

---

### Task 5: Final Low-Risk Verification

**Files:**
- Read-only verification across the files changed in Tasks 1-4.

- [ ] **Step 1: Run focused low-risk test**

Run:

```bash
cd Website
npm run test:low-risk-db-optimization
```

Expected: all tests pass.

- [ ] **Step 2: Run pack-open public/private boundary tests**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:pack-open-privacy
```

Expected: all tests pass. These prove the open route still has weighted launch guards, bounded hydration, and no private public-response fields.

- [ ] **Step 3: Run related admin stock tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
npm run test:stock-readiness
```

Expected: both test commands pass.

- [ ] **Step 4: Run TypeScript and lint**

Run:

```bash
cd Website
npm run typecheck
npm run lint
```

Expected: both commands exit successfully.

- [ ] **Step 5: Run Supabase dry-run only**

Run:

```bash
cd Database
npx supabase migration list --linked
npx supabase db push --linked --dry-run --include-all
```

Expected:
- `migration list --linked` shows the new local migration as pending, or shows no mismatch besides the new local migration.
- `db push --linked --dry-run --include-all` previews only the `_low_risk_db_optimization.sql` index migration.
- No production apply is performed in this task.

- [ ] **Step 6: Check the open RPC was not changed**

Run:

```bash
git diff -- Database/supabase/migrations Website/src/app/api/ynot/gacha/open/route.ts
```

Expected:
- Diff includes the new `_low_risk_db_optimization.sql` migration only.
- Diff does not modify any existing migration containing `open_gacha_campaign`.
- Diff does not modify `Website/src/app/api/ynot/gacha/open/route.ts` except if test-only import ordering changes appeared by mistake, which should be reverted before completion.

- [ ] **Step 7: Final commit if verification changed scripts or docs**

If only verification was run and no files changed, skip this commit. If a small verification fix was needed, commit it:

```bash
git add Website/package.json Website/scripts/test-low-risk-db-optimization.mjs Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/cards/route.ts Database/supabase/migrations/*_low_risk_db_optimization.sql
git commit -m $'Verify low-risk database optimization\n\nConstraint: this pass must improve low-risk read performance without touching open-gacha behavior.\nRejected: applying production migration during implementation verification | linked dry-run is enough before owner approval.\nConfidence: high\nScope-risk: narrow\nDirective: Keep production apply separate and guarded by migration-list plus dry-run evidence.\nTested: npm run test:low-risk-db-optimization; npm run test:gacha-open-launch-safety; npm run test:gacha-open-performance; npm run test:pack-open-privacy; npm run test:stock-subsku-admin-api; npm run test:stock-readiness; npm run typecheck; npm run lint; npx supabase migration list --linked; npx supabase db push --linked --dry-run --include-all\nNot-tested: production Supabase apply'
```

---

## Self-Review

Spec coverage:
- Low-risk only: covered by Tasks 2-4.
- Leave `open_gacha_campaign` unchanged: covered by Task 1 and Task 5 diff check.
- No house info leak: covered by Task 1 public response assertions and Task 5 pack-open privacy tests.
- Feature behavior preserved: covered by TypeScript, targeted stock tests, pack-open tests, and no open-route/open-RPC edits.

Placeholder scan:
- The only non-exact path is the Supabase CLI-generated migration filename. That is intentional because Supabase migrations must be created with `npx supabase migration new low_risk_db_optimization`; the plan provides exact SQL for the generated file.
- No task depends on unspecified code.

Type consistency:
- `AUDIT_EVENT_TIMELINE_SELECT` returns the exact fields read by `shippingTimelineEvent()`.
- `DRAW_ROUND_CATEGORY_LINK_SELECT` returns the exact fields used by category-link maps.
- `stockSummaryFromRpc()` reads the existing JSON keys returned by `get_card_stock_summary`: `cardId`, `totalUnits`, `availableUnits`, `reservedUnits`, and `allocatedUnits`.
