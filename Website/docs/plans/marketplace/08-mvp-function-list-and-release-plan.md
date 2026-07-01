# Marketplace MVP Function List And Release Plan - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-27

## Goal

Define what belongs in the first safe MVP and what waits until later.

The MVP should prove real THB checkout, official shop fulfilment, middleman consignment, seller-side Marketplace Fee, buyer-side service fee, buyer shipping charge, Seller Payout control, and seamless YNOTT login without letting gacha rewards become marketplace inventory.

Implementation can happen as one coordinated build after all marketplace documents are aligned, but verification should still be slice-gated. Each slice must have its own feature flag, owner-only test switch, data checks, and rollback path.

## Document Role

This document owns MVP scope counting and release sequencing. It should translate docs `00` through `07` into buildable slices, launch gates, rollback rules, and acceptance evidence without changing the locked architecture decisions.

## MVP Release Decision Locks

- MVP scope includes both official shop and user-seller consignment.
- MVP scope is fully functional for all listed core marketplace flows, not a clickable demo.
- Prelaunch marketplace is owner-only for testing across browse, checkout, seller submission, admin workflow, refund, payout, and reconciliation.
- Public browse may be enabled after launch gates pass; checkout and seller actions require login.
- Marketplace runs as a separate Marketplace Worker/service and uses a new Marketplace Supabase project plus SIT/staging.
- Official shop is a separate tab/page, not silently mixed with user listings.
- Official shop can sell cards, sealed boxes, and sealed packs. Official quantity products are in MVP scope and must pass transaction-safe Pending Payment Order tests.
- Seller item types are cards, sealed boxes, and sealed packs first. Later expansions may include other physical products such as shoes or clothes.
- Seller access is not invite-only; the owner-only feature gate controls MVP testing before wider release.
- Seller-side marketplace fee defaults to 10 percent and is admin-configurable.
- Buyer-side service fee defaults to 10 percent, is admin-configurable, and is shown as a checkout line.
- Checkout redirects to a payment proof upload page after the Pending Payment Order is created.
- Payment starts with manual PromptPay/bank transfer proof verified through the existing Slip2Go-style pipeline where possible. Shipping starts with fixed 150 THB plus admin tracking.
- Refunds are required when an item does not meet marketplace requirements, including condition, inspection, authenticity, quantity, or fulfilment mismatch.
- Seller payout release is owner-only. All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.

## Current Runtime And Release Constraint

Current YNOTT runtime evidence:

- `/marketplace` exists as an owner-only prelaunch surface and reads Marketplace listing snapshots when the Marketplace service is configured.
- Store navigation still keeps Marketplace hidden from normal customers until launch gates pass.
- Marketplace UI now uses THB listing cards/detail, server-side checkout, buyer order history/detail, seller dashboard, official shop admin, seller consignment, payout, and Customer Bag Marketplace summary surfaces.
- Independent runtime pause flags exist for browse, checkout, seller submission, listing activation, payment proof, and payout release.
- Customer Bag/Reward Conversion wording uses "Sell only" for coin conversion, which must stay separate from marketplace selling.

Release constraint:

- Public marketplace cannot launch by only removing the admin gate.
- Each public surface must be backed by Marketplace Account Bridge, Marketplace Inventory, Pending Payment Order, Money Snapshot, Admin Workflow, and verification checks.

## Architecture Deepening Priority

Doc `08` should not become a list of shallow pages. The 65 MVP functions should be implemented through a small set of deep Modules whose Interfaces hide the real-money, stock, identity, and admin safety rules.

Top deepening order:

| Priority | Deep Module | Functions covered | Performance improvement | Security improvement |
| --- | --- | --- | --- | --- |
| 1 | Pending Payment Order Module | 25, 29, 40, 43, 46, 47 | One transaction-safe checkout lock and bounded reads by listing/order/account. | Prevents double-buy, stale checkout, proof replay, and self-purchase bypass. |
| 2 | Marketplace Money Module | 34, 42, 48-55 | One satang calculation Interface for buyer totals, fees, refunds, payout, and reconciliation. | Browser never controls trusted totals, fee rates, payout, refund state, or provider state. |
| 3 | Marketplace Admin Workflow Module | 22, 24, 26, 35-38, 53-65 | Queue pages use projections and one command envelope instead of bespoke mutation flows. | Role, evidence, idempotency, audit, and manual override rules live in one place. |
| 4 | Marketplace Inventory Module | 12, 22-24, 28, 29, 37, 38 | Listing and checkout read marketplace-owned snapshots instead of cross-domain live joins. | Gacha Rewards, Customer Bag rewards, and Reward Conversion rows are rejected once at the inventory seam. |
| 5 | Marketplace Listing Query Module | 13, 15-21, 39, 45 | Public browse/detail read indexed snapshots with cursor pagination. | Public surfaces expose safe listing fields only, with no payout/provider/private data. |
| 6 | Marketplace Account Bridge Module | 1-7 | One request-local identity/capability result removes repeated profile lookups. | No client-trusted profile ID, account mode, role, or capability flag. |
| 7 | Payment Provider Adapter | 43, 52 | Provider-specific proof/webhook work stays fast and idempotent. | Raw Slip2Go/provider payloads, secrets, and duplicate-slip checks stay away from Order/Money callers. |
| 8 | Customer Bag Aggregator Module | 4, 39, 45 | Gacha and marketplace activity can be loaded in parallel into one account model. | `Gacha Rewards` and `Marketplace` actions stay separate; no reward ID is accepted by marketplace mutations. |

