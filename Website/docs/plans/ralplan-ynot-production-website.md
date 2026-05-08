# RALPLAN Draft — YNot Production Website Architecture and System

## Context and grounded evidence

- Source requirements: `.omx/specs/deep-interview-html-full-website.md`.
- Current homepage is not production UI: `src/app/page.tsx:1-5` redirects `/` to `/ynot-wireframes.html`.
- Current metadata still calls the asset wireframes: `src/app/layout.tsx:15-18`.
- Current app is LIFF-first: `src/features/lucky-draw/state/useLuckyDrawController.ts:4,40,106-147` depends on `useLiffSession`; `src/app/api/line/session/route.ts:15-121` verifies a LINE ID token and mints a custom cookie; `src/lib/lucky-draw/session.ts:8-14,37-82` stores `lineUserId` in a signed cookie and admin state.
- Current customer order APIs require that LIFF/custom session: `src/app/api/lucky-draw/route.ts:101-109`; slot picking says LINE login is required at `src/app/api/lucky-draw/picks/route.ts:16-19`.
- Current Supabase service-role helper exists and must remain server-only: `src/lib/supabase/server.ts:1-20`; browser helper uses public keys only: `src/lib/supabase/client.ts:1-13`.
- Current manual slip flow has useful pieces: file constraints at `src/app/api/lucky-draw/route.ts:15-18`, slip upload at `src/app/api/lucky-draw/route.ts:165-176`, slip row creation/status at `src/app/api/lucky-draw/route.ts:182-194`, optional Slip2Go duplicate verification at `src/app/api/lucky-draw/route.ts:205-330`.
- Existing static smoke script exists at `tools/verification/verify-lucky-draw-plan.mjs`, but there is no unit/e2e test command in `package.json`.

## Official-doc constraints checked on 2026-05-06

- Supabase Auth SSR should use cookie-backed sessions via `@supabase/ssr`; session cookies must be available server/client, and authenticated routes must avoid unsafe caching.
- Supabase identity linking supports automatic same-verified-email linking and manual `linkIdentity()`; manual linking is beta and must be enabled.
- Google is a built-in Supabase OAuth provider; OAuth redirects must return to a Next callback route that exchanges the code for a cookie session.
- LINE should be planned as a Supabase custom OAuth/OIDC provider if possible; otherwise keep a server-side LINE OAuth/ID-token verification flow that links to the canonical Supabase user.
- Supabase RLS and Storage policies must guard user/admin data and private slip uploads; service-role keys stay server-only.
- Next.js App Router pages/layouts are Server Components by default; use Client Components only for interactive islands; every Server Action/Route Handler must verify auth/authorization.

## RALPLAN-DR summary

### Principles

1. **Normal web account first, LINE optional**: Supabase Auth becomes the canonical auth/session layer; LINE is an optional linked identity, never a gate for website usage.
2. **Production domain model, not wireframe wrapper**: the HTML is a visual/product reference; production pages are App Router routes and tested components, not a redirect to static HTML.
3. **All buttons resolve to a state transition**: every visible button either navigates, submits a validated mutation, opens a modal/drawer, or is explicitly disabled with reason text.
4. **Server authority for money, inventory, randomization, and admin**: coins, slips, prize assignment, shipping, exchange, and admin actions must be validated server-side with audit records.
5. **RLS plus server validation**: RLS protects tables/storage; Route Handlers/Server Functions still check auth/authorization before every mutation.

### Decision drivers

1. **Production safety**: payments, inventory, gacha results, identity linking, and admin actions are fraud-sensitive.
2. **Scope completeness**: all 10 wireframe pages plus all admin feature management must work in first production release.
3. **Migration clarity**: existing LIFF/custom-session code must be replaced or isolated without breaking useful Supabase/slip/admin patterns.

### Viable options

#### Option A — Recommended: Supabase Auth App Router rebuild with domain modules

Build a production Next.js App Router app around Supabase Auth (`@supabase/ssr`), normal route groups, domain-specific server actions/route handlers, RLS policies, and feature modules generated from the YNot wireframe concepts.

