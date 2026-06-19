# Customer Frontend Performance & Data-Call Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Cloudflare Worker CPU + Supabase round-trips on the customer-facing storefront without changing any UI behaviour or leaking house info.

**Architecture:** The store renders as `force-dynamic` Next.js 16 server components on Cloudflare Workers (OpenNext) talking to Supabase via the service-role client. Every page re-runs its full data fan-out per request because the OpenNext incremental cache is the inert "dummy" default. This plan (a) de-duplicates per-request auth + catalog reads with React `cache()`, (b) parallelizes serial query waterfalls, (c) narrows over-fetching selects, and — gated behind explicit sign-off — (d) enables a real Workers KV/D1 incremental cache and fixes two behaviour-affecting bugs.

**Tech Stack:** Next.js 16 (App Router, React 19), `@opennextjs/cloudflare`, `@supabase/supabase-js`, Cloudflare Workers/KV/D1, `node:test` static source-analysis tests.

---

## Hard Constraints (apply to EVERY task)

1. **No UI/behaviour change** in Phases 1–3. Pure timing / dedup / parallelization / column-narrowing only. Phases 4–5 contain the *only* behaviour-affecting changes and are explicitly gated.
2. **No house-info leak.** Odds, `logic_snapshot`/`logicMode`, prize weights, stock targets/identity, internal UUIDs, and `admin_note` must never reach non-admin customers. The guards are `publicYnotCampaign()` (`Website/src/features/ynot/data.ts:1365`), `publicPrizePreview()`, `publicShippingRequest()` / `publicExchangeOrder()` / `publicTopUp()`. No task may widen what reaches the client.

## Verification Baseline (run before starting + after each phase)

These existing behaviour-lock suites are the regression net. They must stay green:

```bash
cd Website
node --test scripts/test-pack-open-privacy.mjs
node --test scripts/test-campaign-detail-privacy.mjs
node --test scripts/test-campaign-detail-perf.mjs
node --test scripts/test-gacha-dedup.mjs
node --test scripts/test-gacha-open-performance-shape.mjs
node --test scripts/test-gacha-open-bundle.mjs
npm run typecheck
```

> **Note on TDD here:** This repo's tests are *static source-analysis* (`node:test` reads `src/features/ynot/data.ts` as text and asserts structure — see `scripts/test-gacha-dedup.mjs`). The parallelization/dedup/narrowing tasks below follow that exact pattern: write a failing structural assertion, then make the code match. Page-level and infra/DB tasks are verified by `typecheck` + `build` + the existing perf suites, since they can't be unit-tested in isolation.

---

## Phase Overview

