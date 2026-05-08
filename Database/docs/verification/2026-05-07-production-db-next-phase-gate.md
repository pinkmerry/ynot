# Verification: Production Database Next Phase Gate

Date: 2026-05-07

## Claim

The website/database next phase is ready at the file and deployment-planning level, but production Supabase schema migration execution is blocked until SQL execution access and full backup are available.

## Supabase project

- Project ref: `szjoarkijeaspazbrchc`
- Host: `szjoarkijeaspazbrchc.supabase.co`
- This is the same Supabase project used by the existing Lucky Draw / LINE LIFF runtime.

## Migration files ready

Migrations that need to be applied in order:

1. `Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
2. `Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`

What these migrations add:

- Normal website auth identity bridge: `profiles.auth_user_id`, nullable `profiles.line_user_id`, `user_identities`.
- User profile/address support: `user_addresses`.
- Private realtime channel table: `app_realtime_events`.
- Manual payment/top-up support: `payment_methods`, `top_up_requests`, generalized `payment_slips` owner invariant.
- Wallet: `wallet_accounts`, `coin_ledger`, idempotency keys.
- Gacha/collection: `gacha_opens`, `gacha_open_items`, `collection_items`.
- Exchange/shipping: `exchange_orders/items`, `shipping_requests/items`.
- Admin/audit/merge/reward helper tables and service-role RPCs.

## Current live schema check

Safe read-only REST checks against the live Supabase project show the new website schema is still missing:

| Check | Live result |
| --- | --- |
| `profiles.auth_user_id` | missing, Postgres code `42703` |
| `user_identities` | missing, PostgREST code `PGRST205` |
| `top_up_requests` | missing, PostgREST code `PGRST205` |
| `wallet_accounts` | missing, PostgREST code `PGRST205` |
| `coin_ledger` | missing, PostgREST code `PGRST205` |
| `gacha_opens` | missing, PostgREST code `PGRST205` |
| `collection_items` | missing, PostgREST code `PGRST205` |
| `exchange_orders` | missing, PostgREST code `PGRST205` |
| `shipping_requests` | missing, PostgREST code `PGRST205` |
| `app_realtime_events` | missing, PostgREST code `PGRST205` |

Existing LIFF-era tables and storage remain reachable. Earlier read-only counts are recorded in `Website/docs/verification/2026-05-07-supabase-liff-access-check.md`.

## Backup status

A data-only JSON backup was created locally for the public tables reachable through the service-role REST API:

- Path: `Database/backups/pre-migration-20260507T090736Z/`
- This path is ignored by git via `Database/backups/` in the root `.gitignore`.

Tables exported in that safe backup include:

- `profiles`
- `admin_users`
- `draw_rounds`
- `draw_slots`
- `orders`
- `payment_slips`
- `order_picks`
- `audit_events`
- `cards`
- `draw_round_prizes`
- `lucky_draw_realtime_events`

Important limitation: this is not a full Supabase backup. It does not prove full schema, auth, storage objects, roles, policies, functions, extensions, or rollback coverage. A full database backup is required before applying production migrations.

## Execution blocker

The current environment can read from Supabase with the service-role key, but it cannot execute arbitrary production SQL migrations.

Observed blockers:

- `npx supabase projects list --output json` failed because no Supabase access token is available.
- `psql` is not installed/available in the environment.
- No direct Postgres connection string/password or `SUPABASE_ACCESS_TOKEN` was available.
- Service-role REST access is not enough to run the migration SQL files safely.

## Required access to continue

One of these is required:

1. Supabase CLI login/access token for project `szjoarkijeaspazbrchc`, or
2. Direct production Postgres connection string/password for project `szjoarkijeaspazbrchc`.

## Safe migration sequence once access is available

1. Take a full Supabase backup and record restore instructions.
2. Confirm the current production ref is still `szjoarkijeaspazbrchc`.
3. Apply migration `20260507015626_phase1_auth_identity_realtime.sql`.
4. Verify identity/realtime schema and RLS.
5. Apply migration `20260507032000_phase2_platform_wallet_gacha.sql`.
6. Verify wallet/gacha/exchange/shipping/admin schema and RPCs.
7. Refresh/check PostgREST schema cache exposure for required tables/functions.
8. Confirm existing LIFF `/api/lucky-draw` still returns existing draw data.
9. Run safe owner/admin authenticated smoke tests.
10. Only then run production top-up/gacha/exchange/shipping pilot tests.

## Decision

Do not claim full production database readiness yet. The next phase is blocked on Supabase SQL execution access and a full backup. The separate GitHub/Vercel website deployment can stay live for page/navigation smoke, but write-heavy platform buttons remain gated by this database migration step.

## Ralph continuation verification — 2026-05-07 09:28Z

Fresh safe read-only REST checks were repeated against Supabase project `szjoarkijeaspazbrchc` after the OMX stop hook reported a stale session-level Ralph state.

The production database is still missing the website schema required for full write-flow testing:

| Check | Fresh result |
| --- | --- |
| `profiles.auth_user_id` | missing, Postgres code `42703` |
| `user_identities` | missing, PostgREST code `PGRST205` |
| `top_up_requests` | missing, PostgREST code `PGRST205` |
| `wallet_accounts` | missing, PostgREST code `PGRST205` |
| `coin_ledger` | missing, PostgREST code `PGRST205` |
| `gacha_opens` | missing, PostgREST code `PGRST205` |
| `collection_items` | missing, PostgREST code `PGRST205` |
| `exchange_orders` | missing, PostgREST code `PGRST205` |
| `shipping_requests` | missing, PostgREST code `PGRST205` |
| `app_realtime_events` | missing, PostgREST code `PGRST205` |

Decision remains unchanged: do not claim full production database readiness until SQL execution access, full backup, migration application, and post-migration RLS/RPC/Data API verification are complete.
