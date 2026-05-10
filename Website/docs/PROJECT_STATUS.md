# YNOTT Project Status

Updated: 2026-05-10

## Current Phase

Phase-by-phase implementation is underway. Backend/Auth Phase 1, website auth, LINE OAuth/linking, wallet/top-up/gacha/collection/exchange/shipping, admin campaign/prize/user management, account merge review, button-map foundation, Japan-Toreca-style responsive web layout, latest prototype-inspired cyber theme, and local navigation cleanup, and localhost admin control-center redesign are implemented and locally verified. A separate GitHub repo and Vercel production project now exist for online testing, the website domain is being moved to `https://www.ynottcg.com`, and production Supabase migrations are still blocked by missing SQL execution access and full-backup evidence.

## Current Goal

Build the production YNOTT platform as a normal website, not LIFF-only, while preserving and aligning with the existing LIFF Supabase database.


## Repo and deployment topology

Canonical naming target is **YNOTT**:

- Local/git root: `YNOTT/`
- GitHub repo target: `pinkmerry/ynott`
- Website Vercel project target: `ynott-website`, Root Directory `Website`, domains `www.ynottcg.com` / `ynottcg.com`
- LIFF Vercel project target: `ynott-line-liff`, Root Directory `Website` until LIFF extraction, domain `liff.ynottcg.com`

Future agents should decide lane by product surface: website/admin/customer work goes to `Website/`; LINE rich-menu/LIFF settings go to `Line LIFF/`; schema/backup/migration work goes to `Database/`.

## Repository Layout Update

- `YNOTT/` is the main project folder and git root. It now has three clear project areas: `Website/`, `Database/`, and `Line LIFF/`.
- `Website/` contains the active Next.js website app, website APIs, website UI, website docs, website plan, website verification scripts, and website-specific references.
- `Database/` contains the Supabase migration source of truth and database architecture/planning docs. Website verification scripts read migrations directly from `../Database/supabase`; no `Website/supabase` symlink is used because Next/Turbopack dev mode can fail when scanning symlinks outside the app root.
- `Line LIFF/` contains LIFF integration notes and original YNOTT/LIFF design references. The current LIFF-compatible runtime code remains shared inside `Website/src` until/unless a later extraction is planned.
- Website alignment document before the next phase: `docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`.
- Website plans are visible in `docs/plans/`; database/LIFF shared-schema plans are visible in `../Database/docs/plans/`.
- Local run command from the active app root: `cd Website && npm run dev -- -p 3005` when starting from the parent folder, or `npm run dev -- -p 3005` when already inside `Website/`.
- Post-move verification passed from `Website/`: `npm run check` completed successfully and localhost route smoke returned `200` for home, gacha detail/open, collection, ranking, exchange, shipping, wallet, profile, login, signup, and admin. Evidence: `docs/verification/2026-05-07-website-folder-move.md`.
- Final project-organization verification passed after separating `Database/` and `Line LIFF/`: `npm run check` passed from `Website/`, scripts read migrations from `../Database/supabase`, and localhost route smoke returned `200` for the same customer/auth/admin pages. Evidence: `docs/verification/2026-05-07-project-organization.md`.
- Website folder cleanup completed: verification scripts moved to `tools/verification/`, fixtures moved to `tools/fixtures/`, website references moved to `docs/references/`, older plan moved to `docs/archive/`, and root clutter reduced while keeping Next.js-required root config files. Evidence: `docs/verification/2026-05-07-website-cleanup.md`; `npm run check` and localhost route smoke passed after cleanup.
- Same-Supabase/LIFF access check completed: Website and LIFF code paths use the shared Supabase client/env, read-only access to project `szjoarkijeaspazbrchc` succeeded, existing LIFF tables/storage were reachable, live bundle/API point to the same ref, and the next phase is gated on applying missing website migrations first. Evidence: `docs/verification/2026-05-07-supabase-liff-access-check.md`.

- Separate production deployment setup completed for online testing: private GitHub repo `https://github.com/pinkmerry/ynott` was created and pushed, Vercel project `ynott-website` was created/connected with root directory `Website`, production env names were configured, and the original stable Vercel alias was `https://ynott-website.vercel.app`. Evidence: `docs/verification/2026-05-07-github-vercel-production-deploy.md`.
- Domain reorganization is live: the normal website owns `https://www.ynottcg.com` and apex `https://ynottcg.com`; the LINE LIFF Vercel project owns `https://liff.ynottcg.com` plus fallback `https://ynott-line-liff.vercel.app`. Squarespace DNS now resolves `liff.ynottcg.com` to Vercel, a Vercel SSL certificate was issued, and both LIFF URLs return `200`. Evidence: `docs/verification/2026-05-07-domain-reorganization.md`.
- Production DB next-phase gate documented: live Supabase ref `szjoarkijeaspazbrchc` still lacks `profiles.auth_user_id`, `user_identities`, `top_up_requests`, wallet/ledger, gacha, collection, exchange, shipping, and private realtime tables. A REST data-only backup exists at ignored path `../Database/backups/pre-migration-20260507T090736Z/`, but a full Supabase backup plus SQL execution access are still required before applying migrations. Evidence: `../Database/docs/verification/2026-05-07-production-db-next-phase-gate.md`.
- Phase 1 production data inventory/backup-readiness was refreshed read-only on 2026-05-10. Live ref `szjoarkijeaspazbrchc` is confirmed, LIFF-era table counts/storage bucket inventory were captured, admin roles exist without exposing names, and `npm run verify:production-db` still fails with expected missing category/inventory objects. Gate result remains blocked: no full provider/PITR backup evidence, no `SUPABASE_ACCESS_TOKEN`, no direct Postgres URL/SQL execution path, and no non-production restore drill. Evidence: `docs/verification/2026-05-10-phase-1-production-inventory-backup.md`.
- Next-step backup refresh completed on 2026-05-10: a fresh ignored service-role REST data-only export was created at `../Database/backups/pre-migration-20260510T072634Z/`, with current counts matching the Phase 1 inventory and zero listed Storage objects. This improves stale data-export evidence but still does not satisfy the full backup/PITR + restore-drill gate. Evidence: `docs/verification/evidence/2026-05-10-phase-1/102-current-rest-backup-refresh.json`.
- Ralph continuation verification refreshed at 2026-05-07 09:28Z after a stale session-level Ralph hook: Vercel stable alias resolves to a Ready production deployment, production page/API smoke still passes/fails closed as expected, live DB schema gap is unchanged, and `npm run check` passed. Evidence: `docs/verification/2026-05-07-github-vercel-production-deploy.md` and `../Database/docs/verification/2026-05-07-production-db-next-phase-gate.md`.


