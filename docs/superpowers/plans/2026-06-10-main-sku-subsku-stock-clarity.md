# Main SKU Sub-SKU Stock Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Prize catalog stock UI read as `Category type -> Main SKU -> Sub-SKU stock`, with clear box/pack/card counts, category-aware action labels, and Sub-SKU-first stock adding.

**Architecture:** Keep the existing database model: `cards` remains the Main SKU/product row, `stock_skus` remains the editable Sub-SKU layer, `stock_sku_conversion_rules.child_quantity` remains the per-box pack count, and `card_stock_units` remains the physical stock source of truth. Add a small pure presentation helper for category/action/count labels, then use it from the admin Prize catalog UI so the screen explains the hierarchy without changing customer-facing pack-opening behavior.

**Tech Stack:** Next.js App Router 16 in `Website/`, React 19 client components in `Website/src/features/ynot/client.tsx`, TypeScript helper modules under `Website/src/features/ynot/`, Supabase RPC-backed admin APIs, Node `--test` scripts in `Website/scripts/`, Playwright via the Codex Node runtime for local visual verification.

---

## Scope Check

This is one UI/product-flow improvement over the existing stock SKU implementation, not a new schema project. The previous migration already created:

- `public.stock_skus.unit_kind`
- `public.stock_sku_conversion_rules.child_quantity`
- `public.card_stock_units.stock_sku_id`
- RPCs `upsert_stock_sku`, `adjust_stock_sku_units`, and `open_stock_container`

No new production migration is required for this plan. If a target environment does not have `20260610110000_stock_skus_and_container_conversion.sql` applied, stop and apply/verify that migration first.

Out of scope:

- Merging existing OP16 Box and OP16 Pack production rows into one DB Main SKU.
- Automatic customer pack sales that silently open sealed boxes.
- Changing pack-opening reward allocation logic.
- Changing image resolution for reveal/bag/shipping.

## Target Mental Model

Use these words everywhere in the admin UI:

```text
Category type: Card / Box / Pack / Other
Main SKU: product identity and shared product info
Sub-SKU: exact stock bucket counted by admins
Stock unit: individual physical/audit row behind the Sub-SKU
```

For Card:

```text
Category type: Card
Main SKU: OP01-070 Dracule Mihawk
Sub-SKUs:
- OP01-070-RAW            Raw card      3 total / 2 left
- OP01-070-PSA10-CERT123  Graded card   1 total / 0 left
- OP01-070-BGS10-CERT456  Graded card   1 total / 1 left
```

For Box/Pack:

```text
Category type: Box
Main SKU: OP16 The Time Of Battle
Sub-SKUs:
- OP16-JP-BOX-SEALED      Box     105 total / 0 boxes left / 1 box = 24 packs
- OP16-JP-PACK-LOOSE      Pack    214 total / 1 pack left
```

For Pokemon box examples:

```text
Pokemon SV-JP-BOX-SEALED   1 box = 30 packs
Pokemon 151-JP-BOX-SEALED  1 box = 20 packs
Pokemon EN-BOX-SEALED      1 box = 36 packs
```

## File Structure

Create:

```text
Website/src/features/ynot/stock-sku-presentation.ts
Website/scripts/test-stock-sku-presentation.mjs
```

Modify:

```text
Website/package.json
Website/scripts/test-stock-subsku-admin-api.mjs
Website/src/features/ynot/client.tsx
Website/src/app/globals.css
```

Read-only verification:

```text
Website/src/app/api/ynot/admin/stock-skus/route.ts
Website/src/app/api/ynot/admin/card-stock/route.ts
Website/src/lib/supabase/types.ts
Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql
```

## Naming Contract

Replace these labels:

```text
Add card                 -> Create Main SKU
Edit card                -> Edit Main SKU
Delete card              -> Delete Main SKU
Add stock                -> Add Sub-SKU stock
Add stock units          -> Add Sub-SKU stock
Stock sub-SKUs           -> Sub-SKU stock
Global stock             -> Main SKU stock
Prize pool               -> Random pack stock
Assignments              -> Random pack assignments
Card / stock             -> Main SKU / Sub-SKU
Card image               -> Main SKU image
Unit image               -> Stock unit image
Product card             -> Main SKU
```

Do not rename customer-facing "card" text outside admin catalog unless that text is actually describing a non-card product.

## Task 0: Preflight And Current-State Guard

**Files:**
- Read: `AGENTS.md`
- Read: `Website/AGENTS.md`
- Read: `Website/node_modules/next/dist/docs/01-app/index.md`
- Read: `Website/node_modules/next/dist/docs/index.md`
- Read: `Website/src/app/api/ynot/admin/stock-skus/route.ts`
- Read: `Website/src/app/api/ynot/admin/card-stock/route.ts`

- [ ] **Step 1: Confirm repo, branch, and dirty files**

Run:

```bash
pwd
git status --short --branch
```

Expected:

```text
/Users/pinkmerry/Project X/YNOTT
## <current-branch>
```

There may be existing modified files from prior stock UI work. Do not revert user or prior-agent changes.

- [ ] **Step 2: Confirm the existing stock RPC surface is present**

Run:

```bash
rg -n "upsert_stock_sku|adjust_stock_sku_units|open_stock_container|childQuantity|child_quantity" \
  Website/src/app/api/ynot/admin/stock-skus/route.ts \
  Website/src/app/api/ynot/admin/card-stock/route.ts \
  Website/src/lib/supabase/types.ts \
  Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql
```

Expected: matches for all five terms. If any term is missing, stop and restore the previous stock SKU migration work before continuing.

- [ ] **Step 3: Confirm local Next docs were read**

Run:

```bash
sed -n '1,180p' Website/AGENTS.md
sed -n '1,140p' Website/node_modules/next/dist/docs/01-app/index.md
sed -n '1,120p' Website/node_modules/next/dist/docs/index.md
```

Expected: no code changes. This satisfies the repo instruction to check local Next docs before app/API edits.

- [ ] **Step 4: Commit nothing**

No commit for preflight.

---

## Task 1: Add Pure Main SKU / Sub-SKU Presentation Helpers

**Files:**
- Create: `Website/src/features/ynot/stock-sku-presentation.ts`
- Create: `Website/scripts/test-stock-sku-presentation.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the failing helper test**

Create `Website/scripts/test-stock-sku-presentation.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-sku-presentation.ts", import.meta.url),
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
const presentation = cjsModule.exports;

const boxGroup = {
  key: "stock-sku:box",
  sku: "OP16-JP-BOX-SEALED",
  label: "Sealed Japanese Box",
  unitKind: "box",
  totalUnits: 105,
  availableUnits: 0,
  reservedUnits: 0,
  allocatedUnits: 105,
  childSku: "OP16-JP-PACK-LOOSE",
  childQuantity: 24,
  units: [],
};

