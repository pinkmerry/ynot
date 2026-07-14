import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CHECKOUT_FLOW_PATH = "src/features/marketplace-ui/checkout/CheckoutFlow.tsx";
const SLIP_UPLOADER_PATH = "src/features/marketplace-ui/checkout/SlipUploader.tsx";
const PAGE_PATH = "src/app/(store)/marketplace/listings/[listingId]/page.tsx";
const DETAIL_COMPONENT_PATH = "src/features/ynot/MarketplaceListingDetailPage.tsx";
const PAYMENT_PROOF_ROUTE_PATH =
  "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts";
const PENDING_ORDERS_ROUTE_PATH =
  "src/app/api/ynot/marketplace/checkout/pending-orders/route.ts";
const REQUEST_GUARD_PATH = "src/lib/marketplace/request-guard.ts";

test("package exposes the scoped marketplace UI checkout test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-checkout"],
    "node --test scripts/test-marketplace-ui-checkout.mjs",
  );
});

test("CheckoutFlow.tsx and SlipUploader.tsx exist", () => {
  assert.ok(existsSync(path.join(appRoot, CHECKOUT_FLOW_PATH)), "missing checkout/CheckoutFlow.tsx");
  assert.ok(existsSync(path.join(appRoot, SLIP_UPLOADER_PATH)), "missing checkout/SlipUploader.tsx");
});

test("CheckoutFlow.tsx and SlipUploader.tsx are client components", () => {
  assert.match(readApp(CHECKOUT_FLOW_PATH), /^"use client"/m, "CheckoutFlow must be a client component");
  assert.match(readApp(SLIP_UPLOADER_PATH), /^"use client"/m, "SlipUploader must be a client component");
});

test("CheckoutFlow.tsx calls the real pending-order create route with the real allowed body fields and idempotency header", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /fetch\(checkoutEndpoint/, "must POST to the checkoutEndpoint prop (real official/user-seller route)");
  assert.match(source, /method:\s*["']POST["']/, "pending-order create must use method: POST");
  for (const field of ["listingId", "shippingAddressId", "addressConfirmed"]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `must send the real allowed field ${field}`);
  }
  assert.match(source, /["']idempotency-key["']/, "must send the idempotency-key header");
  assert.match(source, /crypto\.randomUUID\(\)/, "must generate a fresh idempotency key per request");
});

test("CheckoutFlow.tsx calls the real release route with releaseReason", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(
    source,
    /\/api\/marketplace\/checkout\/pending-orders\/\$\{order\.pendingPaymentOrderId\}\/release/,
    "must POST to /api/marketplace/checkout/pending-orders/[pendingOrderId]/release",
  );
  assert.match(source, /releaseReason/, "release call must send releaseReason");
  assert.match(source, /buyer_cancelled/, "cancel-order action must send releaseReason: buyer_cancelled");
});

test("CheckoutFlow.tsx follows the real contract step order: order created before pay/slip, not the prototype's verify-before-place", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /"review"\s*\|\s*"pay"\s*\|\s*"slip"\s*\|\s*"done"/, "must define the 4 real-contract steps in order");
  assert.match(
    source,
    /createPendingOrder[\s\S]{0,1500}setStep\("pay"\)/,
    "creating the pending order must be what advances review -> pay (order exists before payment/slip)",
  );
});

