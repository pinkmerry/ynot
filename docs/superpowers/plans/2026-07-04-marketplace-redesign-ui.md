# Marketplace Redesign Implementation Plan — Part 2: Frontend (Customer + Admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Prerequisite: [Part 1](./2026-07-04-marketplace-redesign.md) (migrations + API) is merged. Part 1 §1 lists the design source files and the prototype fictions to correct; Part 1 §3 is the authoritative button → endpoint map — every handler below must match it. [Part 3](./2026-07-04-marketplace-redesign-architecture.md) defines the architecture, security, and performance rules that bind every task here; its hardening tasks (signed proof URLs, cache headers, font self-hosting, modal code-splitting) interleave with this file as noted.

**Goal:** Rebuild the customer marketplace pages and the admin marketplace console to match the Claude Design prototype pixel-for-pixel, wired to the real API surface.

**Architecture:** Keep the existing page shells (`Website/src/app/(store)/marketplace/**`, `Website/src/app/admin/marketplace/**`) and server-side data loading; replace the rendered UI with a new `marketplace-ui` feature folder. Server components fetch via the existing `src/lib/marketplace/*` functions directly (no self-HTTP); client islands mutate via `/api/marketplace/**` fetches. One CSS file owns all `--mp-*` tokens.

**Tech Stack:** React server components + client islands, plain CSS (design tokens, no Tailwind — matches prototype classes), existing `node --test` architecture guards, Playwright/preview screenshots for visual verification.

---

## File structure (locked before tasks)

```
Website/src/features/marketplace-ui/
├── theme/marketplace-theme.css     # ported --mp-* tokens + mp-*/mpa-* classes
├── shared/MpIcon.tsx               # icon set from marketplace-shared.jsx
├── shared/MpPrimitives.tsx         # MpBadge, MpPanel, MpBtn, MpChip, MpEmpty, MpSteps, MpToasts
├── shared/money.ts                 # satangToThb display helpers (single source)
├── browse/BrowsePage.tsx           # server: market tabs, rail, grid
├── browse/FilterRail.tsx           # client: checkboxes/sort → router.push(searchParams)
├── browse/AlertButton.tsx          # client: POST /api/marketplace/alerts
├── product/ProductDetail.tsx       # server: art, stats, listings, similar
├── product/GradeTabs.tsx           # client: grade filter state
├── product/PriceHistoryPanel.tsx   # client: chart + range + latest sales
├── product/ReportListingButton.tsx # client: POST listing report
├── checkout/CheckoutFlow.tsx       # client: pending order → pay → slip → done
├── checkout/SlipUploader.tsx       # client: shared with top-up restyle
├── orders/OrdersPage.tsx           # server shell + tabs
├── orders/OrderTimeline.tsx        # client: role-aware steps, dispute button
├── orders/ListingsTab.tsx          # client: submissions list + actions
├── sell/SellForm.tsx               # client: full form + payout preview
├── shell/MarketTopbar.tsx          # server + client drawer
├── shell/MyPageDrawer.tsx          # client
└── admin/                          # AdminShell, Overview, OrdersEscrow, VerifyQueue,
                                    # Moderation, Disputes, Payouts, OfficialStock,
                                    # FeesSettings, modals/{OrderDetail,Slip,Compare,Stock}Modal.tsx
```

Rules: one responsibility per file, < 400 lines each; port styling from `marketplace-theme.css` (prototype) into `theme/marketplace-theme.css` with classes as-is (`mp-btn`, `mp-panel`, `mpa-table`…), imported once from `(store)/marketplace/layout.tsx` and `admin/marketplace/layout.tsx`.

## Global wiring rules (apply to every task)

- Money: all API values are **satang integers**; display via `shared/money.ts` `formatThb(satang)`. Fee lines come from server responses (payout-preview, pending order, money policy) — never a literal `0.06` or `60`.
- Mutations: `fetch("/api/marketplace/…", { method, headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body })`, then check `res.ok` and the JSON `ok` field; on failure show the returned `error` string in an `mp-alert mp-alert-rose`. (Confirm the exact idempotency header name in `src/lib/marketplace/mutation-guard.ts` before first use and reuse the constant everywhere.)
- Every "isn't part of this prototype" dead control from the design gets **removed**, not stubbed (Part 1 §6.4).
- Copy visual details (spacing, radii, badge palettes, hover states) from the prototype CSS — the theme file is the spec; do not eyeball.
- Existing pages keep their URLs; no route renames. Cart/watchlist pages keep working: restyle their surfaces with the new tokens but do not change their logic.

