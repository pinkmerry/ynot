import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readinessSource = readFileSync(
  new URL("../src/features/ynot/prize-readiness.ts", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);

test("readiness no longer counts prize units one prize at a time", () => {
  assert.ok(
    !/\bcountPrizeUnits\s*\(/.test(readinessSource),
    "the per-prize countPrizeUnits loop must be gone (it was the N+1 storm)",
  );
});

test("readiness aggregates prize-unit counts from a single bulk read", () => {
  assert.match(readinessSource, /aggregateNonVoidPrizeUnitCounts\(/);
  assert.match(
    readinessSource,
    /\.from\("draw_round_prize_units"\)[\s\S]{0,200}\.eq\("draw_round_id"/,
    "must read all non-void units for the campaign in one query",
  );
});

test("readiness paginates the prize-unit read to survive PostgREST max_rows", () => {
  assert.match(
    readinessSource,
    /\.range\(\s*offset/,
    "the bulk read must page through with .range() so large packs are not truncated",
  );
});

test("readiness can reuse a preloaded row + inventory to skip redundant fetches", () => {
  assert.match(
    readinessSource,
    /preloaded\?\s*:\s*\{\s*row\?\s*:\s*DrawRoundRow;\s*inventory\?\s*:\s*InventorySummary\s*\}/,
    "getCampaignPrizeReadiness must accept an optional preloaded { row, inventory }",
  );
  assert.match(
    readinessSource,
    /preloaded\?\.inventory !== undefined/,
    "must skip the inventory RPC when inventory is preloaded",
  );
});

test("customer detail paths pass preloaded row + inventory into readiness", () => {
  // Both the cached public loader and the dynamic getCampaign path already hold
  // the row + inventory, so they must hand them to readiness (no re-fetch).
  const calls = dataSource.match(
    /getCampaignPrizeReadiness\(supabase, row\.id, \{\s*row,\s*inventory,\s*\}\)/g,
  );
  assert.ok(
    calls && calls.length >= 2,
    "loadPublicCampaignDetailImpl and getCampaign must pass { row, inventory }",
  );
});
