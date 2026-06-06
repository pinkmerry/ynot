import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const openRpcImageMigrationSource = readFileSync(
  new URL("../../Database/supabase/migrations/20260606020000_open_gacha_subsku_reveal_image.sql", import.meta.url),
  "utf8",
);

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

test("public sub-SKU image helper prefers exact stock-unit image and falls back to catalog image", () => {
  const helper = loadTsModule("../src/features/ynot/public-subsku-images.ts");

  assert.equal(
    helper.publicSubSkuImageUrl(" https://cdn.example/unit.png ", "https://cdn.example/catalog.png"),
    "https://cdn.example/unit.png",
  );
  assert.equal(
    helper.publicSubSkuImageUrl("", " https://cdn.example/catalog.png "),
    "https://cdn.example/catalog.png",
  );
  assert.equal(helper.publicSubSkuImageUrl(null, "https://cdn.example/catalog.png"), "https://cdn.example/catalog.png");
  assert.equal(helper.publicSubSkuImageUrl("", ""), null);
  assert.equal(helper.publicSubSkuImageUrl(null, null), null);
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
  assert.match(dataSource, /readPrizeUnitImageUrlsByPrizeId/);
  assert.match(dataSource, /const PRIZE_BATCH = 150/);
  assert.match(
    dataSource,
    /\.from\("card_stock_units"\)[\s\S]*\.select\("allocated_draw_round_prize_id,image_url"\)[\s\S]*\.eq\("allocated_draw_round_id", drawRoundId\)[\s\S]*\.in\("allocated_draw_round_prize_id", batch\)/,
  );
  assert.match(
    dataSource,
    /const prizeImageByPrizeId = await readPrizeUnitImageUrlsByPrizeId\(/,
  );
  assert.match(
    dataSource,
    /cardImageUrl:\s*publicSubSkuImageUrl\(\s*prizeImageByPrizeId\.get\(prize\.id\)\s*\)\s*\?\?\s*publicSubSkuImageUrl\(card\?\.image_url\)\s*\?\?\s*publicSubSkuImageUrl\(\s*lineupPreviewImageByCardId\.get\(prize\.card_id\)\s*\)/,
  );
  assert.match(
    dataSource,
    /cardImageUrl:\s*publicSubSkuImageUrl\(\s*prizeImageByPrizeId\.get\(prize\.id\)\)\s*\?\?\s*publicSubSkuImageUrl\(card\?\.image_url\)/,
  );
  assert.doesNotMatch(dataSource, /fetchPrizeCardUnitImages/);
  assert.doesNotMatch(dataSource, /unitImages\.get\(prize\.card_id\)/);
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
  assert.match(routeSource, /imageResolvedFromStockUnit/);
  assert.match(routeSource, /item\.imageResolvedFromStockUnit === true/);
  assert.match(routeSource, /draw_round_prize_unit_id/);
  assert.match(
    routeSource,
    /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("id,card_stock_unit_id,status"\)/,
  );
  assert.match(
    routeSource,
    /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/,
  );
  assert.match(
    routeSource,
    /const stockImageUrl = prizeUnitId \? imageByPrizeUnitId\.get\(prizeUnitId\) : null;/,
  );
  assert.match(
    routeSource,
    /imageUrl:\s*publicSubSkuImageUrl\(stockImageUrl,\s*item\.imageUrl\s*\?\?\s*card\?\.image_url\s*\?\?\s*null,?\s*\)/,
  );
  assert.doesNotMatch(publicOpenItemType, /cardId|prizeUnitId|draw_round|card_stock|tier\?:/);
  assert.doesNotMatch(toPublicOpenItem, /cardId:|prizeUnitId:|draw_round_prize_unit_id|card_stock_unit_id/);
});

test("pack opening RPC returns sub-SKU image before the fast reveal skips hydration", () => {
  assert.match(openRpcImageMigrationSource, /public\.open_gacha_campaign\(uuid,uuid,integer,text\)/);
  assert.match(openRpcImageMigrationSource, /coalesce\(stock\.image_url, cards\.image_url\)/);
  assert.match(
    openRpcImageMigrationSource,
    /left join public\.card_stock_units stock[\s\S]*on stock\.id = units\.card_stock_unit_id/,
  );
  assert.match(
    openRpcImageMigrationSource,
    /left join public\.draw_round_prize_units prize_unit[\s\S]*on prize_unit\.id = items\.draw_round_prize_unit_id[\s\S]*left join public\.card_stock_units stock[\s\S]*on stock\.id = prize_unit\.card_stock_unit_id/,
  );
  assert.match(openRpcImageMigrationSource, /fn like '%''imageUrl'', cards\.image_url,%'/);
  assert.doesNotMatch(openRpcImageMigrationSource, /update public\.(cards|card_stock_units|draw_round_prize_units|collection_items|gacha_open_items)/);
  assert.doesNotMatch(openRpcImageMigrationSource, /delete from public\./);
});

test("opening reward history carries a public image URL only", () => {
  const typesSource = readSource("../src/features/ynot/types.ts");
  const dataSource = readSource("../src/features/ynot/data.ts");
  const profileTabsSource = readSource("../src/features/ynot/ProfileRewardsTabs.tsx");
  const historySource =
    dataSource.match(/export async function getGachaOpenHistory[\s\S]*?export async function getExchanges/)?.[0] ??
    "";

  const rewardType = typesSource.match(/export type YnotGachaOpenReward = \{[\s\S]*?\};/)?.[0] ?? "";
  assert.match(rewardType, /imageUrl\?:\s*string\s*\|\s*null/);
  assert.doesNotMatch(rewardType, /card_stock_unit_id|draw_round_prize_unit_id|prizeUnitId|certNumber|gemrateId|weight|unlockAtSoldPct/);

  assert.match(historySource, /stockImageUrlByOpenItemId/);
  assert.match(
    historySource,
    /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("gacha_open_item_id,card_stock_unit_id,status"\)[\s\S]*\.in\("gacha_open_id", openIds\)/,
  );
  assert.match(
    historySource,
    /imageUrl:\s*publicSubSkuImageUrl\(\s*rewardImageByOpenItemId\.get\(item\.id\),\s*card\?\.photoUrl,?\s*\)/,
  );
  assert.match(profileTabsSource, /profile-reward-thumb/);
  assert.match(profileTabsSource, /reward\.imageUrl/);
});

test("shipping history images come from the won stock unit only", () => {
  const dataSource = readSource("../src/features/ynot/data.ts");
  const shippingSource =
    dataSource.match(/export async function getShipping[\s\S]*?export async function getAddresses/)?.[0] ??
    "";

  assert.match(
    shippingSource,
    /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("collection_item_id,gacha_open_item_id,card_stock_unit_id"\)/,
  );
  assert.match(
    shippingSource,
    /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/,
  );
  assert.match(shippingSource, /imageByCollectionItemId/);
  assert.match(
    shippingSource,
    /imageUrl:\s*item\s*\?\s*imageByCollectionItemId\.get\(item\.id\)\s*\?\?\s*null\s*:\s*null/,
  );
  assert.doesNotMatch(shippingSource, /imageUrl:\s*card\?\.photoUrl/);
});

test("collection card components render existing collection image URLs", () => {
  const dataSource = readSource("../src/features/ynot/data.ts");
  const componentsSource = readSource("../src/features/ynot/components.tsx");
  const historyExperienceSource = readSource("../src/features/ynot/cr/HistoryExperience.tsx");
  const collectionPageSource = readSource("../src/app/(store)/collection/page.tsx");
  const globalsSource = readSource("../src/app/globals.css");

  const collectionCard = componentsSource.match(/function CollectionCard[\s\S]*?^}/m)?.[0] ?? "";
  assert.match(collectionCard, /item\.imageUrl/);
  assert.match(collectionCard, /<img/);
  assert.match(collectionCard, /src=\{item\.imageUrl\}/);
  assert.match(collectionPageSource, /HistoryExperience/);
  assert.match(historyExperienceSource, /card\.imageUrl/);
  assert.match(historyExperienceSource, /src=\{card\.imageUrl\}/);
  assert.match(globalsSource, /\.profile-reward-thumb/);
  assert.match(globalsSource, /\.collection-art img/);
  assert.match(
    dataSource,
    /imageUrl:\s*publicSubSkuImageUrl\(\s*wonUnit\?\.imageUrl,\s*card\?\.photoUrl\s*\)/,
  );
});