## Task 1: Theme + shared primitives

**Files:** create `theme/marketplace-theme.css`, `shared/MpIcon.tsx`, `shared/MpPrimitives.tsx`, `shared/money.ts`; modify `(store)/marketplace/layout.tsx`, `admin/marketplace/layout.tsx` (import CSS). Test: `Website/scripts/test-marketplace-ui-foundation.mjs` (+ script `test:marketplace-ui-foundation`).

- [ ] **Step 1: Failing test** (same skeleton as Part 1 tests) asserting: theme file exists and contains `--mp-green`, `--mp-ink`, `--mp-paper`, `.mp-btn`, `.mp-panel`, `.mpa-table`; `money.ts` exports `formatThb` and contains `/ 100`; `MpPrimitives.tsx` exports `MpBadge`, `MpBtn`, `MpPanel`, `MpChip`, `MpEmpty`, `MpSteps`, `MpToasts`; both layouts import `marketplace-theme.css`. Run → FAIL.
- [ ] **Step 2: Port the CSS** — copy `/Users/pinkmerry/Downloads/ynott/project/marketplace-theme.css` (482 lines) verbatim into `theme/marketplace-theme.css`; append the two keyframes from the prototype HTML `<style>` (`mpToastIn`, `mpSpin`) and the page background rules scoped to `.mp-root`.
- [ ] **Step 3: Port icons** — `MpIcon.tsx` is a TS port of `MPIcon` (`marketplace-shared.jsx:7-39`): same `name` switch, `interface MpIconProps { name: string; size?: number } & SVGProps`.
- [ ] **Step 4: Primitives** — implement in `MpPrimitives.tsx`, matching prototype classes:

```tsx
export function MpBadge({ kind, children }: { kind: "official" | "community" | "graded" | "raw" | "sold"; children: React.ReactNode }) {
  return <span className={`mp-badge mp-badge-${kind}`}>{children}</span>;
}
export function MpBtn({ variant, size, ...rest }: { variant?: "primary" | "green"; size?: "lg" | "sm" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["mp-btn", variant && `mp-btn-${variant}`, size === "lg" && "mp-btn-lg", size === "sm" && "mpa-btn-sm"].filter(Boolean).join(" ");
  return <button {...rest} className={cls} />;
}
```
plus `MpPanel` (`mp-panel` div), `MpChip` (`mp-chip`/`active`), `MpEmpty` (glyph + title + hint, `mp-empty`), `MpSteps` (3-step header, `mp-steps`, from `marketplace-proto-2.jsx:239-245`), `MpToasts` (fixed bottom stack from `marketplace-proto-1.jsx:48-58` + a `useToasts()` hook returning `{toasts, toast}`).
- [ ] **Step 5:** `money.ts`:

```ts
export function formatThb(satang: number): string {
  return "฿" + Math.round(satang / 100).toLocaleString();
}
export function formatNumber(n: number): string {
  return Number(n).toLocaleString();
}
```
- [ ] **Step 6:** Run `npm run test:marketplace-ui-foundation && npm run typecheck` → PASS. Commit: `git commit -m "feat: add marketplace redesign theme and shared primitives"`.

## Task 2: Topbar + My Page drawer

**Files:** create `shell/MarketTopbar.tsx`, `shell/MyPageDrawer.tsx`; modify `(store)/marketplace/layout.tsx` to render the topbar above `{children}` (replacing the current marketplace header slot in `MarketplaceExperience` usage — keep `MarketplaceCartProvider`/cart drawer mounted).

- [ ] **Step 1:** Port `ProtoTopbar` + `MyPageDrawer` (`marketplace-proto-1.jsx:61-152`) with real wiring per Part 1 §3: nav links (`/`, `/ynot`, `/marketplace`), brand link, admin link rendered only when the server passes `isAdmin` (layout already resolves `resolveAdminSession` — thread it through as a prop), coin pill from the dashboard slice balance, avatar opens the drawer. Drawer entries: "My buying & selling" → `/marketplace/orders` (+ pending-action badge count from `GET /api/marketplace/bag/summary` fields `pendingPaymentOrders + sellerSubmissions`), Wallet → `/wallet`, top-up `+` → `/wallet`, Log out → existing signout form action used by the current shell (find it in `src/features/ynot/components.tsx` and reuse). Remove bell + dead items.
- [ ] **Step 2:** Verify in dev: `npm run dev`, open `http://localhost:3000/marketplace` — topbar renders, drawer opens/closes, links navigate.
- [ ] **Step 3:** `npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace redesign topbar and account drawer"`.

