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

const PRODUCT_DETAIL_PATH = "src/features/marketplace-ui/product/ProductDetail.tsx";
const GRADE_TABS_PATH = "src/features/marketplace-ui/product/GradeTabs.tsx";
const PRICE_HISTORY_PANEL_PATH = "src/features/marketplace-ui/product/PriceHistoryPanel.tsx";
const REPORT_BUTTON_PATH = "src/features/marketplace-ui/product/ReportListingButton.tsx";
const PAGE_PATH = "src/app/(store)/marketplace/products/[productSlug]/page.tsx";
const REPORT_ROUTE_PATH =
  "src/app/api/ynot/marketplace/listings/[listingId]/report/route.ts";
const REQUEST_GUARD_PATH = "src/lib/marketplace/request-guard.ts";

test("package exposes the scoped marketplace UI product test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-product"],
    "node --test scripts/test-marketplace-ui-product.mjs",
  );
});

test("ProductDetail.tsx, GradeTabs.tsx, PriceHistoryPanel.tsx, and ReportListingButton.tsx exist", () => {
  assert.ok(existsSync(path.join(appRoot, PRODUCT_DETAIL_PATH)), "missing product/ProductDetail.tsx");
  assert.ok(existsSync(path.join(appRoot, GRADE_TABS_PATH)), "missing product/GradeTabs.tsx");
  assert.ok(
    existsSync(path.join(appRoot, PRICE_HISTORY_PANEL_PATH)),
    "missing product/PriceHistoryPanel.tsx",
  );
  assert.ok(
    existsSync(path.join(appRoot, REPORT_BUTTON_PATH)),
    "missing product/ReportListingButton.tsx",
  );
});

