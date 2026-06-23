import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(base, rel), "utf8");

const variantTable = read(
  "../src/features/ynot/admin/prize-catalog/VariantTable.tsx",
);
const ledgerRow = read(
  "../src/features/ynot/admin/prize-catalog/LedgerRow.tsx",
);

test("VariantTable.tsx exists and references stockSkuGroups", () => {
  assert.ok(variantTable.length > 0, "VariantTable.tsx is not empty");
  assert.ok(
    variantTable.includes("stockSkuGroups"),
    "VariantTable must reference stockSkuGroups",
  );
});

test("VariantTable renders grade chip classes from the prototype", () => {
  assert.ok(
    variantTable.includes("pcx-grade-chip"),
    "VariantTable must use pcx-grade-chip class",
  );
  assert.ok(
    variantTable.includes("pcx-vtable"),
    "VariantTable must use pcx-vtable class",
  );
});

test("VariantTable maps stock buckets correctly (reserved->packs, allocated->bags)", () => {
  assert.ok(
    variantTable.includes("reservedUnits"),
    "VariantTable must read reservedUnits for packs column",
  );
  assert.ok(
    variantTable.includes("allocatedUnits"),
    "VariantTable must read allocatedUnits for bags column",
  );
  assert.ok(
    variantTable.includes("archivedUnits"),
    "VariantTable must read archivedUnits for removed column",
  );
});

test("VariantTable shows empty state when no groups exist", () => {
  assert.ok(
    variantTable.includes("No stock yet"),
    "VariantTable must show empty note for zero groups",
  );
});

test("LedgerRow renders VariantTable when open", () => {
  assert.ok(
    ledgerRow.includes("VariantTable"),
    "LedgerRow must import and render VariantTable",
  );
  assert.ok(
    ledgerRow.includes("pcx-lbody"),
    "LedgerRow must render the expanded body container",
  );
  assert.ok(
    ledgerRow.includes("pcx-detail-grid"),
    "LedgerRow must render the detail grid",
  );
});

test("LedgerRow detail grid shows model code and card metadata", () => {
  assert.ok(
    ledgerRow.includes("modelCode"),
    "Detail grid must reference card.modelCode",
  );
  assert.ok(
    ledgerRow.includes("cardNumber"),
    "Detail grid must reference card.cardNumber",
  );
  assert.ok(
    ledgerRow.includes("releaseYear"),
    "Detail grid must reference card.releaseYear",
  );
});

test("LedgerRow preserves existing Edit/Delete header buttons", () => {
  assert.ok(
    ledgerRow.includes("onEdit"),
    "LedgerRow must keep onEdit prop for header Edit button",
  );
  assert.ok(
    ledgerRow.includes("onDelete"),
    "LedgerRow must keep onDelete prop for header Delete button",
  );
});

test("VariantTable clarifies the In bags column meaning", () => {
  assert.ok(
    variantTable.includes("Loaded into live campaigns"),
    "In bags header should carry a clarifying title",
  );
});
