# Verification: Phase 1 Production Data Inventory + Backup Readiness

> 2026-05-10 YNOTT rename note: this file contains historical backup paths captured before the final local folder rename. Current local root is `/Users/pinkmerry/Project X/YNOTT`; see `2026-05-10-ynott-final-migration-cleanup.md`.

Date: 2026-05-10
Generated: 2026-05-10 07:17Z
Mode: read-only Ralph execution
Production mutation allowed: **no**

## Claim

Phase 1 inventory evidence has been refreshed for production Supabase project `szjoarkijeaspazbrchc`.

**Gate result: not passed for production migration.** The current production data inventory is complete enough to make the next decision, but the Phase 1 safety gate remains blocked because full database backup evidence, SQL execution access, and a tested non-production restore path are still missing.

## Guardrails honored

No intentional production writes were performed.

Forbidden actions for this run:

- no `supabase db push`
- no `supabase migration up`
- no seed apply
- no production restore
- no provider/project switching
- no Vercel deploy/promote
- no storage upload/delete/move/overwrite
- no mutating app API smoke calls

Secret handling:

- Evidence files must not include service-role keys, database URLs, JWTs, backup credentials, or signed Storage URLs.
- Storage object names are hashed/redacted in inventory evidence.
- Existing local REST backup files under `../Database/backups/` contain production data/PII and remain outside git by project policy.

## Production project

| Item | Value |
| --- | --- |
| Supabase ref | `szjoarkijeaspazbrchc` |
| Host | `szjoarkijeaspazbrchc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_URL` present locally | True |
| `SUPABASE_SERVICE_ROLE_KEY` present locally | True |
| `SUPABASE_ACCESS_TOKEN` present locally | False |
| Postgres URL env present locally | False |

## Live LIFF-era table inventory

Fresh read-only REST counts:

| Table | Status | Count | Error code |
| --- | ---: | ---: | --- |
| `profiles` | available | 3 |  |
| `admin_users` | available | 3 |  |
| `draw_rounds` | available | 1 |  |
| `draw_slots` | available | 80 |  |
| `orders` | available | 0 |  |
| `payment_slips` | available | 0 |  |
| `order_picks` | available | 0 |  |
| `audit_events` | available | 0 |  |
| `cards` | available | 20 |  |
| `draw_round_prizes` | available | 20 |  |
| `lucky_draw_realtime_events` | available | 35 |  |

Owner/admin account rows are present without exposing profile names:

```json
{
  "status": "available",
  "total": 3,
  "roles": {
    "owner": 2,
    "admin": 1
  }
}
```

## Website schema gaps

`npm run verify:production-db` still fails as expected for current production. Treat this as evidence, not an execution failure.

Required admin/category/inventory objects missing from production:

- `store_categories`
- `draw_round_categories`
- `draw_round_prize_units`
- `seed_runs`
- `get_draw_round_inventory_summary`

Broader website/platform tables checked:

| Table | Status | Error code |
| --- | --- | --- |
| `store_categories` | missing_or_unavailable | PGRST205 |
| `draw_round_categories` | missing_or_unavailable | PGRST205 |
| `draw_round_prize_units` | missing_or_unavailable | PGRST205 |
| `seed_runs` | missing_or_unavailable | PGRST205 |
| `user_identities` | missing_or_unavailable | PGRST205 |
| `user_addresses` | missing_or_unavailable | PGRST205 |
| `app_realtime_events` | missing_or_unavailable | PGRST205 |
| `payment_methods` | missing_or_unavailable | PGRST205 |
| `top_up_requests` | missing_or_unavailable | PGRST205 |
| `wallet_accounts` | missing_or_unavailable | PGRST205 |
| `coin_ledger` | missing_or_unavailable | PGRST205 |
| `gacha_opens` | missing_or_unavailable | PGRST205 |
| `gacha_open_items` | missing_or_unavailable | PGRST205 |
| `collection_items` | missing_or_unavailable | PGRST205 |
| `exchange_orders` | missing_or_unavailable | PGRST205 |
| `exchange_order_items` | missing_or_unavailable | PGRST205 |
| `shipping_requests` | missing_or_unavailable | PGRST205 |
| `shipping_request_items` | missing_or_unavailable | PGRST205 |
| `site_settings` | missing_or_unavailable | PGRST205 |
| `ranking_snapshots` | missing_or_unavailable | PGRST205 |

