# Marketplace MVP Architecture Decision Record

Status: MVP decision lock draft.
Updated: 2026-06-26

## Document Role

This is the source-of-truth architecture document for the marketplace MVP. If another marketplace plan conflicts with this file, update the functional plan to match this document or explicitly revise this decision record first.

Use docs `01` through `09` as deeper function-level plans. They should not create a second login model, merge gacha rewards into marketplace inventory, remove the owner-only prelaunch gate, or move trusted money calculations into the browser.

## Goal

Build a YNOTT marketplace for physical-money sales, not coin sales.

The marketplace should support:

- YNOTT official shop products.
- User-seller consignment for physical cards first.
- Buyer checkout in THB.
- Buyer-paid fixed shipping cost, default 150 THB and admin-adjustable later.
- YNOTT middleman handling for item intake, inspection, shipping, and payout.
- Seller-side marketplace fee, default 10 percent and admin-configurable.
- Buyer-side service fee, default 10 percent and admin-configurable. MVP calculates it from item price first, then adds the fixed shipping fee.

The marketplace must not sell rewards opened from gacha. Gacha rewards remain in the customer bag and can follow existing reward actions such as shipping or conversion, but they cannot become marketplace listings.

## MVP Decision Locks

These decisions override older open-question wording in the marketplace plan set:

- MVP includes both official shop and user-seller consignment flows, but public release stays owner-gated until testing passes.
- Owner-only prelaunch testing is locked to verified owner/admin identity first, including the current owner account `Boo Boo`. Do not rely on display name alone for authorization.
- Prelaunch marketplace access is owner-only. Public browse can be enabled later, but checkout, seller actions, order history, and Customer Bag Marketplace activity require login.
- Marketplace account is not a second customer account. It is an internal row created automatically when a YNOTT profile is created or backfilled for existing profiles. Idempotent `ensure` logic may repair missing rows on first authenticated marketplace action.
- Marketplace runtime should be a separate Marketplace service/Worker under the same Cloudflare account/zone, called from the Website through server-only/internal APIs. The user still sees one YNOTT website experience.
- Marketplace uses a new Marketplace Supabase project, plus separate SIT/staging Marketplace Supabase before real payment/order testing.
- Customer Bag has separate `Gacha Rewards` and `Marketplace` sections. Gacha rewards and Customer Bag reward IDs are never accepted as marketplace inventory.
- Seller can create a draft before sending an item to YNOTT, but a public listing can go live only after YNOTT receives and approves the physical item.
- User-seller MVP item types are cards, sealed boxes, and sealed packs. Required seller listing inputs include product/card reference, variant or product info, condition, price, photos, and notes; grade, language, and cert are required when relevant for cards.
- Official shop MVP can sell cards, sealed boxes, and sealed packs. Official shop can reuse card/product/variant reference data from the YNOTT catalog, but official shop stock must be separate from active gacha prize stock and Customer Bag rewards.
- User-seller listings do not require a separate listing-review queue after every successful intake inspection. Intake, receipt, and inspection are mandatory; extra listing activation review can be risk-based or owner/admin-triggered.
- Seller-side marketplace fee defaults to 10 percent. Admin can change fee rules from the marketplace admin dashboard.
- Buyer-side service fee defaults to 10 percent, is configurable by admin, and is shown as a separate buyer fee line at checkout. MVP fee base is item price before fixed shipping. Buyer does not see the internal seller marketplace fee.
- Buyer pays shipping. MVP shipping fee defaults to a fixed 150 THB and can become admin-configurable later. Shipping fee never increases seller payout.
- Official shop orders do not create seller payout liability, but admin needs a completion/revenue dashboard for official orders. Seller money release controls apply to user-seller orders.
- Seller payout setup is required before money release, not before submission.
- Seller payout release is owner-only for MVP. All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
- First payment path is manual PromptPay/bank transfer proof verified through the existing Slip2Go-style YNOTT slip verification pipeline. First shipping path is fixed 150 THB shipping plus admin tracking. Provider automation can come later.
- Checkout creates a short-lived Pending Payment Order, not a long unpaid cart hold. The order locks the listing or official quantity, freezes money totals, waits for payment proof, then becomes paid or expires and unlocks the item.
- Official shop appears in a clearly separate marketplace tab/page, not mixed silently with user listings.
- Official shop quantity products are in MVP scope and must be fully transaction-safe.
- Listing detail shows item price and availability first. Checkout shows item price, shipping fee, buyer service fee, and total in THB, all server-calculated.
- Browser never sends trusted money, fee, payout, owner, or account values. Marketplace service-role keys are never exposed to browser bundles. RLS/grants are required even for server-first access.
- Disabled marketplace/YNOTT accounts should keep readable history but block new actions unless a legal/security case requires hiding.
- Marketplace Supabase owns marketplace audit. A summary can be mirrored to existing YNOTT audit later for a unified admin view.

