# Official Shop Journey - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Support a YNOTT official shop page inside the marketplace, where YNOTT sells its own products or stock directly.

Official shop is one of the MVP commerce slices because YNOTT owns the inventory and controls fulfilment. It should launch in owner-only testing together with the seller-consignment path when both are ready.

## Document Role

This document owns the official-shop journey: YNOTT-owned inventory, official listing publication, quantity-safe Pending Payment Order, buyer checkout, fulfilment, refund, and completion/revenue visibility. It must never create seller payout liability.

## MVP Official Shop Decision Locks

- Official shop appears in a clearly separate marketplace tab/page, not silently mixed with user-seller listings.
- Official shop supports fully functional quantity products in MVP.
- Official shop MVP can sell cards, sealed boxes, and sealed packs.
- Official shop still uses the same Marketplace Inventory, Listing, Pending Payment Order, Order, Money, Shipping, Refund, Audit, and Reconciliation modules.
- Official shop orders do not create seller payout liability.
- Admin needs an official order completion/revenue dashboard so completed official orders and captured money are visible.
- Buyer pays shipping and buyer-side service fee where configured.
- Buyer UI never shows payout wording for official shop.
- Official inventory uses product/card reference, variant or product format, condition where relevant, price, photos, and notes; grade, language, and cert are required when relevant.

## Current Runtime And Launch Gate

Current runtime implements the official-shop slice for owner-only MVP testing:

- Official Marketplace Inventory, listing snapshot publication, official listing browse/detail, Pending Payment Order, payment proof, admin payment/fulfilment/refund routes, and official order dashboard reads exist.
- Listing cards and detail pages show THB item price, not coin-style pricing.
- Buyer checkout remains owner-only during prelaunch and uses the existing YNOTT account plus server-validated shipping address.
- Official shop orders do not create seller payout liability.

Do not launch official shop publicly until:

- Marketplace Account Bridge exists for checkout.
- Marketplace Snapshot Adapter can serve official listing cards and details.
- Official Shop Ingestion Adapter can create Marketplace Inventory.
- Pending Payment Order and Marketplace Order Modules exist.
- Marketplace Money Module can record official order completion/revenue without seller payout liability.
- Admin fulfilment and refund/reconciliation queues exist.

## Official Shop Difference

Official shop products are owned by YNOTT, not user sellers.

No seller payout is needed. Official orders must still appear in admin completion/revenue dashboards for fulfilment, refund, and reconciliation.

Buyer still pays:

- Item price.
- Shipping fee.
- Buyer-side service fee when configured.

Official shop products still use Marketplace Inventory, Marketplace Listing, Pending Payment Order, Marketplace Order, payment, shipping, refund, and audit rules. They do not use Consignment Intake or Seller Payout release.

## Official Shop Architecture Seam

Official shop should be a deep Module with a small Interface:

- `createOfficialInventory`
- `publishOfficialListing`
- `createOfficialPendingPaymentOrder`
- `markOfficialOrderFulfilled`
- `archiveOfficialInventory`

Implementation:

- Uses Official Shop Ingestion Adapter to create Marketplace Inventory.
- Uses Reference Adapter only for card/variant/stock metadata snapshots.
- Uses Marketplace Listing Module for public listings.
- Uses Pending Payment Order Module for buyer holds.
- Uses Marketplace Money Module for item price, shipping fee, buyer service fee, buyer total, and official order revenue/completion state.
- Uses Admin Workflow Module for fulfilment, refunds, audit, and reconciliation.

Depth target: buyer pages and admin pages know official shop intents only. They should not know whether a card reference came from existing card stock metadata, a manual product entry, or future official stock tooling.

## Official Shop Frontend Design Direction

Official shop should be the clearest and calmest marketplace surface because YNOTT owns the item and fulfils the order.

- Purpose: let buyers confidently buy YNOTT-owned inventory and let admins publish/fulfil it without seller-payout complexity.
- Audience: buyers who trust YNOTT stock, and staff creating official listings.
- Tone: clean retail, verified source, low-friction checkout.
- Memorable detail: every official product uses a consistent `Official shop` source badge and fulfilment promise.
- Constraints: show real product/card images, THB price, no seller payout copy, no gacha reward source language.

Buyer-facing rules:

- Official shop must have a clearly separate tab/page inside marketplace.
- First viewport should show actual official products or a clear official-shop empty state, not a marketing hero.
- Product cards should emphasize official source, condition/grade, price, and availability.
- Official products should not show seller name, seller payout, marketplace fee, or consignment status.
- If official stock is not available, empty state should say official stock is not available yet and point back to all marketplace listings if public browse is enabled.

