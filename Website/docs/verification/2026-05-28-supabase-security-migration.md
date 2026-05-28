# Verification: Supabase Security Migration Completion

Date: 2026-05-28
Production project ref: `szjoarkijeaspazbrchc`

## Summary

Production Supabase migration history is aligned with local migrations through:

- `20260514120000_gacha_reveal_assets_and_rpc.sql`
- `20260522080000_pending_signup_email_codes.sql`
- `20260525100000_card_convert_to_coin.sql`
- `20260528000000_audit_actor_semantics.sql`
- `20260528000001_payment_slips_storage_policies.sql`
- `20260528020000_identity_review_only_linking.sql`
- `20260528050000_harden_top_up_approval.sql`

The stale remote migration-history entry `20260522104502` was repaired to the local version `20260522080000` after confirming the remote stored SQL matched `20260522080000_pending_signup_email_codes.sql`.

## Safety Evidence

- Supabase backup listing showed completed physical backups, latest ID `772849678` at `2026-05-27T21:13:37.419Z`.
- `pitr_enabled` was `false`; the backup schedule endpoint returned `402`, so PITR/schedule configuration was not changed.
- A temporary no-data Supabase preview branch, `emsiuneyhnkyyodrshtc`, applied the pending SQL before production.
- The temporary branch was deleted after verification; branch listing returned only `main`.

## Production SQL Applied

`npx supabase db push --linked --include-all` applied:

- `20260514120000_gacha_reveal_assets_and_rpc.sql`
- `20260525100000_card_convert_to_coin.sql`
- `20260528000000_audit_actor_semantics.sql`
- `20260528000001_payment_slips_storage_policies.sql`
- `20260528050000_harden_top_up_approval.sql`

## Production Checks

Read-only Management API SQL confirmed:

- `public.submit_card_conversion(uuid, uuid[], text)` exists.
- `public.approve_top_up_request(uuid, uuid, text)` exists.
- `service_role` can execute both functions.
- `authenticated` cannot execute either function directly.

## Verification Commands

Passed:

- `npm run verify:production-db`
- `SUPABASE_AUTH_PASSWORD_MIN_VERIFIED=8 npm run verify:hardening`
- `npm run verify:platform`
- `npm run test:top-up-flow`
- `npm run typecheck`

## Remaining External Work

- Supabase PITR is not enabled on the current plan.
- Google OAuth provider still needs dashboard configuration.
- LINE Developers still needs `https://www.ynottcg.com/api/line/callback`.
- Previously exposed Supabase credentials should still be rotated.
