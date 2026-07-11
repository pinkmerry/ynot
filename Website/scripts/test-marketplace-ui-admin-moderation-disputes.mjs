import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ADMIN_DIR = "src/features/marketplace-ui/admin";
const SHELL_PATH = `${ADMIN_DIR}/AdminShell.tsx`;
const MODERATION_PAGE_PATH = "src/app/admin/marketplace/moderation/page.tsx";
const DISPUTES_PAGE_PATH = "src/app/admin/marketplace/disputes/page.tsx";
const MODERATION_SCREEN_PATH = `${ADMIN_DIR}/ModerationScreen.tsx`;
const DISPUTES_SCREEN_PATH = `${ADMIN_DIR}/DisputesScreen.tsx`;
const MODERATION_ACTIONS_PATH = `${ADMIN_DIR}/ModerationActions.tsx`;
const DISPUTE_ACTIONS_PATH = `${ADMIN_DIR}/DisputeActions.tsx`;
const DISPUTES_LIB_PATH = "src/lib/marketplace/disputes.ts";

const SERVER_FILES = [MODERATION_PAGE_PATH, DISPUTES_PAGE_PATH, MODERATION_SCREEN_PATH, DISPUTES_SCREEN_PATH];
const CLIENT_FILES = [MODERATION_ACTIONS_PATH, DISPUTE_ACTIONS_PATH];
const ALL_NEW_FILES = [...SERVER_FILES, ...CLIENT_FILES];

test("package exposes the scoped marketplace UI admin moderation/disputes test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-admin-moderation-disputes"],
    "node --test scripts/test-marketplace-ui-admin-moderation-disputes.mjs",
  );
});

test("all six new moderation/disputes files exist", () => {
  for (const relPath of ALL_NEW_FILES) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("server files (both pages + both screens) stay server components", () => {
  for (const relPath of SERVER_FILES) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /^"use client"/m, `${relPath} must stay a server component`);
  }
});

test("client files (ModerationActions, DisputeActions) declare use client", () => {
  for (const relPath of CLIENT_FILES) {
    const source = readApp(relPath);
    assert.match(source, /^"use client"/m, `${relPath} must be a client component`);
  }
});

