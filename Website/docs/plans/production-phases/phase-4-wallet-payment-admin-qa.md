# Phase 4 — Wallet + Manual Payment + Admin QA

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: staging only unless Phase 6 has begun.

## Goal

Prove the first money-related flow safely: customer manual top-up request, slip upload, admin approve/reject, wallet credit, ledger reconciliation, and duplicate/idempotency protection.

## User stories

- As a customer, I can see payment instructions and submit a top-up with a slip.
- As an admin, I can approve a valid test top-up and reject another top-up with a reason.
- As the owner, wallet balance changes exactly once and every money action has an audit/ledger trail.
- As an operator, fake slip acceptance is impossible in production except via a dry-run test endpoint that does not mutate money state.

## Scope

Included:

- Admin payment method setup.
- Customer top-up request and slip upload.
- Admin top-up approval/rejection.
- Wallet balance and `coin_ledger` verification.
- Duplicate approval/idempotency checks.
- Audit event/log verification.

Not included:

- Real card/payment gateway automation unless separately approved.
- Production fake slip approval.
- Public launch.

## Work plan

1. Configure staging payment method through `/admin/settings`.
2. Customer submits top-up request with staging/test slip.
3. Admin approves one top-up.
4. Verify:
   - `top_up_requests` status;
   - `payment_slips` owner association;
   - `wallet_accounts.balance_coins`;
   - `coin_ledger` credit row;
   - audit event.
5. Attempt repeat approval and verify no double credit.
6. Submit and reject a separate top-up; verify no credit.
7. Confirm non-admin cannot approve/reject.
8. Document payment provider/test-mode policy.

## Acceptance criteria

- Payment method can be created/edited by admin only.
- Customer can submit top-up request in staging.
- Slip upload is stored in the intended storage bucket/path and associated with the request.
- Approval credits wallet exactly once.
- Re-approval/retry cannot double-credit wallet.
- Rejection does not credit wallet.
- Ledger, top-up status, slip row, and audit evidence reconcile.
- Non-admin admin top-up API receives 403.
- Production fake payment approval remains blocked/not present.

## UAT

Owner/admin/customer checks in staging:

1. Admin sets bank/QR payment method.
2. Customer opens wallet page and submits top-up request.
3. Admin approves first request.
4. Customer refreshes wallet and sees updated balance.
5. Admin rejects second request.
6. Owner reviews evidence file and confirms ledger reconciliation.

## Real tests / evidence

Minimum evidence:

- Payment method row ID.
- Top-up request IDs for approve and reject paths.
- Slip object path/row ID.
- Wallet account before/after balance.
- Ledger row and idempotency/reference key.
- Admin/non-admin API status evidence.
- Audit event row IDs.

Recommended checks:

- `npm run verify:platform` locally before staging.
- Staging API calls or browser UAT screenshots for wallet/admin top-up pages.
- DB assertions for exactly-one ledger credit per approved top-up.
- Vercel/Supabase logs for RPC errors.

## Admin Content Studio checkpoint

Payment/settings admin must stay separate from content admin:

- Content editors should not be able to approve top-ups unless they also have finance permission.
- If role split is not implemented for first pilot, document that only owner/admin accounts can operate both content and finance.

## Stop rules

Stop before Phase 5 if:

- wallet can double-credit;
- top-up approval lacks ledger/audit evidence;
- fake/test slip path can mutate production money state;
- non-admin can approve/reject;
- storage object access is too public or unclear.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-4-wallet-payment-admin.md`.

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
