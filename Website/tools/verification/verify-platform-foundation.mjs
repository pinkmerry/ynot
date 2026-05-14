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
  if (pattern.test(read(rel))) pass(label);
  else fail(`${label} (${rel})`);
}
function notCheck(rel, label, pattern) {
  if (!pattern.test(read(rel))) pass(label);
  else fail(`${label} (${rel})`);
}
function sliceBetween(rel, start, end, label) {
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
  "src/app/admin/exchange/page.tsx",
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
  "src/app/api/ynot/exchange/route.ts",
  "src/app/api/ynot/shipping/route.ts",
  "src/app/api/ynot/admin/top-ups/route.ts",
  "src/app/api/ynot/admin/payment-methods/route.ts",
  "src/app/api/ynot/admin/exchange/route.ts",
  "src/app/api/ynot/admin/shipping/route.ts",
  "src/app/api/ynot/admin/campaigns/route.ts",
  "src/app/api/ynot/admin/categories/route.ts",
  "src/app/api/ynot/admin/cards/route.ts",
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
check("src/lib/line/link-identity.ts", "LINE email auto-link only when exactly one active profile matches", /\.limit\(2\)[\s\S]*data\?\.length === 1 \? data\[0\] : null/);
check("src/features/auth/actions.ts", "logout clears legacy LINE session cookie too", /luckyDrawSessionCookie[\s\S]*maxAge: 0/);
check("src/features/ynot/client.tsx", "wallet top-up posts slip upload API", /fetch\("\/api\/ynot\/wallet", \{[\s\S]*method: "POST",[\s\S]*body: form,[\s\S]*\}\)/);
check("src/features/ynot/client.tsx", "address form calls address API", /\/api\/ynot\/addresses/);
check("src/features/ynot/client.tsx", "gacha open button calls API", /\/api\/ynot\/gacha\/open/);
check("src/features/ynot/client.tsx", "collection actions call exchange and shipping APIs", /\/api\/ynot\/exchange[\s\S]*\/api\/ynot\/shipping/);
check("src/features/ynot/client.tsx", "admin payment settings call payment method API", /\/api\/ynot\/admin\/payment-methods/);
check("src/features/ynot/client.tsx", "admin campaign form calls campaign API", /\/api\/ynot\/admin\/campaigns/);
check("src/features/ynot/client.tsx", "admin campaign create refreshes server data after save", /import \{ useRouter \} from "next\/navigation"[\s\S]*AdminCampaignForm[\s\S]*const router = useRouter\(\)[\s\S]*\/api\/ynot\/admin\/campaigns[\s\S]*router\.refresh\(\)/);
check("src/features/ynot/client.tsx", "admin category form calls category API", /AdminCategoryForm[\s\S]*\/api\/ynot\/admin\/categories/);
check("src/features/ynot/client.tsx", "admin campaign form and update rows edit customer card labels", /Customer card labels[\s\S]*displayTags/);
check("src/features/ynot/client.tsx", "admin campaign action panel submits review and archives campaigns", /\/api\/ynot\/admin\/campaigns\/lifecycle[\s\S]*Submit owner review[\s\S]*Archive private/);
check("src/features/ynot/prize-tier.ts", "random pack tier model defines Rainbow Gold Silver Bronze order", /value: "rainbow"[\s\S]*value: "gold"[\s\S]*value: "silver"[\s\S]*value: "bronze"[\s\S]*allowsRandomPsa10: true/);
check("src/features/ynot/client.tsx", "admin campaign form includes flexible tier toggles and row controls", /Rainbow, Gold, Silver, Bronze tiers[\s\S]*admin-tier-toggle-grid[\s\S]*updateTierActive[\s\S]*admin-prize-tier-stack[\s\S]*updateTierCount[\s\S]*Fill remainder/);
check("src/features/ynot/client.tsx", "bronze PSA10 uses random PSA10 while higher tiers use specific cards", /canPrizeDisplayTierUseRandomPsa10[\s\S]*filter\(isRandomPsa10Card\)[\s\S]*filter\(\(card\) => !isRandomPsa10Card\(card\)\)[\s\S]*Bronze PSA10 prizes use the generic Random PSA10 card pool/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API enforces PSA10 item against display tier", /isRandomPsa10PrizeCard[\s\S]*canPrizeDisplayTierUseRandomPsa10[\s\S]*PSA10 prize item does not match the selected display tier/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API enforces PSA10 item against display tier", /isRandomPsa10PrizeCard[\s\S]*canPrizeDisplayTierUseRandomPsa10[\s\S]*PSA10 prize item does not match the selected display tier/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API allocates DB rank from live rows while preserving display tier rank", /async function resolvePrizeRank[\s\S]*existingDisplayRow[\s\S]*usedRanks[\s\S]*while \(usedRanks\.has\(rank\)\) rank \+= 1[\s\S]*async function savePrizeRow[\s\S]*insert\(rowPatch\)[\s\S]*isUniqueConstraintError/);
check("src/features/ynot/client.tsx", "admin prize pool form sends visible tier rank metadata", /AdminPrizePoolForm[\s\S]*rank,[\s\S]*displayTier,[\s\S]*metadata: \{[\s\S]*tierRank: rank/);
check("src/features/ynot/client.tsx", "admin prize pool campaign dropdown follows refreshed campaign props", /AdminPrizePoolForm[\s\S]*const selectedCampaignId = campaigns\.some[\s\S]*campaigns\[0\]\?\.id \?\? ""[\s\S]*campaignId: selectedCampaignId[\s\S]*value=\{selectedCampaignId\}[\s\S]*disabled=\{isPending \|\| !selectedCampaignId \|\| !selectedPrizeCardId\}/);
check("src/features/ynot/types.ts", "public prize preview carries card image metadata", /YnotPrizePreview[\s\S]*cardCode\?:[\s\S]*cardGrade\?:[\s\S]*cardImageUrl\?:[\s\S]*cardImageStoragePath\?:[\s\S]*cardPrizeCategory\?:/);
check("src/features/ynot/data.ts", "public prize lineup selects card image metadata", /getPublicPrizeLineupsBatch[\s\S]*select\("id,name,card_code,grade,image_url,image_storage_path,prize_category"\)[\s\S]*getPublicPrizeLineup[\s\S]*select\("id,name,card_code,grade,image_url,image_storage_path,prize_category"\)/);
check("src/features/ynot/data.ts", "public prize lineup maps card image metadata", /getPublicPrizeLineupsBatch[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:[\s\S]*getPublicPrizeLineup[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:/);
check("src/features/ynot/components.tsx", "public pack detail renders prize images in lineup", /function PrizeLineupImage[\s\S]*prize\.cardImageUrl[\s\S]*<img[\s\S]*function PrizeLineup[\s\S]*<PrizeLineupImage prize=\{prize\}/);
check("src/app/globals.css", "public prize lineup images keep stable card thumbnail layout", /reward-prize-image[\s\S]*aspect-ratio: 3 \/ 4[\s\S]*object-fit: contain/);
check("src/features/ynot/types.ts", "admin prize pool item carries card image metadata", /YnotPrizePoolItem[\s\S]*cardCode\?:[\s\S]*cardGrade\?:[\s\S]*cardImageUrl\?:[\s\S]*cardImageStoragePath\?:/);
check("src/features/ynot/data.ts", "admin prize pool reader selects card image metadata", /getAdminPrizePool\(\)[\s\S]*from\("cards"\)[\s\S]*select\("id,name,card_code,grade,image_url,image_storage_path,prize_category"\)/);
check("src/features/ynot/data.ts", "admin prize pool reader maps card image metadata", /cardCode:[\s\S]*cardGrade:[\s\S]*cardImageUrl:[\s\S]*cardImageStoragePath:[\s\S]*cardPrizeCategory:/);
check("src/features/ynot/client.tsx", "admin prize picker exposes selected card preview identity", /function AdminPrizeCardPicker[\s\S]*data-selected-card-id[\s\S]*catalogCardId[\s\S]*selected-card-preview/);
check("src/features/ynot/client.tsx", "admin prize picker renders image with stable fallback", /function AdminPrizeCardImage[\s\S]*photoUrl|function AdminPrizeCardImage[\s\S]*imageUrl[\s\S]*admin-prize-card-placeholder/);
check("src/features/ynot/client.tsx", "admin campaign prize rows use image-backed picker", /AdminPrizeCardPicker[\s\S]*value=\{selectedCardId\}[\s\S]*testIdPrefix=\{`campaign-prize-\$\{prize\.localId\}`\}/);
check("src/features/ynot/client.tsx", "admin prize pool form uses image-backed picker", /AdminPrizeCardPicker[\s\S]*value=\{selectedPrizeCardId\}[\s\S]*testIdPrefix="admin-prize-pool-card"/);
notCheck("src/features/ynot/client.tsx", "campaign prize draft does not silently fallback invalid selected card to first option", /cardId:\s*existingCardId\s*\|\|\s*firstCatalogCardId/);
notCheck("src/features/ynot/client.tsx", "campaign row selected card does not mask invalid card with first option", /const selectedCardId =[\s\S]{0,260}:\s*itemOptions\[0\]\?\.catalogCardId/);
notCheck("src/features/ynot/client.tsx", "admin prize pool selected card does not mask invalid card with first option", /const selectedPrizeCardId =[\s\S]{0,260}:\s*prizeItemOptions\[0\]\?\.catalogCardId/);
check("src/features/ynot/client.tsx", "admin campaign form uses a horizontal info prize readiness builder", /admin-pack-builder-layout[\s\S]*admin-pack-info-panel[\s\S]*admin-prize-workspace[\s\S]*admin-readiness-panel/);
check("src/app/globals.css", "admin campaign builder stacks pack info prize builder and readiness as full-width sections", /admin-pack-builder-layout[\s\S]*grid-template-columns: 1fr[\s\S]*admin-pack-info-panel[\s\S]*admin-prize-workspace[\s\S]*admin-readiness-panel/);
check("src/app/globals.css", "admin campaign builder keeps pack info and prize tiers responsive", /admin-pack-info-panel \.admin-form-grid[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[\s\S]*admin-prize-tier-head[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 0\.82fr\)[\s\S]*@media \(max-width: 720px\)[\s\S]*admin-prize-tier-head[\s\S]*grid-template-columns: 1fr/);
notCheck("src/features/ynot/client.tsx", "admin campaign create form hides value weight unlock fields from draft prize builder", /admin-top-prize-controls[\s\S]{0,900}<span>Value<\/span>|className="admin-prize-table-head"[\s\S]{0,260}<span>Value<\/span>|className="admin-prize-table-head"[\s\S]{0,320}<span>Weight<\/span>|High unlock 30%/);
const adminCampaignInitialPrizePayload = sliceBetween(
  "src/features/ynot/client.tsx",
  "initialPrizes: activePrizeDrafts.map((prize) => ({",
  "metadata: {",
  "admin campaign initial prize payload slice",
);
notCheckText(
  "admin campaign initial prize payload omits owner odds fields",
  adminCampaignInitialPrizePayload,
  /(?:valueThb|weight|unlockAtSoldPct)\s*:/,
  "AdminCampaignForm initialPrizes",
);
check("src/features/ynot/client.tsx", "owner approval queue exposes collapsible tier and logic review", /owner-review-details[\s\S]*Random logic[\s\S]*Overview[\s\S]*Prize tiers[\s\S]*owner-prize-section-stack[\s\S]*saveOwnerPrizeOdds/);
const ownerApprovalQueueSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function OwnerApprovalQueue",
  "export function AdminCardForm",
  "owner approval queue source slice",
);
checkText(
  "owner approval queue remains the owner odds surface",
  ownerApprovalQueueSource,
  /saveOwnerPrizeOdds[\s\S]*weight[\s\S]*unlockAtSoldPct[\s\S]*selectedLogicMode/,
  "OwnerApprovalQueue",
);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API keeps value weight unlock owner-only", /hasOwnerOnlyOddsFields[\s\S]*admin\.adminRole !== "owner"[\s\S]*Only an owner can set prize value, weight, or sold unlock odds/);
check("src/features/ynot/client.tsx", "admin campaign form stores prize category metadata", /prizeCategoryOptions[\s\S]*prizeCategoryLabel[\s\S]*metadata: \{[\s\S]*prizeCategory/);
check("src/features/ynot/client.tsx", "admin campaign form blocks mismatched prize quantities", /Prize quantity must equal the total pack quantity/);
check("src/features/ynot/client.tsx", "admin card form calls card API", /\/api\/ynot\/admin\/cards/);
check("src/features/ynot/client.tsx", "admin prize pool form calls prize API", /\/api\/ynot\/admin\/prizes/);
const adminPrizePoolFormSource = sliceBetween(
  "src/features/ynot/client.tsx",
  "export function AdminPrizePoolForm",
  "type AdminPrizeInventoryCard",
  "admin prize pool form source slice",
);
notCheckText(
  "admin prize pool form removes owner odds controls",
  adminPrizePoolFormSource,
  /Drop weight|Unlock at sold|setWeight|setUnlockAtSoldPct|\bweight\s*[,}]|unlockAtSoldPct/,
  "AdminPrizePoolForm",
);
notCheck("src/features/ynot/client.tsx", "admin existing card stock panel removes add-to-pack CTA", /Add to pack|function AdminPrizeCatalogActionList|addCatalogCardToPack/);
check("src/features/ynot/client.tsx", "admin prize inventory panel is separate and adjusts stock quantity", /export function AdminPrizeInventoryPanel[\s\S]*admin-card-inventory-list[\s\S]*updatePrizeQuantity[\s\S]*<Minus[\s\S]*<Plus/);
check("src/app/admin/prizes/page.tsx", "admin prize inventory panel renders outside prize pool form", /<AdminPrizePoolForm[\s\S]*\/>[\s\S]*<AdminPrizeInventoryPanel cards=\{cards\} prizes=\{prizes\}/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign create sanitizes initial prize odds unless owner", /initialPrizesForAdminRole[\s\S]*adminRole === "owner"[\s\S]*valueThb: null[\s\S]*weight: 1[\s\S]*unlockAtSoldPct: 0[\s\S]*normalizePrizeDrafts\(body\.initialPrizes\)/);
check("src/features/ynot/prize-readiness.ts", "initial prize normalization defaults omitted admin weight to one", /numberOrDefault[\s\S]*row\.weight,\s*1[\s\S]*numberOrZero\(row\.unlockAtSoldPct\)/);
check("src/features/ynot/client.tsx", "admin user role form calls users API", /\/api\/ynot\/admin\/users/);
check("src/features/ynot/client.tsx", "admin merge review calls merge API", /\/api\/ynot\/admin\/merge-requests/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/categories/route.ts", "admin category API persists store categories", /from\("store_categories"\)[\s\S]*upsert/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API persists customer display tags", /displayTags[\s\S]*display_tags/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API requires initial prize inventory on create", /initialPrizes[\s\S]*validatePrizeDraftsForSave[\s\S]*saveInitialPrizes/);
check("src/app/api/ynot/admin/campaigns/lifecycle/route.ts", "campaign lifecycle checks prize readiness before review approve publish", /submit_review[\s\S]*approve[\s\S]*publish[\s\S]*getCampaignPrizeReadiness[\s\S]*readinessErrorResponse/);
check("src/features/ynot/prize-readiness.ts", "random pack readiness blocks missing or non-openable prize inventory", /Add prize inventory before saving[\s\S]*Available prize units must cover every remaining pack[\s\S]*No available prize is currently unlocked/);
check("src/features/ynot/prize-readiness.ts", "random pack readiness accepts flexible tiers but enforces inventory coverage", /countByDisplayTier[\s\S]*!prizes\.length[\s\S]*totalPrizeUnits !== totalSlots[\s\S]*initialEligiblePrizeUnits <= 0/);
check("src/features/ynot/prize-readiness.ts", "random pack structure counts only unit-backed display tier rows", /nonVoidUnitsByPrizeId[\s\S]*unitBackedPrizes[\s\S]*displayTierCounts = countByDisplayTier\(unitBackedPrizes\)[\s\S]*topPrizeRows: displayTierCounts\.rainbow[\s\S]*highPoolRows: displayTierCounts\.gold \+ displayTierCounts\.silver/);
check("src/app/api/ynot/admin/cards/route.ts", "admin card API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API assigns draw_round_prizes through live rank allocation", /resolveAdminSession[\s\S]*resolvePrizeRank[\s\S]*from\("draw_round_prizes"\)[\s\S]*(?:insert|update)\(rowPatch\)/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API persists category metadata", /metadataValue[\s\S]*prizeCategory[\s\S]*sourceType[\s\S]*displayGroup[\s\S]*metadata,/);
check("src/app/api/ynot/admin/users/route.ts", "admin users API protects owner changes and self deactivation", /Only an owner can grant owner role[\s\S]*cannot deactivate your own admin access/);
check("src/app/api/ynot/admin/merge-requests/route.ts", "admin merge API uses service-role merge RPCs", /complete_account_merge_request[\s\S]*reject_account_merge_request/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin shipping route uses transaction-safe status RPC", /supabase\.rpc\("update_shipping_request_status"[\s\S]*p_shipping_request_id[\s\S]*p_admin_id[\s\S]*p_status/);
check("src/features/ynot/components.tsx", "shell passes admin state into drawer", /isAdmin=\{renderViewer\.isAdmin\}/);
check("src/features/ynot/StorePreferences.tsx", "admin routes are hidden unless viewer is admin", /isAdmin &&[\s\S]*href="\/admin"/);
check("src/features/ynot/components.tsx", "non-admin admin route gets denial state", /Admin access is required/);
check("src/features/ynot/data.ts", "public campaign reads filter to live openable packs only", /query = query\.eq\("visibility", "public"\)\.eq\("status", "live"\)[\s\S]*campaigns\.filter\(\(campaign\) => campaign\.openable\)/);
check("src/features/ynot/data.ts", "admin dashboard can request private campaigns explicitly", /getCampaigns\(\{ includePrivate: viewer\.isAdmin \}\)/);
check("src/features/ynot/data.ts", "admin user and audit data readers exist", /getAdminUsers[\s\S]*getAdminAuditEvents/);
check("src/features/ynot/data.ts", "admin user reader checks admin before service read", /export async function getAdminUsers\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin audit reader checks admin before service read", /export async function getAdminAuditEvents\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin card reader checks admin before service read", /export async function getAdminCards\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin prize pool reader checks admin before service read", /export async function getAdminPrizePool\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin prize pool reader roundtrips category metadata", /getAdminPrizePool\(\)[\s\S]*prizeCategory: metadataString\(prize\.metadata, "prizeCategory"\)[\s\S]*sourceType: metadataString\(prize\.metadata, "sourceType"\)/);
notCheck("src/app/admin/users/page.tsx", "admin users page is not a placeholder", /Module status/);
notCheck("src/app/admin/prizes/page.tsx", "admin prizes page is not a placeholder", /Module status/);
notCheck("src/app/admin/rankings/page.tsx", "admin rankings page is not a placeholder", /Module status/);
notCheck("src/app/admin/audit/page.tsx", "admin audit page is not a placeholder", /Module status/);

const migration = "../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql";
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
check(migration, "phase2 migration creates account merge completion RPC", /create or replace function public\.complete_account_merge_request[\s\S]*update public\.user_identities set profile_id = target_profile\.id[\s\S]*account_merge_completed/);
check(migration, "phase2 migration enables RLS for platform public tables", /alter table public\.top_up_requests enable row level security;[\s\S]*alter table public\.ranking_snapshots enable row level security;/);
check(migration, "phase2 migration grants RPC execute only to service_role", /revoke all on function public\.open_gacha_campaign[\s\S]*grant execute on function public\.open_gacha_campaign[\s\S]*to service_role/);
notCheck(migration, "phase2 migration does not grant table writes to authenticated users", /grant (?:insert|update|delete|all)[\s\S]* to authenticated/i);

check("src/lib/supabase/types.ts", "types include top_up_requests", /top_up_requests:\s*{[\s\S]*coin_amount: number;/);
check("src/lib/supabase/types.ts", "types include collection_items", /collection_items:\s*{[\s\S]*source_type: "gacha_open"/);
check("src/lib/supabase/types.ts", "types include platform RPCs", /open_gacha_campaign:[\s\S]*approve_exchange_order:[\s\S]*request_shipping_for_items:/);
check("src/app/api/ynot/admin/exchange/route.ts", "admin exchange route uses wallet ledger RPCs", /approve_exchange_order[\s\S]*reject_exchange_order/);
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
