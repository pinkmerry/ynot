# Marketplace Account Identity Bridge - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Let a customer use the same YNOTT login for marketplace buyer and seller activity, even when marketplace data lives in a separate Marketplace Supabase project.

Marketplace must feel like one YNOTT account, but it must not become a second auth system or a shortcut around the existing YNOTT profile rules.

## Document Role

This document owns the account and identity bridge plan. It must stay aligned with doc `00`: one YNOTT profile is the customer account, marketplace account rows are internal operational records, and public marketplace browse must not create marketplace account rows.

## Core Decision

YNOTT `profiles.id` is the customer account.

Marketplace account rows are internal marketplace records linked to that existing YNOTT profile. They are not login identities.

No marketplace password, no marketplace Supabase Auth, no second LINE login, and no manual user account linking screen in MVP.

## MVP Identity Decision Locks

- The YNOTT profile is the customer account. Marketplace does not create a second public account.
- Marketplace account rows are internal operational records created automatically when a YNOTT profile is created or synced.
- Existing YNOTT profiles should be backfilled into Marketplace Supabase before owner-only marketplace testing.
- Idempotent account `ensure` can still run on first authenticated marketplace action to repair a missing internal row, but public browse must not create account rows.
- Public browse can be enabled later; owner-only login is required during prelaunch testing.
- Checkout, seller submission, order history, Customer Bag Marketplace tab, payout, and admin actions always require a resolved YNOTT profile.
- Seller payout setup is required before payout release, not before item submission.
- Disabled profiles keep readable marketplace history but cannot create new marketplace actions unless a legal/security decision requires hiding history.

## Current Repo Evidence

Existing identity modules already give us a good seam:

- `Website/src/lib/auth/resolve-current-profile.ts` resolves the current YNOTT profile from Supabase Auth or LINE/site session.
- `Website/src/lib/auth/protected-route.ts` wraps profile/admin requirements for pages.
- `Website/src/lib/auth/profile.ts` creates and syncs YNOTT profiles for Supabase Auth users.
- `Website/src/lib/line/link-identity.ts` links LINE identity to the same YNOTT profile and creates review requests on conflict.
- `Website/src/lib/auth/identity-merge.ts` keeps identity review separate from value-row movement.
- `Website/docs/architecture/login-identity-flow.md` already states that `profiles.id` owns wallet, pulls, collection, exchange, shipping, and admin history.
- `Website/src/app/(store)/marketplace/page.tsx` is now an owner-only marketplace surface that resolves the existing YNOTT profile, reads/repairs the internal Marketplace Account through `Website/src/lib/marketplace/account-bridge.ts`, and keeps public browse from creating account rows.

Doc 01 should deepen the existing profile seam instead of adding marketplace-specific login logic.

## Architecture Vocabulary

This plan uses the architecture vocabulary from `matt-improve-codebase-architecture`:

- Module: `Marketplace Account Bridge`.
- Interface: what marketplace callers must know to resolve a marketplace account safely.
- Implementation: YNOTT profile lookup, marketplace account upsert, status reconciliation, role checks, and audit writes.
- Seam: the place where marketplace code crosses from YNOTT identity into marketplace identity.
- Adapter: concrete access to YNOTT profile/admin data, Marketplace Supabase, and tests.
- Depth: a small interface hiding several identity, status, and safety checks.
- Leverage: buyer, seller, admin, checkout, payout, and customer bag flows all use one bridge.
- Locality: account drift, duplicate-account bugs, and spoofed profile bugs concentrate in one module.

## Main Module

Create a server-only `Marketplace Account Bridge` module.

Recommended future path:

```text
Website/src/lib/marketplace/account-bridge.ts
```

The module should be the only normal way for marketplace routes, pages, and server actions to convert a current YNOTT profile into a marketplace account.

The bridge should hide these details from callers:

- How the current YNOTT profile was authenticated.
- Whether the profile came from Supabase Auth or LINE.
- Whether the marketplace account already exists.
- How duplicate first-touch account creation is prevented.
- How buyer, seller, payout, and admin capability are derived.
- How YNOTT profile status is revalidated.
- How Marketplace Supabase is called.
- How account bridge audit events are written.

## Planned Interface Responsibilities

Do not expose raw database writes to marketplace callers. The bridge should provide a small set of product-level operations:

- Resolve current marketplace viewer.
- Get or create marketplace account for the current YNOTT profile.
- Require buyer capability.
- Require seller capability.
- Require payout capability.
- Require marketplace admin/operator capability.
- Refresh marketplace account profile snapshot.
- Record marketplace account bridge audit events.

