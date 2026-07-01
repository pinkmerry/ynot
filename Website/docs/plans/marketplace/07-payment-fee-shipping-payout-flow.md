# Payment Fee Shipping Payout Flow - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Define the first-pass money model for THB marketplace orders.

Marketplace uses physical money currency, not YNOTT coins. This money flow must stay separate from wallet/coin logic, gacha opening, Reward Conversion, and Customer Bag reward shipping.

## Document Role

This document owns marketplace money semantics: item price, shipping, buyer service fee, seller-side marketplace fee, payment evidence, refunds, seller payout liability, and reconciliation. It defines canonical money field names used by the other marketplace docs.

## MVP Money Decision Locks

- First payment path is manual PromptPay/bank transfer proof.
- Payment proof uses the existing Slip2Go-style YNOTT slip verification pipeline where possible, with owner/admin manual review as fallback.
- First shipping path is fixed 150 THB shipping plus admin tracking. The amount should be admin-configurable later.
- Seller-side marketplace fee defaults to 10 percent and is admin-configurable.
- Buyer-side service fee defaults to 10 percent, is admin-configurable, and is calculated from item price before fixed shipping is added.
- Buyer checkout shows item price, shipping fee, buyer service fee, and total in THB.
- Buyer does not see seller payout or the internal seller-side marketplace fee.
- Seller payout excludes buyer shipping fee and buyer-side service fee.
- Seller payout setup is required before money release, not before submission.
- Seller payout release is owner-only for MVP and starts as manual bank transfer/owner confirmation.
- Official shop orders do not create seller payout liability, but admin dashboards must show official order completion/revenue state.

## Current Runtime And Seam Choice

Current YNOTT runtime evidence:

- `Website/src/app/api/ynot/wallet/route.ts` already supports top-up by PromptPay/manual transfer, slip upload, idempotency key, same-origin check, rate limit, and slip verification.
- Existing payment verification code names the provider `Slip2Go` and stores duplicate/hash/provider verification metadata on payment slips.
- `Database/supabase/migrations/20260615090000_top_up_idempotency.sql` creates an atomic top-up submit function and a unique idempotency index.
- `Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql` stores YNOTT wallet balances in coins and top-ups in `amount_thb`.
- `Website/src/app/api/ynot/shipping/route.ts` already uses quote/start intent, action tokens, idempotency, and queued fulfilment for Customer Bag reward shipping.

Architecture choice:

- Marketplace must not write buyer payment to `wallet_accounts`, `coin_ledger`, or `top_up_requests`.
- Marketplace may reuse existing active payment-method configuration through a read-only Payment Method Catalog Adapter.
- Marketplace payments, fees, refunds, and payouts live in Marketplace Supabase as THB money records.
- Customer Bag shipping logic is a reference pattern only; marketplace checkout uses its own Shipping Quote Adapter and Marketplace Order state.

## Money Rules

Use minor units in the database.

For THB, store satang integer fields consistently:

- `currency = "THB"`.
- `item_price_satang`.
- `shipping_fee_satang`.
- `buyer_service_fee_bps`.
- `buyer_service_fee_base_satang`.
- `buyer_service_fee_satang`.
- `buyer_total_satang`.
- `seller_marketplace_fee_bps`.
- `seller_marketplace_fee_satang`.
- `seller_payout_satang`.
- `payment_provider_fee_satang` when known.
- `refund_satang`.
- `net_platform_revenue_satang`.
- `rounding_policy`.
- `calculation_version`.

Do not calculate important fee, payout, or total values only in the browser.

The Marketplace Money Module owns all money calculations. Callers provide intent and IDs, not trusted totals.

## Money Snapshot Interface

Every paid Marketplace Order stores an immutable money snapshot:

```ts
type MarketplaceOrderMoneySnapshot = {
  currency: "THB";
  item_price_satang: number;
  shipping_fee_satang: number;
  buyer_service_fee_bps: number;
  buyer_service_fee_base_satang: number;
  buyer_service_fee_satang: number;
  buyer_total_satang: number;
  seller_marketplace_fee_bps: number;
  seller_marketplace_fee_satang: number;
  seller_payout_satang: number;
  payment_provider_fee_satang: number | null;
  calculation_version: string;
  rounding_policy: "floor_satang" | "round_half_up_satang";
  seller_fee_source: "default_seller_marketplace_fee" | "seller_contract" | "manual_owner_override";
  buyer_service_fee_source: "default_buyer_service_fee" | "manual_owner_override";
};
```

