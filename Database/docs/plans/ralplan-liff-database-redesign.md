# RALPLAN — Same-Database Architecture Redesign for Website + Existing LIFF

- **Scope**: database architecture and migration plan only.
- **Database target**: the existing Supabase project used by the LIFF app (`szjo….supabase.co`, masked).
- **Status**: draft consensus plan pending Architect/Critic review.
- **Execution rule**: do not apply migrations from this document until an execution workflow is explicitly started after approval.

## Requirements Summary

The new website must become a normal production web app while staying aligned with the existing LIFF app and using the same Supabase database. Users must be able to sign up/log in by email/password and Google, optionally connect LINE, and end up with one maintainable account/profile across all platforms. Existing LIFF customers/admins must continue to work. Admin must be able to manage all features. Manual bank transfer / QR slip upload / admin confirmation must be supported first. Database design must cover all website pages and workflows: auth, profile/personal info, top-up/payment, gacha/opening, orders/history, collection, exchange, shipping, ranking, realtime refresh, and admin operations.

## Existing Database Findings

### Current LIFF-centered identity model

- `profiles.line_user_id` is currently `unique not null`, so every profile must be LINE-backed (`Database/supabase/migrations/202604300001_lucky_draw_core.sql:5-13`; `Website/src/lib/supabase/types.ts:6-45`).
- LINE session creation verifies a LINE ID token, then upserts `profiles` by `line_user_id` (`Website/src/app/api/line/session/route.ts:29-67`).
- Application session cookies currently contain `profileId` and required `lineUserId` (`Website/src/lib/lucky-draw/session.ts:6-14`).
- Admin is correctly keyed to profile, not client flags: `admin_users(profile_id, role, is_active)` (`Database/supabase/migrations/202604300001_lucky_draw_core.sql:15-22`), and server code re-checks it (`Website/src/lib/lucky-draw/session.ts:64-82`).

### Current commerce/draw model to preserve

- `draw_rounds`, `draw_slots`, `orders`, `payment_slips`, `order_picks`, `audit_events` already provide the core lucky-draw purchase/payment/pick model (`Database/supabase/migrations/202604300001_lucky_draw_core.sql:24-122`).
- `claim_order_slots` already enforces duplicate-slot and ownership/quantity safeguards inside Postgres (`Database/supabase/migrations/202604300001_lucky_draw_core.sql:188-367`).
- `cards` and `draw_round_prizes` already represent prize/catalog records (`Database/supabase/migrations/202605030002_add_card_catalog.sql:1-25`).
- Slip verification metadata already exists on `payment_slips`, including duplicate/fraud/provider fields and indexes (`Database/supabase/migrations/20260504203000_add_slip2go_verification.sql:1-61`).
- Current frontend realtime uses `lucky_draw_realtime_events` as a safe invalidation stream instead of exposing raw sensitive rows (`Database/supabase/migrations/20260504095312_add_realtime_events.sql:1-102`; `Website/src/features/lucky-draw/realtime/useLuckyDrawRealtime.ts:7-29`).

### Live data shape observed

Read-only Supabase count check on 2026-05-06T13:30:55Z found: 2 profiles, 2 admin users, 1 draw round, 80 draw slots, 20 cards, 20 draw-round prizes, 35 realtime events, and zero current orders/slips/picks/audit events. Planned v2 website tables are not yet present in local generated types and returned null counts via the table API.

## RALPLAN-DR Summary

### Principles

1. **Same database, additive-first**: preserve current LIFF data and APIs; use additive migrations before any destructive cleanup.
2. **One canonical app profile**: `profiles.id` remains the business/user identity used by admin, orders, slips, ledger, inventory, exchange, and shipping.
3. **Supabase Auth for web sessions; LINE as an identity**: `auth.users.id` becomes the website auth subject, but LINE remains an optional provider/legacy identity mapped to the same profile.
4. **Server/database authority for money and inventory**: wallet credits, gacha opens, item ownership, exchange, shipping, and payment approval happen through server routes/RPCs with row-lock serialization, reference uniqueness, idempotency, and audit trails.
5. **Private by default**: PII, payment slips, wallet, inventory, admin actions, and raw order data require explicit RLS/storage policies; public UI uses safe read models and realtime invalidation events.

### Decision Drivers

1. **Backward compatibility**: existing LIFF sessions, profile IDs, owner/admin rows, draw data, card data, and payment logic must not be broken.
2. **Merged multi-platform account UX**: email/password, Google, and LINE must converge to one profile without duplicating orders, balance, inventory, or admin permissions.
3. **Production safety**: migrations must be reversible/testable; financial and inventory operations must be atomic, idempotent, audited, and RLS-protected.

### Viable Options

#### Option A — Additive same-DB strangler migration (recommended)

Add Supabase Auth/profile bridge columns and a `user_identities` registry, keep existing tables, add v2 wallet/gacha/collection/exchange/shipping tables, and move flows one-by-one while keeping LIFF compatibility.

- **Pros**: lowest data risk; preserves existing admin/profile IDs; allows LIFF and website to run together; easy rollback by feature flags; aligns with Supabase Auth and RLS over time.
- **Cons**: requires a transition layer; some duplicated identity/session code exists temporarily; careful merge handling is required.

#### Option B — New clean v2 schema in same database + compatibility views

