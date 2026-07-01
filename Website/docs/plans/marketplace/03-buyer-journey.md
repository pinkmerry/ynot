# Marketplace Buyer Journey - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Let a buyer browse Marketplace Listings, see simple item pricing first, and see shipping plus final THB total only when checkout starts.

Buyer experience should feel seamless inside YNOTT, but buyer money actions must cross the Marketplace Account Bridge and Marketplace Order Module. No Customer Bag reward can be purchased, locked for checkout, sold, or paid out through this path.

## Document Role

This document owns buyer-facing marketplace behavior: browse, listing detail, pending payment order, order creation, buyer history, and buyer-safe read models. It must not define seller payout, admin transition, or gacha reward mutation rules except as buyer-facing exclusions.

## MVP Buyer Decision Locks

- Prelaunch buyer access is owner-only for testing.
- After launch gates pass, browse and listing detail may be visible before login.
- Checkout, order history, Customer Bag Marketplace activity, and any pending-payment/payment action require login through the existing YNOTT account.
- Public browse/detail must not create marketplace account rows. Marketplace account rows are created/synced from YNOTT profile creation/backfill, with idempotent repair on first authenticated action.
- Listing detail shows item price and availability first.
- Checkout shows item price, shipping fee, buyer-side service fee, and total in THB. All values come from server-created snapshots.
- Buyer does not see the internal seller-side marketplace fee or seller payout calculation.
- Buyer pays shipping.
- Browser requests never send trusted money totals, fee rates, seller IDs, buyer IDs, or payout values.

## Current Phase Scope

Current runtime implements this as an owner-only MVP buyer slice:

- `/marketplace` remains owner-only during prelaunch, with browse controlled by `YNOT_MARKETPLACE_BROWSE_ENABLED`.
- Listing cards and detail pages read Marketplace listing snapshots and show THB item price first.
- Checkout requires the existing YNOTT login, a server-validated saved shipping address, same-origin mutation, rate limit, idempotency key, and a server-created Pending Payment Order.
- Checkout then shows item price, buyer-side service fee, shipping fee, and final THB total from server snapshots.
- Buyer order history and order detail are available under `/marketplace/orders`.
- Customer Bag has a separate Marketplace tab backed by `/api/marketplace/bag/summary`; Customer Bag rewards still cannot become Marketplace Inventory.

Do not remove the marketplace gate for buyers until these are live:

- Marketplace Account Bridge for customer actions.
- Marketplace snapshot browse/detail read model.
- Pending Payment Order Module.
- THB quote and order money fields.
- Same-origin, rate-limited, idempotent checkout mutations.
- Gacha reward and Customer Bag rejection at listing, Pending Payment Order, and checkout seams.

## Buyer Entry Points

- Marketplace navigation item.
- Official shop page or official shop filter.
- Product/listing links from home or pack pages.
- Customer Bag `Marketplace` section.
- My marketplace orders page.

Logged-out browse can be allowed after launch gates pass, but checkout requires a resolved YNOTT profile and Marketplace Account. During prelaunch, even browse stays owner-only.

## Buyer Module Map

### Marketplace Buyer Browse Module

Interface:

- Return listing cards by filter, sort, and page cursor.
- Expose public-safe listing snapshots only.
- Format item price as THB from integer satang fields.

Implementation:

- Reads Marketplace Supabase or a marketplace read model.
- Does not call Customer Bag, gacha reward, wallet, or Reward Conversion data.
- Does not create Marketplace Account for anonymous browse.

### Marketplace Listing Detail Module

Interface:

- Return one listing detail snapshot.
- Return availability state.
- Return item price, seller type, condition, variant, grade, language, and cert display.
- Return whether the viewer may start checkout.

Implementation:

- Reads Marketplace Listing and Marketplace Inventory snapshots.
- Does not expose seller payout details.
- Rejects detail requests for non-active or hidden listings unless privileged admin context allows it.

### Pending Payment Order Module

Interface:

- Create one short-lived Pending Payment Order for one active listing and one buyer.
- Produce a checkout quote and frozen money snapshot.
- Expire or cancel Pending Payment Order.
- Reject self-purchase, stale price, sold listing, and blocked account.

Implementation:

- Owns Pending Payment Order writes.
- Stores quote amounts in THB minor units.
- Re-checks seller, buyer, listing, and inventory state before payment proof can mark the order paid.

### Checkout Page Module

Interface:

- Display trusted quote fields returned by the server.
- Capture buyer address confirmation.
- Start payment through a Payment Adapter.
- Display order state after payment return.

Implementation:

- Does not calculate trusted money values.
- Does not trust client-supplied price, shipping fee, total, seller ID, payout, or fee rate.
- Calls Marketplace Order Module after payment confirmation or webhook state changes.

## Buyer Seam And Adapters

The buyer flow crosses these seams:

```text
Browse
  -> Listing Detail
  -> Marketplace Account Bridge
  -> Pending Payment Order
  -> Checkout Quote
  -> Payment Adapter
  -> Marketplace Order state
```

Adapters:

- Marketplace Snapshot Adapter: reads listing cards and detail snapshots.
- Account Bridge Adapter: maps current YNOTT profile to Marketplace Account.
- Address Adapter: copies customer-confirmed delivery address into order snapshot.
- Payment Adapter: creates payment intent/session and verifies callback/webhook.

Depth target: buyer pages should know the Interface and display model only. Listing availability, self-purchase rejection, gacha separation, price freshness, and money totals stay behind marketplace Modules.

## Buyer Frontend Design Direction

The buyer surface should feel like a focused collectibles marketplace inside YNOTT, not a campaign landing page.

- Purpose: help buyers compare individual cards/items, understand source/condition/price, and safely complete one-item checkout.
- Audience: YNOTT customers who already understand packs and rewards, plus new buyers who need price/source clarity.
- Tone: clean commerce, tactile collectible detail, calm payment confidence.
- Memorable detail: each listing card uses a consistent compact metadata rail for source, condition/grade, and availability.
- Constraints: mobile-first browse, stable card grid, real item imagery, THB money display, no coin icon, no decorative hero section.

Visual hierarchy:

- First viewport shows marketplace controls and listing cards immediately.
- Official shop and user seller source filters should be visible near the top.
- Search/filter/sort controls should be compact and persistent enough that mobile users can refine without losing context.
- Item images carry the subject matter; avoid dark blurred backgrounds or generic stock-like marketplace art.
- Price uses THB formatting and should be visually clear but not larger than the item title on dense card grids.

## Buyer UI State Contract

Buyer display models should include UI-ready fields:

- `source_badge`
- `availability_label`
- `availability_tone`
- `price_label`
- `condition_summary`
- `variant_summary`
- `can_start_checkout`
- `checkout_block_reason_label`
- `primary_action_label`
- `last_updated_label`

Buyer state rules:

- Loading cards use fixed image aspect ratio and fixed metadata rows so the grid does not shift.
- Empty browse state should explain active filters and offer `Clear filters`; it should not show marketplace onboarding copy.
- Hidden/sold/pending-payment cards should keep image/title readable but disable checkout action.
- Checkout-blocked detail pages show the reason beside the action area, not at the top as a generic error.
- Payment/checkout errors should keep the buyer on the same step with a clear retry or return-to-listing path.
- Mobile detail page keeps image, title, source badge, condition, and price above the checkout action.

## Buyer API Contract

Buyer API routes can live behind Website-facing URLs, but they should call Marketplace Worker/backend modules instead of reaching into tables from React components or direct Website DB clients.

