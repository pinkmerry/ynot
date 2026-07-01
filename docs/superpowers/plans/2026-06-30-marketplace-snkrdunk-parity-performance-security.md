# Marketplace SNKRDUNK Parity Performance Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpower-subagent-driven-development` (recommended) or `superpower-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade YNOTT marketplace into a product-grouped trading-card marketplace closer to SNKRDUNK: grouped product browse, variant/grade counts, product-level price history, listing-detail image-first purchase pages, cart/watchlist flows, seller trust/admin detail views, and clearer marketplace language.

**Architecture:** Deepen the existing marketplace modules instead of adding another parallel surface. Keep the canonical API under `/api/ynot/marketplace/*`, maintain `/api/marketplace/*` adapters, preserve one shared YNOTT login, and make database read models/RPCs the performance boundary for browse/detail pages.

**Tech Stack:** Next.js App Router in `Website/`, TypeScript, Supabase/Postgres in `Database/marketplace-supabase`, existing marketplace route guards/request guards/RLS verification scripts, existing YNOTT UI patterns.

---

## File Map

- `Website/src/app/(store)/marketplace/page.tsx` - marketplace main browse page.
- `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx` - product-group market page.
- `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx` - single listing detail route.
- `Website/src/features/ynot/MarketplaceProductPage.tsx` - product detail UI with variants, offers, price history.
- `Website/src/features/ynot/MarketplaceListingGallery.tsx` - listing image carousel.
- `Website/src/lib/marketplace/product-market.ts` - product market read model client.
- `Website/src/lib/marketplace/product-browse.ts` - grouped marketplace browse client.
- `Website/src/lib/marketplace/listings.ts` - listing snapshot/detail access.
- `Website/src/lib/marketplace/seller-consignment.ts` - seller submission and image rules.
- `Website/src/lib/marketplace/route-guards.ts` - marketplace auth/action guards.
- `Website/src/lib/marketplace/request-guard.ts` - idempotency/canonical mutation body guard.
- `Website/src/app/api/ynot/marketplace/**` - canonical marketplace API/RPC routes.
- `Website/src/app/api/marketplace/**` - adapter routes for shorter marketplace URLs.
- `Website/tools/verification/verify-marketplace-*.mjs` - marketplace hardening/schema/RLS verification.
- `Database/marketplace-supabase/migrations/*.sql` - marketplace schema, views, RPCs, RLS.

---

## Architecture Deepening Targets

1. **Deepen Product Market Projection**
   - Move product detail fanout into a product-detail RPC/read model.
   - Ensure public listing snapshots expose non-sensitive `product_id`, `variant_id`, and seller public profile references.
   - Preserve existing UI function names while reducing network round trips.

2. **Deepen Listing Commerce**
   - Add first-class cart and watchlist modules, not local UI-only state.
   - Keep `Buy now`, `Add to cart`, and `Watch` as separate flows with clear labels.
   - Use idempotent mutations so double-clicks cannot duplicate cart/watch state.

3. **Deepen Seller Trust**
   - Add public seller profile/read model for seller display name, shop type, status, rating/count placeholders, and fulfilled order counts.
   - Do not expose seller PII or marketplace account internals.
   - Add admin detail views for submission/listing/order evidence.

4. **Deepen Marketplace Metadata**
   - Add JSON-LD and metadata builders from public projection data only.
   - Add analytics-friendly view event payloads without leaking user/session/customer data.

5. **Deepen Mutation Guard**
   - Consolidate same-origin, auth, rate-limit, idempotency, action flag, allowed-field, and canonical request hash checks.
   - Apply it to cart/watchlist, checkout, seller submissions/photos, cancel flows, and admin transitions.

---

## Security And Performance Invariants

