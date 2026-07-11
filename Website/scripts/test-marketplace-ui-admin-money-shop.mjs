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
  // The negative lookbehind keeps "//" immediately after ":" alone (e.g.
  // inside a "https://..." string literal) so a line like
  // `if (!url.startsWith("https://"))` doesn't get truncated mid-statement
  // -- only genuine `// comment` occurrences (preceded by whitespace/start
  // of line, never a bare colon) get stripped.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
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

// ---------------------------------------------------------------------------
// Official stock (9g)
// ---------------------------------------------------------------------------

const LISTINGS_PAGE_PATH = "src/app/admin/marketplace/listings/page.tsx";
const LISTINGS_DETAIL_PAGE_PATH = "src/app/admin/marketplace/listings/[listingId]/page.tsx";
const STOCK_SCREEN_PATH = `${ADMIN_DIR}/OfficialStockScreen.tsx`;
const STOCK_ACTIONS_PATH = `${ADMIN_DIR}/StockActions.tsx`;
const STOCK_MODAL_PATH = `${ADMIN_DIR}/StockModal.tsx`;
const STOCK_MODAL_FIELDS_PATH = `${ADMIN_DIR}/StockModalFields.tsx`;
const STOCK_FORM_TYPES_PATH = `${ADMIN_DIR}/stockFormTypes.ts`;
const OFFICIAL_SHOP_LIB_PATH = "src/lib/marketplace/official-shop.ts";
const OFFICIAL_INVENTORY_ROUTE_PATH = "src/app/api/ynot/marketplace/admin/official-inventory/route.ts";
const OFFICIAL_INVENTORY_ID_ROUTE_PATH =
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts";
const OFFICIAL_INVENTORY_PUBLISH_ROUTE_PATH =
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/publish/route.ts";
const OFFICIAL_INVENTORY_ARCHIVE_ROUTE_PATH =
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts";

const STOCK_SERVER_FILES = [LISTINGS_PAGE_PATH, STOCK_SCREEN_PATH];
const STOCK_CLIENT_FILES = [STOCK_ACTIONS_PATH, STOCK_MODAL_PATH, STOCK_MODAL_FIELDS_PATH];