| Route | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/marketplace/listings` | `GET` | Marketplace Snapshot Module | Return public-safe listing cards by cursor, sort, seller type, category, and availability. |
| `/api/marketplace/listings/:listingIdOrSlug` | `GET` | Marketplace Snapshot Module | Return one listing detail snapshot and checkout availability. |
| `/api/marketplace/checkout/pending-orders` | `POST` | Pending Payment Order Module | Create or replay a Pending Payment Order for one listing and one buyer. |
| `/api/marketplace/checkout/pending-orders/:pendingOrderId` | `GET` | Pending Payment Order Module | Return the trusted quote and order state snapshot for the pending order owner. |
| `/api/marketplace/checkout/pending-orders/:pendingOrderId/payment-proof` | `POST` | Payment Adapter | Upload/attach payment proof for Slip2Go/manual verification. |
| `/api/marketplace/orders` | `GET` | Marketplace Order Module | Return buyer order history for the current Marketplace Account. |
| `/api/marketplace/orders/:orderId` | `GET` | Marketplace Order Module | Return one buyer-visible order detail. |

Route rules:

- `GET /api/marketplace/listings` may support anonymous browse. It must not create a Marketplace Account.
- Listing detail may support anonymous reads, but `can_start_checkout` must be `false` when no YNOTT profile is resolved.
- Checkout and order routes require the normal Website auth/profile resolver and the Marketplace Account Bridge.
- Checkout and payment-proof routes require same-origin validation, per-profile rate limiting, an idempotency key, and a request body allowlist.
- The browser must never send trusted `item_price_satang`, `shipping_fee_satang`, `buyer_service_fee_satang`, `buyer_total_satang`, `seller_marketplace_account_id`, fee rates, or payout values.
- Request bodies must reject Customer Bag reward IDs, gacha draw IDs, wallet transaction IDs, and any caller-supplied owner IDs.
- All money values returned by buyer APIs use integer satang plus `currency = 'THB'`.

## Buyer Read Model Database Contract

Buyer browse should read from marketplace-owned snapshots so it can stay fast and separate from gacha reward storage.

Recommended read models:

| Object | Purpose | Notes |
| --- | --- | --- |
| `marketplace_listing_snapshots` | Canonical buyer-facing listing card/detail snapshot. | Updated when listing, inventory, price, media, or seller display state changes. |
| `marketplace_listing_media` | Ordered listing images and thumbnails. | Stores public derivative URLs, not private upload originals. |
| `marketplace_listing_search` | Optional search projection for title/category/set/card text. | Can be added after MVP if plain filters are enough first. |
| `marketplace_public_listing_cards` | Narrow public read view or API projection. | Use `security_invoker = true` if exposed through Supabase views; otherwise keep it server-only. |

Core snapshot fields:

- `listing_id uuid`
- `listing_slug text unique`
- `listing_version bigint`
- `inventory_id uuid`
- `seller_marketplace_account_id uuid`
- `seller_type text check in ('official_shop', 'user_seller')`
- `title text`
- `category text`
- `condition_label text`
- `variant_label text`
- `grade_label text null`
- `primary_image_url text`
- `item_price_satang integer check (item_price_satang >= 0)`
- `currency text check (currency = 'THB')`
- `availability text check in ('active', 'pending_payment', 'sold', 'hidden')`
- `published_at timestamptz`
- `updated_at timestamptz`

Indexes:

- Unique index on `listing_slug`.
- Read index on `(availability, seller_type, published_at desc, listing_id desc)`.
- Detail index on `(listing_id, listing_version)`.
- Optional search index on normalized title/card text after MVP search scope is confirmed.

Data rules:

- Snapshots must point to Marketplace Inventory only.
- Snapshot generation must fail if the source is a Customer Bag reward, collection item, pack-open reward, or gacha prize unit.
- Buyer read models must not include seller payout status, seller bank data, internal fee calculations, or admin workflow notes.
- Public browse should be cacheable for a short TTL or tag-based invalidation, but checkout availability must be re-checked by the Pending Payment Order RPC.

## Browse Flow

```text
Marketplace page
  -> filters/sort/search
  -> listing cards
  -> listing detail