test("CheckoutFlow.tsx does not render a bag/ship delivery chooser (ship-only decision)", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.doesNotMatch(source, /keep in my bag/i, "must not offer the prototype's bag delivery option");
  assert.doesNotMatch(source, /\bdeliver\b\s*===\s*["']bag["']/, "must not branch on a bag delivery state");
  assert.doesNotMatch(source, /useState\(["']bag["']\)/, "must not default delivery state to bag");
});

test("CheckoutFlow.tsx never hardcodes a bank account number — payment instructions come from the resolved order snapshot", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(
    source,
    /paymentInstructions:\s*MarketplacePaymentInstructions/,
    "must type paymentInstructions as the real MarketplacePaymentInstructions shape",
  );
  assert.match(
    source,
    /activePaymentInstructions\.accountNumber/,
    "account number must be read from the active persisted instructions",
  );
  assert.match(
    source,
    /activePaymentInstructions\.bankName/,
    "bank name must be read from the active persisted instructions",
  );
  assert.match(
    source,
    /activePaymentInstructions\.promptPayId/,
    "PromptPay id must be read from the active persisted instructions",
  );
  // The prototype's literal hardcoded digits must never appear in the real component.
  assert.doesNotMatch(source, /123-4-56789-0/, "must not hardcode the prototype's sample bank account number");
  assert.doesNotMatch(source, /0-1055-61000-88-9/, "must not hardcode the prototype's sample PromptPay id");
});

test("CheckoutFlow.tsx renders totals only from the pending-order response, not invented fees", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  for (const field of [
    "itemPriceSatang",
    "shippingFeeSatang",
    "buyerServiceFeeSatang",
    "buyerTotalSatang",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(field)), `must reference the real order field ${field}`);
  }
  assert.match(source, /formatThb\(/, "prices must render via the shared formatThb helper");
  assert.doesNotMatch(source, /SHIP_FEE_THB/, "must not reuse the prototype's hardcoded shipping fee constant");
});

test("CheckoutFlow.tsx handles pending-order expiry by resetting to review, not by inventing a new endpoint", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /marketplace_pending_order_expired/, "must recognize the real expiry error code");
  assert.match(source, /setStep\("review"\)/, "expiry must reset the flow back to the review step");
});

test("CheckoutFlow.tsx cancels via the release route on Cancel order, and links back to the listing on the review step", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, />\s*Cancel order\s*<|Cancel order/, "must render a Cancel order action");
  assert.match(source, /releaseOrder/, "Cancel order must call the release function");
  assert.match(
    source,
    /href={`\/marketplace\/listings\/\$\{listing\.listingId\}`}/,
    "review step's Back link must point at the listing page",
  );
});

test("CheckoutFlow.tsx renders MpSteps with the 3 real-contract step labels", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /MpSteps/, "must render the shared MpSteps primitive");
  for (const label of ["Review", "Pay by transfer", "Order placed"]) {
    assert.match(source, new RegExp(escapeRegExp(label)), `must render the ${label} step label`);
  }
});

