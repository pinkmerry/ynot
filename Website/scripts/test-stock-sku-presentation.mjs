import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-sku-presentation.ts", import.meta.url),
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
const presentation = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const boxGroup = {
  key: "stock-sku:box",
  sku: "OP16-JP-BOX-SEALED",
  label: "Sealed Japanese Box",
  unitKind: "box",
  totalUnits: 105,
  availableUnits: 0,
  reservedUnits: 0,
  allocatedUnits: 105,
  childSku: "OP16-JP-PACK-LOOSE",
  childQuantity: 24,
  units: [],
};

const packGroup = {
  key: "stock-sku:pack",
  sku: "OP16-JP-PACK-LOOSE",
  label: "Loose Japanese Pack",
  unitKind: "pack",
  totalUnits: 214,
  availableUnits: 1,
  reservedUnits: 0,
  allocatedUnits: 213,
  units: [],
};

const cardGroup = {
  key: "stock-sku:card",
  sku: "OP01-070-PSA10-CERT123",
  label: "PSA 10 #CERT123",
  unitKind: "card",
  totalUnits: 1,
  availableUnits: 0,
  reservedUnits: 0,
  allocatedUnits: 1,
  units: [],
};

test("maps Main SKU category names to presentation types", () => {
  assert.equal(presentation.mainSkuCategoryType("Single Cards"), "card");
  assert.equal(presentation.mainSkuCategoryType("Booster Boxes"), "box");
  assert.equal(presentation.mainSkuCategoryType("Packs"), "pack");
  assert.equal(presentation.mainSkuCategoryType("Accessories"), "other");
});

test("returns Main SKU action labels", () => {
  assert.deepEqual(plain(presentation.mainSkuActionLabels("Booster Boxes")), {
    create: "Create Main SKU",
    edit: "Edit Main SKU",
    delete: "Delete Main SKU",
    addStock: "Add Sub-SKU stock",
    addSubSku: "Create Sub-SKU",
    stockSummary: "Main SKU stock",
    randomPackStock: "Random pack stock",
    randomPackAssignments: "Random pack assignments",
  });
});

test("summarizes Main SKU stock across box and pack Sub-SKUs", () => {
  assert.deepEqual(plain(presentation.mainSkuStockSummary([boxGroup, packGroup])), {
    totalUnits: 319,
    availableUnits: 1,
    boxes: {
      totalUnits: 105,
      availableUnits: 0,
    },
    packs: {
      totalUnits: 214,
      availableUnits: 1,
    },
    cards: {
      totalUnits: 0,
      availableUnits: 0,
    },
    others: {
      totalUnits: 0,
      availableUnits: 0,
    },
    packEquivalentFromBoxes: 2520,
    totalPossiblePacks: 2734,
    headline: "0 boxes left · 1 pack left",
  });
});

test("summarizes card-only Main SKU stock with a card headline", () => {
  assert.deepEqual(
    plain(
      presentation.mainSkuStockSummary([
        { ...cardGroup, totalUnits: 3, availableUnits: 2 },
      ]),
    ),
    {
      totalUnits: 3,
      availableUnits: 2,
      boxes: {
        totalUnits: 0,
        availableUnits: 0,
      },
      packs: {
        totalUnits: 0,
        availableUnits: 0,
      },
      cards: {
        totalUnits: 3,
        availableUnits: 2,
      },
      others: {
        totalUnits: 0,
        availableUnits: 0,
      },
      packEquivalentFromBoxes: 0,
      totalPossiblePacks: 0,
      headline: "2 cards left",
    },
  );
});

test("summarizes empty Main SKU stock with a neutral headline", () => {
  assert.deepEqual(plain(presentation.mainSkuStockSummary([])), {
    totalUnits: 0,
    availableUnits: 0,
    boxes: {
      totalUnits: 0,
      availableUnits: 0,
    },
    packs: {
      totalUnits: 0,
      availableUnits: 0,
    },
    cards: {
      totalUnits: 0,
      availableUnits: 0,
    },
    others: {
      totalUnits: 0,
      availableUnits: 0,
    },
    packEquivalentFromBoxes: 0,
    totalPossiblePacks: 0,
    headline: "No stock yet",
  });
});

test("builds Sub-SKU stock rows with type, quantity, and conversion labels", () => {
  assert.deepEqual(
    plain(
      presentation.subSkuStockRows([boxGroup, packGroup, cardGroup]).map((row) => ({
        sku: row.sku,
        typeLabel: row.typeLabel,
        availableLabel: row.availableLabel,
        totalLabel: row.totalLabel,
        conversionLabel: row.conversionLabel,
      })),
    ),
    [
      {
        sku: "OP16-JP-BOX-SEALED",
        typeLabel: "Box",
        availableLabel: "0 boxes",
        totalLabel: "105 boxes",
        conversionLabel: "1 box = 24 OP16-JP-PACK-LOOSE",
      },
      {
        sku: "OP16-JP-PACK-LOOSE",
        typeLabel: "Pack",
        availableLabel: "1 pack",
        totalLabel: "214 packs",
        conversionLabel: "Direct pack stock",
      },
      {
        sku: "OP01-070-PSA10-CERT123",
        typeLabel: "Card",
        availableLabel: "0 cards",
        totalLabel: "1 card",
        conversionLabel: "Single item stock",
      },
    ],
  );
});

test("warns when a Box Sub-SKU cannot convert into child Pack stock", () => {
  const missingChildPack = {
    ...boxGroup,
    childSku: null,
    childQuantity: null,
  };

  assert.equal(
    presentation.stockSkuConversionLabel(missingChildPack),
    "Pack conversion not set",
  );
  assert.equal(
    presentation.stockSkuWarning(missingChildPack),
    "Set packs per box and choose a child Pack Sub-SKU before opening boxes.",
  );
  assert.equal(
    presentation.subSkuStockRows([missingChildPack])[0].warning,
    "Set packs per box and choose a child Pack Sub-SKU before opening boxes.",
  );
});

test("sanitizes non-numeric and negative stock counts", () => {
  assert.equal(presentation.stockQuantityLabel(-1, "pack"), "0 packs");
  assert.equal(presentation.stockQuantityLabel("not-a-number", "box"), "0 boxes");
  assert.deepEqual(
    plain(
      presentation.mainSkuStockSummary([
        { ...boxGroup, totalUnits: -105, availableUnits: "bad", childQuantity: 24 },
        { ...packGroup, totalUnits: "2.8", availableUnits: -1 },
      ]),
    ),
    {
      totalUnits: 2,
      availableUnits: 0,
      boxes: {
        totalUnits: 0,
        availableUnits: 0,
      },
      packs: {
        totalUnits: 2,
        availableUnits: 0,
      },
      cards: {
        totalUnits: 0,
        availableUnits: 0,
      },
      others: {
        totalUnits: 0,
        availableUnits: 0,
      },
      packEquivalentFromBoxes: 0,
      totalPossiblePacks: 2,
      headline: "0 boxes left · 0 packs left",
    },
  );
});
