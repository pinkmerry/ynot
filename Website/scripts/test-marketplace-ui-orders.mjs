import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel) {
  return readFileSync(path.join(appRoot, rel), "utf8");
}

const FEATURE = "src/features/marketplace-ui/orders";

test("orders feature files exist", () => {
  for (const f of [
    "orderStepIndex.ts",
    "OrdersPage.tsx",
    "BuyingTab.tsx",
    "OrderTimeline.tsx",
    "ListingsTab.tsx",
    "OrderConfirmView.tsx",
  ]) {
    assert.ok(
      existsSync(path.join(appRoot, FEATURE, f)),
      `${f} should exist`,
    );
  }
});

test("orderStepIndex is a pure, dependency-free module", () => {
  const src = readSrc(`${FEATURE}/orderStepIndex.ts`);
  assert.doesNotMatch(src, /["']use client["']/, "must not be a client module");
  assert.doesNotMatch(src, /from ["']@\/lib\//, "must not import server libs");
  assert.doesNotMatch(src, /from ["']next\//, "must stay framework-free");
});

test("orderStepIndex pins the real state -> step mapping", () => {
  const src = readSrc(`${FEATURE}/orderStepIndex.ts`);
  // completed -> 3, shipped -> 2, paid -> 1, pre-paid -> 0
  assert.match(src, /fulfilment === "completed"\) return 3/);
  assert.match(src, /fulfilment === "shipped"\) return 2/);
  assert.match(src, /payment === "paid"\) return 1/);
  assert.match(src, /return 0;/);
  // ended states
  assert.match(src, /"Refunded"/);
  assert.match(src, /"Cancelled"/);
  assert.match(src, /"Payment failed"/);
  assert.match(src, /ORDER_STEP_LABELS/);
});

test("orders pages no longer render the legacy YnotShell", () => {
  const listPage = readSrc("src/app/(store)/marketplace/orders/page.tsx");
  const detailPage = readSrc(
    "src/app/(store)/marketplace/orders/[orderId]/page.tsx",
  );
  assert.doesNotMatch(listPage, /YnotShell/);
  assert.doesNotMatch(detailPage, /YnotShell/);
  assert.match(listPage, /OrdersPage/);
  assert.match(detailPage, /OrderConfirmView/);
  // resume-payment path preserved for pending orders
  assert.match(detailPage, /MarketplacePaymentProofClient/);
});

test("orders list page loads all three datasets in one Promise.all", () => {
  const listPage = readSrc("src/app/(store)/marketplace/orders/page.tsx");
  assert.match(listPage, /Promise\.all/);
  assert.match(listPage, /listBuyerOrders/);
  assert.match(listPage, /listSellerSales/);
  assert.match(listPage, /listSellerSubmissions/);
});

test("OrdersPage tabs are URL state", () => {
  const src = readSrc(`${FEATURE}/OrdersPage.tsx`);
  assert.match(src, /\/marketplace\/orders\?tab=/);
  for (const tab of ["buying", "selling", "listings"]) {
    assert.match(src, new RegExp(`"${tab}"`));
  }
});

test("OrderTimeline opens a dispute via the real route with idempotency + min length", () => {
  const src = readSrc(`${FEATURE}/OrderTimeline.tsx`);
  assert.match(src, /\/api\/marketplace\/orders\/\$\{order\.id\}\/dispute/);
  assert.match(src, /"idempotency-key"/);
  assert.match(src, /MIN_REASON = 10/);
  assert.match(src, /MAX_REASON = 1000/);
  // dispute affordance gated on completed + not-already-disputed
  assert.match(src, /fulfilment_state === "completed"/);
});

test("ListingsTab wires handoff and cancel with optimistic version", () => {
  const src = readSrc(`${FEATURE}/ListingsTab.tsx`);
  assert.match(src, /\/api\/marketplace\/seller\/submissions\/\$\{[^}]+\}\/handoff/);
  assert.match(src, /\/api\/marketplace\/seller\/submissions\/\$\{[^}]+\}\/cancel/);
  assert.match(src, /expectedVersion/);
  // legal handoff methods only
  assert.match(src, /ship_to_store/);
  assert.match(src, /bring_to_store/);
  // edit deep-link to the sell form
  assert.match(src, /\/marketplace\/seller\?submission=/);
});

test("buyer surfaces do not leak seller payout internals", () => {
  const buying = readSrc(`${FEATURE}/BuyingTab.tsx`);
  const timeline = readSrc(`${FEATURE}/OrderTimeline.tsx`);
  for (const src of [buying, timeline]) {
    assert.doesNotMatch(src, /seller_payout|payout_amount|seller_fee_satang/);
  }
});
