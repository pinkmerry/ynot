# LIFF Integration Map

Updated: 2026-05-07

## Purpose

Keep the LINE LIFF side easy to find while the active implementation remains shared with the Website app.

## Shared runtime locations

| Area | Current path | Notes |
| --- | --- | --- |
| LIFF session API | `../Website/src/app/api/line/session/route.ts` | Server-backed LIFF session/profile creation. |
| Website LINE login | `../Website/src/app/api/line/login/start/route.ts` | Optional LINE login for normal website users. |
| LINE callback/linking | `../Website/src/app/api/line/callback/route.ts` | Links LINE identity or creates merge request. |
| LINE helper library | `../Website/src/lib/line/` | OAuth/session/linking helpers. |
| Legacy Lucky Draw shell | `../Website/src/features/lucky-draw/` | Existing LIFF-compatible feature shell. |
| Shared DB migrations | `../Database/supabase/migrations/` | Same database strategy for LIFF + Website. |

## Safety contract

- LINE is optional for website users.
- Existing LIFF users must continue to resolve to the same `profiles`/`admin_users` model.
- A successful LINE connection means the server created/updated Supabase profile/identity state, not only LIFF client logged-in state.

## URL map

- LIFF intended URL: `https://liff.ynottcg.com`
- LIFF fallback/project URL: `https://ynott-line-liff.vercel.app`
- Normal website: `https://www.ynottcg.com`
- Website LINE Login callback: `https://www.ynottcg.com/api/line/callback`

`liff.ynottcg.com` is assigned in Vercel and DNS/SSL are live. Do not use retired alias `https://lucky-draw-liff.vercel.app`.