## Completed Planning

### Product / scope clarification

- Deep-interview clarified the target as a production-ready full website with all pages working, not a static HTML wrapper and not LINE-only.
- Required first release includes: email/password login, Google login, optional LINE login/linking, merged account identity, manual bank transfer/QR slip upload, admin-managed operations, wallet/top-up, gacha, collection, ranking, exchange, shipping, profile, and all button flows.
- Evidence/artifacts:
  - `.omx/specs/deep-interview-html-full-website.md`
  - `.omx/interviews/html-full-website-20260506T125410Z.md`

### Frontend / full website architecture plan

- Approved platform frontend plan exists for the production App Router website.
- Decision: build a production Next.js App Router app around Supabase Auth SSR and domain modules; do not ship the standalone HTML as the website.
- Covers route architecture, all 10 customer pages, admin pages, auth pages, button-map contract, UI system, test tooling, and execution phases.
- Evidence/artifacts:
  - `docs/plans/ralplan-ynot-production-website.md`
  - `docs/plans/prd-ynot-production-website.md`
  - `docs/plans/test-spec-ynot-production-website.md`
  - `docs/plans/adr-ynot-production-website.md`

### Backend / database / shared LIFF architecture plan

- Approved database/backend architecture plan exists for using the same Supabase project/database as LIFF.
- Decision: additive same-database strangler migration.
- Preserve existing `profiles.id`, `admin_users`, draw/order/slip/pick/card/realtime data.
- Add normal website auth bridge and platform domains:
  - `profiles.auth_user_id`
  - `user_identities`
  - `user_addresses`
  - `account_merge_requests`
  - `account_merge_events`
  - `payment_methods`
  - `top_up_requests`
  - `wallet_accounts`
  - `coin_ledger`
  - `idempotency_keys`
  - `gacha_opens`
  - `gacha_open_items`
  - `collection_items`
  - `exchange_orders/items`
  - `shipping_requests/items`
  - RLS-scoped `app_realtime_events`
- Key safety decisions:
  - LINE is optional identity, not required profile key.
  - Production LIFF cookie signing must use `LINE_SESSION_SECRET`; no service-role-key fallback.
  - Public realtime must be hardened before private payment/gacha flows.
  - Wallet writes use `wallet_accounts` row locks plus ledger reference uniqueness/idempotency.
  - `payment_slips` becomes order/top-up compatible with an XOR owner invariant.
- Evidence/artifacts:
  - `../Database/docs/plans/ralplan-liff-database-redesign.md`
  - `../Database/docs/plans/ralplan-liff-database-redesign.md`
  - `../Database/docs/plans/prd-liff-database-redesign.md`
  - `../Database/docs/plans/test-spec-liff-database-redesign.md`
  - `../Database/docs/plans/adr-liff-database-redesign.md`


### Backend/Auth Phase 1 local implementation

- Added local migration `../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`.
- Adds the identity bridge foundation: nullable `profiles.line_user_id`, `profiles.auth_user_id`, `user_identities`, and `user_addresses`.
- Hardens custom LINE session signing: `LINE_SESSION_SECRET` is required and session signing no longer falls back to `SUPABASE_SERVICE_ROLE_KEY`.
- Splits realtime invalidation into public safe `lucky_draw_realtime_events` and RLS-scoped `app_realtime_events`; public events no longer expose private order/payment identifiers.
- Updates `/api/line/session` to record LINE as an identity linked to the saved profile and keep LIFF session creation server-backed.
- Updates local generated Supabase types and static verification scripts.
- Important: migration was not applied to the live Supabase project in this local Ralph slice. Deploy/apply sequence must run DB migration before deploying code that writes `user_identities`.
- Broad authenticated profile updates are blocked: `auth_user_id`, `line_user_id`, `email`, and `profile_status` are not client-updatable; only safe non-identity profile/contact columns receive column-level update grants.
- Verification evidence from this slice: `npm run verify:phase1` passed; `npm run typecheck` passed; `npm run lint` passed after excluding generated `.omx` artifacts; `npm run build` passed; `node tools/verification/verify-lucky-draw-plan.mjs` passed; Ralph architect review initially rejected broad authenticated profile updates, then approved after column-level grants restricted profile updates to safe non-identity fields.

### Website Auth Foundation local implementation

- Added Supabase Auth SSR clients with Next 16 `src/proxy.ts` cookie refresh.
- Added `/login`, `/signup`, and `/auth/callback` for email/password and Google OAuth.
- Added unified `resolveCurrentProfile()` / `resolveAdminSession()` so normal website users and legacy LIFF users resolve to the same profile/admin model.
- Added normal website LINE OAuth start/callback routes, LINE login button, profile LINE connect action, safe state/nonce validation, and merge-request creation when a LINE identity already belongs to another profile.
- Logout now clears both Supabase Auth and the legacy/LINE session cookie.
- Fixed OAuth callback redirect safety: protocol-relative `next=//...` values are rejected and only same-origin relative paths are used.
- Verification evidence: `node tools/verification/verify-auth-foundation.mjs` passed; `npm run typecheck` passed; architect rejected open redirect first, then this status records the fix.

### Platform Wallet/Gacha Foundation local implementation

