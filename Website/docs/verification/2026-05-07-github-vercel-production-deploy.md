# Verification: Separate GitHub + Vercel Production Deployment

Date: 2026-05-07

## Claim

A separate GitHub repository and a separate Vercel project were created for the YNot/Lucky Draw website platform, connected together, configured with production environment variables, deployed, and smoke-tested against the shared Supabase project. The canonical production website URL is now `https://www.ynottcg.com`; exact Vercel deployment URLs can change after each GitHub push.

## GitHub project

- Repository: `https://github.com/pinkmerry/ynot-lucky-draw-platform`
- Visibility: private
- Initial export source: `Lucky Draw/` organized project folder
- Export staging path: `.omx/artifacts/github-export/ynot-lucky-draw-platform`
- Export excluded generated/local/secret-heavy paths such as `.git`, `.omx`, `Database/backups`, `Website/.env.local`, `Website/.next`, `Website/node_modules`, `Website/.vercel`, and build metadata.
- First pushed commit: `05d4268` (`Prepare isolated YNot platform deployment source`)

No credentials or secret values are recorded in this document.

## Vercel project

- Project name: `ynot-lucky-draw-platform`
- Project id: `prj_jcdIUQrnyFa316RxhOv4jjnWoxfZ`
- Framework: Next.js
- Root directory: `Website`
- Connected GitHub repo: `pinkmerry/ynot-lucky-draw-platform`
- First manual production deployment id: `dpl_6Gdc9kQaNp6wdrBc63egc9hFRaCw`
- First manual production deployment URL: `https://ynot-lucky-draw-platform-dvtgndrgl-yoonaevilzgmailcoms-projects.vercel.app`
- Original stable Vercel alias / fallback testing URL: `https://ynot-lucky-draw-platform.vercel.app`
- Canonical production website URL after domain reorganization: `https://www.ynottcg.com`
- Apex redirect URL: `https://ynottcg.com` -> `https://www.ynottcg.com`
- Vercel inspect status for production deployments checked during this run: `Ready`

## Production env names configured on the new Vercel project

