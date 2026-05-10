# YNOTT Final Migration Cleanup

Date: 2026-05-10

## Result

The active project is now aligned to YNOTT naming and the old local/repo/Vercel entry points are retired.

## Active source of truth

| Layer | Current value |
| --- | --- |
| Local folder | `/Users/pinkmerry/Project X/YNOTT` |
| GitHub repo | `https://github.com/pinkmerry/ynott` |
| Git remote | `origin -> https://github.com/pinkmerry/ynott.git` |
| Website Vercel project | `ynott-website` |
| LIFF Vercel project | `ynott-line-liff` |
| Vercel Root Directory | `Website` for both projects |

## Retired / do not use

- Local folder `/Users/pinkmerry/Project X/Lucky Draw` was removed after confirming it only contained leftover `.omx` state/log files.
- Old Vercel aliases were removed:
  - `ynot-lucky-draw-platform.vercel.app`
  - `lucky-draw-liff.vercel.app`
  - old generated branch/project aliases containing `ynot-lucky-draw-platform`
  - old preview alias `lucky-draw-liff-git-claude-307816-yoonaevilzgmailcoms-projects.vercel.app`

## Current live URLs

| Surface | URL | Expected |
| --- | --- | --- |
| Website | `https://www.ynottcg.com` | Public production website |
| Website apex | `https://ynottcg.com` | Redirects/serves through website project |
| LINE LIFF | `https://liff.ynottcg.com` | Public LIFF project URL |
| LIFF fallback | `https://ynott-line-liff.vercel.app` | Public Vercel fallback |

Note: `https://ynott-website.vercel.app` exists but may return Vercel SSO protection (`401`) because this project protects non-custom domains. Use `https://www.ynottcg.com` for public website checks.

## Verification evidence

- `git remote -v` points only to `https://github.com/pinkmerry/ynott.git`.
- Vercel API project checks show both `ynott-website` and `ynott-line-liff` linked to GitHub repo `pinkmerry/ynott`, production branch `main`, Root Directory `Website`, and production `READY`.
- HTTP smoke checks returned `200` for:
  - `https://www.ynottcg.com`
  - `https://ynottcg.com`
  - `https://liff.ynottcg.com`
  - `https://ynott-line-liff.vercel.app`
- HTTP checks returned `404` for retired aliases:
  - `https://ynot-lucky-draw-platform.vercel.app`
  - `https://lucky-draw-liff.vercel.app`
- Local validation from `Website/` passed:
  - `npm run lint`
  - `npm run build`

## Agent routing rule

- Website/admin/customer/Next.js/API work belongs in `Website/`.
- LINE Console/rich-menu/LIFF routing notes belong in `Line LIFF/`.
- Supabase migrations/backups/RLS/RPC work belongs in `Database/`.
- Both Vercel projects build from `Website` until a separate LIFF app is intentionally extracted.
