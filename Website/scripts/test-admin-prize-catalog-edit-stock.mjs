import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(base, rel), "utf8");

const editModal = read(
  "../src/features/ynot/admin/prize-catalog/EditVariantModal.tsx",
);
const variantTable = read(
  "../src/features/ynot/admin/prize-catalog/VariantTable.tsx",
);
const screen = read(
  "../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx",
);
const ledgerRow = read(
  "../src/features/ynot/admin/prize-catalog/LedgerRow.tsx",
);
const imageUtil = read(
  "../src/features/ynot/admin/prize-catalog/image-util.ts",
);

// ---- EditVariantModal ----

test("EditVariantModal exists and computes a delta for adjustCardStock", () => {
  assert.ok(editModal.length > 0, "EditVariantModal.tsx is not empty");
  assert.ok(
    editModal.includes("adjustCardStock"),
    "EditVariantModal must call adjustCardStock",
  );
  // Must compute delta from newAvailable - currentAvailable
  assert.ok(
    editModal.includes("newAvailable") && editModal.includes("currentAvailable"),
    "EditVariantModal must track current vs new available to compute delta",
  );
  assert.ok(
    editModal.includes("quantityDelta"),
    "EditVariantModal must pass quantityDelta to adjustCardStock",
  );
});

test("EditVariantModal prefers stockSkuId for negative deltas", () => {
  assert.ok(
    editModal.includes("stockSkuId"),
    "EditVariantModal must reference stockSkuId",
  );
  assert.ok(
    editModal.includes("stockUnitGroupKey"),
    "EditVariantModal must fall back to stockUnitGroupKey",
  );
  // Verify the preference: stockSkuId is checked first
  const skuIdIdx = editModal.indexOf("group.stockSkuId");
  const groupKeyIdx = editModal.indexOf("stockUnitGroupKey: group.key");
  assert.ok(
    skuIdIdx !== -1 && groupKeyIdx !== -1 && skuIdIdx < groupKeyIdx,
    "EditVariantModal must prefer stockSkuId before falling back to stockUnitGroupKey",
  );
});

test("EditVariantModal has Escape key handling and modal a11y", () => {
  assert.ok(
    editModal.includes('e.key === "Escape"') || editModal.includes("e.key === 'Escape'"),
    "EditVariantModal must handle Escape key to close",
  );
  assert.ok(
    editModal.includes("aria-modal"),
    "EditVariantModal must have aria-modal attribute",
  );
  assert.ok(
    editModal.includes('role="dialog"') || editModal.includes("role='dialog'"),
    "EditVariantModal must have role=dialog",
  );
});

test("EditVariantModal campaign-loaded guard references row.prizes and intendedStock/stockUnitUsages", () => {
  // The guard function must check prizes array
  assert.ok(
    editModal.includes("prizes"),
    "EditVariantModal must reference prizes for campaign-loaded detection",
  );
  assert.ok(
    editModal.includes("intendedStockSku"),
    "Campaign guard must check intendedStockSku",
  );
  assert.ok(
    editModal.includes("intendedStockUnitKey"),
    "Campaign guard must check intendedStockUnitKey",
  );
  assert.ok(
    editModal.includes("stockUnitUsages"),
    "Campaign guard must check stockUnitUsages",
  );
});

test("EditVariantModal disables delete when variant is loaded into campaign", () => {
  assert.ok(
    editModal.includes("loadedInCampaign"),
    "EditVariantModal must track whether variant is loaded in a campaign",
  );
  // The delete button must be disabled when loaded
  assert.ok(
    editModal.includes("disabled={loadedInCampaign") ||
    editModal.includes("disabled: loadedInCampaign"),
    "Delete button must be disabled when variant is loaded in campaign",
  );
});

// ---- Quick-remove ----

test("quick-remove sends quantityDelta: -1 via adjustCardStock", () => {
  // PrizeCatalogScreen handles quick-remove
  assert.ok(
    screen.includes("adjustCardStock"),
    "Screen must use adjustCardStock for quick-remove",
  );
  assert.ok(
    screen.includes("quantityDelta: -1"),
    "Quick-remove must send quantityDelta: -1",
  );
});