The exact TypeScript signatures should be designed during implementation, but every operation must derive identity from a server-resolved YNOTT session, never from browser-submitted profile IDs.

## One Account Rules

- One YNOTT profile can be a buyer and seller.
- Buyer and seller are modes on the same marketplace account, not separate accounts.
- Marketplace account creation should happen during YNOTT profile creation/sync or a controlled backfill for existing profiles.
- Idempotent `ensure` on first authenticated marketplace action is a repair path, not the normal UX account creation moment.
- Public marketplace browse may be available without login later, but checkout, selling, customer bag marketplace tab, order history, payout, and admin actions require a resolved YNOTT profile.
- The browser must never send trusted `ynot_profile_id`, seller ID, buyer ID, admin ID, fee, payout status, or ownership values.
- Marketplace must not change YNOTT login identity, LINE identity, wallet, gacha rewards, or Customer Bag records.

## Account Bridge Flow

### Marketplace Account Provisioning

```text
YNOTT profile is created or synced
  -> Marketplace Account Bridge receives server-resolved profile
  -> bridge validates active YNOTT profile status
  -> bridge idempotently upserts marketplace_accounts by ynot_profile_id
  -> marketplace account row is ready before checkout/seller action
```

Public browse may read listing snapshots without creating marketplace account rows.

If an existing YNOTT profile has no marketplace account row because it predates the marketplace launch, the first authenticated marketplace action may call the same idempotent upsert as a repair path.

### Buyer Checkout

```text
Buyer clicks checkout
  -> route resolves current YNOTT profile server-side
  -> bridge gets marketplace account
  -> bridge checks buyer_status = active
  -> checkout uses marketplace_account.id
  -> payment/order rows use marketplace account + ynot_profile_id snapshot
```

### Seller Entry

```text
Customer opens selling flow
  -> route resolves current YNOTT profile server-side
  -> bridge gets marketplace account
  -> bridge checks seller_status
  -> if seller_terms missing, send to terms step
  -> if seller active, allow submission/listing flow
```

### Admin Marketplace Action

```text
Admin opens marketplace admin queue
  -> route resolves current YNOTT profile server-side
  -> resolveAdminSession checks admin_users in YNOTT core
  -> bridge maps admin profile to marketplace operator context
  -> admin action writes marketplace audit event with ynot_profile_id + admin role snapshot
```

### Profile Disabled Or Session Revoked

```text
YNOTT profile becomes disabled, merged, or session becomes invalid
  -> resolveCurrentProfile fails or returns no active profile
  -> bridge refuses marketplace account use
  -> existing marketplace rows remain for audit and order history
  -> new checkout, listing, payout, and admin mutation actions stop
```

## Marketplace Account Data Model

First-pass `marketplace_accounts` fields:

- `id`
- `ynot_profile_id`
- `profile_status_snapshot`
- `display_name_snapshot`
- `avatar_url_snapshot`
- `auth_source_snapshot`
- `buyer_status`
- `seller_status`
- `payout_status`
- `seller_terms_version`
- `seller_terms_accepted_at`
- `buyer_terms_version`
- `buyer_terms_accepted_at`
- `last_profile_verified_at`
- `last_seen_at`
- `created_at`
- `updated_at`
- `metadata`

Required constraints:

- Unique `ynot_profile_id`.
- `buyer_status` limited to known states.
- `seller_status` limited to known states.
- `payout_status` limited to known states.
- `ynot_profile_id` must not be nullable.

No cross-project foreign key should point from Marketplace Supabase to YNOTT Supabase. The marketplace row stores the YNOTT profile reference as an external reference and verifies it through the bridge.

## Account Status Model

### Buyer Status

- `active`: can checkout.
- `blocked`: cannot checkout.

Default: `active`.

### Seller Status

- `none`: has not started selling.
- `pending_terms`: must accept seller terms.
- `pending_review`: waiting for admin review or seller eligibility check.
- `active`: can submit/list approved marketplace items.
- `suspended`: cannot create or manage active selling activity.

Default: `none`.

### Payout Status

- `not_started`: no payout setup.
- `pending_provider`: payout setup started but not verified.
- `verified`: payout destination ready.
- `on_hold`: payout paused by admin or risk rule.
- `blocked`: payout disabled.

Default: `not_started`.

## Buyer And Seller In One Account

The same marketplace account must support both sides:

- A buyer can later become a seller without creating a second record.
- A seller can buy with the same account.
- Buyer restrictions should not automatically block seller payout unless a risk rule says so.
- Seller suspension should not hide previous buyer order history.
- Payout status should affect payout only, not browsing or order history.