Top recommendation: deepen Pending Payment Order and Marketplace Money first, because they protect the highest-risk MVP path: buyer starts checkout, money totals freeze, payment proof is uploaded, the item becomes sold, refund/reconciliation remains possible, and Seller Payout liability is correct.

## MVP Function List By Module

### Account And Access

1. Marketplace Account Bridge using existing YNOTT profile.
2. Buyer and seller modes on the same Marketplace Account.
3. Marketplace admin/operator context from YNOTT admin role resolver.
4. Customer Bag `Marketplace` section composed separately from `Gacha Rewards`.
5. Feature flag/owner-only launch control while MVP is hidden.
6. Seller terms acceptance and seller capability status.
7. Buyer checkout capability status.

### Marketplace Data And Supabase

8. Separate Marketplace Supabase project.
9. Marketplace schema for accounts, inventory, submissions, listings, pending payment orders, payments, shipping, fees, payouts, audit, idempotency, and reconciliation.
10. Server-only Marketplace Supabase Adapter.
11. No cross-project foreign keys; external references stored and validated through adapters.
12. Hard rejection of Customer Bag/gacha reward IDs as Marketplace Inventory.
13. Marketplace read snapshots for public browse.
14. Migration ledger and backup/restore checklist for Marketplace Supabase.

### Browse And Listing Detail

15. Marketplace browse page.
16. Official shop filter/page.
17. Listing detail page.
18. Listing card/detail snapshots.
19. Search/sort/filter minimal pass.
20. THB price formatting with no coin icon.
21. Hidden/sold/unavailable listing states.

### Official Shop

22. Admin creates official Marketplace Inventory.
23. Official Shop Ingestion Adapter from YNOTT-owned stock/reference data.
24. Admin publishes official Marketplace Listing.
25. Buyer buys official listing.
26. Admin fulfils official order.
27. Official order creates no seller payout liability and appears in official completion/revenue dashboard.
28. Official inventory hide/archive flow.
29. Official quantity product Pending Payment Order and stock movement flow.

### Seller Consignment

30. Seller dashboard.
31. Seller terms acceptance.
32. Seller item submission draft.
33. Condition, variant, grade, language, cert, photo, and notes form.
34. Seller price and payout preview.
35. Admin sends intake instruction.
36. Admin marks received and inspection result.
37. Admin creates/approves Marketplace Inventory from consignment.
38. Admin activates seller Marketplace Listing after inspection approval and any risk-based check.
39. Seller sold-item and payout history.

### Checkout And Order

40. Pending Payment Order.
41. Buyer address confirmation.
42. Fixed 150 THB shipping snapshot with admin-adjustable fee configuration.
43. Manual transfer proof path with Slip2Go/manual verification.
44. Marketplace Order state machine.
45. Buyer order history.
46. Self-purchase rejection.
47. Pending Payment Order expiry and replay handling.

### Money, Fee, Payout

48. Seller-side Marketplace Fee calculation in basis points.
49. Buyer-side service fee calculation in basis points.
50. Seller Payout calculation excluding shipping and buyer-side service fee.
51. Immutable order money snapshot in THB satang.
52. Payment webhook/provider event idempotency.
53. Refund request/admin path.
54. Payout hold/release/paid confirmation.
55. Reconciliation queue for money or inventory mismatches.

### Admin Control Center

56. Official inventory queue.
57. Consignment intake queue.
58. Inspection queue.
59. Risk-based listing activation queue.
60. Paid orders queue.
61. Shipping queue.
62. Refund/dispute queue.
63. Seller payout queue.
64. Marketplace audit events.
65. Owner-only manual override path.

## Function-Level Performance And Security Improvements

Every function in the MVP list must carry an explicit performance and security improvement. This table is the implementation checklist for doc `08`; if implementation cannot satisfy one row, that row becomes a launch blocker for the related slice.

