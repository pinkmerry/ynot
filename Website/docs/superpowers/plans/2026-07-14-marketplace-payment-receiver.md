# Marketplace Payment Receiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one-listing Marketplace checkout resolve and verify against the same canonical core YNOTT bank-transfer receiver already used by wallet top-ups.

**Architecture:** Keep Marketplace money/order tables unchanged. Resolve the active canonical core `payment_methods.code = 'bank-transfer'` row server-side, fall back to optional receiver environment values only when the core lookup is unavailable or empty, validate that every populated destination creates its expected Slip2Go receiver check, and atomically persist a versioned receiver inside the existing `shipping_snapshot` JSON during pending-order creation. The create response, resume page, and proof route all reuse that immutable snapshot.

**Tech Stack:** Next.js App Router route handlers and server components, TypeScript, Supabase service client, Node test runner, OpenNext/Cloudflare Workers.

---

## File map

- `Website/src/lib/marketplace/payment-instructions.ts`: sole resolver and fail-closed receiver guard.
- `Website/src/lib/marketplace/payment-receiver.ts`: pure receiver selection plus versioned snapshot serialization/parsing.
- `Website/src/lib/marketplace/orders.ts`: persist the receiver in the order-creation RPC input and read it back for the create response and resume path.
- `Website/src/lib/slip2go/client.ts`: expose the receiver-check readiness predicate used before reservation.
- `Website/src/app/api/ynot/marketplace/checkout/official/route.ts`: await receiver before official stock reservation.
- `Website/src/app/api/ynot/marketplace/checkout/user-seller/route.ts`: await receiver before seller-listing reservation.
- `Website/src/app/api/ynot/marketplace/checkout/pending-orders/route.ts`: await receiver before canonical scalar checkout creation.
- `Website/src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts`: reuse the resolved receiver for the pre-upload guard and Slip2Go.
- `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx`: await instructions before rendering checkout.
- `Website/src/app/(store)/marketplace/orders/[orderId]/page.tsx`: await instructions before rendering payment resume.
- `Website/tools/verification/verify-production-env.mjs`: treat receiver environment values as an optional fallback, while continuing to require core Supabase and Slip2Go credentials.
- `Website/scripts/test-marketplace-ui-checkout.mjs`: lock the receiver source, async guards, and proof-verification binding.
- `Website/scripts/test-marketplace-payment-resume-expiry.mjs`: lock async server-page instruction loading.
- `Website/scripts/test-marketplace-payment-receiver.mjs`: behavioral coverage for canonical selection, immutable snapshot round-trip, and malformed-receiver rejection.

### Reviewer hardening: bind verification to order creation

The initial resolver-only implementation was rejected because it re-read mutable receiver data on listing render, order resume, and proof upload. That creates a time-of-check/time-of-use mismatch if an administrator changes the bank receiver while an order is pending.

The accepted implementation saves `paymentReceiver.version = 1` under the existing `shipping_snapshot` argument passed to the atomic create RPC. It returns the persisted value with the new order, displays it on the payment step, and reads it again for resume/proof. This compatibility location is temporary until the restore-drill gate permits a dedicated payment or checkout-group snapshot. Do not replace it with a fresh receiver lookup for newly created orders.

### Task 1: Lock the resolver and caller contract with failing tests

**Files:**
- Modify: `Website/scripts/test-marketplace-ui-checkout.mjs`
- Modify: `Website/scripts/test-marketplace-payment-resume-expiry.mjs`

- [ ] **Step 1: Add the failing resolver assertions**

Add assertions that require the payment-instructions module to use `createServiceSupabaseClient`, query `payment_methods`, select active `bank_transfer` rows, prefer `bank-transfer`, and export async resolver/guard functions. Require all four checkout routes to await the guard. Require the proof route to store the guard result and use its receiver properties rather than direct `process.env.SLIP2GO_*` receiver reads.