Column checks:

| Column | Status | Error code |
| --- | --- | --- |
| `profiles.auth_user_id` | missing_or_unavailable | 42703 |
| `profiles.line_user_id` | available |  |
| `cards.tone` | available |  |
| `draw_round_prizes.tone` | available |  |

RPC checks:

| RPC | Status | Error code |
| --- | --- | --- |
| `get_draw_round_inventory_summary` | missing_or_unavailable | PGRST202 |
| `create_draw_slots` | not_probed_mutation_sensitive |  |
| `claim_order_slots` | not_probed_mutation_sensitive |  |

Notes:

- `profiles.auth_user_id` is still missing.
- `profiles.line_user_id` still exists.
- Legacy `cards.tone` and `draw_round_prizes.tone` still exist; the no-tone migration has not been applied.
- Mutating RPCs such as `create_draw_slots` and `claim_order_slots` were intentionally not invoked in the final inventory pass.

## Migration inventory

Local migration files are present in `../Database/supabase/migrations/`. Evidence file `05-local-migration-list.txt` records 19 migration files, including:

- `20260507015626_phase1_auth_identity_realtime.sql`
- `20260507032000_phase2_platform_wallet_gacha.sql`
- `20260509100000_admin_test_categories_inventory.sql`
- `20260509183000_remove_card_tone_fields.sql`

Applied migration status could not be verified through Supabase CLI because this checkout is not linked and no Supabase access token is available.

## Storage inventory

Supabase Storage buckets are reachable through the read-only service-role inventory:

| Bucket | Objects found | Folders found | Listing errors |
| --- | ---: | ---: | ---: |
| `payment-slips` | 0 | 0 | 0 |
| `lucky-draw-assets` | 0 | 0 | 0 |

Bucket metadata evidence is stored in `20-readonly-supabase-inventory.json`.

Storage backup readiness: **medium for current state** because both expected buckets currently list zero objects, but Supabase database backups do not restore Storage API objects. If objects are uploaded before migration, repeat the listing/export and save checksums before applying production SQL.

## Backup readiness

Existing local REST backup:

| Item | Value |
| --- | --- |
| Status | `present_data_only_rest_backup` |
| Path | `/Users/pinkmerry/Project X/Lucky Draw/Database/backups/pre-migration-20260507T090736Z` |
| File count | 12 |
| Total bytes | 61939 |

Existing local REST backup files/checksums:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `admin_users.json` | 430 | `a5916deeffc7e191a7da9bf57949b410b9d8c2dda06fb849c7e8e33b25a9ee58` |
| `audit_events.json` | 2 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `cards.json` | 12385 | `58f4c65d6003bc5d80b0171a105f579e6e00b6c7e3199f3e61c42f6074e41188` |
| `draw_round_prizes.json` | 7218 | `380aa442b4c912acd15ba33bccd2b9091200a9b019a04c8b63def7e2734881d4` |
| `draw_rounds.json` | 11593 | `bb8c8eef57798c41496e8acc32ff046878b1d700b9b3c1fafc46f5d51e044bdb` |
| `draw_slots.json` | 19673 | `4dc6235c04620000526cd3fa319b21fd5736103090bf1233a1a4cc6c0798215c` |
| `lucky_draw_realtime_events.json` | 7596 | `0445e202445ef2f3632df486bcdb148638faa6c41d0cd96614609b12edf1c1cb` |
| `manifest.json` | 1692 | `e059619631a979e09a36e49f08bf520f82f5d102ce570e232f34e0f942ae9f1f` |
| `order_picks.json` | 2 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `orders.json` | 2 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `payment_slips.json` | 2 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `profiles.json` | 1344 | `14910bcd3adc8c350bcae4087dd839e03623396edca40488357aa2d970c059c7` |

