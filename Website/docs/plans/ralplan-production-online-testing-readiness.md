# RALPLAN: YNot / Lucky Draw Production & Online Testing Readiness

Status: Final v4 consensus-approved
Mode: RALPLAN-DR deliberate mode, because this plan covers production migration, auth, payment, admin operations, and external provider configuration.
Created: 2026-05-07
Context snapshot: `.omx/context/production-online-testing-readiness-20260507T075853Z.md`

## Outcome

Move the locally verified YNot/Lucky Draw website from local implementation into a safe online testing path, then production, without breaking the existing LIFF/shared Supabase database or exposing payment/admin/auth risks.

## Current Evidence Baseline

- `docs/PROJECT_STATUS.md` records local implementation for website auth, LINE linking, wallet/top-up, gacha, collection, exchange, shipping, admin management, merge review, responsive UI, and button-map foundation.
- Local migrations exist but are not applied to production:
  - `supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
  - `supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
- Current-session validation passed:
  - `npm run verify:ynot`
  - `npm run check`
  - Customer/admin route smoke on `localhost:3005`
  - Guard smoke: customer mutations return 401 when logged out; admin mutations return 403 when not admin; LINE login fails closed without local secret.
- `tools/fixtures/button-map.json` covers 34 first-release controls: 8 navigation, 4 auth server-action controls, and 22 backend mutation controls.

## RALPLAN-DR Summary

### Principles

1. **No production write before schema readiness**: do not deploy code that writes new columns/tables/RPCs until the target Supabase database has the required migrations applied and verified.
2. **Staging proves positive flows before production**: local static checks are not enough; real login, slip upload, wallet credit, gacha, exchange, and shipping must pass online in staging/preview first.
3. **Preserve LIFF compatibility**: existing LIFF profiles/orders/admin data must continue working while normal website auth is added.
4. **Fail closed for auth/payment/admin**: missing secrets, unauthenticated users, non-admin users, duplicate payments, and unsafe LINE conflicts must block rather than mutate data.
5. **Evidence before launch**: every production-ready claim must have a command result, screenshot, DB row check, provider setting check, or manual QA record.

### Decision Drivers

1. **Data safety**: migrations, RLS, wallet ledger, payment slips, and account identity merging touch money/user/admin state.
2. **User journey completeness**: website users must be able to sign up/log in, top up, play, exchange, ship, and manage profile without LINE; LINE remains optional.
3. **Operational maintainability**: admin must manage campaigns, prizes, users, payments, exchange, shipping, and audit without direct database edits for normal operations.

### Viable Options

#### Option A — Direct production cutover after backup

Approach: back up production, apply migrations directly to production, set production envs, deploy, then test live.

Pros:
- Fastest path to production.
- No duplicated staging setup.
- Uses real production data immediately.

Cons:
- Highest risk: migration/RLS/provider errors happen against live data.
- Harder to separate test artifacts from real orders/top-ups.
- More pressure during first debugging loop.

Verdict: rejected for first online testing because payment/auth/admin migrations are too risky to prove first on production.

#### Option B — Staging/preview first, then production cutover

Approach: create or use a staging Supabase project/branch/clone, apply migrations, configure preview envs/providers, run full positive/negative online QA, then repeat controlled migration/deploy on production with backup and rollback plan.

Pros:
- Safest path for money/auth/admin features.
- Lets us prove positive flows before touching production users.
- Provides reusable test checklist and launch evidence.

Cons:
- Slower setup.
- Requires staging secrets/provider callback URLs.
- Must avoid confusing staging LINE/Google settings with production.

Verdict: chosen.

#### Option C — Hybrid production shadow mode

Approach: deploy code to production but disable write-heavy features behind feature flags until migrations/provider checks pass.

Pros:
- Production UI can be previewed early.
- Lower user-facing launch pressure.

Cons:
- Requires additional feature flag discipline not yet fully planned.
- Still risks accidental code paths writing to missing schema if flag boundaries miss something.
- Can hide real e2e issues until late.