## Main Architecture Idea

Use one visible website experience, but split the marketplace backend from the current YNOTT core.

```text
www.ynotopen.com
  -> Website / YNOTT UI
  -> existing login/session/profile resolver
  -> internal call to Marketplace service
  -> Marketplace service / Worker
  -> Marketplace DB for marketplace inventory, listings, orders, payments, fees, payouts
  -> YNOTT core DB for login, profile, customer bag rewards, card reference data, shipping identity
```

The marketplace backend should launch as a separate Marketplace service boundary on Cloudflare while the Website keeps the visible YNOTT experience. This separates usage, deploy risk, and real-money load while still letting the customer feel one site.

## Big Rule

The customer has one YNOTT account.

The marketplace must not create a second public login, second password, or second LINE account. Marketplace account rows are internal records linked by the YNOTT `profile_id`.

The customer bag can show two sections or tabs:

- Gacha Rewards: rewards from pack opening. No marketplace sell action.
- Marketplace: purchases, selling submissions, active listings, sold items, and payout status.

This is one UX area, but two separate inventory domains.

## Seamless Gacha And Marketplace Connection

The product should feel seamless to the customer even though the data domains are separate.

Shared customer experience:

- Same website, same header/navigation, same login session.
- Same YNOTT profile identity and display name.
- Same customer bag area, with separate Gacha Rewards and Marketplace sections.
- Same shipping identity/address primitives where safe.
- Same card and variant reference language, images, and condition labels where possible.
- Same admin identity and role checks for back-office users.

Allowed connection points:

- Customer bag can load Gacha Rewards from YNOTT core and Marketplace activity from Marketplace service in the same screen.
- Gacha reward detail can link customers to marketplace browse or official shop for similar items, but must not show a sell button for that reward.
- Marketplace purchase status can appear in the Marketplace tab of the customer bag after checkout.
- Marketplace seller submissions can use YNOTT card/variant reference data to help users choose the correct card or item.
- Marketplace can reuse YNOTT shipping identity/address data for checkout and delivery, with server-side validation.
- Marketplace account rows are created/synced when a YNOTT profile is created, plus a backfill for existing profiles. Marketplace actions may call an idempotent ensure path only to repair missing internal rows.

Blocked connection points:

- A gacha reward ID cannot become a marketplace inventory ID.
- A gacha reward cannot be locked in checkout, listed, sold, or paid out.
- Marketplace payout logic cannot read coin, wallet, or gacha reward value as money.
- Marketplace payment/refund state cannot mutate gacha reward ownership.
- Marketplace listing creation cannot trust browser-submitted YNOTT item ownership.

Implementation shape:

- Build a thin account bridge that maps current YNOTT `profile_id` to `marketplace_accounts`.
- Build a customer bag aggregator that reads Gacha Rewards and Marketplace sections separately, then returns one UI model.
- Build a reference-data adapter for card/variant lookup and snapshot creation.
- Build a shipping-identity adapter for checkout, with marketplace-specific audit logging.
- Do not create cross-database transactions between gacha and marketplace. Use separate writes, idempotency keys, audit events, and reconciliation checks.

