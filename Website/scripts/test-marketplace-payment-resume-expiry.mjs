import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function readApp(relPath) {
  return readFileSync(appPath(relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(repoPath(relPath), "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

test("buyer can see bank-transfer instructions and resume slip upload from order detail", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-payment-resume-expiry"],
    "node --test scripts/test-marketplace-payment-resume-expiry.mjs",
  );

  assert.ok(
    existsSync(appPath("src/features/ynot/MarketplacePaymentProofClient.tsx")),
    "payment proof panel must be reusable outside listing checkout state",
  );
  assert.ok(
    existsSync(appPath("src/lib/marketplace/payment-instructions.ts")),
    "bank-transfer instructions must come from a server-side marketplace module",
  );

  const panel = readApp("src/features/ynot/MarketplacePaymentProofClient.tsx");
  assert.match(panel, /Bank transfer/i);
  assert.match(panel, /accountName/);
  assert.match(panel, /accountNumber/);
  assert.match(panel, /paymentProof/);
  assert.match(panel, /\/api\/marketplace\/checkout\/pending-orders\/\$\{order\.pendingPaymentOrderId\}\/payment-proof/);
  assert.match(panel, /\/api\/marketplace\/checkout\/pending-orders\/\$\{order\.pendingPaymentOrderId\}\/release/);

  const checkoutClient = readApp("src/features/ynot/MarketplaceCheckoutClient.tsx");
  assert.match(checkoutClient, /MarketplacePaymentProofClient/);
  assert.match(checkoutClient, /paymentInstructions/);

  const listingDetail = readApp("src/features/ynot/MarketplaceListingDetailPage.tsx");
  assert.match(listingDetail, /paymentInstructions/);

  const listingRoute = readApp("src/app/(store)/marketplace/listings/[listingId]/page.tsx");
  assert.match(listingRoute, /getMarketplacePaymentInstructions/);

  const orderDetail = readApp("src/app/(store)/marketplace/orders/[orderId]/page.tsx");
  assert.match(orderDetail, /MarketplacePaymentProofClient/);
  assert.match(orderDetail, /getMarketplacePaymentInstructions/);
  assert.match(orderDetail, /pending_payment_order_id/);
  assert.match(orderDetail, /pendingPaymentOrderId/);
  assert.match(orderDetail, /payment_state === "pending_payment"/);
});

test("expired pending bank-transfer orders are released by a service-role cron path", () => {
  const migrationRelPath =
    "Database/marketplace-supabase/migrations/20260630143000_marketplace_pending_order_expiry.sql";
  assert.ok(existsSync(repoPath(migrationRelPath)), "missing pending order expiry migration");

  const sql = compactSql(readRepo(migrationRelPath));
  assert.match(sql, /create or replace function public\.marketplace_expire_pending_payment_orders/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public, pg_temp/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /expires_at <= now\(\)/);
  assert.match(sql, /order_state = 'pending_payment'/);
  assert.doesNotMatch(
    sql,
    /order_state in \('pending_payment', 'payment_submitted'\)/,
    "cron expiry must not cancel orders already waiting for slip review",
  );
  assert.match(sql, /marketplace_listing_snapshots/);
  assert.match(sql, /quantity_available_snapshot/);
  assert.match(sql, /marketplace_inventory_items/);
  assert.match(sql, /quantity_available/);
  assert.match(sql, /order_state = 'expired'/);
  assert.match(sql, /payment_state = 'failed'/);
  assert.match(sql, /seller_payout_state = case[\s\S]*then 'cancelled'/);
  assert.match(sql, /marketplace_audit_events/);
  assert.match(
    sql,
    /revoke all on function public\.marketplace_expire_pending_payment_orders[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.marketplace_expire_pending_payment_orders[\s\S]*to service_role/,
  );

  const ordersModule = readApp("src/lib/marketplace/orders.ts");
  assert.match(ordersModule, /expireMarketplacePendingPaymentOrders/);
  assert.match(ordersModule, /marketplace_expire_pending_payment_orders/);

  const routeRelPath =
    "src/app/api/ynot/marketplace/checkout/pending-orders/expire/route.ts";
  assert.ok(existsSync(appPath(routeRelPath)), "missing internal expiry API route");
  const route = readApp(routeRelPath);
  assert.match(route, /MARKETPLACE_PENDING_ORDER_EXPIRY_SECRET/);
  assert.match(route, /authorization/i);
  assert.match(route, /expireMarketplacePendingPaymentOrders/);
  assert.doesNotMatch(route, /resolveCurrentProfile|ownerOnlyMarketplaceAccess/);

  const aliasRelPath =
    "src/app/api/marketplace/checkout/pending-orders/expire/route.ts";
  assert.ok(existsSync(appPath(aliasRelPath)), "missing expiry API alias");
  assert.match(readApp(aliasRelPath), /@\/app\/api\/ynot\/marketplace/);

  const worker = readApp("bulk-open-worker.ts");
  const marketplaceScheduledJobs = readApp(
    "src/lib/worker/marketplace-scheduled-jobs.ts",
  );
  assert.match(worker, /runMarketplaceScheduledJobs/);
  assert.match(marketplaceScheduledJobs, /expireMarketplacePendingPaymentOrders/);
  assert.match(marketplaceScheduledJobs, /marketplace_expire_pending_payment_orders/);
  assert.match(marketplaceScheduledJobs, /MARKETPLACE_ENVIRONMENT/);
  assert.match(marketplaceScheduledJobs, /MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(marketplaceScheduledJobs, /p_limit: 100/);
  assert.doesNotMatch(
    marketplaceScheduledJobs,
    /import\s+["']server-only["']|require\(["']server-only["']\)/,
  );
  assert.doesNotMatch(marketplaceScheduledJobs, /BULK_OPEN_QUEUE/);

  const marketplaceWrangler = readApp("wrangler.marketplace.jsonc");
  const marketplaceWranglerCi = readApp("wrangler.marketplace.ci.jsonc");
  assert.match(marketplaceWrangler, /"triggers"\s*:\s*\{[\s\S]*"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/);
  assert.match(marketplaceWranglerCi, /"triggers"\s*:\s*\{[\s\S]*"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/);
});

test("payment proof upload rejects expired pending orders before file storage or Slip2Go", () => {
  const route = readApp(
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  );
  assert.match(route, /marketplace_pending_order_expired/);
  assert.match(route, /pendingOrder\.expires_at/);
  assert.match(route, /pendingOrder\.order_state === "pending_payment"/);

  const expiryGuardIndex = route.indexOf("marketplace_pending_order_expired");
  assert.ok(expiryGuardIndex > 0, "missing expired-order guard");
  assert.ok(
    expiryGuardIndex < route.indexOf("request.formData()"),
    "expired-order guard must run before multipart parsing",
  );
  assert.ok(
    expiryGuardIndex < route.indexOf(".upload(storagePath"),
    "expired-order guard must run before storage upload",
  );
  assert.ok(
    expiryGuardIndex < route.indexOf("await verifySlipWithSlip2Go"),
    "expired-order guard must run before Slip2Go verification",
  );
});

test("buyer checkout and payment routes use customer marketplace access", () => {
  for (const relPath of [
    "src/app/api/ynot/marketplace/checkout/official/route.ts",
    "src/app/api/ynot/marketplace/checkout/user-seller/route.ts",
    "src/app/api/ynot/marketplace/checkout/pending-orders/route.ts",
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/release/route.ts",
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  ]) {
    const source = readApp(relPath);
    assert.match(source, /prepareMarketplaceMutation/);
    assert.match(source, /accessMode:\s*"customer"/, `${relPath} must use customer access`);
  }

  for (const relPath of [
    "src/app/api/ynot/marketplace/checkout/pending-orders/route.ts",
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/route.ts",
  ]) {
    const source = readApp(relPath);
    assert.match(source, /customerMarketplaceAccess/);
    assert.doesNotMatch(
      source,
      /ownerOnlyMarketplaceAccess/,
      `${relPath} must not use owner/admin-only access for buyer reads`,
    );
  }
});
