import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function readOptional(rel) {
  const url = new URL(`../${rel}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

const packageSource = read("package.json");
const dataSource = read("src/features/ynot/data.ts");
const typesSource = read("src/features/ynot/types.ts");
const adminUsersPage = read("src/app/admin/users/page.tsx");
const adminUserDetailPage = read("src/app/admin/users/[profileId]/page.tsx");
const adminUser360 = read("src/features/ynot/admin/AdminUser360.tsx");
const adminUsersRoute = read("src/app/api/ynot/admin/users/route.ts");
const adminUserDetailRoute = readOptional("src/app/api/ynot/admin/users/[profileId]/detail/route.ts");
const adminShippingPage = read("src/app/admin/shipping/page.tsx");
const adminTopUpsPage = read("src/app/admin/top-ups/page.tsx");
const adminShippingRoute = read("src/app/api/ynot/admin/shipping/route.ts");
const adminTopUpsRoute = read("src/app/api/ynot/admin/top-ups/route.ts");
const gachaOpenRoute = read("src/app/api/ynot/gacha/open/route.ts");
const walletRoute = read("src/app/api/ynot/wallet/route.ts");

test("package exposes the admin User 360 regression script", () => {
  assert.match(packageSource, /"test:admin-user360-flow":\s*"node --test scripts\/test-admin-user360-flow\.mjs"/);
});

test("admin user directory supports search pagination and a read API", () => {
  assert.match(typesSource, /export type YnotAdminUserDirectoryQuery/);
  assert.match(typesSource, /export type YnotAdminUserDirectoryResult/);
  assert.match(typesSource, /\|\s*"disabled"/);
  assert.match(typesSource, /\|\s*"merged"/);
  assert.doesNotMatch(typesSource, /\|\s*"flagged"/);
  assert.doesNotMatch(typesSource, /\|\s*"suspended"/);
  assert.match(dataSource, /export function normalizeAdminUserDirectoryQuery/);
  assert.match(dataSource, /export async function getAdminUserDirectory/);
  assert.match(adminUsersPage, /searchParams/);
  assert.match(adminUsersPage, /getAdminUserDirectory/);
  assert.match(adminUsersPage, /label="Total users"\s+value=\{directory\.total\}/);
  assert.match(adminUsersPage, /Page inactive/);
  assert.match(adminUsersPage, /name="q"/);
  assert.match(adminUsersPage, /name="role"/);
  assert.match(adminUsersPage, /name="status"/);
  assert.match(adminUsersPage, /<option value="disabled">Disabled<\/option>/);
  assert.match(adminUsersPage, /<option value="merged">Merged<\/option>/);
  assert.doesNotMatch(adminUsersPage, /<option value="flagged">/);
  assert.doesNotMatch(adminUsersPage, /<option value="suspended">/);
  assert.match(adminUsersPage, /Next page/);
  assert.match(adminUsersRoute, /export async function GET\(request: Request\)/);
  assert.match(adminUsersRoute, /resolveAdminSession\(\)/);
  assert.match(adminUsersRoute, /getAdminUserDirectory/);
  assert.match(adminUsersRoute, /Cache-Control",\s*"no-store"/);
});

test("User 360 detail page shows full launch sections without UI-only slices", () => {
  assert.match(typesSource, /exchanges: YnotExchangeOrder\[\]/);
  assert.match(dataSource, /export function normalizeAdminUser360Query/);
  const adminUser360Normalizer = between(
    dataSource,
    "export function normalizeAdminUser360Query",
    "function postgresInList",
  );
  assert.doesNotMatch(adminUser360Normalizer, /section/);
  assert.doesNotMatch(adminUser360Normalizer, /\bpage:/);
  assert.match(dataSource, /getExchanges\(profileId/);
  assert.match(adminUserDetailPage, /searchParams/);
  assert.match(adminUserDetailPage, /normalizeAdminUser360Query/);
  assert.match(adminUserDetailPage, /getAdminUserDetail\(profileId,\s*detailQuery\)/);
  assert.match(adminUser360, /Prize wins/);
  assert.match(adminUser360, /Pack open rewards/);
  assert.match(adminUser360, /Shipping and address/);
  assert.match(adminUser360, /Wallet and top-ups/);
  assert.match(adminUser360, /Exchange history/);
  assert.match(adminUser360, /Support timeline/);
  assert.doesNotMatch(adminUser360, /\.slice\(0,\s*(?:3|8|12|20|30)\)/);
});

test("admin User 360 detail API is admin-only and no-store", () => {
  assert.notEqual(adminUserDetailRoute, "", "detail route must exist");
  assert.match(adminUserDetailRoute, /export const dynamic = "force-dynamic"/);
  assert.match(
    adminUserDetailRoute,
    /type UserDetailRouteContext = \{\s*params: Promise<\{ profileId: string \}>;\s*\};/s,
  );
  assert.doesNotMatch(adminUserDetailRoute, /RouteContext</);
  assert.doesNotMatch(adminUserDetailRoute, /section:/);
  assert.doesNotMatch(adminUserDetailRoute, /\bpage:/);
  assert.match(adminUserDetailRoute, /resolveAdminSession\(\)/);
  assert.match(adminUserDetailRoute, /getAdminUserDetail\(profileId,\s*detailQuery\)/);
  assert.match(adminUserDetailRoute, /Cache-Control",\s*"no-store"/);
  assert.doesNotMatch(adminUserDetailRoute, /error:\s*error\.message/);
});

test("User 360 can deep-link to filtered shipping and top-up operations", () => {
  assert.match(adminUser360, /\/admin\/shipping\?profileId=/);
  assert.match(adminUser360, /\/admin\/top-ups\?profileId=/);
  assert.match(adminShippingPage, /searchParams/);
  assert.match(adminShippingPage, /getShipping\(profileId,\s*true/);
  assert.match(adminTopUpsPage, /profileId/);
  assert.match(adminTopUpsPage, /getTopUps\(profileId,\s*true/);
  const getShippingBlock = between(
    dataSource,
    "export async function getShipping",
    "function publicShippingRequest",
  );
  assert.match(getShippingBlock, /if \(profileId\) query = query\.eq\("profile_id", profileId\)/);
  const getTopUpsBlock = between(
    dataSource,
    "export async function getTopUps",
    "export function toTopUp",
  );
  assert.match(
    getTopUpsBlock,
    /\(includeAll \|\| includeSensitiveSlipDetails\)[\s\S]+resolveAdminSession\(\)/,
  );
});

test("related admin APIs still call the intended database RPCs", () => {
  assert.match(adminShippingRoute, /rpc\("update_shipping_request_status"/);
  assert.match(adminTopUpsRoute, /rpc\("approve_top_up_request"/);
  assert.match(adminTopUpsRoute, /rpc\("reject_top_up_request"/);
  assert.match(gachaOpenRoute, /rpc\("open_gacha_campaign"/);
  assert.match(walletRoute, /rpc\("submit_top_up_request"/);
});

test("User 360 work does not widen public house-info responses", () => {
  const publicOpenItem = between(gachaOpenRoute, "function toPublicOpenItem", "function toPublicOpenResult");
  const publicOpenResult = between(gachaOpenRoute, "function toPublicOpenResult", "function openErrorMessage");
  const publicCampaign = between(dataSource, "function publicYnotCampaign", "function localOwnerMockPrizeLineup");
  for (const privateField of [
    "logic_snapshot",
    "logicMode",
    "weight",
    "unlockAtSoldPct",
    "stockUnitId",
    "stockSkuId",
    "stockLabel",
    "drawRoundPrizeUnitIds",
    "identityMismatch",
    "primaryReason",
    "intendedStock",
  ]) {
    assert.doesNotMatch(publicOpenItem, new RegExp(privateField));
    assert.doesNotMatch(publicOpenResult, new RegExp(privateField));
    assert.doesNotMatch(publicCampaign, new RegExp(`${privateField}:`));
  }
});