```js
assert.match(paymentInstructions, /createServiceSupabaseClient/);
assert.match(paymentInstructions, /\.from\("payment_methods"\)/);
assert.match(paymentInstructions, /\.eq\("is_active", true\)/);
assert.match(paymentInstructions, /\.eq\("type", "bank_transfer"\)/);
assert.match(paymentInstructions, /code === "bank-transfer"/);
assert.match(paymentInstructions, /export async function getMarketplacePaymentInstructions/);
assert.match(paymentInstructions, /export async function assertMarketplacePaymentReceiverConfigured/);
assert.match(source, /await assertMarketplacePaymentReceiverConfigured\(\)/);
assert.doesNotMatch(proofRoute, /process\.env\.SLIP2GO_(?:PROMPTPAY_ID|BANK_NAME|BANK_ACCOUNT_NUMBER|BANK_ACCOUNT_NAME)/);
```

- [ ] **Step 2: Add the failing server-page assertions**

Require the listing and order detail pages to await instruction resolution before passing the value to client components.

```js
assert.match(listingRoute, /const paymentInstructions = await getMarketplacePaymentInstructions\(\)/);
assert.match(listingRoute, /paymentInstructions=\{paymentInstructions\}/);
assert.match(orderDetail, /const paymentInstructions = await getMarketplacePaymentInstructions\(\)/);
assert.match(orderDetail, /paymentInstructions=\{paymentInstructions\}/);
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```bash
cd Website
npm run test:marketplace-ui-checkout
npm run test:marketplace-payment-resume-expiry
```

Expected: both suites fail because the resolver and callers are still synchronous and the proof route still reads receiver environment values directly.

### Task 2: Resolve the canonical core receiver

**Files:**
- Modify: `Website/src/lib/marketplace/payment-instructions.ts`

- [ ] **Step 1: Add the core payment-method lookup**

Import `createServiceSupabaseClient`, define a narrow receiver-row type, and query only the required fields.

```ts
type ReceiverRow = {
  code: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  promptpay_id: string | null;
};

