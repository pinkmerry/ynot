import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

const TOPBAR_PATH = "src/features/marketplace-ui/shell/MarketTopbar.tsx";
const TRIGGER_PATH = "src/features/marketplace-ui/shell/MyPageTrigger.tsx";
const DRAWER_PATH = "src/features/marketplace-ui/shell/MyPageDrawer.tsx";
const THEME_CSS_PATH = "src/features/marketplace-ui/theme/marketplace-theme.css";
const LAYOUT_PATH = "src/app/(store)/marketplace/layout.tsx";
const CURRENT_SHELL_PATH = "src/features/ynot/components.tsx";

test("package exposes the scoped marketplace UI shell test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-shell"],
    "node --test scripts/test-marketplace-ui-shell.mjs",
  );
});

test("MarketTopbar.tsx exists, is a server component, and wires the three real nav hrefs", () => {
  assert.ok(existsSync(path.join(appRoot, TOPBAR_PATH)), "missing shell/MarketTopbar.tsx");
  const source = readApp(TOPBAR_PATH);

  assert.doesNotMatch(
    source,
    /^"use client"/m,
    "MarketTopbar must stay a server component (no \"use client\" directive)",
  );

  for (const href of ['href="/"', 'href="/ynot"', 'href="/marketplace"']) {
    assert.match(source, new RegExp(escapeRegExp(href)), `missing nav href ${href}`);
  }

  // brand links back to /marketplace
  assert.match(source, /mp-brand/, "must render the mp-brand class");
});

test("MarketTopbar.tsx gates the admin console link on a real isAdmin prop", () => {
  const source = readApp(TOPBAR_PATH);
  assert.match(source, /isAdmin:\s*boolean/, "MarketTopbarProps must type isAdmin as boolean");
  assert.match(
    source,
    /isAdmin\s*\?[\s\S]{0,200}\/admin\/marketplace/,
    "admin console link must be conditionally rendered on isAdmin and point at /admin/marketplace",
  );
});

test("MarketTopbar.tsx does not render a notification bell (dead control, no backend)", () => {
  const source = readApp(TOPBAR_PATH);
  // MpIcon's icon set includes a "bell" case used elsewhere in the app, but
  // the topbar itself must never reference it — there's no notification
  // backend behind it, so it would be a dead, non-functional control.
  assert.doesNotMatch(source, /bell/i, "MarketTopbar must not reference a bell icon/control");
});

test("MarketTopbar.tsx renders the coin pill from a real numeric balance prop, formatted via formatNumber", () => {
  const source = readApp(TOPBAR_PATH);
  assert.match(source, /balanceCoins:\s*number/, "MarketTopbarProps must type balanceCoins as number");
  assert.match(source, /formatNumber/, "coin pill must render via the shared formatNumber helper");
  assert.match(source, /mp-coin-pill/, "must render the mp-coin-pill class");
});