- Do not apply production Supabase migrations until the existing backup/PITR and restore-drill gate is satisfied.
- All write APIs must require same-origin mutation checks, login where needed, rate limit, action gating, allowed JSON fields, idempotency for non-trivial mutations, and RLS/service-role boundary checks.
- Public product/listing views must never expose customer profile IDs, seller private account IDs, email, phone, address, payout data, idempotency keys, request hashes, or admin notes.
- Product browse and product detail pages must read from grouped read models/RPCs rather than N+1 listing scans.
- Seller image uploads stay capped at 10 images per listing/submission, stored through existing seller-consignment rules with content type, size, role/order, path, and hash validation.
- Filters must update URL state and visible selected chips smoothly without full page jank or duplicated cards.
- Official shop and user seller flows must remain distinct in UI copy and backend source fields.

---

## Task 1: Add A Marketplace Parity Guard Test

**Purpose:** Create a failing guard that captures the expected architecture before making schema/UI changes.

**Files:**
- Create `Website/scripts/test-marketplace-snkrdunk-parity.mjs`
- Modify `Website/package.json`

**Steps:**
- [x] Create `Website/scripts/test-marketplace-snkrdunk-parity.mjs` using `node:test`, `node:assert/strict`, `node:fs`, and `node:path`.
- [x] Assert `Website/package.json` contains script `test:marketplace-snkrdunk-parity`.
- [x] Assert migration `Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql` exists.
- [x] Assert that migration includes `marketplace_cart_items`, `marketplace_watchlist_items`, `marketplace_public_seller_profiles`, `product_id`, `variant_id`, `seller_public_profile_id`, `enable row level security`, and `revoke all`.
- [x] Assert these library files exist:
  - `Website/src/lib/marketplace/cart-watchlist.ts`
  - `Website/src/lib/marketplace/seller-trust.ts`
  - `Website/src/lib/marketplace/marketplace-metadata.ts`
  - `Website/src/lib/marketplace/mutation-guard.ts`
- [x] Assert canonical and adapter API routes exist for cart and watchlist:
  - `Website/src/app/api/ynot/marketplace/cart/route.ts`
  - `Website/src/app/api/ynot/marketplace/cart/items/route.ts`
  - `Website/src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts`
  - `Website/src/app/api/ynot/marketplace/watchlist/route.ts`
  - `Website/src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts`
  - matching routes under `Website/src/app/api/marketplace/**`
- [x] Assert marketplace cart/watchlist pages exist:
  - `Website/src/app/(store)/marketplace/cart/page.tsx`
  - `Website/src/app/(store)/marketplace/watchlist/page.tsx`
- [x] Assert listing detail route imports `MarketplaceListingDetailPage` and exports metadata.
- [x] Assert metadata builders do not include private field names such as `email`, `phone`, `address`, `payout`, `profile_id`, or `marketplace_account_id`.
- [x] Add script to `Website/package.json`:

```json
"test:marketplace-snkrdunk-parity": "node scripts/test-marketplace-snkrdunk-parity.mjs"
```

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
```

Expected before implementation: fails on missing migration/modules/routes.

Expected after full plan: exits with code `0`.

**Commit:**

```bash
git add Website/scripts/test-marketplace-snkrdunk-parity.mjs Website/package.json
git commit -m "Protect marketplace parity architecture before implementation

