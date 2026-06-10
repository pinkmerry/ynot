# Stock Sub-SKU Box Pack Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stock Sub SKUs first-class editable inventory records so admins can count sealed boxes and loose packs, define per-box pack quantities, open boxes into child pack stock, and show correct images on prize catalog, pack detail, opening reveal, reward history, user bag, and shipping/admin surfaces.

**Architecture:** Keep `public.cards` as the main SKU/product row and add explicit `public.stock_skus` plus `public.stock_sku_conversion_rules` for sellable stock variants and container rules. Physical inventory remains in `public.card_stock_units`, now linked to a stock SKU and optionally to the parent stock unit/conversion rule that created it. Customer-facing image resolution becomes exact stock unit image -> Sub SKU image -> product image.

**Tech Stack:** Next.js App Router in `Website/`, React client admin components in `Website/src/features/ynot/client.tsx`, TypeScript helper modules under `Website/src/features/ynot/`, Supabase SQL migrations in `Database/supabase/migrations/`, Node `--test` script tests in `Website/scripts/`, and guarded Supabase dry-runs before production migration apply.

---

## Scope Check

This is one vertical inventory feature, not separate independent projects: DB schema, admin UI, prize assignment, opening/reveal images, collection/bag images, and shipping images all depend on the same Sub SKU identity and image contract. Implement it in small commits, but keep the data model and image fallback contract consistent from the first merge.

Out of scope for this plan:

- Automatic customer sale of loose packs from a sealed box without an admin opening action.
- Multi-child container kits such as "1 box contains 10 packs + 1 promo + sleeves". The schema supports multiple conversion rows, but the UI ships first with the common "1 box -> X packs" flow.
- Production data migration or live stock conversion execution. This plan creates the code and migration path; production application still requires the normal YNOTT migration gates.

## Current Behavior To Preserve

- `public.cards` is the product/main SKU layer.
- `public.card_stock_units` is physical stock.
- The current derived Sub SKU grouping is condition-only for raw/sealed and exact grade/grader/cert/GemRate for graded stock.
- Random pack prize rows store selected Sub SKU metadata in `draw_round_prizes.metadata`.
- The pack opening RPC awards pre-materialized `draw_round_prize_units`.
- Customer reveal and bag image privacy must not expose stock unit IDs, prize unit IDs, cert numbers, GemRate IDs, weights, or unlock thresholds.

## Target Product Behavior

Admin catalog should show this shape:

```text
Main SKU: OP16 The Time Of Battle

Sub SKUs:
- OP16-JP-BOX
  Type: Box
  Image: box photo
  Count: 9 available boxes
  Conversion: 1 box -> 24 OP16-JP-PACK
  Pack equivalent: 216 packs

- OP16-JP-PACK
  Type: Pack
  Image: pack photo
  Count: 22 available loose packs
  Pack equivalent: 22 packs

Total pack equivalent: 238 packs
```

When an admin opens one box:

```text
Before: 10 boxes, 1 loose pack, packs per box 24, total pack equivalent 241
Action: Open 1 box
After: 9 boxes, 25 loose packs, total pack equivalent 241
Then selling/opening 3 packs consumes loose pack units and leaves 22 loose packs.
```

Pokemon examples must work because conversion quantity is per Box Sub SKU:

```text
Pokemon SV-JP-BOX -> SV-JP-PACK x30
Pokemon 151-JP-BOX -> 151-JP-PACK x20
One Piece OP16-JP-BOX -> OP16-JP-PACK x24
```

## File Structure

Create:

```text
Website/src/features/ynot/stock-subsku-conversion.ts
Website/scripts/test-stock-subsku-conversion.mjs
Website/scripts/test-stock-subsku-conversion-sql.mjs
Website/scripts/smoke-stock-subsku-db.mjs
Website/scripts/test-stock-subsku-admin-api.mjs
Website/scripts/test-stock-subsku-admin-ui.mjs
Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql
Website/src/app/api/ynot/admin/stock-skus/route.ts
Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts
```

Modify:

```text
Website/package.json
Website/src/features/ynot/public-subsku-images.ts
Website/src/features/ynot/stock-sku-usage.ts
Website/src/features/ynot/prize-readiness.ts
Website/src/features/ynot/stock-readiness.ts
Website/src/features/ynot/data.ts
Website/src/features/ynot/types.ts
Website/src/features/ynot/client.tsx
Website/src/app/api/ynot/admin/campaigns/[id]/lineup/route.ts
Website/src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts
Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts
Website/src/app/api/ynot/admin/card-stock/route.ts
Website/src/app/api/ynot/admin/card-stock/purge-archived/route.ts
Website/src/app/api/ynot/admin/card-stock/unit/route.ts
Website/src/app/api/ynot/admin/card-stock/units/route.ts
Website/src/app/api/ynot/admin/campaigns/route.ts
Website/src/app/api/ynot/admin/prizes/route.ts
Website/src/app/api/ynot/gacha/open/route.ts
Website/src/app/api/ynot/packs/[slug]/last-prize/route.ts
Website/src/app/api/ynot/shipping/route.ts
Website/src/app/api/ynot/admin/shipping/route.ts
Website/src/app/api/ynot/collection/convert/route.ts
Website/src/app/api/ynot/exchange/route.ts
Website/src/lib/supabase/types.ts
```

## Data Model Decisions

Use these table meanings:

| Table | Meaning |
| --- | --- |
| `cards` | Product/main SKU: name, set, brand, category, product image |
| `stock_skus` | Editable Sub SKU: box/pack/card/other, Sub SKU image, display label |
| `stock_sku_conversion_rules` | Container rule: parent Sub SKU -> child Sub SKU x quantity |
| `card_stock_units` | Physical stock units, each linked to one Sub SKU |
| `draw_round_prizes.metadata.stockSkuId` | Prize row intended Sub SKU |
| `draw_round_prize_units.card_stock_unit_id` | Exact physical unit allocated/awarded |
| `collection_items.card_stock_unit_id` | Exact awarded stock unit for bag/shipping images |

Image fallback order:

```text
card_stock_units.image_url
-> stock_skus.image_url
-> cards.image_url
```

## Related API And RPC Coverage

Use this matrix as the checklist before implementation is considered complete.

| Surface | Current role | Plan action |
| --- | --- | --- |
| `Website/src/app/api/ynot/admin/stock-skus/route.ts` | New admin Sub SKU read/save endpoint | Create; `GET` calls `get_admin_stock_sku_summary`, `POST` calls `upsert_stock_sku` |
| `Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts` | New explicit open-box endpoint | Create; `POST` calls `open_stock_container` |
| `Website/src/app/api/ynot/admin/card-stock/route.ts` | Add/remove physical units | Modify; use `adjust_stock_sku_units` when `stockSkuId` is present, keep `adjust_card_stock_units` fallback |
| `Website/src/app/api/ynot/admin/card-stock/unit/route.ts` | Edit/delete one physical unit | Modify; `PATCH` calls patched `edit_card_stock_unit` with `p_stock_sku_id`, `DELETE` keeps `delete_card_stock_unit` |
| `Website/src/app/api/ynot/admin/card-stock/units/route.ts` | List units inside a Sub SKU/group | Modify; support `stockSkuId` filtering and return `stockSkuId` |
| `Website/src/app/api/ynot/admin/card-stock/purge-archived/route.ts` | Archive cleanup | Verify no signature change; `purge_archived_card_stock` must ignore active parent/child conversion rows |
| `Website/src/app/api/ynot/admin/cards/route.ts` | Main SKU/product CRUD | Preserve; main SKU stays editable in `cards` |
| `Website/src/app/api/ynot/admin/campaigns/route.ts` | Draft/live pack save and prize metadata | Modify/verify; save `stockSkuId` metadata through `saveInitialPrizes()` and `liveEditPrizeRpcRows()` |
| `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts` | Owner review/publish for live edits | Modify/verify; preserve `stockSkuId` in `draw_round_live_revisions.prize_snapshot` and publish path |
| `Website/src/app/api/ynot/admin/prizes/route.ts` | Prize row edit | Modify/verify; `metadataValue()` must preserve `stockSkuId` and unknown metadata fields |
| `Website/src/app/api/ynot/admin/campaigns/[id]/lineup/route.ts` | Admin pack editor lineup | Verify route remains thin; `getAdminCampaignPrizeLineup()` returns Sub SKU images and stock target metadata |
| `Website/src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts` | Live pack monitor | Verify route remains thin; `getLivePackMonitor()`/monitor image helpers remain compatible |
| `Website/src/app/api/ynot/gacha/open/route.ts` | Pack opening public response hydration | Modify; use stock unit image -> Sub SKU image -> product image without exposing private IDs |
| `Website/src/app/api/ynot/packs/[slug]/last-prize/route.ts` | Pack detail last-prize preview | Verify route remains thin; `getLastPrizePreviewForCampaign()` resolves `stockSkuId` image fallback |
| `Website/src/app/api/ynot/shipping/route.ts` | Customer shipping request | Verify no signature change to `request_shipping_for_items`; displayed shipping data uses Sub SKU fallback through `getShipping()` |
| `Website/src/app/api/ynot/admin/shipping/route.ts` | Admin shipping status updates | Verify no signature change to `update_shipping_request_status`; admin shipping item images use Sub SKU fallback through `getShipping()` |
| `Website/src/app/api/ynot/collection/convert/route.ts` and `Website/src/app/api/ynot/exchange/route.ts` | Convert bag item to coins | Verify no stock SKU mutation; `submit_card_conversion` must not erase stock-unit image linkage |

RPC/function checklist:

| RPC/function | Plan action |
| --- | --- |
| `upsert_stock_sku` | New RPC for Sub SKU create/edit plus conversion rule upsert |
| `get_admin_stock_sku_summary` | New RPC for prize catalog counts, box count, loose pack count, and pack equivalent |
| `get_admin_prize_stock_summaries` | Patch existing batch readiness RPC so campaign/prize save paths receive first-class `stockSkuId` Sub SKU rows instead of legacy condition-only rows |
| `adjust_stock_sku_units` | New RPC for add/remove physical stock by Sub SKU |
| `open_stock_container` | New RPC for atomic box -> pack conversion |
| `edit_card_stock_unit` | Patch signature to accept `p_stock_sku_id`; validate same card; audit previous/new Sub SKU |
| `delete_card_stock_unit` | Keep signature; verify parent/child converted units cannot be removed in a way that breaks audit history |
| `purge_archived_card_stock` | Keep signature; verify archived conversion children/parents remain audit-safe |
| `card_stock_unit_matches_prize_filter` | Patch to prefer `metadata.stockSkuId`, then legacy `stockUnitGroupKey`/`stockUnitFilter` |
| `edit_live_campaign_inventory` | Patch/verify metadata comparison and materialization use `stockSkuId` |
| `publish_live_campaign_revision` | Patch/verify published live revisions preserve `stockSkuId` and call the patched materialization path |
| `release_campaign_reservations` | Keep signature; verify release remains by campaign and does not lose Sub SKU metadata |
| `get_card_stock_summary` | Keep as main SKU aggregate fallback |
| `get_admin_card_stock_subsku_summary` | Keep as legacy fallback until first-class `stock_skus` is fully populated |
| `get_admin_pack_monitor_prize_units` | Keep signature; verify monitor stats still attach exact stock unit images through data helpers |
| `get_live_pack_monitor` | Keep signature; verify live monitor remains compatible after `stock_sku_id` joins |
| `open_gacha_campaign` | Patch image fallback and stock selection path without leaking internal IDs |
| `request_shipping_for_items` | Keep signature; exact image linkage stays through `collection_items.card_stock_unit_id` |
| `update_shipping_request_status` | Keep signature |
| `submit_card_conversion` | Keep signature; converted items must retain their original stock unit linkage for audit/history |

## Task 0: Preflight Current Repo Rules

**Files:**
- Read: `AGENTS.md`
- Read: `Website/AGENTS.md`
- Read: `Website/node_modules/next/dist/docs/01-app/index.md`
- Read: `Website/node_modules/next/dist/docs/index.md`

- [ ] **Step 1: Confirm repo and branch**

Run:

```bash
pwd
git status --short
git branch --show-current
```

Expected: `pwd` is `/Users/pinkmerry/Project X/YNOTT`. `git status --short` may show unrelated user work; do not revert it.

- [ ] **Step 2: Read route/runtime docs before API edits**

Run:

```bash
sed -n '1,180p' Website/AGENTS.md
sed -n '1,220p' Website/node_modules/next/dist/docs/01-app/index.md
sed -n '1,160p' Website/node_modules/next/dist/docs/index.md
```

Expected: confirm App Router/API route expectations for this installed Next version before touching files under `Website/src/app/api`.

- [ ] **Step 3: Commit nothing**

No commit for preflight. Continue to Task 1.

---

### Task 1: Add Pure Stock Sub SKU Conversion Helpers

**Files:**
- Create: `Website/src/features/ynot/stock-subsku-conversion.ts`
- Create: `Website/scripts/test-stock-subsku-conversion.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the failing helper test**

Create `Website/scripts/test-stock-subsku-conversion.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-subsku-conversion.ts", import.meta.url),
  "utf8",
);
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
const helpers = cjsModule.exports;

test("normalizes stock SKU unit kind", () => {
  assert.equal(helpers.normalizeStockSkuUnitKind("box"), "box");
  assert.equal(helpers.normalizeStockSkuUnitKind("pack"), "pack");
  assert.equal(helpers.normalizeStockSkuUnitKind("card"), "card");
  assert.equal(helpers.normalizeStockSkuUnitKind("other"), "other");
  assert.equal(helpers.normalizeStockSkuUnitKind("booster"), "other");
  assert.equal(helpers.normalizeStockSkuUnitKind(null), "other");
});

test("calculates opened child units from a box conversion rule", () => {
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 1,
      childQuantity: 24,
    }),
    24,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 5,
      childQuantity: 30,
    }),
    150,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 2.9,
      childQuantity: 20.7,
    }),
    40,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 0,
      childQuantity: 24,
    }),
    0,
  );
});

test("calculates pack equivalent by Sub SKU type and conversion rule", () => {
  const rows = [
    {
      stockSkuId: "op16-box",
      sku: "OP16-JP-BOX",
      unitKind: "box",
      totalUnits: 10,
      availableUnits: 10,
      childStockSkuId: "op16-pack",
      childQuantity: 24,
    },
    {
      stockSkuId: "op16-pack",
      sku: "OP16-JP-PACK",
      unitKind: "pack",
      totalUnits: 37,
      availableUnits: 37,
    },
    {
      stockSkuId: "op16-other",
      sku: "OP16-PLAYMAT",
      unitKind: "other",
      totalUnits: 3,
      availableUnits: 3,
    },
  ];

  assert.deepEqual(helpers.stockSkuPackEquivalent(rows), {
    totalPackEquivalent: 277,
    availablePackEquivalent: 277,
    rows: [
      {
        stockSkuId: "op16-box",
        sku: "OP16-JP-BOX",
        unitKind: "box",
        packEquivalent: 240,
        availablePackEquivalent: 240,
      },
      {
        stockSkuId: "op16-pack",
        sku: "OP16-JP-PACK",
        unitKind: "pack",
        packEquivalent: 37,
        availablePackEquivalent: 37,
      },
      {
        stockSkuId: "op16-other",
        sku: "OP16-PLAYMAT",
        unitKind: "other",
        packEquivalent: null,
        availablePackEquivalent: null,
      },
    ],
  });
});

