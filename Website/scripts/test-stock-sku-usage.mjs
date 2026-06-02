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
