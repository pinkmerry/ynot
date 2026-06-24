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
const variantGuards = read(
  "../src/features/ynot/admin/prize-catalog/variant-guards.ts",
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
  // Verify the preference in the handleSave body: stockSkuId ternary comes first
  const handleSaveBody = editModal.substring(editModal.indexOf("handleSave"));
  const skuIdIdx = handleSaveBody.indexOf("group.stockSkuId");
  const groupKeyIdx = handleSaveBody.indexOf("stockUnitGroupKey: group.key");
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

test("Campaign-loaded guard lives in shared variant-guards module with correct field checks", () => {
  // The guard function must live in variant-guards.ts
  assert.ok(
    variantGuards.includes("isVariantLoadedInCampaign"),
    "variant-guards must export isVariantLoadedInCampaign",
  );
  assert.ok(
    variantGuards.includes("intendedStockSku"),
    "Campaign guard must check intendedStockSku",
  );
  assert.ok(
    variantGuards.includes("intendedStockUnitKey"),
    "Campaign guard must check intendedStockUnitKey",
  );
  assert.ok(
    variantGuards.includes("stockUnitUsages"),
    "Campaign guard must check stockUnitUsages",
  );
  assert.ok(
    variantGuards.includes("actualStockSkuId"),
    "Campaign guard must check actualStockSkuId",
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

// ---- FIX 1: Single file picker for variant images ----

test("VariantActions has no local file input — only the parent screen has the picker", () => {
  // VariantActions must NOT contain its own <input type="file"> or file ref
  const fileInputMatches = variantTable.match(/type="file"/g) ?? [];
  assert.equal(
    fileInputMatches.length,
    0,
    "VariantTable must have zero type=\"file\" inputs (parent owns the picker)",
  );
  // Camera button should call onUploadImage directly, not a local handler
  assert.ok(
    variantTable.includes("actions.onUploadImage?.(group)") ||
    variantTable.includes("actions?.onUploadImage?.(group)"),
    "Camera button must call onUploadImage(group) directly without a local file input",
  );
  // No local uploading state
  assert.ok(
    !variantTable.includes("setUploading"),
    "VariantActions must not have local uploading state",
  );
});

// ---- FIX 2: Campaign guard on quick-remove ----

test("isVariantLoadedInCampaign is imported from variant-guards in both EditVariantModal and PrizeCatalogScreen (DRY)", () => {
  const importPattern = 'from "./variant-guards"';
  assert.ok(
    editModal.includes(importPattern),
    "EditVariantModal must import from variant-guards",
  );
  assert.ok(
    screen.includes(importPattern),
    "PrizeCatalogScreen must import from variant-guards",
  );
  // The function must NOT be defined locally in either file
  const localDefPattern = "function isVariantLoadedInCampaign";
  assert.ok(
    !editModal.includes(localDefPattern),
    "EditVariantModal must not define isVariantLoadedInCampaign locally",
  );
  assert.ok(
    !screen.includes(localDefPattern),
    "PrizeCatalogScreen must not define isVariantLoadedInCampaign locally",
  );
});

test("EditVariantModal uses pcx form design system classes (no dead pcx-ev- classes)", () => {
  assert.ok(
    editModal.includes("pcx-field"),
    "EditVariantModal must use pcx-field class for field wrappers",
  );
  assert.ok(
    editModal.includes("pcx-input"),
    "EditVariantModal must use pcx-input class for inputs",
  );
  assert.ok(
    !editModal.includes("pcx-ev-"),
    "EditVariantModal must not contain any dead pcx-ev- classes",
  );
});

test("handleVariantQuickRemove checks campaign guard before adjustCardStock", () => {
  const quickRemoveSection = screen.substring(
    screen.indexOf("handleVariantQuickRemove"),
  );
  const guardIdx = quickRemoveSection.indexOf("isVariantLoadedInCampaign");
  const adjustIdx = quickRemoveSection.indexOf("adjustCardStock");
  assert.ok(
    guardIdx !== -1,
    "handleVariantQuickRemove must call isVariantLoadedInCampaign",
  );
  assert.ok(
    adjustIdx !== -1,
    "handleVariantQuickRemove must call adjustCardStock",
  );
  assert.ok(
    guardIdx < adjustIdx,
    "Campaign guard must be checked BEFORE adjustCardStock is called",
  );
});

// ---- Card language display ----

test("LedgerRow shows the card language next to the name", () => {
  assert.ok(
    ledgerRow.includes("row.card.language"),
    "LedgerRow must read row.card.language for display",
  );
  assert.ok(
    ledgerRow.includes("pcx-lang-chip"),
    "LedgerRow must render a language chip",
  );
});

// ---- Language-aware variant grouping ----

const stockSkuUsage = read("../src/features/ynot/stock-sku-usage.ts");
test("stockUnitGroupKey + label are language-aware", () => {
  const keyFn = stockSkuUsage.slice(stockSkuUsage.indexOf("function stockUnitGroupKey"));
  assert.ok(keyFn.includes("language"), "stockUnitGroupKey must include language");
  assert.ok(stockSkuUsage.includes("languageShort"), "label helper maps language to EN/JP/KR/CN");
  assert.ok(stockSkuUsage.includes('"korean"') || stockSkuUsage.includes("'korean'"), "Korean supported");
});