test("MyPageTrigger.tsx is a client island that dynamically imports the drawer with ssr:false", () => {
  assert.ok(existsSync(path.join(appRoot, TRIGGER_PATH)), "missing shell/MyPageTrigger.tsx");
  const source = readApp(TRIGGER_PATH);
  assert.match(source, /^"use client"/m, "MyPageTrigger must be a client component");
  assert.match(source, /from ["']next\/dynamic["']/, "must import next/dynamic");
  assert.match(source, /dynamic\(/, "must call dynamic()");
  assert.match(source, /ssr:\s*false/, "drawer must be dynamically imported with ssr:false (interaction-gated, perf rule P2)");
  assert.match(source, /MyPageDrawer/, "must dynamically import MyPageDrawer");
});

test("MyPageDrawer.tsx exists, is a client component, and references the real account routes", () => {
  assert.ok(existsSync(path.join(appRoot, DRAWER_PATH)), "missing shell/MyPageDrawer.tsx");
  const source = readApp(DRAWER_PATH);
  assert.match(source, /^"use client"/m, "MyPageDrawer must be a client component");

  for (const href of ['href="/marketplace/orders"', 'href="/wallet"']) {
    assert.match(source, new RegExp(escapeRegExp(href)), `missing drawer href ${href}`);
  }
});

test("MyPageDrawer.tsx reuses the existing signout mechanism rather than inventing a new one", () => {
  const drawerSource = readApp(DRAWER_PATH);
  const layoutSource = readApp(LAYOUT_PATH);
  const currentShellSource = readApp(CURRENT_SHELL_PATH);

  // The existing customer-facing shell (YnotShell / StoreHeaderRightNav)
  // signs out via <form action={signOutAction}> where signOutAction is the
  // server action imported from @/features/auth/actions. The new drawer
  // must reuse that exact action, not a re-implemented route/handler.
  assert.match(
    currentShellSource,
    /import\s*{\s*signOutAction\s*}\s*from\s*["']@\/features\/auth\/actions["']/,
    "sanity check: current shell must still import signOutAction from @/features/auth/actions",
  );
  assert.match(
    layoutSource,
    /import\s*{\s*signOutAction\s*}\s*from\s*["']@\/features\/auth\/actions["']/,
    "marketplace layout must import the same signOutAction as the current shell",
  );
  assert.match(
    drawerSource,
    /<form action={signOutAction}>/,
    "drawer must submit signout via <form action={signOutAction}>, matching the current shell's pattern",
  );
});

test("MyPageDrawer.tsx renders a pending-action badge only when the count is greater than zero", () => {
  const source = readApp(DRAWER_PATH);
  assert.match(source, /pendingActionCount:\s*number/, "MyPageDrawerProps must type pendingActionCount as number");
  assert.match(
    source,
    /pendingActionCount\s*>\s*0/,
    "badge must be conditionally rendered only when pendingActionCount > 0",
  );
});

test("marketplace layout.tsx imports and renders MarketTopbar, passing a real isAdmin prop", () => {
  const source = readApp(LAYOUT_PATH);
  assert.match(
    source,
    /import\s*{\s*MarketTopbar\s*}\s*from\s*["']@\/features\/marketplace-ui\/shell\/MarketTopbar["']/,
    "layout must import MarketTopbar",
  );
  assert.match(source, /<MarketTopbar/, "layout must render <MarketTopbar");
  assert.match(source, /isAdmin={!!admin}/, "layout must pass isAdmin={!!admin} sourced from resolveAdminSession");
});

test("marketplace layout.tsx still resolves admin/profile/account and keeps the cart provider/drawer mounted", () => {
  const source = readApp(LAYOUT_PATH);
  assert.match(source, /resolveCurrentProfile/, "layout must still resolve the current profile");
  assert.match(source, /resolveAdminSession/, "layout must still resolve the admin session");
  assert.match(source, /getMarketplaceAccountForProfile/, "layout must still resolve the marketplace account");
  assert.match(source, /MarketplaceCartProvider/, "layout must keep MarketplaceCartProvider mounted");
  assert.match(source, /MarketplaceCartDrawer/, "layout must keep MarketplaceCartDrawer mounted");
});

test("marketplace layout.tsx sources the coin balance from the ynot dashboard slice and the bag count from getMarketplaceBagSummary", () => {
  const source = readApp(LAYOUT_PATH);
  assert.match(
    source,
    /import\s*{\s*getYnotDashboardSlice\s*}\s*from\s*["']@\/features\/ynot\/data["']/,
    "layout must import getYnotDashboardSlice from the ynot dashboard data module",
  );
  assert.match(source, /getYnotDashboardSlice\(/, "layout must call getYnotDashboardSlice");
  assert.match(source, /wallet\.balanceCoins/, "layout must read balanceCoins off the dashboard slice's wallet field");

  assert.match(
    source,
    /import\s*{\s*getMarketplaceBagSummary\s*}\s*from\s*["']@\/lib\/marketplace\/bag-summary["']/,
    "layout must import getMarketplaceBagSummary",
  );
  assert.match(source, /\.pendingPaymentOrders/, "must read pendingPaymentOrders off the bag summary");
  assert.match(source, /\.sellerSubmissions/, "must read sellerSubmissions off the bag summary");
  assert.match(
    source,
    /pendingPaymentOrders\s*\+\s*(\w+\.)?sellerSubmissions/,
    "pending-action count must be pendingPaymentOrders + sellerSubmissions per the bag summary contract",
  );
});

test("marketplace layout.tsx parallelizes the independent reads via Promise.all", () => {
  const source = readApp(LAYOUT_PATH);
  assert.match(
    source,
    /Promise\.all\(\s*\[[\s\S]*getMarketplaceCustomerCartSummary[\s\S]*getYnotDashboardSlice[\s\S]*getMarketplaceBagSummary[\s\S]*\]\s*\)/,
    "cart summary, dashboard slice, and bag summary reads must be parallelized via Promise.all",
  );
});

test("theme CSS defines the my-page drawer classes referenced by MyPageDrawer.tsx", () => {
  const css = readApp(THEME_CSS_PATH);
  for (const cls of [
    ".mp-drawer-backdrop",
    ".mp-drawer",
    ".mp-drawer-identity",
    ".mp-drawer-balance",
    ".mp-drawer-link",
    ".mp-drawer-logout",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(cls) + "[\\s,{.[]"), `missing class ${cls}`);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
