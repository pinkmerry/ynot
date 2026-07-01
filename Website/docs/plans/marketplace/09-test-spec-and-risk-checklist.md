# Marketplace Test Spec And Risk Checklist - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Capture the safety checks needed before any real-money marketplace launch.

Tests must prove that marketplace feels seamless with YNOTT login while staying separate from Customer Bag, gacha rewards, Reward Conversion, wallet/coins, and reward shipping.

The test plan should target Module Interfaces, not only pages. If a page changes, the core safety tests should still protect the architecture.

## Document Role

This document owns acceptance evidence, regression tests, release gates, and risk checks for the marketplace MVP. It should verify the architecture from docs `00` through `08`; it should not introduce new marketplace behavior that is not planned in those docs.

## MVP Test Decision Locks

Tests must prove these locked decisions:

- Prelaunch marketplace is owner-only.
- Public browse can later be enabled without creating marketplace account rows.
- Marketplace account rows are created/synced from YNOTT profile creation/backfill, with idempotent repair on authenticated action.
- Marketplace runs through a separate Marketplace Worker/service and separate Marketplace Supabase project plus SIT/staging.
- Gacha rewards and Customer Bag reward IDs are rejected everywhere marketplace inventory/listing/Pending Payment Order IDs are expected.
- Official shop and user-seller consignment both exist in MVP scope.
- Official shop is a separate tab/page and supports cards, sealed boxes, sealed packs, and quantity products with transaction-safe Pending Payment Order/release.
- Seller item types are cards, sealed boxes, and sealed packs first.
- Seller fee defaults to 10 percent and is admin-configurable.
- Buyer-side service fee defaults to 10 percent, is admin-configurable, and appears as a checkout line.
- Seller payout excludes buyer shipping and buyer-side service fee.
- Seller payout release is owner-only.
- All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
- Manual PromptPay/bank transfer proof with existing Slip2Go-style verification and fixed 150 THB shipping/tracking are the first MVP payment/shipping paths.

## Current Runtime Test Baseline

Current baseline to preserve until launch:

- Non-owner users cannot access `/marketplace` during prelaunch.
- Marketplace navigation remains owner-gated until launch gates pass.
- Marketplace listing snapshots, listing detail, checkout, buyer orders, seller submissions, admin workflow, payout, and Customer Bag Marketplace summary are available for owner-only MVP testing when the Marketplace service is configured.
- Coin-style marketplace card display must not regress; listing cards/detail/checkout must keep THB formatting.
- Customer Bag "Sell only" copy means Reward Conversion to coins, not marketplace selling.

Regression tests should lock this owner-only baseline before any public launch gate is opened.

## High-Risk Areas

- Marketplace Account Bridge and one-login experience.
- Separate Marketplace Supabase seam and no cross-project foreign keys.
- Marketplace Inventory source separation.
- Official shop versus user-seller consignment states.
- Payment webhook correctness.
- Fee and payout calculation.
- Shipping charge handling.
- Admin payout release.
- Refund, Pending Payment Order expiry, and seller pre-intake cancellation paths.
- Customer Bag wording and action confusion.
- Marketplace Supabase secrets and RLS.
- Feature flag and rollback gates.

## Test Architecture

### Interface Tests

Use small `node --test` suites for Module Interfaces:

- Account Bridge Interface.
- Inventory Source Interface.
- Listing Query Interface.
- Pending Payment Order Interface.
- Marketplace Money Interface.
- Payment Provider Adapter Interface.
- Shipping Quote Adapter Interface.
- Seller Payout Interface.
- Admin Workflow Interface.
- Customer Bag Aggregator Interface.

Purpose:

- Keep high-risk rules testable without needing full browser flows.
- Make the Interface the stable test surface as implementations evolve.

### Database Verification Scripts

Use `tools/verification/*.mjs` for schema, RLS, secrets, migration, and launch gates. Follow existing repo style such as `verify-hardening.mjs`, `verify-rls-coverage.mjs`, and `check-production-supabase-readiness.mjs`.

