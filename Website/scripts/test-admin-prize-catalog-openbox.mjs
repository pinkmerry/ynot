import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(base, rel), "utf8");

const openBox = read(
  "../src/features/ynot/admin/prize-catalog/OpenBoxModal.tsx",
);
const ledgerRow = read(
  "../src/features/ynot/admin/prize-catalog/LedgerRow.tsx",
);

// ---- OpenBoxModal wiring tests ----

test("OpenBoxModal calls openStockContainer with parentStockSkuId", () => {
  assert.ok(
    openBox.includes("openStockContainer"),
    "OpenBoxModal must call the openStockContainer API",
  );
  assert.ok(
    openBox.includes("parentStockSkuId"),
    "OpenBoxModal must pass parentStockSkuId to the route",
  );
});

test("OpenBoxModal surfaces friendly conversion_rule_required error", () => {
  assert.ok(
    openBox.includes("conversion_rule_required"),
    "OpenBoxModal must handle conversion_rule_required error code",
  );
  assert.ok(
    openBox.includes("Set which pack this box contains"),
    "OpenBoxModal must show user-friendly message for missing conversion rule",
  );
});

test("No-conversion-rule path calls upsertStockSku with childStockSkuId + childQuantity", () => {
  assert.ok(
    openBox.includes("upsertStockSku"),
    "OpenBoxModal must call upsertStockSku for setting conversion rules",
  );
  assert.ok(
    openBox.includes("childStockSkuId"),
    "upsertStockSku call must include childStockSkuId",
  );
  assert.ok(
    openBox.includes("childQuantity"),
    "upsertStockSku call must include childQuantity",
  );
});

test("Preview math uses childQuantity for packs-per-box calculation", () => {
  // The component must calculate packsGained = quantity * packsPerBox
  assert.ok(
    openBox.includes("packsPerBox"),
    "OpenBoxModal must track packsPerBox from childQuantity",
  );
  assert.ok(
    openBox.includes("packsGained"),
    "OpenBoxModal must compute packsGained for preview",
  );
  // potentialPacks = availableBoxes * packsPerBox + loosePacks
  assert.ok(
    openBox.includes("potentialPacks"),
    "OpenBoxModal must compute potentialPacks preview",
  );
});

test("OpenBoxModal imports only from catalog-api (no raw fetch)", () => {
  assert.ok(
    openBox.includes('from "./catalog-api"'),
    "OpenBoxModal must import from catalog-api.ts",
  );
  assert.ok(
    !openBox.includes("window.fetch") && !openBox.includes("globalThis.fetch"),
    "OpenBoxModal must not use raw fetch — all network goes through catalog-api",
  );
});

test("OpenBoxModal has proper dialog a11y (role, aria-modal, Escape)", () => {
  assert.ok(
    openBox.includes('role="dialog"'),
    "OpenBoxModal must have role=dialog",
  );
  assert.ok(
    openBox.includes("aria-modal"),
    "OpenBoxModal must have aria-modal attribute",
  );
  assert.ok(
    openBox.includes('"Escape"'),
    "OpenBoxModal must close on Escape key",
  );
});

test("OpenBoxModal filters pack groups from same card for conversion rule", () => {
  // The conversion-rule setter must only show pack Sub-SKUs from the same card
  assert.ok(
    openBox.includes("allGroups"),
    "OpenBoxModal must receive allGroups to filter pack Sub-SKUs",
  );
  assert.ok(
    openBox.includes('"pack"'),
    "OpenBoxModal must filter groups by unitKind === 'pack'",
  );
});

test("OpenBoxModal shows guidance when no pack Sub-SKU exists", () => {
  assert.ok(
    openBox.includes("Add a sealed-pack Sub-SKU to this product first"),
    "OpenBoxModal must guide admin when no pack groups exist on the card",
  );
});

// ---- LedgerRow box panel tests ----

test("LedgerRow renders box panel only for unitKind === 'box' groups", () => {
  assert.ok(
    ledgerRow.includes("BoxPanel"),
    "LedgerRow must render BoxPanel component",
  );
  assert.ok(
    ledgerRow.includes("pcx-box-panel"),
    "LedgerRow BoxPanel must use pcx-box-panel class",
  );
  // BoxPanel filters by unitKind
  assert.ok(
    ledgerRow.includes('"box"'),
    "BoxPanel must filter groups by unitKind === 'box'",
  );
});

test("LedgerRow box panel shows sealed boxes and potential packs preview", () => {
  assert.ok(
    ledgerRow.includes("sealed boxes"),
    "Box panel must display sealed box count",
  );
  assert.ok(
    ledgerRow.includes("potential packs if all opened"),
    "Box panel must show potential-packs-if-all-opened preview",
  );
});

test("LedgerRow has 'Open boxes' button that triggers onOpenBox", () => {
  assert.ok(
    ledgerRow.includes("onOpenBox"),
    "LedgerRow must accept onOpenBox prop",
  );
  assert.ok(
    ledgerRow.includes("Open boxes"),
    "LedgerRow must render 'Open boxes' button text",
  );
});

test("LedgerRow box panel shows no-rule warning when conversion rule missing", () => {
  assert.ok(
    ledgerRow.includes("No conversion rule set"),
    "Box panel must warn when no childStockSkuId is configured",
  );
});
