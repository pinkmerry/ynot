import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628100000_marketplace_official_shop.sql",
);
const adminControlsMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628150000_marketplace_official_admin_controls.sql",
);
const forbiddenCoreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260628100000_marketplace_official_shop.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return [
    readFileSync(migrationPath, "utf8"),
    readFileSync(adminControlsMigrationPath, "utf8"),
  ].join("\n");
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
  "src/app/api/ynot/marketplace/admin/official-inventory/route.ts",
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts",
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/publish/route.ts",
  "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts",
  "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/route.ts",
  "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/hide/route.ts",
  "src/app/api/ynot/marketplace/listings/route.ts",
  "src/app/api/ynot/marketplace/listings/[listingId]/route.ts",
  "src/app/api/ynot/marketplace/checkout/official/route.ts",
  "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts",
  "src/app/api/ynot/marketplace/orders/route.ts",
  "src/app/api/ynot/marketplace/admin/official-orders/[orderId]/payment/route.ts",
  "src/app/api/ynot/marketplace/admin/official-orders/[orderId]/fulfilment/route.ts",
  "src/app/api/ynot/marketplace/admin/official-orders/[orderId]/refund/route.ts",
];

const marketplaceAliases = [
  "src/app/api/marketplace/admin/official-inventory/route.ts",
  "src/app/api/marketplace/admin/official-inventory/[inventoryId]/route.ts",
  "src/app/api/marketplace/admin/official-inventory/[inventoryId]/publish/route.ts",
  "src/app/api/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts",
  "src/app/api/marketplace/admin/official-listings/[listingId]/route.ts",
  "src/app/api/marketplace/admin/official-listings/[listingId]/hide/route.ts",
  "src/app/api/marketplace/listings/route.ts",
  "src/app/api/marketplace/listings/[listingId]/route.ts",
  "src/app/api/marketplace/checkout/official/route.ts",
  "src/app/api/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  "src/app/api/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts",
  "src/app/api/marketplace/orders/route.ts",
  "src/app/api/marketplace/admin/official-orders/[orderId]/payment/route.ts",
  "src/app/api/marketplace/admin/official-orders/[orderId]/fulfilment/route.ts",
  "src/app/api/marketplace/admin/official-orders/[orderId]/refund/route.ts",
];

test("package exposes the scoped marketplace official shop test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-official-shop"],
    "node --test scripts/test-marketplace-official-shop.mjs",
  );
});

