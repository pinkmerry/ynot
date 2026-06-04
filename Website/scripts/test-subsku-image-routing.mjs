import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function loadTsModule(path) {
  const source = readSource(path);
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
  return cjsModule.exports;
}

test("public sub-SKU image helper prefers stock-unit image and falls back to catalog image", () => {
  const helper = loadTsModule("../src/features/ynot/public-subsku-images.ts");

  assert.equal(
    helper.publicSubSkuImageUrl(" https://cdn.example/unit.png ", "https://cdn.example/card.png"),
    "https://cdn.example/unit.png",
  );
  assert.equal(
    helper.publicSubSkuImageUrl("", "https://cdn.example/card.png"),
    "https://cdn.example/card.png",
  );
  assert.equal(helper.publicSubSkuImageUrl(null, "   "), null);
});

test("public sub-SKU image helper builds server-only image maps from linked prize units", () => {
  const helper = loadTsModule("../src/features/ynot/public-subsku-images.ts");
  const stockUnits = [
    { id: "stock-with-image", image_url: "https://cdn.example/stock-a.png" },
    { id: "stock-without-image", image_url: "" },
    { id: "other-stock", image_url: "https://cdn.example/stock-b.png" },
  ];
  const prizeUnits = [
    {
      id: "prize-unit-1",
      draw_round_prize_id: "prize-1",
      gacha_open_item_id: "open-item-1",
      card_stock_unit_id: "stock-with-image",
      status: "available",
    },
    {
      id: "prize-unit-2",
      draw_round_prize_id: "prize-1",
      gacha_open_item_id: "open-item-2",
      card_stock_unit_id: "stock-without-image",
      status: "available",
    },
    {
      id: "prize-unit-3",
      draw_round_prize_id: "prize-2",
      gacha_open_item_id: "open-item-3",
      card_stock_unit_id: "other-stock",
      status: "void",
    },
  ];

  assert.deepEqual(
    Object.fromEntries(helper.stockImageUrlByPrizeUnitId(prizeUnits, stockUnits)),
    { "prize-unit-1": "https://cdn.example/stock-a.png" },
  );
  assert.deepEqual(
    Object.fromEntries(helper.stockImageUrlByPrizeId(prizeUnits, stockUnits)),
    { "prize-1": "https://cdn.example/stock-a.png" },
  );
  assert.deepEqual(
    Object.fromEntries(helper.stockImageUrlByOpenItemId(prizeUnits, stockUnits)),
    { "open-item-1": "https://cdn.example/stock-a.png" },
  );
});

test("public pack detail prize lineups prefer linked sub-SKU images", () => {
  const dataSource = readSource("../src/features/ynot/data.ts");

  assert.match(dataSource, /publicSubSkuImageUrl/);
  assert.match(dataSource, /stockImageUrlByPrizeId/);
  assert.match(
    dataSource,
    /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("id,draw_round_prize_id,card_stock_unit_id,status"\)/,
  );
  assert.match(
    dataSource,
    /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/,
  );
  assert.match(
    dataSource,
    /cardImageUrl:\s*publicSubSkuImageUrl\(\s*prizeImageByPrizeId\.get\(prize\.id\),\s*card\?\.image_url\s*\?\?\s*null\s*\)/,
  );
});

test("public prize preview still strips internal stock and house fields", () => {
  const dataSource = readSource("../src/features/ynot/data.ts");
  const publicPrizePreview = dataSource.match(/function publicPrizePreview[\s\S]*?function publicPrizeLineup/)?.[0] ?? "";

  assert.doesNotMatch(publicPrizePreview, /card_stock_unit_id/);
  assert.doesNotMatch(publicPrizePreview, /draw_round_prize_unit_id/);
  assert.doesNotMatch(publicPrizePreview, /stockUnitGroupKey/);
  assert.doesNotMatch(publicPrizePreview, /unlockAtSoldPct/);
  assert.doesNotMatch(publicPrizePreview, /weight:/);
  assert.doesNotMatch(publicPrizePreview, /certNumber/);
  assert.doesNotMatch(publicPrizePreview, /gemrateId/);
});

test("pack opening API resolves awarded stock-unit image without exposing internal IDs", () => {
  const routeSource = readSource("../src/app/api/ynot/gacha/open/route.ts");
  const publicOpenItemType = routeSource.match(/type PublicOpenItem = \{[\s\S]*?\};/)?.[0] ?? "";
  const toPublicOpenItem = routeSource.match(/function toPublicOpenItem[\s\S]*?function toPublicOpenResult/)?.[0] ?? "";

  assert.match(routeSource, /stockImageUrlByPrizeUnitId/);
  assert.match(routeSource, /publicSubSkuImageUrl/);
  assert.match(routeSource, /draw_round_prize_unit_id/);
  assert.match(
    routeSource,
    /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("id,card_stock_unit_id,status"\)/,
  );
  assert.match(
    routeSource,
    /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/,
  );
  assert.doesNotMatch(publicOpenItemType, /cardId|prizeUnitId|draw_round|card_stock|tier\?:/);
  assert.doesNotMatch(toPublicOpenItem, /cardId:|prizeUnitId:|draw_round_prize_unit_id|card_stock_unit_id/);
});