## Task 3: Browse page

**Files:** create `browse/BrowsePage.tsx`, `browse/FilterRail.tsx`, `browse/AlertButton.tsx`; modify `(store)/marketplace/page.tsx` to render `BrowsePage` with its already-loaded `MarketplaceProductBrowsePage` + filter-count data (all data loading in that file stays untouched).

- [ ] **Step 1:** `BrowsePage` (server): heading block, market tabs, grid — port `ProtoBrowse` (`marketplace-proto-1.jsx:163-296`). Market tabs are `<Link href="/marketplace?source=official_shop">` / `?source=user_seller` with counts from `listMarketplaceProductBrowseFilterCounts` results; active tab from the query plan `source`. Cards render real product fields (title, set, condition/grade badge, `formatThb(lowest_price_satang)`, official vs community badge by listing source) and link to `/marketplace/products/[productSlug]`. "Sell a card" button (community tab only) links `/marketplace/seller`.
- [ ] **Step 2:** `FilterRail` (client): search input, series and condition checkboxes with counts, sort select, clear button. State lives in the URL: handlers build `URLSearchParams` (`q`, `grade`, `condition`, `sort`, `source`) and `router.push`. Map checkboxes to the query-plan values the backend already understands (see `(store)/marketplace/page.tsx` `selectedMarketplaceFilter`/`selectedMarketplaceSort` for the legal values; extend that mapping rather than inventing params).
- [ ] **Step 3:** `AlertButton` (client): empty-state "Notify me when listed" → `POST /api/marketplace/alerts` `{productId: null, query: <current q>}`? — **No.** Alerts are product-scoped (Part 1 Task 3). In the browse empty state render it only when the query plan has a `q` that resolved zero results **and** hide if signed out; clicking with no product context routes to a toast explaining alerts are set from a card page. On the product sold page (Task 4) it subscribes for real. Keep this button as secondary: `Clear filters` primary.
- [ ] **Step 4:** Manual check in dev: tab switch changes `source` param and result set; each checkbox/sort updates results server-side; clear resets.
- [ ] **Step 5:** `npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace browse redesign with market tabs and filter rail"`.

## Task 4: Product detail

**Files:** create `product/ProductDetail.tsx`, `product/GradeTabs.tsx`, `product/PriceHistoryPanel.tsx`, `product/ReportListingButton.tsx`; modify `(store)/marketplace/products/[productSlug]/page.tsx` to render `ProductDetail` with its existing loaded data (`MarketplaceProductPage.tsx` shows what the page currently loads — reuse the same lib calls: product detail read model, listings, price history).

- [ ] **Step 1:** `ProductDetail` (server): breadcrumb, art + thumbs (real photos from listing snapshots — reuse `MarketplaceListingGallery` internals), spec grid, stats strip. Stats derived server-side: `lastSale = priceHistory[0]`, `avg90 = mean(priceHistory where sold_at >= now-90d)`, `lowestAsk = lowest_price_satang`, `salesCount = priceHistory.length` — all through `formatThb`.
- [ ] **Step 2:** `GradeTabs` + listing rows (port `marketplace-proto-2.jsx:79-121`): client component receiving the listings array; group key = `grade_value ?? condition`; "All" tab plus one per group with `count` and `from` price; rows sorted price-asc, official rows pinned with `mp-lrow pinned` + official badge; **Buy** button = `<Link href={`/marketplace/listings/${row.listing_id}`}>` (checkout starts on the listing page — Task 5).
- [ ] **Step 3:** `PriceHistoryPanel` (client): receives price-history rows; range chips 3M/6M/1Y filter rows by `sold_at` client-side; grade badge follows `GradeTabs` selection (lift selection state to `ProductDetail` client wrapper); SVG line chart = port of `MPPriceChart` (`marketplace-pages-4.jsx:72-94`) but with points computed from real weekly medians (`Math.min/max` scaled into the 600×190 viewBox); latest-sales table = port of `MPSalesTable` with real rows (`sold_at`, grade badge, `formatThb`, up/down icon vs previous row).
- [ ] **Step 4:** Sold/empty state (`marketplace-proto-2.jsx:65-76`): when no active listings, render the sold panel; "Alert me on the next one" → `AlertButton` doing `POST /api/marketplace/alerts` `{productId}` (201/200 → toast "Alert saved"; 401 → link to login). "Browse similar" → `/marketplace`.
- [ ] **Step 5:** `ReportListingButton` under the listing rows: small `mp-small` link "Report a problem with a listing" opening an inline select (reason codes from Part 1 Task 2: `fake_or_cert_mismatch`, `stolen_photos`, `wrong_item`, `pricing_abuse`, `other`) + optional note → `POST /api/marketplace/listings/[listingId]/report` → toast "Reported — our team will review".
- [ ] **Step 6:** Similar cards strip: server-side `listMarketplaceProductBrowsePage` query for same set/series, exclude current product, first 4.
- [ ] **Step 7:** Dev check: grade tab filters rows and re-badges the chart; buy navigates; report round-trips (verify row lands in DB via admin route once Task 9 ships).
- [ ] **Step 8:** `npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace product detail redesign"`.

