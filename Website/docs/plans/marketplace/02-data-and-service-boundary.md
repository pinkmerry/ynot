# Marketplace Data And Runtime Seam - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Keep marketplace real-money logic separate enough to become its own Cloudflare runtime, while keeping one seamless YNOTT customer experience.

The important rule is simple: YNOTT core owns login, Customer Bag, gacha rewards, Reward Conversion, and reward shipping. Marketplace owns Marketplace Inventory, listings, checkout, THB payment, buyer shipping charge, Marketplace Fee, Seller Payout, and audit.

Gacha rewards from pack opening cannot become Marketplace Inventory.

## Document Role

This document owns the service, database, and module boundary. It should be read as the implementation boundary for docs `01`, `03`, `04`, `05`, `06`, and `07`: customer UX may be seamless, but marketplace money, inventory, payout, and audit stay behind marketplace-owned server modules.

## MVP Runtime Decision Locks

- Marketplace should launch as a separate Marketplace Cloudflare Worker/service for usage isolation, while the Website keeps one visible YNOTT UX.
- Website calls Marketplace through server-only/internal routes or service binding. Browser clients never call privileged Marketplace service APIs directly.
- Marketplace uses a new Marketplace Supabase project for production and a separate SIT/staging Marketplace Supabase before real payment/order testing.
- Prelaunch marketplace access is owner-only. Public browse can be enabled later after snapshot, RLS, secret, and launch-gate checks pass.
- MVP covers both official shop and user-seller consignment flows, but public release stays gated until both money and middleman paths are proven.

## Current Runtime Evidence

Current code is owner-only MVP runtime, beyond the old placeholder shell:

- `Website/wrangler.marketplace.jsonc` defines a separate Marketplace Worker route surface for `/marketplace` and marketplace APIs.
- `Website/src/lib/marketplace/supabase-adapter.ts` connects to the separate Marketplace Supabase project through server-only service-role configuration.
- `Website/src/app/(store)/marketplace/page.tsx` remains owner-only during prelaunch, but reads Marketplace listing snapshots when the Marketplace service is configured.
- `Website/src/app/api/ynot/marketplace/checkout/pending-orders/route.ts` provides the generic Pending Payment Order API while source-specific RPCs stay inside the Marketplace Domain Module.
- `Website/src/app/api/ynot/marketplace/bag/summary/route.ts` provides the Customer Bag Marketplace section without mixing gacha rewards into marketplace inventory.

This document is still the target architecture for public launch, but the runtime now has the owner-only account, listing, checkout, seller, admin, payout, and verification seams that must be hardened before the gate opens.

## MVP Staging Seam

The staging seam keeps current shell work honest:

```text
Phase 0: admin-gated placeholder shell
  -> Phase 1: Marketplace Account Bridge + listing read model
  -> Phase 2: official shop checkout
  -> Phase 3: consignment intake and user-seller listings
  -> Phase 4: owner-only integrated MVP verification
  -> Phase 5: public/owner-approved release with separate Marketplace runtime
```

Public marketplace navigation should stay gated until the Interface can safely support at least:

- Public browse from marketplace snapshots.
- Server-side Marketplace Account Bridge for customer actions.
- Same-origin and rate-limited marketplace mutations.
- Pending Payment Order and idempotent payment proof.
- Hard rejection of Customer Bag and gacha reward IDs as sellable inventory.

## Main Decision

Create a deep Marketplace Domain Module with a small Interface used by the website shell:

- Browse marketplace catalog.
- Resolve listing detail.
- Start Pending Payment Order.
- Submit seller Consignment Intake.
- Run admin review, fulfilment, refund, and Seller Payout actions.

The implementation should target a separate Marketplace Cloudflare Worker/service from the beginning. Local development may run modules together, but production architecture should keep Marketplace behind a server-only boundary so usage, deploys, secrets, and real-money load are isolated from gacha and wallet flows.

This gives leverage now and locality later: money, inventory, and payout bugs concentrate in one Marketplace Domain Module instead of spreading through Customer Bag, gacha, wallet, and shipping code.

## Phase Module Inventory

### Phase 0 Module: Marketplace Shell

Interface:

- Render gated marketplace placeholder.
- Keep navigation hidden from normal customers.
- Show empty state while no marketplace catalog exists.

Implementation:

- Historical status only. The current code has moved the placeholder shell into an owner-only MVP surface backed by Marketplace Supabase adapter, listing snapshots, checkout, seller, admin, and payout modules.

Deletion test: deleting the Phase 0 shell removes only placeholder UX, not marketplace domain rules. It is shallow by design and should not become the long-term seam.

### Phase 1 Module: Marketplace Domain

Interface:

- Resolve marketplace viewer.
- Browse listing snapshots.
- Read listing detail.
- Start safe customer/admin/seller commands through server-only adapters.

Implementation:

- Marketplace Account Bridge.
- Marketplace Supabase adapter.
- Marketplace Inventory, Listing, Order, Money, Admin Workflow, and Customer Bag Aggregator Modules.

Depth target: callers learn one marketplace Interface while the Implementation absorbs database choice, current-worker vs separate-worker runtime, profile verification, money safeguards, and audit.

## Runtime Shape

```text
Browser
  -> YNOTT Website shell
  -> Marketplace Domain Module
       -> Marketplace Supabase project
       -> server-only YNOTT Profile Adapter
       -> server-only YNOTT Reference Adapter
       -> payment provider adapter
       -> shipping provider/manual fulfilment adapter
```

The browser never calls Marketplace Supabase directly for money, listing mutation, admin, payout, or private inventory actions.

## Frontend Composition Boundary

The marketplace frontend should be a YNOTT commerce workspace, not a separate-looking product or a landing page.

Design direction:

- Purpose: let customers browse/buy, sellers submit, and staff operate marketplace work without confusing it with gacha rewards.
- Audience: repeat YNOTT customers and staff who need fast scanning, clear money state, and familiar account navigation.
- Tone: quiet, collectible-focused, operational, and trustworthy.
- Memorable detail: every surface uses a consistent `source badge` pattern: `Official shop`, `User seller`, `Gacha Rewards`, or `Marketplace`.
- Constraints: reuse current YNOTT shell, existing route conventions, existing buttons/forms/tables where possible, and stable mobile layouts.

Frontend ownership rules:

- Pages own layout, responsive composition, focus order, and user-facing copy.
- Domain Interfaces own availability, allowed actions, money values, and state reasons.
- Components receive display models, not raw database rows.
- UI never infers sellability from IDs, reward state, or visible buttons; it renders `can_*` flags and reason codes from Modules.
- Customer Bag composition can place Gacha Rewards and Marketplace beside each other, but their action components remain separate.

## Frontend Surface Matrix

| Surface | Primary UI job | Module data source | Key UX rule |
| --- | --- | --- | --- |
| Marketplace browse | Scan listings and source type quickly. | Listing snapshots. | Cards show THB item price, source badge, condition/grade, and availability; no coin icon. |
| Listing detail | Support a confident one-item purchase decision. | Listing detail snapshot. | Price first, shipping later in checkout, no seller payout details. |
| Checkout | Confirm address, shipping, payment, and total. | Pending-order/quote/order display model. | Browser displays trusted server totals and never recalculates them as authority. |
| Customer Bag | Show two activity families in one account area. | Customer Bag Aggregator. | `Gacha Rewards` and `Marketplace` are sibling sections with separate actions. |
| Seller dashboard | Help sellers submit and track consignment. | Seller Submission Module. | Stepper/status timeline must show that admin inspection is required before listing. |
| Official shop admin | Create and publish YNOTT-owned inventory. | Official Shop Inventory Module. | Official stock controls hide seller payout language. |
| Admin control center | Work queues and risky transitions. | Admin Workflow Module. | Dense queue layout, explicit command confirmation, audit evidence visible on detail. |

## Shared UI State Contract

Every marketplace display model should include enough state for UI to avoid guessing:

- `primary_state_label`
- `state_tone`: `neutral`, `success`, `warning`, `danger`, or `muted`
- `source_badge`
- `can_start_checkout`
- `can_submit_seller_item`
- `can_admin_transition`
- `blocked_reason_code`
- `next_recommended_action`
- `money_display_lines`
- `updated_at`

