# Random Pack Brand Sub-SKU Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Random Pack Studio so top-level Brand filters every prize row, row-level selection uses catalog Sub-category plus exact sub-SKU stock, and the API/reservation path validates and reserves the selected sub-SKU rather than any stock under the same main card.

**Architecture:** Keep `cards` as the main catalog item and use `card_stock_units` as the source for generated sub-SKU groups. The admin UI sends `cardId` plus sub-SKU metadata in each `initialPrizes` row; server validation and owner-review reservation both read the same metadata filter so localhost, draft save, owner review, approval, and customer opening agree.

**Tech Stack:** Next.js 16 App Router in `Website/`, React 19 client components, TypeScript helper modules under `Website/src/features/ynot/`, Supabase RPCs and migrations under `Database/supabase/migrations/`, Node `--test` scripts under `Website/scripts/`, and manual localhost verification with `npm run dev`.

---

## Product Decision

Use these admin concepts:

| Admin label | Data source | Example |
| --- | --- | --- |
| Brand | `cards.series` / campaign `series` | `one_piece` |
| Product type | `cards.catalog_category` | `single_cards` |
| Prize item | `cards.id` main SKU | `OP09-118-JP` |
| Sub-SKU stock | generated from `card_stock_units` identity | `OP09-118-JP-MANGA-BGS95` |
| Prize type | read-only label derived from sub-SKU | `BGS 9.5 card` |

The old row-level `PrizeCategory` dropdown (`PSA10 card`, `Sealed/card product`, etc.) becomes compatibility metadata only. Admins should not manually pick it because it can mismatch the selected sub-SKU, as in `RAW` stock labeled `PSA10 card`.

---

## Current Code Anchors

- `Website/src/features/ynot/client.tsx:3013` renders `AdminCampaignForm`.
- `Website/src/features/ynot/client.tsx:2281` defines `CampaignPrizeDraft`.
- `Website/src/features/ynot/client.tsx:2324` filters prize catalog rows with old `PrizeCategory`.
- `Website/src/features/ynot/client.tsx:4082` renders the old manual `Category` dropdown.
- `Website/src/features/ynot/card-catalog-metadata.ts:21` defines catalog Sub-category options.
- `Website/src/features/ynot/prize-category.ts:31` defines legacy prize categories.
- `Website/src/features/ynot/prize-readiness.ts:274` validates stock by card-level summary.
- `Website/src/app/api/ynot/admin/campaigns/route.ts:3435` receives/saves `initialPrizes`.
- `Database/supabase/migrations/20260514045933_global_card_inventory_owner_approval.sql:597` reserves stock by `card_id` only.

---

## File Structure

Create:

```text
Website/src/features/ynot/random-pack-prize-selection.ts
Website/scripts/test-random-pack-prize-selection.mjs
Website/tools/verification/verify-random-pack-sub-sku-selection.mjs
Database/supabase/migrations/20260602090000_random_pack_sub_sku_filters.sql
```

Modify:

```text
Website/package.json
Website/src/features/ynot/types.ts
Website/src/features/ynot/client.tsx
Website/src/features/ynot/data.ts
Website/src/features/ynot/stock-readiness.ts
Website/src/features/ynot/prize-readiness.ts
Website/src/app/api/ynot/admin/campaigns/route.ts
Website/src/app/api/ynot/admin/prizes/route.ts
Website/src/lib/supabase/types.ts
```

Do not delete `/admin/categories` in this change. This task only changes Random Pack Studio wording and behavior. Storefront categories can be renamed to "Storefront Categories" in a later UI cleanup.

---

### Task 1: Add Pure Selection Helpers

**Files:**
- Create: `Website/src/features/ynot/random-pack-prize-selection.ts`
- Create: `Website/scripts/test-random-pack-prize-selection.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the helper test**

Create `Website/scripts/test-random-pack-prize-selection.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/random-pack-prize-selection.ts", import.meta.url),
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
  exports: cjsModule.exports,
  module: cjsModule,
  require,
});
const helpers = cjsModule.exports;

const roger = {
  catalogCardId: "card-roger",
  code: "OP09-118",
  modelCode: "OP09-118-JP",
  name: "GOLD D. ROGER",
  series: "One Piece",
  catalogCategory: "single_cards",
  language: "japanese",
  variant: "MANGA",
  stockUnits: [
    {
      id: "raw-unit",
      condition: "raw",
      grade: null,
      gradingService: null,
      certNumber: null,
      status: "available",
      quantity: 12,
    },
    {
      id: "bgs-unit",
      condition: "graded",
      grade: "9.5",
      gradingService: "bgs",
      certNumber: "56173456",
      status: "available",
      quantity: 1,
    },
  ],
};

const pikachu = {
  catalogCardId: "card-pika",
  code: "SV-PK-001",
  modelCode: "SV-PK-001",
  name: "Pikachu",
  series: "Pokemon",
  catalogCategory: "single_cards",
  language: "english",
  variant: "",
  stockUnits: [],
};

test("filters prize items by selected brand and catalog sub-category", () => {
  assert.deepEqual(
    helpers
      .filterRandomPackPrizeCards([roger, pikachu], {
        brand: "one_piece",
        catalogCategory: "single_cards",
      })
      .map((card) => card.catalogCardId),
    ["card-roger"],
  );
});

test("generates separate raw and BGS sub-SKU groups from stock units", () => {
  const groups = helpers.stockSkuGroupsForPrizeCard(roger);
  assert.deepEqual(
    groups.map((group) => [group.stockSkuCode, group.prizeTypeLabel, group.availableUnits]),
    [
      ["OP09-118-JP-MANGA-RAW", "Raw card", 12],
      ["OP09-118-JP-MANGA-BGS95", "BGS 9.5 card", 1],
    ],
  );
});

test("derives legacy prize metadata from selected product type and sub-SKU", () => {
  const group = helpers.stockSkuGroupsForPrizeCard(roger)[1];
  assert.deepEqual(helpers.legacyPrizeMetadataForSelection(roger, group), {
    catalogCategory: "single_cards",
    catalogCategoryLabel: "Single Cards",
    prizeCategory: "psa10_card",
    prizeCategoryLabel: "Graded card",
    prizeTypeLabel: "BGS 9.5 card",
    sourceType: "card",
    stockSkuCode: "OP09-118-JP-MANGA-BGS95",
    stockUnitFilter: {
      condition: "graded",
      grade: "9.5",
      gradingService: "bgs",
      stockSkuCode: "OP09-118-JP-MANGA-BGS95",
    },
  });
});

