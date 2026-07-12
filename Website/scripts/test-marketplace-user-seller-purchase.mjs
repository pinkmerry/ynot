import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628120000_marketplace_user_seller_purchase.sql",
);
const forbiddenCoreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260628120000_marketplace_user_seller_purchase.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

function compactFunctionBody(source, functionName) {
  const start = source.indexOf(`create or replace function public.${functionName}`);
  assert.notEqual(start, -1, `missing function body for ${functionName}`);
  const nextFunction = source.indexOf("create or replace function public.", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

function assertCentralMutationGuard(source, relPath) {
  const mutationGuard = readApp("src/lib/marketplace/mutation-guard.ts");
  assert.match(source, /prepareMarketplaceMutation/, `${relPath} must use the centralized mutation guard`);
  assert.match(mutationGuard, /resolveCurrentProfile/, "central mutation guard must resolve YNOTT login");
  assert.match(mutationGuard, /ownerOnlyMarketplaceAccess/, "central mutation guard must keep owner-only prelaunch gate");
  assert.match(mutationGuard, /enforceSameOriginMutation/, "central mutation guard must enforce same origin");
  assert.match(mutationGuard, /enforceRateLimit/, "central mutation guard must rate-limit");
  assert.match(mutationGuard, /marketplaceIdempotencyKey/, "central mutation guard must require idempotency by default");
  assert.match(mutationGuard, /readMarketplaceJsonBody/, "central mutation guard must use JSON allowlists");
  assert.match(mutationGuard, /marketplaceRequestHash/, "central mutation guard must hash requests");
}

const ynotRoutes = [
  "src/app/api/ynot/marketplace/checkout/user-seller/route.ts",
  "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts",
  "src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/activate/route.ts",
  "src/app/api/ynot/marketplace/admin/seller-payouts/route.ts",
  "src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/release/route.ts",
  "src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/paid/route.ts",
  "src/app/api/ynot/marketplace/seller/sales/route.ts",
];

const aliases = [
  "src/app/api/marketplace/checkout/user-seller/route.ts",
  "src/app/api/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts",
  "src/app/api/marketplace/admin/seller-consignments/[submissionId]/activate/route.ts",
  "src/app/api/marketplace/admin/seller-payouts/route.ts",
  "src/app/api/marketplace/admin/seller-payouts/[payoutId]/release/route.ts",
  "src/app/api/marketplace/admin/seller-payouts/[payoutId]/paid/route.ts",
  "src/app/api/marketplace/seller/sales/route.ts",
];

test("package exposes the scoped marketplace user-seller purchase test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-user-seller-purchase"],
    "node --test scripts/test-marketplace-user-seller-purchase.mjs",
  );
});

test("user-seller purchase migration is separate, service-role only, and indexed for payout queues", () => {
  assert.ok(existsSync(migrationPath), "missing user-seller purchase marketplace migration");
  assert.ok(
    !existsSync(forbiddenCoreMigrationPath),
    "user-seller purchase migration must not live in the core YNOTT Supabase stream",
  );

  const sql = compactSql(readMigration());
  requirePattern(sql, /create table if not exists public\.marketplace_seller_payouts\b/);
  requirePattern(sql, /seller_fee_satang integer not null check \(seller_fee_satang >= 0\)/);
  requirePattern(sql, /payout_amount_satang integer not null check \(payout_amount_satang >= 0\)/);
  requirePattern(sql, /payout_state text not null default 'held'/);
  requirePattern(sql, /alter table public\.marketplace_seller_payouts enable row level security/);
  requirePattern(sql, /revoke all on[\s\S]*public\.marketplace_seller_payouts[\s\S]*from public, anon, authenticated/);
  requirePattern(sql, /grant all on[\s\S]*public\.marketplace_seller_payouts[\s\S]*to service_role/);
  requirePattern(sql, /marketplace_seller_payouts_queue_idx/);
  requirePattern(sql, /marketplace_seller_payouts_seller_idx/);
  requirePattern(sql, /marketplace_listing_user_seller_active_idx/);
  requirePattern(sql, /marketplace_orders_user_seller_payout_idx/);
});