Pros:
- Directly satisfies non-LIFF-first requirement.
- Enables email/password, Google, and optional LINE identity linking through Supabase Auth/custom OAuth/OIDC.
- Cleanest path to test every route/button and enforce server-side invariants.
- Keeps useful existing pieces: Supabase helpers, slip handling ideas, admin role checks, realtime event pattern.

Cons:
- Largest up-front migration.
- Requires schema migration and new tests before feature parity.
- LINE custom provider and account-merge UX need careful handling.

#### Option B — Incremental retrofit of current Lucky Draw feature modules

Re-enable `LuckyDrawShell`, replace LIFF session calls with Supabase Auth, and expand existing views to match the YNot 10-page system.

Pros:
- Reuses much of `src/features/lucky-draw/*` and current admin APIs.
- Faster for existing order/slip/pick flows.

Cons:
- Current view model is not aligned with 10 YNot pages.
- Higher slop risk: old LINE naming, localStorage fallback, and single-draw mental model leak into production.
- Harder to prove every button/page is correct because old shell was designed for a narrower app.

#### Option C — Static HTML enhancement first, backend later

Keep `/ynot-wireframes.html` as the base UI and add backend endpoints gradually.

Pros:
- Fastest visual match.
- Low component-conversion work initially.

Cons:
- Fails production-ready requirement.
- Hard to test, maintain, secure, and type against Next/Supabase boundaries.
- Static bundle cannot become reliable admin/payment/inventory system.

### Recommended decision

Choose **Option A**, while harvesting safe pieces from Option B. Reject Option C for production. Keep the static HTML only as a design-reference artifact and temporary visual oracle.

### Deliberate pre-mortem

1. **Identity merge failure**: a user creates separate email/Google/LINE accounts, losing wallet/collection continuity. Mitigation: canonical `profiles.auth_user_id`, Supabase identity linking, linking UX in Profile, duplicate-email guardrails, admin account-merge audit tool.
2. **Money/inventory inconsistency**: a slip approval credits coins twice or gacha open spends coins without assigning unique prizes atomically. Mitigation: transaction/RPC boundaries, idempotency keys, ledger tables, unique constraints, audit events, no client-side coin/prize authority.
3. **Button completeness illusion**: pages render but buttons silently no-op. Mitigation: button inventory checklist per page, Playwright e2e covering every CTA state, disabled states with reason text, route/action smoke tests.
4. **RLS/storage leak**: payment slips, shipping addresses, identity links, or admin data become readable by the wrong user. Mitigation: RLS matrix tests, private buckets, signed admin-only slip URLs, service-role-only server routes, no raw sensitive realtime subscriptions.
5. **Admin bootstrap or privilege escalation failure**: no owner can access admin, or staff can grant themselves owner rights. Mitigation: explicit owner seed/bootstrap script, immutable owner role guardrails, admin role transition policies, audit events, and non-admin route/mutation denial tests.
6. **Provider callback misconfiguration**: Google/LINE redirects succeed locally but fail in production, or LINE lacks email scope. Mitigation: env/config checklist, callback smoke tests, LINE custom-provider viability gate, server-side state/nonce verification, and fallback LINE linking route.
7. **Seed data gaps block e2e**: all pages exist but test journeys cannot run because campaigns/payment methods/prizes/admin user are missing. Mitigation: deterministic seed/reset scripts for demo campaign, admin owner, payment methods, coin packages, prize inventory, and test users.
8. **PII/shipping privacy breach**: address/contact data leaks in ranking, admin exports, logs, or client bundles. Mitigation: PII minimization, redacted logs, server-only admin access, privacy-safe public profiles/rankings, and tests for address visibility.
9. **Gacha fairness/audit dispute**: user disputes random result or inventory depletion. Mitigation: server-side deterministic audit trail, odds snapshot per open, inventory reservation records, visible rates, and admin audit view.
10. **Full-scope delivery failure**: breadth causes partially working pages. Mitigation: internal delivery gates by phase, no user-visible deferrals, button-map tests as shutdown criteria, and status docs after each slice.

### Expanded executable test plan

