# Verification: Same Supabase Access For Website + LIFF

Date: 2026-05-07

## Claim

The normal Website code and the LINE LIFF/session code are wired to the same Supabase project, and the agent can perform safe read-only checks against that project before the next phase.

## Supabase project checked

- Supabase host: `szjoarkijeaspazbrchc.supabase.co`
- Project ref: `szjoarkijeaspazbrchc`
- Source checked: `Website/.env.local` and production bundle/API checks.

No secrets were printed in this document.

## Code wiring evidence

The shared Supabase clients are defined in:

- `Website/src/lib/supabase/client.ts`
- `Website/src/lib/supabase/server.ts`
- `Website/src/lib/supabase/proxy.ts`

The LIFF/session path uses the same server Supabase client:

- `Website/src/lib/line/use-liff-session.ts` reads `NEXT_PUBLIC_LINE_LIFF_ID` and posts to `/api/line/session`.
- `Website/src/app/api/line/session/route.ts` imports `createServiceSupabaseClient()`.
- `Website/src/app/api/line/callback/route.ts` imports `createServiceSupabaseClient()`.
- `Website/src/lib/line/link-identity.ts` imports `createServiceSupabaseClient()`.

The normal Website auth/platform paths also use the same Supabase client helpers under `Website/src/lib/supabase/`.

## Live/read-only database evidence

Safe read-only queries using the local service-role credential succeeded against `szjoarkijeaspazbrchc`.

Existing LIFF/Lucky Draw tables are reachable:

| Table | Count |
| --- | ---: |
| `profiles` | 2 |
| `admin_users` | 2 |
| `draw_rounds` | 1 |
| `orders` | 0 |
| `payment_slips` | 0 |
| `order_picks` | 0 |
| `cards` | 20 |
| `draw_round_prizes` | 20 |
| `lucky_draw_realtime_events` | 35 |

Identity/storage evidence:

- `profiles` rows with `line_user_id`: 2
- Storage buckets visible: `lucky-draw-assets`, `payment-slips`

## Live deployment evidence

- Vercel project link: `lucky-draw-liff`.
- `vercel env ls` shows production env names for Supabase and LINE are configured/encrypted.
- `GET https://www.ynottcg.com/api/lucky-draw` returned `configured: true`.
- Live Next.js client bundle contains the same Supabase project ref `szjoarkijeaspazbrchc`.

## Important schema gap before next phase

The same Supabase project is accessible, but it is still on the existing LIFF-era schema for several new website features. Read-only checks show these are not present yet in the live DB/API schema:

- `profiles.auth_user_id` is missing.
- `user_identities` is missing.
- `top_up_requests` is missing.
- `wallet_accounts` is missing.
- `coin_ledger` is missing.
- `gacha_opens` is missing.
- `collection_items` is missing.
- `exchange_orders` is missing.
- `shipping_requests` is missing.
- `app_realtime_events` is missing.

## Decision

Confirmed: we can access the same Supabase project used by LIFF/Lucky Draw.

Next phase should start with the approved staging/preview + migration-readiness path. Do not deploy or test website features that require new identity/wallet/gacha/exchange/shipping tables until the migrations are applied and verified on staging first.
