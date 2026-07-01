import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requireSource(source, pattern, label = String(pattern)) {
  assert.match(source, pattern, label);
}

test("package exposes the customer cart RPC guard", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-customer-cart"],
    "node --test scripts/test-marketplace-customer-cart-rpc.mjs",
  );
});

test("domain language names the customer cart concepts", () => {
  const context = readRepo("CONTEXT.md");
  requireSource(context, /\*\*Marketplace Cart\*\*/);
  requireSource(context, /\*\*Marketplace Watchlist\*\*/);
  requireSource(context, /\*\*Marketplace Cart Summary\*\*/);
  assert.doesNotMatch(
    context,
    /Marketplace Cart[\s\S]{0,500}Customer Bag sell action/,
  );
});

test("customer cart migration defines RPC contracts and grants", () => {
  assert.ok(existsSync(migrationPath), "missing customer cart RPC migration");
  const sql = compactSql(readFileSync(migrationPath, "utf8"));
  for (const rpc of [
    "marketplace_list_customer_cart",
    "marketplace_get_customer_cart_summary",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_list_customer_watchlist",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
  ]) {
    requireSource(
      sql,
      new RegExp(`create or replace function public\\.${rpc}\\b`),
      `missing ${rpc}`,
    );
    requireSource(
      sql,
      new RegExp(`revoke all on function public\\.${rpc}`),
      `${rpc} must revoke public execution`,
    );
    requireSource(
      sql,
      new RegExp(`grant execute on function public\\.${rpc}`),
      `${rpc} must grant service execution`,
    );
  }
  requireSource(sql, /security definer/);
  requireSource(sql, /set search_path = public, pg_temp/);
  requireSource(sql, /marketplace_require_customer_account/);
  requireSource(sql, /marketplace_idempotency_keys/);
  requireSource(sql, /marketplace_audit_events/);
  requireSource(sql, /marketplace_cart_items_buyer_listing_idx/);
  requireSource(sql, /marketplace_watchlist_items_buyer_listing_idx/);
  requireSource(sql, /from public\.marketplace_listing_snapshots[\s\S]{0,220}for update/);
  assert.doesNotMatch(
    sql,
    /from public\.marketplace_public_listing_snapshots[\s\S]{0,220}for update/,
    "mutating RPCs must lock the base listing table, not the public active-only view",
  );
});

test("cart-watchlist live adapter uses RPCs and not direct table writes", () => {
  const source = readApp("src/lib/marketplace/cart-watchlist.ts");
  for (const rpc of [
    "marketplace_list_customer_cart",
    "marketplace_get_customer_cart_summary",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_list_customer_watchlist",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
  ]) {
    requireSource(source, new RegExp(`\\.rpc\\("${rpc}"`), `missing ${rpc} client call`);
  }
  assert.doesNotMatch(
    source,
    /\.from\("marketplace_cart_items"\)|\.from\("marketplace_watchlist_items"\)/,
    "cart-watchlist live path must not access cart/watchlist tables directly",
  );
});

test("customer cart UI modules exist and update visible state", () => {
  for (const relPath of [
    "src/features/ynot/MarketplaceCartProvider.tsx",
    "src/features/ynot/MarketplaceCartDrawer.tsx",
    "src/features/ynot/MarketplaceHeaderActions.tsx",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
  const provider = readApp("src/features/ynot/MarketplaceCartProvider.tsx");
  requireSource(provider, /useMarketplaceCart/);
  requireSource(provider, /refreshCartSummary/);
  requireSource(provider, /\/api\/marketplace\/cart\/summary/);
  requireSource(provider, /openCartDrawer/);
  requireSource(provider, /cartCount/);

  const listingActions = readApp("src/features/ynot/MarketplaceListingActionsClient.tsx");
  requireSource(listingActions, /useMarketplaceCart/);
  requireSource(listingActions, /openCartDrawer/);
  requireSource(listingActions, /View cart/);

  const hasRouteLayout = existsSync(path.join(appRoot, "src/app/(store)/marketplace/layout.tsx"));
  const hasSharedShell = existsSync(path.join(appRoot, "src/features/ynot/MarketplaceShell.tsx"));
  assert.ok(hasRouteLayout || hasSharedShell, "marketplace cart provider must live in shared marketplace chrome");
});

test("cart payloads avoid private marketplace identifiers", () => {
  const clientPayloadSources = [
    "src/features/ynot/MarketplaceCartProvider.tsx",
    "src/features/ynot/MarketplaceCartDrawer.tsx",
    "src/features/ynot/MarketplaceHeaderActions.tsx",
    "src/features/ynot/MarketplaceListingActionsClient.tsx",
    "src/features/ynot/MarketplaceCartWatchlistClient.tsx",
  ];
  for (const forbidden of [
    "seller_marketplace_account_id",
    "sellerMarketplaceAccountId",
    "buyer_marketplace_account_id",
    "buyerMarketplaceAccountId",
    "ynot_profile_id",
    "ynotProfileId",
    "request_hash",
    "requestHash",
    "idempotency_key",
    "idempotencyKey",
    "emailAddress",
    "phoneNumber",
    "shippingAddress",
    "payout",
    "private_admin_note",
    "privateAdminNote",
    "snapshotPayload",
    "snapshot_payload",
  ]) {
    for (const relPath of clientPayloadSources) {
      const source = readApp(relPath);
      assert.doesNotMatch(
        source,
        new RegExp(forbidden, "i"),
        `${relPath} leaked ${forbidden}`,
      );
    }
  }

  for (const relPath of [
    "src/app/api/ynot/marketplace/cart/items/route.ts",
    "src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts",
    "src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts",
  ]) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /request_hash\s*:/, `${relPath} must not return request_hash`);
    assert.doesNotMatch(source, /idempotency_key\s*:/, `${relPath} must not return idempotency_key`);
  }
});

test("plan documents button to API/RPC/database wiring", () => {
  const plan = readRepo("docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md");
  for (const phrase of [
    "Button To API/RPC Wiring Matrix",
    "HTTP API Contract",
    "RPC To Table Contract",
    "Listing detail `Add to cart` button",
    "Listing detail `Watch listing` button",
    "Mini-cart row `Remove` button",
    "Watchlist row `Remove` button",
    "Header `Cart` icon/button",
    "GET /api/ynot/marketplace/cart",
    "GET /api/ynot/marketplace/cart/summary",
    "GET /api/ynot/marketplace/watchlist",
    "POST /api/ynot/marketplace/cart/items",
    "DELETE /api/ynot/marketplace/cart/items/[listingId]",
    "POST /api/ynot/marketplace/watchlist/items/[listingId]",
    "DELETE /api/ynot/marketplace/watchlist/items/[listingId]",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
    "marketplace_cart_items",
    "marketplace_watchlist_items",
  ]) {
    requireSource(
      plan,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `plan wiring missing ${phrase}`,
    );
  }
});
