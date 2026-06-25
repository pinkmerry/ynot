# Phase 1 — Production Data Inventory + Backup

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: **not allowed in this phase**.

## Goal

Know exactly what exists in the live Supabase/LIFF database and secure a restore-ready backup before any migration or production deployment changes.

## User stories

- As the owner, I want my existing LIFF users/admin/data protected before the website changes go live.
- As an operator, I want a clear list of current tables, counts, storage buckets, RPCs, and missing website schema so no one guesses.
- As a developer/admin, I want a backup and restore plan that can be followed if migration fails.

## Scope

Included:

- Confirm production Supabase ref `szjoarkijeaspazbrchc` and current schema state.
- Record existing LIFF table counts and storage buckets.
- Confirm which website tables/columns/RPCs are missing.
- Capture migration runbook inputs.
- Produce full-backup evidence and a restore drill/restore command.

Not included:

- Applying website migrations.
- Changing provider settings.
- Deploying production write paths.
- Copying/migrating data into new domain tables.

## Work plan

1. Confirm the live Supabase project ref and API URL used by the production website.
2. Export/read-only inventory:
   - core LIFF tables: `profiles`, `admin_users`, `draw_rounds`, `orders`, `payment_slips`, `order_picks`, `cards`, `draw_round_prizes`, `lucky_draw_realtime_events`;
   - storage buckets: `payment-slips`, `lucky-draw-assets`;
   - RPCs/functions used by LIFF and website.
3. Confirm schema gaps against required website migration objects:
   - `profiles.auth_user_id`, `user_identities`, `user_addresses`, `app_realtime_events`;
   - wallet/top-up/ledger/idempotency tables;
   - gacha/collection/exchange/shipping tables;
   - `site_settings`, `ranking_snapshots`;
   - required RPCs and policies.
4. Create backup evidence:
   - Dashboard backup identifier, PITR/physical backup status, or CLI/logical backup path;
   - storage backup/export strategy for objects because DB backups do not restore deleted Storage objects by themselves;
   - restore drill target or documented restore command.
5. Save evidence in `../../verification/` or `.omx/artifacts/`.

## Acceptance criteria

- Production Supabase ref and URL are recorded.
- Current schema and table-count evidence exists.
- Missing website schema objects are explicitly listed.
- Full database backup evidence exists, not only a REST row export.
- Storage backup/export plan exists for user-uploaded objects.
- Restore drill or restore command is documented.
- No production schema/data write occurred.
- Owner/admin account rows are confirmed or clearly marked as needing Phase 3 verification.

## UAT

Owner-facing checks:

1. Open current LIFF route and confirm existing LIFF app still loads.
2. Open current website production URL and confirm it still fails closed for write-heavy flows instead of corrupting data.
3. Review the phase evidence file and confirm:
   - Supabase ref is correct;
   - backup evidence is understandable;
   - no production migration has run yet.

## Real tests / evidence

Minimum evidence:

- Read-only table count output for existing LIFF tables.
- Read-only schema check output showing missing website objects.
- Backup evidence ID/path and timestamp.
- Restore command or restore drill note.
- `npx supabase --version` and available SQL execution method (`supabase db`, SQL editor, MCP, or direct Postgres URL).

Recommended commands/checks:

- `npx supabase --version`
- `npx supabase migration list` once project access is available.
- Read-only SQL/API checks for table existence and row counts.

## Admin Content Studio checkpoint

Inventory the current admin content model before designing changes:

- Current code still stores storefront categories/status filters in `src/features/ynot/storefront-content.ts`.
- Current admin can manage campaigns/cards/prizes but campaign `series` is limited to `pokemon` and `one_piece` in current API validation.
- Phase 1 output should list the tables/columns missing for future admin-created categories, image assets, pack copy, and flexible prize configuration.

## Stop rules

Stop before Phase 2 if:

- backup evidence is missing;
- SQL execution path is missing;
- production ref is uncertain;
- LIFF smoke is already broken before migration;
- storage backup/export responsibility is unclear.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-1-production-inventory-backup.md`.

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