## Task 5: Checkout flow

**Files:** create `checkout/CheckoutFlow.tsx`, `checkout/SlipUploader.tsx`; modify `(store)/marketplace/listings/[listingId]/page.tsx` to render the new flow (replacing the visual layer of `MarketplaceCheckoutClient` / `MarketplacePaymentProofClient` — read both first; **reuse their existing fetch logic wholesale**, restyle around it).

- [ ] **Step 1:** Read `MarketplaceCheckoutClient.tsx` and `MarketplacePaymentProofClient.tsx` end-to-end. List which endpoints/params they call (pending-order create with `listingId`/`shippingAddressId`/`addressConfirmed`, payment-proof multipart, release). The new flow must call the identical contracts.
- [ ] **Step 2:** `CheckoutFlow` states, in the **backend's order** (Part 1 §1 fiction #3). Ship-only per Part 1 §6.1 — do not port the prototype's bag/ship delivery chooser (`marketplace-proto-2.jsx:271-287`); render a single delivery block (confirmed address + server shipping fee line). States: `review` (item card + address confirm + server-quoted totals) → `pay` (pending order created; bank/PromptPay chips + instructions from the payment-instructions payload; copy-to-clipboard on account number with toast) → `slip` (SlipUploader) → `done` (navigate `/marketplace/orders/[orderId]`). Step header via `MpSteps` (labels: Review / Pay by transfer / Order placed). Totals rendered only from the pending-order response (`item`, `shipping_fee_satang`, total). Back button releases the pending order (`POST .../release`) then returns to the product page.
- [ ] **Step 3:** `SlipUploader` (port upload/verify UI from `marketplace-proto-2.jsx:320-377`, minus the fake-slip generator): file input + drag-drop, preview, `Replace`; submit = single `POST .../payment-proof` multipart (`paymentProof` field); while pending show the gold "checking" alert; on `ok` show green verified panel with server-returned reference fields and enable "Place order" (navigate); on failure show rose panel with the server `error` and two actions — "Upload a different slip" (reset) and "Keep for manual review" (no call; explain the order stays in review, per Part 1 §3).
- [ ] **Step 4:** Dev check with a real image file (any PNG): duplicate-slip and mismatch paths exercised against the dev Slip2GO config; confirm order appears in `/marketplace/orders`.
- [ ] **Step 5:** `npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace checkout redesign with transfer + slip verification"`.

## Task 6: Orders — "My buying & selling"

**Files:** create `orders/OrdersPage.tsx`, `orders/OrderTimeline.tsx`, `orders/ListingsTab.tsx`; modify `(store)/marketplace/orders/page.tsx` and `orders/[orderId]/page.tsx`.