- Added local migration `../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`.
- Adds payment methods, manual top-up requests, wallet accounts, coin ledger, idempotency keys, account merge request/event tables, gacha open/result tables, collection, exchange, shipping, site settings, ranking snapshots, audit references, RLS policies, private realtime events, and service-role RPCs for top-up approval, gacha open, exchange approval/rejection, account merge completion/rejection, and shipping request creation.
- Added production website routes for home, campaign detail/open, wallet, collection, ranking, exchange, shipping, profile, and protected admin route namespace.
- Hardened campaign visibility after architect rejection: public service-role reads now filter to `visibility = public` and `status in (live, closed)`; private/draft campaign reads are requested only for active admins.
- Added platform API routes for manual wallet top-up slip upload, gacha open, exchange request, shipping request, and admin top-up/exchange/shipping/campaign/card/prize-pool/user-role/account-merge actions.
- Replaced remaining admin placeholders for users/prizes/rankings/audit with protected data-backed pages: profiles/admin roles, card catalog, ranking snapshots, and audit events.
- Hardened admin data boundary after architect rejection: admin service-role readers now call `resolveAdminSession()` and return no data before any service-role query when the viewer is not an active admin.
- Added address save API/form and admin payment-method settings API/form so wallet and shipping flows no longer depend on raw ID entry only.
- Added admin campaign draft creation, campaign publish/close/archive controls, card catalog create/update, campaign prize-pool assignment/deletion, admin role management with owner/self-deactivation safeguards, and admin account-merge review actions.
- Added `tools/fixtures/button-map.json`, `npm run verify:ynot`, and `npm run check`.
- Latest local evidence: `npm run check` passed; `npm audit --omit=dev` found 0 vulnerabilities; localhost:3005 page/API smoke passed for home/login/signup/profile/customer/admin pages, unauthenticated admin API denial, and LINE login fail-closed behavior when `LINE_LOGIN_CHANNEL_SECRET` is missing. Ralph architect final re-review approved after the LINE `next` redirect sanitizer was hardened against backslash/protocol-relative redirects.
- Important: this is local code/migration foundation only; production Supabase migration execution remains a gated deployment step.

### HTML wireframe UX/UI parity correction

- Re-inspected `Website/docs/references/design/YNot Wireframes Standalone.html` directly and unpacked its embedded bundle into `Website/.omx/artifacts/ynot-wireframe/unpacked/` for evidence.
- Extracted the wireframe source details that were missing from the production shell:
  - Home categories: `ทั้งหมด`, `โปเกมอน`, `วันพีซ`, `เสื้อ`, `POP MART`, `อื่นๆ`.
  - Exchange categories: `Pokemon`, `One Piece`, `Hobby`, `POPMART`, `Yu-Gi-Oh!`, `Weiss`, `Magic`, `Duel Masters`, `Apparel`, `Others`, `Mileage`.
  - Detail reward tiers: S/A/B/C/D with `Charizard SAR`, SSR/SR/R/N previews, remaining counts, and last-one rules.
  - Sketchy paper/hand-drawn visual system with phone and desktop frames, chips, card placeholders, sold-out overlays, and category sidebars.
- Updated the Next.js website UI to follow that HTML source rather than the earlier dark production shell:
  - `src/app/globals.css` now includes the sketchy wireframe design system.
  - `src/features/ynot/wireframe-content.ts` stores the extracted category/campaign/exchange/reward-tier content.
  - Home, campaign detail, gacha open preview, collection, ranking, and exchange pages now show the Pokemon/One Piece/category details from the HTML while keeping the production auth/wallet/admin/API routes.
- Verification evidence: `npm run check` passed; localhost `http://localhost:3005/`, `/exchange`, and `/gacha/pokemon-gold-07` returned 200 and contained the expected Pokemon/One Piece/category/reward-tier text.

### Existing Lucky Draw modularization work

- Existing Next.js Lucky Draw app was partially modularized before the full platform plan:
  - `src/app/page.tsx` became a thin route entry rendering `LuckyDrawShell`.
  - API calls, realtime, shell state, derived state, customer/profile/admin views, and UI primitives were split into feature-owned files.
  - Static/smoke verification scripts/checklists were added.
- Evidence from previous status:
  - `npm run lint` passed.
  - `npm run build` passed.
  - `node tools/verification/verify-lucky-draw-plan.mjs --strict-shell` passed.

### Admin Control Center localhost implementation

- Reworked `/admin` from a readiness-first page into an owner-facing Admin Control Center with cards for Random Packs, Categories, Prize/Card Catalog, Users, Top-ups, Shipping, Exchange, Rankings, Settings, Audit, and System Health.
- Added shared admin section navigation through `AdminSectionShell`/`AdminNav` so admin pages are discoverable from desktop/mobile localhost testing.
- Added `/admin/health` for production readiness signals so failures remain visible without burying daily operations.
- Added `/admin/categories` first-version Category Manager for current fixed `draw_rounds.series` categories (`pokemon`, `one_piece`) and documented the future dynamic `categories` table path.
- Updated `/admin/campaigns` copy and flow into Random Pack Studio while preserving existing create/update/publish controls.
- Ralph artifacts: `.omx/context/implement-admin-20260509T031304Z.md`, `.omx/plans/prd-implement-admin.md`, `.omx/plans/test-spec-implement-admin.md`.
- Verification evidence: `npm run typecheck`, `npm run lint`, `npm run build`, localhost dev admin smoke for `/admin`, `/admin/health`, `/admin/categories`, `/admin/campaigns`, `/admin/prizes`, `/admin/users`, `/admin/top-ups`, `/admin/shipping`, `/admin/exchange`, `/admin/settings`, `/admin/audit`, and `/admin/rankings` all returned 200; architect verification approved.
- Admin UX redesign follow-up: replaced the horizontal admin nav with a desktop side menu/mobile horizontal menu, simplified `/admin` into Quick actions/Main tools/System status, rebuilt `/admin/categories` with normal-flow Active/Future category cards to avoid clipped text, and grouped `/admin/campaigns` into Basic info, Price & quantity, Display labels, and Existing packs.
- Admin UX redesign Ralph artifacts: `.omx/context/admin-ux-redesign-20260509T083023Z.md`, `.omx/plans/prd-admin-ux-redesign.md`, `.omx/plans/test-spec-admin-ux-redesign.md`.
- Admin UX redesign verification evidence: `npm run typecheck`, `npm run lint`, `npm run build`, authenticated localhost smoke for `/admin`, `/admin/categories`, `/admin/campaigns`, and `/admin/health` all found expected markers; architect verification approved.

