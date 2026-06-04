#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const passes = [];
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function readJson(rel) { return JSON.parse(read(rel)); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function pass(label) { passes.push(label); }
function fail(label) { failures.push(label); }
function check(rel, label, pattern) {
  if (!exists(rel)) {
    fail(`${label} (${rel})`);
    return;
  }
  if (pattern.test(read(rel))) pass(label);
  else fail(`${label} (${rel})`);
}
function notCheck(rel, label, pattern) {
  if (!exists(rel)) {
    fail(`${label} (${rel})`);
    return;
  }
  if (!pattern.test(read(rel))) pass(label);
  else fail(`${label} (${rel})`);
}
function sliceBetween(rel, start, end, label) {
  if (!exists(rel)) {
    fail(`${label} (${rel})`);
    return "";
  }
  const source = read(rel);
  const startIndex = source.indexOf(start);
  const endIndex =
    startIndex >= 0 && end ? source.indexOf(end, startIndex + start.length) : -1;
  if (startIndex < 0 || (end && endIndex < 0)) {
    fail(`${label} (${rel})`);
    return "";
  }
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}
function checkText(label, text, pattern, scope) {
  if (pattern.test(text)) pass(label);
  else fail(`${label} (${scope})`);
}
function notCheckText(label, text, pattern, scope) {
  if (!pattern.test(text)) pass(label);
  else fail(`${label} (${scope})`);
}

const routes = [
  "src/app/page.tsx",
  "src/app/(store)/gacha/[campaignId]/page.tsx",
  "src/app/(store)/gacha/[campaignId]/open/page.tsx",
  "src/app/(store)/collection/page.tsx",
  "src/app/(store)/ranking/page.tsx",
  "src/app/(store)/exchange/page.tsx",
  "src/app/(store)/shipping/page.tsx",
  "src/app/(store)/wallet/page.tsx",
  "src/app/(store)/profile/page.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/top-ups/page.tsx",
  "src/app/admin/campaigns/page.tsx",
  "src/app/admin/categories/page.tsx",
  "src/app/admin/prizes/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/shipping/page.tsx",
  "src/app/admin/rankings/page.tsx",
  "src/app/admin/settings/page.tsx",
  "src/app/admin/audit/page.tsx",
];
for (const route of routes) {
  if (exists(route)) pass(`${route} exists`);
  else fail(`${route} missing`);
}

const apis = [
  "src/app/api/ynot/wallet/route.ts",
  "src/app/api/ynot/addresses/route.ts",
  "src/app/api/ynot/gacha/open/route.ts",
  "src/app/api/ynot/collection/convert/route.ts",
  "src/app/api/ynot/exchange/route.ts",
  "src/app/api/ynot/shipping/route.ts",
  "src/app/api/ynot/admin/top-ups/route.ts",
  "src/app/api/ynot/admin/payment-methods/route.ts",
  "src/app/api/ynot/admin/shipping/route.ts",
  "src/app/api/ynot/admin/campaigns/route.ts",
  "src/app/api/ynot/admin/campaigns/cost/route.ts",
  "src/app/api/ynot/admin/card-stock/route.ts",
  "src/app/api/ynot/admin/categories/route.ts",
  "src/app/api/ynot/admin/cards/route.ts",
  "src/app/api/ynot/admin/cards/image/route.ts",
  "src/app/api/ynot/admin/prizes/route.ts",
  "src/app/api/ynot/admin/users/route.ts",
  "src/app/api/ynot/admin/merge-requests/route.ts",
  "src/app/api/line/login/start/route.ts",
  "src/app/api/line/callback/route.ts",
];
for (const api of apis) {
  if (exists(api)) pass(`${api} exists`);
  else fail(`${api} missing`);
}

notCheck("src/app/page.tsx", "root no longer redirects to wireframes", /redirect\(["']\/ynot-wireframes\.html/);
check("src/app/layout.tsx", "production metadata is set", /YNOT · TCG Lucky Draw/);
check("src/features/ynot/StorePreferences.tsx", "normal web login and signup navigation exist", /href="\/signup"[\s\S]*href="\/login"|href="\/login"[\s\S]*href="\/signup"/);
check("src/app/page.tsx", "home page reads category, tag, and sort filters from URL search params", /searchParams[\s\S]*normalizeHomeSeries\(params\?\.series\)[\s\S]*normalizeHomeTag\(params\?\.tag\)[\s\S]*normalizeHomeSort\(params\?\.sort\)/);
check("src/app/(store)/packs/page.tsx", "packs page reads series and tag filters from URL search params", /validSeriesParams[\s\S]*validTagParams[\s\S]*initialSeries[\s\S]*initialTag[\s\S]*<YPackExperience/);
check("src/app/(store)/packs/page.tsx", "packs page remounts CR filter state when query filters change", /key=\{`\$\{initialSeries\}:\$\{initialTag\}`\}/);
check("src/features/ynot/cr/YPackExperience.tsx", "CR packs view applies URL-driven series and tag filters", /initialTag[\s\S]*normalizeTag\(initialTag\)[\s\S]*campaignMatchesTag/);
check("src/features/ynot/components.tsx", "home category and tag filters are real links that preserve filter state", /homeFilterHref[\s\S]*href=\{homeFilterHref\(\{[\s\S]*series: category\.series,[\s\S]*tag: homeFilter\.tag,[\s\S]*sort: homeFilter\.sort,[\s\S]*\}\)\}/);
check("src/features/ynot/components.tsx", "home campaigns are sorted by selected sort option", /function sortedCampaigns[\s\S]*sort === "latest"[\s\S]*coins-desc[\s\S]*filteredCampaigns[\s\S]*sortedCampaigns\(filtered, filter\.sort\)/);
check("src/features/ynot/StorePreferences.tsx", "sort select updates the URL query", /export function StoreSortSelect[\s\S]*router\.replace\(\s*homeSortHref\(\{ \.\.\.homeFilter, sort \}\),[\s\S]*scroll: false/);
check("src/features/ynot/components.tsx", "customer pack card labels price per pack instead of per random", /coins per pack[\s\S]*\/pack/);
check("src/features/auth/AuthForm.tsx", "LINE login is available from auth pages", /\/api\/line\/login\/start\?mode=login/);
check("src/app/(store)/profile/personal-info/page.tsx", "personal info page exposes LINE connect flow", /mode=connect[\s\S]*lineHref/);
check("src/features/ynot/client.tsx", "personal info form renders LINE connect action", /Connect \/ reconnect LINE/);
check("src/app/api/line/callback/route.ts", "LINE callback validates state and links identity", /state !== storedState\.state[\s\S]*linkLineIdentity/);
check("src/app/api/line/login/start/route.ts", "LINE login requires configured production site origin", /NEXT_PUBLIC_SITE_URL[\s\S]*NODE_ENV === "production"[\s\S]*NEXT_PUBLIC_SITE_URL is required before production LINE login/);
check("src/app/api/line/callback/route.ts", "LINE callback exchanges with trusted redirect URI", /NEXT_PUBLIC_SITE_URL[\s\S]*redirect_uri:\s*redirectUri/);
check("src/app/api/line/login/start/route.ts", "LINE login next path rejects backslash/protocol-relative redirects", /parsed\.origin !== base\.origin[\s\S]*parsed\.pathname/);
check("src/app/api/line/callback/route.ts", "LINE callback next path rejects backslash/protocol-relative redirects", /parsed\.origin !== base\.origin[\s\S]*parsed\.pathname/);
// linkLineIdentity refuses to auto-link a LINE token whose email already
// belongs to another profile. The old shape created a merge_request inline
// (verified_email_matches_existing_profile) and returned merge_required.
// After A4 the shape changed: it returns login_required and the caller
// sends the user to sign in with that email first — no spurious P_line is
// created. Either shape proves the protection is in place.
check(
  "src/lib/line/link-identity.ts",
  "LINE email matches refuse to auto-link accounts",
  /profileByVerifiedEmail[\s\S]*(login_required|verified_email_matches_existing_profile[\s\S]*merge_required)/,
);
notCheck("src/lib/line/link-identity.ts", "LINE identity sync does not reassign conflicting identities by upsert", /from\("user_identities"\)\.upsert/);
check("src/features/auth/actions.ts", "logout clears canonical and legacy session cookies", /luckyDrawSessionCookie[\s\S]*sessionCookieClearOptions[\s\S]*legacyLuckyDrawSessionCookie[\s\S]*sessionCookieClearOptions/);
check("src/features/ynot/client.tsx", "wallet top-up posts slip upload API", /fetch\("\/api\/ynot\/wallet", \{[\s\S]*method: "POST",[\s\S]*body: form,[\s\S]*\}\)/);
check("src/features/ynot/client.tsx", "address form calls address API", /\/api\/ynot\/addresses/);
check("src/features/ynot/client.tsx", "gacha open button calls API", /\/api\/ynot\/gacha\/open/);
check("src/lib/security/same-origin.ts", "same-origin mutation helper rejects Fetch Metadata cross-site requests", /sec-fetch-site[\s\S]*cross-site/);
check("src/app/api/ynot/gacha/open/route.ts", "gacha open POST rejects cross-origin cookie mutations", /enforceSameOriginMutation[\s\S]*enforceSameOriginMutation\(request\)/);
check("src/app/api/ynot/gacha/open/route.ts", "gacha open POST resolves public campaign slugs server-side", /function isUuid[\s\S]*resolveOpenCampaignId[\s\S]*if \(!slug \|\| isUuid\(slug\)\) return null[\s\S]*\.eq\("status", "live"\)[\s\S]*\.eq\("visibility", "public"\)[\s\S]*\.eq\("approval_status", "approved"\)[\s\S]*profile_can_open_test_draw_round/);
check("src/app/api/ynot/gacha/open/route.ts", "gacha open POST rejects unsafe idempotency keys", /function normalizeIdempotencyKey[\s\S]*Invalid idempotency key/);
notCheck("src/app/api/ynot/gacha/open/route.ts", "gacha open POST does not return raw database errors", /Response\.json\(\{\s*error:\s*error\.message/);
notCheck("src/app/api/ynot/gacha/open/route.ts", "gacha open POST does not spread raw RPC results to the browser", /result:\s*\{\s*\.\.\.raw/);
check("src/app/api/ynot/gacha/open/route.ts", "gacha open response is allowlisted through public reveal serializers", /function toPublicOpenItem[\s\S]*function toPublicOpenResult[\s\S]*result:\s*toPublicOpenResult/);
const publicOpenItemSource = sliceBetween(
  "src/app/api/ynot/gacha/open/route.ts",
  "function toPublicOpenItem",
  "function toPublicOpenResult",
  "gacha open public item serializer",
);
notCheckText(
  "gacha open public item serializer strips internal pull metadata",
  publicOpenItemSource,
  /(?:cardId|prizeUnitId|soldPct|logicMode|weight|effectiveWeight|unlockAtSoldPct|effectiveUnlockAtSoldPct)/,
  "gacha open public item serializer",
);
const publicGachaOpenTypes = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotGachaOpenItem",
  "export type YnotTierAnimation",
  "public gacha open result types",
);
notCheckText(
  "public gacha open result types omit internal pull metadata",
  publicGachaOpenTypes,
  /(?:cardId|prizeUnitId|logicMode|remaining)/,
  "public gacha open result types",
);
check("src/features/ynot/cr/HistoryExperience.tsx", "collection actions call conversion and shipping APIs", /\/api\/ynot\/collection\/convert[\s\S]*\/api\/ynot\/shipping/);
check("src/app/api/ynot/collection/convert/route.ts", "collection conversion route delegates to hardened handler", /handleCardConversionRequest/);
check("src/app/api/ynot/exchange/route.ts", "legacy exchange route delegates to hardened handler", /handleCardConversionRequest/);
check("src/lib/ynot/card-conversion-api.ts", "card conversion API rejects cross-origin cookie mutations", /enforceSameOriginMutation\(request\)/);
check("src/lib/ynot/card-conversion-api.ts", "card conversion API validates action tokens and idempotency keys", /isCollectionItemActionToken[\s\S]*IDEMPOTENCY_KEY_RE[\s\S]*normalizeCollectionItemActionTokens[\s\S]*resolveCollectionItemActionTokens/);
notCheck("src/lib/ynot/card-conversion-api.ts", "card conversion API does not return raw RPC errors", /Response\.json\(\{\s*error:\s*error\.message/);
notCheck("src/lib/ynot/card-conversion-api.ts", "card conversion API does not expose ledger ids", /ledgerId/);
check("src/lib/ynot/card-conversion-api.ts", "card conversion API returns allowlisted RPC result", /function publicConversionResult[\s\S]*totalCoins[\s\S]*itemCount[\s\S]*replayed/);
check("src/app/api/ynot/shipping/route.ts", "shipping request rejects cross-origin cookie mutations", /enforceSameOriginMutation\(request\)/);
check("src/app/api/ynot/shipping/route.ts", "shipping request validates action tokens and idempotency keys", /normalizeAddressActionToken[\s\S]*IDEMPOTENCY_KEY_RE[\s\S]*normalizeCollectionItemActionTokens[\s\S]*normalizeIdempotencyKey[\s\S]*resolveAddressActionToken[\s\S]*resolveCollectionItemActionTokens[\s\S]*p_address_id:\s*resolvedAddressId[\s\S]*p_collection_item_ids:\s*resolvedCollectionItemIds/);
notCheck("src/app/api/ynot/shipping/route.ts", "shipping request does not return raw RPC errors", /Response\.json\(\s*\{[\s\S]*\berror\s*:\s*error.message/);
check("src/app/api/ynot/shipping/route.ts", "shipping request returns allowlisted RPC result", /function publicShippingResult[\s\S]*publicCode[\s\S]*itemCount[\s\S]*replayed[\s\S]*result:\s*publicShippingResult/);
check("src/app/admin/shipping/page.tsx", "admin shipping page loads all customer requests", /getShipping\(undefined,\s*true\)[\s\S]*AdminShippingConsole/);
const shippingItemTypeSource = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotShippingItem",
  "\nexport type ",
  "shipping item type source slice",
);
const shippingCustomerTypeSource = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotShippingCustomer",
  "\nexport type ",
  "shipping customer type source slice",
);
const shippingAddressSnapshotTypeSource = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotShippingAddressSnapshot",
  "\nexport type ",
  "shipping address snapshot type source slice",
);
const shippingTimelineTypeSource = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotShippingTimelineEvent",
  "\nexport type ",
  "shipping timeline type source slice",
);
const shippingRequestTypeSource = sliceBetween(
  "src/features/ynot/types.ts",
  "export type YnotShippingRequest",
  "\nexport type ",
  "shipping request type source slice",
);
checkText(
  "shipping item DTO carries reward source context",
  shippingItemTypeSource,
  /sourceCampaignTitle[\s\S]*sourceOpenCode/,
  "YnotShippingItem",
);
checkText(
  "shipping customer DTO exists",
  shippingCustomerTypeSource,
  /export type YnotShippingCustomer/,
  "YnotShippingCustomer",
);
checkText(
  "shipping address snapshot DTO exists",
  shippingAddressSnapshotTypeSource,
  /export type YnotShippingAddressSnapshot/,
  "YnotShippingAddressSnapshot",
);
checkText(
  "shipping timeline DTO exists",
  shippingTimelineTypeSource,
  /export type YnotShippingTimelineEvent/,
  "YnotShippingTimelineEvent",
);
checkText(
  "shipping request DTO carries fulfilment context",
  shippingRequestTypeSource,
  /(?=[\s\S]*items\?: YnotShippingItem\[\])(?=[\s\S]*customer\?: YnotShippingCustomer \| null)(?=[\s\S]*addressSnapshot\?: YnotShippingAddressSnapshot \| null)(?=[\s\S]*timeline\?: YnotShippingTimelineEvent\[\])/,
  "YnotShippingRequest",
);
const shippingLoaderSource = sliceBetween(
  "src/features/ynot/data.ts",
  "export async function getShipping",
  "function publicShippingRequest",
  "shipping loader source slice",
);
checkText(
  "shipping loader enriches admin fulfilment context",
  shippingLoaderSource,
  /(?=[\s\S]*shipping_request_items)(?=[\s\S]*collection_items)(?=[\s\S]*profiles)(?=[\s\S]*user_addresses)(?=[\s\S]*gacha_opens)(?=[\s\S]*draw_rounds)(?=[\s\S]*audit_events)/,
  "getShipping",
);
const adminShippingTrackingGuard = sliceBetween(
  "src/app/api/ynot/admin/shipping/route.ts",
  "if (\n    status === \"shipped\"",
  "const adminNote",
  "admin shipping tracking guard",
);
checkText("admin shipped status requires tracking", adminShippingTrackingGuard, /status === "shipped"[\s\S]*Tracking provider and tracking number are required before marking a shipment shipped\./, "admin shipping tracking guard");
notCheckText("admin delivered status does not require tracking", adminShippingTrackingGuard, /status === "delivered"/, "admin shipping tracking guard");
check("src/app/api/ynot/admin/shipping/route.ts", "admin shipping route rejects cross-origin status mutations", /enforceSameOriginMutation\(request\)[\s\S]*if \(crossOrigin\) return crossOrigin[\s\S]*request\.json/);
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping console allows direct pickup and event delivery transitions", /function nextShippingStatuses[\s\S]*case "submitted":[\s\S]*\["submitted", "packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\][\s\S]*case "packing":[\s\S]*\["packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\][\s\S]*case "ready_for_pickup":[\s\S]*\["ready_for_pickup", "picked_up", "delivered", "cancelled"\][\s\S]*statusOptions\.map/);
check("src/app/admin/users/[profileId]/page.tsx", "admin User 360 route renders user detail history", /getAdminUserDetail[\s\S]*AdminUser360/);
const orderListSource = sliceBetween(
  "src/features/ynot/components.tsx",
  "export function OrderList",
  "export function AdminSectionShell",
  "customer order list source slice",
);
const personalInfoShippingSource = sliceBetween(
  "src/features/ynot/cr/PersonalInfoExperience.tsx",
  "function ShippingHistorySection",
  "",
  "personal info shipping history source slice",
);
checkText(
  "customer shipping history shows item source and tracking",
  orderListSource,
  /order\.items[\s\S]*sourceCampaignTitle[\s\S]*ynotShippingTrackingLabel\(order\)/,
  "OrderList",
);
checkText(
  "personal info shipment history shows item source and tracking",
  personalInfoShippingSource,
  /shippingRewardLabel\(shp\)[\s\S]*shippingSourceLabel\(shp\)[\s\S]*ynotShippingTrackingLabel\(shp\)/,
  "ShippingHistorySection",
);
const collectionConvertPanelSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function CollectionConvertPanel",
  "export function AdminTopUpActions",
  "customer collection convert panel source slice",
);
checkText(
  "customer shipping panel confirms complete shipment details",
  collectionConvertPanelSource,
  /isCompleteShippingAddress[\s\S]*showShippingConfirm[\s\S]*This reward will be locked/,
  "CollectionConvertPanel",
);
check("../Database/supabase/migrations/20260604100000_shipping_operations_context.sql", "shipping migration stores address snapshots and server-side shipment guards", /address_snapshot jsonb[\s\S]*shipping_minimum_coin_value_required[\s\S]*shipping_tracking_required/);
check("src/features/ynot/client.tsx", "admin payment settings call payment method API", /\/api\/ynot\/admin\/payment-methods/);
check("src/features/ynot/client.tsx", "admin campaign form calls campaign API", /\/api\/ynot\/admin\/campaigns/);
check("src/features/ynot/client.tsx", "admin campaign create refreshes server data after save", /import \{ useRouter \} from "next\/navigation"[\s\S]*AdminCampaignForm[\s\S]*const router = useRouter\(\)[\s\S]*\/api\/ynot\/admin\/campaigns[\s\S]*router\.refresh\(\)/);
check("src/features/ynot/client.tsx", "admin category form calls category API", /AdminCategoryForm[\s\S]*\/api\/ynot\/admin\/categories/);
check("src/features/ynot/client.tsx", "admin campaign form and update rows edit customer card labels", /Customer card labels[\s\S]*displayTags/);
check("src/features/ynot/client.tsx", "admin campaign action panel submits review and archives campaigns", /\/api\/ynot\/admin\/campaigns\/lifecycle[\s\S]*Submit owner review[\s\S]*Archive private/);
check("src/features/ynot/prize-tier.ts", "random pack tier model defines Rainbow Gold Silver Bronze order", /value: "rainbow"[\s\S]*value: "gold"[\s\S]*value: "silver"[\s\S]*value: "bronze"[\s\S]*allowsRandomPsa10: true/);
check("src/features/ynot/client.tsx", "admin campaign form includes flexible tier toggles and row controls", /Rainbow, Gold, Silver, Bronze tiers[\s\S]*admin-tier-toggle-grid[\s\S]*updateTierActive[\s\S]*admin-prize-tier-stack[\s\S]*updateTierCount[\s\S]*Fill remainder/);
check("src/features/ynot/client.tsx", "bronze PSA10 uses random PSA10 while higher tiers use specific cards", /function prizeCatalogCardsFor[\s\S]*canPrizeDisplayTierUseRandomPsa10[\s\S]*filter\(isRandomPsa10Card\)[\s\S]*filter\(\(card\) => !isRandomPsa10Card\(card\)\)[\s\S]*Lowest\/base tier\. PSA10 uses the Random PSA10 catalog item/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API enforces PSA10 item against display tier", /isRandomPsa10PrizeCard[\s\S]*canPrizeDisplayTierUseRandomPsa10[\s\S]*PSA10 prize item does not match the selected display tier/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API enforces PSA10 item against display tier", /isRandomPsa10PrizeCard[\s\S]*canPrizeDisplayTierUseRandomPsa10[\s\S]*PSA10 prize item does not match the selected display tier/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API allocates DB rank from live rows while preserving display tier rank", /async function resolvePrizeRank[\s\S]*existingDisplayRow[\s\S]*usedRanks[\s\S]*while \(usedRanks\.has\(rank\)\) rank \+= 1[\s\S]*async function savePrizeRow[\s\S]*insert\(rowPatch\)[\s\S]*isUniqueConstraintError/);
notCheck("src/features/ynot/client.tsx", "admin prize pool direct-assignment form remains removed", /export function AdminPrizePoolForm/);
check("src/features/ynot/types.ts", "public prize preview carries card image metadata", /YnotPrizePreview[\s\S]*cardCode\?:[\s\S]*cardGrade\?:[\s\S]*cardImageUrl\?:[\s\S]*cardImageStoragePath\?:[\s\S]*cardPrizeCategory\?:/);
check("src/features/ynot/data.ts", "public prize lineup selects card image metadata", /getPublicPrizeLineupsBatch[\s\S]*select\(\s*"id,name,card_code,grade,image_url,image_storage_path,prize_category",?\s*\)[\s\S]*getPublicPrizeLineup[\s\S]*select\(\s*"id,name,card_code,grade,image_url,image_storage_path,prize_category",?\s*\)/);
check("src/features/ynot/data.ts", "public prize lineup maps card image metadata", /getPublicPrizeLineupsBatch[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:[\s\S]*getPublicPrizeLineup[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:/);
check("src/features/ynot/components.tsx", "public pack detail renders prize images in lineup", /function PrizeLineupImage[\s\S]*prize\.cardImageUrl[\s\S]*<img[\s\S]*function PrizeLineup[\s\S]*<PrizeLineupImage prize=\{prize\}/);
check("src/app/globals.css", "public prize lineup images keep stable card thumbnail layout", /reward-prize-image[\s\S]*aspect-ratio: 3 \/ 4[\s\S]*object-fit: contain/);
check("src/features/ynot/types.ts", "admin prize pool item carries card image metadata", /YnotPrizePoolItem[\s\S]*cardCode\?:[\s\S]*cardGrade\?:[\s\S]*cardImageUrl\?:[\s\S]*cardImageStoragePath\?:/);
check("src/features/ynot/data.ts", "admin prize pool reader selects card image metadata", /getAdminPrizePool\(\)[\s\S]*from\("cards"\)[\s\S]*select\(\s*"id,name,card_code,grade,image_url,image_storage_path,prize_category(?:,[^"]*)?",?\s*\)/);
check("src/features/ynot/data.ts", "admin prize pool reader maps card image metadata", /cardCode:[\s\S]*cardGrade:[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:[\s\S]*cardPrizeCategory:/);
check("src/features/ynot/client.tsx", "admin prize picker exposes selected card preview identity", /function AdminPrizeCardPicker[\s\S]*data-selected-card-id[\s\S]*catalogCardId[\s\S]*selected-card-preview/);
check("src/features/ynot/client.tsx", "admin prize picker renders image with stable fallback", /function AdminPrizeCardImage[\s\S]*photoUrl|function AdminPrizeCardImage[\s\S]*imageUrl[\s\S]*admin-prize-card-placeholder/);
check("src/features/ynot/client.tsx", "admin campaign prize rows show selected card image in rank tile", /admin-prize-rank-cell[\s\S]*AdminPrizeCardImage[\s\S]*AdminPrizeCardPicker[\s\S]*showPreview=\{false\}[\s\S]*showSearch=\{false\}[\s\S]*testIdPrefix=\{`campaign-prize-\$\{prize\.localId\}`\}/);
check("src/app/globals.css", "admin campaign prize rank tile uses a larger card image", /admin-prize-rank-cell[\s\S]*align-self: stretch[\s\S]*admin-prize-rank-cell \.admin-prize-card-thumb[\s\S]*aspect-ratio: 5 \/ 7[\s\S]*max-width: 160px/);
notCheck("src/features/ynot/client.tsx", "campaign prize draft does not silently fallback invalid selected card to first option", /cardId:\s*existingCardId\s*\|\|\s*firstCatalogCardId/);
notCheck("src/features/ynot/client.tsx", "campaign row selected card does not mask invalid card with first option", /const selectedCardId =[\s\S]{0,260}:\s*itemOptions\[0\]\?\.catalogCardId/);
check("src/features/ynot/client.tsx", "admin campaign form uses a horizontal info prize readiness builder", /admin-pack-builder-layout[\s\S]*admin-pack-info-panel[\s\S]*admin-prize-workspace[\s\S]*admin-readiness-panel/);
check("src/app/globals.css", "admin campaign builder stacks pack info prize builder and readiness as full-width sections", /admin-pack-builder-layout[\s\S]*grid-template-columns: 1fr[\s\S]*admin-pack-info-panel[\s\S]*admin-prize-workspace[\s\S]*admin-readiness-panel/);
check("src/app/globals.css", "admin campaign builder keeps pack info and prize tiers responsive", /admin-pack-info-panel \.admin-form-grid[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[\s\S]*admin-prize-tier-head[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 0\.82fr\)[\s\S]*@media \(max-width: 720px\)[\s\S]*admin-prize-tier-head[\s\S]*grid-template-columns: 1fr/);
notCheck("src/features/ynot/client.tsx", "admin campaign create form hides value weight unlock fields from draft prize builder", /admin-top-prize-controls[\s\S]{0,900}<span>Value<\/span>|className="admin-prize-table-head"[\s\S]{0,260}<span>Value<\/span>|className="admin-prize-table-head"[\s\S]{0,320}<span>Weight<\/span>|High unlock 30%/);
const adminCampaignInitialPrizePayload = sliceBetween(
  "src/features/ynot/client.tsx",
  "initialPrizes: activePrizeDrafts.map((prize) => {",
  "metadata: {",
  "admin campaign initial prize payload slice",
);
notCheckText(
  "admin campaign initial prize payload omits owner odds fields",
  adminCampaignInitialPrizePayload,
  /(?:valueThb|weight|unlockAtSoldPct)\s*:/,
  "AdminCampaignForm initialPrizes",
);
check("src/features/ynot/client.tsx", "owner approval queue exposes campaign review links", /export function OwnerApprovalQueue[\s\S]*\/admin\/campaigns\/\$\{request\.campaign\.id\}\/review[\s\S]*Review <AdminIcon/);
const ownerApprovalQueueSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function OwnerApprovalQueue",
  "// ---------- Owner Approval Review",
  "owner approval queue source slice",
);
checkText(
  "owner approval queue remains owner-only entry surface",
  ownerApprovalQueueSource,
  /viewerRole[\s\S]*isOwner[\s\S]*Review[\s\S]*Owner only/,
  "OwnerApprovalQueue",
);
const adminOwnerReviewSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function AdminOwnerReview",
  "export function AdminCampaignActionPanel",
  "admin owner review source slice",
);
checkText(
  "owner review remains the owner odds surface",
  adminOwnerReviewSource,
  /cardEdits[\s\S]*weight[\s\S]*unlockAtSoldPct[\s\S]*logicMode/,
  "AdminOwnerReview",
);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API keeps value weight unlock owner-only", /hasOwnerOnlyOddsFields[\s\S]*admin\.adminRole !== "owner"[\s\S]*Only an owner can set prize value, weight, or sold unlock odds/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle persists owner review by-card odds into canonical prize rows", /function applyOwnerPrizeOddsOverrides[\s\S]*from\("draw_round_prizes"\)[\s\S]*weight[\s\S]*unlock_at_sold_pct[\s\S]*if \(action === "save_logic"\)[\s\S]*applyOwnerPrizeOddsOverrides[\s\S]*action === "publish"[\s\S]*applyOwnerPrizeOddsOverrides/);
check("src/features/ynot/client.tsx", "owner review simulator mirrors unit-weighted unlock-gated runtime odds", /function ownerReviewPrizeUnits[\s\S]*plannedQuantity[\s\S]*function ownerReviewEffectivePoolWeight[\s\S]*UnlockAtSoldPct[\s\S]*soldPct[\s\S]*remainingUnits[\s\S]*function runOwnerReviewSimulation[\s\S]*remainingUnits/);
check("src/features/ynot/client.tsx", "owner review per-pull display stays aligned with active gated odds", /const poolShare =[\s\S]*ownerReviewEffectivePoolWeight\(prize, logicMode, 0\)[\s\S]*\{`\$\{poolShare\.toFixed\(3\)\}%`\}/);
check("src/features/ynot/client.tsx", "owner review simulator compares early-window tier expectations and recommends the configured match", /type OwnerReviewModeComparison[\s\S]*function ownerReviewComparisonDrawCount[\s\S]*firstTenPercent[\s\S]*simulatorModeComparisons[\s\S]*expected tier hits[\s\S]*Recommended[\s\S]*OWNER_REVIEW_TIER_ORDER\.map[\s\S]*result\.expected\[tier\]/);
check("src/features/ynot/client.tsx", "admin campaign form stores catalog sub-category and legacy prize metadata", /catalogCategoryOptions[\s\S]*catalogCategoryLabel[\s\S]*metadata: \{[\s\S]*catalogCategory[\s\S]*prizeCategory/);
check("src/features/ynot/client.tsx", "admin campaign form filters prize items by selected brand and sub-category", /function prizeCatalogCardsFor[\s\S]*category: CatalogCategory[\s\S]*cardMatchesCampaignSeries\(card, series\)[\s\S]*function cardMatchesCampaignSeries[\s\S]*<span>Brand<\/span>[\s\S]*<span>Sub-category<\/span>/);
notCheck("src/features/ynot/client.tsx", "admin campaign form does not expose obsolete prize type selector", /<span>Prize type<\/span>|prizeCategoryOptions\.map/);
check("src/features/ynot/client.tsx", "admin campaign form blocks mismatched prize quantities", /Prize quantity must equal the total pack quantity/);
check("src/features/ynot/open-quantity.ts", "open quantity options are limited to 1 10 100 pull choices", /allowedOpenQuantityOptions = \[1, 10, 100\]/);
check("src/features/ynot/client.tsx", "admin campaign create and edit expose customer pull buttons", /Customer pull buttons[\s\S]*allowedOpenQuantityOptions\.map[\s\S]*openQuantitySummary\(openQuantityOptions\)[\s\S]*The open[\s\S]*pack page only shows selected pull buttons/);
check("src/app/globals.css", "admin campaign create pull buttons keep selected colour above generic button fallback", /soft-card button[\s\S]*:not\(\.admin-open-preset-button\),[\s\S]*admin-panel button[\s\S]*:not\(\.admin-open-preset-button\),[\s\S]*admin-pack-form button[\s\S]*:not\(\.admin-open-preset-button\)[\s\S]*admin-open-preset-button\.is-selected[\s\S]*aria-pressed="true"/);
notCheck("src/features/ynot/client.tsx", "admin pull button choices do not include obsolete 5 pull option", /\[1, 5, 10, 100\]/);
check("src/features/ynot/client.tsx", "admin card form calls card API", /\/api\/ynot\/admin\/cards/);
check("src/features/ynot/client.tsx", "admin card form refreshes catalog data after save", /export function AdminCardForm[\s\S]*const router = useRouter\(\)[\s\S]*\/api\/ynot\/admin\/cards[\s\S]*router\.refresh\(\)/);
check("src/features/ynot/client.tsx", "admin card catalog edit reconciles saved database row into visible catalog", /const \[savedCatalogCards, setSavedCatalogCards\] = useState[\s\S]*savedCatalogCards\.get\(card\.catalogCardId\) \?\? card[\s\S]*buildAdminCardCatalogRows\(catalogCards, prizes\)[\s\S]*next\.set\(savedCard\.catalogCardId, savedCard\)[\s\S]*adminCardFromSavePayload\(payload, card\)[\s\S]*onSaved\(savedCard\)/);
check("src/features/ynot/client.tsx", "admin card catalog delete removes deleted row from visible catalog", /const \[deletedCatalogCardIds, setDeletedCatalogCardIds\] = useState[\s\S]*const deletedCardId = deleteTarget\.card\.catalogCardId[\s\S]*setDeletedCatalogCardIds\(\(current\) =>[\s\S]*next\.add\(deletedCardId\)/);
check("src/features/ynot/client.tsx", "admin card edit modal uses responsive scroll shell", /admin-modal admin-card-edit-modal[\s\S]*admin-card-edit-modal-body[\s\S]*admin-form-grid admin-card-edit-grid[\s\S]*admin-field admin-field-wide admin-image-dropzone-field-wrap/);
check("src/app/globals.css", "admin card edit modal is scrollable and responsive", /admin-card-edit-modal[\s\S]*max-height: calc\(100dvh - 48px\)[\s\S]*admin-card-edit-modal-body[\s\S]*overflow-y: auto[\s\S]*@media \(max-width: 760px\)[\s\S]*admin-card-edit-modal \.admin-form-grid[\s\S]*grid-template-columns: 1fr/);
check("src/app/globals.css", "admin image dropzone contains long uploaded URLs", /admin-image-dropzone-file[\s\S]*min-width: 0[\s\S]*admin-image-dropzone-url[\s\S]*overflow: hidden[\s\S]*text-overflow: ellipsis/);
check("src/lib/lucky-draw/types.ts", "card catalog item exposes full card row metadata", /CardCatalogItem[\s\S]*searchName\?:[\s\S]*isTest\?:[\s\S]*assetSource\?:[\s\S]*assetManifestKey\?:[\s\S]*updatedAt\?:/);
check("src/lib/lucky-draw/data.ts", "card catalog mapper includes cards table metadata", /function toCatalogItem[\s\S]*searchName: row\.search_name[\s\S]*isTest: row\.is_test[\s\S]*assetSource: row\.asset_source[\s\S]*updatedAt: row\.updated_at/);
check("src/features/ynot/client.tsx", "owner review still calls lifecycle API for owner odds", /export function AdminOwnerReview[\s\S]*\/api\/ynot\/admin\/campaigns\/lifecycle/);
notCheck("src/features/ynot/client.tsx", "admin existing card stock panel removes add-to-pack CTA", /Add to pack|function AdminPrizeCatalogActionList|addCatalogCardToPack/);
check("src/features/ynot/client.tsx", "admin card catalog panel renders every card from catalog reader", /function buildAdminCardCatalogRows[\s\S]*prizesByCard[\s\S]*return cards[\s\S]*card\.catalogCardId[\s\S]*export function AdminCardCatalogPanel[\s\S]*catalogCards[\s\S]*buildAdminCardCatalogRows\(catalogCards, prizes\)[\s\S]*data-testid="admin-card-catalog-list"[\s\S]*(?:visibleRows|renderedRows)\.map/);
const adminCardCatalogPanelSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function AdminCardCatalogPanel",
  "function AdminCardEditModal",
  "admin card catalog panel source slice",
);
checkText(
  "admin card catalog separates global stock from pack assignments",
  adminCardCatalogPanelSource,
  /in prize pools[\s\S]*with global stock[\s\S]*Global stock[\s\S]*Not in any pack yet/,
  "AdminCardCatalogPanel",
);
checkText(
  "admin card catalog confirms stock adjustment before calling card stock API",
  adminCardCatalogPanelSource,
  /openStockAdjustment[\s\S]*confirmStockAdjustment[\s\S]*\/api\/ynot\/admin\/card-stock[\s\S]*(?:Confirm add[\s\S]*Confirm remove|Confirm remove[\s\S]*Confirm add)[\s\S]*Cancel/,
  "AdminCardCatalogPanel",
);
notCheckText(
  "admin card catalog row hides technical source fields by default",
  adminCardCatalogPanelSource,
  />Image URL<|>Storage path<|>Manifest<|>Asset source</,
  "AdminCardCatalogPanel",
);
check("src/features/ynot/client.tsx", "admin card form uploads images and still captures technical card asset metadata", /function AdminImageDropzone[\s\S]*Manual image URL[\s\S]*export function AdminCardForm[\s\S]*AdminImageDropzone[\s\S]*Asset source[\s\S]*Asset license/);
check("src/features/ynot/client.tsx", "admin card form requires explicit duplicate overwrite confirmation", /DuplicateCardCaution[\s\S]*Overwrite confirmation[\s\S]*confirmOverwrite: canConfirmOverwrite[\s\S]*Boolean\(duplicateCard\) && !overwriteConfirmed/);
const adminPrizeInventoryPanelSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function AdminPrizeInventoryPanel",
  "export function AdminUserRoleForm",
  "admin prize inventory panel source slice",
);
checkText(
  "admin prize inventory panel is labeled as pack planned quantity",
  adminPrizeInventoryPanelSource,
  /Pack prize quantities[\s\S]*owner review reserves global stock/,
  "AdminPrizeInventoryPanel",
);
checkText(
  "admin prize inventory panel renders read-only pack quantities",
  adminPrizeInventoryPanelSource,
  /admin-card-inventory-list[\s\S]*availableUnits[\s\S]*plannedQuantity[\s\S]*Read-only plan/,
  "AdminPrizeInventoryPanel",
);
notCheckText(
  "admin prize inventory panel does not directly mutate pack quantities",
  adminPrizeInventoryPanelSource,
  /\/api\/ynot\/admin\/prizes|updatePrizeQuantity|<Minus|<Plus|admin-stock-stepper/,
  "AdminPrizeInventoryPanel",
);
check("src/app/admin/prizes/page.tsx", "admin card catalog renders with upload-backed create action", /actions=\{<AdminPrizeCreateActions cards=\{cards\} prizes=\{prizes\} \/>\}[\s\S]*<AdminCardCatalogPanel cards=\{cards\} prizes=\{prizes\} \/>/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create sanitizes initial prize odds unless owner", /initialPrizesForAdminRole[\s\S]*adminRole === "owner"[\s\S]*valueThb: null[\s\S]*weight: 1[\s\S]*unlockAtSoldPct: 0[\s\S]*normalizePrizeDrafts\(body\.initialPrizes\)/);
check("src/features/ynot/prize-readiness.ts", "initial prize normalization defaults omitted admin weight to one", /numberOrDefault[\s\S]*row\.weight,\s*1[\s\S]*numberOrZero\(row\.unlockAtSoldPct\)/);
check("src/features/ynot/client.tsx", "admin user role form calls users API", /\/api\/ynot\/admin\/users/);
check("src/features/ynot/client.tsx", "admin merge review calls merge API", /\/api\/ynot\/admin\/merge-requests/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create stays admin-accessible draft creation", /export async function POST[\s\S]*resolveAdminSession[\s\S]*Admin access is required[\s\S]*status: "draft"[\s\S]*visibility: "private"/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "admin can submit owner review while owner handles approval publish", /function actionRequiresOwner\(action: LifecycleAction\) \{[\s\S]*action === "save_logic"[\s\S]*action === "publish"[\s\S]*action === "delete"[\s\S]*\);[\s\S]*if \(action === "submit_review"\)/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category API persists store categories", /from\("store_categories"\)[\s\S]*insert/);
notCheck("src/app/api/ynot/admin/categories/route.ts", "admin category create does not upsert duplicate slugs", /upsert\([\s\S]*onConflict:\s*"slug"/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category duplicate slug maps to a structured conflict", /CATEGORY_DUPLICATE_SLUG[\s\S]*status:\s*409/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category duplicate errors take priority over schema wording", /code === "23505"[\s\S]*CATEGORY_DUPLICATE_SLUG[\s\S]*code === "PGRST205"/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API persists customer display tags", /displayTags[\s\S]*display_tags/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create and title patch reject blank titles", /validateCampaignTitle[\s\S]*CAMPAIGN_TITLE_REQUIRED[\s\S]*validateCampaignTitle\(body, false\)/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API requires initial prize inventory on create", /initialPrizes[\s\S]*validatePrizeDraftsForSave[\s\S]*saveInitialPrizes/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create stores planned quantities instead of materializing prize units", /saveInitialPrizes[\s\S]*planned_quantity: prize\.quantity[\s\S]*select\("id,tier,rank"\)/);
notCheck("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create does not call prize unit materializer", /ensure_draw_round_prize_units/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API persists planned quantity instead of materializing units", /planned_quantity[\s\S]*plannedQuantity:[\s\S]*materialized: false/);
notCheck("src/app/api/ynot/admin/prizes/route.ts", "admin prize API does not call prize unit materializer", /ensure_draw_round_prize_units/);
check("src/app/api/ynot/admin/card-stock/route.ts", "admin card stock API adjusts global card stock through RPC", /adjust_card_stock_units[\s\S]*card_stock_adjusted/);
check("src/app/api/ynot/admin/card-stock/route.ts", "admin card stock API maps over-remove failures", /cardStockErrorMap[\s\S]*CARD_STOCK_ADJUST_FAILED/);
const adminCardCatalogStockSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "function confirmStockAdjustment",
  "return (",
  "admin card catalog stock adjustment source slice",
);
notCheckText(
  "admin card catalog remove path does not silently clamp over-removal",
  adminCardCatalogStockSource,
  /Math\.min\(requestedQuantity,\s*row\.stockAvailable\)/,
  "AdminCardCatalogPanel confirmStockAdjustment",
);
checkText(
  "admin card catalog sends requested remove quantity to stock API",
  adminCardCatalogStockSource,
  /quantityDelta =[\s\S]*\? -requestedQuantity : requestedQuantity/,
  "AdminCardCatalogPanel confirmStockAdjustment",
);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle uses stock reservation allocation RPCs", /submit_campaign_review[\s\S]*approve_campaign_inventory[\s\S]*publish_campaign[\s\S]*release_campaign_reservations/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle maps symbolic RPC errors", /campaignLifecycleErrorMap[\s\S]*mappedAdminErrorResponse[\s\S]*CAMPAIGN_LIFECYCLE_FAILED/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle keeps Supabase RPC bound", /supabase\.rpc\.bind\(supabase\)/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle routes review approve publish through guarded inventory RPCs", /submit_review[\s\S]*approve[\s\S]*publish[\s\S]*submit_campaign_review[\s\S]*approve_campaign_inventory[\s\S]*publish_campaign/);
const adminCampaignStatusRowSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "function AdminCampaignStatusRow",
  "function applyLifecycleAction",
  "admin campaign status row source slice",
);
checkText(
  "admin submit review refreshes server owner queue",
  adminCampaignStatusRowSource,
  /const router = useRouter\(\)[\s\S]*function submitReview[\s\S]*router\.refresh\(\)/,
  "AdminCampaignStatusRow submitReview",
);
const ownerApprovalQueueSourceForSync = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function OwnerApprovalQueue",
  "// ---------- Owner Approval Review",
  "owner approval queue state sync source slice",
);
checkText(
  "owner approval queue renders refreshed server requests directly",
  ownerApprovalQueueSourceForSync,
  /requests\.map\(\(request\)[\s\S]*request\.approvalStatus[\s\S]*request\.campaign\.id/,
  "OwnerApprovalQueue",
);
check("src/features/ynot/client.tsx", "admin request helper preserves structured error data", /class AdminRequestError[\s\S]*code\?: string[\s\S]*blockers\?: string\[\][\s\S]*requestErrorMessage/);
check("src/features/ynot/components.tsx", "admin dashboard and nav use hard admin route links", /AdminRouteLink[\s\S]*admin-side-nav-link[\s\S]*admin-quick-action[\s\S]*admin-tool-row[\s\S]*\/admin\/health/);
check("src/features/ynot/prize-readiness.ts", "random pack readiness blocks missing or non-openable planned prize inventory", /Add prize inventory before saving[\s\S]*Available or planned prize units must cover every remaining pack[\s\S]*No available prize is currently unlocked/);
check("src/features/ynot/prize-readiness.ts", "random pack readiness accepts flexible tiers but enforces inventory coverage", /countByDisplayTier[\s\S]*!prizes\.length[\s\S]*totalPrizeUnits !== totalSlots[\s\S]*initialEligiblePrizeUnits <= 0/);
check("src/features/ynot/prize-readiness.ts", "random pack structure counts planned or unit-backed display tier rows", /nonVoidUnitsByPrizeId[\s\S]*usePlannedInventory[\s\S]*unitBackedPrizes[\s\S]*displayTierCounts = countByDisplayTier\(unitBackedPrizes\)[\s\S]*topPrizeRows: displayTierCounts\.rainbow[\s\S]*highPoolRows: displayTierCounts\.gold \+ displayTierCounts\.silver/);
if (exists("src/features/ynot/stock-readiness.ts")) {
  pass("random pack stock readiness helper exists");
} else {
  fail("random pack stock readiness helper exists (src/features/ynot/stock-readiness.ts)");
}
notCheck("src/features/ynot/stock-readiness.ts", "stock readiness helper stays client-safe", /server-only|createServiceSupabaseClient/);
check("src/features/ynot/stock-readiness.ts", "stock readiness helper aggregates prize demand against sub-SKU stock", /buildPrizeStockShortages[\s\S]*requiredByTarget[\s\S]*stockUnitGroupKey[\s\S]*stockShortageBlockers/);
check("src/features/ynot/prize-readiness.ts", "planned random pack readiness checks exact global stock before owner review", /get_admin_prize_stock_summaries[\s\S]*get_card_stock_summary[\s\S]*countCampaignReservations[\s\S]*getPrizeStockSummaries[\s\S]*reservationCoverageBlockers[\s\S]*stockBlockers/);
notCheck("src/features/ynot/data.ts", "storefront/admin renders do not pull bulk prize unit rows into the Worker", /draw_round_prize_units["']?\)[\s\S]*select\("draw_round_prize_id,status"\)[\s\S]*limit\(10000\)/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create validates global stock before inserting draft", /getPrizeStockSummaries\(supabase, initialPrizes\)[\s\S]*validatePrizeDraftsForSave\([\s\S]*stockSummaries[\s\S]*from\("draw_rounds"\)\.insert/);
check("src/app/api/ynot/admin/prizes/route.ts", "legacy admin prize mutation rejects cross-origin cookie mutations", /export async function POST\(request: Request\)[\s\S]*enforceSameOriginMutation\(request\)[\s\S]*const body = await bodyJson\(request\)[\s\S]*export async function DELETE\(request: Request\)[\s\S]*enforceSameOriginMutation\(request\)[\s\S]*const body = await bodyJson\(request\)/);
const campaignPatchBeforeMutation = sliceBetween(
  "src/app/api/ynot/admin/campaigns/route.ts",
  "const replacementPrizes = Array.isArray(body.initialPrizes)",
  "const reviewPatch:",
  "admin campaign patch pre-mutation stock validation slice",
);
checkText(
  "admin campaign edit validates stock before releasing reservations or mutating",
  campaignPatchBeforeMutation,
  /getPrizeStockSummaries[\s\S]*validatePrizeDraftsForSave[\s\S]*release_campaign_reservations/,
  "campaign PATCH pre-mutation validation",
);
check("src/features/ynot/client.tsx", "admin campaign form blocks global stock shortage before save", /buildPrizeStockShortages[\s\S]*stockShortageBlockers[\s\S]*Global stock[\s\S]*disabled=\{isPending \|\| prizeBlockers\.length > 0\}/);
check("src/features/ynot/client.tsx", "all packs submit owner review button disables on readiness blocker", /const reviewBlocker = campaign\.readinessBlockers\?\.\[0\][\s\S]*Boolean\(reviewBlocker\)[\s\S]*Submit owner review/);
check("src/app/api/ynot/admin/cards/route.ts", "admin card API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/cards/route.ts", "admin card API requires duplicate confirmation and blocks ambiguous name-only overwrite", /CARD_ALREADY_EXISTS[\s\S]*CARD_DUPLICATE_NAME_AMBIGUOUS[\s\S]*!booleanValue\(body\.confirmOverwrite\)/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API assigns draw_round_prizes through live rank allocation", /resolveAdminSession[\s\S]*resolvePrizeRank[\s\S]*from\("draw_round_prizes"\)[\s\S]*(?:insert|update)\(rowPatch\)/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API persists category metadata", /metadataValue[\s\S]*prizeCategory[\s\S]*sourceType[\s\S]*displayGroup[\s\S]*metadata,/);
check("src/app/api/ynot/admin/users/route.ts", "admin users API restricts all role changes to owners", /admin\.adminRole !== "owner"[\s\S]*Only an owner can manage admin roles[\s\S]*from\("admin_users"\)\.upsert/);
check("src/app/admin/users/page.tsx", "admin users page hides role form from non-owners", /data\.viewer\.adminRole === "owner"[\s\S]*<AdminUserRoleForm[\s\S]*Owner only/);
check("src/app/api/ynot/admin/merge-requests/route.ts", "admin identity review API uses identity-only RPCs", /approve_identity_review_request[\s\S]*reject_identity_review_request/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin shipping route uses transaction-safe status RPC", /supabase\.rpc\("update_shipping_request_status"[\s\S]*p_shipping_request_id[\s\S]*p_admin_id[\s\S]*p_status/);
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping selected request starts with status action bar", /admin-shipping-action-bar[\s\S]*admin-shipping-status-select[\s\S]*Update shipping/);
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping detail sections are collapsible", /function ShippingDetailSection[\s\S]*<details[\s\S]*Reward and pack source[\s\S]*Timeline/);
check("src/features/ynot/shipping-status.ts", "shipping pickup statuses have friendly labels", /ready_for_pickup[\s\S]*Ready for pickup[\s\S]*picked_up[\s\S]*Picked up/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin pickup and delivered statuses do not require tracking", /ready_for_pickup[\s\S]*picked_up[\s\S]*delivered[\s\S]*status === "shipped"/);
check("../Database/supabase/migrations/20260604160000_shipping_event_handoff_statuses.sql", "shipping event handoff RPC requires tracking only for shipped", /submitted', 'packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'[\s\S]*ready_for_pickup', 'picked_up', 'delivered', 'cancelled'[\s\S]*if p_status = 'shipped'[\s\S]*shipping_tracking_required/);
check("src/features/ynot/components.tsx", "shell passes admin state into drawer", /isAdmin=\{renderViewer\.isAdmin\}/);
check("src/features/ynot/StorePreferences.tsx", "admin routes are hidden unless viewer is admin", /isAdmin &&[\s\S]*href="\/admin"/);
check("src/features/ynot/components.tsx", "non-admin admin route gets denial state", /Admin access is required/);
check("src/features/ynot/data.ts", "public campaign reads filter to live openable packs only", /query = query\.eq\("visibility", "public"\)\.eq\("status", "live"\)[\s\S]*campaigns\.filter\(\(campaign\) => campaign\.openable\)/);
check("src/features/ynot/data.ts", "admin dashboard can request private campaigns explicitly", /getCampaigns\(\{[\s\S]*includePrivate: viewer\.isAdmin[\s\S]*includeReadiness: selector\.campaignReadiness[\s\S]*includePrizeLineups: selector\.campaignPrizeLineups/);
check("src/app/admin/page.tsx", "admin dashboard keeps heavy campaign readiness on demand", /campaignReadiness: false[\s\S]*campaignPrizeLineups: false/);
check("src/features/ynot/data.ts", "admin user and audit data readers exist", /getAdminUsers[\s\S]*getAdminAuditEvents/);
check("src/features/ynot/data.ts", "admin user reader checks admin before service read", /export async function getAdminUsers\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin audit reader checks admin before service read", /export async function getAdminAuditEvents\([\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin card reader checks admin before service read", /export async function getAdminCards\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin prize pool reader checks admin before service read", /export async function getAdminPrizePool\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin prize pool reader roundtrips category metadata", /getAdminPrizePool\(\)[\s\S]*prizeCategory: metadataString\(prize\.metadata, "prizeCategory"\)[\s\S]*sourceType: metadataString\(prize\.metadata, "sourceType"\)/);
notCheck("src/app/admin/users/page.tsx", "admin users page is not a placeholder", /Module status/);
notCheck("src/app/admin/prizes/page.tsx", "admin prizes page is not a placeholder", /Module status/);
notCheck("src/app/admin/rankings/page.tsx", "admin rankings page is not a placeholder", /Module status/);
notCheck("src/app/admin/audit/page.tsx", "admin audit page is not a placeholder", /Module status/);

const migration = "../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql";
const globalInventoryMigration = "../Database/supabase/migrations/20260514045933_global_card_inventory_owner_approval.sql";
const identityReviewMigration = "../Database/supabase/migrations/20260528020000_identity_review_only_linking.sql";
const topUpApprovalHardeningMigration = "../Database/supabase/migrations/20260528050000_harden_top_up_approval.sql";
check("../Database/supabase/migrations/20260508133000_add_campaign_display_tags.sql", "campaign label migration adds display_tags", /add column if not exists display_tags text\[\]/);
check(migration, "phase2 migration creates payment_methods", /create table if not exists public\.payment_methods/);
check(migration, "phase2 migration creates top_up_requests", /create table if not exists public\.top_up_requests/);
check(migration, "phase2 migration generalizes payment_slips with XOR owner", /payment_slips_exactly_one_owner_ck[\s\S]*order_id is not null[\s\S]*top_up_request_id is not null/);
check(migration, "phase2 migration creates wallet and ledger", /create table if not exists public\.wallet_accounts[\s\S]*create table if not exists public\.coin_ledger/);
check(migration, "phase2 migration creates idempotency keys", /create table if not exists public\.idempotency_keys/);
check(migration, "phase2 migration creates account merge tables", /create table if not exists public\.account_merge_requests[\s\S]*create table if not exists public\.account_merge_events/);
check(migration, "phase2 migration creates gacha and collection tables", /create table if not exists public\.gacha_opens[\s\S]*create table if not exists public\.collection_items/);
check(migration, "phase2 migration creates exchange and shipping tables", /create table if not exists public\.exchange_orders[\s\S]*create table if not exists public\.shipping_requests/);
check(migration, "phase2 migration creates service-role wallet RPC", /create or replace function public\.approve_top_up_request/);
check(migration, "phase2 migration creates atomic gacha RPC", /create or replace function public\.open_gacha_campaign[\s\S]*for update[\s\S]*insert into public\.coin_ledger[\s\S]*insert into public\.collection_items/);
check(migration, "phase2 migration creates atomic exchange approval RPC", /create or replace function public\.approve_exchange_order[\s\S]*for update[\s\S]*insert into public\.coin_ledger[\s\S]*entry_type[\s\S]*exchange_credit/);
check(identityReviewMigration, "identity review migration disables account merge completion RPC", /create or replace function public\.complete_account_merge_request[\s\S]*account_merge_disabled_use_identity_review/);
check(identityReviewMigration, "identity review approval only moves user identity rows", /create or replace function public\.approve_identity_review_request[\s\S]*update public\.user_identities[\s\S]*identity_review_only[\s\S]*identity_review_approved/);
notCheck(identityReviewMigration, "identity review migration does not move financial or order records", /update public\.(wallet_accounts|coin_ledger|user_addresses|top_up_requests|gacha_opens|collection_items|exchange_orders|shipping_requests|ranking_snapshots|orders|admin_users|profiles)\b/);
check(migration, "phase2 migration enables RLS for platform public tables", /alter table public\.top_up_requests enable row level security;[\s\S]*alter table public\.ranking_snapshots enable row level security;/);
check(migration, "phase2 migration grants RPC execute only to service_role", /revoke all on function public\.open_gacha_campaign[\s\S]*grant execute on function public\.open_gacha_campaign[\s\S]*to service_role/);
notCheck(migration, "phase2 migration does not grant table writes to authenticated users", /grant (?:insert|update|delete|all)[\s\S]* to authenticated/i);
check(topUpApprovalHardeningMigration, "top-up approval RPC requires a latest slip", /latest_slip public\.payment_slips%rowtype[\s\S]*top_up_slip_required/);
check(topUpApprovalHardeningMigration, "top-up approval RPC blocks duplicate or failed slips", /duplicate_of_slip_id is not null[\s\S]*verification_status not in \('valid', 'manual_review'\)[\s\S]*top_up_slip_not_approvable/);
check(topUpApprovalHardeningMigration, "top-up approval RPC only credits pending requests", /locked_topup\.status not in \('pending_slip', 'pending_review'\)/);
check(topUpApprovalHardeningMigration, "top-up approval RPC remains service-role only", /revoke all on function public\.approve_top_up_request[\s\S]*grant execute on function public\.approve_top_up_request[\s\S]*to service_role/);

check(globalInventoryMigration, "global inventory migration adds draw round planned quantity", /add column if not exists planned_quantity integer not null default 0[\s\S]*draw_round_prizes_planned_quantity_check/);
check(globalInventoryMigration, "global inventory migration creates stock units reservations and ledger", /create table if not exists public\.card_stock_units[\s\S]*create table if not exists public\.card_stock_reservations[\s\S]*create table if not exists public\.card_stock_ledger/);
check(globalInventoryMigration, "global inventory migration links prize units to card stock units", /add column if not exists card_stock_unit_id uuid references public\.card_stock_units[\s\S]*draw_round_prize_units_one_active_stock_unit_idx/);
check(globalInventoryMigration, "global inventory migration creates review reservation RPCs", /create or replace function public\.submit_campaign_review[\s\S]*create or replace function public\.approve_campaign_inventory[\s\S]*create or replace function public\.publish_campaign/);
check(globalInventoryMigration, "global inventory migration creates stock adjustment RPC", /create or replace function public\.adjust_card_stock_units[\s\S]*stock_created[\s\S]*insufficient_available_card_stock/);
notCheck(globalInventoryMigration, "global inventory migration keeps cards catalog-only", /alter table (?:if exists )?public\.cards[\s\S]*quantity/i);

check("src/lib/supabase/types.ts", "types include top_up_requests", /top_up_requests:\s*{[\s\S]*coin_amount: number;/);
check("src/lib/supabase/types.ts", "types include collection_items", /collection_items:\s*{[\s\S]*source_type: "gacha_open"/);
check("src/lib/supabase/types.ts", "types include platform RPCs", /open_gacha_campaign:[\s\S]*submit_card_conversion:[\s\S]*request_shipping_for_items:/);
check("src/lib/ynot/card-conversion-api.ts", "card conversion route uses wallet ledger RPC", /enforceRateLimit[\s\S]*submit_card_conversion/);
check("src/features/ynot/data.ts", "customer top-ups hide slip provider internals by default", /includeSensitiveSlipDetails[\s\S]*\?\? includeAll[\s\S]*providerCode:[\s\S]*providerMessage:/);
notCheck("src/features/ynot/types.ts", "public top-up type omits duplicate/reference slip internals", /(?:referenceId|duplicateOfSlipId)/);
check("src/app/api/ynot/admin/campaigns/cost/route.ts", "admin cost route rejects cross-origin cookie mutations", /enforceSameOriginMutation\(request\)/);
check("src/app/api/ynot/admin/campaigns/cost/route.ts", "admin cost route clamps coin tier edits", /MAX_CAMPAIGN_COST_COINS[\s\S]*rawCost < 1 \|\| rawCost > MAX_CAMPAIGN_COST_COINS/);
check("docs/PROJECT_STATUS.md", "status docs mention migration-before-deploy gate", /migration.*before deploying code/i);

if (exists("tools/fixtures/button-map.json")) {
  const buttonMap = readJson("tools/fixtures/button-map.json");
  const hasUnsupported = buttonMap.some((item) => /unsupported|todo|noop/i.test(item.expectedAction ?? ""));
  const missingContracts = buttonMap.filter((item) => !item.route || !item.label || !item.role || !item.expectedAction);
  if (Array.isArray(buttonMap) && buttonMap.length >= 20 && !hasUnsupported && missingContracts.length === 0) {
    pass("button map covers first-release controls without unsupported/no-op actions");
  } else {
    fail("button map covers first-release controls without unsupported/no-op actions (tools/fixtures/button-map.json)");
  }
} else {
  fail("button map fixture exists (tools/fixtures/button-map.json)");
}

console.log("YNot platform foundation static verification");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);
if (failures.length) process.exit(1);
