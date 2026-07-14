# Marketplace Persistent Cart Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an authenticated customer's Marketplace cart visible and accurate from every Marketplace page by adding a persistent header trigger that opens the existing cart drawer.

**Architecture:** Preserve the existing server-seeded cart summary, public adapter routes, canonical YNOT Marketplace routes, service functions, and service-role-only Supabase RPCs. Add one small Client Component inside the server-rendered Marketplace topbar, move the existing cart provider high enough to supply that component, and refresh the existing summary after successful checkout state transitions so the persistent badge remains truthful.

**Tech Stack:** Next.js 16 App Router, React 19 Client/Server Components, TypeScript, existing Marketplace cart context, Node test runner source-contract tests, Supabase/Postgres RPC contract guards, Marketplace theme CSS, and Cloudflare/OpenNext verification.

---

## Scope Check

This is one coherent customer-cart discoverability change. The header trigger and checkout-summary synchronization both serve the same invariant: the cart count visible throughout Marketplace must reflect the customer's current persisted cart.

In scope:

- Persistent authenticated cart icon between the coin balance and profile avatar.
- Conditional count badge sourced from the existing `MarketplaceCartProvider` summary.
- Existing cart drawer opened by the new trigger.
- Responsive header behavior that keeps cart and profile controls visible on narrow screens.
- Non-blocking cart-summary refresh after successful checkout creation or cancellation/release.
- Regression protection for the existing API, service, RPC, checkout, and privacy contracts.

Out of scope:

- No new cart API endpoint.
- No changes to canonical or public adapter route request/response contracts.
- No changes to `cart-watchlist.ts` RPC names, arguments, or normalization.
- No Supabase table, function, grant, RLS, or migration change.
- No changes to checkout totals, inventory locks, payment handling, idempotency, or order state transitions.
- No cart icon outside `/marketplace/*` routes.

## Current-State Evidence

- `Website/src/app/(store)/marketplace/layout.tsx` already loads `initialSummary` with `getMarketplaceCustomerCartSummary()` alongside wallet and bag data in one `Promise.all`.
- `Website/src/features/ynot/MarketplaceCartProvider.tsx` already owns `summary.cartCount`, `drawerOpen`, `openCartDrawer()`, `closeCartDrawer()`, and `refreshCartSummary()`.
- `Website/src/features/ynot/MarketplaceCartDrawer.tsx` already fetches the full cart only after opening and already supports removal, subtotal, and `View cart`.
- `Website/src/features/ynot/MarketplaceListingActionsClient.tsx` already applies the summary returned by add-to-cart and opens the drawer.
- `Website/src/features/marketplace-ui/shared/MpIcon.tsx` already supplies the `bag` icon.
- The current blocker is component placement: `MarketTopbar` is outside `MarketplaceCartProvider`, so a header Client Component cannot consume the shared cart context.
- Checkout creation removes selected persisted cart rows, and cancellation/expiry can restore them, but `CheckoutFlow` does not currently refresh the shared summary. A persistent badge would therefore become stale until the drawer is reopened.

Fresh baseline on `main` at `245fd76f`:

- `test:marketplace-ui-shell`: 14/14 passing.
- `test:marketplace-customer-cart`: 10/10 passing.
- `test:marketplace-cart-checkout`: 10/10 passing.
- `test:marketplace-multi-listing-checkout`: 22/22 passing.
- `verify:marketplace-customer-cart-sql`: all static function, grant, ownership, idempotency, audit, locking, limit, and payload checks passing; execution check skipped because the Supabase CLI is not installed.

## File Structure

Create:

- `Website/src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx` — the only new runtime component; consumes shared cart context and renders the accessible trigger/badge without making network calls.

Modify:

- `Website/src/app/(store)/marketplace/layout.tsx` — move the existing provider around the topbar, drawer, and route children while preserving all server reads.
- `Website/src/features/marketplace-ui/shell/MarketTopbar.tsx` — render the trigger for authenticated users and add stable layout class hooks.
- `Website/src/features/marketplace-ui/theme/marketplace-theme.css` — style the trigger/count and preserve cart/profile visibility on mobile.
- `Website/src/features/ynot/MarketplaceCartDrawer.tsx` — add the stable controlled-element ID referenced by the trigger.
- `Website/src/features/marketplace-ui/checkout/CheckoutFlow.tsx` — expose one optional, non-blocking notification callback after successful create/release operations; do not change fetch endpoints or payloads.
- `Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx` — pass the existing `refreshCartSummary` function to cart-page checkout flows.
- `Website/scripts/test-marketplace-ui-shell.mjs` — lock the trigger, provider, accessibility, no-fetch, server-boundary, and responsive-style contracts.
- `Website/scripts/test-marketplace-cart-checkout.mjs` — lock the post-checkout summary refresh while preserving every checkout endpoint and mutation contract.