## Not Implemented Yet

- Production Supabase migrations have not been applied yet; DB/RLS/runtime behavior for new website tables remains gated by SQL execution access and full backup.
- Google OAuth and LINE OAuth provider dashboard settings/callback URLs have not been verified live.
- LINE OAuth start route correctly fails closed locally when `LINE_LOGIN_CHANNEL_SECRET` is missing; production must set it before enabling normal LINE website login.
- Same-database migration has not been applied yet; live schema checks still show the new website tables/columns missing.
- Full Supabase CLI DB reset/RLS tests and Playwright e2e tests from the original test spec are not installed/run yet.

## Verification Status

| Area | Status | Evidence |
| --- | --- | --- |
| Product requirements | Planned | Deep-interview spec exists. |
| Frontend/platform architecture | Planned and approved | `docs/plans/ralplan-ynot-production-website.md` and PRD/test/ADR exist. |
| Backend/database architecture | Planned and approved; Phase 1 and Phase 2 platform migration files locally implemented | `../Database/docs/plans/ralplan-liff-database-redesign.md`; `../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`; `../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`; `npm run check` passed locally. |
| Existing modularization slice | Previously verified | Prior status recorded lint/build/static smoke pass. |
| Full production implementation | Separate GitHub/Vercel production deployment ready for page/navigation smoke; full write-flow validation still DB/provider gated | `https://github.com/pinkmerry/ynott`; canonical website `https://www.ynottcg.com`; website fallback alias `https://ynott-website.vercel.app`; LIFF fallback `https://ynott-line-liff.vercel.app`; production route/link smoke passed. |
| Database migration execution | Blocked, not run in production | Phase 1 and Phase 2 migration files exist; live checks show missing schema; requires Supabase SQL access plus full backup. |
| HTML wireframe UX/UI parity | Locally corrected and smoke-verified | Browser showed the paper/hand-drawn wireframe skin on `localhost:3005`; curl confirmed Pokemon/One Piece/POP MART, exchange category tabs, and `Charizard SAR` reward detail text. |
| Full browser QA | Basic localhost and production page/link smoke passed; authenticated e2e not run | Production customer/admin pages returned 200; safe unauth API checks returned expected 400/401/403/503/405 responses; full user/payment/gacha journey remains DB/provider gated. |

## Open Decisions And Concerns

- Execution/deployment must stay phase-gated: apply DB migrations before deploying code that writes new tables/columns/RPCs.
- LINE email cannot be assumed; LINE conflicts create admin-reviewed merge requests.
- Admin owner bootstrap still must exist in production data before admin features are usable by the real owner account.
- Production data migration must be tested on local/staging and backed up before applying to the live Supabase project.
- `liff.ynottcg.com` is assigned to the LIFF Vercel project, Squarespace DNS resolves it to Vercel, and HTTPS returns `200`; LINE rich-menu/LIFF dashboard URLs can move to the LIFF endpoint when ready.

## Recommended Next Slice

**Deployment gate: database migration must run before deploying code that writes new columns/tables. Apply/test `../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql` and then `../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql` against local/staging Supabase, then production with backup, before deploying website code that writes `profiles.auth_user_id`, `user_identities`, `top_up_requests`, generalized `payment_slips`, wallet/ledger, gacha, collection, exchange, or shipping tables.**

Completed locally in Phase 1:

1. Add identity bridge schema: `profiles.auth_user_id`, nullable `line_user_id`, `user_identities`.
2. Harden production LINE cookie signing with required `LINE_SESSION_SECRET` and no service-role fallback.
3. Split public/private realtime: keep public LIFF-safe events only, add RLS-scoped `app_realtime_events`.
4. Create/backfill `user_addresses` with owner/admin RLS.
5. Add `app_private.current_profile_id()` / admin helper functions.
6. Regenerate Supabase types and run typecheck.
7. Verify existing LIFF session/admin/order compatibility still works.

Next implementation slice: database migration execution and authenticated production pilot. Provide Supabase SQL execution access for project `szjoarkijeaspazbrchc`, take a full backup, apply both migrations in order, verify RLS/RPC/Data API exposure, configure remaining payment/provider secrets, bootstrap/confirm owner-admin, update LINE LIFF/rich-menu settings to the final LIFF URL, then run the browser/e2e journey against `https://www.ynottcg.com`.

## Short Answer

Yes: we now have approved plans, an implemented website/database foundation, and a separate GitHub/Vercel production deployment for online testing. The remaining blocker is the database/provider gate: production Supabase migrations are not applied because SQL execution access/full backup are missing, and LINE/payment secrets still need completion before the full live journey can pass.

### Production storefront visual replacement

- User superseded the prior hand-drawn HTML parity direction and asked to use `https://japan-toreca.com/` as the visual/menu reference instead.
- Captured URL-derived reference notes and screenshot under `.omx/artifacts/visual-ralph/japan-toreca-reference/`.
- Replaced the visible YNot storefront with a polished production-style layout:
  - Clean header with logo, Login, Sign Up, language/account control, and real customer/admin menu labels.
  - Top category tabs for Pokemon, One Piece, Hobby, POPMART, Yu-Gi-Oh!, Weiss, Magic, Duel Masters, Apparel, and Others.
  - Production product grid with campaign tags, coin price, remaining-stock progress, and open/detail actions.
  - Exchange marketplace layout with category menu, card grid, stock/sold-out states, and coin pricing.
  - Removed visible sketch/prototype/wireframe/source-reference messaging from customer pages.
- Code changes: `src/features/ynot/components.tsx`, `src/features/ynot/storefront-content.ts`, `src/features/ynot/data.ts`, `src/features/ynot/client.tsx`, `src/app/globals.css`, and customer page copy.
- Local validation for this visual replacement passed with `npm run check`; production deployment remains gated by migration/provider/owner-admin setup.

### Prototype cyber theme + Toreca-style homepage pack board

