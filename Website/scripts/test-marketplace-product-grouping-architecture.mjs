import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260629180000_marketplace_product_browse_read_model.sql",
);
const productDetailReadModelMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630123000_marketplace_product_detail_read_model.sql",
);
const filterCountsMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630124500_marketplace_browse_filter_counts.sql",
);

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function readApp(relPath) {
  assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
  return readFileSync(appPath(relPath), "utf8");
}

function compact(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ");
}

function compactLower(source) {
  return compact(source).toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.ok(pattern.test(source), label);
}

function hasPattern(source, pattern) {
  return pattern.test(source);
}

function functionBodySnippet(source, functionName) {
  const start = source.search(new RegExp(`function\\s+${functionName}\\b`));
  if (start === -1) return "";
  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) return "";

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}

function marketplaceBrowseExecuteGrantRoleLists(sql) {
  const grantPattern =
    /grant\s+execute\s+on\s+function\s+public\.marketplace_browse_product_markets\b[^;]*?\bto\s+([^;]+);/g;
  return Array.from(sql.matchAll(grantPattern), (match) =>
    match[1]
      .split(",")
      .map((role) =>
        role
          .trim()
          .replace(/^only\s+/, "")
          .replaceAll('"', "")
          .split(/\s+/)[0],
      )
      .filter(Boolean),
  );
}

test("package exposes product grouping architecture test", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-product-grouping"],
    "node --test scripts/test-marketplace-product-grouping-architecture.mjs",
  );
});

test("database exposes service-role product browse rpc with performance indexes", () => {
  assert.ok(existsSync(migrationPath), "missing product browse migration");
  const sql = compactLower(readFileSync(migrationPath, "utf8"));

  requirePattern(sql, /create extension if not exists pg_trgm/, "missing trigram search extension");
  requirePattern(sql, /marketplace_products_search_trgm_idx/, "missing product search index");
  requirePattern(
    sql,
    /marketplace_listing_product_active_browse_idx/,
    "missing active product listing index",
  );
  requirePattern(
    sql,
    /marketplace_price_history_product_recent_idx/,
    "missing recent price history index",
  );
  requirePattern(
    sql,
    /create or replace function public\.marketplace_browse_product_markets/,
    "missing browse RPC",
  );
  requirePattern(sql, /security definer/, "browse RPC must be security definer");
  requirePattern(sql, /set search_path = public, pg_temp/, "browse RPC must lock search_path");
  requirePattern(
    sql,
    /revoke all on function public\.marketplace_browse_product_markets/,
    "browse RPC must revoke public execute",
  );
  requirePattern(
    sql,
    /grant execute on function public\.marketplace_browse_product_markets/,
    "browse RPC must grant execute",
  );
  const executeGrantRoleLists = marketplaceBrowseExecuteGrantRoleLists(sql);
  assert.ok(executeGrantRoleLists.length > 0, "browse RPC must include execute grants");
  assert.ok(
    executeGrantRoleLists.some((roles) => roles.includes("service_role")),
    "browse RPC execute grant must target service_role",
  );
  const forbiddenExecuteRoles = new Set(["anon", "authenticated", "public"]);
  const forbiddenGrantedRoles = executeGrantRoleLists
    .flat()
    .filter((role) => forbiddenExecuteRoles.has(role));
  assert.deepEqual(
    forbiddenGrantedRoles,
    [],
    "browse RPC must not grant execute to browser or public roles",
  );
});

