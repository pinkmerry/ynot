# Remaining Production Phase Plan

Updated: 2026-05-08
Status: planning documents only; no production database, provider, or deployment changes were made by this document set.

## What this folder is

This folder splits the approved production-readiness plan into owner-readable execution phases. Each phase has:

- user stories;
- acceptance criteria;
- UAT steps;
- real technical tests/evidence;
- important data, security, rollback, and admin notes;
- a gate that decides whether the next phase can start.

## Current baseline

Phase 0 is treated as complete: the local website, current UI navigation cleanup, route smoke, and local `npm run check` evidence already exist. The remaining work is the production/staging path that protects the existing LIFF Supabase database while enabling the normal website.

Key baseline facts:

- Website must continue using the same production Supabase project: `szjoarkijeaspazbrchc`.
- Production currently still lacks the new normal-website schema.
- Existing migrations must be applied only after backup and staging evidence:
  1. `../../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
  2. `../../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
- Admin already has protected surfaces for campaigns, prizes/cards, top-ups, users, merge review, exchange, shipping, rankings, settings, and audit.
- Admin is not fully future-proof yet for dynamic storefront categories/media/content because current categories and filters still live in code constants.

## Phase index

Quick index: [`00-index.md`](00-index.md). Evidence template: [`appendix-go-no-go-evidence-template.md`](appendix-go-no-go-evidence-template.md).

| Phase | Document | Owner result | Gate |
| --- | --- | --- | --- |
| 1 | [Production Data Inventory + Backup](phase-1-production-data-inventory-backup.md) | We know exactly what is in production and have a restore-ready backup plan. | Full backup + schema gap evidence exists; no write happened. |
| 2 | [Staging Supabase + Preview](phase-2-staging-supabase-preview.md) | Real online testing can happen without touching production data. | Migrations pass in staging and preview points to staging only. |
| 3 | [Provider + Identity + Owner/Admin](phase-3-provider-identity-owner-admin.md) | Email, Google, LINE, LIFF compatibility, and owner/admin access work. | Owner can enter admin; non-admin cannot; identity bridge works. |
| 4 | [Wallet + Manual Payment + Admin QA](phase-4-wallet-payment-admin-qa.md) | First money flow is proven safely. | Top-up approve/reject, ledger, and idempotency pass in staging. |
| 5 | [Gacha + Collection + Exchange + Shipping QA](phase-5-gacha-collection-exchange-shipping-qa.md) | Full customer-to-admin operations journey is proven. | Pack open, inventory, exchange, and shipping rows reconcile. |
| 6 | [Production Preflight](phase-6-production-preflight.md) | Production is ready for the controlled migration/deploy. | Backup, env/provider matrix, migration plan, and rollback plan are signed off. |
| 7 | [Production Smoke + Limited Pilot](phase-7-production-smoke-limited-pilot.md) | Real production is tested with minimal blast radius. | Pilot has evidence and no launch-blocking errors. |

Cross-cutting future-proof admin plan: [Admin Content Studio Future-Proofing](../admin-content-studio-future-proofing.md).

## Global rules for every phase

1. **Do not mutate production before the phase gate allows it.**
2. **Staging/preview proves positive flows before production.**
3. **No fake payment approval path in production.** Fake slip checks must stay dry-run or staging-only.
4. **Admin UI is hidden from non-admins, and server routes still re-check admin status.**
5. **Evidence beats assumption.** Every phase ends with command output, screenshot, DB row IDs, provider dashboard settings, logs, or a written manual QA record.
6. **Same database, additive migration.** The plan must preserve existing LIFF tables/rows and not invent a bulk data migration unless the owner asks for it.

## Standard evidence packet

Every phase should leave a document in `../../verification/` or `.omx/artifacts/` with:

- date/time and operator;
- environment: local, staging, preview, or production;
- Vercel URL/deployment ID when relevant;
- Supabase ref and URL;
- migration versions applied or explicitly not applied;
- test user/admin public identifiers, never secrets;
- command output or screenshots;
- DB row IDs/public codes created by tests;
- pass/fail/blocked status;
- next action.

## RALPLAN-DR summary

### Principles

1. Protect existing LIFF users and production data first.
2. Prove with staging before production.
3. Keep admin operations server-authorized, not UI-only.
4. Make admin content extensible through data/config, not code edits.
5. Keep every phase independently reviewable and reversible where possible.

### Decision drivers

1. Production database risk: identity, wallet, gacha, payment, and admin changes affect real users and money.
2. Operational clarity: the owner needs to know what remains and how to accept each phase.
3. Future admin needs: adding categories, random packs, images, prize info, and payment/settings should become admin workflows instead of developer rewrites.

### Options considered

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| One master plan only | Fast, one file to maintain | Hard for owner to review/accept by phase | Rejected |
| One document per phase plus index | Easy to review, test, and close one phase at a time | More files to maintain | Chosen |
| Direct production cutover | Fastest live path | Highest risk to LIFF/data/money/admin | Rejected until staging and backup pass |
| Staging-first then production pilot | Lower risk, creates evidence before live users | More setup work | Chosen |

### Pre-mortem

1. **Production migration breaks LIFF** because a change is not additive or RLS/grants are wrong. Mitigation: staging clone/branch first, LIFF smoke checks, post-migration schema/RLS checks, and no production apply before backup.
2. **Provider callbacks are cross-wired** between staging and production. Mitigation: explicit provider/env matrix in Phase 3 and Phase 6.
3. **Admin can create packs but not future categories/images cleanly** because the current admin is still partly hardcoded. Mitigation: Phase 2/5 Content Studio lane and separate future-proofing doc.

### Expanded test plan

- Unit/static: `npm run verify:phase1`, `npm run verify:auth`, `npm run verify:platform`, `node tools/verification/verify-lucky-draw-plan.mjs`.
- Integration: staging migrations, RLS/policy checks, RPC checks, API auth/403/401 checks.
- E2E/manual: email/Google/LINE login, wallet top-up, admin approve/reject, gacha open, collection/exchange/shipping, admin content creation.
- Observability: Vercel logs, Supabase Auth logs, DB/RPC logs, payment/slip logs, audit events.

## Reference inputs

- Master readiness plan: `../ralplan-production-online-testing-readiness.md`
- Product PRD: `../prd-ynot-production-website.md`
- Product test spec: `../test-spec-ynot-production-website.md`
- Website status: `../../PROJECT_STATUS.md`
- Shared database plan: `../../../../Database/docs/plans/ralplan-liff-database-redesign.md`
- Existing migration files:
  - `../../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
  - `../../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
- Supabase docs checked on 2026-05-08:
  - Database backups: https://supabase.com/docs/guides/platform/backups
  - Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
  - Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
  - Data API / public schema grant behavior: https://supabase.com/changelog?tags=security