Files explicitly verified but not modified:

- `Website/src/features/ynot/MarketplaceCartProvider.tsx`
- `Website/src/features/ynot/MarketplaceListingActionsClient.tsx`
- `Website/src/app/api/marketplace/cart/route.ts`
- `Website/src/app/api/marketplace/cart/summary/route.ts`
- `Website/src/app/api/marketplace/cart/items/route.ts`
- `Website/src/app/api/marketplace/cart/items/[listingId]/route.ts`
- `Website/src/app/api/ynot/marketplace/cart/route.ts`
- `Website/src/app/api/ynot/marketplace/cart/summary/route.ts`
- `Website/src/app/api/ynot/marketplace/cart/items/route.ts`
- `Website/src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts`
- `Website/src/lib/marketplace/cart-watchlist.ts`
- `Website/src/lib/marketplace/orders.ts`
- `Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql`
- `Database/marketplace-supabase/migrations/20260714110000_marketplace_multi_listing_checkout.sql`
- `Database/marketplace-supabase/migrations/20260714120000_marketplace_restore_cancelled_checkout_cart.sql`

## API/RPC Preservation Matrix

| User event | Browser/server action | Existing service/RPC path | Required result after this change |
| --- | --- | --- | --- |
| Marketplace layout first render | Server calls `getMarketplaceCustomerCartSummary(account, profileId)` | `marketplace_get_customer_cart_summary` | Provider starts with the real persisted count; the trigger makes no browser request on render. |
| Click persistent cart icon | Call `openCartDrawer()` only | No API/RPC call in the trigger | Existing drawer becomes visible. |
| Drawer opens | `GET /api/marketplace/cart` | Public alias -> canonical cart route -> `getMarketplaceCustomerCartState()` -> `marketplace_list_customer_cart` | Drawer rows and provider summary refresh from the existing public-safe response. |
| Add listing | `POST /api/marketplace/cart/items` with `{ listingId }` and `x-idempotency-key` | Public alias -> canonical mutation guard -> `addMarketplaceCartItem()` -> `marketplace_add_customer_cart_item` | Existing mutation-returned summary updates the badge, and the drawer opens. |
| Remove listing | `DELETE /api/marketplace/cart/items/[listingId]` with `x-idempotency-key` | Public alias -> canonical mutation guard -> `removeMarketplaceCartItem()` -> `marketplace_remove_customer_cart_item` | Existing mutation-returned summary updates the badge and subtotal. |
| Start one-item checkout | Existing official or user-seller checkout POST | Existing pending-order service/RPC | After the successful response, schedule one `GET /api/marketplace/cart/summary`; do not issue a second checkout mutation. |
| Start two/three-item official checkout | Existing group checkout POST | `createMultiListingCheckout()` -> `marketplace_create_multi_listing_checkout` | After the successful response, schedule one summary GET so selected, consumed cart rows disappear from the badge. |
| Cancel/release pending checkout | Existing release POST | Existing single/group release service/RPC dispatch | After successful release, schedule one summary GET so restored cart rows reappear in the badge. |

The summary refresh is secondary synchronization. If that GET fails, the already-successful checkout or release remains successful; the drawer's next existing full-cart GET repairs the UI state.

## Next.js Composition Constraint

Follow `Website/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, especially the current guidance on small client islands, interleaving Server Components as Client Component children, and context providers. Keep `MarketTopbar.tsx` server-rendered; the client provider may wrap it as a server-rendered child while `MarketplaceCartTrigger.tsx` consumes context as the small interactive island.

### Task 1: Lock the Persistent Header Contract With Failing Tests

**Files:**

- Modify: `Website/scripts/test-marketplace-ui-shell.mjs:13-194`
- Test: `Website/scripts/test-marketplace-ui-shell.mjs`

- [ ] **Step 1: Add trigger and drawer path constants**

Add these constants beside the existing shell paths:

```js
const CART_TRIGGER_PATH =
  "src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx";