Planned verification scripts:

- `tools/verification/verify-marketplace-schema.mjs`.
- `tools/verification/verify-marketplace-identity-bridge.mjs`.
- `tools/verification/verify-marketplace-hardening.mjs`.
- `tools/verification/verify-marketplace-rls.mjs`.
- `tools/verification/verify-marketplace-launch-gates.mjs`.
- `tools/verification/verify-marketplace-no-gacha-inventory.mjs`.

Schema verification should assert:

- Required marketplace tables exist for accounts, inventory, listings, pending payment orders/orders, payments, refunds, payouts, shipping, audit, idempotency, and reconciliation.
- Money fields use integer satang columns and `currency = 'THB'` checks.
- Seller fee rules have a 10 percent default and admin-configurable bounds.
- Buyer service fee rules default to 10 percent and are admin-configurable.
- Marketplace account table has a unique `ynot_profile_id`.
- Listing/inventory tables have source-kind constraints that block Customer Bag/gacha/reward conversion references.
- Pending Payment Order protection and idempotency uniqueness prevent one one-unit listing from being bought twice.
- Provider event tables have unique provider event/evidence keys.
- Admin command/audit tables are append-only by policy and indexed by target.

RLS/hardening verification should assert:

- HTTPS enforcement is active for marketplace pages, APIs, upload/storage URLs, payment redirects, and webhooks in production. HTTP requests redirect or fail closed, `Secure` cookies are not issued over HTTP, and mixed-content assets fail the check.
- RLS is enabled on every marketplace table reachable from Supabase APIs.
- Direct mutation grants are revoked from `anon` and `authenticated` for money, admin workflow, seller submission, inventory, refund, and payout tables.
- Server-only RPCs revoke `execute` from `public`, `anon`, and `authenticated`.
- Any exposed view is `security_invoker = true` where supported, or is not exposed through browser roles.
- Any `security definer` function sets fixed `search_path` and is not executable by browser roles.
- Query safety verification rejects service code, RPC wrappers, migration helpers, and test utilities that concatenate user/admin/webhook/upload/search input into SQL. Data access must use Supabase query builders, parameterized RPCs, or prepared statements.
- RBAC verification proves buyer, seller, admin, operator, and owner actions derive permissions server-side from YNOTT identity/admin records and Marketplace Account state, never from browser-submitted role or actor fields.
- Password/auth verification proves marketplace has no password table, password hash column, password reset endpoint, or alternate credential store. Existing YNOTT/Supabase Auth owns password hashing, credential reset, login throttling, and primary session issuance.
- Marketplace service-role key is absent from browser bundles and `NEXT_PUBLIC_*` env.
- Secret scan covers source files, built bundles, test fixtures, screenshots, logs, and generated verification output for service-role keys, provider/webhook secrets, signed URLs, and payout credentials.
- Security-header/CSP check proves marketplace pages do not add broad `*`, `unsafe-inline`, or `unsafe-eval` exceptions.
- CORS/service-boundary check proves browser origins cannot call privileged Marketplace Worker endpoints directly.

Secure architecture/performance verification should assert:

- Public browse/detail/customer-bag reads use safe projections or snapshots with cursor pagination and do not load private money, payout, upload-original, or admin command tables.
- Checkout, seller submission, official stock, admin command, refund, payout, and webhook mutations use narrow backend module/RPC paths with idempotency, audit, and indexed security predicates.
- Hot RLS/RBAC/source-kind/idempotency/session predicates have indexes or a captured query plan showing bounded reads before launch.
- Website-to-Marketplace service-binding calls are batched by page/workflow purpose; marketplace pages must not create one internal network hop per UI widget.
- Image scanning, EXIF stripping, duplicate-evidence checks, webhook reconciliation, refund review, and payout release run in bounded queue/admin flows instead of public page render paths.
- Latency smoke checks cover public browse/detail, checkout create, payment proof upload, admin queue read, and webhook apply under owner-only test traffic.