Create a clean set of `v2_*` tables and expose compatibility views/functions for LIFF until it is migrated.

- **Pros**: clean domain language; fewer legacy constraints in new code; easier future mental model.
- **Cons**: higher migration risk; view/RLS complexity; more duplicate data movement; easier to accidentally fork LIFF and website logic.

#### Option C — Minimal patch current LIFF schema

Make `line_user_id` optional, add `auth_user_id`, and reuse existing `orders`/`payment_slips` for all flows with minimal new tables.

- **Pros**: fastest initial website auth unblock; least migration code.
- **Cons**: insufficient for wallet/coin ledger, collection, exchange, shipping, and ranking; financial audit trail remains weak; future admin complexity grows quickly.

### Recommended decision

Choose **Option A**. It is the only option that satisfies same-database alignment, merged accounts, production safety, and full website scope without forcing an all-at-once rewrite.

## Target Database Architecture

### 1) Identity and account merge layer

#### Modify `profiles` additively

Keep `profiles.id` as the canonical app-level user ID. Add:

- `auth_user_id uuid unique references auth.users(id) on delete set null` — nullable during transition; set for email/password and Google website users.
- `email citext null` or `email text null` with normalized index if `citext` is not enabled.
- `display_name text null`, `avatar_url text null` — platform-neutral display fields.
- `line_user_id text null` — drop `not null`, keep unique nullable index for legacy LIFF rows.
- `merged_into_profile_id uuid null references profiles(id)` only if hard merges are needed; otherwise prefer explicit admin-assisted merge jobs.
- `last_seen_at timestamptz null`, `profile_status text default 'active'`.

Compatibility:

- Existing LINE rows keep their `line_user_id` and `profiles.id`.
- Existing `admin_users.profile_id` stays valid.
- Existing orders/slips/picks keep `profile_id`.
- Email-only website users can have `line_user_id = null`.

#### Add `user_identities`

Purpose: application-level identity registry that aligns Supabase Auth identities, Google/email, and LINE/LIFF subjects to the same `profiles.id`.

Proposed fields:

- `id uuid primary key default gen_random_uuid()`
- `profile_id uuid not null references profiles(id) on delete cascade`
- `auth_user_id uuid null references auth.users(id) on delete cascade`
- `provider text not null check (provider in ('email','google','line','legacy_line'))`
- `provider_subject text not null`
- `email text null`
- `email_verified boolean not null default false`
- `display_name text null`
- `avatar_url text null`
- `is_primary boolean not null default false`
- `linked_at timestamptz not null default now()`
- `last_seen_at timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`
- `unique(provider, provider_subject)`
- `unique(profile_id, provider, provider_subject)`
- partial unique `one_primary_identity_per_profile` if using `is_primary`.

Provider subject semantics:

- `email`: `provider_subject = lower(auth.users.email)` only after Supabase reports a verified email; store `auth_user_id` too. If email is unverified, create the profile but delay primary email identity or mark it non-primary until verification.
- `google`: `provider_subject = auth.identities.identity_data->>'sub'` from the Supabase Auth Google identity when available; fallback only to `auth.identities.id` if Google `sub` is not exposed, and document the fallback in metadata.
- `line` / `legacy_line`: `provider_subject = LINE ID token sub` / current `profiles.line_user_id`.
- Never use display name, avatar URL, or mutable user metadata as provider subjects.

Rules:

- Email/password and Google are represented through Supabase Auth and synced into `user_identities` from trusted server code.
- LINE identity uses LINE `sub` as `provider_subject`; do not rely on LINE email because email may be absent.
- Normal website LINE login/connect must use OAuth `state` and OIDC `nonce` stored in an HttpOnly/SameSite cookie or server-side pending-login table; the callback must verify `state`, verify the ID token server-side, and validate `nonce` before trusting the LINE subject.
- If a logged-in website user connects LINE and the LINE subject has no identity, attach it to that user’s existing profile.
- If LINE subject already belongs to another profile with balance/orders/inventory/admin role, create an `account_merge_requests` row and require an admin/safe merge flow; do not silently merge financial history.
- If LINE subject belongs to an empty legacy profile, merge by moving that legacy identity and setting `profiles.auth_user_id` on the legacy profile or consolidating into the web profile via controlled RPC.

#### Add `account_merge_requests` / `account_merge_events`

Purpose: production-safe account linking when LINE and web accounts already exist separately.

Fields:

- `account_merge_requests`: `id`, `requested_by_profile_id`, `source_profile_id`, `target_profile_id`, `status ('pending','approved','rejected','completed','cancelled')`, `reason`, `risk_summary`, `approved_by_admin_id`, `completed_at`, timestamps.
- `account_merge_events`: `id`, `merge_request_id references account_merge_requests(id) on delete cascade`, `event_type ('created','risk_reviewed','approved','rejected','completed','cancelled','failed')`, `status_from`, `status_to`, `actor_profile_id`, `actor_admin_id`, `metadata jsonb default '{}'`, `created_at`.
- RLS/visibility: requesting profiles can read their own merge request and non-sensitive event status; active admins can read/manage all merge requests/events; anonymous users have no access.
- Merge RPC must move or consolidate related rows in a transaction: identities, ledger, inventory, addresses, orders, exchange/shipping requests, and audit events.
- Admin UI should show merge risk: nonzero balances, open payment requests, open exchange/shipping, admin role differences.

