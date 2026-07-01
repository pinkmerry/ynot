import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const migration = readFileSync(
  new URL("../../Database/supabase/migrations/20260619090000_bulk_open_sessions.sql", import.meta.url),
  "utf8",
);

function routePath(route) {
  return `src/app/api/ynot/gacha/bulk-open/${route}/route.ts`;
}

function routeSource(route) {
  const path = routePath(route);
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} must exist`);
  return read(path);
}

function compact(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\s+/g, " ");
}

function requireAll(source, patterns, label) {
  for (const pattern of patterns) {
    assert.match(source, pattern, `${label} missing ${pattern}`);
  }
}

function assertNoPrivateDtoFields(source, label) {
  for (const field of [
    "quote_hash",
    "pack_open_contract_hash",
    "pack_open_contract_hash_snapshot",
    "raw_slot",
    "rawSlot",
    "queue_job_id",
    "locked_by",
    "idempotency_key",
    "reward_weights",
    "logic_snapshot",
  ]) {
    assert.equal(source.includes(field), false, `${label} exposes ${field}`);
  }
}

function sourceFrom(source, marker) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing marker ${marker}`);
  return source.slice(index);
}

function functionBlock(source, functionName) {
  const match = source.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );
  assert.ok(match, `missing ${functionName}`);
  return compact(match[0].toLowerCase());
}

test("package exposes the scoped bulk open API-flow test script", () => {
  assert.equal(
    packageJson.scripts["test:bulk-open-api-flow"],
    "node --test scripts/test-bulk-open-api-flow.mjs",
  );
});

