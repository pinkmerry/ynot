import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const dataSource = read("src/features/ynot/data.ts");
const adminCardsRoute = read("src/app/api/ynot/admin/cards/route.ts");
const openRouteSource = read("src/app/api/ynot/gacha/open/route.ts");
const packageJson = JSON.parse(read("package.json"));

function latestMigrationWithSuffix(suffix) {
  const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const name = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .at(-1);
  assert.ok(name, `missing migration ending with ${suffix}`);
  return {
    name,
    source: readFileSync(new URL(name, migrationsDir), "utf8"),
  };
}

function sourceBlock(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing block end: ${label}`);
  return source.slice(startIndex, endIndex);
}

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function uncommentedSqlStatements(source) {
  return stripSqlComments(source)
    .split(";")
    .map((statement) =>
      statement
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*\(\s*/g, "(")
        .replace(/\s*\)\s*/g, ")")
        .replace(/\s*,\s*/g, ", ")
        .toLowerCase(),
    )
    .filter(Boolean);
}

test("package exposes the scoped low-risk optimization test script", () => {
  assert.equal(
    packageJson.scripts["test:low-risk-db-optimization"],
    "node --test scripts/test-low-risk-db-optimization.mjs",
  );
});

test("low-risk migration adds only the category-link index and avoids open RPC surfaces", () => {
  const { source } = latestMigrationWithSuffix("_low_risk_db_optimization.sql");
  const uncommentedSource = stripSqlComments(source);

  assert.deepEqual(uncommentedSqlStatements(source), [
    "create index if not exists draw_round_categories_round_category_idx on public.draw_round_categories(draw_round_id, category_id)",
  ]);
  assert.doesNotMatch(uncommentedSource, /open_gacha_campaign/i);
  assert.doesNotMatch(
    uncommentedSource,
    /create\s+or\s+replace\s+function\s+public\.open_gacha_campaign/i,
  );
  assert.doesNotMatch(uncommentedSource, /imageResolvedFromStockUnit|weight|unlock_at_sold_pct/i);
  assert.doesNotMatch(
    uncommentedSource,
    /alter\s+table\s+(?:public\.)?(?:draw_round_prizes|draw_round_prize_units|draw_round_prize_unit_cards|gacha_opens|gacha_open_items)\b/i,
  );
});

test("category and audit timeline reads use explicit projections", () => {
  assert.match(
    dataSource,
    /const DRAW_ROUND_CATEGORY_LINK_SELECT = "draw_round_id,category_id";/,
  );
  assert.match(
    dataSource,
    /const AUDIT_EVENT_TIMELINE_SELECT = "id,event_type,metadata,created_at";/,
  );

  const categoryReadBlocks = [
    sourceBlock(
      dataSource,
      'readOrEmpty("campaign_categories"',
      'readOrEmpty("campaign_inventory_summary"',
      "campaign category-link query",
    ),
    sourceBlock(
      dataSource,
      'readOrEmpty("campaign_detail_public_categories"',
      'readOrEmpty("campaign_detail_public_inventory"',
      "public campaign detail category-link query",
    ),
    sourceBlock(
      dataSource,
      'readOrEmpty("campaign_detail_categories"',
      'readOrEmpty("campaign_detail_inventory"',
      "campaign detail category-link query",
    ),
  ];
  for (const block of categoryReadBlocks) {
    assert.match(block, /\.from\("draw_round_categories"\)/);
    assert.match(block, /\.select\(DRAW_ROUND_CATEGORY_LINK_SELECT\)/);
    assert.doesNotMatch(block, /\.select\("\*"\)/);
  }

  const shippingAuditTimelineQuery = sourceBlock(
    dataSource,
    'readOrEmpty("shipping_audit_events"',
    "const events = auditEvents",
    "shipping audit timeline query",
  );
  assert.match(
    shippingAuditTimelineQuery,
    /\.select\(AUDIT_EVENT_TIMELINE_SELECT\)/,
  );
  assert.doesNotMatch(shippingAuditTimelineQuery, /\.select\("\*"\)/);

  const adminUserAuditTimelineQuery = sourceBlock(
    dataSource,
    'readOrEmpty("admin_user_audit"',
    "const auditTimelineById",
    "admin user audit timeline query",
  );
  assert.match(
    adminUserAuditTimelineQuery,
    /\.select\(AUDIT_EVENT_TIMELINE_SELECT\)/,
  );
  assert.doesNotMatch(adminUserAuditTimelineQuery, /\.select\("\*"\)/);
});

test("admin card usage uses aggregate stock summary instead of loading status rows", () => {
  const cardUsageSummary = sourceBlock(
    adminCardsRoute,
    "async function cardUsageSummary",
    "async function duplicateCardResponse",
    "card usage summary",
  );
  assert.match(cardUsageSummary, /rpc\("get_card_stock_summary"/);
  assert.doesNotMatch(cardUsageSummary, /\.limit\(50000\)/);

  const deleteHandler = sourceBlock(
    adminCardsRoute,
    "export async function DELETE",
    "export async function PATCH",
    "admin card delete handler",
  );
  assert.match(deleteHandler, /cardUsageSummary\(supabase,\s*cardId\)/);
  assert.doesNotMatch(deleteHandler, /\.limit\(50000\)/);
});

test("pack open public response and RPC contract are not widened by this pass", () => {
  const publicOpenDtoBlocks = [
    sourceBlock(
      openRouteSource,
      "type PublicOpenRemaining = {",
      "type PublicOpenItem = {",
      "public open remaining type",
    ),
    sourceBlock(
      openRouteSource,
      "type PublicOpenItem = {",
      "type PublicOpenResult = {",
      "public open item type",
    ),
    sourceBlock(
      openRouteSource,
      "type PublicOpenResult = {",
      "function sanitizeOpenRemaining",
      "public open result type",
    ),
    sourceBlock(
      openRouteSource,
      "function sanitizeOpenRemaining",
      "function deriveDisplayTier",
      "public open remaining sanitizer",
    ),
    sourceBlock(
      openRouteSource,
      "function toPublicOpenItem",
      "function toPublicOpenResult",
      "public open item mapper",
    ),
    sourceBlock(
      openRouteSource,
      "function toPublicOpenResult",
      "function openErrorMessage",
      "public open result mapper",
    ),
  ];
  const postHandler = sourceBlock(
    openRouteSource,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
    "open route handler",
  );

  const forbiddenPublicOpenItemFields =
    /imageResolvedFromStockUnit|cardId|prizeId|stockUnitId|stockUnitIds|cardStockUnitId|cardStockUnitIds|prizeUnitId|prizeUnitCardId|drawRoundPrizeId|drawRoundPrizeUnitId|drawRoundPrizeUnitCardId|card_id|prize_id|stock_unit_id|prize_unit_id|draw_round|card_stock|weight|unlockAtSoldPct|unlock_at_sold_pct/;

  assert.doesNotMatch(
    publicOpenDtoBlocks.join("\n"),
    forbiddenPublicOpenItemFields,
  );
  assert.match(postHandler, /rpc\("open_gacha_campaign"/);
  assert.doesNotMatch(postHandler, /cache|materialized|chunk|open_quantity_chunk_required/i);
});