### 2) Admin and authorization

Keep `admin_users(profile_id, role, is_active)` as the only role source. Add:

- `admin_permissions` optional table only if role granularity grows beyond owner/admin/staff.
- `admin_activity_events` can reuse or extend `audit_events` with richer metadata.

Database helpers:

- `app_private.current_profile_id()` maps `auth.uid()` to `profiles.id`.
- `app_private.is_admin()` / `app_private.has_admin_role(required_roles text[])` checks `admin_users` for the current profile.
- Keep security-definer functions in `app_private`, not exposed `public` schema.
- Do not authorize from user-editable `raw_user_meta_data` or frontend-provided role flags.

Server rules:

- Website user routes use Supabase Auth SSR (`auth.uid()`/server user validation) and resolve profile from `profiles.auth_user_id`.
- Existing LIFF routes may temporarily continue using the signed LIFF cookie, but all admin-sensitive routes must re-check `admin_users` as they do now.
- Phase 1 must remove the production fallback from LINE cookie signing to `SUPABASE_SERVICE_ROLE_KEY`: production requires dedicated `LINE_SESSION_SECRET`; if missing, legacy LINE session creation fails closed with a configuration error. The legacy LIFF cookie may remain temporarily, but it must carry the verified LINE `sub` from the request/session, not assume `profiles.line_user_id` is non-null after migration.
- When both session types exist, introduce a single server helper: `resolveCurrentProfile(request)` returning `{profileId, authUserId?, lineUserId?, authSource}`.

### 3) Profile, personal info, and addresses

Existing `profiles` has embedded address/contact columns (`full_name`, `phone`, `address_*`, `delivery_note`). Keep them for compatibility but add normalized address management:

#### Add `user_addresses`

- `id`, `profile_id`, `recipient_name`, `phone`, `address_line1`, `address_line2`, `subdistrict`, `district`, `province`, `postal_code`, `country default 'Thailand'`, `delivery_note`, `is_default`, timestamps.
- RLS: owner can CRUD own addresses; admin can read/update for fulfillment.
- Backfill one default address from existing `profiles` personal-info fields if present.

### 4) Payment/top-up/wallet layer

The current `orders` table represents draw slot purchases tied to payment review. For a full website with top-up, gacha, and collection, separate money intake from item consumption.

#### Add `payment_methods`

- Admin-managed bank/PromptPay/QR configuration: `id`, `code`, `type ('bank_transfer','promptpay_qr')`, `bank_name`, `account_name`, `account_number`, `promptpay_id`, `qr_image_path`, `is_active`, display ordering, timestamps.
- Replaces per-round payment settings as the long-term source, while current `draw_rounds` fields remain for compatibility.

#### Add `top_up_requests`

- `id`, `public_code`, `profile_id`, `payment_method_id`, `amount_thb`, `coin_amount`, `status ('pending_slip','pending_review','approved','rejected','cancelled','expired')`, `submitted_at`, `reviewed_by_admin_id`, `reviewed_at`, `admin_note`, `customer_note`, timestamps.
- Manual bank transfer/QR slip upload is first-class here.
- Existing `payment_slips` must be generalized through an explicit invariant migration: make `order_id` nullable, add nullable `top_up_request_id references top_up_requests(id) on delete cascade`, add a check constraint enforcing exactly one owner reference (`order_id` xor `top_up_request_id`), preserve the existing `payment_slips_order_id_idx`, add `payment_slips_top_up_request_id_idx`, and test both legacy order slips and new top-up slips before switching website writes.

#### Add `wallet_accounts`

Purpose: the serialized balance row for each profile. This removes ambiguity from concurrent top-up approval, gacha open, exchange credit, refunds, and admin adjustment.

- `profile_id uuid primary key references profiles(id) on delete cascade`
- `balance_coins integer not null default 0 check (balance_coins >= 0)`
- `version integer not null default 0`
- `created_at`, `updated_at`

Concurrency rule:

- Every balance-changing RPC/server transaction must `select ... from wallet_accounts where profile_id = ... for update` before inserting a ledger entry.
- If no wallet row exists, create it in the same transaction, then lock it.
- Do not compute current balance from unlocked ledger sums during writes.
- Use `read committed` with row lock or stronger transaction isolation; retry serialization/deadlock failures safely with idempotency keys.

#### Add `coin_ledger`

- `id`, `profile_id`, `wallet_profile_id`, `entry_type ('top_up','gacha_spend','refund','admin_adjustment','exchange_fee','shipping_fee','exchange_credit')`, `amount_coins` signed integer, `balance_before`, `balance_after`, `reference_type`, `reference_id`, `idempotency_key`, `created_by_admin_id`, `metadata`, `created_at`.
- No direct client writes. Only server/RPC can insert ledger rows after locking `wallet_accounts`.
- Unique `(profile_id, idempotency_key)` for externally retried operations.
- Add reference uniqueness beyond idempotency: partial unique constraints that prevent duplicate financial effects, for example `(reference_type, reference_id, entry_type)` where `reference_id is not null`, plus stricter named indexes for `top_up_request_id + top_up`, `gacha_open_id + gacha_spend`, `exchange_order_id + exchange_credit`, and refund references.
- Admin approval of a top-up creates exactly one positive ledger entry and updates `wallet_accounts.balance_coins` in the same transaction as `top_up_requests.status = 'approved'`.