### API Contract Tests

Use route-handler or integration tests for server API boundaries:

- `GET /api/marketplace/account/me` returns account state for logged-in user and never trusts body profile IDs.
- `POST /api/marketplace/account/ensure` is idempotent for one YNOTT profile.
- `GET /api/marketplace/listings` returns public-safe snapshots and does not create Marketplace Account.
- `GET /api/marketplace/listings/:id` hides payout/admin/provider fields.
- `POST /api/marketplace/checkout/pending-orders` rejects missing idempotency, stale version, self-purchase, sold listing, and Customer Bag/gacha source IDs.
- `POST /api/marketplace/checkout/pending-orders/:pendingOrderId/payment-proof` rejects caller-supplied totals and expired Pending Payment Orders.
- Seller submission routes reject browser-supplied seller/admin/payout fields.
- Official admin routes reject caller-supplied seller payout state and source data from Customer Bag/gacha records.
- Admin workflow route rejects browser-supplied actor/role fields and derives actor from current session.
- Webhook route verifies raw body signature before applying payment event.
- Every mutation route rejects missing same-origin/CSRF/session protections according to the YNOTT auth pattern.
- Every mutation route rejects unknown fields and malformed JSON/form-data with safe error codes.
- Every mutation route rejects expired sessions, stale internal service context, and high-risk owner/admin commands without a fresh session check.
- Every mutation route rejects browser-submitted role, actor, owner, buyer, seller, admin, trusted total, fee, shipping, payment state, refund state, payout state, and permission fields.
- Public, buyer, seller, admin-list, and detail APIs are checked for redaction of provider payloads, bank/payout details, full address snapshots where not needed, admin notes, stack traces, raw Supabase errors, and service-role details.

### RPC Transaction Tests

Use database-level tests or local Supabase test scripts for transactional guarantees:

- `marketplace_get_or_create_account` creates exactly one row under concurrent calls.
- `marketplace_create_pending_payment_order` creates only one active Pending Payment Order for one one-unit listing under concurrent buyers.
- Pending Payment Order idempotency replay returns the original pending order for same account/key/hash.
- Pending Payment Order idempotency conflict fails for same key with different hash.
- `marketplace_submit_pending_order_payment_proof` stores one proof/payment event and cannot be replayed into duplicate paid transitions.
- Admin-reviewed payment approval marks order paid, listing sold, fee ledger written, and payout liability created only once; provider webhook events open reconciliation/admin review until accepted.
- Payment paid event for official shop creates no seller payout liability and updates official completion/revenue visibility.
- `marketplace_record_intake_transition` cannot approve inventory without required inspection evidence.
- `marketplace_admin_apply_transition` writes command, audit event, queue update, and target state in one transaction.
- `marketplace_record_refund_transition` blocks refund over captured buyer total.
- `marketplace_release_seller_payout` blocks official shop payouts, premature milestones, non-owner release, duplicate release, and active refund/dispute.

### Backend Fixture Set

Minimum fixtures:

- Active YNOTT profile with no Marketplace Account.
- Existing Marketplace Account buyer/seller.
- Blocked Marketplace Account.
- Official inventory draft, active listing, pending-payment listing, sold listing.
- User-seller submission in draft, submitted, received, inspection failed, approved.
- Customer Bag reward states: settling, settled, converted, shipped.
- Gacha reward/draw IDs that must be rejected by marketplace source adapters.
- Two buyer accounts racing for the same listing.
- Manual transfer payment attempt with duplicate slip hash.
- Provider webhook event replay with same and different payload hash.
- Official paid order and user-seller paid order.
- Payout held, eligible, released, paid, disputed.
- Refund requested, approved, processing, refunded, partial, rejected.

Fixtures should use clearly named IDs and should never be pointed at production real customer/payment records.

### Backend Observability Tests