Add test tooling and scripts before claiming production readiness:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "supabase db reset && vitest run tests/db tests/integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "seed:e2e": "tsx tools/verification/seed-ynot-e2e.ts",
    "verify:ynot": "node tools/verification/verify-ynot-production-plan.mjs",
    "check": "npm run lint && npx tsc --noEmit --pretty false && npm run test && npm run build && npm run verify:ynot"
  }
}
```

Recommended dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`, `tsx`, and Supabase CLI for DB/RLS reset tests.

- **Unit (`npm run test`)**: auth linking validators, coin ledger math, top-up approval idempotency, gacha draw validators, exchange/shipping permissions, admin role guards, button-state maps.
- **Integration (`npm run test:db`)**: migrations apply cleanly; RLS policy matrix; Route Handler/Server Action tests for auth callback/linking, top-up upload, admin approval/reject, campaign CRUD, gacha open transaction, exchange, shipping, ranking snapshots. Use seeded users: anon, customer_email, customer_google, customer_line_linked, staff, admin, owner.
- **E2E (`npm run test:e2e`)**: Playwright customer journey with email-only account; mocked Google OAuth callback; optional LINE linking callback using mocked provider response; wallet top-up; admin approval; detail/open/collection/exchange/shipping/profile/ranking; admin journey for every module.
- **Button coverage (`npm run test:e2e -- --grep @button-map`)**: click or assert disabled-runtime-reason for every customer and admin button/control in `tools/fixtures/button-map.json`.
- **Observability checks**: assert `audit_events` are written for auth link, top-up approval/rejection, gacha open, exchange, shipping status, admin role changes, settings updates; assert logs redact PII and secrets.
- **CI/pass thresholds**: lint, typecheck, unit, integration, build, static verification, and e2e must all pass; no known console errors in Playwright smoke; zero admin-access bypasses; zero RLS matrix failures.

## Architecture plan

### 1. Route and information architecture

Use App Router route groups and preserve a clear customer/admin split:

```text
src/app/
  (store)/page.tsx                         # 01 home/feed
  (store)/gacha/[campaignId]/page.tsx      # 02 detail
  (store)/gacha/[campaignId]/open/page.tsx # 03 open flow
  (store)/collection/page.tsx              # 04 collection
  (store)/ranking/page.tsx                 # 05 ranking
  (store)/exchange/page.tsx                # 06 exchange
  (store)/shipping/page.tsx                # 07 shipping
  (store)/wallet/page.tsx                  # 08 wallet
  (store)/profile/page.tsx                 # 09 profile
  (auth)/login/page.tsx                    # 10 onboarding/login/signup
  (auth)/signup/page.tsx
  auth/callback/route.ts
  auth/link/line/route.ts or OAuth callback if custom provider chosen
  admin/page.tsx
  admin/users/page.tsx
  admin/top-ups/page.tsx
  admin/campaigns/page.tsx
  admin/prizes/page.tsx
  admin/exchange/page.tsx
  admin/shipping/page.tsx
  admin/rankings/page.tsx
  admin/settings/page.tsx                 # payment methods, QR, feature flags, site settings
  admin/audit/page.tsx                    # audit log and operational event review
  api/... route handlers only where an external/upload/realtime boundary needs them
```

Page ownership:
- Server Components load initial route data and auth state.
- Client islands own animation, filters, forms, optimistic UI, and modal interactions only.
- Shared layout/nav lives under `src/features/ynot/shell/*`.

### 2. Auth and account architecture

Adopt Supabase Auth as canonical identity/session.

Required packages/config:
- Add `@supabase/ssr` for cookie-backed sessions.
- Keep `@supabase/supabase-js`.
- Add Supabase Auth providers/config:
  - Email/password enabled.
  - Google provider enabled.
  - LINE decision gate: default to Supabase Custom OAuth/OIDC provider if LINE can satisfy Supabase custom-provider requirements in this project (OIDC discovery/JWKS/provider email behavior). If not viable, implement a server-side LINE Login OAuth callback that verifies `state`, exchanges code, verifies the ID token with LINE, and links the LINE `sub` to the canonical Supabase user/profile.

Core files:

```text
src/lib/supabase/browser.ts
src/lib/supabase/server.ts
src/proxy.ts                         # Next 16 Proxy file-convention entrypoint for Supabase cookie refresh/auth routing
src/lib/supabase/proxy.ts            # shared helper imported by src/proxy.ts
src/lib/auth/session.ts
src/lib/auth/actions.ts
src/lib/auth/identity-linking.ts
src/app/auth/callback/route.ts
src/features/auth/AuthForm.tsx
```

Data model:
- `profiles`: one row per Supabase `auth.users.id`; contains display/contact fields, default locale, role-safe public user data.
- `user_identities`: optional app-level mirror of linked providers (`auth_user_id`, `provider`, `provider_subject`, `email`, `linked_at`, `last_seen_at`) for admin/search/audit. Supabase Auth remains the source for login.
- `admin_users`: reference canonical `profile_id` or `auth_user_id`, not LINE user ID.

Rules:
- Replace `lineVerified` with `viewer.authenticated` and `viewer.linkedProviders`.
- Profile page includes “Connect LINE” and “Connect Google” status, but never blocks normal use.
- Account merge cases are explicit acceptance criteria: same verified email may auto-link when Supabase supports it; logged-in manual `linkIdentity()` is required for different-email provider linking; conflicting verified emails require admin-reviewed merge/account recovery and audit events.
- Do not auto-merge accounts with conflicting verified emails without explicit logged-in link flow or admin-reviewed merge.
- Use `getUser()`/claims server-side rather than trusting client cookies; never put service-role or admin decisions in client state alone.

### 3. Domain schema and server authority

Use a production schema with clear invariants:

- `profiles`
- `admin_users`
- `gacha_campaigns`
- `gacha_prizes`
- `gacha_slots` / `campaign_inventory`
- `coin_ledger`
- `top_up_requests`
- `payment_slips`
- `user_addresses`
- `payment_methods`
- `site_settings`
- `idempotency_keys` or unique idempotency columns for top-up/open actions
- `gacha_opens`
- `collection_items`
- `exchange_orders`
- `shipping_requests`
- `ranking_snapshots` or materialized view
- `audit_events`
- `realtime_events`

Critical invariants:
- Coin balance is derived from `coin_ledger`, not editable profile fields.
- Top-up approval is idempotent: one top-up request can credit coins once, enforced by unique ledger references and/or `idempotency_keys`.
- Gacha open transaction atomically reserves inventory, debits coins, creates `gacha_opens`, and creates `collection_items`, enforced by idempotency key plus unique inventory reservation constraints.
- Wallet and campaign pages depend on admin-configured `payment_methods`, `site_settings`, and live campaigns; minimum admin/settings must be implemented before customer wallet/campaign flows are considered complete.
- Exchange/shipping transitions only affect owned collection items.
- Admin mutations write `audit_events`.

Implementation preference:
- Use Postgres functions/RPC for atomic high-risk operations:
  - `approve_top_up(top_up_id, admin_id)`
  - `reject_top_up(top_up_id, admin_id, reason)`
  - `open_gacha(campaign_id, quantity, user_id, idempotency_key)`
  - `request_shipping(collection_item_ids, address_id, user_id)`
  - `exchange_collection_items(collection_item_ids, target, user_id)`
- Route Handlers/Server Actions validate inputs and call these functions.

### 4. Payment/slip architecture

First release is manual transfer/QR slip upload:

Customer flow:
1. User chooses coin package.
2. Website shows active bank/PromptPay/QR details.
3. User uploads slip.
4. `top_up_requests` + `payment_slips` created with `pending_review`/`manual_review`.
5. Admin approves/rejects.
6. Approval credits `coin_ledger` exactly once.

Keep optional Slip2Go as an assistant/verifier, not as required auto-approval unless explicitly enabled later. Production default should be admin confirmation because the user requested manual confirmation first.

Storage:
- Private `payment-slips` bucket.
- User uploads to path scoped by `auth.uid()`/top-up request ID.
- Admin reads via service-role route or signed URL generated server-side.
- Enforce file type/size limits from existing route, with virus/mime checks if feasible.

### 5. Page-by-page working button contract

Every page gets a `button-map` test fixture listing label, selector/test id, expected action, auth requirement, success evidence, and failure state.

