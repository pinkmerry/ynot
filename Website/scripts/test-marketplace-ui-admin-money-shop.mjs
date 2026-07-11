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

// This codebase's doc comments routinely name other functions/components in
// prose, including call-shaped ("callThing()") and JSX-shaped
// ("<Component>") references (see OverviewScreen.tsx's "the page
// instantiates the existing <MarketplaceMoneyPolicyControls> client island
// itself"). Assertions below that check "must not be CALLED/RENDERED here"
// strip comments first so a doc comment naming the thing it deliberately
// avoids doesn't self-trip the check.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
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
// AdminShell -- un-soon payouts (settings follows further below, once its
// own screen exists later in this same file)
// ---------------------------------------------------------------------------

test("AdminShell.tsx no longer soon-tags payouts", () => {
  const source = readApp(SHELL_PATH);
  assert.match(
    source,
    /\{ id: "payouts", label: "Seller payouts", href: "\/admin\/marketplace\/payouts", icon: "swap" \},/,
    "payouts nav item must be un-soon'd (exact shape, no soon: true)",
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

// ---------------------------------------------------------------------------
// Fees & settings (9h)
// ---------------------------------------------------------------------------

const SETTINGS_PAGE_PATH = "src/app/admin/marketplace/settings/page.tsx";
const SETTINGS_SCREEN_PATH = `${ADMIN_DIR}/FeesSettingsScreen.tsx`;
const SETTINGS_FORM_PATH = `${ADMIN_DIR}/FeesSettingsForm.tsx`;
const MONEY_POLICY_ROUTE_PATH = "src/app/api/ynot/marketplace/admin/money-policy/route.ts";
const OVERVIEW_PAGE_PATH = "src/app/admin/marketplace/page.tsx";
const MONEY_POLICY_CONTROLS_PATH = "src/features/ynot/MarketplaceMoneyPolicyControls.tsx";

const SETTINGS_SERVER_FILES = [SETTINGS_PAGE_PATH, SETTINGS_SCREEN_PATH];
const SETTINGS_CLIENT_FILES = [SETTINGS_FORM_PATH];

test("all fees-and-settings files exist", () => {
  for (const relPath of [...SETTINGS_SERVER_FILES, ...SETTINGS_CLIENT_FILES]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("settings server files (page + screen) stay server components", () => {
  for (const relPath of SETTINGS_SERVER_FILES) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /^"use client"/m, `${relPath} must stay a server component`);
  }
});

test("FeesSettingsForm.tsx declares use client", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /^"use client"/m);
});

test("FeesSettingsForm.tsx does not import a house-guarded server-only marketplace lib", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  for (const forbidden of FORBIDDEN_CLIENT_MODULES) {
    assert.doesNotMatch(
      source,
      new RegExp(`from\\s*["']${escapeRegExp(forbidden)}["']`),
      `must not import house-guarded module ${forbidden}`,
    );
  }
  assert.doesNotMatch(source, /^import\s*["']server-only["']/m, "must not import \"server-only\"");
});

// ---------------------------------------------------------------------------
// AdminShell -- un-soon settings; nothing should still be soon-tagged
// ---------------------------------------------------------------------------

test("AdminShell.tsx no longer soon-tags settings", () => {
  const source = readApp(SHELL_PATH);
  assert.match(
    source,
    /\{ id: "settings", label: "Fees & settings", href: "\/admin\/marketplace\/settings", icon: "tag" \},/,
    "settings nav item must be un-soon'd (exact shape, no soon: true)",
  );
});

test("AdminShell.tsx has no soon-tagged nav items left (payouts and settings both shipped)", () => {
  const source = readApp(SHELL_PATH);
  assert.doesNotMatch(source, /soon:\s*true/);
});

// ---------------------------------------------------------------------------
// Settings page + FeesSettingsScreen
// ---------------------------------------------------------------------------

test("settings/page.tsx follows the admin guard pattern (AdminGate, resolveAdminSession, buildMarketplaceOpsSnapshot, config.ownerOnly)", () => {
  const source = readApp(SETTINGS_PAGE_PATH);
  for (const needle of ["AdminGate", "resolveAdminSession", "buildMarketplaceOpsSnapshot", "config.ownerOnly"]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `settings/page.tsx must reference ${needle}`);
  }
});

test("settings/page.tsx renders AdminShell active=\"settings\" and FeesSettingsScreen", () => {
  const source = readApp(SETTINGS_PAGE_PATH);
  assert.match(source, /<AdminShell active="settings">/);
  assert.match(source, /<FeesSettingsScreen/);
});

test("settings/page.tsx reuses buildMarketplaceOpsSnapshot's moneyPolicy instead of calling getActiveMarketplaceMoneyPolicy a second time", () => {
  const source = readApp(SETTINGS_PAGE_PATH);
  assert.match(source, /const\s*\{\s*config,\s*moneyPolicy\s*\}\s*=\s*snapshot;/);
  assert.match(source, /policy=\{moneyPolicy\}/);
  assert.doesNotMatch(
    stripComments(source),
    /getActiveMarketplaceMoneyPolicy\(/,
    "must not CALL getActiveMarketplaceMoneyPolicy directly -- snapshot.moneyPolicy is already the gated read (the doc comment may still name it in prose)",
  );
});

test("FeesSettingsScreen.tsx documents reusing the money-policy contract rather than forking it", () => {
  const source = readApp(SETTINGS_SCREEN_PATH);
  assert.match(source, /money-policy/);
  assert.doesNotMatch(source, /"use client"/, "screen must stay a server component");
});

test("FeesSettingsScreen.tsx delegates to the FeesSettingsForm client island", () => {
  const source = readApp(SETTINGS_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/FeesSettingsForm["']/);
  assert.match(source, /<FeesSettingsForm/);
});

// ---------------------------------------------------------------------------
// FeesSettingsForm
// ---------------------------------------------------------------------------

test("FeesSettingsForm.tsx posts to the real money-policy route with an idempotency-key header", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /fetch\("\/api\/marketplace\/admin\/money-policy",/);
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey\(\)/);
});

test("FeesSettingsForm.tsx converts seller/buyer fee bps <-> percent both ways", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /function bpsToPercent\(value: number\)/);
  assert.match(source, /function percentToBps\(value: string\): number \| null/);
  assert.match(source, /bpsToPercent\(policy\.sellerFeeBps\)/);
  assert.match(source, /bpsToPercent\(policy\.buyerServiceFeeBps\)/);
  assert.match(source, /percentToBps\(sellerFeePercent\)/);
  assert.match(source, /percentToBps\(buyerFeePercent\)/);
});

test("FeesSettingsForm.tsx converts shipping fee satang <-> THB both ways, mirroring OrderActions' thbInput helpers", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /function thbInputFor\(satang: number\)/);
  assert.match(source, /function thbInputToSatang\(value: string\): number \| null/);
  assert.match(source, /thbInputFor\(policy\.shippingFeeSatang\)/);
});

