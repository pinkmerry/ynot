import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-sku-usage.ts", import.meta.url),
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
const stockSku = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const rogerCard = {
  catalogCardId: "card-roger",
  code: "OP09-118",
  modelCode: "OP09-118-JP",
  language: "japanese",
  name: "GOLD D. ROGER",
  variant: "Manga",
  stockUnits: [
    {
      id: "raw-available",
      condition: "raw",
      grade: null,
      gradingService: null,
      certNumber: null,
      gemrateId: null,
      imageUrl: null,
      status: "available",
      quantity: 2,
    },
    {
      id: "psa-available",
      condition: "graded",
      grade: "PSA 10 (Gem Mint)",
      gradingService: "psa",
      certNumber: null,
      gemrateId: null,
      imageUrl: null,
      status: "available",
      quantity: 3,
    },
    {
      id: "psa-allocated",
      condition: "graded",
      grade: "PSA 10 (Gem Mint)",
      gradingService: "psa",
      certNumber: null,
      gemrateId: null,
      imageUrl: null,
      status: "allocated",
      quantity: 2,
    },
  ],
};

test("groups stock units by sub-SKU and summarizes pack usage per sub-SKU", () => {
  const groups = stockSku.stockSkuGroups(rogerCard);
  const psaGroup = groups.find((group) => group.sku.endsWith("-PSA10"));
  const rawGroup = groups.find((group) => group.sku.endsWith("-RAW"));

  assert.ok(psaGroup);
  assert.ok(rawGroup);
  assert.equal(psaGroup.sku, "OP09-118-JP-MANGA-PSA10");
  assert.equal(psaGroup.totalUnits, 5);
  assert.equal(psaGroup.availableUnits, 3);
  assert.equal(psaGroup.allocatedUnits, 2);
  assert.deepEqual(plain(stockSku.stockUnitSelectionMetadata(rogerCard, psaGroup.key)), {
    stockUnitGroupKey: psaGroup.key,
    stockSku: "OP09-118-JP-MANGA-PSA10",
    stockLabel: "PSA · PSA 10 (Gem Mint)",
    stockUnitFilter: {
      condition: "graded",
      grade: "PSA 10 (Gem Mint)",
      gradingService: "psa",
      certNumber: "",
      gemrateId: "",
    },
  });

  const usageByGroup = stockSku.stockSkuPackUsageByGroup(groups, [
    {
      id: "rainbow-prize",
      campaignTitle: "ซื้ออะไรอะ",
      displayTier: "rainbow",
      tier: "high",
      rank: 1,
      tierRank: 1,
      plannedQuantity: 2,
      totalUnits: 2,
      availableUnits: 2,
      awardedUnits: 0,
      voidUnits: 0,
      stockUnitUsages: [
        {
          groupKey: psaGroup.key,
          sku: psaGroup.sku,
          label: psaGroup.label,
          totalUnits: 2,
          availableUnits: 2,
          awardedUnits: 0,
          voidUnits: 0,
        },
      ],
    },
    {
      id: "draft-prize",
      campaignTitle: "Draft pack",
      displayTier: "bronze",
      tier: "normal",
      rank: 2,
      tierRank: 1,
      plannedQuantity: 4,
      totalUnits: 4,
      availableUnits: 4,
      awardedUnits: 0,
      voidUnits: 0,
      intendedStockUnitKey: rawGroup.key,
      intendedStockSku: rawGroup.sku,
      intendedStockLabel: rawGroup.label,
    },
  ]);

  assert.deepEqual(
    plain(
    usageByGroup.get(psaGroup.key).map((usage) => ({
      campaignTitle: usage.campaignTitle,
      sku: usage.sku,
      units: usage.units,
      source: usage.source,
    }))),
    [
      {
        campaignTitle: "ซื้ออะไรอะ",
        sku: "OP09-118-JP-MANGA-PSA10",
        units: 2,
        source: "materialized",
      },
    ],
  );
  assert.deepEqual(
    plain(
    usageByGroup.get(rawGroup.key).map((usage) => ({
      campaignTitle: usage.campaignTitle,
      sku: usage.sku,
      units: usage.units,
      source: usage.source,
    }))),
    [
      {
        campaignTitle: "Draft pack",
        sku: "OP09-118-JP-MANGA-RAW",
        units: 4,
        source: "intended",
      },
    ],
  );
});