| # | MVP function | Performance improvement | Security improvement |
| --- | --- | --- | --- |
| 1 | Marketplace Account Bridge using existing YNOTT profile. | Account ensure is idempotent and profile resolution is cached per request. | Disabled or stale YNOTT profile fails closed before marketplace action. |
| 2 | Buyer and seller modes on the same Marketplace Account. | Capability snapshot avoids duplicate buyer/seller checks across pages. | Client-selected account mode is ignored; server returns allowed capabilities and blocked reasons. |
| 3 | Marketplace admin/operator context from YNOTT admin role resolver. | Admin role is resolved once per command and kept request-local. | Role is checked live through the YNOTT Admin Role Adapter, not trusted from marketplace snapshots. |
| 4 | Customer Bag `Marketplace` section composed separately from `Gacha Rewards`. | Customer Bag Aggregator loads gacha and marketplace sections in parallel. | Reward actions and marketplace actions are separate; no reward listing action appears. |
| 5 | Feature flag/owner-only launch control while MVP is hidden. | Server-side flag short-circuits hidden routes before expensive work. | No client-only hiding; marketplace routes fail closed when feature config is missing. |
| 6 | Seller terms acceptance and seller capability status. | Terms version is stored once and reused in seller capability display. | Acceptance is audited with profile, terms version, timestamp, and request context. |
| 7 | Buyer checkout capability status. | Checkout capability is computed from account, listing, address, and state in one server result. | Client cannot override blocked reason, buyer identity, or checkout eligibility. |
| 8 | Separate Marketplace Supabase project. | Marketplace load, indexes, backup, and restore drills can be tuned separately from gacha. | Environment guard prevents SIT/staging/prod Marketplace Supabase mixups. |
| 9 | Marketplace schema for accounts, inventory, submissions, listings, pending payment orders, payments, shipping, fees, payouts, audit, idempotency, and reconciliation. | Add state, queue, snapshot, idempotency, and audit indexes before launch. | RLS, grants, append-only audit, and source-kind constraints are verified by scripts. |
| 10 | Server-only Marketplace Supabase Adapter. | One request-scoped adapter avoids scattered Supabase client creation. | Marketplace service-role key is absent from browser bundles and `NEXT_PUBLIC_*` env. |
| 11 | No cross-project foreign keys; external references stored and validated through adapters. | Snapshots avoid live cross-project joins on browse/order screens. | Server adapters validate YNOTT refs before Marketplace RPCs; browser refs are not trusted. |
| 12 | Hard rejection of Customer Bag/gacha reward IDs as Marketplace Inventory. | Source-kind checks are O(1) constraints or indexed validations. | Negative fixtures cover Settled Reward, Settling Reward, converted reward, shipped reward, and draw IDs. |
| 13 | Marketplace read snapshots for public browse. | Public browse uses cursor pagination and cacheable listing snapshots. | Public projection exposes safe fields only and no seller payout/provider/private data. |
| 14 | Migration ledger and backup/restore checklist for Marketplace Supabase. | Marketplace migrations can run independently from YNOTT core migrations. | Backup, PITR, restore drill, and migration ledger evidence are required before money data. |
| 15 | Marketplace browse page. | Browse reads indexed listing snapshots and does not create Marketplace Account rows. | Logged-out/public browse cannot see private seller, buyer, payout, payment, or admin fields. |
| 16 | Official shop filter/page. | Source-kind index supports fast official filtering. | Official shop surface never displays seller payout language or user-seller controls. |
| 17 | Listing detail page. | Detail reads one listing snapshot by indexed ID/slug plus current state. | Checkout action always re-reads live listing/version server-side before locking. |
| 18 | Listing card/detail snapshots. | Snapshot version/hash prevents repeated joins to reference, inventory, and seller data. | Snapshot stores only public-safe display fields. |
| 19 | Search/sort/filter minimal pass. | MVP search uses indexed fields only: source, state, price, type, condition, and updated time. | Expensive filters are rate-limited and cannot expose hidden/private states. |
| 20 | THB price formatting with no coin icon. | Server returns satang-backed display lines so every surface formats consistently. | Browser does not calculate trusted money totals and does not reuse coin wallet formatters. |
| 21 | Hidden/sold/unavailable listing states. | Listing state index keeps unavailable items cheap to filter. | Server blocks stale buy buttons even if a hidden/sold listing is visible in old UI state. |
| 22 | Admin creates official Marketplace Inventory. | Official inventory stores reference snapshot at creation time. | Admin command writes audit event and rejects Customer Bag/gacha source refs. |
| 23 | Official Shop Ingestion Adapter from YNOTT-owned stock/reference data. | Ingestion can batch validated YNOTT reference snapshots. | Adapter is read-only against YNOTT core and cannot mutate gacha stock/customer rewards. |
| 24 | Admin publishes official Marketplace Listing. | Publish creates listing and public snapshot in one transaction. | Only approved marketplace-owned inventory can publish. |
| 25 | Buyer buys official listing. | Official purchase reuses Pending Payment Order instead of a separate checkout path. | Official order creates no seller payout liability. |
| 26 | Admin fulfils official order. | Paid official orders appear in queue projections by fulfilment state. | Buyer address and full payment detail are role-gated to detail view, not queue rows. |
| 27 | Official order creates no seller payout liability and appears in official completion/revenue dashboard. | Completion/revenue dashboard reads ledger/projection rows, not payout joins. | Verification asserts no payout rows exist for official shop orders. |
| 28 | Official inventory hide/archive flow. | Hide/archive is a soft-state update that keeps history queryable. | Paid order history and audit remain readable; destructive deletion requires explicit approval. |
| 29 | Official quantity product Pending Payment Order and stock movement flow. | Quantity stock lock/decrement is atomic and indexed by product/state. | Partial unique/transaction checks prevent oversell and double paid orders. |
| 30 | Seller dashboard. | Seller dashboard reads seller projections with cursor pagination. | Seller cannot see buyer private address, provider events, or admin private notes. |
| 31 | Seller terms acceptance. | Versioned terms avoid repeated text comparison or document lookup. | Acceptance audit proves which seller accepted which terms version. |
| 32 | Seller item submission draft. | Draft save uses idempotency and bounded photo metadata reads. | Submission route rejects browser-supplied seller/admin/payout fields. |
| 33 | Condition, variant, grade, language, cert, photo, and notes form. | Client preview uses local files while server stores metadata once. | Uploads use private storage, file type/size/hash checks, EXIF stripping, and signed access. |
| 34 | Seller price and payout preview. | Payout preview calls Marketplace Money Module with cached active fee rules. | Preview is labeled estimate and browser-submitted payout is never trusted. |
| 35 | Admin sends intake instruction. | Instruction uses a template snapshot to avoid recomputing content on history views. | Admin command writes idempotent audit event with actor and note/evidence. |
| 36 | Admin marks received and inspection result. | Inspection transition checks current state/version before writing. | Required evidence must exist before pass/fail; failed items cannot publish. |
| 37 | Admin creates/approves Marketplace Inventory from consignment. | Approved submission creates marketplace-owned inventory once. | Inventory cannot be created from unreceived, failed, duplicate, or gacha/Customer Bag source. |
| 38 | Admin activates seller Marketplace Listing after inspection approval and any risk-based check. | Activation reads risk reasons from indexed projection. | Client cannot lower risk or publish inventory that failed receipt/inspection policy. |
| 39 | Seller sold-item and payout history. | Seller sold/payout history uses account-scoped projections and cursor pagination. | Seller never receives buyer address, provider secrets, or admin-only evidence. |
| 40 | Pending Payment Order. | Unique active lock and bounded transaction reads prevent checkout race scans. | Idempotency, listing/version checks, and owner checks happen server-side. |
| 41 | Buyer address confirmation. | Address snapshot is copied at checkout so order detail avoids live address joins. | Server validates address ownership/status and stores only the needed delivery snapshot. |
| 42 | Fixed 150 THB shipping snapshot with admin-adjustable fee configuration. | Shipping config version is copied to the order snapshot. | Shipping fee never increases Seller Payout and cannot be changed by browser. |
| 43 | Manual transfer proof path with Slip2Go/manual verification. | Slip image hash and evidence ID let duplicate checks run before expensive review. | File type, size, hash, rate limit, duplicate slip, receiver, amount, and date/window checks are required. |
| 44 | Marketplace Order state machine. | One transition Interface keeps order state changes indexed and predictable. | Invalid state transitions fail with stable codes and open reconciliation where needed. |
| 45 | Buyer order history. | Buyer order history reads compact account-scoped projections. | Server resolves Marketplace Account ownership; browser account IDs are ignored. |
| 46 | Self-purchase rejection. | Buyer/seller account IDs are indexed on listing/order start. | Self-purchase rejection is server-side and cannot be bypassed by hiding UI state. |
| 47 | Pending Payment Order expiry and replay handling. | Expiry job reads by `(state, expires_at)` and replay returns stored result. | Late proof or conflicting replay opens reconciliation instead of silently mutating order. |
| 48 | Seller-side Marketplace Fee calculation in basis points. | Versioned fee rules can be cached by active rule/version. | Fee bounds and integer satang calculation are enforced server-side. |
| 49 | Buyer-side service fee calculation in basis points. | Buyer fee rule lookup is shared with Money Module checkout quote. | Buyer fee appears as separate line and never increases Seller Payout. |
| 50 | Seller Payout calculation excluding shipping and buyer-side service fee. | Payout uses frozen order money snapshot and avoids recompute drift. | Negative payout, overpay, shipping payout, and buyer-fee payout are blocked. |
| 51 | Immutable order money snapshot in THB satang. | Unique order snapshot gives fast order/detail/ledger reads. | Original money facts are immutable; corrections are ledger/refund/reconciliation events. |
| 52 | Payment webhook/provider event idempotency. | Unique provider event index is checked before loading related order detail. | Raw-body signature verifies before parse/write; replay with different payload fails. |
| 53 | Refund request/admin path. | Refund queue uses state and updated-time projection indexes. | Admin handles all refunds with no amount threshold; refund cannot exceed captured buyer total. |
| 54 | Payout hold/release/paid confirmation. | Payout queue is indexed by state and release eligibility. | Owner release is required; evidence is required; active refund/dispute/reconciliation blocks payout. |
| 55 | Reconciliation queue for money or inventory mismatches. | Reconciliation workers process bounded batches by status and updated time. | Unsafe follow-on transitions are blocked until reconciliation is resolved. |
| 56 | Official inventory queue. | Queue rows are projection-backed and cursor-paginated. | Queue rows omit full private images, raw source payloads, and full audit history. |
| 57 | Consignment intake queue. | Intake queue indexes state, priority, and updated time. | Queue rows omit full seller private data and only detail view loads evidence. |
| 58 | Inspection queue. | Inspection projection includes evidence counters and next required action. | Private images are loaded through signed/role-gated access only. |
| 59 | Risk-based listing activation queue. | Server-generated risk reasons are stored in projection rows. | Browser cannot downgrade risk, skip required evidence, or publish directly. |
| 60 | Paid orders queue. | Paid orders queue indexes payment/fulfilment state. | Queue rows hide raw provider payloads, secrets, and full buyer address. |
| 61 | Shipping queue. | Shipping queue reads tracking/fulfilment projection by state. | Full address snapshots are role-gated to detail views and redacted in logs. |
| 62 | Refund/dispute queue. | Refund/dispute queue indexes refund state and updated time. | Admin note/evidence is required for approval/result; audit is append-only. |
| 63 | Seller payout queue. | Payout queue indexes release eligibility and state. | Bank/payout details are protected and owner-only release action is enforced server-side. |
| 64 | Marketplace audit events. | Audit events are paginated by `(target_type, target_id, created_at desc)`. | Audit is append-only, redacted, and includes actor, command, request ID, before/after state, and evidence refs. |
| 65 | Owner-only manual override path. | Manual override is rare and should not sit in hot browse/checkout paths. | Break-glass action requires owner role, note, evidence, idempotency key, and reconciliation alert. |