- User then supplied `/Users/pinkmerry/Downloads/Website/prototype/index.html` as the theme reference and asked for the homepage to show playable card packs like Toreca.
- Captured a clean local reference screenshot/audit under `.omx/artifacts/visual-ralph/ynot-prototype-theme/reference-prototype-clean.png` and `reference-prototype-audit.json`.
- Updated the customer shell to the prototype-inspired cyber arcade theme:
  - Black grid background, cyan neon, orange accent labels, mono typography, angular cut-corner panels/buttons, and pack-card chrome.
  - Removed sticky/fixed header/rail behavior that caused overlay risk; key layout containers are static, grid/flex based, and responsive.
  - Homepage now starts with a `Choose a pack to play` board and live Pokemon/One Piece pack cards with Details/Open actions above the hero content.
  - Reused the prototype Pokemon banner asset as `public/ynot-pack-pokemon.jpg` for the first playable pack card.
- Visual/browser evidence saved under `.omx/artifacts/visual-ralph/ynot-prototype-theme/current-home.png`, `current-exchange.png`, `current-detail.png`, and `current-browser-audit.json`.
- Local browser audit showed `horizontalOverflow: false`, dark `rgb(0, 3, 8)` background, `headerPosition: relative`, and playable pack links visible on `http://localhost:3005/`.

### Centered mobile-first play layout refinement

- User asked for a Toreca-like mobile-friendly layout even on desktop: the play area should stay in the middle, menus remain available on the left/right, and labels/buttons must not clip or lose characters.
- Updated `src/app/globals.css` so desktop home is a centered three-column composition:
  - Left rail: 220px menu.
  - Middle play board: 600px pack-opening surface centered exactly in the viewport.
  - Right rail: 220px app/activity panel.
- Mobile now prioritizes play first: the pack board renders before side menus, top nav scrolls horizontally instead of wrapping into a tall header, and buttons/chips/categories have larger readable padding plus no text overflow.
- Browser evidence saved under `.omx/artifacts/visual-ralph/ynot-mobile-centered/`:
  - `desktop-home.png`, `mobile-home.png`, `mobile-open.png`, `desktop-exchange.png`, `desktop-detail.png`
  - `browser-audit.json`
- Browser audit evidence: desktop homepage `packCenterOffset: 0`, no horizontal overflow on desktop/mobile, and `overflowCount: 0` for buttons/chips/menu labels across audited pages.
- Verification evidence: `npm run check` passed; localhost smoke returned 200 for `/`, `/exchange`, `/gacha/pokemon-gold-07`, `/gacha/pokemon-gold-07/open`, `/wallet`, `/collection`, `/ranking`, `/shipping`, `/profile`, `/login`, and `/signup`.

### 10-page prototype phone UI alignment

- User confirmed `/Users/pinkmerry/Downloads/Website/prototype/index.html` is the ideal UX/UI target and asked for all 10 pages to align, including PSA10 tags, coin pills, and text/button positioning.
- Captured the source prototype's 10 pages under `.omx/artifacts/visual-ralph/template-10page-audit/`:
  - `01-home.png` through `10-signup.png`
  - `template-10page-audit.json`
- Updated the production Next.js UI to follow the template's centered phone-frame system:
  - Header/tab order now mirrors the 10-page prototype flow: Home, Detail, Open, Collection, Ranking, Exchange, Shipping, Wallet, Profile, Sign Up.
  - Core customer surfaces now use a 375px centered neon phone frame on desktop and mobile.
  - Home uses top logo/coin pill, category tabs, flash promo, two-column pack grid, PSA10/MANGA chips, coin/stock overlays, and live feed.
  - Detail uses Gold Set #07 top bar, back/favorite controls, provably-fair artwork, price/remaining metrics, Pull x1/Pull x10 actions, S/A/B/C/D rewards, and transparency note.
  - Open uses the template confirm-sequence cinematic card, big GOLD pack cube, `>> START PULL`, and `[ CANCEL ]`.
  - Collection/Shipping use row-card selection UI with PSA10 tags, coin values, deadline/code metadata, checkmarks, tabs, and action bar labels.
  - Ranking uses top-1 hero plus 2-10 style list rows.
  - Exchange uses coin pill, category tabs, bonus strip, three-column sold-out card grid, stock/coin positions.
  - Wallet keeps production manual bank/QR slip upload first while adopting the template Top Up/VIP/payment-row visual system.
  - Profile uses settings-list rows and platform/account controls.
  - Signup/Login use the template onboarding phone with Apple/Google/LINE/email paths.
- Current project screenshots/audit saved under `.omx/artifacts/visual-ralph/template-10page-audit/current/`:
  - `01-home.png` through `10-signup.png`
  - `ynot-10page-audit.json`
- Browser evidence: all 10 audited pages render a 375px centered phone surface on desktop; no body-level horizontal overflow was detected except the expected horizontally scrollable exchange category strip item.
- Verification evidence: `npm run check` passed; localhost smoke returned 200 for `/`, `/gacha/pokemon-gold-07`, `/gacha/pokemon-gold-07/open`, `/collection`, `/ranking`, `/exchange`, `/shipping`, `/wallet`, `/profile`, `/login`, and `/signup`.

### Japan Toreca responsive web correction

- User clarified the previous 375px phone-frame interpretation was wrong: the target is a responsive web layout like `https://japan-toreca.com/oripa/apparel`, not a mobile-site mockup, while each page should preserve the prototype's UX/UI controls and details.
- Captured Japan Toreca reference evidence under `.omx/artifacts/visual-ralph/japan-toreca-apparel/`:
  - `japan-toreca-apparel-desktop.png`
  - `japan-toreca-apparel-tablet.png`
  - `japan-toreca-apparel-mobile.png`
  - matching JSON audits for each viewport.
- Reworked the customer shell and pages so desktop is now a real full-width responsive storefront:
  - White Japan-Toreca-style top bar with logo, Login, Sign Up, English.
  - Desktop category nav and tag-filter strip.
  - Desktop home uses left menu, center 2-column mystery-pack grid, and right yellow app/promo panel.
  - Removed the desktop 375px phone frame; audited customer pages now render at web widths (`960px` content pages, `1368px` home grid) with `phoneLike: 0`.
  - Mobile home now follows the Japan Toreca sequence: top auth header, black hero/card fan, big RIP PACKS copy, CTA, see-more strip, then pack list; mobile hides the desktop category/filter bars and keeps bottom tab navigation.
  - Page UX details from the prototype remain: PSA10/high-value chips, coin pills, pull buttons, collection rows, ranking hero/list, exchange sold-out grid, wallet manual slip upload, and profile/settings rows.
