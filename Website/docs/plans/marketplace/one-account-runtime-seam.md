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

### Production Auth Bridge

The marketplace Worker must not need the main website login secrets just to
recognize the current YNOT account. In production, the marketplace runtime sets
`YNOT_WORKER_SURFACE=marketplace` and calls the website-owned internal endpoint:

`GET /api/internal/marketplace/session`

That endpoint runs on the website Worker, verifies
`MARKETPLACE_AUTH_BRIDGE_SECRET` with a constant-time header comparison, then
returns only minimal profile/admin claims:

`profileId`, `authUserId`, `lineUserId`, `displayName`, `adminId`, `adminRole`,
and `authSource`.

The marketplace Worker uses those claims to keep owner-only gates and customer
flows seamless. It does not need `LINE_SESSION_SECRET` or the core
`SUPABASE_SERVICE_ROLE_KEY` for one-account auth.

Required marketplace Worker vars:

- `YNOT_WORKER_SURFACE=marketplace`
- `MARKETPLACE_AUTH_BRIDGE_URL=https://www.ynotopen.com/api/internal/marketplace/session`
- `RATE_LIMIT_BACKEND=marketplace_supabase`
- `MARKETPLACE_ENVIRONMENT=production`
- `MARKETPLACE_SUPABASE_URL=<marketplace project URL>`
- `MARKETPLACE_SUPABASE_PROJECT_REF=<marketplace project ref>`
- `MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF=<same project ref for this environment>`

Required secrets:

- Website Worker: `MARKETPLACE_AUTH_BRIDGE_SECRET`
- Marketplace Worker: `MARKETPLACE_AUTH_BRIDGE_SECRET`
- Marketplace Worker: `MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY`

The bridge secret must be the same random value on both Workers. It must never
be placed in checked-in `wrangler.*.jsonc` vars.

### Production Database Gate

Marketplace route deployment must run:

`npm run verify:marketplace-production-db`

before `cf:deploy:marketplace:routes` attaches production routes. The probe
checks the configured marketplace Supabase ref, verifies that it is not the core
YNOT Supabase ref by default, and calls the exact runtime tables/RPCs required
by browse, filters, money policy, cart/order reads, and durable rate limiting.

If the marketplace project has not been created or linked yet, production route
deployment should stop. Reusing the core YNOT service-role key in the
marketplace Worker is allowed only through the explicit emergency override
`YNOT_ALLOW_CORE_MARKETPLACE_SUPABASE=true`, and that path should be treated as
a temporary incident response exception rather than the long-run architecture.

## Security Rule

Browser requests do not provide trusted marketplace account identity. Server code derives identity from the authenticated YNOT profile.

Marketplace writes must not accept browser-supplied buyer account IDs, seller account IDs, payout account IDs, or actor profile IDs. Mutations use the existing marketplace mutation guard for same-origin checks, launch gates, action flags, rate limiting, request hashing, idempotency, and body allowlists before calling RPCs.

Marketplace API rate limiting runs against the marketplace Supabase project via
`RATE_LIMIT_BACKEND=marketplace_supabase`. This keeps marketplace request
throttling durable across Workers without giving the marketplace runtime the
core YNOT service-role key.

## Operations Rule

Admin monitoring can read marketplace order, seller, payout, and reconciliation state from the marketplace service boundary, but redacted dashboard snapshots should be prepared server-side before rendering. Admin pages should not duplicate service-role orchestration logic inside React page components.

Marketplace scheduled jobs should live in marketplace runtime helpers. Core queue jobs should not need marketplace secrets, and marketplace payment expiry should not need core bulk-open queue bindings.