test("no client component under marketplace-ui/admin imports a house-guarded server-only marketplace lib", () => {
  const forbiddenModules = [
    "@/lib/marketplace/cart-watchlist",
    "@/lib/marketplace/listings",
    "@/lib/marketplace/money",
    "@/lib/marketplace/payment-instructions",
  ];
  for (const relPath of CLIENT_FILES) {
    const source = readApp(relPath);
    for (const forbidden of forbiddenModules) {
      assert.doesNotMatch(
        source,
        new RegExp(`from\\s*["']${escapeRegExp(forbidden)}["']`),
        `${relPath} must not import house-guarded module ${forbidden}`,
      );
    }
    assert.doesNotMatch(source, /^import\s*["']server-only["']/m, `${relPath} must not import "server-only"`);
  }
});

test("DisputeActions.tsx reuses the client-safe formatThb helper for the mark-refunded confirm", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(source, /from\s*["']\.\.\/shared\/money["']/, "must import formatThb from ../shared/money");
  assert.match(source, /formatThb\(dispute\.refund_amount_satang\)/);
});

// ---------------------------------------------------------------------------
// AdminShell -- un-soon moderation + disputes
// ---------------------------------------------------------------------------
//
// This suite originally also pinned "payouts/settings still soon-tagged" --
// both have since shipped their own real screens (PayoutsScreen,
// FeesSettingsScreen; see test-marketplace-ui-admin-money-shop.mjs, which
// owns their un-soon assertions now), so that half of the original test is
// gone rather than left pinned to a state that's no longer true.

test("AdminShell.tsx no longer soon-tags moderation or disputes", () => {
  const source = readApp(SHELL_PATH);
  assert.match(
    source,
    /\{ id: "moderation", label: "Reported listings", href: "\/admin\/marketplace\/moderation", icon: "filter" \},/,
    "moderation nav item must be un-soon'd (exact shape, no soon: true)",
  );
  assert.match(
    source,
    /\{ id: "disputes", label: "Disputes & refunds", href: "\/admin\/marketplace\/disputes", icon: "swap" \},/,
    "disputes nav item must be un-soon'd (exact shape, no soon: true)",
  );
});

// ---------------------------------------------------------------------------
// Moderation page + ModerationScreen
// ---------------------------------------------------------------------------

test("moderation/page.tsx follows the admin guard pattern from orders/page.tsx", () => {
  const source = readApp(MODERATION_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "canReadMarketplaceQueues",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `moderation/page.tsx must reference ${needle}`);
  }
});

test("moderation/page.tsx renders AdminShell active=\"moderation\" and ModerationScreen", () => {
  const source = readApp(MODERATION_PAGE_PATH);
  assert.match(source, /<AdminShell active="moderation">/);
  assert.match(source, /<ModerationScreen/);
});

test("moderation/page.tsx calls listMarketplaceListingReports with state and a limit of 100, gated behind canReadMarketplaceQueues", () => {
  const source = readApp(MODERATION_PAGE_PATH);
  assert.match(source, /listMarketplaceListingReports\(\{\s*state,\s*limit:\s*REPORTS_LIST_LIMIT\s*\}\)/);
  assert.match(source, /REPORTS_LIST_LIMIT\s*=\s*100/);
  assert.match(source, /if\s*\(!canRead\)\s*return\s*\[\];/);
});

test("moderation/page.tsx defaults the state filter to \"open\", matching the overview's countOpenListingReports badge", () => {
  const source = readApp(MODERATION_PAGE_PATH);
  assert.match(source, /:\s*"open";/, "activeState must fall back to the literal \"open\" state");
});

test("ModerationScreen.tsx documents listMarketplaceListingReports as its data source", () => {
  const source = readApp(MODERATION_SCREEN_PATH);
  assert.match(source, /listMarketplaceListingReports/);
});

test("ModerationScreen.tsx renders filter chips for the real report-state enum", () => {
  const source = readApp(MODERATION_SCREEN_PATH);
  assert.match(source, /REPORT_STATE_FILTERS/);
  for (const state of ["open", "dismissed", "unlisted"]) {
    assert.match(source, new RegExp(escapeRegExp(`"${state}"`)), `must offer a filter chip for ${state}`);
  }
  assert.match(source, /mp-chip\$\{activeState === filter\.value \? " active" : ""\}/);
});

test("ModerationScreen.tsx renders the report table via mpa-table with a link to the real listing detail page", () => {
  const source = readApp(MODERATION_SCREEN_PATH);
  assert.match(source, /className="mpa-table"/);
  assert.match(source, /admin\/marketplace\/listings\/\$\{report\.listing_id\}/);
});

test("ModerationScreen.tsx delegates per-row interactivity to the ModerationActions client island", () => {
  const source = readApp(MODERATION_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/ModerationActions["']/);
  assert.match(source, /<ModerationActions/);
});

// ---------------------------------------------------------------------------
// ModerationActions
// ---------------------------------------------------------------------------

test("ModerationActions.tsx posts to the report resolve route with the exact allowedFields keys and an idempotency-key header", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/reports\/\$\{report\.id\}\/resolve`/,
    "must POST to /api/marketplace/admin/reports/[reportId]/resolve",
  );
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey/);
  for (const field of ["resolution", "resolutionNote"]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `must send the allowed field ${field}`);
  }
});

test("ModerationActions.tsx pins the real legal resolution values (dismissed | unlisted)", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(source, /resolve\("dismissed",/);
  assert.match(source, /resolve\(\s*"unlisted",/);
  assert.match(
    source,
    /resolution:\s*"dismissed"\s*\|\s*"unlisted"/,
    "the resolve() signature must be typed to exactly the two legal resolution values",
  );
});

test("ModerationActions.tsx only renders actions when report_state === \"open\" (dismissed/unlisted are terminal)", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(source, /if\s*\(report\.report_state\s*!==\s*"open"\)\s*\{\s*\n\s*return\s*null;/);
});

test("ModerationActions.tsx requires window.confirm before resolving a report", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(source, /window\.confirm\(confirmMessage\)/);
});

test("ModerationActions.tsx surfaces server errors verbatim and treats 401 as a login prompt", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
  assert.match(source, /response\.status === 401/);
});

test("ModerationActions.tsx does not require a resolution note (matches the optional resolutionNote contract)", () => {
  const source = readApp(MODERATION_ACTIONS_PATH);
  assert.match(source, /placeholder="Note for the record \(optional\)"/);
  assert.doesNotMatch(source, /note\.trim\(\)\.length === 0/, "must not block submission on an empty note");
});

// ---------------------------------------------------------------------------
// Disputes page + DisputesScreen
// ---------------------------------------------------------------------------

test("disputes/page.tsx follows the admin guard pattern from orders/page.tsx", () => {
  const source = readApp(DISPUTES_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "canReadMarketplaceQueues",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `disputes/page.tsx must reference ${needle}`);
  }
});

test("disputes/page.tsx renders AdminShell active=\"disputes\" and DisputesScreen", () => {
  const source = readApp(DISPUTES_PAGE_PATH);
  assert.match(source, /<AdminShell active="disputes">/);
  assert.match(source, /<DisputesScreen/);
});

test("disputes/page.tsx calls listAdminRefundRequests with admin, state, and a limit of 100, gated behind canReadMarketplaceQueues and a real admin", () => {
  const source = readApp(DISPUTES_PAGE_PATH);
  assert.match(
    source,
    /listAdminRefundRequests\(\{\s*admin,\s*state,\s*limit:\s*DISPUTES_LIST_LIMIT\s*\}\)/,
  );
  assert.match(source, /DISPUTES_LIST_LIMIT\s*=\s*100/);
  assert.match(source, /if\s*\(!canRead\s*\|\|\s*!admin\)\s*return\s*\[\];/);
});

test("DisputesScreen.tsx documents listAdminRefundRequests as its data source", () => {
  const source = readApp(DISPUTES_SCREEN_PATH);
  assert.match(source, /listAdminRefundRequests/);
});

test("DisputesScreen.tsx renders filter chips for the real refund-state enum, defaulting to the needs-action view", () => {
  const source = readApp(DISPUTES_SCREEN_PATH);
  assert.match(source, /DISPUTE_STATE_FILTERS/);
  assert.match(source, /\{\s*value:\s*null,\s*label:\s*"Needs action"\s*\}/);
  for (const state of ["requested", "approved", "rejected", "refunded"]) {
    assert.match(source, new RegExp(escapeRegExp(`"${state}"`)), `must offer a filter chip for ${state}`);
  }
  assert.match(source, /mp-chip\$\{activeState === filter\.value \? " active" : ""\}/);
});

test("DisputesScreen.tsx renders one mp-panel per dispute with formatThb totals and a link to the order detail page", () => {
  const source = readApp(DISPUTES_SCREEN_PATH);
  assert.match(source, /className="mp-panel"/);
  assert.match(source, /formatThb\(dispute\.refund_amount_satang\)/);
  assert.match(source, /admin\/marketplace\/orders\/\$\{dispute\.order_id\}/);
});

test("DisputesScreen.tsx delegates per-dispute interactivity to the DisputeActions client island", () => {
  const source = readApp(DISPUTES_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/DisputeActions["']/);
  assert.match(source, /<DisputeActions/);
});

// ---------------------------------------------------------------------------
// DisputeActions
// ---------------------------------------------------------------------------

test("DisputeActions.tsx posts to the refund transition route with the exact allowedFields keys and an idempotency-key header", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/refunds\/\$\{dispute\.id\}\/transition`/,
    "must POST to /api/marketplace/admin/refunds/[refundRequestId]/transition",
  );
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey/);
  for (const field of ["refundState", "providerReference", "adminNote", "expectedRefundState"]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `must send the allowed field ${field}`);
  }
});