| Phase | Contents | Behaviour-safe? | Needs sign-off? |
|-------|----------|-----------------|-----------------|
| 1 | React `cache()` request-dedup (auth viewer + card catalog) — fixes original #3 + review C + A-interim | ✅ Yes | No |
| 2 | Parallelize serial waterfalls (page #2, D1–D4) | ✅ Yes | No |
| 3 | Narrow `select("*")` + cap `/packs` (F) | ✅ Yes (verified columns) | No |
| 4 | Behaviour-affecting fixes: Mystery-card (A-full) + home wallet defer (B) | ⚠️ Changes output | **Yes** |
| 5 | Infra/DB: Workers KV+D1 incremental cache (#1) + readiness aggregation RPC (E) | ⚠️ Freshness window | **Yes** |
| — | Optional follow-ups: bundle split (#5), HMAC sync, index tune (G) | ✅ Yes | No |

Phases are independent and may be executed/merged separately. Stop after Phase 3 for a fully behaviour-neutral win.

---

## File Structure

**Created:**
- `Website/scripts/test-request-dedup.mjs` — static tests for Phase 1
- `Website/scripts/test-data-parallelization.mjs` — static tests for Phase 2
- `Website/scripts/test-customer-select-narrowing.mjs` — static tests for Phase 3
- `Database/supabase/migrations/<ts>_draw_round_prize_unit_counts.sql` — Phase 5 RPC

**Modified:**
- `Website/src/lib/auth/resolve-current-profile.ts` — `cache()` wrap (Phase 1)
- `Website/src/features/ynot/data.ts` — most tasks
- `Website/src/app/(store)/packs/[slug]/page.tsx`, `.../gacha/[campaignId]/page.tsx`, `.../gacha/[campaignId]/open/page.tsx` — Phase 2
- `Website/src/features/ynot/components.tsx`, `Website/src/app/page.tsx` — Phase 4 (B)
- `Website/open-next.config.ts`, `Website/wrangler.website.jsonc`, `Website/wrangler.website.ci.jsonc`, `Website/tools/verification/verify-cloudflare-config.mjs` — Phase 5 (#1)
- `Website/package.json` — register new `test:*` scripts

---

# Phase 1 — Request-scoped dedup with React `cache()`

Fixes original Finding #3 (no viewer memoization), review Finding C (double auth on `/shipping` + `/profile/all-pulls`), and review Finding A-interim (card catalog double-fetched). One mechanism — React `cache()` — solves all three with **no signature changes**.

### Task 1.1: `cache()`-wrap the auth resolvers

**Files:**
- Modify: `Website/src/lib/auth/resolve-current-profile.ts`
- Test: `Website/scripts/test-request-dedup.mjs`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-request-dedup.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const authSrc = readFileSync(
  fileURLToPath(new URL("../src/lib/auth/resolve-current-profile.ts", import.meta.url)),
  "utf8",
);

test("resolveCurrentProfile is request-memoized via React cache()", () => {
  assert.match(authSrc, /import \{ cache \} from "react"/);
  assert.match(authSrc, /export const resolveCurrentProfile = cache\(async \(/);
});

test("resolveAdminSession is request-memoized via React cache()", () => {
  assert.match(authSrc, /export const resolveAdminSession = cache\(async \(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Website && node --test scripts/test-request-dedup.mjs`
Expected: FAIL (`resolveCurrentProfile` is still `export async function`).

- [ ] **Step 3: Implement — wrap both resolvers in `cache()`**

In `Website/src/lib/auth/resolve-current-profile.ts`, add the import after the `"server-only"` line:

```ts
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
```

Change the `resolveCurrentProfile` declaration (currently `export async function resolveCurrentProfile(): Promise<ResolvedProfileSession | null> {`) to:

```ts
export const resolveCurrentProfile = cache(async (): Promise<ResolvedProfileSession | null> => {
```

…and change its closing `}` to `});`.

Change the `resolveAdminSession` declaration (currently `export async function resolveAdminSession(baseSession?: ResolvedProfileSession | null): Promise<ResolvedAdminSession | null> {`) to:

```ts
export const resolveAdminSession = cache(async (baseSession?: ResolvedProfileSession | null): Promise<ResolvedAdminSession | null> => {
```

…and change its closing `}` to `});`.

> Why this is safe: within a single request the profile + admin status are constant, so memoizing is correct. `cache()` does NOT persist across requests. `resolveDevPreviewProfile` (a hoisted `function` declaration) and `cookies()` work unchanged inside `cache()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Website && node --test scripts/test-request-dedup.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/auth/resolve-current-profile.ts Website/scripts/test-request-dedup.mjs
git commit -m "perf: memoize auth resolvers per request with React cache()"
```

### Task 1.2: `cache()`-wrap `getYnotViewer`

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (import + `getYnotViewer` at ~1703)
- Test: `Website/scripts/test-request-dedup.mjs`

- [ ] **Step 1: Add the failing test** (append to `test-request-dedup.mjs`)

```js
const dataSrc = readFileSync(
  fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)),
  "utf8",
);

test("getYnotViewer is request-memoized via React cache()", () => {
  assert.match(dataSrc, /import \{ cache \} from "react"/);
  assert.match(dataSrc, /export const getYnotViewer = cache\(async \(/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-request-dedup.mjs`
Expected: FAIL (still `export async function getYnotViewer`).

- [ ] **Step 3: Implement**

In `Website/src/features/ynot/data.ts`, add to the top imports (the file imports `unstable_cache` from `next/cache` at line 4 — add a separate React import):

```ts
import { cache } from "react";
```

Change `export async function getYnotViewer(): Promise<YnotViewer> {` (line ~1703) to:

```ts
export const getYnotViewer = cache(async (): Promise<YnotViewer> => {
```

…and change its closing `}` (the `}` directly after the `return { ... };` block, line ~1715) to `});`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-request-dedup.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-request-dedup.mjs
git commit -m "perf: memoize getYnotViewer per request with React cache()"
```

### Task 1.3: Request-cached card catalog (kills the double-fetch)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (add wrapper; 3 call sites at ~2900, ~3219, ~3711)
- Test: `Website/scripts/test-request-dedup.mjs`

- [ ] **Step 1: Add the failing test** (append)

```js
test("customer paths share one card catalog fetch per request", () => {
  // The request-scoped wrapper exists...
  assert.match(dataSrc, /const getRequestCardCatalog = cache\(\(\) =>\s*getCardCatalog\(createServiceSupabaseClient\(\)\)\)/s);
  // ...and the three customer fetchers no longer call getCardCatalog(supabase) directly.
  const collection = sliceFn(dataSrc, "export async function getCollection");
  const history = sliceFn(dataSrc, "export async function getGachaOpenHistory");
  const shipping = sliceFn(dataSrc, "export async function getShipping");
  for (const [name, fn] of [["getCollection", collection], ["getGachaOpenHistory", history], ["getShipping", shipping]]) {
    assert.doesNotMatch(fn, /getCardCatalog\(supabase\)/, `${name} should use getRequestCardCatalog()`);
    assert.match(fn, /getRequestCardCatalog\(\)/, `${name} should call getRequestCardCatalog()`);
  }
});
```

Add this helper near the top of `test-request-dedup.mjs` (mirrors `test-gacha-dedup.mjs`):

```js
function sliceFn(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |export )/);
  return src.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-request-dedup.mjs`
Expected: FAIL (`getRequestCardCatalog` not defined; call sites still use `getCardCatalog(supabase)`).

- [ ] **Step 3: Implement the wrapper + swap call sites**

In `Website/src/features/ynot/data.ts`, add the wrapper directly below the `getCardCatalog` import (line 11 imports it from `@/lib/lucky-draw/data`). Place this after the existing top-level imports/consts (e.g. just above `getYnotViewer`):

```ts
// Card catalog is identical for every consumer in a render. Memoize per request
// so /shipping (collection + shipping) and /profile/all-pulls (collection +
// gachaOpens) fetch it once instead of twice. cache() creates its own client so
// keying is stable (the per-caller `supabase` arg differed before, defeating dedup).
const getRequestCardCatalog = cache(() => getCardCatalog(createServiceSupabaseClient()));
```

Swap the three customer call sites:

`getCollection` (~2899): change
```ts
    readOrEmpty("collection_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
```
to
```ts
    readOrEmpty("collection_card_catalog", async () =>
      getRequestCardCatalog(),
    ),
```

`getGachaOpenHistory` (~3218): change
```ts
    readOrEmpty("gacha_history_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
```
to
```ts
    readOrEmpty("gacha_history_card_catalog", async () =>
      getRequestCardCatalog(),
    ),
```

`getShipping` (~3711): change
```ts
      readOrEmpty("shipping_card_catalog", async () => getCardCatalog(supabase)),
```
to
```ts
      readOrEmpty("shipping_card_catalog", async () => getRequestCardCatalog()),
```

> Leave the admin call sites (`getCardCatalog(supabase)` at ~4166, ~4658) untouched — they are not on the customer hot path and run in different requests.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-request-dedup.mjs && node --test scripts/test-gacha-dedup.mjs && npm run typecheck`
Expected: PASS (gacha-dedup still green — this doesn't touch `card_stock_units`).

- [ ] **Step 5: Register the npm script + commit**

In `Website/package.json` add to `scripts`:
```json
    "test:request-dedup": "node --test scripts/test-request-dedup.mjs",
```

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-request-dedup.mjs Website/package.json
git commit -m "perf: share one card catalog fetch per request across customer pages"
```

---

# Phase 2 — Parallelize serial query waterfalls

All behaviour-safe (same data, fired concurrently). Depends on Phase 1 (`getYnotViewer` cached) for the page tasks.

### Task 2.1: Parallelize wallet + campaign on pack/gacha detail pages (Finding #2)

**Files:**
- Modify: `Website/src/app/(store)/packs/[slug]/page.tsx`
- Modify: `Website/src/app/(store)/gacha/[campaignId]/page.tsx`
- Test: `Website/scripts/test-data-parallelization.mjs`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-data-parallelization.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}
function sliceFn(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |export )/);
  return src.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}

const packDetail = read("../src/app/(store)/packs/[slug]/page.tsx");
const gachaDetail = read("../src/app/(store)/gacha/[campaignId]/page.tsx");

test("pack detail fetches wallet slice and campaign in parallel", () => {
  assert.match(packDetail, /getYnotViewer/);
  // wallet (slice) and campaign are in one Promise.all, not awaited serially
  assert.match(packDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});

test("gacha detail fetches wallet slice and campaign in parallel", () => {
  assert.match(gachaDetail, /getYnotViewer/);
  assert.match(gachaDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs`
Expected: FAIL (pages still `await getYnotDashboardSlice` then `await getCampaign`).

- [ ] **Step 3: Implement — pack detail page**

In `Website/src/app/(store)/packs/[slug]/page.tsx`, change the import line 6 to add `getYnotViewer`:

```ts
import { getCampaign, getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";
```

Replace the body fetch (lines 15–24):

```tsx
  const [{ slug }, data] = await Promise.all([
    params,
    getYnotDashboardSlice({
      wallet: true,
    }),
  ]);
  const campaign = await getCampaign(slug, {
    allowTestForCurrentViewer: true,
    viewer: data.viewer,
  });
```

with:

```tsx
  const [{ slug }, viewer] = await Promise.all([params, getYnotViewer()]);
  const [data, campaign] = await Promise.all([
    getYnotDashboardSlice({ wallet: true }),
    getCampaign(slug, { allowTestForCurrentViewer: true, viewer }),
  ]);
```

> `getYnotDashboardSlice` internally calls `getYnotViewer()` — now a cache hit, returning the same `viewer` object, so `data.viewer === viewer`. The wallet fetch (inside the slice) and the campaign fetch now overlap.

- [ ] **Step 4: Implement — gacha detail page**

In `Website/src/app/(store)/gacha/[campaignId]/page.tsx`, change import line 3:

```ts
import { getCampaign, getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";
```

Replace lines 8–12:

```tsx
  const [{ campaignId }, data] = await Promise.all([
    params,
    getYnotDashboardSlice({ wallet: true }),
  ]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
```

with:

```tsx
  const [{ campaignId }, viewer] = await Promise.all([params, getYnotViewer()]);
  const [data, campaign] = await Promise.all([
    getYnotDashboardSlice({ wallet: true }),
    getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer }),
  ]);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs && node --test scripts/test-campaign-detail-perf.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "Website/src/app/(store)/packs/[slug]/page.tsx" "Website/src/app/(store)/gacha/[campaignId]/page.tsx" Website/scripts/test-data-parallelization.mjs
git commit -m "perf: parallelize wallet + campaign fetch on pack/gacha detail pages"
```

### Task 2.2: Parallelize lineup/readiness/identity/last-prize in `getCampaign` (Finding D1)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (lines ~2542–2569)
- Test: `Website/scripts/test-data-parallelization.mjs`

- [ ] **Step 1: Add the failing test** (append)

```js
const dataSrc = read("../src/features/ynot/data.ts");

test("getCampaign resolves lineup, readiness, identity and last-prize in one Promise.all", () => {
  const fn = sliceFn(dataSrc, "export async function getCampaign");
  assert.match(fn, /const \[prizeLineup, readiness, identityMismatchResult, lastPrizePreview\] =\s*await Promise\.all\(/s);
  assert.doesNotMatch(fn, /campaign\.lastPrizePreview = await resolveLastPrizePreview/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `getCampaign` (`Website/src/features/ynot/data.ts`), replace the block from the `const prizeLineup = await getPublicPrizeLineup(...)` declaration (line ~2542) through the `campaign.lastPrizePreview = await resolveLastPrizePreview(supabase, row);` line (line ~2569). Current code:

```ts
    const prizeLineup = await getPublicPrizeLineup(supabase, row, inventory, {
      includeLocked: includePrivateDetail,
      includeSensitiveOdds: includePrivateDetail,
      includeStockTarget: includePrivateDetail,
    }, prizeRows);
    let readiness: CampaignPrizeReadiness | null = null;
    try {
      readiness = await getCampaignPrizeReadiness(supabase, row.id, {
        row,
        inventory,
        includeIdentityMismatches: includePrivateDetail,
        prizes: prizeRows,
      });
    } catch (error) {
      recordDataIssue("campaign_detail_prize_readiness", error);
    }
    const identityMismatchResult = includePrivateDetail
      ? await getPrizeUnitIdentityMismatches(supabase, row.id)
      : undefined;
    const campaign = toYnotCampaign(
      row,
      linkedCategories,
      inventory,
      prizeLineup,
      readiness,
      identityMismatchResult,
    );
    campaign.lastPrizePreview = await resolveLastPrizePreview(supabase, row);
```

Replace with:

```ts
    const [prizeLineup, readiness, identityMismatchResult, lastPrizePreview] =
      await Promise.all([
        getPublicPrizeLineup(supabase, row, inventory, {
          includeLocked: includePrivateDetail,
          includeSensitiveOdds: includePrivateDetail,
          includeStockTarget: includePrivateDetail,
        }, prizeRows),
        getCampaignPrizeReadiness(supabase, row.id, {
          row,
          inventory,
          includeIdentityMismatches: includePrivateDetail,
          prizes: prizeRows,
        }).catch((error): CampaignPrizeReadiness | null => {
          recordDataIssue("campaign_detail_prize_readiness", error);
          return null;
        }),
        includePrivateDetail
          ? getPrizeUnitIdentityMismatches(supabase, row.id)
          : Promise.resolve(undefined),
        resolveLastPrizePreview(supabase, row),
      ]);
    const campaign = toYnotCampaign(
      row,
      linkedCategories,
      inventory,
      prizeLineup,
      readiness,
      identityMismatchResult,
    );
    campaign.lastPrizePreview = lastPrizePreview;
```

> Behaviour preserved: readiness still degrades to `null` on error via the local `.catch` (was a local try/catch); lineup/identity/last-prize errors still propagate to the enclosing `readOrEmpty("campaign_detail", ...)` which returns `[]` → campaign falls back to `null` exactly as before.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs && node --test scripts/test-campaign-detail-perf.mjs && node --test scripts/test-pack-open-privacy.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-data-parallelization.mjs
git commit -m "perf: parallelize getCampaign lineup/readiness/identity/last-prize"
```

### Task 2.3: Parallelize the two queries inside `resolveLastPrizePreview` (Finding D2)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (lines ~808–834)
- Test: `Website/scripts/test-data-parallelization.mjs`

- [ ] **Step 1: Add the failing test** (append)

```js
test("resolveLastPrizePreview fetches card + stock units in parallel", () => {
  const fn = sliceFn(dataSrc, "async function resolveLastPrizePreview");
  assert.match(fn, /const \[cards, units\] = await Promise\.all\(/s);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `resolveLastPrizePreview`, replace the sequential `cards` then `units` reads (lines ~808–834). Current:

```ts
  const cards = await readSupabaseRows<{
    id: string;
    card_code: string | null;
    name: string | null;
    image_url: string | null;
  }>("last_prize_card", () =>
    supabase
      .from("cards")
      .select("id,card_code,name,image_url")
      .eq("id", cardId)
      .limit(1),
  );
  const card = cards[0];
  if (!card) return null;

  const units = await readSupabaseRows<{
    image_url: string | null;
    cert_number: string | null;
    grade: string | null;
    status: string | null;
  }>("last_prize_stock_units", () =>
    supabase
      .from("card_stock_units")
      .select("image_url,cert_number,grade,status")
      .eq("card_id", cardId)
      .neq("status", "deleted"),
  );
```

Replace with:

```ts
  const [cards, units] = await Promise.all([
    readSupabaseRows<{
      id: string;
      card_code: string | null;
      name: string | null;
      image_url: string | null;
    }>("last_prize_card", () =>
      supabase
        .from("cards")
        .select("id,card_code,name,image_url")
        .eq("id", cardId)
        .limit(1),
    ),
    readSupabaseRows<{
      image_url: string | null;
      cert_number: string | null;
      grade: string | null;
      status: string | null;
    }>("last_prize_stock_units", () =>
      supabase
        .from("card_stock_units")
        .select("image_url,cert_number,grade,status")
        .eq("card_id", cardId)
        .neq("status", "deleted"),
    ),
  ]);
  const card = cards[0];
  if (!card) return null;
```

> Behaviour preserved: same return value. The only change is the rare "card deleted but `last_prize_card_id` still set" case now also runs the units query (then discards it) — saves a round trip in the overwhelmingly common card-exists case.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-data-parallelization.mjs
git commit -m "perf: parallelize card + stock-unit reads in resolveLastPrizePreview"
```

### Task 2.4: Parallelize reward + collection lookups in `getGachaOpenHistory` (Finding D3)

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (lines ~3262–3291)
- Test: `Website/scripts/test-data-parallelization.mjs`

- [ ] **Step 1: Add the failing test** (append)

```js
test("getGachaOpenHistory fetches reward units + collection links in parallel", () => {
  const fn = sliceFn(dataSrc, "export async function getGachaOpenHistory");
  assert.match(fn, /const \[rewardPrizeUnits, collectionStockLinks\] =\s*openIds\.length\s*\?\s*await Promise\.all\(/s);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `getGachaOpenHistory`, replace the two sequential `const rewardPrizeUnits = ...` and `const collectionStockLinks = ...` blocks (lines ~3262–3291). Current:

```ts
  const rewardPrizeUnits = openIds.length
    ? await readOrEmpty("gacha_history_prize_unit_images", async () => {
        const { data, error } = await supabase
          .from("draw_round_prize_units")
          .select("gacha_open_item_id,card_stock_unit_id,status")
          .in("gacha_open_id", openIds);
        if (error) throw error;
        return data ?? [];
      })
    : [];
  const rewardStockUnitIds = [
    ...new Set(
      rewardPrizeUnits
        .map((unit) => unit.card_stock_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const collectionStockLinks = openIds.length
    ? await readOrEmpty("gacha_history_collection_stock_links", async () => {
        const { data, error } = await supabase
          .from("collection_items")
          .select("gacha_open_item_id,card_stock_unit_id")
          .eq("source_type", "gacha_open")
          .in("source_id", openIds)
          .not("gacha_open_item_id", "is", null)
          .not("card_stock_unit_id", "is", null);
        if (error) throw error;
        return data ?? [];
      })
    : [];
```

Replace with:

```ts
  const [rewardPrizeUnits, collectionStockLinks] = openIds.length
    ? await Promise.all([
        readOrEmpty("gacha_history_prize_unit_images", async () => {
          const { data, error } = await supabase
            .from("draw_round_prize_units")
            .select("gacha_open_item_id,card_stock_unit_id,status")
            .in("gacha_open_id", openIds);
          if (error) throw error;
          return data ?? [];
        }),
        readOrEmpty("gacha_history_collection_stock_links", async () => {
          const { data, error } = await supabase
            .from("collection_items")
            .select("gacha_open_item_id,card_stock_unit_id")
            .eq("source_type", "gacha_open")
            .in("source_id", openIds)
            .not("gacha_open_item_id", "is", null)
            .not("card_stock_unit_id", "is", null);
          if (error) throw error;
          return data ?? [];
        }),
      ])
    : [[], []];
  const rewardStockUnitIds = [
    ...new Set(
      rewardPrizeUnits
        .map((unit) => unit.card_stock_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
```

> The `collectionStockUnitIds` block that followed `collectionStockLinks` (line ~3292) stays exactly where it is, immediately after this. Only the two fetches were hoisted into the `Promise.all`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs && node --test scripts/test-gacha-dedup.mjs && npm run typecheck`
Expected: PASS (gacha-dedup still asserts `card_stock_units` fetched once — untouched).

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-data-parallelization.mjs
git commit -m "perf: parallelize reward + collection lookups in getGachaOpenHistory"
```

### Task 2.5: Parallelize campaign + tier animations on the open page (Finding D4)

**Files:**
- Modify: `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`
- Test: `Website/scripts/test-data-parallelization.mjs`

- [ ] **Step 1: Add the failing test** (append)

```js
const openPage = read("../src/app/(store)/gacha/[campaignId]/open/page.tsx");

test("open page fetches campaign + tier animations in parallel", () => {
  assert.match(openPage, /const \[campaign, tierAnimations\] = await Promise\.all\(\[\s*getOpenCampaignForReveal\(/s);
  assert.doesNotMatch(openPage, /const tierAnimations = await getTierAnimations\(\);/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`, replace line 22:

```tsx
  const campaign = await getOpenCampaignForReveal(campaignId, data.viewer);
```

with:

```tsx
  const [campaign, tierAnimations] = await Promise.all([
    getOpenCampaignForReveal(campaignId, data.viewer),
    getTierAnimations(),
  ]);
```

Then remove the now-redundant inner fetch inside the `if` branch (line ~27): delete this line:

```tsx
    const tierAnimations = await getTierAnimations();
```

(The `tierAnimations` variable is now already in scope for the `<GachaOpenPanelLazy ... tierAnimations={tierAnimations} />` usage.)

> Behaviour preserved: `tierAnimations` is still only *consumed* in the autoStart branch. On the cold (redirect) path it's fetched but unused — an acceptable, infrequent extra read (`getTierAnimations` is a small global lookup) in exchange for removing a full round trip from the hot "Open" click path. If `getTierAnimations()` throws, `Promise.all` rejects and the page errors — same as the original inline `await`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Website && node --test scripts/test-data-parallelization.mjs && node --test scripts/test-gacha-open-performance-shape.mjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Register npm script + commit**

In `Website/package.json` add to `scripts`:
```json
    "test:data-parallelization": "node --test scripts/test-data-parallelization.mjs",
```

```bash
git add "Website/src/app/(store)/gacha/[campaignId]/open/page.tsx" Website/scripts/test-data-parallelization.mjs Website/package.json
git commit -m "perf: parallelize campaign + tier animations on gacha open page"
```

### Phase 2 checkpoint

```bash
cd Website && npm run build
```
Expected: build succeeds. Run the full Verification Baseline suite — all green.

---

# Phase 3 — Narrow over-fetching selects (Finding F)

Behaviour-safe **once the column list is verified** against every raw-row consumer. House columns (`logic_snapshot`, `test_metadata`, `last_prize_metadata`) stay in the select (needed internally) but are still stripped by `publicYnotCampaign` before reaching the client.

### Task 3.1: Add a verified `draw_rounds` customer column constant + cap `/packs`

**Files:**
- Modify: `Website/src/features/ynot/data.ts` (selects at ~1844, ~2148, ~2477)
- Test: `Website/scripts/test-customer-select-narrowing.mjs`

- [ ] **Step 1: Discovery — enumerate every `draw_rounds` column consumed**

Run this to list every raw-row field access feeding the customer campaign builders:

```bash
cd Website
grep -oE "row\.[a-z_]+" src/features/ynot/data.ts | sort -u
node -e "const s=require('fs').readFileSync('src/features/ynot/data.ts','utf8'); const m=s.slice(s.indexOf('function toYnotCampaign')); console.log([...new Set((m.match(/row\.[a-z_]+/g)||[]))].sort().join('\n'))"
```

Record the union. Cross-check against `OPEN_CAMPAIGN_SELECT` (line ~2241) and the columns read inside `getCampaign`/`loadPublicCampaignDetailImpl`/`getCampaignsImpl` outside `toYnotCampaign` (e.g. `row.is_test`, `row.last_prize_metadata` via `resolveLastPrizePreview`, `row.logic_snapshot`). The candidate set (verify, then adjust if the grep reveals more):

```
id, slug, status, approval_status, series, title_th, title_en, price_thb,
cost_coins, mode, visibility, total_slots, pack_code, sort_order,
starts_at, ends_at, created_at, approval_requested_at, approved_at,
approval_notes, is_test, test_metadata, banner_image_url,
banner_image_storage_path, last_prize_card_id, last_prize_metadata,
convert_deadline_days, logic_snapshot, featured_cards, chase_cards
```

- [ ] **Step 2: Write the failing test**

Create `Website/scripts/test-customer-select-narrowing.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const src = readFileSync(fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)), "utf8");

test("a shared customer column constant exists for draw_rounds", () => {
  assert.match(src, /const CAMPAIGN_CUSTOMER_SELECT = \[/);
});

test("customer draw_rounds reads do not use select(\"*\")", () => {
  for (const marker of [
    "async function getCampaignsImpl",
    "async function loadPublicCampaignDetailImpl",
  ]) {
    const start = src.indexOf(marker);
    const fn = src.slice(start, start + 2500);
    assert.doesNotMatch(fn, /\.from\("draw_rounds"\)\s*\.select\("\*"\)/, `${marker} still selects *`);
  }
});

test("getCampaignsImpl caps the campaign list to avoid the 1000-row PostgREST truncation", () => {
  const start = src.indexOf("async function getCampaignsImpl");
  const fn = src.slice(start, start + 2500);
  assert.match(fn, /\.limit\(CAMPAIGN_LIST_HARD_CAP\)/);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd Website && node --test scripts/test-customer-select-narrowing.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement the constant + cap**

In `Website/src/features/ynot/data.ts`, just above `OPEN_CAMPAIGN_SELECT` (line ~2241), add (using the column set verified in Step 1):

```ts
// Explicit customer column list for draw_rounds reads. House columns
// (logic_snapshot, test_metadata, last_prize_metadata) are fetched because
// internal builders need them, but publicYnotCampaign() strips them before the
// client. Verified against toYnotCampaign + resolveLastPrizePreview consumers.
const CAMPAIGN_CUSTOMER_SELECT = [
  "id", "slug", "status", "approval_status", "series", "title_th", "title_en",
  "price_thb", "cost_coins", "mode", "visibility", "total_slots", "pack_code",
  "sort_order", "starts_at", "ends_at", "created_at", "approval_requested_at",
  "approved_at", "approval_notes", "is_test", "test_metadata", "banner_image_url",
  "banner_image_storage_path", "last_prize_card_id", "last_prize_metadata",
  "convert_deadline_days", "logic_snapshot", "featured_cards", "chase_cards",
].join(",");

// Realistic upper bound on simultaneously-visible packs. Prevents the unbounded
// /packs select from silently truncating at PostgREST max_rows (1000).
const CAMPAIGN_LIST_HARD_CAP = 500;
```

In `getCampaignsImpl` (`loadRows`, line ~1843–1844) change:

```ts
      let query = supabase
        .from("draw_rounds")
        .select("*")
```
to
```ts
      let query = supabase
        .from("draw_rounds")
        .select(CAMPAIGN_CUSTOMER_SELECT)
```

…and where the limit is applied (line ~1852), change:

```ts
      if (typeof limit === "number") query = query.limit(limit);
```
to
```ts
      query = query.limit(typeof limit === "number" ? limit : CAMPAIGN_LIST_HARD_CAP);
```

In `loadPublicCampaignDetailImpl` `baseSelect` (line ~2147–2148) change `.select("*")` to `.select(CAMPAIGN_CUSTOMER_SELECT)`.

> Leave `getCampaign`'s admin/UUID body select at ~2477 as `select("*")` for now — it runs only for admins (never a customer), so narrowing it is Optional Follow-up O3, not part of this behaviour-neutral task.

- [ ] **Step 5: Run to verify it passes (with full regression)**

Run:
```bash
cd Website
node --test scripts/test-customer-select-narrowing.mjs
node --test scripts/test-pack-open-privacy.mjs
node --test scripts/test-campaign-detail-privacy.mjs
node --test scripts/test-campaign-detail-perf.mjs
npm run typecheck && npm run build
```
Expected: ALL PASS. If `typecheck`/`build` reports a missing property on a `draw_rounds` row, add that column to `CAMPAIGN_CUSTOMER_SELECT` and re-run (this is the safety gate that proves no consumed column was dropped).

- [ ] **Step 6: Register npm script + commit**

In `Website/package.json` add:
```json
    "test:customer-select-narrowing": "node --test scripts/test-customer-select-narrowing.mjs",
```

```bash
git add Website/src/features/ynot/data.ts Website/scripts/test-customer-select-narrowing.mjs Website/package.json
git commit -m "perf: narrow customer draw_rounds selects and cap /packs list"
```

---

# Phase 4 — Behaviour-affecting fixes (⚠️ REQUIRES SIGN-OFF)

These change what the customer sees. **Do not start until the product owner approves each.** Present the behaviour delta, get explicit yes, then implement.

### Task 4.1: Fix the "Mystery card" bug — fetch owned cards by id (Finding A-full)

**Behaviour delta to approve:** Today `getCardCatalog` returns only the 250 most-recently-updated cards. Any owned/pulled card outside that window renders as "Mystery card"/"Mystery reward" in a customer's collection, gacha history, and shipping picker. Once the `cards` table exceeds 250 rows this silently mislabels real cards. This task makes those cards display correctly — i.e. it **changes output** (Mystery → real card) for affected rows.

**Files:**
- Modify: `Website/src/lib/lucky-draw/data.ts` (add `getCardCatalogByIds`)
- Modify: `Website/src/features/ynot/data.ts` (`getCollection` ~2877, `getGachaOpenHistory` ~3186, `getShipping` ~3502)
- Test: `Website/scripts/test-customer-select-narrowing.mjs`

- [ ] **Step 1: Write the failing test** (append to `test-customer-select-narrowing.mjs`)

```js
const luckySrc = readFileSync(fileURLToPath(new URL("../src/lib/lucky-draw/data.ts", import.meta.url)), "utf8");

test("getCardCatalogByIds fetches the catalog scoped to referenced ids (no 250 cap)", () => {
  assert.match(luckySrc, /export async function getCardCatalogByIds\(/);
  assert.match(luckySrc, /\.in\("id", /);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Website && node --test scripts/test-customer-select-narrowing.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `getCardCatalogByIds`**

In `Website/src/lib/lucky-draw/data.ts`, directly after `getCardCatalog` (line ~297), add:

```ts
export async function getCardCatalogByIds(
  supabase: Supabase,
  cardIds: readonly string[],
): Promise<CardCatalogItem[]> {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return [];
  const out: CardCatalogItem[] = [];
  // Page in 500-id chunks: keeps each request under PostgREST max_rows and
  // under URL length limits for large .in() lists.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase.from("cards").select("*").in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) out.push(toCatalogItem(row));
  }
  return out;
}
```

- [ ] **Step 4: Switch the three customer fetchers to id-scoped catalog**

The card IDs are known before the catalog fetch in each function. Update each to gather IDs from its already-fetched rows, then call `getCardCatalogByIds`. Because the IDs come from rows fetched in the same `Promise.all`, restructure each so the catalog fetch follows the row fetch.

**`getCollection`** — the `collection_items` rows carry `card_id`. Change the `Promise.all` at ~2888 so the catalog is fetched from the item card ids:

```ts
  const items = await readOrEmpty("collection", async () => {
    const { data, error } = await supabase
      .from("collection_items")
      .select("*")
      .eq("profile_id", profileId)
      .order("acquired_at", { ascending: false })
      .limit(collectionLimit);
    if (error) throw error;
    return data ?? [];
  });
  const cards = await readOrEmpty("collection_card_catalog", async () =>
    getCardCatalogByIds(supabase, items.map((item) => item.card_id)),
  );
```

**`getGachaOpenHistory`** — replace the catalog entry in the `Promise.all` at ~3208. Gather card ids from `gacha_open_items` after they're fetched:

```ts
  const items = await readOrEmpty("gacha_open_items", async () => {
    const { data, error } = await supabase
      .from("gacha_open_items")
      .select("*")
      .in("gacha_open_id", openIds)
      .order("result_position", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });
  const [cards, campaigns] = await Promise.all([
    readOrEmpty("gacha_history_card_catalog", async () =>
      getCardCatalogByIds(supabase, items.map((item) => item.card_id)),
    ),
    /* keep the existing `campaigns` query expression that was the 3rd entry of the original Promise.all */
  ]);
```

> Copy the exact `campaigns` query expression from the original `Promise.all` (the entry after the catalog) into the placeholder above, unchanged.

**`getShipping`** — the `gacha_open_items` rows (fetched at ~3699) carry `card_id`. After that `Promise.all` resolves, replace the `shipping_card_catalog` entry with an id-scoped fetch keyed off `openItems`:

```ts
      readOrEmpty("shipping_card_catalog", async () =>
        getCardCatalogByIds(supabase, openItems.map((item) => item.card_id)),
      ),
```

> `openItems` must be in scope when the catalog is fetched. If it is currently a sibling entry in the same `Promise.all`, split the catalog fetch to run *after* that `Promise.all` resolves (same shape as `getCollection` above). Verify with `typecheck`.

- [ ] **Step 5: Add `getCardCatalogByIds` to the import in `data.ts`**

Line 11 currently: `import { getCardCatalog, isSupabaseConfigured } from "@/lib/lucky-draw/data";` → add the new symbol:

```ts
import { getCardCatalog, getCardCatalogByIds, isSupabaseConfigured } from "@/lib/lucky-draw/data";
```

(Keep `getCardCatalog` imported — admin paths still use it via `getRequestCardCatalog`.)

- [ ] **Step 6: Run to verify it passes**

Run:
```bash
cd Website
node --test scripts/test-customer-select-narrowing.mjs
node --test scripts/test-pack-open-privacy.mjs
npm run typecheck && npm run build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Website/src/lib/lucky-draw/data.ts Website/src/features/ynot/data.ts Website/scripts/test-customer-select-narrowing.mjs
git commit -m "fix: render all owned cards by fetching catalog by id (drop 250-row cap)"
```

### Task 4.2: Stop the hidden wallet fetch on the homepage (Finding B)

**Behaviour delta to approve:** The authenticated homepage header coin currently shows the *live* wallet balance because `YnotShell` does an unplanned `getWallet()` on `/` (contradicting `getYnotPublicHomeData`'s "no wallet reads" design). **Recommended behaviour-preserving option:** keep showing the balance but fetch it client-side after paint, so the `/` server render drops the round trip while the UI looks identical (brief late-fill of the number). Approve this approach, or choose to show the default instead.

**Files:**
- Modify: `Website/src/app/page.tsx` (pass an explicit balance so the shell skips the server fetch)
- Modify: `Website/src/features/ynot/components.tsx` (header coin: hydrate balance client-side when not provided)

- [ ] **Step 1: Confirm the approach with the owner**, then implement the minimal server-side change first:

In `Website/src/app/page.tsx`, pass the known default so the shell's `typeof renderBalance !== "number"` guard is satisfied and **no** server `getWallet` fires (`getYnotPublicHomeData` already returns `DEFAULT_WALLET`):

```tsx
    <YnotShell
      viewer={data.viewer}
      walletBalance={data.wallet.balanceCoins}
      shellClassName="ynot-home-mint"
    >
```

- [ ] **Step 2: Preserve the live number via a client-side fill**

If the owner wants the live balance to still appear (recommended), add a small client component that fetches `/api/ynot/wallet` on mount and updates the header coin, mounted only when `showHeaderCoin && viewer.authenticated`. Reuse the existing pattern from `Website/src/features/ynot/cr/WalletExperience.tsx:153` (`fetch("/api/ynot/wallet", ...)`). Wire it into the header coin render in `components.tsx` so the server render no longer calls `getWallet` but the displayed value still converges to live.

> This task is intentionally specified at the approach level because the exact JSX depends on the owner's choice (live-fill vs. show-default). Implement only the chosen variant; both keep the `/` server render free of the wallet round trip.

- [ ] **Step 3: Verify + commit**

Run: `cd Website && npm run typecheck && npm run build`

```bash
git add Website/src/app/page.tsx Website/src/features/ynot/components.tsx
git commit -m "perf: drop server wallet fetch on homepage render (Finding B)"
```

---

# Phase 5 — Infra & DB high-leverage levers (⚠️ REQUIRES SIGN-OFF)

### Task 5.1: Enable a real OpenNext incremental cache (Finding #1 — the biggest CPU lever)

**Behaviour delta to approve:** Activates the `unstable_cache` + `revalidateTag` system that is currently inert. Shared *browse* data (campaign list, pack-detail badges, categories, payment methods, rankings) becomes cacheable for its configured TTL (30–60s), then auto-busted by the existing `revalidateTag` calls on admin mutations. Per-viewer data (wallet, collection, the live open RPC) stays live. This is the designed freshness window from `data.ts:2229`. **Requires a Cloudflare KV namespace + D1 database (account access).**

**Files:**
- Modify: `Website/open-next.config.ts`
- Modify: `Website/wrangler.website.jsonc`, `Website/wrangler.website.ci.jsonc`
- Modify: `Website/tools/verification/verify-cloudflare-config.mjs`

- [ ] **Step 1: Create the Cloudflare resources** (records namespace/db ids you must paste into wrangler)

```bash
cd Website
npx wrangler kv namespace create YNOTT_INCREMENTAL_CACHE
npx wrangler d1 create ynott-next-tag-cache
```
Copy the `id` from each command's output for Step 3.

- [ ] **Step 2: Configure OpenNext overrides**

Replace `Website/open-next.config.ts` with:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// Activates the unstable_cache data cache (KV) and revalidateTag invalidation
// (D1). Per-viewer reads (wallet/collection/open RPC) are uncached and stay live.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: d1NextTagCache,
});
```

> Confirm the exact override import paths against the installed `@opennextjs/cloudflare` version (`ls node_modules/@opennextjs/cloudflare/dist/overrides/`). Adjust if the package renamed them.

- [ ] **Step 3: Bind KV + D1 in BOTH website wrangler configs**

Add to `Website/wrangler.website.jsonc` and `Website/wrangler.website.ci.jsonc` (top level, alongside `assets`), pasting the ids from Step 1:

```jsonc
  "kv_namespaces": [
    { "binding": "NEXT_INC_CACHE_KV", "id": "<KV_NAMESPACE_ID_FROM_STEP_1>" }
  ],
  "d1_databases": [
    { "binding": "NEXT_TAG_CACHE_D1", "database_name": "ynott-next-tag-cache", "database_id": "<D1_DATABASE_ID_FROM_STEP_1>" }
  ],
```

> Binding names must match what the chosen OpenNext overrides expect — verify against the override docs/source for your version and rename if needed.

- [ ] **Step 4: Extend the config verifier**

In `Website/tools/verification/verify-cloudflare-config.mjs`, inside `validateWorkerConfig`, add:

```js
  check(`${rel} binds the incremental cache KV namespace`,
    (config.kv_namespaces ?? []).some((n) => n.binding === "NEXT_INC_CACHE_KV"));
  check(`${rel} binds the tag cache D1 database`,
    (config.d1_databases ?? []).some((d) => d.binding === "NEXT_TAG_CACHE_D1"));
```

- [ ] **Step 5: Verify config + build**

Run:
```bash
cd Website
npm run verify:cloudflare
npm run cf:typegen:website
npm run build
```
Expected: verifier passes; typegen regenerates `cloudflare-env.d.ts` with the new bindings; build succeeds.

- [ ] **Step 6: Smoke-test cache behaviour on a preview**

Run `npm run cf:preview:website`, load `/packs` twice, and confirm via the OpenNext logs / Supabase request count that the second load serves campaigns from cache (no repeated `draw_rounds` query within the 60s TTL). Then perform an admin campaign edit and confirm `/packs` reflects it immediately (revalidateTag bust).

- [ ] **Step 7: Commit**

```bash
git add Website/open-next.config.ts Website/wrangler.website.jsonc Website/wrangler.website.ci.jsonc Website/tools/verification/verify-cloudflare-config.mjs Website/cloudflare-env.d.ts
git commit -m "perf: enable Workers KV incremental cache + D1 tag cache (activates revalidateTag)"
```

### Task 5.2: Replace readiness unit pagination with a Postgres aggregation RPC (Finding E)

**Behaviour delta to approve:** Pure efficiency — same counts, computed in Postgres instead of paged into the Worker. Worth doing if packs can exceed ~1000 prize units (multi-round-trip + Worker memory today). Adds a migration.

**Files:**
- Create: `Database/supabase/migrations/<timestamp>_draw_round_prize_unit_counts.sql`
- Modify: `Website/src/features/ynot/prize-readiness.ts` (the `!usePlannedInventory` loop at ~694–717)

- [ ] **Step 1: Write the migration (aggregation function)**

Create `Database/supabase/migrations/<timestamp>_draw_round_prize_unit_counts.sql` (use a timestamp later than the latest existing migration):

```sql
-- Aggregate non-void prize-unit counts per prize in one round trip, replacing the
-- Worker-side .range() pagination over draw_round_prize_units.
create or replace function public.get_draw_round_prize_unit_counts(p_draw_round_id uuid)
returns table (draw_round_prize_id uuid, status text, unit_count bigint)
language sql
stable
as $$
  select draw_round_prize_id, status, count(*)::bigint as unit_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id
    and status <> 'void'
  group by draw_round_prize_id, status
$$;

revoke all on function public.get_draw_round_prize_unit_counts(uuid) from public, anon, authenticated;
grant execute on function public.get_draw_round_prize_unit_counts(uuid) to service_role;
```

- [ ] **Step 2: Apply + smoke the migration**

Apply via your normal migration path (Supabase MCP `apply_migration` or `supabase db push`). Then confirm via a smoke query that the function returns the same per-prize/status totals as the current loop for a known campaign.

- [ ] **Step 3: Swap the JS loop to call the RPC**

In `Website/src/features/ynot/prize-readiness.ts`, replace the paginated loop (lines ~702–717, the `const UNIT_PAGE_SIZE = 1000;` block through `const prizeUnitCounts = aggregateNonVoidPrizeUnitCounts(prizeIds, unitRows);`) with an RPC call that produces the same `prizeUnitCounts` shape `aggregateNonVoidPrizeUnitCounts` returns. Keep `aggregateNonVoidPrizeUnitCounts` for the unit tests, but feed it pre-aggregated rows, or adapt the downstream `for (const { prizeId, nonVoidCount, availableCount } of prizeUnitCounts)` consumer to the RPC rows. Verify the exact output contract against `scripts/test-stock-readiness.mjs` / `scripts/test-prize-unit-counts.mjs` before changing the consumer.

- [ ] **Step 4: Verify**

Run:
```bash
cd Website
node --test scripts/test-prize-unit-counts.mjs
node --test scripts/test-stock-readiness.mjs
node --test scripts/test-final-open-quantity.mjs
npm run typecheck
```
Expected: PASS (counts unchanged).

- [ ] **Step 5: Commit**

```bash
git add Database/supabase/migrations Website/src/features/ynot/prize-readiness.ts
git commit -m "perf: aggregate prize-unit counts in Postgres RPC instead of Worker paging"
```

---

# Optional Follow-ups (behaviour-safe, low priority — Finding G)

Not full TDD tasks; each is a small, isolated change. Do when touching the relevant file.

- **O1 — `gacha_opens` order/index match.** `getGachaOpenHistory` orders by `opened_at` but the index is `(profile_id, created_at desc)`. Either switch the `.order("opened_at", ...)` to `created_at` (verify the two columns never diverge first) **or** add a migration index `gacha_opens_profile_opened_idx on gacha_opens(profile_id, opened_at desc)`. The index option is strictly behaviour-safe.
- **O2 — Synchronous HMAC tokens.** `collectionItemActionToken` / `paymentMethodActionToken` are pure `createHmac` (no I/O) but are fanned out via `await Promise.all(...map(async ...))` in `getCollection`. Make them sync and use a plain `for` loop. Check all callers before dropping `async`.
- **O3 — Admin `getCampaign` select.** Narrow the `select("*")` in `getCampaign`'s admin body (~2477) to `CAMPAIGN_CUSTOMER_SELECT` for consistency (admin-only path, so not on the customer hot path).
- **O4 — Small-table selects.** `wallet_accounts` → `.select("profile_id,balance_coins,version")`; `store_categories`, `payment_methods` → explicit field lists matching their mappers. Negligible payoff; bundle into other edits.
- **O5 — Bundle split (original #5).** `Website/src/app/(store)/exchange/page.tsx` and `.../shipping/page.tsx` import from the 14.6k-line `src/features/ynot/client.tsx` barrel. **First measure** the emitted chunk for those routes (`npm run build` + inspect `.open-next`/`.next` output). If heavy, extract `CollectionConvertPanel` and `ShippingRequestExperience` into their own `cr/*` files. Skip if the bundler already tree-shakes them.

---

## Self-Review

- **Spec coverage:** Original #1 (Phase 5.1), #2 (2.1), #3 (1.1/1.2), #5 (O5). Review A-interim (1.3), A-full (4.1), B (4.2), C (1.1 — `cache()` makes the second `getYnotViewer` in the slice a hit, eliminating the double auth resolution), D1–D4 (2.2–2.5), E (5.2), F (3.1), G (O1–O4). All findings mapped.
- **Behaviour-safety:** Phases 1–3 + optionals are timing/dedup/narrowing only and guarded by the existing privacy/perf suites. Phase 4–5 behaviour deltas are explicitly gated with sign-off steps. Leak boundary unchanged everywhere (house columns still stripped by `publicYnotCampaign`; narrowed selects keep the columns internal builders need).
- **Type/name consistency:** `getRequestCardCatalog`, `getCardCatalogByIds`, `CAMPAIGN_CUSTOMER_SELECT`, `CAMPAIGN_LIST_HARD_CAP`, `get_draw_round_prize_unit_counts` are used consistently across their defining and consuming tasks. `cache()` import added once per file.
- **Known gaps requiring in-task verification:** the exact `CAMPAIGN_CUSTOMER_SELECT` column list (3.1 Step 1 discovery + build gate), Phase 4.2 JSX variant (owner choice), Phase 5.1 override import/binding names (version-specific), Phase 5.2 downstream count contract. Each has an explicit verify step rather than an assumption.
