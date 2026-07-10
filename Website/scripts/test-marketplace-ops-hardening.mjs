import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628130000_marketplace_ops_hardening.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

function assertCentralMutationGuard(source, relPath) {
  const mutationGuard = readApp("src/lib/marketplace/mutation-guard.ts");
  assert.match(source, /prepareMarketplaceMutation/, `${relPath} must use the centralized mutation guard`);
  assert.match(mutationGuard, /resolveCurrentProfile/, "central mutation guard must resolve YNOTT login");
  assert.match(mutationGuard, /ownerOnlyMarketplaceAccess/, "central mutation guard must keep owner-only prelaunch gate");
  assert.match(mutationGuard, /enforceSameOriginMutation/, "central mutation guard must enforce same origin");
  assert.match(mutationGuard, /enforceRateLimit/, "central mutation guard must rate-limit");
  assert.match(mutationGuard, /marketplaceIdempotencyKey/, "central mutation guard must require idempotency by default");
  assert.match(mutationGuard, /readMarketplaceJsonBody/, "central mutation guard must use JSON allowlists");
  assert.match(mutationGuard, /marketplaceRequestHash/, "central mutation guard must hash requests");
}

const ynotRoutes = [
  "src/app/api/ynot/marketplace/admin/queues/route.ts",
  "src/app/api/ynot/marketplace/admin/reconciliation/route.ts",
  "src/app/api/ynot/marketplace/admin/reconciliation/[itemId]/resolve/route.ts",
  "src/app/api/ynot/marketplace/admin/audit/[targetType]/[targetId]/route.ts",
  "src/app/api/ynot/marketplace/payments/webhook/route.ts",
];

const aliases = [
  "src/app/api/marketplace/admin/queues/route.ts",
  "src/app/api/marketplace/admin/reconciliation/route.ts",
  "src/app/api/marketplace/admin/reconciliation/[itemId]/resolve/route.ts",
  "src/app/api/marketplace/admin/audit/[targetType]/[targetId]/route.ts",
  "src/app/api/marketplace/payments/webhook/route.ts",
];

test("package exposes the scoped marketplace ops hardening test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ops-hardening"],
    "node --test scripts/test-marketplace-ops-hardening.mjs",
  );
});

