# Security hardening runbook

This runbook covers the operator steps required to deploy the security-review
remediation PR. The repo changes alone are not sufficient — three of the four
findings require operator action against the Supabase or Vercel dashboards.

## Pre-deploy checklist

### 1. Supabase Auth — raise password minimum to 12

The sign-up form now rejects passwords shorter than 12 characters
(`src/features/auth/actions.ts`). The form check is server-side but runs in
the Next.js app — a caller who knows the Supabase publishable key can hit
`supabase.auth.signUp()` directly with the anon key and bypass the form.
The load-bearing fix is the Supabase Auth dashboard policy.

Steps:

1. Open the Supabase dashboard → Authentication → Policies (or Providers ›
   Email) → Password strength.
2. Set "Minimum length" to **12**.
3. Save.

This change applies to sign-up and password reset. Existing users with shorter
passwords can still log in — login does not enforce a length check.

### 2. Vercel — attest the dashboard change

After step 1 lands in the Supabase dashboard, set this environment variable
in every Vercel environment (Production, Preview, Development):

```
SUPABASE_AUTH_PASSWORD_MIN_VERIFIED=12
```

The CI verifier `verify:hardening` reads this env var and fails the build if
it is unset or any value other than `"12"`. This is an operator attestation
gate, not a runtime probe — the value of the flag is a statement that you
have set the dashboard minimum to 12.

### 3. Vercel — never set ENABLE_DEBUG_ENDPOINTS in production

The `/api/debug/whoami` route is gated:

```ts
if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_ENDPOINTS !== "true") {
  return 404;
}
```

Vercel builds all environments (Production AND Preview) with
`NODE_ENV=production`, so the gate keeps preview deployments locked unless
`ENABLE_DEBUG_ENDPOINTS=true` is explicitly added to that environment.

- **Production:** leave `ENABLE_DEBUG_ENDPOINTS` unset.
- **Preview:** leave `ENABLE_DEBUG_ENDPOINTS` unset by default.
- **Local dev:** the gate is open automatically (`NODE_ENV=development`).

If you need temporary preview access for debugging, set
`ENABLE_DEBUG_ENDPOINTS=true` on that specific preview environment and remove
it after debugging.

## Verification

Run from `Website/`:

```bash
SUPABASE_AUTH_PASSWORD_MIN_VERIFIED=12 npm run check
```

The chain runs lint, typecheck, the upload magic-byte tests, the hardening
verifier, the production-test verifier, and the build.

Manual smoke tests after deploy:

```bash
# 1. whoami is closed on production
curl -sI https://www.ynottcg.com/api/debug/whoami | head -1
# Expected: HTTP/2 404

# 2. Security headers shipped
curl -sI https://www.ynottcg.com/ | grep -iE "strict-transport|x-frame|x-content-type|referrer|permissions"

# 3. Sign-up rejects an 11-char password
# (manual browser test from the /signup form)
```

## Follow-up PR — Content-Security-Policy

CSP was intentionally deferred from this PR because the live-draw page embeds
a YouTube iframe and the policy must list a working `frame-src` and
canonical-domain set before it can ship. The follow-up PR will add:

- Full CSP directive set including
  `frame-src https://www.youtube.com https://www.youtube-nocookie.com` and
  `img-src ... https://i.ytimg.com`.
- A `/api/csp/report` endpoint that logs violations to `audit_events` so
  Report-Only mode is observable.
- `frame-ancestors 'none'` to replace the existing `X-Frame-Options: DENY`
  (the latter will be removed at that time).
- `'unsafe-eval'` gated on `NODE_ENV !== "production"` so it never reaches
  production builds.
- Adding `preload` to the HSTS header after a soak window at the long
  `max-age` value.

Until that PR lands, `X-Frame-Options: DENY` is the sole clickjacking defense.
This is adequate because the LIFF login flow lives in a separate repo and
never iframes this site.
