import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function readApp(relPath) {
  return readFileSync(appPath(relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(repoPath(relPath), "utf8");
}

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end marker after ${start}: ${end}`);
  return source.slice(from + start.length, to);
}

function latestMigrationMatching(pattern) {
  const migrationDir = repoPath("Database/supabase/migrations");
  const match = readdirSync(migrationDir)
    .filter((name) => pattern.test(name))
    .sort()
    .at(-1);
  assert.ok(match, `missing migration matching ${pattern}`);
  return readRepo(`Database/supabase/migrations/${match}`);
}

function loadCspModule() {
  const source = readApp("src/lib/security/csp.ts");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(
    outputText,
    { exports: module.exports, module },
    { filename: "src/lib/security/csp.ts" },
  );
  return module.exports;
}

function cspDirectives(policy) {
  return new Map(
    policy.split(";").map((directive) => {
      const [name, ...values] = directive.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

test("customer security regression harness can read app, database, and test files", () => {
  assert.ok(existsSync(appPath("src/features/auth/actions.ts")));
  assert.ok(existsSync(appPath("src/app/api/lucky-draw/route.ts")));
  assert.ok(existsSync(repoPath("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql")));

  const authActions = readApp("src/features/auth/actions.ts");
  assert.match(authActions, /enforceRateLimit/);
  assert.match(authActions, /normalizeSignupEmail/);

  const luckyDrawRoute = readApp("src/app/api/lucky-draw/route.ts");
  assert.match(luckyDrawRoute, /verifyImageMagicBytes/);
  assert.match(luckyDrawRoute, /resolveCurrentProfile/);

  const slotClaimMigration = latestMigrationMatching(/fix_slot_claim_rpc\.sql$/);
  assert.match(slotClaimMigration, /create or replace function public\.claim_order_slots/);
  assert.match(slotClaimMigration, /security invoker/);

  const productionSecurityHarness = readApp("scripts/test-production-security-regressions.mjs");
  assert.match(
    productionSecurityHarness,
    /public storefront routes do not statically reach admin controls/,
  );
});

test("customer action tokens use dedicated secrets instead of service-role fallbacks", () => {
  const helper = readApp("src/lib/security/action-token-secret.ts");
  assert.match(helper, /export function dedicatedActionTokenSecret/);
  assert.doesNotMatch(helper, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(helper, /dev-local-\$\{envKey\.toLowerCase\(\)\}-secret/);

  for (const file of [
    "src/features/auth/pending-signup.ts",
    "src/lib/auth/identity-action-tokens.ts",
    "src/lib/ynot/address-action-tokens.ts",
    "src/lib/ynot/collection-action-tokens.ts",
    "src/lib/ynot/payment-method-action-tokens.ts",
  ]) {
    const source = readApp(file);
    assert.match(source, /dedicatedActionTokenSecret/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /AUTH_SECRET/);
    assert.doesNotMatch(source, /NEXTAUTH_SECRET/);
  }

  const envVerifier = readApp("tools/verification/verify-production-env.mjs");
  for (const name of [
    "SIGNUP_OTP_SECRET",
    "YNOT_IDENTITY_ACTION_TOKEN_SECRET",
    "YNOT_COLLECTION_ACTION_TOKEN_SECRET",
    "YNOT_ADDRESS_ACTION_TOKEN_SECRET",
    "YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET",
  ]) {
    assert.match(envVerifier, new RegExp(`"${name}"`));
  }
  assert.match(envVerifier, /DEDICATED_CUSTOMER_TOKEN_SECRETS/);
  assert.match(envVerifier, /is separate from SUPABASE_SERVICE_ROLE_KEY/);
});

test("production CSP uses request nonces instead of unsafe inline scripts", () => {
  const csp = readApp("src/lib/security/csp.ts");
  assert.match(csp, /export const nonceHeaderName = "x-nonce"/);
  assert.match(csp, /export function createCspNonce/);
  assert.match(csp, /export function buildContentSecurityPolicy/);
  assert.match(csp, /`'nonce-\$\{nonce\}'`/);
  assert.match(csp, /"'strict-dynamic'"/);
  assert.match(csp, /style-src-attr\s+'unsafe-inline'/);
  assert.doesNotMatch(csp, /`script-src[^\n]*'unsafe-inline'/);

  const { buildContentSecurityPolicy } = loadCspModule();
  const policy = buildContentSecurityPolicy({
    nonce: "customer-test-nonce",
    isDevelopment: false,
  });
  const directives = cspDirectives(policy);
  assert.deepEqual(directives.get("script-src"), [
    "'self'",
    "'nonce-customer-test-nonce'",
    "'strict-dynamic'",
    "https://static.line-scdn.net",
  ]);
  assert.deepEqual(directives.get("style-src"), [
    "'self'",
    "'nonce-customer-test-nonce'",
    "https://fonts.googleapis.com",
  ]);
  assert.deepEqual(directives.get("style-src-elem"), [
    "'self'",
    "'nonce-customer-test-nonce'",
    "https://fonts.googleapis.com",
  ]);
  assert.deepEqual(directives.get("style-src-attr"), ["'unsafe-inline'"]);
  assert.ok(!directives.get("script-src")?.includes("'unsafe-inline'"));
  assert.ok(!directives.get("script-src")?.includes("'unsafe-eval'"));

  const middleware = readApp("src/middleware.ts");
  assert.match(middleware, /buildContentSecurityPolicy/);
  assert.match(middleware, /createCspNonce/);
  assert.match(middleware, /requestHeaders\.set\(nonceHeaderName, nonce\)/);
  assert.match(middleware, /response\.headers\.set\("Content-Security-Policy", cspHeader\)/);
  assert.match(middleware, /updateSession\(\s*request,\s*\{\s*requestHeaders\s*\}\s*\)/);

  const proxy = readApp("src/lib/supabase/proxy.ts");
  assert.match(proxy, /requestHeaders\?: Headers/);
  assert.match(proxy, /NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers:\s*requestHeaders\s*\}\s*\}\s*\)/);
  assert.match(proxy, /supabaseResponse = nextWithRequestHeaders\(\)/);

  const nextConfig = readApp("next.config.ts");
  assert.doesNotMatch(nextConfig, /Content-Security-Policy/);
  assert.doesNotMatch(nextConfig, /script-src[^\n]*'unsafe-inline'/);

  const rootLayout = readApp("src/app/layout.tsx");
  assert.match(rootLayout, /export const dynamic = "force-dynamic"/);

  const prototype = readApp("src/app/pack-open-prototype/page.tsx");
  assert.doesNotMatch(prototype, /force-static/);
});