test("DisputeActions.tsx sends expectedRefundState sourced from dispute.refund_state on every transition (approve/reject/refunded)", () => {
  // Money-path optimistic-concurrency guard (review finding on ee419d7d):
  // marketplace_record_refund_transition now accepts p_expected_refund_state
  // (20260712100000_marketplace_refund_transition_expected_state.sql). The
  // client must source it from the dispute row it actually rendered, not a
  // hardcoded literal, or a stale tab would silently defeat the guard.
  const source = readApp(DISPUTE_ACTIONS_PATH);
  const matches = source.match(/expectedRefundState:\s*dispute\.refund_state/g) ?? [];
  assert.equal(
    matches.length,
    3,
    "expectedRefundState: dispute.refund_state must be sent on all three transitions (approve, reject, refunded)",
  );
});

test("DisputeActions.tsx encodes the real legal transition map read from the migration", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  // Pin each from-state to its exact action set (marketplace_record_refund_transition,
  // 20260628130000_marketplace_ops_hardening.sql) so a scrambled mapping fails, not just
  // a missing state literal.
  assert.match(
    source,
    /case "requested":\s*return \[APPROVE_ACTION, REJECT_ACTION\];/,
    "requested must offer only Approve/Reject",
  );
  assert.match(
    source,
    /case "approved":\s*return \[REFUND_ACTION\];/,
    "approved must offer only Mark refunded",
  );
  assert.match(
    source,
    /default:\s*return \[\];/,
    "rejected/refunded (and anything unrecognized) must be terminal -- no actions",
  );
  // Minor guard from the ee419d7d review: terminal states must fall through
  // to default, not get their own case branch that could later be edited to
  // return actions again.
  assert.doesNotMatch(source, /case "rejected":/, "rejected must have no explicit case -- it must fall to default");
  assert.doesNotMatch(source, /case "refunded":/, "refunded must have no explicit case -- it must fall to default");
});