```

Listing cards should show:

- Item image.
- Item name.
- Category/type.
- Item price.
- Seller type: official shop or user seller.
- Condition or grade when relevant.
- Availability state.

Listing cards should read from marketplace snapshots. They should not live-query Customer Bag or gacha reward tables.

Listing card Interface should return:

- `listing_id`
- `listing_slug`
- `title`
- `image_url`
- `seller_type`
- `item_price_satang`
- `currency`
- `condition_label`
- `availability`

The browser formatting layer converts `item_price_satang` to THB display. No coin icon or coin amount should be used for marketplace prices.

### Browse UI Layout

Recommended layout:

- Top band: marketplace title, source segmented control, search input, sort menu, filter trigger.
- Listing grid: responsive cards with fixed image aspect ratio, metadata rail, and stable price row.
- Filter drawer/sheet on mobile: source, category, condition, grade, price range, availability.
- Empty state: `No listings match these filters` plus clear-filter action.
- Loading state: skeleton cards with image/title/price placeholders.

Listing card content order:

1. Item image.
2. Source badge: `Official shop` or `User seller`.
3. Title.
4. Condition/grade/variant summary.
5. Availability label.
6. THB item price.

Do not put checkout buttons on every card for MVP unless the grid remains clean on mobile. Card click/tap should open listing detail; quick actions can come later.

Responsive constraints:

- Use a 1-column mobile grid, 2-column tablet grid, and wider desktop grid only when card width remains readable.
- Keep card image aspect ratio stable so rows do not jump while images load.
- Long card names should wrap to a controlled number of lines; price and availability rows must not overlap.
- Badges use text and color together.

## Listing Detail Flow

Detail page should show the simple purchase decision first:

- Item name.
- Card/item details.
- Condition.
- Variant/grade/language/cert/stock details where available.
- Seller type.
- Price.
- Buy button.

Do not show the full fee breakdown here unless legally or product-wise required.

Do not show a seller payout estimate to the buyer. That belongs to the seller journey.

Do not show gacha reward actions here. A gacha reward detail page may link to similar Marketplace Listings, but it must not produce a checkout for that reward.

Listing detail Interface should return:

- `listing_id`
- `inventory_id`
- `listing_version`
- `seller_type`
- `item_price_satang`
- `currency`
- `can_start_checkout`
- `checkout_block_reason`

`inventory_id` must be a Marketplace Inventory ID. It must not be a Customer Bag reward ID, collection item ID, or gacha prize unit ID.

### Listing Detail UI Layout

Recommended layout:

- Media area: primary image with thumbnail strip when multiple images exist.
- Summary area: source badge, title, condition/grade/variant, item price, availability, primary action.
- Detail sections: item facts, seller type, shipping expectation, return/refund policy summary when available.
- Sticky mobile action bar only after the price and availability have appeared in the natural reading order.

Action behavior:

- `Buy` is enabled only when `can_start_checkout = true`.
- If login is required, action label becomes `Sign in to checkout`.
- If sold/pending-payment/hidden/stale, disabled action shows the exact block reason.
- A user seller listing owned by the viewer shows `Your listing` and no checkout action.
- Gacha reward references, if shown as related context, must never render a checkout CTA.

Accessibility:

- Image gallery controls need visible labels and keyboard focus.
- Price, condition, and availability should be text, not image-only badges.
- Error and block reason messages should be adjacent to the primary action and announced in forms where applicable.

## Checkout Flow

After buyer clicks checkout:

```text
Listing detail
  -> Marketplace Account Bridge
  -> Pending Payment Order
  -> checkout page
  -> item price
  -> shipping fee
  -> buyer service fee
  -> buyer total
  -> address
  -> payment method
  -> payment confirmation