## Release Slice Contract

Each slice has:

- Entry criteria: what previous Modules must already exist.
- Build scope: what functions are added.
- Verification: what proves it works.
- Launch gate: who can see/use it.
- Rollback: how to hide or stop it without data loss.

This makes the release plan deep enough to guide implementation, testing, and launch decisions.

## Frontend Release Direction

Marketplace UI should release as working product surfaces, not as promotional shells.

- First public viewport should show actual marketplace browse or a gated prelaunch state.
- Use real item/card imagery when listings exist.
- Keep UI quiet, transactional, and scan-friendly; no oversized marketing hero for operational marketplace pages.
- Preserve YNOTT shell/navigation patterns so the user feels one account and one site.
- Keep Customer Bag `Gacha Rewards` and `Marketplace` sections visually distinct but adjacent.
- Replace all coin-style marketplace placeholders before any public marketplace exposure.

## Frontend Slice Contract Matrix

| Slice | Required UI surfaces | Required UI states | Frontend launch gate |
| --- | --- | --- | --- |
| 0 | Gated marketplace shell, hidden nav. | Non-owner redirect, safe empty placeholder, no coin-price public card. | Placeholder cannot be mistaken for live marketplace. |
| 1 | Account status strip, Customer Bag Marketplace tab plan, owner-only shell. | Loading, empty, blocked account, seller terms required. | One-login experience visible without second account language. |
| 2 | Official shop browse/detail, official checkout, official admin inventory/fulfilment. | Official source badge, sold/pending-payment/unavailable, payment pending/paid/failed, fulfilment states. | Buyer can inspect real official item, THB total, and order state on mobile/desktop. |
| 3 | Seller dashboard, submission form, photo upload, intake status timeline, admin intake/inspection. | Draft, missing fields, upload progress/error, submitted, instruction sent, received, inspection pass/fail. | Seller cannot confuse gacha reward conversion with marketplace consignment. |
| 4 | User-seller listing detail, user-seller checkout, seller sold/payout history, admin payout queue. | Self-purchase blocked, checkout race loser, payout held/eligible/approved/paid. | Shipping is never shown as seller revenue and payout release is role-gated in UI. |
| 5 | Refund/reconciliation dashboard, audit detail, hardening states. | Refund requested/processing/refunded, reconciliation required/resolved, provider replay already processed. | Operators can resolve exceptions without raw provider secrets or layout overload. |

