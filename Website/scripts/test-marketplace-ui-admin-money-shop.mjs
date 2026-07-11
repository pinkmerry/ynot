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

// ---------------------------------------------------------------------------
// Seller payouts (9f)
// ---------------------------------------------------------------------------

const PAYOUTS_PAGE_PATH = "src/app/admin/marketplace/payouts/page.tsx";
const PAYOUTS_SCREEN_PATH = `${ADMIN_DIR}/PayoutsScreen.tsx`;
const PAYOUT_ACTIONS_PATH = `${ADMIN_DIR}/PayoutActions.tsx`;
const PAYOUTS_LIB_PATH = "src/lib/marketplace/payouts.ts";

const PAYOUTS_SERVER_FILES = [PAYOUTS_PAGE_PATH, PAYOUTS_SCREEN_PATH];
const PAYOUTS_CLIENT_FILES = [PAYOUT_ACTIONS_PATH];

const FORBIDDEN_CLIENT_MODULES = [
  "@/lib/marketplace/cart-watchlist",
  "@/lib/marketplace/listings",
  "@/lib/marketplace/money",
  "@/lib/marketplace/payment-instructions",
];

test("package exposes the scoped marketplace UI admin money-shop test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-admin-money-shop"],
    "node --test scripts/test-marketplace-ui-admin-money-shop.mjs",
  );
});

test("all seller-payouts files exist", () => {
  for (const relPath of [...PAYOUTS_SERVER_FILES, ...PAYOUTS_CLIENT_FILES]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("payouts server files (page + screen) stay server components", () => {
  for (const relPath of PAYOUTS_SERVER_FILES) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /^"use client"/m, `${relPath} must stay a server component`);
  }
});

test("PayoutActions.tsx declares use client", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(source, /^"use client"/m);
});

