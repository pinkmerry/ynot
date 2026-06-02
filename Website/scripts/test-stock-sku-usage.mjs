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