Verdict: useful as a fallback/hardening technique, not the main plan.

## Decision

Use **Option B: staging/preview first, then production cutover**.

## Phase Plan

### Phase 0 — Freeze readiness baseline

Goal: lock what is currently known before touching online infrastructure.

Actions:
1. Confirm clean/current local verification:
   - `npm run check`
   - `npm run verify:ynot`
   - route smoke for customer/admin pages
   - backend guard smoke for unauthenticated and non-admin calls
2. Save current evidence to `docs/PROJECT_STATUS.md` and a QA artifact under `docs/verification/` or `.omx/artifacts/`.
3. Record exact commit/diff state before deployment work.

Acceptance criteria:
- Local build/check passes.
- Button/backend map still covers all first-release controls.
- No untracked critical deployment requirement is hidden in memory or conversation only.

### Phase 1 — Production data inventory and backup plan

Goal: know exactly what database/provider state exists before migration.

Actions:
1. Inspect current production Supabase project reference and schema state.
2. Record current tables/columns/functions/policies relevant to:
   - `profiles`
   - `admin_users`
   - existing draw/order/slip/pick/card tables
   - realtime event tables
   - storage buckets for slips/assets
3. Create a backup/export plan before any production migration.
4. Define rollback strategy:
   - database restore point/export
   - Vercel env rollback
   - deploy rollback
   - provider callback rollback if needed

Acceptance criteria:
- Production Supabase ref and schema version are documented.
- Backup artifact/path and restore procedure are documented.
- No migration runs until backup confirmation exists.

#### Migration runbook details required before any production apply

Required fields in the production migration runbook:

1. **Target identity**
   - Production Supabase project ref and URL.
   - Staging Supabase project ref and URL.
   - Vercel project/environment names.
   - Operator and timestamp for each migration attempt.
2. **Backup evidence**
   - Backup/export path or Supabase backup identifier.
   - Confirmation that restore access is available.
   - A minimal restore drill or documented restore command for the same backup type.
3. **Pre-migration schema snapshot**
   - Table inventory for identity, orders, slips, picks, cards, admin, realtime.
   - Function/RPC inventory.
   - RLS policy inventory for affected tables.
4. **Migration command/order**
   - Apply `20260507015626_phase1_auth_identity_realtime.sql` first.
   - Apply `20260507032000_phase2_platform_wallet_gacha.sql` second.
   - Record exact command/tool used, output, and failure behavior.
5. **Post-migration SQL checks**
   - Confirm new columns exist: `profiles.auth_user_id`, nullable `profiles.line_user_id`.
   - Confirm Phase 1 altered columns exist: `profiles.auth_user_id`; `profiles.line_user_id` is nullable.
   - Confirm Phase 1 tables exist: `user_identities`, `user_addresses`, `app_realtime_events`.
   - Confirm Phase 1 helper functions exist: `app_private.current_profile_id()`, `app_private.is_active_admin()`, `app_private.emit_lucky_draw_realtime_event()`.
   - Confirm Phase 2 tables exist: `payment_methods`, `top_up_requests`, `wallet_accounts`, `coin_ledger`, `idempotency_keys`, `account_merge_requests`, `account_merge_events`, `gacha_opens`, `gacha_open_items`, `collection_items`, `exchange_orders`, `exchange_order_items`, `shipping_requests`, `shipping_request_items`, `site_settings`, `ranking_snapshots`.
   - Confirm existing `draw_rounds` alterations exist: `mode`, `cost_coins`, `opens_total_limit`, `per_user_limit`, `ends_at`, `visibility`, `sort_order`.
   - Confirm existing `payment_slips` alterations exist: `top_up_request_id` and `payment_slips_exactly_one_owner_ck`.
   - Confirm existing `audit_events` alterations exist: `top_up_request_id`, `gacha_open_id`, `collection_item_id`, `exchange_order_id`, `shipping_request_id`, `auth_user_id`.
   - Confirm key RPCs exist: `approve_top_up_request`, `reject_top_up_request`, `open_gacha_campaign`, `submit_exchange_order`, `approve_exchange_order`, `reject_exchange_order`, `complete_account_merge_request`, `reject_account_merge_request`, `request_shipping_for_items`.
   - Confirm RPC execute grants are limited to intended roles, especially service-role/admin mediated functions.
   - Confirm RLS is enabled on new public tables and policies do not grant broad table writes to authenticated users.
   - Confirm ledger/idempotency protections exist: coin ledger reference uniqueness, idempotency key uniqueness, and wallet update paths using locked/RPC writes.
