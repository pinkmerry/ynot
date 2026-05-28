# Production Security Checklist

Run through this list before flipping `www.ynotopen.com` to production traffic and before every quarterly review.

The code changes from the security audit are committed; this file covers the human/operational steps that no code can do for you.

## Pre-launch (must pass before going live)

### 1. Verify production env vars and secrets

Run on a host that has the production environment loaded (e.g. `wrangler secret list` + dashboard vars):

```bash
cd Website
YNOT_ENV=production npm run verify:production-env
```

Required to pass:

- All secrets present: `SUPABASE_SERVICE_ROLE_KEY`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_SESSION_SECRET`, `SLIP2GO_SECRET_KEY`, `RESEND_API_KEY`
- `LINE_SESSION_SECRET` is at least 32 random chars and is **not** the dev placeholder
- `NEXT_PUBLIC_SITE_URL` is https
- `RATE_LIMIT_BACKEND=supabase`
- `SLIP2GO_API_URL` points at `connect.slip2go.com` (the client-side allowlist will reject anything else)
- `YNOT_ENABLE_DEV_AUTH` is **unset** (the dev-auth bypasses require BOTH `NODE_ENV != production` AND this flag — production should never satisfy either)
- `NODE_ENV=production` on the Worker (Cloudflare sets this for production deployments, but verify)

### 2. Apply the new database migrations

The audit added two migrations:

- `20260528000000_audit_actor_semantics.sql` — fixes `revoke_profile_sessions` to populate `actor_profile_id` with the caller, not the target
- `20260528000001_payment_slips_storage_policies.sql` — explicit deny for anon/authenticated on the `payment-slips` storage bucket

```bash
# Apply via Supabase CLI or your existing migration pipeline.
supabase db push
```

### 3. RLS / search_path coverage check

```bash
cd Website
npm run verify:hardening
```

This runs `verify-rls-coverage.mjs` which asserts every `public` table has RLS enabled, every SECURITY DEFINER function sets `search_path`, and the `admin_users` table has no grants to `anon`/`authenticated`. Should be green; if it isn't, a new migration regressed coverage.

### 4. Configure the security-alert webhook

Set `YNOT_SECURITY_ALERT_WEBHOOK` in Cloudflare secrets to a Slack/Discord/PagerDuty webhook URL. Alerts fire on:

- Admin role grants (especially owner)
- Admin role revocations
- Profile session revocations
- Top-up approvals above `LARGE_TOP_UP_THB_THRESHOLD` (5000 THB)

Without the webhook, the audit trail still records everything in `audit_events` — but nobody reads audit logs, so the push channel is what catches abuse in time.

### 5. Cloudflare WAF and bot protection

In the Cloudflare dashboard for the `ynotopen.com` zone:

- **Security → WAF → Managed Rules:** enable the free "Cloudflare Managed Ruleset" with the default sensitivity
- **Security → Bots → Bot Fight Mode:** turn on
- **Security → WAF → Custom rules:** add a request-size limit
  - Rule: `(http.request.body.size gt 12582912)` → Block (12 MB — gives a little headroom over the 10 MB application-level cap on payment slips)
- **Speed → Caching → Cache Rules:** confirm `/api/*` is not cached

### 6. Supabase Storage bucket sanity

```sql
-- Run in the Supabase SQL editor against production.
select * from storage.buckets where id = 'payment-slips';
-- Expected: public=false, allowed_mime_types includes image/jpeg+png+webp+pdf.

select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like '%payment-slips%';
-- Expected: 8 rows (4 anon deny + 4 authenticated deny) after migration applies.
```

### 7. Enable MFA for owner-tier admins

Supabase Auth supports TOTP MFA. For every active row in `admin_users` where `role = 'owner'`:

1. Have the owner sign into the admin UI
2. Enroll a TOTP factor in their Supabase user settings
3. Confirm enrollment in `auth.mfa_factors` (`select * from auth.mfa_factors where status = 'verified'`)

Owners can grant owner role to anyone — they are the highest-blast-radius account in the system.

### 8. Final smoke test

```bash
cd Website
npm run check  # lint + typecheck + verify suite + build
```

Then manually:

- `POST /api/auth/email-otp/send` with a junk email → expect generic 400, no provider details leaked
- `GET /api/dev/preview-auth?mode=on` on production → expect 404
- `GET /api/debug/whoami` on production → expect 404
- Open a wallet top-up with a >10MB slip → expect 413 before the upload buffers

## First 90 days

### 9. Rotate `LINE_SESSION_SECRET`

Schedule: every 90 days, plus immediately after any suspected compromise.

```bash
# 1. Mint a new secret
openssl rand -base64 48

# 2. Update Cloudflare secret
wrangler secret put LINE_SESSION_SECRET --config wrangler.website.ci.jsonc

# 3. Deploy. Every existing LINE-only session is invalidated; Supabase-auth
#    users are unaffected. Communicate the forced re-login in advance.
```

Per-user scalpel-revoke (e.g. compromised account) is via the `revoke_profile_sessions` RPC — no global re-login needed.

### 10. Review the dependency dashboard

Renovate runs weekly and groups minor/patch updates. Approve the bundled PR, run `npm run check` locally, and merge. Major-version PRs land separately — read the release notes before approving.

### 11. Audit log spot check

Once a month:

```sql
-- New admin rows last 30 days
select * from admin_users where created_at > now() - interval '30 days';

-- Owner-role escalations last 30 days
select * from audit_events
where event_type = 'admin_role_updated'
  and metadata->>'role' = 'owner'
  and created_at > now() - interval '30 days';

-- Top-up approvals over 5000 THB last 30 days
select ae.*, tu.amount_thb
from audit_events ae
join top_up_requests tu on tu.id = ae.top_up_request_id
where ae.event_type in ('top_up_approved', 'top_up_submitted')
  and tu.amount_thb >= 5000
  and ae.created_at > now() - interval '30 days';
```

Compare against the alert webhook firings — anything in the SQL that's missing from your alert channel is a gap to close.

## Quarterly / annual

### 12. Dependency vulnerability audit

```bash
cd Website
npm audit --omit=dev      # Production deps only — should be 0
npm audit                 # Including dev — investigate any high/critical
```

Renovate's vulnerability alerts cover this in-flight; this is the quarterly belt-and-braces check.

### 13. Penetration test cadence

Before launch: external pentest of auth + wallet + admin surfaces.

Annually: re-test with a new vendor (different eyes catch different bugs).

After any major architectural change (e.g. extracting LIFF into its own app): re-test the changed surface area.

### 14. Subdomain / CORS decision (deferred)

If/when `liff.ynotopen.com` is split out:

- **Option A** — Shared session: set `Domain=.ynotopen.com` on the session cookie + explicit CORS allowlist of the two hosts. Easier UX, larger blast radius if either subdomain is compromised.
- **Option B** — Separate sessions per host: no domain attribute, no cross-host CORS. Cleaner isolation, users sign in twice.

Default until decided: leave cookies host-scoped (current behavior).

## Reference

- Audit report: see the security review conversation
- Migrations added: `20260528000000_audit_actor_semantics.sql`, `20260528000001_payment_slips_storage_policies.sql`
- New helpers: [src/lib/security/dev-auth.ts](../../src/lib/security/dev-auth.ts), [src/lib/security/alerts.ts](../../src/lib/security/alerts.ts)
- New verification scripts: `tools/verification/verify-rls-coverage.mjs`, `tools/verification/verify-production-env.mjs`
- Renovate config: [renovate.json](../../../renovate.json)