#### 01 Home/feed
- Campaign card: navigates to `/gacha/[campaignId]`.
- Category filters/search: update URL/search state.
- Login/signup CTA: opens `/login` or `/signup`.
- Wallet/coin button: `/wallet`.
- Ranking: `/ranking`.

#### 02 Gacha detail
- Open now: if unauthenticated -> `/login?next=...`; if insufficient coins -> `/wallet`; if valid -> `/gacha/[id]/open`.
- Prize tier tabs/cards: filter/detail modal.
- Fairness/rate info: modal/drawer.
- Share/favorite/watch: each is fully implemented as a real first-release action: share copies/navigates via Web Share or clipboard fallback, favorite persists a watchlist item, and watch toggles campaign notifications/updates. Disabled only for true runtime constraints such as unauthenticated user or closed campaign.

#### 03 Cinematic open
- Confirm open: calls atomic open action with idempotency key.
- Mute/unmute: toggles audio state.
- Skip: jumps to reveal result.
- Reveal/continue: collection result then `/collection` or open again.

#### 04 Collection
- Filter/search/sort: updates list.
- Sell/exchange: opens exchange flow and submits server mutation.
- Ship physical card: starts shipping request.
- Share/showcase: fully implemented first-release actions: share uses Web Share/clipboard fallback and showcase creates/updates a public-safe showcase view. Disabled only for true runtime constraints such as private item, unauthenticated user, or unavailable browser capability with clipboard fallback attempted.

#### 05 Ranking
- Time range tabs: load ranking.
- Campaign/category filters: update ranking query.
- User row/card click: profile/collection-safe public view or disabled privacy state.

#### 06 Exchange
- Category tabs/search: filter exchange catalog.
- Select owned items: marks exchange basket.
- Confirm exchange: server mutation; updates collection/ledger.
- Sold-out/insufficient state: disabled with reason.

#### 07 Shipping
- Select cards: validates owned/eligible items.
- Address form: save/update address.
- Confirm shipping: creates shipping request.
- Cancel request: allowed only while pending.

#### 08 Wallet
- Package selection: amount summary.
- Show QR/bank details: displays active admin-configured payment method.
- Upload slip: creates top-up request.
- View history: loads top-up/ledger history.

#### 09 Profile
- Edit profile/contact/address: update profile tables.
- Connect LINE/Google: provider linking flow.
- Change password/email: Supabase auth flow.
- Logout: signs out current session.

#### 10 Onboarding/signup/login
- Email signup/login: Supabase email/password flow.
- Google login: Supabase OAuth.
- LINE login/connect: optional LINE OAuth/custom provider flow.
- Forgot password: Supabase recovery flow.

#### Admin pages
- Users: search, view identity links, roles, status, account merge review.
- Top-ups/slips: review slip, approve, reject, annotate, generate signed slip view.
- Campaigns: CRUD, publish/unpublish, set price, stock, status.
- Prizes/cards: CRUD, image upload, inventory, rarity/rate.
- Exchange: manage catalog/rates/orders.
- Shipping: status workflow, tracking, admin notes.
- Rankings: recalculate/publish snapshots, moderation.
- Settings: bank/QR/payment instructions, site flags, audit log.

Admin button-map acceptance must include, at minimum:
- Create/edit/archive user role; suspend/reactivate user; open account merge review.
- Approve/reject top-up; view signed slip; add admin note; mark duplicate.
- Create/edit/publish/unpublish campaign; clone campaign; update price/status.
- Create/edit/delete prize/card; upload image; adjust inventory/rate.
- Approve/reject exchange order; adjust exchange catalog/rates.
- Update shipping status; add tracking; cancel/refund eligible request.
- Recalculate/publish rankings; hide/moderate ranking entry.
- Update payment method, QR image, bank instructions, feature flags/site settings.

### 6. UI system

Convert wireframe sketch style into production UI tokens:
- Thai-first, English-ready copy system.
- Responsive mobile-first with desktop admin layouts.
- Components: `AppShell`, `BottomNav`, `TopNav`, `CampaignCard`, `PrizeCard`, `CoinBadge`, `StatusBadge`, `FormField`, `Modal`, `Drawer`, `Button`, `DataTable`, `AdminPanel`, `Uploader`, `Timeline`.
- Use test IDs for all buttons and core controls.
- Preserve YNot hand-drawn/sketch identity but ensure production accessibility: focus rings, contrast, keyboard navigation, reduced motion for cinematic opening.