test("user-seller RPCs enforce activation guards, self-purchase rejection, payout hold, and owner payout release", () => {
  const sql = compactSql(readMigration());
  for (const rpc of [
    "marketplace_admin_activate_seller_listing",
    "marketplace_create_user_seller_pending_payment_order",
    "marketplace_release_user_seller_pending_payment_order",
    "marketplace_release_seller_payout",
    "marketplace_mark_seller_payout_paid",
  ]) {
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}\\b`), `missing ${rpc}`);
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*security definer[\\s\\S]*set search_path = public, pg_temp`), `${rpc} must lock search_path`);
    requirePattern(sql, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`), `${rpc} must revoke browser execution`);
    requirePattern(sql, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to service_role`), `${rpc} must grant service_role execution`);
  }

  requirePattern(sql, /p_admin_role not in \('owner', 'admin', 'staff'\)/);
  requirePattern(sql, /p_admin_role <> 'owner'/, "payout release/paid must be owner-only");
  requirePattern(sql, /submission_row\.status <> 'inspection_passed'/);
  requirePattern(sql, /source_kind = 'seller_consignment'/);
  requirePattern(sql, /listing_source = 'user_seller'/);
  requirePattern(sql, /seller_marketplace_account_id = p_buyer_marketplace_account_id/);
  requirePattern(sql, /marketplace_self_purchase_rejected/);
  requirePattern(sql, /for update/);
  requirePattern(sql, /seller_payout_satang := inventory_row\.item_price_satang - seller_fee_satang/);
  requirePattern(sql, /buyer_total_satang/, "buyer total must remain separate from payout");
  requirePattern(sql, /shippingfeesatang', p_shipping_fee_satang/);
  requirePattern(sql, /buyerservicefeesatang', service_fee_satang/);
  requirePattern(sql, /sellerpayoutsatang', seller_payout_satang/);
  requirePattern(sql, /insert into public\.marketplace_seller_payouts/);
  requirePattern(sql, /payout_state\s*=\s*'held'/);
  requirePattern(sql, /marketplace_user_seller_pending_payment_order_created/);
  requirePattern(sql, /marketplace_user_seller_pending_payment_order_released/);
  requirePattern(sql, /seller_payout_state = 'cancelled'/);
  requirePattern(sql, /payout_state = 'cancelled'/);
  requirePattern(sql, /marketplace_seller_payout_released/);
  requirePattern(sql, /marketplace_seller_payout_paid/);
  requirePattern(sql, /seller_payout\.release/);
  requirePattern(sql, /seller_payout\.paid/);
  requirePattern(sql, /order_row\.payment_state <> 'paid'/);
  requirePattern(sql, /order_row\.fulfilment_state not in \('shipped', 'completed'\)/);
  requirePattern(sql, /order_row\.refund_state <> 'none'/);
  requirePattern(sql, /order_row\.seller_payout_state <> 'released'/);
  requirePattern(sql, /has_open_reconciliation/);
  requirePattern(
    compactFunctionBody(sql, "marketplace_mark_seller_payout_paid"),
    /declare[\s\S]*has_open_reconciliation boolean := false;[\s\S]*begin[\s\S]*into has_open_reconciliation/,
    "paid-payout RPC must declare the reconciliation guard it writes into",
  );
});

test("user-seller server modules expose safe checkout, activation, payout queue, and seller sales APIs", () => {
  for (const relPath of [
    "src/lib/marketplace/orders.ts",
    "src/lib/marketplace/listings.ts",
    "src/lib/marketplace/seller-consignment.ts",
    "src/lib/marketplace/payouts.ts",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /import "server-only"/, `${relPath} must be server-only`);
  }

  const orders = readApp("src/lib/marketplace/orders.ts");
  assert.match(orders, /createUserSellerPendingPaymentOrder/);
  assert.match(orders, /marketplace_create_user_seller_pending_payment_order/);
  assert.match(orders, /releaseMarketplacePendingPaymentOrder/);
  assert.match(orders, /releaseUserSellerPendingPaymentOrder/);
  assert.match(orders, /marketplace_release_user_seller_pending_payment_order/);
  assert.match(orders, /pendingOrder\.listing_source === "user_seller"/);
  assert.match(orders, /submitMarketplacePaymentProof/);
  assert.match(orders, /getBuyerPendingPaymentOrder/);
  assert.match(orders, /getActiveMarketplaceMoneyPolicy/);
  assert.match(orders, /p_shipping_fee_satang: moneyPolicy\.shippingFeeSatang/);
  assert.match(orders, /p_buyer_service_fee_bps: moneyPolicy\.buyerServiceFeeBps/);
  assert.match(orders, /p_shipping_snapshot: input\.shippingSnapshot/);
  assert.match(orders, /sellerFeeBps/);
  assert.match(orders, /sanitizeBuyerPayload\(result\.data\)/);
  assert.doesNotMatch(orders, /seller_marketplace_account_id/);

  const listings = readApp("src/lib/marketplace/listings.ts");
  assert.match(listings, /listMarketplaceListings/);
  assert.match(listings, /getMarketplaceListing/);
  assert.match(listings, /listing_source/);
  assert.doesNotMatch(listings, /seller_payout|private_admin|provider|buyer_/i);

  const consignment = readApp("src/lib/marketplace/seller-consignment.ts");
  assert.match(consignment, /activateSellerConsignmentListing/);
  assert.match(consignment, /marketplace_admin_activate_seller_listing/);
  assert.match(consignment, /listSellerSales/);
  assert.doesNotMatch(consignment, /buyer_marketplace_account_id|proof_storage_path|provider_response/);

  const payouts = readApp("src/lib/marketplace/payouts.ts");
  assert.match(payouts, /listSellerPayoutQueue/);
  assert.match(payouts, /releaseSellerPayout/);
  assert.match(payouts, /markSellerPayoutPaid/);
  assert.match(payouts, /marketplace_release_seller_payout/);
  assert.match(payouts, /marketplace_mark_seller_payout_paid/);
  assert.doesNotMatch(payouts, /proof_storage_path|provider_response|buyer_marketplace_account_id/);
});

test("user-seller routes keep owner-only prelaunch gate, same-origin mutations, rate limits, idempotency, and aliases", () => {
  for (const relPath of ynotRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    if (relPath.endsWith("seller-payouts/route.ts") || relPath.endsWith("seller/sales/route.ts")) {
      assert.match(source, /ownerOnlyMarketplaceAccess/, `${relPath} must keep owner-only prelaunch gate`);
      assert.match(source, /resolveCurrentProfile/, `${relPath} must resolve YNOTT login`);
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
    } else {
      assertCentralMutationGuard(source, relPath);
      assert.doesNotMatch(source, /requireIdempotency:\s*false/, `${relPath} mutation must require idempotency`);
      assert.match(source, /mutation\.requestHash|mutation\.emptyRequestHash/, `${relPath} mutation must hash requests`);
    }
    assert.doesNotMatch(source, /seller_marketplace_account_id|buyer_marketplace_account_id|actor_ynot_profile_id/);
  }

  for (const relPath of aliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /@\/app\/api\/ynot\/marketplace/);
  }
});