UI state rules:

- Loading states use stable skeleton dimensions for cards, tables, status strips, and checkout totals.
- Empty states are action-oriented but not promotional; for example, official shop empty browse can point to active filters or upcoming stock, while seller history empty state can point to `Submit to marketplace`.
- Error states use normalized backend codes and avoid raw Supabase/payment/provider messages.
- Disabled actions must show a nearby reason, not just a grey button.
- Long titles, card names, cert numbers, and tracking numbers must wrap cleanly on mobile and desktop.
- Status badges must have text labels and not rely on color alone.

## Backend Runtime Contract

MVP implementation targets a separate Marketplace Worker/service. Local development can temporarily run the same backend module stack inside the current Website Worker, but deployed DB ownership should stay with the Marketplace backend:

```text
Website route handler or Marketplace Worker route handler
  -> Marketplace Domain Module
      -> Marketplace Repository/Adapter
      -> Marketplace RPC Adapter
      -> YNOTT Core Adapters
      -> Provider Adapters
```

Deployment ownership:

- Website owns session UX, page rendering, and the server-only call to Marketplace.
- Marketplace Worker owns Marketplace Supabase credentials, RPC execution, provider adapters, payment/refund/payout transitions, and marketplace audit writes.
- A co-located local route must call the same Marketplace backend adapter used by the Worker so the implementation does not grow two database paths.

Route handlers should stay thin:

- Parse method and query/body.
- Enforce same-origin on mutations.
- Resolve YNOTT profile/admin context.
- Apply rate limit.
- Validate input shape.
- Call one Marketplace Domain Module Interface.
- Map normalized domain errors to HTTP responses.

Domain Modules should not read raw browser-supplied profile, seller, fee, payout, inventory, or admin values. Repository/Adapter code should be the only code that knows table names and RPC names.

## API Surface By Module

Planned API routes:

| Module | Route | Methods | Backend owner |
| --- | --- | --- | --- |
| Account Bridge | `/api/marketplace/account/me` | `GET` | Account Bridge |
| Account Bridge | `/api/marketplace/account/ensure` | `POST` | Account Bridge RPC |
| Listing Query | `/api/marketplace/listings` | `GET` | Listing Query Repository |
| Listing Detail | `/api/marketplace/listings/:listingId` | `GET` | Listing Query Repository |
| Checkout | `/api/marketplace/checkout/pending-orders` | `POST` | Pending Payment Order RPC |
| Checkout | `/api/marketplace/checkout/pending-orders/:pendingOrderId` | `GET` | Money + Shipping Snapshot Modules |
| Checkout | `/api/marketplace/checkout/pending-orders/:pendingOrderId/payment-proof` | `POST` | Payment Proof RPC |
| Seller Submission | `/api/marketplace/seller/submissions` | `GET`, `POST` | Consignment Intake Module |
| Seller Submission | `/api/marketplace/seller/submissions/:submissionId` | `PATCH` | Consignment Intake RPC |
| Official Shop Admin | `/api/marketplace/admin/official-inventory` | `GET`, `POST` | Official Shop Ingestion Module |
| Admin Workflow | `/api/marketplace/admin/workflow` | `POST` | Admin Workflow RPC |
| Payment Webhook | `/api/marketplace/payments/webhook/:provider` | `POST` | Payment Provider Adapter |
| Customer Bag | `/api/marketplace/bag/summary` | `GET` | Customer Bag Aggregator |

Public browse can be cached and anonymous later. Every mutating route requires server-resolved identity, rate limit, idempotency key where state changes, and normalized audit metadata.

## Database Schema Contract

Use Marketplace Supabase as the owner of marketplace state. Prefer a dedicated Marketplace project. If implementation starts in the existing YNOTT project for local development, use a clearly named marketplace schema or table prefix and keep the same RLS/grant rules.

Table groups:

| Group | Tables | Notes |
| --- | --- | --- |
| Account | `marketplace_accounts`, `marketplace_account_events` | Unique `ynot_profile_id`, no Supabase Auth identities |
| Inventory | `marketplace_inventory_items`, `marketplace_inventory_events` | Official and consignment inventory rows |
| Seller intake | `marketplace_seller_submissions`, `marketplace_intake_events` | Physical item submission and inspection |
| Listings | `marketplace_listings`, `marketplace_listing_snapshots` | Public read model and listing history |
| Checkout | `marketplace_orders`, `marketplace_order_items` | Pending Payment Order and order state |
| Money | `marketplace_payment_attempts`, `marketplace_payment_events`, `marketplace_order_money_snapshots`, `marketplace_fee_rules`, `marketplace_money_ledger`, `marketplace_refunds`, `marketplace_seller_payouts`, `marketplace_payout_events` | THB/satang money state |
| Shipping | `marketplace_shipping_quotes`, `marketplace_shipments` | Buyer-paid marketplace fulfilment |
| Admin | `marketplace_admin_commands`, `marketplace_admin_queue_items`, `marketplace_admin_audit_events`, `marketplace_admin_notes` | Command ledger, queue projection, and append-only admin transitions |
| Safety | `marketplace_idempotency_keys`, `marketplace_reconciliation_items` | Replay protection and repair queue |

Baseline constraints:

- Every table has `id uuid primary key`, `created_at`, and where useful `updated_at`.
- State columns use check constraints or enum-like check lists.
- Money columns are integer satang and non-negative unless a ledger row explicitly represents a negative adjustment.
- External YNOTT references are stored as UUID/text snapshots without cross-project foreign keys.
- No table has a nullable source discriminator when source affects money or payout rules.
- Listing source must be Marketplace Inventory ID, never Customer Bag reward ID or gacha reward ID.

## RPC Ownership Matrix

Transaction-safe state changes should be RPCs. Simple read-only browse can use repository queries.

| RPC | Module | Transaction responsibility |
| --- | --- | --- |
| `marketplace_get_or_create_account` | Account Bridge | Upsert account, refresh snapshot, account event |
| `marketplace_accept_seller_terms` | Account Bridge | Record seller terms acceptance and seller capability event |
| `marketplace_create_official_inventory` | Official Shop Ingestion | Create official inventory, source snapshot, audit event |
| `marketplace_publish_official_listing` | Listing Module | Verify official inventory, create listing, create listing snapshot |
| `marketplace_create_seller_submission` | Seller Submission | Create seller draft/submitted row, fee preview snapshot, seller event |
| `marketplace_submit_seller_submission` | Seller Submission | Validate and move draft to submitted intake state |
| `marketplace_record_intake_transition` | Admin Workflow | Receive/inspect/reject seller item, audit event |
| `marketplace_admin_publish_listing` | Listing Module | Verify inspected user-seller inventory, create listing, create listing snapshot |
| `marketplace_create_pending_payment_order` | Pending Payment Order | Lock one active listing or official quantity and freeze money snapshot |
| `marketplace_submit_pending_order_payment_proof` | Payment Module | Store/replay buyer payment proof and verify through Slip2Go/manual review |
| `marketplace_apply_provider_payment_event` | Money Module | Insert provider event idempotently, validate amount/currency, and open reconciliation/admin review instead of trusting webhook-paid state |
| `marketplace_record_refund_transition` | Money/Admin Workflow | Admin refund approval/state transition, expected refund effect, audit event |
| `marketplace_apply_refund_event` | Money Module | Apply provider/manual refund result and ledger entries |
| `marketplace_update_shipment_state` | Shipping/Admin Workflow | Tracking/status transition, audit event |
| `marketplace_release_seller_payout` | Seller Payout | Owner-gated payout transition, audit event |
| `marketplace_mark_seller_payout_paid` | Seller Payout | Record transfer/provider paid evidence and ledger entry |
| `marketplace_open_reconciliation_item` | Reconciliation | Record mismatch and block unsafe follow-on transitions |
| `marketplace_resolve_reconciliation_item` | Reconciliation | Resolve/reopen mismatch with audit evidence |

RPC rules:

- Use fixed `search_path`.
- Revoke execute from `public`, `anon`, and `authenticated` for server-only RPCs.
- Grant execute only to the Marketplace backend service role unless a future direct client path is explicitly designed.
- Validate actor/account/listing ownership inside RPCs as defense in depth.
- Return stable machine-readable error codes for route handlers to map.