Frozen snapshot rules:

- Listing price changes after checkout starts do not change an existing Pending Payment Order.
- Fee-rate changes after order creation do not change an existing order.
- Refunds create refund ledger rows; they do not rewrite the original order snapshot.
- Payout uses the frozen order snapshot, minus any refund effect.

## Money Frontend Design Direction

Money UI should be precise and calm. It should help users understand what they pay or receive without exposing internal accounting.

- Purpose: display THB totals, fees, shipping, refunds, and payouts to the right actor at the right time.
- Audience: buyers checking out, sellers reviewing payout estimates, and admins operating payment/refund/payout queues.
- Tone: trustworthy, restrained, explicit, and audit-friendly.
- Memorable detail: every money panel uses the same line-item pattern: label, amount, explanation when needed, and final total/status.
- Constraints: integer satang source of truth, THB display, no coin language, no raw provider payloads, no hidden fee math in browser.

Surface-specific display:

| Surface | Show | Hide |
| --- | --- | --- |
| Buyer listing detail | Item price and availability. | Shipping fee before checkout, seller payout, marketplace fee. |
| Buyer checkout | Item price, shipping fee, buyer service fee, buyer total, payment expiry. | Seller payout, seller-side marketplace fee, internal provider fee, fee rule source. |
| Seller submission | Asking price, marketplace fee estimate, estimated payout. | Buyer shipping fee as revenue, provider fee internals. |
| Seller sold item | Sale price, fee, payout state, expected payout. | Buyer private address, provider secrets, admin private notes. |
| Admin money detail | Full money snapshot, refund/payout state, evidence refs. | Raw secrets, unredacted bank/payment credentials. |

Money UI rules:

- Format THB consistently from satang values.
- Use `estimate` labels before checkout/order freeze.
- Use `final` or `frozen` language only after order money snapshot exists.
- Show totals in a stable summary block; avoid recalculating totals client-side from editable fields.
- Money errors should keep users in context and show the next safe action.

## Money API Contract

Money APIs can be exposed through Website-facing routes, but deployed trusted calculations and state transitions live behind Marketplace Worker/backend Money/Payment modules. Website should call them through the internal service boundary.

