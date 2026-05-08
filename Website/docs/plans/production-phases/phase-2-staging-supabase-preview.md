# Phase 2 — Staging Supabase + Preview Deployment

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: **not allowed in this phase**.

## Goal

Create a safe online environment where the real website can be tested with the real migrations and provider-style URLs without mutating production LIFF data.

## User stories

- As the owner, I want to test the website online before touching the live database.
- As an admin, I want to create/update campaigns, prizes, payment methods, and users in staging first.
- As a tester, I want a preview URL that is clearly not production and points only to staging Supabase.

## Scope

Included:

- Choose staging Supabase strategy: separate project, branch/clone, or documented fallback.
- Apply existing migrations to staging in order.
- Configure Vercel preview/staging env values.
- Seed safe test users/admin/campaigns/payment methods.
- Confirm RLS/Data API grants and RPC access in staging.
- Decide whether Admin Content Studio schema extensions are needed before pilot.

Not included:

- Production migration.
- Production provider callback switch.
- Real customer pilot.

## Work plan

1. Create or select staging Supabase:
   - preferred: separate staging project with sanitized seed/test data;
   - acceptable: Supabase branch/clone if backup/restore behavior is understood;
   - fallback: production shadow mode only if staging is blocked, with write-heavy routes disabled.
2. Apply migrations to staging in this order:
   1. `../../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
   2. `../../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
3. Verify staging schema/RLS/RPCs:
   - all Phase 1 and Phase 2 objects exist;
   - RLS is enabled on public/exposed tables;
   - explicit grants/policies exist where Data API access is needed;
   - service-role-only admin/RPC operations are not exposed to customers.
4. Configure Vercel preview/staging envs:
   - staging Supabase URL/anon/service role;
   - preview `NEXT_PUBLIC_SITE_URL`;
   - staging Google/LINE callback URLs if available;
   - payment provider test credentials or documented disabled state.
5. Deploy preview/staging.
6. Seed internal test data:
   - owner/admin profile;
   - non-admin user;
   - payment method;
   - at least one Pokemon and one One Piece pack;
   - cards/prize pool.

## Acceptance criteria

- Staging Supabase ref is documented and is not the production ref.
- Vercel preview URL points to staging Supabase only.
- Both website migrations apply cleanly in staging.
- `profiles`, identity tables, wallet/top-up, gacha, collection, exchange, shipping, settings, ranking, and audit objects exist in staging.
- RLS/policy/grant checks pass for public/exposed schema tables.
- Existing LIFF-shaped read/session flows still work against staging seed/clone data.
- Admin and customer routes load online in preview without production writes.

## UAT

Owner/admin checks in preview:

1. Open preview home and confirm it is marked or known as staging/preview.
2. Log in as the owner/admin test account.
3. Open `/admin` and confirm admin pages load.
4. Log in as a non-admin and confirm `/admin` is hidden/blocked.
5. Open customer pages: home, detail, open, collection, ranking, exchange, shipping, wallet, profile.
6. Confirm no test action writes to production Supabase.

## Real tests / evidence

Minimum evidence:

- Migration apply output or migration history from staging.
- Schema-object checklist output.
- RLS/policy/grant checklist output.
- Preview route smoke output.
- Admin API 403 output for non-admin.
- Environment matrix showing preview URLs and staging Supabase ref.

Recommended commands/checks:

- `npm run check` locally before preview deploy.
- `npx supabase migration list` against staging.
- Staging DB object query for all new tables/functions/policies.
- Preview smoke for customer/admin/API routes.

## Admin Content Studio checkpoint

Phase 2 is the safest place to prototype the future admin model:

- If the owner wants admins to add new categories/packs/images/prize info without developer edits before public launch, create a **new staged migration** for:
  - `store_categories`;
  - `media_assets` or a storage-backed asset registry;
  - `draw_rounds.category_id`, pack cover/banner/copy/rules fields;
  - optional content/audit metadata.
- Do not apply this extension to production until it passes staging UAT and owner review.
- If postponed, record the launch limitation: first pilot only supports the currently hardcoded category model.

## Stop rules

Stop before Phase 3 if:

- staging cannot be isolated from production;
- migrations do not apply cleanly;
- Data API/RLS grants are unclear;
- preview points to the production Supabase ref by mistake;
- non-admin can access admin APIs.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-2-staging-preview.md`.

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
