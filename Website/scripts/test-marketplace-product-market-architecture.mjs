import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql",
);
const detailReadModelMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630123000_marketplace_product_detail_read_model.sql",
);
const forbiddenCoreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260629160000_marketplace_product_market.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

test("package exposes the product market architecture test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-product-market"],
    "node --test scripts/test-marketplace-product-market-architecture.mjs",
  );
});

test("product market migration lives only in the Marketplace Supabase stream", () => {
  assert.ok(existsSync(migrationPath), "missing product market marketplace migration");
  assert.ok(
    !existsSync(forbiddenCoreMigrationPath),
    "product market migration must not live in the core YNOTT Supabase stream",
  );

  const sql = compactSql(readFileSync(migrationPath, "utf8"));
  for (const table of [
    "marketplace_products",
    "marketplace_product_variants",
    "marketplace_price_history_points",
  ]) {
    requirePattern(
      sql,
      new RegExp(`create table if not exists public\\.${table}\\b`),
      `missing ${table}`,
    );
    requirePattern(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} must enable RLS`,
    );
    requirePattern(
      sql,
      new RegExp(`grant all on[\\s\\S]*public\\.${table}[\\s\\S]*to service_role`),
      `${table} must be service-role owned`,
    );
    requirePattern(
      sql,
      new RegExp(`revoke all on[\\s\\S]*public\\.${table}[\\s\\S]*from public, anon, authenticated`),
      `${table} must revoke browser-role table access`,
    );
  }

  requirePattern(sql, /alter table public\.marketplace_inventory_items[\s\S]*product_id uuid/);
  requirePattern(sql, /alter table public\.marketplace_listing_snapshots[\s\S]*variant_id uuid/);
  requirePattern(sql, /marketplace_products_slug_idx/);
  requirePattern(sql, /marketplace_variants_product_idx/);
  requirePattern(sql, /marketplace_listing_product_active_idx/);
  requirePattern(sql, /marketplace_price_history_product_idx/);
  requirePattern(sql, /marketplace_record_price_history_for_order/);
  requirePattern(sql, /marketplace_orders_record_price_history_after_paid/);
});

test("product detail read model RPC collapses product page fanout", () => {
  assert.ok(
    existsSync(detailReadModelMigrationPath),
    "missing product detail read model marketplace migration",
  );

  const sql = compactSql(readFileSync(detailReadModelMigrationPath, "utf8"));
  requirePattern(sql, /marketplace_get_product_market_detail/);
  requirePattern(sql, /returns jsonb/);
  requirePattern(sql, /least\(greatest\(coalesce\(p_limit, 24\), 1\), 50\)/);
  requirePattern(sql, /marketplace_public_product_markets/);
  requirePattern(sql, /marketplace_public_listing_snapshots/);
  requirePattern(sql, /marketplace_price_history_points/);
  requirePattern(sql, /jsonb_build_object\([^)]*'product'/);
  requirePattern(sql, /revoke all on function public\.marketplace_get_product_market_detail/);
  requirePattern(sql, /grant execute on function public\.marketplace_get_product_market_detail/);
  assert.doesNotMatch(
    sql,
    /marketplace_account_id|buyer_marketplace_account_id|seller_marketplace_account_id|email|phone|address|payout|admin_note|idempotency_key|request_hash/,
    "product detail read model must not project private account, contact, payout, or request fields",
  );
});

test("public projection uses allowlists and blocks private marketplace keys", () => {
  const projection = readApp("src/lib/marketplace/public-projection.ts");
  requirePattern(projection, /PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS/);
  requirePattern(projection, /PUBLIC_PRODUCT_METADATA_KEYS/);
  requirePattern(projection, /PUBLIC_PRICE_HISTORY_KEYS/);
  requirePattern(projection, /projectPublicListingSnapshot/);
  requirePattern(projection, /projectPublicProductMarket/);
  requirePattern(projection, /projectPublicVariant/);
  requirePattern(projection, /projectPublicPriceHistoryPoint/);
  assert.doesNotMatch(
    projection,
    /sellerPayoutState|sellerPayoutSatang|privateAdminNote|procurementNote/,
    "private keys must not be allowlisted",
  );
});

test("query plan owns typed market filters instead of q-string chips", () => {
  const queryPlan = readApp("src/lib/marketplace/query-plan.ts");
  requirePattern(queryPlan, /MarketplaceConditionBucket/);
  requirePattern(queryPlan, /MarketplaceGradeBucket/);
  requirePattern(queryPlan, /MarketplaceProductSort/);
  requirePattern(queryPlan, /marketplaceQueryPlanFromUrl/);
  requirePattern(queryPlan, /marketplaceQueryPlanToSearchParams/);
  requirePattern(queryPlan, /condition/);
  requirePattern(queryPlan, /grade/);
  requirePattern(queryPlan, /inStockOnly/);

  const components = readApp("src/features/ynot/components.tsx");
  assert.doesNotMatch(
    components,
    /case "psa10":[\s\S]*params\.set\("q", "psa 10"\)/,
    "PSA 10 filter must use typed grade params, not q text",
  );
  const marketplacePage = readApp("src/app/(store)/marketplace/page.tsx");
  requirePattern(
    marketplacePage,
    /query\.grade === "psa_10"/,
    "Marketplace browse page must restore PSA10 active state from typed grade param",
  );
});

test("product market read module exposes product, listing, and price-history views", () => {
  const productMarket = readApp("src/lib/marketplace/product-market.ts");
  requirePattern(productMarket, /getMarketplaceProductMarket/);
  requirePattern(productMarket, /listMarketplaceProductListings/);
  requirePattern(productMarket, /listMarketplaceProductPriceHistory/);
  requirePattern(productMarket, /marketplace_get_product_market_detail/);
  requirePattern(productMarket, /\.rpc\("marketplace_get_product_market_detail"/);
  requirePattern(productMarket, /marketplace_price_history_points/);
  requirePattern(productMarket, /projectPublicListingSnapshot/);
  requirePattern(productMarket, /projectPublicProductMarket/);
  requirePattern(productMarket, /projectPublicVariant/);
  requirePattern(productMarket, /projectPublicPriceHistoryPoint/);

  const mockData = readApp("src/lib/marketplace/mock-data.ts");
  requirePattern(mockData, /mockMarketplaceProductMarket/);
  requirePattern(mockData, /product_slug: "pikachu-gem-mint-promo"/);
  requirePattern(mockData, /priceHistory/);
});

test("product market API routes expose canonical and alias reads", () => {
  for (const relPath of [
    "src/app/api/ynot/marketplace/products/[productSlug]/route.ts",
    "src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts",
    "src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts",
    "src/app/api/marketplace/products/[productSlug]/route.ts",
    "src/app/api/marketplace/products/[productSlug]/listings/route.ts",
    "src/app/api/marketplace/products/[productSlug]/price-history/route.ts",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }

  const productRoute = readApp("src/app/api/ynot/marketplace/products/[productSlug]/route.ts");
  requirePattern(productRoute, /getMarketplaceProductMarket/);
  requirePattern(productRoute, /marketplaceQueryPlanFromUrl/);
  requirePattern(productRoute, /publicMarketplaceAccess/);
  requirePattern(productRoute, /enforceRateLimit/);

  const listingsRoute = readApp(
    "src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts",
  );
  requirePattern(listingsRoute, /listMarketplaceProductListings/);

  const historyRoute = readApp(
    "src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts",
  );
  requirePattern(historyRoute, /listMarketplaceProductPriceHistory/);

  const aliasRoute = readApp("src/app/api/marketplace/products/[productSlug]/route.ts");
  requirePattern(aliasRoute, /api\/ynot\/marketplace\/products\/\[productSlug\]\/route/);
});

test("product market page implements the SNKRDUNK-inspired product-first UI anatomy", () => {
  for (const relPath of [
    "src/app/(store)/marketplace/products/[productSlug]/page.tsx",
    "src/features/ynot/MarketplaceProductPage.tsx",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }

  const presentation = readApp("src/features/ynot/MarketplaceProductPage.tsx");
  for (const pattern of [
    /marketplace-product-gallery/,
    /marketplace-product-thumbnails/,
    /marketplace-variant-chip/,
    /marketplace-product-listing-tile/,
    /marketplace-product-ribbon/,
    /marketplace-product-grade/,
    /Recent Sales Data/,
    /marketplace-history-gate/,
    /Related Variants/,
    /Item Description/,
    /marketplace-product-sticky-bar/,
    /See more offers|View all offers/,
  ]) {
    requirePattern(presentation, pattern, `missing UI marker ${pattern}`);
  }

  const page = readApp("src/app/(store)/marketplace/products/[productSlug]/page.tsx");
  requirePattern(page, /getMarketplaceProductMarket/);
  requirePattern(page, /marketplaceQueryPlanFromUrl/);
  requirePattern(page, /selectedGrade/);
  requirePattern(presentation, /grade\?\.startsWith\("raw_"\)[\s\S]*params\.set\("condition", grade\)/);
  requirePattern(presentation, /href=\{`\/marketplace\/products\/\$\{market\.product\.product_slug\}`\}/);
  assert.doesNotMatch(
    presentation,
    /marketplace-product-primary-action[\s\S]{0,260}source=official_shop/,
    "sticky See All CTA must not force the official shop filter",
  );

  const css = readApp("src/app/globals.css");
  requirePattern(css, /\.marketplace-product-gallery/);
  requirePattern(css, /\.marketplace-product-listings[\s\S]*grid-template-columns: repeat\(5/);
  requirePattern(css, /\.marketplace-product-sticky-bar[\s\S]*position: fixed/);
});

test("marketplace listing cards link to Product Market when product slug exists", () => {
  const components = readApp("src/features/ynot/components.tsx");
  requirePattern(components, /snapshot_payload:\s*\{[\s\S]*productSlug\?: string/);
  requirePattern(components, /\/marketplace\/products\/\$\{productSlug\}/);
  requirePattern(components, /\/marketplace\/listings\/\$\{item\.listing_id\}/);
});

test("marketplace verifiers cover product market and public projection", () => {
  const schemaVerifier = readApp("tools/verification/verify-marketplace-schema.mjs");
  const hardeningVerifier = readApp("tools/verification/verify-marketplace-hardening.mjs");
  const traceVerifier = readApp("tools/verification/verify-marketplace-doc-traceability.mjs");

  requirePattern(schemaVerifier, /marketplace_products/);
  requirePattern(schemaVerifier, /marketplace_product_variants/);
  requirePattern(schemaVerifier, /marketplace_price_history_points/);
  requirePattern(schemaVerifier, /marketplace_record_price_history_for_order/);
  requirePattern(hardeningVerifier, /projectPublicListingSnapshot/);
  requirePattern(hardeningVerifier, /PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS/);
  requirePattern(hardeningVerifier, /PUBLIC_PRICE_HISTORY_KEYS/);
  requirePattern(traceVerifier, /src\/lib\/marketplace\/product-market\.ts/);
  requirePattern(traceVerifier, /products\/\[productSlug\]/);
});
