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
const OVERVIEW_PATH = `${ADMIN_DIR}/OverviewScreen.tsx`;
const PAGE_PATH = "src/app/admin/marketplace/page.tsx";
const THEME_CSS_PATH = "src/features/marketplace-ui/theme/marketplace-theme.css";

test("package exposes the scoped marketplace UI admin shell test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-admin-shell"],
    "node --test scripts/test-marketplace-ui-admin-shell.mjs",
  );
});

test("AdminShell.tsx and OverviewScreen.tsx exist", () => {
  for (const relPath of [SHELL_PATH, OVERVIEW_PATH]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("AdminShell.tsx and OverviewScreen.tsx stay server components", () => {
  for (const relPath of [SHELL_PATH, OVERVIEW_PATH]) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /^"use client"/m, `${relPath} must stay a server component`);
  }
});

test("AdminShell.tsx wires the four real admin routes", () => {
  const source = readApp(SHELL_PATH);
  // the bare overview path is a prefix of the others, so match it precisely
  // (comma right after the closing quote) rather than as a loose substring
  assert.match(source, /href:\s*"\/admin\/marketplace",/, "missing the overview route");
  for (const href of [
    '"/admin/marketplace/orders"',
    '"/admin/marketplace/seller-submissions"',
    '"/admin/marketplace/listings"',
  ]) {
    assert.match(source, new RegExp(escapeRegExp(href)), `missing real route ${href}`);
  }
});

test("AdminShell.tsx wires moderation/disputes/payouts/settings as real routes and keeps the soon-tag mechanism available for future areas", () => {
  // moderation/disputes/payouts/settings started life as soon-tagged
  // placeholders and have since shipped real screens one at a time
  // (ModerationScreen/DisputesScreen, PayoutsScreen, FeesSettingsScreen) --
  // by the end of that rollout none of them are soon-tagged anymore. The
  // AdminNavItem.soon field and its conditional Soon-tag render stay in
  // AdminShell so a genuinely future area can still opt into the same
  // mechanism later; this test now pins that the mechanism exists rather
  // than that some specific item is currently using it.
  const source = readApp(SHELL_PATH);
  for (const href of [
    '"/admin/marketplace/moderation"',
    '"/admin/marketplace/disputes"',
    '"/admin/marketplace/payouts"',
    '"/admin/marketplace/settings"',
  ]) {
    assert.match(source, new RegExp(escapeRegExp(href)), `missing route ${href}`);
  }
  assert.match(source, /soon\?:\s*boolean;/, "AdminNavItem must still declare the optional soon flag");
  assert.match(
    source,
    /item\.soon\s*\?\s*<span className="n">Soon<\/span>\s*:\s*null/,
    "the Soon-tag render branch must stay available for a future not-yet-built area",
  );
  assert.doesNotMatch(
    source,
    /soon:\s*true/,
    "no current nav item should be soon-tagged now that moderation/disputes/payouts/settings are all real routes",
  );
});

test("AdminShell.tsx links back to the real marketplace root and takes an active prop", () => {
  const source = readApp(SHELL_PATH);
  assert.match(source, /href="\/marketplace"/, "must link back to /marketplace");
  assert.match(source, /active:\s*AdminNavId/, "AdminShellProps must type active as AdminNavId");
  assert.match(
    source,
    /active === item\.id/,
    "the active nav item must be derived by comparing the active prop against each item's id",
  );
});

test("OverviewScreen.tsx documents the four new admin-only reads it expects as data (getAdminDailyGmv, listAdminMarketplaceOrders, countOpenListingReports, countActiveProductAlerts)", () => {
  const source = readApp(OVERVIEW_PATH);
  for (const fnName of [
    "getAdminDailyGmv",
    "listAdminMarketplaceOrders",
    "countOpenListingReports",
    "countActiveProductAlerts",
  ]) {
    assert.match(source, new RegExp(fnName), `must reference ${fnName}`);
  }
});

test("OverviewScreen.tsx renders the GMV mini-chart as an inline SVG with a fixed viewBox", () => {
  const source = readApp(OVERVIEW_PATH);
  assert.match(source, /<svg viewBox={viewBox}/, "chart must render an <svg> with a viewBox");
  assert.match(source, /const viewBox = `0 0 \$\{CHART_WIDTH\} \$\{CHART_HEIGHT\}`/, "viewBox must be a fixed, non-data-dependent size");
});

test("OverviewScreen.tsx renders the recent-orders table via mpa-table with formatThb totals", () => {
  const source = readApp(OVERVIEW_PATH);
  assert.match(source, /className="mpa-table"/);
  assert.match(source, /formatThb\(order\.buyer_total_satang\)/);
  assert.match(source, /admin\/marketplace\/orders\/\$\{order\.order_id\}/, "each row must link into the order detail screen");
});

test("OverviewScreen.tsx places the money policy controls via a slot prop rather than importing the client island itself", () => {
  const source = readApp(OVERVIEW_PATH);
  assert.match(source, /moneyPolicyPanel:\s*ReactNode/, "OverviewScreenProps must accept moneyPolicyPanel as a ReactNode slot");
  assert.match(source, /\{moneyPolicyPanel\}/, "must render the moneyPolicyPanel slot");
  assert.doesNotMatch(
    source,
    /from ["']@\/features\/ynot\/MarketplaceMoneyPolicyControls["']/,
    "OverviewScreen must not import the client MarketplaceMoneyPolicyControls itself -- the page instantiates it and passes it in",
  );
});

test("page.tsx keeps AdminGate, resolveAdminSession, buildMarketplaceOpsSnapshot, and MarketplaceMoneyPolicyControls", () => {
  const source = readApp(PAGE_PATH);
  for (const needle of [
    "AdminGate",
    "resolveAdminSession",
    "buildMarketplaceOpsSnapshot",
    "MarketplaceMoneyPolicyControls",
  ]) {
    assert.match(source, new RegExp(needle), `page.tsx must still reference ${needle}`);
  }
});

test("page.tsx renders the new AdminShell/OverviewScreen and drops the legacy AdminFrame/YnotShell chrome", () => {
  const source = readApp(PAGE_PATH);
  assert.match(source, /<AdminShell active="overview">/);
  assert.match(source, /<OverviewScreen/);
  assert.doesNotMatch(source, /YnotShell/, "no YnotShell reference should remain in the page");
  assert.doesNotMatch(source, /AdminFrame/, "the old AdminFrame chrome must be fully replaced");
});

test("page.tsx passes MarketplaceMoneyPolicyControls into OverviewScreen's moneyPolicyPanel slot", () => {
  const source = readApp(PAGE_PATH);
  assert.match(
    source,
    /moneyPolicyPanel={<MarketplaceMoneyPolicyControls policy={moneyPolicy} \/>}/,
    "must instantiate MarketplaceMoneyPolicyControls and pass it as the moneyPolicyPanel slot",
  );
});

test("page.tsx gates the four new admin-only reads behind canReadMarketplaceQueues and groups them in one Promise.all", () => {
  const source = readApp(PAGE_PATH);
  assert.match(source, /canReadMarketplaceQueues/);
  assert.match(
    source,
    /Promise\.all\(\[\s*getAdminDailyGmv\([\s\S]*?listAdminMarketplaceOrders\([\s\S]*?countOpenListingReports\(\)[\s\S]*?countActiveProductAlerts\(\)/,
    "the four new reads must be grouped in a single Promise.all",
  );
});

test("theme CSS defines the admin overview classes referenced by OverviewScreen.tsx/AdminShell.tsx", () => {
  const css = readApp(THEME_CSS_PATH);
  for (const cls of [
    ".mpa-overview-row",
    ".mpa-queue-list",
    ".mpa-queue-row",
    ".mpa-table-wrap",
    ".mpa-side-spacer",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(cls) + "[\\s,{.[]"), `missing class ${cls}`);
  }
});

test("theme CSS collapses the admin shell responsively (no fixed-width overflow on narrow viewports)", () => {
  const css = readApp(THEME_CSS_PATH);
  assert.match(css, /@media \(max-width:\s*860px\)\s*{[\s\S]*\.mpa-shell\s*{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width:\s*480px\)\s*{[\s\S]*\.mpa-kpis/);
});
