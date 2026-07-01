# Marketplace Customer Cart RPC And UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpower-subagent-driven-development` (recommended) or `superpower-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the YNOT marketplace customer cart and watchlist work like a real SNKRDUNK-style marketplace flow: RPC-backed, account-persistent, visible in the UI immediately after actions, and verifiable for performance and security.

**Architecture:** Deepen the existing cart/watchlist module behind one small interface that hides RPC transactions, listing hydration, idempotency, summaries, mock data, and public projection. Keep canonical routes under `/api/ynot/marketplace/*`, keep `/api/marketplace/*` as thin adapters, keep one shared YNOT Customer Account login, and keep ADR-0003 intact by adding all schema/RPC work only under `Database/marketplace-supabase`.

**Tech Stack:** Next.js App Router in `Website/`, React client state for customer cart feedback, TypeScript, Supabase/Postgres RPCs in `Database/marketplace-supabase`, existing marketplace mutation guards, existing marketplace verification scripts, and current YNOT UI primitives.

---

## Scope Check

This plan covers one coherent follow-up slice after the SNKRDUNK parity work:

- Customer cart and watchlist RPC contracts.
- Cart summary counts in the marketplace header and listing page.
- Add-to-cart/watch feedback that shows what changed without requiring a full page reload.
- Cart drawer/mini-cart plus cart page alignment.
- API contract tests and static guards that prevent returning to direct table mutations.
- Performance indexes, bounded payloads, and N+1 prevention.
- Security rules for same-origin, auth, idempotency, RLS, private-field leakage, and marketplace audit events.

This plan does not implement multi-listing checkout. The cart can contain several Marketplace Listings, but the existing purchase path can still checkout one exact listing at a time until a later plan adds multi-listing order creation.

This plan does not apply production Supabase migrations. Production apply remains gated by backup/PITR and restore-drill readiness.

## Scrutiny Corrections To Bake Into Implementation

These corrections are mandatory. They close the main architecture, security, and executability gaps found during plan review:

- Customer cart/list/watchlist read RPCs must receive both `p_buyer_marketplace_account_id` and `p_actor_profile_id`. Service-role APIs are trusted to call the RPCs, but the database still must verify that the requested marketplace account belongs to the signed-in YNOT profile.
- Mutating RPCs must lock `public.marketplace_listing_snapshots` directly. Do not `for update` the `marketplace_public_listing_snapshots` view because it is an active-only projection and cannot reliably represent unavailable, sold, hidden, or pending-payment rows.
- Cart/list summary RPCs must build public-safe listing JSON from `marketplace_listing_snapshots` plus `marketplace_public_seller_profiles`. They may not return raw buyer account IDs, seller account IDs, YNOT profile IDs, request hashes, idempotency rows, contact fields, payout fields, or admin notes.
- Add-to-cart duplicate behavior must be explicit: return `status = 'added'` only for a newly inserted cart row and `status = 'already_in_cart'` for an existing row. Do not fake a timestamp update with `updated_at = public.marketplace_cart_items.updated_at`.
- The marketplace cart provider should live in shared marketplace chrome, preferably `Website/src/app/(store)/marketplace/layout.tsx`. If the current Next.js version or route data shape blocks a route layout, create one shared `MarketplaceShell` wrapper and use it from every marketplace page. Do not leave one independent provider per page.
- The static privacy guard must test client/API payload surfaces, not ban RPC parameter names inside `cart-watchlist.ts`.
- Customer cart, watchlist, and summary routes must use a buyer-safe marketplace access seam, not a permanent owner-only marketplace gate. Prelaunch can still be owner-only through configuration, but the route code should call a dedicated `customerMarketplaceAccess` or `publicMarketplaceAccess` helper so the same implementation can launch publicly without rewriting buyer APIs.
- SQL verification must include an execution-capable check when local Supabase tooling is available: `supabase db lint`, local migration apply, or a local RPC smoke against the migration. String scans remain useful, but they are not enough to prove PL/pgSQL syntax, grants, locks, or result shapes.
- Keep the Marketplace Cart module deep. API routes and UI components must not reimplement summary normalization, listing hydration, duplicate status handling, idempotency behavior, or private-field filtering that belongs inside `cart-watchlist.ts` and its RPC adapter.
- Customer cart/watchlist APIs must validate request body, path params, and headers before calling service-role RPCs. `listingId` must be a UUID, quantity must be exactly `1` in this slice, mutation bodies must be JSON, and unknown body shapes must return a generic `400`.
- Customer listing payloads must not expose raw `snapshot_payload` or a pass-through `snapshotPayload` object. If UI needs card metadata, the RPC must build an explicit allowlisted display object from safe fields only.
- Same-origin/CSRF protection, rate-limit enforcement, and user-safe error mapping must be verifiable with negative tests, not only stated as intended behavior.
- Image URLs used in cart/watchlist UI must be scheme/domain allowlisted and come from the existing marketplace image storage/public CDN path. Seller-uploaded image validation remains part of seller listing flows, but this cart slice must not trust arbitrary URL strings when rendering customer cart images.

## Architecture Review Verdict

The plan is implementation-ready if the following constraints stay mandatory:

- **Frontend:** Use shared marketplace chrome for cart state, header badges, and drawer behavior. Listing pages, grouped card pages, and cart/watchlist pages should all talk to one provider instead of page-local state islands.
- **Backend:** Keep `/api/ynot/marketplace/*` canonical and `/api/marketplace/*` thin. The summary route must stay summary-only so headers do not pull full cart payloads.
- **Performance:** Prove bounded query behavior with RPC caps, local SQL verification, and API smoke. Do not assume a new index is useful until an execution plan or local DB check supports it.
- **Security:** Separate buyer route access from admin/owner access, keep same-origin mutation checks, validate profile ownership inside RPCs, and assert that `request_hash`, `idempotency_key`, raw marketplace account IDs, and private seller data never appear in JSON or UI payloads.

## Current-State Findings

The current customer cart has API coverage but the module is shallow and not deep enough for production commerce:

- `Website/src/app/api/ynot/marketplace/cart/route.ts` reads cart through `listMarketplaceCart`.
- `Website/src/app/api/ynot/marketplace/cart/items/route.ts` adds items through `addMarketplaceCartItem`.
- `Website/src/lib/marketplace/cart-watchlist.ts` uses in-memory mock maps in local mode and direct Supabase `.from("marketplace_cart_items")` / `.from("marketplace_watchlist_items")` calls in live mode.
- `Website/src/lib/marketplace/bag-summary.ts` already uses `marketplace_get_bag_summary`, so customer summary data has an RPC precedent.
- `Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql` creates cart/watchlist tables, indexes, RLS, and service-role grants.
- No current migration defines `marketplace_list_customer_cart`, `marketplace_add_customer_cart_item`, `marketplace_remove_customer_cart_item`, or matching watchlist RPCs.
- `Website/src/features/ynot/MarketplaceListingActionsClient.tsx` shows text such as `Added to cart.`, but it does not update a cart badge, open a mini-cart, or show the current customer cart contents.
- `Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx` manages page-local state only after the cart page has loaded.

The result is exactly the behavior the user observed: a local API round trip can add an item, but the user experience does not clearly show what is in the customer cart and the backend contract is not aligned with the rest of the marketplace RPC pattern.

## Domain Terms

Use existing `CONTEXT.md` terms:

- **YNOT Customer Account:** shared login identity for gacha and marketplace.
- **Marketplace Account:** marketplace record linked to one YNOT Customer Account.
- **Marketplace Listing:** public sellable offer from Marketplace Inventory.
- **Pending Payment Order:** short-lived checkout lock for one exact listing.
- **Marketplace Order:** real-money purchase record.

Add these terms to `CONTEXT.md` during implementation:

- **Marketplace Cart:** customer-facing saved purchase list for active Marketplace Listings. It is account-persistent and does not lock stock.
  _Avoid_: Customer Bag, order, checkout hold, browser cart
- **Marketplace Watchlist:** customer-facing saved comparison list for Marketplace Listings. It does not imply intent to buy.
  _Avoid_: favorite-only UI state, hidden cart, seller follow
- **Marketplace Cart Summary:** public-safe count/subtotal snapshot used by the marketplace header, listing actions, and mini-cart.
  _Avoid_: raw cart rows, private buyer state

## Architecture Deepening

### Current Module Problem

`cart-watchlist.ts` is currently a shallow module. Its interface asks callers to know too much indirectly:

- list/add/remove methods return items but no summary.
- mock storage, direct table access, listing availability checks, duplicate handling, and public listing hydration are all inside one implementation.
- API routes and UI still need to understand how to refresh cart state.
- tests can pass while the live path bypasses RPC idempotency and audit patterns.

### Target Module

Create one deep **Marketplace Cart module** with this interface:

```ts
export type MarketplaceCustomerListState = {
  items: MarketplaceCartItem[];
  summary: MarketplaceCartSummary;
};

export type MarketplaceCartSummary = {
  cartCount: number;
  watchlistCount: number;
  subtotalSatang: number;
  unavailableCount: number;
  currency: "THB";
  updatedAt: string | null;
};

export type MarketplaceCartAccount = Pick<SafeMarketplaceAccount, "accountId">;

export async function getMarketplaceCustomerCartState(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCustomerListState>;

export async function getMarketplaceCustomerCartSummary(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCartSummary>;

export async function addMarketplaceCartItem(
  input: MarketplaceCartMutationInput,
): Promise<MarketplaceCustomerListMutationResult>;

export async function removeMarketplaceCartItem(
  input: MarketplaceCartTargetMutationInput,
): Promise<MarketplaceCustomerListMutationResult>;

export async function getMarketplaceWatchlistState(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceWatchlistState>;
```

The seam lives at `Website/src/lib/marketplace/cart-watchlist.ts`. The implementation has two adapters:

- `MarketplaceCartRpcAdapter` for live Marketplace Supabase RPCs.
- `MarketplaceCartMockAdapter` for local mock data with the same response shape.

The deletion test: if this module disappeared, listing pages, cart page, watchlist page, header badge, tests, and API routes would each reimplement cart summary, item hydration, unavailable filtering, and error mapping. That means the module earns its keep when deepened.

## UI Design Target

The UI should feel close to a proper trading-card marketplace, not a dashboard page.

### Marketplace Header

Use a compact marketplace action cluster on marketplace pages:

- `YNOT Marketplace` as the label, not `YNOTT`.
- Search/filter controls stay left or center depending on viewport.
- Right action cluster:
  - Cart icon/button with badge count.
  - Watchlist icon/button with count when non-zero.
  - Seller shortcut.
  - Admin shortcut only for admin/owner.

The badge reads from `summary.cartCount`. If unauthenticated, show no count and link to login when clicked.

### Listing Detail Actions

After `Add to cart` succeeds:

- Button text changes to `In cart`.
- Inline status says `Added to cart.`
- A secondary link appears: `View cart`.
- The cart badge increments immediately.
- A mini-cart drawer opens on desktop and mobile unless the user has reduced-motion preference enabled.

After `Watch listing` succeeds:

- Button text changes to `Watching`.
- Inline status says `Saved to watchlist.`
- Watchlist count updates immediately.

### Mini-Cart Drawer

The drawer is not a modal checkout. It is a quick customer cart preview:

- Header: `Cart`
- Subheader: `{cartCount} item(s) saved for checkout`
- Item rows: image, title, condition/grade, seller source, price, remove button.
- Footer: `Item subtotal`, `View cart`, `Continue shopping`.
- If an item is unavailable, show `No longer available` and disable checkout for that row.

### Cart Page

Keep `/marketplace/cart`, but align copy and layout:

- Page title: `Cart`
- Subtitle: `{cartCount} listing(s) saved. Stock is locked only after checkout starts.`
- Card primary action: `Buy this listing`
- Secondary actions: `See product market`, `Remove`
- Empty state: `Your cart is empty` and `Browse marketplace`

The page should receive server state on first render and then hydrate into the same customer cart provider used by listing actions.

## Backend Design

### Backend Layering Contract

Use the existing Next.js API route style, but keep the backend layers explicit:

1. **UI component / server page:** renders buttons, links, badges, and server initial state. It may call public adapter routes such as `/api/marketplace/cart/summary` from the browser, or server-side module functions during route render.
2. **Public adapter route:** `/api/marketplace/*` stays thin and forwards to the canonical YNOT route. It must not hold business logic, validation drift, direct Supabase calls, or duplicate response shaping.
3. **Canonical API route:** `/api/ynot/marketplace/*` owns auth, buyer-safe marketplace access, input validation, rate limits, same-origin mutation guard, idempotency metadata, public error shape, and response envelope.
4. **Marketplace Cart module:** `Website/src/lib/marketplace/cart-watchlist.ts` owns the service/repository seam. It normalizes summary, cart/watchlist items, listing display metadata, image URLs, mock behavior, RPC errors, and mutation result shape.
5. **Marketplace Supabase RPCs:** `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql` owns transactional writes, account ownership checks, row locks, idempotency persistence, audit events, bounded list queries, and public-safe database projection.
6. **Database tables/views:** cart/watchlist tables store saved intent only. Listing availability is checked against base `marketplace_listing_snapshots`, while customer payloads join only public-safe seller projection from `marketplace_public_seller_profiles`.

The browser never calls Supabase directly. Live cart/watchlist TypeScript never calls `.from("marketplace_cart_items")` or `.from("marketplace_watchlist_items")`; all live persistence goes through RPC adapter functions.

### Button To API/RPC Wiring Matrix

This table is the implementation source of truth for every cart/watchlist button and page state touched by this plan.