Production env variables present/encrypted:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_LINE_LIFF_ID`
- `LINE_LOGIN_CHANNEL_ID`
- `NEXT_PUBLIC_SITE_URL`
- `LINE_SESSION_SECRET`

Production env variables still missing for full live journey testing:

- `LINE_LOGIN_CHANNEL_SECRET`
- Slip2Go / payment-verification secret env values, if real slip verification is required for this project.

## Build evidence

Vercel production build completed successfully:

- Next.js version detected by Vercel: `16.2.5`
- `npm install`: completed, 0 vulnerabilities reported by install output
- `npm run build`: compiled successfully
- Route list includes customer pages, auth pages, admin pages, LINE APIs, legacy lucky-draw APIs, and new `/api/ynot/*` APIs.

Local verification after deployment also passed:

- Command: `cd Website && npm run check`
- Result: passed
- Coverage: eslint, TypeScript, static YNot auth/platform verification, Lucky Draw static smoke verifier, and local production build.


## Domain reorganization — 2026-05-07

The website custom domain has been separated from the LINE LIFF project:

- Website Vercel project `ynot-lucky-draw-platform` owns `www.ynottcg.com` and `ynottcg.com`.
- LINE LIFF Vercel project `lucky-draw-liff` owns `liff.ynottcg.com` and `lucky-draw-liff.vercel.app`.
- Website production env `NEXT_PUBLIC_SITE_URL` is set to `https://www.ynottcg.com`.
- `liff.ynottcg.com` still needs a Squarespace DNS record before LINE LIFF/rich-menu URLs should be moved there.

Evidence and exact DNS/provider URL map: `docs/verification/2026-05-07-domain-reorganization.md`.

## Production route smoke evidence

Base URL checked in the original deployment smoke: `https://ynot-lucky-draw-platform.vercel.app` (stable Vercel alias). The canonical website domain is now tracked separately in `2026-05-07-domain-reorganization.md`.

Customer/auth/admin page GET smoke returned HTTP 200 for:

- `/`
- `/login`
- `/signup`
- `/wallet`
- `/gacha/pokemon-gold-07`
- `/gacha/pokemon-gold-07/open`
- `/collection`
- `/exchange`
- `/shipping`
- `/profile`
- `/ranking`
- `/admin`
- `/admin/top-ups`
- `/admin/campaigns`
- `/admin/prizes`
- `/admin/users`
- `/admin/exchange`
- `/admin/shipping`
- `/admin/rankings`
- `/admin/settings`
- `/admin/audit`

Internal customer link crawl returned HTTP 200 for all discovered app links:

- `/`
- `/admin`
- `/collection`
- `/exchange`
- `/gacha/one-piece-leader-parallel`
- `/gacha/one-piece-leader-parallel/open`
- `/gacha/one-piece-treasure-03`
- `/gacha/one-piece-treasure-03/open`
- `/gacha/pokemon-gold-07`
- `/gacha/pokemon-gold-07/open`
- `/gacha/pokemon-psa10-exchange`
- `/gacha/pokemon-psa10-exchange/open`
- `/login`
- `/profile`
- `/ranking`
- `/shipping`
- `/signup`
- `/wallet`

Browser UI evidence from Chrome:

- Production homepage loaded at `ynot-lucky-draw-platform.vercel.app/`.
- Header Login button navigated to `/login`.
- Login page Sign Up link navigated to `/signup`.
- Homepage shows centered play layout, top category menu, left/right menu surfaces, pack board, Pokemon/One Piece campaigns, coin pill, PSA10/MANGA tags, Details/Open links, and Top Up Wallet action.

## Safe API smoke evidence

These unauthenticated checks are expected to fail closed and not mutate production data:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/lucky-draw` | `200`, `configured: true`, existing LIFF draw data returned from Supabase |
| GET | `/api/line/login/start` | `503`, missing `LINE_LOGIN_CHANNEL_SECRET` fail-closed |
| POST | `/api/line/session` without token | `400`, missing LINE ID token |
| POST | `/api/ynot/wallet` unauthenticated | `401`, login required |
| POST | `/api/ynot/gacha/open` unauthenticated | `401`, login required |
| POST | `/api/ynot/exchange` unauthenticated | `401`, login required |
| POST | `/api/ynot/shipping` unauthenticated | `401`, login required |
| GET | `/api/ynot/admin/top-ups` unauthenticated | `403`, admin access required |
| GET | admin mutation-only APIs | `405` for unsupported GET method |

Vercel runtime error log check:

- Command shape: `vercel logs <deployment-url> --no-follow --since 15m --level error --json`
- Result: no error log lines returned for the deployment smoke window.

## Supabase alignment evidence

- New deployment is wired to Supabase project ref `szjoarkijeaspazbrchc`.
- `GET /api/lucky-draw` on the new deployment returns configured LIFF-era draw data from that Supabase project.
- Same-Supabase access details are documented in `2026-05-07-supabase-liff-access-check.md`.

## Production limitation / blocker

The new website is deployed and the safe page/button navigation works, but the full live user journey is not complete yet because the live Supabase database still has the old LIFF-era schema. The website migration tables/columns/RPCs are not applied yet.

This means authenticated flows that need new tables, such as account identity bridge, wallet top-up, gacha opening, collection ownership, exchange, shipping, and admin management, cannot be fully passed until the database migration gate is completed.

## Next required actions

1. Provide Supabase SQL execution access for project `szjoarkijeaspazbrchc`: either a Supabase access token usable by the CLI, or a direct Postgres connection string/password.
2. Take a full Supabase backup, not only a REST table JSON export.
3. Apply migrations in order:
   - `../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
   - `../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
4. Verify post-migration schema, RLS, RPCs, storage, owner/admin row, and Data API exposure.
5. Add missing `LINE_LOGIN_CHANNEL_SECRET` and payment provider secrets before testing LINE OAuth and real slip verification.
6. Run full production pilot with an owner/admin test account and safe payment/top-up data.

## Ralph continuation verification — 2026-05-07 09:28Z

Fresh evidence was gathered after the OMX stop hook reported a stale session-level Ralph state.

Vercel deployment evidence:

- `vercel inspect https://ynot-lucky-draw-platform.vercel.app` resolved the stable alias to deployment `dpl_G6nggkh5vbG4rSDS3DJxokkXQZBN`.
- Deployment status: `Ready`.
- Latest deployment URL at check time: `https://ynot-lucky-draw-platform-rej7yaohp-yoonaevilzgmailcoms-projects.vercel.app`.
- `vercel ls ynot-lucky-draw-platform` showed the latest production deployment as `Ready`.
- `vercel logs --project ynot-lucky-draw-platform --since 10m --level error --environment production --json` returned no error log lines during the fresh check window.

Fresh production HTTP smoke evidence against `https://ynot-lucky-draw-platform.vercel.app`:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/` | `200` |
| GET | `/login` | `200` |
| GET | `/signup` | `200` |
| GET | `/wallet` | `200` |
| GET | `/gacha/pokemon-gold-07` | `200` |
| GET | `/gacha/pokemon-gold-07/open` | `200` |
| GET | `/collection` | `200` |
| GET | `/exchange` | `200` |
| GET | `/shipping` | `200` |
| GET | `/profile` | `200` |
| GET | `/ranking` | `200` |
| GET | `/admin` | `200` |
| GET | `/api/lucky-draw` | `200`, `configured: true` |
| GET | `/api/line/login/start` | `503`, expected fail-closed until `LINE_LOGIN_CHANNEL_SECRET` is configured |
| POST | `/api/line/session` without token | `400`, expected safe validation failure |
| POST | `/api/ynot/wallet` unauthenticated | `401`, expected login gate |
| POST | `/api/ynot/gacha/open` unauthenticated | `401`, expected login gate |
| POST | `/api/ynot/exchange` unauthenticated | `401`, expected login gate |
| POST | `/api/ynot/shipping` unauthenticated | `401`, expected login gate |

Fresh local verification:

- Command: `cd Website && npm run check`
- Result: passed.
- Included lint, TypeScript, static auth/platform/database verifier scripts, Lucky Draw static smoke verifier, and production build.
