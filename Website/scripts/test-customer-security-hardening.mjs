import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  const postBlock = blockBetween(route, "export async function POST", "  const localDuplicateSlip");

  assert.match(route, /import \{ requireVerifiedAnchor \} from "@\/lib\/auth\/verified-anchor"/);
  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(route, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(route, /LEGACY_ORDER_IDEMPOTENCY_KEY_RE/);
  assert.match(route, /normalizeLegacyOrderIdempotencyKey/);
  assert.match(route, /fetchOrderByProfileIdempotency/);
  assert.match(route, /replayLegacyOrderResponse/);

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