test("buyer/detail/admin UI surfaces user-seller checkout and payout queue without private data", () => {
  const detail = readApp("src/app/(store)/marketplace/listings/[listingId]/page.tsx");
  const detailComponent = readApp("src/features/ynot/MarketplaceListingDetailPage.tsx");
  const stickyBar = readApp("src/features/ynot/MarketplaceStickyCommerceBar.tsx");
  assert.match(detail, /MarketplaceListingDetailPage/);
  assert.match(detailComponent, /\/api\/marketplace\/checkout\/user-seller/);
  assert.match(detailComponent, /listing\.listing_source/);
  assert.match(detailComponent, /Seller consignment|Official shop/);
  assert.match(detailComponent, /MarketplaceListingGallery/);
  assert.match(detailComponent, /id="marketplace-checkout"/);
  assert.match(stickyBar, /marketplace-listing-action-bar/);
  assert.match(detailComponent, /Buy now/);
  assert.doesNotMatch(detail, /seller_payout|provider_response|proof_storage_path|buyer_marketplace_account_id/i);
  assert.doesNotMatch(detailComponent, /seller_payout|provider_response|proof_storage_path|buyer_marketplace_account_id/i);

  // MarketplaceCheckoutClient.tsx was retired by the marketplace-ui redesign
  // (the listing checkout section now renders CheckoutFlow — see
  // test-marketplace-ui-checkout.mjs for the full contract coverage).
  const checkoutFlow = readApp("src/features/marketplace-ui/checkout/CheckoutFlow.tsx");
  assert.match(checkoutFlow, /checkoutEndpoint/);
  assert.match(checkoutFlow, /user-seller/);

  const adminPage = readApp("src/app/admin/marketplace/page.tsx");
  const opsSnapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  assert.match(adminPage, /buildMarketplaceOpsSnapshot/);
  assert.match(opsSnapshot, /listSellerPayoutQueue/);
  // Admin shell + overview redesign (see test-marketplace-ui-admin-shell.mjs):
  // the inline "Seller payout queue" table moved off this page -- a later
  // task rebuilds a dedicated payouts screen (AdminShell already has a
  // "Seller payouts" nav entry at /admin/marketplace/payouts). The
  // overview's queue summary list still surfaces the payout-blocked count,
  // and this page still wires the real MarketplaceMoneyPolicyControls
  // (shipping fee + buyer service fee editor) as the fees panel.
  const overviewScreen = readApp("src/features/marketplace-ui/admin/OverviewScreen.tsx");
  const moneyPolicyControls = readApp("src/features/ynot/MarketplaceMoneyPolicyControls.tsx");
  assert.match(adminPage, /MarketplaceMoneyPolicyControls/);
  assert.match(overviewScreen, /queueSummary\.payoutBlockedCount/);
  assert.match(moneyPolicyControls, /Shipping THB/);
  assert.match(moneyPolicyControls, /buyerServiceFeeBps/);
  assert.doesNotMatch(adminPage, /provider_response|proof_storage_path|buyer_marketplace_account_id/i);
});