### 5) Gacha/campaign/opening layer

Preserve `draw_rounds`, `draw_slots`, `orders`, `order_picks` for current LIFF draw flow. Add a v2 opening model that can reuse campaigns/cards/prizes without forcing immediate rename.

#### Evolve `draw_rounds` into campaigns via compatibility

- Keep table name `draw_rounds` initially to preserve LIFF.
- Add columns as needed: `mode ('slot_pick','instant_gacha')`, `cost_coins`, `opens_total_limit`, `per_user_limit`, `starts_at`, `ends_at`, `visibility`, `sort_order`.
- Long-term optional view: `gacha_campaigns` as a security-invoker view over `draw_rounds` once Postgres version/policies are verified.

#### Add `gacha_opens`

- `id`, `public_code`, `profile_id`, `draw_round_id`, `cost_coins`, `status ('reserved','completed','failed','refunded')`, `ledger_entry_id`, `opened_at`, `idempotency_key`, metadata.

#### Add `gacha_open_items`

- `id`, `gacha_open_id`, `card_id`, `draw_round_prize_id`, `tier`, `value_thb`, `result_position`, timestamps.

Atomic operation:

- `open_gacha(profile_id, draw_round_id, idempotency_key)` RPC/server transaction:
  1. locks `wallet_accounts` for the profile with `for update`; creates the row first if missing;
  2. verifies campaign live/limits;
  3. inserts negative `coin_ledger` entry;
  4. creates `gacha_opens` and result rows;
  5. creates/updates `collection_items`;
  6. emits realtime event;
  7. writes audit event.

### 6) Collection, exchange, and shipping

#### Add `collection_items`

- `id`, `profile_id`, `card_id`, `source_type ('gacha_open','admin_grant','legacy_import')`, `source_id`, `status ('owned','locked','exchange_requested','exchanged','shipping_requested','shipped','void')`, `serial_no`, `acquired_at`, timestamps.
- Owner RLS for own collection; admin full access.

#### Add `exchange_orders` and `exchange_order_items`

- `exchange_orders`: `id`, `public_code`, `profile_id`, `status ('draft','submitted','approved','rejected','completed','cancelled')`, `requested_coin_value`, `approved_coin_value`, `reviewed_by_admin_id`, timestamps, notes.
- `exchange_order_items`: `exchange_order_id`, `collection_item_id`, `card_id`, `coin_value_snapshot`.
- Transaction rule: when submitted, selected collection items move to `exchange_requested`/locked; when approved, ledger credit is inserted and items become `exchanged`.

#### Add `shipping_requests` and `shipping_request_items`

- `shipping_requests`: `id`, `public_code`, `profile_id`, `address_id`, `status ('draft','submitted','packing','shipped','delivered','cancelled')`, `shipping_fee_coins`, `tracking_provider`, `tracking_number`, `admin_note`, timestamps.
- `shipping_request_items`: `shipping_request_id`, `collection_item_id`, `card_id`.
- Transaction rule: selected items lock on submit; admin marks shipped and stores tracking.

### 7) Orders compatibility

Keep `orders`, `payment_slips(order_id)`, and `order_picks` for the existing LIFF draw purchase flow.

Add bridge fields only if needed:

- `orders.source_channel ('liff','website','admin') default 'liff'`
- `orders.auth_user_id uuid null` for convenience/analytics, not as the business owner.
- `orders.top_up_request_id uuid null` only if legacy draw order payments are later converted into wallet top-ups.

Do not overload `orders` to mean top-up, gacha open, exchange, and shipping all at once. That path would make admin and reconciliation brittle.

### 8) Realtime and read models

Keep the current `lucky_draw_realtime_events` table for legacy public/live draw refreshes, but do **not** extend its existing public-read policy with user/admin topics. The current policy is public-readable, so adding `profile_id`, `order_id`, wallet, top-up, exchange, shipping, or admin topics there would leak user activity.

Recommended split:

- Keep `lucky_draw_realtime_events` public-safe for anonymous live draw/card/slot invalidation only. Before any private schema evolution, replace the current broad `using (true)` policy with a policy limited to public-safe topics and no private owner identifiers; remove or rewrite triggers that emit `order_id`/payment/private identifiers into the public table.
- Add `app_realtime_events` for authenticated scoped refreshes: `id`, `topic`, `profile_id`, `admin_only boolean default false`, `entity_type`, `entity_id`, `created_at`.
- RLS for `app_realtime_events`: owner can read rows where `profile_id = app_private.current_profile_id()` and `admin_only = false`; active admin can read admin rows; anonymous reads are denied.
- Keep payload minimal: IDs and topic only, no PII/payment/provider details.
- Sensitive UI refetches authenticated APIs after receiving events; realtime events are not the data source.

Compatibility rule: LIFF can keep subscribing to `lucky_draw_realtime_events`; the website subscribes to both public draw events and authenticated `app_realtime_events` as appropriate.

### 9) Storage

Buckets:

- Keep private `payment-slips` bucket.
- Keep public `lucky-draw-assets`/assets bucket for card/campaign images.
- Add or namespace private paths:
  - `payment-slips/orders/{order_id}/...`
  - `payment-slips/topups/{top_up_request_id}/...`
  - `shipping-evidence/{shipping_request_id}/...` if later needed.

Policies:

- User can upload/select own slip only through authenticated route/policy keyed by resolved profile and request ownership.
- Admin can review all slips/evidence.
- Service role is server-only; never expose service-role or secret keys in browser.
- Use signed URLs/server proxy for admin slip review if policy complexity would leak paths.

### 10) Audit, idempotency, and operations

Add:

- `idempotency_keys(id, key, scope, profile_id, request_hash, response_snapshot, status, expires_at, created_at)` for payment/gacha/exchange/shipping retries.
- Extend `audit_events` with `top_up_request_id`, `gacha_open_id`, `collection_item_id`, `exchange_order_id`, `shipping_request_id`, `auth_user_id`, `ip_hash`, `user_agent_hash` if useful and privacy-reviewed.
- Optional `site_settings` for admin-configured website banners, maintenance mode, limits, and payment instructions.
- Optional `ranking_snapshots` for leaderboard/history pages: `id`, `scope`, `period_start`, `period_end`, `profile_id`, `metric`, `rank`, `value`, generated_at.

## Migration Plan

### Phase 0 — Freeze evidence and backup

- Export current schema and table counts.
- Confirm Supabase project reference and environment without printing secrets.
- Take a database backup/snapshot before migration execution.
- Generate fresh Supabase types from the current schema if CLI/MCP is available.

### Phase 1 — Identity bridge, no behavior switch

- Add `profiles.auth_user_id`, neutral display/email fields, and make `line_user_id` nullable while preserving unique index.
- Harden legacy LINE cookie signing before wider auth work: require dedicated `LINE_SESSION_SECRET` in production and remove/fail-closed any production fallback to `SUPABASE_SERVICE_ROLE_KEY`; keep legacy LIFF cookie only when signed with this dedicated secret and populated from verified LINE `sub`.
- Harden realtime before private flows: partition/drop private triggers from public `lucky_draw_realtime_events`, remove private identifiers from anonymous-readable events, and create RLS-scoped `app_realtime_events` before any top-up/gacha/payment private writes are introduced.
- Add `user_identities` and backfill `legacy_line` identities from existing `profiles.line_user_id`.
- Create `user_addresses`, backfill one default address per profile from existing `profiles.full_name`, `phone`, `address_line1/2`, `subdistrict`, `district`, `province`, `postal_code`, `country`, and `delivery_note` where present, add owner/admin RLS, and keep embedded profile address columns for compatibility.
- Regenerate Supabase types after this schema phase and run typecheck before proceeding; generated `profiles.line_user_id` must be nullable and app session types must not assume a DB-required LINE field.
- Add helper functions in `app_private` for `current_profile_id()` and admin checks.
- Add initial RLS policies for identity/profile/address ownership and admin access.
- Keep current LIFF `/api/line/session` working as-is.

### Phase 2 — Website Supabase Auth profile creation/linking

- Add email/password and Google auth SSR helpers in website code.
- Add `get_or_create_profile_for_auth_user` server/RPC flow to create/link `profiles.auth_user_id` and `user_identities`.
- Create `account_merge_requests` and `account_merge_events` with RLS/admin policies before any connect-LINE path can open a merge conflict.
- Add connect-LINE flow that uses OAuth `state`, OIDC `nonce`, exact callback URL validation, server-side ID-token verification, and then attaches LINE identity to the current profile or opens `account_merge_requests`.
- Replace route-level “LINE login required” checks with `resolveCurrentProfile()` while keeping LIFF cookie support.
- Regenerate Supabase types and run typecheck after auth/profile schema changes used by app code.

### Phase 3 — Payment top-up and ledger

- Pre-gate: confirm realtime hardening from Phase 1 is already deployed and tested; top-up/payment/slip writes must not emit private identifiers to anonymous-readable events.
- Create `idempotency_keys` before any payment/ledger RPCs that accept retryable client/admin operations; use it alongside ledger reference uniqueness, not as a replacement.
- Add `payment_methods`, `top_up_requests`, `wallet_accounts`, generalized `payment_slips` owner reference, and `coin_ledger`.
- Generalize `payment_slips` explicitly: make `order_id` nullable, add `top_up_request_id`, enforce `order_id` xor `top_up_request_id`, preserve legacy order-slip reads/writes, and add top-up-slip tests before website write switch.
- Migrate admin payment settings from `draw_rounds` into `payment_methods` while leaving draw fields for LIFF compatibility.
- Implement admin approval/rejection RPCs with wallet row locking, ledger reference uniqueness, idempotency, and audit events.
- Regenerate Supabase types and run typecheck after payment/wallet schema changes.

### Phase 4 — Gacha, collection, exchange, shipping

- Pre-gate: confirm `app_realtime_events` RLS tests pass, anonymous users cannot read private user/admin events, and `idempotency_keys` replay tests pass for payment/ledger before extending retryable gacha/exchange/shipping operations.
- Add `gacha_opens`, `gacha_open_items`, `collection_items`, `exchange_orders/items`, and `shipping_requests/items`.
- Add atomic open/exchange/shipping RPCs or server transactions; any balance-changing operation must lock `wallet_accounts` and enforce ledger reference uniqueness.
- Emit private/user/admin refreshes only through RLS-scoped `app_realtime_events`; keep public `lucky_draw_realtime_events` for public-safe draw/card/slot invalidation.
- Extend audit references.
- Regenerate Supabase types and run typecheck after gacha/collection/exchange/shipping schema changes.