| Route | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/marketplace/checkout/pending-orders/:pendingOrderId/payment-proof` | `POST` | Checkout Payment Module | Upload/attach payment proof for a Pending Payment Order. |
| `/api/marketplace/payments/:paymentAttemptId` | `GET` | Checkout Payment Module | Return buyer-safe payment status for the current buyer. |
| `/api/marketplace/payments/webhook/:provider` | `POST` | Payment Provider Adapter | Verify signed provider event and apply idempotent payment transition. |
| `/api/marketplace/admin/payments/:paymentId/manual-evidence` | `POST` | Payment Provider Adapter | Admin/manual slip evidence path for approved payment methods. |
| `/api/marketplace/admin/refunds` | `POST` | Marketplace Money Module | Create/approve a refund request through admin workflow. |
| `/api/marketplace/admin/refunds/:refundId/result` | `POST` | Marketplace Money Module | Record provider/manual refund result. |
| `/api/marketplace/admin/payouts` | `GET` | Seller Payout Module | Return payout queue by state and release eligibility. |
| `/api/marketplace/admin/payouts/:payoutId/release` | `POST` | Seller Payout Module | Owner releases eligible payout. |
| `/api/marketplace/admin/payouts/:payoutId/paid` | `POST` | Seller Payout Module | Owner records transfer/provider paid evidence. |
| `/api/marketplace/admin/money/reconciliation` | `GET` | Reconciliation Module | Review money mismatch work items. |

Route rules:

- Buyer payment-proof route requires resolved profile, Marketplace Account, same-origin check, rate limit, Pending Payment Order ownership, and idempotency key.
- Webhook routes must verify provider signature against the raw request body before parsing or applying the event.
- Admin money routes require admin session, same-origin check, role policy, command idempotency, and audit note/evidence.
- Browser requests must not submit trusted totals, fee rates, payout amounts, provider paid state, refund state, or seller bank details.
- Money APIs return integer satang fields and `currency = 'THB'`.
- Marketplace routes must not write `wallet_accounts`, `coin_ledger`, `top_up_requests`, gacha draw tables, Customer Bag reward shipping tables, or Reward Conversion state.

## Money Database Contract

Money data uses marketplace-owned tables and immutable snapshots. Avoid updating old money facts; add events or correction rows.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `marketplace_order_money_snapshots` | Immutable order money snapshot created when Pending Payment Order starts. |
| `marketplace_payment_attempts` | Payment instruction/proof attempts for an order. |
| `marketplace_payment_events` | Idempotent provider/manual events keyed by provider event ID or evidence hash. |
| `marketplace_money_ledger` | Append-only ledger for payment, fee, shipping, refund, payout, and adjustment entries. |
| `marketplace_fee_rules` | Versioned seller-side and buyer-side fee configuration by seller type/category. |
| `marketplace_shipping_quotes` | Server-created shipping/fixed-fee snapshots used by Pending Payment Order. |
| `marketplace_refunds` | Refund request, approval, provider result, and refund effect. |
| `marketplace_seller_payouts` | User-seller payout liability and release state. |
| `marketplace_payout_events` | Payout release/paid/hold evidence events. |
| `marketplace_reconciliation_items` | Shared reconciliation work items; money mismatches use money target types. |

Money field rules:

- Use `integer` or `bigint` satang fields consistently. Use `bigint` if order volume or ledger aggregation could exceed signed integer range.
- Store `currency` on every money table and check `currency = 'THB'` for MVP.
- Store provider amounts separately from marketplace-calculated amounts, then reconcile.
- Store `calculation_version`, `fee_rule_id`, `rounding_policy`, and `fee_source` on the order money snapshot.
- Ledger rows are append-only and include `entry_type`, `direction`, `amount_satang`, `currency`, `order_id`, `payment_id`, `refund_id`, `payout_id`, and `created_at`.
- Payout rows exist only for user-seller orders. Official shop orders create no seller payout liability and appear in official order completion/revenue dashboards.

Indexes and uniqueness:

- Unique `(provider, provider_event_id)` on `marketplace_payment_events` when provider event ID exists.
- Unique `(payment_attempt_id, evidence_hash)` for manual evidence/slip events.
- Unique `(order_id, attempt_number)` on payment attempts.
- Unique `(order_id)` on order money snapshot.
- Unique `(order_id)` on seller payout where payout is required.
- `(payout_state, release_eligible_at, updated_at desc)` for payout queue.
- `(refund_state, updated_at desc)` for refund queue.
- `(order_id, created_at desc)` for money ledger detail.

## Money RPC Contract

Money state changes should use RPCs or equivalent service-layer transactions with the same ownership boundaries.

| RPC / Command | Owner | Responsibility |
| --- | --- | --- |
| `marketplace_create_pending_payment_order` | Checkout Payment Module | Create order, order item, money snapshot, and pending payment state from listing. |
| `marketplace_submit_pending_order_payment_proof` | Checkout Payment Module | Store/replay payment proof and submit it to Slip2Go/manual verification. |
| `marketplace_apply_provider_payment_event` | Payment Provider Adapter | Verify idempotency and provider amount/currency, then open reconciliation/admin payment review instead of directly marking paid from a webhook. |
| `marketplace_record_manual_payment_evidence` | Payment Provider Adapter | Store slip/evidence result after duplicate checks and admin verification. |
| `marketplace_create_refund_request` | Marketplace Money Module | Create refund request and expected refund effect. |
| `marketplace_apply_refund_event` | Marketplace Money Module | Apply provider/manual refund result and ledger entries. |
| `marketplace_release_seller_payout` | Seller Payout Module | Owner releases eligible payout after milestone and no blocking refund/dispute. |
| `marketplace_mark_seller_payout_paid` | Seller Payout Module | Mark paid with transfer/provider evidence and ledger entry. |
| `marketplace_open_reconciliation_item` | Reconciliation Module | Open mismatch item when invariants fail. |

RPC rules:

- Every browser/admin-originated money mutation includes `p_request_id`, `p_idempotency_key`, actor IDs, and request hash.
- Provider webhooks use provider event ID as idempotency key and store the raw-event hash or safe event digest.
- RPCs lock the order/payment/refund/payout rows required for the transition.
- Payment paid transition must update payment, order, listing, inventory, fee ledger, and payout liability in one transaction when possible.
- If payment succeeds but a dependent state change fails, open reconciliation and avoid double-settlement.
- Refund and payout transitions must check current order, payment, refund, payout, and reconciliation state before writing.
- Replayed idempotent requests return the original result; conflicting replays fail.

## Money Invariant Contract

Hard invariants:

- `buyer_total_satang = item_price_satang + shipping_fee_satang + buyer_service_fee_satang`.
- `seller_marketplace_fee_satang` is calculated from item price only unless a future fee rule explicitly says otherwise.
- `buyer_service_fee_base_satang = item_price_satang` for the MVP default rule.
- `buyer_service_fee_satang` is calculated from `buyer_service_fee_base_satang` according to the active admin fee rule.
- `seller_payout_satang = item_price_satang - seller_marketplace_fee_satang - seller_adjustment_satang` for user-seller orders.
- `shipping_fee_satang` never increases seller payout.
- `buyer_service_fee_satang` never increases seller payout.
- Refund total cannot exceed captured buyer total.
- Payout paid cannot exceed current payable seller liability.
- Official shop order cannot create seller payout liability.
- A payment provider event cannot mark two orders paid.
- One listing/inventory unit cannot be sold by two paid orders.

When an invariant fails, the system should block the transition and open reconciliation instead of silently adjusting money rows.

## Payment Webhook Security Contract

- Payment proof upload, checkout payment actions, refund request, payout release, and payment webhook endpoints are HTTPS-only in production. HTTP requests redirect or fail closed, provider callbacks must target HTTPS URLs, secure cookies require HTTPS, and money pages must not load mixed-content assets.
- Browser-initiated money mutations require same-origin validation and the current YNOTT CSRF/session-cookie protection pattern. Provider webhooks use provider signature verification instead of CSRF tokens.
- Money-flow RBAC is enforced server-side from YNOTT session/admin/owner checks and Marketplace Account ownership. Browser-submitted buyer, seller, admin, role, fee percent, shipping fee, payment state, refund state, or payout state fields are rejected.
- Money flow does not store marketplace passwords. Existing YNOTT/Supabase Auth owns password hashing, credential reset, login throttling, and primary session issuance.
- Payment proof, refund, payout, fee, shipping, provider callback, and admin reconciliation inputs use schema allowlists. Unknown fields, malformed form-data, wrong currency, caller-supplied totals, arbitrary evidence URLs, and duplicate-with-different-payload events fail closed.
- Money database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No payment proof text, transfer reference, provider ID, refund reason, payout reference, or admin filter is concatenated into SQL.
- Money actions follow the YNOTT session timeout policy. Checkout payment upload, refund request, payout destination update, refund approval, reconciliation close, and payout release reject expired sessions; high-risk admin/owner money commands require a fresh session check when stale.
- Webhook route must read raw body for signature verification.
- Signature verification happens before JSON parsing, database writes, or expensive downstream work.
- Store provider event ID, event type, received timestamp, signature verification result, and safe redacted payload digest.
- Never log full payment tokens, card data, bank account data, or secrets.
- Webhook processing should be fast: verify, insert idempotent event, apply minimal transition, enqueue reconciliation if needed.
- Provider retry should receive success only after the event is stored or safely replayed.
- Production deployment must have provider webhook secret configured before public launch.
- Webhook routes must reject unsigned, stale, wrong-environment, wrong-provider, duplicate-with-different-payload, and wrong-currency events before they can change order/payment state.
- Store raw provider payloads only if legally/operationally required, encrypted or access-restricted, and never returned to browser/admin list responses. Prefer storing a redacted digest and normalized event fields.
- Webhook logs include `request_id`, provider, event ID, verification result, and target IDs only. Do not log signatures, raw bodies, bearer tokens, bank data, or secret-bearing headers.

Security architecture and performance impact:

- Webhook handling stays on a short path: verify raw-body signature, reject invalid events, insert/idempotently replay the provider event, apply the minimal state transition, then enqueue reconciliation or follow-up work.
- Payment proof uploads should store private pending evidence and metadata first. Duplicate slip checks, scan/quarantine, amount/receiver/time-window verification, and admin review can continue through bounded backend/admin flows.
- Fee, shipping, refund, and payout calculations should use versioned rule snapshots and integer satang math so checkout does not recalculate historical policy across many tables.
- Money list/queue views use redacted projections. Raw provider payloads, bank/payout details, evidence originals, and full address snapshots load only through authorized detail routes.
- Idempotency, provider event, pending order, refund, payout, and reconciliation tables need unique keys and state indexes before launch so replay protection does not become the bottleneck.

## Money RLS, Grants, And Security Contract

- Enable RLS on payment, event, fee, shipping quote, refund, payout, ledger, and reconciliation tables.
- Revoke direct mutation grants from `anon` and `authenticated` on all money tables.
- Buyer-visible payment/order reads should go through Website APIs that resolve account ownership server-side.
- Server-only RPCs revoke `execute` from `public`, `anon`, and `authenticated`; grant only to the Marketplace backend service role.
- Any `security definer` RPC must set a fixed `search_path`, validate actor/role/order ownership inside the function, and stay unavailable to browser roles.
- Keep provider secrets, webhook secrets, payout provider credentials, and service-role keys in server-only environment variables.
- Payment proof and manual evidence storage must be private by default. Buyer/admin routes receive short-lived signed access only when they own or are authorized for the target order/payment.

## Buyer Price Display

Listing detail:

- Show item price only.
- Do not show shipping fee until checkout has a destination.
- Do not show seller payout or marketplace fee to buyer.

Checkout:

- Show item price.
- Show shipping fee.
- Show buyer service fee as a separate named amount.
- Show total payable.
- Show payment method and payment expiry if payment is pending.

Buyer money panel order:

1. Item price.
2. Shipping fee.
3. Buyer service fee.
4. Total payable.
5. Pending payment expiry.

UX rules:

- Shipping line should say `Calculated at checkout` until quote exists.
- If payment is pending, show the payment method and expiry close to the total.
- If the Pending Payment Order expires, total becomes read-only history and action changes to retry when allowed.
- If provider confirms a different amount, show reconciliation/pending review state instead of silently changing the total.

## Seller Fee Display

Seller listing creation:

- Show listing price.
- Show YNOTT fee percent.
- Show estimated fee amount.
- Show estimated seller payout.
- Say estimate until checkout freezes the order snapshot.

Official shop:

- Do not show Seller Payout language.
- Use `seller_type = official_shop`.
- Do not create seller payout liability.

Seller money panel order:

1. Asking/listing price.
2. YNOTT marketplace fee percent and amount.
3. Estimated seller payout.
4. Payout timing rule.
5. Payout setup/readiness state when relevant.

UX rules:

- `Estimated payout` is used before sale.
- `Payout held`, `Eligible`, `Approved`, and `Paid` are used after sale.
- Shipping paid by buyer appears only as an excluded line if needed for clarity.
- Official shop admin UI can show completion/revenue/reconciliation state; buyer UI should not show payout language.

## Example Calculation

```text
Item price: 10,000.00 THB = 1,000,000 satang
Buyer service fee base: 1,000,000 satang
Buyer service fee: 10 percent default = 100,000 satang
Fixed shipping charged to buyer: 150.00 THB = 15,000 satang
Buyer total: 11,150.00 THB = 1,115,000 satang