test("DisputeActions.tsx requires a non-empty adminNote before submitting any transition", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(source, /if\s*\(!adminNote\.trim\(\)\)\s*\{/);
  assert.match(source, /placeholder="Note for the record \(required\)"/);
});

test("DisputeActions.tsx requires a non-empty providerReference only for the refund transition", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(source, /if\s*\(!providerReference\.trim\(\)\)\s*\{/);
  assert.match(
    source,
    /openPanel === "refund"\s*\?\s*\(\s*\n\s*<input/,
    "the provider reference input must only render for the refund panel",
  );
});

test("DisputeActions.tsx requires window.confirm naming the order and the refund state change before marking refunded", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(source, /window\.confirm\(confirmMessage\)/);
  assert.match(
    source,
    /Mark order \$\{shortOrder\} as refunded \(approved → refunded\)/,
    "the mark-refunded confirm must name the order ref and the exact state change",
  );
});

test("DisputeActions.tsx surfaces server errors verbatim, treats 401 as a login prompt, and never auto-retries", () => {
  const source = readApp(DISPUTE_ACTIONS_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
  assert.match(source, /response\.status === 401/);
  assert.doesNotMatch(source, /retry/i, "must not implement any automatic retry logic");
});

// ---------------------------------------------------------------------------
// disputes.ts -- listAdminRefundRequests
// ---------------------------------------------------------------------------

test("disputes.ts stays server-only", () => {
  const source = readApp(DISPUTES_LIB_PATH);
  assert.match(source, /^import\s*["']server-only["'];/m);
});

test("listAdminRefundRequests is role-gated, bounded, ordered, and validates its state filter", () => {
  const source = readApp(DISPUTES_LIB_PATH);
  assert.match(source, /export async function listAdminRefundRequests/);
  assert.match(
    source,
    /assertAdminRole\(input\.admin,\s*\["owner",\s*"admin",\s*"staff"\]\)/,
    "must allow owner/admin/staff to read, same read-role set as listMarketplaceReconciliationItems",
  );
  assert.match(source, /REFUND_REQUEST_STATES\.includes\(requestedState\)/, "must validate the state filter against the real enum");
  assert.match(source, /\.order\(\s*"created_at"/);
  assert.match(source, /\.limit\(/);
});

test("listAdminRefundRequests batches the order lookup in a single .in() call (no N+1)", () => {
  const source = readApp(DISPUTES_LIB_PATH);
  assert.match(source, /\.in\("id",\s*orderIds\)/);
  // only one .in( call targeting marketplace_orders -- the row-level filter
  // above uses .eq/.in on refund_state, not a second per-row orders lookup.
  const orderLookupMatches = source.match(/\.from\("marketplace_orders"\)/g) ?? [];
  assert.equal(orderLookupMatches.length, 1, "must query marketplace_orders exactly once per call, batched");
});

test("listAdminRefundRequests exports the real refund-state enum and row type", () => {
  const source = readApp(DISPUTES_LIB_PATH);
  assert.match(source, /export type MarketplaceRefundRequestState =/);
  for (const state of ["requested", "approved", "rejected", "refunded"]) {
    assert.match(source, new RegExp(escapeRegExp(`"${state}"`)));
  }
  assert.match(source, /export type MarketplaceRefundRequestRow = \{/);
});