### Phase 5 — RLS hardening and compatibility verification

- Review every exposed `public` table: explicit grants, RLS enabled, policies match anon/authenticated/admin access.
- Re-verify that Phase 1 realtime hardening remains intact after payment/gacha/exchange/shipping changes: public realtime has only public-safe topics and private refreshes use RLS-scoped `app_realtime_events`.
- Keep security-definer functions in `app_private`; grant execute only where needed.
- Ensure any views used by frontend are `security_invoker` or not exposed to anon/authenticated.
- Keep `service_role` only in server code.

### Phase 6 — Deprecate legacy assumptions only after parity

- Update generated Supabase types.
- Replace UI messages that say LINE is required.
- Keep `line_user_id` unique nullable for historical rows.
- Remove the legacy LIFF cookie mechanism only after LIFF is migrated to Supabase Auth or has an equivalent trusted bridge. This is separate from Phase 1, where the production service-role signing fallback is already removed/fail-closed.

## RLS / Policy Matrix

| Data area | Anonymous | Authenticated user | Admin/staff | Server/service |
| --- | --- | --- | --- | --- |
| live campaigns/cards/prizes | read live/public only | read live/public only | full manage by role | full |
| profile | none or minimal public display only | own profile via `auth.uid() -> profiles.auth_user_id` | read/manage as needed | full |
| identities | none | own identity list limited/safe | read/manage merge workflows | full |
| addresses | none | own CRUD | fulfillment read/update | full |
| top-up requests/slips | none | own create/read allowed states | review all | full |
| coin ledger | none | own read only | read/adjust with audit | full |
| gacha opens/collection | public aggregate only | own read/open through RPC | manage/remediate | full |
| exchange/shipping | none | own create/read allowed states | fulfill/review | full |
| realtime events | public safe topics only | own/user-scoped safe topics | admin topics if needed | full |
| audit events | none | maybe own user-facing subset | full by role | full |

## Acceptance Criteria

1. Existing LIFF LINE login still resolves the same `profiles.id` for existing LINE users after identity migration.
2. Existing owner/admin rows still grant admin access because `admin_users.profile_id` is unchanged.
3. Email/password user can create an account/profile with `line_user_id = null` and valid `profiles.auth_user_id`.
4. Google login maps to the same profile when Supabase Auth links the identity or the user manually links while logged in.
5. LINE connect maps LINE `sub` into `user_identities` and does not rely on LINE email.
6. A user with email + LINE sees one profile, one wallet balance, one order history, one collection, one exchange/shipping history.
7. Account merge conflicts with money/orders/inventory create a merge request or safe admin flow, not a silent destructive merge.
8. Manual top-up approval creates one and only one positive `coin_ledger` entry even if approval request is retried.
9. Gacha open creates ledger debit, open record, result item(s), collection item(s), realtime event, and audit event atomically.
10. Exchange approval locks/consumes collection items and credits ledger exactly once.
11. Shipping submission locks items, references a saved address, and supports admin tracking update.
12. Payment slip files remain private and are only visible to owner/admin/server paths.
13. No frontend code uses the service-role/secret key or user-editable metadata for authorization.
14. Every new `public` table has explicit RLS and grants/data-API exposure decisions.
15. Current `claim_order_slots` duplicate/exact-quantity safeguards remain covered for legacy LIFF draw purchases.
16. Every balance-changing transaction locks `wallet_accounts` and has unique ledger reference constraints in addition to idempotency keys.
17. Public realtime events never include user/admin/private topics or owner identifiers; user/admin refresh events are RLS-scoped.
18. Production legacy LIFF cookie signing fails closed without `LINE_SESSION_SECRET` and never signs cookies with the service-role key fallback.
19. LINE website login/connect verifies OAuth `state`, validates ID-token `nonce`, and rejects replay/mismatched callback attempts.
20. `payment_slips` supports exactly one owner (`order_id` xor `top_up_request_id`) and both legacy order slips and new top-up slips pass compatibility tests.
21. Supabase generated types are updated and typecheck passes after every schema phase that changes app-visible tables/RPCs.
22. `user_identities.provider_subject` uses exact stable subjects: verified normalized email for email, Google `sub` or documented Supabase identity ID fallback for Google, and LINE `sub` for LINE.
23. Legacy order/slip writes and top-up slip inserts do not expose private order/payment identifiers through anonymous-readable realtime events.
24. `user_addresses` exists by Phase 1, is backfilled from existing profile address fields where available, and has owner/admin RLS.
25. `account_merge_requests` and `account_merge_events` exist by Phase 2 before LINE connect conflict handling is enabled.
26. `idempotency_keys` exists by Phase 3 before payment/ledger RPCs accept retryable operations and is reused/extended by gacha/exchange/shipping operations.

## Verification Plan

### Migration verification