YNOTT seller fee: 10 percent of item price = 100,000 satang
Seller payout: 900,000 satang
```

Shipping charge is not seller revenue.

Marketplace Fee is calculated from item price, not shipping fee.

Buyer-side service fee must be a separate named amount and not silently mixed into seller fee.

## Required Modules

### Marketplace Money Module

Interface:

- Quote checkout totals.
- Freeze order money snapshot.
- Calculate Marketplace Fee.
- Calculate Seller Payout.
- Apply refund effect.
- Report reconciliation differences.

Implementation:

- Uses THB satang fields.
- Stores calculation version.
- Rejects browser-supplied totals as trusted source.
- Reads fee policy by seller type, listing category, and optional owner override.

Depth:

- Buyer checkout, seller preview, admin refund, and payout release all use one calculation Interface.
- Tests can assert money invariants without needing page-level flows.

### Checkout Payment Module

Interface:

- Create Pending Payment Order.
- Attach manual transfer proof to a Pending Payment Order.
- Confirm payment from Slip2Go/provider event or owner/admin-verified manual evidence.
- Mark listing sold only after valid payment.

Implementation:

- Payment confirmation verifies that the paid event/proof belongs to the active Pending Payment Order.
- Listing or official quantity is locked before payment proof can be accepted.
- Provider events and slip evidence are recorded idempotently by provider event ID or evidence hash.

### Payment Provider Adapter

Interface:

- Create manual transfer instruction first, or future provider session/intent/QR instruction.
- Verify callback/webhook or manual slip evidence.
- Map provider state into Marketplace Payment state.
- Return safe redacted provider references.

Implementation:

- Provider-specific logic is isolated.
- First adapter can be manual transfer/PromptPay because YNOTT already has payment-method and slip patterns.
- Later adapters can support Opn/Omise, Stripe, or another Thai provider without changing Marketplace Order.

### Shipping Quote Adapter

Interface:

- Quote shipping fee by destination, item class, and fulfilment mode.
- Store shipping quote snapshot.
- Attach chosen quote to Pending Payment Order.
- Create fulfilment task after payment.
- Store tracking evidence.

Implementation:

- MVP can be manual/admin-priced shipping if provider integration is not ready.
- Buyer-visible shipping amount is frozen into the order snapshot at checkout.
- Shipping quote must be separate from Customer Bag reward shipping quote tokens.

### Seller Payout Module

Interface:

- Create payout liability when user-seller order is paid.
- Mark official shop order as having no seller payout liability.
- Hold payout until release milestone.
- Require owner approval for payout release.
- Mark paid by provider or manual transfer evidence.

Implementation:

- Excludes shipping fee.
- Uses frozen fee calculation from order snapshot.
- Writes audit event for every payout transition.
- Blocks payout release if refund, dispute, failed inspection, or reconciliation is active.

## Payment Flow

```text
Buyer starts checkout
  -> Pending Payment Order created
  -> Marketplace Money Module creates quote snapshot
  -> Payment Provider Adapter shows manual transfer instruction
  -> buyer pays
  -> buyer uploads payment proof
  -> Slip2Go/provider callback/webhook or admin slip verification confirms payment
  -> provider event stored by provider event ID
  -> Checkout Payment Module marks order paid if event is valid and idempotent
  -> listing becomes sold
  -> payout liability created only for user-seller order