- Current project screenshots/audit saved under `.omx/artifacts/visual-ralph/japan-toreca-responsive/current/`:
  - `desktop/01-home.png` through `desktop/10-signup.png`
  - `mobile/01-home.png` through `mobile/10-signup.png`
  - `ynot-responsive-audit.json`
- Fresh validation after this correction:
  - `npm run check` passed, including lint, typecheck, static YNot/auth/platform verification, and production build.
  - Localhost route smoke on port `3005` returned 200 for `/`, `/gacha/pokemon-gold-07`, `/gacha/pokemon-gold-07/open`, `/collection`, `/ranking`, `/exchange`, `/shipping`, `/wallet`, `/profile`, `/login`, and `/signup`.
  - Responsive screenshot audit shows desktop `phoneLike: 0` for all 10 checked pages and no desktop overflow.

### Prototype theme-only responsive reskin

- User then asked to change just the theme to match `/Users/pinkmerry/Downloads/Website/prototype/index.html`, without reverting to the 375px phone-frame/mobile-site layout.
- Kept the Japan-Toreca-style responsive web structure and reskinned it to the prototype's dark cyber arcade visual system:
  - Black grid/radial background.
  - Cyan neon primary color with orange alert/accent strips.
  - Mono/uppercase labels.
  - Angular cut-corner cards, panels, chips, auth buttons, CTAs, and bottom tabbar.
  - Prototype-style cyan mobile hero CTA and dark/cyan login/language controls.
  - Existing page UX details remain intact: playable pack board, Pokemon/One Piece/category tabs, PSA10/MANGA chips, coin pills, pull/open buttons, collection/shipping rows, wallet manual slip upload, profile/settings, login/signup with Apple/Google/LINE/email.
- Code changes in this slice are theme-only in `src/app/globals.css`; no database, auth, API, or route logic was changed.
- Current project screenshots/audit saved under `.omx/artifacts/visual-ralph/prototype-theme-responsive/current/`:
  - `desktop/01-home.png` through `desktop/10-signup.png`
  - `mobile/01-home.png` through `mobile/10-signup.png`
  - `ynot-responsive-audit.json`
- Fresh validation after this theme-only reskin:
  - `npm run check` passed, including lint, typecheck, static YNot/auth/platform verification, and production build.
  - Localhost route smoke on port `3005` returned 200 for `/`, `/gacha/pokemon-gold-07`, `/gacha/pokemon-gold-07/open`, `/collection`, `/ranking`, `/exchange`, `/shipping`, `/wallet`, `/profile`, `/login`, and `/signup`.
  - Responsive screenshot audit still reports desktop `phoneLike: 0` for all 10 checked pages and no desktop overflow. The only mobile overflow flags are the intentional horizontally scrollable category strips.

### Button/backend connection recheck

- Fresh QA rechecked the first-release button/backend contract after the theme changes.
- `tools/fixtures/button-map.json` currently covers 34 first-release controls:
  - 8 navigation controls.
  - 4 server-action auth controls.
  - 22 backend mutation controls.
- Static verification confirmed customer buttons are wired to backend routes/actions:
  - Wallet top-up slip upload -> `POST /api/ynot/wallet`.
  - Address save -> `POST /api/ynot/addresses`.
  - Gacha open -> `POST /api/ynot/gacha/open`.
  - Collection exchange -> `POST /api/ynot/exchange`.
  - Collection shipping -> `POST /api/ynot/shipping`.
  - Google/email auth -> Supabase Auth server actions.
  - LINE login/connect -> `/api/line/login/start`.
- Static verification confirmed admin buttons are wired to protected backend routes:
  - Top-up approval/rejection.
  - Payment method save.
  - Campaign create/status changes.
  - Card and prize management.
  - User role and merge review.
  - Exchange approval/rejection.
  - Shipping status update.
- Fresh validation evidence:
  - `npm run verify:ynot` passed.
  - `npm run check` passed, including lint, typecheck, verification scripts, and production build.
  - Localhost route smoke on port `3005` returned 200 for all customer and admin page routes.
  - Unauthenticated backend smoke returned safe guarded responses: customer mutations returned 401 login-required, admin mutations returned 403 admin-required, and LINE login start returned 503 because local `LINE_LOGIN_CHANNEL_SECRET` is intentionally not configured.
- Remaining limitation: this is local static/smoke verification of route wiring and guards. Full positive mutation testing still requires applying migrations to a real/staging Supabase database, logging in as a real user/admin, configuring LINE/Google provider secrets, and exercising the live flows online.

### Local navigation cleanup

- User approved a localhost-first navigation simplification before any production work.
- Updated global/home customer navigation:
  - Top customer category nav now shows only Pokemon and One Piece.
  - Store filter chips now show only All, New, and PSA10.
  - Desktop left rail now shows only Mystery Packs, Ranking, and Exchange.
  - Mobile bottom tabbar now shows Main, Profile, Wallet, and Personal Info.
- Profile page now includes quick actions for Collection and Ship Card, plus a `#personal-info` anchor for the Personal Info bottom tab.
- Desktop alignment overrides were added for the top menu, filter row, and left rail; mobile tab labels were constrained to avoid overflow.
- Verification evidence: `npm run check` passed; localhost on port `3005` returned `200` for `/`, `/profile`, `/wallet`, `/ranking`, `/exchange`, and `/shipping`; text smoke confirmed the new labels and absence of removed home nav/filter labels. Evidence: `docs/verification/2026-05-08-nav-cleanup.md`.
- No API, database, auth, payment, or production deployment logic changed in this slice.

### Production and online testing readiness plan

