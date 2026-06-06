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

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("successful pack open does not hydrate after every reveal-ready RPC result", () => {
  assert.match(openRouteSource, /function needsOpenItemHydration\(items: RawOpenItem\[\]\)/);
  const postHandler = between(
    openRouteSource,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
  );
  assert.match(
    postHandler,
    /const shouldHydrate = Boolean\(openId && needsOpenItemHydration\(items\)\);/,
  );
  assert.match(
    postHandler,
    /const resultItems = shouldHydrate\s*\?\s*await hydrateItems\(items, openId, session\.profileId\)\s*:\s*items;/,
  );
  assert.doesNotMatch(
    postHandler,
    /const hydrated = openId \? await hydrateItems\(items, openId, session\.profileId\) : items;/,
  );
});

test("hydration fallback is based on missing public reveal fields only", () => {
  const helper = between(
    openRouteSource,
    "function hasPublicRevealFields",
    "async function hydrateItems",
  );
  assert.match(helper, /typeof item\.name === "string"/);
  assert.match(helper, /typeof item\.displayTier === "string"/);
  assert.match(helper, /"imageUrl" in item/);
  assert.match(helper, /typeof item\.position === "number"/);
  assert.match(helper, /"valueThb" in item/);
  assert.doesNotMatch(helper, /draw_round_prizes/);
  assert.doesNotMatch(helper, /draw_round_prize_units/);
  assert.doesNotMatch(helper, /card_stock_units/);
  assert.doesNotMatch(helper, /weight/);
  assert.doesNotMatch(helper, /unlockAtSoldPct/);
});

test("auto-open page uses lightweight open-entry campaign loader", () => {
  assert.match(
    openPageSource,
    /import \{ getOpenCampaignForReveal, getTierAnimations, getYnotDashboardSlice \} from "@\/features\/ynot\/data";/,
  );
  assert.match(openPageSource, /getOpenCampaignForReveal\(campaignId, data\.viewer\)/);
  assert.doesNotMatch(openPageSource, /getCampaign\(campaignId/);
  assert.doesNotMatch(openPageSource, /bypassPublicCache/);
});

test("lightweight open-entry loader avoids full campaign detail reads", () => {
  const loader = between(
    dataSource,
    "export async function getOpenCampaignForReveal",
    "export async function getCampaign",
  );
  assert.match(loader, /OPEN_CAMPAIGN_SELECT/);
  assert.match(loader, /get_draw_round_inventory_summary/);
  assert.doesNotMatch(loader, /getPublicPrizeLineup/);
  assert.doesNotMatch(loader, /getCampaignPrizeReadiness/);
  assert.doesNotMatch(loader, /resolveLastPrizePreview/);
  assert.doesNotMatch(loader, /draw_round_prizes/);
  assert.doesNotMatch(loader, /draw_round_prize_units/);
  assert.doesNotMatch(loader, /card_stock_units/);
});