6. **Rollback/forward-fix rule**
   - If migration fails before data writes: restore or revert schema according to backup plan.
   - If migration succeeds but app fails: roll back Vercel deployment/env first; avoid destructive DB rollback after user writes unless restore is explicitly approved.
   - If wallet/payment writes occurred: prefer forward-fix plus ledger reconciliation over blind restore.

Production migration cannot start until this runbook is filled and attached to `docs/verification/` or `.omx/artifacts/`.

### Phase 2 — Staging Supabase + preview deployment setup

Goal: create a safe online environment where real positive flows can be tested without mutating production.

Actions:
1. Choose staging strategy:
   - preferred: separate staging Supabase project copied from current schema with safe seed/test data;
   - acceptable: Supabase branch/clone if available and understood;
   - fallback: production shadow mode only if staging is blocked.
2. Apply migrations to staging in order:
   - Phase 1 auth/identity/realtime migration.
   - Phase 2 wallet/gacha/collection/exchange/shipping/admin migration.
3. Configure preview/staging env vars:
   - Supabase URL/anon/service role.
   - `NEXT_PUBLIC_SITE_URL` for preview/staging origin.
   - `LINE_SESSION_SECRET`.
   - LINE Login channel ID/secret.
   - Google OAuth client config.
   - storage/bucket names and any Slip2Go/test-mode settings.
4. Deploy Vercel preview/staging wired to staging Supabase.

Acceptance criteria:
- Migrations apply cleanly to staging.
- Staging app loads online.
- Auth callback URLs point to staging, not production.
- Mutation endpoints do not 500 due to missing tables/functions/secrets.

#### Staging strategy decision

Recommended staging strategy: **separate staging Supabase project with sanitized seed/test data plus enough existing LIFF-shaped rows to test compatibility**.

Why this is preferred:
- It prevents accidental mutation of production wallet/order/user data during online QA.
- It allows destructive/retry/idempotency tests such as duplicate top-up approval and merge conflict review.
- It avoids making production the first place where provider callback and DB migration mistakes appear.

Minimum staging data required:
- One normal website test user.
- One Google-auth test user.
- One LINE-linked test profile.
- One owner/admin profile row.
- One non-admin profile row.
- One live public campaign with prize pool and enough inventory.
- One payment method for bank/QR manual top-up.
- Sample collection items for exchange/shipping, or a path to create them through gacha.

Production shadow mode is only allowed if:
- write-heavy routes are hard-disabled or admin-only in production,
- all mutation endpoints are verified not to touch missing schema,
- and the user explicitly accepts the reduced safety margin.

### Phase 3 — Provider and identity verification

Goal: prove account creation/linking before testing money/gacha flows.

Actions:
1. Email/password signup and login:
   - create a test user;
   - verify Supabase Auth user exists;
   - verify canonical `profiles` row exists and links `auth_user_id`.
2. Google OAuth:
   - sign in with Google;
   - verify callback, session, and profile/identity sync.
3. LINE login/connect:
   - login with LINE as a new account;
   - connect LINE to an existing email account;
   - test conflict path when LINE identity belongs to another profile;
   - verify merge request creation instead of unsafe auto-merge.
