# Pack Detail + Open-Pack Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut latency on the customer pack **detail page** and the **open-pack** flow by killing an N+1 prize-unit query storm, caching the public campaign-detail projection, and deferring the heavy reveal-panel bundle — without ever exposing house odds, random/logic mode, stock identity, or internal UUIDs to non-admin customers.

**Architecture:** Three independent, separately-shippable changes, all server-side or bundle-level:
1. Replace the `2 × count(*)` round-trips **per prize** in `getCampaignPrizeReadiness` with **one bulk read + in-memory aggregation** (behavior-preserving; helps the customer detail page *and* the admin storefront list).
2. Serve non-admin viewers of public, non-test packs from an `unstable_cache`d **public projection** keyed by slug, so the hot path mostly skips Supabase entirely. Admins and test-campaign testers stay fully dynamic and per-viewer, so private detail is never cached or shared.
3. Code-split `GachaOpenPanel` behind a `next/dynamic` client boundary so the `/gacha/[slug]/open` route paints instantly instead of blocking on the 408 KB `client.tsx` chunk.

**Tech Stack:** Next.js 16 (App Router, RSC) on Cloudflare Workers via OpenNext, Supabase (service-role server client), `unstable_cache` / `revalidateTag` from `next/cache`, `node:test` (two existing idioms: static source analysis + `typescript` transpile-into-VM for pure logic).

---

## The leak invariant (read before touching anything)

See [[ynot-customer-leak-invariant]]. House logic — raw prize tier (`high`/`normal`), odds/weights, `logicMode` / `logic_snapshot`, per-unit stock identity, internal draw-round/prize UUIDs — **must never reach a non-admin customer**. Today this is enforced by `publicYnotCampaign()` ([Website/src/features/ynot/data.ts:844](../../../Website/src/features/ynot/data.ts)) which strips those fields and replaces the internal `id` with the public `slug`, and by the static source test `Website/scripts/test-pack-open-privacy.mjs`.

**Every task below preserves this by construction:**
- Task 2 only changes *how counts are fetched* (bulk vs per-prize). The numbers, and the fact they are stripped by `publicYnotCampaign`, are unchanged.
- Tasks 3–4 cache **only** the output of `publicYnotCampaign(...)`, **only** for `!viewer.isAdmin`, and **only** for `is_test = false` packs. Admins/testers bypass the cache and stay dynamic, so a private (odds-bearing) view can never be written into or read from the shared cache.
- Task 5 passes the already-public-projected `campaign` prop through a lazy boundary — no new data crosses to the client.

Each phase adds a test that asserts these guards in source.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `Website/src/features/ynot/prize-unit-counts.ts` | Pure, dependency-free aggregation of non-void prize-unit rows into per-prize counts. Unit-testable in a VM. | **Create** |
| `Website/src/features/ynot/prize-readiness.ts` | Readiness computation. Swap the per-prize count loop for one bulk read + the new helper; delete now-unused `countPrizeUnits`. | Modify |
| `Website/src/features/ynot/data.ts` | Add `loadPublicCampaignDetailImpl` + `getPublicCampaignDetailCached`; route non-admin/public/non-test detail reads through the cache in `getCampaign`. | Modify |
| `Website/src/features/ynot/cr/GachaOpenPanelLazy.tsx` | `"use client"` lazy boundary that `next/dynamic`-imports `GachaOpenPanel` with a loading skeleton. | **Create** |
| `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx` | Render the panel via the lazy wrapper instead of the static client-barrel import. | Modify |
| `Website/scripts/test-prize-unit-counts.mjs` | Behavioral unit test (transpile-into-VM) for the aggregation helper. | **Create** |
| `Website/scripts/test-campaign-detail-perf.mjs` | Static regression test: no per-prize count loop; single bulk read present. | **Create** |
| `Website/scripts/test-campaign-detail-privacy.mjs` | Static leak-guard test for the cache: public projection only, `is_test=false`, admin-gated, `campaigns`-tagged. | **Create** |
| `Website/scripts/test-gacha-open-bundle.mjs` | Static test: open page no longer statically imports the panel from the client barrel; lazy wrapper uses `next/dynamic`. | **Create** |
| `Website/package.json` | Wire the four new `node --test` scripts. | Modify |