- Ran `$ralplan "what do we need before production and online testing"` in deliberate consensus mode because the next work touches production migrations, auth, LINE/Google providers, payment, wallet ledger, admin, and existing LIFF data.
- Final approved plan: `docs/plans/ralplan-production-online-testing-readiness.md`.
- Context snapshot: `.omx/context/production-online-testing-readiness-20260507T075853Z.md`.
- Consensus outcome:
  - Architect initially requested more operational specificity, then approved after the plan added a concrete migration runbook, staging strategy, provider/env checklist, go/no-go evidence gate, observability/incident criteria, and constrained production pilot rules.
  - Critic initially requested a complete migration-object checklist, execution-grade e2e matrix, and expanded pre-mortem; final v4 was approved after adding all Phase 1/2 objects, `draw_rounds` alterations, `payment_slips` owner/XOR checks, full `audit_events` alterations, and a manual-to-automation online e2e matrix.
- Chosen path: staging/preview first, then production cutover with backup, then constrained internal production pilot before public launch.
- Production is still not changed by this planning step; the next execution must not run production migration or deploy production writes until backup, staging, provider, owner/admin, and go/no-go evidence gates are satisfied.

### Remaining production phase document set

- Created owner-readable phase documents for all remaining production phases:
  - `docs/plans/production-phases/README.md`
  - `docs/plans/production-phases/phase-1-production-data-inventory-backup.md`
  - `docs/plans/production-phases/phase-2-staging-supabase-preview.md`
  - `docs/plans/production-phases/phase-3-provider-identity-owner-admin.md`
  - `docs/plans/production-phases/phase-4-wallet-payment-admin-qa.md`
  - `docs/plans/production-phases/phase-5-gacha-collection-exchange-shipping-qa.md`
  - `docs/plans/production-phases/phase-6-production-preflight.md`
  - `docs/plans/production-phases/phase-7-production-smoke-limited-pilot.md`
- Added cross-cutting future-proof admin plan: `docs/plans/admin-content-studio-future-proofing.md`.
- Added RALPLAN handoff artifact: `.omx/plans/ralplan-remaining-production-phases.md`.
- These are planning/docs-only changes. No production database, provider, payment, auth, or deploy changes were made.
- The next execution remains Phase 1: production inventory plus full backup/restore evidence before any staging/production migration work.


### Local Phase 1-7 readiness implementation

- Added a localhost-safe Phase 1-7 readiness console at `/local-readiness` so the owner can inspect every remaining phase locally without mutating production or staging.
- Added static phase readiness data in `src/features/ynot/phase-readiness.ts` mapping each phase to localhost test links, required real evidence, and external gates.
- Added `tools/verification/verify-phase-readiness.mjs` and wired it into `npm run verify:ynot` so phase docs, required migration files, readiness route, and phase coverage stay checked.
- The console explicitly preserves production gates: no production Supabase migration, provider dashboard change, payment approval, or Vercel production deploy is performed from localhost.
- Local positive UI paths are testable for auth/profile/admin gate, wallet, gacha/open, collection, exchange, shipping, and admin operation surfaces. Real positive mutation evidence still requires migrated staging/production database and provider/admin credentials.

### Ralph weakness hardening pass

- Added a Ralph-specific context snapshot and PRD/test spec for fixing project weaknesses:
  - `.omx/context/fix-all-weaknesses-20260508T160220Z.md`
  - `.omx/plans/prd-fix-project-weaknesses.md`
  - `.omx/plans/test-spec-fix-project-weaknesses.md`
- Production demo leakage risk reduced:
  - Storefront demo campaign fallback is now allowed only in local/explicit demo mode and defaults off in production.
  - Customer collection/actions no longer render sample cards or hardcoded inventory counts as if they were real owned inventory. Collection metrics now derive from wallet/collection row state.
  - Fake live activity, fake ranking rows, hardcoded demo campaign CTAs, static reward tiers, and fake exchange catalog/coin totals are removed or gated behind explicit demo mode.
  - Unsupported “provably fair” customer copy was softened to server-recorded/result-tracking language until a real verifiable seed/hash proof model exists.
  - Fabricated remaining-stock fallback was removed; production campaigns without a real `remainingSlots` value now show neutral server-tracked stock copy instead of invented counts.
  - Phase readiness links no longer point at the hardcoded demo campaign; they use stable real pages/admin/readiness surfaces.
- Admin operational visibility improved:
  - Admin dashboard now includes platform health checks for key env vars, demo mode, durable rate-limit backend config, and core Supabase platform tables including `cards`, `draw_round_prizes`, and `api_rate_limits`.
  - Dashboard data-read fallbacks are recorded per request and surfaced in admin health as warnings instead of being hidden as empty UI only.
- Sensitive website mutations now use a shared server-only rate-limit helper across wallet top-up, gacha open, exchange, shipping, address save, and key admin mutation routes.
  - Local/dev can use bounded in-memory limiting.
  - Production fails closed unless `RATE_LIMIT_BACKEND=supabase` is configured after applying the new `api_rate_limits` migration/RPC.
- Added durable rate-limit schema/RPC migration: `../Database/supabase/migrations/20260508162000_add_api_rate_limits.sql`, plus generated type coverage in `src/lib/supabase/types.ts`.
- API ownership is now documented in `docs/architecture/api-boundary.md` to separate legacy `/api/lucky-draw/*`, LINE `/api/line/*`, and website `/api/ynot/*` responsibilities.
- Added and strengthened `npm run verify:hardening`, and included it in `npm run verify:ynot` / `npm run check`, so the new hardening rules catch demo leakage, missing durable rate-limit wiring, weak admin health checks, fake collection/exchange values, unsupported fairness claims, fabricated stock fallbacks, and unsafe route coverage regressions.
- Final Ralph evidence: architect verification approved after the fabricated stock-count blocker was removed; scoped deslop pass completed on Ralph-changed files; post-deslop `npm run verify:hardening`, `npx tsc --noEmit --pretty false`, and full `npm run check` passed.
- Remaining external blockers are unchanged: production Supabase migration, provider dashboard changes, production payment/gacha pilot, and full live UAT still require backup, SQL/provider access, owner go/no-go, and real staging/production credentials.

