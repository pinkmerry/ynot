import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function transpile(relativePath) {
  const source = readText(relativePath);
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const bundleModule = { exports: {} };
vm.runInNewContext(transpile("../src/features/ynot/bundle-quantity.ts"), {
  exports: bundleModule.exports,
  module: bundleModule,
  require,
});

const cjsModule = { exports: {} };
const testRequire = (specifier) => {
  if (specifier === "./bundle-quantity") return bundleModule.exports;
  return require(specifier);
};
vm.runInNewContext(transpile("../src/features/ynot/stock-readiness.ts"), {
  exports: cjsModule.exports,
  module: cjsModule,
  require: testRequire,
});
const readiness = cjsModule.exports;

const readinessSource = readText("../src/features/ynot/stock-readiness.ts");
const prizeReadinessSource = readText("../src/features/ynot/prize-readiness.ts");

const prizeModule = { exports: {} };
const prizeRequire = (specifier) => {
  if (specifier === "server-only") return {};
  if (specifier === "./bundle-quantity") return bundleModule.exports;
  if (specifier === "./stock-readiness") return readiness;
  if (specifier === "./prize-tier") {
    return {
      prizeDisplayTierOptions: [
        { value: "rainbow" },
        { value: "gold" },
        { value: "silver" },
        { value: "bronze" },
      ],
      prizeDisplayTierValue(value) {
        if (
          value === "rainbow" ||
          value === "gold" ||
          value === "silver" ||
          value === "bronze"
        ) {
          return value;
        }
        return "bronze";
      },
    };
  }
  if (specifier === "./prize-unit-counts") {
    return { aggregateNonVoidPrizeUnitCounts: () => new Map() };
  }
  if (
    specifier === "@/lib/supabase/server" ||
    specifier === "@/lib/supabase/schema-compat" ||
    specifier === "@/lib/supabase/types"
  ) {
    return {};
  }
  return require(specifier);
};
vm.runInNewContext(transpile("../src/features/ynot/prize-readiness.ts"), {
  exports: prizeModule.exports,
  module: prizeModule,
  require: prizeRequire,
});
const prizeReadiness = prizeModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("stock readiness uses the shared bundle quantity helpers", () => {
  assert.match(readinessSource, /from "\.\/bundle-quantity"/);
  assert.doesNotMatch(
    readinessSource,
    /function normalizeBundleQuantity\(/,
  );
  assert.doesNotMatch(
    readinessSource,
    /function plannedQuantityForPrize\(/,
  );
  assert.doesNotMatch(
    readinessSource,
    /function bundledStockUnitRequirement\(/,
  );
});

test("campaign readiness preserves zero remaining slots for final open", () => {
  assert.match(
    prizeReadinessSource,
    /remainingSlots:\s*optionalNumber\(item\.remainingSlots\)/,
    "readiness must treat remainingSlots: 0 as sold out, not unknown",
  );
  assert.doesNotMatch(
    prizeReadinessSource,
    /remainingSlots:\s*numberOrZero\(item\.remainingSlots\)\s*\|\|\s*undefined/,
  );
});

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
      plannedUnits: 5,
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

test("normalized prize drafts preserve bundle quantity for stock validation", () => {
  const prizes = prizeReadiness.normalizePrizeDrafts([
    {
      cardId: "card-a",
      tier: "normal",
      rank: 1,
      quantity: 2,
      bundleQuantity: 3,
      weight: 1,
      unlockAtSoldPct: 0,
      convertCoinValue: 100,
      metadata: {},
    },
  ]);

  assert.equal(prizes.length, 1);
  assert.equal(prizes[0].quantity, 2);
  assert.equal(prizes[0].bundleQuantity, 3);

  const result = prizeReadiness.validatePrizeDraftsForSave(
    prizes,
    2,
    "pure_random",
    {
      stockSummaries: [
        {
          cardId: "card-a",
          cardCode: "CARD-A",
          cardName: "Bundle Test",
          stockAvailable: 5,
          reservedForCampaign: 0,
        },
      ],
    },
  );

  assert.equal(result.ready, false);
  assert.equal(result.totalPrizeUnits, 2);
  assert.match(result.blockers.join("\n"), /needs 6 stock units/);
  assert.match(result.blockers.join("\n"), /2 win slots x 3 per win/);
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
