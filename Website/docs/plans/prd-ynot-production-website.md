# PRD — YNot Production Website

- Created: 2026-05-06T13:16:35.772942Z
- Source spec: `.omx/specs/deep-interview-html-full-website.md`
- RALPLAN draft: `.omx/drafts/ralplan-ynot-production-website-draft.md`
- Architecture decision: `docs/plans/adr-ynot-production-website.md`
- Test spec: `docs/plans/test-spec-ynot-production-website.md`

## Product goal

Build the YNot HTML/wireframe concept into a production-ready, normal web gacha/oripa website. The site must not be LIFF-first; normal users must be able to use all features without connecting LINE. LINE remains an optional login/linking provider.

## Required first-release scope

All 10 customer pages and all admin management features are in scope:

1. Home/feed
2. Gacha detail
3. Cinematic opening
4. Collection
5. Ranking
6. Exchange
7. Shipping / physical card request
8. Wallet / coin top-up
9. Profile
10. Onboarding/signup/login

Admin must manage users, identities, top-ups/slips, campaigns, prizes/cards, exchange, shipping, rankings, settings/payment methods, and audit logs.

## Functional requirements

### Auth and account

- Email/password signup and login.
- Google/Gmail OAuth login.
- Optional LINE login/linking.
- One canonical account per customer across email, Google, and LINE.
- Same verified email may auto-link when supported.
- Different-email provider linking requires logged-in manual link flow.
- Conflicting verified-email merge requires admin-reviewed recovery/merge with audit event.
- Non-LINE users can complete the full product journey.

### Customer pages

- `/` renders production home, not static wireframe redirect.
- `/gacha/[campaignId]` shows campaign/prizes/odds/status and all buttons work.
- `/gacha/[campaignId]/open` performs authenticated coin spend and server-authoritative gacha open.
- `/collection` shows owned items and supports exchange/shipping/showcase/share actions.
- `/ranking` shows campaign/global rankings with filters.
- `/exchange` supports eligible item exchange operations.
- `/shipping` supports addresses and physical-card shipping requests.
- `/wallet` supports manual bank transfer/QR slip upload and top-up history.
- `/profile` supports profile/contact/address/provider linking/logout.
- `/login` and `/signup` support email/password, Google, LINE, forgot password.

### Admin pages

- `/admin` overview dashboard.
- `/admin/users` users, roles, linked identities, account merge review.
- `/admin/top-ups` slip review, approve/reject, signed slip view, duplicate marking, admin notes.
- `/admin/campaigns` CRUD, publish/unpublish, clone, price/status/stock controls.
- `/admin/prizes` card/prize CRUD, image upload, inventory/rate controls.
- `/admin/exchange` catalog/rates/orders approvals.
- `/admin/shipping` status workflow, tracking, cancellation/refund eligibility.
- `/admin/rankings` recalc/publish/moderation.
- `/admin/settings` bank/QR/payment instructions, feature flags, site settings.
- `/admin/audit` audit event search/review.

### Payment and wallet

- First release uses manual bank transfer / QR slip upload.
- Admin confirmation required before coins are credited.
- Top-up approval is idempotent and credits `coin_ledger` exactly once.
- Private slip storage with signed/admin-only access.

### Gacha and inventory

- Server-authoritative transaction/RPC for `open_gacha`.
- Atomically debit coins, reserve inventory/prize, create `gacha_opens`, create `collection_items`, write audit event.
- Client never chooses prize or mutates balance directly.

### Button contract

Every visible button/control in customer and admin pages must have exactly one of:

- Navigation with expected destination.
- Validated server mutation with success/error state.
- Modal/drawer/state transition.
- Disabled state only for true runtime invalidity, with visible reason.

No hidden no-op buttons and no “unsupported” first-release deferrals.

## Non-functional requirements

- Next.js App Router with Server Components by default and Client Components for interactive islands.
- Supabase Auth SSR cookie sessions via `src/proxy.ts` entrypoint and shared helper logic.
- RLS enabled for all user/admin tables and private storage.
- No raw sensitive realtime table subscriptions.
- PII redacted from logs and public views.
- Thai-first UI with English-ready copy system.
- Accessible keyboard/focus/contrast and reduced-motion cinematic opening.
- Docs/status updated after each execution slice.

## Implementation phases

1. Foundation: Supabase SSR auth clients, `src/proxy.ts`, route groups, layout shell, env contract.
2. Schema/RLS/RPC migration: canonical profile, admin, ledger, top-up, campaign, prize, collection, exchange, shipping, audit, realtime tables.
3. Admin/settings minimum: owner bootstrap, payment methods, campaign seed/settings, role checks, audit baseline.
4. Auth/onboarding/profile: email, Google, optional LINE, merged identity UI.
5. Customer browsing: home, detail, ranking.
6. Wallet/top-up/admin approval.
7. Gacha open/collection.
8. Exchange/shipping.
9. Admin full feature management.
10. Button completeness/e2e hardening.
11. Production readiness.

## Acceptance criteria

See `docs/plans/test-spec-ynot-production-website.md` for executable criteria. High-level completion requires all 10 pages, all admin pages, all auth/payment/gacha/collection/shipping/exchange/ranking flows, all button-map tests, security checks, lint/typecheck/build/tests, and docs/status to pass.