test("ops hardening migration is separate and creates service-role-only ledgers", () => {
  assert.ok(existsSync(migrationPath), "missing ops hardening marketplace migration");
  const sql = compactSql(readMigration());

  for (const table of [
    "marketplace_provider_payment_events",
    "marketplace_admin_commands",
    "marketplace_audit_event_targets",
  ]) {
    requirePattern(sql, new RegExp(`create table if not exists public\\.${table}\\b`), `missing ${table}`);
    requirePattern(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }

  requirePattern(sql, /provider_event_key text not null unique/);
  requirePattern(sql, /unique \(provider, provider_event_id\)/);
  requirePattern(sql, /payload_hash text not null check \(length\(payload_hash\) = 64\)/);
  requirePattern(sql, /marketplace_provider_event_payload_conflict/);
  requirePattern(sql, /provider_amount_satang integer/);
  requirePattern(sql, /provider_currency text/);
  requirePattern(sql, /marketplace_admin_commands_no_update/);
  requirePattern(sql, /marketplace_admin_commands_no_delete/);
  requirePattern(sql, /old\.result_payload is null/);
  requirePattern(sql, /new\.result_payload is not null/);
  requirePattern(sql, /marketplace_audit_event_targets_lookup_idx/);
  requirePattern(sql, /marketplace_collect_audit_event_targets/);
  requirePattern(sql, /\('payout', 'sellerpayoutid'\)/);
  requirePattern(sql, /revoke all on[\s\S]*public\.marketplace_provider_payment_events[\s\S]*public\.marketplace_admin_commands[\s\S]*public\.marketplace_reconciliation_items[\s\S]*from public, anon, authenticated/);
  requirePattern(sql, /grant all on[\s\S]*public\.marketplace_provider_payment_events[\s\S]*public\.marketplace_admin_commands[\s\S]*public\.marketplace_reconciliation_items[\s\S]*to service_role/);
});

test("ops RPCs lock search_path, revoke browser roles, and grant service_role only", () => {
  const sql = compactSql(readMigration());
  for (const rpc of [
    "marketplace_apply_provider_payment_event",
    "marketplace_resolve_reconciliation_item",
    "marketplace_record_refund_transition",
    "marketplace_release_seller_payout",
    "marketplace_get_bag_summary",
  ]) {
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}\\b`), `missing ${rpc}`);
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*security definer[\\s\\S]*set search_path = public, pg_temp`), `${rpc} must lock search_path`);
    requirePattern(sql, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`), `${rpc} must revoke browser execution`);
    requirePattern(sql, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to service_role`), `${rpc} must grant service_role execution`);
  }

  requirePattern(sql, /p_admin_role not in \('owner', 'admin'\)/, "refund/reconciliation mutation must require owner/admin");
  requirePattern(sql, /p_admin_role <> 'owner'/, "payout release must remain owner-only");
  requirePattern(sql, /refund_row\.refund_amount_satang > order_row\.buyer_total_satang/);
  requirePattern(sql, /normalized_state = 'refunded' and nullif\(trim\(coalesce\(p_provider_reference/);
  requirePattern(sql, /provider_payment_requires_admin_review/);
  requirePattern(sql, /provider_money_mismatch/);
  requirePattern(sql, /provideramountsatang/);
  requirePattern(sql, /create or replace function public\.marketplace_get_bag_summary/);
  requirePattern(sql, /pendingpaymentorders/);
  const webhookFunction = sql.slice(
    sql.indexOf("create or replace function public.marketplace_apply_provider_payment_event"),
    sql.indexOf("create or replace function public.marketplace_resolve_reconciliation_item"),
  );
  assert.doesNotMatch(
    webhookFunction,
    /set payment_state = 'paid'|set payment_state = 'failed'/,
    "webhook must not bypass payment-proof/admin state transitions",
  );
  requirePattern(sql, /item\.reconciliation_state = 'open'/);
  requirePattern(sql, /or has_open_reconciliation/);
  requirePattern(sql, /order_row\.fulfilment_state not in \('shipped', 'completed'\)/);
  requirePattern(sql, /order_row\.refund_state <> 'none'/);
});

test("server ops module is server-only, redacts private data, and verifies webhook signature before JSON parsing", () => {
  const source = readApp("src/lib/marketplace/ops-hardening.ts");
  assert.match(source, /import "server-only"/);
  assert.match(source, /MARKETPLACE_PAYMENT_WEBHOOK_SECRET/);
  assert.doesNotMatch(source, /NEXT_PUBLIC.*WEBHOOK|NEXT_PUBLIC.*SECRET/);
  assert.match(source, /const rawBody = await input\.request\.text\(\)/);
  assert.match(source, /expectedSignature = await hmacSha256Hex\(secret, rawBody\)/);
  assert.match(source, /constantTimeEqual\(submittedSignature, expectedSignature\)/);
  assert.ok(
    source.indexOf("constantTimeEqual(submittedSignature, expectedSignature)") <
      source.indexOf("JSON.parse(rawBody)"),
    "signature must be verified before JSON.parse(rawBody)",
  );
  assert.match(source, /payloadHash = await sha256Hex\(rawBody\)/);
  assert.match(source, /amountSatang = integerField\(body\.amountSatang/);
  assert.match(source, /currency = textField\(body\.currency/);
  assert.match(source, /receiverReference/);
  assert.match(source, /marketplace_apply_provider_payment_event/);
  assert.match(source, /marketplace_audit_event_targets/);
  assert.match(source, /providerEventId/);
  assert.match(source, /safeAuditPayload/);
  assert.match(source, /provider_response/);
  assert.match(source, /proof_storage_path/);
  assert.doesNotMatch(source, /event_payload->>/);
  for (const line of source.split("\n")) {
    assert.ok(
      !(line.includes("rawBody") && (line.includes("return") || line.includes("Response.json"))),
      "raw webhook body must not be returned",
    );
  }
  assert.doesNotMatch(source, /select\([^)]*provider_response|select\([^)]*proof_storage_path/s);
});

test("admin and webhook routes use bounded auth, rate limits, mutation controls, and aliases", () => {
  for (const relPath of ynotRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    assert.doesNotMatch(source, /provider_response|proof_storage_path|rawPayload|bankAccount/i);
    if (relPath.includes("/payments/webhook/")) {
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
      assert.match(source, /applyMarketplacePaymentWebhook/);
      assert.match(source, /marketplace_https_required/);
      assert.doesNotMatch(source, /resolveCurrentProfile|ownerOnlyMarketplaceAccess/);
    } else if (relPath.includes("/resolve/")) {
      assertCentralMutationGuard(source, relPath);
      assert.match(source, /allowedFields: RECONCILIATION_RESOLVE_FIELDS/, `${relPath} mutation must use JSON allowlist`);
      assert.match(source, /mutation\.requestHash/, `${relPath} mutation must hash request`);
    } else if (relPath.includes("/admin/")) {
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
      assert.match(source, /resolveCurrentProfile/, `${relPath} must resolve YNOTT login`);
      assert.match(source, /ownerOnlyMarketplaceAccess/, `${relPath} must keep owner-only prelaunch gate`);
    }
  }

  for (const relPath of aliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /@\/app\/api\/ynot\/marketplace/);
  }
});

test("admin marketplace page surfaces ops counts without raw payment or private proof data", () => {
  const page = readApp("src/app/admin/marketplace/page.tsx");
  const snapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  const ownerGateIndex = page.indexOf('if (config.ownerOnly && admin?.adminRole !== "owner")');
  const snapshotReadIndex = page.indexOf("await buildMarketplaceOpsSnapshot(admin)");
  assert.ok(ownerGateIndex >= 0, "admin marketplace page must enforce owner-only prelaunch");
  assert.ok(
    snapshotReadIndex >= 0,
    "admin marketplace page must load a redacted marketplace ops snapshot",
  );
  assert.doesNotMatch(
    page,
    /listOfficialOrderDashboard|listSellerPayoutQueue|listMarketplaceQueueSummary|listMarketplaceReconciliationItems/,
    "admin marketplace page should render the snapshot instead of orchestrating service reads",
  );
  assert.match(snapshot, /marketplaceAdminAllowed/);
  assert.match(snapshot, /!config\.ownerOnly \|\| admin\?\.adminRole === "owner"/);
  assert.match(snapshot, /listMarketplaceQueueSummary/);
  assert.match(snapshot, /listMarketplaceReconciliationItems/);
  // Admin shell + overview redesign (see test-marketplace-ui-admin-shell.mjs):
  // the inline "Ops hardening"/"Reconciliation" AdminCard sections and their
  // raw reconciliation-items table moved off this page. The overview's
  // queue summary list still surfaces the reconciliation-open count as a
  // link out, with no raw provider payloads rendered anywhere.
  const overviewScreen = readApp("src/features/marketplace-ui/admin/OverviewScreen.tsx");
  assert.match(overviewScreen, /queueSummary\.reconciliationOpenCount/);
  assert.doesNotMatch(page, /provider_response|proof_storage_path|bankAccount|buyer_marketplace_account_id/i);
  assert.doesNotMatch(overviewScreen, /provider_response|proof_storage_path|bankAccount|buyer_marketplace_account_id/i);
});

test("marketplace ops dashboard uses redacted ops snapshot module", () => {
  const snapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  const page = readApp("src/app/admin/marketplace/page.tsx");
  const gateIndex = snapshot.indexOf("const marketplaceAdminAllowed");
  const firstServiceReadIndex = snapshot.indexOf("listOfficialOrderDashboard()");

  assert.match(snapshot, /import "server-only"/);
  assert.match(snapshot, /buildMarketplaceOpsSnapshot/);
  assert.match(snapshot, /Promise\.all/);
  assert.match(snapshot, /listOfficialOrderDashboard/);
  assert.match(snapshot, /listSellerPayoutQueue/);
  assert.match(snapshot, /listMarketplaceQueueSummary/);
  assert.match(snapshot, /listMarketplaceReconciliationItems/);
  assert.ok(gateIndex >= 0, "snapshot must compute marketplace admin gate");
  assert.ok(
    firstServiceReadIndex > gateIndex,
    "snapshot must gate before service-role marketplace reads",
  );
  assert.doesNotMatch(snapshot, /provider_response|proof_storage_path|buyer_marketplace_account_id/i);
  assert.match(page, /buildMarketplaceOpsSnapshot/);
});