## Inventory Domain Split

YNOTT needs a hard separation between gacha rewards and marketplace inventory.

### Customer Bag / Gacha Rewards

Owned by YNOTT core.

- Created by pack opening or current reward flows.
- Can use existing reward actions such as ship or convert.
- Cannot be listed, locked in a Pending Payment Order, sold, or paid out in marketplace.
- Should never be copied into marketplace inventory automatically.

### Marketplace Inventory

Owned by Marketplace DB.

- Created from official YNOTT shop stock.
- Created from seller-submitted physical cards after marketplace intake.
- Can be listed, locked by a Pending Payment Order, sold, shipped, refunded, and paid out when user-seller owned.
- Uses marketplace-specific inventory IDs, not gacha reward IDs.
- May store safe snapshots of card/item details from YNOTT reference data for browse performance.

## Database Split

YNOTT core database owns:

- Login identity.
- Profile.
- Customer bag / collection reward records.
- Gacha stock/card/variant details.
- Reward status and reward fulfillment/conversion.
- Existing shipping/address primitives.
- Shared card, variant, and product reference data needed for listing creation.

Marketplace database owns:

- Marketplace accounts linked to YNOTT `profile_id`.
- Marketplace inventory.
- Official shop products.
- User listings.
- Buyer orders.
- THB payment state.
- Shipping charge charged to buyer.
- Seller-side marketplace fee, buyer-side service fee, and payout calculation.
- Admin marketplace workflow.
- Marketplace audit and reconciliation records.

The marketplace service can read selected YNOTT reference data through server-side APIs or service bindings, but normal marketplace browse and order screens should be served from Marketplace DB/read models to avoid slow cross-database joins.

## Supabase Planning Decision

Yes, the MVP should plan Supabase from the start.

Recommended direction: create a separate Supabase project/database for Marketplace production, while keeping the existing YNOTT Supabase project as the source of truth for login, profile, gacha rewards, customer bag, and current YNOTT operations.

Do not create a second customer auth system in the marketplace Supabase project. The marketplace database should store internal marketplace accounts linked to the existing YNOTT `profile_id`.

Why separate Supabase is better for this MVP:

- Real-money orders, payment events, seller payouts, and audit records need a smaller and stricter security boundary.
- Marketplace schema can evolve without risking gacha, wallet, customer bag, or reward fulfillment tables.
- Marketplace browse/order load can be tuned separately from pack-open/gacha load.
- Production backup, restore, and reconciliation can be tested for marketplace money records without touching YNOTT core data.
- If the marketplace grows, it can become a more independent service without forcing account migration.

Rejected for MVP: putting all marketplace tables into the current YNOTT core database. It is faster at the beginning, but it increases blast radius around money, payouts, stock locks, and gacha reward separation.

Also rejected for MVP: keeping the marketplace runtime only as normal YNOTT core modules after launch. Local development can share tooling, but the launch architecture should keep a separate Marketplace Worker/service boundary.

## Supabase Boundary Plan

YNOTT core Supabase remains the owner of:

- Auth identity and profile resolution.
- Customer bag and gacha reward records.
- Existing shipping identity/address primitives.
- Card, variant, and stock reference data used to create safe marketplace snapshots.

Marketplace Supabase owns:

- `marketplace_accounts`
- `marketplace_account_events`
- `marketplace_inventory_items`
- `marketplace_inventory_events`
- `marketplace_official_inventory_sources`
- `marketplace_official_stock_movements`
- `marketplace_seller_submissions`
- `marketplace_seller_submission_photos`
- `marketplace_seller_submission_events`
- `marketplace_listings`
- `marketplace_orders`
- `marketplace_order_items`
- `marketplace_order_money_snapshots`
- `marketplace_payment_attempts`
- `marketplace_payment_events`
- `marketplace_fee_rules`
- `marketplace_money_ledger`
- `marketplace_shipping_quotes`
- `marketplace_shipments`
- `marketplace_refunds`
- `marketplace_seller_payouts`
- `marketplace_payout_events`
- `marketplace_admin_commands`
- `marketplace_admin_queue_items`
- `marketplace_admin_audit_events`
- `marketplace_reconciliation_items`
- `marketplace_audit_events`
- `marketplace_idempotency_keys`