test("all official-stock files exist, including the shared framework-free form-types module", () => {
  for (const relPath of [...STOCK_SERVER_FILES, ...STOCK_CLIENT_FILES, STOCK_FORM_TYPES_PATH]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("stock server files (listings/page.tsx + OfficialStockScreen.tsx) stay server components", () => {
  for (const relPath of STOCK_SERVER_FILES) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /^"use client"/m, `${relPath} must stay a server component`);
  }
});

test("stock client files (StockActions, StockModal, StockModalFields) declare use client", () => {
  for (const relPath of STOCK_CLIENT_FILES) {
    const source = readApp(relPath);
    assert.match(source, /^"use client"/m, `${relPath} must be a client component`);
  }
});

test("stockFormTypes.ts stays framework-free (no react import, no client directive)", () => {
  const source = readApp(STOCK_FORM_TYPES_PATH);
  assert.doesNotMatch(source, /^"use client"/m);
  assert.doesNotMatch(source, /from\s*["']react["']/);
});

test("no stock client file imports a house-guarded server-only marketplace lib or official-shop.ts directly", () => {
  for (const relPath of STOCK_CLIENT_FILES) {
    const source = readApp(relPath);
    for (const forbidden of [...FORBIDDEN_CLIENT_MODULES, "@/lib/marketplace/official-shop"]) {
      assert.doesNotMatch(
        source,
        new RegExp(`from\\s*["']${escapeRegExp(forbidden)}["']`),
        `${relPath} must not import ${forbidden} -- it starts with "import \\"server-only\\""`,
      );
    }
    assert.doesNotMatch(source, /^import\s*["']server-only["']/m, `${relPath} must not import "server-only"`);
  }
});

test("StockActions.tsx and StockModal.tsx declare their own narrow local row/type shapes instead of importing OfficialInventoryRow", () => {
  const actionsSource = readApp(STOCK_ACTIONS_PATH);
  assert.match(actionsSource, /export interface StockActionItem \{/);
  assert.doesNotMatch(stripComments(actionsSource), /from\s*["']\.\/OfficialStockScreen["']/);
});

// ---------------------------------------------------------------------------
// listings/page.tsx -- the missing root page (does NOT touch [listingId])
// ---------------------------------------------------------------------------

test("listings/[listingId]/page.tsx (the pre-existing detail subpage) is untouched -- still on its own AdminFrame/AdminCard chrome, not AdminShell", () => {
  const source = readApp(LISTINGS_DETAIL_PAGE_PATH);
  assert.match(source, /from\s*["']@\/features\/ynot\/admin["']/, "must still use the old AdminFrame/AdminCard chrome");
  assert.doesNotMatch(
    source,
    /from\s*["']@\/features\/marketplace-ui\/admin\/AdminShell["']/,
    "must NOT have been migrated to AdminShell by this task",
  );
});

test("listings/page.tsx follows the admin guard pattern from orders/page.tsx", () => {
  const source = readApp(LISTINGS_PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "canReadMarketplaceQueues",
    "config.ownerOnly",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(needle)), `listings/page.tsx must reference ${needle}`);
  }
});

test("listings/page.tsx renders AdminShell active=\"listings\" and OfficialStockScreen", () => {
  const source = readApp(LISTINGS_PAGE_PATH);
  assert.match(source, /<AdminShell active="listings">/);
  assert.match(source, /<OfficialStockScreen/);
});

test("listings/page.tsx calls listOfficialInventory with no arguments, gated behind canReadMarketplaceQueues", () => {
  const source = readApp(LISTINGS_PAGE_PATH);
  assert.match(source, /await listOfficialInventory\(\)/);
  assert.match(source, /if\s*\(!canRead\)\s*return\s*\[\];/);
});

// ---------------------------------------------------------------------------
// OfficialStockScreen
// ---------------------------------------------------------------------------

test("OfficialStockScreen.tsx documents listOfficialInventory as its data source", () => {
  const source = readApp(STOCK_SCREEN_PATH);
  assert.match(source, /listOfficialInventory/);
});

test("OfficialStockScreen.tsx renders the inventory table via mpa-table with formatThb pricing", () => {
  const source = readApp(STOCK_SCREEN_PATH);
  assert.match(source, /className="mpa-table"/);
  assert.match(source, /formatThb\(item\.item_price_satang\)/);
});

test("OfficialStockScreen.tsx renders item_state as a Draft/Live/Sold out/Archived badge (the real 4-state enum this list can return)", () => {
  const source = readApp(STOCK_SCREEN_PATH);
  for (const [state, label] of [
    ["draft", "Draft"],
    ["listed", "Live"],
    ["sold", "Sold out"],
    ["archived", "Archived"],
  ]) {
    assert.match(source, new RegExp(`case "${state}":\\s*\\n\\s*return \\{ kind: "\\w+", label: "${escapeRegExp(label)}" \\};`));
  }
});

test("OfficialStockScreen.tsx delegates to AddStockButton and StockActions client islands", () => {
  const source = readApp(STOCK_SCREEN_PATH);
  assert.match(source, /from\s*["']\.\/StockActions["']/);
  assert.match(source, /<AddStockButton/);
  assert.match(source, /<StockActions/);
});

// ---------------------------------------------------------------------------
// StockActions -- dynamic import + item_state-gated row actions
// ---------------------------------------------------------------------------

test("StockActions.tsx dynamically imports StockModal with ssr:false", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(source, /dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/StockModal["']\)/);
  assert.match(source, /\{\s*ssr:\s*false\s*\}/);
});

test("StockActions.tsx gates Edit/Restock/Publish/Archive on item_state exactly as the real RPCs require", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(
    source,
    /const canEdit = item\.item_state === "draft" \|\| item\.item_state === "listed";/,
  );
  assert.match(source, /const canRestock = item\.item_state === "sold";/);
  assert.match(
    source,
    /const canPublish = item\.item_state === "draft" && item\.quantity_available > 0;/,
  );
  assert.match(
    source,
    /const canArchive = item\.item_state === "draft" \|\| item\.item_state === "listed";/,
  );
});

test("StockActions.tsx renders no actions at all once an item is fully terminal (all four gates false)", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(
    source,
    /if\s*\(!canEdit && !canRestock && !canPublish && !canArchive\)\s*\{\s*\n\s*return/,
  );
});

test("StockActions.tsx Restock opens StockModal in CREATE mode with prefillFromInventoryId, not edit mode", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(
    source,
    /setModalMode\(\{ kind: "create", prefillFromInventoryId: item\.id \}\)/,
    "Restock must never PATCH a sold-out row -- it creates a fresh one",
  );
});

test("StockActions.tsx posts publish with exactly expectedVersion and an idempotency-key header", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/official-inventory\/\$\{item\.id\}\/publish`/,
  );
  assert.match(source, /body:\s*JSON\.stringify\(\{\s*expectedVersion:\s*item\.version\s*\}\)/);
  assert.match(source, /"idempotency-key":\s*nextIdempotencyKey\("stock-publish"\)/);
});

test("StockActions.tsx posts archive with expectedVersion + adminNote, requires a non-empty note, and confirms before submitting", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/official-inventory\/\$\{item\.id\}\/archive`/,
  );
  assert.match(
    source,
    /body:\s*JSON\.stringify\(\{\s*expectedVersion:\s*item\.version,\s*adminNote:\s*archiveNote\.trim\(\)\s*\}\)/,
  );
  assert.match(source, /if\s*\(!archiveNote\.trim\(\)\)\s*\{/);
  assert.match(source, /window\.confirm\(`Archive/);
});

test("StockActions.tsx surfaces server errors verbatim and treats 401 as a login prompt (publish and archive)", () => {
  const source = readApp(STOCK_ACTIONS_PATH);
  const matches = source.match(/payload\?\.error\s*\?\?/g) ?? [];
  assert.ok(matches.length >= 2, "both publish() and archive() must surface payload.error verbatim");
  const loginMatches = source.match(/response\.status === 401/g) ?? [];
  assert.ok(loginMatches.length >= 2, "both publish() and archive() must treat 401 as a login prompt");
});

// ---------------------------------------------------------------------------
// StockModal -- create (POST) / edit (PATCH) / restock (POST, prefilled)
// ---------------------------------------------------------------------------

test("StockModal.tsx POSTs create with itemType included, PATCHes edit without itemType", () => {
  const source = readApp(STOCK_MODAL_PATH);
  const createBodyMatch = source.match(
    /body:\s*\{\s*itemType:\s*form\.itemType,\s*\.\.\.shared,\s*adminNote:\s*form\.adminNote\.trim\(\)\s*\|\|\s*undefined\s*\}/,
  );
  assert.ok(createBodyMatch, "create body must include itemType");

  const editBodyMatch = source.match(
    /body:\s*\{\s*expectedVersion,\s*\.\.\.shared,\s*adminNote:\s*form\.adminNote\.trim\(\)\s*\}/,
  );
  assert.ok(
    editBodyMatch,
    "edit body must be exactly { expectedVersion, ...shared, adminNote: form.adminNote.trim() }",
  );
  // The two matches above are anchored to their own distinct literal
  // shapes (one starts "itemType:", the other "expectedVersion,") so
  // asserting both matched already proves they're different snippets --
  // this just makes the "edit excludes itemType" intent explicit by name.
  assert.doesNotMatch(
    editBodyMatch[0],
    /itemType/,
    "the edit body snippet itself must not mention itemType",
  );
});

test("StockModal.tsx requires a non-empty adminNote to submit an edit, but not a create", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(
    source,
    /if\s*\(!form\.adminNote\.trim\(\)\)\s*\{\s*\n\s*return \{ ok: false, error: "Add a note describing this change\." \};/,
  );
  assert.match(source, /adminNote:\s*form\.adminNote\.trim\(\)\s*\|\|\s*undefined/, "create's adminNote stays optional");
});

test("StockModal.tsx uses PATCH for edit and POST for create/restock against the right endpoints", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(
    source,
    /`\/api\/marketplace\/admin\/official-inventory\/\$\{mode\.inventoryId\}`/,
  );
  assert.match(source, /"\/api\/marketplace\/admin\/official-inventory"/);
  assert.match(source, /method:\s*mode\.kind === "edit" \? "PATCH" : "POST"/);
});

test("StockModal.tsx converts price THB <-> satang and requires a positive value", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(source, /function thbInputFor\(satang: number\)/);
  assert.match(source, /function thbInputToSatang\(value: string\): number \| null/);
  assert.match(source, /!Number\.isFinite\(amount\) \|\| amount <= 0/, "price must be strictly positive");
});

test("StockModal.tsx validates photo URLs must start with https:// or / before adding them", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(
    source,
    /!trimmed\.startsWith\("https:\/\/"\) && !trimmed\.startsWith\("\/"\)/,
  );
});

test("StockModal.tsx restock prefill resets quantity to a fresh \"1\" and always starts adminNote blank (append-only log field, not a replaceable value)", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(source, /quantityTotal:\s*isRestock \? "1" : String\(detail\.inventory\.quantity_total\)/);
  assert.match(source, /adminNote:\s*"",\s*\n\s*\};/);
});

test("StockModal.tsx fetches full detail (photos, description, reference snapshot, source) before prefilling edit or restock", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(source, /fetch\(`\/api\/marketplace\/admin\/official-inventory\/\$\{prefillId\}`/);
});

test("StockModal.tsx surfaces server errors verbatim and treats 401 as a login prompt on submit", () => {
  const source = readApp(STOCK_MODAL_PATH);
  assert.match(source, /payload\?\.error\s*\?\?/);
  assert.match(source, /response\.status === 401/);
});

// ---------------------------------------------------------------------------
// official-shop.ts / routes -- allowedFields sanity (the contracts this
// screen was built against)
// ---------------------------------------------------------------------------

test("official-shop.ts exports the real allowedFields for update/archive, and update excludes itemType", () => {
  const source = readApp(OFFICIAL_SHOP_LIB_PATH);
  assert.match(
    source,
    /export const OFFICIAL_INVENTORY_ARCHIVE_FIELDS = \[\s*"expectedVersion",\s*"adminNote",\s*\] as const;/,
  );
  assert.match(
    source,
    /export const OFFICIAL_INVENTORY_UPDATE_FIELDS = \[\s*"expectedVersion",\s*"title",\s*"conditionCode",\s*"quantityTotal",\s*"itemPriceSatang",\s*"publicDescription",\s*"photoUrls",\s*"referenceSnapshot",\s*"sourceReferenceId",\s*"procurementNote",\s*"adminNote",\s*\] as const;/,
  );
  assert.doesNotMatch(
    source.match(/export const OFFICIAL_INVENTORY_UPDATE_FIELDS = \[[\s\S]*?\] as const;/)?.[0] ?? "",
    /"itemType"/,
    "itemType must not be in the update allowedFields -- it is immutable after creation",
  );
});

test("official-inventory route.ts's create CREATE_FIELDS includes itemType (create-only)", () => {
  const source = readApp(OFFICIAL_INVENTORY_ROUTE_PATH);
  assert.match(
    source,
    /const CREATE_FIELDS = \[\s*"itemType",\s*"title",\s*"conditionCode",\s*"quantityTotal",\s*"itemPriceSatang",\s*"publicDescription",\s*"photoUrls",\s*"referenceSnapshot",\s*"sourceReferenceId",\s*"procurementNote",\s*"adminNote",\s*\] as const;/,
  );
});

test("[inventoryId]/route.ts PATCH uses OFFICIAL_INVENTORY_UPDATE_FIELDS from the lib, not a locally-redeclared list", () => {
  const source = readApp(OFFICIAL_INVENTORY_ID_ROUTE_PATH);
  assert.match(source, /allowedFields:\s*OFFICIAL_INVENTORY_UPDATE_FIELDS/);
});

test("publish route allows only expectedVersion", () => {
  const source = readApp(OFFICIAL_INVENTORY_PUBLISH_ROUTE_PATH);
  assert.match(source, /allowedFields:\s*\["expectedVersion"\]/);
});

test("archive route uses OFFICIAL_INVENTORY_ARCHIVE_FIELDS from the lib", () => {
  const source = readApp(OFFICIAL_INVENTORY_ARCHIVE_ROUTE_PATH);
  assert.match(source, /allowedFields:\s*OFFICIAL_INVENTORY_ARCHIVE_FIELDS/);
});
