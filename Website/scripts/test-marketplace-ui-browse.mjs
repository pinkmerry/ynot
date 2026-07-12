import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

const BROWSE_PAGE_PATH = "src/features/marketplace-ui/browse/BrowsePage.tsx";
const FILTER_RAIL_PATH = "src/features/marketplace-ui/browse/FilterRail.tsx";
const ALERT_BUTTON_PATH = "src/features/marketplace-ui/browse/AlertButton.tsx";
const PAGE_PATH = "src/app/(store)/marketplace/page.tsx";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("package exposes the scoped marketplace UI browse test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-browse"],
    "node --test scripts/test-marketplace-ui-browse.mjs",
  );
});

test("BrowsePage.tsx, FilterRail.tsx, and AlertButton.tsx exist", () => {
  assert.ok(existsSync(path.join(appRoot, BROWSE_PAGE_PATH)), "missing browse/BrowsePage.tsx");
  assert.ok(existsSync(path.join(appRoot, FILTER_RAIL_PATH)), "missing browse/FilterRail.tsx");
  assert.ok(existsSync(path.join(appRoot, ALERT_BUTTON_PATH)), "missing browse/AlertButton.tsx");
});

test("marketplace page.tsx renders BrowsePage and no longer renders MarketplaceExperience or YnotShell", () => {
  const source = readApp(PAGE_PATH);
  assert.match(
    source,
    /import\s*{\s*BrowsePage\s*}\s*from\s*["']@\/features\/marketplace-ui\/browse\/BrowsePage["']/,
    "page.tsx must import BrowsePage from the new feature module",
  );
  assert.match(source, /<BrowsePage/, "page.tsx must render <BrowsePage");
  assert.doesNotMatch(
    source,
    /MarketplaceExperience/,
    "page.tsx must no longer reference MarketplaceExperience (old rendering removed)",
  );
  assert.doesNotMatch(
    source,
    /YnotShell/,
    "page.tsx must no longer render YnotShell (double-header resolved — the layout topbar supplies chrome now)",
  );
});

test("marketplace page.tsx keeps the existing data-loading and guard logic untouched", () => {
  const source = readApp(PAGE_PATH);
  for (const symbol of [
    "resolveCurrentProfile",
    "resolveAdminSession",
    "marketplaceConfig",
    "marketplaceQueryPlanFromUrl",
    "listMarketplaceProductBrowsePage",
    "listMarketplaceProductBrowseFilterCounts",
    "getMarketplaceAccountForProfile",
    "selectedMarketplaceFilter",
    "selectedMarketplaceSort",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `page.tsx must still reference ${symbol}`);
  }
  assert.match(source, /Promise\.all\(/, "page.tsx must still parallelize the independent reads via Promise.all");
  assert.match(
    source,
    /if\s*\(!allowed\)\s*{\s*redirect\("\/packs"\);/,
    "page.tsx must still redirect unauthorized owner-only access to /packs",
  );
});

test("marketplace page.tsx passes the real query-plan mapping helpers' results into BrowsePage", () => {
  const source = readApp(PAGE_PATH);
  assert.match(
    source,
    /selectedFilterKey={selectedMarketplaceFilter\(productQuery\)}/,
    "page.tsx must pass selectedMarketplaceFilter(productQuery) as selectedFilterKey",
  );
  assert.match(
    source,
    /selectedSort={selectedMarketplaceSort\(productQuery\)}/,
    "page.tsx must pass selectedMarketplaceSort(productQuery) as selectedSort",
  );
});

test("BrowsePage.tsx is a server component referencing both market tabs and product links", () => {
  const source = readApp(BROWSE_PAGE_PATH);
  assert.doesNotMatch(
    source,
    /^"use client"/m,
    "BrowsePage must stay a server component (no \"use client\" directive)",
  );
  assert.match(source, /\?source=official_shop/, "must link the official shop tab via ?source=official_shop");
  assert.match(source, /\?source=user_seller/, "must link the community tab via ?source=user_seller");
  assert.match(
    source,
    /\/marketplace\/products\//,
    "product cards must link to /marketplace/products/[productSlug]",
  );
});

test("BrowsePage.tsx renders real product fields (no invented shape) and formats price via formatThb", () => {
  const source = readApp(BROWSE_PAGE_PATH);
  for (const field of [
    "product.product_id",
    "product.product_slug",
    "product.title",
    "product.lowest_price_satang",
    "product.active_listing_count",
    "product.official_listing_count",
    "product.user_seller_listing_count",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `BrowsePage must reference ${field}`);
  }
  assert.match(source, /formatThb\(/, "price must render via the shared formatThb helper");
  assert.match(
    source,
    /import\s*{\s*formatThb\s*}\s*from\s*["']\.\.\/shared\/money["']/,
    "must import formatThb from the shared money helper",
  );
});

test("BrowsePage.tsx renders an empty state with a Clear filters link and a product-scoped alert hint (no productless alert wiring)", () => {
  const source = readApp(BROWSE_PAGE_PATH);
  assert.match(source, /MpEmpty/, "must use the shared MpEmpty primitive");
  assert.match(source, /Clear filters/, "empty state must offer a Clear filters action");
  assert.doesNotMatch(
    source,
    /AlertButton/,
    "BrowsePage must not wire a productless AlertButton — alerts are product-scoped and belong on the product detail page",
  );
});

test("BrowsePage.tsx uses MpBadge for the official/community source badge", () => {
  const source = readApp(BROWSE_PAGE_PATH);
  assert.match(
    source,
    /import\s*{[^}]*MpBadge[^}]*}\s*from\s*["']\.\.\/shared\/MpPrimitives["']/,
    "must import MpBadge from the shared primitives",
  );
  assert.match(source, /<MpBadge/, "must render <MpBadge");
});

test("FilterRail.tsx is a client component that uses router + useTransition and builds URLSearchParams", () => {
  const source = readApp(FILTER_RAIL_PATH);
  assert.match(source, /^"use client"/m, "FilterRail must be a client component");
  assert.match(
    source,
    /import\s*{\s*useRouter\s*}\s*from\s*["']next\/navigation["']/,
    "must import useRouter from next/navigation",
  );
  assert.match(source, /useRouter\(\)/, "must call useRouter()");
  assert.match(source, /useTransition/, "must use useTransition to dim the grid while pending (INP budget)");
  assert.match(source, /new URLSearchParams\(/, "must build a URLSearchParams instance");
  assert.match(source, /router\.push\(/, "must navigate via router.push");

  for (const param of ['"source"', '"sort"', '"q"']) {
    assert.match(
      source,
      new RegExp(`params\\.set\\(${escapeRegExp(param)}`),
      `URLSearchParams must be able to set the ${param} query-plan field`,
    );
  }
});

test("FilterRail.tsx search submits on Enter/form submit rather than per-keystroke navigation", () => {
  const source = readApp(FILTER_RAIL_PATH);
  assert.match(source, /onSubmit={handleSearchSubmit}/, "search input must live inside a form submitted on Enter");
  assert.doesNotMatch(
    source,
    /onChange={\(event\) => navigate/,
    "the raw search input's onChange must not directly call navigate() per keystroke",
  );
});

test("AlertButton.tsx is a reusable client component that POSTs to /api/marketplace/alerts with the idempotency header", () => {
  const source = readApp(ALERT_BUTTON_PATH);
  assert.match(source, /^"use client"/m, "AlertButton must be a client component");
  assert.match(
    source,
    /export function AlertButton\(/,
    "must export a named AlertButton function component",
  );
  assert.match(source, /productId/, "AlertButton must accept a productId prop");
  assert.match(
    source,
    /fetch\(\s*["']\/api\/marketplace\/alerts["']/,
    "must POST to /api/marketplace/alerts",
  );
  assert.match(source, /method:\s*["']POST["']/, "must use method: POST");
  assert.match(
    source,
    /["']idempotency-key["']/,
    "must send the idempotency-key header matching marketplaceIdempotencyKey()'s primary header name",
  );
  assert.match(source, /crypto\.randomUUID\(\)/, "must generate a fresh idempotency key per request");
  assert.match(source, /res(ponse)?\.ok/, "must check response.ok");
  assert.match(source, /401/, "must handle the 401 unauthenticated case with a login link");
});

test("AlertButton.tsx matches the real idempotency header name used by marketplaceIdempotencyKey()", () => {
  const guardSource = readApp("src/lib/marketplace/request-guard.ts");
  const alertSource = readApp(ALERT_BUTTON_PATH);
  assert.match(
    guardSource,
    /request\.headers\.get\("idempotency-key"\)/,
    "sanity check: marketplaceIdempotencyKey must still read the idempotency-key header first",
  );
  assert.match(alertSource, /"idempotency-key"/, "AlertButton must send the same header name");
});