No cross-project foreign keys should be used. Marketplace tables can store external references such as YNOTT `profile_id`, card reference ID, or variant ID, but those references are validated server-side and copied into marketplace snapshots where needed.

## Supabase Access Pattern

- Browser calls Website routes, not Supabase directly for marketplace money actions.
- Website resolves the session/profile using current YNOTT logic.
- Website calls Marketplace service with the resolved server-side profile context.
- Marketplace service reads/writes Marketplace Supabase.
- Marketplace service calls YNOTT core only for allowed reference checks such as profile validity, admin role, seller eligibility, shipping identity, or card/variant reference lookup.

For deployed MVP, the Marketplace Worker/backend owns the Marketplace Supabase service-role credential. Website should call it through a Cloudflare service binding or server-only signed context; Website should not need direct Marketplace DB credentials after the service boundary is active. Local development can share a runtime only through the same Marketplace backend adapter.

Keep Marketplace Supabase service-role credentials server-side only in Cloudflare environment secrets. If direct client reads are introduced later, Row Level Security must be designed before exposing tables.

Use database transactions or RPC functions for atomic real-money transitions:

- Create Pending Payment Order and lock listing or quantity.
- Confirm payment.
- Mark item sold.
- Release inventory to shipping.
- Calculate platform fee.
- Calculate buyer service fee.
- Create payout.
- Release payout.
- Refund or cancel order.

These operations should not be implemented as many separate JavaScript writes that can partially fail.

## Supabase Data Rules

- Store money as integer minor units, such as THB satang, not floating point numbers.
- Use immutable payment event and audit event rows. Do not overwrite payment history.
- Use idempotency keys for Pending Payment Order creation, payment proof verification/webhook handling, refund, and payout release.
- Add constraints so one marketplace inventory item cannot have two active listings or two active Pending Payment Orders.
- Add status transition rules so payout cannot move to releasable before payment, inspection, shipping/refund checks, and admin approval.
- Store listing display snapshots so browse pages do not need to query YNOTT core every time.
- Keep seller payout data minimized. Prefer payment-provider-managed payout data; encrypt anything sensitive that must be stored.
- Keep marketplace item photos in a dedicated Marketplace storage bucket or storage namespace, with public-safe processed images for listing display and private intake photos for admin review.

## Sides of the Product

The MVP has four sides:

- Buyer side: browse, detail, checkout, order tracking.
- Seller side: submit item, create listing after approval, manage listing, view sale, view payout.
- Official shop side: YNOTT-owned products and stock.
- Admin middleman side: inspect, approve, ship, refund, payout.

## MVP Trust Model

YNOTT is the middleman.

For MVP, listing types are:

1. Official YNOTT-owned shop items.
2. Seller-submitted physical cards after YNOTT receives, inspects, and approves them.
3. Marketplace purchases that remain under marketplace order/inventory state until shipped.

Avoid seller-direct shipping in MVP. Avoid gacha reward resale entirely in MVP.

## Performance Architecture Guardrails

- Keep marketplace browse reads inside Marketplace DB/read models. Do not live-join YNOTT core data for every listing card.
- Store listing snapshots for card name, variant, condition, image, seller-visible description, display price, and category. Reference snapshots must not contain private YNOTT cost or gacha odds data.
- Add indexes around the first MVP query paths: listing `status`, `category`, `price`, `created_at`, order `buyer_profile_id`, order `status`, payout `seller_profile_id`, payout `status`.
- Paginate all browse, seller listing, order, and admin queue screens from day one.
- Cache public listing browse with a short TTL where safe. Listing detail can be lightly cached only while active; checkout, Pending Payment Order, payment, admin, and payout screens must not be cached.
- Use idempotent Pending Payment Order and checkout operations so refreshes, retries, and payment proof/webhook replays cannot double-sell an item.
- Use async jobs or queue-style processing for slow actions: payment webhook reconciliation, shipping-label updates, payout calculation, and admin notification.
- Create a marketplace data access module instead of extending the existing broad YNOTT data orchestrator for every marketplace read.
- Use Supabase indexes and constraints for the marketplace hot paths before launch, not after traffic starts.
- In customer bag, fetch Gacha Rewards and Marketplace sections separately and compose the response at the UI/API layer. Do not make a slow cross-database join just to render the bag.