## Idempotency And Transaction Rules

Use idempotency keys for every state-changing command:

- Account ensure.
- Seller submission create.
- Official inventory create.
- Listing publish.
- Pending payment order create.
- Order create.
- Payment proof upload.
- Payment webhook apply by provider event ID.
- Refund apply.
- Payout release.
- Admin state transition.

Recommended table shape:

```text
marketplace_idempotency_keys(
  scope text not null,
  subject_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  response_snapshot jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(scope, subject_id, idempotency_key)
)
```

If the same key replays with a different request hash, return a conflict and do not mutate state.

Avoid cross-database transactions. When a marketplace command needs YNOTT profile, admin role, address, or reference data:

1. Read and validate YNOTT data server-side before the Marketplace RPC.
2. Pass only the safe snapshot/reference into Marketplace Supabase.
3. Let the Marketplace RPC commit marketplace state.
4. Use reconciliation jobs for mismatches instead of distributed transactions.

## RLS, Grants, And Data API Rules

Marketplace Supabase rules:

- Enable RLS on every table, including service-only tables, for defense in depth.
- Do not expose the Marketplace service-role key to browser bundles or `NEXT_PUBLIC_*` env vars.
- In deployed MVP, keep Marketplace Supabase service-role credentials in the Marketplace Worker/backend. Website calls Marketplace through service binding or a server-only signed context, not direct table access.
- If the Marketplace project exposes `public` through Supabase Data API, revoke direct mutation grants from `anon` and `authenticated` on state tables.
- Public read models can be exposed only through narrow views/tables with RLS policies that match the public browse decision.
- If using views for public browse, use `security_invoker = true` where supported, or keep views in an unexposed schema.
- Admin, money, payout, payment event, and inventory mutation tables should be server-route/RPC only.
- Add static verification to scan migrations for RLS, grants, service-role leakage, and `security definer` functions without fixed `search_path`.

## Auth Seam

The Marketplace Account Bridge is the only normal entry from YNOTT login/session into marketplace Modules.

Allowed:

- Public read-only browse without a Marketplace Account if product chooses logged-out browse.
- Customer checkout after current YNOTT profile resolves to Marketplace Account.
- Seller and admin actions after the bridge verifies profile/account/admin state.

Not allowed:

- Marketplace Supabase Auth for customers.
- Client-provided `ynot_profile_id`.
- Separate marketplace password or second LINE login.
- Admin role trusted only from marketplace-local snapshots.

## Core Modules

### Marketplace Account Bridge Module

Interface:

- Resolve the current Marketplace Account from the current YNOTT profile.
- Create the Marketplace Account once by `ynot_profile_id`.
- Require buyer, seller, or admin capability.
- Record account bridge audit events.

Implementation:

- Uses current YNOTT profile resolution.
- Stores a marketplace-local `marketplace_accounts` row.
- Stores YNOTT profile ID as an external reference, not a cross-project foreign key.

### Marketplace Inventory Module

Interface:

- Create official Marketplace Inventory from admin input.
- Create consignment Marketplace Inventory after intake and inspection.
- Read inventory snapshots for listing and order display.
- Block duplicate active listings and duplicate active Pending Payment Orders.

Implementation:

- Owns `marketplace_inventory_items`.
- Stores card, variant, condition, grade, language, cert, and image snapshots.
- Refuses any gacha reward ID, Customer Bag row, Reward Conversion row, or reward shipping row as sellable inventory.

#### Official Shop Ingestion Seam

Official shop stock becomes Marketplace Inventory only through an explicit server-side command:

```text
official_stock_reference
  -> official_shop_stock_ingest
  -> marketplace_owned_inventory
  -> Marketplace Listing
  -> Marketplace Order
```

Rules:

- The source may reference existing card or stock metadata for display accuracy.
- The sellable item is created in Marketplace Supabase.
- The command writes an audit event with actor and source reference.
- The command cannot copy a Customer Bag reward or gacha prize unit as sellable inventory.

This seam gives two real adapters for Marketplace Inventory:

- Official Shop Ingestion Adapter.
- Consignment Intake Adapter.

That makes the Marketplace Inventory seam real, not hypothetical.

### Marketplace Listing Module

Interface:

- Create listing from approved Marketplace Inventory.
- Read public listing cards and listing detail.
- Edit or hide listing under policy.
- Create Pending Payment Order for checkout.

Implementation:

- Owns listing price, listing status, listing snapshot, seller display snapshot, and public search/read model.
- Uses the YNOTT Reference Adapter only to validate card or variant references when a listing is created or edited.

### Marketplace Order Module

Interface:

- Start checkout.
- Confirm payment result.
- Drive order state after payment.
- Expose buyer order history and seller sold-item history.

Implementation:

- Owns Marketplace Order, Marketplace Order Item, Pending Payment Order, payment state, shipping state, refund state, and reconciliation events.

### Marketplace Money Module

Interface:

- Calculate seller-side Marketplace Fee.
- Calculate buyer-side service fee.
- Calculate Seller Payout.
- Store payment provider events idempotently.
- Gate Seller Payout release.

Implementation:

- Uses THB minor units.
- Excludes buyer shipping charge and buyer-side service fee from seller revenue.
- Supports official shop orders with no seller payout liability and completion/revenue dashboard projection.

### Marketplace Admin Workflow Module

Interface:

- Review seller submissions.
- Receive and inspect consignment items.
- Approve or reject listings.
- Fulfil paid orders.
- Hold, release, or mark Seller Payout paid.
- Audit every admin action.

Implementation:

- Uses YNOTT admin role resolver through a server-only adapter.
- Writes marketplace audit events for every state transition.
- Keeps admin-controlled refund workflow, plus owner-only controls for payout release, manual override, and high-risk edits.

### Customer Bag Aggregator Module

Interface:

- Render one customer-visible account area with separate sections:
  - Gacha Rewards.
  - Marketplace.

Implementation:

- Fetches YNOTT Customer Bag from YNOTT core.
- Fetches marketplace orders, submissions, listings, and payouts from Marketplace Supabase.
- Composes one UI model without making gacha rewards sellable.

Frontend output:

- A stable account-area model with two top-level sections: `gacha_rewards` and `marketplace`.
- Separate counters for rewards awaiting action, marketplace orders, seller submissions, active listings, sold items, and payout attention.
- Separate action groups so reward conversion buttons cannot be reused for marketplace listing.
- Mobile-friendly section navigation that remains visible above the item lists.
- Empty states that do not imply gacha rewards can be sold in marketplace.

## Data Ownership Rules

### YNOTT Core Supabase Owns

- YNOTT profile and login identity.
- Customer Bag.
- Gacha reward ownership.
- Reward Conversion.
- Reward shipping.
- Wallet/coin flows.
- Card and variant reference truth used by gacha.
- Admin user role truth.

YNOTT core may provide product references, profile status, admin role checks, and customer-confirmed address snapshots. It should not provide marketplace sellability for Customer Bag rewards.

### Marketplace Supabase Owns

- Marketplace Account.
- Marketplace Inventory.
- Official Shop Product.
- Consignment Intake.
- Marketplace Listing.
- Pending Payment Order.
- Marketplace Order.
- THB payment and payment provider events.
- Marketplace Fee.
- Marketplace shipment tracking for marketplace orders.
- Seller Payout.
- Marketplace admin review and audit events.
- Marketplace reconciliation runs.

No cross-project foreign key should be used. Marketplace rows may store external references such as `ynot_profile_id`, card reference ID, or variant ID, but those references are validated by server-side adapters and copied into marketplace snapshots where needed.

Only Marketplace Inventory, Listing, Order, Money, and Admin Workflow Modules may create or mutate marketplace money and inventory rows. YNOTT core reward, shipping, conversion, and wallet Modules should never write them directly.

## Allowed Adapters To YNOTT Core

Marketplace may use these server-only adapters:

- Profile Adapter: resolve current YNOTT profile and profile status.
- Admin Role Adapter: verify owner-only test permissions first, then owner/admin/staff/operator permissions by public-release phase.
- Reference Adapter: validate card, variant, language, grade, and display metadata for listing snapshots.
- Address Adapter: read or copy customer shipping address where the customer confirms it.
- Customer Bag Aggregator Adapter: read Customer Bag for UI composition only.

