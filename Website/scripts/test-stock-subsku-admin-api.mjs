import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const stockSkusRoute = read("../src/app/api/ynot/admin/stock-skus/route.ts");
const openContainerRoute = read(
  "../src/app/api/ynot/admin/stock-skus/open-container/route.ts",
);
const cardStockRoute = read("../src/app/api/ynot/admin/card-stock/route.ts");
const cardStockUnitRoute = read(
  "../src/app/api/ynot/admin/card-stock/unit/route.ts",
);
const cardStockUnitsRoute = read(
  "../src/app/api/ynot/admin/card-stock/units/route.ts",
);
const lineupRoute = read("../src/app/api/ynot/admin/campaigns/[id]/lineup/route.ts");
const monitorRoute = read("../src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts");
const lastPrizeRoute = read("../src/app/api/ynot/packs/[slug]/last-prize/route.ts");
const shippingRoute = read("../src/app/api/ynot/shipping/route.ts");
const adminShippingRoute = read("../src/app/api/ynot/admin/shipping/route.ts");
const collectionConvertRoute = read("../src/app/api/ynot/collection/convert/route.ts");
const exchangeRoute = read("../src/app/api/ynot/exchange/route.ts");

test("stock SKU route is admin-only and calls summary/upsert RPCs", () => {
  assert.match(stockSkusRoute, /resolveAdminSession/);
  assert.match(stockSkusRoute, /enforceSameOriginMutation/);
  assert.match(stockSkusRoute, /enforceRateLimit/);
  assert.match(stockSkusRoute, /rpc\("get_admin_stock_sku_summary"/);
  assert.match(stockSkusRoute, /rpc\("upsert_stock_sku"/);
  assert.match(stockSkusRoute, /unitKind/);
  assert.match(stockSkusRoute, /childQuantity/);
  assert.doesNotMatch(
    stockSkusRoute,
    /Response\.json\(\{\s*error:\s*error\.message/,
  );
});

test("open container route is admin-only and calls open_stock_container", () => {
  assert.match(openContainerRoute, /resolveAdminSession/);
  assert.match(openContainerRoute, /enforceSameOriginMutation/);
  assert.match(openContainerRoute, /rpc\("open_stock_container"/);
  assert.match(openContainerRoute, /parentStockSkuId/);
  assert.match(openContainerRoute, /quantity/);
  assert.match(openContainerRoute, /revalidateTag\("campaigns"/);
  assert.doesNotMatch(openContainerRoute, /card_stock_units"\)\.insert/);
});

test("legacy stock routes understand stockSkuId but keep old group fallback", () => {
  assert.match(cardStockRoute, /stockSkuId/);
  assert.match(cardStockRoute, /rpc\("adjust_stock_sku_units"/);
  assert.match(cardStockRoute, /rpc\("adjust_card_stock_units"/);
  assert.match(cardStockUnitRoute, /stockSkuId/);
  assert.match(cardStockUnitRoute, /p_stock_sku_id/);
  assert.match(cardStockUnitsRoute, /stock_sku_id/);
  assert.match(cardStockUnitsRoute, /stockSkuId/);
  assert.match(cardStockUnitsRoute, /searchParams\.get\("stockSkuId"\)/);
  assert.match(cardStockUnitsRoute, /\.eq\("stock_sku_id",\s*stockSkuId\)/);
  assert.match(cardStockUnitsRoute, /stockSkuId:\s*unit\.stock_sku_id/);
});

test("thin detail and admin routes call stock-aware data loaders or unchanged RPCs", () => {
  assert.match(lineupRoute, /getAdminCampaignPrizeLineup/);
  assert.match(monitorRoute, /getLivePackMonitor/);
  assert.match(lastPrizeRoute, /getLastPrizePreviewForCampaign/);
  assert.match(shippingRoute, /request_shipping_for_items/);
  assert.match(adminShippingRoute, /update_shipping_request_status/);
  assert.match(collectionConvertRoute, /handleCardConversionRequest/);
  assert.match(exchangeRoute, /handleCardConversionRequest/);
});