test("uses exact unit image before Sub SKU image before product image", () => {
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: " https://cdn.example/unit.png ",
      stockSkuImageUrl: "https://cdn.example/subsku.png",
      productImageUrl: "https://cdn.example/product.png",
    }),
    "https://cdn.example/unit.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: "",
      stockSkuImageUrl: " https://cdn.example/subsku.png ",
      productImageUrl: "https://cdn.example/product.png",
    }),
    "https://cdn.example/subsku.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: null,
      stockSkuImageUrl: "",
      productImageUrl: " https://cdn.example/product.png ",
    }),
    "https://cdn.example/product.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: null,
      stockSkuImageUrl: null,
      productImageUrl: null,
    }),
    null,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
node --test scripts/test-stock-subsku-conversion.mjs
```

Expected: FAIL with `ENOENT` or `Cannot find module` for `stock-subsku-conversion.ts`.

- [ ] **Step 3: Implement the helper module**

Create `Website/src/features/ynot/stock-subsku-conversion.ts`:

```ts
export type StockSkuUnitKind = "card" | "pack" | "box" | "other";

export type StockSkuConversionSummaryRow = {
  stockSkuId: string;
  sku: string;
  unitKind: StockSkuUnitKind | string | null;
  totalUnits?: number | null;
  availableUnits?: number | null;
  childStockSkuId?: string | null;
  childQuantity?: number | null;
};

export type StockSkuPackEquivalentRow = {
  stockSkuId: string;
  sku: string;
  unitKind: StockSkuUnitKind;
  packEquivalent: number | null;
  availablePackEquivalent: number | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

export function normalizeStockSkuUnitKind(value: unknown): StockSkuUnitKind {
  if (value === "card" || value === "pack" || value === "box" || value === "other") {
    return value;
  }
  return "other";
}

export function childUnitsFromContainerOpen({
  containerCount,
  childQuantity,
}: {
  containerCount: unknown;
  childQuantity: unknown;
}) {
  return positiveInteger(containerCount) * positiveInteger(childQuantity);
}

function rowPackEquivalent(row: StockSkuConversionSummaryRow, countField: "totalUnits" | "availableUnits") {
  const unitKind = normalizeStockSkuUnitKind(row.unitKind);
  const count = positiveInteger(row[countField]);
  if (unitKind === "pack") return count;
  if (unitKind === "box" && cleanText(row.childStockSkuId)) {
    const childQuantity = positiveInteger(row.childQuantity);
    return childQuantity > 0 ? count * childQuantity : null;
  }
  return null;
}

export function stockSkuPackEquivalent(rows: StockSkuConversionSummaryRow[]) {
  const equivalentRows: StockSkuPackEquivalentRow[] = rows.map((row) => {
    const unitKind = normalizeStockSkuUnitKind(row.unitKind);
    return {
      stockSkuId: row.stockSkuId,
      sku: row.sku,
      unitKind,
      packEquivalent: rowPackEquivalent(row, "totalUnits"),
      availablePackEquivalent: rowPackEquivalent(row, "availableUnits"),
    };
  });
  return {
    totalPackEquivalent: equivalentRows.reduce(
      (sum, row) => sum + (row.packEquivalent ?? 0),
      0,
    ),
    availablePackEquivalent: equivalentRows.reduce(
      (sum, row) => sum + (row.availablePackEquivalent ?? 0),
      0,
    ),
    rows: equivalentRows,
  };
}

export function stockSkuPublicImageUrl({
  stockUnitImageUrl,
  stockSkuImageUrl,
  productImageUrl,
}: {
  stockUnitImageUrl?: unknown;
  stockSkuImageUrl?: unknown;
  productImageUrl?: unknown;
}) {
  return cleanText(stockUnitImageUrl) ?? cleanText(stockSkuImageUrl) ?? cleanText(productImageUrl);
}
```

- [ ] **Step 4: Add package script**

Modify `Website/package.json` scripts:

```json
"test:stock-subsku-conversion": "node --test scripts/test-stock-subsku-conversion.mjs"
```

Keep existing scripts unchanged.

- [ ] **Step 5: Run helper test**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add Website/package.json Website/scripts/test-stock-subsku-conversion.mjs Website/src/features/ynot/stock-subsku-conversion.ts
git commit -m "Model box pack stock conversions

Constraint: Preserve cards as product identity and card_stock_units as physical stock.
Rejected: Hardcode 24 packs per box | Pokemon and other products use different counts.
Confidence: high
Scope-risk: narrow
Directive: Keep conversion math pure and covered before database or UI changes.
Tested: npm run test:stock-subsku-conversion
Not-tested: Database migration and admin UI not touched in this commit."
```

---

### Task 2: Add Stock SKU Tables And Conversion RPCs

**Files:**
- Create: `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`
- Create: `Website/scripts/test-stock-subsku-conversion-sql.mjs`
- Create: `Website/scripts/smoke-stock-subsku-db.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write SQL source test**

Create `Website/scripts/test-stock-subsku-conversion-sql.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql", import.meta.url),
  "utf8",
);

test("migration creates editable stock SKU and conversion tables", () => {
  assert.match(migration, /create table if not exists public\.stock_skus/i);
  assert.match(migration, /create table if not exists public\.stock_sku_conversion_rules/i);
  assert.match(migration, /unit_kind text not null/i);
  assert.match(migration, /check \(unit_kind in \('card', 'pack', 'box', 'other'\)\)/i);
  assert.match(migration, /child_quantity integer not null/i);
  assert.match(migration, /check \(child_quantity between 1 and 1000\)/i);
  assert.match(migration, /alter table public\.card_stock_units/i);
  assert.match(migration, /add column if not exists stock_sku_id uuid/i);
  assert.match(migration, /add column if not exists parent_stock_unit_id uuid/i);
  assert.match(migration, /add column if not exists conversion_rule_id uuid/i);
});

test("migration exposes summary and mutation RPCs", () => {
  assert.match(migration, /create or replace function public\.get_admin_stock_sku_summary/i);
  assert.match(migration, /create or replace function public\.get_admin_prize_stock_summaries/i);
  assert.match(migration, /create or replace function public\.upsert_stock_sku/i);
  assert.match(migration, /create or replace function public\.adjust_stock_sku_units/i);
  assert.match(migration, /create or replace function public\.open_stock_container/i);
  assert.match(migration, /'stockSkuId'/);
  assert.match(migration, /concat\('stock-sku:', sku\.id::text\)/);
  assert.match(migration, /grant execute on function public\.open_stock_container/i);
});

test("migration patches related stock movement and live revision RPCs", () => {
  assert.match(migration, /create or replace function public\.edit_card_stock_unit/i);
  assert.match(migration, /p_stock_sku_id uuid default null/i);
  assert.match(migration, /previousStockSkuId/i);
  assert.match(migration, /newStockSkuId/i);
  assert.match(migration, /create or replace function public\.card_stock_unit_matches_prize_filter/i);
  assert.match(migration, /p_prize_metadata ->> 'stockSkuId'/);
  assert.match(migration, /edit_live_campaign_inventory|publish_live_campaign_revision/i);
  assert.match(migration, /stockSkuId/i);
});

test("open_stock_container atomically consumes box units and creates child pack units", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /child_quantity/i);
  assert.match(migration, /parent_stock_unit_id/i);
  assert.match(migration, /conversion_rule_id/i);
  assert.match(migration, /'container_opened'/i);
  assert.match(migration, /'container_child_created'/i);
  assert.match(migration, /'archived'/i);
  assert.match(migration, /'stock_created'/i);
  assert.doesNotMatch(migration, /status = 'allocated'[\s\S]{0,120}open_stock_container/i);
});

test("stock SKU mutations validate conversion ownership and ledger exact inserted rows", () => {
  assert.match(migration, /child_stock_sku_not_found/i);
  assert.match(migration, /conversion_cross_card_not_allowed/i);
  assert.match(migration, /with inserted as \(\s*insert into public\.card_stock_units/i);
  assert.match(migration, /select id, card_id, 'stock_created', p_admin_id/i);
  assert.match(migration, /with child_units as \(\s*insert into public\.card_stock_units/i);
  assert.doesNotMatch(migration, /select id, card_id, 'created', p_admin_id/i);
  assert.doesNotMatch(
    migration,
    /stock_sku_id = sku_row\.id[\s\S]{0,240}created_at >= now\(\) - interval '5 minutes'/i,
  );
  assert.doesNotMatch(
    migration,
    /parent_stock_unit_id = parent_unit\.id[\s\S]{0,240}created_at >= now\(\) - interval '5 minutes'/i,
  );
});
```

- [ ] **Step 2: Add package script and verify failure**

Modify `Website/package.json` scripts:

```json
"test:stock-subsku-conversion-sql": "node --test scripts/test-stock-subsku-conversion-sql.mjs",
"smoke:stock-subsku-db": "node scripts/smoke-stock-subsku-db.mjs"
```

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-sql
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the migration**

Create `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`:

```sql
-- stock_skus_and_container_conversion
--
-- First-class editable Sub SKUs plus box -> pack conversion rules.
-- cards remains the product/main SKU table; card_stock_units remains physical stock.

create extension if not exists pgcrypto;

create table if not exists public.stock_skus (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  sku_code text not null,
  label text not null,
  unit_kind text not null default 'other'
    check (unit_kind in ('card', 'pack', 'box', 'other')),
  image_url text,
  image_storage_path text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stock_skus_card_code_unique_idx
  on public.stock_skus(card_id, lower(sku_code))
  where is_active;

create index if not exists stock_skus_card_kind_idx
  on public.stock_skus(card_id, unit_kind)
  where is_active;

create table if not exists public.stock_sku_conversion_rules (
  id uuid primary key default gen_random_uuid(),
  parent_stock_sku_id uuid not null references public.stock_skus(id) on delete restrict,
  child_stock_sku_id uuid not null references public.stock_skus(id) on delete restrict,
  child_quantity integer not null check (child_quantity between 1 and 1000),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_stock_sku_id <> child_stock_sku_id)
);

create unique index if not exists stock_sku_conversion_active_unique_idx
  on public.stock_sku_conversion_rules(parent_stock_sku_id, child_stock_sku_id)
  where is_active;

alter table public.card_stock_units
  add column if not exists stock_sku_id uuid references public.stock_skus(id) on delete restrict,
  add column if not exists parent_stock_unit_id uuid references public.card_stock_units(id) on delete restrict,
  add column if not exists conversion_rule_id uuid references public.stock_sku_conversion_rules(id) on delete restrict,
  add column if not exists converted_at timestamptz;

create index if not exists card_stock_units_stock_sku_status_idx
  on public.card_stock_units(stock_sku_id, status, created_at)
  where stock_sku_id is not null;

create index if not exists card_stock_units_parent_stock_unit_idx
  on public.card_stock_units(parent_stock_unit_id)
  where parent_stock_unit_id is not null;

create or replace function app_private.stock_sku_code_part(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9._-]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'SKU'
  );
$$;

create or replace function app_private.stock_sku_default_kind(p_catalog_category text, p_condition text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_catalog_category, '')) like '%box%' then 'box'
    when lower(coalesce(p_catalog_category, '')) like '%pack%' then 'pack'
    when coalesce(p_condition, 'raw') in ('raw', 'graded') then 'card'
    else 'other'
  end;
$$;

create or replace function app_private.stock_sku_default_code(
  p_card public.cards,
  p_condition text,
  p_grade text,
  p_grading_service text,
  p_cert_number text
)
returns text
language sql
stable
as $$
  select concat_ws(
    '-',
    app_private.stock_sku_code_part(coalesce(p_card.model_code, p_card.card_code, p_card.id::text)),
    case
      when coalesce(p_condition, 'raw') = 'graded' then
        concat_ws(
          '',
          app_private.stock_sku_code_part(coalesce(p_grading_service, 'graded')),
          nullif(regexp_replace(coalesce(p_grade, ''), '[^0-9]+', '', 'g'), '')
        )
      when coalesce(p_condition, 'raw') = 'sealed' then 'SEALED'
      else 'RAW'
    end,
    case when nullif(p_cert_number, '') is not null then app_private.stock_sku_code_part(p_cert_number) end
  );
$$;

create or replace function app_private.ensure_default_stock_sku(
  p_card_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  card_row public.cards%rowtype;
  next_code text;
  next_label text;
  next_kind text;
  stock_sku_id uuid;
begin
  select * into card_row
  from public.cards
  where id = p_card_id;

  if card_row.id is null then
    raise exception 'card_required';
  end if;

  next_code := app_private.stock_sku_default_code(
    card_row,
    coalesce(nullif(p_condition, ''), 'raw'),
    p_grade,
    p_grading_service,
    p_cert_number
  );
  next_kind := app_private.stock_sku_default_kind(
    card_row.catalog_category,
    coalesce(nullif(p_condition, ''), 'raw')
  );
  next_label := case
    when coalesce(nullif(p_condition, ''), 'raw') = 'graded' then
      concat_ws(' · ', upper(coalesce(p_grading_service, 'graded')), nullif(p_grade, ''), case when nullif(p_cert_number, '') is not null then '#' || p_cert_number end)
    when coalesce(nullif(p_condition, ''), 'raw') = 'sealed' then 'Sealed'
    else 'Raw'
  end;

  insert into public.stock_skus(
    card_id,
    sku_code,
    label,
    unit_kind,
    image_url,
    image_storage_path,
    metadata
  )
  values (
    p_card_id,
    next_code,
    next_label,
    next_kind,
    nullif(p_image_url, ''),
    nullif(p_image_storage_path, ''),
    jsonb_build_object(
      'backfillIdentity',
      jsonb_build_object(
        'condition', coalesce(nullif(p_condition, ''), 'raw'),
        'grade', coalesce(p_grade, ''),
        'gradingService', coalesce(p_grading_service, ''),
        'certNumber', coalesce(p_cert_number, ''),
        'gemrateId', coalesce(p_gemrate_id, '')
      )
    )
  )
  on conflict do nothing;

  select id into stock_sku_id
  from public.stock_skus
  where card_id = p_card_id
    and lower(sku_code) = lower(next_code)
    and is_active
  order by created_at asc, id asc
  limit 1;

  return stock_sku_id;
end;
$$;

with missing as (
  select
    stock.id,
    app_private.ensure_default_stock_sku(
      stock.card_id,
      coalesce(nullif(stock.condition, ''), 'raw'),
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grade, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grading_service, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.cert_number, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.gemrate_id, '') else null end,
      stock.image_url,
      stock.image_storage_path
    ) as next_stock_sku_id
  from public.card_stock_units stock
  where stock.stock_sku_id is null
)
update public.card_stock_units stock
set stock_sku_id = missing.next_stock_sku_id,
    updated_at = now()
from missing
where stock.id = missing.id
  and missing.next_stock_sku_id is not null;