### 7. Realtime and data refresh

- Keep an event-table pattern like current `lucky_draw_realtime_events`, but rename/generalize to `realtime_events`.
- Do not stream sensitive order/slip/account rows directly.
- Use events to trigger authenticated refetch.
- Scope subscriptions by public campaign or user/admin channel with RLS-safe data.

### 8. Migration and implementation phases

1. **Foundation branch**: add Supabase SSR auth clients, auth callback, route groups, layout shell, env contract.
2. **Schema migration**: profiles/admin/users/ledger/top-up/campaign/prize/collection/exchange/shipping/audit/realtime tables + RLS + RPCs.
3. **Admin/settings minimum**: owner/admin bootstrap, payment method settings, campaign seed/settings, role checks, audit baseline.
4. **Auth/onboarding/profile**: email/password, Google, optional LINE provider/linking, merged identity UI.
5. **Customer browsing**: home, detail, ranking with real data from admin-configured campaigns.
6. **Wallet/top-up/admin approval**: manual payment and coin ledger.
7. **Gacha open/collection**: atomic open, cinematic result, collection state.
8. **Exchange/shipping**: owned item operations.
9. **Admin full feature management**: all modules with audit and permissions.
10. **Button completeness/e2e hardening**: page/button inventory and tests.
11. **Production readiness**: build, lint, typecheck, security/static checks, browser smoke, seeded data, docs/status.

### 9. Files to create/change

Primary source changes:
- `src/app/page.tsx` — replace redirect with production home route.
- `src/app/layout.tsx` — production metadata/lang/theme providers.
- `src/app/(store)/**` — all 10 production customer pages.
- `src/app/(auth)/**`, `src/app/auth/callback/route.ts` — auth flows.
- `src/app/admin/**` — admin management pages.
- `src/features/ynot/**` — new product modules.
- `src/lib/auth/**` — auth/session/linking/admin helpers.
- `src/proxy.ts` — required Next 16 Proxy file-convention entrypoint at the `src` level for cookie refresh/auth routing.
- `src/lib/supabase/{browser,server,proxy}.ts` — SSR auth clients and shared helper logic imported by `src/proxy.ts`.
- `src/lib/domain/**` — campaign/top-up/gacha/collection/exchange/shipping service functions.
- `src/app/api/**` — keep only necessary upload/admin/external route handlers; remove LINE-only assumptions.
- `supabase/migrations/**` — schema, RLS, RPCs, storage policies, seed data.
- `tests/**` or `e2e/**` — unit/integration/e2e.
- `tools/verification/verify-ynot-production-plan.mjs` — static architecture/button/auth checks.
- `docs/PROJECT_STATUS.md`, `docs/verification/ynot-production-smoke-checklist.md`.

Deprecate or quarantine:
- `public/ynot-wireframes.html` and `docs/references/design/YNot Wireframes Standalone.html` as references only.
- `src/lib/line/use-liff-session.ts` and `src/app/api/line/session/route.ts` unless replaced by optional LINE OAuth/linking flow.
- Old `src/features/lucky-draw/*` after useful pieces are migrated to `src/features/ynot/*`.

## Acceptance criteria

