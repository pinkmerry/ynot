# PRD — Same Supabase Database for LIFF + Normal Website

## Objective

Make the production website and existing LIFF app share one Supabase database and one canonical user/profile model. The website must support email/password, Google, optional LINE login/linking, manual transfer slip confirmation, full admin management, gacha/collection/exchange/shipping/ranking workflows, and backward-compatible LIFF behavior.

## Users

- **Normal website user**: can sign up/log in without LINE, top up, open gacha, view collection/history, request exchange/shipping, manage profile/address, optionally connect LINE.
- **Existing LIFF user**: can continue to use LINE/LIFF and keep the same profile/admin/order data.
- **Admin/owner/staff**: can manage campaigns/cards/payment methods/top-ups/slips/users/merge requests/orders/collection/exchange/shipping/ranking/settings/audit.

## Non-negotiable Product Requirements

1. Same Supabase project/database as LIFF.
2. One canonical profile per real account; platforms are identities on that profile.
3. Email/password and Google users do not need LINE.
4. LINE can be connected later and should merge/link to the same account safely.
5. Existing owner/admin rows remain valid.
6. Manual bank transfer/QR slip upload/admin approval is first payment path.
7. Payment, coin ledger, gacha, collection, exchange, and shipping are auditable and idempotent.
8. Admin pages and server routes are role-protected; non-admin users cannot see/use admin functions.
9. LIFF behavior cannot regress during migration.

## In-Scope Data Domains

- Identity/profile/account merge
- Admin roles and permissions
- Profile personal info and addresses
- Payment methods and top-up requests
- Private payment slips and verification metadata
- Coin ledger/wallet
- Gacha campaigns/opens/results
- Cards/prizes/collection inventory
- Exchange requests and items
- Shipping requests/items/tracking
- Ranking snapshots
- Realtime invalidation events
- Audit and idempotency

## Acceptance Criteria

- Existing LINE profile rows backfill into `user_identities` without changing `profiles.id`.
- Email-only user can create a profile with nullable `line_user_id` and linked `auth_user_id`.
- Google and email identities converge to one Supabase Auth user/profile when safely linked.
- LINE `sub` identity links to the same profile; conflict cases create merge requests rather than unsafe silent merges.
- Top-up approval locks `wallet_accounts` and creates exactly one coin ledger credit, protected by idempotency and reference uniqueness.
- Gacha open locks `wallet_accounts` and creates exactly one debit plus collection item(s) atomically.
- Exchange/shipping lock and transition item states safely.
- Payment slips remain private.
- RLS blocks cross-user private access.
- Existing LIFF login/order/pick smoke tests still pass.

## Production Safety Invariants

- `payment_slips` has exactly one owner reference: legacy `order_id` or new `top_up_request_id`, never both and never neither.
- Ledger writes require `wallet_accounts FOR UPDATE` and unique `(reference_type, reference_id, entry_type)`-style constraints.
- Private realtime uses RLS-scoped events; public live-draw events stay public-safe only.
- LINE connect/login rejects missing, mismatched, or replayed `state`/`nonce`.

## Phase Gates

- Phase 1 gate: LINE cookie uses dedicated `LINE_SESSION_SECRET`; public realtime emits only public-safe events; `user_addresses` exists/backfills existing profile address fields with owner/admin RLS; generated types reflect nullable `line_user_id`; typecheck passes.
- Phase 2 gate: `account_merge_requests/events` exist with request/event fields and RLS before LINE connect conflict handling; merge conflict creation and event visibility are tested.
- Phase 3 gate: `idempotency_keys` exists before retryable payment/ledger RPCs; top-up/payment writes cannot emit private identifiers to public realtime; wallet/ledger constraints pass concurrency tests.
- Phase 4 gate: private gacha/collection/exchange/shipping realtime uses RLS-scoped `app_realtime_events`; public realtime remains public-safe.