- Pre/post table counts for existing tables.
- Backfill count: every non-null `profiles.line_user_id` has one `user_identities(provider='legacy_line')` row.
- Constraint checks: `profiles.line_user_id` unique nullable; `profiles.auth_user_id` unique nullable; identity uniqueness prevents duplicate LINE subjects; `payment_slips` owner XOR constraint; ledger reference uniqueness; `wallet_accounts` row exists/locks for ledger writes; `user_addresses`, `account_merge_requests/events`, and `idempotency_keys` exist in their assigned phases.
- Rollback/dry-run scripts tested on local/staging before production.

### Unit/database tests

- pgTAP or SQL test fixtures for:
  - profile resolution by `auth.uid()`;
  - user address backfill plus owner/admin RLS;
  - account merge conflict request/event creation and admin visibility;
  - idempotency key replay duplicate-response/no-double-effect behavior;
  - admin helper role checks;
  - top-up approval idempotency plus duplicate approval retry under concurrent requests;
  - wallet row lock serialization and ledger reference uniqueness for top-up/gacha/exchange/refund;
  - gacha open insufficient balance/live campaign/limit cases;
  - exchange item lock/consume cases;
  - shipping item lock/status transitions;
  - account merge conflict rules.

### Integration tests

- Existing LIFF `/api/line/session` login/upsert smoke test.
- Existing order creation and `claim_order_slots` smoke test.
- Website email signup/login/profile creation.
- Website Google signup/login/profile linking.
- Connect LINE to a website account with valid `state`/`nonce`, and reject missing/mismatched/replayed `state` or `nonce`; conflict cases create `account_merge_requests` plus `account_merge_events` before any destructive merge.
- Manual slip upload, admin approve/reject, ledger update.
- Gacha open, collection update, exchange request, shipping request.

### E2E/browser tests

- Normal user can use website without LINE from signup through top-up through gacha open.
- User can later connect LINE and still sees same account data.
- LIFF user can still log in and operate legacy draw flow.
- Admin sees all management pages; non-admin does not see admin navigation and is denied server-side.

### Security/RLS tests

- Anonymous cannot read profiles, slips, ledger, collection, exchange, shipping, audit rows, or RLS-scoped private realtime rows.
- User A cannot read/update User B's private rows.
- Admin policies work only when `admin_users.is_active = true`.
- `payment-slips` bucket access is private; service-role is only used server-side.
- Views either use `security_invoker = true` or are not exposed.
- Realtime regression tests prove legacy order/slip writes do not expose private order/payment identifiers through public realtime; top-up slip inserts do not emit public `payments` events; only public draw/card/slot-safe topics are anonymous-readable.

### Observability

- Audit events for auth linking, merge request, top-up review, gacha open, exchange review, shipping update, admin changes.
- Structured server logs for payment/slip verification without PII/secret leakage.
- Realtime event counts monitored for runaway trigger loops and private-event policy violations.

## Pre-mortem

1. **Silent duplicate accounts**: email user and LINE user become separate profiles with separate wallet/inventory. Mitigation: identity uniqueness, connect-LINE flow, account merge requests, admin merge evidence, and UX showing connected identities.
2. **RLS/realtime data leak**: a new website table or realtime topic exposes profile/payment/wallet/admin activity through public policies or RLS-bypassing views. Mitigation: split public and private realtime streams, automated RLS matrix tests, security-invoker views only, no public service-role.
3. **Money/inventory inconsistency**: retries or concurrent gacha/top-up/exchange/refund operations create double credits/debits/items. Mitigation: `wallet_accounts` row locks, idempotency keys, unique ledger reference constraints, ledger balance_before/after, and integration tests with concurrent duplicate submissions.

## Risks and Mitigations

- **Dropping `line_user_id not null` too early**: do it in a migration that has tests proving old LIFF upsert still works.
- **LINE email unavailable**: rely on LINE `sub`, not email, for LINE identity linking.
- **Supabase automatic linking by email not enough**: maintain app-level `user_identities` and manual linking/merge workflow.
- **Service role overuse**: keep service role in server-only route handlers/RPC callers and progressively move safe reads to RLS-backed authenticated clients. Production LINE cookie signing must never fall back to service-role secrets.
- **Realtime leakage**: keep public draw invalidation separate from authenticated profile/admin events; replace broad public policy before adding private topics.
- **Ledger race conditions**: launch wallet/gacha/exchange only after `wallet_accounts` row-locking and ledger reference uniqueness tests pass.
- **Generated type drift**: regenerate Supabase types and typecheck after each schema phase, not only at final cleanup.
- **Identity subject drift**: use stable provider subjects only; never infer identity from mutable profile/display metadata.
- **Complex v2 schema timeline**: phase delivery; identity bridge first, then payment/ledger, then gacha/collection/exchange/shipping.

## ADR

### Decision

Adopt **Option A: additive same-DB strangler migration**. Keep existing LIFF tables and profile IDs, add a Supabase Auth identity bridge, then add v2 wallet/gacha/collection/exchange/shipping tables with transactional server/RPC operations.

### Drivers

- Same Supabase database must serve LIFF and website.
- Existing admin/profile/draw data must remain valid.
- Website users must not need LINE.
- Financial and inventory records require auditability, idempotency, and RLS.

### Alternatives considered

