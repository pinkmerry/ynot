# 2026-05-11 Auth Login v2 Verification

## Scope

Implemented the approved v2 login plan's local/code-owned slice:

- Use Supabase default email/password confirmation for first account-creation testing.
- Keep Google and LINE as visible auth options.
- Remove unsupported Apple sign-in from login/signup.
- Do not apply production Supabase migrations.
- Do not configure external Supabase/Google/LINE dashboards from code.

## Changed files

- `src/features/auth/AuthForm.tsx`
  - Removed the nonfunctional Apple sign-in button.
  - Login/signup now show Google, LINE, and email/password only.
- `src/app/globals.css`
  - Removed unused Apple auth-button styling.
- `tools/verification/verify-auth-foundation.mjs`
  - Added static checks proving Apple sign-in is absent while Google, LINE, and email/password remain wired.
- `docs/PROJECT_STATUS.md`
  - Updated current auth/UI status to remove Apple from the active login surface.

## Verification evidence

### Static auth verification

Command:

```bash
cd Website
npm run verify:auth
```

Result: passed.

Important added passes:

- `PASS auth form does not show unsupported Apple sign in`
- `PASS auth form still offers Google sign in`
- `PASS auth form still offers LINE sign in`
- `PASS auth form still offers email password account creation`

### Full local verification gate

Command:

```bash
cd Website
npm run check
```

Result: passed, including:

- `npm run lint`
- `npm run typecheck`
- `npm run verify:ynot`
- `npm run build`

Build result: Next.js production build completed successfully.

### Rendered auth-page smoke

Server:

```bash
cd Website
PORT=3005 npm run start
```

Rendered pages checked:

- `http://localhost:3005/login`
- `http://localhost:3005/signup`
- `http://localhost:3005/api/line/login/start?mode=login&next=/profile`

Evidence files:

- `docs/verification/evidence/2026-05-11-auth-login-v2/login.html`
- `docs/verification/evidence/2026-05-11-auth-login-v2/signup.html`
- `docs/verification/evidence/2026-05-11-auth-login-v2/line-start.txt`

Rendered-page assertions passed:

- Login has Google.
- Login has LINE.
- Login has password submit.
- Signup has Google.
- Signup has LINE.
- Signup has create account.
- Login has no Apple sign-in UI.
- Signup has no Apple sign-in UI.

LINE local start route result: `503 LINE login channel secret is not configured.` This is expected when the local/server environment lacks `LINE_LOGIN_CHANNEL_SECRET`; the route fails closed instead of pretending LINE is ready.

### Production DB readiness

Command:

```bash
cd Website
npm run verify:production-db
```

Result: failed with expected blockers because production Supabase still lacks required random-pack/spin workflow schema and RPCs. No production migration was applied in this slice.

Blocker summary:

- Missing tables including `store_categories`, `draw_round_categories`, `draw_round_prize_units`, `seed_runs`, and `campaign_approvals`.
- Missing spin/workflow columns on `draw_rounds` and prize policy columns on `draw_round_prizes`.
- Missing workflow/inventory RPCs including `get_draw_round_inventory_summary`, campaign workflow RPCs, and `update_campaign_spin_config`.

## Remaining external gates

The following cannot be completed purely from local code without dashboard/credential authority:

1. Rotate/revoke the previously exposed Supabase access/service-role credentials.
2. Confirm Supabase Auth Site URL and Additional Redirect URLs.
3. Confirm Supabase email/password confirmation delivery to the intended test email.
4. Configure/verify Google OAuth in Google Cloud and Supabase Auth provider settings.
5. Configure/verify LINE Login channel secret, callback URLs, and rich-menu/LIFF URL alignment.
6. Apply production Supabase migrations only after backup/PITR/restore-drill and staging/branch verification.

## Conclusion

The code-owned Track A UI and static verification slice is complete. The app is locally buildable and the rendered login/signup pages expose only the intended auth choices: Google, LINE, and email/password create account. Full live login and random-pack testing remain blocked by external provider configuration and production database safety gates.
