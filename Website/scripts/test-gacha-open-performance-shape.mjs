import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("successful pack open does not hydrate after every reveal-ready RPC result", () => {
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
    /const shouldHydrate = Boolean\(openId && needsOpenItemHydration\(items\)\);/,
    "conditional hydration decision",
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

test("hydration fallback is based on missing public reveal fields only", () => {
  const helper = between(
    openRouteSource,
    "function hasPublicRevealFields",
    "async function hydrateItems",
    "public reveal helper",
  );
  assertShape(helper, /typeof item\.name === "string"/, "public name field");
  assertShape(helper, /typeof item\.displayTier === "string"/, "public tier field");
  assertShape(helper, /"imageUrl" in item/, "public image field");
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
  assertShape(loader, /OPEN_CAMPAIGN_SELECT/, "lightweight campaign selection");
  assertShape(loader, /get_draw_round_inventory_summary/, "inventory summary read");
  assertNoShape(loader, /getPublicPrizeLineup/, "full detail helper");
  assertNoShape(loader, /getCampaignPrizeReadiness/, "readiness helper");
  assertNoShape(loader, /resolveLastPrizePreview/, "preview helper");
  assertNoShape(loader, /draw_round_prizes/, "private backend lookup");
  assertNoShape(loader, /draw_round_prize_units/, "private backend lookup");
  assertNoShape(loader, /card_stock_units/, "private backend lookup");
});