```

State Interface:

| From | Event | To |
| --- | --- | --- |
| `created` | payment instruction created | `requires_action` |
| `requires_action` | buyer submits payment evidence | `pending` |
| `pending` | provider confirms paid | `paid` |
| `pending` | expiry passes | `expired` |
| `pending` | provider fails | `failed` |
| `paid` | refund starts | `refund_processing` |
| any non-terminal | mismatch detected | `reconciliation_required` |

## Fee Flow

```text
Listing price set
  -> seller sees estimated fee and payout
  -> checkout starts
  -> fee rate copied to order snapshot
  -> payment succeeds
  -> fee ledger row created
  -> payout uses frozen order snapshot
```

Seller-side fee defaults to 10 percent and is admin-configurable. Buyer-side service fee also defaults to 10 percent and is admin-configurable. Both are stored in basis points and copied to frozen order snapshots.

Fee ledger rows:

- `seller_marketplace_fee_assessed`.
- `seller_marketplace_fee_refunded` when refund affects seller fee.
- `buyer_service_fee_assessed`.
- `buyer_service_fee_refunded` when refund affects buyer fee.
- `platform_shipping_revenue_recorded` if YNOTT tracks shipping margin separately.
- `provider_fee_recorded` when payment provider cost is known.

## Shipping Fee Flow

```text
Checkout address confirmed
  -> fixed shipping snapshot created
  -> buyer service fee calculated from item price
  -> buyer total includes shipping fee
  -> payment captures item price + buyer service fee + shipping fee
  -> marketplace order stores shipping fee separately
  -> admin fulfils shipment