test("official shop migration stays in the separate Marketplace Supabase stream and creates required schema", () => {
  assert.ok(existsSync(migrationPath), "missing official shop marketplace migration");
  assert.ok(
    existsSync(adminControlsMigrationPath),
    "missing official shop admin controls marketplace migration",
  );
  assert.ok(
    !existsSync(forbiddenCoreMigrationPath),
    "official shop migration must not live in the core YNOTT Supabase stream",
  );

  const sql = compactSql(readMigration());

  for (const table of [
    "marketplace_pending_payment_orders",
    "marketplace_orders",
    "marketplace_payment_proofs",
    "marketplace_refund_requests",
    "marketplace_reconciliation_items",
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
  }

  requirePattern(sql, /seller_type text not null default 'user_seller'/);
  requirePattern(sql, /seller_type = 'official_shop'/);
  requirePattern(sql, /source_kind = 'official_stock'/);
  requirePattern(sql, /p_item_type not in \('card', 'sealed_box', 'sealed_pack'\)/);
  requirePattern(sql, /quantity_available integer not null default 1/);
  requirePattern(sql, /quantity_available <= quantity_total/);
  requirePattern(sql, /currency text not null default 'thb'/);
  requirePattern(sql, /seller_payout_state text not null default 'not_applicable'/);
  requirePattern(sql, /listing_source = 'official_shop' and listing_state = 'active'/);
  requirePattern(sql, /marketplace_public_listing_snapshots/);
  requirePattern(sql, /snapshot_payload - 'privateadminnote' - 'procurementnote' - 'sellerpayoutstate'/);
  requirePattern(sql, /marketplace_listing_official_active_idx/);
  requirePattern(sql, /marketplace_pending_orders_state_expiry_idx/);
  requirePattern(sql, /marketplace_orders_admin_state_idx/);
  requirePattern(sql, /marketplace_payment_proofs_pending_status_idx/);
  requirePattern(sql, /marketplace_payment_proofs_reference_idx/);
  requirePattern(sql, /marketplace_payment_proofs_decoded_qr_idx/);
  requirePattern(sql, /insert into storage\.buckets/);
  assert.doesNotMatch(
    sql,
    /references public\.(gacha|customer_bag|reward|wallet|draw)/,
    "official shop must not foreign-key to gacha/customer bag/reward state",
  );
});

test("official shop RPCs are fixed-search-path service-role commands with idempotency and audit", () => {
  const sql = compactSql(readMigration());

  for (const rpc of [
    "marketplace_create_official_inventory",
    "marketplace_update_official_inventory",
    "marketplace_publish_official_listing",
    "marketplace_update_official_listing",
    "marketplace_archive_official_inventory",
    "marketplace_hide_official_listing",
    "marketplace_create_pending_payment_order",
    "marketplace_submit_official_payment_proof",
    "marketplace_record_official_payment_result",
    "marketplace_release_pending_payment_order",
    "marketplace_record_official_fulfilment",
    "marketplace_create_official_refund",
  ]) {
    requirePattern(
      sql,
      new RegExp(`create or replace function public\\.${rpc}\\b`),
      `missing ${rpc}`,
    );
    requirePattern(
      sql,
      new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp`),
      `${rpc} must lock search_path`,
    );
    requirePattern(
      sql,
      new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`),
      `${rpc} must revoke browser role execution`,
    );
    requirePattern(
      sql,
      new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to service_role`),
      `${rpc} must grant service_role execution`,
    );
  }

  for (const scope of [
    "official_inventory.create",
    "official_inventory.update",
    "official_listing.publish",
    "official_listing.update",
    "official_inventory.archive",
    "official_listing.hide",
    "pending_order.create",
    "payment_proof.submit",
    "official_order.payment_result",
    "pending_order.release",
    "official_order.fulfilment",
    "official_order.refund",
  ]) {
    requirePattern(sql, new RegExp(scope.replace(".", "\\.")), `missing idempotency scope ${scope}`);
  }

  requirePattern(sql, /for update/, "checkout/admin commands must lock rows");
  requirePattern(sql, /quantity_available = quantity_available - p_quantity/);
  requirePattern(sql, /quantity_available = least\(quantity_total, quantity_available \+ pending_row\.quantity\)/);
  requirePattern(sql, /marketplace_official_payment_proof_submitted/);
  requirePattern(sql, /marketplace_official_payment_result_recorded/);
  requirePattern(sql, /marketplace_official_pending_payment_order_released/);
  requirePattern(sql, /sellerpayoutsatang', 0/);
  requirePattern(sql, /marketplace_official_pending_payment_order_created/);
  requirePattern(sql, /marketplace_official_order_fulfilled/);
  requirePattern(sql, /marketplace_official_refund_requested/);
  requirePattern(sql, /marketplace_official_inventory_updated/);
  requirePattern(sql, /marketplace_official_listing_updated/);
  requirePattern(sql, /marketplace_official_inventory_archived/);
  requirePattern(sql, /marketplace_official_listing_hidden/);
  requirePattern(sql, /marketplace_official_active_pending_order_exists/);
  requirePattern(sql, /marketplace_official_active_order_exists/);
  requirePattern(sql, /marketplace_reconciliation_items/);
  requirePattern(sql, /p_admin_role not in \('owner', 'admin', 'staff'\)/);
  requirePattern(sql, /p_admin_role <> 'owner'/);
  requirePattern(sql, /and account\.ynot_profile_id = p_buyer_ynot_profile_id/);
  requirePattern(sql, /and account\.buyer_status = 'active'/);
  requirePattern(sql, /coalesce\(p_reference_snapshot, '\{\}'::jsonb\)::text ~\* '\(customer_bag\|gacha\|reward\|draw\)'/);
  requirePattern(sql, /marketplace_payment_evidence_required/);
  requirePattern(sql, /p_provider_amount_satang <> order_row\.buyer_total_satang/);
  requirePattern(sql, /manualpaymentproviderreference/);
  requirePattern(sql, /jsonb_array_length\(coalesce\(inventory_row\.photo_urls, '\[\]'::jsonb\)\) < 1/);

  const fulfilmentFunction = sql.slice(
    sql.indexOf("create or replace function public.marketplace_record_official_fulfilment"),
    sql.indexOf("create or replace function public.marketplace_create_official_refund"),
  );
  requirePattern(fulfilmentFunction, /and payment_state = 'paid'/);
  assert.doesNotMatch(
    fulfilmentFunction,
    /payment_state\s*=\s*case when payment_state = 'pending_payment' then 'paid'/,
    "fulfilment must not mark pending payments as paid",
  );
});

test("official shop modules validate allowed item types, official stock only, and service-role backend use", () => {
  for (const relPath of [
    "src/lib/marketplace/official-shop.ts",
    "src/lib/marketplace/listings.ts",
    "src/lib/marketplace/orders.ts",
    "src/lib/marketplace/route-utils.ts",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /import "server-only"/, `${relPath} must be server-only`);
  }

  const officialShop = readApp("src/lib/marketplace/official-shop.ts");
  assert.match(officialShop, /"card"/);
  assert.match(officialShop, /"sealed_box"/);
  assert.match(officialShop, /"sealed_pack"/);
  assert.match(officialShop, /customer_bag\|gacha\|reward\|draw/i);
  assert.match(officialShop, /marketplace_create_official_inventory/);
  assert.match(officialShop, /marketplace_update_official_inventory/);
  assert.match(officialShop, /marketplace_publish_official_listing/);
  assert.match(officialShop, /marketplace_update_official_listing/);
  assert.match(officialShop, /marketplace_archive_official_inventory/);
  assert.match(officialShop, /marketplace_hide_official_listing/);
  assert.match(officialShop, /getOfficialInventoryDetail/);
  assert.match(officialShop, /marketplace_record_official_payment_result/);
  assert.match(officialShop, /marketplace_record_official_fulfilment/);
  assert.match(officialShop, /marketplace_create_official_refund/);
  assert.match(officialShop, /listOfficialOrderDashboard/);
  assert.doesNotMatch(officialShop, /seller_marketplace_account_id|sellerPayoutSatang|seller_payout_satang/);

  const listings = readApp("src/lib/marketplace/listings.ts");
  assert.match(listings, /marketplace_public_listing_snapshots/);
  assert.match(listings, /listOfficialListings/);
  assert.match(listings, /listing\.listing_source === "official_shop"/);
  assert.doesNotMatch(listings, /procurement|private_admin|seller_payout/i);

  const orders = readApp("src/lib/marketplace/orders.ts");
  assert.match(orders, /marketplace_create_pending_payment_order/);
  assert.match(orders, /marketplace_submit_marketplace_payment_proof/);
  assert.match(orders, /marketplace_release_pending_payment_order/);
  assert.match(orders, /getActiveMarketplaceMoneyPolicy/);
  assert.match(orders, /p_shipping_fee_satang: moneyPolicy\.shippingFeeSatang/);
  assert.match(orders, /p_buyer_service_fee_bps: moneyPolicy\.buyerServiceFeeBps/);
  assert.match(orders, /p_shipping_snapshot: input\.shippingSnapshot/);
  assert.match(orders, /sellerFeeBps/);
  assert.match(orders, /sanitizeBuyerPayload\(result\.data\)/);
  assert.match(orders, /buyer_total_satang/);
});

test("official shop routes enforce launch, auth, same-origin mutations, rate limits, idempotency, and JSON allowlists", () => {
  for (const relPath of ynotRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    if (relPath.includes("/listings/")) {
      assert.match(source, /publicMarketplaceAccess/, `${relPath} must allow public browse outside owner-only prelaunch`);
    } else if (!source.includes("prepareMarketplaceMutation")) {
      assert.match(source, /ownerOnlyMarketplaceAccess/, `${relPath} must keep owner-only prelaunch gate`);
      assert.match(source, /resolveCurrentProfile/, `${relPath} must resolve YNOTT login`);
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
    }

    const publicReadRoute =
      relPath === "src/app/api/ynot/marketplace/listings/route.ts" ||
      relPath === "src/app/api/ynot/marketplace/listings/[listingId]/route.ts" ||
      relPath === "src/app/api/ynot/marketplace/orders/route.ts";

    if (!publicReadRoute) {
      assertCentralMutationGuard(source, relPath);
      assert.doesNotMatch(source, /requireIdempotency:\s*false/, `${relPath} mutation must require idempotency`);
      if (relPath.includes("payment-proof")) {
        assert.match(source, /readBody: false/, `${relPath} proof upload must let the route parse multipart form data`);
        assert.match(source, /multipart\/form-data/, `${relPath} proof upload must require multipart form data`);
        assert.match(source, /verifyImageMagicBytes/, `${relPath} proof upload must verify image magic bytes`);
        assert.match(source, /verifySlipWithSlip2Go/, `${relPath} proof upload must use Slip2Go verification`);
        assert.match(source, /findLiveDuplicateSlip/, `${relPath} proof upload must cross-check core payment_slips duplicates`);
        assert.match(source, /createServiceSupabaseClient/, `${relPath} proof upload must use the core YNOTT service client for duplicate checks`);
        assert.match(source, /submitMarketplacePaymentProof|submitOfficialPaymentProof/, `${relPath} proof upload must call proof helper`);
      } else {
        assert.match(source, /allowedFields:/, `${relPath} mutation must use JSON allowlist`);
      }
      assert.match(source, /mutation\.(requestHash|requestHashForBody|emptyRequestHash)/, `${relPath} mutation must hash requests`);
    }

    assert.doesNotMatch(
      source,
      /seller_marketplace_account_id|sellerPayoutSatang|seller_payout_satang|buyer_marketplace_account_id|actor_ynot_profile_id/,
      `${relPath} must not accept trusted actor/buyer/seller/payout fields from the browser`,
    );
  }

  for (const relPath of marketplaceAliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(
      readApp(relPath),
      /@\/app\/api\/ynot\/marketplace/,
      `${relPath} should re-export the guarded YNOT marketplace route`,
    );
  }

  const createRoute = readApp("src/app/api/ynot/marketplace/admin/official-inventory/route.ts");
  assert.match(createRoute, /"itemType"/);
  assert.match(createRoute, /"quantityTotal"/);
  assert.match(createRoute, /"itemPriceSatang"/);
  assert.match(createRoute, /"procurementNote"/);
  assert.doesNotMatch(createRoute, /seller|payout|buyer/i);

  const archiveRoute = readApp("src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts");
  assert.match(archiveRoute, /OFFICIAL_INVENTORY_ARCHIVE_FIELDS/);
  assert.match(archiveRoute, /archiveOfficialInventory/);
  assert.match(archiveRoute, /official_inventory\.archive/);

  const updateRoute = readApp("src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts");
  assert.match(updateRoute, /getOfficialInventoryDetail/);
  assert.match(updateRoute, /OFFICIAL_INVENTORY_UPDATE_FIELDS/);
  assert.match(updateRoute, /updateOfficialInventory/);
  assert.match(updateRoute, /official_inventory\.update/);
  assert.doesNotMatch(updateRoute, /seller_marketplace_account_id|sellerPayoutSatang|seller_payout_satang|buyer_marketplace_account_id|actor_ynot_profile_id/);

  const listingUpdateRoute = readApp("src/app/api/ynot/marketplace/admin/official-listings/[listingId]/route.ts");
  assert.match(listingUpdateRoute, /OFFICIAL_LISTING_UPDATE_FIELDS/);
  assert.match(listingUpdateRoute, /updateOfficialListing/);
  assert.match(listingUpdateRoute, /official_listing\.update/);
  assert.doesNotMatch(listingUpdateRoute, /itemPriceSatang|seller_marketplace_account_id|sellerPayoutSatang|seller_payout_satang|buyer_marketplace_account_id|actor_ynot_profile_id/);

  const hideRoute = readApp("src/app/api/ynot/marketplace/admin/official-listings/[listingId]/hide/route.ts");
  assert.match(hideRoute, /OFFICIAL_LISTING_HIDE_FIELDS/);
  assert.match(hideRoute, /hideOfficialListing/);
  assert.match(hideRoute, /official_listing\.hide/);

  const checkoutRoute = readApp("src/app/api/ynot/marketplace/checkout/official/route.ts");
  assert.match(checkoutRoute, /ensureMarketplaceAccountForProfile/);
  assert.match(checkoutRoute, /"listingId"/);
  assert.doesNotMatch(checkoutRoute, /shippingFee|buyerServiceFee|buyerTotal|seller/i);

  const paymentRoute = readApp("src/app/api/ynot/marketplace/admin/official-orders/[orderId]/payment/route.ts");
  assert.match(paymentRoute, /"paymentState"/);
  assert.match(paymentRoute, /"providerReference"/);
  assert.match(paymentRoute, /"providerAmountSatang"/);
  assert.match(paymentRoute, /"providerCurrency"/);
  assert.match(paymentRoute, /recordOfficialPaymentResult/);

  const releaseRoute = readApp("src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts");
  assert.match(releaseRoute, /"releaseReason"/);
  assert.match(releaseRoute, /releaseMarketplacePendingPaymentOrder/);
  assert.match(releaseRoute, /pending_order\.release\.marketplace/);
});

test("marketplace page renders official and user-seller product markets with THB pricing and no coin or seller payout wording", () => {
  const page = readApp("src/app/(store)/marketplace/page.tsx");
  assert.match(page, /listMarketplaceProductBrowsePage/);
  // The browse redesign renders BrowsePage with the browse read-model rows
  // (was: MarketplaceExperience's marketplaceProducts prop).
  assert.match(page, /products=\{marketplaceProductPage\.products\}/);
  assert.doesNotMatch(page, /listMarketplaceListings/);

  const component = readApp("src/features/ynot/components.tsx");
  assert.match(component, /Official shop/);
  assert.match(component, /Official Shop/);
  assert.match(component, /User Sellers/);
  assert.match(component, /marketplaceThb/);
  assert.match(component, /lowest_price_satang/);
  assert.match(component, /active_listing_count/);
  assert.match(component, /\/marketplace\/products\/\$\{product\.product_slug\}/);
  const marketplaceSection = component.slice(
    component.indexOf("type MarketplaceCapabilityStatus"),
    component.indexOf("/** Series essentials section"),
  );
  assert.doesNotMatch(marketplaceSection, /CoinMark/);
  assert.doesNotMatch(marketplaceSection, /seller payout/i);
  assert.doesNotMatch(marketplaceSection, />Payout</i);

  const detailPage = readApp("src/app/(store)/marketplace/listings/[listingId]/page.tsx");
  const detailComponent = readApp("src/features/ynot/MarketplaceListingDetailPage.tsx");
  assert.match(detailPage, /getMarketplaceListing/);
  assert.match(detailPage, /MarketplaceListingDetailPage/);
  // The listing checkout section now renders CheckoutFlow (marketplace-ui
  // redesign) instead of the old MarketplaceCheckoutClient — see
  // scripts/test-marketplace-ui-checkout.mjs for the full redesign contract
  // coverage. checkoutEndpoint is still computed here and passed straight
  // through, so the official/user-seller routes stay asserted.
  assert.match(detailComponent, /CheckoutFlow/);
  assert.match(detailComponent, /\/api\/marketplace\/checkout\/official/);
  assert.match(detailComponent, /\/api\/marketplace\/checkout\/user-seller/);
  assert.doesNotMatch(
    detailPage,
    /config\.ownerOnly \?[^:]+:\s*viewer\.isAdmin/s,
    "listing detail must allow signed-in users when owner-only mode is disabled",
  );

  const paymentProofClient = readApp("src/features/ynot/MarketplacePaymentProofClient.tsx");
  assert.match(paymentProofClient, /payment-proof/);
  assert.match(paymentProofClient, /Service fee/);
  assert.match(paymentProofClient, /Shipping/);

  const adminDashboard = readApp("src/app/admin/marketplace/page.tsx");
  const opsSnapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  assert.match(adminDashboard, /buildMarketplaceOpsSnapshot/);
  assert.match(opsSnapshot, /listOfficialOrderDashboard/);
  assert.match(opsSnapshot, /marketplaceAdminAllowed && !config\.mockData/);
  assert.match(adminDashboard, /Paid revenue/);
  assert.match(adminDashboard, /Payment review/);
});
