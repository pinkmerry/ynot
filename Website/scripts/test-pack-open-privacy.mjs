import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dataSource = readFileSync(new URL("../src/features/ynot/data.ts", import.meta.url), "utf8");
const serverAddressesSource = readFileSync(
  new URL("../src/features/ynot/server-addresses.ts", import.meta.url),
  "utf8",
);
const openRouteSource = readFileSync(
  new URL("../src/app/api/ynot/gacha/open/route.ts", import.meta.url),
  "utf8",
);
const gachaOpenPageSource = readFileSync(
  new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url),
  "utf8",
);
const packsPageSource = readFileSync(
  new URL("../src/app/(store)/packs/page.tsx", import.meta.url),
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
const crYPackSource = readFileSync(
  new URL("../src/features/ynot/cr/YPackExperience.tsx", import.meta.url),
  "utf8",
);
const crHistorySource = readFileSync(
  new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
  "utf8",
);
const identityPageSource = readFileSync(
  new URL("../src/app/(store)/account/identities/page.tsx", import.meta.url),
  "utf8",
);
const identitiesPanelSource = readFileSync(
  new URL("../src/features/auth/IdentitiesPanel.tsx", import.meta.url),
  "utf8",
);
const identityUnlinkRouteSource = readFileSync(
  new URL("../src/app/api/auth/identities/unlink/route.ts", import.meta.url),
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
const addressesRouteSource = readFileSync(
  new URL("../src/app/api/ynot/addresses/route.ts", import.meta.url),
  "utf8",
);
const walletRouteSource = readFileSync(
  new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
  "utf8",
);
const collectionActionTokenSource = readFileSync(
  new URL("../src/lib/ynot/collection-action-tokens.ts", import.meta.url),
  "utf8",
);
const addressActionTokenSource = readFileSync(
  new URL("../src/lib/ynot/address-action-tokens.ts", import.meta.url),
  "utf8",
);
const paymentMethodActionTokenSource = readFileSync(
  new URL("../src/lib/ynot/payment-method-action-tokens.ts", import.meta.url),
  "utf8",
);
const identityActionTokenSource = readFileSync(
  new URL("../src/lib/auth/identity-action-tokens.ts", import.meta.url),
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
  assert.match(publicItem, /bundleQuantity:\s*publicBundleQuantity/);
  assert.doesNotMatch(publicItem, /prizeUnitId/);
  assert.doesNotMatch(publicItem, /drawRoundPrizeUnitIds/);
  assert.doesNotMatch(publicItem, /stockUnitGroupKey/);
  assert.doesNotMatch(publicItem, /stockUnitFilter/);
  assert.doesNotMatch(publicItem, /weight/);
  assert.doesNotMatch(publicItem, /unlockAtSoldPct/);
  assert.doesNotMatch(publicItem, /soldPct/);
  // Raw prize tier ("high"/"normal") must never ship to customers; only the
  // customer-facing displayTier rarity may travel in the public open item.
  assert.doesNotMatch(publicItem, /\btier:/);
  assert.match(publicItem, /displayTier:/);

  const publicItemType = between(
    openRouteSource,
    "type PublicOpenItem = {",
    "type PublicOpenResult = {",
  );
  assert.match(publicItemType, /bundleQuantity\?: number/);
  assert.doesNotMatch(publicItemType, /prizeUnitId/);
  assert.doesNotMatch(publicItemType, /drawRoundPrizeUnitIds/);
  assert.doesNotMatch(publicItemType, /stockUnitGroupKey/);
  assert.doesNotMatch(publicItemType, /stockUnitFilter/);
  assert.doesNotMatch(publicItemType, /\btier:/);
  assert.match(publicItemType, /displayTier:/);

  const openItemType = between(
    typesSource,
    "export type YnotGachaOpenItem",
    "export type YnotGachaOpenResult",
  );
  assert.doesNotMatch(openItemType, /\btier:/);
  assert.match(openItemType, /displayTier:/);

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
  // Raw weighting-class tier must not ship to customers; displayTier carries
  // the customer-facing rarity instead.
  assert.doesNotMatch(publicPrize, /\btier:/);
  assert.match(publicPrize, /displayTier:/);

  const publicCampaign = between(
    dataSource,
    "function publicYnotCampaign",
    "function localOwnerMockPrizeLineup",
  );
  assert.match(publicCampaign, /id:\s*campaign\.slug/);
  assert.doesNotMatch(
    publicCampaign,
    /\.\.\.campaign/,
    "public campaign projection must not spread raw campaign objects into client props",
  );
  for (const privateField of [
    "logicMode",
    "totalPrizeUnits",
    "availablePrizeUnits",
    "eligiblePrizeUnits",
    "initialEligiblePrizeUnits",
    "awardedPrizeUnits",
    "voidPrizeUnits",
    "readinessBlockers",
    "categoryIds",
    "lastPrizeCardId",
    "lastPrizeStockUnitKey",
    "bannerImageStoragePath",
  ]) {
    assert.doesNotMatch(
      publicCampaign,
      new RegExp(`${privateField}:`),
      `${privateField} must not be serialized in public campaign props, even as undefined`,
    );
  }

  const publicCampaignCall = between(
    dataSource,
    "const campaign = toYnotCampaign(",
    "return [customerCampaign];",
  );
  assert.match(publicCampaignCall, /includePrivateDetail\s*\?\s*campaign\s*:\s*publicYnotCampaign\(campaign\)/);

  const packsFeatureBlock = between(
    componentsSource,
    "featuredCampaignsList.map",
    "{isAdmin && featuredCampaignsList.length === 0",
  );
  assert.match(packsFeatureBlock, /data-pack-id=\{isAdmin \? campaign\.id : campaign\.slug\}/);

  const campaignCardBlock = between(
    componentsSource,
    "export function CampaignCard",
    "export function CampaignDetailPanel",
  );
  assert.match(campaignCardBlock, /data-pack-id=\{showAdminEdit \? campaign\.id : campaign\.slug\}/);
});

test("related public campaign feeds can show sold-out packs without widening every feed", () => {
  const impl = between(
    dataSource,
    "async function getCampaignsImpl",
    "const getPublicCampaignsCached",
  );
  assert.match(
    impl,
    /includeSoldOutPublic\s*=\s*options\.includeSoldOutPublic \?\? Boolean\(campaignIdOrSlug\)/,
  );
  assert.match(
    impl,
    /query = includeSoldOutPublic\s*\?\s*query\.in\("status", \["live", "closed"\]\)\s*:\s*query\.eq\("status", "live"\);/,
  );
  assert.match(
    impl,
    /campaign\.openable \|\|\s*\(includeSoldOutPublic && campaign\.soldOut\)/,
  );
  assert.doesNotMatch(
    impl,
    /campaigns\.filter\(\(campaign\) => campaign\.openable\)/,
  );

  const getCampaignsBlock = between(
    dataSource,
    "export async function getCampaigns",
    "async function getStoreCategoriesImpl",
  );
  assert.match(
    getCampaignsBlock,
    /if \(options\.campaignIdOrSlug\) return getCampaignsImpl\(options\);/,
  );
  assert.match(
    getCampaignsBlock,
    /options\.includeSoldOutPublic\s*\?\s*getPublicCampaignsWithSoldOutCached\(\)\s*:\s*getPublicCampaignsCached\(\)/,
  );
  const dashboardSliceBlock = between(
    dataSource,
    "export async function getYnotDashboardSlice",
    "export function getYnotDashboardData",
  );
  assert.match(
    dashboardSliceBlock,
    /includePrivate: viewer\.isAdmin \|\| isDevAuthAllowed\(\),\s*includeSoldOutPublic: selector\.includeSoldOutCampaigns,/,
  );
  assert.match(packsPageSource, /campaignVisibility:\s*"public"/);
  assert.match(packsPageSource, /includeSoldOutCampaigns:\s*true/);
});

test("non-admin dynamic campaign detail keeps sold-out public packs visible through public DTOs", () => {
  const getCampaignBlock = between(
    dataSource,
    "export async function getCampaign",
    "async function getPaymentMethodsImpl",
  );
  assert.match(
    getCampaignBlock,
    /const customerCampaign = includePrivateDetail \? campaign : publicYnotCampaign\(campaign\);/,
  );
  assert.match(
    getCampaignBlock,
    /if \(!includePrivateDetail && !campaign\.openable && !campaign\.soldOut\) return \[\];/,
  );
  assert.doesNotMatch(
    getCampaignBlock,
    /if \(!includePrivateDetail && !campaign\.openable\) return \[\];/,
  );
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
  const campaignDetailPanel = between(
    componentsSource,
    "export function CampaignDetailPanel",
    "export function RewardTierList",
  );
  assert.doesNotMatch(crPackDetailSource, /Drop odds shift with stock/i);
  assert.doesNotMatch(crPackDetailSource, /better odds for chase tiers/i);
  assert.doesNotMatch(crPackDetailSource, /Tier availability is calculated from remaining inventory/i);
  assert.doesNotMatch(campaignDetailPanel, /Drop behavior and tier availability are calculated/i);
  assert.doesNotMatch(campaignDetailPanel, /pack setup and remaining inventory/i);
  assert.doesNotMatch(campaignDetailPanel, /tier information can change as inventory is sold or reserved/i);
  assert.doesNotMatch(campaignDetailPanel, /prize inventory may be missing/i);
  assert.doesNotMatch(campaignDetailPanel, /awaiting owner approval/i);
  assert.doesNotMatch(campaignDetailPanel, /Real prize pool required/i);
  assert.doesNotMatch(campaignDetailPanel, /prize pool is ready/i);
  for (const source of [crPackDetailSource, crYPackSource]) {
    assert.doesNotMatch(source, /Owner approval is required/i);
    assert.doesNotMatch(source, /Prize inventory is not ready/i);
    assert.doesNotMatch(source, /readinessBlockers\?\.\[0\]/);
  }
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
  assert.match(getCampaignBlock, /if \(looksLikeUuid\(campaignLookup\)\) return null;/);
  assert.match(getCampaignBlock, /const rawCampaignLookup = looksLikeUuid\(campaignLookup\);/);
  assert.match(getCampaignBlock, /if \(rawCampaignLookup && !includePrivateDetail\) return \[\];/);
  assert.match(
    getCampaignBlock,
    /rawCampaignLookup\s*\?\s*query\.eq\("id", campaignLookup\)\s*:\s*query\.eq\("slug", campaignLookup\)/,
  );
  assert.doesNotMatch(getCampaignBlock, /campaign\.id === campaignLookup/);
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
  const slugResolver = between(
    openRouteSource,
    "async function resolveOpenCampaignId",
    "function toPublicOpenItem",
  );
  assert.match(slugResolver, /\.eq\("status",\s*"live"\)/);
  assert.match(slugResolver, /\.eq\("visibility",\s*"public"\)/);
  assert.match(slugResolver, /\.eq\("approval_status",\s*"approved"\)/);
  assert.match(slugResolver, /\.select\("id,is_test"\)/);
  assert.match(slugResolver, /\.rpc\(\s*"profile_can_open_test_draw_round"/);
  assert.doesNotMatch(openRouteSource, /if \(!campaignId \|\| !isUuid\(campaignId\)\)/);
  assert.match(openRouteSource, /buildPreviewOpenResult\(resolvedCampaignId,\s*quantity\)/);
  assert.match(openRouteSource, /p_draw_round_id:\s*resolvedCampaignId/);
});

test("open page only renders auto-start reveal for openable campaigns", () => {
  assert.match(
    gachaOpenPageSource,
    /getCampaign\(campaignId,\s*\{\s*allowTestForCurrentViewer:\s*true,\s*bypassPublicCache:\s*true,\s*viewer:\s*data\.viewer,\s*\}\)/,
    "open entrypoints must bypass cached public detail so stale openable state cannot auto-start a sold-out pack",
  );
  assert.match(
    gachaOpenPageSource,
    /if \(campaign && campaign\.openable && autoStart\)/,
  );
  assert.doesNotMatch(
    gachaOpenPageSource,
    /if \(campaign && autoStart\)/,
  );
  assert.match(
    gachaOpenPageSource,
    /if \(campaign\) \{\s*redirect\(`\/packs\/\$\{campaign\.slug\}`\);\s*\}/,
  );
});

test("public campaign detail cache is bypassable for fresh openability gates", () => {
  const getCampaignBlock = between(
    dataSource,
    "export async function getCampaign",
    "async function getPaymentMethodsImpl",
  );
  assert.match(
    getCampaignBlock,
    /bypassPublicCache\?: boolean;/,
    "getCampaign should expose an explicit cache bypass option for open-entry freshness",
  );
  assert.match(
    getCampaignBlock,
    /if \(!options\.bypassPublicCache && !viewer\.isAdmin && !looksLikeUuid\(campaignLookup\)\)/,
    "public detail cache must be skipped when callers need fresh sold-out/openable state",
  );
});

test("legacy campaign card and detail disable open actions for sold-out packs", () => {
  const campaignCard = between(
    componentsSource,
    "export function CampaignCard",
    "export function CampaignDetailPanel",
  );
  assert.match(campaignCard, /const soldOut = isCampaignSoldOut\(campaign\);/);
  assert.match(campaignCard, /\{soldOut \? \(/);
  assert.match(campaignCard, />\s*Sold out\s*<\/button>/);
  assert.match(
    campaignCard,
    /\{soldOut \? \(\s*<button[\s\S]*className="primary-action"[\s\S]*disabled[\s\S]*>\s*Sold out\s*<\/button>\s*\) : \(\s*<Link[\s\S]*className="primary-action"[\s\S]*href=\{`\/gacha\/\$\{campaign\.slug\}\/open`\}[\s\S]*>\s*Open\s*<\/Link>\s*\)\}/,
  );
  assert.doesNotMatch(
    campaignCard,
    /<div className="product-actions">\s*<Link className="secondary-action" href=\{`\/gacha\/\$\{campaign\.slug\}`\}>[\s\S]*?Details[\s\S]*?<\/Link>\s*<Link className="primary-action" href=\{`\/gacha\/\$\{campaign\.slug\}\/open`\}>[\s\S]*?Open[\s\S]*?<\/Link>\s*<\/div>/,
  );

  const campaignDetailPanel = between(
    componentsSource,
    "export function CampaignDetailPanel",
    "export function RewardTierList",
  );
  assert.match(
    campaignDetailPanel,
    /const soldOut = isCampaignSoldOut\(campaign\);/,
  );
  assert.match(
    campaignDetailPanel,
    /const canOpen =\s*campaign\.demo \|\| \(!soldOut && \(campaign\.openable \|\| isDevAuthAllowed\(\)\)\);/,
  );
  assert.match(
    campaignDetailPanel,
    /const unavailableCopy = soldOut\s*\?\s*"Sold out"\s*:\s*"This pack is not ready to open yet\. Please check back later\.";/,
  );
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
  // Reward rarity must travel as a customer-safe displayTier, never the raw
  // "high"/"normal" prize tier read straight off the open item.
  assert.doesNotMatch(historyMapper, /tier:\s*item\.tier/);
  assert.match(historyMapper, /displayTier/);

  const openRewardType = between(
    typesSource,
    "export type YnotGachaOpenReward",
    "export type YnotGachaOpenHistory",
  );
  assert.doesNotMatch(openRewardType, /\btier\?:/);
  assert.match(openRewardType, /displayTier\?:/);

  const openHistoryType = between(
    typesSource,
    "export type YnotGachaOpenHistory",
    "export type YnotGachaOpenItem",
  );
  assert.doesNotMatch(openHistoryType, /campaignId:/);
});

test("customer collection actions use opaque tokens instead of raw collection item UUIDs", () => {
  assert.match(dataSource, /collectionItemActionToken/);
  assert.match(
    collectionActionTokenSource,
    /throw new Error\("Missing server-only collection action token secret\."\)/,
  );
  assert.doesNotMatch(collectionActionTokenSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(collectionActionTokenSource, /ynott-local|hardcoded/i);
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
    /resolvedCollectionItemIds\s*=\s*await resolveCollectionItemActionTokens\(/,
  );
  assert.match(conversionHandler, /catch \(error\)[\s\S]*Could not convert these cards/);
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
  assert.match(shippingHandler, /resolveAddressActionToken\(/);
  assert.match(shippingHandler, /p_address_id:\s*resolvedAddressId/);
  assert.doesNotMatch(shippingHandler, /p_address_id:\s*(addressId|addressToken)\b/);
  assert.match(
    shippingHandler,
    /resolvedCollectionItemIds\s*=\s*await resolveCollectionItemActionTokens\(/,
  );
  assert.match(shippingHandler, /catch \(error\)[\s\S]*Could not request shipping/);
  assert.match(shippingHandler, /p_collection_item_ids:\s*resolvedCollectionItemIds/);
  assert.doesNotMatch(
    shippingHandler,
    /p_collection_item_ids:\s*(collectionItemIds|collectionItemTokens|ids|tokens)\b/,
  );
  assert.doesNotMatch(shippingHandler, /ids\.some\(\(item\) => !UUID_RE\.test\(item\)\)/);
  for (const [name, source] of [
    ["client", clientSource],
    ["components", componentsSource],
    ["cr history", crHistorySource],
  ]) {
    assert.doesNotMatch(
      source,
      /\b(?:item|card|c)\.id\.slice\(/,
      `${name} must not render collection ids or action-token slices`,
    );
  }
});

test("customer login methods use public identity rows and opaque unlink tokens", () => {
  assert.match(identityPageSource, /identityActionToken/);
  assert.doesNotMatch(identityPageSource, /provider_subject/);
  assert.doesNotMatch(identityPageSource, /providerSubject/);
  assert.doesNotMatch(identityPageSource, /id:\s*session\.profileId/);
  assert.match(identityPageSource, /id:\s*await identityActionToken\(session\.profileId,\s*row\.id\)/);

  assert.doesNotMatch(identitiesPanelSource, /providerSubject/);
  assert.match(identitiesPanelSource, /JSON\.stringify\(\{ identityToken \}\)/);
  assert.doesNotMatch(identitiesPanelSource, /identityId/);

  assert.match(identityUnlinkRouteSource, /resolveIdentityActionToken/);
  assert.match(identityUnlinkRouteSource, /identityToken/);
  assert.doesNotMatch(identityUnlinkRouteSource, /provider_subject/);
  assert.doesNotMatch(identityUnlinkRouteSource, /payload\.identityId/);
  assert.doesNotMatch(identityUnlinkRouteSource, /error:\s*(listError|deleteError)\.message/);
  assert.match(identityUnlinkRouteSource, /identity_unlink_failed/);

  assert.match(
    identityActionTokenSource,
    /throw new Error\("Missing server-only identity action token secret\."\)/,
  );
  assert.doesNotMatch(identityActionTokenSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(identityActionTokenSource, /ynott-local|hardcoded/i);
});

test("customer addresses use opaque action tokens and hide database error details", () => {
  const addressMapper = between(
    dataSource,
    "export async function getAddresses",
    "async function getRankingsImpl",
  );
  const publicAddressMapper = between(
    serverAddressesSource,
    "export async function toYnotAddress",
    "function profileRowToAddressInput",
  );
  assert.match(addressMapper, /getProfileAddresses\(profileId\)/);
  assert.match(publicAddressMapper, /id:\s*await addressActionToken\(profileId,\s*row\.id\)/);
  assert.doesNotMatch(addressMapper, /id:\s*row\.id/);
  assert.doesNotMatch(publicAddressMapper, /id:\s*row\.id/);
  assert.match(addressesRouteSource, /toYnotAddress\(session\.profileId,\s*data as UserAddressRow\)/);
  assert.doesNotMatch(addressesRouteSource, /address:\s*\{\s*id:\s*data\.id/);
  assert.match(shippingRouteSource, /normalizeAddressActionToken/);
  assert.match(shippingRouteSource, /resolveAddressActionToken/);
  assert.doesNotMatch(shippingRouteSource, /function normalizeUuid/);
  assert.doesNotMatch(shippingRouteSource, /const UUID_RE\s*=/);
  assert.match(
    addressActionTokenSource,
    /throw new Error\("Missing server-only address action token secret\."\)/,
  );
  assert.doesNotMatch(addressActionTokenSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(addressActionTokenSource, /ynott-local|hardcoded/i);

  assert.match(addressesRouteSource, /addressSaveFailure/);
  assert.match(addressesRouteSource, /console\.warn\("ynot_address_save_failed"/);
  assert.doesNotMatch(
    addressesRouteSource,
    /error:\s*(insertError|clearError|defaultError)\.message/,
  );
});

test("customer wallet top-ups use public DTOs without raw payment-flow ids", () => {
  const publicTopUpBlock = between(
    dataSource,
    "export function publicTopUp",
    "export async function getCollection",
  );
  assert.match(publicTopUpBlock, /delete publicFields\.id/);
  assert.match(publicTopUpBlock, /delete publicFields\.profileId/);
  assert.match(publicTopUpBlock, /delete publicFields\.adminNote/);
  assert.doesNotMatch(publicTopUpBlock, /providerCode/);
  assert.doesNotMatch(publicTopUpBlock, /providerMessage/);
  assert.doesNotMatch(publicTopUpBlock, /id:\s*paymentMethod\.id/);
  assert.doesNotMatch(publicTopUpBlock, /code:\s*topUp\.paymentMethod\.code/);
  assert.match(dataSource, /getPaymentMethods\(\)\.then\(publicPaymentMethods\)/);
  assert.match(dataSource, /getTopUps\(profileId\)\.then\(\(topUps\) => topUps\.map\(publicTopUp\)\)/);
  assert.match(
    walletRouteSource,
    /getTopUps\(session\.profileId\)\.then\(\(topUps\) => topUps\.map\(publicTopUp\)\)/,
  );
  assert.match(walletRouteSource, /getPaymentMethods\(\)\.then\(publicPaymentMethods\)/);
  assert.match(walletRouteSource, /resolvePaymentMethodActionToken\(paymentMethodToken\)/);
  assert.doesNotMatch(walletRouteSource, /\.eq\("id", paymentMethodToken\)/);
  assert.doesNotMatch(walletRouteSource, /payment_method_id:\s*paymentMethodToken/);
  assert.doesNotMatch(walletRouteSource, /error:\s*uploadError\.message/);
  assert.match(walletRouteSource, /wallet_top_up_slip_upload_failed/);
  assert.match(
    paymentMethodActionTokenSource,
    /throw new Error\("Missing server-only payment method action token secret\."\)/,
  );
  assert.doesNotMatch(paymentMethodActionTokenSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(paymentMethodActionTokenSource, /ynott-local|hardcoded/i);
  assert.match(walletRouteSource, /topUp:\s*publicTopUp\(toTopUp\(responseTopUp\)\)/);
  assert.doesNotMatch(walletRouteSource, /return jsonNoStore\(\{ topUp: toTopUp/);
});

test("customer order histories use public codes instead of raw row ids", () => {
  const publicExchangeBlock = between(
    dataSource,
    "function publicExchangeOrder",
    "export async function getShipping",
  );
  const publicShippingBlock = between(
    dataSource,
    "function publicShippingRequest",
    "export async function getAddresses",
  );
  const dashboardLoader = between(
    dataSource,
    "export async function getYnotDashboardSlice",
    "const ownerApprovalRequests",
  );

  assert.match(publicExchangeBlock, /id:\s*order\.publicCode/);
  assert.match(publicExchangeBlock, /adminNote:\s*null/);
  assert.match(publicShippingBlock, /id:\s*request\.publicCode/);
  assert.match(publicShippingBlock, /adminNote:\s*null/);
  assert.match(dashboardLoader, /viewer\.isAdmin \? orders : orders\.map\(publicExchangeOrder\)/);
  assert.match(dashboardLoader, /viewer\.isAdmin \? requests : requests\.map\(publicShippingRequest\)/);
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