## Frontend Launch Gates

Before public launch of each slice:

- Mobile and desktop screenshots exist for the primary route and at least one error/empty state.
- Text fits inside cards, buttons, tables, queue rows, and checkout totals.
- THB formatting replaces coin icons/coin language on marketplace surfaces.
- Source badges show `Official shop` or `User seller` where listing source matters.
- Gacha reward surfaces do not show marketplace sell/listing actions.
- Marketplace surfaces do not reuse Reward Conversion copy such as `Sell for coins`.
- Primary actions have disabled/block reasons near the action.
- Loading skeletons have stable dimensions and do not shift grids/tables.
- Keyboard focus order works for checkout forms, seller submission forms, admin command panels, and filter drawers.
- Status badges use text plus color and pass contrast checks.

## Frontend Rollback Rules

- Feature flags should hide public nav, browse, checkout, seller submission, listing activation, payment proof upload, and payout release independently.
- Rollback UI must keep paid orders/admin fulfilment visible even when new checkout is disabled.
- Rollback UI must keep seller submissions visible for return/communication even when new submissions are disabled.
- Public browse can remain visible only if detail/checkout actions clearly show disabled state and no stale buy button.
- Admin queues should show paused-state banners so staff understand which actions are disabled by feature flags.

## Backend Delivery Dependency Graph

Build backend foundations before public UI removal:

```text
Feature flags and server config
  -> Marketplace Supabase project/schema
  -> Marketplace Account Bridge
  -> Inventory and listing snapshots
  -> Pending Payment Order RPC
  -> Order money snapshot and payment attempts
  -> Admin Workflow command/audit layer
  -> Official shop functional path
  -> Consignment intake
  -> User-seller checkout and payout
  -> Refund/reconciliation hardening
```

Dependency rules:

- No public browse without listing snapshot read model and THB formatting.
- No checkout without Pending Payment Order RPC, order money snapshot, and payment idempotency.
- No official shop public payment without admin fulfilment, refund, and reconciliation minimum routes.
- No seller consignment public intake without seller submission tables, private photo storage, admin receive/inspection commands, and audit.
- No user-seller purchase without payout liability, owner-only release, refund hold rules, and reconciliation queue.
- No direct browser Supabase mutation for marketplace money, admin workflow, seller submissions, or inventory state.

## Backend Slice Contract Matrix

