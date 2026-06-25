# Admin Prize Catalog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin **Prize Catalog** screen to match the high-fidelity `design_handoff_prize_catalog_stock` prototype, wired to the **existing** Supabase backend, with static guard tests and a documented QA/merge gate.

**Architecture:** Frontend-only redesign. The prototype's "Phase B" inventory backend (per-cert variants, box→pack, cert lookup, prize→variant linkage) **already exists** in this repo under different names (`stock_skus`, `card_stock_units`, `open_stock_container`, `gemrate-cert`, `draw_round_prizes`). We replace the current `AdminCardCatalogPanel` (a single 1,558-line component in `client.tsx`) with a small, focused component tree under `src/features/ynot/admin/prize-catalog/`, reusing the existing data layer (`getAdminCards`, `getAdminPrizePool`) and admin API routes. New styles live in `globals.css` under a `.pcx-*` scope (matching how the repo already keeps admin CSS in `globals.css`). The visual markup is **ported from the prototype files** — they are the design source of truth.

**Tech Stack:** Next.js (App Router, custom build — read `Website/node_modules/next/dist/docs/` before writing Next code), React (client components), TypeScript (strict; no `any`), Supabase (service client, RPCs, RLS already in place), Node test runner (`node --test`, static source-assertion guard tests), Cloudflare Workers runtime.

---

## ⚠️ Read first: reality reconciliation (the most important section)

The handoff README (`design_handoff_prize_catalog_stock/README.md`) was written against an **outdated** view of the backend. Its premise — *"the live backend has no inventory concept"* and a Phase B that builds `card_variants` / `stock_movements` / `open_box` / PSA lookup — is **false today**. Verified against migrations and routes:

| Prototype concept (handoff) | Already exists as | Route / source of truth |
|---|---|---|
| Main card (catalog identity) | **Main SKU** = `cards` row → `CardCatalogItem` | `GET/POST/PATCH/DELETE /api/ynot/admin/cards`; `getAdminCards()` |
| Variant (graded / raw / sealed) | **Sub-SKU** = `stock_skus` (`unit_kind` card/pack/box/other) + `card_stock_units` (status/condition/grade/cert/gemrate) | `stock-skus`, `card-stock` routes; `card.stockSkuGroups` |
| Per-cert graded row (1 cert = 1 card) | `card_stock_units` with `cert_number` + `gemrate_id`; cert pins `delta=1` | `POST /api/ynot/admin/card-stock` (rejects cert with delta≠1) |
| Raw / ungraded pooled line | `condition='raw'` units under a sub-SKU | `POST /api/ynot/admin/card-stock` |
| Test stock (blank cert, qty>1, `TEST` tag) | graded unit w/o cert; `cards.is_test` + asset-audit fields required | `cards` + `card-stock` routes |
| Sealed Box / Sealed Pack categories | `cards.catalog_category` + sub-SKU `unit_kind` box/pack | `cards.catalogCategory`; `stock-skus.unitKind` |
| Box → pack conversion | conversion rule (`childStockSkuId` + `childQuantity` = packs/box) + `open_stock_container` RPC | `POST /api/ynot/admin/stock-skus` then `POST /api/ynot/admin/stock-skus/open-container` |
| Stock states available / in packs / in bags / removed | `stockAvailable` / `stockReserved` / `stockAllocated` / `stockArchived` | `getAdminCards()` returns all four buckets per card |
| PSA cert lookup (mocked) | **GemRate** cert lookup (real, server-side) | `POST /api/ynot/admin/gemrate-cert` `{cert,grader}` → `{lookup}` (needs `GEMRATE_API_KEY`) |
| Assign variant → campaign as prize | `draw_round_prizes` + `metadata.intendedStock*` / `stockUnitUsages` | `POST /api/ynot/admin/prizes` |
| Remove prize | delete by `prizeId` | `DELETE /api/ynot/admin/prizes` |
| Winnable indicator (live campaign) | campaign `status='live'` + a prize row present | `GET /api/ynot/admin/campaigns` + prizes |
| Pull weight / unlock % | `weight` / `unlock_at_sold_pct` — **OWNER-ONLY, never expose to customers** | `prizes` POST (owner role gate); customer-leak invariant |
| Guard: can't delete card in a campaign | `CARD_IN_PRIZE_POOL` 409 | `DELETE /api/ynot/admin/cards` |
| Guard: can't delete variant with active/loaded stock | `CARD_HAS_ACTIVE_STOCK` 409 | `DELETE /api/ynot/admin/cards` |
| Card / variant image upload | upload → `{ url, storagePath }` | `POST /api/lucky-draw/admin/card-image` or `POST /api/ynot/admin/cards/image` |
| Movement log | `audit_events` rows + stock-movement writes inside RPCs | `audit_events` (`card_stock_adjusted`, `campaign_prize_saved`, …) |

**Consequences for this plan:**
1. **No database migrations.** Phase 0 includes one verification task to confirm there is no genuine backend gap; if a true gap is found it is recorded as a follow-up, not built blind.
2. **Two prototype guardrails it ignores, which we must honor:**
   - Assigning **or** removing a prize triggers `markCampaignNeedsOwnerReview` server-side — the UI must surface "owner review required before publish."
   - `valueThb`, `weight`, `unlockAtSoldPct` are **owner-only** (server returns 403 for non-owner). The redesign must hide those inputs for non-owners and must never render weight/unlock anywhere a customer could see (this screen is admin-gated, but tests assert it).
3. **`series` is brand free-text** server-side, normalized to `pokemon` / `one_piece` for the two built-ins. The create form constrains the picker to the two built-ins + "custom", matching `cardPatch()` in `cards/route.ts`.

---

## Environment & conventions

- **All paths below are relative to repo root.** The app lives in `Website/`. Run all `npm` commands from `Website/`.
- **Branch:** `feat/admin-prize-stock` (never commit to `main`; prod deploys on push to `main`).
- **Verification (per project memory `npm run check` cannot go green locally):** use `npm run lint`, `npm run typecheck`, targeted `node --test scripts/<file>.mjs`, and `npm run verify:platform`. Do **not** rely on full `npm run check` locally.
- **Test idiom:** guard tests are `node --test` files in `Website/scripts/test-*.mjs` that `readFileSync` a route/component/CSS file and `assert` patterns are present/absent. There is **no** Playwright/vitest/RTL in this repo. Model new tests on `scripts/test-stock-subsku-admin-api.mjs`.
- **Commit cadence:** one commit per task (after its tests pass). Conventional commits (`feat:`, `test:`, `refactor:`, `style:`, `docs:`).
- **Prototype = visual source of truth.** When a step says "port markup," copy the element/class structure from the named prototype function in `design_handoff_prize_catalog_stock/catalog-stock.js` (or the HTML/CSS files) and translate to JSX. Keep prototype class names but prefix new ones with `pcx-` to avoid collisions in `globals.css`.

---

## File structure

New feature module (small, focused files — high cohesion):

```text
Website/src/features/ynot/admin/prize-catalog/
├── index.ts                     # re-exports PrizeCatalogScreen
├── catalog-api.ts               # typed fetch wrappers for ALL existing routes used here
├── catalog-format.ts            # pure presentation helpers (stock-state mapping, labels, money)
├── PrizeCatalogScreen.tsx       # container: data props, filter state, composition
├── CatalogKpis.tsx              # 4 KPI cards
├── CatalogToolbar.tsx           # search + category tabs + legend + horizontal filter bar
├── LedgerRow.tsx                # collapsed row + expanded detail (detail grid, sections)
├── VariantTable.tsx            # per Sub-SKU / unit rows (grade chip, cert, counts, row actions)
├── AddStockDrawer.tsx           # 3-step add-stock wizard (category → find/create → add stock)
├── CertLookupField.tsx          # GemRate cert lookup (replaces mocked psaLookup)
├── MainSkuForm.tsx              # create / edit Main SKU (used by drawer + edit modal)
├── OpenBoxModal.tsx             # box → pack conversion
├── AssignCampaignModal.tsx      # assign a variant into a campaign as a prize
└── EditVariantModal.tsx         # edit / remove stock for one Sub-SKU/variant
```

Modified existing files:

- `Website/src/app/admin/prizes/page.tsx` — swap `AdminCardCatalogPanel` + `AdminPrizeCreateActions` for the new screen.
- `Website/src/app/globals.css` — add a `.pcx-*` scoped style block (after the existing `.admin-frame` block, ~line 26731+).
- `Website/package.json` — add `test:admin-prize-catalog*` scripts.

Reused as-is (do **not** rewrite — DRY):