1. `/` renders production home, not redirect/static wireframe.
2. All 10 customer pages exist as Next routes and can be reached by navigation.
3. Every visible button/control has one of: successful navigation, validated mutation, modal/drawer state, or disabled state with reason.
4. Email/password signup/login works.
5. Google login works.
6. LINE login/linking is optional and does not block non-LINE users.
7. Same customer can have one canonical account with email, Google, and LINE linked.
8. Account-linking cases are tested: same verified email auto-link where supported; logged-in manual link for different email; conflicting verified email requires admin-reviewed merge/recovery with audit event.
9. Non-LINE user can complete: signup -> wallet top-up request -> admin approval -> gacha detail -> open -> collection -> shipping/exchange/profile.
10. Manual bank transfer/QR slip upload creates a top-up request and private slip object.
11. Admin can approve/reject top-up and coin ledger credits exactly once.
12. Gacha opening atomically debits coins, reserves prizes, creates collection items, and records audit events.
13. Admin can manage users, identities, top-ups/slips, campaigns, prizes/cards, exchange, shipping, rankings, and settings.
14. Non-admins cannot access admin routes or admin mutations.
15. RLS policies are enabled for all user/admin data tables and storage buckets.
16. Private slip/card/admin assets are not publicly readable unless intentionally configured.
17. Realtime does not expose raw sensitive tables; it uses safe event/refetch patterns.
18. `npm run lint`, `npx tsc --noEmit --pretty false`, `npm run build`, static architecture script, and e2e smoke pass.
19. Docs/status capture implemented scope, test evidence, seed/admin setup, and remaining production credentials/config tasks.

## Risks and mitigations

- **Full-scope first release is broad**: split execution into verified slices; update `docs/PROJECT_STATUS.md` after each slice.
- **Provider account merge can be unsafe**: rely on Supabase automatic same-email linking only for verified unique emails; use logged-in manual linking for cross-email; admin merge requires audit trail.
- **Payment fraud/duplicate slips**: require manual admin approval; preserve file hash/QR duplicate checks; ledger idempotency constraints.
- **Gacha fairness/inventory race**: use transaction/RPC; do not let client choose prizes; unique inventory reservation.
- **Admin overexposure**: route-level and server mutation checks plus RLS/admin role policies.
- **Regression from old LIFF code**: static check forbids required LIFF imports in customer production routes.
- **Button coverage gaps**: button inventory fixture plus Playwright clicks all CTAs in seeded scenario.

## Verification plan

1. Static architecture checks:
   - `/` no longer redirects to `/ynot-wireframes.html`.
   - Client components do not import service-role/server-only modules.
   - Production routes do not require `useLiffSession`.
   - `src/proxy.ts` exists as the Next Proxy entrypoint and imports shared Supabase cookie-refresh helper logic.
   - Every route exports metadata or inherits production metadata.
2. Type/lint/build:
   - `npm run lint`
   - `npx tsc --noEmit --pretty false`
   - `npm run build`
3. Database tests:
   - Migration applies cleanly.
   - RLS policy matrix for customer/admin/anon.
   - RPC transaction tests for approval/open/exchange/shipping.
4. Integration tests:
   - Auth callback/linking routes.
   - Top-up/slip upload and admin approval.
   - Admin CRUD for each module.
5. E2E tests:
   - Full customer journey with email-only account.
   - Provider linking journey for Google and LINE.
   - Admin journey for all management pages.
   - Button map test: every button/control from all 10 pages plus admin pages.
6. Manual smoke:
   - Browser check on desktop/mobile widths.
   - Reduced-motion cinematic open.
   - Admin/non-admin access denial.
   - Production env checklist.

## ADR

### Decision

Rebuild the YNot production website on Next.js App Router + Supabase Auth/SSR + Supabase Postgres/RLS/RPCs, using the HTML as a reference artifact and making LINE an optional linked identity rather than the required session gate.

### Drivers

- Production readiness across auth, wallet, gacha, collection, exchange, shipping, admin.
- Non-LIFF-first user experience with optional LINE continuity.
- Need for testable per-page/per-button behavior.
- Fraud-sensitive money/inventory operations require server authority.

### Alternatives considered

- Retrofit current Lucky Draw shell: rejected as primary because it is LIFF-first and narrower than the 10-page YNot product, though useful implementation pieces can be harvested.
- Enhance static HTML: rejected because it cannot safely support production auth/payment/admin/inventory flows.

### Why chosen

Option A best aligns the architecture with the clarified product rather than preserving accidental old constraints. It creates a clean boundary between server-secured domain operations and client interactivity while still reusing safe pieces from the existing app.

### Consequences

- Requires schema migration and broad implementation.
- Requires auth provider setup outside code (Supabase/Google/LINE dashboards).
- Requires a real test suite to prove every page/button.
- Existing LIFF code should be removed or isolated.