Limitations:

- This is a service-role JSON data export, not a full Supabase database backup.
- It does not prove schema, Auth internals, Storage objects, roles, policies, functions, extensions, or rollback coverage.
- It is stale versus live counts: the older manifest records 2 `profiles` / 2 `admin_users`, while fresh production counts show 3 `profiles` / 3 `admin_users`.

Provider/dashboard backup evidence:

```json
{
  "status": "not_checked_missing_SUPABASE_ACCESS_TOKEN"
}
```

Database backup confidence: **low**.

Reason: no `SUPABASE_ACCESS_TOKEN`, no direct Postgres URL, no linked Supabase CLI project, no dashboard backup ID/screenshot, no PITR evidence, and no non-production restore proof were available in this environment.

## Restore readiness

Restore drill result: **not executed**.

Blockers:

- no full database dump/provider backup artifact available to restore;
- no `SUPABASE_ACCESS_TOKEN` for Management API backup listing;
- no direct Postgres URL/password;
- `psql` and `pg_restore` are not installed in this shell;
- no local/staging/temp restore target was supplied.

Theoretical restore path once access exists:

1. Record Supabase Dashboard backup ID or Management API backup list for `szjoarkijeaspazbrchc`.
2. Take/export a full logical backup if dashboard/PITR restore evidence is not enough for the operator plan.
3. Export Storage objects separately if either bucket contains objects.
4. Restore only into a local/staging/temp project first.
5. Verify table counts, functions, policies, Storage object counts, and app read paths before any production migration.

Restore confidence: **low** until a non-production restore drill is performed.

## Verification matrix

| Check | Evidence | Result |
| --- | --- | --- |
| Production ref confirmed | `10-verify-production-db.txt`, `20-readonly-supabase-inventory.json` | Pass |
| Current LIFF table counts captured | `20-readonly-supabase-inventory.json` | Pass |
| Missing website schema listed | `10-verify-production-db.txt`, `20-readonly-supabase-inventory.json` | Pass |
| Storage buckets listed | `20-readonly-supabase-inventory.json` | Pass |
| Full DB backup evidence | Management API/dashboard/full dump evidence unavailable | **Fail / blocked** |
| Storage backup/export evidence | Current buckets list zero objects; no object export needed for current empty state | Medium |
| Restore drill | no full backup/client/tooling/target | **Fail / blocked** |
| No production schema/data write | command log + git diff audit | Pass |
| Secret redaction | `91-phase1-audit.txt` | Pass |


## Follow-up backup refresh — 2026-05-10

After the initial Phase 1 report, the next safe substep was attempted.

Result: a fresh service-role REST data-only export was created at ignored local path:

- `/Users/pinkmerry/Project X/Lucky Draw/Database/backups/pre-migration-20260510T072634Z`

Current export summary:

```json
{
  "projectRef": "szjoarkijeaspazbrchc",
  "tableCounts": {
    "profiles": 3,
    "admin_users": 3,
    "draw_rounds": 1,
    "draw_slots": 80,
    "orders": 0,
    "payment_slips": 0,
    "order_picks": 0,
    "audit_events": 0,
    "cards": 20,
    "draw_round_prizes": 20,
    "lucky_draw_realtime_events": 35
  },
  "storage": [
    {
      "name": "lucky-draw-assets",
      "objects": 0,
      "folders": 0,
      "errors": 0
    },
    {
      "name": "payment-slips",
      "objects": 0,
      "folders": 0,
      "errors": 0
    }
  ],
  "manifestSha256": "0478a3fe85f3fb551661272742dd3194572c721e96564ba89a190188a268ae58"
}
```

Confidence impact:

- Data-only REST backup freshness improved from stale to current for the listed public tables.
- This still does **not** satisfy the full production backup gate because it is not provider/PITR evidence and does not include Auth internals, roles, policies, functions, extensions, or restorable Storage objects.
- Production migration remains blocked until full backup/PITR evidence and a non-production restore drill are available.