4. Admin bootstrap:
   - promote/verify the owner/admin row in staging;
   - confirm admin UI is hidden/denied for non-admin;
   - confirm admin API is 403 for non-admin and works for admin.

Acceptance criteria:
- Normal web account works without LINE.
- Google and LINE can link to one canonical profile.
- Conflict cases create admin-reviewed merge requests.
- Admin visibility and server-side access checks both pass.

### Phase 4 — Wallet/manual payment and admin operation QA

Goal: prove the first production payment flow safely.

Actions:
1. Configure at least one active payment method in admin settings.
2. User creates manual top-up with bank/QR slip upload.
3. Verify `top_up_requests` and generalized `payment_slips` rows are created with correct ownership invariant.
4. Admin approves top-up:
   - verify wallet balance increments once;
   - verify coin ledger row exists;
   - repeat approval attempt should not double-credit.
5. Admin rejects a separate test top-up:
   - verify no wallet credit.
6. Verify audit and realtime event behavior.

Acceptance criteria:
- Slip upload creates pending review state.
- Approval credits wallet exactly once via RPC/ledger.
- Rejection does not credit wallet.
- Non-admin cannot approve/reject.

### Phase 5 — Gacha, collection, exchange, shipping positive-flow QA

Goal: prove core business journey after wallet has coins.

Actions:
1. Admin creates/updates campaign and prize pool or confirms seeded live campaign.
2. User opens gacha:
   - verify wallet debit;
   - verify gacha open/result rows;
   - verify collection item ownership.
3. User requests exchange for a collection item:
   - verify exchange order/items;
   - admin approves;
   - verify wallet credit/ledger and item state.
4. User requests shipping for a collection item:
   - save address;
   - submit shipping request;
   - admin updates status/tracking;
   - verify delivered/shipped item states.
5. Verify ranking/profile/page refresh behavior where applicable.

Acceptance criteria:
- Wallet cannot go negative.
- Gacha open is atomic and idempotent enough for retry safety.
- Exchange approval credits exactly once.
- Shipping request state changes are admin-only and auditable.

### Phase 6 — Production preflight

Goal: repeat proven staging setup against production safely.

Actions:
1. Confirm production backup complete.
2. Confirm staging sign-off artifacts exist.
3. Apply migrations to production in order.
4. Verify production RLS/RPC/schema state with read-only and safe checks.
5. Configure production Vercel envs and provider callbacks.
6. Bootstrap/verify owner/admin account in production.
7. Deploy production.

Acceptance criteria:
- Production migration succeeds and schema checks pass.
- Production app points to intended Supabase project/ref.
- Provider callbacks match production domain.
- Admin owner can log in; non-admin cannot access admin.

### Phase 7 — Production smoke and limited pilot

Goal: prove production with minimal blast radius.

Actions:
1. Production smoke without mutation:
   - home/detail/open/collection/ranking/exchange/shipping/wallet/profile/login/signup/admin pages load.
2. Production auth smoke:
   - email login/signup with internal test account;
   - Google login;
   - LINE connect/login.
3. Production payment/gacha pilot with small test amounts/test campaign:
   - create top-up;
   - admin approve;
   - open one gacha;
   - exchange or shipping request with test/internal item.
4. Monitor logs, audit table, wallet ledger, and realtime events.
5. Only after pass: enable real campaigns/payment instructions to public users.

Acceptance criteria:
- No unhandled production errors during pilot.
- All core tables show expected rows.
- No duplicate wallet credit/debit.
- Admin can operate without direct SQL for normal tasks.

#### Production pilot constraints

The production pilot must be intentionally narrow:

- Internal/test accounts only.
- Test campaign or explicitly labeled internal campaign only.
- Minimal top-up amount and no real public payment instructions until pilot passes.
- No public announcement or open traffic before go decision.
- Every wallet ledger row from the pilot must be reconciled manually.
- Any duplicate credit/debit, RLS/admin bypass, provider callback mismatch, unhandled 5xx, or LIFF regression is an automatic no-go.

