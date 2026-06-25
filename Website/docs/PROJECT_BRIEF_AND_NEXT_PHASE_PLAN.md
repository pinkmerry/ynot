# YNOTT Project Brief And Next Phase Plan

Updated: 2026-06-25
Status: **Alignment document plus production website/LINE Login topology update**

## 1. What this project is

YNOTT is being built as a **normal production website** for card-pack lucky draw / gacha play. It is not LIFF-only. LINE Login remains supported, but users who do not want LINE can still use the website normally.

The website uses the shared **Supabase database** so users, admins, orders, payments, wallet, prizes, and account linking are maintainable from one platform. The separate LIFF app/folder/deploy target is retired for now.

## 2. Product goal we aligned on

Build a production-ready platform where:

- Users can sign up and log in with email/password.
- Users can sign up and log in with Google/Gmail.
- Users can log in or connect with LINE.
- Email, Google, and LINE identities can connect to one user profile/account.
- Users can browse playable card packs from the homepage.
- Users can top up manually by bank transfer / QR payment and slip upload.
- Admin reviews and confirms payment before wallet coins are credited.
- Users can open packs, collect rewards, exchange cards, request shipping, and manage profile/personal info.
- Admin can manage campaigns, prizes/cards, payment methods, payment confirmations, users/admin roles, exchanges, shipping, account merges, and audit/history.
- Website UX should be production-looking, mobile-friendly, centered for play, readable, and inspired by the provided prototype/Toreca references.

## 3. Current project organization

`YNOTT` is the main project folder. It is organized as:

```text
YNOTT/
├── Website/       Normal production website app, website APIs, website UI, and website plan/docs
├── Database/      Supabase migrations, database architecture, RLS/RPC plans, and DB runbooks
├── AGENTS.md      Agent/project instructions
└── README.md      Project map
```

Important website folders:

```text
Website/src                 Next.js app, routes, APIs, components, features
Website/public              public website assets
Website/tools/verification  website verification scripts
Website/tools/fixtures      website test fixtures
Website/docs                website docs, plans, status, verification notes, references, archive
Website/docs/plans          readable website planning artifacts
Website/docs/references/design   website HTML/prototype references
Website scripts read ../Database/supabase directly; no Website/supabase symlink is used
```

Important database folders:

```text
Database/supabase/migrations    Supabase migration source of truth
Database/docs                   database architecture and runbook docs
Database/docs/plans             database / LIFF+website shared-schema plans
```

LINE Login remains in the website codebase under `Website/src/app/api/line/` and `Website/src/lib/line/`.

The parent `YNOTT` folder is the git root. `.git` intentionally stays in the parent folder so history covers Website and Database together. Database files are intentionally kept outside `Website/` to make the project easy to see.

## 4. What is already built locally

### Frontend / pages

Locally implemented pages include:

- Home / playable pack board
- Campaign detail
- Campaign open/play page
- Login
- Sign up
- Wallet / top-up
- Collection
- Ranking
- Exchange
- Shipping
- Profile / personal info
- Protected admin area

### Backend/API foundation

Local API/backend foundation includes:

- Supabase Auth SSR session support
- Email/password auth UI
- Google OAuth callback path
- LINE OAuth start/callback and LINE account linking path
- Unified profile resolution for normal website and existing LINE/LIFF session users
- Admin session resolution and server-side admin protection
- Manual top-up request and slip upload foundation
- Wallet account / coin ledger foundation
- Gacha open foundation
- Collection, exchange, and shipping foundations
- Admin operations for payment/top-up, campaign/prize management, user roles, account merge review, exchange, and shipping

### Database plan and local migrations

Database architecture has been planned to preserve existing production data while adding the normal website platform. Local migration files exist:

- `../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
- `../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`

These add the normal website identity bridge and platform domains while preserving existing profile/admin concepts.

## 5. What is not production-ready yet

This is important: **local implementation exists, but production readiness is not complete yet.**

Not complete yet:

- Production Supabase migrations have not been applied from this website phase.
- Staging/preview online testing has not been completed.
- Google OAuth provider settings and callback URLs need live verification.
- LINE Login provider settings and callback URLs need live verification.
- Owner/admin bootstrap row must be confirmed in the real target database.
- Manual payment/slip upload must be tested with safe test data.
- Full end-to-end browser QA is still needed for login, top-up, admin approval, gacha, exchange, shipping, and account merge flows.
- A Cloudflare production website deployment now exists for page/navigation smoke, but full write-flow production testing should not continue before the database, auth provider, admin, and payment safety gates pass.

## 6A. Current online testing deployment

A GitHub/Cloudflare website deployment exists for online testing:

- GitHub: `https://github.com/pinkmerry/ynot`
- Website Cloudflare Worker: `ynott-website`
- Production URL: `https://www.ynotopen.com`
- Deployment evidence: `docs/verification/2026-05-07-github-vercel-production-deploy.md`
- Database gate evidence: `../Database/docs/verification/2026-05-07-production-db-next-phase-gate.md`