- Every mutation response includes `request_id`.
- Structured logs for checkout, payment, admin workflow, refund, and payout include target IDs but no provider secrets, full address snapshots, or bank details.
- Reconciliation item is created when a money invariant fails.
- Admin audit detail can answer who did what, when, from what state to what state, with which idempotency key.
- Payment webhook replay logs safe replay status without logging raw secret-bearing payloads.
- Upload/evidence logs redact signed URLs, object paths when sensitive, slip images, private cert images, and raw provider payloads.
- Client-side telemetry must not include payment proof URLs, private addresses, bank/payout labels beyond safe aliases, provider payloads, or service-binding context.

### Journey Tests

Use browser/E2E tests when the UI exists:

- Current gate and nav visibility.
- Buyer browse/detail/checkout journey.
- Official shop purchase and admin fulfilment journey.
- Seller submission and admin inspection journey.
- User-seller purchase and payout hold/release journey.
- Refund/reconciliation journey.

### Frontend UX And Visual Tests

Use Playwright/browser tests and screenshot review for marketplace UI gates.

Required viewport set:

- Mobile narrow.
- Mobile wide.
- Tablet.
- Desktop.

Core visual checks:

- Marketplace public surfaces do not show coin icons or coin amounts for marketplace prices.
- Listing cards keep stable image aspect ratio and do not shift when titles, badges, or prices load.
- Listing grid text wraps without overlap for long card names, cert numbers, condition labels, and seller/source badges.
- Listing detail shows item image, title, source badge, condition/variant, price, availability, and primary action above the fold on mobile.
- Checkout total panel shows item price, shipping fee, buyer service fee, and total payable without trusting browser-calculated values.
- Seller submission form shows missing-field validation, upload progress/error, and payout estimate near price entry.
- Admin queue rows stay dense and readable with long titles, amounts, state badges, and next-action labels.
- Role-locked admin actions show required role/evidence instead of silently disappearing.
- Empty states distinguish no listings, no seller submissions, no official stock, and no marketplace activity.

Accessibility checks:

- Keyboard focus reaches filters, cards/detail actions, checkout forms, seller form fields, upload controls, admin command panel, and modal/drawer close actions.
- Status badges include text labels and do not rely on color alone.
- Form validation errors are adjacent to fields and announced by accessible error associations where possible.
- Dialogs/drawers trap focus only while open and return focus after close.
- Buttons and controls have visible focus states.
- Text contrast is acceptable for badges, disabled states, totals, and alert/error text.

Copy checks:

- Marketplace seller actions use `Submit to marketplace`, `Consign with YNOTT`, or similar consignment copy.
- Customer Bag reward surfaces do not say `Submit to marketplace`.
- Marketplace surfaces do not reuse `Sell for coins`, `Sell only`, or coin conversion copy.
- Official shop buyer UI does not show seller payout language.
- Buyer checkout does not show seller payout or internal seller-side marketplace fee.

### Production Runbook Checks

Do not rely only on automated tests for real-money launch. The runbook must include:

- Marketplace Supabase project confirmation.
- Backup/PITR and restore-drill evidence.
- Cloudflare secrets present and not exposed.
- Payment provider test mode and webhook secret verified.
- Admin owner account verified.
- Feature flag state recorded before launch.
- Rollback switch tested.

## Core Test Scenarios

### Account Bridge

- Existing YNOTT user opens marketplace and gets one marketplace account.
- Same user returns and does not create duplicate marketplace account.
- Blocked/deactivated YNOTT profile cannot use marketplace.
- Buyer and seller modes use the same Marketplace Account.
- Admin marketplace action uses YNOTT admin role resolver.
- Client cannot choose or spoof `ynot_profile_id`.
- Public browse does not create a Marketplace Account if product decision is browse-before-login.
- Marketplace Account Bridge fails closed when YNOTT profile lookup is unavailable for sensitive actions.

### Customer Bag And Gacha Separation