| Slice | Required migrations | Required API routes | Required RPCs/commands | Backend launch gate |
| --- | --- | --- | --- | --- |
| 0 | None, or feature-flag metadata only. | Existing gated marketplace route only. | None. | Non-owner remains redirected and no live money route is public. |
| 1 | Accounts, idempotency, audit base, inventory/listing skeleton, RLS/grants. | `/api/marketplace/account/me`, `/api/marketplace/account/ensure`. | `marketplace_get_or_create_account`, `marketplace_accept_seller_terms`. | Unique `ynot_profile_id`, service-role server-only check, Customer Bag/gacha rejection checks. |
| 2 | Official inventory, quantity products, listings, snapshots, pending payment orders, payments, shipping snapshots, admin workflow minimum. | Official admin routes, listing browse/detail, pending-order create/release, payment-proof, order history. | `marketplace_create_official_inventory`, `marketplace_publish_official_listing`, `marketplace_create_pending_payment_order`, `marketplace_submit_official_payment_proof`, `marketplace_record_official_payment_result`, `marketplace_release_pending_payment_order`. | Paid official order has no seller payout liability; admin can fulfil/refund/reconcile and see official completion/revenue. |
| 3 | Seller submissions, submission photos/events, intake states, payout preview snapshots. | Seller session/terms/submissions/photos/payout-preview, admin intake/inspection routes. | `marketplace_create_seller_submission`, `marketplace_submit_seller_submission`, `marketplace_admin_apply_transition`, `marketplace_record_intake_transition`, `marketplace_quote_seller_payout_preview`. | Submitted item cannot become listing until received and inspected; gacha/Customer Bag IDs rejected. |
| 4 | User-seller listing activation, seller payout liability, payout events, expanded order workflow. | User-seller checkout, admin payout queue, seller sold/payout history. | `marketplace_admin_apply_transition`, `marketplace_admin_publish_listing`, `marketplace_release_seller_payout`, `marketplace_mark_seller_payout_paid`. | Concurrency prevents double buy; own-listing purchase rejected; payout excludes shipping. |
| 5 | Refunds, money ledger, reconciliation items, queue projections, webhook event hardening. | Refund routes, reconciliation routes, webhook route, admin audit detail. | `marketplace_admin_apply_transition`, `marketplace_record_refund_transition`, `marketplace_apply_refund_event`, `marketplace_open_reconciliation_item`, `marketplace_resolve_reconciliation_item`. | Replayed provider/refund/payout events do not duplicate money or state transitions. |

## Supabase Release Gates

Before each real-money slice:

- Migration exists in the correct `Database/` migration path or approved Marketplace Supabase migration path.
- Migration has rollback/disable notes for feature flags and public access, even when table deletion is not safe.
- RLS is enabled on every exposed marketplace table.
- Direct mutation grants are revoked from browser roles for inventory, money, admin workflow, payout, refund, and seller submission tables.
- Server-only RPCs revoke `execute` from `public`, `anon`, and `authenticated`; grant only to the Marketplace backend service role.
- Any view exposed through Supabase access is either `security_invoker = true` where available or kept server-only/unexposed.
- Any `security definer` RPC sets fixed `search_path`, validates actor ownership/role internally, and is unavailable to browser roles.
- Seed data for owner-only testing is marked clearly as test data if not production inventory.
- Backup, PITR, restore-drill, or export evidence exists before storing real payment/order/payout records.

## API And Adapter Release Gates

- All marketplace route handlers check server config before use and fail closed when Marketplace Supabase is unavailable.
- In deployed MVP, Website route handlers call the Marketplace Worker/backend through a service binding or server-only signed context. Marketplace DB credentials stay in the Marketplace backend boundary.
- Mutation routes enforce same-origin, route-specific rate limits, idempotency keys, request body allowlists, and structured error codes.
- Authenticated routes resolve YNOTT profile/admin role before calling Marketplace RPCs.
- Account bridge creates or reads exactly one Marketplace Account per YNOTT profile.
- Adapters pass external IDs/snapshots across the YNOTT/Marketplace boundary; no cross-project transaction or foreign key is assumed.
- Payment webhooks verify raw-body signatures before parsing and are idempotent by provider event ID.
- Admin workflow routes derive actor IDs and role server-side; browser-submitted actor/role fields are ignored or rejected.

## Security Release Gates

Each slice must pass security evidence before wider access:

- HTTPS gate: marketplace pages, APIs, upload/storage access, payment redirects, and webhooks are HTTPS-only in production. HTTP traffic redirects or fails closed, secure cookies require HTTPS, and mixed-content assets fail the launch check.
- Secret scan: no Marketplace Supabase service-role key, webhook secret, provider key, signed URL, or payout credential appears in source, logs, browser bundles, `NEXT_PUBLIC_*`, screenshots, or fixture output.
- Auth/session gate: marketplace mutations use the existing YNOTT server-side session resolver, same-origin/CSRF protection, `HttpOnly`/`Secure`/`SameSite` cookie policy, explicit session expiry/idle-timeout handling, fresh owner/admin checks for high-risk commands, and no marketplace token in `localStorage`.
- RBAC gate: buyer, seller, admin, operator, and owner permissions are derived server-side from YNOTT identity/admin records and Marketplace Account state. Browser-submitted role, actor, permission, owner, seller, buyer, or payout-authority fields are rejected.
- Password/auth gate: marketplace introduces no password table, password hash column, password reset path, or alternate credential store. Existing YNOTT/Supabase Auth remains the owner for password hashing, credential reset, login throttling, and primary session issuance.
- Service boundary gate: Website-to-Marketplace calls are internal, short-lived, signed or service-binding trusted, include `request_id`, and reject stale/replayed context.
- Input validation gate: every mutation route has a schema allowlist test for unknown fields, forbidden owner/profile/account/money fields, and malformed JSON/form-data.
- Database safety gate: every data path uses Supabase query builders, parameterized RPCs, or prepared statements; tests/static checks reject raw SQL string concatenation with user, admin, webhook, upload, or search input.
- Upload gate: seller photos, official product photos, and payment proof files are private by default and prove size/type/extension/magic-byte/hash validation, duplicate detection, scan/quarantine behavior, EXIF stripping for public derivatives, and short-lived signed access.
- Webhook gate: provider events prove raw-body signature verification before parsing, wrong-secret rejection, wrong-environment rejection, duplicate replay safety, and different-payload conflict.
- Browser response gate: public, buyer, seller, and admin-list APIs are checked for no raw provider payloads, bank/payout details, full address snapshots, admin private notes, service-role details, stack traces, or raw Supabase errors.
- Security header gate: marketplace pages inherit strict headers/CSP; any payment/image/provider domains are allowlisted narrowly without broad `*`, `unsafe-inline`, or `unsafe-eval` additions.
- Dependency gate: package audit/advisory review is run before public launch, with documented acceptance for any non-fixable advisory.

