# Admin Prize Catalog Redesign — Backend Reconciliation

| Prototype concept (handoff) | Already exists as | Route / source of truth |
|---|---|---|
| Main card (catalog identity) | **Main SKU** = `cards` row -> `CardCatalogItem` | `GET/POST/PATCH/DELETE /api/ynot/admin/cards`; `getAdminCards()` |
| Variant (graded / raw / sealed) | **Sub-SKU** = `stock_skus` (`unit_kind` card/pack/box/other) + `card_stock_units` (status/condition/grade/cert/gemrate) | `stock-skus`, `card-stock` routes; `card.stockSkuGroups` |
| Per-cert graded row (1 cert = 1 card) | `card_stock_units` with `cert_number` + `gemrate_id`; cert pins `delta=1` | `POST /api/ynot/admin/card-stock` (rejects cert with delta!=1) |
| Raw / ungraded pooled line | `condition='raw'` units under a sub-SKU | `POST /api/ynot/admin/card-stock` |
| Test stock (blank cert, qty>1, `TEST` tag) | graded unit w/o cert; `cards.is_test` + asset-audit fields required | `cards` + `card-stock` routes |
| Sealed Box / Sealed Pack categories | `cards.catalog_category` + sub-SKU `unit_kind` box/pack | `cards.catalogCategory`; `stock-skus.unitKind` |
| Box -> pack conversion | conversion rule (`childStockSkuId` + `childQuantity` = packs/box) + `open_stock_container` RPC | `POST /api/ynot/admin/stock-skus` then `POST /api/ynot/admin/stock-skus/open-container` |
| Stock states available / in packs / in bags / removed | `stockAvailable` / `stockReserved` / `stockAllocated` / `stockArchived` | `getAdminCards()` returns all four buckets per card |
| PSA cert lookup (mocked) | **GemRate** cert lookup (real, server-side) | `POST /api/ynot/admin/gemrate-cert` `{cert,grader}` -> `{lookup}` (needs `GEMRATE_API_KEY`) |
| Assign variant -> campaign as prize | `draw_round_prizes` + `metadata.intendedStock*` / `stockUnitUsages` | `POST /api/ynot/admin/prizes` |
| Remove prize | delete by `prizeId` | `DELETE /api/ynot/admin/prizes` |
| Winnable indicator (live campaign) | campaign `status='live'` + a prize row present | `GET /api/ynot/admin/campaigns` + prizes |
| Pull weight / unlock % | `weight` / `unlock_at_sold_pct` — **OWNER-ONLY, never expose to customers** | `prizes` POST (owner role gate); customer-leak invariant |
| Guard: can't delete card in a campaign | `CARD_IN_PRIZE_POOL` 409 | `DELETE /api/ynot/admin/cards` |
| Guard: can't delete variant with active/loaded stock | `CARD_HAS_ACTIVE_STOCK` 409 | `DELETE /api/ynot/admin/cards` |
| Card / variant image upload | upload -> `{ imageUrl, storagePath }` | `POST /api/lucky-draw/admin/card-image` |
| Movement log | `audit_events` rows + stock-movement writes inside RPCs | `audit_events` (`card_stock_adjusted`, `campaign_prize_saved`, ...) |

## Verification evidence

- Migrations: `20260610110000_stock_skus_and_container_conversion.sql`, `20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql`
- Route files confirmed: `card-stock/route.ts`, `stock-skus/route.ts`, `stock-skus/open-container/route.ts`
- GemRate cert: `GEMRATE_CERT_LOOKUP_URL` found in `features/ynot/gemrate-cert.ts`
- Stock buckets: `stockAvailable`, `stockReserved`, `stockAllocated`, `stockArchived`, `stockSkuGroups` confirmed in `data.ts` lines 5013-5017

Backend gap: NONE — redesign is frontend-only (verified 2026-06-21 on feat/admin-prize-stock worktree).