test("materialized pack usage carries actual stock identity and infers mismatches", () => {
  const groups = stockSku.stockSkuGroups(rogerCard);
  const psaGroup = groups.find((group) => group.sku.endsWith("-PSA10"));
  assert.ok(psaGroup);

  const usageByGroup = stockSku.stockSkuPackUsageByGroup(groups, [
    {
      id: "mismatch-prize",
      cardId: "intended-card",
      campaignTitle: "Identity drift pack",
      displayTier: "rainbow",
      tier: "high",
      rank: 1,
      tierRank: 1,
      plannedQuantity: 1,
      totalUnits: 1,
      availableUnits: 1,
      awardedUnits: 0,
      voidUnits: 0,
      stockUnitUsages: [
        {
          groupKey: psaGroup.key,
          sku: psaGroup.sku,
          label: psaGroup.label,
          actualStockCardId: "actual-card",
          actualStockSkuId: "actual-stock-sku",
          totalUnits: 1,
          availableUnits: 1,
          awardedUnits: 0,
          voidUnits: 0,
        },
      ],
    },
  ]);

  assert.deepEqual(
    plain(
      usageByGroup.get(psaGroup.key).map((usage) => ({
        prizeId: usage.prizeId,
        actualStockCardId: usage.actualStockCardId,
        actualStockSkuId: usage.actualStockSkuId,
        identityMismatch: usage.identityMismatch,
        source: usage.source,
      })),
    ),
    [
      {
        prizeId: "mismatch-prize",
        actualStockCardId: "actual-card",
        actualStockSkuId: "actual-stock-sku",
        identityMismatch: true,
        source: "materialized",
      },
    ],
  );
});

test("builds stock sub-SKU groups from server summary rows without raw unit fan-out", () => {
  const groups = stockSku.stockSkuGroupsFromSummaryRows(rogerCard, [
    {
      cardId: "card-roger",
      sampleUnitId: "summary-raw",
      condition: "raw",
      grade: null,
      gradingService: null,
      certNumber: null,
      gemrateId: null,
      imageUrl: null,
      totalUnits: 29900,
      availableUnits: 29800,
      reservedUnits: 25,
      allocatedUnits: 75,
    },
    {
      cardId: "card-roger",
      sampleUnitId: "summary-bgs",
      condition: "graded",
      grade: "BGS 9.5",
      gradingService: "bgs",
      certNumber: null,
      gemrateId: null,
      imageUrl: null,
      totalUnits: 4,
      availableUnits: 3,
      reservedUnits: 0,
      allocatedUnits: 1,
    },
    {
      cardId: "other-card",
      sampleUnitId: "ignore-other-card",
      condition: "raw",
      totalUnits: 999,
      availableUnits: 999,
      reservedUnits: 0,
      allocatedUnits: 0,
    },
  ]);

  assert.deepEqual(
    plain(
      groups.map((group) => ({
        key: group.key,
        sku: group.sku,
        label: group.label,
        totalUnits: group.totalUnits,
        availableUnits: group.availableUnits,
        reservedUnits: group.reservedUnits,
        allocatedUnits: group.allocatedUnits,
        unitCount: group.units.length,
        sampleUnitId: group.units[0]?.id,
        sampleQuantity: group.units[0]?.quantity,
      })),
    ),
    [
      {
        key: "graded\u001fBGS 9.5\u001fbgs\u001f\u001f",
        sku: "OP09-118-JP-MANGA-BGS95",
        label: "BGS · BGS 9.5",
        totalUnits: 4,
        availableUnits: 3,
        reservedUnits: 0,
        allocatedUnits: 1,
        unitCount: 1,
        sampleUnitId: "summary-bgs",
        sampleQuantity: 4,
      },
      {
        key: "raw\u001f\u001f\u001f\u001f",
        sku: "OP09-118-JP-MANGA-RAW",
        label: "Raw",
        totalUnits: 29900,
        availableUnits: 29800,
        reservedUnits: 25,
        allocatedUnits: 75,
        unitCount: 1,
        sampleUnitId: "summary-raw",
        sampleQuantity: 29900,
      },
    ],
  );
});

