import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

const CART_CLIENT = "src/features/ynot/MarketplaceCartWatchlistClient.tsx";
const CART_PAGE = "src/app/(store)/marketplace/cart/page.tsx";
const CHECKOUT_FLOW = "src/features/marketplace-ui/checkout/CheckoutFlow.tsx";
const ORDER_DETAIL = "src/app/(store)/marketplace/orders/[orderId]/page.tsx";
const GROUP_ROUTE = "src/app/api/ynot/marketplace/checkout/groups/route.ts";
const GROUP_ROUTE_ALIAS = "src/app/api/marketplace/checkout/groups/route.ts";
const ORDERS = "src/lib/marketplace/orders.ts";
const OFFICIAL_SHOP = "src/lib/marketplace/official-shop.ts";

test("package exposes the scoped cart checkout regression test", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-cart-checkout"],
    "node --test scripts/test-marketplace-cart-checkout.mjs",
  );
});

test("cart renders a real 1-3 item selection and Proceed to checkout action", () => {
  const source = readApp(CART_CLIENT);
  assert.match(source, /selectedListingIds/);
  assert.match(source, /type=["']checkbox["']/);
  assert.match(source, /Select up to 3 items/);
  assert.match(source, /Proceed to checkout/);
  assert.match(source, /selectedListingIds\.length\s*>=\s*1/);
  assert.match(source, /selectedListingIds\.length\s*<=\s*3/);
  assert.match(source, /selectedItems\.length\s*>\s*1/);
  assert.match(source, /listing\.listing_source\s*!==\s*["']official_shop["']/);
});

test("cart server page supplies complete addresses and payment instructions to checkout", () => {
  const source = readApp(CART_PAGE);
  assert.match(source, /getProfileAddresses/);
  assert.match(source, /isCompleteShippingAddress/);
  assert.match(source, /getMarketplacePaymentInstructions/);
  assert.match(source, /checkoutAddresses=/);
  assert.match(source, /paymentInstructions=/);
  assert.match(source, /checkoutEnabled=/);
});

test("cart uses the shared checkout state machine with listingIds", () => {
  const cartSource = readApp(CART_CLIENT);
  const flowSource = readApp(CHECKOUT_FLOW);
  assert.match(cartSource, /<CheckoutFlow/);
  assert.match(cartSource, /listings=/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/groups/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/official/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/user-seller/);
  assert.match(flowSource, /listingIds/);
  assert.match(flowSource, /checkoutListings\.map/);
  assert.match(flowSource, /pendingPaymentOrderId/);
  assert.match(flowSource, /buyerTotalSatang/);
});

test("group checkout route accepts only the guarded cart fields and calls the group service", () => {
  assert.ok(existsSync(path.join(appRoot, GROUP_ROUTE)), "missing canonical group route");
  assert.ok(existsSync(path.join(appRoot, GROUP_ROUTE_ALIAS)), "missing public group route alias");
  const source = readApp(GROUP_ROUTE);
  for (const field of ["listingIds", "shippingAddressId", "addressConfirmed"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /allowedFields:\s*\[[^\]]*["']listingIds["']/s);
  assert.match(source, /createMultiListingCheckout/);
  assert.match(source, /assertMarketplacePaymentReceiverConfigured/);
  assert.match(source, /assertMarketplaceCheckoutAddress/);
});

test("orders service creates, releases, and submits proof atomically through group RPCs", () => {
  const source = readApp(ORDERS);
  assert.match(source, /export async function createMultiListingCheckout/);
  assert.match(
    source,
    /createMultiListingCheckout[\s\S]{0,900}if\s*\(marketplaceConfig\(\)\.mockData\)/,
  );
  assert.match(source, /marketplace_create_multi_listing_checkout/);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /marketplace_release_checkout_group/);
  assert.match(source, /marketplace_submit_checkout_payment_proof/);
  assert.match(source, /marketplace_checkout_groups/);
  assert.match(source, /marketplace_expire_checkout_groups/);
});

test("manual payment review dispatches a grouped official checkout atomically", () => {
  const source = readApp(OFFICIAL_SHOP);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /marketplace_record_checkout_payment_result/);
  assert.match(source, /p_checkout_group_id/);
  assert.match(source, /providerAmountSatang/);
});

test("admin proof lookup resolves every child order through its checkout group", () => {
  const source = readApp(ORDERS);
  assert.match(source, /export async function getMarketplaceOrderProofPath/);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /checkout_group_id/);
  assert.match(source, /proofQuery\.eq\("checkout_group_id", checkoutGroupId\)/);
});

test("grouped payment resume shows the aggregate checkout amount and fee breakdown", () => {
  const ordersSource = readApp(ORDERS);
  const detailSource = readApp(ORDER_DETAIL);

  for (const field of [
    "item_subtotal_satang",
    "shipping_fee_satang",
    "buyer_service_fee_satang",
    "buyer_total_satang",
  ]) {
    assert.match(ordersSource, new RegExp(field));
  }
  assert.match(
    ordersSource,
    /marketplace_checkout_groups[\s\S]{0,700}item_subtotal_satang[\s\S]{0,220}shipping_fee_satang[\s\S]{0,220}buyer_service_fee_satang/,
  );
  assert.ok(
    detailSource.indexOf("const pendingOrder") <
      detailSource.indexOf("const paymentProofOrder"),
    "the aggregate group must be loaded before the payment summary is built",
  );
  assert.match(detailSource, /pendingOrder\?\.checkout_group_id/);
  assert.match(detailSource, /pendingOrder\.item_subtotal_satang/);
  assert.match(detailSource, /pendingOrder\.shipping_fee_satang/);
  assert.match(detailSource, /pendingOrder\.buyer_service_fee_satang/);
  assert.match(detailSource, /pendingOrder\.buyer_total_satang/);
});

test("cart checkout does not silently include user-seller listings in the first rollout", () => {
  const source = readApp(CART_CLIENT);
  assert.match(source, /Official-shop items can be checked out together/);
  assert.match(source, /User-seller items still use individual checkout/);
});