## Stop decision

Do **not** proceed to Phase 2 production migration yet.

Required before applying production SQL:

1. Provide/enable Supabase dashboard or Management API access to record backup/PITR evidence.
2. Provide direct Postgres/Supabase SQL execution path only after backup evidence exists.
3. Install/use restore tooling (`psql`/`pg_restore` or Supabase-supported restore path) against a non-production target.
4. Repeat Storage listing/export immediately before migration if either bucket contains objects.
5. Re-run `npm run verify:production-db` after migrations and require all required objects to pass.

## Evidence appendix

Evidence directory: `docs/verification/evidence/2026-05-10-phase-1/`

Key evidence files:

- `00-git-status.txt`
- `01-package-scripts.txt`
- `02-supabase-cli-version.txt`
- `03-supabase-db-dump-help.txt`
- `04-supabase-storage-help.txt`
- `05-local-migration-list.txt`
- `06-context-snapshot.txt`
- `10-verify-production-db.txt`
- `11-supabase-projects-list.txt`
- `12-supabase-migration-list.txt`
- `13-supabase-migration-list-database-workdir.txt`
- `14-postgres-client-tools.txt`
- `20-readonly-supabase-inventory.json`
- `90-evidence-sha256.txt`
- `91-phase1-audit.txt`
- `92-lint.txt`
- `93-typecheck.txt`
- `94-verify-ynot.txt`
- `95-build.txt`
- `96-ai-slop-cleaner-report.txt`
- `97-post-deslop-report-validator.txt`
- `98-post-deslop-lint.txt`
- `99-post-deslop-typecheck.txt`
- `100-post-deslop-verify-ynot.txt`
- `101-post-deslop-build.txt`
- `102-current-rest-backup-refresh.json`
- `103-post-backup-refresh-secret-audit.json`
- `export-current-rest-backup.mjs`
- `104-post-backup-refresh-lint.txt`
- `run-readonly-inventory.mjs`

Supabase docs checked on 2026-05-10:

- Database backups: https://supabase.com/docs/guides/platform/backups
- Supabase CLI `db dump`: https://supabase.com/docs/reference/cli/supabase-db-dump
- Changelog/security: https://supabase.com/changelog?tags=security

Evidence checksums:

```text
e5c1c7d55a71a8d48b9520d6ee70c4f11e852ed9b9d45a8dfcd8aee066cf5d38  docs/verification/evidence/2026-05-10-phase-1/00-git-status.txt
f3424554a76b3fe342fc3f21272ced46d3b40f8b236417a5e84d1d98ab72f01f  docs/verification/evidence/2026-05-10-phase-1/01-package-scripts.txt
c028f9fc408e2a60e675ba83e0292150d8f78a6a36553b1daf0cf70ebace2b1d  docs/verification/evidence/2026-05-10-phase-1/02-supabase-cli-version.txt
c81e5ea5b531ccbb563979b0e163c7282515abcbd3246dc43e8b50e8c6e4ccfb  docs/verification/evidence/2026-05-10-phase-1/03-supabase-db-dump-help.txt
15d9e6e3e559cfb7f4d3b90f3806fec64ffeef1075750a7b5556716f4c647be4  docs/verification/evidence/2026-05-10-phase-1/04-supabase-storage-help.txt
b3dc82f26d7040ff4be169872b2fd01e92acbef60fa2d593b08e06e76576acff  docs/verification/evidence/2026-05-10-phase-1/05-local-migration-list.txt
ddc05536e5e743744b90fcdd0ac74c1b7b30fa9142331812bf37cc5ed7dcd7c8  docs/verification/evidence/2026-05-10-phase-1/06-context-snapshot.txt
ababf19ce1033fa3a332f99a494a0b48eca14d77ac78f35d602e75dc3f3d5801  docs/verification/evidence/2026-05-10-phase-1/10-verify-production-db.txt
ee4fc0f61e87ce6bf2d0b47acd32a4105886f4742b20e39543ceab21faf6bb74  docs/verification/evidence/2026-05-10-phase-1/100-post-deslop-verify-ynot.txt
9cd0241f0fbc20cc5e5b964be297c8c38b08a2eae68f25259ac08d5d1aea6232  docs/verification/evidence/2026-05-10-phase-1/101-post-deslop-build.txt
f91addc966f79fc8e2cd0911f4db725d6ea6a463e70476e8ba623c5f546593c1  docs/verification/evidence/2026-05-10-phase-1/102-current-rest-backup-refresh.json
b36d86e3bff663b99a567be07b85c1334f4964215c52f535730814d5f51db2ba  docs/verification/evidence/2026-05-10-phase-1/103-post-backup-refresh-secret-audit.json
863b81e072c23e28543c12c60e74bb22517757a0de10f4c3c5846a6a766ae2a2  docs/verification/evidence/2026-05-10-phase-1/104-post-backup-refresh-lint.txt
207538179c1d5ae1036485c226a07b3e48224aade6cfb0c31156c3b613f79b81  docs/verification/evidence/2026-05-10-phase-1/11-supabase-projects-list.txt
47a38d1ee7e07ed4933d530bff629d84adcb421d4f155b07437cee693aa6cca8  docs/verification/evidence/2026-05-10-phase-1/12-supabase-migration-list.txt
50d30e208bd1c76ae8cd97e525f17f7f069289d53035894ebb5129a21383fd55  docs/verification/evidence/2026-05-10-phase-1/13-supabase-migration-list-database-workdir.txt
febdaa7172e8c0414aec9943f13ee97607a19b5c781fcd92c83bfbafa167f945  docs/verification/evidence/2026-05-10-phase-1/14-postgres-client-tools.txt
7d51b0e1b928440c358bfb7168b286a1286cf4a598c0bd9e7db3c8036be1d31d  docs/verification/evidence/2026-05-10-phase-1/20-readonly-supabase-inventory.json
c2a10598c574f9976162afa98135fbc05d35d423cd0d06350f62daaeb11b5c92  docs/verification/evidence/2026-05-10-phase-1/91-phase1-audit.txt
acf3c066b784f2a9420517aaa608bf150e155b59ea016244e511f162ad4020af  docs/verification/evidence/2026-05-10-phase-1/92-lint.txt
403bd2fa5542fc4d4e4db354279db3e88ac1bc349faaaedec80c5dc6ba24bb62  docs/verification/evidence/2026-05-10-phase-1/93-typecheck.txt
66aebc10a37908b8c6cec2dba56bf1133cdc4847754b072995e31a76220a831e  docs/verification/evidence/2026-05-10-phase-1/94-verify-ynot.txt
6fb1054b92c85cecd6537e0a72d310b51a20ebf9abfacd905bd0e7e94e9ec042  docs/verification/evidence/2026-05-10-phase-1/95-build.txt
00321de8ee2143b33702bf25d88c832a3a1b2c776bc537e11e8f5d5f0718c5ef  docs/verification/evidence/2026-05-10-phase-1/96-ai-slop-cleaner-report.txt
1d82bc9ae3301f66c49b84c55663bde436d0cdd13f80a9a031f8a4bbbcb3624c  docs/verification/evidence/2026-05-10-phase-1/97-post-deslop-report-validator.txt
ab89b9816d1875347cdb1ba7ada39f327a0b818492e737a044c506bc3bc0b8f6  docs/verification/evidence/2026-05-10-phase-1/98-post-deslop-lint.txt
8238fe0a68b66db410539e9dbb3536fd83ba0b4e2fbc9d5cba053265d172e3ea  docs/verification/evidence/2026-05-10-phase-1/99-post-deslop-typecheck.txt
786b393233e9e00e49f839a3228c65bd93900b78ed355f4398ec13d1be43ca18  docs/verification/evidence/2026-05-10-phase-1/export-current-rest-backup.mjs
f3a247c6601be7ee15291288afc5da7ad65b503fa1e1f135dc7d180865931a35  docs/verification/evidence/2026-05-10-phase-1/run-readonly-inventory.mjs
```