const packGroup = {
  key: "stock-sku:pack",
  sku: "OP16-JP-PACK-LOOSE",
  label: "Loose Japanese Pack",
  unitKind: "pack",
  totalUnits: 214,
  availableUnits: 1,
  reservedUnits: 0,
  allocatedUnits: 213,
  availablePackEquivalent: 1,
  units: [],
};

const cardGroup = {
  key: "stock-sku:card",
  sku: "OP01-070-PSA10-CERT123",
  label: "PSA 10 #123",
  unitKind: "card",
  totalUnits: 1,
  availableUnits: 0,
  reservedUnits: 0,
  allocatedUnits: 1,
  units: [],
};

test("detects category type from catalog category", () => {
  assert.equal(presentation.mainSkuCategoryType("Single Cards"), "card");
  assert.equal(presentation.mainSkuCategoryType("Booster Boxes"), "box");
  assert.equal(presentation.mainSkuCategoryType("Packs"), "pack");
  assert.equal(presentation.mainSkuCategoryType("Accessories"), "other");
});

test("returns category-aware action labels", () => {
  assert.deepEqual(presentation.mainSkuActionLabels("Booster Boxes"), {
    create: "Create Main SKU",
    edit: "Edit Main SKU",
    delete: "Delete Main SKU",
    addStock: "Add Sub-SKU stock",
    addSubSku: "Create Sub-SKU",
    stockSummary: "Main SKU stock",
    randomPackStock: "Random pack stock",
    randomPackAssignments: "Random pack assignments",
  });
});

test("summarizes box and pack groups separately", () => {
  const summary = presentation.mainSkuStockSummary([boxGroup, packGroup]);
  assert.equal(summary.totalUnits, 319);
  assert.equal(summary.availableUnits, 1);
  assert.equal(summary.boxes.available, 0);
  assert.equal(summary.boxes.total, 105);
  assert.equal(summary.packs.available, 1);
  assert.equal(summary.packs.total, 214);
  assert.equal(summary.packEquivalentFromBoxes, 2520);
  assert.equal(summary.totalPossiblePacks, 2734);
  assert.equal(summary.headline, "0 boxes left · 1 pack left");
});

test("formats Sub-SKU table rows with per-kind labels", () => {
  const rows = presentation.subSkuStockRows([boxGroup, packGroup, cardGroup]);
  assert.deepEqual(
    rows.map((row) => ({
      sku: row.sku,
      typeLabel: row.typeLabel,
      availableLabel: row.availableLabel,
      totalLabel: row.totalLabel,
      conversionLabel: row.conversionLabel,
    })),
    [
      {
        sku: "OP16-JP-BOX-SEALED",
        typeLabel: "Box",
        availableLabel: "0 boxes",
        totalLabel: "105 boxes",
        conversionLabel: "1 box = 24 OP16-JP-PACK-LOOSE",
      },
      {
        sku: "OP16-JP-PACK-LOOSE",
        typeLabel: "Pack",
        availableLabel: "1 pack",
        totalLabel: "214 packs",
        conversionLabel: "Direct pack stock",
      },
      {
        sku: "OP01-070-PSA10-CERT123",
        typeLabel: "Card",
        availableLabel: "0 cards",
        totalLabel: "1 card",
        conversionLabel: "Single item stock",
      },
    ],
  );
});

test("box Sub-SKU with no child pack shows the required setup message", () => {
  const row = presentation.subSkuStockRows([
    { ...boxGroup, childSku: null, childQuantity: null },
  ])[0];
  assert.equal(row.conversionLabel, "Pack conversion not set");
  assert.equal(
    row.warning,
    "Set packs per box and choose a child Pack Sub-SKU before opening boxes.",
  );
});
```

- [ ] **Step 2: Add the package script**

Modify `Website/package.json` inside `"scripts"` by adding:

```json
"test:stock-sku-presentation": "node --test scripts/test-stock-sku-presentation.mjs",
```

Keep the existing JSON comma style valid.

- [ ] **Step 3: Run the failing test**

Run:

```bash
cd Website
npm run test:stock-sku-presentation
```

Expected: FAIL because `Website/src/features/ynot/stock-sku-presentation.ts` does not exist.

- [ ] **Step 4: Create the presentation helper**

Create `Website/src/features/ynot/stock-sku-presentation.ts`:

```ts
import type { StockSkuGroup } from "./stock-sku-usage";

export type MainSkuCategoryType = "card" | "box" | "pack" | "other";

export type MainSkuActionLabels = {
  create: string;
  edit: string;
  delete: string;
  addStock: string;
  addSubSku: string;
  stockSummary: string;
  randomPackStock: string;
  randomPackAssignments: string;
};

export type MainSkuStockSummary = {
  totalUnits: number;
  availableUnits: number;
  allocatedUnits: number;
  reservedUnits: number;
  boxes: { available: number; total: number };
  packs: { available: number; total: number };
  cards: { available: number; total: number };
  others: { available: number; total: number };
  packEquivalentFromBoxes: number;
  directPackEquivalent: number;
  totalPossiblePacks: number;
  headline: string;
};