### Complete admin current-schema workflow implementation

- Implemented the approved Option A from `.omx/plans/ralplan-complete-admin-page-next-step.md`: complete current schema-backed admin workflows first, while keeping future CMS (`store_categories`, `media_assets`) as later-phase work.
- Added Ralph gate docs:
  - `.omx/plans/prd-complete-admin-db-workflows.md`
  - `.omx/plans/test-spec-complete-admin-db-workflows.md`
- Closed the known shipping admin transaction-safety gap locally:
  - Added migration `../Database/supabase/migrations/20260509162000_add_admin_shipping_status_rpc.sql` with `public.update_shipping_request_status(...)`.
  - The RPC locks the shipping request row, validates status transitions, updates related collection item states, and writes `shipping_status_updated` audit events in one database transaction.
  - Execution is revoked from public/anon/authenticated and granted to `service_role` only.
  - `/api/ynot/admin/shipping` now calls the RPC instead of directly updating `shipping_requests`, `collection_items`, and `audit_events` from route code.
  - Supabase TypeScript types include the new RPC signature.
- Added durable workflow documentation: `docs/architecture/admin-workflow-matrix.md`, including the current admin route/API/database matrix, current-schema completion status, and future CMS roadmap.
- Strengthened `npm run verify:hardening` to guard the new admin shipping RPC, admin route boundary, Supabase type coverage, and admin workflow matrix.
- Important guard: this is checked-in local code/migration work only. No production Supabase migration was applied because production DB changes still require backup, project/env confirmation, SQL review, and owner go/no-go.

### Production admin test-data readiness implementation

- Implemented the approved production-test admin workflow locally; no production Supabase migration, seed apply, or deploy was performed.
- Added Ralph gate docs:
  - `.omx/plans/prd-production-admin-test-data-readiness.md`
  - `.omx/plans/test-spec-production-admin-test-data-readiness.md`
- Added migration `../Database/supabase/migrations/20260509100000_admin_test_categories_inventory.sql` for:
  - database-backed `store_categories` and `draw_round_categories`, seeded with Pokemon/One Piece compatibility rows;
  - `is_test`/`seed_run_id` tagging for campaigns/cards/prizes;
  - `draw_round_testers` whitelist;
  - `draw_round_prize_units` inventory units;
  - `seed_runs`/`seed_run_items` registry;
  - RLS/grants that keep test rows and seed/whitelist/inventory tables hidden from direct anon/auth reads;
  - transactional `open_gacha_campaign` replacement that locks campaign, wallet, slots, and prize units and checks test whitelist/admin access before opening.
- Admin UX/API now supports the test workflow:
  - `/admin/categories` can create/edit DB categories.
  - `/admin/campaigns` can assign categories and mark packs as production-test packs.
  - `/admin/prizes` can create test cards with approved asset evidence and attach prize quantities to packs.
  - Admin pack/prize views show remaining pack/prize inventory summaries.
- Fixed architect-review blocker: `/gacha/[campaignId]` and `/gacha/[campaignId]/open` now have a whitelisted/admin test-pack read path via `getCampaign(..., { allowTestForCurrentViewer: true })`, while the normal public campaign list still excludes test packs.
- Added generated/original placeholder assets under `public/test-assets/`, an auditable manifest at `tools/seed/assets/asset-manifest.json`, and a production-safe seed script at `tools/seed/seed-production-admin-test-data.mjs` with `--dry-run`, `--apply`, `--hide`, and `--cleanup` modes.
- Added runbook `docs/runbooks/production-admin-test-data.md`. Production apply remains gated by backup proof, RLS/direct-query proof, staging UAT, asset review, seed dry-run review, and owner go/no-go.
- Added `npm run verify:production-test` and wired it into `npm run verify:ynot`/`npm run check`.
- Verification evidence: `node tools/seed/seed-production-admin-test-data.mjs --dry-run` passed; `npm run typecheck`, `npm run lint`, `npm run verify:production-test` (53 checks), `npm run verify:hardening`, and full `npm run check` passed. Architect re-review approved after the test-pack read path fix.
- Tooling note: Supabase CLI is not installed in this local environment, so migration application must be done through reviewed SQL/CI/operator tooling after the production gate.

### Admin category production fix + tone-field removal

- Category create/update now has clearer admin UX:
  - category fields have visible field titles, required markers, and save confirmation;
  - saved categories update the local dropdown immediately after the API returns;
  - `/api/ynot/admin/categories` returns a specific `CATEGORY_SCHEMA_MISSING` error if production Supabase does not have `store_categories` yet.
- Card and prize-pool admin forms now show visible field titles for important inputs instead of relying only on placeholder text.
- The active Website code no longer reads/writes the legacy color/tone field (`gold`, `red`, `blue`, `green`, `rose`, `violet`) for:
  - YNot admin card creation/update;
  - YNot prize-pool assignment;
  - legacy Lucky Draw admin card editors;
  - customer card rendering and DB-to-UI mapping;
  - Supabase TypeScript table types.
- Added migration `../Database/supabase/migrations/20260509183000_remove_card_tone_fields.sql` to strip `tone` from stored JSON card arrays and drop `cards.tone` / `draw_round_prizes.tone` after both Website and LIFF are on no-tone code.
- Added optional production DB readiness checker: `npm run verify:production-db`. This reads `.env.local`, checks whether production has the required category/inventory tables and RPC, and warns whether legacy tone columns still exist.
- Fresh production schema probe against the current `.env.local` Supabase service-role endpoint fails on five required production-test admin schema objects: `store_categories`, `draw_round_categories`, `draw_round_prize_units`, `seed_runs`, and `get_draw_round_inventory_summary`.
- Legacy `cards.tone` / `draw_round_prizes.tone` still exist until the final no-tone cleanup migration is applied.
- Current blocker: category creation cannot work on production until the reviewed migration `20260509100000_admin_test_categories_inventory.sql` is applied. This local environment has service-role Data API access but no Supabase SQL/DDL path (`supabase` CLI and `psql` are unavailable, and no DB URL/access token is configured), so production DDL still needs the operator/CI/Supabase dashboard apply step.
