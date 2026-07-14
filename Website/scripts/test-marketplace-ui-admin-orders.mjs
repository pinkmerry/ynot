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
const ORDERS_PAGE_PATH = "src/app/admin/marketplace/orders/page.tsx";
const VERIFY_PAGE_PATH = "src/app/admin/marketplace/seller-submissions/page.tsx";
const ORDERS_SCREEN_PATH = `${ADMIN_DIR}/OrdersScreen.tsx`;
const ORDER_ACTIONS_PATH = `${ADMIN_DIR}/OrderActions.tsx`;
const SLIP_MODAL_PATH = `${ADMIN_DIR}/SlipModal.tsx`;
const VERIFY_SCREEN_PATH = `${ADMIN_DIR}/VerifyQueueScreen.tsx`;
const VERIFY_ACTIONS_PATH = `${ADMIN_DIR}/VerifyActions.tsx`;

const SERVER_FILES = [ORDERS_PAGE_PATH, VERIFY_PAGE_PATH, ORDERS_SCREEN_PATH, VERIFY_SCREEN_PATH];
const CLIENT_FILES = [ORDER_ACTIONS_PATH, SLIP_MODAL_PATH, VERIFY_ACTIONS_PATH];
const ALL_NEW_FILES = [...SERVER_FILES, ...CLIENT_FILES];

test("package exposes the scoped marketplace UI admin orders test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-admin-orders"],
    "node --test scripts/test-marketplace-ui-admin-orders.mjs",
  );
});

