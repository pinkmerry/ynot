# Admin Content Studio Future-Proofing Plan

Updated: 2026-05-08
Status: design/plan only; no schema or production changes made by this document.

## Why this exists

The owner asked whether admins/owners can control the website in the future: add a new category, create a new random pack, upload images, set prize info, and avoid reimplementing the website each time.

Short answer: the current admin foundation is good for first operations, but it is not fully future-proof for content/category/media yet. This plan defines the missing Admin Content Studio layer and where it fits into the remaining phases.

## Current state

Already present:

- Protected admin pages for campaigns, prizes/cards, top-ups, users, merge review, exchange, shipping, rankings, settings, and audit.
- Server-side admin checks before admin API data/mutations.
- Campaign CRUD uses `draw_rounds`.
- Prize/card admin uses `cards` and `draw_round_prizes`.
- Payment/admin operations are separate API surfaces.

Current gaps:

- Storefront top categories and status filters are still code constants in `src/features/ynot/storefront-content.ts`.
- Admin campaign API currently validates `series` as only `pokemon` or `one_piece`.
- Pack/card images are URL strings, not a full admin-managed asset library.
- There is no dedicated category table, content preview workflow, or content-specific role split yet.
- `site_settings` exists in the platform migration plan but is not enough by itself for categories/media/pack CMS.

## Target admin workflows

### 1. Category Studio

Admin can:

- create category key/slug;
- set English/Thai labels;
- set top-nav visibility;
- set exchange visibility;
- set sort order;
- publish/hide/archive category;
- assign category to a pack.

### 2. Media Library

Admin can:

- upload pack cover image;
- upload pack banner/hero image;
- upload prize/card image;
- reuse an existing asset;
- archive unused assets;
- keep storage paths private/public according to use case.

### 3. Pack Studio

Admin can:

- create draft random pack;
- set category, title, description, rules, price, coin cost, stock/slots, visibility, open/close dates;
- add cover/banner images;
- preview as admin before publish;
- publish/unpublish/close/archive;
- clone an existing pack;
- preserve history after users open it.

### 4. Prize Studio

Admin can:

- create/update card catalog item;
- upload prize image;
- assign cards/prizes to a pack;
- set tier/rank/value/quantity/odds display;
- preview reward tiers;
- prevent destructive changes after live opens unless handled through a versioned/closed workflow.

### 5. Operations Studio

Existing/current admin surfaces continue:

- top-up approve/reject;
- exchange approve/reject;
- shipping status updates;
- user role/merge review;
- audit/ranking/settings.

## Proposed data model additions

Create a new migration only after Phase 1 backup and Phase 2 staging are ready. Use `supabase migration new <name>` at implementation time.

Recommended tables/columns:

- `store_categories`
  - `id`, `key`, `slug`, `label_en`, `label_th`, `description`, `status`, `sort_order`, `show_in_top_nav`, `show_in_exchange`, `created_by`, `updated_by`, timestamps.
- `media_assets`
  - `id`, `bucket`, `path`, `public_url` or signed-path strategy, `kind`, `alt_text`, `mime_type`, `size_bytes`, `width`, `height`, `created_by`, timestamps.
- `draw_rounds` additions
  - `category_id`, `cover_asset_id`, `banner_asset_id`, `short_description`, `rules_markdown`, `preview_token` or preview status, optional `content_version`.
- Optional `campaign_content_versions`
  - only if we need draft/live version separation after launch.
- Optional role extension
  - only if owner wants `content_editor`, `finance_admin`, or `ops_admin` separate from `admin`/`owner`.

## Security/RLS principles

- Public can read only published categories and public/live campaign content.
- Admin/service routes can read drafts after `resolveAdminSession()`.
- Storage upload must require admin server route or signed upload policy.
- Service role stays server-only; never expose it in `NEXT_PUBLIC_*`.
- RLS must be enabled on new public-schema tables with explicit grants/policies.
- Content edits must insert audit events.

## UI/API plan

Suggested routes:

- `/admin/content/categories`
- `/admin/content/assets`
- `/admin/campaigns` enhanced for category/media/preview/publish/clone
- `/admin/prizes` enhanced for image/odds/tier preview

Suggested APIs:

- `GET/POST/PATCH /api/ynot/admin/categories`
- `POST /api/ynot/admin/assets`
- enhanced `POST/PATCH /api/ynot/admin/campaigns`
- enhanced `POST/DELETE /api/ynot/admin/prizes`

## Acceptance criteria

- Admin can add a new category without code changes.
- Admin can upload/select a pack image and prize/card image.
- Admin can create a draft pack with title, info, category, price, stock, and prize pool.
- Admin can preview draft/private pack.
- Admin can publish pack and customer sees it in the right category.
- Admin can close/archive pack without deleting historical gacha/collection rows.
- Non-admin cannot see or mutate content admin routes/APIs.
- Content changes create audit rows.
- Existing Pokemon/One Piece launch categories keep working.

## UAT

1. Admin creates category `PSA10` or another test category.
2. Admin uploads/selects a pack cover image.
3. Admin creates a draft pack under that category.
4. Admin adds prize cards and images.
5. Admin previews it while hidden from normal customer.
6. Admin publishes it.
7. Customer sees category and pack.
8. Customer opens pack in staging.
9. Admin closes/archive pack.
10. Historical open/collection records remain intact.

## Real tests/evidence

- Migration output in staging.
- RLS/grant checks for categories/media/campaign content.
- Storage upload/access checks.
- Admin/non-admin API status checks.
- Screenshot of category/pack creation and customer visibility.
- DB row IDs for category, media asset, campaign, prizes, audit events.

## Phase alignment

| Phase | Content Studio action |
| --- | --- |
| Phase 1 | Inventory current hardcoded content/admin gaps. |
| Phase 2 | Implement/test schema extension in staging only if approved. |
| Phase 3 | Verify owner/admin/content permission model. |
| Phase 4 | Keep finance admin separate from content permissions if role split is needed. |
| Phase 5 | UAT admin-created category/pack/image/prize workflow in staging. |
| Phase 6 | Apply to production only if staging passed and owner approves. |
| Phase 7 | Use one hidden/internal pilot pack; record any remaining content gaps before public launch. |

## Recommendation

Do not block Phase 1 backup or Phase 2 staging setup on this design. But before public launch, decide one of these two routes:

1. **Launch with limited categories**: fastest pilot; Pokemon/One Piece only; new categories/images still require developer support.
2. **Add Content Studio before public launch**: slightly longer, but admins can create future packs/categories/images without reimplementation.

Recommended path: test the Content Studio extension in staging during Phase 2/5, then decide whether to include it in Phase 6 production preflight.

## Reference inputs

- Master readiness plan: `ralplan-production-online-testing-readiness.md`
- Product PRD: `prd-ynot-production-website.md`
- Product test spec: `test-spec-ynot-production-website.md`
- Website status: `../PROJECT_STATUS.md`
- Shared database plan: `../../../Database/docs/plans/ralplan-liff-database-redesign.md`
- Existing migration files:
  - `../../../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql`
  - `../../../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql`
- Supabase docs checked on 2026-05-08:
  - Database backups: https://supabase.com/docs/guides/platform/backups
  - Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
  - Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
  - Data API / public schema grant behavior: https://supabase.com/changelog?tags=security