- `Website/src/features/ynot/data.ts` — `getAdminCards()`, `getAdminPrizePool()`, `getYnotDashboardSlice()`.
- `Website/src/features/ynot/admin-card-catalog-helpers.ts` — `AdminCardCatalogSortMode`, `AdminCardSeriesFilter`, `filterAdminCardCatalogRows()` (already exported); `buildAdminCardCatalogRows()` + `AdminCardCatalogRow` are extracted here in **Task 1.0** (currently un-exported in `client.tsx`).
- `@/lib/lucky-draw/types` — `CardCatalogItem` (the Main SKU shape; **not** in `features/ynot`).
- `Website/src/features/ynot/types.ts` — `YnotPrizePoolItem`, etc.; `card-catalog-metadata.ts`; `prize-category.ts`; `prize-tier.ts`; `stock-sku-presentation.ts`; `gemrate-cert.ts`.
- `Website/src/features/ynot/admin/primitives.tsx` / `admin/index.ts` — `AdminFrame`, `AdminCard`, `AdminKPI`, `AdminIcon`, `AdminSearchableSelect`.

> **Decommission note:** once the new screen is live and tested, `AdminCardCatalogPanel`, `AdminPrizeCreateActions`, `AdminCardForm`, `AdminCardStockUnitForm`, `AdminPrizeInventoryPanel` in `client.tsx` become dead code. Removal is **Phase 5** (last), after parity is verified — not earlier, so we can diff behaviour.

---

# Phase 0 — Foundations & reconciliation

Outcome: branch created, gap confirmed (no migrations), design tokens in place, typed API client wrapping every existing route this screen needs, and a guard test that pins the contract.

### Task 0.1: Branch + confirm no backend gap

**Files:**
- Create: `Website/docs/verification/2026-06-21-admin-prize-catalog-redesign.md` (evidence doc; appended to through the plan)

- [ ] **Step 1: Create the branch**

```bash
cd "Website" >/dev/null 2>&1 || true
git checkout -b feat/admin-prize-stock
git rev-parse --abbrev-ref HEAD   # expect: feat/admin-prize-stock
```

- [ ] **Step 2: Confirm the inventory backend exists (no migration needed)**

Run from repo root. Each command must return matches; if any returns nothing, STOP and record a real gap in the evidence doc instead of proceeding.

```bash
ls Database/supabase/migrations | grep -E "stock_skus_and_container_conversion|prize_unit_identity_checker"
grep -rl "open_stock_container\|adjust_card_stock_units\|upsert_stock_sku\|get_admin_stock_sku_summary" Website/src/app/api/ynot/admin
grep -rl "GEMRATE_CERT_LOOKUP_URL" Website/src/features/ynot/gemrate-cert.ts
grep -n "stockAvailable\|stockReserved\|stockAllocated\|stockArchived\|stockSkuGroups" Website/src/features/ynot/data.ts
```

Expected: migration filenames listed; route files listed; gemrate file listed; the four stock buckets + `stockSkuGroups` found in `data.ts`.

- [ ] **Step 3: Write the reconciliation into the evidence doc**

Create `Website/docs/verification/2026-06-21-admin-prize-catalog-redesign.md` containing the reconciliation table from this plan's "Reality reconciliation" section, plus a line: `Backend gap: NONE — redesign is frontend-only (verified <date> on feat/admin-prize-stock).`

- [ ] **Step 4: Commit**

```bash
cd Website && git add docs/verification/2026-06-21-admin-prize-catalog-redesign.md && \
git commit -m "docs: record admin prize catalog backend reconciliation (no migration needed)"
```

---

### Task 0.2: Design tokens (CSS)

**Files:**
- Modify: `Website/src/app/globals.css` (append a new block after the admin theme tokens, ~line 26731+)
- Test: `Website/scripts/test-admin-prize-catalog-foundation.mjs`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-admin-prize-catalog-foundation.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../src/app/globals.css");