test("product browse module owns RPC call, cursor, and mock grouping", () => {
  const source = readApp("src/lib/marketplace/product-browse.ts");
  assert.ok(existsSync(filterCountsMigrationPath), "missing browse filter counts migration");
  const filterCountsSql = compactLower(readFileSync(filterCountsMigrationPath, "utf8"));

  requirePattern(source, /MarketplaceProductBrowseSummary/, "missing browse summary type");
  requirePattern(source, /listMarketplaceProductBrowsePage/, "missing browse page loader");
  requirePattern(
    source,
    /\.rpc\s*\(\s*["']marketplace_browse_product_markets["']/,
    "missing RPC call",
  );
  requirePattern(source, /encodeProductBrowseCursor/, "missing cursor encoder");
  requirePattern(source, /decodeProductBrowseCursor/, "missing cursor decoder");
  requirePattern(
    source,
    /\.rpc\s*\(\s*["']marketplace_browse_filter_counts["']/,
    "filter counts must use the single filter count RPC",
  );
  requirePattern(
    filterCountsSql,
    /create or replace function public\.marketplace_browse_filter_counts/,
    "missing filter count RPC",
  );
  requirePattern(filterCountsSql, /security definer/, "filter count RPC must be security definer");
  requirePattern(
    filterCountsSql,
    /grant execute on function public\.marketplace_browse_filter_counts\(\) to service_role/,
    "filter count RPC must grant execute only to service role",
  );
  requirePattern(source, /mockMarketplaceListings/, "mock mode must group existing listing data");
  requirePattern(source, /productSlug/, "mock grouping must use product slug identity");
});

test("public routes expose product browse through canonical and alias APIs", () => {
  for (const relPath of [
    "src/app/api/ynot/marketplace/products/route.ts",
    "src/app/api/marketplace/products/route.ts",
  ]) {
    assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
  }

  const canonical = readApp("src/app/api/ynot/marketplace/products/route.ts");
  requirePattern(canonical, /listMarketplaceProductBrowsePage/, "canonical route must call product browse loader");
  requirePattern(canonical, /marketplaceQueryPlanFromUrl/, "canonical route must use allowlisted query parser");
  requirePattern(canonical, /publicMarketplaceAccess/, "canonical route must preserve public access gate");
  requirePattern(canonical, /enforceRateLimit/, "canonical route must rate limit reads");
  requirePattern(canonical, /Cache-Control/, "canonical route must set explicit cache header");

  const alias = readApp("src/app/api/marketplace/products/route.ts");
  requirePattern(alias, /api\/ynot\/marketplace\/products\/route/, "alias must re-export canonical route");
});

test("marketplace page renders product browse cards instead of listing snapshots", () => {
  const page = readApp("src/app/(store)/marketplace/page.tsx");
  const components = readApp("src/features/ynot/components.tsx");
  const filterControls = readApp("src/features/ynot/MarketplaceFilterControls.tsx");
  const productBrowse = readApp("src/lib/marketplace/product-browse.ts");

  requirePattern(page, /listMarketplaceProductBrowsePage/, "page must load grouped product browse data");
  requirePattern(
    page,
    /listMarketplaceProductBrowseFilterCounts/,
    "page must load grouped browse filter counts",
  );
  assert.doesNotMatch(
    page,
    /listMarketplaceListings\(listingQuery\)/,
    "page must not load listing cards for browse grid",
  );
  requirePattern(components, /marketplaceProducts/, "component props must use products");
  requirePattern(components, /lowest_price_satang/, "cards must show from price");
  requirePattern(components, /active_listing_count/, "cards must show listing count");
  requirePattern(components, /filterCounts=\{filterCounts\}/, "page component must pass filter counts");
  requirePattern(
    components,
    /\/marketplace\/products\/\$\{product\.product_slug\}/,
    "cards must link to product page",
  );
  requirePattern(components, /View prices/, "CTA copy must explain product-market action");
  requirePattern(
    productBrowse,
    /listMarketplaceProductBrowseFilterCounts/,
    "product browse module must expose grouped filter counts",
  );
  requirePattern(filterControls, /key:\s*"raw"/, "filters must include Raw");
  requirePattern(filterControls, /countSuffix/, "filter chips must render count suffixes");
});

test("product detail queries listings by product id in the database", () => {
  const listings = readApp("src/lib/marketplace/listings.ts");
  const productMarket = readApp("src/lib/marketplace/product-market.ts");

  requirePattern(listings, /productId\?: string/, "listing query must accept productId");
  requirePattern(
    listings,
    /options\.productId[\s\S]{0,800}(assertUuid|UUID_RE\.test|marketplace_product_id_invalid|product_id_invalid)/,
    "listing query must validate productId before filtering",
  );
  requirePattern(
    listings,
    /\.eq\s*\(\s*["']product_id["']\s*,[\s\S]{0,160}(productId|options\.productId)/,
    "listing query must filter product_id in database",
  );
  requirePattern(
    listings,
    /getMarketplaceListing[\s\S]*projectPublicListingSnapshot/,
    "single listing detail reads must pass through the public projection",
  );
  requirePattern(
    listings,
    /condition: string \| null[\s\S]*grade: string \| null[\s\S]*inStockOnly: boolean/,
    "listing cursors must bind all active filter dimensions",
  );
  requirePattern(
    listings,
    /payload\.condition !== \(options\.condition \?\? null\)[\s\S]*payload\.grade !== \(options\.grade \?\? null\)[\s\S]*payload\.inStockOnly !== Boolean\(options\.inStockOnly\)/,
    "listing cursors must reject reuse across changed condition, grade, or in-stock filters",
  );
  requirePattern(
    listings,
    /isStrictIsoTimestamp\(payload\.visibleFrom\)/,
    "listing cursor visible_from must be validated before PostgREST filter interpolation",
  );
  requirePattern(productMarket, /productId: product\.id/, "product market must pass product id to listing query");
  assert.doesNotMatch(
    productMarket,
    /listingPage\.listings\.filter\(\(listing\) => listing\.product_id === product\.id\)/,
    "product market must not filter generic listing pages in memory",
  );
});

test("public projection exposes browse summaries without seller private fields", () => {
  const projection = readApp("src/lib/marketplace/public-projection.ts");
  requirePattern(projection, /projectPublicProductBrowseSummary/, "missing browse projection");
  const browseProjection = functionBodySnippet(projection, "projectPublicProductBrowseSummary");
  assert.notEqual(browseProjection, "", "missing browse projection body");
  assert.doesNotMatch(
    compact(browseProjection),
    /seller_marketplace_account_id|ynot_profile_id|sellerPayout|privateAdminNote|procurementNote/,
    "public browse projection must not expose private marketplace fields",
  );
});

test("mock data contains duplicate listings for one product slug", () => {
  const mockData = readApp("src/lib/marketplace/mock-data.ts");
  assert.ok(
    hasPattern(mockData, /const mockZoroListings/),
    "mock browse must keep a named Zoro product listing fixture",
  );
  assert.ok(
    hasPattern(mockData, /productSlug:\s*"eb02-001-roronoa-zoro"/) &&
      hasPattern(mockData, /Array\.from\(\{\s*length:\s*10\s*\}/) &&
      hasPattern(mockData, /listingId:\s*"12121212-1212-4121-8121-121212121212"/),
    "mock browse must prove many listings group into one Zoro product",
  );
  assert.ok(
    hasPattern(mockData, /mockMarketplaceProductBrowsePage|groupMarketplaceListingsByProductSlug|groupListingsByProductSlug/),
    "mock browse must expose a named product grouping helper",
  );
  assert.ok(
    hasPattern(mockData, /active_listing_count/) &&
      hasPattern(mockData, /lowest_price_satang/) &&
      hasPattern(mockData, /product_slug/),
    "mock browse must return product summaries rather than raw listing rows",
  );
});

test("product detail variant filters expose active market counts", () => {
  const mockData = readApp("src/lib/marketplace/mock-data.ts");
  const productMarket = readApp("src/lib/marketplace/product-market.ts");
  const component = readApp("src/features/ynot/MarketplaceProductPage.tsx");
  const projection = readApp("src/lib/marketplace/public-projection.ts");
  const productDetailReadModel = compactLower(
    readFileSync(productDetailReadModelMigrationPath, "utf8"),
  );

  requirePattern(
    mockData,
    /Array\.from\(\{\s*length:\s*10\s*\}/,
    "Zoro mock market must include ten PSA 10 offers",
  );
  requirePattern(
    mockData,
    /Array\.from\(\{\s*length:\s*3\s*\}/,
    "Zoro mock market must include three generated raw offers plus two fixed raw offers",
  );
  requirePattern(productMarket, /activeVariantCounts/, "product market must compute variant counts");
  requirePattern(
    productMarket,
    /active_listing_count:\s*counts\.get/,
    "mock product variants must carry active listing counts",
  );
  requirePattern(
    productMarket,
    /marketplace_get_product_market_detail/,
    "production product variants must load through the product detail read model",
  );
  requirePattern(
    productDetailReadModel,
    /'active_listing_count', coalesce\(listing_counts\.active_listing_count, 0\)/,
    "product detail read model must expose per-variant active listing counts",
  );
  requirePattern(
    productDetailReadModel,
    /left join lateral \([\s\S]*sum\(listing\.quantity_available_snapshot\)[\s\S]*listing_counts on true/,
    "product detail read model must compute active listing counts from public listing snapshots",
  );
  requirePattern(
    projection,
    /active_listing_count:\s*Number/,
    "variant projection must expose numeric active listing counts",
  );
  requirePattern(
    component,
    /count:\s*variant\.active_listing_count/,
    "variant chips must use variant active listing counts",
  );
  requirePattern(
    component,
    /<small>\{filter\.count\}<\/small>/,
    "variant chips must render visible counts",
  );
});
