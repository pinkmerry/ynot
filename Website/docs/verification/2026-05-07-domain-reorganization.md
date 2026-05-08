# Verification: Domain Reorganization for Website and LINE LIFF

Date: 2026-05-07

## Claim

The YNot production website and the LINE LIFF app now have separate intended URL ownership:

| Surface | Canonical / intended URL | Vercel project | Status |
| --- | --- | --- | --- |
| Normal production website | `https://www.ynottcg.com` | `ynot-lucky-draw-platform` (`prj_jcdIUQrnyFa316RxhOv4jjnWoxfZ`) | Assigned on Vercel and DNS resolves |
| Apex website redirect | `https://ynottcg.com` -> `https://www.ynottcg.com` | `ynot-lucky-draw-platform` (`prj_jcdIUQrnyFa316RxhOv4jjnWoxfZ`) | Assigned on Vercel; app-level redirect is in `next.config.ts` |
| LINE LIFF app | `https://liff.ynottcg.com` | `lucky-draw-liff` (`prj_yYVH3HilaiETKon3mLCGv0DD1aos`) | Live; Squarespace DNS resolves and Vercel SSL returns 200 |
| Temporary LIFF fallback | `https://lucky-draw-liff.vercel.app` | `lucky-draw-liff` (`prj_yYVH3HilaiETKon3mLCGv0DD1aos`) | Live and returning 200 after LIFF redirect fix |

## Vercel project-domain assignment evidence

Website project domains from Vercel API:

- `ynottcg.com`
- `www.ynottcg.com`
- `ynot-lucky-draw-platform.vercel.app`

LINE LIFF project domains from Vercel API:

- `liff.ynottcg.com`
- `lucky-draw-liff.vercel.app`

Root and `www` were removed from the old `lucky-draw-liff` project before being attached to the website project. The LIFF project was redeployed separately so `lucky-draw-liff.vercel.app` no longer redirects into the normal website.

## DNS evidence

Current public DNS answers checked during this domain split and final DNS activation:

| Host | DNS answer |
| --- | --- |
| `ynottcg.com` | `A 76.76.21.21` |
| `www.ynottcg.com` | `A 76.76.21.21` |
| `liff.ynottcg.com` | `A 76.76.21.21` |

Squarespace DNS action completed:

```text
A liff 76.76.21.21
```

The whole domain still uses Squarespace nameservers. That is acceptable for the current deployment because the required custom records are present and Vercel is serving the website and LIFF aliases.

## Production env update

The website Vercel project production env `NEXT_PUBLIC_SITE_URL` was updated to:

```text
https://www.ynottcg.com
```

The local `Website/.vercel/project.json` was corrected to link to `ynot-lucky-draw-platform`, not the old LIFF project, before changing env/deployment settings.

## Provider/dashboard URL map to configure

Use this map when updating external dashboards:

- Website public URL: `https://www.ynottcg.com`
- Website LINE Login callback URL: `https://www.ynottcg.com/api/line/callback`
- Website Supabase/Auth callback URL for email magic links or Google OAuth: `https://www.ynottcg.com/auth/callback`
- LIFF endpoint URL: `https://liff.ynottcg.com`
- Temporary LIFF endpoint fallback: `https://lucky-draw-liff.vercel.app`
- LINE rich-menu URL should point to the LIFF endpoint, not the normal website.

## Remaining blocker

No DNS/SSL blocker remains for `liff.ynottcg.com`. Remaining external-dashboard work is updating the LINE LIFF/rich-menu settings to the final LIFF endpoint when ready.

## Final verification

Fresh production deployments:

| Surface | Deployment id | Deployment URL | Status |
| --- | --- | --- | --- |
| Website | `dpl_F7hUTCkhmNpzkAWPV4eVHq5kU5gb` | `https://ynot-lucky-draw-platform-oacuvehsd-yoonaevilzgmailcoms-projects.vercel.app` | Ready |
| LINE LIFF | `dpl_HrTKULhyZFfA3Bto7UwJ1WcEd59x` | `https://lucky-draw-liff-gmcy8pano-yoonaevilzgmailcoms-projects.vercel.app` | Ready |

