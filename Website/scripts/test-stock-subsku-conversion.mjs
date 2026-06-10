import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/stock-subsku-conversion.ts", import.meta.url),
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
const helpers = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("normalizes stock SKU unit kind", () => {
  assert.equal(helpers.normalizeStockSkuUnitKind("box"), "box");
  assert.equal(helpers.normalizeStockSkuUnitKind("pack"), "pack");
  assert.equal(helpers.normalizeStockSkuUnitKind("card"), "card");
  assert.equal(helpers.normalizeStockSkuUnitKind("other"), "other");
  assert.equal(helpers.normalizeStockSkuUnitKind("booster"), "other");
  assert.equal(helpers.normalizeStockSkuUnitKind(null), "other");
});

test("calculates opened child units from a box conversion rule", () => {
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 1,
      childQuantity: 24,
    }),
    24,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 5,
      childQuantity: 30,
    }),
    150,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 2.9,
      childQuantity: 20.7,
    }),
    40,
  );
  assert.equal(
    helpers.childUnitsFromContainerOpen({
      containerCount: 0,
      childQuantity: 24,
    }),
    0,
  );
});

test("calculates pack equivalent by Sub SKU type and conversion rule", () => {
  const rows = [
    {
      stockSkuId: "op16-box",
      sku: "OP16-JP-BOX",
      unitKind: "box",
      totalUnits: 10,
      availableUnits: 10,
      childStockSkuId: "op16-pack",
      childQuantity: 24,
    },
    {
      stockSkuId: "op16-pack",
      sku: "OP16-JP-PACK",
      unitKind: "pack",
      totalUnits: 37,
      availableUnits: 37,
    },
    {
      stockSkuId: "op16-other",
      sku: "OP16-PLAYMAT",
      unitKind: "other",
      totalUnits: 3,
      availableUnits: 3,
    },
  ];

  assert.deepEqual(plain(helpers.stockSkuPackEquivalent(rows)), {
    totalPackEquivalent: 277,
    availablePackEquivalent: 277,
    rows: [
      {
        stockSkuId: "op16-box",
        sku: "OP16-JP-BOX",
        unitKind: "box",
        packEquivalent: 240,
        availablePackEquivalent: 240,
      },
      {
        stockSkuId: "op16-pack",
        sku: "OP16-JP-PACK",
        unitKind: "pack",
        packEquivalent: 37,
        availablePackEquivalent: 37,
      },
      {
        stockSkuId: "op16-other",
        sku: "OP16-PLAYMAT",
        unitKind: "other",
        packEquivalent: null,
        availablePackEquivalent: null,
      },
    ],
  });
});

test("does not count a box as pack-equivalent without a child Sub SKU target", () => {
  assert.deepEqual(
    plain(
      helpers.stockSkuPackEquivalent([
        {
          stockSkuId: "op16-box",
          sku: "OP16-JP-BOX",
          unitKind: "box",
          totalUnits: 10,
          availableUnits: 10,
          childQuantity: 24,
        },
      ]),
    ),
    {
      totalPackEquivalent: 0,
      availablePackEquivalent: 0,
      rows: [
        {
          stockSkuId: "op16-box",
          sku: "OP16-JP-BOX",
          unitKind: "box",
          packEquivalent: null,
          availablePackEquivalent: null,
        },
      ],
    },
  );
});

test("uses exact unit image before Sub SKU image before product image", () => {
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: " https://cdn.example/unit.png ",
      stockSkuImageUrl: "https://cdn.example/subsku.png",
      productImageUrl: "https://cdn.example/product.png",
    }),
    "https://cdn.example/unit.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: "",
      stockSkuImageUrl: " https://cdn.example/subsku.png ",
      productImageUrl: "https://cdn.example/product.png",
    }),
    "https://cdn.example/subsku.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: null,
      stockSkuImageUrl: "",
      productImageUrl: " https://cdn.example/product.png ",
    }),
    "https://cdn.example/product.png",
  );
  assert.equal(
    helpers.stockSkuPublicImageUrl({
      stockUnitImageUrl: null,
      stockSkuImageUrl: null,
      productImageUrl: null,
    }),
    null,
  );
});