### Follow-ups

- Confirm Supabase project Auth settings and provider credentials during execution.
- Add `@supabase/ssr` and test tooling.
- Build seed data for e2e/admin workflows.
- Decide if Slip2Go remains optional verifier or is removed from first production path.

## Required handoff artifacts

Before any `$ralph` or `$team` execution handoff, materialize and keep current:

- `docs/plans/prd-ynot-production-website.md` — product requirements, route/page scope, admin scope, auth/payment/account-merge requirements, and implementation phases.
- `docs/plans/test-spec-ynot-production-website.md` — executable test strategy, commands, button-map coverage, RLS matrix, e2e journeys, seed data, and pass thresholds.
- `docs/plans/adr-ynot-production-website.md` — architectural decision record for Option A strangler rebuild, alternatives, consequences, and follow-ups.

Execution modes must treat these artifacts plus `.omx/specs/deep-interview-html-full-website.md` as the source of truth.

## Available-agent-types roster

- `explore`: fast repo mapping and line references.
- `researcher`: official docs/version-aware guidance.
- `dependency-expert`: package/provider tradeoff decisions.
- `architect`: schema/auth/system boundary review.
- `executor`: implementation slices.
- `test-engineer`: test strategy and e2e/button coverage.
- `code-reviewer` plus `$security-review` skill: security and comprehensive review.
- `designer`: UI system and page interaction quality.
- `verifier`: completion evidence and claim validation.
- `writer`: docs/status/handoff.

## Follow-up staffing guidance

### `$ralph` path

Use a persistent single-owner loop for sequential correctness:
- Ralph leader owns slice sequencing and verification.
- Use `executor` for implementation slices, `test-engineer` for tests, `code-reviewer` plus `$security-review` skill for auth/RLS/payment, `designer` for UI system, `verifier` for final proof.
- Suggested reasoning: high for auth/schema/payment/admin, medium for UI component implementation, high for security/verification.

Launch hint:

```bash
$ralph "docs/plans/prd-ynot-production-website.md docs/plans/test-spec-ynot-production-website.md docs/plans/adr-ynot-production-website.md"
```

### `$team` path

Use team when speed matters and work can be split by lane:
- Lane 1 Auth/schema/RLS/RPCs: executor + code-reviewer/$security-review.
- Lane 2 Customer pages/UI shell/button map: executor + designer.
- Lane 3 Wallet/top-up/slips/admin payment: executor + test-engineer.
- Lane 4 Gacha/collection/exchange/shipping/ranking: executor + test-engineer.
- Lane 5 Admin full management: executor.
- Lane 6 QA/docs/verifier: test-engineer + verifier + writer.

Launch hints:

```bash
$team "docs/plans/prd-ynot-production-website.md docs/plans/test-spec-ynot-production-website.md"
omx team "implement YNot production website from approved ralplan artifacts" --agents 6
```

Team verification path:
- Team proves each lane with targeted tests and browser smoke.
- Team shuts down only after integration e2e passes and docs/status updated.
- Ralph/verifier performs final full-story verification after team merge.

## Draft changelog

- Initial deliberate draft created from deep-interview spec, repo evidence, and official-doc constraints.
- Iteration 1 applied Architect feedback: no hidden unsupported buttons, expanded schema/idempotency/settings, LINE gate, admin button-map, account-merge cases, and earlier admin/settings sequencing.
- Iteration 2 clarified Next 16 `src/proxy.ts` file-convention entrypoint plus optional `src/lib/supabase/proxy.ts` helper.
- Iteration 3 applied Critic feedback: required handoff artifacts, executable test tooling/commands, admin settings/audit routes, expanded pre-mortem, and corrected staffing to available `code-reviewer` plus `$security-review` skill.


## Consensus approval

- Architect: APPROVE after iterations on button scope, schema/idempotency, LINE gate, admin map, account merge, admin/settings sequencing, and Next 16 `src/proxy.ts` entrypoint.
- Critic: APPROVE after materialized PRD/test-spec/ADR, executable test commands, admin settings/audit scope, expanded pre-mortem, and staffing surface corrections.
- Finalized: 2026-05-06T13:20:14Z
