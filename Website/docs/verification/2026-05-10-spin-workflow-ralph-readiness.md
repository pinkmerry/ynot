# Spin Workflow Ralph Readiness

Date: 2026-05-10
Scope: campaign approval workflow, spin-mode selection, prize weight/unlock policy, and production rollout gates.

## Implemented locally

- Added six Supabase migrations for campaign lifecycle, spin mode/config, prize weights/unlock percentages, approval audit/lock triggers, workflow RPCs, and spin-mode-aware `open_gacha_campaign`.
- Added admin workflow API routes for submit/approve/reject/publish/cancel/end, spin-config edits, approval audit reads, pending approval queue, and bulk prize policy updates.
- Replaced direct admin status select with workflow buttons and owner pending-approval queue.
- Added create/edit UI for spin mode and inventory-gate bands on campaigns.
- Added prize weight/unlock fields plus a bulk prize-policy editor for ranks 1-3 per-prize weights, ranks 4+ per-tier weights, and unlock bands.
- Added credentialed production smoke script `npm run verify:spin-workflow`.
- Expanded production Supabase readiness checks for spin columns, prize policy columns, campaign approvals, and workflow RPC shape.

## Safety fixes applied during Ralph review

- Removed inventory-gate fallback that could award locked/high-value prizes before their unlock threshold.
- Disabled direct status PATCH so campaign state transitions must go through workflow RPCs.
- Restricted campaign mechanics edits to unlocked draft campaigns.
- Restricted prize/prize-policy edits to unlocked draft campaigns and admin-owned drafts for non-owner admins.
- Fixed `update_campaign_spin_config` ownership logic so non-owner admins can edit only drafts they created.
- Fixed `campaign_approvals` RLS identity lookup to use `app_private.current_profile_id()`.
- Made `campaign_approvals_admin_read` replay-safe with `drop policy if exists`.
- Kept locked prize units awardable by the runtime gacha RPC while blocking generic post-lock void/tamper edits.
- Changed API smoke test to use `slot_pick` so workflow verification does not require seeded prize inventory.

## Verification run locally

From `Website/`:

```bash
npm run typecheck
npm run lint
npm run build
npm run verify:ynot
npm run check
```

All commands passed on 2026-05-10 after the Ralph fixes. The final combined
gate was `npm run check`, which re-ran lint, typecheck, `verify:ynot`, and
production build successfully.

Read-only production schema readiness was also checked:

```bash
npm run verify:production-db
```

It failed as expected because live Supabase ref `szjoarkijeaspazbrchc` is still
missing the earlier website production-test tables plus the new spin/workflow
columns, `campaign_approvals`, and workflow RPCs. This confirms the code must
not be promoted to the production deployment path before the migration gate.

## Not verified locally

- Supabase migrations were not applied locally because Docker/local Supabase is unavailable in this environment.
- `Database/supabase/tests/verify_spin_modes.sql` has not been run against a Supabase branch/staging database.
- `npm run verify:spin-workflow` has not been run because it requires valid owner/admin production or preview cookies.
- Production deployment is not safe until backup/PITR/restore evidence exists and the migrations pass on a non-production branch first.

## Production gate

Do not push/merge this code into the production deployment path before the live Supabase schema is migrated. The app now references `draw_rounds.spin_mode`, `draw_rounds.spin_config`, `campaign_approvals`, `draw_round_prizes.weight`, `draw_round_prizes.unlock_at_sold_pct`, and the new workflow RPCs.