test("all seven new admin orders/verify files exist", () => {
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

test("client files (OrderActions, SlipModal, VerifyActions) declare use client", () => {
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

test("OrderActions.tsx and VerifyActions.tsx reuse the client-safe formatThb helper", () => {
  for (const relPath of [ORDER_ACTIONS_PATH, VERIFY_ACTIONS_PATH]) {
    const source = readApp(relPath);
    assert.match(source, /from\s*["']\.\.\/shared\/money["']/, `${relPath} must import formatThb from ../shared/money`);
  }
});

// ---------------------------------------------------------------------------
// Orders index page + OrdersScreen
// ---------------------------------------------------------------------------

test("orders/page.tsx follows the admin guard pattern from admin/marketplace/page.tsx", () => {
  const source = readApp(ORDERS_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "canReadMarketplaceQueues",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `orders/page.tsx must reference ${needle}`);
  }
});

test("orders/page.tsx renders AdminShell active=\"orders\" and OrdersScreen", () => {
  const source = readApp(ORDERS_PAGE_PATH);
  assert.match(source, /<AdminShell active="orders">/);
  assert.match(source, /<OrdersScreen/);
});

test("orders/page.tsx calls listAdminMarketplaceOrders with state and a limit of 100, gated behind canReadMarketplaceQueues", () => {
  const source = readApp(ORDERS_PAGE_PATH);
  assert.match(source, /listAdminMarketplaceOrders\(\{\s*state,\s*limit:\s*ORDERS_LIST_LIMIT\s*\}\)/);
  assert.match(source, /ORDERS_LIST_LIMIT\s*=\s*100/);
  assert.match(source, /if\s*\(!canRead\)\s*return\s*\[\];/);
});

test("OrdersScreen.tsx documents listAdminMarketplaceOrders as its data source", () => {
  const source = readApp(ORDERS_SCREEN_PATH);
  assert.match(source, /listAdminMarketplaceOrders/);
});

test("OrdersScreen.tsx renders filter chips by payment state", () => {
  const source = readApp(ORDERS_SCREEN_PATH);
  assert.match(source, /ORDER_STATE_FILTERS/);
  for (const state of ["pending_payment", "payment_submitted", "paid", "failed", "refunded"]) {
    assert.match(source, new RegExp(escapeRegExp(`"${state}"`)), `must offer a filter chip for ${state}`);
  }
  assert.match(source, /mp-chip\$\{activeState === filter\.value \? " active" : ""\}/);
});

test("OrdersScreen.tsx renders the order table via mpa-table with formatThb totals and a link to the order detail page", () => {
  const source = readApp(ORDERS_SCREEN_PATH);
  assert.match(source, /className="mpa-table"/);
  assert.match(source, /formatThb\(order\.buyer_total_satang\)/);
  assert.match(source, /admin\/marketplace\/orders\/\$\{order\.order_id\}/);
});

test("OrdersScreen.tsx renders stage dots reusing orderStepIndex's pure module", () => {
  const source = readApp(ORDERS_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\.\/orders\/orderStepIndex["']/);
  assert.match(source, /ORDER_STEP_LABELS/);
  assert.match(source, /orderStepState\(order\)/);
  assert.match(source, /mp-step-dot/);
});

test("OrdersScreen.tsx delegates per-row interactivity to the OrderActions client island", () => {
  const source = readApp(ORDERS_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/OrderActions["']/);
  assert.match(source, /<OrderActions/);
});

test("grouped orders prefill manual review with the aggregate checkout amount", () => {
  const screen = readApp(ORDERS_SCREEN_PATH);
  const adminOrders = readApp("src/lib/marketplace/admin-orders.ts");
  assert.match(adminOrders, /payment_review_amount_satang/);
  assert.match(
    screen,
    /order\.payment_review_amount_satang\s*\?\?\s*order\.buyer_total_satang/,
  );
});

// ---------------------------------------------------------------------------
// OrderActions + SlipModal
// ---------------------------------------------------------------------------

test("OrderActions.tsx loads SlipModal via next/dynamic with ssr:false", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(source, /import\s+dynamic\s+from\s*["']next\/dynamic["']/, "must import next/dynamic");
  assert.match(
    source,
    /dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/SlipModal["']\)/,
    "SlipModal must be loaded via dynamic(() => import(\"./SlipModal\"))",
  );
  assert.match(source, /ssr:\s*false/);
  assert.doesNotMatch(
    source,
    /^import\s*{\s*SlipModal\s*}\s*from\s*["']\.\/SlipModal["']/m,
    "SlipModal must not also be statically imported",
  );
});

test("OrderActions.tsx only shows Approve/Reject when payment_state is payment_submitted", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(source, /order\.payment_state === "payment_submitted"/);
});

test("OrderActions.tsx posts to the unified payment route with the exact allowedFields keys and an idempotency-key header", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/orders\/\$\{order\.order_id\}\/payment`/,
    "must POST to /api/marketplace/admin/orders/[orderId]/payment",
  );
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey/);
  for (const field of ["paymentState", "providerReference", "providerAmountSatang", "providerCurrency", "adminNote"]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `must send the allowed field ${field}`);
  }
  assert.match(source, /paymentState:\s*"paid"/);
  assert.match(source, /paymentState:\s*"failed"/);
});

test("OrderActions.tsx surfaces server errors verbatim instead of rewriting them", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
});

test("OrderActions.tsx requires window.confirm before approving or rejecting a payment decision", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(source, /window\.confirm\(confirmMessage\)/);
});

test("OrderActions.tsx pre-fills the approve amount from the order's real buyer_total_satang", () => {
  const source = readApp(ORDER_ACTIONS_PATH);
  assert.match(
    source,
    /useState\(\(\)\s*=>\s*\n?\s*thbInputFor\(order\.buyer_total_satang\)/,
    "providerAmountThb must be initialized from order.buyer_total_satang",
  );
});

test("SlipModal.tsx fetches the proof-url route inside useEffect (mount-scoped, not module scope) and never caches the URL", () => {
  const source = readApp(SLIP_MODAL_PATH);
  const effectIndex = source.indexOf("useEffect(");
  const fetchIndex = source.indexOf("fetch(`/api/marketplace/admin/orders/");
  assert.ok(effectIndex >= 0, "must call useEffect");
  assert.ok(fetchIndex >= 0, "must fetch the payment-proof-url route");
  assert.ok(fetchIndex > effectIndex, "the fetch call must live inside the useEffect body, not module scope");
  assert.match(source, /\$\{orderId\}\/payment-proof-url/);
  assert.match(source, /cache:\s*"no-store"/, "must not let the browser HTTP cache serve a stale signed URL");
  // no module-scope (outside any function) mutable cache of the fetched url:
  // every `url` state assignment goes through useState, never a top-level let/var.
  assert.doesNotMatch(source, /^let\s+\w*url\w*/im, "must not cache the signed URL in module scope");
  assert.doesNotMatch(source, /^const\s+\w*cache\w*/im, "must not cache the signed URL in module scope");
});

test("SlipModal.tsx treats 404 as \"no proof on file\" rather than an error", () => {
  const source = readApp(SLIP_MODAL_PATH);
  assert.match(source, /response\.status === 404/);
  assert.match(source, /No proof on file/);
});

// ---------------------------------------------------------------------------
// Verify queue page + screen
// ---------------------------------------------------------------------------

test("seller-submissions/page.tsx follows the admin guard pattern from admin/marketplace/page.tsx", () => {
  const source = readApp(VERIFY_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "marketplaceAdminAllowed",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `seller-submissions/page.tsx must reference ${needle}`);
  }
});

test("seller-submissions/page.tsx renders AdminShell active=\"verify\" and VerifyQueueScreen", () => {
  const source = readApp(VERIFY_PAGE_PATH);
  assert.match(source, /<AdminShell active="verify">/);
  assert.match(source, /<VerifyQueueScreen/);
});

test("seller-submissions/page.tsx calls listAdminSellerSubmissionQueue gated on marketplaceAdminAllowed and a non-null admin", () => {
  const source = readApp(VERIFY_PAGE_PATH);
  assert.match(source, /listAdminSellerSubmissionQueue\(admin\)/);
  assert.match(source, /if\s*\(!allowed\s*\|\|\s*!admin\)\s*return\s*\[\];/);
  assert.match(
    source,
    /loadSubmissions\(marketplaceAdminAllowed,\s*admin\)/,
    "must use the snapshot's marketplaceAdminAllowed (NOT canReadMarketplaceQueues, which blanks the queue in mock mode while the overview badge still counts it)",
  );
});

test("VerifyQueueScreen.tsx documents listAdminSellerSubmissionQueue as its data source", () => {
  const source = readApp(VERIFY_SCREEN_PATH);
  assert.match(source, /listAdminSellerSubmissionQueue/);
});

test("VerifyQueueScreen.tsx delegates per-card interactivity to the VerifyActions client island", () => {
  const source = readApp(VERIFY_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/VerifyActions["']/);
  assert.match(source, /<VerifyActions/);
});

test("VerifyActions.tsx posts transitions with expectedVersion + status and an idempotency-key header", () => {
  const source = readApp(VERIFY_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/seller-consignments\/\$\{submission\.id\}\/transition`/,
  );
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey/);
  assert.match(source, /expectedVersion:\s*submission\.version/);
  assert.match(source, /status:\s*target/);
});

test("VerifyActions.tsx posts activation to the real activate route with idempotency", () => {
  const source = readApp(VERIFY_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/seller-consignments\/\$\{submission\.id\}\/activate`/,
  );
});

test("VerifyActions.tsx encodes the real legal transition map read from the migration", () => {
  const source = readApp(VERIFY_ACTIONS_PATH);
  // Pin each from-status to its exact action set (marketplace_admin_transition_seller_intake,
  // 20260628110000_marketplace_seller_consignment.sql) so a scrambled mapping fails, not just
  // a missing status literal.
  assert.match(
    source,
    /case "submitted":\s*return \[SEND_INTAKE_INSTRUCTIONS\];/,
    "submitted must offer only Send intake instructions",
  );
  assert.match(
    source,
    /case "handoff_confirmed":\s*return \[SEND_INTAKE_INSTRUCTIONS, MARK_RECEIVED\];/,
    "handoff_confirmed must offer Send intake instructions or Mark received",
  );
  assert.match(
    source,
    /case "intake_instruction_sent":\s*return \[MARK_RECEIVED\];/,
    "intake_instruction_sent must offer only Mark received",
  );
  assert.match(
    source,
    /case "received":\s*return \[PASS_INSPECTION, \{ kind: "transition", target: "inspection_failed"/,
    "received must offer pass/fail inspection",
  );
});

test("VerifyActions.tsx only offers Activate listing from inspection_passed and confirms the already-set price", () => {
  const source = readApp(VERIFY_ACTIONS_PATH);
  assert.match(source, /case "inspection_passed":\s*\n\s*return \[\{ kind: "activate"/);
  assert.match(source, /formatThb\(submission\.asking_price_satang\)/);
  assert.match(source, /window\.confirm\(confirmMessage\)/);
});

test("VerifyActions.tsx does not require a note for inspection_failed (matches the optional adminNote contract)", () => {
  const source = readApp(VERIFY_ACTIONS_PATH);
  assert.match(source, /placeholder="Note for the seller \(optional\)"/);
  assert.doesNotMatch(source, /failNote\.trim\(\)\.length === 0.*return/s, "must not block submission on an empty note");
});