test("builds first-class pack and box groups from stock SKU summary rows", () => {
  const groups = stockSku.stockSkuGroupsFromSummaryRows(rogerCard, [
    {
      cardId: "card-roger",
      stockSkuId: "op16-box",
      stockUnitGroupKey: "stock-sku:op16-box",
      sku: "OP16-JP-BOX",
      label: "OP16 Booster Box",
      unitKind: "box",
      imageUrl: "/box.png",
      totalUnits: 3,
      availableUnits: 2,
      reservedUnits: 0,
      allocatedUnits: 0,
      archivedUnits: 1,
      packEquivalent: 72,
      availablePackEquivalent: 48,
      legacyStockUnitGroupKey: "sealed\u001f\u001f\u001f\u001f",
      childStockSkuId: "op16-pack",
      childSku: "OP16-JP-PACK",
      childLabel: "OP16 Booster Pack",
      childQuantity: 24,
    },
    {
      cardId: "card-roger",
      stockSkuId: "op16-pack",
      stockUnitGroupKey: "stock-sku:op16-pack",
      sku: "OP16-JP-PACK",
      label: "OP16 Booster Pack",
      unitKind: "pack",
      imageUrl: null,
      sampleUnitImageUrl: "/pack-unit.png",
      totalUnits: 0,
      availableUnits: 0,
      reservedUnits: 0,
      allocatedUnits: 0,
      packEquivalent: 0,
      availablePackEquivalent: 0,
      legacyStockUnitGroupKey: "sealed\u001f\u001f\u001f\u001f",
    },
    {
      cardId: "card-roger",
      stockSkuId: null,
      sourceStockSkuId: "op16-pack",
      stockUnitGroupKey: "sealed\u001f\u001f\u001f\u001f",
      legacyStockUnitGroupKey: true,
      sku: "OP16-JP-PACK",
      label: "Sealed",
      unitKind: "pack",
      totalUnits: 24,
      availableUnits: 24,
      reservedUnits: 0,
      allocatedUnits: 0,
      availablePackEquivalent: 24,
    },
  ]);

  const box = groups.find((group) => group.stockSkuId === "op16-box");
  const pack = groups.find((group) => group.stockSkuId === "op16-pack");
  assert.ok(box);
  assert.ok(pack);
  assert.equal(groups.length, 2);
  assert.equal(
    groups.reduce((sum, group) => sum + (group.availablePackEquivalent ?? 0), 0),
    48,
  );
  assert.equal(box.key, "stock-sku:op16-box");
  assert.equal(box.sku, "OP16-JP-BOX");
  assert.equal(box.unitKind, "box");
  assert.equal(box.totalUnits, 2);
  assert.equal(box.packEquivalent, 48);
  assert.equal(box.availablePackEquivalent, 48);
  assert.equal(box.childStockSkuId, "op16-pack");
  assert.equal(box.childQuantity, 24);
  assert.equal(pack.totalUnits, 0);
  assert.equal(pack.key, "stock-sku:op16-pack");
  assert.equal(pack.imageUrl, "/pack-unit.png");
  assert.equal(stockSku.preferredPrizeStockSkuGroup(groups), pack);
  assert.equal(stockSku.findStockSkuGroupByKey(groups, "sealed\u001f\u001f\u001f\u001f"), pack);
  assert.deepEqual(plain(stockSku.stockUnitSelectionMetadata({
    ...rogerCard,
    stockSkuGroups: groups,
  }, box.key)), {
    stockUnitGroupKey: "stock-sku:op16-box",
    stockSkuId: "op16-box",
    stockSku: "OP16-JP-BOX",
    stockLabel: "OP16 Booster Box",
    stockUnitFilter: {
      condition: "sealed",
      grade: "",
      gradingService: "",
      certNumber: "",
      gemrateId: "",
    },
  });
  assert.deepEqual(plain(stockSku.stockUnitSelectionMetadata({
    ...rogerCard,
    stockSkuGroups: groups,
  }, "sealed\u001f\u001f\u001f\u001f")), {
    stockUnitGroupKey: "stock-sku:op16-pack",
    stockSkuId: "op16-pack",
    stockSku: "OP16-JP-PACK",
    stockLabel: "OP16 Booster Pack",
    stockUnitFilter: {
      condition: "sealed",
      grade: "",
      gradingService: "",
      certNumber: "",
      gemrateId: "",
    },
  });
  const usageByGroup = stockSku.stockSkuPackUsageByGroup(groups, [
    {
      id: "legacy-draft-prize",
      campaignTitle: "Legacy draft pack",
      displayTier: "bronze",
      tier: "normal",
      rank: 1,
      tierRank: 1,
      plannedQuantity: 3,
      totalUnits: 3,
      availableUnits: 3,
      awardedUnits: 0,
      voidUnits: 0,
      intendedStockUnitKey: "sealed\u001f\u001f\u001f\u001f",
      intendedStockSku: "OLD-SEALED",
      intendedStockLabel: "Old sealed",
    },
  ]);
  assert.equal(usageByGroup.get("stock-sku:op16-pack")[0].units, 3);
});

