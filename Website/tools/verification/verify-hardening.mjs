#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function pathFor(file) {
  return resolve(root, file);
}

function read(file) {
  return readFileSync(pathFor(file), "utf8");
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function includes(file, needle, message) {
  const text = read(file);
  if (text.includes(needle)) pass(message);
  else fail(`${message}: missing ${needle}`);
}

function matches(file, pattern, message) {
  const text = read(file);
  if (pattern.test(text)) pass(message);
  else fail(`${message}: missing ${pattern}`);
}

function notIncludes(file, needle, message) {
  const text = read(file);
  if (!text.includes(needle)) pass(message);
  else fail(`${message}: unexpected ${needle}`);
}

function fileExists(file, message) {
  if (existsSync(pathFor(file))) pass(message);
  else fail(`${message}: ${file} missing`);
}

fileExists(".omx/context/fix-all-weaknesses-20260508T160220Z.md", "Ralph context snapshot exists");
fileExists(".omx/plans/prd-fix-project-weaknesses.md", "Ralph weakness PRD exists");
fileExists(".omx/plans/test-spec-fix-project-weaknesses.md", "Ralph weakness test spec exists");
fileExists(".omx/plans/prd-complete-admin-db-workflows.md", "Ralph complete-admin PRD exists");
fileExists(".omx/plans/test-spec-complete-admin-db-workflows.md", "Ralph complete-admin test spec exists");
fileExists(".omx/plans/prd-production-admin-test-data-readiness.md", "Production admin test PRD exists");
fileExists(".omx/plans/test-spec-production-admin-test-data-readiness.md", "Production admin test spec exists");

includes("src/features/ynot/runtime-flags.ts", "allowDemoStorefront", "demo storefront runtime flag exists");
matches("src/features/ynot/runtime-flags.ts", /process\.env\.NODE_ENV === "production"[\s\S]*return false/, "demo storefront defaults off in production");
includes("src/features/ynot/components.tsx", "function displayCampaigns(campaigns: YnotCampaign[])", "storefront displayCampaigns helper exists");
includes("src/features/ynot/components.tsx", "? featuredCampaigns", "storefront demo fallback is production-gated");
matches("src/features/ynot/data.ts", /allowDemoStorefront\(\)[\s\S]*featuredCampaigns\.find/, "campaign detail demo fallback is production-gated");

for (const file of [
  "src/features/ynot/components.tsx",
  "src/features/ynot/client.tsx",
  "src/features/ynot/storefront-content.ts",
]) {
  notIncludes(file, "sampleCollectionCards", `${file} has no sample collection cards`);
}

for (const needle of [
  "href=\"/gacha/pokemon-gold-07",
  "\"/gacha/pokemon-gold-07/open\"",
  "Live Now",
  "Just got",
  "Otto J.",
  "Mint S.",
  "HUSKY",
  "TSUYOSHI_CFC",
  "JOIN OVER 250,000",
  "data.wallet.balanceCoins || 1250",
  "Every pull has a verifiable hash",
]) {
  notIncludes("src/features/ynot/components.tsx", needle, `components avoid demo/live claim: ${needle}`);
}
notIncludes("src/features/ynot/phase-readiness.ts", "/gacha/pokemon-gold-07", "phase readiness has no hardcoded demo campaign route");
includes("src/features/ynot/components.tsx", "campaign.demo && allowDemoStorefront() ? (", "static reward tiers are demo-gated");
includes("src/features/ynot/components.tsx", "No ranking data yet", "ranking empty state replaces fake rankings");
includes("src/features/ynot/components.tsx", "No real live packs are published yet", "store status empty state replaces fake live activity");

for (const [file, needles] of Object.entries({
  "src/app/(store)/collection/page.tsx": ["Pending 24", "Awaiting ship 3", "Shipped 12", "● 4,614"],
  "src/app/(store)/exchange/page.tsx": ["sold-out overlay", "Trade coin for real cards"],
  "src/app/(store)/gacha/[campaignId]/page.tsx": ["provably fair"],
  "src/features/ynot/components.tsx": ["252,433", "BONUS ✦ 4,614", "exchangeCatalog", "PROVABLY FAIR", "provably fair"],
  "src/features/ynot/storefront-content.ts": ["exchangeCatalog", "exchangeCategories", "(PSA10) Lucia", "SOLD OUT"],
})) {
  for (const needle of needles) notIncludes(file, needle, `${file} avoids fake/static claim: ${needle}`);
}
includes("src/app/(store)/collection/page.tsx", "walletBalance={data.wallet.balanceCoins}", "collection shell coin balance is wallet-backed");
includes("src/app/(store)/collection/page.tsx", "collection={data.collection}", "collection page passes real collection data");
includes("src/features/ynot/cr/HistoryExperience.tsx", "enriched.filter((c) => c.bucket === \"owned\")", "collection status counts are collection-backed");
includes("src/app/(store)/exchange/page.tsx", "wallet={data.wallet}", "exchange panel receives real wallet data");
includes("src/features/ynot/components.tsx", "Real exchange requests only", "exchange panel uses real-request empty state");
includes("src/features/ynot/components.tsx", "SERVER RECORDED", "gacha artwork uses supported server-recorded claim");
notIncludes("src/features/ynot/components.tsx", "Math.ceil(campaign.totalSlots * 0.42)", "components do not fabricate 42 percent remaining stock");
notIncludes("src/features/ynot/components.tsx", "0.42", "components contain no hardcoded stock percentage fallback");
notIncludes("src/features/ynot/components.tsx", "remaining(campaign).toLocaleString()", "components do not directly render fallback remaining counts");
includes("src/features/ynot/components.tsx", "typeof remainingSlots !== \"number\" || !Number.isFinite(remainingSlots)", "remaining stock requires a finite explicit remainingSlots value");
includes("src/features/ynot/components.tsx", "Stock tracked by server", "store status has neutral stock copy when DB count is unavailable");
includes("src/features/ynot/components.tsx", "Server-tracked stock", "cards/details avoid fabricated stock counts when DB count is unavailable");
includes("src/features/ynot/components.tsx", "remainingSlots === null", "stock rendering branches on unknown remainingSlots");
notIncludes("src/app/(store)/gacha/[campaignId]/page.tsx", "stock count", "gacha detail copy avoids claiming a precise stock count");
includes("src/features/ynot/components.tsx", "aria-label=\"Pack price and stock status\"", "gacha detail copy uses stock status wording");

includes("src/features/ynot/data.ts", "getPlatformHealth", "admin platform health loader exists");
includes("src/features/ynot/components.tsx", "PlatformHealthPanel", "admin platform health panel exists");
includes("src/features/ynot/types.ts", "YnotPlatformHealth", "platform health types exist");
for (const table of ["cards", "draw_round_prizes", "api_rate_limits"]) {
  matches("src/features/ynot/data.ts", new RegExp(`tableHealthCheck\\([\\s\\S]*"${table}"`), `admin health checks ${table}`);
}
for (const table of ["store_categories", "draw_round_categories", "draw_round_prize_units", "seed_runs"]) {
  matches("src/features/ynot/data.ts", new RegExp(`tableHealthCheck\\([\\s\\S]*"${table}"`), `admin health checks production test table ${table}`);
}
includes("src/features/ynot/data.ts", "RATE_LIMIT_BACKEND", "admin health reports rate-limit backend");
includes("src/features/ynot/data.ts", "dataIssueStorage", "dashboard records degraded data reads per request");
includes("src/features/ynot/data.ts", "Dashboard data reads", "admin health surfaces degraded data reads");
includes("src/features/ynot/types.ts", "YnotDataIssue", "dashboard data issue type exists");
includes("src/features/ynot/types.ts", "dataIssues: YnotDataIssue[]", "dashboard payload includes data issue evidence");
notIncludes("src/features/ynot/data.ts", "getCardCatalog(supabase).catch", "card catalog errors are not silently swallowed by catch fallback");

fileExists("src/lib/security/rate-limit.ts", "shared rate-limit helper exists");
for (const needle of [
  "RATE_LIMIT_BACKEND",
  "consume_api_rate_limit",
  "process.env.NODE_ENV === \"production\"",
  "RATE_LIMIT_ALLOW_IN_MEMORY_PRODUCTION",
]) {
  includes("src/lib/security/rate-limit.ts", needle, `rate-limit helper includes ${needle}`);
}
fileExists("../Database/supabase/migrations/20260508162000_add_api_rate_limits.sql", "api_rate_limits migration exists");
for (const needle of [
  "create table if not exists public.api_rate_limits",
  "consume_api_rate_limit",
  "grant execute on function public.consume_api_rate_limit",
  "service_role",
]) {
  includes("../Database/supabase/migrations/20260508162000_add_api_rate_limits.sql", needle, `rate-limit migration includes ${needle}`);
}
includes("src/lib/supabase/types.ts", "api_rate_limits", "Supabase types include api_rate_limits");
includes("src/lib/supabase/types.ts", "consume_api_rate_limit", "Supabase types include consume_api_rate_limit RPC");

const adminShippingRpcMigration = "../Database/supabase/migrations/20260509162000_add_admin_shipping_status_rpc.sql";
fileExists(adminShippingRpcMigration, "admin shipping status RPC migration exists");
for (const needle of [
  "create or replace function public.update_shipping_request_status",
  "security invoker",
  "for update;",
  "shipping_request_terminal",
  "invalid_shipping_transition",
  "update public.collection_items item",
  "'shipping_status_updated'",
  "revoke all on function public.update_shipping_request_status",
  "from public, anon, authenticated",
  "grant execute on function public.update_shipping_request_status",
  "to service_role",
]) {
  includes(adminShippingRpcMigration, needle, `admin shipping RPC migration includes ${needle}`);
}
includes("src/app/api/ynot/admin/shipping/route.ts", "supabase.rpc(\"update_shipping_request_status\"", "admin shipping route calls transaction RPC");
notIncludes("src/app/api/ynot/admin/shipping/route.ts", "from(\"shipping_requests\").update", "admin shipping route does not directly update shipping_requests");
notIncludes("src/app/api/ynot/admin/shipping/route.ts", "from(\"collection_items\")", "admin shipping route does not directly mutate collection_items");
notIncludes("src/app/api/ynot/admin/shipping/route.ts", "from(\"audit_events\").insert", "admin shipping route leaves audit insert to RPC");
includes("src/lib/supabase/types.ts", "update_shipping_request_status", "Supabase types include update_shipping_request_status RPC");
const productionTestMigration = "../Database/supabase/migrations/20260509100000_admin_test_categories_inventory.sql";
fileExists(productionTestMigration, "production admin test migration exists");
for (const needle of [
  "create table if not exists public.store_categories",
  "create table if not exists public.draw_round_prize_units",
  "create or replace function public.ensure_draw_round_prize_units",
  "create or replace function public.open_gacha_campaign",
  "for update skip locked",
  "coalesce(is_test, false) = false",
]) {
  includes(productionTestMigration, needle, `production admin test migration includes ${needle}`);
}
const cardToneRemovalMigration = "../Database/supabase/migrations/20260509183000_remove_card_tone_fields.sql";
fileExists(cardToneRemovalMigration, "card tone removal migration exists");
for (const needle of [
  "card - 'tone'",
  "alter table if exists public.draw_round_prizes drop column if exists tone",
  "alter table if exists public.cards drop column if exists tone",
]) {
  includes(cardToneRemovalMigration, needle, `card tone removal migration includes ${needle}`);
}
fileExists("tools/seed/seed-production-admin-test-data.mjs", "production admin test seed script exists");
fileExists("tools/seed/assets/asset-manifest.json", "production admin test asset manifest exists");
fileExists("tools/verification/check-production-supabase-readiness.mjs", "production Supabase readiness checker exists");
includes("tools/seed/seed-production-admin-test-data.mjs", "ALLOW_PRODUCTION_TEST_SEED", "production seed script requires acknowledgement");
includes("tools/verification/check-production-supabase-readiness.mjs", "store_categories", "production Supabase readiness checker documents category/table failures");
includes("src/app/api/ynot/admin/categories/route.ts", "store_categories", "admin category API persists database categories");
includes("src/app/api/ynot/admin/categories/route.ts", "CATEGORY_SCHEMA_MISSING", "admin category API reports missing production schema clearly");
includes("src/features/ynot/client.tsx", "function AdminField", "admin forms render explicit field titles");
includes("src/features/ynot/client.tsx", "Saved category", "admin category form updates with save confirmation");
includes("src/features/ynot/client.tsx", "Planned pack quantity", "admin prize form labels planned pack quantity field");
includes("src/app/api/ynot/admin/prizes/route.ts", "planned_quantity", "admin prize API stores planned pack quantity");
notIncludes("src/app/api/ynot/admin/prizes/route.ts", "ensure_draw_round_prize_units", "admin prize API does not materialize pack units before owner approval");
includes("src/app/api/ynot/admin/cards/route.ts", "japan-toreca", "admin card API blocks Japan Toreca test assets");
includes("src/features/ynot/data.ts", "canReadTestCampaign", "test campaign detail path checks whitelist");
includes("src/app/(store)/gacha/[campaignId]/page.tsx", "allowTestForCurrentViewer: true", "gacha detail page allows whitelisted test-pack read path");
includes("src/app/(store)/gacha/[campaignId]/open/page.tsx", "allowTestForCurrentViewer: true", "gacha open page allows whitelisted test-pack read path");
fileExists("docs/architecture/admin-workflow-matrix.md", "admin workflow matrix document exists");
for (const needle of ["Complete current schema", "store_categories", "media_assets", "Production migration guard"]) {
  includes("docs/architecture/admin-workflow-matrix.md", needle, `admin workflow matrix includes ${needle}`);
}

for (const [file, needles] of Object.entries({
  "src/features/ynot/client.tsx": ["setTone", "value={tone}", "<option value=\"gold\">Gold</option>"],
  "src/app/api/ynot/admin/cards/route.ts": ["tone:"],
  "src/app/api/ynot/admin/prizes/route.ts": ["tone:", "toneValue"],
  "src/features/lucky-draw/admin/AdminView.tsx": ["label=\"Color\"", "patch.tone", "tone: \"gold\"", "[\"red\", \"gold\", \"blue\", \"green\", \"rose\", \"violet\"]"],
  "src/features/lucky-draw/shared/CardArtwork.tsx": ["card.tone"],
  "src/lib/lucky-draw/data.ts": ["toCardTone", "row.tone", "prize.tone"],
  "src/lib/lucky-draw/types.ts": ["tone:"],
  "src/features/ynot/types.ts": ["tone:"],
  "src/lib/supabase/types.ts": ["tone:"],
  "tools/seed/seed-production-admin-test-data.mjs": ["tone:", "tone,"],
})) {
  for (const needle of needles) notIncludes(file, needle, `${file} removed legacy tone field: ${needle}`);
}

for (const file of [
  "src/app/api/ynot/wallet/route.ts",
  "src/app/api/ynot/gacha/open/route.ts",
  "src/app/api/ynot/shipping/route.ts",
  "src/app/api/ynot/addresses/route.ts",
  "src/app/api/ynot/admin/campaigns/cost/route.ts",
  "src/app/api/ynot/admin/campaigns/lifecycle/route.ts",
  "src/app/api/ynot/admin/campaigns/reorder/route.ts",
  "src/app/api/ynot/admin/campaigns/route.ts",
  "src/app/api/ynot/admin/card-stock/route.ts",
  "src/app/api/ynot/admin/categories/route.ts",
  "src/app/api/ynot/admin/cards/image/route.ts",
  "src/app/api/ynot/admin/cards/route.ts",
  "src/app/api/ynot/admin/featured-packs/route.ts",
  "src/app/api/ynot/admin/merge-requests/route.ts",
  "src/app/api/ynot/admin/payment-methods/route.ts",
  "src/app/api/ynot/admin/prizes/odds/route.ts",
  "src/app/api/ynot/admin/prizes/route.ts",
  "src/app/api/ynot/admin/shipping/route.ts",
  "src/app/api/ynot/admin/tier-animations/route.ts",
  "src/app/api/ynot/admin/top-ups/route.ts",
  "src/app/api/ynot/admin/users/route.ts",
]) {
  includes(file, "await enforceRateLimit", `${file} awaits rate limiting before mutation`);
}

for (const file of [
  "src/app/api/ynot/collection/convert/route.ts",
  "src/app/api/ynot/exchange/route.ts",
]) {
  includes(file, "handleCardConversionRequest", `${file} delegates to hardened card conversion handler`);
}
includes("src/lib/ynot/card-conversion-api.ts", "await enforceRateLimit", "card conversion handler awaits rate limiting before mutation");
includes("src/lib/ynot/card-conversion-api.ts", "enforceSameOriginMutation(request)", "card conversion rejects cross-origin cookie mutations");
includes("src/lib/ynot/card-conversion-api.ts", "isCollectionItemActionToken", "card conversion validates collection action tokens");
includes("src/lib/ynot/card-conversion-api.ts", "resolveCollectionItemActionTokens", "card conversion resolves collection tokens server-side");
includes("src/lib/ynot/card-conversion-api.ts", "IDEMPOTENCY_KEY_RE", "card conversion rejects unsafe idempotency keys");
includes("src/lib/ynot/card-conversion-api.ts", "publicConversionResult", "card conversion returns allowlisted RPC data");
notIncludes("src/lib/ynot/card-conversion-api.ts", "ledgerId", "card conversion does not expose ledger ids");
includes("src/lib/ynot/collection-action-tokens.ts", "Missing server-only collection action token secret.", "collection action tokens fail closed without server-only secret");
notIncludes("src/lib/ynot/collection-action-tokens.ts", "NEXT_PUBLIC_", "collection action tokens do not use public env secrets");
notIncludes("src/lib/ynot/collection-action-tokens.ts", "ynott-local", "collection action tokens do not use hardcoded dev fallback secrets");
matches(
  "src/lib/ynot/card-conversion-api.ts",
  /Response\.json\(\s*\{ error: conversionErrorMessage\(error\.message\) \}/,
  "card conversion maps database errors before returning them",
);

includes("src/app/api/ynot/admin/featured-packs/route.ts", "resolveAdminSession", "featured packs route requires admin session");

fileExists("docs/architecture/api-boundary.md", "API boundary document exists");
for (const needle of ["/api/lucky-draw", "/api/line", "/api/ynot", "Public storefront should show real published DB campaigns in production"]) {
  includes("docs/architecture/api-boundary.md", needle, `API boundary includes ${needle}`);
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["verify:hardening"] === "npm run test:uploads && node tools/verification/verify-hardening.mjs"
  || pkg.scripts?.["verify:hardening"] === "npm run test:uploads && node tools/verification/verify-hardening.mjs && node tools/verification/verify-rls-coverage.mjs"
  || pkg.scripts?.["verify:hardening"] === "npm run test:uploads && npm run test:production-security-regressions && node tools/verification/verify-hardening.mjs && node tools/verification/verify-rls-coverage.mjs"
  || pkg.scripts?.["verify:hardening"] === "node tools/verification/verify-hardening.mjs"
) pass("package has verify:hardening script");
else fail("package missing verify:hardening script");
if (pkg.scripts?.["test:uploads"] === "node --test scripts/test-magic-bytes.mjs") pass("package has test:uploads script");
else fail("package missing test:uploads script");
if (pkg.scripts?.["verify:ynot"]?.includes("verify:hardening")) pass("verify:ynot includes hardening verification");
else fail("verify:ynot does not include hardening verification");
if (pkg.scripts?.["verify:ynot"]?.includes("verify:production-test")) pass("verify:ynot includes production-test verification");
else fail("verify:ynot does not include production-test verification");
if (pkg.scripts?.["verify:production-db"] === "node tools/verification/check-production-supabase-readiness.mjs") pass("package has optional verify:production-db script");
else fail("package missing optional verify:production-db script");

function envCheck(name, expected, message) {
  const actual = process.env[name];
  if (actual === expected) pass(message);
  else fail(`${message}: expected process.env.${name}="${expected}", got "${actual ?? "(unset)"}"`);
}

// --- Security review remediation assertions (2026-05) ---

// Finding 1: /api/debug/whoami production gate + drop fingerprintable fields
includes(
  "src/app/api/debug/whoami/route.ts",
  'if (process.env.NODE_ENV === "production")',
  "whoami is unconditionally disabled in production",
);
notIncludes("src/app/api/debug/whoami/route.ts", "valuePrefix", "whoami does not expose cookie valuePrefix");
notIncludes("src/app/api/debug/whoami/route.ts", "valueLength", "whoami does not expose cookie valueLength");
notIncludes("src/app/api/debug/whoami/route.ts", "sbAuthCookies", "whoami does not expose sbAuthCookies");

// Finding 2 (partial): five non-CSP security headers in next.config.ts
// CSP intentionally deferred to a follow-up PR
includes("next.config.ts", "Strict-Transport-Security", "HSTS header declared in next.config.ts");
notIncludes("next.config.ts", "preload", "HSTS preload deferred to follow-up PR after soak");
includes("next.config.ts", "X-Frame-Options", "X-Frame-Options declared in next.config.ts");
includes("next.config.ts", "X-Content-Type-Options", "X-Content-Type-Options declared in next.config.ts");
includes("next.config.ts", "Referrer-Policy", "Referrer-Policy declared in next.config.ts");
includes("next.config.ts", "Permissions-Policy", "Permissions-Policy declared in next.config.ts");
includes("next.config.ts", "browsing-topics=()", "Permissions-Policy includes browsing-topics opt-out");

// Finding 3: shared magic-byte helper + four upload routes adopt it
fileExists("src/lib/uploads/magic-bytes.ts", "magic-bytes helper exists");
includes("src/lib/uploads/magic-bytes.ts", "server-only", "magic-bytes helper is server-only");
includes("src/lib/uploads/magic-bytes.ts", "verifyImageMagicBytes", "magic-bytes helper exports verifyImageMagicBytes");
includes("src/lib/uploads/magic-bytes.ts", "0xff, 0xd8, 0xff", "magic-bytes helper has JPEG signature");
includes("src/lib/uploads/magic-bytes.ts", "0x89, 0x50, 0x4e, 0x47", "magic-bytes helper has PNG signature");
includes("src/lib/uploads/magic-bytes.ts", "0x57, 0x45, 0x42, 0x50", "magic-bytes helper has WEBP marker");

// Drift guard: the test file must use the SAME byte literals as the helper
fileExists("scripts/test-magic-bytes.mjs", "magic-bytes test runner exists");
includes("scripts/test-magic-bytes.mjs", "0xff, 0xd8, 0xff", "test runner uses same JPEG signature");
includes("scripts/test-magic-bytes.mjs", "0x89, 0x50, 0x4e, 0x47", "test runner uses same PNG signature");
includes("scripts/test-magic-bytes.mjs", "0x57, 0x45, 0x42, 0x50", "test runner uses same WEBP marker");

for (const routeFile of [
  "src/app/api/lucky-draw/route.ts",
  "src/app/api/ynot/wallet/route.ts",
  "src/app/api/lucky-draw/admin/card-image/route.ts",
  "src/app/api/lucky-draw/admin/qr/route.ts",
]) {
  includes(routeFile, "verifyImageMagicBytes", `${routeFile} imports verifyImageMagicBytes`);
  notIncludes(routeFile, "contentType: slipFile.type", `${routeFile} no longer trusts slipFile.type for storage`);
  notIncludes(routeFile, "contentType: file.type", `${routeFile} no longer trusts file.type for storage`);
}

// Finding 4: sign-up password floor, number, and special-character policy
includes("src/features/auth/password-policy.ts", "SIGNUP_PASSWORD_MIN_LENGTH = 8", "sign-up password policy keeps 8-char minimum");
includes("src/features/auth/password-policy.ts", "SIGNUP_PASSWORD_NUMBER_RE = /\\d/", "sign-up password policy requires a number");
includes("src/features/auth/password-policy.ts", "SIGNUP_PASSWORD_SPECIAL_RE", "sign-up password policy requires a special character");
includes("src/features/auth/actions.ts", "isValidSignupPassword(password)", "sign-up enforces shared password policy");
notIncludes("src/features/auth/actions.ts", "password.length <", "sign-up does not hardcode a password length outside shared policy");
includes("src/features/auth/password-policy.ts", "at least 8 characters and include at least one number and one special character", "sign-up error message explains full password policy");
includes("src/features/auth/SignupPasswordFields.tsx", "Password needs:", "auth form shows password requirements while typing");
includes("src/features/auth/SignupPasswordFields.tsx", "useState(false)", "auth form hides password requirements initially");
includes("src/features/auth/SignupPasswordFields.tsx", "onPointerDown={() => setShowPasswordRequirements(true)}", "auth form shows password requirements on password pointer interaction");
includes("src/features/auth/SignupPasswordFields.tsx", "onKeyDown={() => setShowPasswordRequirements(true)}", "auth form shows password requirements on password keyboard interaction");
includes("src/features/auth/SignupPasswordFields.tsx", "onBlur={() => setShowPasswordRequirements(false)}", "auth form hides password requirements after password blur");
includes("src/features/auth/SignupPasswordFields.tsx", "autoComplete=\"off\"", "auth form avoids browser-generated strong-password prompts on signup fields");
includes("src/features/auth/SignupPasswordFields.tsx", "data-lpignore=\"true\"", "auth form discourages password-manager overlays on signup fields");
includes("src/features/auth/SignupPasswordFields.tsx", "rounded-2xl border border-white/10 bg-black/35 p-3", "auth form renders password requirements in a visible panel");
includes("src/features/auth/SignupPasswordFields.tsx", "At least one number", "auth form explains number requirement");
includes("src/features/auth/SignupPasswordFields.tsx", "At least one special character", "auth form explains special-character requirement");
includes("src/features/auth/SignupPasswordFields.tsx", "Must match the password above.", "auth form explains confirm-password rule");
envCheck(
  "SUPABASE_AUTH_PASSWORD_MIN_VERIFIED",
  "8",
  "operator has attested Supabase Auth dashboard minimum password length is 8 (set SUPABASE_AUTH_PASSWORD_MIN_VERIFIED=8 after updating dashboard)",
);

if (failures.length) {
  console.error(`\n${failures.length} hardening verification failure(s).`);
  process.exit(1);
}

console.log("\nHardening verification passed.");