```

Shipping charge is buyer-paid fulfilment money, not seller revenue. It should not increase Seller Payout.

If shipping cost changes after payment, the order enters admin reconciliation. MVP should avoid automatic extra charges.

## Payout Flow

```text
Order paid
  -> user-seller item confirmed available/received/inspected
  -> item shipped/delivered/completed milestone reached
  -> admin releases seller payout
  -> payout marked paid when provider/manual transfer confirms
```

Official shop orders create no seller payout liability.

User-seller orders keep payout held until the required milestone is met. MVP should prefer manual payout release and manual bank transfer confirmation unless the payment provider payout path is selected and tested.

## Payment, Refund, And Payout UI States

Buyer payment states:

- `requires_action`: show payment instructions and expiry.
- `pending`: show waiting confirmation and refresh status action.
- `paid`: show order confirmation and next fulfilment state.
- `expired`: show retry/return path.
- `failed`: show safe retry or support path.
- `reconciliation_required`: show pending review; do not ask buyer to pay again without admin decision.

Refund states:

- Buyer sees requested/approved/processing/refunded/partially refunded/rejected labels.
- Admin sees provider/manual evidence requirements and amount validation.
- Seller sees payout impact only when refund affects payout eligibility.

Payout admin states:

- `held`: show blocked reason and milestone still needed.
- `eligible`: show owner release action with amount and evidence requirements.
- `approved`: show transfer confirmation action.
- `paid`: show paid evidence and timestamp.
- `disputed`: route to reconciliation detail.

UI safety:

- Disable payout release when refund/dispute/reconciliation is active and show the blocking state.
- Duplicate webhook or admin retry should show `Already processed` when the replay returns the same result.
- Payment/refund/payout detail pages should show audit timeline separately from the primary action panel.

Payout State Interface:

| From | Event | To |
| --- | --- | --- |
| `not_applicable` | official shop order paid | `not_applicable` |
| `pending` | order paid | `held` |
| `held` | release milestone reached | `eligible` |
| `eligible` | owner releases payout | `approved` |
| `approved` | transfer evidence recorded | `paid` |
| any active state | refund/dispute starts | `held` |
| any active state | mismatch detected | `disputed` |

## Refund State Interface

| From | Event | To |
| --- | --- | --- |
| `none` | buyer/admin requests refund | `requested` |
| `requested` | admin approves | `approved` |
| `approved` | provider refund submitted | `processing` |
| `processing` | provider confirms full refund | `refunded` |
| `processing` | provider confirms partial refund | `partially_refunded` |
| `requested` | admin rejects | `rejected` |
| any active state | mismatch detected | `reconciliation_required` |

Refund rules:

- Refund amount is stored in satang.
- Refund cannot exceed buyer captured total.
- Refund effect on marketplace fee and payout must be explicit.
- Refund after payout release goes to reconciliation unless recovery rules are designed.

## Idempotency And Reconciliation

Every money mutation needs an idempotency key or provider event key:

| Mutation | Idempotency source |
| --- | --- |
| Pending Payment Order create | browser-generated idempotency key plus account ID |
| Marketplace paid transition | pending order ID plus provider/slip evidence uniqueness |
| Payment proof upload | pending order ID plus payment proof idempotency key |
| Payment webhook apply | provider event ID |
| Manual slip apply | slip file hash plus payment ID |
| Refund create/apply | refund request ID plus provider refund ID |
| Seller Payout release | payout ID plus admin idempotency key |
| Seller Payout paid confirmation | payout ID plus transfer reference |

Reconciliation queue should catch:

- Provider paid but order not paid.
- Order paid but listing not sold.
- Listing sold but payment missing.
- Refund event received twice with different amount.
- Payout approved but payment/refund state changed.
- Shipping fee mismatch.
- Manual transfer slip duplicated across marketplace payments or top-ups.

## Security And Compliance Notes

- Do not store raw card numbers or sensitive payment credentials.
- Store only provider IDs, redacted customer references, and safe payment state.
- Keep marketplace service-role key server-only.
- Webhook secret required in production.
- Admin payout release requires owner role in MVP.
- Browser cannot choose fee percent, payout amount, seller bank account, or provider state.
- Rate-limit payment proof upload, refund request, and payout actions.
- Use audit events for money state transitions.
- Marketplace Supabase RLS should prevent browser clients from mutating payment, fee, refund, or payout state directly.
- Manual transfer evidence should use file type, size, hash, and duplicate checks similar to current top-up slip handling.
- Payment proof validation must also check receiver identity, amount, currency, payment time window, duplicate slip/evidence hash across marketplace and top-up evidence, and Pending Payment Order ownership.
- Refund and payout evidence must be linked to validated provider/manual records, not arbitrary external URLs or unverified text.
- Payout destination data is tokenized or encrypted at rest when storage is unavoidable; queue/list responses expose only readiness, last4-style labels, or provider reference aliases.
- Money actions should use private/no-store cache headers and must not include payment proof URLs, provider payloads, bank data, or full address snapshots in logs or client-side telemetry.

## Performance Rules

- Public listing reads should not compute payout.
- Checkout quote should perform bounded reads by listing ID, pending order ID, account ID, and shipping/fixed-fee snapshot ID.
- Webhook handling should be fast and idempotent; long reconciliation can run async.
- Payout queue should be indexed by state and release eligibility date.
- Money snapshot reads should not join provider event history unless the detail page asks for it.
- Reconciliation jobs should batch by state and updated time.

## Money Backend Error Contract

Money APIs return stable error codes because UI copy, admin queues, and provider retry behavior depend on them.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_payment_not_found` | `404` | Payment attempt/event is missing or not visible to the actor. |
| `marketplace_payment_state_invalid` | `409` | Current payment state does not allow the requested action. |
| `marketplace_payment_signature_invalid` | `401` | Webhook signature verification failed. |
| `marketplace_payment_provider_mismatch` | `409` | Provider event does not match the order/payment attempt. |
| `marketplace_payment_amount_mismatch` | `409` | Provider paid amount or currency differs from frozen order total. |
| `marketplace_order_money_snapshot_missing` | `409` | Order cannot continue because immutable money snapshot is missing. |
| `marketplace_refund_amount_invalid` | `422` | Refund amount is negative, zero, or greater than captured buyer total. |
| `marketplace_refund_state_invalid` | `409` | Refund state does not allow approval/result transition. |
| `marketplace_payout_not_eligible` | `409` | Payout release milestone or owner approval requirement is not met. |
| `marketplace_payout_state_invalid` | `409` | Payout state does not allow release or paid confirmation. |
| `marketplace_money_invariant_failed` | `409` | Ledger, payment, refund, payout, or listing state would become inconsistent. |
| `marketplace_reconciliation_required` | `409` | Action cannot finish safely without manual reconciliation. |
| `marketplace_idempotency_conflict` | `409` | Same idempotency key/provider event was replayed with a different payload. |
| `marketplace_rate_limited` | `429` | Payment/refund/payout action exceeded allowed retry rate. |