## Environment / Provider Checklist

### Vercel

- Preview/staging and production have separate environment variable sets.
- `NEXT_PUBLIC_SITE_URL` exactly matches the deployed origin for each environment.
- Supabase URL/anon/service role values point to the intended project.
- No service role key is exposed to client bundles.

### Supabase

- Site URL and redirect URLs include the exact staging and production origins.
- Email templates/confirmation behavior are acceptable for first release.
- Storage buckets exist for payment slips/card assets with intended policies.
- RLS and RPC grants are verified after migration.

### Google OAuth

- OAuth consent/app is configured.
- Authorized redirect URI matches `/auth/callback` on staging and production.
- Test user can complete OAuth and reach a canonical profile.

### LINE Login / LIFF

- LINE Login channel ID/secret are configured for each environment.
- Callback URL matches `/api/line/callback`.
- `LINE_SESSION_SECRET` is set and not reused as a service role fallback.
- LINE rich menu / LIFF URLs are checked separately from the normal website login path.
- Conflict path creates merge request rather than unsafe auto-link.

### Payment / Slip

- Manual bank/QR payment method exists and is active only when admin is ready to review.
- Slip upload storage path and file-size/type limits are verified.
- Slip2Go or test-mode policy is documented; fake slips are not approved in production except through safe test/dry-run paths.

## Go / No-Go Evidence Template

Each staging and production gate must produce an evidence entry with:

- Environment: staging or production.
- Timestamp and operator.
- Git commit/deploy ID.
- Supabase project ref.
- Vercel deployment URL.
- Commands run and outputs/links.
- DB checks run and result snippets.
- Provider dashboard checks completed.
- Screenshots or browser recordings for core journeys.
- Known failures and severity.
- Decision: GO / NO-GO / GO WITH LIMITATION.
- Signer/owner of the decision.

Automatic NO-GO conditions:

- Migration failed or schema check incomplete.
- Any wallet ledger mismatch or duplicate credit/debit.
- Admin endpoint works for non-admin.
- Customer mutation works without login.
- Google/LINE/email login cannot create/resolve a canonical profile.
- Existing LIFF login/order flow regresses.
- Any unexplained production 5xx in the pilot journey.

## Observability and Incident Criteria

Monitor during staging and production pilot:

- Vercel function logs for `/api/ynot/*`, `/api/line/*`, `/auth/callback`, and admin routes.
- Supabase auth logs for signup/OAuth/session issues.
- Supabase DB/RPC logs for wallet, gacha, exchange, shipping, merge, and RLS errors.
- Audit/event tables for admin/payment/gacha/exchange/shipping state changes.
- Wallet ledger balance reconciliation after every pilot mutation.

Incident response:

1. Stop public rollout / keep campaign hidden.
2. Preserve logs and affected row IDs.
3. Decide rollback vs forward-fix based on whether wallet/payment writes occurred.
4. Record incident and resolution in `docs/PROJECT_STATUS.md` and the go/no-go artifact.

## Pre-Mortem: 6 Failure Scenarios

1. **Migration breaks existing LIFF users**
   - Cause: `profiles.line_user_id`/identity changes, RLS, or realtime policy impacts old LIFF flow.
   - Mitigation: test existing LIFF session/order flow on staging clone; keep additive migrations; verify `/api/line/session` and legacy `/api/lucky-draw` before production launch.

2. **Wallet/payment double-credit or wrong owner**
   - Cause: repeated admin approval, bad payment_slips owner invariant, or missing ledger uniqueness.
   - Mitigation: RPC row locks + ledger reference uniqueness; explicit duplicate-approval test; audit ledger after every top-up/exchange test.

3. **Provider callback/session drift online**
   - Cause: Google/LINE dashboards point to wrong domain, `NEXT_PUBLIC_SITE_URL` mismatch, stale LINE rich menu/LIFF URL.
   - Mitigation: provider checklist for staging and production; verify exact callback URLs; test rich menu separately from normal website login.