test("page.tsx renders ProductDetail and no longer renders MarketplaceProductPage", () => {
  const source = readApp(PAGE_PATH);
  assert.match(
    source,
    /import\s*{\s*ProductDetail\s*}\s*from\s*["']@\/features\/marketplace-ui\/product\/ProductDetail["']/,
    "page.tsx must import ProductDetail from the new feature module",
  );
  assert.match(source, /<ProductDetail\b/, "page.tsx must render <ProductDetail");
  assert.doesNotMatch(
    source,
    /MarketplaceProductPage/,
    "page.tsx must no longer reference MarketplaceProductPage (old rendering removed)",
  );
});

test("page.tsx still exports generateMetadata and still renders the JSON-LD script (SEO not regressed)", () => {
  const source = readApp(PAGE_PATH);
  assert.match(
    source,
    /export\s+async\s+function\s+generateMetadata\s*\(/,
    "page.tsx must still export generateMetadata",
  );
  assert.match(
    source,
    /buildMarketplaceProductMetadata/,
    "generateMetadata must still build metadata via buildMarketplaceProductMetadata",
  );
  assert.match(
    source,
    /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML={{/,
    "page.tsx must still render the JSON-LD <script> block",
  );
  assert.match(
    source,
    /buildMarketplaceProductJsonLd\(market\)/,
    "JSON-LD script must still be built from buildMarketplaceProductJsonLd(market)",
  );
  assert.match(
    source,
    /serializeMarketplaceJsonLd\(/,
    "JSON-LD script must still be serialized via serializeMarketplaceJsonLd",
  );
});

test("page.tsx keeps the existing guards and market load untouched", () => {
  const source = readApp(PAGE_PATH);
  for (const symbol of [
    "resolveCurrentProfile",
    "resolveAdminSession",
    "marketplaceConfig",
    "marketplaceQueryPlanFromUrl",
    "getMarketplaceProductMarket",
    "MarketplaceServiceError",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `page.tsx must still reference ${symbol}`);
  }
  assert.match(source, /if\s*\(!allowed\)\s*redirect\("\/packs"\);/, "must still redirect unauthorized owner-only access to /packs");
  assert.match(source, /notFound\(\)/, "must still call notFound() for marketplace_product_not_found");
});

test("page.tsx no longer renders YnotShell or fetches the dashboard slice that only fed it", () => {
  const source = readApp(PAGE_PATH);
  assert.doesNotMatch(source, /YnotShell/, "page.tsx must no longer render YnotShell (layout topbar owns chrome now)");
  assert.doesNotMatch(
    source,
    /getYnotDashboardSlice/,
    "page.tsx must no longer call getYnotDashboardSlice — it only fed YnotShell's viewer/walletBalance",
  );
});

test("ProductDetail.tsx is a server component that imports AlertButton from ../browse/AlertButton", () => {
  const source = readApp(PRODUCT_DETAIL_PATH);
  assert.doesNotMatch(
    source,
    /^"use client"/m,
    "ProductDetail must stay a server component (no \"use client\" directive)",
  );
  assert.match(
    source,
    /import\s*{\s*AlertButton\s*}\s*from\s*["']\.\.\/browse\/AlertButton["']/,
    "ProductDetail must import AlertButton from ../browse/AlertButton (reused, not rewritten)",
  );
  assert.match(source, /<AlertButton\b/, "ProductDetail must render <AlertButton");
});

test("ProductDetail.tsx renders real market fields (no invented shape)", () => {
  const source = readApp(PRODUCT_DETAIL_PATH);
  for (const field of [
    "market.product.id",
    "market.product.title",
    "market.product.hero_image_url",
    "market.product.lowest_price_satang",
    "market.product.card_code",
    "market.product.set_name",
    "market.product.series_name",
    "market.product.language",
    "market.product.brand",
    "market.priceHistory",
    "market.listings",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `ProductDetail must reference ${field}`);
  }
  assert.match(source, /formatThb\(/, "prices must render via the shared formatThb helper");
});

test("ProductDetail.tsx derives stats from priceHistory (last sale, 90-day avg, sales count) and reuses the lowest-price field", () => {
  const source = readApp(PRODUCT_DETAIL_PATH);
  assert.match(source, /priceHistory\[0\]/, "last sale must read the newest (index 0) price-history row");
  assert.match(
    source,
    /90.*DAYS_MS|NINETY_DAYS_MS/i,
    "must derive a 90-day window constant for the 90-day average",
  );
  assert.match(
    source,
    /market\.priceHistory\.length/,
    "sales count must derive from priceHistory.length",
  );
});

test("ProductDetail.tsx loads similar products server-side via listMarketplaceProductBrowsePage, excluding the current product", () => {
  const source = readApp(PRODUCT_DETAIL_PATH);
  assert.match(
    source,
    /import\s*{\s*listMarketplaceProductBrowsePage\s*}\s*from\s*["']@\/lib\/marketplace\/product-browse["']/,
    "must import listMarketplaceProductBrowsePage",
  );
  assert.match(source, /listMarketplaceProductBrowsePage\(/, "must call listMarketplaceProductBrowsePage");
  assert.match(
    source,
    /product\.product_id\s*!==\s*market\.product\.id/,
    "must exclude the current product from the similar-cards strip",
  );
  assert.match(source, /\.slice\(0,\s*4\)/, "similar cards strip must be capped to the first 4");
});

test("ProductDetail.tsx renders the sold/empty state with AlertButton and a Browse similar link when there are no active listings", () => {
  const source = readApp(PRODUCT_DETAIL_PATH);
  assert.match(
    source,
    /hasActiveListings/,
    "must branch on whether the product has active listings",
  );
  assert.match(source, /Browse similar/, "sold state must offer a Browse similar link");
  assert.match(source, /href="\/marketplace"/, "Browse similar must link back to /marketplace");
});

test("GradeTabs.tsx is a client component grouping by grade_value/condition_bucket, with Buy linking to the listing page", () => {
  const source = readApp(GRADE_TABS_PATH);
  assert.match(source, /^"use client"/m, "GradeTabs must be a client component");
  assert.match(
    source,
    /snapshot_payload\?\.\s*gradeValue/,
    "grouping key must fall back through the real snapshot_payload.gradeValue field",
  );
  assert.match(
    source,
    /snapshot_payload\?\.\s*conditionBucket/,
    "grouping key must fall back to the real snapshot_payload.conditionBucket field",
  );
  assert.match(
    source,
    /href={`\/marketplace\/listings\/\$\{listing\.listing_id\}`}/,
    "Buy must link to /marketplace/listings/[listingId] (checkout starts on the listing page)",
  );
  assert.match(source, />\s*Buy\s*</, "must render a Buy action label");
});

test("GradeTabs.tsx pins official-source rows and sorts by price ascending", () => {
  const source = readApp(GRADE_TABS_PATH);
  assert.match(source, /listing_source\s*===\s*"official_shop"/, "must check the real listing_source field");
  assert.match(source, /pinned/, "official rows must get the pinned row treatment");
  assert.match(
    source,
    /item_price_satang\s*-\s*right\.item_price_satang|left\.item_price_satang\s*-\s*right/,
    "rows must sort ascending by the real item_price_satang field",
  );
});

test("PriceHistoryPanel.tsx is a client component with 3M/6M/1Y range chips and a fixed-viewBox SVG chart", () => {
  const source = readApp(PRICE_HISTORY_PANEL_PATH);
  assert.match(source, /^"use client"/m, "PriceHistoryPanel must be a client component");
  for (const rangeLabel of ["3M", "6M", "1Y"]) {
    assert.match(source, new RegExp(escapeRegExp(rangeLabel)), `must render the ${rangeLabel} range chip`);
  }
  assert.match(source, /<svg\s+viewBox=/, "must render an <svg> with a fixed viewBox (no layout shift)");
  assert.match(source, /sold_at/, "range filtering must key off the real sold_at field");
});

test("PriceHistoryPanel.tsx renders a latest-sales table from real rows with formatThb and an up/down arrow", () => {
  const source = readApp(PRICE_HISTORY_PANEL_PATH);
  assert.match(source, /<table\s+className="mp-sales"/, "must render the mp-sales table");
  assert.match(source, /formatThb\(/, "sale prices must render via the shared formatThb helper");
  assert.match(source, /trend-up/, "must render the trend-up icon for an increase");
  assert.match(source, /trend-down/, "must render the trend-down icon for a decrease");
  assert.match(
    source,
    /grade_value\s*\?\?\s*(row\.)?condition_bucket|row\.grade_value/,
    "grade badge must derive from the real grade_value/condition_bucket fields",
  );
});

test("PriceHistoryPanel.tsx renders an empty note when there are zero price-history rows", () => {
  const source = readApp(PRICE_HISTORY_PANEL_PATH);
  assert.match(source, /Not enough sales yet/, "must render an empty-state note when filteredRows is empty");
});

test("ReportListingButton.tsx is a client component that POSTs to the report route with the 5 real reason codes", () => {
  const source = readApp(REPORT_BUTTON_PATH);
  assert.match(source, /^"use client"/m, "ReportListingButton must be a client component");
  assert.match(source, /listingId/, "must accept a listingId prop");
  assert.match(
    source,
    /fetch\(\s*`\/api\/marketplace\/listings\/\$\{listingId\}\/report`/,
    "must POST to /api/marketplace/listings/[listingId]/report",
  );
  assert.match(source, /method:\s*["']POST["']/, "must use method: POST");
  assert.match(
    source,
    /["']idempotency-key["']/,
    "must send the idempotency-key header matching marketplaceIdempotencyKey()'s primary header name",
  );
  assert.match(source, /crypto\.randomUUID\(\)/, "must generate a fresh idempotency key per request");
  assert.match(source, /reasonCode/, "must send reasonCode in the request body");
  assert.match(source, /reasonNote/, "must send reasonNote in the request body");
  assert.match(source, /res(ponse)?\.ok/, "must check response.ok");
  assert.match(source, /record\.ok\s*!==\s*true|record\.ok/, "must check the JSON ok field");
  assert.match(source, /401/, "must handle the 401 unauthenticated case with a login link");

  for (const reasonCode of [
    "fake_or_cert_mismatch",
    "stolen_photos",
    "wrong_item",
    "pricing_abuse",
    "other",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(reasonCode)), `must offer the ${reasonCode} reason option`);
  }
});

test("ReportListingButton.tsx's reason codes match the real report route's REPORT_REASON_CODES exactly", () => {
  const routeSource = readApp(REPORT_ROUTE_PATH);
  const buttonSource = readApp(REPORT_BUTTON_PATH);
  const codeMatches = [
    ...routeSource.matchAll(/"([a-z_]+)"/g),
  ].map((match) => match[1]);
  const routeCodes = new Set(
    codeMatches.filter((code) =>
      ["fake_or_cert_mismatch", "stolen_photos", "wrong_item", "pricing_abuse", "other"].includes(code),
    ),
  );
  assert.equal(routeCodes.size, 5, "sanity check: the real report route must define exactly 5 reason codes");
  for (const code of routeCodes) {
    assert.match(buttonSource, new RegExp(escapeRegExp(code)), `ReportListingButton must offer reason code ${code}`);
  }
});

test("ReportListingButton.tsx matches the real idempotency header name used by marketplaceIdempotencyKey()", () => {
  const guardSource = readApp(REQUEST_GUARD_PATH);
  const buttonSource = readApp(REPORT_BUTTON_PATH);
  assert.match(
    guardSource,
    /request\.headers\.get\("idempotency-key"\)/,
    "sanity check: marketplaceIdempotencyKey must still read the idempotency-key header first",
  );
  assert.match(buttonSource, /"idempotency-key"/, "ReportListingButton must send the same header name");
});
