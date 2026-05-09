# Production Admin Test Data Runbook

## Purpose
Use this runbook before testing the complete admin workflow in production: create category -> create random pack -> add card/prize inventory -> open as whitelisted tester -> inspect remaining prize inventory.

## Hard gate before production apply
Do **not** run `--apply`, `--hide`, or `--cleanup` against production until all evidence below is captured:

- [ ] Fresh Supabase backup exists and owner/admin can restore if needed.
- [ ] Migration reviewed: `../Database/supabase/migrations/20260509100000_admin_test_categories_inventory.sql`.
- [ ] RLS/direct-query proof: anon/auth cannot read test categories, test packs, test cards, test prize units, whitelist, seed registry.
- [ ] Staging/local UAT passed for category, campaign, card, prize inventory, whitelist, and gacha open.
- [ ] Seed dry-run output reviewed: `node tools/seed/seed-production-admin-test-data.mjs --dry-run`.
- [ ] Asset manifest reviewed: `tools/seed/assets/asset-manifest.json`; no Japan Toreca or unapproved external assets.
- [ ] Owner go/no-go recorded with date/time and operator.

## Local/staging commands
```bash
npm run verify:production-test
npm run verify:production-db
node tools/seed/seed-production-admin-test-data.mjs --dry-run
```

Apply to staging/local only after DB migration is applied:
```bash
SEED_ENV=staging \
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
YNOT_TEST_PROFILE_IDS=<profile uuid> \
node tools/seed/seed-production-admin-test-data.mjs --apply
```

## Production commands
Production mutation commands require this exact acknowledgement:
```bash
ALLOW_PRODUCTION_TEST_SEED=I_UNDERSTAND_THIS_IS_PRODUCTION
```

Apply:
```bash
SEED_ENV=production \
ALLOW_PRODUCTION_TEST_SEED=I_UNDERSTAND_THIS_IS_PRODUCTION \
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
YNOT_TEST_PROFILE_IDS=<profile uuid> \
node tools/seed/seed-production-admin-test-data.mjs --apply
```

Before applying seed data, confirm the production schema is actually ready:
```bash
npm run verify:production-db
```

Expected blocker if the migration has not been applied yet:
- `store_categories` unavailable
- `draw_round_categories` unavailable
- `draw_round_prize_units` unavailable
- `get_draw_round_inventory_summary` unavailable

Expected warning before the final no-tone cleanup migration:
- `cards.tone` and `draw_round_prizes.tone` still exist.

Recommended production order:
1. Apply `../Database/supabase/migrations/20260509100000_admin_test_categories_inventory.sql`.
2. Deploy Website code that no longer writes/reads tone.
3. Update/verify LIFF no longer writes/reads tone.
4. Apply `../Database/supabase/migrations/20260509183000_remove_card_tone_fields.sql`.
5. Run `npm run verify:production-db` again; category tables/RPC should pass and tone-column checks should pass or only report non-blocking warnings.

Hide after testing:
```bash
SEED_ENV=production ALLOW_PRODUCTION_TEST_SEED=I_UNDERSTAND_THIS_IS_PRODUCTION node tools/seed/seed-production-admin-test-data.mjs --hide
```

Cleanup semantics are intentionally non-destructive: test campaigns are archived/private, categories hidden, and available test units are voided. Awarded/transactional rows stay auditable.
```bash
SEED_ENV=production ALLOW_PRODUCTION_TEST_SEED=I_UNDERSTAND_THIS_IS_PRODUCTION node tools/seed/seed-production-admin-test-data.mjs --cleanup
```

## Admin UAT checklist
1. Log in to `/admin` as owner/admin/staff.
2. Open `/admin/categories`; create a `[TEST]` category or verify the seeded category exists.
3. Open `/admin/prizes`; create `[TEST]` cards using `/test-assets/...` URLs and manifest fields.
4. Open `/admin/campaigns`; create a test-only draft, assign the category, set tags like `PSA10, New Exclusive`, then publish only after whitelist is ready.
5. Open `/admin/prizes`; attach card prizes with quantities and verify total/available/awarded counts.
6. Confirm non-whitelisted normal user cannot list/open the test pack.
7. Confirm whitelisted tester can open, wallet is charged once, collection item appears, and inventory decrements.
8. Run hide/cleanup after the test window.

## Known production blockers
- Supabase CLI and `psql` are not installed in this local environment, and current `.env.local` has Data API service-role access only. Migration push must be performed by the operator/CI/Supabase dashboard after review.
- Do not deploy app code that relies on the new admin tables before the migration is applied unless the release is intentionally coordinated.
