# Admin Workflow Matrix

Last updated: 2026-05-09

This document tracks the current admin page completion target for the YNot TCG website. The current milestone is **complete for existing schema-backed workflows**. Future CMS workflows (`store_categories`, `media_assets`, fully managed storefront navigation/media) are intentionally later-phase.

## Completion status legend
- **Complete current schema**: UI/API has a concrete table or RPC backing and can be tested end-to-end after migrations are applied.
- **Partial current schema**: visible/admin-editable but still has an architectural or transaction-safety gap.
- **Future schema needed**: requires new tables/asset workflow before it can be truly complete.

## Current admin surfaces

| Admin surface | Primary route/API | Database backing | Status | Notes |
| --- | --- | --- | --- | --- |
| Dashboard / health | `/admin`, `/admin/health` | read-only Supabase health checks | Complete current schema | Shows env/table/read health; not a write workflow. |
| Campaigns / random packs | `/admin/campaigns`, `/api/ynot/admin/campaigns` | `draw_rounds`, `draw_slots`, `draw_round_prizes`, `cards` | Complete current schema | Current fields include series, title, price, stock, status, display tags, prize links. Future media library can improve image selection. |
| Prizes / card catalog | `/admin/prizes`, `/api/ynot/admin/prizes`, `/api/ynot/admin/cards` | `cards`, `draw_round_prizes` | Complete current schema | Schema-backed card/prize management exists. Future media assets can replace URL/manual image handling. |
| Categories | `/admin/categories` | `draw_rounds.series`, storefront filters | Future schema needed | Current public categories are enum-like (`pokemon`, `one_piece`). True admin-created categories need `store_categories` plus campaign/category relation. |
| Users | `/admin/users`, `/api/ynot/admin/users` | `profiles`, `admin_users`, wallet/profile aggregates | Complete current schema | Admin access remains server-side role-gated. |
| Top-ups / wallet operations | `/admin/top-ups`, `/api/ynot/admin/top-ups` | `top_up_requests`, `payment_slips`, `wallet_accounts`, `coin_ledger`, approval/rejection RPCs | Complete current schema | Review/approve/reject workflows are RPC-backed. |
| Exchange | `/admin/exchange`, `/api/ynot/admin/exchange`, `/api/ynot/admin/merge-requests` | `exchange_orders`, `exchange_order_items`, `collection_items`, exchange RPCs | Complete current schema | Approve/reject workflows are RPC-backed. |
| Shipping | `/admin/shipping`, `/api/ynot/admin/shipping` | `shipping_requests`, `shipping_request_items`, `collection_items`, `update_shipping_request_status` RPC | Complete current schema after migration | Admin transition is now designed as one DB transaction with request row lock, item updates, and audit insert. |
| Rankings | `/admin/rankings` | `ranking_snapshots` | Complete current schema | Snapshot management/read surface only. |
| Settings | `/admin/settings`, `/api/ynot/admin/payment-methods` | `site_settings`, `payment_methods` | Complete current schema | Payment methods are schema-backed. Broader site theme/CMS settings can expand later. |
| Audit | `/admin/audit` | `audit_events` | Complete current schema | Read-only operational trace. |

## Future CMS/admin roadmap

### Phase CMS-1: Dynamic store categories
Add `store_categories` and a relation such as `draw_round_categories` so admin can create categories beyond hard-coded Pokemon / One Piece / New / PSA10 filters.

### Phase CMS-2: Media assets
Add `media_assets` with storage ownership, image variants, alt text, and usage tracking so admin can upload/select campaign, prize, category, and banner images without editing URLs manually.

### Phase CMS-3: Storefront layout/content blocks
Add managed blocks for homepage hero, campaign sections, promotion banners, and legal copy. This should not be mixed into the current admin completion milestone because it changes the product content model.

## Production migration guard
Before applying new admin workflow migrations to production:
1. Confirm target Supabase project ref and environment.
2. Take/confirm database backup.
3. Review SQL and rollback path.
4. Apply migration in a controlled window.
5. Run admin UAT against production with a test admin and test request only.