Constraint: SNKRDUNK-style marketplace changes span schema, APIs, and UI
Rejected: UI-only parity check | misses security and backend projection regressions
Confidence: high
Scope-risk: narrow
Directive: Keep this guard updated when marketplace parity boundaries change
Tested: npm run test:marketplace-snkrdunk-parity fails on missing implementation as expected
Not-tested: Browser behavior is covered in later tasks"
```

---

## Task 2: Fix Public Projection And Add Cart Watchlist Schema

**Purpose:** Make product-grouped pages and listing-detail purchase flows possible without leaking private data.

**Files:**
- Create `Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql`
- Modify `Website/tools/verification/verify-marketplace-schema.mjs`
- Modify `Website/tools/verification/verify-marketplace-rls.mjs`

**Steps:**
- [x] Create `marketplace_public_seller_profiles` with public seller profile fields:
  - `seller_public_profile_id uuid primary key`
  - `marketplace_account_id uuid not null unique`
  - `display_name text not null`
  - `seller_kind text not null check in ('official_shop','user_seller')`
  - `status text not null check in ('active','paused','suspended')`
  - `fulfilled_order_count integer not null default 0`
  - `positive_rating_count integer not null default 0`
  - `rating_count integer not null default 0`
  - timestamps
- [x] Create `marketplace_cart_items` with one row per buyer account/listing and a unique key on `(buyer_marketplace_account_id, listing_id)`.
- [x] Create `marketplace_watchlist_items` with one row per buyer account/listing and a unique key on `(buyer_marketplace_account_id, listing_id)`.
- [x] Add indexes for buyer cart lookup, buyer watchlist lookup, listing reverse lookup, product/variant browse lookup, and seller public profile lookup.
- [x] Recreate `marketplace_public_listing_snapshots` to include non-sensitive `product_id`, `variant_id`, and `seller_public_profile_id`.
- [x] Keep private fields out of the public snapshot view.
- [x] Enable RLS on new tables.
- [x] Revoke direct table access from `anon` and `authenticated`.
- [x] Grant service-role access for server-side APIs and verification tools.
- [x] Add schema verifier checks that public snapshots contain `product_id`, `variant_id`, and not private seller/customer columns.
- [x] Add RLS verifier checks for cart/watchlist/seller profile table policy status and revoked public access.

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
npm run verify:marketplace-schema
npm run verify:marketplace-rls
```

Expected during this task: parity guard progresses past migration checks and fails on later missing modules.

**Commit:**

```bash
git add Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql Website/tools/verification/verify-marketplace-schema.mjs Website/tools/verification/verify-marketplace-rls.mjs
git commit -m "Add secure marketplace parity read models

Constraint: Public marketplace pages need grouped product/listing data without private seller or buyer fields
Rejected: Client-side joins over raw listing tables | exposes more data and performs poorly
Confidence: medium
Scope-risk: moderate
Directive: Keep public views projection-only and service-role gated for writes
Tested: npm run verify:marketplace-schema; npm run verify:marketplace-rls
Not-tested: Production migration apply is gated by backup and restore-drill readiness"
```

---

## Task 3: Add Product Detail Read Model RPC

**Purpose:** Reduce product page fanout and make filters/variant counts fast at marketplace scale.

**Files:**
- Create `Database/marketplace-supabase/migrations/20260630123000_marketplace_product_detail_read_model.sql`
- Modify `Website/src/lib/marketplace/product-market.ts`
- Modify `Website/scripts/test-marketplace-snkrdunk-parity.mjs`

**Steps:**
- [x] Create RPC `marketplace_get_product_market_detail(p_slug text, p_source text, p_condition text, p_grade text, p_limit integer)` returning JSONB with:
  - `product`
  - `variants`
  - `selectedVariant`
  - `listings`
  - `priceHistory`
  - `relatedVariants`
  - `availableCount`
  - `updatedAt`
- [x] Build RPC from public projection views only.
- [x] Clamp `p_limit` inside SQL to a safe range such as 1-50.
- [x] Add indexes used by slug/source/condition/grade/listing lookups.
- [x] Grant RPC execution only to the server role used by marketplace APIs.
- [x] Update `getMarketplaceProductMarket` to call the RPC first and normalize the returned JSON into existing `MarketplaceProductMarket` types.
- [x] Preserve existing mock/fallback behavior for local development when marketplace environment variables are absent.
- [x] Update parity guard to assert `product-market.ts` calls `marketplace_get_product_market_detail`.

**Verify:**

```bash
cd Website
npm run test:marketplace-product-market
npm run test:marketplace-product-grouping
npm run test:marketplace-snkrdunk-parity
```

Expected: product market tests pass with the new RPC path and existing local fallback data.

**Commit:**

