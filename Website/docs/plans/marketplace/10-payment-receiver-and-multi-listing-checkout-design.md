# Marketplace payment receiver and multi-listing checkout design

**Date:** 2026-07-14
**Status:** Receiver fix approved for implementation; multi-listing checkout blocked from production migration until the Marketplace restore-drill gate passes.

## Outcome

1. A buyer can create a one-listing checkout using the same active bank-transfer receiver already used by the YNOTT wallet.
2. The receiver shown to the buyer and the receiver supplied to Slip2Go are always the same resolved record.
3. A later cart checkout can accept two or three compatible listings under one payment obligation without replacing the existing one-listing order, fulfilment, payout, refund, or audit records.
4. No Marketplace production migration is applied before a restore into a separate Supabase project is proven with row-count and hash evidence.

## Current evidence

- The four optional `SLIP2GO_BANK_*` / `SLIP2GO_PROMPTPAY_ID` environment values are absent from local environment files and GitHub Actions configuration.
- The core YNOTT Supabase project has an active canonical `payment_methods.code = 'bank-transfer'` record with the receiver fields required for transfer instructions and Slip2Go verification.
- The wallet already treats that canonical record as the customer-facing payment method.
- Marketplace production has seven completed physical backups, but PITR is disabled and no separate-project restore-drill artifact exists.
- The live Marketplace schema and API are one-listing-per-pending-order and one-listing-per-order throughout.

## Receiver resolution

`getMarketplacePaymentInstructions()` becomes asynchronous and resolves data in this order:

1. Query active core `payment_methods` rows of type `bank_transfer`, ordered by `sort_order`.
2. Prefer the canonical row whose code is `bank-transfer`.
3. If the canonical row is absent, prefer the first non-legacy bank-transfer row; otherwise use the first active bank-transfer row.
4. Only when the core query is unavailable or returns no active bank-transfer row, use the optional environment receiver fields as a fallback.
5. Mark the receiver configured only when account name and either account number or PromptPay ID are present.

An incomplete canonical row remains fail-closed. It must not silently fall back to a different legacy receiver, because the transfer instructions and wallet would otherwise disagree.

All checkout creation routes await `assertMarketplacePaymentReceiverConfigured()` before reserving stock. The payment-proof route stores the returned instructions and passes those exact receiver fields to Slip2Go. No receiver values are logged or sent anywhere except the existing buyer payment-instruction view and verification provider call.

## Multi-listing checkout boundary

The existing `marketplace_orders` row remains a single listing, fulfilment, payout, refund, and audit unit. Converting that table into an order header would break established readers and settlement invariants.

After the restore gate passes, add:

- `marketplace_checkout_groups`: one buyer payment obligation, address/money-policy snapshots, aggregate totals, payment state, expiry, and idempotency metadata.
- `marketplace_checkout_items`: ordered links from a group to the existing per-listing pending order and order rows.
- Nullable `checkout_group_id` links on the existing proof and provider-event records so the existing global slip-deduplication boundary is preserved.

The first grouped release accepts two or three distinct listings. One listing continues through the current RPC. Creation, payment acceptance/rejection, cancellation, and expiry transition every child atomically.

## Compatibility and fulfilment rules

- Compatible group: all official listings, or all user-seller listings belonging to the same seller.
- Mixed official/user-seller listings and listings from different user sellers stay in the cart and must checkout separately.
- Quantity remains fixed at one per listing.
- Shipping is charged once per compatible checkout group and allocated into child totals so existing GMV and order readers remain correct.
- Seller payouts remain one per user-seller child order.
- Refunds remain per child order; group payment status is derived from its children after payment.
- A separate user-seller fulfilment transition must be implemented before grouped user-seller checkout is enabled, because the current production RPC only records official fulfilment.

## API and UI

The canonical cart request will be:

```json
{
  "listingIds": ["listing-1", "listing-2"],
  "shippingAddressId": "address-id",
  "addressConfirmed": true
}
```

The cart will allow selecting at most three available, compatible listings and will explain incompatible choices as "Checkout separately." The buyer sees every selected item, one address, one shipping charge, aggregate fees, one total, and one slip uploader. Non-selected cart items remain unchanged. Successfully reserved items are removed server-side as part of the group transaction.

## Transaction invariants

- Validate one buyer, one currency, one address snapshot, one money policy, no self-purchase, and every listing active/available.
- Sort listing/inventory locks by UUID before acquiring them to avoid deadlocks.
- Reject zero, four or more, duplicate, stale, unavailable, or incompatible listing sets with no partial rows or locks retained.
- The group buyer total equals the sum of allocated child buyer totals.
- One proof verifies the exact aggregate amount; partial payment is unsupported.
- Rejection, cancellation, and expiry restore every child listing and cancel every related held payout in the same database transaction.
- New tables keep RLS enabled, default-deny access, and service-role-only RPC execution.

## Rollout

1. Deploy and verify the receiver-only application fix; it requires no Marketplace migration.
2. Complete a Marketplace restore into a separate Supabase project and record row-count/hash evidence.
3. Add grouped-checkout tables/RPCs without routing traffic to them.
4. Deploy group-aware read support.
5. Enable two-to-three-listing creation behind a feature flag.
6. Enable cart selection after transactional and browser acceptance tests pass.

Rollback is forward-only: disable group creation, release unpaid groups through the group RPC, and retain all child orders, proofs, payouts, and audit history.

## Acceptance tests

### Receiver

- Canonical core `bank-transfer` is selected even when legacy `main-transfer` sorts first.
- A core lookup failure or no active bank-transfer row uses a complete environment fallback.
- An incomplete selected receiver blocks checkout before stock reservation or proof upload.
- Listing checkout and order-resume pages await the same resolver.
- Slip2Go receives the exact resolved bank name, account name, account number, and PromptPay ID; it does not read those fields directly from `process.env`.

### Grouped checkout

- One, two, and three compatible listing paths behave as specified; invalid cardinality and duplicates fail.
- Add one item, navigate away, add two more, return to cart, and submit exactly one three-item checkout request.
- Any stale line rolls back the entire operation.
- One slip changes every child payment state atomically.
- Release and expiry restore every child and payout atomically.
- Existing one-listing order/admin/fulfilment/payout readers continue to work for grouped child rows.
- Production migration remains blocked until restore-drill evidence is present.