```

Checkout page should show:

- Item price.
- Shipping fee.
- Buyer service fee.
- Total payable.
- Delivery address.
- Payment method.
- Order expiration time if payment is pending.

The checkout page shows the buyer-side service fee as a named buyer fee line. Marketplace Fee charged to seller does not appear as buyer-facing detail.

Checkout quote Interface should return:

- `pending_order_id`
- `listing_id`
- `listing_version`
- `item_price_satang`
- `shipping_fee_satang`
- `buyer_service_fee_satang`
- `buyer_total_satang`
- `currency`
- `expires_at`
- `address_snapshot_required`
- `payment_methods_available`

The browser may display these values. It must not send them back as trusted amounts.

### Checkout UI Layout

Checkout should be compact and confidence-building:

- Step header: `Checkout`, `Address`, `Payment`, `Confirmation`.
- Order summary: item title, source badge, item price, shipping fee, buyer service fee, total payable.
- Address block: selected/confirmed address snapshot and edit/confirm action.
- Payment block: available payment methods and payment expiration.
- Support block: concise refund/shipping policy link or summary.

Money display rules:

- Item price appears before shipping fee.
- Shipping fee appears only after destination/quote exists.
- Buyer service fee appears as its own named line and is calculated server-side from the active admin fee rule.
- Buyer total is visually strongest in checkout, not on listing detail.
- Seller payout and marketplace fee are hidden from buyer checkout.
- If quote changes, show `Quote changed, please review again` and require explicit retry.

Checkout state rules:

- Pending payment countdown should be visible but not alarming unless expiration is near.
- Payment pending should show next action and refresh status without layout jump.
- Payment failed/expired should offer retry when allowed and return-to-listing when not.
- Payment success should route to order detail with shipment status, not back to browse.
- Browser back/refresh should replay pending order state safely and show the existing Pending Payment Order when valid.

## Pending Payment Order Rules

The Pending Payment Order Module is the seam between browsing and money.

Interface:

- Create one Pending Payment Order for one active listing and one buyer.
- Return a checkout quote with item price, shipping fee, buyer service fee, and total.
- Expire stale Pending Payment Order.
- Reject self-purchase.
- Reject stale price or sold listing.

Implementation:

- Uses a unique active Pending Payment Order constraint per one-unit listing.
- Stores quote amount in THB minor units.
- Requires idempotency key for pending order creation and payment-proof actions.
- Re-checks listing status before payment confirmation.
- Re-checks that the listing source is Marketplace Inventory, not Customer Bag or gacha reward data.

Pending Payment Order failure should return a product-level reason:

- `listing_sold`
- `listing_pending_payment`
- `own_listing`
- `price_changed`
- `not_active`
- `invalid_inventory_source`
- `login_required`
- `marketplace_account_blocked`

## Pending Payment Order RPC Contract

`marketplace_create_pending_payment_order` is the only writer that turns a listing detail view into a Pending Payment Order.

Inputs:

- `p_request_id uuid`
- `p_idempotency_key text`
- `p_ynot_profile_id uuid`
- `p_buyer_marketplace_account_id uuid`
- `p_listing_id uuid`
- `p_listing_version bigint`
- `p_address_snapshot jsonb null`
- `p_shipping_quote_id uuid null`
- `p_now timestamptz default transaction_timestamp()`

Transaction behavior:

- Validate the idempotency key belongs to the current Marketplace Account and route purpose.
- Lock the listing row and the inventory row for update before checking availability.
- Verify listing is active, not sold, not already locked by another active Pending Payment Order, and still on the submitted `listing_version`.
- Verify buyer account is active and is not the seller account.
- Verify inventory source is Marketplace Inventory and not Customer Bag, gacha reward, collection, wallet, or reward conversion data.
- Compute fixed 150 THB shipping and 10 percent buyer service fee from item price on the server, or use the active admin-configured replacement rule.
- Insert the Pending Payment Order, order item, and frozen quote/money snapshot in the same transaction.
- Return the existing Pending Payment Order when the same account replays the same idempotency key and request hash.

Pending Payment Order table requirements:

- `marketplace_orders`
- `id uuid primary key`
- `listing_id uuid not null`
- `listing_version bigint not null`
- `buyer_marketplace_account_id uuid not null`
- `seller_marketplace_account_id uuid not null`
- `item_price_satang integer not null check (item_price_satang >= 0)`
- `shipping_fee_satang integer not null check (shipping_fee_satang >= 0)`
- `buyer_service_fee_base_satang integer not null check (buyer_service_fee_base_satang >= 0)`
- `buyer_service_fee_satang integer not null check (buyer_service_fee_satang >= 0)`
- `buyer_total_satang integer not null check (buyer_total_satang = item_price_satang + shipping_fee_satang + buyer_service_fee_satang)`
- `currency text not null check (currency = 'THB')`
- `status text not null check in ('pending_payment', 'paid', 'cancelled', 'expired', 'payment_reconciliation_required')`
- `expires_at timestamptz not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `address_snapshot jsonb null`
- `shipping_quote_snapshot jsonb null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Unique active Pending Payment Order per one-unit listing while `status = 'pending_payment'`.
- Unique `(buyer_marketplace_account_id, idempotency_key)` for Pending Payment Order create requests.
- Index `(buyer_marketplace_account_id, status, created_at desc)`.
- Index `(expires_at)` for the expiration worker.

Expired Pending Payment Orders should be closed by a scheduled worker or explicit expiration RPC before allowing another buyer to start checkout for the listing. Do not use volatile `now()` expressions inside partial unique indexes.

## Payment Proof RPC Contract

`marketplace_submit_pending_order_payment_proof` is the only writer that attaches buyer payment proof to a Pending Payment Order.

Inputs:

- `p_request_id uuid`
- `p_idempotency_key text`
- `p_ynot_profile_id uuid`
- `p_buyer_marketplace_account_id uuid`
- `p_pending_order_id uuid`
- `p_payment_method text`
- `p_slip_file_path text`
- `p_slip_file_sha256 text`
- `p_provider_reference text null`

Transaction behavior:

- Validate the Pending Payment Order belongs to the current buyer Marketplace Account.
- Lock the order, listing, and inventory rows before accepting proof.
- Reject expired, cancelled, sold, or stale pending orders.
- Store proof metadata, file hash, and safe provider response.
- Verify proof through the existing Slip2Go-style YNOTT slip verification pipeline when available; otherwise leave it in admin/manual review.
- Mark order paid only when verification/admin approval proves the amount, receiver, duplicate status, and order ownership.
- Return the existing proof/payment result for a replayed idempotency key.

Payment proof upload alone must not mark the order paid. Paid state is accepted only through the Payment Adapter after Slip2Go/provider confirmation or owner/admin-approved manual evidence.

## Buyer Backend Error Contract

Buyer APIs return stable machine-readable codes so UI can branch without string parsing.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_login_required` | `401` | Checkout or order route needs a resolved YNOTT profile. |
| `marketplace_account_blocked` | `403` | Marketplace account is suspended, blocked, or incomplete. |
| `marketplace_listing_not_found` | `404` | Listing does not exist or is not visible to this viewer. |
| `marketplace_listing_not_active` | `409` | Listing is hidden, archived, or otherwise not buyable. |
| `marketplace_listing_pending_payment` | `409` | Another active Pending Payment Order owns the listing hold. |
| `marketplace_listing_sold` | `409` | Listing has already been sold. |
| `marketplace_own_listing` | `409` | Buyer is the seller for this listing. |
| `marketplace_price_changed` | `409` | Listing version or quote changed after the detail page loaded. |
| `marketplace_pending_order_expired` | `409` | Pending Payment Order expired before payment proof was accepted. |
| `marketplace_invalid_inventory_source` | `422` | Listing source is not Marketplace Inventory. |
| `marketplace_idempotency_conflict` | `409` | Same idempotency key was reused with a different request hash. |
| `marketplace_rate_limited` | `429` | Buyer mutation exceeded allowed retry rate. |
| `marketplace_payment_start_failed` | `502` | Payment provider session could not be created after the order attempt. |