## Security Architecture Guardrails

- Use the existing YNOTT login/session/profile resolver. Browser requests must never supply trusted `profile_id`, seller ID, fee, payout, or ownership values.
- The marketplace service resolves the current profile server-side and maps it to an internal marketplace account.
- Keep Marketplace DB access server-side for MVP. No direct browser access to Marketplace DB service-role credentials.
- If public client access is added later, add Row Level Security policies before exposing any tables.
- Use internal service binding or server-only API calls between Website and Marketplace service; do not expose privileged marketplace admin APIs to the public browser.
- Verify payment webhooks with provider signatures, idempotency keys, and immutable payment event logs.
- Do not store raw card data or raw bank account data. Use provider-managed payment/payout details where possible; otherwise encrypt and minimize payout fields.
- Require admin role checks for inspection, refund, manual status changes, payout release, and marketplace inventory edits.
- Keep seller payout on hold until payment is settled, item is confirmed, refund window rules are satisfied, and admin releases payout.
- Log audit events for listing creation, inventory approval, Pending Payment Order creation/expiry, payment confirmation, refund, shipment, payout calculation, and payout release.
- Rate-limit listing creation, checkout attempts, payment callbacks, and admin mutation APIs.
- The gacha reward separation is a security boundary: no marketplace API should accept a gacha reward ID as sellable inventory.
- Seamless UX must not mean shared mutation authority: gacha actions, marketplace listing actions, money actions, and payout actions stay in separate server-side command paths.
- Do not run production Marketplace Supabase migrations until backup, restore-drill, environment, and secret-management gates are ready.

## MVP Security Baseline

Every function document must preserve these baseline controls:

- Production marketplace pages, APIs, storage URLs, payment redirects, and webhooks are HTTPS-only. HTTP requests redirect or fail closed, secure cookies require HTTPS, and marketplace UI must not load mixed-content assets.
- All state-changing browser routes require same-origin validation, CSRF-resistant cookies or token checks consistent with the current YNOTT auth pattern, request body allowlists, route-specific rate limits, and idempotency where replay can mutate state.
- RBAC is enforced server-side for buyer, seller, admin, operator, and owner actions. Browser-submitted role, actor, owner, account, or permission fields are ignored or rejected.
- Marketplace stores no passwords and creates no separate password login. Password hashing, credential reset, and primary session issuance stay owned by the existing YNOTT/Supabase Auth layer.
- All user, admin, webhook, and upload inputs require schema allowlist validation. Unknown fields, malformed JSON/form-data, untrusted totals, untrusted actor IDs, and untrusted state fields fail closed with safe error codes.
- Database access must use Supabase query builders, parameterized RPCs, or prepared statements only. No service code, migration helper, or `security definer` function may concatenate user input into SQL.
- Marketplace session handling follows the existing YNOTT session expiry policy. High-risk actions such as payout release, refund override, manual state override, admin role change, and payout destination update require a fresh owner/admin session check when the session is stale or older than the configured step-up window.
- Marketplace service-binding calls must be server-only, short-lived, signed or platform-bound, include `request_id`, and reject stale or replayed context. Browser cookies are not Marketplace Worker credentials.
- Public browse/detail responses expose only listing snapshots and public image derivatives. They must not expose provider IDs, payout data, bank/payout references, private addresses, admin notes, procurement costs, internal source notes, or raw audit details.
- User-entered text, notes, item descriptions, tracking text, and admin notes are plain text by default. If any rich text is later allowed, it must be sanitized with an explicit allowlist before rendering.
- Uploaded images and payment proof files require private storage, size/type/extension/magic-byte validation, hash-based duplicate checks, malware/content scan when available, EXIF stripping for public derivatives, and signed access for private originals.
- Logs and errors must be redacted. Responses can include stable `request_id`, `code`, and safe state hints, but not stack traces, raw Supabase errors, service-role details, provider payloads, bank data, full address snapshots, or secret-bearing evidence.
- Production launch requires a secret scan, browser bundle scan for Marketplace Supabase credentials, RLS/grant verification, security-header/CSP check, dependency audit review, and payment webhook signature verification evidence.