| Surface / button | Frontend owner | Browser/server action | Canonical API route | Public adapter route | Module function | RPC | Database tables/views | UI state updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Marketplace header cart badge, first page load | `MarketplaceHeaderActions` inside marketplace chrome | Server loads initial summary, client may refresh on mount/stale state | `GET /api/ynot/marketplace/cart/summary` | `GET /api/marketplace/cart/summary` | `getMarketplaceCustomerCartSummary(account, profile.profileId)` | `marketplace_get_customer_cart_summary` | Reads `marketplace_accounts`, `marketplace_cart_items`, `marketplace_watchlist_items`, `marketplace_listing_snapshots` | `summary.cartCount`, `summary.subtotalSatang`, `summary.unavailableCount` |
| Header `Cart` icon/button | `MarketplaceHeaderActions` | Opens drawer; drawer fetches full cart only when opened/stale | `GET /api/ynot/marketplace/cart` | `GET /api/marketplace/cart` | `getMarketplaceCustomerCartState(account, profile.profileId)` | `marketplace_list_customer_cart` plus summary RPC | Reads `marketplace_accounts`, `marketplace_cart_items`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles` | Drawer item rows and summary |
| Header `Watchlist` button/link | `MarketplaceHeaderActions` | Navigates to `/marketplace/watchlist`; server loads watchlist | `GET /api/ynot/marketplace/watchlist` when fetched from client; server may call module directly | `GET /api/marketplace/watchlist` | `getMarketplaceWatchlistState(account, profile.profileId)` | `marketplace_list_customer_watchlist` plus summary RPC | Reads `marketplace_accounts`, `marketplace_watchlist_items`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles` | Watchlist page rows and badge count |
| Listing detail `Add to cart` button | `MarketplaceListingActionsClient` | `POST` JSON body `{ listingId, quantity: 1 }` with idempotency header | `POST /api/ynot/marketplace/cart/items` | `POST /api/marketplace/cart/items` | `addMarketplaceCartItem({ account, listingId, quantity, actorProfileId, requestId, idempotencyKey, requestHash })` | `marketplace_add_customer_cart_item` | Guard reads `marketplace_accounts`; locks `marketplace_listing_snapshots`; writes/reads `marketplace_idempotency_keys`; inserts/selects `marketplace_cart_items`; reads `marketplace_public_seller_profiles`; writes `marketplace_audit_events` | Button becomes `In cart`, inline status, badge count, drawer opens |
| Listing detail `Watch listing` button | `MarketplaceListingActionsClient` | `POST` to target listing with idempotency header | `POST /api/ynot/marketplace/watchlist/items/[listingId]` | `POST /api/marketplace/watchlist/items/[listingId]` | `watchMarketplaceWatchlistItem({ account, listingId, actorProfileId, requestId, idempotencyKey, requestHash })` | `marketplace_watch_listing` | Guard reads `marketplace_accounts`; locks/reads `marketplace_listing_snapshots`; writes/reads `marketplace_idempotency_keys`; inserts/selects `marketplace_watchlist_items`; reads `marketplace_public_seller_profiles`; writes `marketplace_audit_events` | Button becomes `Watching`, watchlist badge updates |
| Mini-cart row `Remove` button | `MarketplaceCartDrawer` or `MarketplaceCartWatchlistClient` in cart mode | `DELETE` target listing with idempotency header | `DELETE /api/ynot/marketplace/cart/items/[listingId]` | `DELETE /api/marketplace/cart/items/[listingId]` | `removeMarketplaceCartItem({ account, listingId, actorProfileId, requestId, idempotencyKey, requestHash })` | `marketplace_remove_customer_cart_item` | Guard reads `marketplace_accounts`; writes/reads `marketplace_idempotency_keys`; deletes/selects `marketplace_cart_items`; writes `marketplace_audit_events`; summary reads cart/listing/watchlist tables | Row removed, badge/subtotal refresh |
| Watchlist row `Remove` button | `MarketplaceCartWatchlistClient` in watchlist mode | `DELETE` target listing with idempotency header | `DELETE /api/ynot/marketplace/watchlist/items/[listingId]` | `DELETE /api/marketplace/watchlist/items/[listingId]` | `removeMarketplaceWatchlistItem({ account, listingId, actorProfileId, requestId, idempotencyKey, requestHash })` | `marketplace_unwatch_listing` | Guard reads `marketplace_accounts`; writes/reads `marketplace_idempotency_keys`; deletes/selects `marketplace_watchlist_items`; writes `marketplace_audit_events`; summary reads cart/listing/watchlist tables | Row removed, watchlist badge refresh |
| Drawer `View cart` link | `MarketplaceCartDrawer` | Navigates to `/marketplace/cart` | No mutation. Cart page may server-call module or client-fetch route | No mutation | `getMarketplaceCustomerCartState(account, profile.profileId)` | `marketplace_list_customer_cart` plus summary RPC | Reads cart/listing/public seller tables only | Full cart page renders current rows |
| Cart page `Buy this listing` button/link | `MarketplaceCartWatchlistClient` / cart page | Navigates to `/marketplace/listings/[listingId]#marketplace-checkout` | Existing checkout routes only after buyer starts checkout | Existing checkout adapters | Existing checkout module, not this cart module | Existing pending-payment/order RPCs, not this plan | Cart row is not a stock lock; checkout locks stock later | Checkout starts from exact listing detail |
| Cart page `See product market` link | `MarketplaceCartWatchlistClient` | Navigates to product detail/market page | Product browse/detail routes, not cart routes | Product adapters | Product browse module | Existing product/listing browse SQL/RPC surface | Reads product/listing/history projections | No cart mutation |
| Cart page first render | `Website/src/app/(store)/marketplace/cart/page.tsx` | Server loads cart rows | May call module directly server-side; client refresh uses canonical route | `GET /api/marketplace/cart` for client refresh | `getMarketplaceCustomerCartState(account, profile.profileId)` | `marketplace_list_customer_cart` plus summary RPC | Reads account/cart/listing/public seller/watchlist summary tables | Cart page rows and shared provider summary |
| Watchlist page first render | `Website/src/app/(store)/marketplace/watchlist/page.tsx` | Server loads watchlist rows | May call module directly server-side; client refresh uses canonical route | `GET /api/marketplace/watchlist` for client refresh | `getMarketplaceWatchlistState(account, profile.profileId)` | `marketplace_list_customer_watchlist` plus summary RPC | Reads account/watchlist/listing/public seller/cart summary tables | Watchlist rows and shared provider summary |

### HTTP API Contract

| Method and canonical route | Public adapter | Request input | Backend validation | Module/RPC | Response |
| --- | --- | --- | --- | --- | --- |
| `GET /api/ynot/marketplace/cart/summary` | `GET /api/marketplace/cart/summary` | Auth cookies only | Require login, customer marketplace access, read rate limit | `getMarketplaceCustomerCartSummary` -> `marketplace_get_customer_cart_summary` | `{ ok, request_id, summary }`; no item arrays |
| `GET /api/ynot/marketplace/cart` | `GET /api/marketplace/cart` | Optional internal limit only; browser should not control beyond server cap | Require login, customer marketplace access, read rate limit, cap <= 50 | `getMarketplaceCustomerCartState` -> `marketplace_list_customer_cart` | `{ ok, request_id, cart, summary }` |
| `POST /api/ynot/marketplace/cart/items` | `POST /api/marketplace/cart/items` | JSON `{ listingId, quantity?: 1 }`, idempotency header | Same-origin guard, customer mutation access, JSON content type, UUID listing ID, quantity exactly 1, mutation rate limit | `addMarketplaceCartItem` -> `marketplace_add_customer_cart_item` | `{ ok, request_id, cart: { status, item }, summary }` |
| `DELETE /api/ynot/marketplace/cart/items/[listingId]` | `DELETE /api/marketplace/cart/items/[listingId]` | Path UUID, idempotency header | Same-origin guard, customer mutation access, UUID path param, mutation rate limit | `removeMarketplaceCartItem` -> `marketplace_remove_customer_cart_item` | `{ ok, request_id, cart: { status, item }, summary }` |
| `GET /api/ynot/marketplace/watchlist` | `GET /api/marketplace/watchlist` | Optional internal limit only; browser should not control beyond server cap | Require login, customer marketplace access, read rate limit, cap <= 100 | `getMarketplaceWatchlistState` -> `marketplace_list_customer_watchlist` | `{ ok, request_id, watchlist, summary }` |
| `POST /api/ynot/marketplace/watchlist/items/[listingId]` | `POST /api/marketplace/watchlist/items/[listingId]` | Path UUID, idempotency header | Same-origin guard, customer mutation access, UUID path param, mutation rate limit | `watchMarketplaceWatchlistItem` -> `marketplace_watch_listing` | `{ ok, request_id, watchlist: { status, item }, summary }` |
| `DELETE /api/ynot/marketplace/watchlist/items/[listingId]` | `DELETE /api/marketplace/watchlist/items/[listingId]` | Path UUID, idempotency header | Same-origin guard, customer mutation access, UUID path param, mutation rate limit | `removeMarketplaceWatchlistItem` -> `marketplace_unwatch_listing` | `{ ok, request_id, watchlist: { status, item }, summary }` |

All error responses use the same public shape: `{ ok: false, request_id, errorCode }`. Do not return raw Supabase errors, SQL exception strings, stack traces, idempotency keys, request hashes, account IDs, or raw validation input.

### RPC To Table Contract

| RPC | Transaction role | Reads | Writes | Locking / idempotency | Public response |
| --- | --- | --- | --- | --- | --- |
| `marketplace_get_customer_cart_summary` | Read-only bounded summary | `marketplace_accounts`, `marketplace_cart_items`, `marketplace_watchlist_items`, `marketplace_listing_snapshots` | None | Verifies `p_buyer_marketplace_account_id` belongs to `p_actor_profile_id`; no row lock | Counts, subtotal, unavailable count, currency, updatedAt only |
| `marketplace_list_customer_cart` | Read-only bounded list | `marketplace_accounts`, `marketplace_cart_items`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles` | None | Verifies account; clamps limit to 50; delegates summary to summary RPC | `items[]` with public listing projection and `summary` |
| `marketplace_add_customer_cart_item` | Transactional mutation | `marketplace_accounts`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles`, `marketplace_idempotency_keys` | `marketplace_cart_items`, `marketplace_idempotency_keys`, `marketplace_audit_events` | Locks base listing row `for update`; enforces idempotency scope `cart.item.add`; rejects inactive/unavailable listings | `status`, public item, updated `summary` |
| `marketplace_remove_customer_cart_item` | Transactional mutation | `marketplace_accounts`, `marketplace_idempotency_keys` | `marketplace_cart_items`, `marketplace_idempotency_keys`, `marketplace_audit_events` | Enforces idempotency scope `cart.item.remove`; delete is scoped by buyer account and listing | `status`, optional public item, updated `summary` |
| `marketplace_list_customer_watchlist` | Read-only bounded list | `marketplace_accounts`, `marketplace_watchlist_items`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles` | None | Verifies account; clamps limit to 100; delegates summary to summary RPC | `items[]` with public listing projection and `summary` |
| `marketplace_watch_listing` | Transactional mutation | `marketplace_accounts`, `marketplace_listing_snapshots`, `marketplace_public_seller_profiles`, `marketplace_idempotency_keys` | `marketplace_watchlist_items`, `marketplace_idempotency_keys`, `marketplace_audit_events` | Locks/validates listing through base snapshot table; enforces idempotency scope `watchlist.item.watch` | `status`, public item, updated `summary` |
| `marketplace_unwatch_listing` | Transactional mutation | `marketplace_accounts`, `marketplace_idempotency_keys` | `marketplace_watchlist_items`, `marketplace_idempotency_keys`, `marketplace_audit_events` | Enforces idempotency scope `watchlist.item.unwatch`; delete is scoped by buyer account and listing | `status`, optional public item, updated `summary` |

Every row in both tables must remain true after implementation. If a button needs a new API call, add it to this matrix before coding.

### RPC Contracts

Add `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql`.

The migration must define these RPCs:

```sql
create or replace function public.marketplace_list_customer_cart(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 50
)
returns jsonb;

create or replace function public.marketplace_get_customer_cart_summary(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid
)
returns jsonb;