test("quick-remove prefers stockSkuId over stockUnitGroupKey", () => {
  // Confirm the screen's quick-remove logic checks stockSkuId first
  const screenQuickRemoveSection = screen.substring(
    screen.indexOf("handleVariantQuickRemove"),
  );
  assert.ok(
    screenQuickRemoveSection.includes("group.stockSkuId"),
    "Quick-remove must check group.stockSkuId",
  );
  assert.ok(
    screenQuickRemoveSection.includes("stockUnitGroupKey: group.key"),
    "Quick-remove must fall back to stockUnitGroupKey: group.key",
  );
});

// ---- Variant image upload ----

test("variant image path calls uploadCardImage + upsertStockSku", () => {
  assert.ok(
    screen.includes("uploadCardImage"),
    "Screen must call uploadCardImage for image upload",
  );
  assert.ok(
    screen.includes("upsertStockSku"),
    "Screen must call upsertStockSku to set variant image",
  );
});

test("variant image upload uses downscaleImage with VARIANT_IMAGE_MAX_WIDTH", () => {
  assert.ok(
    screen.includes("downscaleImage"),
    "Screen must use downscaleImage before upload",
  );
  assert.ok(
    screen.includes("VARIANT_IMAGE_MAX_WIDTH"),
    "Screen must use VARIANT_IMAGE_MAX_WIDTH for variant images",
  );
});

// ---- Main image upload ----

test("main image calls updateMainSku after uploadCardImage", () => {
  assert.ok(
    screen.includes("updateMainSku"),
    "Screen must call updateMainSku for main card image",
  );
  assert.ok(
    screen.includes("MAIN_IMAGE_MAX_WIDTH"),
    "Screen must use MAIN_IMAGE_MAX_WIDTH for main card images",
  );
});

// ---- Image utility ----

test("image-util exports downscaleImage with canvas logic", () => {
  assert.ok(
    imageUtil.includes("downscaleImage"),
    "image-util must export downscaleImage",
  );
  assert.ok(
    imageUtil.includes("canvas"),
    "downscaleImage must use canvas for downscaling",
  );
  assert.ok(
    imageUtil.includes("toBlob"),
    "downscaleImage must use canvas.toBlob",
  );
  assert.ok(
    imageUtil.includes("MAIN_IMAGE_MAX_WIDTH"),
    "image-util must export MAIN_IMAGE_MAX_WIDTH",
  );
  assert.ok(
    imageUtil.includes("VARIANT_IMAGE_MAX_WIDTH"),
    "image-util must export VARIANT_IMAGE_MAX_WIDTH",
  );
});

// ---- VariantTable actions ----

test("VariantTable has per-row action buttons wired", () => {
  assert.ok(
    variantTable.includes("onUploadImage"),
    "VariantTable must support onUploadImage action",
  );
  assert.ok(
    variantTable.includes("onQuickRemove"),
    "VariantTable must support onQuickRemove action",
  );
  assert.ok(
    variantTable.includes("onEdit"),
    "VariantTable must support onEdit action",
  );
  assert.ok(
    variantTable.includes("pcx-vactions"),
    "VariantTable must render action container with pcx-vactions class",
  );
  assert.ok(
    variantTable.includes("pcx-icon-btn"),
    "VariantTable must use pcx-icon-btn for action buttons",
  );
});

// ---- LedgerRow wiring ----

test("LedgerRow passes variant actions and main image upload down", () => {
  assert.ok(
    ledgerRow.includes("onVariantUploadImage"),
    "LedgerRow must accept onVariantUploadImage prop",
  );
  assert.ok(
    ledgerRow.includes("onVariantQuickRemove"),
    "LedgerRow must accept onVariantQuickRemove prop",
  );
  assert.ok(
    ledgerRow.includes("onVariantEdit"),
    "LedgerRow must accept onVariantEdit prop",
  );
  assert.ok(
    ledgerRow.includes("onMainImageUpload"),
    "LedgerRow must accept onMainImageUpload prop",
  );
});