const CART_DRAWER_PATH = "src/features/ynot/MarketplaceCartDrawer.tsx";
```

- [ ] **Step 2: Add the trigger behavior and no-network test**

Add this test after the existing coin-pill test:

```js
test("MarketplaceCartTrigger is a focused client island backed by shared cart state", () => {
  assert.ok(
    existsSync(path.join(appRoot, CART_TRIGGER_PATH)),
    "missing shell/MarketplaceCartTrigger.tsx",
  );
  const source = readApp(CART_TRIGGER_PATH);

  assert.match(source, /^"use client"/m, "cart trigger must be a client component");
  assert.match(source, /useMarketplaceCart/, "cart trigger must consume shared context");
  assert.match(source, /summary\.cartCount/, "cart trigger must render the shared count");
  assert.match(source, /drawerOpen/, "cart trigger must expose drawer state");
  assert.match(source, /openCartDrawer/, "cart trigger must open the shared drawer");
  assert.match(source, /summary\.cartCount\s*>\s*0/, "zero count must hide the badge");
  assert.match(source, /"99\+"/, "large visual counts must be capped");
  assert.match(source, /aria-controls="marketplace-cart-drawer"/);
  assert.match(source, /aria-expanded=\{drawerOpen\}/);
  assert.doesNotMatch(
    source,
    /fetch\(|\/api\/|\.rpc\(/,
    "cart trigger must not duplicate API or RPC access",
  );
});
```

- [ ] **Step 3: Add the server-boundary, provider-placement, accessibility, and CSS tests**

Add these tests before `escapeRegExp()`:

```js
test("MarketTopbar keeps the cart trigger authenticated and inside the shared provider", () => {
  const topbar = readApp(TOPBAR_PATH);
  const layout = readApp(LAYOUT_PATH);

  assert.doesNotMatch(topbar, /^"use client"/m, "MarketTopbar must remain server-rendered");
  assert.match(topbar, /import\s*{\s*MarketplaceCartTrigger\s*}/);
  assert.match(
    topbar,
    /isAuthenticated\s*\?\s*<MarketplaceCartTrigger\s*\/>\s*:\s*null/,
    "anonymous visitors must continue to use the existing login path",
  );

  const providerOpen = layout.indexOf("<MarketplaceCartProvider");
  const topbarRender = layout.indexOf("<MarketTopbar");
  const drawerRender = layout.indexOf("<MarketplaceCartDrawer");
  const routeChildren = layout.indexOf("{children}");
  const providerClose = layout.indexOf("</MarketplaceCartProvider>");

  assert.ok(providerOpen >= 0, "layout must render MarketplaceCartProvider");
  assert.ok(providerOpen < topbarRender, "provider must wrap MarketTopbar");
  assert.ok(topbarRender < drawerRender, "topbar must render before the cart drawer");
  assert.ok(drawerRender < routeChildren, "drawer must render before route children");
  assert.ok(routeChildren < providerClose, "provider must wrap all Marketplace children");
});

test("cart trigger controls the existing drawer and remains visible in responsive styles", () => {
  const drawer = readApp(CART_DRAWER_PATH);
  const css = readApp(THEME_CSS_PATH);

  assert.match(drawer, /id="marketplace-cart-drawer"/);
  for (const cls of [
    ".mp-topbar-nav",
    ".mp-topbar-actions",
    ".mp-cart-trigger",
    ".mp-cart-count",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(cls) + "[\\s,{.[]"), `missing class ${cls}`);
  }
  assert.match(css, /\.mp-cart-trigger:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.mp-topbar-actions\s*{[^}]*grid-column:\s*2/s);
});
```

- [ ] **Step 4: Run the shell test and confirm the new contract fails first**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-ui-shell
```

Expected: FAIL with `missing shell/MarketplaceCartTrigger.tsx` before runtime code exists.

### Task 2: Build the Context-Backed Cart Trigger

**Files:**

- Create: `Website/src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx`
- Test: `Website/scripts/test-marketplace-ui-shell.mjs`

- [ ] **Step 1: Create the focused Client Component**

Create the file with this complete implementation:

```tsx
"use client";

import { useMarketplaceCart } from "@/features/ynot/MarketplaceCartProvider";
import { MpIcon } from "../shared/MpIcon";

export function MarketplaceCartTrigger() {
  const { drawerOpen, openCartDrawer, summary } = useMarketplaceCart();
  const itemWord = summary.cartCount === 1 ? "item" : "items";
  const visibleCount = summary.cartCount > 99 ? "99+" : summary.cartCount;

  return (
    <button
      type="button"
      className="mp-icon-btn mp-cart-trigger"
      onClick={openCartDrawer}
      aria-label={`Cart, ${summary.cartCount} ${itemWord}`}
      aria-controls="marketplace-cart-drawer"
      aria-expanded={drawerOpen}
    >
      <MpIcon name="bag" size={16} aria-hidden="true" focusable="false" />
      {summary.cartCount > 0 ? (
        <span className="mp-cart-count" aria-hidden="true">
          {visibleCount}
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 2: Run the focused test to expose the remaining integration failures**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-ui-shell
```

Expected: the trigger component test passes; provider-placement, drawer-ID, and CSS tests still fail.

### Task 3: Integrate the Trigger Without Moving Backend Boundaries

**Files:**

- Modify: `Website/src/app/(store)/marketplace/layout.tsx:51-66`
- Modify: `Website/src/features/marketplace-ui/shell/MarketTopbar.tsx:1-84`
- Modify: `Website/src/features/ynot/MarketplaceCartDrawer.tsx:118-120`
- Test: `Website/scripts/test-marketplace-ui-shell.mjs`

- [ ] **Step 1: Move the existing provider around all Marketplace chrome**

Replace the return block in `layout.tsx` with:

```tsx
return (
  <div className={`mp-root ${jetbrainsMono.variable}`}>
    <MarketplaceCartProvider initialSummary={initialSummary}>
      <MarketTopbar
        isAdmin={!!admin}
        isAuthenticated={!!profile}
        displayName={profile?.displayName?.trim() || "YNOTT Customer"}
        balanceCoins={balanceCoins}
        pendingActionCount={pendingActionCount}
        signOutAction={signOutAction}
      />
      <MarketplaceCartDrawer />
      {children}
    </MarketplaceCartProvider>
  </div>
);
```

Do not move or duplicate `resolveCurrentProfile()`, `resolveAdminSession()`, `getMarketplaceAccountForProfile()`, `getMarketplaceCustomerCartSummary()`, `getYnotDashboardSlice()`, `getMarketplaceBagSummary()`, or the existing `Promise.all`.

- [ ] **Step 2: Render the trigger in the authenticated action cluster**

Add this import to `MarketTopbar.tsx`:

```tsx
import { MarketplaceCartTrigger } from "./MarketplaceCartTrigger";
```

Replace the left and right topbar wrapper class names and the authenticated action section with:

```tsx
<div className="mp-row mp-topbar-nav" style={{ gap: 26 }}>
```

```tsx
<div className="mp-row mp-topbar-actions" style={{ gap: 12 }}>
  {isAdmin ? (
    <Link href="/admin/marketplace" className="mp-admin-link">
      <MpIcon name="shield" size={11} /> Admin console
    </Link>
  ) : null}
  {isAuthenticated ? (
    <span className="mp-coin-pill">
      <span className="mp-coin" aria-hidden="true" />
      {formatNumber(balanceCoins)}
    </span>
  ) : null}
  {isAuthenticated ? <MarketplaceCartTrigger /> : null}
  {isAuthenticated ? (
    <MyPageTrigger
      displayName={displayName}
      avatarInitial={avatarInitial(displayName)}
      balanceCoins={balanceCoins}
      isAdmin={isAdmin}
      pendingActionCount={pendingActionCount}
      signOutAction={signOutAction}
    />
  ) : (
    <Link href="/login" className="mp-btn">
      Log in
    </Link>
  )}
</div>
```

Keep `MarketTopbar.tsx` free of a `"use client"` directive.

- [ ] **Step 3: Give the existing drawer a stable controlled-element ID**

Change the drawer opening element to:

```tsx
<aside
  id="marketplace-cart-drawer"
  className="marketplace-cart-drawer"
  aria-label="Cart"
>
```

Do not alter its existing `GET /api/marketplace/cart` effect or removal mutation.

### Task 4: Keep the Cart Visible on Desktop and Mobile

**Files:**

- Modify: `Website/src/features/marketplace-ui/theme/marketplace-theme.css:83-116`
- Modify: `Website/src/features/marketplace-ui/theme/marketplace-theme.css` responsive section
- Test: `Website/scripts/test-marketplace-ui-shell.mjs`

- [ ] **Step 1: Add trigger, badge, hover, and keyboard-focus styles**

Add after `.mp-icon-btn`:

```css
.mp-cart-trigger {
  position: relative;
  flex: 0 0 auto;
}
.mp-cart-trigger:hover {
  border-color: var(--mp-green);
  color: var(--mp-green-ink);
}
.mp-cart-trigger:focus-visible {
  outline: 2px solid var(--mp-gold);
  outline-offset: 2px;
}
.mp-cart-count {
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 2px solid var(--mp-bg);
  border-radius: 999px;
  background: var(--mp-green);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mp-mono);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}
```

- [ ] **Step 2: Add the narrow-screen topbar grid**

Add this responsive block after the topbar styles:

```css
@media (max-width: 760px) {
  .mp-root {
    padding: 18px 16px 32px;
  }
  .mp-topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }
  .mp-brand {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }
  .mp-topbar-actions {
    grid-column: 2;
    grid-row: 1;
  }
  .mp-topbar-nav {
    grid-column: 1 / -1;
    grid-row: 2;
    min-width: 0;
    overflow-x: auto;
  }
  .mp-nav {
    gap: 16px;
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
  .mp-admin-link,
  .mp-coin-pill {
    display: none;
  }
}
```

The hidden narrow-screen admin shortcut and coin balance remain available in the existing profile drawer. Cart and profile controls stay visible.

- [ ] **Step 3: Run shell and cart-context tests**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-ui-shell
npm run test:marketplace-customer-cart
npm run typecheck
```

Expected: all commands exit `0`; the shell suite includes the new trigger tests, and the customer-cart suite still proves RPC-only persistence and public-safe payloads.

- [ ] **Step 4: Commit the persistent trigger slice**

```bash
git add \
  'Website/src/app/(store)/marketplace/layout.tsx' \
  Website/src/features/marketplace-ui/shell/MarketTopbar.tsx \
  Website/src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx \
  Website/src/features/marketplace-ui/theme/marketplace-theme.css \
  Website/src/features/ynot/MarketplaceCartDrawer.tsx \
  Website/scripts/test-marketplace-ui-shell.mjs
git commit \
  -m "Keep the marketplace cart visible while customers browse" \
  -m "Constraint: Reuse the existing cart provider and drawer without adding backend calls.
Rejected: Direct cart-page navigation | It interrupts product browsing and hides the quick preview.
Confidence: high
Scope-risk: narrow
Directive: Keep MarketTopbar server-rendered and keep cart persistence behind existing RPC-backed services.
Tested: marketplace UI shell, customer cart, and TypeScript checks
Not-tested: production browser behavior before deployment
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

### Task 5: Lock Checkout-To-Badge Synchronization With a Failing Test

**Files:**

- Modify: `Website/scripts/test-marketplace-cart-checkout.mjs:30-142`
- Test: `Website/scripts/test-marketplace-cart-checkout.mjs`

- [ ] **Step 1: Add the synchronization contract test**

Add this test after `cart uses the shared checkout state machine with listingIds`:

```js
test("successful cart checkout transitions refresh the shared summary without duplicating mutations", () => {
  const cartSource = readApp(CART_CLIENT);
  const flowSource = readApp(CHECKOUT_FLOW);
  const createStart = flowSource.indexOf("async function createPendingOrder");
  const releaseStart = flowSource.indexOf("async function releaseOrder");
  const copyStart = flowSource.indexOf("function copyAccountNumber");
  const createSource = flowSource.slice(createStart, releaseStart);
  const releaseSource = flowSource.slice(releaseStart, copyStart);

  assert.match(
    flowSource,
    /onCartStateChanged\?:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>/,
  );
  assert.match(
    flowSource,
    /Promise\.resolve\(\)[\s\S]{0,120}\.then\(\(\) => onCartStateChanged\?\.\(\)\)[\s\S]{0,80}\.catch/,
  );
  assert.match(cartSource, /refreshCartSummary/);
  assert.equal(
    (cartSource.match(/onCartStateChanged=\{refreshCartSummary\}/g) ?? []).length,
    2,
    "single and grouped cart checkout must share the same summary refresh",
  );
  assert.match(createSource, /const body = await parseJson\(response\)/);
  assert.match(createSource, /notifyCartStateChanged\(\)/);
  assert.equal(
    (createSource.match(/fetch\(checkoutEndpoint/g) ?? []).length,
    1,
    "summary synchronization must not duplicate checkout POSTs",
  );
  assert.match(releaseSource, /await parseJson\(response\)/);
  assert.match(releaseSource, /notifyCartStateChanged\(\)/);
});
```

- [ ] **Step 2: Run the checkout test and confirm it fails first**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-cart-checkout
```

Expected: FAIL because `CheckoutFlowProps` does not yet expose `onCartStateChanged`.

### Task 6: Refresh the Badge After Successful Checkout State Changes

**Files:**

- Modify: `Website/src/features/marketplace-ui/checkout/CheckoutFlow.tsx:97-245`
- Modify: `Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx:131-321`
- Test: `Website/scripts/test-marketplace-cart-checkout.mjs`

- [ ] **Step 1: Add the optional non-blocking callback contract**

Change `CheckoutFlowProps` to:

```tsx
export type CheckoutFlowProps = CheckoutFlowItemProps & {
  checkoutEndpoint: string;
  shippingAddresses: CheckoutFlowAddress[];
  paymentInstructions: MarketplacePaymentInstructions;
  onCartStateChanged?: () => void | Promise<void>;
};
```

Change the props destructuring inside `CheckoutFlow` to:

```tsx
const {
  checkoutEndpoint,
  shippingAddresses,
  paymentInstructions,
  onCartStateChanged,
} = props;
```

Add this helper inside `CheckoutFlow`, immediately before `createPendingOrder()`:

```tsx
function notifyCartStateChanged() {
  void Promise.resolve()
    .then(() => onCartStateChanged?.())
    .catch(() => undefined);
}
```

- [ ] **Step 2: Notify only after successful create and release responses**

After the existing successful create state updates, add the callback:

```tsx
const body = await parseJson(response);
setOrder(body?.order ?? null);
setStep("pay");
notifyCartStateChanged();
```

After the existing successful release response, add the callback before resetting the UI:

```tsx
await parseJson(response);
notifyCartStateChanged();
toast("Order cancelled", "info");
setOrder(null);
setStep("review");
```

Do not call the callback in error branches. Do not change `checkoutEndpoint`, the release endpoint, request bodies, idempotency keys, or `parseJson()` behavior.

- [ ] **Step 3: Pass the existing provider refresh from the cart page only**

Change the provider destructuring in `MarketplaceCartWatchlistClient` to:

```tsx
const {
  refreshCartSummary,
  summary,
  setSummary,
  updateListingActionState,
} = useMarketplaceCart();
```

Add this prop to both `CheckoutFlow` instances rendered in cart mode:

```tsx
onCartStateChanged={refreshCartSummary}
```

Do not pass the callback from `MarketplaceListingDetailPage`; the prop remains optional so the existing one-listing detail checkout behavior is unchanged.

- [ ] **Step 4: Run checkout and RPC regression tests**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-cart-checkout
npm run test:marketplace-multi-listing-checkout
npm run test:marketplace-customer-cart
npm run verify:marketplace-customer-cart-sql
npm run typecheck
```

Expected: all commands exit `0`; checkout endpoints and RPC contracts remain unchanged, while the cart page now schedules one summary GET after successful create/release transitions.

- [ ] **Step 5: Commit the synchronization slice**

```bash
git add \
  Website/src/features/marketplace-ui/checkout/CheckoutFlow.tsx \
  Website/src/features/ynot/MarketplaceCartWatchlistClient.tsx \
  Website/scripts/test-marketplace-cart-checkout.mjs
git commit \
  -m "Keep the persistent cart count truthful through checkout" \
  -m "Constraint: Checkout and release API/RPC mutations must remain byte-for-byte unchanged.
Rejected: Optimistic count arithmetic | Database checkout and restore rules are the source of truth.
Confidence: high
Scope-risk: narrow
Directive: Treat summary refresh as secondary UI synchronization and never fail a successful order because it fails.
Tested: cart checkout, multi-listing checkout, customer cart RPC, SQL contract, and TypeScript checks
Not-tested: deployed browser network trace before release
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

### Task 7: Verify the Complete UI, API/RPC, and Checkout Flow

**Files:**

- Verify: `Website/src/app/(store)/marketplace/layout.tsx`
- Verify: `Website/src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx`
- Verify: `Website/src/features/marketplace-ui/checkout/CheckoutFlow.tsx`
- Verify: existing Marketplace API routes, services, tests, and SQL migration contracts listed above

- [ ] **Step 1: Run focused lint on every changed TypeScript/TSX file**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npx eslint \
  'src/app/(store)/marketplace/layout.tsx' \
  src/features/marketplace-ui/shell/MarketTopbar.tsx \
  src/features/marketplace-ui/shell/MarketplaceCartTrigger.tsx \
  src/features/marketplace-ui/checkout/CheckoutFlow.tsx \
  src/features/ynot/MarketplaceCartDrawer.tsx \
  src/features/ynot/MarketplaceCartWatchlistClient.tsx
```

Expected: exit `0` with no lint errors.

- [ ] **Step 2: Run the complete scoped regression gate**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run test:marketplace-ui-shell
npm run test:marketplace-ui-foundation
npm run test:marketplace-customer-cart
npm run test:marketplace-cart-checkout
npm run test:marketplace-multi-listing-checkout
npm run test:marketplace-one-account-flow
npm run verify:marketplace-customer-cart-sql
npm run typecheck
```

Expected: every command exits `0`; no public/private API route, RPC name, checkout payload, idempotency guard, database grant, or public payload contract regresses.

- [ ] **Step 3: Build the Cloudflare website target**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT/Website"
npm run cf:build:website
```

Expected: OpenNext Cloudflare build completes successfully and produces the website worker output without client/server boundary errors.

- [ ] **Step 4: Perform authenticated desktop browser verification**

Use the local/preview Marketplace with a test account and verify in this order:

1. Load `/marketplace`; confirm the icon is between coin balance and avatar.
2. Confirm the accessible name reports the exact count and the visible badge is absent at zero.
3. Click the icon; confirm only `GET /api/marketplace/cart` is issued and returns `200`.
4. Close the drawer, navigate to another Marketplace page, and confirm the icon remains visible with the same count.
5. Add one listing; confirm the existing add POST runs once, the drawer opens, and the badge updates from the mutation-returned summary.
6. Add two more official listings; confirm the badge reaches the persisted count and the full cart permits selecting up to three.
7. Remove one item; confirm the existing delete runs once and the badge/subtotal update from its returned summary.
8. Start a reversible checkout; confirm the existing checkout POST runs once, followed by one summary GET, and the badge drops by the persisted cart-row count.
9. Cancel/release the pending checkout; confirm the existing release POST runs once, followed by one summary GET, and restored cart rows reappear.
10. Open `/marketplace/cart`; confirm `Proceed to checkout`, official grouped checkout, and individual user-seller checkout behavior remain unchanged.

- [ ] **Step 5: Perform anonymous and mobile verification**

1. In an anonymous session, load `/marketplace`; confirm no cart trigger is shown and the existing `Log in` control remains.
2. At 760px and 390px widths, confirm the brand/actions row remains visible, navigation moves below it, and the cart/profile controls do not overflow.
3. At 390px, confirm coin/admin shortcuts are hidden from the topbar but still available through the profile drawer after login.
4. Navigate across browse, product, listing, cart, and orders pages; confirm the cart trigger remains present on every authenticated Marketplace route.

- [ ] **Step 6: Inspect the final diff and commit history**

Run:

```bash
cd "/Users/pinkmerry/Project X/YNOTT"
git status --short
git diff --check
git log -2 --format=fuller
```

Expected: no unstaged implementation files, `git diff --check` exits `0`, and the two focused Lore commits contain their verification and risk trailers.

## Completion Criteria

- Authenticated customers can see and open the cart from every Marketplace page.
- The trigger uses the existing provider and drawer; rendering/clicking it does not add a new backend endpoint or direct Supabase access.
- The badge updates after add, remove, checkout creation, and checkout release/cancellation.
- Summary refresh failure cannot change a successful checkout/release result into a failure.
- `MarketTopbar` remains a Server Component and the new interactive surface remains a small Client Component.
- Existing cart aliases, canonical routes, service functions, RPC signatures, grants, idempotency, locks, audit events, checkout endpoints, and public-safe payloads remain unchanged and pass their existing regression gates.
- Desktop, mobile, authenticated, and anonymous behavior are verified before completion is claimed.
