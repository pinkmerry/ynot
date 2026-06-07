import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const openRouteSource = read("src/app/api/ynot/gacha/open/route.ts");
const rateLimitSource = read("src/lib/security/rate-limit.ts");
const openIntentSource = read("src/features/ynot/open-intent.ts");
const clientSource = read("src/features/ynot/client.tsx");

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
  assert.match(openRouteSource, /const MAX_GACHA_OPEN_QUANTITY_PER_REQUEST = 20;/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units"/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units:ip"/);
  assert.match(openRouteSource, /cost: quantity/);
  assert.match(openRouteSource, /open_quantity_chunk_required/);
});

test("100-pack opens are chunked before calling the API", () => {
  assert.match(clientSource, /const GACHA_OPEN_RPC_CHUNK_SIZE = 20;/);
  assert.match(clientSource, /function openQuantityChunks/);
  assert.match(clientSource, /function mergeOpenResults/);
  assert.match(clientSource, /for \(const chunk of chunks\)/);
  assert.match(clientSource, /quantity: chunk\.quantity/);
  assert.match(clientSource, /chunk\.index/);
  assert.match(openIntentSource, /chunkIndex = 0/);
  assert.match(openIntentSource, /part-\$\{safeChunkIndex\}/);
});