async function getCoreReceiverRow(): Promise<ReceiverRow | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from("payment_methods")
    .select("code,bank_name,account_name,account_number,promptpay_id,sort_order")
    .eq("is_active", true)
    .eq("type", "bank_transfer")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  return (
    rows.find((row) => row.code === "bank-transfer") ??
    rows.find((row) => row.code !== "main-transfer") ??
    rows[0] ??
    null
  );
}
```

- [ ] **Step 2: Make instruction resolution asynchronous and fail closed**

Build instructions from the selected core row. If lookup throws or returns no row, build them from the existing environment fallback. Do not use the environment fallback when a selected core row exists but is incomplete.

```ts
export async function getMarketplacePaymentInstructions(): Promise<MarketplacePaymentInstructions> {
  let receiver: ReceiverRow | null = null;
  try {
    receiver = await getCoreReceiverRow();
  } catch (error) {
    console.warn("marketplace_payment_receiver_lookup_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return receiver
    ? paymentInstructions({
        bankName: receiver.bank_name,
        accountName: receiver.account_name,
        accountNumber: receiver.account_number,
        promptPayId: receiver.promptpay_id,
      })
    : paymentInstructions({
        bankName: envText("SLIP2GO_BANK_NAME"),
        accountName: envText("SLIP2GO_BANK_ACCOUNT_NAME"),
        accountNumber: envText("SLIP2GO_BANK_ACCOUNT_NUMBER"),
        promptPayId: envText("SLIP2GO_PROMPTPAY_ID"),
      });
}
```

Make `assertMarketplacePaymentReceiverConfigured()` async and await the resolver before applying the existing `503 marketplace_payment_receiver_unconfigured` error.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
cd Website
npm run test:marketplace-ui-checkout
```

Expected: resolver assertions pass; caller assertions still identify every unawaited route/page until Task 3 is complete.

### Task 3: Use one resolved receiver everywhere

**Files:**
- Modify: `Website/src/app/api/ynot/marketplace/checkout/official/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/checkout/user-seller/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/checkout/pending-orders/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts`
- Modify: `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/orders/[orderId]/page.tsx`
- Modify: `Website/tools/verification/verify-production-env.mjs`

- [ ] **Step 1: Await every stock-reservation guard**

Replace each scalar call with:

```ts
await assertMarketplacePaymentReceiverConfigured();
```

Keep the guard before address/account/order creation so an unavailable receiver cannot reserve inventory.

- [ ] **Step 2: Bind proof verification to the guarded receiver**

At the start of the payment-proof `try` block, store:

```ts
const paymentInstructions = await assertMarketplacePaymentReceiverConfigured();
```

Pass these exact values to Slip2Go:

```ts
{
  amountThb: Number(pendingOrder.buyer_total_satang ?? 0) / 100,
  promptPayId: paymentInstructions.promptPayId,
  bankName: paymentInstructions.bankName,
  bankAccountNumber: paymentInstructions.accountNumber,
  bankAccountName: paymentInstructions.accountName,
}
```

- [ ] **Step 3: Await the resolver in both server pages**

Resolve once after the listing/order data and before returning JSX:

```ts
const paymentInstructions = await getMarketplacePaymentInstructions();
```

Pass `paymentInstructions={paymentInstructions}` to the existing client component.

- [ ] **Step 4: Make environment receiver values an optional fallback**

In `verify-production-env.mjs`, run completeness checks only when any receiver fallback field is present. When none is present, print a pass stating that the runtime will resolve core `payment_methods`; the verifier already requires core Supabase service credentials and Slip2Go credentials.

```js
const receiverFallbackPresent = [
  "SLIP2GO_BANK_NAME",
  "SLIP2GO_BANK_ACCOUNT_NAME",
  "SLIP2GO_BANK_ACCOUNT_NUMBER",
  "SLIP2GO_PROMPTPAY_ID",
].some((name) => Boolean(env[name]?.trim()));

if (isProd && receiverFallbackPresent) {
  check("marketplace payment receiver fallback account name is configured", Boolean(env.SLIP2GO_BANK_ACCOUNT_NAME?.trim()), "complete or remove the fallback");
  check("marketplace payment receiver fallback destination is configured", Boolean(env.SLIP2GO_BANK_ACCOUNT_NUMBER?.trim() || env.SLIP2GO_PROMPTPAY_ID?.trim()), "complete or remove the fallback");
} else if (isProd) {
  pass("marketplace payment receiver uses the core payment_methods runtime source");
}
```

- [ ] **Step 5: Run focused suites and confirm GREEN**

Run:

```bash
cd Website
npm run test:marketplace-ui-checkout
npm run test:marketplace-payment-resume-expiry
npm run test:marketplace-official-shop
npm run test:marketplace-user-seller-purchase
```

Expected: all focused tests pass with zero failures.

### Task 4: Verify, commit, deploy, and exercise production

**Files:**
- Verify all files from Tasks 1–3

- [ ] **Step 1: Run static and production-target checks**

Run:

```bash
cd Website
npm run lint
npm run typecheck
npm run cf:build:marketplace
```

Expected: ESLint exits 0, TypeScript exits 0, and the Marketplace Cloudflare build completes successfully.

- [ ] **Step 2: Commit with the repository Lore protocol**

Stage only the design, plan, tests, resolver, six callers, and verifier. Commit with an intent line plus `Constraint`, `Rejected`, `Confidence`, `Scope-risk`, `Directive`, `Tested`, and `Not-tested` trailers. Add `Co-authored-by: OmX <omx@oh-my-codex.dev>`.

- [ ] **Step 3: Push `main` and wait for both production workflows**

Run:

```bash
git push origin main
gh run watch --exit-status
```

Expected: Website and Marketplace Cloudflare workflows succeed on the pushed commit.

- [ ] **Step 4: Perform production browser acceptance**

In Chrome at `https://www.ynotopen.com/marketplace`:

1. Add one listing and open its checkout.
2. Confirm an address and verify Continue is enabled.
3. Continue to transfer instructions and confirm the bank receiver is present without exposing it in logs or the report.
4. Cancel the unpaid order through the buyer UI and confirm inventory/cart truth is restored.
5. Add one listing, navigate back to the Marketplace, add two more, open the cart, and verify all three remain present.
6. Confirm the current cart still offers per-listing checkout only; do not claim combined checkout until the restore-gated schema work is deployed.

Expected: the receiver block is gone, one-listing checkout reaches the transfer/slip stage, unpaid cancellation restores inventory, and the remaining multi-listing limitation is reported explicitly.

- [ ] **Step 5: Record the production boundary**

Report that completing a real paid order requires a genuine transfer and matching slip. Do not fabricate a slip or initiate a financial transfer. Report the restore/PITR gate and user-seller fulfilment gap as blockers to enabling grouped checkout.
