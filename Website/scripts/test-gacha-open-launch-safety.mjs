import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const openRouteSource = read("src/app/api/ynot/gacha/open/route.ts");
const rateLimitSource = read("src/lib/security/rate-limit.ts");
const openIntentSource = read("src/features/ynot/open-intent.ts");
const clientSource = read("src/features/ynot/client.tsx");
const typesSource = read("src/features/ynot/types.ts");
const wranglerCiSource = read("wrangler.website.ci.jsonc");

function latestMigrationWithSuffix(suffix) {
  const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const name = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .at(-1);
  assert.ok(name, `missing migration ending with ${suffix}`);
  return readFileSync(new URL(name, migrationsDir), "utf8");
}

function sourceBlock(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing block end: ${label}`);
  return source.slice(startIndex, endIndex);
}

test("RPC proof migration marks stock-unit images without widening the public response", () => {
  const migration = latestMigrationWithSuffix("_open_gacha_stock_image_proof.sql");
  const publicOpenItemType = sourceBlock(
    openRouteSource,
    "type PublicOpenItem = {",
    "type PublicOpenResult = {",
    "public open item type",
  );
  const publicMapper = sourceBlock(
    openRouteSource,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
    "public item mapper",
  );

  assert.match(migration, /imageResolvedFromStockUnit/);
  assert.match(
    migration,
    /'imageResolvedFromStockUnit',\s*nullif\(stock\.image_url,\s*''\)\s+is\s+not\s+null/i,
  );
  assert.match(
    migration,
    /'imageResolvedFromStockUnit',\s*unit_image_resolved_from_stock_unit/i,
  );
  assert.doesNotMatch(
    publicOpenItemType,
    /imageResolvedFromStockUnit|cardId|prizeUnitId|draw_round|card_stock|weight|unlockAtSoldPct/,
  );
  assert.doesNotMatch(
    publicMapper,
    /imageResolvedFromStockUnit|cardId:|prizeUnitId:|draw_round_prize_unit_id|card_stock_unit_id|weight|unlockAtSoldPct/,
  );
});

test("weighted API rate limit increments by pack quantity", () => {
  const migration = latestMigrationWithSuffix("_weighted_api_rate_limit.sql");

  assert.match(migration, /create or replace function public\.consume_api_rate_limit_weighted/);
  assert.match(migration, /p_cost integer default 1/);
  assert.match(migration, /effective_cost := greatest\(coalesce\(p_cost,\s*1\),\s*1\)/);
  assert.match(migration, /limits\.count \+ effective_cost/);
  assert.match(rateLimitSource, /cost\?: number/);
  assert.match(rateLimitSource, /normalizedRateLimitCost/);
  assert.match(rateLimitSource, /p_cost: cost/);
  assert.match(rateLimitSource, /existing\.count \+ cost/);
});

test("pack open API has request, profile-unit, and IP-unit launch guards", () => {
  assert.match(openRouteSource, /const gachaOpenRequestRateLimit = \{/);
  assert.match(openRouteSource, /const gachaOpenProfileUnitRateLimit = \{/);
  assert.match(openRouteSource, /const gachaOpenIpUnitRateLimit = \{/);
  assert.match(openRouteSource, /const MAX_OPEN_HYDRATION_ITEMS = 20;/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units"/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units:ip"/);
  assert.match(openRouteSource, /cost: quantity/);
  assert.match(openRouteSource, /quantity < 1 \|\| quantity > 100/);
  assert.match(openRouteSource, /items\.length <= MAX_OPEN_HYDRATION_ITEMS/);
  assert.doesNotMatch(openRouteSource, /open_quantity_chunk_required/);
});

test("100-pack opens remain one weighted API call", () => {
  const fireOpen = sourceBlock(
    clientSource,
    "function fireOpen",
    "function openAgain",
    "fire open handler",
  );
  const openAgain = sourceBlock(
    clientSource,
    "function openAgain",
    "function handleRevealClose",
    "open again handler",
  );
  assert.match(fireOpen, /postJson\("\/api\/ynot\/gacha\/open"/);
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.match(
    fireOpen,
    /openIntentIdempotencyKey\(\s*intentId \?\? openIntentId \?\? null,\s*campaign\.id,\s*targetQuantity/s,
  );
  assert.match(fireOpen, /if \(openRequestInFlightRef\.current\) return/);
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)/);
  assert.match(clientSource, /createOpenIntentId/);
  assert.match(openAgain, /if \(openRequestInFlightRef\.current\) return/);
  assert.match(openAgain, /fireOpen\(nextQuantity,\s*createOpenIntentId\(\)\)/);
  assert.doesNotMatch(clientSource, /GACHA_OPEN_RPC_CHUNK_SIZE|openQuantityChunks|mergeOpenResults/);
  assert.doesNotMatch(openIntentSource, /chunkIndex|part-\$\{safeChunkIndex\}/);
});

test("CI deploy config keeps paid CPU limit for pack-open protection", () => {
  assert.match(wranglerCiSource, /"limits"\s*:\s*\{\s*"cpu_ms"\s*:\s*30000\s*\}/s);
});

test("pack open API exposes only sanitized RPC remaining fields", () => {
  const rawOpenResultType = sourceBlock(
    openRouteSource,
    "type RawOpenResult = {",
    "type PublicDisplayTier",
    "raw open result type",
  );
  const publicOpenResultType = sourceBlock(
    openRouteSource,
    "type PublicOpenResult = {",
    "function deriveDisplayTier",
    "public open result type",
  );
  const sanitizer = sourceBlock(
    openRouteSource,
    "function sanitizeOpenRemaining",
    "function deriveDisplayTier",
    "remaining sanitizer",
  );
  const publicMapper = sourceBlock(
    openRouteSource,
    "function toPublicOpenResult",
    "function openErrorMessage",
    "public result mapper",
  );
  const resultType = sourceBlock(
    typesSource,
    "export type YnotGachaOpenResult = {",
    "export type YnotTierAnimation",
    "client open result type",
  );

  assert.match(rawOpenResultType, /remaining\?: unknown/);
  assert.match(publicOpenResultType, /remaining\?: PublicOpenRemaining/);
  assert.match(
    sanitizer,
    /availablePrizeUnits[\s\S]*remaining\.availableWinSlots[\s\S]*remaining\.availableUnits/,
  );
  assert.match(sanitizer, /remainingSlots|eligibleUnits|availableWinSlots/);
  assert.doesNotMatch(sanitizer, /\.from\(|\.rpc\(|createServiceSupabaseClient/);
  assert.match(publicMapper, /const remaining = sanitizeOpenRemaining\(raw\.remaining\)/);
  assert.match(publicMapper, /if \(remaining\) result\.remaining = remaining/);
  assert.match(resultType, /remaining\?: \{/);
  assert.match(resultType, /remainingSlots\?: number/);
  assert.match(resultType, /availablePrizeUnits\?: number/);
  assert.match(resultType, /eligibleUnits\?: number/);
  assert.match(resultType, /availableWinSlots\?: number/);
});

test("idempotent replay responses include fresh remaining stock from the RPC", () => {
  const migration = latestMigrationWithSuffix("_open_gacha_replay_remaining.sql");

  assert.match(
    migration,
    /pg_get_functiondef\(\s*'public\.open_gacha_campaign\(uuid,uuid,integer,text\)'::regprocedure\s*\)/,
  );
  assert.match(migration, /'replayed', true/);
  assert.match(migration, /'remaining'/);
  assert.match(
    migration,
    /get_draw_round_inventory_summary\(\s*existing_open\.draw_round_id,\s*p_profile_id\s*\)/,
  );
  assert.doesNotMatch(migration, /draw_round_id\s*=\s*p_draw_round_id/);
});