Marketplace must not use adapters that:

- List Customer Bag rewards as seller inventory.
- Lock a gacha reward for marketplace sale.
- Mark a gacha reward as sold through marketplace.
- Move Marketplace Orders into wallet or gacha ledgers.
- Treat Reward Conversion as a Marketplace Listing.

## Forbidden Interfaces

These Interfaces should not exist in MVP:

- `createMarketplaceListingFromCustomerBagReward`
- `createMarketplaceOrderFromRewardConversion`
- `reserveGachaRewardForMarketplace`
- `paySellerWithWalletCoins`
- `markRewardSoldByMarketplace`
- `syncMarketplaceInventoryFromCollectionItems`

If implementation pressure creates one of these names, the design has crossed the wrong seam.

## First-Pass Marketplace Supabase Tables

- `marketplace_accounts`
- `marketplace_account_events`
- `marketplace_inventory_items`
- `marketplace_inventory_events`
- `marketplace_official_inventory_sources`
- `marketplace_official_stock_movements`
- `marketplace_seller_submissions`
- `marketplace_seller_submission_photos`
- `marketplace_seller_submission_events`
- `marketplace_seller_terms_acceptances`
- `marketplace_seller_handoff_confirmations`
- `marketplace_intake_events`
- `marketplace_listings`
- `marketplace_listing_snapshots`
- `marketplace_listing_media`
- `marketplace_orders`
- `marketplace_order_items`
- `marketplace_order_money_snapshots`
- `marketplace_payment_attempts`
- `marketplace_payment_events`
- `marketplace_shipping_quotes`
- `marketplace_shipments`
- `marketplace_fee_rules`
- `marketplace_money_ledger`
- `marketplace_refunds`
- `marketplace_seller_payouts`
- `marketplace_payout_events`
- `marketplace_admin_commands`
- `marketplace_admin_queue_items`
- `marketplace_admin_audit_events`
- `marketplace_admin_notes`
- `marketplace_audit_events`
- `marketplace_idempotency_keys`
- `marketplace_reconciliation_items`

## Performance Rules

- Public browse should read from Marketplace Supabase or a marketplace read model, not live-join YNOTT core on every card.
- Listing cards should use snapshots created at approval time.
- Checkout must re-read listing, Pending Payment Order, and fee state server-side before payment proof can be accepted.
- Money fields should use integer THB minor units with explicit names such as `item_price_satang`, `shipping_fee_satang`, `buyer_service_fee_satang`, `seller_marketplace_fee_satang`, `seller_payout_satang`, and `buyer_total_satang`.
- Mutations should be idempotent by customer/action/order/provider event key.
- Long fulfilment, payout, image processing, and reconciliation work should run behind queueable jobs or admin workflows, not browser loops.
- Add indexes before launch for active listings, listing detail by slug/ID, active pending order by listing, orders by buyer, orders by seller, payout queue, and admin queues.

## Security Rules

- Marketplace browser APIs, internal service calls, storage access, and webhooks are HTTPS-only in production. HTTP requests redirect or fail closed, secure cookies require HTTPS, and no mixed-content marketplace asset is allowed.
- Same-origin mutation checks for browser-triggered marketplace mutations.
- CSRF/session-cookie protection must follow the existing YNOTT mutation pattern; adding a separate marketplace auth token is not allowed for MVP.
- RBAC is enforced at service and database boundaries. Buyer, seller, admin, operator, and owner permissions come from server-resolved YNOTT identity and admin tables, never from browser-submitted role fields.
- Marketplace owns no password table and no alternate password login. Password hashing and credential lifecycle remain in existing YNOTT/Supabase Auth.
- Rate limits per profile, IP, listing, order, and admin action.
- Server-only Marketplace Supabase service key.
- RLS or locked-down table access even if the browser never receives direct marketplace credentials.
- Admin role checked through YNOTT admin resolver at action time, not trusted from stale marketplace snapshots.
- Webhook events stored by provider event ID before state transitions.
- Seller cannot buy their own listing.
- Seller cannot activate listing before admin-approved Marketplace Inventory exists.
- A gacha reward ID is rejected anywhere a Marketplace Inventory ID is expected.
- All route bodies use schema allowlists; unknown fields fail closed on mutations.
- Database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No raw SQL string concatenation with user input in service code, verification scripts, migration helpers, or `security definer` functions.
- Session timeout follows the existing YNOTT session policy. Privileged marketplace service calls reject expired context, and high-risk owner/admin mutations require a fresh session check when the session is stale.
- CORS stays same-origin for browser APIs. Marketplace service-binding/internal APIs must reject public browser origins and unauthenticated cross-origin calls.
- Marketplace pages should inherit strict security headers from Website; any new image/payment provider domains must be added to CSP deliberately and never through broad `*`, `unsafe-inline`, or `unsafe-eval` allowances.
- Dynamic display content from seller/admin notes, tracking text, and item descriptions is rendered as plain text unless an explicit sanitizer allowlist is implemented.