- Customer Bag shows `Gacha Rewards` and `Marketplace` as separate sections.
- Gacha reward detail has no marketplace sell button.
- Reward Conversion remains coin conversion and is not called Marketplace Listing.
- Settled Reward cannot become Marketplace Inventory.
- Settling Reward cannot become Marketplace Inventory.
- Converted reward cannot become Marketplace Inventory.
- Shipped reward cannot become Marketplace Inventory.
- Marketplace route rejects any gacha reward ID submitted as inventory/listing source.
- Marketplace route rejects any Customer Bag collection item ID as inventory/listing source.
- Marketplace Order does not mutate wallet coin balance.
- Marketplace Seller Payout does not create wallet coin ledger entry.
- Listing card/detail reads marketplace snapshot, not live Customer Bag data.

### Marketplace Inventory

- Admin can create official Marketplace Inventory.
- Official Shop Ingestion Adapter creates marketplace inventory with `seller_type = official_shop`.
- Official shop inventory cannot reference `customer_bag_reward_id` or `gacha_reward_id`.
- Seller submission creates consignment submission, not active listing.
- Admin can approve Marketplace Inventory only after required intake/inspection state.
- Marketplace Inventory cannot reference Customer Bag reward ID.
- One Marketplace Inventory item cannot have two active listings.
- One Marketplace Inventory item cannot have two active pending payment orders.
- Failed inspection cannot become active listing.

### Seller Listing

- Seller can submit physical item with condition, variant, price, photos/notes.
- Seller sees Marketplace Fee and estimated Seller Payout.
- Seller cannot activate listing before inspection approval and listing activation guards pass.
- Seller can edit/cancel before sale.
- Seller cannot cancel after buyer pays unless admin path handles it.
- Seller cannot buy own listing.
- Blocked seller cannot submit or list.
- Seller direct shipping is not available in MVP.
- Seller submission cannot include trusted fee, payout, admin status, or inventory source fields from the browser.

### Buyer

- Buyer sees item price on detail.
- Buyer sees shipping, buyer service fee, and total at checkout.
- Buyer cannot buy own listing.
- Two buyers cannot buy the same listing.
- Payment failure releases or expires checkout safely.
- Stale listing price blocks checkout and asks buyer to retry.
- Checkout requires Marketplace Account.
- Buyer address is copied to order snapshot.
- Buyer cannot change trusted item price, shipping fee, buyer service fee, fee rate, seller ID, payout amount, or total in request payload.
- Sold/hidden/unavailable listings cannot create a new Pending Payment Order.

### Payment

- Webhook is idempotent.
- Duplicate webhook does not duplicate order state.
- Paid order cannot be paid twice.
- Refund updates order/payment state correctly.
- Provider event ID is unique.
- Payment success for expired Pending Payment Order goes to reconciliation.
- Manual transfer proof path uses Slip2Go verification when available and requires owner/admin review when verification cannot auto-approve.
- Provider secret missing in production blocks launch check.
- Marketplace payment does not create top-up request.
- Marketplace payment does not touch wallet or coin ledger.

### Shipping

- Shipping fee is charged to buyer.
- Shipping fee is not counted as seller revenue.
- Admin can add carrier/tracking.
- Buyer can see shipping status.
- Shipping quote is frozen into order snapshot.
- Shipping fee mismatch goes to reconciliation.
- Official order and seller consignment order both use marketplace shipment states.
- Customer Bag reward shipping tokens are not accepted by Marketplace Shipping Quote Adapter.

### Payout

- Fee percent calculates correctly.
- Seller payout excludes shipping and buyer-side service fee.
- Payout cannot release before required admin milestone.
- Owner/admin actions are audited.
- Official shop order creates no seller payout liability and appears in official completion/revenue dashboard.
- Official shop order cannot enter payout release.
- Payout release requires owner-level role in MVP.
- Duplicate payout release action with same idempotency key does not duplicate payout.
- Refund/dispute after payout eligibility puts payout on hold or reconciliation.
- Payout paid confirmation requires manual/provider evidence.

