import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
const cardStockRouteSource = readFileSync(
  new URL("../src/app/api/ynot/admin/card-stock/route.ts", import.meta.url),
  "utf8",
);
const cardStockUnitRouteSource = readFileSync(
  new URL("../src/app/api/ynot/admin/card-stock/unit/route.ts", import.meta.url),
  "utf8",
);
const cardStockUnitsRouteSource = readFileSync(
  new URL("../src/app/api/ynot/admin/card-stock/units/route.ts", import.meta.url),
  "utf8",
);
const adminPrizeRouteSource = readFileSync(
  new URL("../src/app/api/ynot/admin/prizes/route.ts", import.meta.url),
  "utf8",
);
const adminCampaignRouteSource = readFileSync(
  new URL("../src/app/api/ynot/admin/campaigns/route.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const prizeCategorySource = readFileSync(
  new URL("../src/features/ynot/prize-category.ts", import.meta.url),
  "utf8",
);
const prizeReadinessSource = readFileSync(
  new URL("../src/features/ynot/prize-readiness.ts", import.meta.url),
  "utf8",
);

function migrationSql() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

test("database exposes grouped sub-SKU stock summary for admin catalog reads", () => {
  const sql = migrationSql();
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_admin_card_stock_subsku_summary/i);
  assert.match(sql, /card_stock_units_subsku_lookup_idx/i);
  assert.match(sql, /stockUnitGroupKey/);
});

test("database treats raw and sealed sub-SKUs as condition-only identities", () => {
  const sql = migrationSql();
  assert.match(sql, /non_graded_stock_identity_is_condition_only/i);
  assert.match(sql, /filter_condition\s+<>\s+'graded'/i);
});

test("database review guard requires explicit sub-SKU selection metadata", () => {
  const sql = migrationSql();
  assert.match(sql, /random_pack_requires_subsku_selection/i);
  assert.match(sql, /p_prize_metadata\s+is\s+null[\s\S]*return\s+false/i);
  assert.match(sql, /group_key\s*=\s*''[\s\S]*return\s+false/i);
});

test("database and APIs require grade plus grading service for graded stock", () => {
  const sql = migrationSql();
  assert.match(sql, /require_graded_stock_identity/i);
  assert.match(sql, /graded_stock_identity_required/i);
  assert.match(sql, /invalid_grading_service/i);
  assert.match(
    cardStockRouteSource,
    /condition\s+===\s+"graded"[\s\S]*!grade[\s\S]*!gradingService/,
  );
  assert.match(
    cardStockUnitRouteSource,
    /condition\s+===\s+"graded"[\s\S]*!grade[\s\S]*!gradingService/,
  );
  assert.match(clientSource, /Choose a grade for graded stock/);
  assert.match(clientSource, /Choose a grading service for graded stock/);
});

test("database exposes batched prize stock summaries for readiness checks", () => {
  const sql = migrationSql();
  assert.match(sql, /batch_prize_stock_summaries/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_admin_prize_stock_summaries/i);
  assert.match(sql, /p_card_ids\s+uuid\[\]/i);
  assert.match(sql, /'stockSummaries'/);
  assert.match(sql, /'subSkuSummaries'/);
});

test("admin bulk remove must carry a selected stock sub-SKU", () => {
  assert.match(cardStockRouteSource, /stockUnitGroupKey/);
  assert.match(cardStockRouteSource, /delta\s+<\s+0[\s\S]*stockUnitGroupKey/i);
  assert.match(
    clientSource,
    /stockUnitGroupKey:[\s\S]*stockDraft\.mode\s*===\s*"remove"[\s\S]*selectedRemoveGroup\.key/,
  );
});

test("editable sub-SKU unit rows reload after edit or remove", () => {
  assert.match(clientSource, /onChanged\?:\s*\(\)\s*=>\s*Promise<void>\s*\|\s*void/);
  assert.match(clientSource, /await onChanged\?\.\(\)/);
  assert.match(clientSource, /loadUnits\(true\)/);
});

test("random-pack stock readiness uses the batched summary RPC first", () => {
  assert.match(prizeReadinessSource, /get_admin_prize_stock_summaries/);
  assert.match(prizeReadinessSource, /p_card_ids:\s*cardIds/);
  assert.match(
    prizeReadinessSource,
    /isMissingFunctionError\(batchError,\s*"get_admin_prize_stock_summaries"\)/,
  );
  assert.doesNotMatch(
    prizeReadinessSource,
    /get_admin_card_stock_subsku_summary",\s*\{\s*p_card_id:\s*null\s*\}/,
  );
});