4. **Service-role or secret exposure**
   - Cause: Vercel env mis-scope, accidental client import, logging secrets, or exposing service-role key to browser bundle.
   - Mitigation: run static secret/client import checks, inspect deployed client bundle/env exposure, keep service-role only in server route handlers/RPC callers, and treat any exposed secret as automatic no-go with rotation.

5. **Staging/production provider cross-wiring**
   - Cause: staging app points to production Supabase, production OAuth redirects to staging, or LINE channel secret/domain mismatch.
   - Mitigation: go/no-go evidence must record Supabase ref, Vercel URL, `NEXT_PUBLIC_SITE_URL`, Google redirect URI, LINE callback URI, and rich-menu/LIFF URL for each environment before testing.

6. **Owner/admin bootstrap lockout or unsafe recovery**
   - Cause: owner row missing/inactive, profile resolver points to different canonical profile, or admin UI hidden for the real maintainer.
   - Mitigation: bootstrap and verify owner/admin in staging then production before public launch; verify both UI visibility and server admin mutations; recovery requires direct DB check plus documented admin row update, not UI guesswork.

## Expanded Test Plan

### Unit/static

- `npm run lint`
- `npm run typecheck`
- `npm run verify:phase1`
- `npm run verify:auth`
- `npm run verify:platform`
- `node tools/verification/verify-lucky-draw-plan.mjs`
- Validate button-map fixture still has no unsupported/no-op first-release controls.

### Integration/database

- Apply migrations to staging/local DB.
- Test RLS with anon/authenticated/admin/service-role contexts.
- Test RPCs:
  - top-up approval/rejection;
  - gacha open;
  - exchange approval/rejection;
  - shipping request creation;
  - account merge approval/rejection.
- Confirm storage bucket write/read policies for slip upload and card assets.

### E2E/browser

- Customer flow: signup -> login -> profile -> top-up -> admin approve -> gacha open -> collection -> exchange -> shipping.
- Auth flow: email, Google, LINE login, LINE connect, conflict/merge review.
- Admin flow: payment method, campaign, cards/prizes, top-ups, users, merge, exchange, shipping, audit.
- Responsive smoke: desktop and mobile screenshots for all 10 core pages.

### Observability/manual checks

- Vercel logs for route errors.
- Supabase API logs / DB logs for RPC errors.
- Audit events for admin/payment/gacha/exchange/shipping.
- Wallet ledger balance reconciliation.
- Realtime event rows contain no private payload leaks.

## Execution-Grade Online E2E Matrix

No Playwright e2e suite exists yet, so the first online QA can be manual browser QA with captured evidence. These flows should become Playwright targets after the manual pilot is stable.

