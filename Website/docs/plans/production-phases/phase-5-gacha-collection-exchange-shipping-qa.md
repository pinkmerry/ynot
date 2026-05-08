# Phase 5 — Gacha + Collection + Exchange + Shipping QA

Updated: 2026-05-08
Phase state: not complete; planning and gate document.
Production write permission: staging only unless Phase 6 has begun.

## Goal

Prove the full customer operations journey after wallet credit exists: open a pack, receive collection items, exchange items for coins, request shipping, and let admin process the requests.

## User stories

- As a customer, I can open a live pack with wallet coins and receive collection items.
- As a customer, I can exchange eligible collection items for coins.
- As a customer, I can save shipping information and request shipment for selected cards.
- As an admin, I can create/update campaigns and prize pools, process exchanges, and update shipping statuses.
- As the owner, every pack, prize, collection, exchange, and shipping event reconciles to database rows and audit/ledger records.

## Scope

Included:

- Campaign/pack and prize pool setup.
- Gacha open positive flow.
- Collection item creation and state transitions.
- Exchange request approval/rejection.
- Shipping address/request/status flow.
- Ranking snapshot visibility if seeded or generated.
- Admin Content Studio staging UAT for future categories/images if the extension is approved.

Not included:

- Unlimited public campaign launch.
- Real shipping carrier integration unless separately planned.
- Production migration/deploy unless Phase 6 gate is reached.

## Work plan

1. Admin creates or confirms at least two staging packs:
   - Pokemon pack;
   - One Piece pack.
2. Admin assigns cards/prizes to pack prize pool.
3. Customer opens a pack with wallet coins.
4. Verify:
   - wallet debit/ledger;
   - `gacha_opens` and `gacha_open_items`;
   - `collection_items`;
   - campaign remaining/availability behavior.
5. Customer exchanges selected item(s) for coins.
6. Admin approves/rejects exchange and verify item/wallet/ledger state.
7. Customer saves shipping profile/address and requests shipping for selected cards.
8. Admin updates shipping status and tracking note.
9. Verify audit events and private realtime/event behavior where applicable.

## Acceptance criteria

- Admin can create/update staging campaigns and prize pool data.
- Public users see only public/live/closed allowed campaigns, not private drafts.
- Gacha open debits wallet exactly once and creates collection rows.
- Failed open does not lose coins without item evidence.
- Exchange approval credits coins exactly once and updates item state.
- Exchange rejection leaves item available or in documented state.
- Shipping request links to saved address and selected items.
- Admin can progress shipping status with audit trail.
- Customer can view their own data only; non-admin cannot read other users' private data.
- Ranking/customer pages remain readable after data changes.

## UAT

Owner/admin/customer checks in staging:

1. Admin creates a test pack and adds prize cards.
2. Customer opens pack once.
3. Customer views new item in collection.
4. Customer exchanges one item.
5. Admin approves the exchange.
6. Customer requests shipping for another item.
7. Admin updates shipping status.
8. Owner reviews row IDs, ledger entries, audit rows, and screenshots.

## Real tests / evidence

Minimum evidence:

- Campaign/draw round ID and slug.
- Prize/card IDs.
- Wallet before/after balance for open and exchange.
- Gacha open/item IDs.
- Collection item IDs and state transitions.
- Exchange order/item IDs and ledger rows.
- Shipping request/item IDs and address ID.
- Admin audit event IDs.
- API/route screenshots or HTTP outputs.

Recommended checks:

- `npm run verify:ynot` locally before staging UAT.
- Staging DB assertions for one wallet debit per gacha open.
- RLS checks: user A cannot read user B collection/exchange/shipping rows.
- Vercel/Supabase logs for RPC errors during gacha/open/exchange/shipping.

## Admin Content Studio checkpoint

This is the main user-facing proof for future admin control.

If Admin Content Studio extension is included before launch, Phase 5 must also prove:

1. Admin creates a new category without code changes.
2. Admin uploads or selects pack image/banner asset.
3. Admin creates a random pack under that category with title, price, stock, rules, and visibility.
4. Admin adds prize cards/images/info.
5. Admin previews the pack while draft/private.
6. Admin publishes it and customer sees it in the correct category.
7. Admin closes/archives it without deleting historical opens/items.

If this extension is not included before launch, record a clear launch limitation: first pilot pack categories/images are still developer-assisted or limited to the current data model.

## Stop rules

Stop before Phase 6 if:

- gacha can debit without collection item evidence;
- exchange can double-credit;
- shipping can include another user's item;
- draft/private campaign leaks publicly;
- Admin Content Studio requirement is still unresolved for the pilot scope.

## Exit artifact

Create: `../../verification/YYYY-MM-DD-phase-5-gacha-exchange-shipping.md`.

## Reference inputs

- Master readiness plan: `../ralplan-production-online-testing-readiness.md`
- Product PRD: `../prd-ynot-production-website.md`
- Product test spec: `../test-spec-ynot-production-website.md`
- Website status: `../../PROJECT_STATUS.md`
- Shared database plan: `../../../../Database/docs/plans/ralplan-liff-database-redesign.md`
- Existing migration files:
  - `../../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
  - `../../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
- Supabase docs checked on 2026-05-08:
  - Database backups: https://supabase.com/docs/guides/platform/backups
  - Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
  - Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
  - Data API / public schema grant behavior: https://supabase.com/changelog?tags=security