test("mock listing details include multiple uploaded images for buyer review", () => {
  const gallery = readApp("src/features/ynot/MarketplaceListingGallery.tsx");
  assert.match(gallery, /"use client"/);
  assert.match(gallery, /useState/);
  assert.match(gallery, /Uploaded item photos/);
  assert.match(gallery, /previousPhoto/);
  assert.match(gallery, /nextPhoto/);
  assert.match(gallery, /Previous item photo/);
  assert.match(gallery, /Next item photo/);
  assert.match(gallery, /marketplace-listing-thumbnail/);

  const mockData = readApp("src/lib/marketplace/mock-data.ts");
  assert.match(mockData, /MOCK_CARD_PHOTOS/);
  assert.match(mockData, /photoUrls: MOCK_CARD_PHOTOS/);
  assert.match(
    mockData,
    /photo_urls: \[\s*"\/test-assets\/ynot-test-card-blue\.svg",\s*"\/test-assets\/ynot-test-card-gold\.svg",\s*"\/test-assets\/ynot-test-pack-pokemon\.svg",\s*\]/,
  );

  const css = readApp("src/app/globals.css");
  assert.match(css, /\.marketplace-listing-gallery/);
  assert.match(css, /\.marketplace-listing-action-bar[\s\S]*position: fixed/);
});