test("preserves migrated graded identity on first-class stock SKU rows", () => {
  const groups = stockSku.stockSkuGroupsFromSummaryRows(rogerCard, [
    {
      cardId: "card-roger",
      stockSkuId: "psa10-sku",
      stockUnitGroupKey: "stock-sku:psa10-sku",
      legacyStockUnitGroupKey: "graded\u001fPSA 10\u001fpsa\u001f12345678\u001f",
      sku: "OP09-118-JP-PSA10",
      label: "PSA 10 #12345678",
      unitKind: "card",
      totalUnits: 1,
      availableUnits: 1,
      reservedUnits: 0,
      allocatedUnits: 0,
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].identityKnown, true);
  assert.deepEqual(plain(groups[0].units[0]), {
    id: "stock-sku:psa10-sku",
    stockSkuId: "psa10-sku",
    stockUnitGroupKey: "stock-sku:psa10-sku",
    unitKind: "card",
    condition: "graded",
    grade: "PSA 10",
    gradingService: "psa",
    certNumber: "12345678",
    gemrateId: null,
    imageUrl: null,
    imageStoragePath: null,
    status: "summary",
    quantity: 1,
  });
  assert.deepEqual(plain(stockSku.stockUnitSelectionMetadata({
    ...rogerCard,
    stockSkuGroups: groups,
  }, "stock-sku:psa10-sku")?.stockUnitFilter), {
    condition: "graded",
    grade: "PSA 10",
    gradingService: "psa",
    certNumber: "12345678",
    gemrateId: "",
  });
});

test("marks empty first-class card SKUs without saved identity as unknown", () => {
  const groups = stockSku.stockSkuGroupsFromSummaryRows(rogerCard, [
    {
      cardId: "card-roger",
      stockSkuId: "empty-card-sku",
      stockUnitGroupKey: "stock-sku:empty-card-sku",
      sku: "OP09-118-JP-MANUAL",
      label: "Manual card Sub SKU",
      unitKind: "card",
      totalUnits: 0,
      availableUnits: 0,
      reservedUnits: 0,
      allocatedUnits: 0,
    },
    {
      cardId: "card-roger",
      stockSkuId: "empty-graded-sku",
      stockUnitGroupKey: "stock-sku:empty-graded-sku",
      sku: "OP09-118-JP-PSA10",
      label: "PSA 10 #87654321",
      unitKind: "card",
      condition: "graded",
      grade: "PSA 10",
      gradingService: "psa",
      certNumber: "87654321",
      totalUnits: 0,
      availableUnits: 0,
      reservedUnits: 0,
      allocatedUnits: 0,
    },
  ]);

  const unknown = groups.find((group) => group.stockSkuId === "empty-card-sku");
  const graded = groups.find((group) => group.stockSkuId === "empty-graded-sku");
  assert.ok(unknown);
  assert.ok(graded);
  assert.equal(unknown.identityKnown, false);
  assert.equal(unknown.units[0].condition, "raw");
  assert.equal(graded.identityKnown, true);
  assert.equal(graded.units[0].condition, "graded");
  assert.equal(graded.units[0].certNumber, "87654321");
});

test("prefers pack or non-box groups for new prize stock defaults", () => {
  const pack = {
    key: "stock-sku:pack",
    sku: "OP16-JP-PACK",
    label: "Pack",
    unitKind: "pack",
    totalUnits: 0,
    availableUnits: 0,
    reservedUnits: 0,
    allocatedUnits: 0,
    units: [],
  };
  const box = {
    key: "stock-sku:box",
    sku: "OP16-JP-BOX",
    label: "Box",
    unitKind: "box",
    totalUnits: 2,
    availableUnits: 2,
    reservedUnits: 0,
    allocatedUnits: 0,
    units: [],
  };
  const card = {
    key: "stock-sku:card",
    sku: "OP09-118-JP-RAW",
    label: "Raw",
    unitKind: "card",
    totalUnits: 1,
    availableUnits: 1,
    reservedUnits: 0,
    allocatedUnits: 0,
    units: [],
  };

  assert.equal(stockSku.preferredPrizeStockSkuGroup([box, pack]), pack);
  assert.equal(stockSku.preferredPrizeStockSkuGroup([box, card]), card);
  assert.equal(stockSku.preferredPrizeStockSkuGroup([box]), box);
});

test("raw and sealed sub-SKUs ignore legacy Ungraded grade metadata", () => {
  const groups = stockSku.stockSkuGroups({
    ...rogerCard,
    stockUnits: [
      {
        id: "raw-legacy",
        condition: "raw",
        grade: "Ungraded",
        gradingService: null,
        certNumber: null,
        gemrateId: null,
        imageUrl: null,
        status: "available",
        quantity: 5,
      },
      {
        id: "raw-new",
        condition: "raw",
        grade: null,
        gradingService: null,
        certNumber: null,
        gemrateId: null,
        imageUrl: null,
        status: "available",
        quantity: 7,
      },
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "raw\u001f\u001f\u001f\u001f");
  assert.equal(groups[0].sku, "OP09-118-JP-MANGA-RAW");
  assert.equal(groups[0].availableUnits, 12);
  assert.deepEqual(plain(stockSku.stockUnitSelectionMetadata({
    ...rogerCard,
    stockUnits: groups[0].units,
  }, groups[0].key)?.stockUnitFilter), {
    condition: "raw",
    grade: "",
    gradingService: "",
    certNumber: "",
    gemrateId: "",
  });
});
