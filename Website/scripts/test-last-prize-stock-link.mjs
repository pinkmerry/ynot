import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function latestMigration() {
  return read("../../Database/supabase/migrations/20260605223000_collection_item_stock_unit_last_prize.sql");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("collection_items privately links the exact awarded stock unit and open item", () => {
  const sql = latestMigration();

  assert.match(sql, /alter\s+table\s+public\.collection_items[\s\S]*add\s+column\s+if\s+not\s+exists\s+card_stock_unit_id\s+uuid/i);
  assert.match(sql, /alter\s+table\s+public\.collection_items[\s\S]*add\s+column\s+if\s+not\s+exists\s+gacha_open_item_id\s+uuid/i);
  assert.match(sql, /collection_items_card_stock_unit_idx/i);
  assert.match(sql, /collection_items_gacha_open_item_idx/i);
  assert.match(sql, /sync_collection_item_stock_from_prize_unit/i);
  assert.match(sql, /sync_last_prize_collection_item/i);
  assert.match(sql, /from\s+public\.draw_round_prize_units\s+unit[\s\S]*where\s+unit\.collection_item_id\s+=\s+item\.id/i);
  assert.match(sql, /from\s+public\.draw_rounds\s+round[\s\S]*round\.last_prize_collection_item_id\s+=\s+item\.id/i);
});

test("last prize collection items receive convert snapshots and deadlines", () => {
  const sql = latestMigration();

  assert.match(sql, /last_prize_convert_coin_value/i);
  assert.match(sql, /convert_coin_value_snapshot/i);
  assert.match(sql, /convert_expires_at/i);
  assert.match(sql, /last_prize_metadata\s*->>\s*'convertCoinValue'/i);
  assert.match(sql, /greatest\(0,\s*least\(10000000/i);
});

test("admin campaign route sanitizes last prize metadata instead of trusting raw client JSON", () => {
  const source = read("../src/app/api/ynot/admin/campaigns/route.ts");
  const campaignPatch = between(source, "function campaignPatch", "function lastPrizeNormalPrizeTarget");

  assert.match(source, /function lastPrizeMetadataValue/);
  assert.match(source, /function sanitizedLastPrizeStockFilter/);
  assert.match(source, /function clampConvertCoinValue/);
  assert.match(campaignPatch, /last_prize_metadata:[\s\S]*lastPrizeMetadataValue\(body\.lastPrizeMetadata\)/);
  assert.doesNotMatch(campaignPatch, /body\.lastPrizeMetadata as Json/);
});

test("admin builder sends last prize category and convert coin values", () => {
  const source = read("../src/features/ynot/client.tsx");
  const lastPrizeSection = between(
    source,
    "<section className=\"admin-prize-tier-section admin-prize-tier-last-prize\">",
    "</section>"
  );
  const payload = between(source, "lastPrizeCardId: lastPrizeCardId || null", "if (editMode && editingCampaign)");

  assert.match(source, /lastPrizeCatalogCategory/);
  assert.match(source, /lastPrizeConvertCoinValue/);
  assert.match(payload, /catalogCategoryLabel\(catalogCategory\)/);
  assert.match(payload, /prizeCategoryForCatalogCategory\(catalogCategory\)/);
  assert.match(payload, /convertCoinValue:\s*clampConvertCoinValue\(lastPrizeConvertCoinValue\)/);
  assert.match(payload, /quantity:\s*1/);
  assert.match(lastPrizeSection, /Sub-category/);
  assert.match(lastPrizeSection, /Convert coins/);
  assert.match(lastPrizeSection, /readOnly/);
});

test("customer collection and shipping hydrate images from private stock links without exposing them", () => {
  const dataSource = read("../src/features/ynot/data.ts");
  const typesSource = read("../src/features/ynot/types.ts");
  const collectionSource = between(
    dataSource,
    "export async function getCollection",
    "export async function getGachaOpenHistory"
  );
  const shippingSource = between(
    dataSource,
    "export async function getShipping",
    "export async function getAddresses"
  );
  const historySource = between(
    dataSource,
    "export async function getGachaOpenHistory",
    "export async function getExchanges"
  );
  const collectionType = between(
    typesSource,
    "export type YnotCollectionItem",
    "export type YnotExchangeOrder"
  );

  assert.match(collectionSource, /item\.card_stock_unit_id/);
  assert.match(collectionSource, /item\.gacha_open_item_id/);
  assert.match(collectionSource, /\.from\("card_stock_units"\)[\s\S]*\.select\("id,grade,condition,grading_service,image_url"\)/);
  assert.match(collectionSource, /imageUrl:\s*publicSubSkuImageUrl\(\s*wonUnit\?\.imageUrl,\s*card\?\.photoUrl,?\s*\)/);
  assert.match(shippingSource, /item\.card_stock_unit_id/);
  assert.match(shippingSource, /imageByCollectionItemId/);
  assert.match(historySource, /gacha_history_collection_stock_links/);
  assert.match(historySource, /\.from\("collection_items"\)[\s\S]*\.select\("gacha_open_item_id,card_stock_unit_id"\)/);
  assert.match(
    historySource,
    /imageUrl:\s*publicSubSkuImageUrl\(\s*collectionImageByOpenItemId\.get\(item\.id\) \?\?[\s\S]*rewardImageByOpenItemId\.get\(item\.id\),\s*card\?\.photoUrl,?\s*\)/,
  );

  assert.doesNotMatch(collectionType, /cardStockUnitId|gachaOpenItemId|certNumber|gemrateId|stockUnitFilter|weight|unlockAtSoldPct/);
  assert.doesNotMatch(collectionSource, /cardStockUnitId:|gachaOpenItemId:|certNumber:|gemrateId:|stockUnitFilter:/);
});

test("public campaign projection does not leak last prize admin metadata or private house logic", () => {
  const dataSource = read("../src/features/ynot/data.ts");
  const publicCampaign = between(
    dataSource,
    "function publicYnotCampaign",
    "function localOwnerMockPrizeLineup"
  );

  for (const privateField of [
    "lastPrizeCardId",
    "lastPrizeStockUnitKey",
    "lastPrizeCatalogCategory",
    "lastPrizeConvertCoinValue",
    "stockUnitGroupKey",
    "stockUnitFilter",
    "card_stock_unit_id",
    "gacha_open_item_id",
    "logicMode",
    "readinessBlockers",
    "bannerImageStoragePath",
    "totalPrizeUnits"
  ]) {
    assert.doesNotMatch(publicCampaign, new RegExp(`${privateField}:`), `${privateField} must stay private`);
  }
  assert.match(publicCampaign, /availablePrizeUnits:\s*campaign\.availablePrizeUnits/);
  assert.match(publicCampaign, /eligiblePrizeUnits:\s*campaign\.eligiblePrizeUnits/);
});