| Flow | Actor | Route/API | DB assertions | Audit/event/log evidence | Mode |
| --- | --- | --- | --- | --- | --- |
| Email signup/login | Customer | `/signup`, `/login`, `/auth/callback`; Supabase Auth server actions | Auth user exists; `profiles.auth_user_id` set; canonical profile resolves | Vercel auth route no 5xx; Supabase auth log success | Manual first, automate later |
| Google login | Customer | Google button -> Supabase OAuth -> `/auth/callback` | `user_identities` row or profile sync exists; profile resolves | Supabase OAuth callback success; no open redirect | Manual first, automate later |
| LINE login/connect | Customer | `/api/line/login/start`, `/api/line/callback`, `/profile` connect action | LINE identity linked to canonical profile; conflict creates `account_merge_requests` | LINE callback log; no unsafe auto-merge; rich menu/LIFF URL checked separately | Manual first, automate later |
| Admin bootstrap/access | Owner/admin and non-admin | `/admin`, `/admin/*`, `/api/ynot/admin/*` | `admin_users` active owner/admin row exists; non-admin has no admin row | Admin API 403 for non-admin; admin mutation allowed only for active admin | Manual + scripted smoke |
| Payment method setup | Admin | `/admin/settings`, `POST /api/ynot/admin/payment-methods` | `payment_methods` row active and scoped | Audit/log entry or API success; no non-admin access | Manual first |
| Manual top-up submit | Customer | `/wallet`, `POST /api/ynot/wallet` | `top_up_requests` pending; `payment_slips.top_up_request_id` set; XOR owner constraint respected | Upload/storage evidence; app realtime/audit event if configured | Manual first, automate API later |
| Top-up approve/reject | Admin | `/admin/top-ups`, `PATCH /api/ynot/admin/top-ups` | Approve: wallet balance increases once; `coin_ledger` row; repeat approve no double credit. Reject: no credit | Admin audit row; ledger reconciliation | Manual + DB assertion required |
| Gacha open | Customer | `/gacha/[campaignId]/open`, `POST /api/ynot/gacha/open` | Wallet debit; `gacha_opens`; `gacha_open_items`; `collection_items`; inventory state consistent | Audit/realtime/log evidence; retry does not corrupt state | Manual first, automate API later |
| Exchange request/approval | Customer + Admin | `/collection`, `POST /api/ynot/exchange`; `/admin/exchange`, `PATCH /api/ynot/admin/exchange` | `exchange_orders/items`; approved item state; wallet credit/ledger exactly once | Admin audit row; ledger reconciliation | Manual first, automate API later |
| Shipping request/update | Customer + Admin | `/shipping`, `POST /api/ynot/addresses`, `POST /api/ynot/shipping`; `/admin/shipping`, `PATCH /api/ynot/admin/shipping` | `user_addresses`; `shipping_requests/items`; item state shipped/delivered/cancelled as expected | Admin audit row; tracking/status log | Manual first, automate API later |
| Existing LIFF compatibility | Existing LINE/LIFF user | Existing LIFF path and `/api/line/session`, `/api/lucky-draw` | Existing profile/order flow still resolves; no broken `line_user_id` assumptions | LIFF/session logs; rich menu URL validation | Manual required |
| Negative guard checks | Logged-out/non-admin | Customer/admin mutation APIs | No unintended rows created | 401 for logged-out customer mutations; 403 for non-admin admin mutations; no 5xx | Scripted smoke |

Every e2e evidence packet must include the row IDs/public codes created in staging/production so ledger and audit rows can be reconciled.

## Acceptance Criteria For Production-Ready

- Staging positive e2e passes for auth, payment, wallet, gacha, exchange, shipping, and admin operations.
- Production migration is backed up and applied successfully.
- Production env vars and provider callback URLs are verified.
- Owner/admin bootstrap is verified in production.
- Production pilot passes with internal/test accounts.
- `docs/PROJECT_STATUS.md` records evidence, known gaps, and final go/no-go.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Production schema mismatch | staging migration first, production inventory, backup, ordered migration, post-migration schema check |
| Existing LIFF flow regression | staging clone test of existing LINE session/order/admin paths before cutover |
| Payment double credit | RPC idempotency/ledger tests, duplicate approval negative test, admin audit checks |
| Wrong provider callbacks | explicit Google/LINE dashboard checklist for staging and production origins |
| Owner/admin locked out | bootstrap owner/admin before public launch and verify both UI + API access |
| Test data pollutes production | use staging first; in production pilot use labeled internal accounts/campaigns/test top-ups |
| Stale rich menu URL | verify LINE rich menu/LIFF URLs separately from normal website login |

## ADR

### Decision

Use a staged online readiness path: staging/preview with full positive-flow QA first, then production migration/deploy with backup, then limited production pilot before public launch.

### Drivers

- Protect existing LIFF production database and users.
- Avoid payment/wallet/admin data corruption.
- Prove real provider callbacks and sessions online before public users arrive.

### Alternatives considered