test("customer auth failures are rate-limited and do not expose provider messages", () => {
  const actions = readApp("src/features/auth/actions.ts");
  const passwordBlock = blockBetween(
    actions,
    "export async function signInWithPasswordAction",
    "export async function requestPendingSignUpCodeAction",
  );

  assert.match(actions, /async function authRateLimitError/);
  assert.match(passwordBlock, /authRateLimitError\(\s*"ynot:auth:password",\s*email,/);
  assert.ok(
    passwordBlock.indexOf("authRateLimitError") < passwordBlock.indexOf("signInWithPassword"),
    "password login must consume rate limit before hitting Supabase auth",
  );
  assert.match(passwordBlock, /"Email or password is incorrect\."/);
  assert.doesNotMatch(passwordBlock, /error\?\.message/);

  const googleActionBlock = blockBetween(
    actions,
    "export async function signInWithGoogleAction",
    "export async function signOutAction",
  );
  assert.match(googleActionBlock, /logAuthServerError\("google_sign_in_start_failed", error\)/);
  assert.match(googleActionBlock, /"Google login could not start\. Please try again\."/);
  assert.doesNotMatch(googleActionBlock, /error\?\.message/);

  const googleRoute = readApp("src/app/api/auth/google/start/route.ts");
  assert.match(googleRoute, /console\.warn\("google_oauth_start_failed"/);
  assert.match(googleRoute, /"Google login could not start\. Please try again\."/);
  assert.doesNotMatch(googleRoute, /error\?\.message/);
});

test("legacy lucky-draw orders have idempotency schema and browser retry key", () => {
  const migration = latestMigrationMatching(/legacy_lucky_draw_order_idempotency\.sql$/);
  assert.match(migration, /alter table public\.orders\s+add column if not exists idempotency_key text/i);
  assert.match(
    migration,
    /create unique index if not exists orders_profile_idempotency_unique_idx\s+on public\.orders\s*\(\s*profile_id,\s*idempotency_key\s*\)\s+where idempotency_key is not null/i,
  );

  const types = readApp("src/lib/supabase/types.ts");
  const ordersBlock = blockBetween(types, "orders: {", "payment_slips:");
  assert.match(ordersBlock, /idempotency_key: string \| null/);
  assert.match(ordersBlock, /idempotency_key\?: string \| null/);

  const controller = readApp("src/features/lucky-draw/state/useLuckyDrawController.ts");
  assert.match(controller, /const orderIdempotencyKeyRef = useRef\(""\)/);
  assert.match(controller, /orderIdempotencyKeyRef\.current = crypto\.randomUUID\(\)/);
  assert.match(controller, /form\.set\("idempotencyKey", orderIdempotencyKeyRef\.current\)/);
});

test("legacy lucky-draw order POST uses modern paid-action guardrails", () => {
  const route = readApp("src/app/api/lucky-draw/route.ts");
  const data = readApp("src/lib/lucky-draw/data.ts");
  const normalizeBlock = blockBetween(
    route,
    "function normalizeLegacyOrderIdempotencyKey",
    "async function readCreateOrderRequest",
  );
  const replayBlock = blockBetween(
    route,
    "async function replayLegacyOrderResponse",
    "function isUniqueConstraintError",
  );
  const postBlock = blockBetween(route, "export async function POST", "  const localDuplicateSlip");
  const existingOrderReplayBlock = blockBetween(postBlock, "if (existingOrder) {", "  const activeDraw =");
  const uniqueRaceReplayBlock = blockBetween(
    postBlock,
    "if (isUniqueConstraintError(orderError)) {",
    "    throw orderError;",
  );
  const cleanupBlock = blockBetween(
    route,
    "async function deleteIncompleteLegacyOrder",
    "function isUniqueConstraintError",
  );
  const finalSuccessBlock = blockBetween(
    route,
    "return Response.json({\n    order: toOrder({",
    "\n  });\n}",
  );
  const profileIdempotencyBlock = blockBetween(
    data,
    "export async function fetchOrderByProfileIdempotency",
    "if (error) throw error;",
  );

  assert.match(route, /import \{ requireVerifiedAnchor \} from "@\/lib\/auth\/verified-anchor"/);
  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(route, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(route, /LEGACY_ORDER_IDEMPOTENCY_KEY_RE/);
  assert.match(route, /normalizeLegacyOrderIdempotencyKey/);
  assert.match(route, /fetchOrderByProfileIdempotency/);
  assert.match(route, /replayLegacyOrderResponse/);
  assert.match(data, /export async function fetchOrderByProfileIdempotency/);
  assert.match(profileIdempotencyBlock, /\.eq\(\s*"profile_id",\s*profileId\s*\)/);
  assert.match(profileIdempotencyBlock, /\.eq\(\s*"idempotency_key",\s*idempotencyKey\s*\)/);

  assert.doesNotMatch(normalizeBlock, /crypto\.randomUUID\(\)/);
  assert.match(normalizeBlock, /if\s*\(\s*value\s*==\s*null\s*\)\s*\{\s*return null;?\s*\}/s);
  assert.match(normalizeBlock, /if\s*\(\s*typeof value\s*!==\s*"string"\s*\)\s*return null/);
  assert.match(normalizeBlock, /const clean = value\.trim\(\)/);
  assert.match(normalizeBlock, /if\s*\(\s*!clean\s*\)\s*return null/);
  assert.match(normalizeBlock, /LEGACY_ORDER_IDEMPOTENCY_KEY_RE\.test\(clean\)\s*\?\s*clean\s*:\s*null/);

  assert.match(replayBlock, /const slip = await latestSlipForOrder\(supabase, order\.id\)/);
  assert.match(replayBlock, /if\s*\(\s*!slip\s*\)\s*return null/);
  assert.match(replayBlock, /return\s+jsonNoStore\(\s*\{\s*order:\s*toOrder\(/s);
  assert.match(replayBlock, /replayed:\s*true/);
  assert.ok(
    replayBlock.indexOf("if (!slip) return null") < replayBlock.indexOf("return jsonNoStore"),
    "legacy order replay must only return success after a slip exists",
  );
  assert.doesNotMatch(replayBlock, /slip\?\./);
  assert.doesNotMatch(replayBlock, /storage_provider\s*\?\?\s*"manual_line"/);
  assert.doesNotMatch(replayBlock, /verification_status\s*\?\?\s*"manual_review"/);
  assert.match(route, /return Response\.json\(\{\s*order:\s*toOrder\(/s);
  assert.doesNotMatch(finalSuccessBlock, /replayed/);

  assert.match(route, /async function deleteIncompleteLegacyOrder/);
  assert.match(cleanupBlock, /console\.warn\("legacy_order_incomplete_cleanup_failed"/);
  assert.doesNotMatch(cleanupBlock, /idempotency_key:\s*null/);
  assert.doesNotMatch(cleanupBlock, /\.update\(\s*\{\s*idempotency_key:\s*null\s*\}\s*\)/);
  assert.doesNotMatch(cleanupBlock, /clearLegacyOrderIdempotencyKey/);
  assert.match(postBlock, /deleteIncompleteLegacyOrder\(supabase, order, "slip_upload_failed"\)/);
  assert.match(route, /deleteIncompleteLegacyOrder\(supabase, order, "slip_insert_failed"\)/);
  assert.match(
    existingOrderReplayBlock,
    /return jsonNoStore\(\s*\{\s*error:\s*"Order is still being prepared\. Please try again\."\s*\},\s*\{\s*status:\s*409\s*\}\s*\)/,
  );
  assert.match(
    uniqueRaceReplayBlock,
    /return jsonNoStore\(\s*\{\s*error:\s*"Order is still being prepared\. Please try again\."\s*\},\s*\{\s*status:\s*409\s*\}\s*\)/,
  );

  assert.ok(
    postBlock.indexOf("enforceSameOriginMutation(request)") < postBlock.indexOf("resolveCurrentProfile()"),
    "same-origin guard must run before auth work",
  );
  assert.match(postBlock, /requireVerifiedAnchor\(session\)/);
  assert.match(postBlock, /enforceRateLimit\(\s*request,\s*"ynot:legacy-order:create",\s*\{\s*limit:\s*6,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.ok(
    postBlock.indexOf("content-length") < postBlock.indexOf("readCreateOrderRequest(request)"),
    "content-length reject must happen before multipart parsing",
  );
  assert.match(postBlock, /idempotency_key: idempotencyKey/);
  assert.doesNotMatch(postBlock, /uploadError\.message/);
});

test("legacy profile PATCH keeps PII scoped and rate-limited", () => {
  const route = readApp("src/app/api/lucky-draw/profile/route.ts");
  const patchBlock = blockBetween(route, "export async function PATCH", "    const patch =");

  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(patchBlock, /enforceSameOriginMutation\(request\)/);
  assert.match(patchBlock, /resolveCurrentProfile\(\)/);
  assert.match(patchBlock, /enforceRateLimit\(\s*request,\s*"ynot:legacy-profile:update",\s*\{\s*limit:\s*12,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.ok(
    patchBlock.indexOf("enforceRateLimit") < patchBlock.indexOf("request.json()"),
    "profile write limiter must run before parsing and updating PII",
  );
});

test("legacy customer pick route is rate-limited and not a public-code oracle", () => {
  const data = readApp("src/lib/lucky-draw/data.ts");
  assert.match(data, /export async function findOrderByPublicCodeForProfile/);
  assert.match(data, /\.eq\("public_code", publicCode\)[\s\S]*\.eq\("profile_id", profileId\)/);

  const route = readApp("src/app/api/lucky-draw/picks/route.ts");
  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(route, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(route, /findOrderByPublicCodeForProfile/);
  assert.doesNotMatch(route, /findOrderByPublicCode\(supabase, body\.orderId\)/);
  assert.match(route, /enforceRateLimit\(\s*request,\s*"ynot:legacy-picks:confirm",\s*\{\s*limit:\s*30,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.match(route, /"Could not confirm selected numbers\. Please refresh and try again\."/);
  assert.doesNotMatch(route, /error\.message/);

  const claimRpc = readRepo("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql");
  assert.match(claimRpc, /locked_order\.profile_id is distinct from p_actor_profile_id/);
  assert.match(claimRpc, /not_allowed_to_pick_for_order/);

  const adminOrderRoute = readApp("src/app/api/lucky-draw/admin/order/route.ts");
  assert.match(adminOrderRoute, /claim_order_slots/);
  assert.match(adminOrderRoute, /p_actor_admin_id: session\.adminId/);
});