### Admin

- Admin queue counts match filtered queue detail.
- `staff` can receive/ship but cannot release payout.
- `admin` can approve listing/refund within policy but cannot release payout.
- `owner` can release payout with note.
- Manual override requires owner and audit note.
- Admin cannot activate failed-inspection inventory.
- Admin cannot attach listing to Customer Bag reward ID.
- Admin cannot attach listing to gacha reward ID.
- Every admin transition writes audit event with actor, target, before/after state, note, timestamp, role snapshot, and idempotency key.
- Stale admin role snapshot never grants new access.

### Supabase And Runtime Security

- Marketplace service-role key is server-only.
- Marketplace Worker/backend, not browser code, owns Marketplace Supabase service-role access; Website reaches it through service binding or server-only signed context.
- Browser bundle does not contain Marketplace Supabase service key.
- Marketplace Supabase anon access cannot mutate money/admin tables.
- RLS or locked policies prevent public table mutation.
- No cross-project foreign keys are required.
- Marketplace migrations can run independently from YNOTT core migrations.
- Backup/PITR and restore drill plan exists before production money data.
- Same-origin mutation check protects checkout, seller submission, admin, refund, and payout routes.
- Rate limit protects checkout, payment proof upload, seller submission, refund request, admin payout release, and webhook replay.
- Idempotency keys are required for money and admin transitions.
- Production launch check fails if Marketplace Supabase env points at test/staging by mistake or if staging env points at production by mistake.
- Session security check confirms no marketplace token is stored in `localStorage`, query strings, or Marketplace Supabase, and YNOTT session cookies remain `HttpOnly`, `Secure`, and SameSite-protected.
- Session timeout check confirms expired/idle sessions cannot mutate buyer, seller, admin, official shop, payment, refund, payout, or upload state; stale high-risk owner/admin sessions require fresh verification.
- Upload security check confirms seller photos, official photos, and payment proofs use private storage, validation by size/type/extension/magic bytes, hash duplicate detection, scan/quarantine status, EXIF stripping for public derivatives, and short-lived signed access.
- Webhook security check confirms raw-body verification before parsing, stale/wrong-secret/wrong-environment rejection, duplicate replay safety, and different-payload conflict behavior.
- Payment/refund/payout cache check confirms private/no-store behavior for money pages and APIs.
- Secure performance check confirms security controls are placed in backend modules/projections/queues, hot predicates are indexed, service-binding calls are batched, and no private command table becomes a public browse hot path.
- Dependency/security advisory review is complete before public launch.

## Slice Acceptance Matrix

| Slice | Required proof |
| --- | --- |
| Slice 0 placeholder safe | Non-owner redirect, nav hidden, no live listing backend, coin-style placeholder flagged |
| Slice 1 foundation | Account Bridge uniqueness, server-only Marketplace Supabase Adapter, no gacha inventory path, RLS baseline |
| Slice 2 official shop | Official inventory/listing/order/shipping works, quantity Pending Payment Order is transaction-safe, no seller payout liability is created, refund/reconciliation minimum path |
| Slice 3 seller consignment | Seller submission, admin intake, inspection approval, risk-based listing activation guard, hard no Customer Bag/gacha source |
| Slice 4 user-seller purchase | Pending Payment Order concurrency, self-purchase rejection, payment idempotency, payout hold/release gate |
| Slice 5 hardening | Refunds, reconciliation, audit, provider replay, owner-only payout/manual override |

## Pre-Mortem

Failure scenario 1: payment succeeds but listing/item is unavailable.

Mitigation:

- Pending Payment Order.
- Unique active Pending Payment Order.
- Idempotent webhook.
- Admin reconciliation queue.

Failure scenario 2: seller payout is released before item is received or shipped.

Mitigation:

- Payout state machine.
- Admin role gate.
- Required inspection/shipping milestone.

