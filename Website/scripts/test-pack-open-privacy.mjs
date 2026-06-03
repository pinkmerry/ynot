import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dataSource = readFileSync(new URL("../src/features/ynot/data.ts", import.meta.url), "utf8");
const openRouteSource = readFileSync(
  new URL("../src/app/api/ynot/gacha/open/route.ts", import.meta.url),
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