```bash
git add Database/marketplace-supabase/migrations/20260630123000_marketplace_product_detail_read_model.sql Website/src/lib/marketplace/product-market.ts Website/scripts/test-marketplace-snkrdunk-parity.mjs
git commit -m "Move product market detail reads behind one projection RPC

Constraint: SNKRDUNK-style product pages need variants, offers, and history without multiple Supabase round trips
Rejected: More client/server fanout from product-market.ts | scales poorly as listings grow
Confidence: medium
Scope-risk: moderate
Directive: Keep product detail data sourced from public projection views only
Tested: npm run test:marketplace-product-market; npm run test:marketplace-product-grouping; npm run test:marketplace-snkrdunk-parity
Not-tested: Linked database execution until migration gate is cleared"
```

---

## Task 4: Add Cart And Watchlist Domain Module

**Purpose:** Make listing purchase actions real backend flows with clear UI labels.

**Files:**
- Create `Website/src/lib/marketplace/cart-watchlist.ts`
- Create `Website/src/app/api/ynot/marketplace/cart/route.ts`
- Create `Website/src/app/api/ynot/marketplace/cart/items/route.ts`
- Create `Website/src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts`
- Create `Website/src/app/api/ynot/marketplace/watchlist/route.ts`
- Create `Website/src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts`
- Create matching adapter routes under `Website/src/app/api/marketplace/**`
- Create `Website/src/app/(store)/marketplace/cart/page.tsx`
- Create `Website/src/app/(store)/marketplace/watchlist/page.tsx`

**Steps:**
- [x] Implement `listMarketplaceCart(accountId)`.
- [x] Implement `addMarketplaceCartItem(accountId, listingId, options)`.
- [x] Implement `removeMarketplaceCartItem(accountId, listingId)`.
- [x] Implement `listMarketplaceWatchlist(accountId)`.
- [x] Implement `watchMarketplaceWatchlistItem(accountId, listingId)` and `removeMarketplaceWatchlistItem(accountId, listingId)`.
- [x] Validate listing IDs as UUIDs before database calls.
- [x] Reject inactive, sold, reserved, or hidden listings before cart add.
- [x] Return stable conflict responses when an item is already sold or already in cart.
- [x] Require login/account bridge for every cart/watchlist route.
- [x] Use existing route guards, request guards, rate limit, same-origin checks, and idempotency keys for mutations.
- [x] Keep `/api/marketplace/*` adapter routes as thin reexports to `/api/ynot/marketplace/*`.
- [x] Build cart page with listing image, title, grade/condition, seller type, price, remove action, and checkout action.
- [x] Build watchlist page with listing image, title, grade/condition, seller type, price, remove action, and see listing action.

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
npm run test:marketplace-user-seller-purchase
npm run test:marketplace-official-shop
```

Expected: parity guard passes cart/watchlist file checks and purchase tests still pass.

**Commit:**

```bash
git add Website/src/lib/marketplace/cart-watchlist.ts Website/src/app/api/ynot/marketplace/cart Website/src/app/api/ynot/marketplace/watchlist Website/src/app/api/marketplace/cart Website/src/app/api/marketplace/watchlist Website/src/app/'(store)'/marketplace/cart Website/src/app/'(store)'/marketplace/watchlist
git commit -m "Add cart and watchlist as marketplace domain flows

