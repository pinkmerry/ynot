import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260704125000_marketplace_user_seller_payment_result.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

test("package exposes the scoped marketplace user-seller payment result test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-user-seller-payment-result"],
    "node --test scripts/test-marketplace-user-seller-payment-result.mjs",
  );
});

test("migration defines marketplace_record_user_seller_payment_result as a fixed-search-path service-role command", () => {
  const sql = compactSql(readMigration());

  assert.match(
    sql,
    /create or replace function public\.marketplace_record_user_seller_payment_result\b/,
  );
  assert.match(
    sql,
    /create or replace function public\.marketplace_record_user_seller_payment_result[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/,
  );
  assert.match(
    sql,
    /revoke all on function public\.marketplace_record_user_seller_payment_result\(uuid, text, text, text, uuid, text, text, text, integer, text, text\)\s*from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.marketplace_record_user_seller_payment_result\(uuid, text, text, text, uuid, text, text, text, integer, text, text\)\s*to service_role/,
  );
});

test("rpc reproduces the official admin-command guard skeleton (owner-only, payment_state, evidence, idempotency)", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /p_admin_profile_id is null or p_admin_role <> 'owner'/);
  assert.match(sql, /raise exception 'marketplace_admin_required'/);
  assert.match(sql, /normalized_payment_state not in \('paid', 'failed'\)/);
  assert.match(sql, /raise exception 'marketplace_payment_result_invalid'/);
  assert.match(sql, /raise exception 'marketplace_provider_amount_invalid'/);
  assert.match(sql, /raise exception 'marketplace_provider_currency_invalid'/);
  assert.match(sql, /raise exception 'marketplace_payment_evidence_required'/);
  assert.match(sql, /raise exception 'marketplace_idempotency_key_required'/);
  assert.match(sql, /raise exception 'marketplace_idempotency_conflict'/);
  assert.match(sql, /for update/);
});

test("idempotency scope is the user_seller-specific scope, not the official one", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /'user_seller_order\.payment_result'/);
  assert.doesNotMatch(sql, /'official_order\.payment_result'/);
});

test("order lookup is scoped to user_seller and locks pending order plus payout rows", () => {
  const sql = compactSql(readMigration());

  assert.match(
    sql,
    /from public\.marketplace_orders where id = p_order_id and listing_source = 'user_seller' for update/,
  );
  assert.match(sql, /raise exception 'marketplace_order_not_found'/);
  assert.match(
    sql,
    /from public\.marketplace_pending_payment_orders where id = order_row\.pending_payment_order_id for update/,
  );
  assert.match(sql, /raise exception 'marketplace_pending_order_not_found'/);
  assert.match(
    sql,
    /from public\.marketplace_seller_payouts where order_id = order_row\.id for update/,
  );
});

test("admin cannot re-decide an order that is already paid, failed, or refunded", () => {
  const sql = compactSql(readMigration());

  assert.match(
    sql,
    /order_row\.payment_state not in \('pending_payment', 'payment_submitted'\)/,
  );
  assert.match(sql, /raise exception 'marketplace_payment_state_invalid'/);
});

test("paid branch enforces the buyer_total_satang amount match and holds the seller payout", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /p_provider_amount_satang <> order_row\.buyer_total_satang/);
  assert.match(sql, /raise exception 'marketplace_payment_amount_mismatch'/);
  assert.match(sql, /set order_state = 'paid' where id = pending_row\.id/);
  assert.match(
    sql,
    /set payment_state = 'paid', seller_payout_state = 'held'/,
  );
  assert.match(sql, /manualpaymentapprovedat/);
  assert.match(sql, /manualpaymentapprovedby/);
  assert.match(sql, /set listing_state = 'sold', seller_payout_state = 'held'/);
  assert.match(
    sql,
    /set payout_state = 'held', release_eligible_at = now\(\) where id = payout_row\.id/,
  );
});

test("failed branch restores inventory and listing quantity and cancels the seller payout", () => {
  const sql = compactSql(readMigration());

  assert.match(
    sql,
    /quantity_available = least\(quantity_total, quantity_available \+ pending_row\.quantity\)/,
  );
  assert.match(
    sql,
    /item_state = case when item_state = 'sold' then 'listed' else item_state end/,
  );
  assert.match(sql, /seller_payout_state = 'pending'/);
  assert.match(
    sql,
    /quantity_available_snapshot = quantity_available_snapshot \+ pending_row\.quantity/,
  );
  assert.match(sql, /set payout_state = 'cancelled' where id = payout_row\.id/);
  assert.match(sql, /set order_state = 'cancelled' where id = pending_row\.id/);
  assert.match(
    sql,
    /set payment_state = 'failed', fulfilment_state = 'cancelled', seller_payout_state = 'cancelled'/,
  );
  assert.match(sql, /manualpaymentrejectedat/);
  assert.match(sql, /manualpaymentrejectedby/);
});

