# Marketplace One-Account Runtime Seam

This seam protects the product promise that marketplace feels like the same YNOT account while the real-money marketplace internals remain separated from gacha, wallet coins, and Customer Bag operations.

## User Flow

1. Customer signs in once with YNOT.
2. Customer opens `/marketplace`.
3. Public browse reads grouped marketplace products and offers.
4. Customer adds an offer to cart.
5. Backend resolves the current YNOT profile and loads or creates the internal Marketplace Account.
6. Customer creates a pending payment order.
7. Customer pays by bank transfer and uploads slip proof.
8. Backend validates payment proof and updates the pending order state.
9. Customer sees the order in `/marketplace/orders`.
10. Seller flows use the same YNOT session and internal Marketplace Account.

## Backend Rule

Every marketplace buyer/seller action follows:

`current YNOT profile -> marketplace launch gate -> action flag -> rate limit -> request hash/idempotency -> Marketplace Account -> RPC`.

The shorter identity rule is:

`current YNOT profile -> Marketplace Account -> allowed action`.

Browser requests do not provide trusted marketplace account identity. Server code derives the Marketplace Account from the authenticated YNOT profile, then applies the route-specific action flag and RPC contract.

## Runtime Rule

Marketplace customer pages, marketplace admin pages, and marketplace HTTP routes are owned by the marketplace Worker route set. The split is internal; the public domain and session stay the same.

The Worker split exists to keep marketplace traffic, payment-proof handling, payout operations, and marketplace scheduled jobs from sharing unnecessary blast radius with gacha pack opening and core reward operations.

## Security Rule

Browser requests do not provide trusted marketplace account identity. Server code derives identity from the authenticated YNOT profile.

Marketplace writes must not accept browser-supplied buyer account IDs, seller account IDs, payout account IDs, or actor profile IDs. Mutations use the existing marketplace mutation guard for same-origin checks, launch gates, action flags, rate limiting, request hashing, idempotency, and body allowlists before calling RPCs.

## Operations Rule

Admin monitoring can read marketplace order, seller, payout, and reconciliation state from the marketplace service boundary, but redacted dashboard snapshots should be prepared server-side before rendering. Admin pages should not duplicate service-role orchestration logic inside React page components.

Marketplace scheduled jobs should live in marketplace runtime helpers. Core queue jobs should not need marketplace secrets, and marketplace payment expiry should not need core bulk-open queue bindings.