Error responses should include `request_id`, `code`, `message`, and optional `retry_after_seconds` or `current_listing_version`. They must not include private seller, payout, provider secret, or admin workflow data.

## Buyer Query Performance Contract

- Browse uses cursor pagination, not offset pagination, after MVP seed data grows.
- Route handlers cap `limit` to a small server-defined maximum.
- Listing card queries select only card fields; detail queries select only buyer detail fields.
- Avoid per-card joins to media, seller, inventory, and account tables by reading from snapshots.
- Do not join Marketplace browse queries to Customer Bag, draw rounds, wallet, or reward conversion tables.
- Cache public listing cards with short TTL or tag invalidation on listing publish/reserve/sold/hidden events.
- Never use cached data to authorize checkout. Pending Payment Order and payment-proof RPCs re-check current rows inside transactions.
- Add structured logs for Pending Payment Order create, payment proof upload, and payment confirmation with `request_id`, `listing_id`, `pending_order_id`, and `marketplace_account_id`, but no full address or payment secrets.

## Buyer State Transition Table

| From | Event | To | Owner |
| --- | --- | --- | --- |
| `pending_checkout` | Pending Payment Order created | `pending_payment` | Pending Payment Order Module |
| `pending_payment` | Slip2Go/provider paid event accepted | `paid` | Payment Adapter + Marketplace Order Module |
| `paid` | admin starts fulfilment | `preparing` | Admin Workflow Module |
| `preparing` | tracking added | `shipped` | Admin Workflow Module |
| `shipped` | delivery confirmed | `delivered` | Admin Workflow Module or Shipping Adapter |
| `delivered` | completion rule met | `completed` | Marketplace Order Module |
| `pending_payment` | Pending Payment Order expires | `cancelled` | Pending Payment Order Module |
| `pending_payment` | provider failure/expiry | `cancelled` | Payment Adapter + Marketplace Order Module |
| any money mismatch | reconciliation needed | `payment_reconciliation_required` | Marketplace Money Module |

Idempotent retry should return the existing Pending Payment Order or payment proof result when the same idempotency key is replayed by the same Marketplace Account.

## Buyer Order States

First pass:

- `pending_checkout`
- `pending_payment`
- `paid`
- `preparing`
- `shipped`
- `delivered`
- `completed`
- `cancelled`
- `refunded`
- `payment_reconciliation_required`

Official shop orders and user-seller orders use the same buyer order states. Seller Payout state is separate.

## Buyer Account And History

The customer should see one YNOTT account area with separate sections:

- `Gacha Rewards`: pack-open rewards, Reward Conversion, reward shipping, no marketplace sell button.
- `Marketplace`: purchases, pending payment orders, Marketplace Orders, seller submissions, active listings, sold items, Seller Payout status.

The Customer Bag Aggregator Module composes these sections. It does not merge the data stores or mutation rules.