test("quote route creates only a safe short-lived start token DTO", () => {
  const source = routeSource("quote");
  const sql = compact(source);

  assert.match(source, /export const dynamic = "force-dynamic"/);
  requireAll(source, [
    /enforceSameOriginMutation/,
    /resolveCurrentProfile/,
    /requireVerifiedAnchor/,
    /enforceRateLimit/,
    /profile_can_open_test_draw_round/,
    /pull_all_enabled/,
    /pull_all_requested/,
    /pull_all_allowlisted/,
    /pull_all_readiness_status/,
    /title_th/,
    /title_en/,
    /prepare_bulk_open_quote/,
    /bulk_open_settlement_not_ready/,
    /soldPct/,
    /startToken/,
  ], "quote route");
  assert.doesNotMatch(source, /\.from\("draw_slots"\)/);
  assert.doesNotMatch(source, /create_bulk_open_start_token/);
  assert.doesNotMatch(source, /quoteHash|contractHash|idempotencyKey|sha256Hex|crypto\.randomUUID/);
  assert.match(sql, /rpc\(\s*"prepare_bulk_open_quote"/);
  assert.match(sql, /p_profile_id:\s*session\.profileid/i);
  assert.match(sql, /p_draw_round_id:\s*campaign\.id/i);
  assert.match(sql, /targetrewards[\s\S]*totalcostcoins[\s\S]*costperreward[\s\S]*expiresat/i);
  assertNoPrivateDtoFields(sourceFrom(source, "return Response.json({\n    quote"), "quote route response");
});

test("localhost preview can quote and start Pull All after the 60 percent sold state", () => {
  const quote = routeSource("quote");
  const start = routeSource("start");
  const current = routeSource("current");
  const seen = routeSource("highlights-seen");
  const previewStore = read("src/features/ynot/local-preview-rewards.ts");

  requireAll(previewStore, [
    /LOCAL_PREVIEW_SOLD_STATE_COOKIE/,
    /preparePreviewPullAllQuote/,
    /previewPullAllQuoteForToken/,
    /startPreviewPullAllSession/,
    /previewCurrentPullAllSessionForProfile/,
    /markPreviewPullAllHighlightsSeen/,
    /recordPreviewOpenResult/,
    /bulkOpenQuotesByToken/,
    /bulkOpenSessionsByProfile/,
    /highlight_rewards_public/,
    /highlights_seen_at/,
    /crypto\.randomUUID\(\)/,
  ], "preview pull-all store");
  assert.doesNotMatch(previewStore, /draw_slots|quote_hash|pack_open_contract_hash|draw_round_prize_units|card_stock_unit_id/);

  requireAll(quote, [
    /isDevAuthAllowed/,
    /LOCAL_PREVIEW_SOLD_STATE_COOKIE/,
    /session\.authUserId === "preview-user"/,
    /request\.headers\.get\("cookie"\)/,
    /preparePreviewPullAllQuote/,
    /targetRewards: 35/,
    /soldPct: 65/,
    /wallet:\s*await readWalletSnapshot\(session\.profileId\)/,
  ], "preview pull-all quote route");

  requireAll(start, [
    /isDevAuthAllowed/,
    /session\.authUserId === "preview-user"/,
    /buildPreviewBulkOpenResult/,
    /previewPullAllQuoteForToken/,
    /publicRewardImageUrl/,
    /previewAllocatedImageByPrizeId/,
    /previewRepresentativeImageByCardId/,
    /startPreviewPullAllSession/,
    /await startPreviewPullAllSession/,
    /toPublicBulkOpenSessionSummary\(started\)/,
    /return Response\.json\(\{[\s\S]*session: \{[\s\S]*\.\.\.summary,[\s\S]*replayed: false,[\s\S]*\},[\s\S]*\}\)/,
  ], "preview pull-all start route");

  requireAll(current, [
    /isDevAuthAllowed/,
    /previewCurrentPullAllSessionForProfile/,
    /session\.authUserId === "preview-user"/,
    /toPublicBulkOpenSessionSummary\(previewSession\)/,
  ], "preview pull-all current route");

  requireAll(seen, [
    /isDevAuthAllowed/,
    /markPreviewPullAllHighlightsSeen/,
    /session\.authUserId === "preview-user"/,
    /return Response\.json\(result\)/,
  ], "preview pull-all highlights-seen route");
});

test("start route loads token service-side and does not trust client quote values", () => {
  const source = routeSource("start");
  const sql = compact(source);

  assert.match(source, /export const dynamic = "force-dynamic"/);
  requireAll(source, [
    /enforceSameOriginMutation/,
    /resolveCurrentProfile/,
    /requireVerifiedAnchor/,
    /enforceRateLimit/,
    /getCloudflareContext/,
    /BULK_OPEN_QUEUE/,
    /queue\.send/,
    /bulk_open_process/,
    /startToken/,
    /gacha_bulk_open_start_tokens/,
    /start_bulk_open_session/,
    /bulk_open_settlement_not_ready/,
    /toPublicBulkOpenSessionSummary/,
  ], "start route");
  assert.match(sql, /p_start_token_id:\s*starttoken/i);
  assert.match(sql, /p_target_slots:\s*token\.target_slots/i);
  assert.match(sql, /p_total_cost_coins:\s*token\.total_cost_coins/i);
  assert.match(sql, /p_quote_hash:\s*token\.quote_hash/i);
  assert.match(sql, /p_pack_open_contract_hash:\s*token\.pack_open_contract_hash/i);
  assert.doesNotMatch(sql, /body\?\.(target|cost|hash|quote|contract)/);
  assertNoPrivateDtoFields(sourceFrom(source, "return Response.json({\n    session"), "start route response");
});

test("Cloudflare worker settles Pull All through one queue-backed RPC chunk at a time", () => {
  const worker = read("bulk-open-worker.ts");
  const coreScheduledJobs = read("src/lib/worker/core-scheduled-jobs.ts");
  const websiteConfig = JSON.parse(read("wrangler.website.jsonc"));
  const ciConfig = JSON.parse(read("wrangler.website.ci.jsonc"));

  requireAll(worker, [
    /openNextWorker\.fetch/,
    /async queue\(batch/,
    /async scheduled/,
    /handleCoreQueueMessage/,
    /runCoreScheduledJobs/,
  ], "bulk open worker");
  requireAll(coreScheduledJobs, [
    /process_bulk_open_chunk/,
    /p_limit:\s*1000/,
    /list_bulk_open_recovery_sessions/,
    /BULK_OPEN_QUEUE\.send/,
    /type QueueJobAdapter/,
    /runQueueJob/,
    /runScheduledRecovery/,
    /retryDelaySeconds/,
    /attempts\?: number/,
    /message\.attempts/,
    /bulk_open_queue_retry/,
  ], "core scheduled jobs");
  assert.doesNotMatch(worker + coreScheduledJobs, /console\.(log|warn)\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(coreScheduledJobs, /MARKETPLACE_SUPABASE|marketplace_expire_pending_payment_orders/);
  assert.equal(websiteConfig.main, "bulk-open-worker.ts");
  assert.equal(ciConfig.main, "bulk-open-worker.ts");
  for (const config of [websiteConfig, ciConfig]) {
    assert.deepEqual(config.triggers.crons, ["*/15 * * * *"]);
    assert.deepEqual(config.queues.producers, [
      { binding: "BULK_OPEN_QUEUE", queue: "ynott-bulk-open" },
    ]);
    assert.equal(config.queues.consumers[0].queue, "ynott-bulk-open");
    assert.equal(config.queues.consumers[0].max_batch_size, 5);
    assert.equal(config.queues.consumers[0].max_retries, 3);
  }
});

test("current route returns only a public active summary", () => {
  const source = routeSource("current");

  assert.match(source, /export const dynamic = "force-dynamic"/);
  requireAll(source, [
    /resolveCurrentProfile/,
    /enforceRateLimit/,
    /gacha_bulk_open_sessions/,
    /bulkOpenActiveStatuses/,
    /open_items_awarded/,
    /collection_items_created/,
    /highlights_seen_at/,
    /completed/,
    /previewCurrentPullAllSessionForProfile/,
    /toPublicBulkOpenSessionSummary/,
  ], "current route");
  assertNoPrivateDtoFields(source, "current route");
});

test("highlights-seen route updates only the current profile public code", () => {
  const source = routeSource("highlights-seen");
  const sql = compact(source);

  assert.match(source, /export const dynamic = "force-dynamic"/);
  requireAll(source, [
    /enforceSameOriginMutation/,
    /resolveCurrentProfile/,
    /requireVerifiedAnchor/,
    /enforceRateLimit/,
    /publicCode/,
    /markPreviewPullAllHighlightsSeen/,
    /mark_bulk_open_highlights_seen/,
  ], "highlights-seen route");
  assert.match(sql, /rpc\(\s*"mark_bulk_open_highlights_seen"/);
  assert.match(sql, /p_profile_id:\s*session\.profileid/i);
  assert.match(sql, /p_public_code:\s*publiccode/i);
  assert.doesNotMatch(source, /\.from\("gacha_bulk_open_sessions"\)/);
  assert.doesNotMatch(source, /\.update\(\{\s*highlights_seen_at/);
  assert.match(source, /updated/);
  assert.match(source, /status:\s*409/);
  assertNoPrivateDtoFields(source, "highlights-seen route");
});

test("normal open route blocks active bulk sessions before exactly one normal open RPC", () => {
  const source = read("src/app/api/ynot/gacha/open/route.ts");
  const activeGuardIndex = source.indexOf("has_active_bulk_open_session");
  const normalOpenIndex = source.indexOf('rpc("open_gacha_campaign"');

  assert.notEqual(activeGuardIndex, -1, "normal open route must call has_active_bulk_open_session");
  assert.notEqual(normalOpenIndex, -1, "normal open route must call open_gacha_campaign");
  assert.ok(activeGuardIndex < normalOpenIndex, "active bulk guard must run before normal open RPC");
  assert.equal(source.match(/rpc\("open_gacha_campaign"/g)?.length ?? 0, 1);
  assert.match(source, /active_bulk_open_session/i);
  assert.match(source, /status:\s*409/);
  assert.match(source, /if \(error\) throw error/);
  assert.match(source, /Could not verify pack availability/);
  assert.doesNotMatch(source, /isMissingBulkOpenGuardFunction/);
});

test("bulk-open start RPC enforces sold percentage at transaction time", () => {
  const start = functionBlock(migration, "start_bulk_open_session");

  assert.match(start, /total_slots/);
  assert.match(start, /sold_slots/);
  assert.match(start, /available_target/);
  assert.match(start, /sold_pct/);
  assert.match(start, /sold_pct\s*<\s*60/);
  assert.match(start, /bulk_open_sold_threshold_not_met/);
});