test("all pulls reward history renders public image URLs", () => {
  const allPullsSource = readSource("../src/features/ynot/cr/AllPullsExperience.tsx");

  assert.match(allPullsSource, /imageUrl\?:\s*string\s*\|\s*null/);
  assert.match(allPullsSource, /imageUrl:\s*c\.imageUrl\s*\?\?\s*null/);
  assert.match(allPullsSource, /imageUrl:\s*reward\.imageUrl\s*\?\?\s*null/);
  assert.match(allPullsSource, /row\.imageUrl/);
  assert.match(allPullsSource, /src=\{row\.imageUrl\}/);
});

test("customer collection data does not expose stock cert identifiers", () => {
  const typesSource = readSource("../src/features/ynot/types.ts");
  const dataSource = readSource("../src/features/ynot/data.ts");
  const componentsSource = readSource("../src/features/ynot/components.tsx");
  const historyExperienceSource = readSource("../src/features/ynot/cr/HistoryExperience.tsx");
  const collectionType =
    typesSource.match(/export type YnotCollectionItem = \{[\s\S]*?export type YnotExchangeOrder/)?.[0] ??
    "";
  const collectionSource =
    dataSource.match(/export async function getCollection[\s\S]*?export async function getGachaOpenHistory/)?.[0] ??
    "";

  assert.doesNotMatch(collectionType, /cardCertNumber|certNumber|gemrateId/);
  assert.doesNotMatch(collectionSource, /cardCertNumber|cert_number|gemrateId/);
  assert.doesNotMatch(componentsSource, /cardCertNumber/);
  assert.doesNotMatch(historyExperienceSource, /cardCertNumber/);
});