Security architecture and performance impact:

- Security boundaries define module boundaries: Account Bridge, Listing Query, Checkout/Order, Money, Upload, Admin Workflow, and Reconciliation stay separate so each path can have the narrowest permission and fastest query plan.
- Public reads must use safe snapshot/projection tables or views. Private command tables stay optimized for correctness, locks, RLS, audit, and state transitions, not public browsing.
- RLS policies, source-kind rejection, RBAC checks, and queue membership checks must use indexed predicates. Any policy that requires full-table scans blocks launch.
- Service-binding calls add a hop, so the Website should batch marketplace page data into purpose-built backend endpoints instead of calling one internal route per UI widget.
- Security checks should run in this order for mutations: cheap request shape/rate limit, session/CSRF/RBAC, idempotency lookup, then transactional DB work. This avoids expensive database locks for invalid traffic.
- Prepared statements/parameterized RPCs are both security and performance requirements because they prevent SQL injection and allow stable query planning on hot checkout/admin/payment paths.

## Failure Modes To Design For

Payment proof succeeds after the Pending Payment Order expires:

- Preserve payment event.
- Put order into reconciliation.
- Do not release payout.
- Admin decides refund or manual fulfilment.

Two buyers checkout at the same time:

- Unique active Pending Payment Order per one-unit listing.
- Payment confirmation only succeeds for the winning Pending Payment Order.
- Losing checkout expires or refunds safely.

Marketplace Supabase cannot reach YNOTT profile adapter:

- Public browse continues from snapshots.
- Checkout, seller, admin, and account dashboard actions fail closed.

Admin accidentally updates the wrong item:

- Every state transition writes audit event with actor, target, before/after state, note, and idempotency key.

## Implementation Order

1. Keep current marketplace route as UI shell.
2. Keep marketplace navigation owner-gated while no public read model exists.
3. Add Marketplace Supabase project and migration namespace.
4. Add Marketplace Worker/service boundary and server-only Website-to-Marketplace adapter.
5. Add Marketplace Account Bridge Module from doc 01, including profile-create sync and existing-profile backfill.
6. Add Marketplace Inventory Module with hard Customer Bag/gacha rejection.
7. Add official shop stock ingestion path, including quantity-safe inventory.
8. Add official shop inventory/listing path with a separate official tab/page.
9. Add seller Consignment Intake path for cards, sealed boxes, and sealed packs.
10. Add Pending Payment Order, Marketplace Order, and Money Module with seller fee and buyer service fee.
11. Add admin workflow queues.
12. Add reconciliation and verification scripts.

## Accepted Deep Design Decisions

- Marketplace Worker/service name: `ynott-marketplace`.
- Marketplace Worker config files: `Website/wrangler.marketplace.jsonc` for route deploys and `Website/wrangler.marketplace.ci.jsonc` for route-safe CI deploys.
- Marketplace Supabase project names: `ynott-marketplace-sit` and `ynott-marketplace-prod`.
- Website should call Marketplace Worker through a Cloudflare service binding for internal server calls.
- The `Boo Boo` owner account must be mapped by stable `profile_id` or admin row, not display name.
- All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