## Security Architecture And Performance Gates

Security controls are not allowed to become ad hoc checks spread through pages. Each slice must prove the control lives in the right backend boundary and has a performance mitigation:

- Account Bridge gate: identity/session/RBAC resolution is request-scoped and idempotent, with no second login database and no cross-request authorization cache.
- Public read gate: browse/detail/customer-bag reads use safe projections, cursor pagination, and cache rules; they do not query private money, payout, upload-original, or admin command tables.
- Command path gate: checkout, seller submission, official stock, admin command, refund, payout, and webhook mutations use narrow RPC/module paths with idempotency, audit, and indexed security predicates.
- Queue gate: image scanning, EXIF stripping, webhook reconciliation, refund review, payout release, and evidence validation run in bounded queue/admin flows, not public page render paths.
- RLS/index gate: every hot RLS/RBAC/source-kind/idempotency predicate has an index or proven cheap plan before wider access.
- Service-binding gate: Website-to-Marketplace internal calls are batched by page/workflow purpose so security boundaries do not create one internal network hop per UI widget.
- Latency gate: public browse/detail, checkout create, payment proof upload, admin queue read, and webhook apply each have a target latency budget and measurement before owner-only testing expands.

## Backend Rollback Rules

- Rollback means disabling new actions first, not deleting money/order/audit records.
- Feature flags should independently stop browse, checkout, seller submission, listing activation, payment proof upload, payout release, and public nav.
- Existing paid orders must remain visible to admin fulfilment/refund queues after checkout is disabled.
- Existing seller submissions must remain visible to admin for return/communication after new submissions are disabled.
- Existing payout liabilities must remain visible to owner/admin after public marketplace is paused.
- Schema rollback should be additive/forward-fix for real-money tables. Destructive migration rollback requires explicit owner approval and backup evidence.

## Suggested MVP Release Slices

### Slice 0 - Keep Current Placeholder Safe

Scope:

- Preserve owner-only `/marketplace` gate.
- Remove or flag coin-style placeholder price before any public release.
- Keep Customer Bag reward actions unchanged: shipping and conversion only.

Exit criteria:

- Non-owner cannot access marketplace during prelaunch.
- No public nav exposes marketplace.
- Placeholder UI cannot be mistaken for live marketplace.

Rollback:

- Hide marketplace nav and keep `/marketplace` redirect to `/packs`.

### Slice 1 - Foundation

Scope:

- Marketplace Account Bridge.
- Marketplace Supabase schema.
- Marketplace Inventory Module seam.
- Marketplace Money Module seam.
- Server-only adapters for YNOTT profile, admin role, reference data, and Marketplace Supabase.
- Basic admin access.
- Feature flag/owner-only launch.
- Customer Bag section plan: `Gacha Rewards` and `Marketplace`.

Exit criteria:

- Existing YNOTT login creates exactly one Marketplace Account.
- Marketplace actions use Marketplace Account, not a second login.
- Customer Bag rewards are not accepted as marketplace inventory.
- Verification script proves no client-side marketplace service-role key.
- Marketplace Supabase has backup/PITR/restore-drill plan before real money records.

Launch gate:

- Admin and internal staff only.

Rollback:

- Disable marketplace account creation route.
- Keep existing marketplace account rows for audit unless cleanup is explicitly approved.

### Slice 2 - Official Shop Functional Path

Scope:

- Official product create for cards, sealed boxes, and sealed packs.
- Official Marketplace Inventory.
- Official Marketplace Listing browse/detail.
- Official checkout.
- Admin shipping for official orders.
- Refund/reconciliation minimum path.

Exit criteria:

- Buyer can buy an official item with THB.
- Buyer pays shipping fee.
- Official order has no seller payout liability and appears in completion/revenue dashboard.
- Admin can ship and complete order.
- Refund/reconciliation path exists before public payment opens.

Launch gate:

- Owner-only first for full flow testing.
- Public visibility only after all required smoke, money, inventory, refund, and fulfilment gates pass.

Rollback:

- Stop new Pending Payment Orders.
- Keep paid orders fulfilable through admin queue.
- Hide official listings from browse.

### Slice 3 - Seller Consignment Intake

Scope:

- Seller dashboard.
- Seller terms.
- Seller physical card submission.
- Intake instruction.
- Admin receive/inspect.
- Marketplace Inventory approval.
- Listing activation by admin.

Exit criteria:

- Seller can submit a physical item.
- Listing cannot become active before admin inspection.
- Gacha rewards cannot be submitted or listed.
- Seller sees fee/payout estimate.
- Admin can reject or request correction without creating an active listing.

Launch gate:

- Owner-only first.
- Wider seller access only after account, terms, intake, inspection, rejection, and return/communication gates pass.

Rollback:

- Disable new seller submissions.
- Keep existing submissions visible to admin for communication and return handling.

### Slice 4 - User-Seller Purchase

Scope:

- Buyer checkout for approved user-seller listing.
- Pending Payment Order.
- Slip2Go/manual transfer proof path.
- Admin ships item from YNOTT store.
- Seller Payout held.
- Admin/owner payout release.

Exit criteria:

- Two buyers cannot buy the same listing.
- Seller cannot buy own listing.
- Seller Payout excludes buyer shipping fee and buyer-side service fee.
- Payout cannot release before required milestone.
- Official shop payout rules and user-seller payout rules are both covered by tests.