Constraint: Listing pages need clear buy, cart, and watch actions backed by persistent state
Rejected: Browser-only cart state | loses account continuity and bypasses mutation guards
Confidence: medium
Scope-risk: moderate
Directive: Mutating marketplace routes must remain same-origin, rate-limited, and idempotent
Tested: npm run test:marketplace-snkrdunk-parity; npm run test:marketplace-user-seller-purchase; npm run test:marketplace-official-shop
Not-tested: Full browser checkout with live payment provider"
```

---

## Task 5: Add Seller Trust Module And Admin Detail Views

**Purpose:** Give buyers and admins enough detail to trust listings without mixing public and private data.

**Files:**
- Create `Website/src/lib/marketplace/seller-trust.ts`
- Create `Website/src/app/(store)/marketplace/sellers/[sellerPublicProfileId]/page.tsx`
- Create admin detail routes under the existing marketplace admin area:
  - listing detail
  - seller submission detail
  - order detail
- Modify existing admin marketplace overview/queue pages to link to detail routes.

**Steps:**
- [x] Implement `getPublicSellerTrustProfile(sellerPublicProfileId)`.
- [x] Implement `getSellerPublicListings(sellerPublicProfileId, filters)`.
- [x] Implement admin-only detail fetchers for listing, submission, order, photos, status history, and public/private field separation.
- [x] Add seller public page showing display name, seller type, fulfilled count, rating count, active listings, and policy-safe contact wording.
- [x] Add admin listing detail page with listing state, seller account link, product/variant link, images, price, source, condition, grade, and status history.
- [x] Add admin submission detail page with uploaded images, perspective/order, validation evidence, submission state, and admin action history.
- [x] Add admin order detail page with buyer/seller references, listing/product references, payment review state, idempotency/request evidence, and fulfillment state.
- [x] Keep private fields visible only on admin routes guarded by owner/admin checks.

**Verify:**

```bash
cd Website
npm run test:marketplace-ops-hardening
npm run verify:marketplace-hardening
npm run test:marketplace-snkrdunk-parity
```

Expected: admin hardening checks pass and public seller routes do not expose private account columns.

**Commit:**

```bash
git add Website/src/lib/marketplace/seller-trust.ts Website/src/app/'(store)'/marketplace/sellers Website/src/app/**/admin/**/marketplace
git commit -m "Separate public seller trust from admin marketplace evidence

Constraint: Buyers need seller confidence while admins need full operational detail
Rejected: Exposing marketplace account data on public listing pages | leaks private seller state
Confidence: medium
Scope-risk: moderate
Directive: Public seller pages must use seller public profile projections only
Tested: npm run test:marketplace-ops-hardening; npm run verify:marketplace-hardening; npm run test:marketplace-snkrdunk-parity
Not-tested: Production admin role matrix"
```

---

## Task 6: Add Marketplace Metadata And JSON-LD Builders

**Purpose:** Make product/listing pages more discoverable and instrumentable without mixing presentation with metadata logic.

**Files:**
- Create `Website/src/lib/marketplace/marketplace-metadata.ts`
- Modify `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx`
- Modify `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx`
- Modify `Website/scripts/test-marketplace-snkrdunk-parity.mjs`

**Steps:**
- [x] Implement `buildMarketplaceProductMetadata(productMarket)`.
- [x] Implement `buildMarketplaceListingMetadata(listingDetail)`.
- [x] Implement `buildMarketplaceProductJsonLd(productMarket)`.
- [x] Implement `buildMarketplaceListingJsonLd(listingDetail)`.
- [x] Implement `buildMarketplaceViewContentEvent(input)` with public product/listing identifiers, category, variant, source, price range, and seller kind.
- [x] Ensure metadata functions accept public projection objects only.
- [x] Add `generateMetadata` to product and listing pages.
- [x] Render JSON-LD script blocks on product and listing pages.
- [x] Add parity assertions that private field names are absent from metadata builders.

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
npm run test:marketplace-product-market
```

Expected: metadata tests pass and no private field markers appear in metadata module.

**Commit:**

```bash
git add Website/src/lib/marketplace/marketplace-metadata.ts Website/src/app/'(store)'/marketplace/products/[productSlug]/page.tsx Website/src/app/'(store)'/marketplace/listings/[listingId]/page.tsx Website/scripts/test-marketplace-snkrdunk-parity.mjs
git commit -m "Isolate marketplace SEO and analytics metadata

Constraint: Product and listing pages need richer metadata without exposing private marketplace data
Rejected: Inline JSON-LD inside page components | harder to audit for PII leakage
Confidence: high
Scope-risk: narrow
Directive: Metadata builders must only receive public projection data
Tested: npm run test:marketplace-snkrdunk-parity; npm run test:marketplace-product-market
Not-tested: Search engine rendering behavior"
```