test("stock filter matching keeps PSA/BGS/raw buckets separate", () => {
  const raw = helpers.stockSkuGroupsForPrizeCard(roger)[0];
  const bgs = helpers.stockSkuGroupsForPrizeCard(roger)[1];
  assert.equal(
    helpers.stockUnitMatchesFilter(roger.stockUnits[0], raw.stockUnitFilter),
    true,
  );
  assert.equal(
    helpers.stockUnitMatchesFilter(roger.stockUnits[0], bgs.stockUnitFilter),
    false,
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd Website
npm run test:random-pack-prize-selection
```

Expected: FAIL because `test:random-pack-prize-selection` and `random-pack-prize-selection.ts` do not exist yet.

- [ ] **Step 3: Add the helper implementation**

Create `Website/src/features/ynot/random-pack-prize-selection.ts`:

```ts
import {
  catalogCategoryLabel,
  type CatalogCategory,
} from "./card-catalog-metadata";
import type { PrizeCategory, PrizeSourceType } from "./prize-category";

export type RandomPackBrand = "pokemon" | "one_piece";

export type StockUnitLike = {
  id?: string;
  condition?: string | null;
  grade?: string | null;
  gradingService?: string | null;
  grading_service?: string | null;
  certNumber?: string | null;
  cert_number?: string | null;
  status?: string | null;
  quantity?: number | null;
};

export type PrizeCardLike = {
  catalogCardId: string;
  code?: string | null;
  modelCode?: string | null;
  name: string;
  series?: string | null;
  catalogCategory?: string | null;
  language?: string | null;
  variant?: string | null;
  stockUnits?: StockUnitLike[];
};

export type StockUnitFilter = {
  condition: "raw" | "sealed" | "graded";
  grade: string | null;
  gradingService: string | null;
  stockSkuCode: string;
};

export type StockSkuGroup = {
  stockSkuCode: string;
  stockUnitFilter: StockUnitFilter;
  label: string;
  prizeTypeLabel: string;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedToken(value: unknown) {
  return stringValue(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeRandomPackBrand(value: unknown): RandomPackBrand {
  const text = stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (text === "one_piece" || text.includes("one_piece") || text.includes("onepiece")) {
    return "one_piece";
  }
  return "pokemon";
}

export function cardMatchesRandomPackBrand(card: PrizeCardLike, brand: RandomPackBrand) {
  const series = normalizeRandomPackBrand(card.series);
  return series === brand;
}

export function filterRandomPackPrizeCards(
  cards: PrizeCardLike[],
  filter: { brand: RandomPackBrand; catalogCategory: CatalogCategory },
) {
  return cards.filter(
    (card) =>
      cardMatchesRandomPackBrand(card, filter.brand) &&
      card.catalogCategory === filter.catalogCategory,
  );
}

function languageToken(value: unknown) {
  const text = stringValue(value).toLowerCase();
  if (text === "japanese" || text === "jp") return "JP";
  if (text === "english" || text === "en") return "EN";
  if (text === "chinese" || text === "cn") return "CN";
  return normalizedToken(value) || "NA";
}

function gradeToken(value: unknown) {
  const normalized = stringValue(value).toUpperCase();
  if (normalized === "10 BLACK LABEL") return "10BL";
  if (normalized === "10 PRISTINE") return "10PR";
  return normalized.replace(/\./g, "").replace(/[^A-Z0-9]+/g, "");
}

function normalizedCondition(value: unknown): "raw" | "sealed" | "graded" {
  if (value === "sealed") return "sealed";
  if (value === "graded") return "graded";
  return "raw";
}

function unitQuantity(unit: StockUnitLike) {
  const parsed = Math.round(Number(unit.quantity ?? 1));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function unitGradingService(unit: StockUnitLike) {
  return stringValue(unit.gradingService ?? unit.grading_service).toLowerCase() || null;
}

function unitGrade(unit: StockUnitLike) {
  return stringValue(unit.grade) || null;
}

export function stockSkuCodeForPrizeUnit(card: PrizeCardLike, unit: StockUnitLike) {
  const model = normalizedToken(card.modelCode || card.code || card.catalogCardId);
  const language = languageToken(card.language);
  const variant = normalizedToken(card.variant);
  const condition = normalizedCondition(unit.condition);
  if (condition === "graded") {
    const service = normalizedToken(unitGradingService(unit) || "graded");
    return [model, language, variant, `${service}${gradeToken(unitGrade(unit))}`]
      .filter(Boolean)
      .join("-");
  }
  return [model, language, variant, condition.toUpperCase()].filter(Boolean).join("-");
}

function filterForUnit(card: PrizeCardLike, unit: StockUnitLike): StockUnitFilter {
  return {
    condition: normalizedCondition(unit.condition),
    grade: unitGrade(unit),
    gradingService: unitGradingService(unit),
    stockSkuCode: stockSkuCodeForPrizeUnit(card, unit),
  };
}

export function prizeTypeLabelForFilter(filter: StockUnitFilter) {
  if (filter.condition === "raw") return "Raw card";
  if (filter.condition === "sealed") return "Sealed product";
  const service = filter.gradingService ? filter.gradingService.toUpperCase() : "Graded";
  const grade = filter.grade ? ` ${filter.grade}` : "";
  return `${service}${grade} card`;
}

export function stockUnitMatchesFilter(unit: StockUnitLike, filter: StockUnitFilter) {
  return (
    normalizedCondition(unit.condition) === filter.condition &&
    (unitGrade(unit) || null) === filter.grade &&
    (unitGradingService(unit) || null) === filter.gradingService
  );
}

export function stockSkuGroupsForPrizeCard(card: PrizeCardLike): StockSkuGroup[] {
  const groups = new Map<string, StockSkuGroup>();
  for (const unit of card.stockUnits ?? []) {
    if (unit.status === "deleted" || unit.status === "archived") continue;
    const filter = filterForUnit(card, unit);
    const existing =
      groups.get(filter.stockSkuCode) ??
      ({
        stockSkuCode: filter.stockSkuCode,
        stockUnitFilter: filter,
        label: "",
        prizeTypeLabel: prizeTypeLabelForFilter(filter),
        totalUnits: 0,
        availableUnits: 0,
        reservedUnits: 0,
        allocatedUnits: 0,
      } satisfies StockSkuGroup);
    const quantity = unitQuantity(unit);
    existing.totalUnits += quantity;
    if (unit.status === "reserved") existing.reservedUnits += quantity;
    else if (unit.status === "allocated") existing.allocatedUnits += quantity;
    else existing.availableUnits += quantity;
    existing.label = `${existing.stockSkuCode} - ${existing.prizeTypeLabel} - ${existing.availableUnits}/${existing.totalUnits} stock`;
    groups.set(filter.stockSkuCode, existing);
  }
  return [...groups.values()].sort((left, right) =>
    left.stockSkuCode.localeCompare(right.stockSkuCode),
  );
}

export function legacyPrizeMetadataForSelection(
  card: PrizeCardLike,
  group: StockSkuGroup,
): {
  catalogCategory: string;
  catalogCategoryLabel: string;
  prizeCategory: PrizeCategory;
  prizeCategoryLabel: string;
  prizeTypeLabel: string;
  sourceType: PrizeSourceType;
  stockSkuCode: string;
  stockUnitFilter: StockUnitFilter;
} {
  const category = (card.catalogCategory || "single_cards") as CatalogCategory;
  const sourceType: PrizeSourceType =
    category === "single_cards"
      ? "card"
      : category === "packs" ||
          category === "boxes" ||
          category === "cases" ||
          category === "sets"
        ? "sealed"
        : "other";
  const prizeCategory: PrizeCategory =
    category === "single_cards"
      ? "psa10_card"
      : sourceType === "sealed"
        ? "sealed_product"
        : "other";
  return {
    catalogCategory: category,
    catalogCategoryLabel: catalogCategoryLabel(category),
    prizeCategory,
    prizeCategoryLabel:
      category === "single_cards" ? "Graded card" : catalogCategoryLabel(category),
    prizeTypeLabel: group.prizeTypeLabel,
    sourceType,
    stockSkuCode: group.stockSkuCode,
    stockUnitFilter: group.stockUnitFilter,
  };
}
```

- [ ] **Step 4: Add the npm test script**

Modify `Website/package.json` `scripts`:

```json
"test:random-pack-prize-selection": "node --test scripts/test-random-pack-prize-selection.mjs"
```

- [ ] **Step 5: Run the helper test**

Run:

```bash
cd Website
npm run test:random-pack-prize-selection
```

Expected: PASS with 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add Website/package.json Website/src/features/ynot/random-pack-prize-selection.ts Website/scripts/test-random-pack-prize-selection.mjs
git commit -m "Plan random pack prize selection helpers

Constraint: Random Pack Studio must filter by brand and exact sub-SKU without a new database table.
Confidence: high
Scope-risk: moderate
Tested: npm run test:random-pack-prize-selection
Not-tested: Browser workflow not changed yet"
```

---

### Task 2: Rework Random Pack Studio Row State

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/types.ts`

- [ ] **Step 1: Write a static verification check**

Create `Website/tools/verification/verify-random-pack-sub-sku-selection.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../../src/features/ynot/client.tsx", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../../src/features/ynot/prize-readiness.ts", import.meta.url), "utf8");
const lifecycleSql = readFileSync(
  new URL("../../../Database/supabase/migrations/20260602090000_random_pack_sub_sku_filters.sql", import.meta.url),
  "utf8",
);

assert.match(client, /filterRandomPackPrizeCards/);
assert.match(client, /stockSkuGroupsForPrizeCard/);
assert.match(client, /Product type/);
assert.match(client, /Sub-SKU stock/);
assert.doesNotMatch(client, /<span>Category<\/span>\s*<select[\s\S]*prizeCategoryOptions/);
assert.match(readiness, /stockRequirementKeyForPrize/);
assert.match(lifecycleSql, /card_stock_unit_matches_prize_filter/);

console.log("Random pack sub-SKU selection verification passed.");
```

Add script to `Website/package.json`:

```json
"verify:random-pack-sub-sku-selection": "node tools/verification/verify-random-pack-sub-sku-selection.mjs"
```

- [ ] **Step 2: Run static verification and confirm it fails**

Run:

```bash
cd Website
npm run verify:random-pack-sub-sku-selection
```

Expected: FAIL because the client still renders the old manual category dropdown and the SQL migration does not exist.

- [ ] **Step 3: Import the helper and catalog labels in `client.tsx`**

At the top of `Website/src/features/ynot/client.tsx`, add:

```ts
import {
  filterRandomPackPrizeCards,
  legacyPrizeMetadataForSelection,
  stockSkuGroupsForPrizeCard,
  type RandomPackBrand,
  type StockSkuGroup,
  type StockUnitFilter,
} from "./random-pack-prize-selection";
```

Keep the existing `prize-category` imports for backward compatibility, but stop using `prizeCategoryOptions` in `AdminCampaignForm`.

- [ ] **Step 4: Extend `CampaignPrizeDraft`**

Replace the type at `Website/src/features/ynot/client.tsx:2281` with:

```ts
type CampaignPrizeDraft = {
  localId: string;
  displayTier: PrizeDisplayTier;
  cardId: string;
  tier: "normal" | "high";
  catalogCategory: CatalogCategory;
  stockSkuCode: string;
  stockUnitFilter: StockUnitFilter | null;
  prizeTypeLabel: string;
  prizeCategory: PrizeCategory;
  rank: number;
  tierRank: number;
  valueThb: number;
  convertCoinValue: number;
  quantity: number;
  weight: number;
  unlockAtSoldPct: number;
};
```

- [ ] **Step 5: Replace old card filtering**

Replace `prizeCatalogCardsFor` with:

```ts
function prizeCatalogCardsFor(
  cards: CardCatalogItem[],
  brand: RandomPackBrand,
  catalogCategory: CatalogCategory,
) {
  return filterRandomPackPrizeCards(cards, { brand, catalogCategory }) as CardCatalogItem[];
}
```

Remove the bronze-only `Random PSA10` branch from Random Pack Studio filtering. Keep `isRandomPsa10Card` only where old catalog/admin pages still need it.

- [ ] **Step 6: Add helpers for selected card and sub-SKU**

Near `createPrizeDraft`, add:

```ts
function firstStockSkuGroup(card: CardCatalogItem | null): StockSkuGroup | null {
  if (!card) return null;
  return stockSkuGroupsForPrizeCard(card)[0] ?? null;
}

function draftFromSelection(
  prize: CampaignPrizeDraft,
  card: CardCatalogItem | null,
  stockGroup: StockSkuGroup | null,
): Partial<CampaignPrizeDraft> {
  if (!card || !stockGroup) {
    return {
      cardId: card?.catalogCardId ?? "",
      stockSkuCode: "",
      stockUnitFilter: null,
      prizeTypeLabel: "",
    };
  }
  const metadata = legacyPrizeMetadataForSelection(card, stockGroup);
  return {
    cardId: card.catalogCardId,
    catalogCategory: metadata.catalogCategory as CatalogCategory,
    stockSkuCode: metadata.stockSkuCode,
    stockUnitFilter: metadata.stockUnitFilter,
    prizeTypeLabel: metadata.prizeTypeLabel,
    prizeCategory: metadata.prizeCategory,
  };
}
```

- [ ] **Step 7: Update `createPrizeDraft`**

Replace the body of `createPrizeDraft` with:

```ts
function createPrizeDraft(
  displayTier: PrizeDisplayTier,
  index: number,
  cards: CardCatalogItem[],
  brand: RandomPackBrand,
  catalogCategory: CatalogCategory,
  existing?: CampaignPrizeDraft,
) {
  const config = prizeDisplayTierConfig(displayTier);
  const productType = existing?.catalogCategory ?? catalogCategory;
  const cardOptions = prizeCatalogCardsFor(cards, brand, productType);
  const selectedCard =
    (existing?.cardId
      ? cardOptions.find((card) => card.catalogCardId === existing.cardId)
      : null) ?? cardOptions[0] ?? null;
  const selectedStockGroup =
    selectedCard && existing?.stockSkuCode
      ? stockSkuGroupsForPrizeCard(selectedCard).find(
          (group) => group.stockSkuCode === existing.stockSkuCode,
        ) ?? firstStockSkuGroup(selectedCard)
      : firstStockSkuGroup(selectedCard);
  const selection = draftFromSelection(
    {
      ...(existing as CampaignPrizeDraft),
      catalogCategory: productType,
    },
    selectedCard,
    selectedStockGroup,
  );
  return {
    localId: existing?.localId ?? `${displayTier}-${index + 1}`,
    displayTier,
    cardId: selection.cardId ?? "",
    tier: config.dbTier,
    catalogCategory: productType,
    stockSkuCode: selection.stockSkuCode ?? "",
    stockUnitFilter: selection.stockUnitFilter ?? null,
    prizeTypeLabel: selection.prizeTypeLabel ?? "",
    prizeCategory: selection.prizeCategory ?? "other",
    rank: existing?.rank ?? index + 1,
    tierRank: index + 1,
    valueThb: existing?.valueThb ?? defaultPrizeValueThb(displayTier, index),
    convertCoinValue:
      existing?.convertCoinValue ?? defaultConvertCoinValue(displayTier, index),
    quantity: Math.max(
      0,
      Math.round(Number(existing?.quantity) || config.defaultQuantity),
    ),
    weight: existing?.weight ?? config.defaultWeight,
    unlockAtSoldPct:
      existing?.unlockAtSoldPct ?? config.defaultUnlockAtSoldPct,
  } satisfies CampaignPrizeDraft;
}
```

Update every call site to pass `series` and a default catalog category:

```ts
createPrizeDraft(displayTier, index, cards, series, "single_cards", existing)
```

- [ ] **Step 8: Reset rows when top-level Brand changes**

Add this handler inside `AdminCampaignForm`:

```ts
function updateBrand(nextBrand: RandomPackBrand) {
  setSeries(nextBrand);
  setDraftPrizes((current) =>
    withLowestTierRemainder(
      current.map((prize, index) =>
        createPrizeDraft(
          prize.displayTier,
          index,
          cards,
          nextBrand,
          prize.catalogCategory,
          prize,
        ),
      ),
      totalSlots,
      cards,
    ),
  );
}
```

Change the Brand select `onChange` to:

```tsx
onChange={(event) => updateBrand(event.target.value as RandomPackBrand)}
```

- [ ] **Step 9: Replace row Category UI with Product type and read-only Prize type**

In the prize table header, replace:

```tsx
<span>Category</span>
```

with:

```tsx
<span>Product type</span>
<span>Prize type</span>
```

For each row, replace the old `Category` select block with:

```tsx
<label className="admin-field">
  <span>Product type</span>
  <select
    value={prize.catalogCategory}
    onChange={(event) => {
      const catalogCategory = event.target.value as CatalogCategory;
      const nextCards = prizeCatalogCardsFor(cards, series, catalogCategory);
      const nextCard = nextCards[0] ?? null;
      updatePrizeDraft(prize.localId, {
        catalogCategory,
        ...draftFromSelection(prize, nextCard, firstStockSkuGroup(nextCard)),
      });
    }}
  >
    {catalogCategoryOptions.map((categoryOption) => (
      <option key={categoryOption.value} value={categoryOption.value}>
        {categoryOption.label}
      </option>
    ))}
  </select>
</label>
<div className="admin-field">
  <span>Prize type</span>
  <strong>{prize.prizeTypeLabel || "Select sub-SKU"}</strong>
</div>
```

Adjust CSS grid columns for `.admin-prize-table-head` and `.admin-prize-table-row` so the extra read-only field fits at desktop and stacks on mobile.

- [ ] **Step 10: Make prize item and sub-SKU selection brand-scoped**

Inside the row render, compute:

```ts
const itemOptions = prizeCatalogCardsFor(cards, series, prize.catalogCategory);
const selectedCard =
  itemOptions.find((card) => card.catalogCardId === prize.cardId) ?? null;
const stockSkuOptions = selectedCard ? stockSkuGroupsForPrizeCard(selectedCard) : [];
const selectedStockSku =
  stockSkuOptions.find((group) => group.stockSkuCode === prize.stockSkuCode) ?? null;
```

Change `AdminPrizeCardPicker` to use search:

```tsx
<AdminPrizeCardPicker
  cards={itemOptions}
  disabled={!itemOptions.length}
  showPreview={false}
  showSearch
  value={selectedCard?.catalogCardId ?? ""}
  onChange={(cardId) => {
    const nextCard =
      itemOptions.find((card) => card.catalogCardId === cardId) ?? null;
    updatePrizeDraft(prize.localId, {
      ...draftFromSelection(prize, nextCard, firstStockSkuGroup(nextCard)),
    });
  }}
  testIdPrefix={`campaign-prize-${prize.localId}`}
/>
```

Add the sub-SKU dropdown under the prize item picker:

```tsx
<label className="admin-field admin-prize-stock-sku-field">
  <span>Sub-SKU stock</span>
  <select
    disabled={!stockSkuOptions.length}
    value={selectedStockSku?.stockSkuCode ?? ""}
    onChange={(event) => {
      const nextGroup =
        stockSkuOptions.find(
          (group) => group.stockSkuCode === event.target.value,
        ) ?? null;
      updatePrizeDraft(prize.localId, {
        ...draftFromSelection(prize, selectedCard, nextGroup),
      });
    }}
  >
    <option value="">
      {selectedCard ? "Select sub-SKU stock" : "Select prize item first"}
    </option>
    {stockSkuOptions.map((group) => (
      <option key={group.stockSkuCode} value={group.stockSkuCode}>
        {group.label}
      </option>
    ))}
  </select>
  {selectedCard && !stockSkuOptions.length && (
    <small>Add stock units for this prize item first.</small>
  )}
</label>
```

- [ ] **Step 11: Send exact selection metadata in `initialPrizes`**

In the `submit()` payload, replace each prize metadata block with:

```ts
metadata: {
  displayTier: prize.displayTier,
  displayTierLabel: prizeDisplayTierLabel(prize.displayTier),
  displayGroup: prize.displayTier,
  tierRank: prize.tierRank,
  brand: series,
  catalogCategory: prize.catalogCategory,
  catalogCategoryLabel: catalogCategoryLabel(prize.catalogCategory),
  prizeCategory: prize.prizeCategory,
  prizeCategoryLabel: prize.prizeTypeLabel || prizeCategoryLabel(prize.prizeCategory),
  prizeTypeLabel: prize.prizeTypeLabel,
  sourceType: prizeSourceType(prize.prizeCategory),
  stockSkuCode: prize.stockSkuCode,
  stockUnitFilter: prize.stockUnitFilter,
},
```

- [ ] **Step 12: Add UI blockers for missing sub-SKU**

Add this blocker before `missingPrizeItemRows`:

```ts
const missingStockSkuRows = draftPrizes.filter(
  (prize) => prizeUnitCount(prize) > 0 && (!prize.stockSkuCode || !prize.stockUnitFilter),
);
```

Add to `prizeBlockers`:

```ts
missingStockSkuRows.length
  ? "Choose sub-SKU stock for every active prize row."
  : "",
```

- [ ] **Step 13: Run verification**

Run:

```bash
cd Website
npm run test:random-pack-prize-selection
npm run verify:random-pack-sub-sku-selection
npm run typecheck
npm run lint
```

Expected:

```text
PASS test:random-pack-prize-selection
PASS verify:random-pack-sub-sku-selection
tsc --noEmit exits 0
eslint exits 0
```

- [ ] **Step 14: Commit**

```bash
git add Website/src/features/ynot/client.tsx Website/src/features/ynot/types.ts Website/tools/verification/verify-random-pack-sub-sku-selection.mjs Website/package.json
git commit -m "Align random pack prize rows to brand and sub-SKU

Constraint: Admin prize rows must not allow raw stock to be labeled as PSA10.
Rejected: Keeping manual prize category picker | It can conflict with selected stock identity.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:random-pack-prize-selection; npm run verify:random-pack-sub-sku-selection; npm run typecheck; npm run lint
Not-tested: Owner review reservation still updates in the next task"
```

---

### Task 3: Validate Payloads and Stock by Sub-SKU

**Files:**
- Modify: `Website/src/features/ynot/stock-readiness.ts`
- Modify: `Website/src/features/ynot/prize-readiness.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Modify: `Website/src/app/api/ynot/admin/prizes/route.ts`
- Modify: `Website/src/lib/supabase/types.ts`

- [ ] **Step 1: Extend stock readiness types**

In `Website/src/features/ynot/stock-readiness.ts`, extend types:

```ts
export type StockUnitFilterMetadata = {
  condition?: string | null;
  grade?: string | null;
  gradingService?: string | null;
  stockSkuCode?: string | null;
};

export type StockReadinessPrize = {
  cardId?: string | null;
  card_id?: string | null;
  cardName?: string | null;
  cardCode?: string | null;
  quantity?: number | null;
  plannedQuantity?: number | null;
  planned_quantity?: number | null;
  metadata?: unknown;
};

export type PrizeStockSummary = {
  cardId: string;
  cardName?: string | null;
  cardCode?: string | null;
  stockSkuCode?: string | null;
  stockAvailable?: number | null;
  reservedForCampaign?: number | null;
};
```

Add helpers:

```ts
export function stockUnitFilterForPrize(prize: StockReadinessPrize): StockUnitFilterMetadata | null {
  if (!isRecord(prize.metadata)) return null;
  const filter = prize.metadata.stockUnitFilter;
  if (!isRecord(filter)) return null;
  return {
    condition: stringOrEmpty(filter.condition) || null,
    grade: stringOrEmpty(filter.grade) || null,
    gradingService: stringOrEmpty(filter.gradingService) || null,
    stockSkuCode:
      stringOrEmpty(filter.stockSkuCode) ||
      stringOrEmpty(prize.metadata.stockSkuCode) ||
      null,
  };
}

export function stockRequirementKeyForPrize(prize: StockReadinessPrize) {
  const cardId = stockCardIdForPrize(prize);
  const filter = stockUnitFilterForPrize(prize);
  return filter?.stockSkuCode ? `${cardId}:${filter.stockSkuCode}` : cardId;
}

function stockSummaryKey(summary: PrizeStockSummary) {
  return summary.stockSkuCode ? `${summary.cardId}:${summary.stockSkuCode}` : summary.cardId;
}
```

Update `buildPrizeStockShortages` maps from `cardId` to requirement key:

```ts
const requiredByKey = new Map<string, number>();
const prizeByKey = new Map<string, StockReadinessPrize>();

for (const prize of prizes) {
  if (ignoreAdminHidden && isStockReadinessAdminHidden(prize.metadata)) {
    continue;
  }
  const key = stockRequirementKeyForPrize(prize);
  const quantity = stockUnitsForPrize(prize);
  if (!key || quantity <= 0) continue;
  requiredByKey.set(key, (requiredByKey.get(key) ?? 0) + quantity);
  if (!prizeByKey.has(key)) prizeByKey.set(key, prize);
}

const summaryByKey = new Map(stockSummaries.map((summary) => [stockSummaryKey(summary), summary]));
```

Return shortage rows using the summary card id:

```ts
return Array.from(requiredByKey.entries()).flatMap(([key, requiredUnits]) => {
  const prize = prizeByKey.get(key);
  const summary = summaryByKey.get(key);
  const cardId = stockCardIdForPrize(prize ?? {});
  const availableUnits = Math.max(0, Math.round(numberOrZero(summary?.stockAvailable)));
  const reservedUnits = includeReservedForCampaign
    ? Math.max(0, Math.round(numberOrZero(summary?.reservedForCampaign)))
    : 0;
  const usableUnits = availableUnits + reservedUnits;
  if (requiredUnits <= usableUnits) return [];
  return [
    {
      cardId: summary?.cardId ?? cardId,
      label: labelForPrize(cardId, prize, summary),
      requiredUnits,
      availableUnits,
      reservedUnits,
      usableUnits,
      shortageUnits: requiredUnits - usableUnits,
    },
  ];
});
```

- [ ] **Step 2: Update `getPrizeStockSummaries` to count selected sub-SKU stock**

In `Website/src/features/ynot/prize-readiness.ts`, import:

```ts
import {
  buildPrizeStockShortages,
  stockCardIdForPrize,
  stockShortageBlockers,
  stockUnitFilterForPrize,
  stockRequirementKeyForPrize,
  type PrizeStockSummary,
  type StockReadinessPrize,
} from "./stock-readiness";
```

Replace stock summary collection inside `getPrizeStockSummaries` with:

```ts
const { data: units, error: unitsError } = await supabase
  .from("card_stock_units")
  .select("id,card_id,status,condition,grade,grading_service,quantity")
  .in("card_id", cardIds)
  .neq("status", "deleted")
  .neq("status", "archived")
  .limit(50000);
if (unitsError) throw unitsError;

const reservedUnitIds = new Set<string>();
if (options.includeCampaignReservations && options.campaignId) {
  const { data: reservations, error: reservationError } = await supabase
    .from("card_stock_reservations")
    .select("stock_unit_id")
    .eq("draw_round_id", options.campaignId)
    .in("status", ["reserved", "allocated"]);
  if (reservationError) throw reservationError;
  for (const reservation of reservations ?? []) {
    if (reservation.stock_unit_id) reservedUnitIds.add(reservation.stock_unit_id);
  }
}

const prizeByKey = new Map<string, StockReadinessPrize>();
for (const prize of prizes) {
  const key = stockRequirementKeyForPrize(prize);
  if (key && !prizeByKey.has(key)) prizeByKey.set(key, prize);
}

return [...prizeByKey.entries()].map(([key, prize]) => {
  const cardId = stockCardIdForPrize(prize);
  const card = cardById.get(cardId);
  const filter = stockUnitFilterForPrize(prize);
  let availableUnits = 0;
  let reservedForCampaign = 0;
  for (const unit of units ?? []) {
    if (unit.card_id !== cardId) continue;
    if (filter) {
      const matches =
        unit.condition === filter.condition &&
        (unit.grade ?? null) === (filter.grade ?? null) &&
        (unit.grading_service ?? null) === (filter.gradingService ?? null);
      if (!matches) continue;
    }
    const quantity = Math.max(1, Math.round(Number(unit.quantity ?? 1)));
    if (unit.status === "available") availableUnits += quantity;
    if (reservedUnitIds.has(unit.id)) reservedForCampaign += quantity;
  }
  return {
    cardId,
    cardName: card?.name ?? null,
    cardCode: card?.card_code ?? card?.search_code ?? null,
    stockSkuCode: filter?.stockSkuCode ?? null,
    stockAvailable: availableUnits,
    reservedForCampaign,
  };
});
```

- [ ] **Step 3: Remove API bronze/Random PSA10 enforcement**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, remove imports:

```ts
import {
  isRandomPsa10PrizeCard,
  prizeCategoryValue,
} from "@/features/ynot/prize-category";
import {
  canPrizeDisplayTierUseRandomPsa10,
  prizeDisplayTierValue,
} from "@/features/ynot/prize-tier";
```

Keep `prizeCategoryValue` only if another branch still uses it. Delete the `psa10TierMismatched` block in `assertPrizeCardsExist`.

- [ ] **Step 4: Validate brand and catalog category metadata**

In `assertPrizeCardsExist`, change the selected columns:

```ts
.select("id,name,card_code,search_code,series,catalog_category")
```

Replace the old mismatch check with:

```ts
const mismatched = prizes.some((prize) => {
  const card = cardsById.get(prize.cardId);
  if (!card) return true;
  const metadata = isRecord(prize.metadata) ? prize.metadata : {};
  const metadataBrand = typeof metadata.brand === "string" ? metadata.brand : "";
  const metadataCategory =
    typeof metadata.catalogCategory === "string" ? metadata.catalogCategory : "";
  const cardBrand = card.series === "one_piece" ? "one_piece" : "pokemon";
  return metadataBrand !== cardBrand || metadataCategory !== card.catalog_category;
});
if (mismatched) {
  throw new Error("One or more selected prize items do not match the selected brand or product type.");
}
```

- [ ] **Step 5: Update single-prize API metadata**

In `Website/src/app/api/ynot/admin/prizes/route.ts`, update `PrizeBody`:

```ts
catalogCategory?: unknown;
stockSkuCode?: unknown;
stockUnitFilter?: unknown;
prizeTypeLabel?: unknown;
brand?: unknown;
```

In `metadataValue`, preserve exact sub-SKU metadata:

```ts
const catalogCategory = text(body.catalogCategory, 40) || metadata.catalogCategory;
const prizeTypeLabel = text(body.prizeTypeLabel, 80) || metadata.prizeTypeLabel;
const stockSkuCode = text(body.stockSkuCode, 120) || metadata.stockSkuCode;
const brand = text(body.brand, 40) || metadata.brand;
metadata.brand = brand || metadata.brand;
metadata.catalogCategory = catalogCategory || metadata.catalogCategory;
metadata.prizeTypeLabel = prizeTypeLabel || metadata.prizeCategoryLabel;
metadata.stockSkuCode = stockSkuCode || metadata.stockSkuCode;
metadata.stockUnitFilter = isRecord(body.stockUnitFilter)
  ? body.stockUnitFilter
  : isRecord(metadata.stockUnitFilter)
    ? metadata.stockUnitFilter
    : null;
```

- [ ] **Step 6: Run validation**

Run:

```bash
cd Website
npm run test:random-pack-prize-selection
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add Website/src/features/ynot/stock-readiness.ts Website/src/features/ynot/prize-readiness.ts Website/src/app/api/ynot/admin/campaigns/route.ts Website/src/app/api/ynot/admin/prizes/route.ts Website/src/lib/supabase/types.ts
git commit -m "Validate random pack stock by selected sub-SKU

Constraint: Draft save and owner review must agree on the same exact stock bucket.
Rejected: Card-level stock validation | It lets BGS, PSA, and raw stock satisfy each other.
Confidence: medium
Scope-risk: broad
Tested: npm run test:random-pack-prize-selection; npm run typecheck; npm run lint
Not-tested: Supabase owner-review RPC is updated in the next task"
```

---

### Task 4: Make Owner Review Reserve the Selected Sub-SKU

**Files:**
- Create: `Database/supabase/migrations/20260602090000_random_pack_sub_sku_filters.sql`
- Modify: `Website/src/lib/supabase/types.ts`

- [ ] **Step 1: Add SQL helper functions**

Create `Database/supabase/migrations/20260602090000_random_pack_sub_sku_filters.sql` with the helper functions first:

```sql
-- ============================================================================
-- Random pack prize sub-SKU filters
-- Stores selected sub-SKU identity in draw_round_prizes.metadata and makes
-- owner-review reservation pick only matching card_stock_units.
-- ============================================================================

create or replace function public.card_stock_unit_matches_prize_filter(
  p_unit public.card_stock_units,
  p_prize_metadata jsonb
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    case
      when coalesce(p_prize_metadata, '{}'::jsonb) ? 'stockUnitFilter' = false then true
      else
        coalesce(p_unit.condition, '') =
          coalesce(p_prize_metadata #>> '{stockUnitFilter,condition}', '')
        and coalesce(p_unit.grade, '') =
          coalesce(p_prize_metadata #>> '{stockUnitFilter,grade}', '')
        and coalesce(p_unit.grading_service, '') =
          coalesce(p_prize_metadata #>> '{stockUnitFilter,gradingService}', '')
    end
$$;

create or replace function public.card_stock_unit_quantity(p_unit public.card_stock_units)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select greatest(1, coalesce(p_unit.quantity, 1));
$$;
```

- [ ] **Step 2: Replace the stock selection block in `submit_campaign_for_review`**

In the same migration, copy the current `public.submit_campaign_for_review` definition from `Database/supabase/migrations/20260514045933_global_card_inventory_owner_approval.sql:510-696` and replace only the stock selection query at lines `606-616` with:

```sql
    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select id
      from public.card_stock_units
      where card_id = prize_row.card_id
        and status = 'available'
        and public.card_stock_unit_matches_prize_filter(card_stock_units, prize_row.metadata)
      order by created_at, id
      limit prize_row.planned_quantity
      for update skip locked
    ) selected;
```

Also change the failure ledger metadata at lines `627-631` to include sub-SKU:

```sql
jsonb_build_object(
  'reason', 'insufficient_sub_sku_stock',
  'requiredUnits', prize_row.planned_quantity,
  'availableUnits', selected_count,
  'stockSkuCode', prize_row.metadata ->> 'stockSkuCode',
  'stockUnitFilter', prize_row.metadata -> 'stockUnitFilter'
)
```

- [ ] **Step 3: Keep approval materialization unchanged**

Do not change `public.approve_campaign_inventory`. It materializes whatever `submit_campaign_for_review` reserved. Once submit-review reserves only selected sub-SKU units, approve remains correct.

- [ ] **Step 4: Update generated Supabase types manually**

In `Website/src/lib/supabase/types.ts`, add function entries under `Functions`:

```ts
card_stock_unit_matches_prize_filter: {
  Args: { p_unit: Database["public"]["Tables"]["card_stock_units"]["Row"]; p_prize_metadata: Json };
  Returns: boolean;
};
card_stock_unit_quantity: {
  Args: { p_unit: Database["public"]["Tables"]["card_stock_units"]["Row"] };
  Returns: number;
};
```

- [ ] **Step 5: Run static verification**

Run:

```bash
cd Website
npm run verify:random-pack-sub-sku-selection
npm run typecheck
```

Expected:

```text
Random pack sub-SKU selection verification passed.
tsc --noEmit exits 0
```

- [ ] **Step 6: Commit**

```bash
git add Database/supabase/migrations/20260602090000_random_pack_sub_sku_filters.sql Website/src/lib/supabase/types.ts
git commit -m "Reserve random pack stock by sub-SKU filter

Constraint: Owner review must reserve only the stock identity selected by the admin row.
Rejected: Reserving by card_id only | It mixes raw, PSA, BGS, and sealed stock.
Confidence: medium
Scope-risk: broad
Tested: npm run verify:random-pack-sub-sku-selection; npm run typecheck
Not-tested: Production migration application requires guarded Supabase workflow"
```

---

### Task 5: Show Sub-SKU Metadata in Admin and Owner Review

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/client.tsx`

- [ ] **Step 1: Extend prize preview type**

In `Website/src/features/ynot/types.ts`, add to `YnotPrizePreview`:

```ts
catalogCategory?: string | null;
catalogCategoryLabel?: string | null;
stockSkuCode?: string | null;
prizeTypeLabel?: string | null;
```

- [ ] **Step 2: Include metadata in prize lineup mapping**

In both `getPublicPrizeLineupsBatch` and `getAdminPrizePool` mappings in `Website/src/features/ynot/data.ts`, add:

```ts
catalogCategory: metadataString(prize.metadata, "catalogCategory"),
catalogCategoryLabel: metadataString(prize.metadata, "catalogCategoryLabel"),
stockSkuCode: metadataString(prize.metadata, "stockSkuCode"),
prizeTypeLabel: metadataString(prize.metadata, "prizeTypeLabel"),
```

- [ ] **Step 3: Update owner review table label**

In owner-review prize row rendering inside `Website/src/features/ynot/client.tsx`, display sub-SKU under card name:

```tsx
{prize.stockSkuCode && (
  <small>
    {prize.stockSkuCode}
    {prize.prizeTypeLabel ? ` - ${prize.prizeTypeLabel}` : ""}
  </small>
)}
```

- [ ] **Step 4: Run verification**

Run:

```bash
cd Website
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/client.tsx
git commit -m "Show selected sub-SKU in prize review surfaces

Constraint: Owners need to see the exact stock bucket before approving a pack.
Confidence: medium
Scope-risk: narrow
Tested: npm run typecheck; npm run lint
Not-tested: Browser screenshot is covered in the final smoke task"
```

---

### Task 6: Localhost End-to-End Smoke

**Files:**
- No source files unless smoke reveals a bug.

- [ ] **Step 1: Start localhost**

Run:

```bash
cd Website
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: dev server listens at `http://127.0.0.1:3000`.

- [ ] **Step 2: Open admin prizes**

Open:

```text
http://127.0.0.1:3000/admin/prizes
```

Manual check:

```text
Create catalog item -> Brand: One Piece -> Sub-category: Single Cards -> save OP09-118-JP.
Add stock units -> choose OP09-118-JP -> condition Raw -> quantity 12 -> add.
Add stock units -> choose OP09-118-JP -> condition Graded -> BGS -> grade 9.5 -> cert 56173456 -> add.
Catalog row shows raw and BGS as separate sub-SKU stock groups.
```

- [ ] **Step 3: Open Random Pack Studio**

Open:

```text
http://127.0.0.1:3000/admin/campaigns
```

Manual check:

```text
Brand: One Piece.
Product type: Single Cards.
Prize item dropdown shows OP09-118-JP and does not show Pokemon cards.
Sub-SKU stock dropdown shows OP09-118-JP-MANGA-RAW and OP09-118-JP-MANGA-BGS95 separately.
Selecting RAW shows Prize type: Raw card.
Selecting BGS95 shows Prize type: BGS 9.5 card.
There is no manual PSA10 card dropdown.
```

- [ ] **Step 4: Save valid draft**

Manual check:

```text
Create pack total slots: 5.
Set 5 prize units using selected One Piece sub-SKUs.
Click save.
Expected: success message and draft appears in admin campaigns.
```

- [ ] **Step 5: Validate shortage behavior**

Manual check:

```text
Select OP09-118-JP-MANGA-BGS95 with quantity 2 when only 1 BGS95 unit exists.
Click save.
Expected: save is blocked with a shortage message naming that sub-SKU/card, not the raw stock bucket.
```

- [ ] **Step 6: Validate brand filter**

Manual check:

```text
Change Brand to Pokemon.
Expected: One Piece prize items disappear from all row dropdowns.
Change Brand back to One Piece.
Expected: One Piece prize items return.
```

- [ ] **Step 7: Run full local verification**

Run:

```bash
cd Website
npm run test:random-pack-prize-selection
npm run test:card-catalog-metadata
npm run verify:random-pack-sub-sku-selection
npm run typecheck
npm run lint
npm run build
```

Expected:

```text
All test scripts pass.
TypeScript exits 0.
ESLint exits 0.
Next build exits 0.
```

- [ ] **Step 8: Commit final fixes**

If smoke testing required small fixes, commit them:

```bash
git add Website Database docs
git commit -m "Verify random pack brand sub-SKU workflow

Constraint: Localhost must prove create catalog, add stock, create pack, and shortage validation work together.
Confidence: high
Scope-risk: narrow
Tested: npm run test:random-pack-prize-selection; npm run test:card-catalog-metadata; npm run verify:random-pack-sub-sku-selection; npm run typecheck; npm run lint; npm run build; localhost admin smoke
Not-tested: Production Supabase migration apply"
```

---

## Final Verification Checklist

- [ ] Brand at top of Random Pack Studio filters every prize item row.
- [ ] Product type is catalog Sub-category: Single Cards, Packs, Boxes, Cases, Sets, Supplies.
- [ ] Manual `PSA10 card` row dropdown is gone.
- [ ] Prize type is read-only and derived from selected sub-SKU.
- [ ] Raw stock cannot be saved as PSA10 metadata.
- [ ] BGS, PSA, CGC, raw, and sealed stock validate as separate buckets.
- [ ] Draft save validates selected sub-SKU availability.
- [ ] Owner review reservation reserves selected sub-SKU stock only.
- [ ] Owner review/lineup displays selected sub-SKU.
- [ ] Localhost create catalog -> add stock -> create pack -> save draft works.
- [ ] Shortage test fails on the selected sub-SKU, not on the main card total.

## Self-Review

Spec coverage:

- Brand filtering is covered by Tasks 1, 2, and 6.
- Product type replacing row Category is covered by Task 2.
- Derived prize type replacing manual PSA10/sealed category is covered by Tasks 1 and 2.
- API/data payload validation is covered by Task 3.
- Owner-review stock reservation is covered by Task 4.
- Admin/owner display is covered by Task 5.
- Localhost full-function testing is covered by Task 6.

Placeholder scan:

- The plan contains no banned placeholder tokens or open-ended implementation instructions.
- Each task has concrete files, commands, expected outcomes, and code snippets.

Type consistency:

- `StockUnitFilter`, `StockSkuGroup`, `stockSkuCode`, `catalogCategory`, and `prizeTypeLabel` are introduced in Task 1 and reused consistently in Tasks 2 through 5.
- `stockUnitFilter` is persisted under `draw_round_prizes.metadata`, so no new column is required for the current schema.
