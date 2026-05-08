# Phase 7 — Production Smoke + Limited Pilot

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: limited, internal, evidence-recorded pilot only.

## Goal

Prove the live production journey with minimal blast radius before public launch.

## User stories

- As the owner, I want to know the website really works in production before inviting normal users.
- As a pilot customer, I can log in, top up, open a pack, view collection, exchange, and request shipping.
- As an admin, I can process pilot top-ups/exchange/shipping without direct database edits.
- As an operator, I can stop the pilot quickly if logs or data reconciliation show a problem.

## Scope

Included:

- Internal owner/test-user production smoke.
- Limited pilot campaign or hidden/internal pack.
- Minimal top-up/payment test under documented policy.
- One gacha open, collection check, exchange path, shipping path.
- Admin operational checks.
- Monitoring and go/no-go recommendation.

Not included:

- Full public launch.
- High-volume campaign.
- Paid marketing.
- Irreversible data cleanup unless separately approved.

## Work plan

1. Confirm Phase 6 preflight passed.
2. Enable only the intended pilot campaign or internal pack.
3. Test production as owner/admin:
   - login;
   - admin dashboard;
   - payment method/campaign/prize data visible.
4. Test production as internal customer:
   - email/Google/LINE path selected for pilot;
   - wallet/top-up according to safe policy;
   - gacha open;
   - collection item appears;
   - exchange request;
   - shipping request.
5. Admin processes pilot operations.
6. Reconcile DB rows, ledger, audit events, and logs.
7. Monitor production logs for a defined window.
8. Produce go/no-go recommendation for wider launch.

## Acceptance criteria

- Production route smoke passes for all first-release customer/admin pages.
- Owner/admin can operate without direct SQL for normal tasks.
- Non-admin remains blocked from admin.
- Pilot user can complete the chosen login path.
- Wallet top-up policy is followed and ledger reconciles.
- Gacha creates collection item and wallet debit evidence.
- Exchange and shipping flows reconcile to rows/audit.
- No unexplained production 5xx or security errors appear during pilot window.
- Rollback/disable plan remains available.
- Owner has a written go/no-go summary.

## UAT

Owner/admin/customer production pilot checks:

1. Open `https://www.ynottcg.com`.
2. Complete the selected login path with internal account.
3. Owner/admin opens `/admin`.
4. Customer opens one pilot pack.
5. Customer checks collection.
6. Customer submits one exchange or one shipping request.
7. Admin processes the request.
8. Owner reviews evidence packet and decides whether to widen launch.

## Real tests / evidence

Minimum evidence:

- Vercel deployment ID and commit.
- Production Supabase ref.
- Route smoke output.
- Login provider used and success evidence.
- Top-up/wallet/ledger row IDs if money path is tested.
- Gacha/collection row IDs.
- Exchange/shipping row IDs if tested.
- Admin audit event IDs.
- Vercel/Supabase log review notes.
- Go/no-go decision.

Recommended checks:

- Production route smoke for `/`, detail/open, collection, ranking, exchange, shipping, wallet, profile, login, signup, and admin pages.
- Guarded API smoke for 401/403.
- Supabase Auth, DB/RPC, and Storage logs during pilot.
- Manual screenshots of critical UAT steps.

## Admin Content Studio checkpoint

For the pilot:

- Prefer one hidden/internal pilot pack first.
- If Content Studio is live, use it to create/preview/publish/close the pilot pack.
- If Content Studio is postponed, do not promise admins can add arbitrary new categories/images without developer support yet.
- Record any missing admin workflow as a Phase 8 backlog item before wider launch.

## Stop rules

Stop/widen no further if:

- wallet/ledger does not reconcile;
- gacha open debits without item evidence;
- admin route leaks to non-admin;
- provider login breaks for pilot users;
- LIFF path regresses;
- production errors exceed the agreed threshold;
- owner/admin cannot safely operate pilot actions.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-7-production-pilot.md`.

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
