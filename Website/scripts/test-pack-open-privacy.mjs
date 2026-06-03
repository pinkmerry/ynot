import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dataSource = readFileSync(new URL("../src/features/ynot/data.ts", import.meta.url), "utf8");
const openRouteSource = readFileSync(
  new URL("../src/app/api/ynot/gacha/open/route.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const crPackDetailSource = readFileSync(
  new URL("../src/features/ynot/cr/PackDetailExperience.tsx", import.meta.url),
  "utf8",
);
const componentsSource = readFileSync(
  new URL("../src/features/ynot/components.tsx", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);
const conversionApiSource = readFileSync(
  new URL("../src/lib/ynot/card-conversion-api.ts", import.meta.url),
  "utf8",
);
const shippingRouteSource = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
const hidePrizeMetadataMigration = readFileSync(
  new URL("../../Database/supabase/migrations/20260602190000_hide_prize_metadata_from_clients.sql", import.meta.url),
  "utf8",
);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("public campaign prize previews do not expose owner odds or stock target SKUs", () => {
  const helper = between(
    dataSource,
    "function privatePrizePreviewFields",
    "function cardForStockSku",
  );
  assert.match(helper, /includeSensitiveOdds/);
  assert.match(helper, /includeStockTarget/);

  const publicCampaignDetail = between(
    dataSource,
    "const prizeLineup = await getPublicPrizeLineup",
    "let readiness",
  );
  assert.match(publicCampaignDetail, /includeLocked:\s*includePrivateDetail/);
  assert.match(publicCampaignDetail, /includeSensitiveOdds:\s*includePrivateDetail/);
  assert.match(publicCampaignDetail, /includeStockTarget:\s*includePrivateDetail/);
  assert.doesNotMatch(publicCampaignDetail, /includeLocked:\s*true/);
  assert.doesNotMatch(publicCampaignDetail, /includeSensitiveOdds:\s*true/);
  assert.doesNotMatch(publicCampaignDetail, /includeStockTarget:\s*true/);

  const lineupMapper = between(
    dataSource,
    "async function getPublicPrizeLineup",
    "async function getPublicPrizeLineupsIndividually",
  );
  assert.doesNotMatch(lineupMapper, /\.\.\.prizeStockMetadata\(prize\)/);
  assert.doesNotMatch(lineupMapper, /weight:\s*Number\(prize\.weight/);
  assert.doesNotMatch(lineupMapper, /unlockAtSoldPct:\s*Number\(prize\.unlock_at_sold_pct/);
  assert.match(lineupMapper, /\.\.\.privatePrizePreviewFields\(prize,\s*options\)/);
});

test("anon and authenticated roles cannot select raw prize metadata", () => {
  assert.match(
    hidePrizeMetadataMigration,
    /revoke select on public\.draw_round_prizes from anon,\s*authenticated;/,
  );
  const publicGrant = between(
    hidePrizeMetadataMigration,
    "grant select (",
    ") on public.draw_round_prizes to anon, authenticated;",
  );
  assert.doesNotMatch(publicGrant, /\bmetadata\b/);
  assert.match(publicGrant, /\bvalue_thb\b/);
  assert.match(publicGrant, /\bconvert_coin_value\b/);
});

test("admin prize lineups still request private odds and stock targets", () => {
  const ownerLineupBlock = between(
    dataSource,
    "if (options.includePrivate && includePrizeLineups)",
    "const campaigns = rows.map",
  );
  assert.match(ownerLineupBlock, /includeSensitiveOdds:\s*true/);
  assert.match(ownerLineupBlock, /includeStockTarget:\s*true/);
});

test("pack-open API response is mapped through a public result shape", () => {
  const publicItem = between(
    openRouteSource,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
  );
  assert.doesNotMatch(publicItem, /prizeUnitId/);
  assert.doesNotMatch(publicItem, /weight/);
  assert.doesNotMatch(publicItem, /unlockAtSoldPct/);
  assert.doesNotMatch(publicItem, /soldPct/);

  const postHandler = between(
    openRouteSource,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
  );
  assert.match(postHandler, /p_profile_id:\s*session\.profileId/);
  assert.doesNotMatch(postHandler, /p_profile_id:\s*body/);
});

test("customer campaign props hide house logic and internal prize inventory", () => {
  const publicPrize = between(
    dataSource,
    "function publicPrizePreview",
    "function publicPrizeLineup",
  );
  assert.match(publicPrize, /id:\s*`public-prize-\$\{index \+ 1\}`/);
  assert.doesNotMatch(publicPrize, /cardId:/);
  assert.doesNotMatch(publicPrize, /cardImageStoragePath:/);
  assert.doesNotMatch(publicPrize, /plannedQuantity:/);
  assert.doesNotMatch(publicPrize, /availableUnits:/);
  assert.doesNotMatch(publicPrize, /totalUnits:/);
  assert.doesNotMatch(publicPrize, /tierRank:/);
  assert.doesNotMatch(publicPrize, /sourceType:/);
  assert.doesNotMatch(publicPrize, /intendedStock/);

  const publicCampaign = between(
    dataSource,
    "function publicYnotCampaign",
    "function localOwnerMockPrizeLineup",
  );
  assert.match(publicCampaign, /logicMode:\s*undefined/);
  assert.match(publicCampaign, /totalPrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /availablePrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /eligiblePrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /initialEligiblePrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /awardedPrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /voidPrizeUnits:\s*undefined/);
  assert.match(publicCampaign, /readinessBlockers:\s*undefined/);

  const publicCampaignCall = between(
    dataSource,
    "const campaign = toYnotCampaign(",
    "if (!includePrivateDetail && !campaign.openable) return [];",
  );
  assert.match(publicCampaignCall, /includePrivateDetail\s*\?\s*campaign\s*:\s*publicYnotCampaign\(campaign\)/);
});

test("pack-open reveal result does not expose raw internal open ids", () => {
  const resultMapper = between(
    openRouteSource,
    "function toPublicOpenResult",
    "function openErrorMessage",
  );
  assert.doesNotMatch(resultMapper, /openId:\s*readString\(raw\.openId\)/);
  assert.match(resultMapper, /openId:\s*publicCode/);
  assert.doesNotMatch(resultMapper, /logicMode/);
  assert.doesNotMatch(resultMapper, /remaining/);
  assert.doesNotMatch(resultMapper, /weight/);
  assert.doesNotMatch(resultMapper, /unlockAtSoldPct/);
});

test("customer pack pages do not describe stock-sensitive house logic", () => {
  assert.doesNotMatch(crPackDetailSource, /Drop odds shift with stock/i);
  assert.doesNotMatch(crPackDetailSource, /better odds for chase tiers/i);
  assert.doesNotMatch(crPackDetailSource, /Tier availability is calculated from remaining inventory/i);
  assert.doesNotMatch(componentsSource, /Drop behavior and tier availability are calculated/i);
  assert.doesNotMatch(componentsSource, /pack setup and remaining inventory/i);
});

test("customer campaign detail does not use dev auth as a private data gate", () => {
  const getCampaignBlock = between(
    dataSource,
    "export async function getCampaign",
    "async function getPaymentMethodsImpl",
  );
  const includePrivateGateLine = getCampaignBlock
    .split("\n")
    .find((line) => line.includes("const includePrivateDetail"));
  assert.equal(includePrivateGateLine?.trim(), "const includePrivateDetail = viewer.isAdmin;");
  assert.doesNotMatch(includePrivateGateLine ?? "", /isDevAuthAllowed/);
});

test("pack-open browser payload uses public campaign slug and server resolves it internally", () => {
  const openPanelBlock = between(
    clientSource,
    "export function GachaOpenPanel",
    "const revealOverlay = revealResult ?",
  );
  assert.match(openPanelBlock, /campaignId:\s*campaign\.slug/);
  assert.doesNotMatch(openPanelBlock, /campaignId:\s*campaign\.id/);

  assert.match(openRouteSource, /async function resolveOpenCampaignId/);
  assert.doesNotMatch(openRouteSource, /if \(!campaignId \|\| !isUuid\(campaignId\)\)/);
  assert.match(openRouteSource, /p_draw_round_id:\s*resolvedCampaignId/);
});

test("customer pull history does not expose raw open, reward, or campaign ids", () => {
  const historyMapper = between(
    dataSource,
    "export async function getGachaOpenHistory",
    "export async function getExchanges",
  );
  assert.doesNotMatch(historyMapper, /id:\s*open\.id/);
  assert.doesNotMatch(historyMapper, /campaignId:\s*open\.draw_round_id/);
  assert.doesNotMatch(historyMapper, /id:\s*item\.id/);
  assert.match(historyMapper, /id:\s*publicCode/);
  assert.match(historyMapper, /id:\s*`\$\{publicCode\}-\$\{item\.result_position \?\? index \+ 1\}`/);

  const openHistoryType = between(
    typesSource,
    "export type YnotGachaOpenHistory",
    "export type YnotGachaOpenItem",
  );
  assert.doesNotMatch(openHistoryType, /campaignId:/);
});

test("customer collection actions use opaque tokens instead of raw collection item UUIDs", () => {
  assert.match(dataSource, /collectionItemActionToken/);
  const collectionMapper = between(
    dataSource,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
  );
  assert.doesNotMatch(collectionMapper, /id:\s*item\.id/);
  assert.match(collectionMapper, /id:\s*await collectionItemActionToken\(profileId,\s*item\.id\)/);

  const conversionHandler = between(
    conversionApiSource,
    "export async function handleCardConversionRequest",
    "return Response.json({ result: publicConversionResult(data) });",
  );
  assert.match(
    conversionHandler,
    /const resolvedCollectionItemIds = await resolveCollectionItemActionTokens\(/,
  );
  assert.match(conversionHandler, /p_collection_item_ids:\s*resolvedCollectionItemIds/);
  assert.doesNotMatch(
    conversionHandler,
    /p_collection_item_ids:\s*(ids|collectionItemTokens|tokens)\b/,
  );
  assert.doesNotMatch(conversionHandler, /ids\.some\(\(item\) => !UUID_RE\.test\(item\)\)/);

  const shippingHandler = between(
    shippingRouteSource,
    "export async function POST",
    "return Response.json({ result: publicShippingResult(data) });",
  );
  assert.match(
    shippingHandler,
    /const resolvedCollectionItemIds = await resolveCollectionItemActionTokens\(/,
  );
  assert.match(shippingHandler, /p_collection_item_ids:\s*resolvedCollectionItemIds/);
  assert.doesNotMatch(
    shippingHandler,
    /p_collection_item_ids:\s*(collectionItemIds|collectionItemTokens|ids|tokens)\b/,
  );
  assert.doesNotMatch(shippingHandler, /ids\.some\(\(item\) => !UUID_RE\.test\(item\)\)/);
  assert.doesNotMatch(clientSource, /item\.id\.slice\(0,\s*8\)/);
});

test("collection display maps each collection item to its exact open item", () => {
  const collectionMapper = between(
    dataSource,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
  );
  assert.match(
    collectionMapper,
    /select\("collection_item_id,gacha_open_item_id,card_stock_unit_id"\)/,
  );
  assert.match(collectionMapper, /sourceOpenItemIdByCollectionItem\.set\(itemId,\s*openItemId\)/);
  assert.match(collectionMapper, /openItemsById\.get\(directOpenItemId\)/);
  assert.match(
    collectionMapper,
    /openItemsByOpenAndCard\.get\(`\$\{item\.source_id\}:\$\{item\.card_id\}`\)\?\.shift\(\)/,
  );
});