## Security Architecture And Performance Impact

Security changes the marketplace architecture. The MVP should treat authentication, RBAC, money mutation, uploads, and admin commands as server-owned command paths, while public browse/detail use narrow read snapshots.

Architecture impacts:

- Keep the separate Marketplace Worker/backend boundary because it contains real-money state, service-role credentials, provider secrets, payout data, and admin command authority.
- Split public read models from private command models. Public listing snapshots can be cached and paginated; checkout, payment, refund, payout, seller submission, and admin command paths always re-check live state server-side.
- Keep gacha/customer-bag inventory and marketplace inventory as separate source domains. The rejection of gacha reward IDs should be an indexed/source-kind constraint, not a slow cross-database lookup on every request.
- Centralize RBAC, session freshness, idempotency, audit, and state transition checks in backend modules/RPCs so the UI does not duplicate sensitive policy or add inconsistent query paths.
- Put slow trust-building work behind queues or admin workflows: image scanning, EXIF stripping, webhook reconciliation, refund review, payout release, and evidence validation.

Performance mitigations:

- Use request-scoped identity/account resolution caching only inside one server request. Do not cache authorization results across requests or after session expiry.
- Build indexed projections for public listing browse, customer bag sections, seller dashboard counters, and admin queues so RLS/private tables do not become the hot read path.
- Use parameterized RPCs or prepared statements for high-contention mutations so the database can reuse plans and hold locks for the shortest possible time.
- Add indexes before launch for every security predicate used in hot paths: `marketplace_account_id`, `source_kind`, `listing_state`, `order_state`, `queue_key`, `provider_event_id`, idempotency scope, and owner/admin action state.
- Treat security checks as part of latency budgets. Browse/listing pages can be cached; checkout/payment/admin/money pages are no-store/private and must be optimized through narrow queries, bounded payloads, and async follow-up work.

## Main State Machines To Design Later

- Marketplace account state.
- Customer bag cross-section display state.
- Marketplace inventory intake and inspection state.
- Marketplace listing state.
- Buyer order state.
- Payment state.
- Shipping state.
- Seller payout state.
- Reconciliation and audit state.

## Main Risks

- User pays but item is unavailable.
- Seller sells the same item twice.
- Seller payout is released before YNOTT confirms item condition.
- Shipping fee is mixed with seller revenue.
- Two databases drift on account/profile reference data.
- Gacha reward records are accidentally treated as sellable marketplace inventory.
- Real-money provider webhook changes order state incorrectly.
- Admin mutation endpoint is exposed too broadly.
- Slow cross-database reads make marketplace browse or checkout unreliable.
- Marketplace and YNOTT Supabase projects drift because a copied profile/card snapshot is stale.
- A migration or broken policy exposes money/order/payout data.

## Remaining Implementation Design Work

The product decisions above are locked for MVP. Remaining work should answer implementation details only:

- Marketplace Supabase project region, plan, PITR, and backup/restore drill evidence.
- Marketplace Worker/service route, service-binding shape, and environment secret names.
- Marketplace migration folder layout, recommended as a clearly separated Marketplace namespace under `Database/`.
- Exact owner account identifiers behind the `Boo Boo` owner account for payout release and manual override authorization.
- Exact admin refund workflow states, evidence requirements, and audit fields.
- Exact SIT/staging test data and UAT script for owner-only marketplace testing.