export type SubSkuStockRow = {
  key: string;
  stockSkuId?: string | null;
  sku: string;
  label: string;
  type: MainSkuCategoryType;
  typeLabel: string;
  availableUnits: number;
  allocatedUnits: number;
  reservedUnits: number;
  totalUnits: number;
  availableLabel: string;
  allocatedLabel: string;
  reservedLabel: string;
  totalLabel: string;
  conversionLabel: string;
  packEquivalentLabel: string;
  warning: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function mainSkuCategoryType(
  catalogCategory: string | null | undefined,
): MainSkuCategoryType {
  const value = clean(catalogCategory);
  if (value.includes("box")) return "box";
  if (value.includes("pack")) return "pack";
  if (value.includes("card") || value.includes("single")) return "card";
  return "other";
}

export function stockUnitKindType(
  value: string | null | undefined,
): MainSkuCategoryType {
  if (value === "box" || value === "pack" || value === "card") return value;
  return "other";
}

export function mainSkuActionLabels(
  _catalogCategory: string | null | undefined,
): MainSkuActionLabels {
  return {
    create: "Create Main SKU",
    edit: "Edit Main SKU",
    delete: "Delete Main SKU",
    addStock: "Add Sub-SKU stock",
    addSubSku: "Create Sub-SKU",
    stockSummary: "Main SKU stock",
    randomPackStock: "Random pack stock",
    randomPackAssignments: "Random pack assignments",
  };
}

export function stockUnitKindLabel(value: string | null | undefined) {
  switch (value) {
    case "box":
      return "Box";
    case "pack":
      return "Pack";
    case "card":
      return "Card";
    default:
      return "Other";
  }
}

export function stockUnitNoun(
  value: string | null | undefined,
  count: number,
) {
  const plural = Math.abs(count) !== 1;
  switch (value) {
    case "box":
      return plural ? "boxes" : "box";
    case "pack":
      return plural ? "packs" : "pack";
    case "card":
      return plural ? "cards" : "card";
    default:
      return plural ? "items" : "item";
  }
}

export function stockQuantityLabel(
  value: string | null | undefined,
  count: number,
) {
  return `${Math.max(0, Math.trunc(Number(count) || 0)).toLocaleString()} ${stockUnitNoun(
    value,
    count,
  )}`;
}

function count(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function packEquivalentForGroup(group: StockSkuGroup) {
  if (group.unitKind === "box") {
    const packsPerBox = count(group.childQuantity);
    return packsPerBox ? count(group.totalUnits) * packsPerBox : 0;
  }
  if (group.unitKind === "pack") return count(group.totalUnits);
  return count(group.packEquivalent);
}

function summaryHeadline(summary: Omit<MainSkuStockSummary, "headline">) {
  const parts: string[] = [];
  if (summary.boxes.total) {
    parts.push(stockQuantityLabel("box", summary.boxes.available) + " left");
  }
  if (summary.packs.total) {
    parts.push(stockQuantityLabel("pack", summary.packs.available) + " left");
  }
  if (summary.cards.total && !parts.length) {
    parts.push(stockQuantityLabel("card", summary.cards.available) + " left");
  }
  if (summary.others.total && !parts.length) {
    parts.push(stockQuantityLabel("other", summary.others.available) + " left");
  }
  if (!parts.length) return "No Sub-SKU stock";
  return parts.join(" · ");
}

export function mainSkuStockSummary(
  groups: StockSkuGroup[],
): MainSkuStockSummary {
  const summaryWithoutHeadline = groups.reduce(
    (summary, group) => {
      const kind = stockUnitKindType(group.unitKind);
      const totalUnits = count(group.totalUnits);
      const availableUnits = count(group.availableUnits);
      summary.totalUnits += totalUnits;
      summary.availableUnits += availableUnits;
      summary.allocatedUnits += count(group.allocatedUnits);
      summary.reservedUnits += count(group.reservedUnits);
      summary.directPackEquivalent += group.unitKind === "pack" ? totalUnits : 0;
      summary.packEquivalentFromBoxes +=
        group.unitKind === "box" ? packEquivalentForGroup(group) : 0;
      summary.totalPossiblePacks += packEquivalentForGroup(group);
      if (kind === "box") {
        summary.boxes.total += totalUnits;
        summary.boxes.available += availableUnits;
      } else if (kind === "pack") {
        summary.packs.total += totalUnits;
        summary.packs.available += availableUnits;
      } else if (kind === "card") {
        summary.cards.total += totalUnits;
        summary.cards.available += availableUnits;
      } else {
        summary.others.total += totalUnits;
        summary.others.available += availableUnits;
      }
      return summary;
    },
    {
      totalUnits: 0,
      availableUnits: 0,
      allocatedUnits: 0,
      reservedUnits: 0,
      boxes: { available: 0, total: 0 },
      packs: { available: 0, total: 0 },
      cards: { available: 0, total: 0 },
      others: { available: 0, total: 0 },
      packEquivalentFromBoxes: 0,
      directPackEquivalent: 0,
      totalPossiblePacks: 0,
    },
  );
  return {
    ...summaryWithoutHeadline,
    headline: summaryHeadline(summaryWithoutHeadline),
  };
}

export function stockSkuConversionLabel(group: StockSkuGroup) {
  if (group.unitKind === "box") {
    if (group.childQuantity && group.childSku) {
      return `1 box = ${group.childQuantity.toLocaleString()} ${group.childSku}`;
    }
    if (group.childQuantity && group.childLabel) {
      return `1 box = ${group.childQuantity.toLocaleString()} ${group.childLabel}`;
    }
    if (group.childQuantity) {
      return `1 box = ${group.childQuantity.toLocaleString()} packs`;
    }
    return "Pack conversion not set";
  }
  if (group.unitKind === "pack") return "Direct pack stock";
  return "Single item stock";
}

export function stockSkuWarning(group: StockSkuGroup) {
  if (group.unitKind === "box" && !group.childQuantity) {
    return "Set packs per box and choose a child Pack Sub-SKU before opening boxes.";
  }
  return "";
}

export function subSkuStockRows(groups: StockSkuGroup[]): SubSkuStockRow[] {
  return groups.map((group) => {
    const type = stockUnitKindType(group.unitKind);
    const packEquivalent = packEquivalentForGroup(group);
    return {
      key: group.key,
      stockSkuId: group.stockSkuId,
      sku: group.sku,
      label: group.label,
      type,
      typeLabel: stockUnitKindLabel(group.unitKind),
      availableUnits: count(group.availableUnits),
      allocatedUnits: count(group.allocatedUnits),
      reservedUnits: count(group.reservedUnits),
      totalUnits: count(group.totalUnits),
      availableLabel: stockQuantityLabel(group.unitKind, group.availableUnits),
      allocatedLabel: stockQuantityLabel(group.unitKind, group.allocatedUnits),
      reservedLabel: stockQuantityLabel(group.unitKind, group.reservedUnits),
      totalLabel: stockQuantityLabel(group.unitKind, group.totalUnits),
      conversionLabel: stockSkuConversionLabel(group),
      packEquivalentLabel:
        packEquivalent > 0 ? stockQuantityLabel("pack", packEquivalent) : "-",
      warning: stockSkuWarning(group),
    };
  });
}
```

- [ ] **Step 5: Run the helper test**

Run:

```bash
cd Website
npm run test:stock-sku-presentation
```

Expected: PASS, five tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add Website/package.json Website/src/features/ynot/stock-sku-presentation.ts Website/scripts/test-stock-sku-presentation.mjs
git commit -m "$(cat <<'MSG'
Clarify stock presentation math before touching the admin UI

Constraint: Existing Supabase stock SKU schema already stores Sub-SKU type and box pack quantity.
Rejected: Calculate labels inline in the large admin client file | it would make the confusing UI harder to reason about.
Confidence: high
Scope-risk: narrow
Directive: Keep this helper pure; do not add fetches, router calls, or Supabase clients here.
Tested: npm run test:stock-sku-presentation
Not-tested: Browser rendering is covered by later UI tasks.
MSG
)"
```

---

## Task 2: Replace Generic Stock Summary With Main SKU / Sub-SKU Stock Table

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/globals.css`
- Modify: `Website/scripts/test-stock-subsku-admin-api.mjs`

- [ ] **Step 1: Write static assertions for the new wording**

In `Website/scripts/test-stock-subsku-admin-api.mjs`, inside `test("admin catalog UI and data loader use first-class stock SKU identity", () => { ... })`, add:

```js
  assert.match(adminClient, /Sub-SKU stock/);
  assert.match(adminClient, /Main SKU stock/);
  assert.match(adminClient, /Random pack stock/);
  assert.match(adminClient, /Random pack assignments/);
  assert.match(adminClient, /subSkuStockRows\(groups\)/);
  assert.match(adminClient, /mainSkuStockSummary\(groups\)/);
  assert.match(adminClient, /Pack equivalent/);
  assert.match(adminClient, /Set packs per box and choose a child Pack Sub-SKU/);
```

- [ ] **Step 2: Run the failing static test**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: FAIL until the UI text and helper imports are added.

- [ ] **Step 3: Import helper functions**

In `Website/src/features/ynot/client.tsx`, extend the imports near the existing `stock-sku-usage` import:

```ts
import {
  mainSkuActionLabels,
  mainSkuStockSummary,
  stockQuantityLabel,
  stockUnitKindLabel as presentationStockUnitKindLabel,
  subSkuStockRows,
} from "./stock-sku-presentation";
```

- [ ] **Step 4: Replace `AdminStockSkuBreakdown` with a table-shaped component**

In `Website/src/features/ynot/client.tsx`, replace the current `AdminStockSkuBreakdown` function with:

```tsx
function AdminStockSkuBreakdown({
  card,
  row,
  allRows,
}: {
  card: CardCatalogItem;
  row: AdminCardCatalogRow;
  allRows: AdminCardCatalogRow[];
}) {
  const groups = stockSkuGroups(card);
  const labels = mainSkuActionLabels(card.catalogCategory);
  const assignedUnits = prizeAssignmentQuantity(row.prizes);
  const usageByGroup = stockSkuPackUsageByGroup(groups, row.prizes);
  const activeUnits = Math.max(0, row.stockTotal - row.stockArchived);
  const relatedPacks = relatedPackProductRows(card, allRows);
  const stockSummary = mainSkuStockSummary(groups);
  const subSkuRows = subSkuStockRows(groups);

  return (
    <details className="admin-card-stock-breakdown">
      <summary className="admin-card-stock-summary">
        <span>{labels.addSubSku.replace("Create ", "")} stock</span>
        <strong>
          {groups.length
            ? `${groups.length.toLocaleString()} Sub-SKU${groups.length === 1 ? "" : "s"} · ${stockSummary.headline}`
            : "No Sub-SKU stock"}
        </strong>
        <em>
          {labels.stockSummary} {row.stockAvailable.toLocaleString()}/
          {activeUnits.toLocaleString()} active
        </em>
      </summary>

      <div className="admin-stock-sku-toolbar">
        <AdminStockSkuEditor card={card} groups={groups} />
      </div>

      {groups.length ? (
        <div className="admin-stock-sku-table" role="table" aria-label="Sub-SKU stock">
          <div className="admin-stock-sku-table-head" role="row">
            <span role="columnheader">Sub-SKU</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Available</span>
            <span role="columnheader">Allocated</span>
            <span role="columnheader">Total</span>
            <span role="columnheader">Pack equivalent</span>
            <span role="columnheader">Conversion</span>
          </div>
          {groups.map((group) => {
            const stockRow = subSkuRows.find((candidate) => candidate.key === group.key);
            if (!stockRow) return null;
            const packUsages = usageByGroup.get(group.key) ?? [];
            const packUsageUnits = packUsages.reduce(
              (sum, usage) => sum + usage.units,
              0,
            );
            const repImage =
              group.imageUrl ??
              group.units.find((unit) => unit.imageUrl)?.imageUrl ??
              null;
            const missingPackConversion =
              group.unitKind === "box" && !group.childQuantity;
            return (
              <article className="admin-stock-sku-row" key={group.key} role="row">
                <div className="admin-stock-sku-cell admin-stock-sku-cell-main" role="cell">
                  {repImage ? (
                    <a
                      className="admin-stock-sku-thumb"
                      href={repImage}
                      target="_blank"
                      rel="noreferrer"
                      title="Open full image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={repImage} alt={group.label} />
                    </a>
                  ) : (
                    <span className="admin-stock-sku-thumb is-empty" aria-hidden>
                      No image
                    </span>
                  )}
                  <span className="admin-stock-sku-identity">
                    <strong>{group.label}</strong>
                    <code className="admin-stock-sku-code">{group.sku}</code>
                  </span>
                </div>
                <span className="admin-stock-sku-cell" role="cell">
                  <span className="admin-stock-sku-kind">
                    {presentationStockUnitKindLabel(group.unitKind)}
                  </span>
                </span>
                <strong className="admin-stock-sku-cell admin-stock-sku-number" role="cell">
                  {stockRow.availableLabel}
                </strong>
                <span className="admin-stock-sku-cell admin-stock-sku-number" role="cell">
                  {stockRow.allocatedLabel}
                </span>
                <span className="admin-stock-sku-cell admin-stock-sku-number" role="cell">
                  {stockRow.totalLabel}
                </span>
                <span className="admin-stock-sku-cell admin-stock-sku-number" role="cell">
                  {stockRow.packEquivalentLabel}
                </span>
                <span className="admin-stock-sku-cell" role="cell">
                  {stockRow.conversionLabel}
                </span>

                {packUsageUnits ? (
                  <div className="admin-stock-sku-statuses">
                    <span>
                      {packUsageUnits.toLocaleString()} used in{" "}
                      {packUsages.length.toLocaleString()} random pack row
                      {packUsages.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}

                {stockRow.warning ? (
                  <div className="admin-stock-sku-note is-warning">
                    {stockRow.warning}
                  </div>
                ) : null}

                {missingPackConversion && relatedPacks.length ? (
                  <div className="admin-stock-sku-related">
                    <div className="admin-stock-sku-related-head">
                      <span>Related pack product</span>
                      <strong>{relatedPacks.length.toLocaleString()} found</strong>
                    </div>
                    {relatedPacks.map(({ row: relatedRow, groups: relatedGroups }) => {
                      const totals = relatedPackTotals(relatedGroups, relatedRow);
                      const packGroup =
                        relatedGroups.find((candidate) => candidate.unitKind === "pack") ??
                        relatedGroups[0];
                      return (
                        <div
                          className="admin-stock-sku-related-row"
                          key={relatedRow.card.catalogCardId}
                        >
                          <span>
                            <strong>{relatedRow.card.name}</strong>
                            <small>{packGroup?.sku ?? relatedRow.card.code}</small>
                          </span>
                          <em>
                            {stockQuantityLabel("pack", totals.available)} left /{" "}
                            {stockQuantityLabel("pack", totals.total)} total
                          </em>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <AdminSubSkuQuantity cardId={card.catalogCardId} group={group} />
                {group.stockSkuId ? (
                  <AdminStockSkuEditor card={card} group={group} groups={groups} />
                ) : null}
                <AdminOpenBoxButton group={group} />
                <AdminSubSkuPackUsageList usages={packUsages} />
                <AdminSubSkuManageUnits cardId={card.catalogCardId} group={group} />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="admin-card-catalog-empty-usage">
          {assignedUnits || activeUnits
            ? "Main SKU stock exists, but no editable Sub-SKU rows are loaded yet."
            : "Create the first Sub-SKU before adding stock to this Main SKU."}
        </p>
      )}
    </details>
  );
}
```

- [ ] **Step 5: Replace the stock table CSS**

In `Website/src/app/globals.css`, keep existing `.admin-card-stock-breakdown`, `.admin-card-stock-summary`, `.admin-stock-sku-toolbar`, `.admin-stock-sku-thumb`, `.admin-stock-sku-code`, `.admin-stock-sku-note`, `.admin-stock-sku-related`, `.admin-stock-sku-qty`, `.admin-stock-sku-editor`, `.admin-stock-sku-pack-list`, `.admin-stock-sku-manage`, and `.admin-stock-unit-*` rules.

Replace only the current `.admin-stock-sku-list`, `.admin-stock-sku-row`, `.admin-stock-sku-main`, `.admin-stock-sku-lead`, `.admin-stock-sku-identity`, `.admin-stock-sku-kind`, `.admin-stock-sku-metrics`, `.admin-stock-sku-metric`, and mobile `.admin-stock-sku-metrics` rules with:

```css
html[data-ynot-theme] .admin-frame .admin-stock-sku-table {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: grid;
  gap: 8px;
  padding: 12px;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-table-head {
  align-items: center;
  color: var(--a-muted, #9b9daf) !important;
  display: grid;
  font-size: 0.62rem;
  font-weight: 900;
  gap: 8px;
  grid-template-columns: minmax(190px, 1.7fr) 76px minmax(92px, 0.8fr) minmax(92px, 0.8fr) minmax(92px, 0.8fr) minmax(112px, 0.9fr) minmax(150px, 1fr);
  letter-spacing: 0.05em;
  padding: 0 10px;
  text-transform: uppercase;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(190px, 1.7fr) 76px minmax(92px, 0.8fr) minmax(92px, 0.8fr) minmax(92px, 0.8fr) minmax(112px, 0.9fr) minmax(150px, 1fr);
  padding: 10px;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-cell {
  color: var(--a-fg-dim, #c8c8d8) !important;
  font-size: 0.74rem;
  font-weight: 800;
  min-width: 0;
  overflow-wrap: anywhere;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-cell-main {
  align-items: center;
  display: flex;
  gap: 10px;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-identity {
  display: grid;
  gap: 4px;
  min-width: 0;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-identity strong {
  color: var(--a-fg, #f4efe1) !important;
  font-size: 0.82rem;
  font-weight: 900;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-number {
  color: var(--a-fg, #f4efe1) !important;
  font-variant-numeric: tabular-nums;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-kind {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: var(--a-muted, #9b9daf) !important;
  display: inline-flex;
  font-size: 0.62rem;
  font-weight: 900;
  justify-content: center;
  letter-spacing: 0.04em;
  min-width: 52px;
  padding: 4px 7px;
  text-transform: uppercase;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-statuses,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-note,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-related,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-qty,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-editor,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-open-box,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-pack-list,
html[data-ynot-theme] .admin-frame .admin-stock-sku-row > .admin-stock-sku-manage {
  grid-column: 1 / -1;
}

@media (max-width: 920px) {
  html[data-ynot-theme] .admin-frame .admin-stock-sku-table-head {
    display: none;
  }

  html[data-ynot-theme] .admin-frame .admin-stock-sku-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  html[data-ynot-theme] .admin-frame .admin-stock-sku-cell-main {
    grid-column: 1 / -1;
  }

  html[data-ynot-theme] .admin-frame .admin-stock-sku-cell {
    background: rgba(0, 0, 0, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 8px;
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd Website
npm run test:stock-sku-presentation
npm run test:stock-subsku-admin-api
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add Website/src/features/ynot/client.tsx Website/src/app/globals.css Website/scripts/test-stock-subsku-admin-api.mjs
git commit -m "$(cat <<'MSG'
Show stock as Main SKU with Sub-SKU rows

Constraint: Admins count boxes, packs, cards, and other units differently, so the UI must not collapse them into one generic stock number.
Rejected: Keep the card-like Sub-SKU card layout | it hid the count hierarchy and made OP16 pack stock look like converted box stock.
Confidence: high
Scope-risk: moderate
Directive: Keep Main SKU summary as aggregate only; all editable quantities must be visible on Sub-SKU rows.
Tested: npm run test:stock-sku-presentation; npm run test:stock-subsku-admin-api; npm run typecheck
Not-tested: Browser screenshot covered by final verification task.
MSG
)"
```

---

## Task 3: Rename Main SKU And Random Pack Labels

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/scripts/test-stock-subsku-admin-api.mjs`

- [ ] **Step 1: Add static label checks**

In `Website/scripts/test-stock-subsku-admin-api.mjs`, inside the admin catalog UI test, add:

```js
  assert.doesNotMatch(adminClient, />Edit card</);
  assert.doesNotMatch(adminClient, />Delete card</);
  assert.doesNotMatch(adminClient, />Add stock</);
  assert.match(adminClient, />Edit Main SKU</);
  assert.match(adminClient, />Delete Main SKU</);
  assert.match(adminClient, />Add Sub-SKU stock</);
  assert.match(adminClient, /Card image/);
  assert.match(adminClient, /Main SKU image/);
```

This test intentionally allows code comments that mention old wording, but disallows old visible button text.

- [ ] **Step 2: Run the failing static test**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: FAIL while visible labels still include `Edit card`, `Delete card`, or `Add stock`.

- [ ] **Step 3: Replace header action labels**

In `AdminPrizeCreateActions`, change:

```tsx
Add card
Add stock
{openModal === "card" ? "Create catalog item" : "Add stock units"}
```

to:

```tsx
Create Main SKU
Add Sub-SKU stock
{openModal === "card" ? "Create Main SKU" : "Add Sub-SKU stock"}
```

- [ ] **Step 4: Replace form labels**

In `AdminCardForm`, change:

```tsx
<AdminField label="Product name" required>
...
<AdminImageDropzone
  ...
  label="Card image"
```

to:

```tsx
<AdminField label="Main SKU name" required>
...
<AdminImageDropzone
  ...
  label="Main SKU image"
```

In `AdminCardStockUnitForm`, change:

```tsx
<AdminField label="Product card" required>
...
placeholder="Select product…"
...
label="Unit image (optional)"
```

to:

```tsx
<AdminField label="Main SKU" required>
...
placeholder="Select Main SKU…"
...
label="Stock unit image (optional)"
```

- [ ] **Step 5: Replace row metric labels**

In the three `.admin-card-catalog-metric` cards, change:

```tsx
<span>Global stock</span>
<span>Prize pool</span>
<span>Assignments</span>
```

to:

```tsx
<span>Main SKU stock</span>
<span>Random pack stock</span>
<span>Random pack assignments</span>
```

- [ ] **Step 6: Replace row action labels and title strings**

In `Website/src/features/ynot/client.tsx`, change the visible labels:

```tsx
+ Add stock
Edit card
Delete card
Edit card
Save card
Delete card &quot;{card.name}&quot; permanently?
Delete card
```

to:

```tsx
+ Add Sub-SKU stock
Edit Main SKU
Delete Main SKU
Edit Main SKU
Save Main SKU
Delete Main SKU &quot;{card.name}&quot; permanently?
Delete Main SKU
```

Change tooltips that say `references this card` to `references this Main SKU` when the target may be a box, pack, or other product.

- [ ] **Step 7: Run tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
npm run typecheck
```

Expected: both pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add Website/src/features/ynot/client.tsx Website/scripts/test-stock-subsku-admin-api.mjs
git commit -m "$(cat <<'MSG'
Use Main SKU language in the admin catalog

Constraint: The catalog stores cards, boxes, packs, and other products, so card-only labels mislead admins.
Rejected: Rename only the OP16 row | the confusion is systemic across all catalog categories.
Confidence: high
Scope-risk: narrow
Directive: Reserve the word card for true card-specific fields such as card number.
Tested: npm run test:stock-subsku-admin-api; npm run typecheck
Not-tested: Visual spacing covered by final browser task.
MSG
)"
```

---

## Task 4: Make Add Stock Require A Sub-SKU

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/scripts/test-stock-subsku-admin-api.mjs`

- [ ] **Step 1: Add static assertions for Sub-SKU-first stock adjustment**

In `Website/scripts/test-stock-subsku-admin-api.mjs`, inside the admin catalog UI test, add:

```js
  assert.match(adminClient, /selectedStockSkuId/);
  assert.match(adminClient, /Choose a Sub-SKU before adding stock/);
  assert.match(adminClient, /stockSkuId: selectedStockSkuId/);
  assert.doesNotMatch(adminClient, /quantityDelta: effectiveCount,[\s\S]{0,240}reason: "admin_catalog",[\s\S]{0,240}condition,/);
```

This prevents the modal from adding generic legacy stock without a Sub-SKU.

- [ ] **Step 2: Run the failing static test**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: FAIL until `AdminCardStockUnitForm` requires a selected Sub-SKU.

- [ ] **Step 3: Add Sub-SKU selection state**

In `AdminCardStockUnitForm`, after:

```tsx
const [cardId, setCardId] = useState(initialCardId ?? "");
```

add:

```tsx
const [selectedStockSkuId, setSelectedStockSkuId] = useState("");
```

After `productCardOptions`, add:

```tsx
const selectedCard = useMemo(
  () => cards.find((card) => card.catalogCardId === cardId) ?? null,
  [cards, cardId],
);
const selectedSubSkuGroups = useMemo(
  () =>
    selectedCard
      ? stockSkuGroups(selectedCard).filter((group) => Boolean(group.stockSkuId))
      : [],
  [selectedCard],
);
const selectedSubSkuGroup =
  selectedSubSkuGroups.find((group) => group.stockSkuId === selectedStockSkuId) ??
  null;

useEffect(() => {
  if (!selectedSubSkuGroups.length) {
    setSelectedStockSkuId("");
    return;
  }
  setSelectedStockSkuId((current) =>
    selectedSubSkuGroups.some((group) => group.stockSkuId === current)
      ? current
      : selectedSubSkuGroups[0]?.stockSkuId ?? "",
  );
}, [selectedSubSkuGroups]);
```

- [ ] **Step 4: Reset Sub-SKU when Main SKU changes**

Change the `AdminSearchableSelect` for Main SKU from:

```tsx
onChange={setCardId}
```

to:

```tsx
onChange={(nextCardId) => {
  setCardId(nextCardId);
  setSelectedStockSkuId("");
}}
```

- [ ] **Step 5: Add the Sub-SKU field to the form**

Immediately after the Main SKU field in `AdminCardStockUnitForm`, add:

```tsx
<AdminField
  label="Sub-SKU"
  required
  hint={
    selectedCard && !selectedSubSkuGroups.length
      ? "Create a Sub-SKU on this Main SKU before adding stock."
      : undefined
  }
>
  <select
    className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
    value={selectedStockSkuId}
    disabled={!selectedSubSkuGroups.length}
    onChange={(event) => setSelectedStockSkuId(event.target.value)}
  >
    {!selectedSubSkuGroups.length ? (
      <option value="">No Sub-SKU yet</option>
    ) : null}
    {selectedSubSkuGroups.map((group) => (
      <option key={group.stockSkuId ?? group.key} value={group.stockSkuId ?? ""}>
        {group.sku} · {group.label} · {presentationStockUnitKindLabel(group.unitKind)}
      </option>
    ))}
  </select>
</AdminField>
```

- [ ] **Step 6: Validate Sub-SKU before POST**

In `submit()`, after the `if (!cardId)` block, add:

```tsx
if (!selectedStockSkuId || !selectedSubSkuGroup) {
  setMessage("Choose a Sub-SKU before adding stock.");
  return;
}
```

- [ ] **Step 7: Send `stockSkuId` to the stock API**

Change the `postJson("/api/ynot/admin/card-stock", { ... })` body from:

```tsx
{
  cardId,
  quantityDelta: effectiveCount,
  reason: "admin_catalog",
  condition,
  grade: isGraded ? grade.trim() : "",
  gradingService: isGraded ? gradingService || "" : "",
  certNumber: isGraded ? certNumber.trim() : "",
  gemrateId: isGraded ? gemrateId.trim() : "",
  imageUrl: nextImageUrl,
  imageStoragePath: nextImageStoragePath,
}
```

to:

```tsx
{
  cardId,
  stockSkuId: selectedStockSkuId,
  quantityDelta: effectiveCount,
  reason: "admin_catalog",
  condition,
  grade: isGraded ? grade.trim() : "",
  gradingService: isGraded ? gradingService || "" : "",
  certNumber: isGraded ? certNumber.trim() : "",
  gemrateId: isGraded ? gemrateId.trim() : "",
  imageUrl: nextImageUrl,
  imageStoragePath: nextImageStoragePath,
}
```

The existing `/api/ynot/admin/card-stock` route will use `adjust_stock_sku_units` when `stockSkuId` is present. That automatically increases Main SKU totals because `card_stock_units.card_id` is tied to the chosen Sub-SKU's card.

- [ ] **Step 8: Update success text**

Change:

```tsx
`Added ${effectiveCount} ${condition} unit${effectiveCount > 1 ? "s" : ""}.`
```

to:

```tsx
`Added ${stockQuantityLabel(selectedSubSkuGroup.unitKind, effectiveCount)} to ${selectedSubSkuGroup.sku}. Main SKU stock will refresh from Sub-SKU stock.`
```

- [ ] **Step 9: Run tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
npm run typecheck
```

Expected: both pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add Website/src/features/ynot/client.tsx Website/scripts/test-stock-subsku-admin-api.mjs
git commit -m "$(cat <<'MSG'
Require Sub-SKU selection when adding admin stock

Constraint: Main SKU stock should be an aggregate of Sub-SKU stock, not an editable bucket of its own.
Rejected: Keep legacy global add as the default | it recreates the exact confusion this change is meant to remove.
Confidence: high
Scope-risk: moderate
Directive: Future stock-add flows must pass stockSkuId unless deliberately preserving legacy fallback code for old data.
Tested: npm run test:stock-subsku-admin-api; npm run typecheck
Not-tested: Live Supabase mutation is not exercised in unit tests.
MSG
)"
```

---

## Task 5: Make Box Packs-Per-Box Setup Obvious

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/scripts/test-stock-subsku-admin-api.mjs`

- [ ] **Step 1: Add static assertions for box conversion copy**

In `Website/scripts/test-stock-subsku-admin-api.mjs`, inside the admin catalog UI test, add:

```js
  assert.match(adminClient, /Packs per box/);
  assert.match(adminClient, /Different products can use different pack counts/);
  assert.match(adminClient, /Create a Pack Sub-SKU first, then set packs per box/);
  assert.match(adminClient, /Set how many packs are inside one sealed box/);
```

- [ ] **Step 2: Run the failing static test**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
```

Expected: FAIL until the clearer copy is added.

- [ ] **Step 3: Improve `AdminStockSkuEditor` copy for Box Sub-SKU**

In `AdminStockSkuEditor`, inside `{unitKind === "box" ? (...) : null}`, add this message before the child pack select:

```tsx
<div className="admin-stock-sku-editor-hint">
  Set how many packs are inside one sealed box. Different products can use
  different pack counts, for example One Piece 24, Pokemon 30, or Pokemon 36.
</div>
```

Change the child pack `<option>` text from:

```tsx
{packOptions.length ? "Choose pack SKU" : "Create a pack SKU first"}
```

to:

```tsx
{packOptions.length
  ? "Choose child Pack Sub-SKU"
  : "Create a Pack Sub-SKU first, then set packs per box"}
```

Change the `Packs per box` field hint by wrapping the label in an explicit message:

```tsx
<label>
  <span>Packs per box</span>
  <input
    type="number"
    min={1}
    max={1000}
    value={childQuantity}
    disabled={busy || !childStockSkuId}
    placeholder="24"
    onChange={(event) => setChildQuantity(event.target.value)}
  />
  <small>Use 30 for boxes that contain 30 packs.</small>
</label>
```

- [ ] **Step 4: Add CSS for editor hint and small text**

In `Website/src/app/globals.css`, near `.admin-stock-sku-editor-grid`, add:

```css
html[data-ynot-theme] .admin-frame .admin-stock-sku-editor-hint {
  background: rgba(241, 215, 124, 0.08);
  border: 1px solid rgba(241, 215, 124, 0.18);
  border-radius: 8px;
  color: var(--a-fg-dim, #c8c8d8) !important;
  font-size: 0.72rem;
  font-weight: 800;
  grid-column: 1 / -1;
  line-height: 1.45;
  padding: 9px 10px;
  text-wrap: pretty;
}

html[data-ynot-theme] .admin-frame .admin-stock-sku-editor-grid small {
  color: var(--a-muted, #9b9daf) !important;
  font-size: 0.68rem;
  font-weight: 750;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd Website
npm run test:stock-subsku-admin-api
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add Website/src/features/ynot/client.tsx Website/src/app/globals.css Website/scripts/test-stock-subsku-admin-api.mjs
git commit -m "$(cat <<'MSG'
Make per-box pack quantity explicit on Box Sub-SKUs

Constraint: Pack count belongs to the Box Sub-SKU because different box products contain different pack quantities.
Rejected: Store one pack count on the broad Box category | Pokemon and One Piece products need different values.
Confidence: high
Scope-risk: narrow
Directive: Keep packs-per-box tied to stock_sku_conversion_rules.child_quantity.
Tested: npm run test:stock-subsku-admin-api; npm run typecheck
Not-tested: Actual open-box mutation is covered by existing stock conversion tests.
MSG
)"
```

---

## Task 6: Verify Existing API/RPC Behavior Still Works

**Files:**
- Test: `Website/scripts/test-stock-subsku-admin-api.mjs`
- Test: `Website/scripts/test-stock-sku-usage.mjs`
- Test: `Website/scripts/test-stock-subsku-conversion.mjs`
- Test: `Website/scripts/test-stock-subsku-conversion-sql.mjs`
- Test: `Website/scripts/test-subsku-images.mjs`

- [ ] **Step 1: Run stock-specific tests**

Run:

```bash
cd Website
npm run test:stock-sku-presentation
npm run test:stock-sku-usage
npm run test:stock-subsku-admin-api
npm run test:stock-subsku-conversion
npm run test:stock-subsku-conversion-sql
npm run test:subsku-images
```

Expected: all pass.

- [ ] **Step 2: Run project validation checks**

Run:

```bash
cd Website
npm run typecheck
npm run lint
```

Expected: `typecheck` passes. `lint` may show existing warnings; no new errors should appear.

- [ ] **Step 3: Check no API route lost admin/security gates**

Run:

```bash
rg -n "resolveAdminSession|enforceSameOriginMutation|enforceRateLimit|adjust_stock_sku_units|upsert_stock_sku|open_stock_container" \
  Website/src/app/api/ynot/admin/stock-skus/route.ts \
  Website/src/app/api/ynot/admin/stock-skus/open-container/route.ts \
  Website/src/app/api/ynot/admin/card-stock/route.ts
```

Expected:

```text
stock-skus/route.ts has resolveAdminSession, enforceSameOriginMutation, enforceRateLimit, upsert_stock_sku
stock-skus/open-container/route.ts has resolveAdminSession, enforceSameOriginMutation, open_stock_container
card-stock/route.ts has resolveAdminSession, enforceSameOriginMutation, enforceRateLimit, adjust_stock_sku_units
```

- [ ] **Step 4: Commit only if tests required fixes**

If Task 6 required no code changes, do not commit. If it required test/code fixes, commit:

```bash
git add Website
git commit -m "$(cat <<'MSG'
Preserve stock API contracts after UI cleanup

Constraint: Admin UI wording changed, but existing RPC-backed stock behavior must stay compatible.
Rejected: Skip route contract checks | stock changes touch production inventory paths.
Confidence: high
Scope-risk: narrow
Directive: Keep admin mutations behind admin session, same-origin, and rate-limit gates.
Tested: npm run test:stock-sku-presentation; npm run test:stock-sku-usage; npm run test:stock-subsku-admin-api; npm run test:stock-subsku-conversion; npm run test:stock-subsku-conversion-sql; npm run test:subsku-images; npm run typecheck; npm run lint
Not-tested: Browser visual check is covered in Task 7.
MSG
)"
```

---

## Task 7: Localhost Production-Data Visual Verification

**Files:**
- Read: `Website/.env.local`
- Runtime only: local Next dev server on port `3005`
- Output screenshots: `/tmp/ynott-main-subsku-stock-desktop.png`, `/tmp/ynott-main-subsku-stock-mobile.png`

- [ ] **Step 1: Start localhost with dev preview auth**

If a previous Next dev server is running on port `3005`, stop only that local process. Then run:

```bash
cd Website
YNOT_ENABLE_DEV_AUTH=true npm run dev -- --hostname 127.0.0.1 --port 3005
```

Expected:

```text
Local: http://127.0.0.1:3005
Environments: .env.local
Ready
```

- [ ] **Step 2: Open admin with local auth**

In a browser or Playwright:

```text
http://localhost:3005/api/dev/preview-auth?mode=on&next=/admin/prizes
```

Expected: lands on `/admin/prizes`, not `/login`.

- [ ] **Step 3: Search OP16 and inspect rows**

Search:

```text
OP16
```

Expected visible behavior:

```text
The Time Of Battle-Box
Main SKU stock 0/105
Sub-SKU stock
OP16-SEALED
Type Box
Available 0 boxes
Allocated 105 boxes
Total 105 boxes
Conversion Pack conversion not set or 1 box = <N> <child pack SKU>

The Time Of Battle-Pack
Main SKU stock 1/214
Sub-SKU stock
OP16-SEALED
Type Pack
Available 1 pack
Allocated 213 packs
Total 214 packs
Conversion Direct pack stock
```

- [ ] **Step 4: Capture desktop screenshot**

Use Playwright from the Codex Node runtime:

```js
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1660, height: 1120 } });
await page.goto("http://localhost:3005/api/dev/preview-auth?mode=on&next=/admin/prizes", {
  waitUntil: "domcontentloaded",
});
await page.waitForLoadState("networkidle").catch(() => {});
await page
  .getByPlaceholder("Search model code, set, variant, cert, GemRate, category, condition, grade, pack")
  .fill("OP16");
await page.waitForTimeout(800);
await page.evaluate(() => {
  const row = [...document.querySelectorAll("article.admin-card-catalog-row")]
    .find((el) => el.textContent?.includes("The Time Of Battle-Box"));
  if (!row) throw new Error("OP16 box row not found");
  row.setAttribute("data-codex-capture", "op16-box");
  const details = row.querySelector("details.admin-card-stock-breakdown");
  if (details) details.open = true;
  row.scrollIntoView({ block: "start", inline: "nearest" });
});
await page.locator('[data-codex-capture="op16-box"]').screenshot({
  path: "/tmp/ynott-main-subsku-stock-desktop.png",
});
await browser.close();
```

Expected: screenshot shows a Sub-SKU stock table, not an unexplained generic stock card.

- [ ] **Step 5: Capture mobile screenshot**

Use the same Playwright script with:

```js
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
```

Save to:

```text
/tmp/ynott-main-subsku-stock-mobile.png
```

Expected: table wraps into mobile rows without overlapping text.

- [ ] **Step 6: Commit visual-only CSS fixes if needed**

If screenshots reveal spacing/overflow issues and CSS is changed, run:

```bash
cd Website
npm run test:stock-subsku-admin-api
npm run typecheck
npm run lint
```

Then commit:

```bash
git add Website/src/app/globals.css Website/src/features/ynot/client.tsx Website/scripts/test-stock-subsku-admin-api.mjs
git commit -m "$(cat <<'MSG'
Polish the Main SKU Sub-SKU stock layout

Constraint: Admin stock counting must be readable on both desktop and mobile.
Rejected: Ship text-only correctness without visual verification | this screen is used for real stock counting.
Confidence: high
Scope-risk: narrow
Directive: Preserve dense admin layout; do not turn this into a marketing-style card page.
Tested: npm run test:stock-subsku-admin-api; npm run typecheck; npm run lint; desktop and mobile localhost screenshots with production OP16 data
Not-tested: Production deploy is outside this local UI plan.
MSG
)"
```

---

## Final Acceptance Criteria

- Admin Prize catalog uses `Main SKU` for product identity actions.
- Admin Prize catalog uses `Sub-SKU` for editable stock buckets.
- `Edit card`, `Delete card`, and generic `Add stock` are not visible labels on the Prize catalog stock workflow.
- Main SKU stock summary remains visible and aggregates all Sub-SKU stock.
- Sub-SKU stock rows show one row per Sub-SKU with type, available, allocated, total, pack equivalent, and conversion.
- Box Sub-SKU editor clearly shows `Packs per box` and explains that different products can use different counts.
- Adding admin stock requires choosing a Sub-SKU and sends `stockSkuId` to `/api/ynot/admin/card-stock`.
- Adding Sub-SKU stock updates Main SKU aggregate totals through existing `card_stock_units`.
- Existing admin APIs/RPCs and pack-opening/image tests still pass.
- Localhost screenshot with production OP16 data is readable on desktop and mobile.

## Self-Review

Spec coverage:

- Category type `Card > Main SKU > Sub-SKU graded/condition`: covered by Tasks 1, 2, 3, and 4.
- Category type `Box > Main SKU > Sub-SKU packs`: covered by Tasks 1, 2, and 5.
- Main SKU covers all stock in Sub-SKUs: covered by `mainSkuStockSummary()` in Task 1 and UI usage in Task 2.
- Each Sub-SKU shows its own stock if there are 10 Sub-SKUs: covered by `subSkuStockRows()` and the table rendering in Task 2.
- Rename confusing `Edit card` wording: covered by Task 3.
- Add stock through Sub-SKU and update global/Main SKU total: covered by Task 4 using existing `adjust_stock_sku_units`.
- Box can contain 30 packs or any per-product count: covered by Task 5 using existing `childQuantity`.

Placeholder scan:

- No `TBD`, `TODO`, `implement later`, or unspecified error-handling steps remain.
- Every code-changing task includes concrete code or exact label replacements.

Type consistency:

- `StockSkuGroup` comes from `Website/src/features/ynot/stock-sku-usage.ts`.
- Helper names used by tests match helper exports: `mainSkuCategoryType`, `mainSkuActionLabels`, `mainSkuStockSummary`, `subSkuStockRows`.
- Client imports match helper exports.
- Existing API field name remains `stockSkuId`.
