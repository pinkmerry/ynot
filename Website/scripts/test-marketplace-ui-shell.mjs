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
const CART_TRIGGER_PATH = "src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx";
const DRAWER_PATH = "src/features/marketplace-ui/shell/MyPageDrawer.tsx";
const CART_DRAWER_PATH = "src/features/ynot/MarketplaceCartDrawer.tsx";
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

test("MarketplaceCartTrigger.tsx is a context-backed client island with an accessible capped count", () => {
  assert.ok(existsSync(path.join(appRoot, CART_TRIGGER_PATH)), "missing shell/MarketplaceCartTrigger.tsx");
  const source = readApp(CART_TRIGGER_PATH);

  assert.match(source, /^"use client"/, "MarketplaceCartTrigger must start with the client directive");
  assert.match(source, /useMarketplaceCart/, "trigger must consume the marketplace cart context");
  assert.match(source, /summary\.cartCount/, "trigger must read the real cart count from the context summary");
  assert.match(source, /drawerOpen/, "trigger must expose the drawer's expanded state");
  assert.match(source, /openCartDrawer/, "trigger must open the shared cart drawer");
  assert.match(source, /type="button"/, "trigger must use button semantics");
  assert.match(source, /className="mp-icon-btn mp-cart-trigger"/, "trigger must use the marketplace cart styles");
  assert.match(source, /onClick={openCartDrawer}/, "trigger must open the shared drawer on click");
  assert.match(
    source,
    /`Cart, \$\{summary\.cartCount} \$\{summary\.cartCount === 1 \? "item" : "items"}`/,
    "accessible label must retain the real count and singular/plural item wording",
  );
  assert.match(
    source,
    /summary\.cartCount\s*>\s*0\s*\?[^:]*mp-cart-count/s,
    "count badge must render only when summary.cartCount > 0",
  );
  assert.match(
    source,
    /summary\.cartCount\s*>\s*99\s*\?\s*["']99\+["']\s*:\s*summary\.cartCount/,
    "visible count must cap at 99+",
  );
  assert.match(source, /aria-haspopup="dialog"/, "trigger must announce that it opens a dialog");
  assert.match(
    source,
    /aria-controls={drawerOpen\s*\?\s*"marketplace-cart-drawer"\s*:\s*undefined}/,
    "trigger must reference the cart drawer only while its controlled target is mounted",
  );
  assert.doesNotMatch(
    source,
    /aria-controls="marketplace-cart-drawer"/,
    "trigger must not expose aria-controls while the conditional drawer target is absent",
  );
  assert.match(source, /aria-expanded={drawerOpen}/, "trigger must expose the real drawer-open state");
  assert.match(
    source,
    /<MpIcon name="bag" size=\{16\} aria-hidden="true" focusable="false"\s*\/>/,
    "trigger must render the decorative marketplace bag icon",
  );
  assert.doesNotMatch(source, /fetch\s*\(/, "trigger must not make network requests");
  assert.doesNotMatch(source, /\/api\//, "trigger must not reference API routes");
  assert.doesNotMatch(source, /\.rpc\s*\(/, "trigger must not call database RPCs");
});

test("MarketplaceCartDrawer behaves as a contained modal dialog and restores focus", () => {
  const source = readApp(CART_DRAWER_PATH);

  assert.match(source, /role="dialog"/, "cart drawer must expose dialog semantics");
  assert.match(source, /aria-modal="true"/, "cart drawer must announce itself as modal");
  assert.match(source, /tabIndex={-1}/, "cart drawer must provide a programmatic focus fallback");
  assert.match(source, /ref={dialogRef}/, "cart drawer must retain a ref to its dialog target");
  assert.match(source, /onKeyDown={handleDialogKeyDown}/, "cart drawer must own its keyboard containment handler");
  assert.match(source, /ref={closeButtonRef}/, "cart drawer must retain a ref to its preferred initial focus target");

  assert.match(source, /document\.activeElement/, "opening the drawer must remember the previously focused element");
  assert.match(
    source,
    /const initialFocusTarget\s*=\s*closeButtonRef\.current\s*\?\?\s*dialogRef\.current/,
    "opening the drawer must prefer the close button and fall back to the dialog",
  );
  assert.match(source, /initialFocusTarget\?\.focus\(\)/, "opening the drawer must move focus into the modal");
  assert.match(
    source,
    /return\s*\(\)\s*=>\s*{[\s\S]{0,400}\.isConnected[\s\S]{0,160}\.focus\(\)/,
    "drawer cleanup must safely restore focus to the connected previous element",
  );

  assert.match(
    source,
    /event\.key\s*===\s*"Escape"[\s\S]{0,180}closeCartDrawer\(\)/,
    "Escape must close the cart drawer",
  );
  assert.match(source, /event\.key\s*!==\s*"Tab"/, "non-Tab keys must bypass the focus trap");
  assert.match(source, /querySelectorAll<HTMLElement>\(FOCUSABLE_SELECTOR\)/, "Tab handling must discover focusable dialog controls");
  assert.match(source, /event\.shiftKey/, "focus containment must support reverse tabbing");
  assert.match(
    source,
    /focusableElements\.length\s*===\s*0[\s\S]{0,180}dialog\.focus\(\)/,
    "focus containment must fall back to the dialog when it has no focusable children",
  );
  assert.match(source, /event\.preventDefault\(\)/, "wrapped or fallback focus movement must prevent default tabbing");
  assert.doesNotMatch(source, /document\.addEventListener/, "dialog keyboard handling must not leak document listeners");
});

test("MarketTopbar stays server-rendered while the cart provider owns the persistent shell", () => {
  const topbarSource = readApp(TOPBAR_PATH);
  const layoutSource = readApp(LAYOUT_PATH);

  assert.doesNotMatch(topbarSource, /^"use client"/m, "MarketTopbar must stay server-rendered");
  assert.match(
    topbarSource,
    /import\s*{\s*MarketplaceCartTrigger\s*}\s*from\s*["']@\/features\/marketplace-ui\/shell\/MarketplaceCartTrigger["']/,
    "MarketTopbar must import MarketplaceCartTrigger",
  );
  assert.match(
    topbarSource,
    /{isAuthenticated\s*\?\s*<MarketplaceCartTrigger\s*\/>\s*:\s*null}/,
    "MarketTopbar must gate the cart trigger exactly on authentication",
  );
  assert.match(topbarSource, /className="mp-row mp-topbar-nav"/, "left wrapper must expose mp-topbar-nav");
  assert.match(topbarSource, /className="mp-row mp-topbar-actions"/, "right wrapper must expose mp-topbar-actions");

  const coinPill = topbarSource.indexOf('className="mp-coin-pill"');
  const cartTrigger = topbarSource.indexOf("<MarketplaceCartTrigger />");
  const myPageTrigger = topbarSource.indexOf("<MyPageTrigger");

  assert.ok(coinPill >= 0, "MarketTopbar must render the authenticated coin pill");
  assert.ok(cartTrigger >= 0, "MarketTopbar must render the authenticated cart trigger");
  assert.ok(myPageTrigger >= 0, "MarketTopbar must render the authenticated My Page trigger");
  assert.ok(
    coinPill < cartTrigger,
    "authenticated control order must place the coin pill before MarketplaceCartTrigger",
  );
  assert.ok(
    cartTrigger < myPageTrigger,
    "authenticated control order must place MarketplaceCartTrigger before MyPageTrigger",
  );

  const providerOpen = layoutSource.indexOf("<MarketplaceCartProvider");
  const topbar = layoutSource.indexOf("<MarketTopbar");
  const cartDrawer = layoutSource.indexOf("<MarketplaceCartDrawer");
  const children = layoutSource.indexOf("{children}");
  const providerClose = layoutSource.indexOf("</MarketplaceCartProvider>");

  assert.ok(providerOpen >= 0, "layout must open MarketplaceCartProvider");
  assert.ok(
    providerOpen < topbar && topbar < cartDrawer && cartDrawer < children && children < providerClose,
    "layout ordering must be provider open < MarketTopbar < MarketplaceCartDrawer < children < provider close",
  );
});

test("cart drawer and responsive theme expose the persistent cart trigger contract", () => {
  const drawerSource = readApp(CART_DRAWER_PATH);
  const css = readApp(THEME_CSS_PATH);
  const responsive760 = extractCssBlock(css, "@media (max-width: 760px)");
  const responsive480 = extractCssBlock(css, "@media (max-width: 480px)");
  const adminLinkBaseStart = css.indexOf(".mp-admin-link {");
  assert.ok(adminLinkBaseStart >= 0, "theme must define the base admin-link display rule");
  const compactVisibilityMarker = "/* ---------- compact topbar visibility ---------- */";
  const compactVisibilityStart = css.indexOf(compactVisibilityMarker);
  assert.ok(compactVisibilityStart >= 0, "theme must define a late compact topbar visibility override");
  const effectiveResponsive480 = extractCssBlock(
    css,
    "@media (max-width: 480px)",
    compactVisibilityStart,
  );

  assert.match(drawerSource, /id="marketplace-cart-drawer"/, "cart drawer must expose the trigger's controlled id");

  for (const cls of [
    ".mp-topbar-nav",
    ".mp-topbar-actions",
    ".mp-cart-trigger",
    ".mp-cart-count",
    ".mp-cart-trigger:focus-visible",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(cls) + "[\\s,{.[]"), `missing class ${cls}`);
  }

  assert.match(
    responsive760,
    /\.mp-brand\s*{[^}]*grid-row:\s*1\s*;/,
    "the 760px block must place the brand in row 1",
  );
  assert.match(
    responsive760,
    /\.mp-topbar-actions\s*{[^}]*grid-row:\s*1\s*;/,
    "the 760px block must place topbar actions in row 1",
  );
  assert.match(
    responsive760,
    /\.mp-topbar-actions\s*{[^}]*grid-column:\s*2\s*;/,
    "the 760px block must place topbar actions in grid column 2",
  );
  assert.match(
    responsive760,
    /\.mp-topbar-nav\s*{[^}]*grid-row:\s*2\s*;/,
    "the 760px block must place topbar navigation in row 2",
  );
  assert.match(
    responsive760,
    /\.mp-topbar-nav\s*{[^}]*grid-column:\s*1\s*\/\s*-1\s*;/,
    "the 760px block must span topbar navigation across columns 1 / -1",
  );
  assert.match(
    responsive480,
    /\.mp-admin-link\s*,\s*\.mp-coin-pill\s*{[^}]*display:\s*none/,
    "the 480px block must hide only the secondary admin and coin controls",
  );
  assert.ok(
    compactVisibilityStart > adminLinkBaseStart,
    "the effective compact topbar override must follow the base admin-link display declaration",
  );
  assert.match(
    effectiveResponsive480,
    /\.mp-topbar-actions\s+\.mp-admin-link\s*,\s*\.mp-topbar-actions\s+\.mp-coin-pill\s*{[^}]*display:\s*none/,
    "the effective 480px override must use scoped selectors that hide admin and coin controls",
  );
  assert.doesNotMatch(
    effectiveResponsive480,
    /\.mp-cart-trigger|\.mp-avatar-btn/,
    "the effective compact override must leave cart and avatar controls visible",
  );
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

function extractCssBlock(source, marker, fromIndex = 0) {
  const markerIndex = source.indexOf(marker, fromIndex);
  assert.ok(markerIndex >= 0, `missing CSS block ${marker}`);

  const openingBrace = source.indexOf("{", markerIndex);
  assert.ok(openingBrace >= 0, `missing opening brace for CSS block ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  assert.fail(`missing closing brace for CSS block ${marker}`);
}
