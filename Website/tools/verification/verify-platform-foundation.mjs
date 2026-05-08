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
check("src/app/layout.tsx", "production metadata is set", /YNot TCG · Lucky Draw/);
check("src/features/ynot/components.tsx", "normal web login and signup navigation exist", /href="\/login"[\s\S]*href="\/signup"/);
check("src/app/page.tsx", "home page reads category, tag, and sort filters from URL search params", /searchParams[\s\S]*normalizeHomeSeries\(params\?\.series\)[\s\S]*normalizeHomeTag\(params\?\.tag\)[\s\S]*normalizeHomeSort\(params\?\.sort\)/);
check("src/features/ynot/components.tsx", "home category and tag filters are real links that preserve filter state", /homeFilterHref[\s\S]*href=\{homeFilterHref\(\{ series: category\.series, tag: homeFilter\.tag, sort: homeFilter\.sort \}\)\}/);
check("src/features/ynot/components.tsx", "home campaigns are sorted by selected sort option", /function sortedCampaigns[\s\S]*sort === "latest"[\s\S]*coins-desc[\s\S]*filteredCampaigns[\s\S]*sortedCampaigns\(filtered, filter\.sort\)/);
check("src/features/ynot/StorePreferences.tsx", "sort select updates the URL query", /export function StoreSortSelect[\s\S]*router\.replace\(homeSortHref\(\{ \.\.\.homeFilter, sort \}\), \{ scroll: false \}\)/);
check("src/features/ynot/components.tsx", "customer pack card labels price per pack instead of per random", /coins per pack[\s\S]*\/pack/);
check("src/features/auth/AuthForm.tsx", "LINE login is available from auth pages", /\/api\/line\/login\/start\?mode=login/);
check("src/app/(store)/profile/page.tsx", "profile page exposes LINE connect flow", /mode=connect[\s\S]*Connect LINE to this account/);
check("src/app/api/line/callback/route.ts", "LINE callback validates state and links identity", /state !== storedState\.state[\s\S]*linkLineIdentity/);
check("src/app/api/line/login/start/route.ts", "LINE login requires configured production site origin", /NEXT_PUBLIC_SITE_URL[\s\S]*NODE_ENV === "production"[\s\S]*NEXT_PUBLIC_SITE_URL is required before production LINE login/);
check("src/app/api/line/callback/route.ts", "LINE callback exchanges with trusted redirect URI", /NEXT_PUBLIC_SITE_URL[\s\S]*redirect_uri:\s*redirectUri/);
check("src/app/api/line/login/start/route.ts", "LINE login next path rejects backslash/protocol-relative redirects", /parsed\.origin !== base\.origin[\s\S]*parsed\.pathname/);
check("src/app/api/line/callback/route.ts", "LINE callback next path rejects backslash/protocol-relative redirects", /parsed\.origin !== base\.origin[\s\S]*parsed\.pathname/);
check("src/lib/line/link-identity.ts", "LINE email auto-link only when exactly one active profile matches", /\.limit\(2\)[\s\S]*data\?\.length === 1 \? data\[0\] : null/);
check("src/features/auth/actions.ts", "logout clears legacy LINE session cookie too", /luckyDrawSessionCookie[\s\S]*maxAge: 0/);
check("src/features/ynot/client.tsx", "wallet top-up posts slip upload API", /fetch\("\/api\/ynot\/wallet", \{ method: "POST", body: form \}\)/);
check("src/features/ynot/client.tsx", "address form calls address API", /\/api\/ynot\/addresses/);
check("src/features/ynot/client.tsx", "gacha open button calls API", /\/api\/ynot\/gacha\/open/);
check("src/features/ynot/client.tsx", "collection actions call exchange and shipping APIs", /\/api\/ynot\/exchange[\s\S]*\/api\/ynot\/shipping/);
check("src/features/ynot/client.tsx", "admin payment settings call payment method API", /\/api\/ynot\/admin\/payment-methods/);
check("src/features/ynot/client.tsx", "admin campaign form calls campaign API", /\/api\/ynot\/admin\/campaigns/);
check("src/features/ynot/client.tsx", "admin campaign form and update rows edit customer card labels", /Customer card labels[\s\S]*displayTags/);
check("src/features/ynot/client.tsx", "admin campaign action panel publishes and archives campaigns", /\/api\/ynot\/admin\/campaigns[\s\S]*Make live public[\s\S]*Archive private/);
check("src/features/ynot/client.tsx", "admin card form calls card API", /\/api\/ynot\/admin\/cards/);
check("src/features/ynot/client.tsx", "admin prize pool form calls prize API", /\/api\/ynot\/admin\/prizes/);
check("src/features/ynot/client.tsx", "admin user role form calls users API", /\/api\/ynot\/admin\/users/);
check("src/features/ynot/client.tsx", "admin merge review calls merge API", /\/api\/ynot\/admin\/merge-requests/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/campaigns/route.ts", "admin campaign API persists customer display tags", /displayTags[\s\S]*display_tags/);
check("src/app/api/ynot/admin/cards/route.ts", "admin card API is admin gated", /resolveAdminSession[\s\S]*Admin access is required/);
check("src/app/api/ynot/admin/prizes/route.ts", "admin prize API assigns draw_round_prizes", /resolveAdminSession[\s\S]*from\("draw_round_prizes"\)[\s\S]*onConflict: "draw_round_id,tier,rank"/);
check("src/app/api/ynot/admin/users/route.ts", "admin users API protects owner changes and self deactivation", /Only an owner can grant owner role[\s\S]*cannot deactivate your own admin access/);
check("src/app/api/ynot/admin/merge-requests/route.ts", "admin merge API uses service-role merge RPCs", /complete_account_merge_request[\s\S]*reject_account_merge_request/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin shipping marks delivered cards shipped and cancelled cards owned", /status === "cancelled" \? "owned" : "shipped"/);
check("src/features/ynot/components.tsx", "admin routes are hidden unless viewer is admin", /viewer\.isAdmin &&[\s\S]*href="\/admin"/);
check("src/features/ynot/components.tsx", "non-admin admin route gets denial state", /Admin access is required/);
check("src/features/ynot/data.ts", "public campaign reads filter hidden/private visibility", /query = query\.eq\("visibility", "public"\)\.in\("status", \["live", "closed"\]\)/);
check("src/features/ynot/data.ts", "admin dashboard can request private campaigns explicitly", /getCampaigns\(\{ includePrivate: viewer\.isAdmin \}\)/);
check("src/features/ynot/data.ts", "admin user and audit data readers exist", /getAdminUsers[\s\S]*getAdminAuditEvents/);
check("src/features/ynot/data.ts", "admin user reader checks admin before service read", /export async function getAdminUsers\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin audit reader checks admin before service read", /export async function getAdminAuditEvents\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin card reader checks admin before service read", /export async function getAdminCards\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
check("src/features/ynot/data.ts", "admin prize pool reader checks admin before service read", /export async function getAdminPrizePool\(\)[\s\S]*const admin = await resolveAdminSession\(\);[\s\S]*if \(!admin\) return \[\];[\s\S]*const supabase = createServiceSupabaseClient\(\);/);
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