This keeps the customer experience simple while keeping marketplace risk controls precise.

## Frontend Identity UX Contract

The marketplace frontend should make the account bridge feel invisible. The user should experience one YNOTT account with extra marketplace capabilities, not a second product with separate login language.

Design direction:

- Purpose: help customers understand what marketplace actions are available for their current YNOTT account.
- Audience: repeat YNOTT customers who already know packs, rewards, shipping, and coin conversion.
- Tone: calm, transactional, and scannable; avoid a marketing hero or separate marketplace onboarding funnel.
- Memorable detail: a compact `Marketplace status` strip that shows buyer, seller, and payout readiness as separate labeled states.
- Constraints: reuse existing YNOTT account/profile layout patterns, existing navigation, and existing auth prompts.

UI rules:

- Logged-out marketplace actions should use the normal YNOTT sign-in entry point and copy such as `Sign in to continue`, not marketplace-specific account creation copy.
- After login, marketplace should normally find an already-synced Marketplace Account created from YNOTT profile sync or backfill. If the row is missing, the first authenticated marketplace action may run idempotent repair creation, then show a small readiness state if buyer/seller/payout capabilities need attention.
- Do not show raw profile IDs, provider IDs, merge IDs, Supabase IDs, or role names to customers.
- Do not show a seller setup blocker while the user is only browsing, buying, or viewing buyer order history.
- Do not hide buyer order history when seller status is restricted; show a seller-only restriction message inside seller surfaces.
- Payout setup should appear only in seller/payout surfaces and should not be presented as a general marketplace account error.
- Admin/operator state should never appear in customer account UI unless the user is inside an admin route.

Recommended account status display:

| Surface | Primary UX state | Secondary detail |
| --- | --- | --- |
| Marketplace browse | No account banner unless checkout is started or account is blocked. | Optional sign-in prompt for checkout-only actions. |
| Listing detail | `Buy available`, `Sign in to checkout`, or blocked reason. | Seller setup and payout status are hidden. |
| Checkout | Buyer readiness, address readiness, Pending Payment Order status. | Seller/payout status hidden. |
| Seller dashboard | Seller terms, submission ability, payout readiness. | Buyer restrictions only shown if they block a shared risk rule. |
| Customer Bag Marketplace tab | Purchases, submissions, active listings, sold items, payout summary. | Gacha rewards stay in their own tab. |

## Account State UI And Copy Rules

Use precise state copy instead of generic errors:

- `buyer_status = active`: show normal checkout controls.
- `buyer_status = restricted`: disable checkout and show the exact product-safe reason from the API.
- `buyer_status = blocked`: show a support-oriented blocked message and hide payment-proof/payment controls.
- `seller_status = pending_terms`: show terms acceptance as the next step in seller dashboard only.
- `seller_status = active`: enable seller submission entry points if feature flags allow them.
- `seller_status = restricted` or `blocked`: keep seller history visible, but disable new submission/listing actions.
- `payout_status = not_started`: show payout setup as optional until payout release requires it.
- `payout_status = on_hold` or `blocked`: show payout-specific guidance; do not imply checkout or buyer history is blocked.

Copy guardrails:

- Use `Marketplace account`, `seller status`, `buyer checkout`, and `payout setup` for marketplace states.
- Do not use `wallet`, `coin balance`, `reward sell`, or `sell for coins` in marketplace account UI.
- Customer Bag copy must say `Gacha Rewards` for pack rewards and `Marketplace` for marketplace activity.
- If the account bridge is temporarily unavailable, sensitive actions fail closed with a calm retry/support message; public browse can stay readable when allowed.

## YNOTT Identity Adapter

The bridge needs a YNOTT identity adapter behind its implementation.

It should read from current YNOTT modules instead of duplicating login logic:

- `resolveCurrentProfile` for customer profile resolution.
- `resolveAdminSession` for admin/operator capability.
- `profiles.profile_status` for active/disabled/merged checks.
- `user_identities` only for safe display/identity-management views, not for marketplace auth decisions.
- `account_merge_requests` only to understand identity-review state if needed later.

Marketplace must not implement its own email/Google/LINE merge rules. YNOTT identity review remains authoritative.

## Marketplace Supabase Adapter

The bridge needs a Marketplace Supabase adapter behind its implementation.

It should own:

- Reading `marketplace_accounts` by `ynot_profile_id`.
- Idempotent account creation.
- Snapshot refresh.
- Buyer/seller/payout status updates.
- Account bridge audit events.
- Duplicate-account conflict handling.