- **Option B clean v2 schema + compatibility views**: rejected for first production step because it adds migration/view/RLS complexity and higher risk of forking LIFF and website behavior.
- **Option C minimal patch**: rejected because it only unblocks auth and does not safely support wallet, collection, exchange, shipping, ranking, and admin reconciliation.

### Why chosen

Option A lets the team prove each production slice while preserving current LIFF behavior. It makes Supabase Auth the web auth backbone without breaking LINE, and it gives admin/maintainers one profile/account model to manage.

### Consequences

- There will be a transition period with both custom LIFF session and Supabase Auth profile resolution.
- Some schema names (`draw_rounds`) remain legacy-compatible until a later rename/view strategy is worth the risk.
- More upfront RLS/RPC/idempotency/row-locking work is required, but it prevents payment/inventory bugs.
- Public and private realtime events must be separated or strongly policy-partitioned before private topics are introduced.
- Legacy LIFF session compatibility is allowed only with dedicated production cookie secret handling.

### Follow-ups

1. Produce migration SQL in a new execution phase.
2. Add SQL/pgTAP tests or scripted Supabase integration tests before applying to production, including concurrent wallet/ledger tests and RLS realtime policy tests.
3. Update generated Supabase types after every schema phase and run typecheck gates.
4. Update auth/session helpers to support Supabase Auth + LIFF compatibility.
5. Build admin merge/payment/gacha/collection/exchange/shipping screens against this schema.

## Available Agent Types Roster

- `explore`: fast repo/schema lookup and mapping.
- `researcher`: official Supabase/LINE/Next docs and changelog checks.
- `dependency-expert`: SDK/provider decisions if LINE custom OAuth vs manual verify changes.
- `architect`: schema/RLS/auth architecture review.
- `critic`: plan quality, risk, and acceptance criteria gate.
- `executor`: migration/code implementation.
- `debugger`: failures during auth/RLS/migration/runtime testing.
- `test-engineer`: SQL/API/e2e/security test design.
- `verifier`: final completion evidence and claim validation.
- `code-reviewer`: security/code review after implementation.

## Follow-up Staffing Guidance

### `$ralph` path

Use one sequential owner when safety is more important than speed:

- Ralph leader: integrate plan and execute in phases.
- `explore` first to refresh schema and file references.
- `executor` for migration and auth bridge implementation.
- `test-engineer` for RLS/migration/API/e2e tests.
- `verifier` after each phase to confirm no LIFF regression.

Suggested command:

```bash
$ralph "implement Database/docs/plans/ralplan-liff-database-redesign.md phase 1 only; preserve LIFF; add tests; do not apply production migrations without staging verification"
```

### `$team` path

Use team mode only after this plan is approved and split into disjoint write scopes:

- Lane 1 `executor`: Supabase migrations/types/RLS tests.
- Lane 2 `executor`: auth/session/profile resolution helpers.
- Lane 3 `executor`: payment/top-up/ledger APIs/admin UI.
- Lane 4 `executor`: gacha/collection/exchange/shipping APIs/UI.
- Lane 5 `test-engineer`: e2e and RLS matrix.
- Lane 6 `verifier`/`code-reviewer`: integration and security review.

Suggested command:

```bash
$team "implement Database/docs/plans/ralplan-liff-database-redesign.md in phases; disjoint lanes for migrations, auth bridge, payments, gacha/collection, tests, verification"
```

## Team Verification Path

Before shutdown, the implementation team must prove:

1. Migrations apply cleanly on local/staging and preserve current rows.
2. Existing LIFF login/order/pick flows still work.
3. Website email/Google login creates/links profiles without LINE.
4. LINE connect merges/links to the same profile or creates a safe merge request backed by `account_merge_requests/events`.
5. Manual top-up/slip/admin approval updates wallet/ledger once under duplicate/concurrent retries using `idempotency_keys` and ledger reference uniqueness.
6. Gacha open/collection/exchange/shipping flows work end-to-end with wallet row locks and unique ledger references.
7. RLS/storage/realtime tests block cross-user/private data access; public realtime does not leak user/admin/order/payment events; private events are RLS-scoped.
8. Generated Supabase types and typecheck pass after every schema phase.
9. Admin UI is hidden/denied for non-admin and works for active admin.

## Changelog

- Initial deliberate draft created from local schema exploration, masked live Supabase table counts, official Supabase/LINE docs constraints, and prior Lucky Draw product requirements.
- Architect ITERATE hardening applied: added `wallet_accounts` row-lock model, ledger reference uniqueness, private/public realtime split, production `LINE_SESSION_SECRET` fail-closed rule, LINE `state`/`nonce` requirements, and explicit `payment_slips` XOR migration invariant.
- Critic ITERATE fixes applied: moved realtime hardening into Phase 1/pre-Phase-3 gates, clarified legacy cookie secret removal versus later cookie-mechanism removal, added per-phase generated-type/typecheck gates, added explicit realtime regression tests, and defined provider-subject semantics for email/Google/LINE identities.
- Final Critic phase-placement fixes applied: assigned `user_addresses` to Phase 1, `account_merge_requests/events` to Phase 2, and `idempotency_keys` to Phase 3 with matching tests and acceptance gates.
- Narrow final Critic fixes applied: Phase 1 now explicitly creates/backfills `user_addresses`; `account_merge_events` now has concrete fields and RLS/visibility rules.
