# Cloudflare Migration Runbook

Date: 2026-05-17
Updated: 2026-06-25 for the website-only Cloudflare deploy path.

This runbook implements the approved staged migration from Vercel to Cloudflare Workers plus OpenNext. It prepares the repo for Cloudflare staging without changing production DNS, provider callbacks, or Supabase data.

## Current Cloudflare Account Snapshot

Observed in the logged-in Chrome dashboard on 2026-05-17:

| Area | Current state |
| --- | --- |
| Account | `Puppeteer@yfifteen.com's Account` |
| Account ID | `55be25428739205c62a6bb0c711a0b8b` |
| Workers subdomain | `puppeteer-55b.workers.dev` |
| Domains | `yfifteen.com`, `yfifteen-inventory`, `ynotopen.com`, and the retired `ynottcg.com` zone are listed |
| Domain plan | `ynotopen.com` is on Free |
| Assigned YNOTT nameservers | `daisy.ns.cloudflare.com`, `elliot.ns.cloudflare.com` |
| Workers | `ynott-website` is the active production Worker |
| YNOTT resources | `ynotopen.com` owns the active website Worker routes; the separate LIFF Worker path is retired |

## Domain And Provider Matrix

| Surface | Current production URL | Target Cloudflare Worker | Target custom domain | Build-time public site URL | Provider callback/allowlist gate |
| --- | --- | --- | --- | --- | --- |
| Website | `https://www.ynotopen.com` | `ynott-website` | `https://www.ynotopen.com` | `https://www.ynotopen.com` | Supabase Auth `https://www.ynotopen.com/auth/callback`; LINE Login `https://www.ynotopen.com/api/line/callback`; Google callback if enabled |
| Apex | `https://ynotopen.com` | Website redirect | `https://ynotopen.com` redirects to `www` | Same as website | HTTPS must be valid before traffic because HSTS includes subdomains |

The active Worker config builds the website with `NEXT_PUBLIC_SITE_URL=https://www.ynotopen.com`. LINE Login remains a website flow through `/api/line/*`; it is separate from the retired LIFF surface.

## Free-First Cloudflare Resources To Create Before Remote Staging

Create these only when the owner is ready to mutate the Cloudflare account:

| Resource | Website | Notes |
| --- | --- | --- |
| Worker | `ynott-website` | Matches `wrangler.website*.jsonc` names |
| DNS record | `www` and apex | Use the `ynotopen.com` Cloudflare Free zone only |
| Public runtime vars | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ENABLE_LINE_LOGIN`, Supabase public URL/key, LINE Login channel ID, public LINE ID | Checked into the Worker configs because these are browser-visible public or non-secret provider identifiers |
| Rate-limit backend | `RATE_LIMIT_BACKEND=supabase` | Required before any production admin/customer mutation because production fails closed without it |
| Server secrets | Supabase service role, LINE login secret, LINE session secret, Slip2Go secret | Use `wrangler secret put` or the dashboard; do not commit or print values |
| API token | Least-privilege deploy token | Do not commit or print token values |

The first Cloudflare deployment intentionally does not use R2, Durable Objects, or Cloudflare Images bindings. OpenNext falls back to dummy cache mode and returns original images when image optimization is unbound. This keeps the first cut on the Free path and avoids clicking the R2 usage-based subscription.

## Free-First Remote Deployment Evidence

Captured on 2026-05-17 after switching away from R2/Durable Objects/Images bindings:

| Surface | Worker route | Preview URL | Version evidence |
| --- | --- | --- | --- |
| Website | `ynotopen.com/*`, `www.ynotopen.com/*` | `https://ynott-website.puppeteer-55b.workers.dev` | current deployment list in Cloudflare |

The website preview URL returned `HTTP/2 200` with `server: cloudflare`. `SUPABASE_SERVICE_ROLE_KEY` and `LINE_SESSION_SECRET` are configured as Worker secrets for the website Worker. `LINE_LOGIN_CHANNEL_SECRET`, `SLIP2GO_API_URL`, and `SLIP2GO_SECRET_KEY` must remain configured as Worker secrets before those flows can be fully verified on Cloudflare.

Production nameservers for the active `ynotopen.com` zone resolve through Cloudflare:

```text
daisy.ns.cloudflare.com
elliot.ns.cloudflare.com
```

Post-cutover edge checks forced through Cloudflare returned:

```text
https://www.ynotopen.com/       HTTP/2 200, server: cloudflare, x-opennext: 1
https://ynotopen.com/cards?x=1 HTTP/2 308 -> https://www.ynotopen.com/cards?x=1
```

## Tier Recommendation

Use Cloudflare zone Free during setup and first Worker proof. Do not enable the R2 subscription, Cloudflare Images billing, or Workers Paid until measured production needs justify it. If free-tier Worker limits block deployment or smoke tests, keep Vercel as production and record the exact Cloudflare limit before upgrading.

## Commands

Local verification:

```bash
npm run lint
npm run typecheck
npm run build
npm run verify:cloudflare
npm run cf:build:website
```

Local Worker previews:

```bash
npm run cf:preview:website
```

Dry-run packaging:

```bash
npm run cf:build:website
npx wrangler deploy --config wrangler.website.jsonc --dry-run --outdir .wrangler-dry-run-website
```

Remote deploy should run only after account resources, secrets, and provider allowlists are ready:

```bash
npm run cf:deploy:website
```

## Cutover Gates

- `ynotopen.com` is the active Cloudflare production zone.
- Free-first Workers deploy successfully without R2, Durable Objects, or Cloudflare Images bindings.
- All server secrets are configured with `wrangler secret put` or the dashboard.
- Supabase Auth, LINE Login, Google OAuth if enabled, and Slip2Go callback needs are allowlisted for staging and final URLs.
- Website preview passes public, auth, admin, upload, cache, image, and API smoke tests.
- Free-first cache behavior is accepted for the pilot, or R2/Durable Objects are explicitly approved later for stronger cache revalidation.
- HTTPS is valid for `www` and apex before traffic, because the current app sends HSTS with `includeSubDomains`.
- Vercel remains live and ready for rollback until Cloudflare production is stable.

## Implementation Notes

- Next 16 `proxy.ts` runs in Node.js and cannot be configured to Edge. This migration keeps the request hook as `src/middleware.ts` because OpenNext Cloudflare requires Edge middleware for this path.
- Wrangler-generated runtime types are intentionally ignored by TypeScript and ESLint. They are useful as generated binding references, but they redefine web APIs in a way that is too strict for the browser/client app source.
- Free-first previews and deploys do not use R2, Durable Objects, or Cloudflare Images bindings. LINE login start can return 503 locally unless `LINE_LOGIN_CHANNEL_SECRET` and related runtime vars are present in the preview environment.