test("FeesSettingsForm.tsx always sends the three fields with no server-side fallback (sellerFeeBps, buyerServiceFeeBps, shippingFeeSatang)", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(
    source,
    /const body: Record<string, unknown> = \{ sellerFeeBps, buyerServiceFeeBps, shippingFeeSatang \};/,
  );
});

test("FeesSettingsForm.tsx only sends payoutHoldDays/disputeWindowDays/listingAutoLive/slipAutoVerify/adminNote when they differ from the loaded policy", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /if\s*\(payoutHold\s*!==\s*policy\.payoutHoldDays\)\s*body\.payoutHoldDays\s*=\s*payoutHold;/);
  assert.match(
    source,
    /if\s*\(disputeWindow\s*!==\s*policy\.disputeWindowDays\)\s*body\.disputeWindowDays\s*=\s*disputeWindow;/,
  );
  assert.match(
    source,
    /if\s*\(listingAutoLive\s*!==\s*policy\.listingAutoLive\)\s*body\.listingAutoLive\s*=\s*listingAutoLive;/,
  );
  assert.match(
    source,
    /if\s*\(slipAutoVerify\s*!==\s*policy\.slipAutoVerify\)\s*body\.slipAutoVerify\s*=\s*slipAutoVerify;/,
  );
  assert.match(source, /if\s*\(adminNote\.trim\(\)\s*!==\s*\(policy\.adminNote\s*\?\?\s*""\)\.trim\(\)\)/);
});

test("FeesSettingsForm.tsx renders auto-live and Slip2GO as real MpSwitch toggles, not the prototype's unlabelled span", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /from\s*["']\.\.\/shared\/MpPrimitives["']/);
  assert.match(source, /<MpSwitch[\s\S]*?checked=\{listingAutoLive\}/);
  assert.match(source, /<MpSwitch[\s\S]*?checked=\{slipAutoVerify\}/);
});

test("FeesSettingsForm.tsx renders escrow release as a static Always-on badge, not a control", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /label="Escrow release"/);
  assert.match(source, /<span className="mp-badge mp-badge-official">Always on<\/span>/);
});

test("FeesSettingsForm.tsx surfaces server errors verbatim and treats 401 as a login prompt", () => {
  const source = readApp(SETTINGS_FORM_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
  assert.match(source, /response\.status === 401/);
});

test("FeesSettingsForm.tsx does not import or render the sibling MarketplaceMoneyPolicyControls (independent caller of the same contract, may still name it in prose)", () => {
  const code = stripComments(readApp(SETTINGS_FORM_PATH));
  assert.doesNotMatch(code, /from\s*["'][^"']*MarketplaceMoneyPolicyControls["']/);
  assert.doesNotMatch(code, /<MarketplaceMoneyPolicyControls/);
});

// ---------------------------------------------------------------------------
// money-policy route / overview page -- must still work, contract not forked
// ---------------------------------------------------------------------------

test("money-policy route.ts still exposes the full real allowedFields this form relies on", () => {
  const source = readApp(MONEY_POLICY_ROUTE_PATH);
  assert.match(
    source,
    /const MONEY_POLICY_FIELDS = \[\s*"sellerFeeBps",\s*"buyerServiceFeeBps",\s*"shippingFeeSatang",\s*"payoutHoldDays",\s*"disputeWindowDays",\s*"listingAutoLive",\s*"slipAutoVerify",\s*"adminNote",\s*\] as const;/,
  );
});

test("the overview page's MarketplaceMoneyPolicyControls usage is untouched", () => {
  const overviewSource = readApp(OVERVIEW_PAGE_PATH);
  assert.match(overviewSource, /moneyPolicyPanel={<MarketplaceMoneyPolicyControls policy={moneyPolicy} \/>}/);
  assert.ok(
    existsSync(path.join(appRoot, MONEY_POLICY_CONTROLS_PATH)),
    "MarketplaceMoneyPolicyControls.tsx must still exist",
  );
});