- Direct production cutover after backup: fastest but too risky for first proof of auth/payment/admin migrations.
- Hybrid production shadow mode: useful fallback, but not a substitute for staging positive-flow QA.

### Why chosen

Staging-first is slower but gives the safest evidence path for a platform with account identity, manual payments, wallet ledger, gacha inventory, exchange, shipping, and admin operations.

### Consequences

- Requires staging Supabase/project/branch and provider preview settings.
- Requires more QA artifacts before launch.
- Reduces likelihood of production rollback/emergency fixes.

### Follow-ups

- Decide staging Supabase strategy.
- Apply migrations to staging and run database integration tests.
- Configure Google/LINE staging and production provider settings.
- Bootstrap owner/admin in staging then production.
- Build or run Playwright/e2e scripts for repeatable online journeys.

## Available-Agent-Types Roster

- `planner`: sequence deployment gates and status updates.
- `architect`: review migration/deployment architecture and rollback design.
- `critic`: evaluate readiness evidence and go/no-go quality.
- `debugger`: diagnose provider/session/database failures during staging tests.
- `executor`: implement missing scripts/checklists/fixes.
- `test-engineer`: create/run e2e and database integration tests.
- `verifier`: independently confirm production/staging evidence.
- `security-reviewer` / `security-review`: review auth, RLS, service role, payment/admin boundaries.
- `researcher`: check official docs for provider/deployment behavior if needed.
- `writer`: maintain `docs/PROJECT_STATUS.md`, QA checklists, launch runbook.

## Follow-Up Staffing Guidance

### `$ralph` path

Use when one owner should execute sequentially with tight verification:

- Primary: `executor` with high reasoning for migration/deployment scripts and checklists.
- Support as needed: `test-engineer` for e2e, `verifier` for evidence, `security-reviewer` for auth/RLS/payment boundaries.
- Best for: staging setup and one complete QA loop.

Suggested launch:

```bash
$ralph "execute the staging-first production readiness plan in docs/plans/ralplan-production-online-testing-readiness.md; do not touch production until staging evidence and backup gates pass"
```

### `$team` path

Use when parallel speed matters after the plan is approved and credentials/access are available:

- Lane 1 `executor`: staging Supabase migration and schema/RPC checks.
- Lane 2 `executor` or `debugger`: Vercel env/provider callback setup and session debugging.
- Lane 3 `test-engineer`: browser/e2e journey tests.
- Lane 4 `security-reviewer`: RLS/auth/admin/payment boundary review.
- Lane 5 `writer` or `verifier`: runbook/status/evidence capture.

Suggested launch:

```bash
$team "execute docs/plans/ralplan-production-online-testing-readiness.md with lanes: staging DB, provider/env, e2e QA, security/RLS review, evidence/runbook. Production changes require backup and explicit go gate."
```

## Team Verification Path

Before shutdown, the team must provide:

1. Staging migration evidence and schema/RPC check output.
2. Provider callback/env checklist with exact staging/production origins.
3. E2E test evidence for customer/admin flows.
4. Security/RLS/admin/payment boundary review verdict.
5. Updated `docs/PROJECT_STATUS.md` with pass/fail, blockers, and next action.
6. Clear go/no-go recommendation for production migration.

## Changelog

- v1: Initial deliberate RALPLAN-DR plan created from current project status, current-session verification, and production-readiness constraints.
- v2: Applied Architect ITERATE feedback: added concrete migration runbook, staging strategy, go/no-go evidence gate, env/provider checklist, observability/incident criteria, and constrained production pilot rules.
- v3: Applied Critic ITERATE feedback: completed migration object checklist from actual migration files, added execution-grade online e2e matrix with actor/API/DB/evidence/mode fields, and expanded pre-mortem for secret exposure, provider cross-wiring, and owner/admin lockout.
- v4: Applied final Critic checklist fix: added `draw_rounds` altered columns, full `audit_events` added columns, and corrected pre-mortem heading from 3 to 6 scenarios.