Failure scenario 3: gacha reward accidentally becomes sellable marketplace inventory.

Mitigation:

- Marketplace Inventory Module rejects Customer Bag/reward IDs.
- Test fixtures include Settled Reward, Settling Reward, converted reward, and shipped reward negative cases.
- Customer Bag UI has no marketplace sell action for rewards.

Failure scenario 4: marketplace DB and YNOTT core profile/account data disagree.

Mitigation:

- Marketplace Account Bridge verifies profile status for sensitive actions.
- Public browse reads snapshots and does not require YNOTT profile lookup.
- Checkout, seller, admin, and account actions fail closed if profile verification fails.
- Reconciliation job flags stale Marketplace Accounts.

Failure scenario 5: two buyers race for one listing.

Mitigation:

- Unique active Pending Payment Order per one-unit listing.
- Payment confirmation verifies Pending Payment Order/order.
- Losing checkout expires or refunds.

Failure scenario 6: admin mistake changes money state.

Mitigation:

- Role gates.
- Owner approval for payout release and manual override; admin workflow handles refunds with no amount threshold.
- Append-only audit events.
- Reconciliation queue and manual rollback procedure.

Failure scenario 7: official shop order accidentally creates seller liability.

Mitigation:

- Seller Type Adapter.
- `seller_type = official_shop`.
- No seller payout liability for official shop order.
- Test that payout release command rejects official orders.

## Launch Gates

- Staging Marketplace Supabase database exists.
- Production Marketplace Supabase project is distinct from staging and YNOTT core unless a documented exception is approved.
- Marketplace migration path is documented.
- Marketplace backup/PITR/restore plan is approved before production money records.
- Payment provider test mode verified.
- Webhook secret configured.
- Admin can inspect orders and payouts.
- End-to-end buyer/seller/admin UAT passes.
- Refund, Pending Payment Order expiry, and seller pre-intake cancellation paths tested before production.
- Official shop verification slice passes before user-seller verification slice, unless product deliberately accepts higher risk.
- Customer Bag gacha separation tests pass.
- Verification scripts pass in CI or prelaunch runbook.
- Feature flags and rollback switches are tested.

## Backend Evidence Matrix

| Evidence | Slice | Required proof |
| --- | --- | --- |
| Schema/RLS report | 1 before any marketplace writes | Tables, constraints, RLS, grants, and server-only RPC permissions pass. |
| Service-boundary credential report | 1 before public routes | Marketplace service-role credential is present only in Marketplace backend runtime; Website-to-Marketplace call path works without direct browser or client DB access. |
| Input and CSRF report | 1 before mutations | Same-origin/CSRF/session checks, schema allowlists, unknown-field rejection, and safe error responses pass for every mutation route. |
| Secure architecture/performance report | 1 before owner-only testing expands | Public reads use projections/cache safely, command paths use indexed RPC/module boundaries, service-binding calls are batched, and queue/offline work is outside page render paths. |
| Account bridge report | 1 | One YNOTT profile maps to one Marketplace Account; blocked profiles fail closed. |
| No-gacha inventory report | 1/3/4 | Customer Bag rewards, gacha rewards, reward conversion, wallet, and shipping reward IDs are rejected at inventory/listing/Pending Payment Order seams. |
| Upload/evidence security report | 2/3 before public uploads | Seller photos, official photos, and payment proofs are private, validated, scanned/quarantined, deduped, EXIF-stripped for public derivatives, and signed-url scoped. |
| Official checkout transaction report | 2 | Official Pending Payment Order/payment creates THB snapshot, buyer service fee snapshot, quantity-safe lock, and no seller payout liability. |
| Webhook idempotency report | 2 before public payment | Duplicate provider event cannot duplicate order, listing, fee, refund, or payout state. |
| Redaction and logging report | 2/3/4/5 | API responses, logs, audit views, and telemetry do not expose secrets, raw provider payloads, bank/payout data, full addresses where not needed, raw errors, or private evidence. |
| Admin workflow report | 2/3/4/5 | Admin command writes command ledger, audit event, queue update, and state transition with role proof. |
| Seller intake report | 3 | Submission cannot become inventory/listing until received and inspection-passed by admin route/RPC. |
| Checkout concurrency report | 4 | Two buyers racing for one listing produce one Pending Payment Order winner and one safe loser. |
| Payout release report | 4/5 | Payout excludes shipping and buyer-side service fee, requires owner, blocks official shop, blocks active refund/dispute, and is idempotent. |
| Refund/reconciliation report | 5 | Refund amount limits hold, mismatch creates reconciliation, and audit explains the state. |

