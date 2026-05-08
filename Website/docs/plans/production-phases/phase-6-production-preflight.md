# Phase 6 — Production Preflight

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: **allowed only after owner go/no-go and backup gate**.

## Goal

Repeat the proven staging setup against production safely: backup, migrate, verify schema/RLS/RPC/env/provider settings, bootstrap owner/admin, and deploy the website for controlled production smoke.

## User stories

- As the owner, I want one final checklist before production is changed.
- As an operator, I want exact commands, refs, backups, envs, and rollback paths recorded.
- As a customer, I should not encounter half-migrated write flows.
- As an admin, I should be able to operate production after migration without direct SQL for normal tasks.

## Scope

Included:

- Final backup confirmation.
- Production env/provider matrix.
- Ordered production migration apply.
- Post-migration schema/RLS/RPC checks.
- Vercel production deploy/promote.
- Owner/admin bootstrap verification.
- Rollback/no-go decision.

Not included:

- Public marketing launch.
- Large customer cohort.
- Unbounded campaign publishing.

## Work plan

1. Confirm Phase 1 backup is current enough for the migration window.
2. Freeze production changes during the migration window.
3. Confirm exact target refs and URLs:
   - production Supabase ref: `szjoarkijeaspazbrchc`;
   - website domain: `https://www.ynottcg.com` and apex as configured;
   - LIFF domain/fallback targets;
   - Vercel production deployment/project.
4. Confirm provider/env matrix:
   - Supabase Auth site URL/redirects;
   - Google callback;
   - LINE callback/rich-menu/LIFF target;
   - payment/Slip2Go secrets or disabled/test policy;
   - service-role secret not exposed to client.
5. Apply migrations to production in order:
   1. `../../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
   2. `../../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
   3. optional Admin Content Studio migration only if it passed staging and owner approved it.
6. Verify schema, RLS, grants, RPCs, storage, and Data API exposure.
7. Deploy/promote production website build.
8. Bootstrap/verify owner/admin.
9. Run fail-closed checks before positive pilot.

## Acceptance criteria

- Fresh production backup and restore path are recorded.
- Migration operator, timestamp, commands, and output are recorded.
- Production schema contains all required objects.
- RLS is enabled and policies/grants are verified for exposed tables.
- Production app points to production Supabase, not staging.
- Provider callback URLs match production domains.
- Owner/admin can log in and access admin.
- Non-admin cannot access admin UI or APIs.
- Existing LIFF route/session still works or has a documented safe-fail status.
- Rollback/no-go actions are written before pilot begins.

## UAT

Owner/admin preflight checks:

1. Review backup evidence.
2. Review provider/env matrix.
3. Confirm owner/admin account.
4. Open production website after deploy.
5. Log in as owner/admin.
6. Log in or test as non-admin and confirm admin denial.
7. Open LIFF/rich-menu path and confirm it targets the intended app.
8. Approve or stop Phase 7 pilot based on evidence.

## Real tests / evidence

Minimum evidence:

- Backup ID/path and timestamp.
- Migration output/history.
- Production schema-object checklist.
- RLS/policy/grant checklist.
- Vercel deployment ID/commit.
- Provider callback matrix screenshots or typed record.
- Admin/non-admin route/API status evidence.
- LIFF compatibility smoke evidence.

Recommended checks:

- `npm run check` on the release commit.
- Production route smoke for customer/admin pages.
- Production guarded API smoke for 401/403 behavior before positive pilot.
- Supabase Auth logs and DB/RPC logs immediately after migration.

## Admin Content Studio checkpoint

If the Content Studio extension is part of first launch:

- It must have staging UAT evidence before applying to production.
- Production preflight must include storage bucket policies and image/object access rules.
- It must preserve historical campaign/gacha data when categories or packs are renamed/archived.

If not part of first launch:

- Production preflight must clearly state the launch limitation and list which admin content actions still require developer support.

## Stop rules

Stop before Phase 7 if:

- backup is not fresh/restore-ready;
- migration output is incomplete or failed;
- app points to wrong Supabase ref;
- provider callbacks are mismatched;
- owner/admin is locked out;
- non-admin can access admin;
- LIFF breaks unexpectedly;
- production logs show unexplained 5xx on critical routes.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-6-production-preflight.md`.

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