test("CheckoutFlow.tsx dynamically imports SlipUploader (perf: interaction-gated below-the-fold UI)", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /import\s+dynamic\s+from\s*["']next\/dynamic["']/, "must import next/dynamic");
  assert.match(
    source,
    /dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/SlipUploader["']\)/,
    "SlipUploader must be loaded via dynamic(() => import(\"./SlipUploader\"))",
  );
});

test("CheckoutFlow.tsx does not import SlipUploader statically", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.doesNotMatch(
    source,
    /^import\s*{\s*SlipUploader\s*}\s*from\s*["']\.\/SlipUploader["']/m,
    "SlipUploader must not be statically imported alongside the dynamic import",
  );
});

test("CheckoutFlow.tsx reuses shared marketplace-ui primitives instead of rewriting them", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(
    source,
    /from\s*["']\.\.\/shared\/MpPrimitives["']/,
    "must import shared primitives from ../shared/MpPrimitives",
  );
  for (const primitive of ["MpBadge", "MpBtn", "MpChip", "MpPanel", "useToasts", "MpToasts"]) {
    assert.match(source, new RegExp(escapeRegExp(primitive)), `must reference the shared ${primitive} primitive`);
  }
});

test("SlipUploader.tsx POSTs one multipart request to the real payment-proof route with the confirmed field name", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  assert.match(
    source,
    /\/api\/marketplace\/checkout\/pending-orders\/\$\{order\.pendingPaymentOrderId\}\/payment-proof/,
    "must POST to /api/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof",
  );
  assert.match(source, /form\.set\(["']paymentProof["']/, "must send the file under the confirmed paymentProof field name");
  assert.match(source, /new FormData\(\)/, "upload must be a multipart FormData request");
  assert.match(source, /method:\s*["']POST["']/, "payment-proof submit must use method: POST");
  assert.match(source, /["']idempotency-key["']/, "must send the idempotency-key header");

  // Exactly one network call site for the proof submission — no second POST hidden elsewhere.
  const postCount = (source.match(/fetch\(/g) ?? []).length;
  assert.equal(postCount, 1, "SlipUploader must make exactly one fetch call (the payment-proof submit)");
});

test("SlipUploader.tsx's confirmed field name matches the real route's getPaymentProofFile()", () => {
  const routeSource = readApp(PAYMENT_PROOF_ROUTE_PATH);
  const uploaderSource = readApp(SLIP_UPLOADER_PATH);
  assert.match(
    routeSource,
    /form\.get\(["']paymentProof["']\)/,
    "sanity check: the real route must read the file under form field paymentProof first",
  );
  assert.match(uploaderSource, /form\.set\(["']paymentProof["']/, "SlipUploader must send the same field name");
});

test("SlipUploader.tsx does not contain a fake/sample slip generator", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  assert.doesNotMatch(source, /makeSampleSlip/i, "must not port the prototype's fake canvas-drawn slip generator");
  assert.doesNotMatch(source, /createElement\(["']canvas["']\)/, "must not draw a synthetic slip image");
  assert.doesNotMatch(source, /sample-slip/i, "must not reference a sample slip fixture");
  assert.doesNotMatch(source, /No slip handy/i, "must not offer the prototype's demo sample-slip shortcut");
});

test("SlipUploader.tsx does not fake verification with a timer — it awaits the real server response", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  assert.doesNotMatch(source, /setTimeout\(/, "must not simulate verification latency with setTimeout");
  assert.match(source, /await\s+fetch\(/, "must await a real fetch call for verification");
});

test("SlipUploader.tsx mirrors the real server upload limits (allowed types, 10 MB max)", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.match(source, new RegExp(escapeRegExp(type)), `must accept ${type}`);
  }
  assert.match(source, /10\s*\*\s*1024\s*\*\s*1024/, "must mirror the real 10 MB maxSlipBytes limit");
});

test("SlipUploader.tsx treats duplicate/mismatch as a verificationStatus outcome, not a thrown request error", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  assert.match(source, /verificationStatus/, "must read proof.verificationStatus from the response body");
  assert.match(
    source,
    /verificationStatus\s*===\s*["']valid["']/,
    "must treat verificationStatus === \"valid\" as the success case",
  );
});

test("SlipUploader.tsx's failure branch offers 'Upload a different slip' and 'Keep for manual review' with no extra API call for manual review", () => {
  const source = readApp(SLIP_UPLOADER_PATH);
  assert.match(source, /Upload a different slip/, "failure branch must offer Upload a different slip");
  assert.match(source, /Keep for manual review/, "failure branch must offer Keep for manual review");
  assert.match(source, /onManualReview/, "Keep for manual review must call the onManualReview callback prop");
  // onManualReview must be a plain callback invocation, not a second fetch() to a manual-review endpoint.
  assert.doesNotMatch(
    source,
    /onManualReview[\s\S]{0,80}fetch\(/,
    "Keep for manual review must not fire an additional network request",
  );
});

test("CheckoutFlow.tsx treats manual review as a UI state, not an extra endpoint call, and still navigates to the order", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /handleManualReview/, "must define a manual-review handler");
  assert.match(
    source,
    /handleManualReview[\s\S]{0,400}router\.push\(`\/marketplace\/orders\/\$\{order\.orderId\}`\)/,
    "manual-review handler must navigate to the orders confirmation route without an extra API call",
  );
});

test("CheckoutFlow.tsx navigates to /marketplace/orders/[orderId] on verified payment (done state), no extra API call", () => {
  const source = readApp(CHECKOUT_FLOW_PATH);
  assert.match(source, /handleSlipVerified/, "must define a slip-verified handler");
  assert.match(
    source,
    /handleSlipVerified[\s\S]{0,400}router\.push\(`\/marketplace\/orders\/\$\{order\.orderId\}`\)/,
    "verified handler must navigate using the real order.orderId field",
  );
});

test("page.tsx renders the new checkout flow through MarketplaceListingDetailPage and keeps its guards", () => {
  const source = readApp(PAGE_PATH);
  for (const symbol of [
    "resolveCurrentProfile",
    "resolveAdminSession",
    "marketplaceConfig",
    "getMarketplaceListing",
    "MarketplaceServiceError",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `page.tsx must still reference ${symbol}`);
  }
  assert.match(source, /if\s*\(!allowed\)\s*{\s*redirect\("\/packs"\);/, "must still redirect unauthorized owner-only access to /packs");
  assert.match(source, /notFound\(\)/, "must still call notFound() for marketplace_listing_not_found");
  assert.match(source, /MarketplaceListingDetailPage/, "must still render MarketplaceListingDetailPage");
});

test("page.tsx still exports generateMetadata and still renders the JSON-LD script (SEO not regressed)", () => {
  const source = readApp(PAGE_PATH);
  assert.match(source, /export\s+async\s+function\s+generateMetadata\s*\(/, "page.tsx must still export generateMetadata");
  assert.match(source, /buildMarketplaceListingMetadata/, "generateMetadata must still build metadata via buildMarketplaceListingMetadata");
  assert.match(
    source,
    /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML={{/,
    "page.tsx must still render the JSON-LD <script> block",
  );
  assert.match(source, /buildMarketplaceListingJsonLd\(listing\)/, "JSON-LD script must still be built from buildMarketplaceListingJsonLd(listing)");
  assert.match(source, /serializeMarketplaceJsonLd\(/, "JSON-LD script must still be serialized via serializeMarketplaceJsonLd");
});

test("page.tsx no longer renders YnotShell or fetches the dashboard slice that only fed it", () => {
  const source = readApp(PAGE_PATH);
  assert.doesNotMatch(source, /YnotShell/, "page.tsx must no longer render YnotShell (layout topbar owns chrome now)");
  assert.doesNotMatch(
    source,
    /getYnotDashboardSlice/,
    "page.tsx must no longer call getYnotDashboardSlice — it only fed YnotShell's viewer/walletBalance",
  );
});

test("checkout cannot reserve stock until the payment receiver is configured", () => {
  const flow = readApp("src/features/marketplace-ui/checkout/CheckoutFlow.tsx");
  const officialRoute = readApp("src/app/api/ynot/marketplace/checkout/official/route.ts");
  const userSellerRoute = readApp("src/app/api/ynot/marketplace/checkout/user-seller/route.ts");
  const pendingOrdersRoute = readApp(
    "src/app/api/ynot/marketplace/checkout/pending-orders/route.ts",
  );
  const paymentInstructions = readApp("src/lib/marketplace/payment-instructions.ts");

  assert.match(paymentInstructions, /assertMarketplacePaymentReceiverConfigured/);
  assert.match(flow, /!paymentInstructions\.receiverConfigured/);
  assert.match(flow, /Payment receiver is not configured\. Contact support before checkout\./);
  assert.match(
    flow,
    /disabled=\{[^}]*!paymentInstructions\.receiverConfigured[^}]*\}/,
    "Continue to payment must be disabled before order creation",
  );

  for (const [label, source, createCall] of [
    ["official checkout", officialRoute, "const order = await createOfficialPendingPaymentOrder"],
    ["user-seller checkout", userSellerRoute, "const order = await createUserSellerPendingPaymentOrder"],
    ["generic pending-order checkout", pendingOrdersRoute, "const listingId = String"],
  ]) {
    assert.match(source, /await assertMarketplacePaymentReceiverConfigured\(\)/, `${label} needs an awaited server guard`);
    assert.ok(
      source.indexOf("await assertMarketplacePaymentReceiverConfigured()") < source.indexOf(createCall),
      `${label} must guard before creating the pending order`,
    );
  }
});

test("marketplace checkout resolves the canonical core receiver and reuses it for Slip2Go", () => {
  const paymentInstructions = readApp("src/lib/marketplace/payment-instructions.ts");
  const paymentProofRoute = readApp(
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  );

  assert.match(paymentInstructions, /createServiceSupabaseClient/);
  assert.match(paymentInstructions, /\.from\("payment_methods"\)/);
  assert.match(paymentInstructions, /\.eq\("is_active", true\)/);
  assert.match(paymentInstructions, /\.eq\("type", "bank_transfer"\)/);
  assert.match(paymentInstructions, /selectMarketplaceReceiverRow/);
  assert.match(
    paymentInstructions,
    /export async function getMarketplacePaymentInstructions/,
  );
  assert.match(
    paymentInstructions,
    /export async function assertMarketplacePaymentReceiverConfigured/,
  );
  assert.match(paymentInstructions, /hasSlip2GoReceiverCheck/);
  assert.match(
    paymentInstructions,
    /getMarketplacePaymentInstructionsFromSnapshot/,
  );
  assert.match(
    paymentInstructions,
    /receiver\s*\?\s*paymentInstructions\([\s\S]*?:\s*paymentInstructions\(/,
    "environment values must remain a fallback when no core receiver is available",
  );

  assert.match(
    paymentProofRoute,
    /getMarketplacePaymentInstructionsFromSnapshot\(\s*pendingOrder\.shipping_snapshot\s*,?\s*\)/,
  );
  assert.match(
    paymentProofRoute,
    /assertMarketplacePaymentInstructionsConfigured\(paymentInstructions\)/,
  );
  for (const property of [
    "promptPayId",
    "bankName",
    "accountNumber",
    "accountName",
  ]) {
    assert.match(
      paymentProofRoute,
      new RegExp(`paymentInstructions\\.${property}`),
      `Slip2Go must use the resolved ${property}`,
    );
  }
  assert.doesNotMatch(
    paymentProofRoute,
    /process\.env\.SLIP2GO_(?:PROMPTPAY_ID|BANK_NAME|BANK_ACCOUNT_NUMBER|BANK_ACCOUNT_NAME)/,
    "payment proof verification must not resolve a different receiver from process.env",
  );
});

test("payment proof stays blocked without receiver configuration while cancellation remains available", () => {
  const client = readApp("src/features/ynot/MarketplacePaymentProofClient.tsx");
  const route = readApp(
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
  );

  assert.match(client, /paymentInstructions\.receiverConfigured/);
  assert.match(client, /Payment receiver is not configured\. Contact support before transfer\./);
  assert.match(client, /Cancel order/);
  assert.match(route, /assertMarketplacePaymentInstructionsConfigured\(paymentInstructions\)/);
  assert.ok(
    route.indexOf("assertMarketplacePaymentInstructionsConfigured(paymentInstructions)") < route.indexOf("request.formData()"),
    "receiver guard must run before accepting or storing a payment proof",
  );
});

test("created checkout returns its persisted receiver snapshot to the payment step", () => {
  const flow = readApp("src/features/marketplace-ui/checkout/CheckoutFlow.tsx");
  const orders = readApp("src/lib/marketplace/orders.ts");

  assert.match(orders, /withMarketplacePaymentReceiverSnapshot/);
  assert.match(orders, /p_shipping_snapshot:\s*checkoutSnapshot/);
  assert.match(orders, /paymentInstructions:\s*persistedPaymentInstructions/);
  assert.match(flow, /order\?\.paymentInstructions\s*\?\?\s*paymentInstructions/);
});

test("MarketplaceListingDetailPage.tsx renders CheckoutFlow instead of the old MarketplaceCheckoutClient", () => {
  const source = readApp(DETAIL_COMPONENT_PATH);
  assert.match(
    source,
    /import\s*{\s*CheckoutFlow\s*}\s*from\s*["']@\/features\/marketplace-ui\/checkout\/CheckoutFlow["']/,
    "must import CheckoutFlow from the new feature module",
  );
  assert.match(source, /<CheckoutFlow\b/, "must render <CheckoutFlow");
  assert.doesNotMatch(
    source,
    /import[\s\S]{0,80}MarketplaceCheckoutClient/,
    "must no longer import the old MarketplaceCheckoutClient",
  );
});

test("MarketplaceListingDetailPage.tsx passes the real checkoutEndpoint and paymentInstructions through to CheckoutFlow", () => {
  const source = readApp(DETAIL_COMPONENT_PATH);
  assert.match(source, /checkoutEndpoint={checkoutEndpoint}/, "must forward the real checkoutEndpoint prop");
  assert.match(source, /paymentInstructions={paymentInstructions}/, "must forward the real paymentInstructions prop");
  assert.match(source, /shippingAddresses={checkoutAddresses}/, "must forward the real checkoutAddresses as shippingAddresses");
});

test("request-guard.ts confirms the idempotency-key header name CheckoutFlow/SlipUploader must send", () => {
  const guardSource = readApp(REQUEST_GUARD_PATH);
  const flowSource = readApp(CHECKOUT_FLOW_PATH);
  const uploaderSource = readApp(SLIP_UPLOADER_PATH);
  assert.match(
    guardSource,
    /request\.headers\.get\("idempotency-key"\)/,
    "sanity check: marketplaceIdempotencyKey must still read the idempotency-key header first",
  );
  assert.match(flowSource, /"idempotency-key"/, "CheckoutFlow must send the same header name");
  assert.match(uploaderSource, /"idempotency-key"/, "SlipUploader must send the same header name");
});

test("pending-orders route confirms the real allowedFields CheckoutFlow's create request must match", () => {
  const routeSource = readApp(PENDING_ORDERS_ROUTE_PATH);
  assert.match(
    routeSource,
    /allowedFields:\s*\[\s*["']listingId["'],\s*["']shippingAddressId["'],\s*["']addressConfirmed["']\s*\]/,
    "sanity check: the real route's allowedFields must still be exactly listingId/shippingAddressId/addressConfirmed",
  );
});