---

## Task 7: Rebuild Listing Detail As Image-First Buying Page

**Purpose:** Make the single-listing page match the SNKRDUNK-style buying experience: image-first, seller detail, condition facts, and clear purchase actions.

**Files:**
- Create `Website/src/features/ynot/MarketplaceListingDetailPage.tsx`
- Create `Website/src/features/ynot/MarketplaceListingLightbox.tsx`
- Create `Website/src/features/ynot/MarketplaceStickyCommerceBar.tsx`
- Modify `Website/src/features/ynot/MarketplaceListingGallery.tsx`
- Modify `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx`
- Modify `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx`

**Steps:**
- [x] Move listing-detail rendering from the server route into `MarketplaceListingDetailPage`.
- [x] Put the listing gallery/image carousel at the top of the page on mobile and left/top focal area on desktop.
- [x] Support up to 10 seller images.
- [x] Add left/right image controls, thumbnail rail, and lightbox/zoom view.
- [x] Show title, product code, variant/grade/condition/source, seller type, price, fee/shipping copy, updated date, and safe seller trust summary.
- [x] Replace confusing labels with clear commands:
  - `Buy now`
  - `Add to cart`
  - `Watch listing`
  - `Ask seller support`
  - `See product market`
  - `View all offers`
- [x] Add sold/unavailable state that disables purchase/cart actions and explains the state in plain language.
- [x] Add sticky commerce bar on mobile with `Buy now`, `Add to cart`, and `Watch`.
- [x] Link from listing detail back to product market page and from product offers into listing detail pages.
- [x] Keep official shop and user seller visual selection as vertical oval chips aligned with the gacha page style.
- [x] Remove unrelated marketplace copy such as paused buying copy when the listing is available.

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
npm run typecheck
```

Manual local smoke:

```bash
cd Website
npm run dev
```

Open these routes on localhost:
- `/marketplace`
- `/marketplace/products/eb02-001-roronoa-zoro`
- `/marketplace/listings/<known-listing-id>`
- `/marketplace/cart`
- `/marketplace/watchlist`

Expected: image controls work, button labels are clear, purchase actions either mutate correctly or redirect/login clearly, and no unrelated paused-buying copy is visible on available listings.

**Commit:**

```bash
git add Website/src/features/ynot/MarketplaceListingDetailPage.tsx Website/src/features/ynot/MarketplaceListingLightbox.tsx Website/src/features/ynot/MarketplaceStickyCommerceBar.tsx Website/src/features/ynot/MarketplaceListingGallery.tsx Website/src/app/'(store)'/marketplace/listings/[listingId]/page.tsx Website/src/app/'(store)'/marketplace/products/[productSlug]/page.tsx
git commit -m "Make listing detail an image-first buying page