create or replace function public.marketplace_add_customer_cart_item(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb;

create or replace function public.marketplace_remove_customer_cart_item(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb;

create or replace function public.marketplace_list_customer_watchlist(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 100
)
returns jsonb;

create or replace function public.marketplace_watch_listing(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb;

create or replace function public.marketplace_unwatch_listing(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb;
```

All mutating RPCs must be `language plpgsql security definer set search_path = public, pg_temp`.

All list RPCs must return only public-safe listing fields:

```json
{
  "items": [
    {
      "id": "uuid",
      "listingId": "uuid",
      "quantity": 1,
      "createdAt": "iso",
      "updatedAt": "iso",
      "listing": {
        "listingId": "uuid",
        "productId": "uuid-or-null",
        "variantId": "uuid-or-null",
        "sellerPublicProfileId": "uuid-or-null",
        "listingSource": "official_shop",
        "listingState": "active",
        "title": "string",
        "itemPriceSatang": 100000,
        "currency": "THB",
        "quantityAvailableSnapshot": 1,
        "photoUrls": [],
        "publicAttributes": {
          "cardCode": "EB02-001",
          "conditionLabel": "Raw",
          "gradeLabel": null
        }
      }
    }
  ],
  "summary": {
    "cartCount": 1,
    "watchlistCount": 0,
    "subtotalSatang": 100000,
    "unavailableCount": 0,
    "currency": "THB",
    "updatedAt": "iso"
  }
}
```

### SQL Implementation Rules

- Clamp cart list limit to `least(greatest(coalesce(p_limit, 50), 1), 50)`.
- Clamp watchlist limit to `least(greatest(coalesce(p_limit, 100), 1), 100)`.
- Cart quantity is fixed to `1` for current marketplace listings.
- All RPCs must verify that `p_buyer_marketplace_account_id` belongs to `p_actor_profile_id` in `marketplace_accounts` before returning or mutating customer state.
- Add-to-cart must lock the base `public.marketplace_listing_snapshots` row with `for update` before insert.
- Do not lock or mutate through `marketplace_public_listing_snapshots`; that view is active-only and is only safe for read projections.
- Add-to-cart must reject listings where `listing_state <> 'active'` or `quantity_available_snapshot < 1`.
- Add-to-cart must return `status = 'added'` only for a new row and `status = 'already_in_cart'` for an existing row.
- Cart does not reserve stock. It only saves intent.
- Checkout still creates the stock lock through the existing Pending Payment Order path.
- Summary subtotal includes only active cart listings.
- Unavailable count includes cart rows whose listing is missing, inactive, pending payment, sold, hidden, or quantity unavailable.
- List and mutation response JSON must build a public-safe listing projection explicitly. Do not include `marketplace_listing_snapshots.snapshot_payload` directly; if display metadata is needed, copy only allowlisted keys into `publicAttributes`.
- Mutating RPCs must write to `marketplace_idempotency_keys` using scopes:
  - `cart.item.add`
  - `cart.item.remove`
  - `watchlist.item.watch`
  - `watchlist.item.unwatch`
- Mutating RPCs must write `marketplace_audit_events` with event types:
  - `marketplace_cart_item_added`
  - `marketplace_cart_item_removed`
  - `marketplace_listing_watched`
  - `marketplace_listing_unwatched`
- Revoke execute from `public`, `anon`, and `authenticated`.
- Grant execute only to `service_role`.

### TypeScript Backend Module Shape

`Website/src/lib/marketplace/cart-watchlist.ts` should become an RPC adapter rather than direct table code. The public interface should accept account objects and mutation metadata, not raw account/listing pairs from every caller:

```ts
export type MarketplaceCartMutationInput = {
  account: MarketplaceCartAccount;
  listingId: string;
  quantity?: number;
  actorProfileId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type MarketplaceCartTargetMutationInput = {
  account: MarketplaceCartAccount;
  listingId: string;
  actorProfileId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
};
```

The live adapter should call RPCs only:

```ts
const result = await supabase.rpc("marketplace_add_customer_cart_item", {
  p_buyer_marketplace_account_id: input.account.accountId,
  p_listing_id: safeListingId,
  p_quantity: quantity,
  p_idempotency_key: input.idempotencyKey,
  p_request_hash: input.requestHash,
  p_request_id: input.requestId,
  p_actor_profile_id: input.actorProfileId,
});
```

No live path in `cart-watchlist.ts` may call:

```ts
.from("marketplace_cart_items")
.from("marketplace_watchlist_items")
```

The mock adapter can keep in-memory maps but must return the same `{ items, summary }` and mutation result shape as the RPCs.

## Performance Plan

Backend:

- Keep current indexes on `(buyer_marketplace_account_id, updated_at desc)`.
- Add partial indexes to help active subtotal/listing joins:

```sql
create index if not exists marketplace_cart_items_buyer_listing_idx
  on public.marketplace_cart_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_watchlist_items_buyer_listing_idx
  on public.marketplace_watchlist_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_listing_snapshots_cart_availability_idx
  on public.marketplace_listing_snapshots(listing_id, listing_state, quantity_available_snapshot);
```

- Verify the listing availability index with `EXPLAIN` or local RPC smoke before treating it as required. `listing_id` is already unique in normal lookup paths, so this index may not help unless the planner benefits from the additional state/quantity columns. Keep it only when the verification output supports it.
- Cart/list RPCs must join against `marketplace_listing_snapshots` plus `marketplace_public_seller_profiles` and build an explicit public-safe JSON shape to avoid N+1 listing hydration.
- API responses must cap cart to 50 items and watchlist to 100 items.
- Header summary must use `/api/marketplace/cart/summary`, backed by `marketplace_get_customer_cart_summary`. Keep `marketplace_get_bag_summary` separate in this slice so gacha/customer bag state and marketplace cart state do not drift together accidentally.
- Header summary responses must not aggregate or return item JSON. They return counts and subtotal fields only.

Frontend:

- First render uses server-loaded summary when available.
- Client actions optimistically update count only after the POST/DELETE returns `ok: true`.
- Mini-cart drawer fetches full cart only when opened or after add-to-cart success.
- Header badge should not trigger full page navigation or full reload when updating.
- The provider must dedupe in-flight summary refreshes and must not fetch summary on every render. Refresh only on first marketplace chrome mount, after successful cart/watchlist mutation, on drawer open when stale, or explicit customer action.

Testing:

- Run local SQL execution verification when tooling is available: `supabase db lint`, local migration apply, or local RPC smoke from `Database/marketplace-supabase`.
- Add static guard that fails if `cart-watchlist.ts` contains direct live `.from("marketplace_cart_items")` or `.from("marketplace_watchlist_items")`.
- Add local API probe that performs add -> summary -> list -> remove -> summary.

## Security Plan

- API routes keep `prepareMarketplaceMutation` or a customer-mode variant for POST/DELETE.
- Customer cart/watchlist GET routes keep login, buyer-safe marketplace access gating, and rate limits. Do not hard-code owner-only access into customer routes except through the existing launch flag/config path.
- Admin and seller-management routes keep owner/admin gates. Customer cart and watchlist routes must not reuse admin-only gates as their permanent access model.
- Mutating APIs pass idempotency key and request hash into RPCs.
- Same-origin mutation enforcement remains in the API route, not only the database.
- Treat the same-origin mutation guard as the CSRF control for this slice unless the repo already has a stronger CSRF token helper. The implementation must document that choice in code comments or verifier labels and must include a bad-origin negative test.
- RPCs validate `p_buyer_marketplace_account_id` belongs to an existing active `marketplace_accounts` row whose `ynot_profile_id = p_actor_profile_id`.
- RPCs never accept seller account IDs from the browser.
- RPCs return only public listing projection fields.
- RPCs must not return raw `snapshot_payload` or a direct `snapshotPayload` pass-through object. Build only explicit allowlisted display metadata such as card code, condition label, and grade label.
- Header/cart UI and JSON responses must not expose `buyer_marketplace_account_id`, `seller_marketplace_account_id`, profile IDs, payout fields, addresses, phone, email, private admin notes, idempotency rows, idempotency keys, or request hashes.
- Mutation responses may include public mutation status and updated summary only; they must never echo `request_hash`, `idempotency_key`, or internal idempotency row data.
- POST/DELETE routes must validate JSON content type, UUID route/body params, allowed quantity, and idempotency header shape before calling service-role RPCs.
- Mutation routes must reject cross-site origins through the existing same-origin mutation guard and keep auth cookies `HttpOnly`, `Secure` in production, and `SameSite=Lax` or stricter.
- API responses expose stable public error codes/messages only. Internal RPC errors, stack traces, SQL details, idempotency conflicts, and account-state details stay in server logs with `request_id`.
- Logs must not include idempotency keys, request hashes, raw account IDs, contact fields, payout fields, or raw seller listing payloads.
- Customer cart/watchlist image URLs must be sanitized or allowlisted before rendering. Reject `javascript:`, `data:`, protocol-relative URLs, and non-marketplace storage/CDN hosts.
- Seller listing image upload routes remain responsible for upload security: maximum 10 images, per-file size cap, MIME and extension allowlist, storage path ownership by submission/account, no user-controlled public URL injection, and server-generated filenames.
- Rate limits:
  - `cart:list`: 30/minute per profile.
  - `cart:summary`: 60/minute per profile.
  - `cart:add`: 20/minute per profile.
  - `cart:remove`: 30/minute per profile.
  - `watchlist:list`: 30/minute per profile.
  - `watchlist:mutate`: 30/minute per profile.

## File Map

Create:

- `docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md` - this plan.
- `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql` - cart/watchlist RPC contracts, grants, indexes.
- `Website/scripts/test-marketplace-customer-cart-rpc.mjs` - static architecture guard for RPC names, no direct table live path, UI provider, package script.
- `Website/src/features/ynot/MarketplaceCartProvider.tsx` - client cart/watchlist summary state and drawer state.
- `Website/src/features/ynot/MarketplaceCartDrawer.tsx` - mini-cart drawer UI.
- `Website/src/features/ynot/MarketplaceHeaderActions.tsx` - marketplace header actions with cart/watchlist badges.
- `Website/src/app/(store)/marketplace/layout.tsx` - preferred shared marketplace chrome for provider, drawer, and header actions if the current Next.js docs confirm this route layout shape is valid.

Modify:

- `CONTEXT.md` - add Marketplace Cart, Marketplace Watchlist, Marketplace Cart Summary terms.
- `Website/package.json` - add `test:marketplace-customer-cart` and `verify:marketplace-customer-cart-sql`.
- `Website/src/lib/marketplace/cart-watchlist.ts` - replace live direct table operations with RPC adapter and summary shape.
- `Website/src/lib/marketplace/bag-summary.ts` - document that gacha/customer bag summary remains separate from marketplace cart summary in this slice.
- `Website/src/lib/marketplace/route-guards.ts` - add or reuse a buyer-safe `customerMarketplaceAccess` / `publicMarketplaceAccess` helper for customer cart, watchlist, and summary routes.
- `Website/src/lib/marketplace/mutation-guard.ts` - support customer-mode marketplace mutations without turning buyer cart/watchlist APIs into owner-only/admin APIs.
- `Website/src/app/api/ynot/marketplace/cart/route.ts` - return `{ cart, summary }`.
- `Website/src/app/api/ynot/marketplace/cart/summary/route.ts` - return public-safe cart/watchlist counts without full cart items.
- `Website/src/app/api/ynot/marketplace/cart/items/route.ts` - pass idempotency/request hash into RPC adapter and return mutation plus summary.
- `Website/src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts` - pass idempotency/request hash into RPC adapter and return mutation plus summary.
- `Website/src/app/api/ynot/marketplace/watchlist/route.ts` - return `{ watchlist, summary }`.
- `Website/src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts` - pass idempotency/request hash into RPC adapter and return mutation plus summary.
- `Website/src/app/api/ynot/marketplace/bag/summary/route.ts` - leave unchanged unless docs need to clarify that marketplace cart summary uses `/api/marketplace/cart/summary`.
- `Website/tools/verification/verify-marketplace-customer-cart-sql.mjs` - SQL verification wrapper with local Supabase execution when available and static fallback with explicit skip reason.
- `Website/src/app/api/marketplace/cart/route.ts` - thin adapter to canonical cart list route.
- `Website/src/app/api/marketplace/cart/summary/route.ts` - thin adapter to the canonical YNOT marketplace summary route.
- `Website/src/app/api/marketplace/cart/items/route.ts` - thin adapter to canonical cart add route.
- `Website/src/app/api/marketplace/cart/items/[listingId]/route.ts` - thin adapter to canonical cart remove route.
- `Website/src/app/api/marketplace/watchlist/route.ts` - thin adapter to canonical watchlist list route.
- `Website/src/app/api/marketplace/watchlist/items/[listingId]/route.ts` - thin adapter to canonical watch/unwatch route.
- `Website/src/app/(store)/marketplace/page.tsx` - consume shared marketplace cart chrome rather than creating page-local cart state.
- `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx` - consume shared marketplace cart chrome rather than creating page-local cart state.
- `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx` - pass action callbacks/data into the shared provider and avoid a second provider.
- `Website/src/app/(store)/marketplace/cart/page.tsx` - use `getMarketplaceCustomerCartState`.
- `Website/src/app/(store)/marketplace/watchlist/page.tsx` - use `getMarketplaceWatchlistState`.
- `Website/src/features/ynot/MarketplaceListingActionsClient.tsx` - update badge/drawer state after add/watch.
- `Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx` - accept summary and sync provider after remove.
- `Website/src/app/globals.css` - cart badge/drawer/header action styles.
- `Website/tools/verification/verify-marketplace-schema.mjs` - assert new migration/RPC names/grants/indexes.
- `Website/tools/verification/verify-marketplace-hardening.mjs` - assert customer route access, no direct cart/watchlist table live path, and no private fields in cart UI/API payloads.
- `Website/tools/verification/verify-marketplace-doc-traceability.mjs` - assert plan and docs mention the new cart RPC contract.

---

## Task 1: Add Domain Terms And Architecture Guard

**Files:**
- Modify: `CONTEXT.md`
- Create: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`
- Modify: `Website/package.json`
- Test: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`

- [ ] **Step 1: Add domain terms to `CONTEXT.md`**

Add this block after the current **Marketplace MVP Language** terms:

```markdown
**Marketplace Cart**:
The customer-facing saved purchase list for active Marketplace Listings. It is linked to a Marketplace Account, persists across sessions, and does not lock stock until checkout creates a Pending Payment Order.
_Avoid_: Customer Bag, order, checkout hold, browser cart

**Marketplace Watchlist**:
The customer-facing saved comparison list for Marketplace Listings. It lets the customer revisit price, condition, and seller source without implying purchase intent.
_Avoid_: hidden cart, seller follow, browser-only favorite

**Marketplace Cart Summary**:
The public-safe count and subtotal snapshot for Marketplace Cart and Marketplace Watchlist state. It is used by header badges, listing actions, cart drawer, and cart/watchlist pages without exposing private account IDs.
_Avoid_: raw cart rows, private buyer state, full order summary
```

- [ ] **Step 2: Create the failing architecture guard**

Create `Website/scripts/test-marketplace-customer-cart-rpc.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requireSource(source, pattern, label) {
  assert.match(source, pattern, label);
}

test("package exposes the customer cart RPC guard", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-customer-cart"],
    "node --test scripts/test-marketplace-customer-cart-rpc.mjs",
  );
});

test("domain language names the customer cart concepts", () => {
  const context = readRepo("CONTEXT.md");
  requireSource(context, /\*\*Marketplace Cart\*\*/);
  requireSource(context, /\*\*Marketplace Watchlist\*\*/);
  requireSource(context, /\*\*Marketplace Cart Summary\*\*/);
  assert.doesNotMatch(context, /Marketplace Cart[\s\S]{0,500}Customer Bag sell action/);
});

test("customer cart migration defines RPC contracts and grants", () => {
  assert.ok(existsSync(migrationPath), "missing customer cart RPC migration");
  const sql = compactSql(readFileSync(migrationPath, "utf8"));
  for (const rpc of [
    "marketplace_list_customer_cart",
    "marketplace_get_customer_cart_summary",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_list_customer_watchlist",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
  ]) {
    requireSource(
      sql,
      new RegExp(`create or replace function public\\.${rpc}\\b`),
      `missing ${rpc}`,
    );
    requireSource(sql, new RegExp(`revoke all on function public\\.${rpc}`), `${rpc} must revoke public execution`);
    requireSource(sql, new RegExp(`grant execute on function public\\.${rpc}`), `${rpc} must grant service execution`);
  }
  requireSource(sql, /security definer/);
  requireSource(sql, /set search_path = public, pg_temp/);
  requireSource(sql, /marketplace_require_customer_account/);
  requireSource(sql, /marketplace_idempotency_keys/);
  requireSource(sql, /marketplace_audit_events/);
  requireSource(sql, /marketplace_cart_items_buyer_listing_idx/);
  requireSource(sql, /marketplace_watchlist_items_buyer_listing_idx/);
  requireSource(sql, /from public\.marketplace_listing_snapshots[\s\S]{0,160}for update/);
  assert.doesNotMatch(
    sql,
    /from public\.marketplace_public_listing_snapshots[\s\S]{0,160}for update/,
    "mutating RPCs must lock the base listing table, not the public active-only view",
  );
});

test("cart-watchlist live adapter uses RPCs and not direct table writes", () => {
  const source = readApp("src/lib/marketplace/cart-watchlist.ts");
  for (const rpc of [
    "marketplace_list_customer_cart",
    "marketplace_get_customer_cart_summary",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_list_customer_watchlist",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
  ]) {
    requireSource(source, new RegExp(`\\.rpc\\("${rpc}"`), `missing ${rpc} client call`);
  }
  assert.doesNotMatch(
    source,
    /\.from\("marketplace_cart_items"\)|\.from\("marketplace_watchlist_items"\)/,
    "cart-watchlist live path must not access cart/watchlist tables directly",
  );
});

test("customer cart UI modules exist and update visible state", () => {
  for (const relPath of [
    "src/features/ynot/MarketplaceCartProvider.tsx",
    "src/features/ynot/MarketplaceCartDrawer.tsx",
    "src/features/ynot/MarketplaceHeaderActions.tsx",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
  const provider = readApp("src/features/ynot/MarketplaceCartProvider.tsx");
  requireSource(provider, /useMarketplaceCart/);
  requireSource(provider, /refreshCartSummary/);
  requireSource(provider, /\/api\/marketplace\/cart\/summary/);
  requireSource(provider, /openCartDrawer/);
  requireSource(provider, /cartCount/);

  const listingActions = readApp("src/features/ynot/MarketplaceListingActionsClient.tsx");
  requireSource(listingActions, /useMarketplaceCart/);
  requireSource(listingActions, /openCartDrawer/);
  requireSource(listingActions, /View cart/);

  const hasRouteLayout = existsSync(path.join(appRoot, "src/app/(store)/marketplace/layout.tsx"));
  const hasSharedShell = existsSync(path.join(appRoot, "src/features/ynot/MarketplaceShell.tsx"));
  assert.ok(hasRouteLayout || hasSharedShell, "marketplace cart provider must live in shared marketplace chrome");
});

test("cart payloads avoid private marketplace identifiers", () => {
  const clientPayloadSources = [
    "src/features/ynot/MarketplaceCartProvider.tsx",
    "src/features/ynot/MarketplaceCartDrawer.tsx",
    "src/features/ynot/MarketplaceHeaderActions.tsx",
    "src/features/ynot/MarketplaceListingActionsClient.tsx",
    "src/features/ynot/MarketplaceCartWatchlistClient.tsx",
  ];
  for (const forbidden of [
    "seller_marketplace_account_id",
    "sellerMarketplaceAccountId",
    "buyer_marketplace_account_id",
    "buyerMarketplaceAccountId",
    "ynot_profile_id",
    "ynotProfileId",
    "request_hash",
    "requestHash",
    "idempotency_key",
    "idempotencyKey",
    "emailAddress",
    "phoneNumber",
    "shippingAddress",
    "payout",
    "private_admin_note",
    "privateAdminNote",
    "snapshotPayload",
    "snapshot_payload",
  ]) {
    for (const relPath of clientPayloadSources) {
      const source = readApp(relPath);
      assert.doesNotMatch(source, new RegExp(forbidden, "i"), `${relPath} leaked ${forbidden}`);
    }
  }

  for (const relPath of [
    "src/app/api/ynot/marketplace/cart/items/route.ts",
    "src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts",
    "src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts",
  ]) {
    const source = readApp(relPath);
    assert.doesNotMatch(source, /request_hash\s*:/, `${relPath} must not return request_hash`);
    assert.doesNotMatch(source, /idempotency_key\s*:/, `${relPath} must not return idempotency_key`);
  }
});

test("plan documents button to API/RPC/database wiring", () => {
  const plan = readRepo("docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md");
  for (const phrase of [
    "Button To API/RPC Wiring Matrix",
    "HTTP API Contract",
    "RPC To Table Contract",
    "Listing detail `Add to cart` button",
    "Listing detail `Watch listing` button",
    "Mini-cart row `Remove` button",
    "Watchlist row `Remove` button",
    "Header `Cart` icon/button",
    "GET /api/ynot/marketplace/cart",
    "GET /api/ynot/marketplace/cart/summary",
    "GET /api/ynot/marketplace/watchlist",
    "POST /api/ynot/marketplace/cart/items",
    "DELETE /api/ynot/marketplace/cart/items/[listingId]",
    "POST /api/ynot/marketplace/watchlist/items/[listingId]",
    "DELETE /api/ynot/marketplace/watchlist/items/[listingId]",
    "marketplace_add_customer_cart_item",
    "marketplace_remove_customer_cart_item",
    "marketplace_watch_listing",
    "marketplace_unwatch_listing",
    "marketplace_cart_items",
    "marketplace_watchlist_items",
  ]) {
    requireSource(plan, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `plan wiring missing ${phrase}`);
  }
});
```

- [ ] **Step 3: Add the package script**

Modify `Website/package.json` inside `scripts`:

```json
"test:marketplace-customer-cart": "node --test scripts/test-marketplace-customer-cart-rpc.mjs"
```

Place it near `test:marketplace-snkrdunk-parity`.

- [ ] **Step 4: Run the guard and confirm the intended failure**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
```

Expected: FAIL with `missing customer cart RPC migration`.

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md Website/scripts/test-marketplace-customer-cart-rpc.mjs Website/package.json
git commit -m "Guard customer cart RPC architecture before implementation

Constraint: Customer cart must become account-persistent and RPC-backed before stronger UI claims are made
Rejected: UI-only cart badge | hides the live direct-table backend gap
Confidence: high
Scope-risk: narrow
Directive: Keep cart/watchlist live paths behind RPCs and public-safe payloads
Tested: cd Website && npm run test:marketplace-customer-cart fails on missing migration as expected
Not-tested: Runtime cart mutation flow is implemented in later tasks"
```

## Task 2: Add Customer Cart And Watchlist RPC Migration

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql`
- Modify: `Website/tools/verification/verify-marketplace-schema.mjs`
- Modify: `Website/tools/verification/verify-marketplace-rls.mjs`
- Test: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`

- [ ] **Step 1: Create the migration with indexes and summary/list RPCs**

Create `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql` with this structure:

```sql
-- Customer cart/watchlist RPC contract.
-- Cart and watchlist stay account-persistent, public-safe, and service-role only.

create index if not exists marketplace_cart_items_buyer_listing_idx
  on public.marketplace_cart_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_watchlist_items_buyer_listing_idx
  on public.marketplace_watchlist_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_listing_snapshots_cart_availability_idx
  on public.marketplace_listing_snapshots(listing_id, listing_state, quantity_available_snapshot);

create or replace function public.marketplace_require_customer_account(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_buyer_marketplace_account_id is null or p_actor_profile_id is null then
    raise exception 'marketplace_account_required';
  end if;

  if not exists (
    select 1
    from public.marketplace_accounts account
    where account.id = p_buyer_marketplace_account_id
      and account.ynot_profile_id = p_actor_profile_id
      and account.profile_status_snapshot = 'active'
      and account.buyer_status = 'active'
  ) then
    raise exception 'marketplace_account_required';
  end if;

  return p_buyer_marketplace_account_id;
end;
$$;

create or replace function public.marketplace_get_customer_cart_summary(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with account_guard as (
    select public.marketplace_require_customer_account(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    ) as account_id
  ),
  cart_rows as (
    select
      cart.listing_id,
      coalesce(cart.quantity, 1) as quantity,
      listing.listing_state,
      listing.item_price_satang,
      listing.currency,
      listing.quantity_available_snapshot,
      cart.updated_at
    from public.marketplace_cart_items cart
    left join public.marketplace_listing_snapshots listing
      on listing.listing_id = cart.listing_id
    where cart.buyer_marketplace_account_id = (select account_id from account_guard)
  ),
  watch_rows as (
    select 1
    from public.marketplace_watchlist_items watch
    where watch.buyer_marketplace_account_id = (select account_id from account_guard)
  )
  select jsonb_build_object(
    'cartCount', coalesce(count(*) filter (where listing_state = 'active' and quantity_available_snapshot > 0), 0),
    'watchlistCount', (select count(*) from watch_rows),
    'subtotalSatang', coalesce(sum(item_price_satang * quantity) filter (where listing_state = 'active' and quantity_available_snapshot > 0), 0),
    'unavailableCount', coalesce(count(*) filter (where listing_state is null or listing_state <> 'active' or quantity_available_snapshot < 1), 0),
    'currency', 'THB',
    'updatedAt', max(updated_at)
  )
  from cart_rows;
$$;

create or replace function public.marketplace_list_customer_cart(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with account_guard as (
    select public.marketplace_require_customer_account(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    ) as account_id
  ),
  limited_rows as (
    select
      cart.id,
      cart.listing_id,
      cart.quantity,
      cart.created_at,
      cart.updated_at,
      listing.product_id,
      listing.variant_id,
      seller_profile.seller_public_profile_id,
      listing.listing_source,
      listing.listing_state,
      listing.title,
      listing.item_price_satang,
      listing.currency,
      listing.quantity_available_snapshot,
      listing.photo_urls
    from public.marketplace_cart_items cart
    left join public.marketplace_listing_snapshots listing
      on listing.listing_id = cart.listing_id
    left join public.marketplace_public_seller_profiles seller_profile
      on seller_profile.marketplace_account_id = listing.seller_marketplace_account_id
      and seller_profile.status = 'active'
    where cart.buyer_marketplace_account_id = (select account_id from account_guard)
    order by cart.updated_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'listingId', listing_id,
        'quantity', quantity,
        'createdAt', created_at,
        'updatedAt', updated_at,
        'listing', jsonb_build_object(
          'listingId', listing_id,
          'productId', product_id,
          'variantId', variant_id,
          'sellerPublicProfileId', seller_public_profile_id,
          'listingSource', listing_source,
          'listingState', listing_state,
          'title', title,
          'itemPriceSatang', item_price_satang,
          'currency', coalesce(currency, 'THB'),
          'quantityAvailableSnapshot', coalesce(quantity_available_snapshot, 0),
          'photoUrls', coalesce(photo_urls, '[]'::jsonb),
          'publicAttributes', jsonb_build_object(
            'cardCode', null,
            'conditionLabel', null,
            'gradeLabel', null
          )
        )
      )
      order by updated_at desc
    ), '[]'::jsonb),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  )
  from limited_rows;
$$;
```

- [ ] **Step 2: Add mutating cart RPCs**

Append `marketplace_add_customer_cart_item` and `marketplace_remove_customer_cart_item` to the same migration. Use the same idempotency pattern as existing marketplace RPCs:

```sql
create or replace function public.marketplace_add_customer_cart_item(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  cart_row public.marketplace_cart_items%rowtype;
  seller_public_profile_id uuid;
  was_inserted boolean := false;
  mutation_status text := 'already_in_cart';
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  safe_quantity integer := 1;
  rpc_response_payload jsonb;
begin
  perform public.marketplace_require_customer_account(
    p_buyer_marketplace_account_id,
    p_actor_profile_id
  );
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;
  if p_quantity is not null and p_quantity <> 1 then
    raise exception 'marketplace_quantity_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    'cart.item.add',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_actor_profile_id
      and scope = 'cart.item.add'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = p_listing_id
  for update;

  if listing_row.listing_id is null then
    raise exception 'marketplace_listing_not_found';
  end if;
  if listing_row.listing_state <> 'active' or listing_row.quantity_available_snapshot < 1 then
    raise exception 'marketplace_listing_not_available';
  end if;

  select seller_profile.seller_public_profile_id into seller_public_profile_id
  from public.marketplace_public_seller_profiles seller_profile
  where seller_profile.marketplace_account_id = listing_row.seller_marketplace_account_id
    and seller_profile.status = 'active';

  insert into public.marketplace_cart_items(
    buyer_marketplace_account_id,
    listing_id,
    quantity
  ) values (
    p_buyer_marketplace_account_id,
    p_listing_id,
    safe_quantity
  )
  on conflict (buyer_marketplace_account_id, listing_id)
  do nothing
  returning * into cart_row;

  was_inserted := cart_row.id is not null;

  if not was_inserted then
    select * into cart_row
    from public.marketplace_cart_items
    where buyer_marketplace_account_id = p_buyer_marketplace_account_id
      and listing_id = p_listing_id;
  end if;

  mutation_status := case when was_inserted then 'added' else 'already_in_cart' end;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_actor_profile_id,
    'marketplace_cart_item_added',
    jsonb_build_object(
      'listingId', p_listing_id,
      'cartItemId', cart_row.id,
      'status', mutation_status
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'status', mutation_status,
    'item', jsonb_build_object(
      'id', cart_row.id,
      'listingId', cart_row.listing_id,
      'quantity', cart_row.quantity,
      'createdAt', cart_row.created_at,
      'updatedAt', cart_row.updated_at,
      'listing', jsonb_build_object(
        'listingId', listing_row.listing_id,
        'productId', listing_row.product_id,
        'variantId', listing_row.variant_id,
        'sellerPublicProfileId', seller_public_profile_id,
        'listingSource', listing_row.listing_source,
        'listingState', listing_row.listing_state,
        'title', listing_row.title,
        'itemPriceSatang', listing_row.item_price_satang,
        'currency', listing_row.currency,
        'quantityAvailableSnapshot', listing_row.quantity_available_snapshot,
        'photoUrls', listing_row.photo_urls,
        'publicAttributes', jsonb_build_object(
          'cardCode', null,
          'conditionLabel', null,
          'gradeLabel', null
        )
      )
    ),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;
```

`marketplace_remove_customer_cart_item` must be written out fully, not left as a prose-only copy. It must:

- call `public.marketplace_require_customer_account(p_buyer_marketplace_account_id, p_actor_profile_id)` before idempotency handling;
- use the same idempotency conflict block as add with scope `cart.item.remove`;
- run `delete from public.marketplace_cart_items where buyer_marketplace_account_id = p_buyer_marketplace_account_id and listing_id = p_listing_id returning * into cart_row`;
- return `status = 'removed'` when `cart_row.id is not null` and `status = 'not_in_cart'` when no row existed;
- write `marketplace_cart_item_removed` with only public-safe event payload fields;
- return `summary = public.marketplace_get_customer_cart_summary(p_buyer_marketplace_account_id, p_actor_profile_id)`;
- not return `request_hash`, idempotency keys, buyer account IDs, seller account IDs, or raw profile IDs.

- [ ] **Step 3: Add watchlist RPCs**

Add `marketplace_list_customer_watchlist`, `marketplace_watch_listing`, and `marketplace_unwatch_listing` using the same account guard, base listing table, public seller profile join, and idempotency pattern as cart. Do not read watchlist listing details from the active-only public listing view because watched listings can later become unavailable and still need a safe unavailable state in the UI.

The watchlist list RPC signature is:

```sql
create or replace function public.marketplace_list_customer_watchlist(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 100
)
returns jsonb;
```

The watchlist mutation response shape is:

```json
{
  "status": "watched",
  "item": {
    "id": "uuid",
    "listingId": "uuid",
    "createdAt": "iso",
    "updatedAt": "iso",
    "listing": {}
  },
  "summary": {}
}
```

Use `status = 'unwatched'` or `status = 'not_watched'` for unwatch.

The watch RPC must return `status = 'watched'` only for a new watch row and `status = 'already_watched'` when the row already existed.

- [ ] **Step 4: Revoke and grant execute**

Append explicit grants:

```sql
revoke all on function public.marketplace_require_customer_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_list_customer_cart(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.marketplace_get_customer_cart_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_add_customer_cart_item(uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_remove_customer_cart_item(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_list_customer_watchlist(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.marketplace_watch_listing(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_unwatch_listing(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.marketplace_require_customer_account(uuid, uuid) to service_role;
grant execute on function public.marketplace_list_customer_cart(uuid, uuid, integer) to service_role;
grant execute on function public.marketplace_get_customer_cart_summary(uuid, uuid) to service_role;
grant execute on function public.marketplace_add_customer_cart_item(uuid, uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_remove_customer_cart_item(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_list_customer_watchlist(uuid, uuid, integer) to service_role;
grant execute on function public.marketplace_watch_listing(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_unwatch_listing(uuid, uuid, text, text, text, uuid) to service_role;
```

- [ ] **Step 5: Update verification scripts**

In `Website/tools/verification/verify-marketplace-schema.mjs`, add checks for:

```js
includes(compactSql, "marketplace_get_customer_cart_summary", "customer cart summary RPC exists");
includes(compactSql, "marketplace_add_customer_cart_item", "customer cart add RPC exists");
includes(compactSql, "marketplace_watch_listing", "customer watchlist RPC exists");
includes(compactSql, "marketplace_cart_items_buyer_listing_idx", "cart buyer/listing index exists");
includes(compactSql, "marketplace_require_customer_account", "customer account guard exists");
includes(compactSql, "marketplace_listing_snapshots_cart_availability_idx", "cart listing availability index exists");
notMatches(compactSql, /'snapshotpayload'|snapshot_payload[\s\S]{0,120}jsonb_build_object/, "customer cart RPCs do not return raw snapshot payloads");
```

In `Website/tools/verification/verify-marketplace-rls.mjs`, add checks that the new RPCs revoke browser roles and grant `service_role`.

- [ ] **Step 6: Verify**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
npm run verify:marketplace-schema
npm run verify:marketplace-rls
```

Expected: the customer cart guard now progresses past the migration checks and fails on the TypeScript/UI adapter checks until later tasks finish.

- [ ] **Step 7: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql Website/tools/verification/verify-marketplace-schema.mjs Website/tools/verification/verify-marketplace-rls.mjs
git commit -m "Add customer cart RPC contract

Constraint: Customer cart state must be account-persistent without exposing raw marketplace account rows
Rejected: Direct table access from TypeScript live paths | bypasses RPC idempotency and audit consistency
Confidence: medium
Scope-risk: moderate
Directive: Cart and watchlist writes must remain service-role RPC transactions
Tested: npm run test:marketplace-customer-cart; npm run verify:marketplace-schema; npm run verify:marketplace-rls
Not-tested: Linked database migration apply remains gated by backup and restore-drill readiness"
```

## Task 3: Replace Direct Cart Table Access With RPC Adapter

**Files:**
- Modify: `Website/src/lib/marketplace/cart-watchlist.ts`
- Test: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`

- [ ] **Step 1: Introduce response normalizers**

Add these types and helpers near the top of `cart-watchlist.ts`:

```ts
import { type SafeMarketplaceAccount } from "./account-bridge";

export type MarketplaceCartAccount = Pick<SafeMarketplaceAccount, "accountId">;

export type MarketplaceCartSummary = {
  cartCount: number;
  watchlistCount: number;
  subtotalSatang: number;
  unavailableCount: number;
  currency: "THB";
  updatedAt: string | null;
};

export type MarketplaceCustomerCartState = {
  items: MarketplaceCartItem[];
  summary: MarketplaceCartSummary;
};

export type MarketplaceWatchlistState = {
  items: MarketplaceWatchlistItem[];
  summary: MarketplaceCartSummary;
};

const EMPTY_SUMMARY: MarketplaceCartSummary = {
  cartCount: 0,
  watchlistCount: 0,
  subtotalSatang: 0,
  unavailableCount: 0,
  currency: "THB",
  updatedAt: null,
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSummary(value: unknown): MarketplaceCartSummary {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    cartCount: numberField(input.cartCount),
    watchlistCount: numberField(input.watchlistCount),
    subtotalSatang: numberField(input.subtotalSatang),
    unavailableCount: numberField(input.unavailableCount),
    currency: "THB",
    updatedAt: stringOrNull(input.updatedAt),
  };
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safePhotoUrl(value: unknown) {
  if (typeof value !== "string") return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!/(\.|^)ynotopen\.com$/.test(url.hostname) && !/(\.|^)supabase\.co$/.test(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePublicAttributes(value: unknown) {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    cardCode: stringOrNull(input.cardCode),
    conditionLabel: stringOrNull(input.conditionLabel),
    gradeLabel: stringOrNull(input.gradeLabel),
  };
}

function normalizeListing(value: unknown) {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    listingId: String(input.listingId ?? ""),
    productId: stringOrNull(input.productId),
    variantId: stringOrNull(input.variantId),
    sellerPublicProfileId: stringOrNull(input.sellerPublicProfileId),
    listingSource: input.listingSource === "user_seller" ? "user_seller" : "official_shop",
    listingState: typeof input.listingState === "string" ? input.listingState : "unknown",
    title: typeof input.title === "string" ? input.title : "Marketplace listing",
    itemPriceSatang: numberField(input.itemPriceSatang),
    currency: "THB" as const,
    quantityAvailableSnapshot: numberField(input.quantityAvailableSnapshot),
    photoUrls: arrayField(input.photoUrls).map(safePhotoUrl).filter((url): url is string => Boolean(url)),
    publicAttributes: normalizePublicAttributes(input.publicAttributes),
  };
}

function normalizeCartItems(value: unknown): MarketplaceCartItem[] {
  return arrayField(value).map((item) => {
    const input = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(input.id ?? ""),
      listingId: String(input.listingId ?? ""),
      quantity: Math.max(1, numberField(input.quantity) || 1),
      createdAt: stringOrNull(input.createdAt) ?? new Date(0).toISOString(),
      updatedAt: stringOrNull(input.updatedAt) ?? new Date(0).toISOString(),
      listing: normalizeListing(input.listing),
    };
  });
}

function normalizeCartMutationResult(value: unknown): MarketplaceCustomerListMutationResult {
  const input = (value ?? {}) as Record<string, unknown>;
  const status = typeof input.status === "string" ? input.status : "unknown";
  return {
    status,
    item: input.item ? normalizeCartItems([input.item])[0] : null,
    summary: normalizeSummary(input.summary),
  };
}

function summaryFromMock(
  cartItems: MarketplaceCartItem[],
  watchlistItems: MarketplaceWatchlistItem[],
): MarketplaceCartSummary {
  const activeCartItems = cartItems.filter(
    (item) => item.listing.listingState === "active" && item.listing.quantityAvailableSnapshot > 0,
  );
  return {
    cartCount: activeCartItems.length,
    watchlistCount: watchlistItems.length,
    subtotalSatang: activeCartItems.reduce((total, item) => total + item.listing.itemPriceSatang, 0),
    unavailableCount: cartItems.length - activeCartItems.length,
    currency: "THB",
    updatedAt: cartItems[0]?.updatedAt ?? watchlistItems[0]?.updatedAt ?? null,
  };
}
```

- [ ] **Step 2: Replace live list functions with RPCs**

Replace the live branch of `listMarketplaceCart(accountId, actorProfileId)` with:

```ts
const supabase = createMarketplaceSupabaseClient();
const result = await supabase.rpc("marketplace_list_customer_cart", {
  p_buyer_marketplace_account_id: buyerAccountId,
  p_actor_profile_id: actorProfileId,
  p_limit: 50,
});
if (result.error) throw marketplaceRpcError(result.error);
const payload = (result.data ?? {}) as Record<string, unknown>;
return normalizeCartItems(payload.items);
```

Add `getMarketplaceCustomerCartState(account, actorProfileId)`:

```ts
export async function getMarketplaceCustomerCartState(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCustomerCartState> {
  if (!account || !actorProfileId) return { items: [], summary: EMPTY_SUMMARY };
  const buyerAccountId = assertUuid(account.accountId, "account_id");
  if (marketplaceConfig().mockData) {
    const items = await compactCartRows(cartRowsForMockAccount(buyerAccountId));
    return { items, summary: summaryFromMock(items, []) };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_list_customer_cart", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_actor_profile_id: actorProfileId,
    p_limit: 50,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  const payload = (result.data ?? {}) as Record<string, unknown>;
  return {
    items: normalizeCartItems(payload.items),
    summary: normalizeSummary(payload.summary),
  };
}

export async function getMarketplaceCustomerCartSummary(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCartSummary> {
  if (!account || !actorProfileId) return EMPTY_SUMMARY;
  const buyerAccountId = assertUuid(account.accountId, "account_id");
  if (marketplaceConfig().mockData) {
    const cartItems = await compactCartRows(cartRowsForMockAccount(buyerAccountId));
    const watchlistItems = await compactWatchlistRows(watchlistRowsForMockAccount(buyerAccountId));
    return summaryFromMock(cartItems, watchlistItems);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_get_customer_cart_summary", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_actor_profile_id: actorProfileId,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeSummary(result.data);
}
```

Keep `listMarketplaceCart(accountId, actorProfileId)` as a compatibility wrapper only for server code that has already authenticated the profile:

```ts
export async function listMarketplaceCart(accountId: string, actorProfileId: string) {
  return getMarketplaceCustomerCartState({ accountId }, actorProfileId).then((state) => state.items);
}
```

- [ ] **Step 3: Replace live mutation functions with RPCs**

Change `addMarketplaceCartItem` to accept `MarketplaceCartMutationInput`. Keep a temporary overload only if needed by current callers, but all routes must use the new object input in Task 4.

Live branch:

```ts
const result = await supabase.rpc("marketplace_add_customer_cart_item", {
  p_buyer_marketplace_account_id: input.account.accountId,
  p_listing_id: safeListingId,
  p_quantity: quantity,
  p_idempotency_key: input.idempotencyKey,
  p_request_hash: input.requestHash,
  p_request_id: input.requestId,
  p_actor_profile_id: input.actorProfileId,
});
if (result.error) throw marketplaceRpcError(result.error);
return normalizeCartMutationResult(result.data);
```

Use matching RPC calls for remove, watch, and unwatch.

- [ ] **Step 4: Remove direct table helpers**

Delete live-only helpers:

- `findCartRow`
- `findWatchlistRow`
- live `.from("marketplace_cart_items")` blocks
- live `.from("marketplace_watchlist_items")` blocks

Keep mock helpers only behind `marketplaceConfig().mockData`.

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
npm run typecheck
```

Expected: customer cart guard still fails on missing UI modules until Task 5, but it must no longer fail the direct-table check. Typecheck may fail until routes are updated in Task 4; if so, continue to Task 4 before committing.

- [ ] **Step 6: Commit after Task 4 if typecheck needs route changes**

Use one combined commit after Task 4 if this task cannot typecheck independently.

## Task 4: Update Cart And Watchlist API Routes

**Files:**
- Modify: `Website/src/lib/marketplace/route-guards.ts`
- Modify: `Website/src/lib/marketplace/mutation-guard.ts`
- Modify: `Website/src/app/api/ynot/marketplace/cart/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/cart/summary/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/cart/items/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/watchlist/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts`
- Create: `Website/src/app/api/marketplace/cart/summary/route.ts`
- Modify: adapter routes under `Website/src/app/api/marketplace/**` only if their exports are no longer valid
- Test: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`

- [ ] **Step 0: Add customer marketplace access mode**

In `route-guards.ts`, expose a buyer-safe helper for customer cart/watchlist reads:

```ts
const access = await publicMarketplaceAccess(profile);
if (!access.allowed) {
  return access.response;
}
```

If the current helper names differ, keep the existing style but preserve this contract:

- customer routes require a signed-in YNOT customer profile;
- customer routes honor marketplace launch/availability config;
- customer routes are not hard-coded to owner/admin-only access;
- admin and seller-management routes continue using owner/admin gates.

In `mutation-guard.ts`, either add:

```ts
accessMode?: "customer" | "owner";
```

or create a small `prepareMarketplaceCustomerMutation` wrapper. Customer cart/watchlist POST/DELETE routes must call the customer mode, while admin/seller routes keep the current owner mode.

- [ ] **Step 0b: Add route input validation**

Use existing local validation helpers/manual checks rather than adding a new dependency unless the repo already standardizes on one. The route layer must reject invalid input before calling service-role RPCs.

Required route validation:

- POST routes require `content-type: application/json`.
- Body `listingId` must be a UUID.
- Path `[listingId]` must be a UUID.
- Quantity is optional but, when present, must be exactly `1` for this slice.
- `x-idempotency-key` must be present on mutations, trimmed, bounded, and safe for storage/log redaction.
- Unknown or non-object JSON bodies return a generic `400` with `{ ok: false, error: "invalid_request" }`.
- Validation errors must not echo the supplied listing ID, account ID, idempotency key, request hash, SQL error, or stack trace.

Example helper shape:

```ts
function parseCartAddBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MarketplacePublicError("invalid_request", 400);
  }
  const input = body as Record<string, unknown>;
  const listingId = assertUuid(String(input.listingId ?? ""), "listing_id");
  const quantity = input.quantity == null ? 1 : Number(input.quantity);
  if (quantity !== 1) throw new MarketplacePublicError("invalid_quantity", 400);
  return { listingId, quantity };
}
```

- [ ] **Step 1: Return summary from cart GET**

Use the buyer-safe marketplace access helper from Step 0. Do not call `ownerOnlyMarketplaceAccess` directly in the customer cart GET route.

In `cart/route.ts`, replace:

```ts
const cart = await listMarketplaceCart(account.accountId, profile.profileId);
return Response.json({ ok: true, request_id: requestId, cart });
```

with:

```ts
const state = await getMarketplaceCustomerCartState(account, profile.profileId);
return Response.json({
  ok: true,
  request_id: requestId,
  cart: state.items,
  summary: state.summary,
});
```

- [ ] **Step 1b: Add a summary-only GET route**

Create `cart/summary/route.ts` and adapter `/api/marketplace/cart/summary` so headers and badges do not fetch full cart rows:

```ts
const summary = await getMarketplaceCustomerCartSummary(account, profile.profileId);
return Response.json({
  ok: true,
  request_id: requestId,
  summary,
});
```

The summary route must call `marketplace_get_customer_cart_summary` through the cart module and must not include cart item arrays.

The summary route must use the same buyer-safe access helper as the full cart GET route. It must not be owner-only unless `YNOT_MARKETPLACE_OWNER_ONLY=true` makes the customer access helper reject non-owners globally.

- [ ] **Step 2: Pass mutation metadata into add route**

Call the mutation guard in customer mode before invoking the module.

In `cart/items/route.ts`, validate the JSON body, then compute the target-aware request hash before calling the module:

```ts
const input = parseCartAddBody(body);
const requestHash = await mutation.requestHashForTargetBody(
  "cart.item.add",
  input.listingId,
  mutation.canonicalBody,
);
const result = await addMarketplaceCartItem({
  account,
  listingId: input.listingId,
  quantity: input.quantity,
  actorProfileId: profile.profileId,
  requestId,
  idempotencyKey,
  requestHash,
});
return Response.json({
  ok: true,
  request_id: requestId,
  cart: result,
  summary: result.summary,
});
```

- [ ] **Step 3: Pass mutation metadata into remove route**

Call the mutation guard in customer mode before invoking the module.

Use:

```ts
const safeListingId = assertUuid(listingId, "listing_id");
const requestHash = await mutation.requestHashForTarget(
  "cart.item.remove",
  safeListingId,
);
const result = await removeMarketplaceCartItem({
  account,
  listingId: safeListingId,
  actorProfileId: profile.profileId,
  requestId,
  idempotencyKey,
  requestHash,
});
```

- [ ] **Step 4: Mirror the same route shape for watchlist**

Watchlist GET and mutation routes use the same customer access mode. They must not reuse owner/admin gates directly.

Watch route returns:

```ts
return Response.json({
  ok: true,
  request_id: requestId,
  watchlist: state.items,
  summary: state.summary,
});
```

Watch/unwatch mutations return:

```ts
return Response.json({
  ok: true,
  request_id: requestId,
  watchlist: result,
  summary: result.summary,
});
```

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
npm run test:marketplace-snkrdunk-parity
npm run typecheck
```

Expected: typecheck passes. The customer cart guard still fails only on missing UI modules if Task 5 is not done.

- [ ] **Step 6: Commit Tasks 3 and 4**

```bash
git add Website/src/lib/marketplace/cart-watchlist.ts Website/src/lib/marketplace/route-guards.ts Website/src/lib/marketplace/mutation-guard.ts Website/src/app/api/ynot/marketplace/cart Website/src/app/api/ynot/marketplace/watchlist Website/src/app/api/marketplace/cart Website/src/app/api/marketplace/watchlist
git commit -m "Route customer cart APIs through RPC adapter

Constraint: API routes must return visible customer cart state while database writes stay transactional
Rejected: Keeping direct table helpers for live cart state | creates a second persistence contract
Confidence: medium
Scope-risk: moderate
Directive: Customer cart routes must keep buyer access separate from owner/admin access
Tested: npm run test:marketplace-customer-cart; npm run test:marketplace-snkrdunk-parity; npm run typecheck
Not-tested: Browser drawer interaction is implemented in later tasks"
```

## Task 5: Add Customer Cart Provider And Drawer

**Files:**
- Create: `Website/src/features/ynot/MarketplaceCartProvider.tsx`
- Create: `Website/src/features/ynot/MarketplaceCartDrawer.tsx`
- Create: `Website/src/features/ynot/MarketplaceHeaderActions.tsx`
- Create preferred / fallback: `Website/src/app/(store)/marketplace/layout.tsx` or `Website/src/features/ynot/MarketplaceShell.tsx`
- Modify: `Website/src/app/(store)/marketplace/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/listings/[listingId]/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/cart/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/watchlist/page.tsx`
- Modify: `Website/src/app/globals.css`
- Test: `Website/scripts/test-marketplace-customer-cart-rpc.mjs`

- [ ] **Step 1: Create the provider**

Create `MarketplaceCartProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type MarketplaceCartSummaryView = {
  cartCount: number;
  watchlistCount: number;
  subtotalSatang: number;
  unavailableCount: number;
  currency: "THB";
  updatedAt: string | null;
};

type MarketplaceCartContextValue = {
  summary: MarketplaceCartSummaryView;
  drawerOpen: boolean;
  setSummary: (summary: MarketplaceCartSummaryView) => void;
  refreshCartSummary: () => Promise<void>;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
};

const EMPTY_SUMMARY: MarketplaceCartSummaryView = {
  cartCount: 0,
  watchlistCount: 0,
  subtotalSatang: 0,
  unavailableCount: 0,
  currency: "THB",
  updatedAt: null,
};

const MarketplaceCartContext = createContext<MarketplaceCartContextValue | null>(null);

function normalizeSummary(input: Partial<MarketplaceCartSummaryView> | null | undefined) {
  return {
    cartCount: Number(input?.cartCount ?? 0),
    watchlistCount: Number(input?.watchlistCount ?? 0),
    subtotalSatang: Number(input?.subtotalSatang ?? 0),
    unavailableCount: Number(input?.unavailableCount ?? 0),
    currency: "THB" as const,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : null,
  };
}

export function MarketplaceCartProvider({
  children,
  initialSummary,
}: {
  children: ReactNode;
  initialSummary?: Partial<MarketplaceCartSummaryView> | null;
}) {
  const [summary, setSummaryState] = useState(() =>
    normalizeSummary(initialSummary ?? EMPTY_SUMMARY),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setSummary = useCallback((next: MarketplaceCartSummaryView) => {
    setSummaryState(normalizeSummary(next));
  }, []);

  const refreshCartSummary = useCallback(async () => {
    const response = await fetch("/api/marketplace/cart/summary", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as {
      summary?: MarketplaceCartSummaryView;
    } | null;
    if (!response.ok) {
      throw new Error("Could not refresh cart.");
    }
    setSummaryState(normalizeSummary(body?.summary));
  }, []);

  const value = useMemo(
    () => ({
      summary,
      drawerOpen,
      setSummary,
      refreshCartSummary,
      openCartDrawer: () => setDrawerOpen(true),
      closeCartDrawer: () => setDrawerOpen(false),
    }),
    [drawerOpen, refreshCartSummary, setSummary, summary],
  );

  return (
    <MarketplaceCartContext.Provider value={value}>
      {children}
    </MarketplaceCartContext.Provider>
  );
}

export function useMarketplaceCart() {
  const value = useContext(MarketplaceCartContext);
  if (!value) {
    throw new Error("useMarketplaceCart must be used inside MarketplaceCartProvider.");
  }
  return value;
}
```

- [ ] **Step 2: Create the drawer**

Create `MarketplaceCartDrawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMarketplaceCart } from "./MarketplaceCartProvider";

type DrawerItem = {
  id: string;
  listingId: string;
  listing: {
    title: string;
    itemPriceSatang: number;
    currency: "THB";
    photoUrls: string[];
    listingSource: "official_shop" | "user_seller";
    publicAttributes?: {
      cardCode?: string | null;
      conditionLabel?: string | null;
      gradeLabel?: string | null;
    };
  };
};

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

export function MarketplaceCartDrawer() {
  const { closeCartDrawer, drawerOpen, summary, setSummary } = useMarketplaceCart();
  const [items, setItems] = useState<DrawerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/cart", { headers: { accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error("Could not load cart.");
        if (!cancelled) {
          setItems(body.cart ?? []);
          if (body.summary) setSummary(body.summary);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError("Could not load cart.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, setSummary]);

  if (!drawerOpen) return null;

  return (
    <aside className="marketplace-cart-drawer" aria-label="Cart">
      <div className="marketplace-cart-drawer-panel">
        <div className="marketplace-cart-drawer-head">
          <div>
            <strong>Cart</strong>
            <span>{summary.cartCount} listing{summary.cartCount === 1 ? "" : "s"} saved</span>
          </div>
          <button type="button" className="marketplace-icon-button" onClick={closeCartDrawer}>
            Close
          </button>
        </div>
        {loading ? <p className="marketplace-muted">Loading cart</p> : null}
        {error ? <p className="marketplace-action-status">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="marketplace-empty compact">
            <strong>Your cart is empty</strong>
            <Link href="/marketplace" onClick={closeCartDrawer}>
              Browse marketplace
            </Link>
          </div>
        ) : null}
        <div className="marketplace-cart-drawer-list">
          {items.slice(0, 5).map((item) => {
            const image = item.listing.photoUrls?.[0] ?? "";
            return (
              <Link
                key={item.id}
                href={`/marketplace/listings/${item.listingId}`}
                className="marketplace-cart-drawer-row"
                onClick={closeCartDrawer}
              >
                <span style={image ? { backgroundImage: `url(${image})` } : undefined} />
                <div>
                  <strong>{item.listing.title}</strong>
                  <small>{item.listing.listingSource === "official_shop" ? "Official shop" : "User seller"}</small>
                </div>
                <b>{thb(item.listing.itemPriceSatang)}</b>
              </Link>
            );
          })}
        </div>
        <div className="marketplace-cart-drawer-foot">
          <span>Item subtotal</span>
          <strong>{thb(summary.subtotalSatang)}</strong>
          <Link href="/marketplace/cart" className="btn btn-primary" onClick={closeCartDrawer}>
            View cart
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="marketplace-cart-drawer-backdrop"
        aria-label="Close cart"
        onClick={closeCartDrawer}
      />
    </aside>
  );
}
```

- [ ] **Step 3: Create header actions**

Create `MarketplaceHeaderActions.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ShoppingBag, Store, Heart } from "lucide-react";
import { useMarketplaceCart } from "./MarketplaceCartProvider";

export function MarketplaceHeaderActions({ showAdmin }: { showAdmin?: boolean }) {
  const { openCartDrawer, summary } = useMarketplaceCart();
  return (
    <div className="marketplace-header-actions" aria-label="Marketplace actions">
      <button type="button" className="marketplace-pill-icon" onClick={openCartDrawer}>
        <ShoppingBag size={18} aria-hidden="true" />
        <span>Cart</span>
        {summary.cartCount > 0 ? <b>{summary.cartCount}</b> : null}
      </button>
      <Link href="/marketplace/watchlist" className="marketplace-pill-icon" prefetch={false}>
        <Heart size={18} aria-hidden="true" />
        <span>Watchlist</span>
        {summary.watchlistCount > 0 ? <b>{summary.watchlistCount}</b> : null}
      </Link>
      <Link href="/marketplace/seller" className="marketplace-pill-icon" prefetch={false}>
        <Store size={18} aria-hidden="true" />
        <span>Sell</span>
      </Link>
      {showAdmin ? (
        <Link href="/admin/marketplace" className="marketplace-pill-icon" prefetch={false}>
          Admin
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

Append these styles to `Website/src/app/globals.css`:

```css
.marketplace-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.marketplace-pill-icon {
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  text-decoration: none;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.marketplace-pill-icon b {
  min-width: 20px;
  min-height: 20px;
  border-radius: 999px;
  background: var(--foreground);
  color: var(--background);
  display: inline-grid;
  place-items: center;
  padding: 0 6px;
  font-size: 12px;
}

.marketplace-cart-drawer {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  justify-items: end;
}

.marketplace-cart-drawer-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(0 0 0 / 38%);
}

.marketplace-cart-drawer-panel {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  height: 100%;
  overflow: auto;
  background: var(--surface);
  color: var(--foreground);
  box-shadow: -18px 0 42px rgb(0 0 0 / 18%);
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 20px;
}

.marketplace-cart-drawer-head,
.marketplace-cart-drawer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.marketplace-cart-drawer-head div,
.marketplace-cart-drawer-foot {
  display: grid;
  gap: 2px;
}

.marketplace-cart-drawer-head span,
.marketplace-cart-drawer-row small,
.marketplace-muted {
  color: var(--muted);
}

.marketplace-cart-drawer-list {
  display: grid;
  gap: 10px;
}

.marketplace-cart-drawer-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: inherit;
  text-decoration: none;
}

.marketplace-cart-drawer-row > span {
  width: 58px;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  background: var(--surface-muted) center / cover no-repeat;
}

.marketplace-cart-drawer-row strong {
  display: block;
  font-size: 14px;
  line-height: 1.25;
}

.marketplace-icon-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  padding: 8px 12px;
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 5: Add shared marketplace chrome**

First read the current Next.js App Router docs in `Website/node_modules/next/dist/docs/` for route layouts before editing. Preferred implementation: create `Website/src/app/(store)/marketplace/layout.tsx` and put the provider, header actions, and drawer there so cart state does not reset between marketplace pages.

The shared chrome should fetch initial summary through `getMarketplaceCustomerCartSummary(account, profile.profileId)` or a server-loaded `getMarketplaceCustomerCartState(account, profile.profileId)` when the page also needs full cart rows. It should render:

```tsx
<MarketplaceCartProvider initialSummary={cartState.summary}>
  <MarketplaceHeaderActions showAdmin={admin?.adminRole === "owner" || admin?.adminRole === "admin"} />
  <MarketplaceCartDrawer />
  {children}
</MarketplaceCartProvider>
```

If route-layout data access is not compatible with the current Next.js version, create `Website/src/features/ynot/MarketplaceShell.tsx` or a server wrapper next to the marketplace pages and call that wrapper from every marketplace page. The fallback still must use one shared wrapper component, not copy a provider block into each page.

- [ ] **Step 6: Verify**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
npm run typecheck
```

Expected: customer cart guard passes UI module existence checks. Typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add Website/src/features/ynot/MarketplaceCartProvider.tsx Website/src/features/ynot/MarketplaceCartDrawer.tsx Website/src/features/ynot/MarketplaceHeaderActions.tsx Website/src/app/'(store)'/marketplace Website/src/app/globals.css
git commit -m "Add visible customer cart state to marketplace UI

Constraint: Buyers need to see cart contents and counts immediately after cart actions
Rejected: Cart page only state | makes successful add-to-cart look broken from listing pages
Confidence: medium
Scope-risk: moderate
Directive: Header badges and drawer must use public-safe cart summary payloads
Tested: npm run test:marketplace-customer-cart; npm run typecheck
Not-tested: Browser click path is verified in the final task"
```

## Task 6: Wire Listing Buttons And Cart Page State

**Files:**
- Modify: `Website/src/features/ynot/MarketplaceListingActionsClient.tsx`
- Modify: `Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx`
- Modify: `Website/src/app/(store)/marketplace/cart/page.tsx`
- Modify: `Website/src/app/(store)/marketplace/watchlist/page.tsx`
- Test: browser local flow

- [ ] **Step 1: Update listing action response parsing**

In `MarketplaceListingActionsClient.tsx`, expand the response type:

```ts
type MarketplaceActionBody = {
  errorCode?: string;
  summary?: MarketplaceCartSummaryView;
  cart?: { status?: string };
  watchlist?: { status?: string };
};
```

Do not render raw API error text in this component. Non-OK responses map to a generic message such as `Could not update cart. Please try again.` while server logs retain `request_id` and internal details.

Import:

```ts
import { useMarketplaceCart } from "./MarketplaceCartProvider";
```

Inside the component:

```ts
const { openCartDrawer, setSummary } = useMarketplaceCart();
```

After add succeeds:

```ts
if (body?.summary) setSummary(body.summary);
setStatus(
  body?.cart?.status === "already_in_cart"
    ? "Already in cart."
    : "Added to cart.",
);
openCartDrawer();
```

Render status actions:

```tsx
{status ? (
  <p className="marketplace-action-status" role="status">
    {status} <Link href="/marketplace/cart" prefetch={false}>View cart</Link>
  </p>
) : null}
```

- [ ] **Step 2: Update watch action**

After watch succeeds:

```ts
if (body?.summary) setSummary(body.summary);
setStatus("Saved to watchlist.");
```

If the listing is already watched, show:

```ts
setStatus("Already in watchlist.");
```

- [ ] **Step 3: Sync provider after cart/watchlist removals**

In `MarketplaceCartWatchlistClient.tsx`, import `useMarketplaceCart`. After remove response parsing:

```ts
const body = await parseJson(await fetch(endpoint, requestInit));
if (body.summary) setSummary(body.summary);
```

Update `parseJson` response type to include `summary`.

- [ ] **Step 4: Update cart page copy**

In `cart/page.tsx`, replace the subtitle with:

```tsx
<p>
  {cart.length} listing{cart.length === 1 ? "" : "s"} saved. Stock is locked only after checkout starts.
</p>
```

In the cart card primary action, use:

```tsx
{mode === "cart" ? "Buy this listing" : "See listing"}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-customer-cart
npm run test:marketplace-snkrdunk-parity
npm run typecheck
```

Expected: PASS for all three.

- [ ] **Step 6: Commit**

```bash
git add Website/src/features/ynot/MarketplaceListingActionsClient.tsx Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx Website/src/app/'(store)'/marketplace/cart/page.tsx Website/src/app/'(store)'/marketplace/watchlist/page.tsx
git commit -m "Wire cart actions to visible customer state

Constraint: Add-to-cart must show what changed without forcing the buyer to guess or reload
Rejected: Text-only Added to cart feedback | does not show cart contents or count
Confidence: high
Scope-risk: narrow
Directive: Cart and watchlist mutations should update the shared summary provider
Tested: npm run test:marketplace-customer-cart; npm run test:marketplace-snkrdunk-parity; npm run typecheck
Not-tested: Browser click path is verified in the final task"
```

## Task 7: API And Browser Verification

**Files:**
- Modify: `Website/tools/verification/verify-marketplace-hardening.mjs`
- Modify: `Website/tools/verification/verify-marketplace-doc-traceability.mjs`
- Create: `Website/tools/verification/verify-marketplace-customer-cart-sql.mjs`
- Modify: `Website/package.json`
- Test: local API and browser routes

- [ ] **Step 0: Add SQL execution verification**

Create `verify-marketplace-customer-cart-sql.mjs` as a local tooling wrapper that tries the strongest available check in this order:

1. run `supabase db lint` from `Database/marketplace-supabase` when Supabase CLI is installed and configured;
2. run a local migration apply/reset or RPC smoke when a local Supabase database is available;
3. fall back to static SQL checks only when local Supabase tooling is missing, and print an explicit `SQL execution verification skipped` reason.

The wrapper must fail if the migration does not define or grant the expected RPCs:

```js
const requiredRpcNames = [
  "marketplace_list_customer_cart",
  "marketplace_get_customer_cart_summary",
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_list_customer_watchlist",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
];
```

It must also check that read RPC signatures include `p_actor_profile_id`, mutating RPC bodies validate marketplace account ownership, and mutation result JSON does not include `request_hash` or `idempotency_key`.

It must fail if customer cart/watchlist RPC response builders include raw `snapshot_payload` or a JSON key named `snapshotPayload`.

Add:

```json
"verify:marketplace-customer-cart-sql": "node tools/verification/verify-marketplace-customer-cart-sql.mjs"
```

- [ ] **Step 1: Add hardening checks**

In `verify-marketplace-hardening.mjs`, add:

```js
const cartWatchlist = readWebsite("src/lib/marketplace/cart-watchlist.ts");
notMatches(cartWatchlist, /\.from\("marketplace_cart_items"\)/, "cart live adapter does not read cart table directly");
notMatches(cartWatchlist, /\.from\("marketplace_watchlist_items"\)/, "watchlist live adapter does not read watchlist table directly");
includes(cartWatchlist, 'rpc("marketplace_add_customer_cart_item"', "cart add uses RPC");
includes(cartWatchlist, 'rpc("marketplace_watch_listing"', "watchlist add uses RPC");

for (const relPath of [
  "src/features/ynot/MarketplaceCartProvider.tsx",
  "src/features/ynot/MarketplaceCartDrawer.tsx",
  "src/features/ynot/MarketplaceHeaderActions.tsx",
  "src/features/ynot/MarketplaceListingActionsClient.tsx",
  "src/features/ynot/MarketplaceCartWatchlistClient.tsx",
]) {
  const source = readWebsite(relPath);
  notMatches(source, /buyerMarketplaceAccountId|buyer_marketplace_account_id/i, `${relPath} does not expose buyer account ids`);
  notMatches(source, /sellerMarketplaceAccountId|seller_marketplace_account_id/i, `${relPath} does not expose seller account ids`);
  notMatches(source, /requestHash|request_hash|idempotencyKey|idempotency_key/i, `${relPath} does not expose mutation internals`);
  notMatches(source, /snapshotPayload|snapshot_payload/i, `${relPath} does not expose raw listing snapshot payloads`);
  notMatches(source, /nextError\.message|body\.error/i, `${relPath} does not render raw API errors`);
}

for (const relPath of [
  "src/app/api/ynot/marketplace/cart/items/route.ts",
  "src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts",
  "src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts",
]) {
  const source = readWebsite(relPath);
  notMatches(source, /request_hash\s*:/, `${relPath} does not return request_hash`);
  notMatches(source, /idempotency_key\s*:/, `${relPath} does not return idempotency_key`);
  matches(source, /rateLimit\s*:/, `${relPath} declares mutation rate limit`);
  matches(source, /requestHashForTarget|requestHashForTargetBody/, `${relPath} hashes canonical mutation target`);
  matches(source, /assertUuid|parse[A-Za-z0-9]+Body|validate[A-Za-z0-9]+Input/, `${relPath} validates route params/body before RPC`);
  notMatches(source, /body\.listingId/, `${relPath} does not pass unvalidated body.listingId to RPC`);
}

for (const relPath of [
  "src/app/api/ynot/marketplace/cart/route.ts",
  "src/app/api/ynot/marketplace/cart/summary/route.ts",
  "src/app/api/ynot/marketplace/watchlist/route.ts",
]) {
  const source = readWebsite(relPath);
  notMatches(source, /ownerOnlyMarketplaceAccess/, `${relPath} does not hard-code owner-only customer access`);
  matches(source, /customerMarketplaceAccess|publicMarketplaceAccess/, `${relPath} uses buyer-safe marketplace access`);
  matches(source, /enforceRateLimit|rateLimit/, `${relPath} enforces read rate limit`);
}

const mutationGuard = readWebsite("src/lib/marketplace/mutation-guard.ts");
matches(mutationGuard, /accessMode|prepareMarketplaceCustomerMutation/, "mutation guard supports customer access mode");
matches(mutationGuard, /same-origin|origin|assertSameOrigin|verifySameOrigin/i, "mutation guard enforces same-origin mutations");
matches(mutationGuard, /idempotency/i, "mutation guard requires idempotency metadata");

const cartWatchlistSql = marketplaceSql();
notMatches(cartWatchlistSql, /'snapshotPayload'|snapshot_payload[\s\S]{0,120}jsonb_build_object/i, "customer cart RPCs do not return raw snapshot payloads");
```

- [ ] **Step 2: Add doc traceability checks**

In `verify-marketplace-doc-traceability.mjs`, assert:

```js
includes(source, "2026-06-30-marketplace-customer-cart-rpc-ui.md", "customer cart RPC plan is traceable");
includes(source, "Marketplace Cart Summary", "customer cart summary term is traceable");
includes(source, "marketplace_get_customer_cart_summary", "customer cart summary RPC is traceable");
includes(source, "Button To API/RPC Wiring Matrix", "button to backend wiring matrix is traceable");
includes(source, "HTTP API Contract", "HTTP API contract is traceable");
includes(source, "RPC To Table Contract", "RPC to table contract is traceable");
includes(source, "Listing detail `Add to cart` button", "Add to cart button wiring is traceable");
includes(source, "Mini-cart row `Remove` button", "cart remove button wiring is traceable");
includes(source, "Watchlist row `Remove` button", "watchlist remove button wiring is traceable");
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
cd Website
npm run verify:marketplace-customer-cart-sql
npm run test:marketplace-customer-cart
npm run verify:marketplace-hardening
npm run verify:marketplace-doc-traceability
npm run typecheck
git diff --check
```

Expected: all commands exit with code `0`.

- [ ] **Step 4: Start localhost**

Run:

```bash
cd Website
YNOT_MARKETPLACE_ENABLED=true \
YNOT_MARKETPLACE_OWNER_ONLY=false \
MARKETPLACE_ENVIRONMENT=local \
YNOT_MARKETPLACE_MOCK_DATA=true \
YNOT_ENABLE_DEV_AUTH=true \
NEXT_PUBLIC_ENABLE_LINE_LOGIN=true \
NEXT_PUBLIC_SITE_URL=http://localhost:3010 \
npm run dev -- --hostname localhost --port 3010
```

Expected: dev server serves `http://localhost:3010`.

- [ ] **Step 5: API smoke with preview auth**

Run:

```bash
BASE='http://localhost:3010'
JAR='/tmp/ynot-marketplace-cart-rpc.cookies'
LISTING_ID='12121212-1212-4121-8121-121212121212'
RUN_ID="$(date +%s)-$$"
rm -f "$JAR"
curl -sS "$BASE/api/marketplace/cart/summary" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  let j;
  try {
    j = JSON.parse(s);
  } catch {
    console.log("anonymous summary rejected");
    return;
  }
  if (j.ok) throw new Error("anonymous cart summary should not be ok");
  console.log("anonymous summary rejected");
});
'
curl -sS -L -c "$JAR" -b "$JAR" "$BASE/api/dev/preview-auth?mode=on&next=/marketplace" -o /tmp/ynot-marketplace-auth.html
curl -sS -b "$JAR" "$BASE/api/marketplace/cart/summary" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("cart summary not ok");
  if (!j.summary) throw new Error("summary missing");
  if (j.cart || j.items || j.watchlist) throw new Error("summary route returned full item payload");
  console.log(`cart before ${j.summary.cartCount}`);
});
'
curl -sS -b "$JAR" "$BASE/api/marketplace/cart" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("cart list not ok");
  if (!Array.isArray(j.cart)) throw new Error("cart array missing");
  if (!j.summary) throw new Error("cart list summary missing");
  if (/snapshotPayload|snapshot_payload/i.test(JSON.stringify(j))) throw new Error("cart list leaked raw snapshot payload");
  console.log(`cart list returned ${j.cart.length}`);
});
'
curl -sS -b "$JAR" \
  -H 'content-type: text/plain' \
  -H "x-idempotency-key: cart-rpc-smoke-bad-content-type-$RUN_ID" \
  -X POST "$BASE/api/marketplace/cart/items" \
  --data "not-json" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (j.ok) throw new Error("bad content-type should not be ok");
  console.log("bad content-type rejected");
});
'
curl -sS -b "$JAR" \
  -H 'content-type: application/json' \
  -H "x-idempotency-key: cart-rpc-smoke-bad-listing-$RUN_ID" \
  -X POST "$BASE/api/marketplace/cart/items" \
  --data "{\"listingId\":\"not-a-uuid\"}" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (j.ok) throw new Error("bad listing id should not be ok");
  if (/not-a-uuid|stack|sql|request_hash|idempotency_key/i.test(JSON.stringify(j))) throw new Error("bad listing response leaked internals");
  console.log("bad listing rejected");
});
'
curl -sS -b "$JAR" \
  -H 'content-type: application/json' \
  -H 'origin: https://evil.example' \
  -H "x-idempotency-key: cart-rpc-smoke-bad-origin-$RUN_ID" \
  -X POST "$BASE/api/marketplace/cart/items" \
  --data "{\"listingId\":\"$LISTING_ID\"}" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (j.ok) throw new Error("cross-site origin should not be ok");
  console.log("cross-site origin rejected");
});
'
curl -sS -b "$JAR" \
  -H 'content-type: application/json' \
  -H "x-idempotency-key: cart-rpc-smoke-add-$RUN_ID" \
  -X POST "$BASE/api/marketplace/cart/items" \
  --data "{\"listingId\":\"$LISTING_ID\"}" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("cart add not ok");
  if (!j.summary || j.summary.cartCount < 1) throw new Error("summary not updated");
  if (/request_hash|idempotency_key|requestHash|idempotencyKey|snapshotPayload|snapshot_payload/i.test(JSON.stringify(j))) throw new Error("cart add leaked mutation internals");
  console.log(`cart after add ${j.summary.cartCount}`);
});
'
curl -sS -b "$JAR" \
  -H "x-idempotency-key: cart-rpc-smoke-remove-$RUN_ID" \
  -X DELETE "$BASE/api/marketplace/cart/items/$LISTING_ID" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("cart remove not ok");
  if (!j.summary) throw new Error("remove summary missing");
  if (/request_hash|idempotency_key|requestHash|idempotencyKey|snapshotPayload|snapshot_payload/i.test(JSON.stringify(j))) throw new Error("cart remove leaked mutation internals");
  console.log(`cart after remove ${j.summary.cartCount}`);
});
'
curl -sS -b "$JAR" \
  -H "x-idempotency-key: watch-rpc-smoke-add-$RUN_ID" \
  -X POST "$BASE/api/marketplace/watchlist/items/$LISTING_ID" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("watch add not ok");
  if (!j.summary) throw new Error("watch summary missing");
  if (/request_hash|idempotency_key|requestHash|idempotencyKey|snapshotPayload|snapshot_payload/i.test(JSON.stringify(j))) throw new Error("watch add leaked mutation internals");
  console.log(`watchlist after add ${j.summary.watchlistCount}`);
});
'
curl -sS -b "$JAR" \
  -H "x-idempotency-key: watch-rpc-smoke-remove-$RUN_ID" \
  -X DELETE "$BASE/api/marketplace/watchlist/items/$LISTING_ID" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.ok) throw new Error("watch remove not ok");
  if (!j.summary) throw new Error("watch remove summary missing");
  if (/request_hash|idempotency_key|requestHash|idempotencyKey|snapshotPayload|snapshot_payload/i.test(JSON.stringify(j))) throw new Error("watch remove leaked mutation internals");
  console.log(`watchlist after remove ${j.summary.watchlistCount}`);
});
'
```

Expected output includes:

```text
anonymous summary rejected
cart before
cart list returned
bad content-type rejected
bad listing rejected
cross-site origin rejected
cart after add
cart after remove
watchlist after add
watchlist after remove
```

- [ ] **Step 6: Browser smoke**

Open:

```text
http://localhost:3010/api/dev/preview-auth?mode=on&next=/marketplace
```

Then verify:

- Marketplace header shows `YNOT Marketplace`.
- Cart badge is visible when cart count is greater than zero.
- Listing page `Add to cart` changes visible state.
- Cart drawer opens and lists the added listing.
- `View cart` opens `/marketplace/cart`.
- Removing an item updates card list and cart badge.
- Watch listing updates watchlist badge or watchlist page state.
- No UI says `Customer Bag` for marketplace cart.
- No UI says `YNOTT` in new marketplace header/actions.

- [ ] **Step 7: Full marketplace verification**

Run:

```bash
cd Website
npm run verify:marketplace
npm run verify:marketplace-customer-cart-sql
npm run test:marketplace-customer-cart
npm run typecheck
git diff --check
```

Expected: all commands exit with code `0`.

- [ ] **Step 8: Commit**

```bash
git add Website/package.json Website/tools/verification/verify-marketplace-hardening.mjs Website/tools/verification/verify-marketplace-doc-traceability.mjs Website/tools/verification/verify-marketplace-customer-cart-sql.mjs docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md
git commit -m "Verify customer cart RPC and UI contracts

Constraint: Customer cart completion needs command, API, and browser evidence
Rejected: Claiming cart fixed from static tests only | the user-reported failure is an interaction failure
Confidence: high
Scope-risk: narrow
Directive: Final marketplace cart reports must include add, list, remove, badge, and drawer evidence
Tested: npm run verify:marketplace; npm run verify:marketplace-customer-cart-sql; npm run test:marketplace-customer-cart; npm run typecheck; git diff --check; localhost cart add/list browser smoke
Not-tested: Production migration apply and production Cloudflare route smoke"
```

---

## Acceptance Criteria

- Cart/watchlist tables continue to exist in the separate Marketplace Supabase migration stream.
- Cart/watchlist live code uses RPCs, not direct `.from("marketplace_cart_items")` or `.from("marketplace_watchlist_items")`.
- The document includes a button-to-API/RPC/database wiring matrix for header buttons, listing actions, drawer actions, cart page actions, and watchlist actions.
- Every customer cart/watchlist RPC has a table contract covering reads, writes, locks/idempotency, and public response shape.
- Customer cart, watchlist, and summary routes use a buyer-safe marketplace access helper, not a permanent owner-only/admin-only guard.
- Admin and seller-management routes keep owner/admin protection.
- Cart/watchlist mutation routes validate JSON content type, UUID listing IDs, quantity, and idempotency metadata before service-role RPC calls.
- Cross-site mutation attempts are rejected by the same-origin mutation guard and verified in API smoke.
- SQL migration verification runs through `verify:marketplace-customer-cart-sql`. If local Supabase execution is unavailable, the verifier prints an explicit skip reason and static SQL checks still pass.
- `GET /api/marketplace/cart/summary` returns public-safe cart/watchlist counts without full cart rows.
- `GET /api/marketplace/cart` returns both `cart` and `summary`.
- `POST /api/marketplace/cart/items` returns mutation result and updated `summary`.
- `DELETE /api/marketplace/cart/items/[listingId]` returns mutation result and updated `summary`.
- Watchlist routes mirror the same summary behavior.
- Listing detail `Add to cart` visibly updates the customer cart count and opens the drawer.
- The mini-cart drawer shows the current customer cart contents.
- `/marketplace/cart` still works as a full cart page.
- Header copy uses `YNOT`, not `YNOTT`.
- No cart response or UI payload exposes private buyer/seller account IDs, contact info, payout fields, idempotency rows, idempotency keys, request hashes, or admin notes.
- No cart/watchlist response exposes raw `snapshot_payload` or `snapshotPayload`; only explicit allowlisted display metadata is allowed.
- UI renders generic user-safe error copy and never renders raw API, SQL, or stack error text.
- Cart/watchlist images are loaded only from allowlisted marketplace storage/CDN URLs.
- `npm run test:marketplace-customer-cart`, `npm run verify:marketplace-customer-cart-sql`, `npm run verify:marketplace`, `npm run typecheck`, and `git diff --check` pass.

## Self-Review

**Spec coverage:**

- Frontend UX: Tasks 5 and 6 add header badges, drawer, listing feedback, cart page copy, and watchlist feedback.
- Backend/RPC: The Backend Design section documents the UI button -> API route -> module function -> RPC -> table chain, and Tasks 2, 3, and 4 move cart/watchlist to that RPC-backed contract.
- Performance: SQL indexes, payload caps, summary RPC, SQL execution verification, and no N+1 listing hydration are specified in the Performance Plan and Tasks 2 and 7.
- Security: Buyer-safe customer access, separate admin/owner access, same-origin/API guards, route input validation, service-role-only RPCs, idempotency, audit events, private-field exclusions, raw snapshot-payload exclusion, user-safe errors, image URL allowlisting, RLS grants, and hardening checks are specified in the Security Plan and Tasks 2, 4, and 7.
- Architecture: The Marketplace Cart module has a clear interface, one seam, two adapters, and better locality than the current direct table implementation.
- Existing marketplace direction: ADR-0003 is preserved by using `Database/marketplace-supabase`.
- Verification: Task 7 includes static, API, browser, typecheck, and full marketplace verification.

**Placeholder scan:** The plan contains no placeholder markers, unnamed validation step, or future-only placeholder.

**Type consistency:** `Marketplace Cart`, `Marketplace Watchlist`, `Marketplace Cart Summary`, `MarketplaceCustomerCartState`, `MarketplaceCartSummary`, and RPC names are consistent across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md`.

Recommended execution option: **Subagent-Driven** with one worker for DB/RPCs, one worker for TypeScript API adapter, and one worker for frontend cart UI, followed by a verifier pass.

Alternative execution option: **Inline Execution** in this session using `superpower-executing-plans`, completing tasks sequentially with verification after each task.