For MVP, this adapter should run server-side only with Marketplace Supabase credentials stored in Cloudflare secrets.

## Backend Module Contract

The account bridge should use a small backend Module stack:

```text
Next.js route handler or Marketplace Worker route handler
  -> Marketplace Account Bridge
      -> YNOTT Identity Adapter
      -> Marketplace Account Repository
      -> Marketplace Account RPC Adapter
      -> Marketplace Account Event Adapter
```

Responsibilities:

- Route handlers own HTTP method, input parsing, same-origin checks, rate limits, and response shape. In deployed MVP, Website route handlers call the Marketplace Worker/backend rather than owning Marketplace Supabase credentials directly.
- Marketplace Account Bridge owns product-level identity rules and account capability decisions.
- Repository/Adapter owns Marketplace Supabase reads and RPC calls.
- RPCs own transaction-safe account upsert, status transitions, and event writes.

Do not let route handlers call `marketplace_accounts` directly for writes. The deletion test should be clear: if the bridge is deleted, duplicate account prevention, status checks, and audit writes should not scatter across every checkout, seller, payout, and admin route.

## API Route Contract

MVP route surface:

| Method | Route | Purpose | Auth | Mutates |
| --- | --- | --- | --- | --- |
| `GET` | `/api/marketplace/account/me` | Resolve current marketplace viewer and capabilities | YNOTT profile required | no |
| `POST` | `/api/marketplace/account/ensure` | Idempotently create or refresh current account | YNOTT profile required | yes |
| `PATCH` | `/api/marketplace/account/seller-terms` | Accept seller terms for the current account | YNOTT profile + verified anchor | yes |
| `GET` | `/api/marketplace/account/activity-summary` | Summary counts for Customer Bag Marketplace section | YNOTT profile required | no |
| `PATCH` | `/api/marketplace/admin/accounts/:marketplaceAccountId/status` | Owner/admin account status change | YNOTT admin required | yes |

Request pipeline for mutating routes:

1. Reject missing Marketplace Supabase configuration.
2. Enforce same-origin mutation check.
3. Resolve current YNOTT profile server-side.
4. Apply route-specific rate limit with profile/admin subject.
5. Validate body with strict allowlist fields.
6. Reject any body fields named like `ynot_profile_id`, `buyer_id`, `seller_id`, `admin_id`, `payout_status`, or trusted status values.
7. Call Marketplace Account Bridge.
8. Return normalized error codes and no sensitive internal IDs except the caller's own marketplace account ID where needed.

Response shape:

```json
{
  "viewer": {
    "marketplaceAccountId": "uuid",
    "buyerStatus": "active",
    "sellerStatus": "none",
    "payoutStatus": "not_started",
    "capabilities": {
      "canCheckout": true,
      "canSubmitSellerItem": false,
      "canViewPayout": false
    }
  }
}
```

Admin account status responses should include the target status and audit event ID, but should not include provider identity, payout destination, or raw profile merge details.

## Marketplace Account Database Contract

Recommended Marketplace Supabase schema objects:

```text
marketplace_accounts
marketplace_account_events
marketplace_account_idempotency_keys
```

`marketplace_accounts` columns:

- `id uuid primary key`.
- `ynot_profile_id uuid not null`.
- `profile_status_snapshot text not null`.
- `display_name_snapshot text`.
- `avatar_url_snapshot text`.
- `auth_source_snapshot text not null`.
- `buyer_status text not null default 'active'`.
- `seller_status text not null default 'none'`.
- `payout_status text not null default 'not_started'`.
- `seller_terms_version text`.
- `seller_terms_accepted_at timestamptz`.
- `buyer_terms_version text`.
- `buyer_terms_accepted_at timestamptz`.
- `last_profile_verified_at timestamptz`.
- `last_seen_at timestamptz not null default now()`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.
- `metadata jsonb not null default '{}'::jsonb`.

Constraints and indexes:

- Unique index on `ynot_profile_id`.
- Check constraints for `buyer_status`, `seller_status`, and `payout_status`.
- Check constraint that seller terms timestamp is present when seller status moves past `pending_terms`.
- B-tree indexes on `buyer_status`, `seller_status`, `payout_status`, and `last_profile_verified_at`.
- Optional partial index on accounts needing profile refresh where `last_profile_verified_at < now() - interval '15 minutes'`.

`marketplace_account_events` columns:

- `id uuid primary key`.
- `marketplace_account_id uuid not null`.
- `ynot_profile_id uuid not null`.
- `actor_ynot_profile_id uuid`.
- `actor_admin_id uuid`.
- `actor_admin_role_snapshot text`.
- `event_type text not null`.
- `from_status text`.
- `to_status text`.
- `request_id text`.
- `idempotency_key text`.
- `metadata jsonb not null default '{}'::jsonb`.
- `created_at timestamptz not null default now()`.

Event indexes:

- `(marketplace_account_id, created_at desc)`.
- `(ynot_profile_id, created_at desc)`.
- Unique partial index on `(marketplace_account_id, idempotency_key)` where `idempotency_key is not null`.

Supabase security:

- Enable RLS on all marketplace account tables even if writes are server-only.
- Browser clients should not receive Marketplace Supabase credentials for account mutations.
- If tables are in an exposed schema, revoke direct mutation grants from `anon` and `authenticated`; route all mutations through server routes.
- RPCs that are intended for server-only use should revoke execute from `public`, `anon`, and `authenticated`, then grant only to the Marketplace backend service role.
- If any RPC uses `security definer`, set a fixed `search_path`, keep the function minimal, validate all actor inputs inside the function, and keep it non-browser-callable.

## Marketplace Account RPC Contract

Use RPCs for transitions that need transaction safety.

### `marketplace_get_or_create_account`

Purpose:

- Idempotently create or refresh account on first marketplace action.
- Prevent duplicate accounts during concurrent first-touch requests.
- Write account event for first creation.

Input:

- `p_ynot_profile_id uuid`
- `p_profile_status text`
- `p_display_name text`
- `p_avatar_url text`
- `p_auth_source text`
- `p_request_id text`
- `p_idempotency_key text default null`

Output:

- Account row snapshot.
- `created boolean`.
- `event_id uuid`.

Implementation rules:

- Single transaction.
- `insert ... on conflict (ynot_profile_id) do update`.
- Update `last_seen_at` every call.
- Update profile snapshot only from server-trusted adapter input.
- Never accept buyer/seller/payout status from the browser path.
- Return existing row on idempotent replay.

### `marketplace_accept_seller_terms`

Purpose:

- Move current account to seller terms accepted state.
- Write audit event with terms version.

Input:

- `p_marketplace_account_id uuid`
- `p_ynot_profile_id uuid`
- `p_terms_version text`
- `p_request_id text`
- `p_idempotency_key text`

Rules:

- Verify account `ynot_profile_id` matches input profile ID.
- Reject blocked buyer/seller account states.
- Use unique idempotency key to avoid duplicate terms events.
- Return current seller status and accepted timestamp.

### `marketplace_admin_update_account_status`

Purpose:

- Let admin/owner update buyer, seller, or payout status.

Input:

- `p_actor_admin_id uuid`
- `p_actor_ynot_profile_id uuid`
- `p_actor_role text`
- `p_marketplace_account_id uuid`
- `p_status_kind text`
- `p_new_status text`
- `p_reason text`
- `p_request_id text`
- `p_idempotency_key text`

Rules:

- Route handler must verify current admin role before calling the RPC.
- RPC should still validate allowed role/status combinations as defense in depth.
- `payout_status` changes to `verified`, `on_hold`, or `blocked` require admin or owner policy; payout release itself belongs to the payout Module, not account bridge.
- Every status change writes an account event with before/after state.

## Backend Error Contract