test("prize-catalog stock-state tokens are defined and mapped to admin palette", () => {
  for (const token of [
    "--pcx-available",
    "--pcx-packs",
    "--pcx-bags",
    "--pcx-removed",
  ]) {
    assert.ok(css.includes(token), `missing token ${token}`);
  }
  // available reuses the gold accent; bags reuses violet/amber family — assert reuse, not hardcoded hexes.
  assert.match(css, /--pcx-available:\s*var\(--a-gold/);
});

test("prize-catalog category accents exist", () => {
  for (const token of ["--pcx-cat-card", "--pcx-cat-box", "--pcx-cat-pack"]) {
    assert.ok(css.includes(token), `missing token ${token}`);
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs`
Expected: FAIL (tokens not found).

- [ ] **Step 3: Add the tokens block to `globals.css`**

Append (inside the existing admin scope, after `--a-gold` definitions). Map prototype `--st-*` to the admin palette (`catalog-redesign.css` `:root` is the reference for hues):

```css
/* ===== Prize Catalog redesign (pcx-) — stock states + category accents ===== */
.admin-frame {
  --pcx-available: var(--a-gold, #f4c542);   /* real stock, free to build packs */
  --pcx-packs:     var(--a-sky, #6ca6ff);    /* allocated into gacha packs */
  --pcx-bags:      #b98cf0;                   /* won, in customers' bags */
  --pcx-removed:   #6b6d82;                   /* archived / removed */
  --pcx-cat-card:  #d7d2c4;
  --pcx-cat-box:   #f4a142;
  --pcx-cat-pack:  #44d17e;
  --pcx-radius:    12px;
  --pcx-radius-sm: 8px;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
cd Website && git add src/app/globals.css scripts/test-admin-prize-catalog-foundation.mjs && \
git commit -m "feat: add prize-catalog design tokens mapped to admin palette"
```

---

### Task 0.3: Typed API client wrapping existing routes

This module is the single place the new UI talks to the backend. It encodes the **real** route contracts discovered in `cards/route.ts`, `card-stock/route.ts`, `stock-skus/route.ts`, `open-container/route.ts`, `gemrate-cert/route.ts`, `prizes/route.ts`.

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/catalog-api.ts`
- Test: extend `Website/scripts/test-admin-prize-catalog-foundation.mjs`

- [ ] **Step 1: Write the failing test (append to the foundation test)**

Append to `Website/scripts/test-admin-prize-catalog-foundation.mjs`:

```js
const api = read("../src/features/ynot/admin/prize-catalog/catalog-api.ts");

test("catalog-api targets the real existing endpoints", () => {
  for (const path of [
    "/api/ynot/admin/cards",
    "/api/ynot/admin/card-stock",
    "/api/ynot/admin/stock-skus",
    "/api/ynot/admin/stock-skus/open-container",
    "/api/ynot/admin/gemrate-cert",
    "/api/ynot/admin/prizes",
  ]) {
    assert.ok(api.includes(path), `catalog-api missing ${path}`);
  }
});

test("catalog-api sends same-origin credentials and JSON", () => {
  assert.match(api, /credentials:\s*["']same-origin["']/);
  assert.match(api, /content-type/i);
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs`
Expected: FAIL (file missing).

- [ ] **Step 3: Implement `catalog-api.ts`**

```ts
// Typed fetch wrappers for the existing admin routes the Prize Catalog uses.
// Every mutating route here enforces same-origin server-side; we send
// credentials + JSON and surface structured error codes to the UI.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Network error — please retry." };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || payload?.ok === false) {
    return {
      ok: false,
      error: String(payload?.error ?? "Request failed."),
      code: typeof payload?.code === "string" ? payload.code : undefined,
    };
  }
  return { ok: true, data: (payload ?? {}) as T };
}

async function sendJson<T>(
  url: string,
  method: "PATCH" | "DELETE",
  body: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Network error — please retry." };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || payload?.ok === false) {
    return {
      ok: false,
      error: String(payload?.error ?? "Request failed."),
      code: typeof payload?.code === "string" ? payload.code : undefined,
    };
  }
  return { ok: true, data: (payload ?? {}) as T };
}

// ---- Main SKU (cards) ----
export type MainSkuInput = {
  cardId?: string;
  modelCode?: string;
  cardNumber?: string;
  name: string;
  series?: string; // "Pokemon" | "One Piece" | custom brand
  releaseYear?: number | string;
  cardSet?: string;
  catalogCategory?: string; // "Single Cards" | "Sealed Boxes" | "Sealed Packs" | custom
  prizeCategory?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  confirmOverwrite?: boolean;
};
export const createMainSku = (input: MainSkuInput) =>
  postJson<{ card: unknown }>("/api/ynot/admin/cards", input);
export const updateMainSku = (input: MainSkuInput & { cardId: string }) =>
  sendJson<{ card: unknown }>("/api/ynot/admin/cards", "PATCH", input);
export const deleteMainSku = (cardId: string) =>
  sendJson<{ cardId: string }>("/api/ynot/admin/cards", "DELETE", { cardId });

// ---- Stock (card_stock_units) ----
export type StockAdjustInput = {
  cardId: string;
  quantityDelta: number; // +add / -archive; cert requires +1
  reason?: string;
  stockSkuId?: string; // required when adding (delta>0)
  stockUnitGroupKey?: string; // required when removing without a sub-SKU id
  condition?: "sealed" | "raw" | "graded";
  grade?: string;
  gradingService?: "psa" | "bgs" | "cgc" | "other";
  certNumber?: string;
  gemrateId?: string;
  imageUrl?: string;
  imageStoragePath?: string;
};
export const adjustCardStock = (input: StockAdjustInput) =>
  postJson<{ stock: unknown }>("/api/ynot/admin/card-stock", input);

// ---- Sub-SKU (stock_skus) + box→pack ----
export type StockSkuInput = {
  stockSkuId?: string;
  cardId?: string;
  sku: string;
  label: string;
  unitKind?: "card" | "pack" | "box" | "other";
  imageUrl?: string;
  imageStoragePath?: string;
  childStockSkuId?: string; // box → which pack
  childQuantity?: number; // packs per box
  clearConversionRule?: boolean;
};
export const upsertStockSku = (input: StockSkuInput) =>
  postJson<{ stockSku: unknown }>("/api/ynot/admin/stock-skus", input);
export const openStockContainer = (input: {
  parentStockSkuId: string;
  quantity: number;
  note?: string;
}) => postJson<{ result: unknown }>("/api/ynot/admin/stock-skus/open-container", input);

// ---- GemRate cert lookup (the real "PSA lookup") ----
export type CertLookup = {
  name?: string;
  series?: string;
  set?: string;
  year?: number;
  number?: string;
  grade?: string;
  gemrateId?: string;
};
export const lookupCert = (cert: string, grader: "psa" | "bgs" | "cgc" | "other") =>
  postJson<{ lookup: CertLookup }>("/api/ynot/admin/gemrate-cert", { cert, grader });

// ---- Campaign assignment (draw_round_prizes) ----
export type AssignPrizeInput = {
  campaignId: string;
  cardId: string;
  tier: "normal" | "high";
  rank: number;
  valueThb?: number; // OWNER ONLY — omit for non-owner
  metadata?: Record<string, unknown>; // carries intendedStockSku/intendedStockUnitKey/intendedStockLabel, tierRank, catalogCategory, prizeCategory
};
export const assignPrize = (input: AssignPrizeInput) =>
  postJson<{ prize: unknown }>("/api/ynot/admin/prizes", input);
export const removePrize = (prizeId: string) =>
  sendJson<{ prizeId: string }>("/api/ynot/admin/prizes", "DELETE", { prizeId });

// ---- Image upload ----
export async function uploadCardImage(
  file: File,
): Promise<ApiResult<{ url: string; storagePath?: string }>> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/lucky-draw/admin/card-image", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
  } catch {
    return { ok: false, error: "Upload failed — please retry." };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, error: String(payload?.error ?? "Upload failed.") };
  return {
    ok: true,
    data: {
      url: String(payload?.url ?? payload?.imageUrl ?? ""),
      storagePath:
        typeof payload?.storagePath === "string"
          ? payload.storagePath
          : typeof payload?.imageStoragePath === "string"
            ? payload.imageStoragePath
            : undefined,
    },
  };
}
```

> Before relying on the upload response shape, open `Website/src/app/api/lucky-draw/admin/card-image/route.ts` and align the field names (`url` vs `imageUrl`, `storagePath` vs `imageStoragePath`). Adjust the mapping in `uploadCardImage` to the real keys — do not guess.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/catalog-api.ts scripts/test-admin-prize-catalog-foundation.mjs && \
git commit -m "feat: typed prize-catalog API client over existing admin routes"
```

---

### Task 0.4: Presentation helpers + stock-state mapping

The prototype shows 4 buckets (available / in packs / in bags / removed). The data layer returns `stockAvailable / stockReserved / stockAllocated / stockArchived`. Centralize the mapping so every component agrees.

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/catalog-format.ts`
- Test: extend `Website/scripts/test-admin-prize-catalog-foundation.mjs`

- [ ] **Step 1: Write the failing test (append)**

```js
const fmt = read("../src/features/ynot/admin/prize-catalog/catalog-format.ts");
test("catalog-format maps the four prototype buckets to data-layer fields", () => {
  assert.ok(fmt.includes("stockAvailable"));
  assert.ok(fmt.includes("stockReserved"));
  assert.ok(fmt.includes("stockAllocated"));
  assert.ok(fmt.includes("stockArchived"));
  assert.ok(fmt.includes("toStockBuckets"));
});
```

- [ ] **Step 2: Run, confirm fail.** `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs` → FAIL.

- [ ] **Step 3: Implement `catalog-format.ts`**

```ts
import type { CardCatalogItem } from "@/lib/lucky-draw/types";

export type StockBuckets = {
  available: number; // free to build packs
  packs: number; // loaded into gacha packs (reserved + ...)
  bags: number; // won, in customers' bags
  removed: number; // archived
  total: number;
};

// Map the existing 4 stock-status buckets onto the prototype's vocabulary.
// "In packs" = reserved (committed to a pack but not yet won).
// "In bags"  = allocated (owned by a customer).
export function toStockBuckets(card: {
  stockAvailable?: number;
  stockReserved?: number;
  stockAllocated?: number;
  stockArchived?: number;
}): StockBuckets {
  const available = card.stockAvailable ?? 0;
  const packs = card.stockReserved ?? 0;
  const bags = card.stockAllocated ?? 0;
  const removed = card.stockArchived ?? 0;
  return { available, packs, bags, removed, total: available + packs + bags + removed };
}

export const fmtInt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US");

export const unitNoun = (category: string | null | undefined) =>
  category === "Sealed Boxes" ? "boxes" : category === "Sealed Packs" ? "packs" : "cards";

export type StockStateKey = keyof Pick<StockBuckets, "available" | "packs" | "bags" | "removed">;
export const STOCK_STATE_LABEL: Record<StockStateKey, string> = {
  available: "Available",
  packs: "In packs",
  bags: "In bags",
  removed: "Removed",
};
```

> Confirm the `reserved`→"in packs" / `allocated`→"in bags" semantics against `data.ts` `getAdminCards` and the stock-summary RPC comments. If `reserved`/`allocated` mean the opposite in this schema, swap the two lines — and add a code comment citing the source. This is the only place the mapping lives.

- [ ] **Step 4: Run test, confirm pass.** → PASS.

- [ ] **Step 5: Commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/catalog-format.ts scripts/test-admin-prize-catalog-foundation.mjs && \
git commit -m "feat: prize-catalog stock-bucket mapping + format helpers"
```

---

# Phase 1 — Catalog shell + Main SKU CRUD (prototype "Phase A")

Outcome: the new screen renders KPIs, toolbar/filters/legend, and the two-level ledger list from real data, and can create / edit / delete a Main SKU with the existing guards surfaced. Replaces the old panel in `page.tsx`.

### Task 1.0: Extract the row builder into shared helpers (refactor, no behaviour change)

`buildAdminCardCatalogRows()` and the `AdminCardCatalogRow` type currently live **un-exported inside `client.tsx`** (lines ~11345–11410). Extract them so both the legacy panel and the new screen share one implementation (DRY).

**Files:**
- Modify: `Website/src/features/ynot/admin-card-catalog-helpers.ts` (add exports)
- Modify: `Website/src/features/ynot/client.tsx` (remove local defs, import from helpers)
- Test: extend `Website/scripts/test-admin-prize-catalog-foundation.mjs`

- [ ] **Step 1: Write the failing test (append)**

```js
const helpers = read("../src/features/ynot/admin-card-catalog-helpers.ts");
test("row builder + row type are exported from the shared helpers", () => {
  assert.ok(helpers.includes("export function buildAdminCardCatalogRows"));
  assert.ok(helpers.includes("export type AdminCardCatalogRow"));
});
```

- [ ] **Step 2: Run, confirm fail.** `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs` → FAIL.

- [ ] **Step 3: Move the code** — cut the `AdminCardCatalogRow` type (client.tsx:~11345) and `buildAdminCardCatalogRows` function (client.tsx:~11359–~11410) into `admin-card-catalog-helpers.ts`, prefix both with `export`. Add the needed imports there (`CardCatalogItem` from `@/lib/lucky-draw/types`, `YnotPrizePoolItem` from `./types`, plus any helpers it calls — bring `adminCardCatalogRowSearchText`/`adminCardCatalogDetails` too if they're only used by the builder). In `client.tsx`, delete the local defs and add `import { buildAdminCardCatalogRows, type AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";`.

- [ ] **Step 4: Run test + typecheck + the existing stock test**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-foundation.mjs && npm run typecheck && node --test scripts/test-stock-subsku-admin-api.mjs`
Expected: PASS + clean (legacy panel still compiles against the moved symbols).

- [ ] **Step 5: Commit**

```bash
cd Website && git add src/features/ynot/admin-card-catalog-helpers.ts src/features/ynot/client.tsx scripts/test-admin-prize-catalog-foundation.mjs && \
git commit -m "refactor: export buildAdminCardCatalogRows from shared helpers"
```

---

### Task 1.1: Screen container + page swap (renders existing data)

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx`
- Create: `Website/src/features/ynot/admin/prize-catalog/index.ts`
- Modify: `Website/src/app/admin/prizes/page.tsx`
- Test: `Website/scripts/test-admin-prize-catalog-screen.mjs`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-admin-prize-catalog-screen.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/app/admin/prizes/page.tsx");
const screen = read("../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx");

test("page mounts the new PrizeCatalogScreen and keeps server data loaders", () => {
  assert.ok(page.includes("PrizeCatalogScreen"));
  assert.ok(page.includes("getAdminCards"));
  assert.ok(page.includes("getAdminPrizePool"));
});

test("screen is a client component reusing the existing row builder", () => {
  assert.match(screen, /^"use client";/m);
  assert.ok(screen.includes("buildAdminCardCatalogRows"));
});
```

- [ ] **Step 2: Run, confirm fail.** `cd Website && node --test scripts/test-admin-prize-catalog-screen.mjs` → FAIL.

- [ ] **Step 3: Implement the container**

`Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  buildAdminCardCatalogRows,
  type AdminCardCatalogSortMode,
} from "@/features/ynot/admin-card-catalog-helpers"; // exported in Task 1.0
import type { YnotPrizePoolItem } from "@/features/ynot/types";
import { CatalogKpis } from "./CatalogKpis";
import { CatalogToolbar } from "./CatalogToolbar";
import { LedgerRow } from "./LedgerRow";

type CategoryFilter = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";

export function PrizeCatalogScreen({
  cards,
  prizes,
  isOwner,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
  isOwner: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sortMode] = useState<AdminCardCatalogSortMode>("default");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const rows = useMemo(
    () => buildAdminCardCatalogRows(cards, prizes),
    [cards, prizes],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const cat = String(row.card.catalogCategory ?? "");
      if (category !== "all" && cat !== category) return false;
      if (!q) return true;
      return [row.card.name, row.card.cardCode, row.card.cardSet, row.card.series]
        .some((s) => String(s ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, category, sortMode]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="pcx-screen">
      <CatalogKpis rows={rows} />
      <CatalogToolbar
        query={query}
        onQuery={setQuery}
        category={category}
        onCategory={setCategory}
        rows={rows}
      />
      <div className="pcx-ledger">
        {visible.length === 0 ? (
          <div className="pcx-empty">No items match “{query}”.</div>
        ) : (
          visible.map((row) => (
            <LedgerRow
              key={row.card.catalogCardId}
              row={row}
              open={expanded.has(row.card.catalogCardId)}
              onToggle={() => toggle(row.card.catalogCardId)}
              isOwner={isOwner}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

`Website/src/features/ynot/admin/prize-catalog/index.ts`:

```ts
export { PrizeCatalogScreen } from "./PrizeCatalogScreen";
```

> `buildAdminCardCatalogRows` returns rows shaped `{ card, prizes, stockTotal, stockArchived, ... }` (see `admin-card-catalog-helpers.ts`). Open that file and use the real `row` field names in `LedgerRow`/`CatalogKpis`. Reuse its `AdminCardCatalogSortMode` if you wire the sort dropdown later.

- [ ] **Step 4: Swap the page** — `Website/src/app/admin/prizes/page.tsx`:

Replace the import block and the two usages. Keep the server data loaders and `AdminGate`/`AdminFrame`:

```tsx
import { PrizeCatalogScreen } from "@/features/ynot/admin/prize-catalog";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import { AdminCard, AdminFrame } from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminCards(),
    getAdminPrizePool(),
  ]);
  const isOwner = data.viewer.adminRole === "owner";

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/prizes"
        trail={["Admin", "Pack studio", "Prize catalog"]}
        title="Prize catalog"
        desc="Your cards, sealed boxes and packs — and exactly where every unit is: in stock, loaded into a pack, or won and sitting in a customer's bag."
      >
        <AdminCard className="admin-prize-catalog-card">
          <div className="card-pad">
            <PrizeCatalogScreen cards={cards} prizes={prizes} isOwner={isOwner} />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
```

> Confirm `data.viewer` exposes `adminRole` (it's used in `prizes/route.ts` as `admin.adminRole === "owner"`). Open `getYnotDashboardSlice` / `YnotViewer` in `types.ts`; if the owner flag has a different name, use the real one.

- [ ] **Step 5: Stub the children so it compiles** — create minimal `CatalogKpis.tsx`, `CatalogToolbar.tsx`, `LedgerRow.tsx` that render a `div` with the right props signature (full implementations land in 1.2–1.4). Each is `"use client"` and accepts the props used above.

- [ ] **Step 6: Run test + typecheck**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-screen.mjs && npm run typecheck`
Expected: PASS + typecheck clean.

- [ ] **Step 7: Commit**

```bash
cd Website && git add src/features/ynot/admin/prize-catalog src/app/admin/prizes/page.tsx scripts/test-admin-prize-catalog-screen.mjs && \
git commit -m "feat: mount new PrizeCatalogScreen on admin prizes page"
```

---

### Task 1.2: KPI row

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/CatalogKpis.tsx`
- Modify: `Website/src/app/globals.css` (`.pcx-kpis`, `.pcx-kpi`)

- [ ] **Step 1: Implement `CatalogKpis.tsx`** — port from prototype `renderKpis()` (`catalog-stock.js`). Sum buckets across rows via `toStockBuckets`:

```tsx
"use client";

import type { ReactNode } from "react";
import { fmtInt, toStockBuckets } from "./catalog-format";

type Row = { card: { catalogCategory?: string | null } };

export function CatalogKpis({ rows }: { rows: Array<Row & Record<string, unknown>> }) {
  let available = 0;
  let packs = 0;
  let bags = 0;
  const counts = { card: 0, box: 0, pack: 0 };
  for (const row of rows) {
    const b = toStockBuckets(row as never);
    available += b.available;
    packs += b.packs;
    bags += b.bags;
    const cat = String(row.card.catalogCategory ?? "");
    if (cat === "Sealed Boxes") counts.box += 1;
    else if (cat === "Sealed Packs") counts.pack += 1;
    else counts.card += 1;
  }
  return (
    <div className="pcx-kpis">
      <Kpi label="Catalog items" value={fmtInt(rows.length)}
        sub={`${counts.card} cards · ${counts.box} boxes · ${counts.pack} packs`} accent="var(--a-gold)" />
      <Kpi label="Available stock" value={fmtInt(available)} sub="free to build new packs" accent="var(--pcx-available)" dot />
      <Kpi label="In packs" value={fmtInt(packs)} sub="loaded into gacha packs" accent="var(--pcx-packs)" dot />
      <Kpi label="In customer bags" value={fmtInt(bags)} sub="won, awaiting ship / convert" accent="var(--pcx-bags)" dot />
    </div>
  );
}

function Kpi({ label, value, sub, accent, dot }: {
  label: string; value: string; sub: ReactNode; accent: string; dot?: boolean;
}) {
  return (
    <div className="pcx-kpi" style={{ ["--accent" as string]: accent }}>
      <div className="pcx-kpi-label">{dot && <span className="pcx-dot" style={{ background: accent }} />}{label}</div>
      <div className="pcx-kpi-val">{value}</div>
      <div className="pcx-kpi-sub">{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS** — port `.kpis`/`.kpi` rules from `catalog-redesign.css` (lines ~137–148) into `globals.css`, renamed `.pcx-kpis`/`.pcx-kpi*`, using the `--accent` custom property for the left bar.

- [ ] **Step 3: Verify build of the component**

Run: `cd Website && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd Website && git add src/features/ynot/admin/prize-catalog/CatalogKpis.tsx src/app/globals.css && \
git commit -m "feat: prize-catalog KPI row"
```

---

### Task 1.3: Toolbar — search, category tabs, legend, filter bar

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/CatalogToolbar.tsx`
- Modify: `Website/src/app/globals.css` (`.pcx-toolbar`, `.pcx-legend`, `.pcx-cat-tab`, `.pcx-filterbar`)

- [ ] **Step 1: Implement `CatalogToolbar.tsx`** — port markup from the prototype HTML (`YNOTT Catalog Stock.html`, the `.toolbar`, `.control-bar .legend`, `.filterbar` blocks). Controlled search + category tabs call the props; the legend and the Sort/Series/Condition/Stock selects are presentational for v1 (wire to state in a follow-up):

```tsx
"use client";

type Cat = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";

export function CatalogToolbar({
  query, onQuery, category, onCategory, rows,
}: {
  query: string;
  onQuery: (v: string) => void;
  category: Cat;
  onCategory: (c: Cat) => void;
  rows: Array<{ card: { catalogCategory?: string | null } }>;
}) {
  const count = (c: Cat) =>
    c === "all" ? rows.length : rows.filter((r) => String(r.card.catalogCategory ?? "") === c).length;
  const tabs: Array<[Cat, string, string?]> = [
    ["all", "All"],
    ["Single Cards", "Single Cards", "var(--pcx-cat-card)"],
    ["Sealed Boxes", "Sealed Boxes", "var(--pcx-cat-box)"],
    ["Sealed Packs", "Sealed Packs", "var(--pcx-cat-pack)"],
  ];
  return (
    <div className="pcx-toolbar-wrap">
      <div className="pcx-legend">
        <span className="pcx-legend-item"><span className="pcx-dot" style={{ background: "var(--pcx-available)" }} /> Available</span>
        <span className="pcx-legend-item"><span className="pcx-dot" style={{ background: "var(--pcx-packs)" }} /> In packs</span>
        <span className="pcx-legend-item"><span className="pcx-dot" style={{ background: "var(--pcx-bags)" }} /> In bags</span>
        <span className="pcx-legend-item"><span className="pcx-dot" style={{ background: "var(--pcx-removed)" }} /> Removed</span>
      </div>
      <div className="pcx-toolbar">
        <label className="pcx-search">
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by name, code (EB01-113), set, cert number…"
            aria-label="Search prize catalog"
          />
        </label>
        <div className="pcx-cat-tabs" role="tablist" aria-label="Category filter">
          {tabs.map(([cat, label, color]) => (
            <button
              key={cat}
              role="tab"
              aria-selected={category === cat}
              className={`pcx-cat-tab${category === cat ? " on" : ""}`}
              onClick={() => onCategory(cat)}
            >
              {color && <span className="pcx-cat-dot" style={{ background: color }} />}
              {label}
              {cat !== "all" && <span className="pcx-cat-n">{count(cat)}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS** — port `.legend`, `.toolbar`, `.search`, `.cat-tabs`/`.cat-tab`, `.filterbar` from `catalog-redesign.css`/`catalog-stock.css` into `globals.css` under `.pcx-*`.

- [ ] **Step 3: Typecheck.** `cd Website && npm run typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
cd Website && git add src/features/ynot/admin/prize-catalog/CatalogToolbar.tsx src/app/globals.css && \
git commit -m "feat: prize-catalog toolbar (search, category tabs, legend)"
```

---

### Task 1.4: Ledger row (collapsed) — thumb, identity, stock bar, totals

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx`
- Modify: `Website/src/app/globals.css` (`.pcx-lrow`, `.pcx-sbar`, `.pcx-rollup`)

- [ ] **Step 1: Implement the collapsed header** — port from prototype `ledgerRow()` (`catalog-stock.js`). Use `toStockBuckets` for the segmented bar + rollup numbers; expanded body comes in Phase 2/3:

```tsx
"use client";

import type { ReactNode } from "react";
import { fmtInt, toStockBuckets, unitNoun } from "./catalog-format";

type LedgerRowModel = {
  card: {
    catalogCardId: string;
    name: string;
    cardCode?: string | null;
    series?: string | null;
    cardSet?: string | null;
    catalogCategory?: string | null;
    releaseYear?: number | null;
    imageUrl?: string | null;
  } & Record<string, unknown>;
  prizes: unknown[];
} & Record<string, unknown>;

export function LedgerRow({
  row, open, onToggle, isOwner,
}: {
  row: LedgerRowModel;
  open: boolean;
  onToggle: () => void;
  isOwner: boolean;
}) {
  const b = toStockBuckets(row as never);
  const cat = String(row.card.catalogCategory ?? "Single Cards");
  const seg = (k: "available" | "packs" | "bags" | "removed") =>
    b.total > 0 ? `${(b[k] / b.total) * 100}%` : "0%";
  return (
    <div className={`pcx-lrow${open ? " open" : ""}`} data-id={row.card.catalogCardId}>
      <div className="pcx-lhead" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        aria-expanded={open}>
        <Thumb name={row.card.name} code={row.card.cardCode ?? ""} image={row.card.imageUrl ?? null} category={cat} />
        <div className="pcx-lid">
          <div className="pcx-name">{row.card.name} <span className={`pcx-cat-chip ${chipClass(cat)}`}>{cat}</span></div>
          <div className="pcx-meta">
            <span className="pcx-code">{row.card.cardCode}</span>
            <span>·</span>
            <span>{row.card.series} · {row.card.releaseYear ?? "—"} · {row.card.cardSet ?? "—"}</span>
          </div>
          <div className="pcx-rollup">
            <span className="pcx-sbar">
              <i style={{ width: seg("available"), background: "var(--pcx-available)" }} />
              <i style={{ width: seg("packs"), background: "var(--pcx-packs)" }} />
              <i style={{ width: seg("bags"), background: "var(--pcx-bags)" }} />
              <i style={{ width: seg("removed"), background: "var(--pcx-removed)" }} />
            </span>
            <span className="pcx-rollup-nums">
              <Num color="var(--pcx-available)" v={b.available} label="available" />
              <Num color="var(--pcx-packs)" v={b.packs} label="in packs" />
              <Num color="var(--pcx-bags)" v={b.bags} label="in bags" />
              {b.removed > 0 && <Num color="var(--pcx-removed)" v={b.removed} label="removed" />}
            </span>
          </div>
        </div>
        <div className="pcx-lhead-right">
          <div className="pcx-total"><div className="pcx-total-v">{fmtInt(b.available)}</div><div className="pcx-total-l">{unitNoun(cat)} free</div></div>
          <span className="pcx-caret" aria-hidden>›</span>
        </div>
      </div>
      {/* Expanded body: VariantTable + campaigns section land in Phase 2/3 */}
    </div>
  );
}

function Num({ color, v, label }: { color: string; v: number; label: string }) {
  return <span className="pcx-rn"><span className="pcx-dot" style={{ background: color }} /><b style={{ color }}>{fmtInt(v)}</b><span>{label}</span></span>;
}
function Thumb({ name, code, image, category }: { name: string; code: string; image: string | null; category: string }): ReactNode {
  if (image) return <span className={`pcx-thumb${category !== "Single Cards" ? " seal" : ""}`}><img src={image} alt={name} /></span>;
  return <span className={`pcx-thumb${category !== "Single Cards" ? " seal" : ""}`}><span className="pcx-ph-code">{code}</span></span>;
}
function chipClass(cat: string) {
  return cat === "Sealed Boxes" ? "box" : cat === "Sealed Packs" ? "pack" : "card";
}
```

- [ ] **Step 2: Add CSS** — port `.lrow`/`.lhead`/`.sbar`/`.rollup`/`.thumb`/`.cat-chip` from `catalog-redesign.css` (lines ~179–307) into `globals.css` under `.pcx-*`. Keep animations on `transform`/`opacity` only (caret rotate via `transform`).

- [ ] **Step 3: Typecheck.** → clean.

- [ ] **Step 4: Commit**

```bash
cd Website && git add src/features/ynot/admin/prize-catalog/LedgerRow.tsx src/app/globals.css && \
git commit -m "feat: prize-catalog ledger row (collapsed) with stock bar"
```

---

### Task 1.5: Create / Edit Main SKU form (wired to cards route + image upload)

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx`
- Test: `Website/scripts/test-admin-prize-catalog-mainsku.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const form = read("../src/features/ynot/admin/prize-catalog/MainSkuForm.tsx");

test("MainSkuForm constrains series to the two built-in brands", () => {
  assert.ok(form.includes("Pokemon"));
  assert.ok(form.includes("One Piece"));
});

test("MainSkuForm uses the typed API client, not raw fetch", () => {
  assert.ok(form.includes("createMainSku") || form.includes("updateMainSku"));
  assert.ok(form.includes("uploadCardImage"));
  assert.ok(!/fetch\(/.test(form), "component should call the API client, not fetch directly");
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement `MainSkuForm.tsx`** — port the create form fields from prototype `createForm()` (`catalog-stock.js`). Series is a `<select>` of `["Pokemon","One Piece","Custom…"]`; category select of `["Single Cards","Sealed Boxes","Sealed Packs"]`. On submit call `createMainSku`/`updateMainSku`; on image pick call `uploadCardImage`; surface `CARD_ALREADY_EXISTS` (offer `confirmOverwrite: true` retry). Use `useTransition` + a `router.refresh()` from `next/navigation` on success.

Key handler (the part that must be exact):

```tsx
const [series, setSeries] = useState(initial?.series ?? "Pokemon");
const [category, setCategory] = useState(initial?.catalogCategory ?? "Single Cards");
const [image, setImage] = useState<{ url: string; storagePath?: string } | null>(null);
const [error, setError] = useState("");
const [pending, start] = useTransition();
const router = useRouter();

async function onPickImage(file: File) {
  const res = await uploadCardImage(file);
  if (!res.ok) { setError(res.error); return; }
  setImage(res.data);
}

function submit(confirmOverwrite = false) {
  start(async () => {
    const input = {
      cardId: initial?.catalogCardId,
      name, modelCode: code, cardNumber, series, cardSet, releaseYear, catalogCategory: category,
      imageUrl: image?.url, imageStoragePath: image?.storagePath, confirmOverwrite,
    };
    const res = initial?.catalogCardId
      ? await updateMainSku({ ...input, cardId: initial.catalogCardId })
      : await createMainSku(input);
    if (!res.ok) {
      if (res.code === "CARD_ALREADY_EXISTS" && !confirmOverwrite) { setShowOverwrite(true); return; }
      setError(res.error);
      return;
    }
    router.refresh();
    onDone?.();
  });
}
```

- [ ] **Step 4: Run test, confirm pass.** → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/MainSkuForm.tsx scripts/test-admin-prize-catalog-mainsku.mjs && \
git commit -m "feat: create/edit Main SKU form wired to cards route + image upload"
```

---

### Task 1.6: Header create actions + Delete (guarded) wiring

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx` (header actions + delete handler)
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx` (expanded "Delete item" button — calls up)
- Test: extend `Website/scripts/test-admin-prize-catalog-screen.mjs`

- [ ] **Step 1: Write the failing test (append)**

```js
test("screen surfaces the cards-delete guard codes to the user", () => {
  const screen = read("../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx");
  assert.ok(screen.includes("CARD_IN_PRIZE_POOL"));
  assert.ok(screen.includes("CARD_HAS_ACTIVE_STOCK"));
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement** — add an "Add stock" + "Create Main SKU" action area (mount `MainSkuForm` in a modal/drawer), and a `deleteCard(cardId)` that calls `deleteMainSku` and maps codes to friendly toasts:

```tsx
async function deleteCard(cardId: string, name: string) {
  if (!window.confirm(`Delete ${name} and all its stock?`)) return;
  const res = await deleteMainSku(cardId);
  if (!res.ok) {
    if (res.code === "CARD_IN_PRIZE_POOL") setToast("Remove it from its campaigns before deleting.");
    else if (res.code === "CARD_HAS_ACTIVE_STOCK") setToast("Archive or move its active stock before deleting.");
    else setToast(res.error);
    return;
  }
  router.refresh();
}
```

- [ ] **Step 4: Run test + typecheck.** → PASS + clean.

- [ ] **Step 5: Commit**

```bash
cd Website && git add src/features/ynot/admin/prize-catalog/ scripts/test-admin-prize-catalog-screen.mjs && \
git commit -m "feat: Main SKU create actions + guarded delete wiring"
```

---

# Phase 2 — Variant (Sub-SKU) rows, stock, cert lookup (prototype "Phase B" stock)

Outcome: expanded rows show per-variant (Sub-SKU/unit) lines; an Add-stock drawer creates graded/raw/sealed stock against the real routes; GemRate replaces the mocked PSA lookup; per-variant edit/remove works.

### Task 2.1: Expanded detail + Variant table

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx`
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx` (render detail when `open`)
- Modify: `Website/src/app/globals.css` (`.pcx-vtable`, `.pcx-detail-grid`, `.pcx-grade-chip`)

- [ ] **Step 1: Implement `VariantTable.tsx`** — port from prototype `ledgerVariant()`/`detailGrid()`. Source rows from `row.card.stockSkuGroups` (and their units). Render grade chip (PSA/BGS/CGC + grade, or RAW, or SEALED), cert (mono), and the four bucket columns per variant. Add per-row action buttons (image, add-like, quick-remove, edit) that call handlers passed from `LedgerRow`.

> Open `stock-sku-presentation.ts` and the `stockSkuGroups` shape produced by `data.ts` (`stockSkuGroupsFromSummaryRows`) and use its real fields for grade/cert/condition and per-state counts. Do not invent field names.

- [ ] **Step 2: Render in `LedgerRow`** when `open` — detail grid (model code, card number, year, set, rarity) + `<VariantTable />` + a "Variants in stock" section header with counts (port from `ledgerRow()` detail section).

- [ ] **Step 3: Add CSS** — port `.vtable`, `.detail-grid`, `.grade-chip*`, `.vname`, `.v-thumb` from `catalog-redesign.css`/`catalog-stock.css` under `.pcx-*`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/VariantTable.tsx src/features/ynot/admin/prize-catalog/LedgerRow.tsx src/app/globals.css && \
git commit -m "feat: expanded ledger detail + variant table from stockSkuGroups"
```

---

### Task 2.2: Add-stock drawer (3-step wizard) wired to card-stock / stock-skus

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx`
- Test: `Website/scripts/test-admin-prize-catalog-stock.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const drawer = read("../src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx");

test("Add-stock drawer enforces the cert→single-unit rule from the route", () => {
  // A cert pins one slab: quantity must lock to 1 when a cert is entered.
  assert.match(drawer, /cert/i);
  assert.ok(drawer.includes("adjustCardStock") || drawer.includes("upsertStockSku"));
});

test("graded stock requires grade + grading service before submit", () => {
  assert.ok(drawer.includes("gradingService"));
  assert.ok(drawer.includes("grade"));
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement `AddStockDrawer.tsx`** — port the wizard from prototype `step1/step2/step3`, `wizCommit()`. Three steps:
  1. **Category** → card / box / pack.
  2. **Find or create** the Main SKU (reuse `MainSkuForm` for create; search the `cards` prop for find).
  3. **Add stock**: for `card` → condition pills (Graded/Raw); graded shows grading service (PSA/BGS/CGC) + grade + cert (+ `CertLookupField`) + quantity; **quantity locks to 1 when a cert is present** (mirrors `card-stock/route.ts` which rejects cert with `delta ≠ 1`); blank cert + qty>1 = TEST. For box/pack → quantity only.

Commit handler must match the route contract exactly:

```tsx
async function commit() {
  const base = { cardId, reason: "admin_add" as const };
  if (category === "card" && mode === "graded") {
    const res = await adjustCardStock({
      ...base,
      stockSkuId, // required for delta>0
      quantityDelta: cert ? 1 : qty,        // cert pins to 1
      condition: "graded",
      grade,
      gradingService,                        // required for graded
      certNumber: cert || undefined,
      gemrateId: gemrateId || undefined,
      imageUrl: image?.url, imageStoragePath: image?.storagePath,
    });
    return finish(res);
  }
  if (category === "card") {
    return finish(await adjustCardStock({ ...base, stockSkuId, quantityDelta: qty, condition: "raw" }));
  }
  // box / pack
  return finish(await adjustCardStock({ ...base, stockSkuId, quantityDelta: qty, condition: "sealed" }));
}
```

> If the Main SKU has no Sub-SKU yet, the drawer must first `upsertStockSku({ cardId, sku, label, unitKind })` to get a `stockSkuId` (the route requires one for `delta>0`). Mirror prototype "create a variant" → here "create the Sub-SKU then add units." Show the route's friendly errors (e.g. "Choose a Sub-SKU before adding stock.").

- [ ] **Step 4: Run test, confirm pass.** → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx scripts/test-admin-prize-catalog-stock.mjs && \
git commit -m "feat: add-stock wizard wired to card-stock/stock-skus routes"
```

---

### Task 2.3: GemRate cert lookup (replaces mocked PSA)

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/CertLookupField.tsx`
- Test: extend `Website/scripts/test-admin-prize-catalog-stock.mjs`

- [ ] **Step 1: Write the failing test (append)**

```js
test("cert lookup uses the real GemRate route, not a client-side mock", () => {
  const cert = read("../src/features/ynot/admin/prize-catalog/CertLookupField.tsx");
  assert.ok(cert.includes("lookupCert"));
  assert.ok(!cert.toLowerCase().includes("psa_db") && !cert.includes("PSA_FALLBACK"),
    "must not reintroduce the prototype's mock cert DB");
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement `CertLookupField.tsx`** — input + "Look up" button calling `lookupCert(cert, grader)`; on success call `onResult(lookup)` so the drawer autofills name/series/set/year/number/grade + `gemrateId`. Port the "Verified / Found" hint UI from prototype `psaFillCard()`. Handle the 503 (key not configured) and 404 (not found) by showing the route's message.

- [ ] **Step 4: Run test, confirm pass.** → PASS.

- [ ] **Step 5: Commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/CertLookupField.tsx scripts/test-admin-prize-catalog-stock.mjs && \
git commit -m "feat: GemRate cert lookup field (replaces mocked PSA lookup)"
```

---

### Task 2.4: Per-variant + main image upload

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx`, `LedgerRow.tsx`

- [ ] **Step 1: Implement** — wire the image icon buttons (port `uploadVariantImage`/`uploadItemImage`) to `uploadCardImage`, then `adjustCardStock`/`updateMainSku`/`upsertStockSku` with the returned `imageUrl`+`imageStoragePath`. Client-side downscale before upload (port `pickImage()` canvas logic into a small helper `downscaleImage(file, maxW): Promise<File>`).
- [ ] **Step 2: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/ && \
git commit -m "feat: card + variant image upload with client-side downscale"
```

---

### Task 2.5: Edit / remove stock per variant

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/EditVariantModal.tsx`
- Modify: `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx` (open modal; quick-remove)

- [ ] **Step 1: Implement** — port prototype `openEditVariant()`/`saveVariant()`/`deleteVariant()`/`quickRemoveStock()`. "Quick remove" moves 1 unit Available→Removed via `adjustCardStock({ cardId, stockUnitGroupKey, quantityDelta: -1 })` (negative delta path needs `stockUnitGroupKey`, per the route). The edit modal adjusts counts via deltas (compute delta = new − current and call `adjustCardStock`); deleting a variant maps to archiving all its available units (the route has no hard "delete unit," so removal = archive). Disable delete when the variant is loaded into a campaign (mirror prototype guard using `row.prizes` `stockUnitUsages`/`intendedStockSku`).
- [ ] **Step 2: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/EditVariantModal.tsx src/features/ynot/admin/prize-catalog/VariantTable.tsx && \
git commit -m "feat: edit/remove stock per variant via card-stock deltas"
```

---

# Phase 3 — Box→pack + campaign assignment (prototype "Phase B" assignment)

Outcome: open boxes into packs; assign a specific variant into a campaign as a prize and remove it; winnable indicator; owner-only odds and owner-review-reset surfaced.

### Task 3.1: Open-box modal (box → pack) wired to open-container

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/OpenBoxModal.tsx`
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx` (box panel + "Open boxes" button)
- Test: `Website/scripts/test-admin-prize-catalog-campaign.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const openBox = read("../src/features/ynot/admin/prize-catalog/OpenBoxModal.tsx");

test("open-box modal calls the existing open_stock_container route", () => {
  assert.ok(openBox.includes("openStockContainer"));
  assert.ok(openBox.includes("parentStockSkuId"));
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement** — port prototype `renderOpenBox()`/`confirmOpenBox()`. Stepper for quantity; live preview (boxes −n → packs +n×packsPerBox); confirm calls `openStockContainer({ parentStockSkuId, quantity, note })`; surface the route's friendly errors (`conversion_rule_required` → "Set which pack this box contains first"). The box's child link (`childStockSkuId`/`childQuantity`) is configured via `upsertStockSku` (port "yields which pack").
- [ ] **Step 4: Run test, confirm pass.** → PASS.
- [ ] **Step 5: Commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/OpenBoxModal.tsx src/features/ynot/admin/prize-catalog/LedgerRow.tsx scripts/test-admin-prize-catalog-campaign.mjs && \
git commit -m "feat: open-box → packs modal via open_stock_container"
```

---

### Task 3.2: "In these campaigns" section + winnable indicator

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx`
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx`

- [ ] **Step 1: Implement** — port prototype `prizeTable()` + the winnable banner. Source from `row.prizes` (`YnotPrizePoolItem[]`). For each prize show campaign name + status pill, the intended variant (`intendedStockLabel`/`intendedStockSku`), tier pill, rank, value (THB) **only if `isOwner`**, awarded count, and a remove button. Winnable banner = green if any prize's campaign is `live`, amber otherwise. Boxes don't show the assign section (port the `it.category !== 'box'` rule).
- [ ] **Step 2: Add CSS** — port `.ptable`, `.winnable`, `.tier-pill`, `.pk-status` under `.pcx-*`.
- [ ] **Step 3: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx src/features/ynot/admin/prize-catalog/LedgerRow.tsx src/app/globals.css && \
git commit -m "feat: 'in these campaigns' section + winnable indicator"
```

---

### Task 3.3: Assign-to-campaign modal (owner-aware) wired to prizes route

**Files:**
- Create: `Website/src/features/ynot/admin/prize-catalog/AssignCampaignModal.tsx`
- Test: extend `Website/scripts/test-admin-prize-catalog-campaign.mjs`

- [ ] **Step 1: Write the failing test (append)** — encodes the two ignored guardrails + the customer-leak invariant:

```js
const assign = read("../src/features/ynot/admin/prize-catalog/AssignCampaignModal.tsx");

test("assign modal hides owner-only odds fields for non-owners", () => {
  assert.ok(assign.includes("isOwner"));
  // value/weight/unlock inputs must be gated behind isOwner
  assert.match(assign, /isOwner\s*&&/);
});

test("assign modal warns that assigning resets owner review", () => {
  assert.match(assign, /owner review/i);
});

test("assign modal never sends weight/unlock for non-owners (house logic stays admin-only)", () => {
  // The API client omits valueThb unless provided; assert weight/unlock are not unconditionally sent.
  assert.ok(!/weight:\s*[^,\n]*,\s*\n?\s*unlockAtSoldPct:/.test(assign) || assign.includes("isOwner"));
});
```

- [ ] **Step 2: Run, confirm fail.** → FAIL.

- [ ] **Step 3: Implement** — port prototype `renderAssign()`/`confirmAssign()`. Fields: variant `<select>` (from the card's `stockSkuGroups`; value = the sub-SKU/group key → carried in `metadata.intendedStockSku`/`intendedStockUnitKey`/`intendedStockLabel`), campaign `<select>` (from a `campaigns` prop; show status), tier pills (normal/high), rank, and **value (THB) only when `isOwner`**. Submit calls `assignPrize({ campaignId, cardId, tier, rank, valueThb: isOwner ? value : undefined, metadata })`. On success show "Added — owner review required before publish" (the server reset). Surge guard: dedupe (same campaign + variant) like the prototype.

> The campaign list: add `campaigns` to the screen's props by extending `page.tsx` to also call the campaigns loader (there's `GET /api/ynot/admin/campaigns`; check `data.ts` for a server function like `getCampaigns({ includePrivate: true })` and pass it down, rather than fetching client-side). Confirm the exact function name before wiring.

- [ ] **Step 4: Run test, confirm pass.** → PASS.
- [ ] **Step 5: Commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/AssignCampaignModal.tsx scripts/test-admin-prize-catalog-campaign.mjs && \
git commit -m "feat: assign-to-campaign modal (owner-aware) via prizes route"
```

---

### Task 3.4: Remove prize (guarded + review reset)

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx`

- [ ] **Step 1: Implement** — port prototype `removePrize()`. Confirm dialog → `removePrize(prizeId)` → on success toast "Removed — owner review required before publish" + `router.refresh()`. Surface any route error verbatim.
- [ ] **Step 2: Typecheck + commit**

```bash
cd Website && npm run typecheck && \
git add src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx && \
git commit -m "feat: remove prize from campaign with review-reset notice"
```

---

# Phase 4 — Testing & QA

Outcome: a single aggregate test target, a customer-leak guard, the platform verifier green, and a documented manual QA pass at the required breakpoints — all recorded in the evidence doc.

### Task 4.1: Aggregate test scripts

**Files:**
- Modify: `Website/package.json` (scripts)

- [ ] **Step 1: Add scripts** — insert into `package.json` `scripts` (alongside the other `test:*`):

```json
"test:admin-prize-catalog": "node --test scripts/test-admin-prize-catalog-foundation.mjs scripts/test-admin-prize-catalog-screen.mjs scripts/test-admin-prize-catalog-mainsku.mjs scripts/test-admin-prize-catalog-stock.mjs scripts/test-admin-prize-catalog-campaign.mjs",
```

- [ ] **Step 2: Run it**

Run: `cd Website && npm run test:admin-prize-catalog`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
cd Website && git add package.json && git commit -m "test: aggregate admin prize catalog guard tests"
```

---

### Task 4.2: Customer-leak guard (house logic never leaves admin)

**Files:**
- Create: `Website/scripts/test-admin-prize-catalog-no-leak.mjs`

- [ ] **Step 1: Write the test** (complete file):

```js
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const dir = new URL("../src/features/ynot/admin/prize-catalog/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

test("prize-catalog components live under the admin module only", () => {
  // The screen is mounted behind AdminGate in page.tsx — assert it is not imported by any customer surface.
  const customerShell = read("../src/features/ynot/cr/Shell.tsx");
  assert.ok(!customerShell.includes("prize-catalog"));
});

test("weight/unlock odds are only rendered behind an owner check", () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), "utf8");
    if (/unlockAtSoldPct|\bweight\b/.test(src)) {
      assert.ok(/isOwner/.test(src), `${f} references odds without an isOwner gate`);
    }
  }
});
```

- [ ] **Step 2: Run** — `cd Website && node --test scripts/test-admin-prize-catalog-no-leak.mjs`. Fix any component that references odds without an `isOwner` gate, then re-run → PASS.

- [ ] **Step 3: Add to the aggregate** — append the file to the `test:admin-prize-catalog` script. Commit.

```bash
cd Website && git add scripts/test-admin-prize-catalog-no-leak.mjs package.json && \
git commit -m "test: guard that prize-catalog house logic stays admin/owner-only"
```

---

### Task 4.3: Static + platform verification

- [ ] **Step 1: Lint** — `cd Website && npm run lint` → fix issues → clean.
- [ ] **Step 2: Typecheck** — `cd Website && npm run typecheck` → clean.
- [ ] **Step 3: Aggregate guards** — `cd Website && npm run test:admin-prize-catalog` → PASS.
- [ ] **Step 4: Platform verifier** — `cd Website && npm run verify:platform` → PASS (per project memory this is the reliable local gate; full `npm run check` is not expected to pass locally).
- [ ] **Step 5: Record outputs** in `Website/docs/verification/2026-06-21-admin-prize-catalog-redesign.md` (paste the command summaries). Commit.

```bash
cd Website && git add docs/verification/2026-06-21-admin-prize-catalog-redesign.md && \
git commit -m "docs: record prize-catalog static + platform verification evidence"
```

---

### Task 4.4: Manual visual + a11y QA on localhost

Run the app and click through against the prototype. Record pass/fail per item in the evidence doc.

- [ ] **Step 1: Start the app**

```bash
cd Website
cp -n .env.example .env.local   # fill SUPABASE url + service role + anon, LINE keys, GEMRATE_API_KEY; point at staging DB
npm install
npm run dev -- -p 3005          # http://localhost:3005/admin/prizes  (sign in as admin; test owner-only with an owner account)
```

- [ ] **Step 2: Responsive check** — at widths **320 / 375 / 768 / 1024 / 1440 / 1920**: no horizontal overflow; KPIs reflow (4→2→1); ledger rows stay legible; drawer/modals fit. The admin frame collapses the sidebar < 1080px (existing behaviour).
- [ ] **Step 3: Interaction parity vs prototype** — expand/collapse rows; Add-stock wizard (category→find/create→add); cert lookup autofill; quick-remove; open-box math; assign + remove prize; winnable banner flips with campaign status; delete guards (assigned card / active stock) show friendly messages.
- [ ] **Step 4: Accessibility** — keyboard: Tab to every control, Enter/Space toggles rows, Esc closes drawer/modals, focus is trapped in modals and returns on close; visible focus rings; `aria-expanded` on rows, `role="dialog"`/`aria-modal` on modals, `aria-selected` on tabs; check color contrast of state dots/pills against the dark surfaces (≥ 3:1 for non-text, 4.5:1 for text); honor `prefers-reduced-motion` (caret/drawer transitions disabled).
- [ ] **Step 5: Owner vs non-owner** — sign in as a non-owner admin: value (THB)/weight/unlock inputs are absent; assigning a prize without those fields succeeds; signing in as owner shows them.
- [ ] **Step 6: Capture evidence** — screenshots at 1440 + 375 (light is N/A; admin is dark) into `Website/docs/verification/evidence/`; note results in the evidence doc. Commit evidence.

```bash
cd Website && git add docs/verification && git commit -m "docs: prize-catalog manual visual + a11y QA evidence"
```

---

### Task 4.5: Merge gate

- [ ] **Step 1: Self-review the diff** — `cd Website && git diff main...HEAD` — confirm: no migrations; no new secrets; no `console.log`; no raw `fetch` in components (only `catalog-api.ts`); files < 800 lines; no `any`.
- [ ] **Step 2: Confirm guards green** — `npm run lint && npm run typecheck && npm run test:admin-prize-catalog && npm run verify:platform`.
- [ ] **Step 3: Open the PR** (Phase-A-equivalent first if you want it shippable in slices, but since the backend exists the whole redesign can be one PR). Title: `feat: redesign admin prize catalog (frontend; existing inventory backend)`. Body: link this plan + the evidence doc; note "no DB migration"; include the manual QA checklist results.
- [ ] **Step 4: After review approval, merge to `main`** (prod deploys on push to `main` — do this only when ready to ship).

---

# Phase 5 — Decommission old panel (after parity confirmed)

Do **not** start until the new screen has shipped and been verified in production for one cycle.

### Task 5.1: Remove dead components

**Files:**
- Modify: `Website/src/features/ynot/client.tsx` (remove `AdminCardCatalogPanel`, `AdminPrizeCreateActions`, `AdminCardForm`, `AdminCardStockUnitForm`, `AdminPrizeInventoryPanel` if unreferenced)

- [ ] **Step 1: Confirm no references** — `cd Website && grep -rn "AdminCardCatalogPanel\|AdminPrizeCreateActions\|AdminPrizeInventoryPanel" src` returns only the definitions.
- [ ] **Step 2: Remove the dead exports** and any now-unused helpers; run `npm run lint && npm run typecheck && npm run test:admin-prize-catalog && npm run verify:platform`.
- [ ] **Step 3: Update the static test** `scripts/test-stock-subsku-admin-api.mjs` if it asserted patterns in the removed code (re-point assertions at the new module).
- [ ] **Step 4: Commit** — `refactor: remove legacy admin prize catalog panel (superseded by prize-catalog module)`.

---

## Self-review

**Spec coverage (prototype feature inventory → task):**
- Two-level catalog (card → variants) → Tasks 1.4, 2.1. Graded per-cert / raw pooled / test stock → 2.2. Sealed box/pack categories → 1.3, 2.1. Box→pack conversion → 3.1. Four stock states → 0.4, 1.4. Add-stock wizard → 2.2. PSA(→GemRate) lookup → 2.3. Per-variant + main image → 2.4. Campaign assignment (tier/rank/value) → 3.3. Remove prize → 3.4. Winnable indicator → 3.2. Guards (dup cert, can't delete assigned card / loaded variant) → 1.6 (card), 2.2 (cert), 2.5 (variant), 3.x (assignment). KPIs/legend/filters/search → 1.2, 1.3. Reset-demo is prototype-only (localStorage) → intentionally dropped (real data).
- Testing/QA → Phase 4 in full (static guards, customer-leak guard, lint/typecheck/verify:platform, manual visual + a11y, evidence doc, merge gate).

**Placeholder scan:** No "TBD"/"add error handling"-style placeholders. Where a real-world unknown exists (image-route response keys, reserved/allocated semantics, owner-flag name, campaign loader name) the step says exactly which file to open and confirm before wiring — that is verification, not a placeholder.

**Type consistency:** API client function names (`createMainSku`, `updateMainSku`, `deleteMainSku`, `adjustCardStock`, `upsertStockSku`, `openStockContainer`, `lookupCert`, `assignPrize`, `removePrize`, `uploadCardImage`) and the `ApiResult<T>` shape are defined once in Task 0.3 and reused verbatim in Tasks 1.5, 1.6, 2.2–2.5, 3.1–3.4. Stock-bucket mapping (`toStockBuckets`, `STOCK_STATE_LABEL`) defined in 0.4, reused in 1.2/1.4. Component prop names (`row`, `open`, `onToggle`, `isOwner`, `cards`, `prizes`, `campaigns`) are consistent across `PrizeCatalogScreen` and children.

**Known risks to watch during execution:**
1. `reserved`↔`allocated` → "in packs"/"in bags" mapping is an assumption; confirm in `data.ts`/RPC and adjust the single mapping in `catalog-format.ts`.
2. The image upload route's response keys — confirm before trusting `uploadCardImage`.
3. The campaigns server loader name — confirm before passing `campaigns` into the screen.
4. `client.tsx` is huge; keep new code in the new module, do not grow `client.tsx`.