## Security And Performance

- Buyer browse, listing detail, checkout, payment proof upload, and order APIs are HTTPS-only in production. HTTP requests redirect or fail closed, secure cookies require HTTPS, and checkout/payment pages must not load mixed-content assets.
- Browse reads marketplace snapshots.
- Checkout mutations require same-origin check, CSRF/session-cookie protection consistent with YNOTT auth, rate limit, Marketplace Account, request body allowlist, and idempotency key.
- Buyer RBAC is resolved server-side from the current YNOTT session and Marketplace Account. Browser-submitted buyer ID, seller ID, role, owner, price, fee, shipping, payment state, or payout fields are rejected.
- Buyer journey does not create marketplace passwords. Existing YNOTT/Supabase Auth owns password hashing, password reset, login throttling, and session issuance.
- Buyer inputs use schema allowlist validation for checkout, address confirmation, pending-order IDs, payment proof metadata, and order filters. Unknown fields, malformed form-data, and caller-supplied totals fail closed.
- Buyer/order database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No listing, address, payment, or order input is concatenated into SQL.
- Checkout and order actions follow the YNOTT session timeout policy. Expired or stale sessions cannot create Pending Payment Orders, upload payment proof, or view private order detail.
- Payment provider callback/webhook must be idempotent by provider event ID.
- Browser must not send trusted price, fee, seller, or payout amounts.
- Buyer address must be confirmed at checkout and copied into the Marketplace Order snapshot.
- Buyer cannot buy their own listing even through a second browser session.
- Public listing detail should stay available if YNOTT core profile lookup is temporarily unavailable.
- Checkout should fail closed if profile/account verification fails.
- Checkout should re-check `own_listing`, `not_active`, `price_changed`, and `invalid_inventory_source` before payment proof can be accepted.
- UI should not be the only place that blocks self-purchase or gacha reward purchase.
- The listing detail and checkout Interfaces should include a version or snapshot hash so stale detail pages cannot start payment silently.
- Payment proof upload must validate size, extension, MIME type, magic bytes, file hash, duplicate slip/evidence hash, and ownership of the Pending Payment Order before storing metadata.
- Buyer order APIs must redact full address snapshots from list responses. Detail responses show only the current buyer's delivery snapshot and never expose seller payout, provider payloads, bank data, or admin notes.
- Listing detail and checkout copy from seller/user input is plain text by default; if rich descriptions are later allowed, render only sanitized allowlisted HTML.
- Checkout and payment pages must set no-store/private cache behavior. Public listing cache must not be reused for checkout authorization or payment state.

Security architecture and performance impact:

- Public browse/detail remains fast through indexed listing snapshots, cursor pagination, and short TTL/tag-based cache. These snapshots are never trusted for checkout authorization.
- Checkout uses a dedicated Pending Payment Order command path that re-reads live listing/version/price/source ownership inside one transaction before payment proof is accepted.
- Session, CSRF, RBAC, self-purchase, stale-version, and source-kind checks should run before creating payment sessions or taking locks wherever possible.
- Payment proof upload should store a private pending object quickly, then let validation/duplicate checks/scan status move through a bounded backend flow. Buyer UI polls or reloads normalized state instead of waiting on slow inspection work.
- Buyer order list APIs use redacted lightweight rows; private address/payment detail loads only on order detail routes to keep list rendering fast and safe.

## Depth And Locality

Buyer pages get leverage from small Interfaces:

- Browse gets listing cards.
- Detail gets listing snapshot and checkout availability.
- Checkout gets quote, payment instruction, and payment proof result.
- Order history gets Marketplace Order state.

The Implementation keeps locality for the hard rules:

- Pending Payment Order Module owns double-buy prevention.
- Marketplace Account Bridge owns login/account status.
- Marketplace Inventory Module owns gacha/Customer Bag rejection.
- Marketplace Money Module owns THB amount calculation.
- Payment Adapter owns provider state translation.
- Admin Workflow Module owns fulfilment transitions.

## What Is Not MVP

- Multi-item cart.
- Offers/bargaining.
- Buyer-seller chat.
- Reviews.
- Auctions.

## Accepted Deep Design Decisions

- Pending Payment Order hold duration is 15 minutes.
- Payment proof upload requires slip image, selected payment method, Slip2Go-read amount when available, and optional buyer note.
- Buyer order history starts in the Customer Bag `Marketplace` tab, with a dedicated order detail page for each order.