Launch gate:

- Owner-only first.
- Wider buyer/seller access only after concurrency, payment proof, shipping, refund, payout hold, and payout release gates pass.

Rollback:

- Stop new Pending Payment Orders for user-seller listings.
- Keep paid orders and payout liabilities in admin queues.

### Slice 5 - Money And Operations Hardening

Scope:

- Refunds.
- Payout release controls.
- Reconciliation dashboard.
- Production smoke/UAT checklist.
- Admin audit review.
- Rate-limit and idempotency verification.
- Payment webhook replay tests.

Exit criteria:

- Replayed provider event cannot double-pay, double-refund, or double-release payout.
- Admin audit can answer who changed each money state.
- Reconciliation queue catches mismatched provider/order/listing/payout states.
- Owner-only gates work for payout release and manual override.

Launch gate:

- Required before scaling beyond owner-only test traffic.

Rollback:

- Keep public browse available if safe, but disable checkout and seller listing activation.

## Recommended Build And Verification Order

1. Slice 0: keep placeholder safe.
2. Slice 1: foundation and account/data seams.
3. Slice 2: official shop functional path.
4. Slice 5 partial: money/reconciliation hardening for official shop.
5. Slice 3: seller consignment intake.
6. Slice 4: user-seller purchase.
7. Slice 5 full: scale-readiness hardening.

Reason:

- Official shop proves checkout, payment, shipping, admin queues, refund, and reconciliation without seller payout complexity.
- Consignment proves seller onboarding and inventory inspection before exposing user-seller checkout.
- User-seller checkout adds payout liability only after admin operations are stable.
- These are verification slices, not permission to build partial pages only. The intended implementation style is one coordinated marketplace build after docs `00` through `09` agree.

## Not MVP

- Auctions.
- Offers/bargaining.
- Seller-buyer chat.
- Reviews.
- Seller-direct shipping.
- Auto-payout.
- Multi-item cart.
- Advanced search and recommendations.
- Gacha reward resale.
- Listing directly from Customer Bag.
- Cross-database transaction between YNOTT core and Marketplace Supabase.
- Buyer-seller direct messaging.
- Public seller storefront customization.
- Automatic tax/accounting export.
- Marketplace coin payment.
- Marketplace lending/escrow beyond YNOTT middleman custody.

## Architecture Depth Targets

- Marketplace Account Bridge should hide profile lookup, account upsert, buyer/seller/admin capability, blocked reasons, and account status checks behind one Interface.
- Marketplace Inventory Module should hide official vs consignment Implementation details, source-kind rejection, inventory snapshots, and duplicate listing guards from browse and checkout.
- Marketplace Listing Query Module should hide listing snapshots, filters, hidden/sold states, source badges, and THB display data behind one Interface.
- Pending Payment Order Module should hide listing locks, quantity locks, self-purchase rejection, expiry, replay, and payment-proof eligibility behind one Interface.
- Marketplace Money Module should hide fee, shipping, payout, refund, order money snapshot, ledger, and reconciliation calculation behind one Interface.
- Marketplace Admin Workflow Module should hide state transition rules, role checks, evidence requirements, idempotency, queue updates, and audit policy behind one Interface.
- Payment Provider Adapter should hide manual transfer, PromptPay, Slip2Go verification, duplicate slip checks, webhook verification, and provider-specific Implementation details.
- Customer Bag Aggregator should hide two data sources while preserving separate mutation rules and separate action groups.

## Release Risk Register

| Risk | Preventive slice gate |
| --- | --- |
| User expects gacha rewards to be sellable | Slice 0/1 copy and hard data rejection |
| Public marketplace opens with coin-style pricing | Slice 0 placeholder cleanup |
| Duplicate marketplace accounts | Slice 1 unique `ynot_profile_id` and Account Bridge test |
| Buyer pays for already-sold listing | Slice 4 Pending Payment Order concurrency test |
| Official shop order accidentally creates payout | Slice 2 no seller payout liability test |
| User-seller payout includes shipping fee | Slice 4 Money Snapshot/Payout test |
| Admin role snapshot grants stale access | Slice 1/5 Admin Role Adapter test |
| Provider webhook replay changes money twice | Slice 5 provider event idempotency test |
| Marketplace data affects gacha DB by accident | Slice 1 adapter and no cross-project FK check |

## Accepted Deep Design Decisions

- MVP must be fully functional across all core marketplace flows listed in this document.
- Owner-only testing must cover all marketplace scopes before wider release: official shop, seller consignment, user-seller checkout, admin middleman operations, payment proof upload, refunds, reconciliation, and payout release.
- There is no fixed owner-test listing cap. Seed enough official and seller listings to exercise all required states, including pending payment, sold, rejected, refunded, shipped, payout held, and payout released.
- Seller submissions are not invite-only for the product design; the owner-only feature gate controls who can access the MVP during testing.
- The `Boo Boo` owner account must be mapped by stable `profile_id` or admin row, not display name.
- All refunds are handled by admin workflow with no amount threshold. Owner approval is required for manual override.
- After checkout, the buyer lands on a payment proof upload page to submit the transaction image for Slip2Go-style verification/manual review.
- Refund flow must support refunding the buyer when the item does not meet marketplace requirements.
- Public cutover happens only after full owner-only testing passes with no P0/P1 money, inventory, account, auth, or fulfilment issues.
- Build planning should happen document by document with subagent review, then implementation should happen as one coordinated build from the start once documents are aligned.