test("legacy admin prize API validates planned stock against selected sub-SKU before saving", () => {
  assert.match(adminPrizeRouteSource, /getPrizeStockSummaries/);
  assert.match(adminPrizeRouteSource, /buildPrizeStockSelectionIssues/);
  assert.match(adminPrizeRouteSource, /buildPrizeStockShortages/);
  assert.match(
    adminPrizeRouteSource,
    /export async function POST\(request: Request\)[\s\S]*enforceSameOriginMutation\(request\)[\s\S]*const body = await bodyJson\(request\)/,
  );
  assert.match(
    adminPrizeRouteSource,
    /export async function DELETE\(request: Request\)[\s\S]*enforceSameOriginMutation\(request\)[\s\S]*const body = await bodyJson\(request\)/,
  );
  assert.match(
    adminPrizeRouteSource,
    /validatePlannedPrizeStock[\s\S]*stockSelectionBlockers[\s\S]*stockShortageBlockers[\s\S]*savePrizeRow/,
  );
});

test("single stock-unit edits use a distinct ledger event type", () => {
  const sql = migrationSql();
  assert.match(sql, /card_stock_ledger_edited_event/i);
  assert.match(sql, /event_type in \([\s\S]*'edited'[\s\S]*\)/i);
  assert.match(sql, /insert\s+into\s+public\.card_stock_ledger[\s\S]*'edited'/i);
  assert.match(sql, /card_stock_unit_edited/);
  assert.match(cardStockUnitRouteSource, /rpc\("edit_card_stock_unit"/);
  assert.doesNotMatch(
    cardStockUnitRouteSource,
    /from\("card_stock_ledger"\)\.insert/,
  );
});

test("admin stock-unit list does not return raw database error messages", () => {
  assert.doesNotMatch(
    cardStockUnitsRouteSource,
    /Response\.json\(\{\s*error:\s*error\.message/,
  );
  assert.match(cardStockUnitsRouteSource, /UNITS_LIST_FAILED/);
});

test("editable stock-unit rows preserve existing image storage paths", () => {
  assert.match(cardStockUnitsRouteSource, /image_storage_path/);
  assert.match(cardStockUnitsRouteSource, /imageStoragePath:\s*unit\.image_storage_path/);
  assert.match(clientSource, /useState\(\s*unit\.imageStoragePath \?\? ""/);
});

test("editable stock-unit list includes units a pack reserves or allocates", () => {
  // The list endpoint must surface reserved/allocated units, not just available,
  // so the per-unit Edit UI appears for units already used in a pack.
  assert.match(
    cardStockUnitsRouteSource,
    /\.in\(\s*"status"\s*,\s*\[\s*"available"\s*,\s*"reserved"\s*,\s*"allocated"\s*\]\s*\)/,
  );
  assert.doesNotMatch(cardStockUnitsRouteSource, /\.eq\(\s*"status"\s*,\s*"available"\s*\)/);
  // The manage-units section gates on all editable units, not only available.
  assert.match(clientSource, /const editableUnits =\s*\n?\s*group\.availableUnits \+ group\.reservedUnits \+ group\.allocatedUnits/);
});

test("random-pack save serializes the validated visible sub-SKU selection", () => {
  assert.match(
    clientSource,
    /const stockUnitKey = validStockUnitKey\(card, prize\.stockUnitKey\);[\s\S]*stockUnitSelectionMetadata\(card, stockUnitKey\)/,
  );
});

test("random-pack prize rows use catalog sub-category instead of hardcoded prize type", () => {
  assert.match(clientSource, /catalogCategoryOptions\.map/);
  assert.match(clientSource, /<span>Sub-category<\/span>/);
  assert.match(clientSource, /catalogCategoryLabel\(prize\.catalogCategory\)/);
  assert.match(
    clientSource,
    /metadata: \{[\s\S]*catalogCategory[\s\S]*catalogCategoryLabel[\s\S]*prizeCategory[\s\S]*sourceType/,
  );
  assert.doesNotMatch(clientSource, /<span>Prize type<\/span>/);
  assert.doesNotMatch(clientSource, /prizeCategoryOptions\.map/);
});

test("random-pack APIs validate selected catalog sub-category against the card row", () => {
  assert.match(prizeCategorySource, /function prizeCategoryForCatalogCategory/);
  assert.match(prizeCategorySource, /function catalogCategoryForPrizeCategory/);
  assert.match(adminCampaignRouteSource, /catalog_category/);
  assert.match(adminCampaignRouteSource, /metadata\.catalogCategory/);
  assert.match(adminCampaignRouteSource, /catalogCategoryLabel\(catalogCategory\)/);
  assert.match(adminCampaignRouteSource, /prizeCategoryForCatalogCategory\(catalogCategory\)/);
  assert.match(
    adminCampaignRouteSource,
    /selected prize items do not match the selected sub-category/,
  );
  assert.match(adminPrizeRouteSource, /catalog_category/);
  assert.match(adminPrizeRouteSource, /metadata\.catalogCategory/);
  assert.match(
    adminPrizeRouteSource,
    /Prize item does not match the selected sub-category/,
  );
});

test("random-pack editor does not silently retarget stale existing sub-SKUs", () => {
  assert.match(
    clientSource,
    /stockUnitKey:\s+existing[\s\S]*validStockUnitKey\(selectedCard, existing\.stockUnitKey\)[\s\S]*defaultStockUnitKey\(selectedCard\)/,
  );
  assert.match(
    clientSource,
    /stockUnitKey:\s+validStockUnitKey\([\s\S]*prize\.intendedStockUnitKey/,
  );
  assert.match(clientSource, /<option value="">Choose sub-SKU stock<\/option>/);
  assert.doesNotMatch(clientSource, /function normalizedStockUnitKey/);
});

test("random-pack editor does not offer a blank main-SKU option when sub-SKUs exist", () => {
  assert.match(clientSource, /missingStockUnitRows/);
  assert.match(clientSource, /Choose sub-SKU stock for every active prize row/);
  assert.match(clientSource, /!stockGroups\.length[\s\S]*No sub-SKU stock/);
  assert.doesNotMatch(
    clientSource,
    /selectedCard[\s\S]{0,120}Main SKU stock[\s\S]{0,120}Choose item first/,
  );
});

test("single stock-unit edits enforce condition-only identity for raw and sealed stock", () => {
  const sql = migrationSql();
  assert.match(
    cardStockUnitRouteSource,
    /const grade = condition === "graded" \? text\(body\?\.grade, 40\) \|\| null : null/,
  );
  assert.match(
    cardStockUnitRouteSource,
    /const certNumber =\s+condition === "graded" \? text\(body\?\.certNumber, 60\) \|\| null : null/,
  );
  assert.match(cardStockUnitRouteSource, /p_cert_number:\s*certNumber/);
  assert.match(
    sql,
    /if\s+v_condition\s+=\s+'graded'[\s\S]*else[\s\S]*v_grade\s*:=\s*null[\s\S]*v_grading_service\s*:=\s*null[\s\S]*v_cert_number\s*:=\s*null[\s\S]*v_gemrate_id\s*:=\s*null/i,
  );
});

test("single stock-unit edit and delete use transaction-safe RPCs", () => {
  const sql = migrationSql();
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.edit_card_stock_unit/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.delete_card_stock_unit/i);
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.edit_card_stock_unit[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public,\s*pg_temp/i,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.delete_card_stock_unit[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public,\s*pg_temp/i,
  );
  assert.match(sql, /stock_unit_not_editable/);
  assert.match(sql, /card_stock_unit_edited/);
  assert.match(sql, /card_stock_unit_deleted/);
  assert.match(sql, /grant execute on function public\.edit_card_stock_unit/i);
  assert.match(sql, /grant execute on function public\.delete_card_stock_unit/i);
});

test("editing a stock unit is allowed while a pack reserves or allocates it", () => {
  const sql = migrationSql();
  // The latest edit RPC must accept reserved/allocated units so admins can fix
  // a unit's identity or image after a pack uses it.
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.edit_card_stock_unit[\s\S]*status\s+in\s*\(\s*'available'\s*,\s*'reserved'\s*,\s*'allocated'\s*\)[\s\S]*stock_unit_not_editable/i,
  );
  // Deletion stays restricted to available units so a pack slot is never orphaned.
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.delete_card_stock_unit[\s\S]*and\s+status\s*=\s*'available'[\s\S]*stock_unit_not_removable/i,
  );
});

test("admin stock-unit route calls RPCs instead of split update plus ledger writes", () => {
  assert.match(cardStockUnitRouteSource, /enforceSameOriginMutation\(request\)/);
  assert.match(cardStockUnitRouteSource, /rpc\("edit_card_stock_unit"/);
  assert.match(cardStockUnitRouteSource, /rpc\("delete_card_stock_unit"/);
  assert.doesNotMatch(
    cardStockUnitRouteSource,
    /from\("card_stock_units"\)[\s\S]*\.update/,
  );
  assert.doesNotMatch(
    cardStockUnitRouteSource,
    /from\("card_stock_ledger"\)\.insert/,
  );
});
