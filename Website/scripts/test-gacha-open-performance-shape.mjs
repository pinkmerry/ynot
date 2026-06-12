import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const openRouteSource = readFileSync(
  new URL("../src/app/api/ynot/gacha/open/route.ts", import.meta.url),
  "utf8",
);
const openPageSource = readFileSync(
  new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);
const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
const inventorySummaryMigrationName = readdirSync(migrationsDir)
  .filter((name) => name.endsWith("_last_prize_final_quantity_summary.sql"))
  .sort()
  .at(-1);
assert.ok(inventorySummaryMigrationName, "missing final quantity inventory summary migration");
const inventorySummaryMigrationSource = readFileSync(
  new URL(inventorySummaryMigrationName, migrationsDir),
  "utf8",
);

function between(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex !== -1, `missing section start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(endIndex !== -1, `missing section end: ${label}`);
  return source.slice(startIndex, endIndex);
}

function assertShape(source, regex, label) {
  assert.ok(regex.test(source), `missing shape: ${label}`);
}

function assertNoShape(source, regex, label) {
  assert.ok(!regex.test(source), `unexpected shape: ${label}`);
}

test("successful pack open does not hydrate after stock-image-proven RPC results", () => {
  assertShape(
    openRouteSource,
    /function needsOpenItemHydration\(items: RawOpenItem\[\]\)/,
    "conditional hydration helper",
  );
  const postHandler = between(
    openRouteSource,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
    "open route handler",
  );
  assertShape(
    postHandler,
    /const shouldHydrate = Boolean\(\s*openId &&\s*items\.length <= MAX_OPEN_HYDRATION_ITEMS &&\s*needsOpenItemHydration\(items\),\s*\);/,
    "bounded conditional hydration decision",
  );
  assertShape(
    openRouteSource,
    /const MAX_OPEN_HYDRATION_ITEMS = 20;/,
    "hydration fallback item cap",
  );
  assertShape(
    postHandler,
    /const resultItems = shouldHydrate\s*\?\s*await hydrateItems\(items, openId, session\.profileId\)\s*:\s*items;/,
    "conditional hydration result",
  );
  assertNoShape(
    postHandler,
    /const hydrated = openId \? await hydrateItems\(items, openId, session\.profileId\) : items;/,
    "unconditional hydration fallback",
  );
});

test("hydration fallback requires exact stock-image proof for normal awards", () => {
  const helper = between(
    openRouteSource,
    "function hasPublicRevealFields",
    "async function hydrateItems",
    "public reveal helper",
  );
  assertShape(helper, /typeof item\.name === "string"/, "public name field");
  assertShape(helper, /typeof item\.displayTier === "string"/, "public tier field");
  assertShape(
    helper,
    /item\.imageResolvedFromStockUnit === true/,
    "stock-unit image proof field",
  );
  assertShape(
    helper,
    /typeof item\.imageUrl === "string"[\s\S]*item\.imageUrl\.trim\(\)\.length > 0/,
    "proved public image value",
  );
  assertShape(helper, /item\.isLastPrize === true/, "last-prize image exception");
  assertNoShape(
    helper,
    /item\.isLastPrize === true \|\|\s*\(\s*typeof item\.imageUrl === "string"/,
    "plain catalog image fast path",
  );
  assertShape(helper, /typeof item\.position === "number"/, "public position field");
  assertShape(helper, /"valueThb" in item/, "public value field");
  assertNoShape(helper, /draw_round_prizes/, "private backend lookup");
  assertNoShape(helper, /draw_round_prize_units/, "private backend lookup");
  assertNoShape(helper, /card_stock_units/, "private backend lookup");
  assertNoShape(helper, /weight/, "private selection field");
  assertNoShape(helper, /unlockAtSoldPct/, "private unlock field");
});

test("auto-open page uses lightweight open-entry campaign loader", () => {
  assertShape(
    openPageSource,
    /getOpenCampaignForReveal/,
    "open-entry loader import",
  );
  assertShape(
    openPageSource,
    /getOpenCampaignForReveal\(campaignId, data\.viewer\)/,
    "open-entry loader call",
  );
  assertNoShape(openPageSource, /getCampaign\(campaignId/, "full campaign loader call");
  assertNoShape(openPageSource, /bypassPublicCache/, "full detail cache bypass");
});

test("lightweight open-entry loader avoids full campaign detail reads", () => {
  const loader = between(
    dataSource,
    "export async function getOpenCampaignForReveal",
    "export async function getCampaign",
    "open-entry loader",
  );
  const openEntryProjection = between(
    dataSource,
    "function toOpenRevealCampaign",
    "export async function getCampaign",
    "open-entry projection",
  );
  assertShape(loader, /OPEN_CAMPAIGN_SELECT/, "lightweight campaign selection");
  assertShape(loader, /get_draw_round_inventory_summary/, "inventory summary read");
  assertShape(openEntryProjection, /eligiblePrizeUnits/, "eligible inventory aggregate");
  assertShape(
    openEntryProjection,
    /hasOpenableInventory/,
    "explicit openability inventory gate",
  );
  assertShape(
    openEntryProjection,
    /logicMode === "inventory_gated"/,
    "locked inventory fallback gate",
  );
  assertNoShape(loader, /getPublicPrizeLineup/, "full detail helper");
  assertNoShape(loader, /getCampaignPrizeReadiness/, "readiness helper");
  assertNoShape(loader, /resolveLastPrizePreview/, "preview helper");
  assertNoShape(loader, /draw_round_prizes/, "private backend lookup");
  assertNoShape(loader, /draw_round_prize_units/, "private backend lookup");
  assertNoShape(loader, /card_stock_units/, "private backend lookup");
});

test("inventory summary exposes public openable aggregates for the open-entry loader", () => {
  assertShape(
    inventorySummaryMigrationSource,
    /'availableWinSlots'/,
    "playable win-slot aggregate",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /'eligibleUnits'/,
    "eligible/openable aggregate",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /floor\(puc\.available_physical_units::numeric \/ puc\.bundle_quantity\)/,
    "bundle physical-units to playable-slots math",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /puc\.unlock_at_sold_pct <= ri\.sold_pct/,
    "inventory-gated unlock parity",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /last_prize_available_units/,
    "final-slot last-prize availability",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /ri\.remaining_slots <= coalesce\(nwc\.available_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/,
    "Last Prize counts when available aggregate can finish",
  );
  assertShape(
    inventorySummaryMigrationSource,
    /ri\.remaining_slots <= coalesce\(nwc\.eligible_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/,
    "Last Prize counts when eligible aggregate can finish",
  );
  assertNoShape(
    inventorySummaryMigrationSource,
    /'unlockAtSoldPct'|'weight'|'stockUnitGroupKey'|'certNumber'|'gemrateId'/,
    "private fields in public summary JSON",
  );
});