Current status: page/button navigation smoke passes on production, but full authenticated wallet/gacha/exchange/shipping/admin flows remain blocked until the shared Supabase production schema is migrated and missing LINE/payment secrets are configured.

## 6. Approved next-phase strategy

The latest RALPLAN chose:

> **Staging/preview first, then production cutover.**

Reason: auth, payment, wallet, admin, and database migration touch real user and money-like state. We should prove positive and negative flows online in a staging/preview environment before touching production users.

Rejected for now:

- Direct production cutover without staging verification.
- Deploying write-heavy code to production before the database schema is ready.

## 7. Next phase plan before production

### Phase 0 — Baseline after move into `Website/`

Goal: prove the app still runs from the new folder.

Checklist:

- Run from `Website/`.
- `npm run check` passes.
- Localhost route smoke passes on port `3005`.
- Update docs with the move and current plan.

### Phase 1 — Production inventory and backup plan

Goal: know exactly what exists before any production migration.

Checklist:

- Confirm production Supabase project ref/URL.
- Inventory existing key tables, functions, RLS policies, storage buckets, and admin rows.
- Record backup/export method and rollback plan.
- Do not run production migration until backup evidence exists.

### Phase 2 — Staging Supabase and website preview

Goal: create safe online testing environment.

Checklist:

- Create/use staging Supabase project or branch.
- Apply both migrations to staging first.
- Configure preview/staging environment variables.
- Configure Google and LINE callback URLs for staging/preview.
- Deploy Vercel preview/staging wired to staging DB.

### Phase 3 — Online QA in staging

Goal: prove all critical user/admin flows.

Must test:

- Email sign up, login, logout.
- Google/Gmail login.
- LINE login/linking.
- Account merge conflict path.
- Manual top-up with QR/slip upload.
- Admin payment review and wallet credit.
- Pack open / gacha result.
- Collection ownership.
- Exchange request and admin review.
- Shipping request and admin review.
- Profile/personal-info update.
- Admin-only pages hidden/protected from non-admins.

### Phase 4 — Production preflight

Goal: prepare production without guessing.

Checklist:

- Confirm production env vars.
- Confirm provider callback URLs.
- Confirm owner/admin account.
- Confirm backup.
- Run migrations in required order.
- Run post-migration SQL checks.
- Deploy production only after schema/provider/admin checks pass.

### Phase 5 — Constrained production pilot

Goal: test real production safely with limits.

Checklist:

- Test with owner/admin and small internal users first.
- Use small-value payment/top-up tests.
- Confirm realtime/admin state updates.
- Monitor logs and database rows.
- Keep rollback/forward-fix plan ready.

## 8. Go / no-go criteria

### Go to next phase only when

- Local check/build passes from `Website/`.
- Database migration target is clear.
- Backup plan exists before production migration.
- Staging positive and negative flows pass.
- Admin account and permissions are confirmed.
- Provider settings are verified online.

### No-go if

- Migrations are not applied to the same DB the deployed app uses.
- Google or LINE callback URLs are unverified.
- Admin cannot manage payments/campaigns/users/exchange/shipping.
- Non-admin can see or call admin-only features.
- Manual payment confirmation can credit wallet without admin review.
- Any critical route/button is disconnected from backend behavior.

## 9. Decisions to confirm before the next implementation/deployment phase

These are the only alignment decisions I recommend confirming before the next phase:

1. **Staging DB strategy:** separate staging Supabase project, Supabase branch/clone, or production shadow mode only if staging is blocked.
2. **Online target:** Vercel preview/staging first, then production.
3. **Owner/admin account:** which real account should be the first owner/admin in the target DB.
4. **Provider access:** Google OAuth and LINE Login dashboard access/callback URLs are available.
5. **Pilot limit:** what small payment/top-up amount and which users are allowed in first production pilot.

## 10. Reference artifacts

- Project status: `docs/PROJECT_STATUS.md`
- Production readiness RALPLAN: `docs/plans/ralplan-production-online-testing-readiness.md`
- Website architecture RALPLAN: `docs/plans/ralplan-ynot-production-website.md`
- LIFF/database redesign RALPLAN: `../Database/docs/plans/ralplan-liff-database-redesign.md`
- Database architecture doc: `../Database/docs/DATABASE_ARCHITECTURE.md`
- Original standalone HTML reference: `docs/references/design/YNot Wireframes Standalone.html`

## 11. Stop condition before implementation continues

Do not start the next deployment/production phase until this document is reviewed for goal alignment or the user explicitly says to continue with the staging/preview phase.


## Repo and deployment topology

Canonical repo/folder naming is **YNOTT**. Agents must distinguish:

- **YNOTT Website**: code in `Website/`, Cloudflare Worker `ynott-website`, domain `www.ynotopen.com`.
- **LINE Login**: website OAuth/account-linking routes in `Website/src/app/api/line/`.
- **Database**: Supabase migrations and verification in `Database/`.

There is no active separate LIFF project for now.