Normalize bridge failures into stable errors:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_auth_required` | 401 | No current YNOTT profile |
| `marketplace_profile_inactive` | 403 | YNOTT profile is disabled, merged, or not actionable |
| `marketplace_account_blocked` | 403 | Buyer/seller/payout status blocks the requested action |
| `marketplace_account_conflict` | 409 | Unique/account state conflict requiring retry |
| `marketplace_invalid_request` | 400 | Body contains forbidden or malformed fields |
| `marketplace_rate_limited` | 429 | Rate limit exceeded |
| `marketplace_account_unavailable` | 503 | Marketplace Supabase or YNOTT identity adapter unavailable |

Routes should log internal error details with `request_id`, but responses should not leak Supabase error messages, provider IDs, service-role details, or merge-review internals.

## Account Creation Rules

Marketplace account creation must be idempotent.

Creation paths:

- Normal path: new YNOTT profile creation or profile sync creates or syncs a Marketplace Account row through a server-only bridge call.
- Backfill path: existing YNOTT profiles get a one-time Marketplace Supabase backfill before owner-only marketplace testing.
- Repair path: authenticated marketplace actions may call `ensure` only when the expected Marketplace Account row is missing.
- Public browse path: public browse must not call account creation.
- Concurrency path: all account creation and repair must be idempotent by `ynot_profile_id`.

Recommended implementation:

- Use one database RPC or transaction in Marketplace Supabase.
- Upsert by unique `ynot_profile_id`.
- Return the existing row on duplicate conflict.
- Update `last_seen_at`.
- Refresh display snapshot only from trusted YNOTT profile data.
- Write `marketplace_account_events` for first creation and important status changes.

Avoid a read-then-insert flow in JavaScript without a unique constraint, because profile creation/backfill and repair-path ensure calls can run concurrently.

## Cross-Database Rules

The two databases do not share foreign keys.

Allowed references stored in Marketplace Supabase:

- `ynot_profile_id`
- `ynot_admin_profile_id`
- `ynot_admin_role_snapshot`
- safe display name snapshot
- safe avatar URL snapshot
- safe card/variant reference IDs in other marketplace tables

Blocked references:

- Raw browser-submitted `profile_id`.
- YNOTT session cookie copied into Marketplace Supabase.
- YNOTT wallet or coin balance copied into marketplace account.
- Gacha reward ownership copied into marketplace account.
- YNOTT provider subject values exposed to public marketplace rows.

## Security Seam

Marketplace identity is trusted only after these steps:

1. Website resolves YNOTT session server-side.
2. Profile is active.
3. Marketplace Account Bridge maps the profile to `marketplace_accounts`.
4. Marketplace action uses marketplace account ID from the bridge.

Security rules:

- Account and bridge routes are HTTPS-only in production. HTTP traffic must redirect or fail closed, session cookies must remain `Secure`, and bridge responses must not depend on mixed-content assets.
- Reject unauthenticated marketplace money and seller actions.
- Reject any request body that tries to set `ynot_profile_id`, buyer ID, seller ID, admin ID, or payout status.
- Use same-origin mutation checks and the current YNOTT CSRF/session-cookie protection pattern for browser-initiated marketplace mutations.
- Enforce RBAC from the existing YNOTT profile/admin resolver: buyer, seller, admin, operator, and owner capabilities are derived server-side and never from marketplace request bodies.
- Marketplace Account Bridge does not store or hash passwords. Existing YNOTT/Supabase Auth owns password hashing, password reset, login throttling, and primary session issuance.
- Validate bridge and onboarding inputs with schema allowlists. Unknown fields, malformed payloads, caller-supplied actor IDs, and caller-supplied role/capability flags fail closed.
- Database reads and writes use Supabase query builders, parameterized RPCs, or prepared statements only. No account bridge path may concatenate browser input into SQL.
- Marketplace follows the YNOTT session expiry and idle-timeout policy. Seller activation, payout setup, owner/admin impersonation checks, and account suspension changes require a fresh session check when stale.
- Rate-limit account creation, seller onboarding, checkout, payout setup, and admin mutation paths.
- Do not expose Marketplace Supabase service-role credentials to the browser.
- Do not expose provider subjects, internal profile IDs, merge request IDs, or payout-sensitive data in public responses.
- Use admin role from YNOTT `admin_users`, not marketplace profile metadata.
- Log bridge decisions that change access: created, seller terms accepted, seller activated, seller suspended, payout verified, payout blocked, buyer blocked.
- Session cookies must stay `HttpOnly`, `Secure`, and `SameSite` according to the current YNOTT auth policy; marketplace code must not copy session tokens into `localStorage`, query strings, or Marketplace Supabase.
- The Website-to-Marketplace internal context should include expiry and request hash/signature or service-binding trust. Marketplace rejects expired, unsigned, over-scoped, or replayed identity contexts.
- Account-bridge logs must store stable actor/account IDs and decision codes only; do not log provider subjects, raw cookies, bearer tokens, LINE user IDs, or payout readiness evidence.

Security architecture and performance impact:

- Reuse the existing YNOTT login/session as the only primary identity system. This avoids a second credential store, password hash lifecycle, reset flow, and cross-account linking failure mode.
- Resolve YNOTT profile and Marketplace Account once per server request, then pass a minimal actor context to downstream marketplace modules. Do not make each module refetch the full profile unless the session changes.
- Cache bridge resolution only inside the request scope. Cross-request caching of account capability, seller status, or admin role is not allowed because suspension, role change, or session expiry must take effect quickly.
- Make account ensure/backfill idempotent with a unique `ynot_profile_id` index so first marketplace action and sign-up sync stay fast under retries.
- Require fresh session checks only for sensitive account transitions such as seller activation, payout setup, suspension, and owner/admin capability checks. Normal reads should use current session validation and indexed account state.

## Internal Call Shape

MVP should target a separate Marketplace Worker/service boundary while keeping the bridge Interface small enough for local development to run in one runtime.

When Marketplace runs as a separate Cloudflare Worker:

- Website remains responsible for resolving YNOTT profile.
- Website calls Marketplace Worker through an internal Cloudflare binding or server-only signed context.
- The context should include only the minimum: `ynot_profile_id`, display snapshot, auth source, admin role when needed, request ID, expiry, and signature/binding trust.
- Marketplace Worker still revalidates active profile for privileged actions through the YNOTT identity adapter.
- Browser cookies should not be treated as marketplace credentials by the Marketplace Worker.

## Performance Plan

- Cache `resolveCurrentProfile` only per request as the current code already does through React cache.
- Do not call YNOTT core on public marketplace browse.
- Create/sync marketplace account rows when YNOTT profiles are created or backfilled, then read by indexed `ynot_profile_id`. Authenticated action-time ensure is only a repair path.
- Revalidate YNOTT profile status on sensitive actions: checkout, seller submission, listing publish, payout setup, payout release, admin mutation.
- Use a short `last_profile_verified_at` window for low-risk reads such as marketplace account dashboard.
- Keep profile snapshots small: display name, avatar URL, profile status, auth source.
- Avoid joining YNOTT and Marketplace Supabase for customer bag render. Fetch YNOTT Customer Bag and Marketplace account/activity separately, then compose one UI model.
- Index Marketplace Supabase on `ynot_profile_id`, `buyer_status`, `seller_status`, `payout_status`, and `last_profile_verified_at`.

## Customer Bag Connection

Customer Bag remains the customer-facing home for gacha rewards.

Marketplace account data can appear in the same customer area, but only through a separate Marketplace section/tab:

- `Gacha Rewards`: YNOTT core rewards from pack opening. No sell action.
- `Marketplace`: marketplace purchases, seller submissions, active listings, sold items, payout status.

The bridge provides the marketplace account identity for the Marketplace tab. It does not make gacha rewards sellable.

Customer Bag UX rules:

- Use tabs or segmented navigation with `Gacha Rewards` and `Marketplace` as peer sections, not nested cards inside cards.
- Keep reward actions inside `Gacha Rewards`: ship, convert, view reward detail.
- Keep marketplace actions inside `Marketplace`: view purchases, pending payment orders, seller submissions, listings, sold items, payout status.
- A zero-state Marketplace tab should say the user has no marketplace activity yet and point to official shop/browse when public launch allows it.
- A zero-state Gacha Rewards tab should not mention marketplace selling.
- On mobile, the two sections should remain a stable two-option control near the top of the customer area so users do not confuse reward conversion with marketplace selling.
- Counts should be small badges: active orders, active submissions, active listings, payout attention.

## Identity Merge Behavior

YNOTT identity merge rules stay authoritative.

Marketplace must not:

- Merge profiles.
- Move wallet rows.
- Move gacha rewards.
- Move marketplace orders from one YNOTT profile to another without a separate approved support process.
- Decide that two provider identities belong to the same customer.

If YNOTT identity review later changes which profile owns a login method, marketplace behavior should be:

- Existing marketplace records remain attached to the original `ynot_profile_id` until a deliberate support/admin migration exists.
- Customer support can see bridge/audit evidence.
- No automatic transfer of orders, payouts, listings, or seller status in MVP.

This is conservative, but it avoids accidentally moving real-money records.

## Admin And Operator Model

Admin/operator capability comes from current YNOTT admin resolution:

- `resolveAdminSession`
- `admin_users.role`
- `admin_users.is_active`

Marketplace can store admin snapshots in audit rows, but those snapshots do not grant access.

Admin marketplace actions should record:

- actor YNOTT profile ID
- actor marketplace account ID if one exists
- actor admin role snapshot
- target marketplace account ID
- action name
- status from/to
- request ID
- metadata with safe redaction
- created timestamp

## Failure Modes

### Duplicate Marketplace Account

Cause: concurrent first-touch writes without unique `ynot_profile_id`.

Prevention:

- Unique database constraint.
- Upsert/RPC.
- Idempotency key where useful.
- Verification test for concurrent account creation.

### Spoofed Profile ID

Cause: route trusts browser-submitted profile ID.

Prevention:

- Bridge accepts only server-resolved session context.
- Static verification rejects `ynot_profile_id` use from request body.
- Route tests cover forged profile IDs.

### Disabled Profile Still Uses Marketplace

Cause: marketplace account row remains active after YNOTT profile disabled/merged.

Prevention:

- Revalidate profile status on sensitive actions.
- Store `last_profile_verified_at`.
- Add reconciliation job for stale marketplace accounts.

### Identity Merge Confuses Money Records

Cause: marketplace treats YNOTT identity review as account migration.

Prevention:

- MVP does not auto-migrate marketplace money records.
- Marketplace audit shows original YNOTT profile reference.
- Future migration requires separate admin/support plan.

### Admin Role Drift

Cause: marketplace stores admin role snapshot and later trusts it.

Prevention:

- Access checks always call YNOTT admin resolver.
- Snapshot is only for audit display.

## Implementation Sequence

1. Keep this doc and doc 00 as the source for identity bridge rules.
2. Create Marketplace Supabase schema plan for `marketplace_accounts` and account events.
3. Add `Website/src/lib/marketplace/account-bridge.ts` as a server-only module.
4. Add Marketplace Supabase adapter with idempotent get-or-create.
5. Add YNOTT identity adapter that wraps existing profile/admin resolution.
6. Add route handler for current marketplace account read, for example `Website/src/app/api/marketplace/account/route.ts`.
7. Update marketplace page to resolve marketplace viewer through the bridge when needed.
8. Add seller terms/status flow through the bridge.
9. Add admin/operator bridge checks for marketplace admin queues.
10. Add static and runtime verification scripts.
11. Add rollout gates for Marketplace Supabase secrets, migrations, backup/restore evidence, and Cloudflare binding/env setup.

## Verification Plan

Add a future verification script:

```text
Website/tools/verification/verify-marketplace-identity-bridge.mjs
```

It should check:

- Marketplace has no separate login route.
- Marketplace has no Supabase Auth client for customer login.
- Marketplace bridge imports `resolveCurrentProfile`.
- Marketplace account creation never reads `ynot_profile_id` from request body.
- `marketplace_accounts.ynot_profile_id` is unique.
- Unauthenticated account read/action returns 401 or redirects to login.
- Authenticated profile creates one marketplace account.
- Two concurrent first-touch calls return one account row.
- Disabled YNOTT profile cannot create checkout, seller submission, or payout action.
- Seller and buyer statuses live on the same marketplace account row.
- Admin marketplace mutation uses YNOTT admin role resolver.
- Marketplace public responses do not expose provider subject, merge request ID, or internal payout details.
- Account UI surfaces show buyer/seller/payout states separately and do not collapse them into one generic account status.
- Customer Bag Marketplace tab renders independently from Gacha Rewards and does not show reward sell actions.
- Mobile account and Customer Bag views keep the Marketplace/Gacha distinction visible without horizontal overflow.

Also extend existing auth verification where useful:

- `Website/tools/verification/verify-auth-foundation.mjs`
- `Website/tools/verification/verify-platform-foundation.mjs`

## Acceptance Criteria

- A customer logs in once and can enter marketplace without second auth.
- A customer with email/Google/LINE linked to the same YNOTT profile gets the same marketplace account.
- Buyer and seller modes are on one marketplace account.
- Browser-submitted profile IDs are ignored or rejected.
- Gacha rewards cannot become marketplace account inventory.
- Existing YNOTT identity review remains authoritative.
- Admin marketplace actions are authorized by YNOTT admin role, not marketplace snapshots.
- Marketplace account records remain auditable even if YNOTT profile status changes.

## Rollback And Stop Rules

Stop implementation before production if:

- Marketplace Supabase cannot enforce unique `ynot_profile_id`.
- Marketplace routes require direct browser access to service-role credentials.
- Marketplace code creates a second auth/login path.
- Marketplace actions trust request-body profile IDs.
- Profile disabled/merged behavior is not tested.
- Marketplace migration backup/restore evidence is missing.

Rollback for MVP:

- Hide marketplace entry points.
- Disable marketplace account creation route.
- Keep existing YNOTT login/profile untouched.
- Leave already-created marketplace account rows for audit unless a deliberate cleanup migration is approved.

## Accepted Deep Design Decisions

- Refresh marketplace display name/avatar snapshots on login or authenticated marketplace account access, plus a nightly repair job.
- Run an explicit backfill job for existing YNOTT profiles before owner-only marketplace testing, and keep lazy authenticated repair as a safety path.
- Require seller terms before seller item submission.
- Do not auto-merge Marketplace Accounts if a later YNOTT identity review finds two profiles for one customer. Use an owner/admin-reviewed migration playbook after MVP.