### Non-goals (explicitly out of scope, with rationale)

- **Removing readiness from the customer path entirely.** Considered, but `hasOpenableInventory` depends on *eligibility* (unlock-at-sold-%), and dropping readiness would risk a `openable=true` → RPC-rejects mismatch. Keeping readiness but making it cheap (Task 2) + caching (Tasks 3–4) achieves the latency goal with no behavior change.
- **Trimming the duplicate `draw_rounds` / inventory-RPC / `draw_round_prizes` fetches inside `getCampaignPrizeReadiness`.** Once Task 2 (bulk read) and Tasks 3–4 (cache) land, readiness runs at most ~once per 30 s per pack on a cache miss, so the ROI of threading pre-loaded rows through is low and the refactor (raw vs. filtered prize lists) is risk-prone. Documented follow-up only.
- **Changing `resolveOpenCampaignId` in the open POST route.** It performs authorization (live + public + approved, or test-tester access). Leave it intact.
- **Extracting `GachaOpenPanel` out of `client.tsx` into its own module.** True byte reduction needs an 11k-line refactor; Task 5's lazy boundary defers the chunk (big perceived-latency win) without that risk. Documented follow-up.

---

## Task 1: Pure prize-unit aggregation helper

**Files:**
- Create: `Website/src/features/ynot/prize-unit-counts.ts`
- Create/Test: `Website/scripts/test-prize-unit-counts.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-prize-unit-counts.mjs` (mirrors the transpile-into-VM idiom in `scripts/test-stock-readiness.mjs`):

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/prize-unit-counts.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const cjsModule = { exports: {} };
vm.runInNewContext(outputText, {
  module: cjsModule,
  exports: cjsModule.exports,
  require,
});
const { aggregateNonVoidPrizeUnitCounts } = cjsModule.exports;

test("counts non-void total and available subtotal per prize", () => {
  const rows = [
    { draw_round_prize_id: "p1", status: "available" },
    { draw_round_prize_id: "p1", status: "available" },
    { draw_round_prize_id: "p1", status: "awarded" },
    { draw_round_prize_id: "p2", status: "awarded" },
  ];
  const result = aggregateNonVoidPrizeUnitCounts(["p1", "p2"], rows);
  assert.deepEqual(result, [
    { prizeId: "p1", nonVoidCount: 3, availableCount: 2 },
    { prizeId: "p2", nonVoidCount: 1, availableCount: 0 },
  ]);
});

test("returns explicit zeroes for prizes with no rows", () => {
  const result = aggregateNonVoidPrizeUnitCounts(["p1"], []);
  assert.deepEqual(result, [
    { prizeId: "p1", nonVoidCount: 0, availableCount: 0 },
  ]);
});

test("ignores rows whose prize id is null", () => {
  const rows = [{ draw_round_prize_id: null, status: "available" }];
  const result = aggregateNonVoidPrizeUnitCounts(["p1"], rows);
  assert.deepEqual(result, [
    { prizeId: "p1", nonVoidCount: 0, availableCount: 0 },
  ]);
});