test("rpc records an audit event and stores the idempotent response payload", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /insert into public\.marketplace_audit_events/);
  assert.match(sql, /marketplace_user_seller_payment_manual_result/);
  assert.match(sql, /update public\.marketplace_idempotency_keys set response_payload = rpc_response_payload/);
  assert.match(sql, /return rpc_response_payload/);
});

test("official-shop lib exports recordUserSellerPaymentResult beside recordOfficialPaymentResult", () => {
  const officialShop = readApp("src/lib/marketplace/official-shop.ts");

  assert.match(officialShop, /export async function recordOfficialPaymentResult/);
  assert.match(officialShop, /export async function recordUserSellerPaymentResult/);
  assert.match(officialShop, /marketplace_record_user_seller_payment_result/);
  assert.match(officialShop, /paymentProviderEvidence\(input\.body\)/);
  assert.match(officialShop, /assertAdmin\(input\.admin\)/);
});

test("orders lib exposes getMarketplaceOrderSource for routing admin payment decisions", () => {
  const orders = readApp("src/lib/marketplace/orders.ts");

  assert.match(orders, /export async function getMarketplaceOrderSource/);
  assert.match(orders, /from\("marketplace_orders"\)/);
  assert.match(orders, /select\("listing_source"\)/);
});

test("supabase-adapter registers the new safe error codes with sensible statuses", () => {
  const adapter = readApp("src/lib/marketplace/supabase-adapter.ts");

  assert.match(
    adapter,
    /marketplace_payment_evidence_required:\s*\{\s*message:[^}]*status:\s*422,?\s*\}/s,
  );
  assert.match(
    adapter,
    /marketplace_payment_amount_mismatch:\s*\{\s*message:[^}]*status:\s*409,?\s*\}/s,
  );
});

test("unified admin payment route branches on listing_source and is owner-only", () => {
  const routeSrc = readApp(
    "src/app/api/ynot/marketplace/admin/orders/[orderId]/payment/route.ts",
  );

  assert.match(routeSrc, /export async function POST/);
  assert.match(routeSrc, /prepareMarketplaceMutation/);
  assert.match(routeSrc, /method:\s*"POST"/);
  assert.doesNotMatch(routeSrc, /accessMode:\s*"customer"/);
  assert.doesNotMatch(routeSrc, /action:\s*"/);
  assert.match(routeSrc, /ynot:marketplace:admin:order:payment/);
  assert.match(
    routeSrc,
    /allowedFields:\s*\[\s*"paymentState",\s*"providerReference",\s*"providerAmountSatang",\s*"providerCurrency",\s*"adminNote",?\s*\]/,
  );
  assert.match(routeSrc, /getMarketplaceOrderSource/);
  assert.match(routeSrc, /recordOfficialPaymentResult/);
  assert.match(routeSrc, /recordUserSellerPaymentResult/);
  assert.match(routeSrc, /"official_order\.payment_result"/);
  assert.match(routeSrc, /"user_seller_order\.payment_result"/);
  assert.match(routeSrc, /marketplace_order_not_found/);
  assert.match(routeSrc, /status:\s*404/);
});

test("unified route leaves the existing official-orders payment route untouched", () => {
  const officialRouteSrc = readApp(
    "src/app/api/ynot/marketplace/admin/official-orders/[orderId]/payment/route.ts",
  );

  assert.match(officialRouteSrc, /recordOfficialPaymentResult/);
  assert.doesNotMatch(officialRouteSrc, /recordUserSellerPaymentResult/);
  assert.doesNotMatch(officialRouteSrc, /getMarketplaceOrderSource/);
});

test("unified route re-export mirrors the ynot handler", () => {
  const reexport = readApp(
    "src/app/api/marketplace/admin/orders/[orderId]/payment/route.ts",
  );

  assert.match(
    reexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/orders\/\[orderId\]\/payment\/route/,
  );
  assert.match(reexport, /export\s*\{\s*POST,?\s*\}/);
});
