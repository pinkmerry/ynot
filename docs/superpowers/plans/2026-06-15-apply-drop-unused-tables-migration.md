# Apply Drop-Unused-Tables Migration to Production (Gated Runbook)

> **For agentic workers:** This is an operational runbook, not a TDD code plan. The migration code already exists and is committed; this plan governs its SAFE application to production. Do NOT execute the production steps until the gate in Phase 0 is satisfied and the owner gives an explicit go.

**Goal:** Apply the already-committed migration `20260615000000_drop_unused_site_settings_email_otps.sql` (drops `public.site_settings` and `public.email_otps`) to production safely, after the backup/PITR gate.

**Why gated:** Per `AGENTS.md` and `Website/docs/PROJECT_STATUS.md`, production Supabase migrations require a backup/PITR confirmation, SQL review, non-prod verification, and an explicit owner go/no-go. This is a `drop table` — irreversible without backup — so the gate is mandatory even though both tables are verified-unused.

**Risk: LOW.** Both tables have **zero** application/type/guard references and **no inbound foreign keys** (verified; `test:drop-unused-tables-safety` enforces it), so `cascade` cannot drag a live table along. The only residual risk is the generic "prod migration" risk, fully mitigated by the backup + non-prod dry run below.

---

## Phase 0 — Gate (all must be true before any prod step)

- [ ] **Owner go/no-go** explicitly given for this specific migration.
- [ ] **Production backup confirmed** (fresh logical backup OR PITR window confirmed to cover the change), per the precedent in `PROJECT_STATUS.md` (the 2026-05-28 owner-override backup/PITR note).
- [ ] **SQL reviewed**: the migration is exactly two `drop table if exists public.<t> cascade;` statements and nothing else (`git show 49f3b53 -- Database/supabase/migrations/20260615000000_drop_unused_site_settings_email_otps.sql`).
- [ ] **Branch up to date**: the migration is merged to `main` (or on the branch being deployed). Confirm the website code that ships alongside has no reference to either table (already true; the `site_settings` types block was removed in the same commit).

If any item is false, STOP. Do not proceed.

---

## Phase 1 — Non-prod dry run (no gate needed; do this first)

- [ ] **Step 1: Apply on a throwaway Supabase branch / preview (no prod data).**

Use the project's established branch tooling (Supabase CLI linked mode or a Management API preview branch, per `docs/verification/2026-05-28-supabase-security-migration.md`). Apply migrations through `20260615000000`.

- [ ] **Step 2: Confirm both tables are gone.**

Run on the branch:
```sql
select to_regclass('public.site_settings') as site_settings,
       to_regclass('public.email_otps')   as email_otps;
```
Expected: both columns return `NULL`.

- [ ] **Step 3: Confirm the app boots and guards pass against that environment.**

```bash
cd "Website" && npm run typecheck && npm run verify:platform && npm run test:drop-unused-tables-safety
```
Expected: exit 0. (These don't hit the live DB, but confirm the shipped code matches the post-migration schema.)

---

## Phase 2 — Production application (ONLY after Phase 0 gate is satisfied)

- [ ] **Step 1: Re-confirm the backup/PITR timestamp** immediately before applying. Note it in `docs/verification/`.

- [ ] **Step 2: Apply the single migration to prod** using the established mechanism (Supabase CLI linked mode / Management API SQL, matching the `PROJECT_STATUS.md` migration-history workflow). Apply only up to `20260615000000`; do not bundle unrelated pending migrations.

- [ ] **Step 3: Verify prod schema.**
```sql
select to_regclass('public.site_settings'), to_regclass('public.email_otps');
```
Expected: two `NULL`s.

- [ ] **Step 4: Verify app health** — load the storefront, a pack detail, and the admin pack list; confirm no errors referencing the dropped tables in `get_logs` / runtime logs.

- [ ] **Step 5: Regenerate types from the live schema** and confirm the `site_settings` block does not reappear (it should match the hand-edit already on `main`). No code change expected.

- [ ] **Step 6: Record evidence** in `docs/verification/2026-06-15-drop-unused-tables.md` (timestamp, backup ref, before/after `to_regclass`, who approved).

---

## Rollback (unlikely — both tables are unused)

If a rollback is ever required, recreate each table from its original creating migration:
- `site_settings`: re-run the `create table public.site_settings ...` + its RLS policy + `touch_updated_at` trigger from `Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql` (around line 280).
- `email_otps`: re-run the `create table public.email_otps ...` + indexes + RLS + grants from `Database/supabase/migrations/20260513000000_identity_first_anchors.sql` (around line 26).

Because nothing reads or writes either table, there is no data to restore — recreating the empty structures is sufficient. Prefer restoring from the Phase-0 backup if available.

---

## Self-Review

- **Coverage:** gate (Phase 0), dry run (Phase 1), prod apply + verify (Phase 2), rollback. Matches the AGENTS.md gated-migration requirement.
- **No placeholders:** exact verification SQL, exact commands, exact source-migration references for rollback.
- **Scope:** applies ONLY the one committed migration; does not touch other pending/deferred migrations.
