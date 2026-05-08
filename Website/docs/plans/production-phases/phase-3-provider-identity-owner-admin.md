# Phase 3 — Provider + Identity + Owner/Admin Verification

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: staging only unless Phase 6 has begun.

## Goal

Prove account identity and admin access work for the normal website while preserving existing LIFF behavior.

## User stories

- As a customer, I can sign up/login with email and Google.
- As a LINE user, I can connect or reconnect LINE and the server creates a real profile/session, not just a client-side LIFF state.
- As the owner, my account is active owner/admin and I can access admin tools.
- As a non-admin, I cannot see or use admin tools.
- As an operator, I can identify and resolve account merge conflicts safely.

## Scope

Included:

- Email/password signup/login.
- Google OAuth callback.
- LINE login/link/reconnect and LIFF compatibility.
- Account identity bridge rows in `profiles` and `user_identities`.
- Admin owner bootstrap and non-admin denial.
- Account merge request path when LINE identity already belongs to another profile.

Not included:

- Wallet crediting/payment approval.
- Gacha positive flow.
- Production provider cutover unless Phase 6 gate is reached.

## Work plan

1. Configure staging provider callbacks:
   - Supabase Auth site URL/redirects;
   - Google authorized redirect URI;
   - LINE channel callback URL;
   - LIFF/rich-menu URL target for staging if used.
2. Test email/password signup/login.
3. Test Google login.
4. Test LINE login/link/reconnect:
   - confirm `/api/line/session` or website LINE callback creates/updates server-backed profile state;
   - confirm `profileId`/profile row exists;
   - confirm old users can reconnect.
5. Test merge conflict path:
   - identity already belongs to another profile;
   - merge request is created;
   - admin can see and decide it.
6. Verify owner/admin:
   - owner profile row exists;
   - active `admin_users` row exists with owner/admin role;
   - UI shows admin only to admin;
   - server APIs reject non-admin.

## Acceptance criteria

- Email user can create session and resolve profile.
- Google user can create session and resolve profile.
- LINE user connection is server-backed; LIFF client state alone is not accepted as success.
- `profiles.auth_user_id` and `user_identities` behavior is verified in staging.
- Existing LIFF login/session path still works or fails closed with a documented provider-config reason.
- Owner/admin can access `/admin` and mutate allowed admin staging data.
- Non-admin cannot see admin nav and receives 403 from admin APIs.
- Merge request path creates auditable rows and does not auto-merge without admin approval.

## UAT

Owner/admin checks in staging:

1. Create or log into an email account.
2. Log out, then log in with Google.
3. Connect LINE from profile.
4. If possible, open LIFF/rich-menu staging route and confirm it reaches the intended URL.
5. Open admin dashboard as owner/admin.
6. Open the same admin URL as non-admin and confirm blocked state.
7. Trigger or simulate a merge conflict and review it in admin.

## Real tests / evidence

Minimum evidence:

- Auth provider callback matrix with exact URLs.
- Supabase Auth user/profile/identity row evidence for each provider.
- `/api/line/session` or LINE callback evidence showing server-backed profile/session success.
- Admin/non-admin route/API screenshots or HTTP status output.
- Merge request row evidence if tested.

Recommended checks:

- `npm run verify:auth` locally before staging.
- Staging route smoke for `/login`, `/signup`, `/auth/callback`, `/profile`, `/admin`.
- DB row checks for `profiles`, `user_identities`, `admin_users`, `account_merge_requests`.

## Admin Content Studio checkpoint

Before admin content is expanded, confirm the permission model:

- Current launch can use `owner` and `admin` only.
- If future role split is desired, design `content_editor`, `finance_admin`, and `ops_admin` as a later schema/API change.
- Any new content role must be enforced server-side, not only by UI hiding.

## Stop rules

Stop before Phase 4 if:

- provider callbacks cannot be verified;
- owner/admin is not confirmed;
- non-admin can access admin APIs;
- LINE state looks connected on client but no server profile/session exists;
- merge conflicts auto-link accounts without admin review.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-3-provider-identity-admin.md`.

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
