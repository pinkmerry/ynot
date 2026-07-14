import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

async function importApp(relativePath) {
  return import(pathToFileURL(path.join(appRoot, relativePath)).href);
}

async function loadNotifierModule() {
  const notifierModule = await importApp(
    "src/features/marketplace-ui/checkout/notify-cart-state-changed.ts",
  ).catch(() => null);
  assert.ok(notifierModule, "missing cart state change notifier");
  return notifierModule;
}

async function captureUnhandledRejections(run) {
  const reasons = [];
  const listener = (reason) => reasons.push(reason);
  process.on("unhandledRejection", listener);
  try {
    const returned = run();
    await new Promise((resolve) => setImmediate(resolve));
    return { reasons, returned };
  } finally {
    process.off("unhandledRejection", listener);
  }
}

function functionBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  assert.notEqual(signatureIndex, -1, `missing function: ${signature}`);
  const bodyStart = source.indexOf("{", signatureIndex);
  assert.notEqual(bodyStart, -1, `missing function body: ${signature}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`unterminated function body: ${signature}`);
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

test("cart state notifications return void and run asynchronously", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();
  let called = false;

  const returned = notifyCartStateChanged(() => {
    called = true;
  });

  assert.equal(returned, undefined);
  assert.equal(called, false);
  await Promise.resolve();
  assert.equal(called, true);
});

test("cart state notifications isolate synchronous callback failures", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();
  let called = false;

  const { reasons, returned } = await captureUnhandledRejections(() =>
    notifyCartStateChanged(() => {
      called = true;
      throw new Error("sync refresh failure");
    }),
  );

  assert.equal(returned, undefined);
  assert.equal(called, true);
  assert.deepEqual(reasons, []);
});

test("cart state notifications isolate rejected callback promises", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();

  const { reasons, returned } = await captureUnhandledRejections(() =>
    notifyCartStateChanged(() => Promise.reject(new Error("async refresh failure"))),
  );

  assert.equal(returned, undefined);
  assert.deepEqual(reasons, []);
});

test("successful cart checkout transitions refresh the shared summary without duplicating mutations", () => {
  const flowSource = readApp(CHECKOUT_FLOW);
  const cartSource = readApp(CART_CLIENT);
  const createBody = functionBody(
    flowSource,
    "async function createPendingOrder()",
  );
  const releaseBody = functionBody(flowSource, "async function releaseOrder()");

  assert.match(
    flowSource,
    /onCartStateChanged\?:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>/,
  );
  assert.match(
    flowSource,
    /import\s*\{\s*notifyCartStateChanged\s*\}\s*from\s*"\.\/notify-cart-state-changed"/,
  );
  assert.match(
    cartSource,
    /const\s*\{[^}]*refreshCartSummary[^}]*\}\s*=\s*useMarketplaceCart\(\)/s,
  );
  assert.equal(
    cartSource.match(/onCartStateChanged=\{refreshCartSummary\}/g)?.length ?? 0,
    2,
  );

  assert.equal(createBody.match(/fetch\(checkoutEndpoint/g)?.length ?? 0, 1);
  assert.equal(
    createBody.match(/notifyCartStateChanged\(onCartStateChanged\)/g)?.length ?? 0,
    1,
  );
  const createParse = createBody.indexOf("const body = await parseJson(response);");
  const createSetOrder = createBody.indexOf("setOrder(body?.order ?? null);");
  const createSetPay = createBody.indexOf('setStep("pay");');
  const createNotify = createBody.indexOf(
    "notifyCartStateChanged(onCartStateChanged);",
  );
  const createCatch = createBody.indexOf("} catch");
  assert.ok(
    createParse >= 0 &&
      createParse < createSetOrder &&
      createSetOrder < createSetPay &&
      createSetPay < createNotify &&
      createNotify < createCatch,
  );
  assert.doesNotMatch(
    createBody.slice(createCatch),
    /notifyCartStateChanged\(/,
  );

  assert.equal(
    releaseBody.match(/notifyCartStateChanged\(onCartStateChanged\)/g)?.length ?? 0,
    1,
  );
  const releaseParse = releaseBody.indexOf("await parseJson(response);");
  const releaseNotify = releaseBody.indexOf(
    "notifyCartStateChanged(onCartStateChanged);",
  );
  const releaseToast = releaseBody.indexOf('toast("Order cancelled", "info");');
  const releaseClearOrder = releaseBody.indexOf("setOrder(null);");
  const releaseReview = releaseBody.indexOf('setStep("review");');
  const releaseCatch = releaseBody.indexOf("} catch");
  assert.ok(
    releaseParse >= 0 &&
      releaseParse < releaseNotify &&
      releaseNotify < releaseToast &&
      releaseToast < releaseClearOrder &&
      releaseClearOrder < releaseReview &&
      releaseReview < releaseCatch,
  );
  assert.doesNotMatch(
    releaseBody.slice(releaseCatch),
    /notifyCartStateChanged\(/,
  );
});