Constraint: Buyers need SNKRDUNK-style listing inspection before purchase
Rejected: Keeping listing detail as a fact-card page | hides image evidence and makes actions unclear
Confidence: medium
Scope-risk: moderate
Directive: Listing UI must keep buy, cart, watch, and product-market actions visually distinct
Tested: npm run test:marketplace-snkrdunk-parity; npm run typecheck
Not-tested: Payment provider completion on localhost"
```

---

## Task 8: Smooth Browse Filters And Main Marketplace Polish

**Purpose:** Make marketplace browsing feel stable and elegant while preserving URL-addressable filters.

**Files:**
- Modify `Website/src/app/(store)/marketplace/page.tsx`
- Modify existing marketplace browse/filter components under `Website/src/features/ynot/`
- Modify `Website/src/lib/marketplace/product-browse.ts` if filter data shape needs count labels.

**Steps:**
- [x] Use selected filter chips that update immediately and keep URL search params in sync.
- [x] Use shallow client transitions or optimistic selected-filter state so the whole page does not visually reload.
- [x] Show count labels from grouped browse data, such as `PSA 10 (10)` and `Raw (5)`.
- [x] Keep product cards grouped by product/variant market, not duplicated per seller listing.
- [x] Add official shop/user seller vertical oval selector using the gacha page visual language.
- [x] Improve header hierarchy: brand `YNOT`, marketplace title, concise search, filter controls, cart/watchlist/account actions.
- [x] Remove hard-to-understand copy and replace with action-oriented labels.
- [x] Add empty states for no matching filters, no cart items, and no watchlist items.

**Verify:**

```bash
cd Website
npm run test:marketplace-product-grouping
npm run test:marketplace-snkrdunk-parity
npm run typecheck
```

Manual local smoke:
- Select grade `PSA 10`; visible count and selected chip match grouped result data.
- Select `Raw`; visible count and selected chip match grouped result data.
- Toggle official shop/user seller chip; URL changes and card list updates without a full visual reset.
- Click product card; product page shows available market price/listings for that product.

**Commit:**

```bash
git add Website/src/app/'(store)'/marketplace/page.tsx Website/src/features/ynot Website/src/lib/marketplace/product-browse.ts
git commit -m "Polish marketplace browse filters around grouped product markets