test("PayoutActions.tsx does not import a house-guarded server-only marketplace lib", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  for (const forbidden of FORBIDDEN_CLIENT_MODULES) {
    assert.doesNotMatch(
      source,
      new RegExp(`from\\s*["']${escapeRegExp(forbidden)}["']`),
      `must not import house-guarded module ${forbidden}`,
    );
  }
  assert.doesNotMatch(source, /^import\s*["']server-only["']/m, "must not import \"server-only\"");
});

test("PayoutActions.tsx reuses the client-safe formatThb helper for its confirm dialogs", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(source, /from\s*["']\.\.\/shared\/money["']/, "must import formatThb from ../shared/money");
  assert.match(source, /formatThb\(payout\.payout_amount_satang\)/);
});

// ---------------------------------------------------------------------------
// AdminShell -- un-soon payouts, leave settings alone
// ---------------------------------------------------------------------------

test("AdminShell.tsx no longer soon-tags payouts", () => {
  const source = readApp(SHELL_PATH);
  assert.match(
    source,
    /\{ id: "payouts", label: "Seller payouts", href: "\/admin\/marketplace\/payouts", icon: "swap" \},/,
    "payouts nav item must be un-soon'd (exact shape, no soon: true)",
  );
});

test("AdminShell.tsx still soon-tags settings", () => {
  const source = readApp(SHELL_PATH);
  assert.match(
    source,
    /\{ id: "settings", label: "Fees & settings", href: "\/admin\/marketplace\/settings", icon: "tag", soon: true \},/,
    "settings must remain soon: true until its own commit lands",
  );
});

// ---------------------------------------------------------------------------
// Payouts page + PayoutsScreen
// ---------------------------------------------------------------------------

test("payouts/page.tsx follows the admin guard pattern from orders/page.tsx", () => {
  const source = readApp(PAYOUTS_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "canReadMarketplaceQueues",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `payouts/page.tsx must reference ${needle}`);
  }
});

test("payouts/page.tsx renders AdminShell active=\"payouts\" and PayoutsScreen", () => {
  const source = readApp(PAYOUTS_PAGE_PATH);
  assert.match(source, /<AdminShell active="payouts">/);
  assert.match(source, /<PayoutsScreen/);
});

test("payouts/page.tsx calls listSellerPayoutQueue with no arguments, gated behind canReadMarketplaceQueues", () => {
  const source = readApp(PAYOUTS_PAGE_PATH);
  assert.match(source, /await listSellerPayoutQueue\(\)/);
  assert.match(source, /if\s*\(!canRead\)\s*return\s*\[\];/);
});

test("payouts/page.tsx filters payout_state in-memory (needs-action default = held/eligible), not via a query param", () => {
  const source = readApp(PAYOUTS_PAGE_PATH);
  assert.match(source, /NEEDS_ACTION_PAYOUT_STATES[\s\S]*=[\s\S]*new Set\(\["held",\s*"eligible"\]\)/);
  assert.match(
    source,
    /payouts\.filter\(\(payout\)\s*=>\s*NEEDS_ACTION_PAYOUT_STATES\.has\(payout\.payout_state\)\)/,
    "the default (null state) view must filter to the needs-action set",
  );
});

test("payouts/page.tsx scopes its state filter to the three states listSellerPayoutQueue can return", () => {
  const source = readApp(PAYOUTS_PAGE_PATH);
  assert.match(source, /VALID_PAYOUT_STATES[\s\S]*new Set\(\["held",\s*"eligible",\s*"released"\]\)/);
});

test("PayoutsScreen.tsx documents listSellerPayoutQueue as its data source", () => {
  const source = readApp(PAYOUTS_SCREEN_PATH);
  assert.match(source, /listSellerPayoutQueue/);
});

test("PayoutsScreen.tsx renders filter chips for held/eligible/released, defaulting to the needs-action view", () => {
  const source = readApp(PAYOUTS_SCREEN_PATH);
  assert.match(source, /PAYOUT_STATE_FILTERS/);
  assert.match(source, /\{\s*value:\s*null,\s*label:\s*"Needs action"\s*\}/);
  for (const state of ["held", "eligible", "released"]) {
    assert.match(source, new RegExp(escapeRegExp(`"${state}"`)), `must offer a filter chip for ${state}`);
  }
  assert.match(source, /mp-chip\$\{activeState === filter\.value \? " active" : ""\}/);
});

test("PayoutsScreen.tsx renders the payout table via mpa-table with formatThb totals and links into the real order/listing detail pages", () => {
  const source = readApp(PAYOUTS_SCREEN_PATH);
  assert.match(source, /className="mpa-table"/);
  assert.match(source, /formatThb\(payout\.item_price_satang\)/);
  assert.match(source, /formatThb\(payout\.seller_fee_satang\)/);
  assert.match(source, /formatThb\(payout\.payout_amount_satang\)/);
  assert.match(source, /admin\/marketplace\/orders\/\$\{payout\.order_id\}/);
  assert.match(source, /admin\/marketplace\/listings\/\$\{payout\.listing_id\}/);
});

test("PayoutsScreen.tsx delegates per-row interactivity to the PayoutActions client island", () => {
  const source = readApp(PAYOUTS_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/PayoutActions["']/);
  assert.match(source, /<PayoutActions/);
});

// ---------------------------------------------------------------------------
// PayoutActions
// ---------------------------------------------------------------------------

test("PayoutActions.tsx posts release with exactly SELLER_PAYOUT_RELEASE_FIELDS and an idempotency-key header", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/seller-payouts\/\$\{payout\.id\}\/\$\{endpoint\}`/,
    "must POST to /api/marketplace/admin/seller-payouts/[payoutId]/release|paid",
  );
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey/);
  assert.match(source, /adminNote\.trim\(\)\s*\?\s*\{\s*adminNote:\s*adminNote\.trim\(\)\s*\}\s*:\s*\{\}/);
});

test("PayoutActions.tsx posts mark-transferred with exactly SELLER_PAYOUT_PAID_FIELDS, requiring transferReference", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(source, /transferReference:\s*transferReference\.trim\(\)/);
  assert.match(
    source,
    /if\s*\(!transferReference\.trim\(\)\)\s*\{/,
    "must block the paid submission client-side when transferReference is empty",
  );
});

test("PayoutActions.tsx gates Release on held/eligible and Mark transferred on released only, per the real payout_state machine", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(
    source,
    /canRelease\s*=\s*payout\.payout_state === "held" \|\| payout\.payout_state === "eligible"/,
  );
  assert.match(source, /canMarkPaid\s*=\s*payout\.payout_state === "released"/);
});

test("PayoutActions.tsx does not pre-compute release eligibility beyond payout_state (order/refund/reconciliation checks stay server-side)", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  // The doc comment above explains the refund/reconciliation gate in prose
  // (for context on why the RPC can still reject) -- what must NOT exist is
  // runtime logic reading those fields off the row, since PayoutActionRow
  // never carries them.
  assert.doesNotMatch(source, /payout\.refund_state/, "must not read a refund_state field off the row");
  assert.doesNotMatch(
    source,
    /payout\.(has_open_reconciliation|reconciliation)/i,
    "must not read a reconciliation field off the row -- that check stays server-side",
  );
});

test("PayoutActions.tsx requires window.confirm naming the order and net amount before either action", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(source, /window\.confirm\(confirmMessage\)/);
  assert.match(source, /Release \$\{netLabel\} for order \$\{shortOrder\}/);
  assert.match(source, /Mark \$\{netLabel\} as transferred for order \$\{shortOrder\}/);
});

test("PayoutActions.tsx surfaces server errors verbatim, treats 401 as a login prompt, and never auto-retries", () => {
  const source = readApp(PAYOUT_ACTIONS_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
  assert.match(source, /response\.status === 401/);
  assert.doesNotMatch(source, /retry/i, "must not implement any automatic retry logic");
});

// ---------------------------------------------------------------------------
// payouts.ts -- listSellerPayoutQueue / release / paid contracts
// ---------------------------------------------------------------------------

test("payouts.ts stays server-only", () => {
  const source = readApp(PAYOUTS_LIB_PATH);
  assert.match(source, /^import\s*["']server-only["'];/m);
});

test("payouts.ts exports the real allowedFields for release and paid", () => {
  const source = readApp(PAYOUTS_LIB_PATH);
  assert.match(source, /export const SELLER_PAYOUT_RELEASE_FIELDS = \["adminNote"\] as const;/);
  assert.match(
    source,
    /export const SELLER_PAYOUT_PAID_FIELDS = \[\s*"transferReference",\s*"adminNote",\s*\] as const;/,
  );
});

test("listSellerPayoutQueue queries the real three-state subset, ordered and bounded", () => {
  const source = readApp(PAYOUTS_LIB_PATH);
  assert.match(source, /export async function listSellerPayoutQueue/);
  assert.match(source, /\.in\("payout_state",\s*\["held",\s*"eligible",\s*"released"\]\)/);
  assert.match(source, /\.order\(\s*"updated_at"/);
  assert.match(source, /\.limit\(/);
});