test("only returns the requested prize ids, in order", () => {
  const rows = [
    { draw_round_prize_id: "p3", status: "available" },
    { draw_round_prize_id: "p1", status: "available" },
  ];
  const result = aggregateNonVoidPrizeUnitCounts(["p1", "p2"], rows);
  assert.deepEqual(result.map((r) => r.prizeId), ["p1", "p2"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Website && node --test scripts/test-prize-unit-counts.mjs`
Expected: FAIL — `Cannot find module '../src/features/ynot/prize-unit-counts.ts'` / `aggregateNonVoidPrizeUnitCounts is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `Website/src/features/ynot/prize-unit-counts.ts`:

```ts
// Pure aggregation for prize-unit status counts. Deliberately dependency-free
// so it can be unit-tested in isolation and reused by readiness without the old
// N+1 count(*) storm (2 round-trips per prize). The caller fetches non-void
// units for a whole campaign in one query; this groups them in memory.

export type PrizeUnitStatusRow = {
  draw_round_prize_id: string | null;
  status: string | null;
};

export type PrizeUnitCount = {
  prizeId: string;
  nonVoidCount: number;
  availableCount: number;
};

/**
 * Aggregate one bulk fetch of NON-VOID prize-unit rows into per-prize counts.
 * `rows` must already exclude `void` units (caller filters `status != 'void'`).
 * Returns one entry per id in `prizeIds`, preserving order, each with the
 * non-void total and the `available` subtotal.
 */
export function aggregateNonVoidPrizeUnitCounts(
  prizeIds: readonly string[],
  rows: readonly PrizeUnitStatusRow[],
): PrizeUnitCount[] {
  const nonVoid = new Map<string, number>();
  const available = new Map<string, number>();
  for (const row of rows) {
    const prizeId = row.draw_round_prize_id;
    if (!prizeId) continue;
    nonVoid.set(prizeId, (nonVoid.get(prizeId) ?? 0) + 1);
    if (row.status === "available") {
      available.set(prizeId, (available.get(prizeId) ?? 0) + 1);
    }
  }
  return prizeIds.map((prizeId) => ({
    prizeId,
    nonVoidCount: nonVoid.get(prizeId) ?? 0,
    availableCount: available.get(prizeId) ?? 0,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-prize-unit-counts.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Wire the npm script**

In `Website/package.json`, add to `"scripts"` (next to the other `test:*` entries):

```json
    "test:prize-unit-counts": "node --test scripts/test-prize-unit-counts.mjs",
```

- [ ] **Step 6: Commit**

```bash
cd Website
git add src/features/ynot/prize-unit-counts.ts scripts/test-prize-unit-counts.mjs package.json
git commit -m "perf: add pure prize-unit count aggregation helper"
```

---

## Task 2: Replace the per-prize count storm with one bulk read

**Files:**
- Modify: `Website/src/features/ynot/prize-readiness.ts` (imports near top; delete `countPrizeUnits` at lines ~269-283; replace the count loop at lines ~620-629)
- Create/Test: `Website/scripts/test-campaign-detail-perf.mjs`
- Modify: `Website/package.json`

Context: `getCampaignPrizeReadiness` is the only caller of `countPrizeUnits`, and it has exactly two callers — the customer detail read ([data.ts:1590](../../../Website/src/features/ynot/data.ts)) and the admin storefront list ([data.ts:1334](../../../Website/src/features/ynot/data.ts)). Fixing it here speeds up both with no signature change.

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-campaign-detail-perf.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readinessSource = readFileSync(
  new URL("../src/features/ynot/prize-readiness.ts", import.meta.url),
  "utf8",
);

test("readiness no longer counts prize units one prize at a time", () => {
  assert.ok(
    !/\bcountPrizeUnits\s*\(/.test(readinessSource),
    "the per-prize countPrizeUnits loop must be gone (it was the N+1 storm)",
  );
});

test("readiness aggregates prize-unit counts from a single bulk read", () => {
  assert.match(readinessSource, /aggregateNonVoidPrizeUnitCounts\(/);
  assert.match(
    readinessSource,
    /\.from\("draw_round_prize_units"\)[\s\S]{0,200}\.eq\("draw_round_id"/,
    "must read all non-void units for the campaign in one query",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Website && node --test scripts/test-campaign-detail-perf.mjs`
Expected: FAIL — `countPrizeUnits(` still present; `aggregateNonVoidPrizeUnitCounts(` not found.

- [ ] **Step 3: Add the import**

In `Website/src/features/ynot/prize-readiness.ts`, after the `./stock-readiness` import block (around line 19), add:

```ts
import { aggregateNonVoidPrizeUnitCounts } from "./prize-unit-counts";
```

- [ ] **Step 4: Delete the now-unused `countPrizeUnits`**

Remove this entire function (lines ~269-283):

```ts
async function countPrizeUnits(
  supabase: SupabaseClient,
  prizeId: string,
  status?: Database["public"]["Tables"]["draw_round_prize_units"]["Row"]["status"],
) {
  let query = supabase
    .from("draw_round_prize_units")
    .select("id", { count: "exact", head: true })
    .eq("draw_round_prize_id", prizeId);
  if (status) query = query.eq("status", status);
  else query = query.neq("status", "void");
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 5: Replace the count loop with one bulk read**

In `getCampaignPrizeReadiness`, find this block (lines ~620-629):

```ts
  if (!usePlannedInventory) {
    const prizeUnitCounts = await Promise.all(
      prizeIds.map(async (prizeId) => {
        const [nonVoidCount, availableCount] = await Promise.all([
          countPrizeUnits(supabase, prizeId),
          countPrizeUnits(supabase, prizeId, "available"),
        ]);
        return { prizeId, nonVoidCount, availableCount };
      }),
    );

    for (const { prizeId, nonVoidCount, availableCount } of prizeUnitCounts) {
```

Replace it with:

```ts
  if (!usePlannedInventory) {
    // One bulk read of non-void units for the whole campaign, aggregated in
    // memory, instead of 2 count(*) round-trips per prize. The old loop was the
    // N+1 storm that dominated customer pack-detail latency. Uses the
    // draw_round_prize_units_round_status_idx (draw_round_id, status) index.
    const { data: unitRows, error: unitRowsError } = await supabase
      .from("draw_round_prize_units")
      .select("draw_round_prize_id,status")
      .eq("draw_round_id", campaignId)
      .neq("status", "void");
    if (unitRowsError) throw unitRowsError;
    const prizeUnitCounts = aggregateNonVoidPrizeUnitCounts(
      prizeIds,
      unitRows ?? [],
    );

    for (const { prizeId, nonVoidCount, availableCount } of prizeUnitCounts) {
```

(Leave the loop body and everything after it unchanged — `nonVoidCount` / `availableCount` are computed identically, so all downstream math, `ready`, and `blockers` are byte-for-byte the same.)

- [ ] **Step 6: Run the regression test + typecheck**

Run: `cd Website && node --test scripts/test-campaign-detail-perf.mjs && npm run typecheck`
Expected: PASS — both perf assertions pass; `tsc --noEmit` reports no errors (confirms `Database` import is still used elsewhere or remove it if `tsc` flags it as unused — check `prize-readiness.ts` imports).

- [ ] **Step 7: Confirm the leak invariant is still green**

Run: `cd Website && npm run test:pack-open-privacy`
Expected: PASS — readiness numbers are still stripped by `publicYnotCampaign`; nothing about the public surface changed.

- [ ] **Step 8: Wire the npm script and commit**

In `Website/package.json` add:

```json
    "test:campaign-detail-perf": "node --test scripts/test-campaign-detail-perf.mjs",
```

```bash
cd Website
git add src/features/ynot/prize-readiness.ts scripts/test-campaign-detail-perf.mjs package.json
git commit -m "perf: collapse readiness prize-unit counts into one bulk read"
```

---

## Task 3: Cache the public campaign-detail projection (leak-guarded)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (add `loadPublicCampaignDetailImpl` + `getPublicCampaignDetailCached` just before `getCampaign` at line ~1489; add the cache-first branch inside `getCampaign`)

This is the leak-sensitive task. The cached function is **viewer-independent** (it must not read cookies/headers — `unstable_cache` would throw or cache per-build otherwise), reads only public/non-test rows via the service client, and returns **only** `publicYnotCampaign(...)`. The cache-first branch in `getCampaign` is gated on `!viewer.isAdmin`.

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-campaign-detail-privacy.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);

function sliceBetween(start, end) {
  const from = dataSource.indexOf(start);
  const to = dataSource.indexOf(end, from + 1);
  assert.ok(from !== -1, `expected to find: ${start}`);
  assert.ok(to !== -1 && to > from, `expected to find: ${end} after ${start}`);
  return dataSource.slice(from, to);
}

test("cached public detail loader returns only the public projection", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(impl, /return publicYnotCampaign\(/);
  assert.ok(
    !/\breturn campaign;\b/.test(impl),
    "must not return the raw (house-data) campaign from the cached loader",
  );
});

test("cached public detail loader excludes test campaigns", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(impl, /\.eq\("is_test",\s*false\)/);
});

test("admins never read from the public detail cache", () => {
  const fn = sliceBetween(
    "export async function getCampaign(",
    "async function getPaymentMethodsImpl",
  );
  assert.match(
    fn,
    /!viewer\.isAdmin[\s\S]{0,160}getPublicCampaignDetailCached\(/,
    "the cache lookup must be gated behind !viewer.isAdmin",
  );
});

test("public detail cache is invalidated by existing campaign mutations", () => {
  const region = sliceBetween(
    "const getPublicCampaignDetailCached",
    "export async function getCampaign(",
  );
  assert.match(region, /tags:\s*\[[^\]]*"campaigns"[^\]]*\]/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Website && node --test scripts/test-campaign-detail-privacy.mjs`
Expected: FAIL — `expected to find: async function loadPublicCampaignDetailImpl`.

- [ ] **Step 3: Add the cached public-detail loader**

In `Website/src/features/ynot/data.ts`, immediately **before** `export async function getCampaign(` (line ~1489), insert:

```ts
// Customer-facing pack detail for a public, APPROVED, NON-TEST campaign. This
// is identical for every non-admin viewer, so it is cached by slug. The
// function is viewer-independent on purpose: it must not read cookies/headers
// (unstable_cache forbids that) and it returns ONLY publicYnotCampaign(...),
// so house odds / logicMode / raw tiers / stock identity / internal UUIDs are
// stripped before anything is cached. Admins and test-campaign testers never
// reach this path (see getCampaign), so a private detail view can never be
// written into or served from this shared cache.
async function loadPublicCampaignDetailImpl(
  slug: string,
): Promise<YnotCampaign | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceSupabaseClient();
  const rows = await readOrEmpty("campaign_detail_public", async () => {
    const baseSelect = () =>
      supabase
        .from("draw_rounds")
        .select("*")
        .in("status", ["live", "closed"])
        .eq("visibility", "public")
        .eq("is_test", false)
        .eq("slug", slug)
        .limit(1);
    let { data, error } = await baseSelect().eq("approval_status", "approved");
    if (error && isMissingColumnError(error, "approval_status")) {
      ({ data, error } = await baseSelect());
    }
    if (error) throw error;
    return data ?? [];
  });
  const row = rows[0];
  if (!row) return null;

  const [categories, categoryLinks, inventoryRows] = await Promise.all([
    getStoreCategories({ includeTest: false }),
    readOrEmpty("campaign_detail_public_categories", async () => {
      const { data: links, error: linksError } = await supabase
        .from("draw_round_categories")
        .select("*")
        .eq("draw_round_id", row.id);
      if (linksError) throw linksError;
      return links ?? [];
    }),
    readOrEmpty("campaign_detail_public_inventory", async () => {
      const { data: inventory, error: inventoryError } = await supabase.rpc(
        "get_draw_round_inventory_summary",
        { p_draw_round_id: row.id, p_profile_id: null },
      );
      if (inventoryError) throw inventoryError;
      return inventorySummariesFromJson(inventory);
    }),
  ]);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const linkedCategories = categoryLinks
    .map((link) => categoriesById.get(link.category_id))
    .filter((category): category is YnotCategory => Boolean(category));
  const inventory = inventoryRows[0];
  const prizeLineup = await getPublicPrizeLineup(supabase, row, inventory, {
    includeLocked: false,
    includeSensitiveOdds: false,
    includeStockTarget: false,
  });
  let readiness: CampaignPrizeReadiness | null = null;
  try {
    readiness = await getCampaignPrizeReadiness(supabase, row.id);
  } catch (error) {
    recordDataIssue("campaign_detail_public_prize_readiness", error);
  }
  const campaign = toYnotCampaign(
    row,
    linkedCategories,
    inventory,
    prizeLineup,
    readiness,
  );
  if (!campaign.openable) return null;
  return publicYnotCampaign(campaign);
}

// Tagged "campaigns" so EVERY existing admin mutation that already calls
// revalidateTag("campaigns", "max") (publish, approve, odds, stock, lifecycle,
// cost, reorder) busts this cache too. 30s TTL is the safety net for customer
// opens that change stock; the open_gacha_campaign RPC remains the atomic
// source of truth, so a briefly-stale "openable" badge cannot oversell.
function getPublicCampaignDetailCached(slug: string): Promise<YnotCampaign | null> {
  return unstable_cache(
    () => loadPublicCampaignDetailImpl(slug),
    ["ynot-campaign-detail-public-v1", slug],
    { tags: ["campaigns", "campaign-detail"], revalidate: 30 },
  )();
}
```

- [ ] **Step 4: Route non-admin public reads through the cache in `getCampaign`**

In `getCampaign`, the current Supabase branch (after the `!isSupabaseConfigured()` guard, around line 1518) begins:

```ts
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaign_detail", async () => {
    const viewer = options.viewer ?? (await getYnotViewer());
    const includePrivateDetail = viewer.isAdmin;
```

Replace those four lines with the cache-first hoist (note: `viewer` is resolved once, above the closure, and reused inside it):

```ts
  const viewer = options.viewer ?? (await getYnotViewer());

  // Non-admin viewers of a public, non-test pack (looked up by slug) get the
  // cached public projection. Admins, UUID lookups, and test-campaign testers
  // fall through to the dynamic per-viewer path below, so private detail is
  // never cached or shared. Cache returns null for not-found / not-openable /
  // test packs, which correctly falls through.
  if (!viewer.isAdmin && !looksLikeUuid(campaignLookup)) {
    const cached = await getPublicCampaignDetailCached(campaignLookup);
    if (cached) return cached;
  }

  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaign_detail", async () => {
    const includePrivateDetail = viewer.isAdmin;
```

Leave the rest of the closure and the trailing `.then(...)` fallback unchanged. (The closure body no longer declares its own `viewer`; it now closes over the hoisted one. Confirm there is no second `const viewer =` left inside.)

- [ ] **Step 5: Run the privacy test + typecheck**

Run: `cd Website && node --test scripts/test-campaign-detail-privacy.mjs && npm run typecheck`
Expected: PASS — all four leak-guard assertions pass; `tsc` clean.

- [ ] **Step 6: Confirm the existing privacy lockdown still passes**

Run: `cd Website && npm run test:pack-open-privacy`
Expected: PASS.

- [ ] **Step 7: Wire the npm script and commit**

In `Website/package.json` add:

```json
    "test:campaign-detail-privacy": "node --test scripts/test-campaign-detail-privacy.mjs",
```

```bash
cd Website
git add src/features/ynot/data.ts scripts/test-campaign-detail-privacy.mjs package.json
git commit -m "perf: cache public pack-detail projection, admins/test bypass"
```

---

## Task 4: Manual verification of cache correctness (no oversell, no leak)

**Files:** none (verification task).

This task has no code; it exists so the engineer proves the cache behaves before moving on. Do not skip.

- [ ] **Step 1: Build the worker**

Run: `cd Website && npm run build`
Expected: build succeeds.

- [ ] **Step 2: Reason through the four guard cases and record findings**

Confirm each by reading the final `getCampaign` + `loadPublicCampaignDetailImpl`:
1. **Admin viewer** → `!viewer.isAdmin` is false → cache skipped → dynamic `includePrivateDetail` path → full house detail, uncached. ✅
2. **Customer, normal pack** → cache hit → `publicYnotCampaign(...)` only (no `logicMode`, no odds, `id === slug`). ✅
3. **Customer, test pack** → loader filters `is_test=false` → returns null → falls through to dynamic path → `canReadTestCampaign` gate (tester access preserved). ✅
4. **Admin publishes / edits odds / adjusts stock** → existing `revalidateTag("campaigns", "max")` busts the `"campaigns"`-tagged detail cache. ✅

- [ ] **Step 3: Commit the verification note**

```bash
cd Website
mkdir -p docs/verification
printf '%s\n' "# Pack-detail cache verification ($(date +%F))" \
  "- Admin viewer bypasses cache (dynamic, full detail)." \
  "- Customer normal pack: cache hit, public projection only (id===slug, no logicMode/odds)." \
  "- Customer test pack: is_test=false filter -> cache miss -> dynamic tester gate." \
  "- Admin mutations revalidateTag(\"campaigns\") busts the detail cache; 30s TTL safety net." \
  "- build: PASS" > docs/verification/2026-06-04-pack-detail-cache.md
git add docs/verification/2026-06-04-pack-detail-cache.md
git commit -m "docs: record pack-detail cache verification"
```

---

## Task 5: Lazy-load the reveal panel on the open route

**Files:**
- Create: `Website/src/features/ynot/cr/GachaOpenPanelLazy.tsx`
- Modify: `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`
- Create/Test: `Website/scripts/test-gacha-open-bundle.mjs`
- Modify: `Website/package.json`

The open route is a Server Component that statically imports `GachaOpenPanel` from the 408 KB `client.tsx` barrel, blocking first paint on that chunk. A `"use client"` wrapper that `next/dynamic`-imports the panel (with `ssr: false` and a skeleton) defers the chunk to after paint; `autoStart` still fires the open once the panel hydrates. The `campaign` prop is already the public projection, so nothing new crosses to the client.

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-gacha-open-bundle.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const openPageSource = readFileSync(
  new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url),
  "utf8",
);

test("open page no longer statically imports the panel from the client barrel", () => {
  assert.ok(
    !/import\s*\{[^}]*\bGachaOpenPanel\b[^}]*\}\s*from\s*["']@\/features\/ynot\/client["']/.test(
      openPageSource,
    ),
    "open page must not statically import GachaOpenPanel from the client barrel",
  );
  assert.match(openPageSource, /GachaOpenPanelLazy/);
});

test("lazy wrapper code-splits the panel via next/dynamic", () => {
  const lazySource = readFileSync(
    new URL("../src/features/ynot/cr/GachaOpenPanelLazy.tsx", import.meta.url),
    "utf8",
  );
  assert.match(lazySource, /^"use client";/);
  assert.match(lazySource, /from\s+["']next\/dynamic["']/);
  assert.match(lazySource, /import\(["']\.\.\/client["']\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Website && node --test scripts/test-gacha-open-bundle.mjs`
Expected: FAIL — open page still imports `GachaOpenPanel` from the barrel; `GachaOpenPanelLazy.tsx` does not exist.

- [ ] **Step 3: Create the lazy wrapper**

Create `Website/src/features/ynot/cr/GachaOpenPanelLazy.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Props are derived type-only from the client barrel so we don't pull its
// runtime code into this module's static graph.
type GachaOpenPanelProps = ComponentProps<
  (typeof import("../client"))["GachaOpenPanel"]
>;

// Defer the 408 KB client barrel chunk until after first paint. The route shows
// the skeleton immediately; the panel hydrates and (with autoStart) fires the
// open. ssr:false is valid here because this wrapper is a Client Component.
const GachaOpenPanel = dynamic(
  () => import("../client").then((mod) => ({ default: mod.GachaOpenPanel })),
  {
    ssr: false,
    loading: () => (
      <div
        className="cr-page"
        style={{ padding: 48, textAlign: "center" }}
        aria-busy="true"
      >
        <span className="cr-mute">Preparing your pack…</span>
      </div>
    ),
  },
);

export function GachaOpenPanelLazy(props: GachaOpenPanelProps) {
  return <GachaOpenPanel {...props} />;
}
```

- [ ] **Step 4: Point the open page at the lazy wrapper**

In `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`:

Change the import on line 3 from:

```tsx
import { GachaOpenPanel } from "@/features/ynot/client";
```

to:

```tsx
import { GachaOpenPanelLazy } from "@/features/ynot/cr/GachaOpenPanelLazy";
```

Then change the JSX (lines ~25-34) from `<GachaOpenPanel ... />` to `<GachaOpenPanelLazy ... />`, keeping every prop identical:

```tsx
    return (
      <GachaOpenPanelLazy
        campaign={campaign}
        authenticated={data.viewer.authenticated}
        initialQuantity={initialQuantity}
        tierAnimations={tierAnimations}
        autoStart
        immersive
      />
    );
```

- [ ] **Step 5: Run the bundle test + typecheck**

Run: `cd Website && node --test scripts/test-gacha-open-bundle.mjs && npm run typecheck`
Expected: PASS — both bundle assertions pass; `tsc` clean (the `ComponentProps<(typeof import("../client"))["GachaOpenPanel"]>` type resolves).

- [ ] **Step 6: Build to confirm the route compiles**

Run: `cd Website && npm run build`
Expected: build succeeds; the open route compiles with the dynamic boundary.

- [ ] **Step 7: Wire the npm script and commit**

In `Website/package.json` add:

```json
    "test:gacha-open-bundle": "node --test scripts/test-gacha-open-bundle.mjs",
```

```bash
cd Website
git add src/features/ynot/cr/GachaOpenPanelLazy.tsx "src/app/(store)/gacha/[campaignId]/open/page.tsx" scripts/test-gacha-open-bundle.mjs package.json
git commit -m "perf: lazy-load gacha reveal panel off the open route critical path"
```

---

## Task 6: Full verification gate

**Files:** none.

- [ ] **Step 1: Run lint + typecheck**

Run: `cd Website && npm run lint && npm run typecheck`
Expected: PASS — no lint errors (confirm no unused `Database` import remains in `prize-readiness.ts` after deleting `countPrizeUnits`; if flagged, remove the unused import), `tsc` clean.

- [ ] **Step 2: Run every new and leak-related test**

Run:
```bash
cd Website && node --test \
  scripts/test-prize-unit-counts.mjs \
  scripts/test-campaign-detail-perf.mjs \
  scripts/test-campaign-detail-privacy.mjs \
  scripts/test-gacha-open-bundle.mjs \
  scripts/test-pack-open-privacy.mjs
```
Expected: PASS — all suites green. The last one proves the customer-leak invariant still holds end-to-end.

- [ ] **Step 3: Production build**

Run: `cd Website && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Final commit (if anything changed during verification)**

```bash
cd Website
git add -A
git commit -m "test: verify pack-detail/open perf changes preserve leak invariant" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage**
- "Detail page opens slow" → Task 2 (cheap readiness) + Tasks 3–4 (cached public projection, mostly skips Supabase). ✅
- "Open pack is slow" → Task 2 + Tasks 3–4 cover the second full render of `/gacha/[slug]/open` (it calls the same `getCampaign`); Task 5 defers the 408 KB panel chunk. ✅
- "House data / random logic must not leak" → leak invariant section + Task 2 keeps `publicYnotCampaign` stripping unchanged; Tasks 3–4 cache only the public projection, gate on `!viewer.isAdmin`, exclude `is_test`, and ship a static leak-guard test; Task 5 passes an already-public prop. ✅

**2. Placeholder scan** — no TBD/“add error handling”/“similar to Task N”. Every code step shows full code; every run step shows the command and expected result. ✅

**3. Type consistency**
- `aggregateNonVoidPrizeUnitCounts(prizeIds, rows)` — same name/signature in Task 1 (impl + test) and Task 2 (call site). ✅
- `PrizeUnitStatusRow` (`draw_round_prize_id`, `status`) matches the `.select("draw_round_prize_id,status")` shape in Task 2. ✅
- `loadPublicCampaignDetailImpl` / `getPublicCampaignDetailCached` — names match between Task 3 impl and the Task 3 privacy-test slice anchors. ✅
- `GachaOpenPanelLazy` — same name in Task 5 wrapper export, open-page import/JSX, and test. ✅
- Cache tag `"campaigns"` matches the existing `revalidateTag("campaigns", "max")` calls across admin routes. ✅

**Edge note for the implementer:** after deleting `countPrizeUnits`, the `Database` type import in `prize-readiness.ts` may become unused (it is also used by other types like `DrawRoundRow`/`PrizeRow`, so it most likely stays needed). If `npm run lint`/`typecheck` flags it, remove only the unused symbol — do not delete imports still referenced.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-pack-detail-open-perf.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