Constraint: Filters must show grouped market counts smoothly without splitting same-card listings by seller
Rejected: Full reload filter UX | feels unstable and obscures selected filter state
Confidence: medium
Scope-risk: moderate
Directive: Browse cards represent product markets; listings belong on product/detail pages
Tested: npm run test:marketplace-product-grouping; npm run test:marketplace-snkrdunk-parity; npm run typecheck
Not-tested: High-volume production browse latency"
```

---

## Task 9: Centralize Marketplace Mutation Guard

**Purpose:** Reduce security drift across mutating marketplace routes.

**Files:**
- Create `Website/src/lib/marketplace/mutation-guard.ts`
- Modify mutating marketplace routes under `Website/src/app/api/ynot/marketplace/**`
- Modify `Website/tools/verification/verify-marketplace-hardening.mjs`
- Modify `Website/scripts/test-marketplace-snkrdunk-parity.mjs`

**Steps:**
- [x] Implement `prepareMarketplaceMutation(request, options)` that composes:
  - same-origin mutation enforcement
  - method check
  - marketplace action flag check
  - login/profile requirement where needed
  - owner/admin requirement where needed
  - rate limit
  - idempotency key validation
  - allowed JSON body fields
  - canonical request hash
- [x] Return a typed context containing parsed body, idempotency key, request hash, profile/admin/account references, and response helpers.
- [x] Migrate checkout official/user seller routes to the centralized guard.
- [x] Migrate seller submission/photo routes to the centralized guard.
- [x] Migrate cancel request flows to the centralized guard while preserving current confirmation behavior.
- [x] Migrate cart/watchlist routes to the centralized guard.
- [x] Migrate admin listing/submission/order transition routes to the centralized guard.
- [x] Update hardening verifier to fail any new mutating route that does not import `prepareMarketplaceMutation`.

**Verify:**

```bash
cd Website
npm run verify:marketplace-hardening
npm run test:marketplace-ops-hardening
npm run test:marketplace-seller-consignment
npm run test:marketplace-user-seller-purchase
npm run test:marketplace-official-shop
npm run test:marketplace-snkrdunk-parity
```

Expected: all mutating route hardening checks pass and purchase/submission flows keep prior behavior.

**Commit:**

```bash
git add Website/src/lib/marketplace/mutation-guard.ts Website/src/app/api/ynot/marketplace Website/tools/verification/verify-marketplace-hardening.mjs Website/scripts/test-marketplace-snkrdunk-parity.mjs
git commit -m "Centralize marketplace mutation security checks

Constraint: Marketplace write routes now cover checkout, seller upload, cart, watchlist, cancel, and admin transitions
Rejected: Copy-pasted route guard chains | easy to miss rate limits or idempotency on new routes
Confidence: medium
Scope-risk: broad
Directive: Every marketplace mutation must enter through prepareMarketplaceMutation
Tested: npm run verify:marketplace-hardening; npm run test:marketplace-ops-hardening; npm run test:marketplace-seller-consignment; npm run test:marketplace-user-seller-purchase; npm run test:marketplace-official-shop; npm run test:marketplace-snkrdunk-parity
Not-tested: Production attack simulation"
```

---

## Task 10: End-To-End Local Verification And Report

**Purpose:** Prove the new marketplace architecture works locally before any production deployment decision.

**Files:**
- Update the plan checklist as tasks are completed.
- Add a short verification note under `docs/marketplace/` if the repo already has marketplace docs; otherwise include verification in the final implementation report.

**Steps:**
- [x] Run marketplace parity guard.
- [x] Run marketplace product market/grouping tests.
- [x] Run official shop/user seller purchase tests.
- [x] Run seller consignment tests.
- [x] Run ops hardening checks.
- [x] Run schema/RLS/hardening verification scripts.
- [x] Run typecheck.
- [x] Run `git diff --check`.
- [x] Start localhost.
- [x] Smoke marketplace main page, product page, listing detail page, cart, watchlist, seller page, and admin detail pages.
- [x] Check all new buttons:
  - `Buy now`
  - `Add to cart`
  - `Watch listing`
  - `Remove from cart`
  - `Remove from watchlist`
  - `See product market`
  - `View all offers`
  - `Ask seller support`
  - `Official shop` selector
  - `User seller` selector
  - grade/source/condition filters
  - image previous/next
  - lightbox open/close
- [x] Confirm YNOT spelling everywhere touched by marketplace UI.
- [x] Confirm no unrelated paused-buying copy appears on available listings.
- [x] Capture final localhost URL and route list for the user.

**Verify:**

```bash
cd Website
npm run test:marketplace-snkrdunk-parity
npm run test:marketplace-product-market
npm run test:marketplace-product-grouping
npm run test:marketplace-official-shop
npm run test:marketplace-user-seller-purchase
npm run test:marketplace-seller-consignment
npm run test:marketplace-ops-hardening
npm run verify:marketplace
npm run typecheck
git diff --check
```

Expected: all commands exit with code `0`.

**Commit:**

```bash
git add docs/superpowers/plans/2026-06-30-marketplace-snkrdunk-parity-performance-security.md docs/marketplace
git commit -m "Document marketplace parity verification evidence

Constraint: User needs localhost proof that new marketplace buttons, filters, and API flows work
Rejected: Reporting code completion without browser and command evidence | insufficient for marketplace UX changes
Confidence: high
Scope-risk: narrow
Directive: Keep final marketplace reports tied to routes, commands, and observed button behavior
Tested: npm run test:marketplace-snkrdunk-parity; npm run verify:marketplace; npm run typecheck; git diff --check; localhost smoke routes
Not-tested: Production deploy"
```

---

## Execution Order

1. Task 1 locks the plan with a failing guard.
2. Task 2 repairs projection/schema and RLS boundaries.
3. Task 3 improves product detail performance.
4. Task 4 adds cart/watchlist backend and pages.
5. Task 5 adds seller trust/admin details.
6. Task 6 adds safe metadata/JSON-LD.
7. Task 7 rebuilds listing detail UI.
8. Task 8 polishes browse filters/header/copy.
9. Task 9 centralizes mutation security.
10. Task 10 verifies everything locally and reports evidence.

---

## Risk Notes

- Production migrations remain gated by backup/PITR and restore-drill readiness.
- Product detail RPC must be built from public projections only, otherwise it can accidentally become a data-leak bypass.
- Centralizing mutation guards touches many write routes; run route-level tests immediately after each migrated route group.
- UI parity should copy interaction structure from SNKRDUNK, not copyrighted assets, text, or protected brand presentation.
- Existing user worktree changes must be preserved; inspect `git status --short` before each implementation task and stage only task-owned files.
