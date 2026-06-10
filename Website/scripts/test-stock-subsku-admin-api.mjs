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
const localReadinessPage = read("../src/app/(store)/local-readiness/page.tsx");
const localStockSubSkuPage = read(
  "../src/app/(store)/local-stock-subsku-test/page.tsx",
);
const localStockSubSkuAccess = read(
  "../src/features/ynot/local-stock-subsku-access.ts",
);
const adminClient = read("../src/features/ynot/client.tsx");
const adminCss = read("../src/app/globals.css");
const adminData = read("../src/features/ynot/data.ts");
const stockSkuPresentation = read("../src/features/ynot/stock-sku-presentation.ts");
const stockSkuUsage = read("../src/features/ynot/stock-sku-usage.ts");
const schemaCompat = read("../src/lib/supabase/schema-compat.ts");

test("stock SKU route is admin-only and calls summary/upsert RPCs", () => {
  assert.match(stockSkusRoute, /resolveAdminSession/);
  assert.match(stockSkusRoute, /enforceSameOriginMutation/);
  assert.match(stockSkusRoute, /enforceRateLimit/);
  assert.match(stockSkusRoute, /rpc\("get_admin_stock_sku_summary"/);
  assert.match(stockSkusRoute, /rpc\("upsert_stock_sku"/);
  assert.match(stockSkusRoute, /unitKind/);
  assert.match(stockSkusRoute, /childQuantity/);
  assert.match(stockSkusRoute, /clearConversionRule/);
  assert.match(stockSkusRoute, /const unitKind = unitKindRaw \|\| null/);
  assert.match(stockSkusRoute, /hasOwn\(body,\s*"imageUrl"\)/);
  assert.match(stockSkusRoute, /p_clear_conversion_rule: clearConversionRule/);
  assert.match(stockSkusRoute, /requestedStockSkuId\.invalid/);
  assert.match(stockSkusRoute, /requestedChildStockSkuId\.invalid/);
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

test("legacy stock routes require stockSkuId for adds but keep old remove fallback", () => {
  assert.match(cardStockRoute, /enforceSameOriginMutation/);
  assert.match(cardStockRoute, /stockSkuId/);
  assert.match(cardStockRoute, /UUID_PATTERN/);
  assert.match(cardStockRoute, /requestedStockSkuId && !UUID_PATTERN\.test/);
  assert.match(cardStockRoute, /delta > 0 && !stockSkuId/);
  assert.match(cardStockRoute, /Choose a valid Sub-SKU before adjusting stock\./);
  assert.match(cardStockRoute, /Choose a Sub-SKU before adding stock\./);
  assert.match(cardStockRoute, /conditionRaw \|\| \(stockSkuId \? null : "raw"\)/);
  assert.match(cardStockRoute, /rpc\("adjust_stock_sku_units"/);
  assert.match(cardStockRoute, /rpc\("adjust_card_stock_units"/);
  assert.match(cardStockRoute, /Main SKU stock could not be adjusted/);
  assert.doesNotMatch(cardStockRoute, /Global stock could not be adjusted/);
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

test("admin catalog UI and data loader use first-class stock SKU identity", () => {
  assert.match(adminData, /rpc\("get_admin_prize_stock_summaries"/);
  assert.match(adminData, /cardStockSubSkuSummariesFromPrizeStockJson/);
  assert.match(adminData, /subSkuSummaries/);
  assert.match(adminData, /rpc\("get_admin_stock_sku_summary"/);
  assert.match(adminData, /function readPrizePoolStockUnitRows/);
  assert.match(adminData, /function readPrizePoolStockSkuRows/);
  assert.match(adminData, /isMissingColumnError\(error,\s*"stock_sku_id"\)/);
  assert.match(adminData, /prize_pool_stock_unit_identities_legacy/);
  assert.match(adminData, /"id,sku_code,label"/);
  assert.match(adminData, /const stockSku = stockUnit\.stock_sku_id/);
  assert.match(adminData, /sku: stockSku\?\.sku_code \?\? stockUnitSku/);
  assert.match(adminData, /label: stockSku\?\.label \?\? stockUnitDisplayLabel/);
  assert.match(
    adminData,
    /isMissingFunctionError\(\s*batch\.error,\s*"get_admin_prize_stock_summaries"/,
  );
  assert.match(adminData, /isMissingFunctionError\(error,\s*"get_admin_stock_sku_summary"\)/);
  assert.match(adminData, /"id,card_id,stock_sku_id,condition,grade/);
  assert.match(adminClient, /function AdminStockSkuEditor/);
  assert.match(adminClient, /function defaultStockSkuUnitKindForCard/);
  assert.match(adminClient, /mainSkuCategoryType\(card\.catalogCategory\)/);
  assert.match(adminClient, /const defaultUnitKind = defaultStockSkuUnitKindForCard\(card\)/);
  assert.match(adminClient, /fallback: AdminStockSkuUnitKind = "other"/);
  assert.match(adminClient, /adminStockSkuUnitKind\(group\?\.unitKind, defaultUnitKind\)/);
  assert.match(adminClient, /stockSkuUnitKindOptions[\s\S]*value: "card"[\s\S]*value: "box"[\s\S]*value: "pack"/);
  assert.match(adminClient, /setUnitKind\(defaultUnitKind\)/);
  assert.doesNotMatch(adminClient, /setUnitKind\("pack"\)/);
  assert.match(adminClient, /stockSkuCodePlaceholder\(unitKind, card\)/);
  assert.match(adminClient, /stockSkuLabelPlaceholder\(unitKind\)/);
  assert.match(adminClient, /preferredPrizeStockSkuGroup\(stockSkuGroups\(card\)\)/);
  assert.match(adminClient, /\/api\/ynot\/admin\/stock-skus"/);
  assert.match(adminClient, /\/api\/ynot\/admin\/stock-skus\/open-container/);
  assert.match(adminClient, /stockSkuId: group\.stockSkuId \?\? undefined/);
  assert.match(adminClient, /const quantityCondition =/);
  assert.match(adminClient, /group\.stockSkuId && group\.unitKind !== "card"/);
  assert.match(adminClient, /condition: quantityCondition/);
  assert.match(adminClient, /imageUrl: delta > 0 \? stockImageUrl : undefined/);
  assert.match(adminClient, /imageStoragePath: delta > 0 \? stockImageStoragePath : undefined/);
  assert.match(adminClient, /const unitKindLocked = isEditing && Math\.max\(0, group\?\.totalUnits \?\? 0\) > 0/);
  assert.match(adminClient, /disabled=\{busy \|\| unitKindLocked\}/);
  assert.match(adminClient, /clearConversionRule: unitKind === "box" && !childStockSkuId/);
  assert.match(adminClient, /identityUnknown/);
  assert.match(adminClient, /fetchEditableStockUnits\(cardId, group\.key, group\.stockSkuId\)/);
  assert.match(adminClient, /function editableUnitIdentityChanged/);
  assert.match(adminClient, /\.\.\.\(keepCurrentStockSkuId \? \{ stockSkuId: unit\.stockSkuId \} : \{\}\)/);
  assert.match(adminClient, /Conversion/);
  assert.match(adminClient, /Sub-SKU stock/);
  assert.match(adminClient, /Main SKU stock/);
  assert.match(adminClient, /Random pack stock/);
  assert.match(adminClient, /Random pack assignments/);
  assert.match(adminClient, /subSkuStockRows\(groups\)/);
  assert.match(adminClient, /mainSkuStockSummary\(groups\)/);
  assert.match(adminClient, /Pack equivalent/);
  assert.match(
    `${adminClient}\n${stockSkuPresentation}`,
    /Set packs per box and choose a child Pack Sub-SKU/,
  );
  assert.doesNotMatch(adminClient, />\s*Edit card\s*</);
  assert.doesNotMatch(adminClient, />\s*Delete card\s*</);
  assert.doesNotMatch(adminClient, />\s*Add stock\s*</);
  assert.doesNotMatch(adminClient, /Global stock/);
  assert.doesNotMatch(adminClient, /global stock/);
  assert.doesNotMatch(adminClient, /Product card/);
  assert.doesNotMatch(adminClient, /Card \/ stock/);
  assert.doesNotMatch(adminClient, /Unit image/);
  assert.match(adminClient, />\s*Edit Main SKU\s*</);
  assert.match(adminClient, />\s*Delete Main SKU\s*</);
  assert.match(adminClient, />\s*Add Sub-SKU stock\s*</);
  assert.match(adminClient, /Drop an item image here/);
  assert.match(adminClient, /Main SKU image/);
  assert.match(adminClient, /With Main SKU stock/);
  assert.match(adminClient, /Main SKU \/ Sub-SKU/);
  assert.match(adminClient, /Stock unit image/);
  assert.match(adminClient, /admin-subsku-stock-selected/);
  assert.match(adminCss, /admin-subsku-stock-selected/);
  assert.match(adminClient, /prize slot/);
  assert.match(adminClient, /random pack prize slot/);
  assert.match(adminClient, /Main SKU name/);
  assert.match(adminClient, /Select Main SKU/);
  assert.match(adminClient, /selectedStockSkuId/);
  assert.match(adminClient, /setSelectedStockSkuId/);
  assert.match(adminClient, /Choose a Sub-SKU before adding stock\./);
  assert.match(adminClient, /Create a Sub-SKU before adding stock to this Main SKU\./);
  assert.match(adminClient, /function cardSubSkuBucketDisplay/);
  assert.match(adminClient, /CERT-\[A-Z0-9._-\]\+\$/);
  assert.match(adminClient, /const display = cardSubSkuBucketDisplay\(group\)/);
  assert.match(adminClient, /const selectedSubSkuDisplay = selectedSubSkuGroup/);
  const addCardStockFlow = [
    'label="Main SKU"',
    'label="Sub-SKU"',
    'label="Selected condition"',
    'label="Grade service"',
    'label="Grade number"',
    'label="Cert number"',
    'label={quantityFieldLabel}',
  ].map((needle) => adminClient.indexOf(needle));
  assert.deepEqual(
    addCardStockFlow.every((index) => index >= 0),
    true,
    "Add Sub-SKU stock should expose the card-stock flow labels",
  );
  assert.deepEqual(
    [...addCardStockFlow].sort((left, right) => left - right),
    addCardStockFlow,
    "Add Sub-SKU stock should follow Main SKU > Sub-SKU > condition > service > grade > cert > quantity",
  );
  assert.match(adminClient, /const quantityFieldLabel = isCardSubSku\s*\?\s*"How many cards"/);
  assert.match(adminClient, /Unique per physical card/);
  assert.match(adminClient, /admin-stock-unit-edit-field[\s\S]*Selected condition/);
  assert.match(adminClient, /admin-stock-unit-edit-field[\s\S]*Grade service/);
  assert.match(adminClient, /admin-stock-unit-edit-field[\s\S]*Grade number/);
  assert.match(adminClient, /admin-stock-unit-edit-field[\s\S]*Cert number/);
  assert.match(adminClient, /function AdminCardSubSkuInlineStock/);
  assert.match(adminClient, /className="admin-stock-sku-qty admin-stock-sku-card-add"/);
  assert.match(adminClient, /Add card stock/);
  assert.match(
    adminClient,
    /<AdminCardSubSkuInlineStock cardId=\{card\.catalogCardId\} group=\{group\} \/>/,
  );
  assert.match(adminClient, /stockSkuId: selectedStockSkuId/);
  assert.match(adminClient, /const isCardSubSku = selectedSubSkuGroup\?\.unitKind === "card"/);
  assert.match(adminClient, /\.\.\.\(isCardSubSku[\s\S]*?\{\s*condition,/);
  assert.doesNotMatch(adminClient, /stockSkuId: selectedStockSkuId,\s*\n\s*condition,/);
  assert.match(adminClient, /Sub-SKUs do not use card grading fields/);
  assert.match(adminClient, /stockQuantityLabel\(effectiveCount, selectedSubSkuGroup\.unitKind\)/);
  assert.match(adminClient, /disabled=\{isPending \|\| !selectedSubSkuGroup\}/);
  assert.doesNotMatch(adminClient, /reason: "admin_catalog",\s*\n\s*condition,/);
  assert.match(adminClient, /Related pack product/);
  assert.match(adminClient, /View \{editableUnits\.toLocaleString\(\)\} individual/);
  assert.match(adminClient, /allRows=\{rows\}/);
  assert.doesNotMatch(
    adminClient,
    /stockSkuId:\s*unit\.stockSkuId\s*\?\?\s*undefined/,
  );
  assert.doesNotMatch(
    adminClient,
    /if \(!groups\.length && !activeUnits && !assignedUnits\) return null;/,
  );
  assert.match(adminClient, /Create the first Sub-SKU before adding stock to this Main SKU/);
  assert.match(adminClient, /availablePackEquivalent/);
  assert.match(adminClient, /Packs per box/);
  assert.match(adminClient, /Counted as \$\{stockSkuUnitNoun\(group\.unitKind, 2\)\}/);
  assert.match(adminClient, /Different products can use different pack counts/);
  assert.match(adminClient, /Create a Pack Sub-SKU first, then set packs per box/);
  assert.match(adminClient, /Set how many packs are inside one sealed box/);
  assert.doesNotMatch(
    `${adminClient}\n${cardStockRoute}\n${stockSkusRoute}\n${openContainerRoute}`,
    /Sub SKUs?|Sub SKU/,
  );
  assert.match(adminClient, /aria-describedby=\{boxPackHintId\}/);
  assert.match(adminCss, /admin-stock-sku-editor-hint/);
  assert.match(adminCss, /admin-stock-sku-editor-grid small/);
  assert.match(stockSkuUsage, /function summaryStockUnitIdentity/);
  assert.match(stockSkuUsage, /parsedLegacyStockUnitKey\(legacyStockUnitGroupKey\(row\)\)/);
  assert.match(stockSkuUsage, /stockSkuId\?: string \| null/);
  assert.match(stockSkuUsage, /stockUnitSelectionMetadata[\s\S]*stockSkuId: group\.stockSkuId/);
});

test("localhost stock rehearsal page is gated from public production users", () => {
  assert.match(localStockSubSkuAccess, /localhost/);
  assert.match(localStockSubSkuAccess, /127\.0\.0\.1/);
  assert.match(localStockSubSkuAccess, /\[::1\]/);
  assert.match(localStockSubSkuPage, /headers\(\)/);
  assert.match(localStockSubSkuPage, /isLocalStockSubSkuHost\(host\)/);
  assert.match(localStockSubSkuPage, /isDevAuthAllowed/);
  assert.match(localStockSubSkuPage, /viewer\.isAdmin/);
  assert.match(localStockSubSkuPage, /redirect\("\/packs"\)/);
  assert.match(localReadinessPage, /showLocalStockTest/);
  assert.match(localReadinessPage, /isLocalStockSubSkuHost\(host\)/);
  assert.match(localReadinessPage, /viewer\.isAdmin \|\| isDevAuthAllowed\(\)/);
});

test("schema compatibility detects PostgREST missing-RPC cache errors", () => {
  assert.match(schemaCompat, /PGRST202/);
  assert.match(schemaCompat, /schema cache/i);
  assert.match(schemaCompat, /could not find the function/i);
  assert.match(schemaCompat, /could not find .*column.*schema cache/i);
});
