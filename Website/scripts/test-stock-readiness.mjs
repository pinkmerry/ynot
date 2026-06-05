import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-readiness.ts", import.meta.url),
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
const readiness = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("sub-SKU stock readiness counts the selected stockUnitGroupKey instead of the whole card", () => {
  const shortages = readiness.buildPrizeStockShortages({
    prizes: [
      {
        cardId: "card-roger",
        cardCode: "OP09-118-JP",
        cardName: "GOLD D. ROGER",
        quantity: 5,
        metadata: {
          stockUnitGroupKey: "graded\u001fPSA 10 (Gem Mint)\u001fpsa\u001f\u001f",
          stockSku: "OP09-118-JP-MANGA-PSA10",
          stockLabel: "PSA · PSA 10 (Gem Mint)",
        },
      },
    ],
    stockSummaries: [
      {
        cardId: "card-roger",
        cardCode: "OP09-118-JP",
        cardName: "GOLD D. ROGER",
        stockAvailable: 100,
        stockSkuGroups: [
          {
            key: "raw\u001f\u001f\u001f\u001f",
            sku: "OP09-118-JP-MANGA-RAW",
            label: "Raw",
            availableUnits: 100,
            reservedForCampaign: 0,
          },
          {
            key: "graded\u001fPSA 10 (Gem Mint)\u001fpsa\u001f\u001f",
            sku: "OP09-118-JP-MANGA-PSA10",
            label: "PSA · PSA 10 (Gem Mint)",
            availableUnits: 2,
            reservedForCampaign: 0,
          },
        ],
      },
    ],
  });

  assert.deepEqual(plain(shortages), [
    {
      cardId: "card-roger",
      stockUnitGroupKey: "graded\u001fPSA 10 (Gem Mint)\u001fpsa\u001f\u001f",
      stockSku: "OP09-118-JP-MANGA-PSA10",
      label: "OP09-118-JP - GOLD D. ROGER / PSA · PSA 10 (Gem Mint)",
      requiredUnits: 5,
      availableUnits: 2,
      reservedUnits: 0,
      usableUnits: 2,
      shortageUnits: 3,
    },
  ]);
});

test("bundled prizes multiply only the physical stock units", () => {
  assert.equal(
    readiness.stockUnitsForPrize({
      plannedQuantity: 2,
      bundleQuantity: 3,
      cardId: "card-a",
      stockUnitGroupKey: "card-a::packs",
    }),
    6,
  );
});

test("stock readiness blocks catalog prizes that omit a selected sub-SKU", () => {
  const issues = readiness.buildPrizeStockSelectionIssues({
    prizes: [
      {
        cardId: "card-roger",
        cardCode: "OP09-118-JP",
        cardName: "GOLD D. ROGER",
        quantity: 1,
        metadata: {},
      },
      {
        cardId: "card-hidden",
        quantity: 1,
        metadata: { adminHidden: true },
      },
    ],
    stockSummaries: [
      {
        cardId: "card-roger",
        cardCode: "OP09-118-JP",
        cardName: "GOLD D. ROGER",
        stockAvailable: 12,
        stockSkuGroups: [
          {
            key: "raw\u001f\u001f\u001f\u001f",
            sku: "OP09-118-JP-MANGA-RAW",
            label: "Raw",
            availableUnits: 12,
            reservedForCampaign: 0,
          },
        ],
      },
      {
        cardId: "card-hidden",
        stockAvailable: 99,
        stockSkuGroups: [
          {
            key: "raw\u001f\u001f\u001f\u001f",
            availableUnits: 99,
          },
        ],
      },
    ],
  });

  assert.deepEqual(plain(issues), [
    {
      cardId: "card-roger",
      label: "OP09-118-JP - GOLD D. ROGER",
      availableSubSkuCount: 1,
    },
  ]);
  assert.deepEqual(readiness.stockSelectionBlockers(issues), [
    'Card "OP09-118-JP - GOLD D. ROGER" must select one stock sub-SKU before it can be used in a random pack.',
  ]);
});

test("empty stockUnitFilter does not silently default to raw stock", () => {
  const issues = readiness.buildPrizeStockSelectionIssues({
    prizes: [
      {
        cardId: "card-roger",
        quantity: 1,
        metadata: { stockUnitFilter: {} },
      },
    ],
    stockSummaries: [
      {
        cardId: "card-roger",
        cardCode: "OP09-118-JP",
        stockAvailable: 12,
        stockSkuGroups: [
          {
            key: "raw\u001f\u001f\u001f\u001f",
            availableUnits: 12,
          },
        ],
      },
    ],
  });

  assert.equal(issues.length, 1);
});