Admin-facing rules:

- Official inventory creation should feel like stock publishing, not seller intake.
- Admin screens should show publish readiness: required fields, image readiness, price, quantity/individual unit, snapshot status.
- Official order fulfilment should use the same admin queue style as other marketplace orders, but with payout controls hidden.
- Staff should see official order completion/revenue state in admin detail/audit context, not seller payout copy.

## Official Shop API Contract

Official shop administration uses admin-only Website routes. Buyer browse and checkout reuse the buyer listing/order routes from doc 03.

| Route | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/marketplace/admin/official-inventory` | `GET` | Official Shop Inventory Module | Return official inventory rows by status, cursor, and source reference. |
| `/api/marketplace/admin/official-inventory` | `POST` | Official Shop Inventory Module | Create draft official Marketplace Inventory. |
| `/api/marketplace/admin/official-inventory/:inventoryId` | `GET` | Official Shop Inventory Module | Return admin detail, audit summary, and publish readiness. |
| `/api/marketplace/admin/official-inventory/:inventoryId` | `PATCH` | Official Shop Inventory Module | Edit draft or ready official inventory with optimistic version check. |
| `/api/marketplace/admin/official-inventory/:inventoryId/publish` | `POST` | Marketplace Listing Module | Publish official listing and freeze public snapshot. |
| `/api/marketplace/admin/official-inventory/:inventoryId/archive` | `POST` | Official Shop Inventory Module | Archive inventory with no active Pending Payment Order/order. |
| `/api/marketplace/admin/official-listings/:listingId` | `PATCH` | Marketplace Listing Module | Hide, unhide, or update listing display fields under admin guard. |
| `/api/marketplace/admin/official-orders/:orderId/fulfilment` | `POST` | Admin Workflow Module | Record official order fulfilment/tracking transition. |

Route rules:

- Every official-shop mutation requires admin role, same-origin validation, admin rate limit, idempotency key, and audit actor.
- The server derives the official seller account. Request bodies must reject `seller_marketplace_account_id`, seller payout state, `seller_payout_satang`, buyer IDs, and workflow actor IDs from the browser.
- Admin input may include card/stock reference IDs for snapshot lookup, but not as sellable Customer Bag/gacha reward ownership.
- Publish and archive routes must use transaction-backed RPCs. UI checks are only hints.
- Buyer-facing official listings are read from the same marketplace snapshots as user-seller listings with `seller_type = 'official_shop'`.

## Official Shop Database Contract

Official shop should share core Marketplace Inventory and Listing tables, but the official source metadata should be explicit.

Recommended tables or table partitions:

| Object | Purpose |
| --- | --- |
| `marketplace_inventory_items` | Canonical physical/quantity inventory row used by official shop and seller consignment. |
| `marketplace_official_inventory_sources` | Official-only source metadata, admin reference, and procurement/source note. |
| `marketplace_listings` | Public listing lifecycle row shared by seller types. |
| `marketplace_listing_snapshots` | Buyer card/detail read model generated at publish/update. |
| `marketplace_inventory_events` | Append-only inventory state audit events. |
| `marketplace_official_stock_movements` | Quantity stock adjustments for official products. |

`marketplace_inventory_items` official fields:

- `id uuid primary key`
- `seller_type text not null check (seller_type = 'official_shop' or seller_type = 'user_seller')`
- `source_kind text not null`
- `source_reference_id text null`
- `official_source_id uuid null`
- `consignment_submission_id uuid null`
- `owner_marketplace_account_id uuid null`
- `status text not null`
- `title_snapshot text not null`
- `category text not null`
- `condition_code text null`
- `variant_snapshot jsonb not null default '{}'::jsonb`
- `quantity_total integer not null default 1 check (quantity_total > 0)`
- `quantity_available integer not null default 1 check (quantity_available >= 0)`
- `item_price_satang integer not null check (item_price_satang > 0)`
- `currency text not null check (currency = 'THB')`
- `seller_payout_state text not null default 'not_applicable'`
- `version bigint not null default 1`
- `created_by_admin_profile_id uuid not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Official constraints:

- When `seller_type = 'official_shop'`, `source_kind = 'official_stock'`.
- When `seller_type = 'official_shop'`, no seller payout row is created and `seller_payout_state = 'not_applicable'` if a state column is needed for projections.
- When `seller_type = 'official_shop'`, `consignment_submission_id is null`.
- When `seller_type = 'official_shop'`, no row may reference `customer_bag_reward_id`, `gacha_reward_id`, wallet, draw, or reward conversion data.
- Quantity rows must keep `quantity_available <= quantity_total`.
- Individual collectible rows should use `quantity_total = 1` and `quantity_available in (0, 1)`.

Indexes:

- `(seller_type, status, updated_at desc)` for admin inventory lists.
- `(source_kind, source_reference_id)` for duplicate source checks.
- `(seller_type, status, item_price_satang)` for publish readiness and reporting.
- Partial index on official active listings by `(published_at desc, listing_id)` for official shop browse.

## Official Shop RPC Contract

Official shop state changes should be transactional and auditable.

| RPC / Command | Owner | Responsibility |
| --- | --- | --- |
| `marketplace_create_official_inventory` | Official Shop Inventory Module | Create official inventory draft and source metadata. |
| `marketplace_update_official_inventory` | Official Shop Inventory Module | Edit draft/ready inventory with version check and audit event. |
| `marketplace_publish_official_listing` | Marketplace Listing Module | Validate inventory, create listing, freeze snapshot, and mark inventory active. |
| `marketplace_update_official_listing` | Marketplace Listing Module | Hide, unhide, or update public-safe display snapshot fields with version check and audit event. |
| `marketplace_hide_official_listing` | Marketplace Listing Module | Hide active official listing when no disallowed Pending Payment Order/order state blocks it. |
| `marketplace_archive_official_inventory` | Official Shop Inventory Module | Archive draft/ready/active inventory with no active Pending Payment Order/order. |
| `marketplace_record_official_fulfilment` | Admin Workflow Module | Move paid official order through fulfilment/shipping states. |

RPC rules:

- Every admin mutation accepts `p_request_id`, `p_idempotency_key`, `p_admin_profile_id`, and a version or expected state.
- RPCs validate admin authorization before writing.
- RPCs write `marketplace_inventory_events` or admin workflow audit rows in the same transaction as the state change.
- Publish RPC creates/updates listing snapshots in the same transaction as listing activation.
- Official publish must hard-set `seller_type = 'official_shop'` and seller payout as not applicable; it must not trust client-submitted values.
- Archive/hide RPCs lock listing, inventory, Pending Payment Order, and order rows needed to prevent selling an archived item.
- Quantity decrement during Pending Payment Order creation is owned by Pending Payment Order Module, not by the buyer route or admin UI.

## Official Quantity And Pending Payment Contract

MVP supports quantity products, and quantity handling must be transaction-owned.

- Pending Payment Order RPC locks the official inventory row before decrementing `quantity_available`.
- A quantity listing can create a Pending Payment Order only when `quantity_available > 0` and listing is active.
- Pending Payment Order expiration or payment cancellation returns quantity through an idempotent release path.
- Paid orders do not return quantity unless a refund/return workflow explicitly restocks the item.
- Admin edits cannot lower `quantity_total` below already sold or pending-payment quantity.
- Public browse can show cached stock status, but Pending Payment Order creation decides the real availability.

## Official Shop RLS, Grants, And Security Contract

- Official shop admin, inventory, source, image upload, stock correction, and fulfilment APIs are HTTPS-only in production. HTTP requests redirect or fail closed, secure admin cookies require HTTPS, and official product media must not introduce mixed content.
- Official shop mutations require same-origin validation and the current YNOTT CSRF/session-cookie protection pattern.
- Official shop RBAC is enforced server-side from YNOTT admin/owner permissions. Browser-submitted actor IDs, role grants, source trust flags, procurement fields, stock deltas, or official/seller ownership claims are rejected.
- Official shop does not store marketplace passwords. Existing YNOTT/Supabase Auth owns password hashing, credential reset, login throttling, and primary session issuance for owner/admin users.
- Official inventory, product detail, stock correction, image attach, and fulfilment inputs use schema allowlists. Unknown fields, malformed form-data, Customer Bag/gacha references, and caller-supplied procurement/payout/status fields fail closed.
- Official shop database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No SKU, title, note, source label, tracking text, or admin filter is concatenated into SQL.
- Official admin routes follow the YNOTT session timeout policy. Stock correction, source edit, inventory activation, official order fulfilment, and manual override require a fresh owner/admin session check when stale.
- Enable RLS on official inventory/source/event tables and shared listing tables.
- Official admin routes should call the Marketplace backend/Worker for mutations. The Marketplace backend owns service-role access; do not expose service-role keys to the browser.
- Revoke direct mutation grants from `anon` and `authenticated` on official inventory and listing tables unless a later design intentionally exposes narrow policies.
- Public listing read models should expose only buyer-safe fields. Keep admin source notes, procurement costs, audit actors, and hidden stock notes out of public views.
- Server-only RPCs revoke `execute` from `public`, `anon`, and `authenticated`; grant only to the Marketplace backend service role.
- Any `security definer` RPC must set fixed `search_path`, validate admin actor inside the function, and avoid accepting trusted role/status values from the client.
- Official photo originals stay private. Public image derivatives are attached to listing snapshots after admin approval.
- Official inventory mutations must use strict schema allowlists. Unknown fields, browser-submitted procurement cost, payout fields, actor IDs, source trust flags, or Customer Bag/gacha source references fail closed.
- Official product titles, notes, source labels, and tracking text render as plain text unless a future sanitizer allowlist is explicitly implemented.
- Official image uploads use private storage, file size/type/extension/magic-byte checks, duplicate hash detection, scan/quarantine status, EXIF stripping, and backend-generated public derivatives.
- Stock quantity corrections require admin note, reason code, expected version, idempotency key, and audit event. Direct browser quantity deltas must never bypass the official inventory RPC.