create or replace function public.upsert_stock_sku(
  p_stock_sku_id uuid default null,
  p_card_id uuid default null,
  p_sku_code text default null,
  p_label text default null,
  p_unit_kind text default 'other',
  p_image_url text default null,
  p_image_storage_path text default null,
  p_parent_stock_sku_id uuid default null,
  p_child_stock_sku_id uuid default null,
  p_child_quantity integer default null,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_kind text := coalesce(nullif(p_unit_kind, ''), 'other');
  saved_sku public.stock_skus%rowtype;
  child_sku public.stock_skus%rowtype;
  saved_rule public.stock_sku_conversion_rules%rowtype;
begin
  if normalized_kind not in ('card', 'pack', 'box', 'other') then
    raise exception 'invalid_stock_sku_kind';
  end if;

  if p_stock_sku_id is null and p_card_id is null then
    raise exception 'card_required';
  end if;

  if p_stock_sku_id is null then
    insert into public.stock_skus(
      card_id,
      sku_code,
      label,
      unit_kind,
      image_url,
      image_storage_path,
      metadata
    )
    values (
      p_card_id,
      nullif(trim(p_sku_code), ''),
      nullif(trim(p_label), ''),
      normalized_kind,
      nullif(trim(p_image_url), ''),
      nullif(trim(p_image_storage_path), ''),
      jsonb_build_object('createdByAdminId', p_admin_id)
    )
    returning * into saved_sku;
  else
    update public.stock_skus
    set sku_code = coalesce(nullif(trim(p_sku_code), ''), sku_code),
        label = coalesce(nullif(trim(p_label), ''), label),
        unit_kind = normalized_kind,
        image_url = nullif(trim(p_image_url), ''),
        image_storage_path = nullif(trim(p_image_storage_path), ''),
        metadata = metadata || jsonb_build_object('updatedByAdminId', p_admin_id),
        updated_at = now()
    where id = p_stock_sku_id
    returning * into saved_sku;
  end if;

  if saved_sku.id is null then
    raise exception 'stock_sku_not_found';
  end if;

  if normalized_kind = 'box' and p_child_stock_sku_id is not null then
    if p_child_quantity is null or p_child_quantity < 1 or p_child_quantity > 1000 then
      raise exception 'invalid_child_quantity';
    end if;

    select * into child_sku
    from public.stock_skus
    where id = p_child_stock_sku_id
      and is_active
    for update;

    if child_sku.id is null then
      raise exception 'child_stock_sku_not_found';
    end if;
    if child_sku.card_id <> saved_sku.card_id then
      raise exception 'conversion_cross_card_not_allowed';
    end if;

    update public.stock_sku_conversion_rules
    set is_active = false,
        updated_at = now()
    where parent_stock_sku_id = saved_sku.id
      and is_active
      and child_stock_sku_id <> p_child_stock_sku_id;

    insert into public.stock_sku_conversion_rules(
      parent_stock_sku_id,
      child_stock_sku_id,
      child_quantity,
      metadata
    )
    values (
      saved_sku.id,
      p_child_stock_sku_id,
      p_child_quantity,
      jsonb_build_object('updatedByAdminId', p_admin_id)
    )
    on conflict (parent_stock_sku_id, child_stock_sku_id)
    where is_active
    do update set
      child_quantity = excluded.child_quantity,
      metadata = public.stock_sku_conversion_rules.metadata || excluded.metadata,
      updated_at = now()
    returning * into saved_rule;
  end if;

  return jsonb_build_object(
    'stockSkuId', saved_sku.id,
    'sku', saved_sku.sku_code,
    'label', saved_sku.label,
    'unitKind', saved_sku.unit_kind,
    'conversionRuleId', saved_rule.id,
    'childStockSkuId', saved_rule.child_stock_sku_id,
    'childQuantity', saved_rule.child_quantity
  );
end;
$$;

create or replace function public.get_admin_stock_sku_summary(
  p_card_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with stock_counts as (
    select
      stock.stock_sku_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      count(*) filter (where stock.status = 'archived')::integer as archived_units,
      (array_remove(array_agg(stock.image_url order by stock.created_at asc, stock.id asc), null))[1] as sample_unit_image_url
    from public.card_stock_units stock
    where stock.stock_sku_id is not null
      and stock.status <> 'deleted'
    group by stock.stock_sku_id
  ),
  active_rules as (
    select distinct on (rule.parent_stock_sku_id)
      rule.parent_stock_sku_id,
      rule.id as conversion_rule_id,
      rule.child_stock_sku_id,
      child.sku_code as child_sku,
      child.label as child_label,
      rule.child_quantity
    from public.stock_sku_conversion_rules rule
    join public.stock_skus child on child.id = rule.child_stock_sku_id
    where rule.is_active
    order by rule.parent_stock_sku_id, rule.created_at desc, rule.id desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stockSkuId', sku.id,
        'cardId', sku.card_id,
        'sku', sku.sku_code,
        'label', sku.label,
        'unitKind', sku.unit_kind,
        'imageUrl', sku.image_url,
        'imageStoragePath', sku.image_storage_path,
        'sampleUnitImageUrl', stock_counts.sample_unit_image_url,
        'totalUnits', coalesce(stock_counts.total_units, 0),
        'availableUnits', coalesce(stock_counts.available_units, 0),
        'reservedUnits', coalesce(stock_counts.reserved_units, 0),
        'allocatedUnits', coalesce(stock_counts.allocated_units, 0),
        'archivedUnits', coalesce(stock_counts.archived_units, 0),
        'conversionRuleId', active_rules.conversion_rule_id,
        'childStockSkuId', active_rules.child_stock_sku_id,
        'childSku', active_rules.child_sku,
        'childLabel', active_rules.child_label,
        'childQuantity', active_rules.child_quantity
      )
      order by sku.card_id, sku.unit_kind, sku.sku_code
    ),
    '[]'::jsonb
  )
  from public.stock_skus sku
  left join stock_counts on stock_counts.stock_sku_id = sku.id
  left join active_rules on active_rules.parent_stock_sku_id = sku.id
  where sku.is_active
    and (p_card_id is null or sku.card_id = p_card_id);
$$;

create or replace function public.get_admin_prize_stock_summaries(
  p_card_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requested_cards as (
    select distinct card_id
    from unnest(coalesce(p_card_ids, '{}'::uuid[])) as card_id
    where card_id is not null
  ),
  unit_counts as (
    select
      stock.card_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      count(*) filter (where stock.status = 'archived')::integer as archived_units,
      count(*) filter (where stock.status = 'deleted')::integer as deleted_units
    from public.card_stock_units stock
    join requested_cards requested on requested.card_id = stock.card_id
    group by stock.card_id
  ),
  stock_summaries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', cards.id,
          'totalUnits', coalesce(unit_counts.total_units, 0),
          'availableUnits', coalesce(unit_counts.available_units, 0),
          'reservedUnits', coalesce(unit_counts.reserved_units, 0),
          'allocatedUnits', coalesce(unit_counts.allocated_units, 0),
          'archivedUnits', coalesce(unit_counts.archived_units, 0),
          'deletedUnits', coalesce(unit_counts.deleted_units, 0)
        )
        order by cards.updated_at desc
      ),
      '[]'::jsonb
    ) as rows
    from public.cards cards
    join requested_cards requested on requested.card_id = cards.id
    left join unit_counts on unit_counts.card_id = cards.id
  ),
  stock_sku_counts as (
    select
      stock.card_id,
      stock.stock_sku_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      (array_remove(array_agg(stock.image_url order by stock.created_at asc, stock.id asc), null))[1] as sample_unit_image_url
    from public.card_stock_units stock
    join requested_cards requested on requested.card_id = stock.card_id
    where stock.stock_sku_id is not null
      and stock.status not in ('deleted', 'archived')
    group by stock.card_id, stock.stock_sku_id
  ),
  active_rules as (
    select distinct on (rule.parent_stock_sku_id)
      rule.parent_stock_sku_id,
      rule.id as conversion_rule_id,
      rule.child_stock_sku_id,
      child.sku_code as child_sku,
      child.label as child_label,
      rule.child_quantity
    from public.stock_sku_conversion_rules rule
    join public.stock_skus child on child.id = rule.child_stock_sku_id
    where rule.is_active
    order by rule.parent_stock_sku_id, rule.created_at desc, rule.id desc
  ),
  subsku_summaries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', sku.card_id,
          'stockSkuId', sku.id,
          'stockUnitGroupKey', concat('stock-sku:', sku.id::text),
          'sku', sku.sku_code,
          'label', sku.label,
          'unitKind', sku.unit_kind,
          'imageUrl', coalesce(nullif(sku.image_url, ''), stock_sku_counts.sample_unit_image_url),
          'imageStoragePath', sku.image_storage_path,
          'totalUnits', coalesce(stock_sku_counts.total_units, 0),
          'availableUnits', coalesce(stock_sku_counts.available_units, 0),
          'reservedUnits', coalesce(stock_sku_counts.reserved_units, 0),
          'allocatedUnits', coalesce(stock_sku_counts.allocated_units, 0),
          'conversionRuleId', active_rules.conversion_rule_id,
          'childStockSkuId', active_rules.child_stock_sku_id,
          'childSku', active_rules.child_sku,
          'childLabel', active_rules.child_label,
          'childQuantity', active_rules.child_quantity
        )
        order by sku.card_id, sku.unit_kind, sku.sku_code
      ),
      '[]'::jsonb
    ) as rows
    from public.stock_skus sku
    join requested_cards requested on requested.card_id = sku.card_id
    left join stock_sku_counts on stock_sku_counts.stock_sku_id = sku.id
    left join active_rules on active_rules.parent_stock_sku_id = sku.id
    where sku.is_active
  )
  select jsonb_build_object(
    'stockSummaries', coalesce((select rows from stock_summaries), '[]'::jsonb),
    'subSkuSummaries', coalesce((select rows from subsku_summaries), '[]'::jsonb)
  );
$$;

create or replace function public.adjust_stock_sku_units(
  p_stock_sku_id uuid,
  p_quantity_delta integer,
  p_admin_id uuid,
  p_source_type text default 'admin_stock_adjusted',
  p_source_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_condition text default null,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  sku_row public.stock_skus%rowtype;
  normalized_condition text;
  inserted_count integer := 0;
  removed_count integer := 0;
begin
  if p_stock_sku_id is null then
    raise exception 'stock_sku_required';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then
    raise exception 'invalid_quantity_delta';
  end if;

  select * into sku_row
  from public.stock_skus
  where id = p_stock_sku_id
    and is_active
  for update;

  if sku_row.id is null then
    raise exception 'stock_sku_not_found';
  end if;

  normalized_condition := coalesce(nullif(p_condition, ''), case when sku_row.unit_kind in ('box', 'pack', 'other') then 'sealed' else 'raw' end);

  if p_quantity_delta > 0 then
    if normalized_condition = 'graded' and (nullif(p_grade, '') is null or nullif(p_grading_service, '') is null) then
      raise exception 'graded_stock_identity_required';
    end if;
    if nullif(p_cert_number, '') is not null and p_quantity_delta <> 1 then
      raise exception 'stock_cert_requires_single_unit';
    end if;

    with inserted as (
      insert into public.card_stock_units(
        card_id,
        stock_sku_id,
        status,
        condition,
        grade,
        grading_service,
        cert_number,
        gemrate_id,
        image_url,
        image_storage_path,
        source_type,
        source_id,
        metadata
      )
      select
        sku_row.card_id,
        sku_row.id,
        'available',
        normalized_condition,
        case when normalized_condition = 'graded' then nullif(p_grade, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_grading_service, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_cert_number, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
        nullif(p_image_url, ''),
        nullif(p_image_storage_path, ''),
        p_source_type,
        p_source_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('stockSkuId', sku_row.id)
      from generate_series(1, p_quantity_delta)
      returning id, card_id
    ),
    ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'stock_created', p_admin_id, jsonb_build_object('stockSkuId', sku_row.id, 'sourceType', p_source_type)
      from inserted
      returning 1
    )
    select count(*)::integer into inserted_count
    from inserted;
  else
    with victims as (
      select id
      from public.card_stock_units
      where stock_sku_id = sku_row.id
        and status = 'available'
      order by created_at desc, id desc
      limit abs(p_quantity_delta)
      for update skip locked
    ),
    archived as (
      update public.card_stock_units stock
      set status = 'archived',
          source_type = p_source_type,
          source_id = p_source_id,
          metadata = stock.metadata || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('stockSkuId', sku_row.id),
          updated_at = now()
      from victims
      where stock.id = victims.id
      returning stock.id, stock.card_id
    ),
    ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'archived', p_admin_id, jsonb_build_object('stockSkuId', sku_row.id, 'sourceType', p_source_type)
      from archived
      returning 1
    )
    select count(*)::integer into removed_count
    from archived;

    if removed_count <> abs(p_quantity_delta) then
      raise exception 'not_enough_available_stock_sku_units';
    end if;
  end if;

  return jsonb_build_object(
    'stockSkuId', sku_row.id,
    'quantityDelta', p_quantity_delta,
    'createdUnits', inserted_count,
    'archivedUnits', removed_count
  );
end;
$$;

create or replace function public.open_stock_container(
  p_parent_stock_sku_id uuid,
  p_quantity integer,
  p_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  rule_row public.stock_sku_conversion_rules%rowtype;
  parent_sku public.stock_skus%rowtype;
  child_sku public.stock_skus%rowtype;
  parent_unit record;
  opened_count integer := 0;
  child_count integer := 0;
  children_for_parent integer := 0;
  child_condition text;
begin
  if p_parent_stock_sku_id is null then
    raise exception 'parent_stock_sku_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'invalid_open_quantity';
  end if;

  select * into rule_row
  from public.stock_sku_conversion_rules
  where parent_stock_sku_id = p_parent_stock_sku_id
    and is_active
  order by created_at desc, id desc
  limit 1;

  if rule_row.id is null then
    raise exception 'conversion_rule_required';
  end if;

  select * into parent_sku
  from public.stock_skus
  where id = rule_row.parent_stock_sku_id
    and is_active
  for update;

  select * into child_sku
  from public.stock_skus
  where id = rule_row.child_stock_sku_id
    and is_active
  for update;

  if parent_sku.id is null or child_sku.id is null then
    raise exception 'stock_sku_not_found';
  end if;
  if parent_sku.card_id <> child_sku.card_id then
    raise exception 'conversion_cross_card_not_allowed';
  end if;

  child_condition := case when child_sku.unit_kind in ('pack', 'box', 'other') then 'sealed' else 'raw' end;

  for parent_unit in
    select *
    from public.card_stock_units
    where stock_sku_id = parent_sku.id
      and status = 'available'
    order by created_at asc, id asc
    limit p_quantity
    for update skip locked
  loop
    opened_count := opened_count + 1;

    update public.card_stock_units
    set status = 'archived',
        source_type = 'container_opened',
        metadata = metadata || jsonb_build_object(
          'openedByAdminId', p_admin_id,
          'conversionRuleId', rule_row.id,
          'childStockSkuId', child_sku.id,
          'childQuantity', rule_row.child_quantity,
          'note', p_note
        ),
        converted_at = now(),
        updated_at = now()
    where id = parent_unit.id;

    insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
    values (
      parent_unit.id,
      parent_unit.card_id,
      'archived',
      p_admin_id,
      jsonb_build_object(
        'sourceType', 'container_opened',
        'parentStockSkuId', parent_sku.id,
        'childStockSkuId', child_sku.id,
        'childQuantity', rule_row.child_quantity,
        'note', p_note
      )
    );

    with child_units as (
      insert into public.card_stock_units(
        card_id,
        stock_sku_id,
        parent_stock_unit_id,
        conversion_rule_id,
        status,
        condition,
        source_type,
        source_id,
        image_url,
        image_storage_path,
        metadata
      )
      select
        child_sku.card_id,
        child_sku.id,
        parent_unit.id,
        rule_row.id,
        'available',
        child_condition,
        'container_child_created',
        parent_unit.id::text,
        null,
        null,
        jsonb_build_object(
          'createdByOpeningStockUnitId', parent_unit.id,
          'openedByAdminId', p_admin_id,
          'parentStockSkuId', parent_sku.id,
          'childStockSkuId', child_sku.id,
          'conversionRuleId', rule_row.id
        )
      from generate_series(1, rule_row.child_quantity)
      returning id, card_id
    ),
    child_ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select
        id,
        card_id,
        'stock_created',
        p_admin_id,
        jsonb_build_object(
          'sourceType', 'container_child_created',
          'parentStockUnitId', parent_unit.id,
          'parentStockSkuId', parent_sku.id,
          'childStockSkuId', child_sku.id,
          'conversionRuleId', rule_row.id
        )
      from child_units
      returning 1
    )
    select count(*)::integer into children_for_parent
    from child_units;

    if children_for_parent <> rule_row.child_quantity then
      raise exception 'container_child_creation_mismatch';
    end if;

    child_count := child_count + children_for_parent;
  end loop;

  if opened_count <> p_quantity then
    raise exception 'not_enough_available_container_stock';
  end if;

  return jsonb_build_object(
    'parentStockSkuId', parent_sku.id,
    'childStockSkuId', child_sku.id,
    'conversionRuleId', rule_row.id,
    'openedContainers', opened_count,
    'createdChildUnits', child_count,
    'childQuantity', rule_row.child_quantity
  );