- [ ] **Step 1:** `OrdersPage` (server loads all three datasets per Part 1 §3: buyer orders + pending orders, seller sales, seller submissions; tab from `?tab=` search param): chips row (`I'm buying · N`, `I'm selling · sold · N`, `My listings · N`) + "Sell a card" and "Back to market" buttons — port `marketplace-proto-5.jsx:140-186`.
- [ ] **Step 2:** `OrderTimeline` (port `orderSteps`/`OrderTimeline`, `marketplace-proto-5.jsx:10-75`): map real `payment_state`/`fulfilment_state` values (enumerate them from `src/lib/marketplace/orders.ts` types before coding; write the mapping as a single exported `orderStepIndex(order): number` with a unit-style test in `scripts/test-marketplace-ui-orders-mapping.mjs` — add script `test:marketplace-ui-orders-mapping`, assert e.g. `payment_submitted → 0`, `paid → 1`, delivered/completed → last). Buyer rows expand to timeline + dispute affordance: within the policy dispute window after delivery show "Report a problem" → `POST /api/marketplace/orders/[orderId]/dispute` `{reason}` (textarea, min 10 chars) → toast "Dispute opened — payout is frozen while we review".
- [ ] **Step 3:** Seller sales rows: same row shell with payout line (`Payout after fee` from the sale payload's payout fields — inspect `listSellerSales` return shape; render its actual net amount, never compute a fee client-side). "Mark as shipped" (when awaiting handoff) → `POST /api/marketplace/seller/submissions/[submissionId]/handoff` → refresh.
- [ ] **Step 4:** `ListingsTab` — submission rows with status badges (map submission statuses per `src/app/admin/marketplace/page.tsx:sellerSubmissionStatus` groupings to the design's three badges: `listed→Live on market`, pre-intake → `Ship to YNOTT to go live`, `sold→Sold`); actions per Part 1 §3: Edit (link `/marketplace/seller?submission=ID`), Unlist (`POST .../cancel` with confirm dialog), Shipping address (expand intake instructions from the submission payload).
- [ ] **Step 5:** Order confirmation view on `orders/[orderId]` (fresh from checkout): port `ProtoOrderConfirm` (`marketplace-proto-5.jsx:189-213`) with real order code/total/timeline; buttons Track in Orders / Back to marketplace.
- [ ] **Step 6:** Run `npm run test:marketplace-ui-orders-mapping && npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace orders redesign with buyer/seller/listings tabs"`.

## Task 7: Sell a card

**Files:** create `sell/SellForm.tsx`; modify `(store)/marketplace/seller/page.tsx` (keep its data loading: seller session, terms, submissions; read `MarketplaceSellerClient.tsx` first and reuse its fetch/session logic).

- [ ] **Step 1:** Terms gate: if seller session says terms not accepted, render the terms panel with accept → `POST /api/marketplace/seller/terms` (reuse the exact call from `MarketplaceSellerClient`).
- [ ] **Step 2:** Port the form (`marketplace-proto-3.jsx:93-265`). "Fill from cert" is **cut** (Part 1 §6.2) — skip the cert-autofill button, its handler, and the gold hint banner; keep the plain cert-number input for graded cards. Sections: photos panel (SellUploader port — files kept client-side until submit), identity grid (options from `src/features/ynot/card-catalog-metadata.ts` exports: `catalogCategoryOptions`, `cardLanguageOptions`, `cardConditionOptions`, `gradingServiceOptions`, `cardGradeOptions`, `cardReleaseYearOptions` — do **not** redeclare the arrays), condition segment, grader/grade/cert when graded, price input.
- [ ] **Step 3:** Live payout preview: debounce 400ms on price change → `POST /api/marketplace/seller/payout-preview` `{askingPriceSatang: thb * 100}` → render server `fee`/`net` lines with the server's fee label (the seeded policy is 10%, not the design's 6%).
- [ ] **Step 4:** Submit: build the `SELLER_SUBMISSION_FIELDS` payload (field mapping per Part 1 §3 Sell table; `variantSnapshot` = `{series, set, cardNumber, variant, print, releaseYear}` JSON), `POST /api/marketplace/seller/submissions` with `submitNow: true` → then `POST .../[submissionId]/photos` per photo (inspect that route first for its multipart field name) → toast + redirect `/marketplace/orders?tab=listings`. Edit mode (`?submission=ID`): prefill from `GET .../submissions/[id]`, save via `PATCH`.
- [ ] **Step 5:** Validation before enabling submit: ≥1 photo (create) / any photo state (edit), name non-empty, series picked, price > 0, grade picked when graded — button label logic per prototype (`Complete the form to list`).
- [ ] **Step 6:** Dev check: full create round-trip lands a submission visible in listings tab and in `/admin/marketplace`. `npm run typecheck` → PASS. Commit: `git commit -m "feat: marketplace sell-a-card redesign"`.

## Task 8: Top-up restyle

**Files:** modify the existing wallet top-up UI (locate the page rendering `TopUpTable`/top-up form — `grep -rn "TopUpTable\|top-up" Website/src/app` — and restyle it in place with `marketplace-ui` primitives + `SlipUploader`).

- [ ] **Step 1:** Port the layout of `marketplace-proto-4.jsx` onto the existing flow: package cards from `src/features/ynot/top-up-packages.ts` (render its real fields — verify whether bonuses exist there; Part 1 §6.5), method chips + instructions from the flow's existing payment-method data, slip upload reusing `SlipUploader` against the existing top-up slip endpoint (find it via the current top-up client component; do not invent a new one), summary panel with balance-after line.
- [ ] **Step 2:** Keep the `need` handoff: checkout/wallet callers may link with `?need=<coins>` → preselect the smallest covering package (prototype logic `marketplace-proto-4.jsx:32`).
- [ ] **Step 3:** Dev check + `npm run typecheck` → PASS. Commit: `git commit -m "feat: restyle wallet top-up to marketplace design"`.

## Task 9: Admin console

One task per screen, same rhythm each time (read the existing admin page/data first → port the design screen → wire per Part 1 §3 → dev check → typecheck → commit). All screens live inside a new `AdminShell` (port `marketplace-admin-1.jsx:9-56`: side nav with queue-count pills from `GET /api/marketplace/admin/queues` + Task-6 stats, "Back to marketplace" link) mounted from `admin/marketplace/layout.tsx`; each nav id is a route segment (`/admin/marketplace`, `/admin/marketplace/orders`, `/verify`, `/moderation`, `/disputes`, `/payouts`, `/stock`, `/settings` — create `page.tsx` per segment).

- [ ] **9a Overview** (`admin/Overview.tsx`): KPI strip + daily GMV bar chart from `GET /api/marketplace/admin/stats` (`dailyGmv` rows → bars, `formatThb` totals), pipeline bars from queue summary counts, "needs attention" list linking to sibling routes with real counts (report count, refund open, payment review, payouts due). Drop top-sellers/last-24h panels unless ops-snapshot already provides them (check `buildMarketplaceOpsSnapshot` — render only real data). Commit: `feat: admin marketplace overview redesign`.
- [ ] **9b Orders & escrow** (`admin/OrdersEscrow.tsx` + `modals/OrderDetailModal.tsx`, `modals/SlipModal.tsx`): table from `GET /api/marketplace/admin/orders`; filter chips map to `?state=` (All / in-escrow = paid-not-complete / needs-review = `payment_submitted` / completed); stage dots from `orderStepIndex` (Task 6 mapping, shared import). "Review slip" rows (payment_submitted) open `SlipModal` — proof image loads through the short-lived signed URL endpoint from Part 3 Task S1 (`GET /api/marketplace/admin/orders/[orderId]/payment-proof-url`; never a raw storage path) + approve → `POST /api/marketplace/admin/official-orders/[orderId]/payment` `{paymentState: "paid", adminNote}` (or the unified route if Part 1 Task 6 step 3 added one), reject → same route with the reject state value used by `recordOfficialPaymentResult` (read it for legal values). "Detail" opens `OrderDetailModal` (port `marketplace-admin-3.jsx:37-70`) with stage list + "Cancel & refund" → refund route per source (Part 1 §3). Commit: `feat: admin orders and escrow console`.
- [ ] **9c Verification queue** (`admin/VerifyQueue.tsx` + `modals/CompareModal.tsx`): rows = seller submissions in intake states (from ops-snapshot / submissions data used by `admin/marketplace/page.tsx`); "Verify card" opens `CompareModal` (port `marketplace-admin-3.jsx:101-148`: left seller photos from submission payload, right vault photos if present, 4-item checklist gating the action buttons); Pass → transition `inspection_passed` then `activate` (two sequential POSTs, per Part 1 §3); Fail → transition `inspection_failed`. Read the transition route's `allowedFields` + legal state strings from `src/lib/marketplace/seller-consignment.ts` before coding. Commit: `feat: admin verification queue redesign`.
- [ ] **9d Moderation** (`admin/Moderation.tsx`): table from `GET /api/marketplace/admin/reports`; "Review report" opens `CompareModal` in report mode; actions → `POST /api/marketplace/admin/reports/[reportId]/resolve` `{resolution: "unlisted"|"dismissed", resolutionNote}`. Commit: `feat: admin reported-listings queue`.
- [ ] **9e Disputes** (`admin/Disputes.tsx`): open refund requests (from queues/ops data + refund request rows — if no list route exists for refund requests, extend `GET /api/marketplace/admin/reports`-style listing inside Task 9 by adding `listMarketplaceRefundRequests` to `src/lib/marketplace/ops-hardening.ts` next to its existing `marketplace_refund_requests` select at line 156, plus a `GET /api/ynot/marketplace/admin/refunds/route.ts`); resolve buttons → `POST /api/marketplace/admin/refunds/[refundRequestId]/transition` with the legal transition fields (`REFUND_TRANSITION_FIELDS` — read it). Commit: `feat: admin disputes and refunds console`.
- [ ] **9f Payouts** (`admin/Payouts.tsx`): `GET /api/marketplace/admin/seller-payouts` table (gross/fee/net from real payout fields), releasable rows → "Release" (`POST .../release`) then "Mark transferred" (`POST .../paid`) — two explicit buttons, not the design's single one, matching the real two-step contract. Commit: `feat: admin seller payouts redesign`.
- [ ] **9g Official stock** (`admin/OfficialStock.tsx` + `modals/StockModal.tsx`): table from `GET /api/marketplace/admin/official-inventory`; Add/Edit/Restock open `StockModal` (port `marketplace-admin-3.jsx:151-260`, options from `card-catalog-metadata.ts`); save → `POST` (create) / `PATCH .../[inventoryId]` (edit) with the route's `allowedFields` (read the route first), then `POST .../publish` when qty > 0 and item unpublished. Commit: `feat: admin official stock editor redesign`.
- [ ] **9h Fees & settings** (`admin/FeesSettings.tsx`): `GET /api/marketplace/admin/money-policy` → rows for seller fee (bps → % display), buyer service fee, shipping fee (satang → ฿), payout hold days, dispute window days, auto-live toggle, Slip2GO toggle, note field; Save → `POST` with only changed fields; "Escrow release — Always on" static row. Reuse/replace `MarketplaceMoneyPolicyControls.tsx` logic. Commit: `feat: admin fees and settings with trust controls`.

## Task 10: Final verification

- [ ] `npm run typecheck && npm run lint`
- [ ] Full marketplace guard sweep: `npm run test:marketplace-foundation && npm run test:marketplace-api-contracts && npm run test:marketplace-checkout && npm run test:marketplace-payment && npm run test:marketplace-payout && npm run test:marketplace-ui-foundation && npm run test:marketplace-ui-orders-mapping`
- [ ] Visual pass at 320 / 768 / 1024 / 1440 px on: `/marketplace` (both tabs), a product page (active + sold state), listing checkout (pay + slip fail + slip ok), `/marketplace/orders` (all three tabs), `/marketplace/seller`, `/admin/marketplace` (all eight screens). Screenshot via the preview tooling; compare against the prototype rendering.
- [ ] Keyboard pass: filter rail, grade tabs, checkout steps, admin modals (Escape closes, focus trapped).
- [ ] Journey smoke on dev data: sell → intake → verify(pass) → live listing → buy → slip verify → order paid → payout release/paid; report → unlist; dispute open → refund.
- [ ] Part 3 gates: performance budget check (§P), security checklist (§S) — both must pass before merge.
- [ ] `npm run cf:build:marketplace` succeeds (production build for the marketplace worker).

## Self-review notes (already applied)

- Prototype's client-side-only behaviors (sample slip generator, fake Slip2OK results, hardcoded 6%/฿60, coins-priced marketplace) are explicitly corrected, not ported.
- Checkout step order follows the real pending-order-first contract; "Verify slip" and "upload" are one API call; "manual review" is a state, not an endpoint.
- Payouts use the real two-step release→paid contract instead of the design's single button.
- Every new endpoint referenced here is created in Part 1; every reused endpoint was verified to exist in the repo (Part 1 §3).
- Where a return shape wasn't verified during planning (seller sales payload, admin order proof-image field, refund transition fields, submission photo field name), the task's first step is to read that exact file — no invented field names are wired blind.