Security architecture and performance impact:

- Public official-shop browse should read listing/product snapshots with safe stock status, not the admin inventory/source tables.
- Official stock correction, source edit, image approval, and fulfilment commands stay behind admin/owner command paths so public product pages remain cacheable and simple.
- Product stock mutations should update or invalidate public snapshots after the transaction commits. Public cache may show stale browse availability briefly, but Pending Payment Order creation must re-check live stock atomically.
- Official image validation and derivative generation should run outside the public browse path; product cards use already-approved derivatives only.
- Admin list views use projection rows and counts by indexed product/order state. Procurement notes, source trust, full audit, and private evidence load only on detail routes.

## Official Inventory Flow

```text
Admin marketplace console
  -> create official Marketplace Inventory
  -> add product/card/item details
  -> attach reference metadata where available
  -> add images
  -> set condition/variant/grade/language/cert where relevant
  -> set available quantity or individual item unit
  -> set price
  -> publish Marketplace Listing
```

Official inventory should be separate from gacha prize stock and Customer Bag rewards. Existing card stock and card/variant data can be used as references, but not as the sellable marketplace row.

Official ingestion flow:

```text
card_or_stock_reference
  -> Official Shop Ingestion Adapter
  -> Marketplace Inventory with seller_type: official_shop
  -> Marketplace Listing
  -> Pending Payment Order
  -> Marketplace Order with no seller payout liability
```

Rules:

- `source = official_stock`
- `seller_type = official_shop`
- No `consignment_submission_id`.
- No `customer_bag_reward_id`.
- No `gacha_reward_id`.
- No Seller Payout row except optional reporting/projection row marked `seller_payout_state = not_applicable`.
- Ingestion writes audit event with admin actor and source reference.

## Product Models

MVP can support two official shop product shapes:

- Individual item: one physical card or sealed product unit, one Marketplace Inventory row, one active Marketplace Listing.
- Quantity product: one product group such as sealed packs or sealed boxes with controlled quantity and transaction-safe Pending Payment Order/release.

For the safest MVP, prefer individual item records first for cards, slabs, or high-value collectibles.

Quantity products are allowed only through the same transaction-safe Pending Payment Order/release Interface. A shallow quantity Module would leak race-condition complexity into checkout and should block launch.

## Product Detail

Official product should include:

- Name.
- Product type.
- Price.
- Stock availability.
- Images.
- Description.
- Condition if physical/individual item.
- Variant/grade/language/cert where relevant.

## Official Product UI Layout

Buyer card layout:

1. Product image.
2. `Official shop` badge.
3. Product title.
4. Condition/grade/variant summary.
5. Availability or quantity label.
6. THB item price.

Buyer detail layout:

- Image gallery with stable aspect ratio and thumbnails.
- Official source badge near title.
- Price and availability above primary action.
- Item facts: category, condition, variant, grade, language, cert, quantity.
- Shipping expectation and return/refund summary.
- Checkout action reuses buyer checkout UI and does not show seller payout fields.

Responsive rules:

- Cards stay readable at mobile widths; long product names wrap before price/action rows.
- Official source badge must not take over the title line on small screens.
- Quantity availability should be text-labeled, not only color or icon.

## Official Admin Inventory UI