end;
$$;

revoke all on table public.stock_skus from public, anon, authenticated;
revoke all on table public.stock_sku_conversion_rules from public, anon, authenticated;
grant all on table public.stock_skus to service_role;
grant all on table public.stock_sku_conversion_rules to service_role;

revoke all on function public.upsert_stock_sku(uuid, uuid, text, text, text, text, text, uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_admin_stock_sku_summary(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_prize_stock_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.adjust_stock_sku_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.open_stock_container(uuid, integer, uuid, text) from public, anon, authenticated;

grant execute on function public.upsert_stock_sku(uuid, uuid, text, text, text, text, text, uuid, uuid, integer, uuid) to service_role;
grant execute on function public.get_admin_stock_sku_summary(uuid) to service_role;
grant execute on function public.get_admin_prize_stock_summaries(uuid[]) to service_role;
grant execute on function public.adjust_stock_sku_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) to service_role;
grant execute on function public.open_stock_container(uuid, integer, uuid, text) to service_role;
```

- [ ] **Step 4: Patch existing stock-unit edit RPC**

Append a `create or replace function public.edit_card_stock_unit(...)` definition to the migration based on the current latest definition from `Database/supabase/migrations/20260604130000_edit_allocated_stock_unit.sql`, with these changes:

- Add argument `p_stock_sku_id uuid default null`.
- Validate the chosen Sub SKU exists and belongs to the same `card_id` as the stock unit.
- Set `card_stock_units.stock_sku_id = coalesce(p_stock_sku_id, card_stock_units.stock_sku_id)` so blank edits do not accidentally clear identity.
- Include `previousStockSkuId` and `newStockSkuId` in both `card_stock_ledger.metadata` and `audit_events.metadata`.
- Revoke/grant the new signature to `service_role`.

Concrete signature:

```sql
create or replace function public.edit_card_stock_unit(
  p_unit_id uuid,
  p_admin_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_stock_sku_id uuid default null
)
returns jsonb
```

Do not change `public.delete_card_stock_unit(uuid, uuid)` in the first implementation. It should stay available-only; add a SQL test assertion that active converted parent/child history is not hard-deleted by the new open-box flow.

- [ ] **Step 5: Patch live revision materialization RPCs**

In the same migration, patch the latest definitions of `public.edit_live_campaign_inventory(...)` and `public.publish_live_campaign_revision(...)` only where they compare or materialize prize metadata:

- Treat `metadata ->> 'stockSkuId'` as prize identity.
- Preserve `stockSkuId` when moving from `draw_round_live_revisions.prize_snapshot` into `draw_round_prizes.metadata`.
- Keep legacy `stockSku` and `stockUnitFilter` fallback for old rows.
- Keep existing awarded-unit locks: if a prize has awarded units, changing `stockSkuId` must raise the same identity-lock error as changing card/filter.
- Keep `release_campaign_reservations` behavior unchanged.

Add assertions to `Website/scripts/test-stock-subsku-conversion-sql.mjs` for `edit_live_campaign_inventory`, `publish_live_campaign_revision`, and `stockSkuId`.

- [ ] **Step 6: Create guarded local DB smoke script**

Create `Website/scripts/smoke-stock-subsku-db.mjs`:

```js
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
  throw new Error(`Refusing to mutate non-local Supabase URL: ${url}`);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function mustData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function deleteRows(table, queryBuilder) {
  const { error } = await queryBuilder;
  if (error) console.warn(`[cleanup] ${table}: ${error.message}`);
}

const suffix = randomUUID().slice(0, 8);
let cardId = "";
let boxSkuId = "";
let packSkuId = "";

async function cleanup() {
  if (!cardId) return;
  await deleteRows(
    "card_stock_ledger",
    supabase.from("card_stock_ledger").delete().eq("card_id", cardId),
  );
  await deleteRows(
    "card_stock_units children",
    supabase.from("card_stock_units").delete().eq("card_id", cardId).not("parent_stock_unit_id", "is", null),
  );
  await deleteRows(
    "card_stock_units",
    supabase.from("card_stock_units").delete().eq("card_id", cardId),
  );
  if (boxSkuId) {
    await deleteRows(
      "stock_sku_conversion_rules parent",
      supabase.from("stock_sku_conversion_rules").delete().eq("parent_stock_sku_id", boxSkuId),
    );
  }
  if (packSkuId) {
    await deleteRows(
      "stock_sku_conversion_rules child",
      supabase.from("stock_sku_conversion_rules").delete().eq("child_stock_sku_id", packSkuId),
    );
  }
  await deleteRows(
    "stock_skus",
    supabase.from("stock_skus").delete().eq("card_id", cardId),
  );
  await deleteRows(
    "cards",
    supabase.from("cards").delete().eq("id", cardId),
  );
}

try {
  const card = mustData(
    await supabase
      .from("cards")
      .insert({
        name: `Stock Sub SKU Smoke ${suffix}`,
        search_name: `stock-subsku-smoke-${suffix}`,
        card_code: `SMOKE-${suffix}`,
        search_code: `smoke-${suffix}`,
        series: "one_piece",
        grade: "Ungraded",
        condition: "sealed",
        catalog_category: "booster_pack",
        is_test: true,
      })
      .select("id")
      .single(),
    "insert test card",
  );
  cardId = card.id;

  const box = mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_card_id: cardId,
      p_sku_code: `SMOKE-${suffix}-BOX`,
      p_label: "Smoke Box",
      p_unit_kind: "box",
      p_admin_id: null,
    }),
    "create box SKU",
  );
  boxSkuId = box.stockSkuId;

  const pack = mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_card_id: cardId,
      p_sku_code: `SMOKE-${suffix}-PACK`,
      p_label: "Smoke Pack",
      p_unit_kind: "pack",
      p_admin_id: null,
    }),
    "create pack SKU",
  );
  packSkuId = pack.stockSkuId;

  mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_stock_sku_id: boxSkuId,
      p_sku_code: `SMOKE-${suffix}-BOX`,
      p_label: "Smoke Box",
      p_unit_kind: "box",
      p_child_stock_sku_id: packSkuId,
      p_child_quantity: 24,
      p_admin_id: null,
    }),
    "attach box conversion",
  );

  mustData(
    await supabase.rpc("adjust_stock_sku_units", {
      p_stock_sku_id: boxSkuId,
      p_quantity_delta: 1,
      p_admin_id: null,
      p_source_type: "local_stock_subsku_smoke",
      p_metadata: { smoke: true },
      p_condition: "sealed",
    }),
    "add one box",
  );

  const opened = mustData(
    await supabase.rpc("open_stock_container", {
      p_parent_stock_sku_id: boxSkuId,
      p_quantity: 1,
      p_admin_id: null,
      p_note: "local smoke",
    }),
    "open one box",
  );

  assert.equal(opened.openedContainers, 1);
  assert.equal(opened.createdChildUnits, 24);
  assert.equal(opened.childQuantity, 24);

  const summary = mustData(
    await supabase.rpc("get_admin_prize_stock_summaries", {
      p_card_ids: [cardId],
    }),
    "batch prize stock summary",
  );

  const subSkuRows = Array.isArray(summary?.subSkuSummaries) ? summary.subSkuSummaries : [];
  const boxRow = subSkuRows.find((row) => row.stockSkuId === boxSkuId);
  const packRow = subSkuRows.find((row) => row.stockSkuId === packSkuId);

  assert.ok(boxRow, "box Sub SKU summary row exists");
  assert.ok(packRow, "pack Sub SKU summary row exists");
  assert.equal(boxRow.stockUnitGroupKey, `stock-sku:${boxSkuId}`);
  assert.equal(boxRow.availableUnits, 0);
  assert.equal(boxRow.childStockSkuId, packSkuId);
  assert.equal(boxRow.childQuantity, 24);
  assert.equal(packRow.stockUnitGroupKey, `stock-sku:${packSkuId}`);
  assert.equal(packRow.availableUnits, 24);

  console.log("stock Sub SKU local DB smoke passed");
} finally {
  await cleanup();
}
```

- [ ] **Step 7: Run SQL source test**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-sql
```

Expected: PASS.

- [ ] **Step 8: Run Supabase dry-run**

Run:

```bash
cd Database
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Expected: migration list succeeds and dry-run shows `20260610110000_stock_skus_and_container_conversion.sql` as pending without applying it.

- [ ] **Step 9: Run local DB behavior smoke**

Run this only against a local Supabase stack after the migration has been applied locally:

```bash
cd Website
npm run smoke:stock-subsku-db
```

Expected: PASS with `stock Sub SKU local DB smoke passed`. If the URL is not `localhost` or `127.0.0.1`, the script must fail before mutating data.

- [ ] **Step 10: Commit**

Run:

```bash
git add Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql Website/package.json Website/scripts/test-stock-subsku-conversion-sql.mjs Website/scripts/smoke-stock-subsku-db.mjs
git commit -m "Add editable stock SKU conversion schema

Constraint: Preserve current card_stock_units and random-pack allocation tables.
Rejected: Store packs-per-box on cards | conversion count belongs to each Box Sub SKU.
Confidence: medium
Scope-risk: broad
Directive: Do not apply this migration to production until dry-run, backup, and review gates pass.
Tested: npm run test:stock-subsku-conversion-sql; npm run smoke:stock-subsku-db; supabase db push --linked --dry-run --include-all
Not-tested: Production migration apply and live data backfill."
```

---

### Task 3: Add Admin Stock SKU APIs

**Files:**
- Create: `Website/src/app/api/ynot/admin/stock-skus/route.ts`
- Create: `Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts`
- Create: `Website/scripts/test-stock-subsku-admin-api.mjs`
- Modify: `Website/package.json`
- Modify: `Website/src/app/api/ynot/admin/card-stock/route.ts`
- Modify: `Website/src/app/api/ynot/admin/card-stock/unit/route.ts`
- Modify: `Website/src/app/api/ynot/admin/card-stock/units/route.ts`

- [ ] **Step 1: Write API source tests**

Create `Website/scripts/test-stock-subsku-admin-api.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const stockSkusRoute = read("../src/app/api/ynot/admin/stock-skus/route.ts");
const openContainerRoute = read("../src/app/api/ynot/admin/stock-skus/open-container/route.ts");
const cardStockRoute = read("../src/app/api/ynot/admin/card-stock/route.ts");
const cardStockUnitRoute = read("../src/app/api/ynot/admin/card-stock/unit/route.ts");
const cardStockUnitsRoute = read("../src/app/api/ynot/admin/card-stock/units/route.ts");
const lineupRoute = read("../src/app/api/ynot/admin/campaigns/[id]/lineup/route.ts");
const monitorRoute = read("../src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts");
const lastPrizeRoute = read("../src/app/api/ynot/packs/[slug]/last-prize/route.ts");
const shippingRoute = read("../src/app/api/ynot/shipping/route.ts");
const adminShippingRoute = read("../src/app/api/ynot/admin/shipping/route.ts");
const collectionConvertRoute = read("../src/app/api/ynot/collection/convert/route.ts");
const exchangeRoute = read("../src/app/api/ynot/exchange/route.ts");