Live website verification after redeploy:

| Check | Result |
| --- | --- |
| `vercel inspect https://www.ynottcg.com` | Resolved to website deployment `dpl_F7hUTCkhmNpzkAWPV4eVHq5kU5gb`, Ready |
| `vercel inspect https://ynottcg.com` | Resolved to website deployment `dpl_F7hUTCkhmNpzkAWPV4eVHq5kU5gb`, Ready |
| `curl -I https://ynottcg.com` | `308` redirect to `https://www.ynottcg.com/` |
| `curl -I https://www.ynottcg.com` | `200` |
| Customer/auth/admin page smoke on `https://www.ynottcg.com` | `200` for `/`, `/login`, `/signup`, `/wallet`, `/gacha/pokemon-gold-07`, `/gacha/pokemon-gold-07/open`, `/collection`, `/exchange`, `/shipping`, `/profile`, `/ranking`, `/admin`, and admin subpages |
| `GET /api/lucky-draw` | `200`, `configured: true` |
| `GET /api/line/login/start` | Earlier check returned `503` before the LINE Login secret was configured; final check below returns `302` to LINE OAuth |
| Unauthenticated wallet/gacha/exchange/shipping POSTs | `401`, expected login gate |
| Unauthenticated admin API | `403`, expected admin gate |

Live LIFF verification after redeploy:

| Check | Result |
| --- | --- |
| `vercel inspect https://lucky-draw-liff.vercel.app` | Resolved to LIFF deployment `dpl_HrTKULhyZFfA3Bto7UwJ1WcEd59x`, Ready |
| `curl -I https://lucky-draw-liff.vercel.app` | `200`; no redirect to `www.ynottcg.com` |
| `vercel inspect https://liff.ynottcg.com` | Vercel alias resolved to LIFF deployment `dpl_HrTKULhyZFfA3Bto7UwJ1WcEd59x`, Ready before the final DNS/SSL refresh |
| Public DNS `dig +short A liff.ynottcg.com` | Earlier check had no answer; final check below returns `76.76.21.21` |

Local verification:

- Website: `npm run check` passed after domain documentation/env changes.
- LIFF repo: `npm install && npm run lint && npm run build` passed after removing the fallback redirect and updating LIFF redirect URI logic. `npm audit --omit=dev` still reports 2 moderate advisories from Next/PostCSS with only a breaking `--force` fix suggested by npm.

## Final Squarespace DNS and Vercel SSL verification — 2026-05-07 19:18 ICT

The Squarespace custom DNS row was added and Vercel SSL was issued for the LIFF subdomain.

| Check | Result |
| --- | --- |
| Squarespace custom record | `A liff 76.76.21.21`, TTL `4 hrs`, saved with notification `A custom record was saved` |
| `dig +short A liff.ynottcg.com` | `76.76.21.21` |
| `vercel certs issue liff.ynottcg.com` | Success; certificate entry created |
| `curl -I https://liff.ynottcg.com` | `HTTP/2 200` from Vercel |
| `curl -I https://lucky-draw-liff.vercel.app` | `HTTP/2 200`; fallback remains usable |
| `vercel inspect https://liff.ynottcg.com` | Resolved to LIFF deployment `dpl_34uDs4YyRrhoC74iZK6R4ez4pqCe`, Ready |
| `curl -I https://www.ynottcg.com` | `HTTP/2 200` |
| `curl -I https://ynottcg.com` | `HTTP/2 308` to `https://www.ynottcg.com/` |
| `curl -I https://www.ynottcg.com/api/line/login/start` | `HTTP/2 302` to LINE OAuth with callback `https://www.ynottcg.com/api/line/callback` |

Final URL ownership:

- Website: `https://www.ynottcg.com`
- Apex redirect: `https://ynottcg.com` -> `https://www.ynottcg.com/`
- LINE LIFF: `https://liff.ynottcg.com`
- LIFF fallback: `https://lucky-draw-liff.vercel.app`
