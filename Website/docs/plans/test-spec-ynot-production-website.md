# Test Spec — YNot Production Website

- Created: 2026-05-06T13:16:35.773438Z
- Source PRD: `docs/plans/prd-ynot-production-website.md`
- ADR: `docs/plans/adr-ynot-production-website.md`

## Required test tooling/scripts

Add and maintain these scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "supabase db reset && vitest run tests/db tests/integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "seed:e2e": "tsx tools/verification/seed-ynot-e2e.ts",
    "verify:ynot": "node tools/verification/verify-ynot-production-plan.mjs",
    "check": "npm run lint && npx tsc --noEmit --pretty false && npm run test && npm run build && npm run verify:ynot"
  }
}
```

Recommended dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`, `tsx`, and Supabase CLI.

## Seed/reset requirements

`npm run seed:e2e` must create deterministic test fixtures:

- owner/admin/staff users
- email customer
- Google-linked customer
- LINE-linked customer
- unlinked LINE identity fixture
- active campaign with prizes/inventory/odds
- closed/sold-out campaign
- payment methods / QR settings
- coin packages
- sample collection items
- shipping address
- top-up pending/approved/rejected cases

## Static architecture checks (`npm run verify:ynot`)

- `/` no longer redirects to `/ynot-wireframes.html`.
- `src/proxy.ts` exists as Next 16 Proxy entrypoint.
- Service-role/server-only modules are not imported by Client Components.
- Production customer routes do not import or require `useLiffSession`.
- Admin routes/components are server/admin-gated.
- Realtime subscriptions do not target raw sensitive tables.
- Button map fixture covers all customer and admin buttons.
- Required route files exist for all 10 customer pages plus admin settings/audit.

## Unit tests (`npm run test`)

- Auth/link validators: same verified email, manual link, conflict requiring admin merge.
- Coin ledger math and idempotency.
- Top-up approval/rejection state machine.
- Gacha open validators and odds snapshot creation.
- Exchange eligibility and shipping eligibility.
- Admin role guard matrix.
- Button-state map for every page.
- UI component accessibility state for buttons/forms/modals.

## DB/RLS/integration tests (`npm run test:db`)

- Migrations apply from clean DB.
- RLS policy matrix for anon/customer/staff/admin/owner.
- Private slip bucket: customer can upload own pending slip; cannot read others; admin gets signed view only.
- `approve_top_up` credits once under duplicate calls.
- `open_gacha` atomically debits coins, reserves inventory, creates open and collection items.
- `request_shipping` only accepts owned eligible items.
- `exchange_collection_items` only accepts owned eligible items.
- Admin CRUD route/server-action tests for users, campaigns, prizes, top-ups, exchange, shipping, rankings, settings.
- Audit events written for auth link, top-up approve/reject, gacha open, exchange, shipping, admin role/settings changes.

## E2E tests (`npm run test:e2e`)

### Customer email-only full journey

1. Sign up with email/password.
2. Visit home/feed and detail.
3. Wallet top-up request with slip upload.
4. Admin approves top-up.
5. Customer opens gacha.
6. Result appears and collection updates.
7. Customer exchanges one eligible item.
8. Customer requests shipping for one eligible item.
9. Customer edits profile/address.
10. Customer views ranking and logout.

### Provider linking journeys

- Google OAuth callback mocked and linked to canonical account.
- LINE callback mocked with verified `state`/ID token and linked to canonical account.
- Conflicting verified email shows recovery/admin-review path, not unsafe silent merge.

### Admin full journey

- Owner logs in.
- Manage user roles/identity links.
- Configure payment method/QR/site setting.
- Create/edit/publish campaign.
- Create/edit prize/card/image/inventory.
- Review/approve/reject top-ups.
- Manage exchange order.
- Manage shipping status/tracking.
- Recalculate/publish ranking.
- Review audit log.

### Button-map coverage

`tools/fixtures/button-map.json` must define each button/control:

- page/route
- label/test id
- auth role
- expected action
- expected success evidence
- expected runtime disabled reason if applicable

Playwright must click every enabled button and assert every disabled button has a real runtime reason.

## Manual smoke

- Desktop/mobile browser visual check.
- Reduced-motion cinematic open.
- Admin/non-admin denial check.
- Private slip signed URL check.
- Production env checklist: Supabase URL/keys, provider callbacks, LINE channel, Google OAuth, storage buckets, owner bootstrap.

## Pass thresholds

- `npm run lint`: pass with no new warnings.
- `npx tsc --noEmit --pretty false`: pass.
- `npm run test`: pass.
- `npm run test:db`: pass on clean DB.
- `npm run build`: pass.
- `npm run verify:ynot`: pass.
- `npm run test:e2e`: pass with zero uncaught page errors.
- Security: zero known admin bypass, zero RLS matrix failures, zero private-slip leaks.