test("stock SKU route is admin-only and calls summary/upsert RPCs", () => {
  assert.match(stockSkusRoute, /resolveAdminSession/);
  assert.match(stockSkusRoute, /enforceSameOriginMutation/);
  assert.match(stockSkusRoute, /enforceRateLimit/);
  assert.match(stockSkusRoute, /rpc\("get_admin_stock_sku_summary"/);
  assert.match(stockSkusRoute, /rpc\("upsert_stock_sku"/);
  assert.match(stockSkusRoute, /unitKind/);
  assert.match(stockSkusRoute, /childQuantity/);
  assert.doesNotMatch(stockSkusRoute, /Response\.json\(\{\s*error:\s*error\.message/);
});

test("open container route is admin-only and calls open_stock_container", () => {
  assert.match(openContainerRoute, /resolveAdminSession/);
  assert.match(openContainerRoute, /enforceSameOriginMutation/);
  assert.match(openContainerRoute, /rpc\("open_stock_container"/);
  assert.match(openContainerRoute, /parentStockSkuId/);
  assert.match(openContainerRoute, /quantity/);
  assert.match(openContainerRoute, /revalidateTag\("campaigns"/);
  assert.doesNotMatch(openContainerRoute, /card_stock_units"\)\.insert/);
});

test("legacy stock routes understand stockSkuId but keep old group fallback", () => {
  assert.match(cardStockRoute, /stockSkuId/);
  assert.match(cardStockRoute, /rpc\("adjust_stock_sku_units"/);
  assert.match(cardStockRoute, /rpc\("adjust_card_stock_units"/);
  assert.match(cardStockUnitRoute, /stockSkuId/);
  assert.match(cardStockUnitRoute, /p_stock_sku_id/);
  assert.match(cardStockUnitsRoute, /stock_sku_id/);
  assert.match(cardStockUnitsRoute, /stockSkuId/);
  assert.match(cardStockUnitsRoute, /searchParams\.get\("stockSkuId"\)/);
  assert.match(cardStockUnitsRoute, /\.eq\("stock_sku_id",\s*stockSkuId\)/);
  assert.match(cardStockUnitsRoute, /stockSkuId:\s*unit\.stock_sku_id/);
});

test("thin detail and admin routes call stock-aware data loaders or unchanged RPCs", () => {
  assert.match(lineupRoute, /getAdminCampaignPrizeLineup/);
  assert.match(monitorRoute, /getLivePackMonitor/);
  assert.match(lastPrizeRoute, /getLastPrizePreviewForCampaign/);
  assert.match(shippingRoute, /request_shipping_for_items/);
  assert.match(adminShippingRoute, /update_shipping_request_status/);
  assert.match(collectionConvertRoute, /handleCardConversionRequest/);
  assert.match(exchangeRoute, /handleCardConversionRequest/);
});
```

- [ ] **Step 2: Add package script and verify failure**

Modify `Website/package.json` scripts:

```json
"test:stock-subsku-admin-api": "node --test scripts/test-stock-subsku-admin-api.mjs"
```

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: FAIL because the new routes do not exist and legacy routes do not reference `stockSkuId`.

- [ ] **Step 3: Create stock SKU route**

Create `Website/src/app/api/ynot/admin/stock-skus/route.ts`:

```ts
import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UNIT_KINDS = new Set(["card", "pack", "box", "other"]);

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuidText(value: unknown) {
  const clean = text(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
    ? clean
    : "";
}

function positiveInt(value: unknown, max = 1000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null;
}

async function guard(request: Request, key: string) {
  if (!isSupabaseConfigured()) {
    return { error: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return { error: crossOrigin };
  const admin = await resolveAdminSession();
  if (!admin) {
    return { error: Response.json({ error: "Admin access is required." }, { status: 403 }) };
  }
  const limited = await enforceRateLimit(
    request,
    key,
    { limit: 180, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return { error: limited };
  return { admin };
}

function stockSkuErrorMessage(message?: string) {
  if (!message) return "Stock SKU could not be saved.";
  if (message.includes("invalid_stock_sku_kind")) return "Choose a valid Sub SKU type.";
  if (message.includes("card_required")) return "Choose a product first.";
  if (message.includes("invalid_child_quantity")) return "Packs per box must be between 1 and 1000.";
  if (message.includes("stock_sku_not_found")) return "Stock SKU was not found.";
  return "Stock SKU could not be saved.";
}

export async function GET(request: Request) {
  const gate = await guard(request, "ynot:admin:stock-skus:list");
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const cardId = uuidText(url.searchParams.get("cardId")) || null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_admin_stock_sku_summary", {
    p_card_id: cardId,
  });
  if (error) {
    return Response.json(
      { error: "Stock SKUs could not be loaded.", code: "STOCK_SKUS_LIST_FAILED" },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, stockSkus: Array.isArray(data) ? data : [] });
}

export async function POST(request: Request) {
  const gate = await guard(request, "ynot:admin:stock-skus:save");
  if (gate.error) return gate.error;
  const admin = gate.admin;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const unitKindRaw = text(body?.unitKind, 20);
  const unitKind = UNIT_KINDS.has(unitKindRaw) ? unitKindRaw : "other";
  const stockSkuId = uuidText(body?.stockSkuId) || null;
  const cardId = uuidText(body?.cardId) || null;
  const childStockSkuId = uuidText(body?.childStockSkuId) || null;
  const childQuantity =
    body?.childQuantity === undefined || body?.childQuantity === null || body?.childQuantity === ""
      ? null
      : positiveInt(body.childQuantity, 1000);

  if (!stockSkuId && !cardId) {
    return Response.json({ error: "Choose a product first." }, { status: 400 });
  }
  if (!text(body?.sku, 80)) {
    return Response.json({ error: "Sub SKU code is required." }, { status: 400 });
  }
  if (!text(body?.label, 160)) {
    return Response.json({ error: "Sub SKU label is required." }, { status: 400 });
  }
  if (unitKind === "box" && childStockSkuId && !childQuantity) {
    return Response.json({ error: "Packs per box must be between 1 and 1000." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("upsert_stock_sku", {
    p_stock_sku_id: stockSkuId,
    p_card_id: cardId,
    p_sku_code: text(body?.sku, 80),
    p_label: text(body?.label, 160),
    p_unit_kind: unitKind,
    p_image_url: text(body?.imageUrl, 600) || null,
    p_image_storage_path: text(body?.imageStoragePath, 400) || null,
    p_parent_stock_sku_id: null,
    p_child_stock_sku_id: childStockSkuId,
    p_child_quantity: childQuantity,
    p_admin_id: admin.adminId,
  });
  if (error) {
    return Response.json(
      { error: stockSkuErrorMessage(error.message), code: "STOCK_SKU_SAVE_FAILED" },
      { status: 409 },
    );
  }
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "stock_sku_saved",
    metadata: { stockSkuId: data?.stockSkuId ?? stockSkuId, unitKind },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, stockSku: data });
}
```

- [ ] **Step 4: Create open container route**

Create `Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts`:

```ts
import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuidText(value: unknown) {
  const clean = text(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
    ? clean
    : "";
}

function quantity(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1000 ? parsed : null;
}

function openErrorMessage(message?: string) {
  if (!message) return "Box stock could not be opened.";
  if (message.includes("conversion_rule_required")) return "Set which pack this box contains before opening it.";
  if (message.includes("not_enough_available_container_stock")) return "Not enough available boxes to open.";
  if (message.includes("conversion_cross_card_not_allowed")) return "Box and pack Sub SKUs must belong to the same product.";
  if (message.includes("invalid_open_quantity")) return "Open quantity must be between 1 and 1000 boxes.";
  return "Box stock could not be opened.";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:stock-skus:open-container",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parentStockSkuId = uuidText(body?.parentStockSkuId);
  const openQuantity = quantity(body?.quantity);
  if (!parentStockSkuId || !openQuantity) {
    return Response.json(
      { error: "parentStockSkuId and quantity are required." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("open_stock_container", {
    p_parent_stock_sku_id: parentStockSkuId,
    p_quantity: openQuantity,
    p_admin_id: admin.adminId,
    p_note: text(body?.note, 300) || null,
  });
  if (error) {
    return Response.json(
      { error: openErrorMessage(error.message), code: "OPEN_CONTAINER_FAILED" },
      { status: 409 },
    );
  }
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "stock_container_opened",
    metadata: {
      parentStockSkuId,
      quantity: openQuantity,
      result: data,
    },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, result: data });
}
```

- [ ] **Step 5: Wire legacy card-stock route to stockSkuId**

Modify `Website/src/app/api/ynot/admin/card-stock/route.ts`:

Add body field:

```ts
  stockSkuId?: unknown;
```

After `const sourceId = ...`, add:

```ts
  const stockSkuId = text(body?.stockSkuId, 80) || null;
```

Replace the single `adjust_card_stock_units` RPC call with:

```ts
  const rpcName = stockSkuId ? "adjust_stock_sku_units" : "adjust_card_stock_units";
  const rpcArgs = stockSkuId
    ? {
        p_stock_sku_id: stockSkuId,
        p_quantity_delta: delta,
        p_admin_id: admin.adminId,
        p_source_type: reason,
        p_source_id: sourceId,
        p_metadata: {
          adjustedByAdminId: admin.adminId,
          reason,
          sourceId,
          stockSkuId,
          stockUnitGroupKey: stockUnitGroupKey || null,
        } satisfies Json,
        p_condition: condition,
        p_grade: grade,
        p_grading_service: gradingService,
        p_cert_number: certNumber,
        p_gemrate_id: gemrateId,
        p_image_url: imageUrl,
        p_image_storage_path: imageStoragePath,
      }
    : {
        p_card_id: cardId,
        p_quantity_delta: delta,
        p_admin_id: admin.adminId,
        p_source_type: reason,
        p_source_id: sourceId,
        p_metadata: {
          adjustedByAdminId: admin.adminId,
          reason,
          sourceId,
          stockUnitGroupKey: stockUnitGroupKey || null,
        } satisfies Json,
        p_condition: condition,
        p_grade: grade,
        p_grading_service: gradingService,
        p_cert_number: certNumber,
        p_gemrate_id: gemrateId,
        p_image_url: imageUrl,
        p_image_storage_path: imageStoragePath,
      };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
```

Update the audit metadata object:

```ts
      stockSkuId,
      stockUnitGroupKey: stockUnitGroupKey || null,
```

- [ ] **Step 6: Include stockSkuId in unit edit/list routes**

Modify `Website/src/app/api/ynot/admin/card-stock/unit/route.ts`:

Add to `UnitBody`:

```ts
  stockSkuId?: unknown;
```

Add RPC arg to `edit_card_stock_unit` after Task 2 patches SQL support:

```ts
    p_stock_sku_id: text(body?.stockSkuId, 80) || null,
```

Modify `Website/src/app/api/ynot/admin/card-stock/units/route.ts` select:

```ts
"id,stock_sku_id,condition,grade,grading_service,cert_number,gemrate_id,image_url,image_storage_path,status,quantity"
```

Read the optional query param:

```ts
const stockSkuId = text(url.searchParams.get("stockSkuId"), 80);
```

Allow either `stockSkuId` or legacy `groupKey`:

```ts
if (!cardId || (!stockSkuId && !groupKey)) {
  return Response.json(
    { error: "cardId and stockSkuId or groupKey are required." },
    { status: 400 },
  );
}
```

When `stockSkuId` is present, filter by `stock_sku_id` and skip the legacy identity filters:

```ts
if (stockSkuId) {
  query = query.eq("stock_sku_id", stockSkuId);
} else {
  query = query.eq("condition", group.condition);
  // keep existing grade/grader/cert/gemrate filters here
}
```

Add to response map:

```ts
      stockSkuId: unit.stock_sku_id,
```

- [ ] **Step 7: Run API source test**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
cd Website
npm run typecheck
```

Expected: PASS. If Supabase generated types do not yet include new tables/functions, complete Task 8's `Website/src/lib/supabase/types.ts` compatibility additions before committing this task.

- [ ] **Step 9: Commit**

Run:

```bash
git add Website/package.json Website/scripts/test-stock-subsku-admin-api.mjs Website/src/app/api/ynot/admin/stock-skus/route.ts Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts Website/src/app/api/ynot/admin/card-stock/route.ts Website/src/app/api/ynot/admin/card-stock/unit/route.ts Website/src/app/api/ynot/admin/card-stock/units/route.ts Website/src/lib/supabase/types.ts
git commit -m "Expose admin stock SKU APIs

Constraint: Existing add-stock flows must keep working while new stockSkuId flows roll out.
Rejected: Direct table writes from API routes | stock movement must stay in RPCs for audit and locking.
Confidence: medium
Scope-risk: moderate
Directive: Keep box opening as explicit admin action through open_stock_container.
Tested: npm run test:stock-subsku-admin-api; npm run typecheck
Not-tested: Live admin browser flow."
```

---

### Task 4: Extend Stock SKU Usage And Readiness Helpers

**Files:**
- Modify: `Website/src/features/ynot/public-subsku-images.ts`
- Modify: `Website/src/features/ynot/stock-sku-usage.ts`
- Modify: `Website/src/features/ynot/prize-readiness.ts`
- Modify: `Website/src/features/ynot/stock-readiness.ts`
- Modify: `Website/scripts/test-stock-sku-usage.mjs`
- Modify: `Website/scripts/test-stock-readiness.mjs`
- Modify: `Website/scripts/test-subsku-image-routing.mjs`

- [ ] **Step 1: Add failing helper assertions**

Append to `Website/scripts/test-stock-sku-usage.mjs`:

```js
test("precomputed stock SKU groups can carry first-class stockSkuId and conversion details", () => {
  const card = {
    ...rogerCard,
    stockSkuGroups: [
      {
        key: "stock-sku:op16-box",
        stockSkuId: "op16-box",
        label: "OP16 Box",
        sku: "OP16-JP-BOX",
        unitKind: "box",
        totalUnits: 10,
        availableUnits: 10,
        reservedUnits: 0,
        allocatedUnits: 0,
        childStockSkuId: "op16-pack",
        childSku: "OP16-JP-PACK",
        childLabel: "OP16 Pack",
        childQuantity: 24,
        imageUrl: "https://cdn.example/op16-box.png",
        units: [],
      },
    ],
  };

  const [group] = stockSku.stockSkuGroups(card);
  assert.equal(group.stockSkuId, "op16-box");
  assert.equal(group.unitKind, "box");
  assert.equal(group.childQuantity, 24);
  assert.deepEqual(stockSku.stockUnitSelectionMetadata(card, group.key), {
    stockSkuId: "op16-box",
    stockUnitGroupKey: "stock-sku:op16-box",
    stockSku: "OP16-JP-BOX",
    stockLabel: "OP16 Box",
    stockUnitFilter: {
      condition: "",
      grade: "",
      gradingService: "",
      certNumber: "",
      gemrateId: "",
    },
  });
});
```

Append to `Website/scripts/test-subsku-image-routing.mjs`:

```js
test("public image helper accepts exact stock, Sub SKU, then product fallback", () => {
  const helper = loadTsModule("../src/features/ynot/public-subsku-images.ts");

  assert.equal(
    helper.publicSubSkuImageUrl(
      "https://cdn.example/unit.png",
      "https://cdn.example/subsku.png",
      "https://cdn.example/product.png",
    ),
    "https://cdn.example/unit.png",
  );
  assert.equal(
    helper.publicSubSkuImageUrl(
      null,
      "https://cdn.example/subsku.png",
      "https://cdn.example/product.png",
    ),
    "https://cdn.example/subsku.png",
  );
  assert.equal(
    helper.publicSubSkuImageUrl(null, "", "https://cdn.example/product.png"),
    "https://cdn.example/product.png",
  );
});
```

Append to `Website/scripts/test-stock-readiness.mjs`:

```js
test("first-class stockSkuId readiness keys reserve against the selected Sub SKU", () => {
  const shortages = readiness.buildPrizeStockShortages({
    prizes: [
      {
        cardId: "card-op16",
        cardCode: "OP16",
        cardName: "The Time Of Battle",
        quantity: 3,
        metadata: {
          stockSkuId: "sku-op16-pack",
          stockUnitGroupKey: "stock-sku:sku-op16-pack",
          stockSku: "OP16-JP-PACK",
          stockLabel: "OP16 Pack",
        },
      },
    ],
    stockSummaries: [
      {
        cardId: "card-op16",
        cardCode: "OP16",
        cardName: "The Time Of Battle",
        stockAvailable: 999,
        stockSkuGroups: [
          {
            key: "stock-sku:sku-op16-box",
            stockSkuId: "sku-op16-box",
            sku: "OP16-JP-BOX",
            label: "OP16 Box",
            availableUnits: 10,
            reservedForCampaign: 0,
          },
          {
            key: "stock-sku:sku-op16-pack",
            stockSkuId: "sku-op16-pack",
            sku: "OP16-JP-PACK",
            label: "OP16 Pack",
            availableUnits: 1,
            reservedForCampaign: 1,
          },
        ],
      },
    ],
  });

  assert.deepEqual(plain(shortages), [
    {
      cardId: "card-op16",
      stockUnitGroupKey: "stock-sku:sku-op16-pack",
      stockSku: "OP16-JP-PACK",
      label: "OP16 - The Time Of Battle / OP16 Pack",
      plannedUnits: 3,
      requiredUnits: 3,
      availableUnits: 1,
      reservedUnits: 1,
      usableUnits: 2,
      shortageUnits: 1,
    },
  ]);
});

test("prize readiness source parses stockSkuId from batch RPC rows", () => {
  assert.match(prizeReadinessSource, /stockSkuId\?: string \| null/);
  assert.match(prizeReadinessSource, /stockSkuId \? `stock-sku:\$\{stockSkuId\}`/);
  assert.match(prizeReadinessSource, /metadata\.stockSkuId/);
  assert.doesNotMatch(
    prizeReadinessSource,
    /get_admin_stock_sku_summary",\s*\{\s*p_card_id:\s*null\s*\}/,
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd Website
npm run test:stock-sku-usage
npm run test:stock-readiness
npm run test:subsku-images
```

Expected: FAIL because helpers do not understand `stockSkuId`, conversion fields, reservation keys, or three-level image fallback.

- [ ] **Step 3: Update public image helper**

Modify `Website/src/features/ynot/public-subsku-images.ts`:

```ts
export function publicSubSkuImageUrl(
  stockUnitImageUrl: unknown,
  stockSkuImageUrl?: unknown,
  fallbackImageUrl?: unknown,
) {
  return cleanText(stockUnitImageUrl) ?? cleanText(stockSkuImageUrl) ?? cleanText(fallbackImageUrl);
}
```

Keep all existing map functions and update any two-argument callers as needed:

```ts
publicSubSkuImageUrl(unitImage, productImage)
```

continues to work because `productImage` is now the Sub SKU slot. For product fallback where Sub SKU image is available, call:

```ts
publicSubSkuImageUrl(unitImage, stockSkuImage, productImage)
```

- [ ] **Step 4: Extend stock SKU types and metadata**

Modify `Website/src/features/ynot/stock-sku-usage.ts`:

Add fields to `StockSkuGroup`:

```ts
  stockSkuId?: string | null;
  unitKind?: "card" | "pack" | "box" | "other" | string | null;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
```

Add fields to `StockSkuSummaryRow`:

```ts
  stockSkuId?: string | null;
  sku?: string | null;
  label?: string | null;
  unitKind?: string | null;
  imageStoragePath?: string | null;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
```

Extend `StockUnitSelectionMetadata`:

```ts
  stockSkuId?: string;
```

In `stockSkuGroupsFromSummaryRows`, prefer first-class rows:

```ts
      if (row.stockSkuId) {
        return {
          key: `stock-sku:${row.stockSkuId}`,
          stockSkuId: row.stockSkuId,
          label: row.label || row.sku || "Stock SKU",
          sku: row.sku || compactSkuPart(row.stockSkuId, "STOCK-SKU"),
          unitKind: row.unitKind || null,
          imageUrl: row.imageUrl || null,
          imageStoragePath: row.imageStoragePath || null,
          childStockSkuId: row.childStockSkuId || null,
          childSku: row.childSku || null,
          childLabel: row.childLabel || null,
          childQuantity: countValue(row.childQuantity) || null,
          totalUnits,
          availableUnits: countValue(row.availableUnits),
          reservedUnits: countValue(row.reservedUnits),
          allocatedUnits: countValue(row.allocatedUnits),
          units: [],
        };
      }
```

Change the final filter in `stockSkuGroupsFromSummaryRows` so empty first-class Sub SKUs stay visible for admin editing:

```ts
    .filter((group) => group.stockSkuId || group.totalUnits > 0)
```

At the start of `stockUnitSelectionMetadata`, return stockSkuId metadata when present:

```ts
  if (group.stockSkuId) {
    return {
      stockSkuId: group.stockSkuId,
      stockUnitGroupKey: group.key,
      stockSku: group.sku,
      stockLabel: group.label,
      stockUnitFilter: {
        condition: "",
        grade: "",
        gradingService: "",
        certNumber: "",
        gemrateId: "",
      },
    };
  }
```

- [ ] **Step 5: Update readiness metadata lookup**

Modify `Website/src/features/ynot/stock-readiness.ts`:

Add:

```ts
function stockSkuIdForPrize(prize: StockReadinessPrize | undefined) {
  const metadata = stockSelectionMetadata(prize);
  return stringOrEmpty(metadata?.stockSkuId);
}
```

Update `stockGroupKeyForPrize`:

```ts
function stockGroupKeyForPrize(prize: StockReadinessPrize) {
  const metadata = stockSelectionMetadata(prize);
  if (!metadata) return "";
  const stockSkuId = stringOrEmpty(metadata.stockSkuId);
  if (stockSkuId) return `stock-sku:${stockSkuId}`;
  return (
    stringOrEmpty(metadata.stockUnitGroupKey) ||
    stockGroupKeyFromFilter(metadata.stockUnitFilter)
  );
}
```

- [ ] **Step 6: Update prize-readiness batch parsing and reservation keys**

Modify `Website/src/features/ynot/prize-readiness.ts`.

Extend `StockSubSkuSummaryRow`:

```ts
type StockSubSkuSummaryRow = {
  cardId: string;
  stockUnitGroupKey: string;
  stockSkuId?: string | null;
  sku?: string | null;
  label?: string | null;
  unitKind?: string | null;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  availableUnits: number;
  reservedUnits?: number;
  allocatedUnits?: number;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
};
```

Replace `stockSubSkuSummariesFromJson()` with first-class and legacy parsing:

```ts
function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stockSubSkuSummariesFromJson(value: unknown): StockSubSkuSummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.cardId !== "string") return [];
    const stockSkuId = optionalString(item.stockSkuId);
    const stockUnitGroupKey =
      stockSkuId ? `stock-sku:${stockSkuId}` :
      typeof item.stockUnitGroupKey === "string" ? item.stockUnitGroupKey : "";
    if (!stockUnitGroupKey) return [];
    return [
      {
        cardId: item.cardId,
        stockUnitGroupKey,
        stockSkuId,
        sku: optionalString(item.sku),
        label: optionalString(item.label),
        unitKind: optionalString(item.unitKind),
        imageUrl: optionalString(item.imageUrl),
        imageStoragePath: optionalString(item.imageStoragePath),
        availableUnits: numberOrZero(item.availableUnits),
        reservedUnits: numberOrZero(item.reservedUnits),
        allocatedUnits: numberOrZero(item.allocatedUnits),
        childStockSkuId: optionalString(item.childStockSkuId),
        childSku: optionalString(item.childSku),
        childLabel: optionalString(item.childLabel),
        childQuantity: numberOrZero(item.childQuantity) || null,
      },
    ];
  });
}
```

Keep `getPrizeStockSummaryRows()` on the existing batch RPC first. Task 2 patches `get_admin_prize_stock_summaries` to return first-class `stockSkuId` rows, so do not add a separate `get_admin_stock_sku_summary` call with `p_card_id: null` here:

```ts
async function getPrizeStockSummaryRows(
  supabase: SupabaseClient,
  cardIds: string[],
) {
  const { data: batchData, error: batchError } = await supabase.rpc(
    "get_admin_prize_stock_summaries",
    { p_card_ids: cardIds },
  );
  if (!batchError) {
    const batch = isRecord(batchData) ? batchData : {};
    return {
      stockRows: stockSummariesFromJson(batch.stockSummaries),
      subSkuRows: stockSubSkuSummariesFromJson(batch.subSkuSummaries),
    };
  }
  if (!isMissingFunctionError(batchError, "get_admin_prize_stock_summaries")) {
    throw batchError;
  }

  const [stockResponses, subSkuResponses] = await Promise.all([
    Promise.all(
      cardIds.map((cardId) =>
        supabase.rpc("get_card_stock_summary", { p_card_id: cardId }),
      ),
    ),
    Promise.all(
      cardIds.map((cardId) =>
        supabase.rpc("get_admin_card_stock_subsku_summary", { p_card_id: cardId }),
      ),
    ),
  ]);
  const stockError = stockResponses.find((response) => response.error)?.error;
  if (stockError) throw stockError;
  const subSkuError = subSkuResponses.find((response) => response.error)?.error;
  if (subSkuError) throw subSkuError;

  return {
    stockRows: stockResponses.flatMap((response) =>
      stockSummariesFromJson(response.data),
    ),
    subSkuRows: subSkuResponses.flatMap((response) =>
      stockSubSkuSummariesFromJson(response.data),
    ),
  };
}
```

Update `stockGroupKeyFromMetadata()` before it checks legacy `stockUnitGroupKey`:

```ts
function stockGroupKeyFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return "";
  if (typeof metadata.stockSkuId === "string" && metadata.stockSkuId.trim()) {
    return `stock-sku:${metadata.stockSkuId.trim()}`;
  }
  if (typeof metadata.stockUnitGroupKey === "string") {
    return metadata.stockUnitGroupKey.trim();
  }
  // keep the existing stockUnitFilter fallback below
}
```

Modify the `stockSkuGroups` mapping returned from `getPrizeStockSummaries()`:

```ts
      stockSkuGroups: (subSkuRowsByCardId.get(cardId) ?? []).map((row) => {
        const groupKey = row.stockSkuId ? `stock-sku:${row.stockSkuId}` : row.stockUnitGroupKey;
        return {
          key: groupKey,
          stockSkuId: row.stockSkuId ?? undefined,
          sku: row.sku ?? undefined,
          label: row.label ?? undefined,
          unitKind: row.unitKind ?? undefined,
          imageUrl: row.imageUrl ?? undefined,
          imageStoragePath: row.imageStoragePath ?? undefined,
          availableUnits: row.availableUnits,
          reservedForCampaign:
            reservedByCardAndGroup.get(`${cardId}\u001e${groupKey}`) ?? 0,
          childStockSkuId: row.childStockSkuId ?? undefined,
          childSku: row.childSku ?? undefined,
          childLabel: row.childLabel ?? undefined,
          childQuantity: row.childQuantity ?? undefined,
        };
      }),
```

- [ ] **Step 7: Run helper/readiness tests**

Run:

```bash
cd Website
npm run test:stock-sku-usage
npm run test:stock-readiness
npm run test:subsku-images
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add Website/src/features/ynot/public-subsku-images.ts Website/src/features/ynot/stock-sku-usage.ts Website/src/features/ynot/prize-readiness.ts Website/src/features/ynot/stock-readiness.ts Website/scripts/test-stock-sku-usage.mjs Website/scripts/test-stock-readiness.mjs Website/scripts/test-subsku-image-routing.mjs
git commit -m "Teach stock helpers first-class Sub SKUs

Constraint: Legacy derived group keys must continue during migration rollout.
Rejected: Replace all stock filters at once | live packs may still carry derived metadata.
Confidence: medium
Scope-risk: moderate
Directive: Prefer stockSkuId when present and keep legacy stockUnitFilter compatibility.
Tested: npm run test:stock-sku-usage; npm run test:stock-readiness; npm run test:subsku-images
Not-tested: Browser admin catalog rendering."
```

---

### Task 5: Add Prize Catalog Sub SKU Editing And Open Box UI

**Files:**
- Create: `Website/scripts/test-stock-subsku-admin-ui.mjs`
- Modify: `Website/package.json`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`

- [ ] **Step 1: Write admin UI source test**

Create `Website/scripts/test-stock-subsku-admin-ui.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);

test("admin catalog renders editable first-class stock SKU controls", () => {
  assert.match(clientSource, /function AdminStockSkuEditor/);
  assert.match(clientSource, /function AdminOpenBoxAction/);
  assert.match(clientSource, /\/api\/ynot\/admin\/stock-skus"/);
  assert.match(clientSource, /\/api\/ynot\/admin\/stock-skus\/open-container"/);
  assert.match(clientSource, /Packs per box/);
  assert.match(clientSource, /Open box/);
  assert.match(clientSource, /Pack equivalent/);
  assert.match(clientSource, /childQuantity/);
});

test("add stock form chooses a Sub SKU before creating stock", () => {
  assert.match(clientSource, /stockSkuId/);
  assert.match(clientSource, /Select Sub SKU/);
  assert.match(clientSource, /stockSkuGroups\(selectedCard\)/);
  assert.match(clientSource, /stockSkuId:\s*selectedStockSkuId/);
  assert.doesNotMatch(clientSource, /Add stock units[\s\S]{0,500}Product card[\s\S]{0,500}condition only/i);
});

test("types and data expose first-class Sub SKU image and conversion fields", () => {
  assert.match(typesSource, /stockSkuId\?:\s*string\s*\|\s*null/);
  assert.match(typesSource, /unitKind\?:\s*string\s*\|\s*null/);
  assert.match(typesSource, /childQuantity\?:\s*number\s*\|\s*null/);
  assert.match(dataSource, /get_admin_stock_sku_summary/);
  assert.match(dataSource, /stockSkuGroupsFromSummaryRows/);
});
```

- [ ] **Step 2: Add script and verify failure**

Modify `Website/package.json` scripts:

```json
"test:stock-subsku-admin-ui": "node --test scripts/test-stock-subsku-admin-ui.mjs"
```

Run:

```bash
cd Website
npm run test:stock-subsku-admin-ui
```

Expected: FAIL because the UI components and fields are not present.

- [ ] **Step 3: Extend shared types**

Modify `Website/src/features/ynot/types.ts` by adding optional fields to the catalog stock group/card types that already carry `stockSkuGroups`:

```ts
  stockSkuId?: string | null;
  unitKind?: string | null;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
```

For stock units returned to admin, add:

```ts
  stockSkuId?: string | null;
```

- [ ] **Step 4: Load first-class stock SKU summary in admin data**

Modify `Website/src/features/ynot/data.ts` inside `getAdminCards()` before legacy `get_admin_card_stock_subsku_summary`:

```ts
    const firstClassSubSkuRows = await readOrEmpty("stock_sku_summary", () =>
      retryQuery(async () => {
        const { data, error } = await supabase.rpc("get_admin_stock_sku_summary", {
          p_card_id: null,
        });
        if (error) throw error;
        return cardStockSubSkuSummariesFromJson(data);
      }),
    );
```

Then use:

```ts
    const effectiveSubSkuRows = firstClassSubSkuRows.length
      ? firstClassSubSkuRows
      : subSkuRows;
```

And pass:

```ts
        stockSkuGroups: stockSkuGroupsFromSummaryRows(card, effectiveSubSkuRows),
```

- [ ] **Step 5: Add small fetch helpers to client**

Modify `Website/src/features/ynot/client.tsx` near existing `postJson` helpers:

```ts
async function saveStockSkuJson(body: unknown) {
  return postJson("/api/ynot/admin/stock-skus", body);
}

async function openContainerJson(body: unknown) {
  return postJson("/api/ynot/admin/stock-skus/open-container", body);
}
```

- [ ] **Step 6: Add AdminStockSkuEditor component**

Add this component before `AdminStockSkuBreakdown` in `Website/src/features/ynot/client.tsx`:

```tsx
function AdminStockSkuEditor({
  card,
  group,
}: {
  card: CardCatalogItem;
  group?: StockSkuGroup | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(group?.sku ?? "");
  const [label, setLabel] = useState(group?.label ?? "");
  const [unitKind, setUnitKind] = useState(group?.unitKind ?? "other");
  const [childStockSkuId, setChildStockSkuId] = useState(group?.childStockSkuId ?? "");
  const [childQuantity, setChildQuantity] = useState(
    group?.childQuantity ? String(group.childQuantity) : "",
  );
  const [imageUrl, setImageUrl] = useState(group?.imageUrl ?? "");
  const [imageStoragePath, setImageStoragePath] = useState(group?.imageStoragePath ?? "");
  const [message, setMessage] = useState("");
  const [busy, startBusy] = useTransition();
  const siblingGroups = stockSkuGroups(card).filter(
    (candidate) => candidate.stockSkuId && candidate.stockSkuId !== group?.stockSkuId,
  );

  if (!editing) {
    return (
      <button
        type="button"
        className="admin-stock-sku-qty-btn"
        onClick={() => setEditing(true)}
      >
        Edit Sub SKU
      </button>
    );
  }

  function save() {
    startBusy(async () => {
      try {
        setMessage("");
        await saveStockSkuJson({
          stockSkuId: group?.stockSkuId ?? null,
          cardId: card.catalogCardId,
          sku,
          label,
          unitKind,
          imageUrl,
          imageStoragePath,
          childStockSkuId: unitKind === "box" ? childStockSkuId || null : null,
          childQuantity: unitKind === "box" ? Number(childQuantity) || null : null,
        });
        setEditing(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Sub SKU could not be saved.");
      }
    });
  }

  return (
    <div className="admin-stock-sku-editor">
      <label className="admin-field">
        <span>Sub SKU code</span>
        <input value={sku} onChange={(event) => setSku(event.target.value)} />
      </label>
      <label className="admin-field">
        <span>Label</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="admin-field">
        <span>Type</span>
        <select value={unitKind ?? "other"} onChange={(event) => setUnitKind(event.target.value)}>
          <option value="card">Card</option>
          <option value="pack">Pack</option>
          <option value="box">Box</option>
          <option value="other">Other</option>
        </select>
      </label>
      {unitKind === "box" ? (
        <>
          <label className="admin-field">
            <span>This box contains</span>
            <select
              value={childStockSkuId}
              onChange={(event) => setChildStockSkuId(event.target.value)}
            >
              <option value="">Choose pack Sub SKU</option>
              {siblingGroups
                .filter((candidate) => candidate.unitKind === "pack")
                .map((candidate) => (
                  <option key={candidate.stockSkuId ?? candidate.key} value={candidate.stockSkuId ?? ""}>
                    {candidate.sku} · {candidate.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Packs per box</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={childQuantity}
              onChange={(event) => setChildQuantity(event.target.value)}
            />
          </label>
        </>
      ) : null}
      <label className="admin-field">
        <span>Sub SKU image URL</span>
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
      </label>
      <div className="admin-stock-unit-actions">
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save Sub SKU"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {message ? <span className="admin-stock-unit-msg">{message}</span> : null}
    </div>
  );
}
```

- [ ] **Step 7: Add AdminOpenBoxAction component**

Add before `AdminStockSkuBreakdown`:

```tsx
function AdminOpenBoxAction({ group }: { group: StockSkuGroup }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("1");
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState("");
  const canOpen =
    group.unitKind === "box" &&
    Boolean(group.stockSkuId) &&
    Boolean(group.childStockSkuId) &&
    Number(group.childQuantity ?? 0) > 0 &&
    group.availableUnits > 0;

  if (!canOpen) return null;

  function openBox() {
    startBusy(async () => {
      try {
        setMessage("");
        await openContainerJson({
          parentStockSkuId: group.stockSkuId,
          quantity: Math.max(1, Math.trunc(Number(quantity) || 1)),
        });
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Box could not be opened.");
      }
    });
  }

  return (
    <div className="admin-stock-sku-open-box">
      <span>Open box</span>
      <input
        type="number"
        min={1}
        max={group.availableUnits}
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <button type="button" onClick={openBox} disabled={busy}>
        {busy ? "Opening..." : `Open -> ${group.childQuantity} packs each`}
      </button>
      {message ? <span className="admin-stock-unit-msg">{message}</span> : null}
    </div>
  );
}
```

- [ ] **Step 8: Render conversion info inside AdminStockSkuBreakdown**

Inside the group row in `AdminStockSkuBreakdown`, after the status badges, add:

```tsx
                {group.unitKind === "box" && group.childQuantity ? (
                  <div className="admin-stock-sku-statuses">
                    <span>
                      Contains {group.childQuantity.toLocaleString()}{" "}
                      {group.childSku ?? "pack"} per box
                    </span>
                    <span>
                      Pack equivalent{" "}
                      {(group.totalUnits * group.childQuantity).toLocaleString()}
                    </span>
                  </div>
                ) : null}
                <AdminStockSkuEditor card={card} group={group} />
                <AdminOpenBoxAction group={group} />
```

Keep `AdminSubSkuQuantity`, `AdminSubSkuPackUsageList`, and `AdminSubSkuManageUnits` after these controls.

- [ ] **Step 9: Require Sub SKU selection in Add Stock form**

Modify `AdminCardStockUnitForm`:

Add state:

```ts
  const [stockSkuId, setStockSkuId] = useState("");
```

Find selected card:

```ts
  const selectedCard = cards.find((card) => card.catalogCardId === cardId) ?? null;
  const selectedStockSkuGroups = selectedCard ? stockSkuGroups(selectedCard) : [];
```

Before POST, add:

```ts
        if (!stockSkuId) {
          setMessage("Select Sub SKU before adding stock.");
          return;
        }
```

Add payload field:

```ts
          stockSkuId,
```

Add UI after Product card field:

```tsx
        <AdminField label="Select Sub SKU" required>
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={stockSkuId}
            onChange={(event) => setStockSkuId(event.target.value)}
            disabled={!selectedStockSkuGroups.length}
          >
            <option value="">
              {selectedCard ? "Choose Sub SKU" : "Choose product first"}
            </option>
            {selectedStockSkuGroups.map((group) => (
              <option key={group.stockSkuId ?? group.key} value={group.stockSkuId ?? ""}>
                {group.sku} · {group.label} · {group.unitKind ?? "stock"}
              </option>
            ))}
          </select>
        </AdminField>
```

- [ ] **Step 10: Run admin UI and existing stock tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-ui
npm run test:stock-sku-usage
npm run test:stock-readiness
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add Website/package.json Website/scripts/test-stock-subsku-admin-ui.mjs Website/src/features/ynot/client.tsx Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts
git commit -m "Add editable Sub SKU catalog controls

Constraint: Admins count boxes and loose packs separately in real operations.
Rejected: Keep Sub SKU derived-only | derived rows cannot store packs-per-box or Sub SKU images.
Confidence: medium
Scope-risk: moderate
Directive: Box opening must be visible and auditable from Prize Catalog.
Tested: npm run test:stock-subsku-admin-ui; npm run test:stock-sku-usage; npm run test:stock-readiness; npm run typecheck
Not-tested: Manual browser interaction."
```

---

### Task 6: Update Prize Assignment And Reservation To Use stockSkuId

**Files:**
- Modify: `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Modify: `Website/src/app/api/ynot/admin/prizes/route.ts`
- Modify: `Website/scripts/test-stock-subsku-conversion-sql.mjs`
- Modify: `Website/scripts/test-stock-subsku-admin-ui.mjs`
- Modify: `Website/scripts/test-stock-readiness.mjs`

- [ ] **Step 1: Add failing assertions for stockSkuId filters**

Append to `Website/scripts/test-stock-subsku-conversion-sql.mjs`:

```js
test("prize stock filter prefers stockSkuId when present", () => {
  assert.match(migration, /card_stock_unit_matches_prize_filter/i);
  assert.match(migration, /p_prize_metadata ->> 'stockSkuId'/);
  assert.match(migration, /p_unit\.stock_sku_id = expected_stock_sku_id/);
});
```

Append to `Website/scripts/test-stock-subsku-admin-ui.mjs`:

```js
test("campaign prize metadata serializes stockSkuId", () => {
  assert.match(clientSource, /stockUnitSelectionMetadata\(card, stockUnitKey\)/);
  assert.match(clientSource, /\.\.\.\(stockMetadata \?\? \{\}\)/);
  assert.match(clientSource, /stockSkuId/);
});
```

Append to `Website/scripts/test-stock-subsku-admin-api.mjs`:

```js
const campaignRouteForPrizeMetadata = read("../src/app/api/ynot/admin/campaigns/route.ts");
const liveRevisionsRouteForPrizeMetadata = read("../src/app/api/ynot/admin/campaigns/live-revisions/route.ts");
const prizesRouteForPrizeMetadata = read("../src/app/api/ynot/admin/prizes/route.ts");

test("campaign and live revision APIs preserve stockSkuId metadata", () => {
  assert.match(campaignRouteForPrizeMetadata, /saveInitialPrizes/);
  assert.match(campaignRouteForPrizeMetadata, /liveEditPrizeRpcRows/);
  assert.match(campaignRouteForPrizeMetadata, /\.\.\.metadata/);
  assert.match(campaignRouteForPrizeMetadata, /stockSkuId/);
  assert.match(liveRevisionsRouteForPrizeMetadata, /prize_snapshot/);
  assert.match(liveRevisionsRouteForPrizeMetadata, /publish_live_campaign_revision/);
  assert.match(liveRevisionsRouteForPrizeMetadata, /stockSkuId/);
  assert.match(prizesRouteForPrizeMetadata, /metadataValue/);
  assert.match(prizesRouteForPrizeMetadata, /stockSkuId/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-sql
npm run test:stock-subsku-admin-ui
npm run test:stock-subsku-admin-api
```

Expected: FAIL because SQL filter does not yet prefer `stockSkuId`.

- [ ] **Step 3: Replace card_stock_unit_matches_prize_filter in migration**

Append to `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`:

```sql
create or replace function public.card_stock_unit_matches_prize_filter(
  p_unit public.card_stock_units,
  p_prize_metadata jsonb
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  expected_stock_sku_id uuid;
  filter_metadata jsonb;
  group_key text;
  group_parts text[];
  expected_condition text;
  expected_grade text;
  expected_grading_service text;
  expected_cert_number text;
  expected_gemrate_id text;
  filter_condition text;
begin
  if p_prize_metadata is null then
    return false;
  end if;

  if coalesce(p_prize_metadata ->> 'stockSkuId', '') <> '' then
    expected_stock_sku_id := (p_prize_metadata ->> 'stockSkuId')::uuid;
    return p_unit.stock_sku_id = expected_stock_sku_id;
  end if;

  filter_metadata := p_prize_metadata -> 'stockUnitFilter';

  if jsonb_typeof(filter_metadata) = 'object' then
    expected_condition := nullif(filter_metadata ->> 'condition', '');
    expected_grade := coalesce(filter_metadata ->> 'grade', '');
    expected_grading_service := coalesce(filter_metadata ->> 'gradingService', '');
    expected_cert_number := coalesce(filter_metadata ->> 'certNumber', '');
    expected_gemrate_id := coalesce(filter_metadata ->> 'gemrateId', '');
  else
    group_key := coalesce(p_prize_metadata ->> 'stockUnitGroupKey', '');
    if group_key = '' then
      return false;
    end if;

    if group_key like 'stock-sku:%' then
      expected_stock_sku_id := substring(group_key from 11)::uuid;
      return p_unit.stock_sku_id = expected_stock_sku_id;
    end if;

    group_parts := string_to_array(group_key, chr(31));
    expected_condition := nullif(group_parts[1], '');
    expected_grade := coalesce(group_parts[2], '');
    expected_grading_service := coalesce(group_parts[3], '');
    expected_cert_number := coalesce(group_parts[4], '');
    expected_gemrate_id := coalesce(group_parts[5], '');
  end if;

  filter_condition := coalesce(expected_condition, 'raw');

  if filter_condition <> 'graded' then
    return coalesce(p_unit.condition, 'raw') = filter_condition;
  end if;

  return coalesce(p_unit.condition, 'raw') = filter_condition
    and coalesce(p_unit.grade, '') = expected_grade
    and coalesce(p_unit.grading_service, '') = expected_grading_service
    and coalesce(p_unit.cert_number, '') = expected_cert_number
    and coalesce(p_unit.gemrate_id, '') = expected_gemrate_id;
end;
$$;

revoke all on function public.card_stock_unit_matches_prize_filter(
  public.card_stock_units,
  jsonb
) from public, anon, authenticated;
grant execute on function public.card_stock_unit_matches_prize_filter(
  public.card_stock_units,
  jsonb
) to service_role;
```

- [ ] **Step 4: Ensure campaign/prize APIs preserve stockSkuId metadata**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, add a small helper near the metadata helpers:

```ts
function stockSkuIdValue(metadata: unknown) {
  if (!isRecord(metadata)) return "";
  return text(metadata.stockSkuId, 80);
}
```

In `saveInitialPrizes()` and `liveEditPrizeRpcRows()`, compute:

```ts
const stockSkuId = stockSkuIdValue(metadata);
```

Then include it explicitly while keeping the existing metadata spread:

```ts
metadata: {
  ...metadata,
  ...(stockSkuId ? { stockSkuId } : {}),
  catalogCategory,
  catalogCategoryLabel: catalogCategoryLabel(catalogCategory),
  prizeCategory,
  prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
  sourceType: prizeSourceType(prizeCategory),
  plannedByAdminId: adminId,
} as Json,
```

Also ensure `lastPrizeMetadataValue()` accepts the new key for the Last One prize selection:

```ts
const stockSkuId = text(value.stockSkuId, 80);
```

and returns:

```ts
...(stockSkuId ? { stockSkuId } : {}),
```

In `Website/src/app/api/ynot/admin/prizes/route.ts`, keep `metadataValue()` preserving unknown metadata fields and add explicit normalization:

```ts
const metadata = isRecord(body.metadata) ? { ...body.metadata } : {};
const stockSkuId = text(metadata.stockSkuId, 80);
if (stockSkuId) metadata.stockSkuId = stockSkuId;
```

In `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts`, add `stockSkuId` to the prize snapshot override path:

```ts
function liveRevisionPrizeSnapshotWithOverrides(
  prizeSnapshot: unknown,
  cardEdits: Record<string, LiveRevisionCardEdit>,
) {
  // Preserve all prize snapshot fields, including stockSkuId in metadata.
}
```

The implementation can remain mostly unchanged because it spreads `...item`; add a source-level assertion/comment near this function so future edits do not strip `metadata.stockSkuId`.

- [ ] **Step 5: Run assignment/readiness tests**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-sql
npm run test:stock-subsku-admin-ui
npm run test:stock-readiness
npm run test:pack-launch-flow
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql Website/src/features/ynot/client.tsx Website/src/app/api/ynot/admin/campaigns/route.ts Website/src/app/api/ynot/admin/prizes/route.ts Website/scripts/test-stock-subsku-conversion-sql.mjs Website/scripts/test-stock-subsku-admin-ui.mjs Website/scripts/test-stock-readiness.mjs
git commit -m "Reserve prize stock by Sub SKU id

Constraint: Live prize inventory must bind to exact stock type, not just main product.
Rejected: Keep condition-only filters for boxes and packs | boxes and packs can share condition but are different stock.
Confidence: medium
Scope-risk: broad
Directive: Maintain legacy stockUnitFilter fallback until all live prize metadata is migrated.
Tested: npm run test:stock-subsku-conversion-sql; npm run test:stock-subsku-admin-ui; npm run test:stock-readiness; npm run test:pack-launch-flow
Not-tested: Owner approval against a real Supabase staging project."
```

---

### Task 7: Propagate Sub SKU Images Across Detail, Opening, Rewards, Bag, And Shipping

**Files:**
- Modify: `Website/src/features/ynot/public-subsku-images.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Modify: `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`
- Modify: `Website/scripts/test-subsku-image-routing.mjs`
- Modify: `Website/scripts/test-pack-open-privacy.mjs`
- Modify: `Website/scripts/test-campaign-detail-privacy.mjs`

- [ ] **Step 1: Add failing image route assertions**

Append to `Website/scripts/test-subsku-image-routing.mjs`:

```js
test("data loaders include stock_skus image fallback for prize, history, collection, and shipping images", () => {
  const dataSource = readSource("../src/features/ynot/data.ts");

  assert.match(dataSource, /stock_skus/);
  assert.match(dataSource, /stock_sku_id/);
  assert.match(dataSource, /resolveLastPrizePreview/);
  assert.match(dataSource, /stockSkuId/);
  assert.match(dataSource, /stockSkuImageUrl/);
  assert.match(
    dataSource,
    /publicSubSkuImageUrl\([^,\n]+,\s*[^,\n]*stockSkuImageUrl[^,\n]*,\s*[^,\n]*photoUrl/,
  );
});

test("open API hydration includes stock_skus image fallback without public IDs", () => {
  const routeSource = readSource("../src/app/api/ynot/gacha/open/route.ts");
  const publicOpenItemType = routeSource.match(/type PublicOpenItem = \{[\s\S]*?\};/)?.[0] ?? "";

  assert.match(routeSource, /stock_skus/);
  assert.match(routeSource, /stockSkuImageUrl/);
  assert.match(routeSource, /publicSubSkuImageUrl\(stockImageUrl,\s*stockSkuImageUrl,\s*item\.imageUrl/);
  assert.doesNotMatch(publicOpenItemType, /stockSkuId|stock_sku_id|card_stock_unit_id|draw_round_prize_unit_id/);
});
```

- [ ] **Step 2: Run image tests to verify failure**

Run:

```bash
cd Website
npm run test:subsku-images
```

Expected: FAIL because loaders do not join `stock_skus`.

- [ ] **Step 3: Update opening API hydration**

Modify `Website/src/app/api/ynot/gacha/open/route.ts`:

Change stock unit select:

```ts
        .from("card_stock_units")
        .select("id,stock_sku_id,image_url")
        .in("id", stockUnitIds)
```

After loading `stockUnitsResult`, collect stock SKU IDs:

```ts
  const stockSkuIds = Array.from(
    new Set(
      (stockUnitsResult.data ?? [])
        .map((row) => (row as { stock_sku_id?: string | null }).stock_sku_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const stockSkusResult = stockSkuIds.length
    ? await supabase
        .from("stock_skus")
        .select("id,image_url")
        .in("id", stockSkuIds)
    : { data: [] as Array<{ id: string; image_url: string | null }>, error: null };
  const stockSkuImageById = new Map(
    (stockSkusResult.data ?? [])
      .filter((row) => row.id && row.image_url)
      .map((row) => [row.id, row.image_url as string]),
  );
  const stockSkuIdByStockUnitId = new Map(
    (stockUnitsResult.data ?? [])
      .filter((row) => row.id)
      .map((row) => [row.id, (row as { stock_sku_id?: string | null }).stock_sku_id ?? null]),
  );
```

When resolving item image:

```ts
    const stockSkuImageUrl =
      prizeUnitId && stockUnitIdByPrizeUnitId.get(prizeUnitId)
        ? stockSkuImageById.get(stockSkuIdByStockUnitId.get(stockUnitIdByPrizeUnitId.get(prizeUnitId)!) ?? "") ?? null
        : null;
```

Use:

```ts
      imageUrl: publicSubSkuImageUrl(
        stockImageUrl,
        stockSkuImageUrl,
        item.imageUrl ?? card?.image_url ?? null,
      ),
```

Create `stockUnitIdByPrizeUnitId` from prize units:

```ts
  const stockUnitIdByPrizeUnitId = new Map(
    (prizeUnitsResult.data ?? [])
      .filter((row) => row.id && row.card_stock_unit_id)
      .map((row) => [row.id, row.card_stock_unit_id as string]),
  );
```

- [ ] **Step 4: Update data loaders for public pages**

In `Website/src/features/ynot/data.ts`, update these queries:

1. `readPrizeUnitImageUrlsByPrizeId()` should select `stock_sku_id`:

```ts
.select("allocated_draw_round_prize_id,image_url,stock_sku_id")
```

Then load `stock_skus.id,image_url` for those IDs and return stock unit image first, Sub SKU image second.

2. `getCollection()` stock unit query should select:

```ts
"id,stock_sku_id,grade,condition,grading_service,image_url"
```

Add `stockSkuImageUrl` to `wonUnitByItemId`, then set:

```ts
imageUrl: publicSubSkuImageUrl(wonUnit?.imageUrl, wonUnit?.stockSkuImageUrl, card?.photoUrl),
```

3. `getGachaOpenHistory()` stock unit query should select:

```ts
"id,stock_sku_id,image_url"
```

Load stock SKU images and pass them through `publicSubSkuImageUrl`.

4. Shipping image query should select:

```ts
"id,stock_sku_id,image_url"
```

Use stock unit image -> Sub SKU image. Keep product image out of shipping unless the item has no stock linkage; the current privacy-safe behavior should remain strict.

5. `resolveLastPrizePreview()` should prefer `last_prize_metadata.stockSkuId` before legacy cert/grade matching:

```ts
const stockSkuId = metadataString(row.last_prize_metadata, "stockSkuId");
```

If present, load `stock_skus.id,image_url` and matching `card_stock_units.stock_sku_id,image_url`; choose stock unit image first, then Sub SKU image, then product image. Keep the existing `stockUnitFilter` cert/grade fallback for old Last One prize rows.

- [ ] **Step 5: Patch RPC return image fallback**

Append to `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql` a function-definition patch like existing image migrations:

```sql
do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'open_gacha_campaign_not_found';
  end if;

  fn := replace(
    fn,
    'left join public.card_stock_units stock
      on stock.id = units.card_stock_unit_id',
    'left join public.card_stock_units stock
      on stock.id = units.card_stock_unit_id
    left join public.stock_skus stock_sku
      on stock_sku.id = stock.stock_sku_id'
  );

  fn := replace(
    fn,
    'coalesce(stock.image_url, cards.image_url)',
    'coalesce(stock.image_url, stock_sku.image_url, cards.image_url)'
  );

  if fn not like '%coalesce(stock.image_url, stock_sku.image_url, cards.image_url)%'
    or fn not like '%left join public.stock_skus stock_sku%'
  then
    raise exception 'open_gacha_stock_sku_image_patch_failed';
  end if;

  execute fn;
end;
$migration$;
```

- [ ] **Step 6: Run privacy and image tests**

Run:

```bash
cd Website
npm run test:subsku-images
npm run test:pack-open-privacy
npm run test:campaign-detail-privacy
npm run test:gacha-open-launch-safety
```

Expected: PASS. Public response tests must still confirm no private IDs or house fields leak.

- [ ] **Step 7: Commit**

Run:

```bash
git add Website/src/features/ynot/public-subsku-images.ts Website/src/features/ynot/data.ts Website/src/app/api/ynot/gacha/open/route.ts Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql Website/scripts/test-subsku-image-routing.mjs Website/scripts/test-pack-open-privacy.mjs Website/scripts/test-campaign-detail-privacy.mjs
git commit -m "Use Sub SKU images across reward surfaces

Constraint: Customer pages need exact images without exposing stock identifiers.
Rejected: Only use product images | pack and box rewards need different images.
Confidence: medium
Scope-risk: broad
Directive: Public payloads may include image URLs but never internal stock IDs or house logic.
Tested: npm run test:subsku-images; npm run test:pack-open-privacy; npm run test:campaign-detail-privacy; npm run test:gacha-open-launch-safety
Not-tested: Live pack opening against production."
```

---

### Task 8: Supabase Types, SQL Compatibility, And Full Verification

**Files:**
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/package.json`
- Modify: `Website/scripts/test-stock-subsku-conversion-sql.mjs`
- Modify: `Website/scripts/test-stock-readiness.mjs`

- [ ] **Step 1: Update generated Supabase type shim**

Modify `Website/src/lib/supabase/types.ts` to include:

```ts
      stock_skus: {
        Row: {
          id: string;
          card_id: string;
          sku_code: string;
          label: string;
          unit_kind: string;
          image_url: string | null;
          image_storage_path: string | null;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          sku_code: string;
          label: string;
          unit_kind?: string;
          image_url?: string | null;
          image_storage_path?: string | null;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          sku_code?: string;
          label?: string;
          unit_kind?: string;
          image_url?: string | null;
          image_storage_path?: string | null;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      stock_sku_conversion_rules: {
        Row: {
          id: string;
          parent_stock_sku_id: string;
          child_stock_sku_id: string;
          child_quantity: number;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_stock_sku_id: string;
          child_stock_sku_id: string;
          child_quantity: number;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_stock_sku_id?: string;
          child_stock_sku_id?: string;
          child_quantity?: number;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
```

Also add `stock_sku_id`, `parent_stock_unit_id`, `conversion_rule_id`, and `converted_at` to `card_stock_units.Row/Insert/Update`.

- [ ] **Step 2: Add full script bundle**

Modify `Website/package.json` scripts:

```json
"test:stock-subsku-conversion-all": "npm run test:stock-subsku-conversion && npm run test:stock-subsku-conversion-sql && npm run test:stock-subsku-admin-api && npm run test:stock-subsku-admin-ui && npm run test:stock-sku-usage && npm run test:stock-readiness && npm run test:subsku-images && npm run test:pack-opening-flow && npm run test:gacha-open-bundle && npm run test:pack-open-privacy"
```

- [ ] **Step 3: Run targeted verification**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-all
npm run typecheck
```

Expected: PASS.

Then run the guarded local DB smoke only when `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` points to `localhost` or `127.0.0.1`:

```bash
cd Website
npm run smoke:stock-subsku-db
```

Expected: PASS with `stock Sub SKU local DB smoke passed`, or fail before mutation if the Supabase URL is not local.

- [ ] **Step 4: Run broader pack and admin checks**

Run:

```bash
cd Website
npm run test:admin-pack-monitor
npm run test:pack-launch-flow
npm run test:live-pack-revisions
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
```

Expected: PASS.

- [ ] **Step 5: Run lint/build**

Run:

```bash
cd Website
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Run migration dry-run again**

Run:

```bash
cd Database
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Expected: the new migration is pending and dry-run succeeds without applying to production.

- [ ] **Step 7: Run diff checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Status contains only files intentionally modified by this plan plus unrelated pre-existing user files.

- [ ] **Step 8: Commit**

Run:

```bash
git add Website/src/lib/supabase/types.ts Website/package.json Website/scripts/test-stock-subsku-conversion-sql.mjs Website/scripts/test-stock-readiness.mjs
git commit -m "Verify stock SKU conversion rollout

Constraint: Production-linked inventory changes require dry-run evidence before apply.
Rejected: Ship without full pack-opening privacy tests | image changes touch customer reveal and bag surfaces.
Confidence: high
Scope-risk: moderate
Directive: Apply Supabase migration only after backup and linked dry-run gates pass.
Tested: npm run test:stock-subsku-conversion-all; npm run typecheck; npm run lint; npm run build; supabase db push --linked --dry-run --include-all
Not-tested: Production migration apply and live browser smoke."
```

---

### Task 9: Manual Browser Verification On Local Dev

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Start local dev server**

Run:

```bash
cd Website
npm run dev
```

Expected: local server starts, usually `http://localhost:3000`.

- [ ] **Step 2: Verify admin Prize Catalog**

Open:

```text
http://localhost:3000/admin/prizes
```

Expected:

- A product row can show multiple Sub SKUs.
- Box Sub SKU shows image, box count, `Packs per box`, child pack SKU, and pack equivalent.
- Pack Sub SKU shows loose pack count and pack equivalent.
- Add stock requires selecting a Sub SKU.
- Open box action is shown only for a box with an active conversion rule and available stock.

- [ ] **Step 3: Verify pack assignment UI**

Open:

```text
http://localhost:3000/admin/campaigns
```

Expected:

- Prize row Sub-SKU selector shows real Sub SKU code and count.
- Selecting box stock shows box image in admin preview.
- Selecting pack stock shows pack image in admin preview.
- Per-win bundle still controls physical units per win and does not replace box conversion math.

- [ ] **Step 4: Verify public pack detail**

Open a local pack detail page that has assigned prizes:

```text
http://localhost:3000/packs
```

Expected:

- Prize preview image uses assigned stock unit image if allocated.
- If allocated unit image is blank, preview falls back to Sub SKU image.
- If Sub SKU image is blank, preview falls back to product image.
- No private stock SKU IDs are visible in page text or JSON payloads.

- [ ] **Step 5: Verify opening reveal and bag**

Use a test profile/dev auth path already configured for the repo, then open a test pack.

Expected:

- Opening animation spotlight image matches the awarded unit/Sub SKU.
- Reveal summary image matches the awarded unit/Sub SKU.
- Reward history image matches reveal image.
- Collection/bag image matches reveal image.
- Shipping/admin fulfilment item image uses exact stock unit or Sub SKU image.

- [ ] **Step 6: Stop local dev server**

Stop the server with `Ctrl-C`.

- [ ] **Step 7: Commit only if a verification fix was made**

If no files changed, do not commit.

If a fix was made, commit with:

```bash
git add <changed-files>
git commit -m "Polish stock SKU conversion browser flow

Constraint: Local browser verification found a user-facing issue.
Rejected: Leave verified defect for follow-up | the feature depends on end-to-end stock/image consistency.
Confidence: medium
Scope-risk: narrow
Directive: Keep UI wording aligned with real stock counting: boxes, loose packs, pack equivalent.
Tested: Local admin prize catalog, campaign prize selection, pack detail, opening reveal, reward history, collection, shipping image smoke.
Not-tested: Production browser smoke."
```

---

### Task 10: Production Readiness Handoff

**Files:**
- No source changes.

- [ ] **Step 1: Summarize migration state**

Run:

```bash
cd Database
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Expected: dry-run is clean. Do not apply production migration from this task unless the user explicitly asks for production apply and backup/PITR gates are satisfied.

- [ ] **Step 2: Summarize final local verification**

Run:

```bash
cd Website
npm run test:stock-subsku-conversion-all
npm run smoke:stock-subsku-db
npm run typecheck
npm run lint
npm run build
```

Expected: PASS. Run `npm run smoke:stock-subsku-db` only against local Supabase; if the URL is not local, the script must fail before mutation.

- [ ] **Step 3: Prepare release notes**

Write the handoff summary in the final response:

```text
Implemented:
- First-class editable Sub SKUs with box/pack/card/other type.
- Per-Box Sub SKU conversion rule, e.g. OP16 box -> OP16 pack x24.
- Explicit Open box admin action.
- Add stock by Sub SKU.
- Prize assignment by stockSkuId.
- Image fallback: stock unit -> Sub SKU -> product.

Verified:
- npm run test:stock-subsku-conversion-all
- npm run smoke:stock-subsku-db (local Supabase only)
- npm run typecheck
- npm run lint
- npm run build
- supabase db push --linked --dry-run --include-all

Not applied:
- Production migration apply.
- Production stock conversion actions.
```

## Self-Review

Spec coverage:

- Editable main SKU remains in `cards`: Task 5 keeps `AdminCardForm`.
- Editable Sub SKU is added: Tasks 2, 3, 5.
- Add stock by Sub SKU: Tasks 3 and 5.
- Box contains variable pack quantity: Tasks 1, 2, 5.
- Pokemon boxes with different pack counts: conversion rules are per parent Sub SKU in Tasks 1 and 2.
- Selling/opening packs should show total packs left and boxes left: Task 5 displays box count, loose pack count, and pack equivalent.
- Box opening creates child pack stock: Task 2 `open_stock_container`, Task 5 UI.
- Prize catalog image importance: Tasks 5 and 7.
- Pack detail image: Task 7.
- Opening animation image: Task 7.
- Reward after animation image: Task 7.
- User bag image: Task 7.
- Related functions and APIs: File Structure plus Tasks 3-7.
- Existing batch readiness RPC is patched, not bypassed: Task 2 updates `get_admin_prize_stock_summaries`; Task 4 keeps `getPrizeStockSummaryRows()` on that batch path and parses `stockSkuId`.
- Campaign edit reservation math uses first-class Sub SKU keys: Task 4 updates both `stock-readiness.ts` and `prize-readiness.ts` `stockGroupKeyFromMetadata()`.
- Box conversion setup rejects invalid cross-card rules at save time: Task 2 validates parent and child Sub SKUs in `upsert_stock_sku`.
- Stock ledger rows use valid existing event types and exact inserted IDs: Task 2 uses `stock_created`/`archived` plus `INSERT ... RETURNING`, and source tests reject time-window lookup.
- RPC behavior is covered beyond source-grep tests: Task 2 adds guarded local Supabase smoke for `upsert_stock_sku`, `adjust_stock_sku_units`, `open_stock_container`, and `get_admin_prize_stock_summaries`.

Completion scan:

- No unresolved placeholder markers or deferred implementation notes remain.
- Every code-modifying task includes concrete code blocks or exact replacement snippets.
- Code fence balance checked after plan update.

Type consistency:

- `stockSkuId` is camelCase in TypeScript/API payloads.
- `stock_sku_id` is snake_case in SQL/Supabase rows.
- `childQuantity` is camelCase in TypeScript/API payloads.
- `child_quantity` is snake_case in SQL.
- `unitKind` is camelCase in TypeScript/API payloads.
- `unit_kind` is snake_case in SQL.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-10-stock-subsku-box-pack-conversion.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using superpower-executing-plans, batch execution with checkpoints.

Which approach?