Error responses include `request_id`, `code`, `message`, and optional `payment_state`, `refund_state`, `payout_state`, `expected_amount_satang`, or `received_amount_satang`. They must not include full provider payloads, card data, bank data, webhook secrets, or service-role details.

## Money Query Performance Contract

- Payment status polling should read one payment attempt plus order state by indexed IDs.
- Buyer order detail should read the frozen money snapshot and latest payment state, not full payment event history.
- Admin payment/refund/payout queues use projection columns and cursor pagination.
- Ledger detail pages paginate by `(created_at desc, id desc)`.
- Webhook insert and idempotent replay checks use unique provider event indexes before loading related order detail.
- Reconciliation workers process bounded batches by `(status, updated_at)`.
- Fee rule lookups can be cached by active version, but order snapshots must store the selected rule so historical orders remain stable.
- Avoid cross-project database calls inside money transactions. Read YNOTT account/admin context before calling Marketplace RPCs and pass validated IDs/snapshots.

## Accepted Deep Design Decisions

- Manual PromptPay/bank transfer proof requires slip image, payment method, Slip2Go-read amount when available, duplicate check result, receiver check result, and optional buyer/admin note in review UI.
- All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
- Refund handling is explicit per line item: item, shipping, and buyer service fee. Default full refund returns buyer service fee; seller fee is reversed if seller payout has not been paid.
- Marketplace reuses existing YNOTT `payment_methods` as a read-only catalog for MVP, and snapshots the chosen method onto the Marketplace Order.
- Slip2Go auto-approve is allowed only when amount, receiver, date/window, and duplicate checks all pass.
- Admin can review normal slips; owner is required for suspicious or override cases.
