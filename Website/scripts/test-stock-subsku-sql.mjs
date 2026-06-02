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
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
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

test("random-pack save serializes the validated visible sub-SKU selection", () => {
  assert.match(
    clientSource,
    /const stockUnitKey = validStockUnitKey\(card, prize\.stockUnitKey\);[\s\S]*stockUnitSelectionMetadata\(card, stockUnitKey\)/,
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
  assert.match(
    cardStockUnitRouteSource,
    /const grade = condition === "graded" \? text\(body\?\.grade, 40\) \|\| null : null/,
  );
  assert.match(
    cardStockUnitRouteSource,
    /const certNumber =\s+condition === "graded" \? text\(body\?\.certNumber, 60\) \|\| null : null/,
  );
  assert.match(cardStockUnitRouteSource, /if \(certNumber\)/);
});