## Frontend Evidence Matrix

| Evidence | Slice | Required proof |
| --- | --- | --- |
| Current gate screenshots | 0 | Non-owner marketplace redirect/nav hidden and placeholder cannot look live. |
| Account/Customer Bag screenshots | 1 | One-login account state, `Gacha Rewards` and `Marketplace` sibling sections, no reward sell action. |
| Buyer browse/detail screenshots | 2/4 | THB price, source badge, card/detail layout, sold/pending-payment/unavailable states. |
| Checkout screenshots | 2/4 | Item price, shipping fee, buyer service fee, total payable, address/payment state, quote changed/expired states. |
| Official admin screenshots | 2 | Inventory create/edit readiness, official source badge, payout controls hidden. |
| Seller dashboard/form screenshots | 3 | Seller timeline, draft/submitted states, validation, photo upload, payout estimate. |
| Admin queue screenshots | 2/3/4/5 | Queue counts, row density, detail command panel, role/evidence locked actions. |
| Money exception screenshots | 5 | Refund/reconciliation/payment replay states without raw provider secrets. |
| Accessibility report | Each public slice | Keyboard path, focus states, contrast, labels, and error associations pass for new surfaces. |

## Suggested Package Scripts

These names are planning targets. Exact scripts should follow existing repo conventions in `Website/package.json`, which currently uses `node --test scripts/*.mjs` and `node tools/verification/*.mjs`.

- `verify:marketplace-identity-bridge`.
- `verify:marketplace-schema`.
- `verify:marketplace-rpc-contracts`.
- `verify:marketplace-rls`.
- `verify:marketplace-hardening`.
- `verify:marketplace-launch-gates`.
- `verify:marketplace-no-gacha-inventory`.
- `verify:marketplace-money-invariants`.
- `verify:marketplace-webhook-idempotency`.
- `verify:marketplace-admin-workflow`.
- `test:marketplace-current-gate`.
- `test:marketplace-api-contracts`.
- `test:marketplace-rpc-transactions`.
- `test:marketplace-inventory`.
- `test:marketplace-gacha-separation`.
- `test:marketplace-checkout`.
- `test:marketplace-payment`.
- `test:marketplace-shipping`.
- `test:marketplace-payout`.
- `test:marketplace-admin-ops`.
- `test:marketplace-visual`.
- `test:marketplace-responsive`.
- `test:marketplace-a11y`.
- `test:marketplace-copy-guard`.

## Accepted Deep Design Decisions

- Owner-only UAT covers official browse/detail, Pending Payment Order, Slip2Go proof, admin fulfilment, refund test, and one seller-consignment flow.
- The `Boo Boo` owner account must be mapped by stable `profile_id` or admin row, not display name.
- SIT payment proof fixtures: valid slip, duplicate slip, wrong amount, wrong receiver, and expired Pending Payment Order.
- Production monitoring alerts: payment mismatch, Pending Payment Order expiry spike, duplicate slip, payout release failure, and Supabase/RLS verification failure.
- Minimum restore-drill proof before real money: successful restore to a separate project plus documented row-count/hash checks for marketplace money tables.
- CI runs unit/API/static/RLS SQL checks with fixtures. SIT runs real Marketplace Supabase, Slip2Go sandbox/mock, Cloudflare binding, and browser UAT.