Admin create/edit should be a structured form:

- Source/reference lookup.
- Product/item details.
- Image upload/selection.
- Condition/variant/grade/language/cert.
- Quantity or individual-item mode.
- THB price.
- Publish readiness checklist.
- Audit note when publishing, hiding, or archiving.

Readiness checklist:

- Required product fields complete.
- At least one approved product image.
- Price valid.
- Official source confirmed.
- Snapshot ready.
- No active conflicting Pending Payment Order/order.

UX rules:

- Use inline validation before publish.
- Hide seller payout controls completely for official inventory.
- Quantity mode should show pending-payment/sold/available counts separately.
- Admin archive/hide actions require confirmation when public listing exists.
- Image upload/selection should show processed thumbnails and keep private originals out of queue cards.

## Official Inventory States

First pass:

- `draft`
- `ready_for_listing`
- `active`
- `pending_payment`
- `sold`
- `fulfilled`
- `returned`
- `archived`

## Official Inventory State Machine

| From | Event | To | Actor | Guard |
| --- | --- | --- | --- | --- |
| `draft` | details complete | `ready_for_listing` | admin | required fields, images, price candidate |
| `ready_for_listing` | publish listing | `active` | admin | listing snapshot created, `seller_type: official_shop` |
| `active` | Pending Payment Order created | `pending_payment` | Pending Payment Order Module | unique active pending order or quantity decrement |
| `pending_payment` | payment confirmed | `sold` | Payment Adapter + Order Module | idempotent provider event |
| `sold` | admin fulfils | `fulfilled` | Admin Fulfilment Adapter | tracking or fulfilment note |
| `sold` | refund/return approved | `returned` | Admin Workflow Module | refund/return reason |
| `draft` or `ready_for_listing` or `active` | archive | `archived` | admin | no active Pending Payment Order/order |

## Official Listing States

First pass:

- `draft`
- `active`
- `pending_payment`
- `sold`
- `hidden`
- `cancelled`
- `archived`

## Official Listing State Machine

| From | Event | To | Owner |
| --- | --- | --- | --- |
| `draft` | publish | `active` | Official Shop Inventory Module |
| `active` | Pending Payment Order created | `pending_payment` | Pending Payment Order Module |
| `pending_payment` | payment confirmed | `sold` | Marketplace Order Module |
| `active` | admin hide/archive | `hidden` or `archived` | Admin Workflow Module |
| `pending_payment` | Pending Payment Order expires | `active` | Pending Payment Order Module |
| `sold` | refund/cancel approved | `cancelled` | Admin Workflow Module |

Only Pending Payment Order Module should move `active -> pending_payment`. Only payment confirmation should move `pending_payment -> sold`.

## Buyer Flow

Official shop checkout can reuse the buyer checkout flow:

```text
Official product detail
  -> Pending Payment Order
  -> checkout
  -> shipping fee
  -> payment
  -> Marketplace Order
  -> admin ships from YNOTT store
```

Shipping fee and buyer-side service fee are charged to buyer. There is no seller payout. Marketplace margin/reporting can be recorded internally, but it must not create seller payout liability.

Official checkout money snapshot:

- `item_price_satang`
- `shipping_fee_satang`
- `buyer_service_fee_satang`
- `buyer_total_satang`
- `currency`
- `seller_type = official_shop`
- `seller_payout_state = not_applicable`
- `payment_event_id`
- `calculation_version`

## Admin Fulfilment Flow

```text
Paid official order
  -> admin verifies stock
  -> admin packs item
  -> admin adds carrier/tracking
  -> buyer sees shipped
  -> order completed after delivery/admin completion
```

Admin action should use the same Marketplace Admin Workflow Module as user-seller orders so staff learn one control center.

Admin workflow compatibility:

- Official orders use the same queue surface for payment, fulfilment, refunds, and reconciliation.
- Seller Payout action path is disabled for official orders.
- Admin cannot release payout for official shop order.
- Audit still records every official inventory, listing, order, refund, and fulfilment transition.

## Required Modules

### Official Shop Inventory Module

Interface:

- Create official Marketplace Inventory.
- Publish official Marketplace Listing.
- Create Pending Payment Order for official checkout.
- Mark official inventory sold/fulfilled/returned.
- Archive official inventory.

Implementation:

- Stores official inventory in Marketplace Supabase.
- Uses official seller actor owned by YNOTT.
- Bypasses Consignment Intake and Seller Payout.
- Requires `source: official_stock`.
- Requires `seller_type: official_shop`.
- Requires seller payout to be not applicable when publishing or reserving.

### Official Fulfilment Adapter

Interface:

- Create shipping work item.
- Store tracking.
- Mark shipped/delivered/completed.

Implementation:

- Can begin with manual admin fulfilment.
- Can later connect to a shipping provider without changing buyer checkout.

### Seller Type Adapter

Interface:

- Stamp official listing with `seller_type: official_shop`.
- Reject user-seller and consignment-only fields.
- Disable payout actions for official orders.

Implementation:

- Checks source adapter at inventory creation and listing publish.
- Rejects `consignment_submission_id`, `customer_bag_reward_id`, and `gacha_reward_id`.
- Keeps official and seller-consignment paths separate until both become Marketplace Inventory.

## Security And Performance

- Official product creation requires admin role.
- Price and stock edits require audit events.
- Active listing card uses marketplace snapshots.
- Checkout re-checks Pending Payment Order and inventory state server-side.
- Manual fulfilment actions require same-origin, admin session, rate limit, and audit.
- Official inventory must never point to Customer Bag reward IDs.
- Official inventory must never point to gacha reward IDs.
- Official listing publish requires `seller_type: official_shop`.
- Official checkout requires no seller payout liability.
- Official stock changes must not mutate gacha prize stock or Customer Bag rows.

## Official Shop Backend Error Contract

Official shop APIs return stable admin-safe error codes.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_admin_required` | `403` | Caller is not allowed to manage official shop inventory. |
| `marketplace_official_inventory_not_found` | `404` | Inventory row does not exist or is outside official shop scope. |
| `marketplace_official_inventory_state_invalid` | `409` | Current state does not allow the requested edit, publish, hide, or archive action. |
| `marketplace_official_inventory_version_conflict` | `409` | Admin edited an old inventory version. |
| `marketplace_official_required_fields_missing` | `422` | Publish requires missing title, category, image, price, condition, or snapshot data. |
| `marketplace_official_source_duplicate` | `409` | The same official source reference is already represented by active inventory. |
| `marketplace_invalid_inventory_source` | `422` | Request attempted to source from Customer Bag, gacha, wallet, reward conversion, or consignment data. |
| `marketplace_official_active_pending_order_exists` | `409` | Inventory/listing cannot be archived or quantity-edited while a Pending Payment Order is active. |
| `marketplace_official_order_exists` | `409` | Inventory/listing cannot be removed because an order already exists. |
| `marketplace_idempotency_conflict` | `409` | Same idempotency key was reused with a different request hash. |
| `marketplace_rate_limited` | `429` | Admin mutation exceeded allowed retry rate. |

Error responses include `request_id`, `code`, `message`, and optional `current_status`, `current_version`, or `missing_fields`. They must not include procurement costs, hidden source notes, or private audit details.

## Official Shop Query Performance Contract

- Official browse uses the shared listing snapshot read model with `seller_type = 'official_shop'`.
- Admin inventory list uses cursor pagination by `(updated_at, id)` and filters by status/source reference.
- Admin publish readiness should be computed from indexed inventory fields and a bounded photo count query.
- Avoid joining official admin lists to payment events, buyer addresses, or fulfilment audit history.
- Official order fulfilment queues reuse admin workflow projections instead of scanning raw order and inventory tables per request.
- Cache public official listing cards with short TTL or tag invalidation on publish, hide, pending-payment, sold, and archive events.
- Pending Payment Order and payment-proof RPCs must ignore cached availability and lock current inventory/listing rows.
- Quantity products need targeted concurrency tests before launch; otherwise use individual-item inventory for MVP.

## Launch Recommendation

Official shop can be verified before user-seller checkout as a lower-risk verification slice, but this does not remove user-seller consignment from MVP scope. Use this order if the team wants to prove real-money checkout before adding seller payout liability:

1. Account bridge.
2. Marketplace Supabase schema.
3. Official Shop Inventory Module.
4. Buyer checkout and payment.
5. Admin fulfilment.
6. Refund/reconciliation.

## Accepted Deep Design Decisions

- Official SKU/variant structure uses product type, reference ID, variant, and condition or quantity mode.
- Official stock movement reason codes: `created`, `adjusted`, `pending_payment`, `expired_release`, `paid_sold`, `refund_restock`, `admin_correction`.
- Official product photo originals stay private; public listing uses processed images.
- Official completion/revenue dashboard columns: order ID, product, paid total, item revenue, buyer service fee, shipping charged, refund state, fulfilment state, and completed timestamp.
