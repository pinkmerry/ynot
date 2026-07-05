# Marketplace Redesign Implementation Plan — Part 1: Contracts, Migrations, API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Part 2 (frontend tasks) lives in [2026-07-04-marketplace-redesign-ui.md](./2026-07-04-marketplace-redesign-ui.md). Execute Part 1 first — Part 2 consumes the endpoints added here.
> Part 3 (architecture, security, performance design + hardening tasks) lives in [2026-07-04-marketplace-redesign-architecture.md](./2026-07-04-marketplace-redesign-architecture.md) — its rules bind every task in Parts 1 and 2.

**Goal:** Implement the new Claude Design marketplace prototype (customer market + admin console) on top of the existing YNOTT marketplace backend, wiring every button to the real API/RPC surface and adding the missing database pieces via migrations.

**Architecture:** Next.js App Router app in `Website/` deployed as a dedicated Cloudflare worker (`wrangler.marketplace.jsonc`, routes `/marketplace*`, `/admin/marketplace*`, `/api/marketplace/*`). All marketplace API routes are thin wrappers in `Website/src/app/api/ynot/marketplace/**` (re-exported at `/api/marketplace/**`) that call server-only libs in `Website/src/lib/marketplace/*`, which call Postgres RPCs in a **separate Supabase project** whose migrations live in `Database/marketplace-supabase/migrations/`. Wallet top-up is on the main gacha Supabase project via `/api/ynot/wallet`.

**Tech Stack:** Next.js (App Router, server components + client islands), TypeScript, Supabase (two projects: core + marketplace), Slip2GO slip verification, `node --test` architecture tests in `Website/scripts/test-*.mjs`.

---

## 1. Design source (read these before any task)

Handoff bundle: `/Users/pinkmerry/Downloads/ynott/project/` — HTML/CSS/JS prototypes. Recreate visuals; do **not** copy prototype internals.

| File | Contents |
|---|---|
| `YNOTT Marketplace Prototype.html` | Entry point, fonts (JetBrains Mono + Helvetica Neue), page bg `#f7f5ee`, max-width 1360 |
| `marketplace-theme.css` | All `--mp-*` design tokens, `mp-btn/mp-panel/mp-badge/mp-card/...` classes, `mpa-*` admin classes |
| `marketplace-shared.jsx` | Icons (`MPIcon`), coin, formatters, listing card |
| `marketplace-proto-1.jsx` | Topbar, My Page drawer, Browse (market tabs + filter rail + empty state) |
| `marketplace-proto-2.jsx` | Product detail (grade tabs, seller rows, price history, latest sales), Checkout (transfer + slip verify) |
| `marketplace-proto-3.jsx` | Sell-a-card form (photos, identity, condition/grade/cert, price + fee preview) |
| `marketplace-proto-4.jsx` | Top-up coins (packages, transfer, slip verify) |
| `marketplace-proto-5.jsx` | Orders "My buying & selling" (buyer/seller/listings tabs, timelines), order confirmation |
| `marketplace-pages-4.jsx` | `MPPriceChart`, `MPSalesTable`, grade tabs (static variants) |
| `marketplace-admin-1.jsx` | Admin shell + nav, Overview (KPIs, GMV chart, pipeline, attention list), Moderation, Verification queue |
| `marketplace-admin-2.jsx` | Admin Orders & escrow, Payouts, Disputes, Official stock, Fees & settings |
| `marketplace-admin-3.jsx` | Admin modals: order detail, slip review, photo compare + checklist, stock editor |

**Prototype fictions to correct while implementing (do not copy):**
- "Slip2OK" → the real integration is **Slip2GO** (`Website/src/lib/slip2go/client.ts`, already wired into payment-proof upload).
- Hardcoded **6% seller fee** and **฿60 shipping** → real values come from the active money policy (currently seeded `seller_fee_bps=1000` = 10%, `shipping_fee_satang=15000` = ฿150). Always render server-returned numbers (`payout-preview`, pending-order totals). Never hardcode.
- Prototype checkout verifies the slip *before* "Place order". The real contract is the reverse: **create Pending Payment Order first** (server-calculated total + listing lock), then transfer + upload slip. UI order of steps must follow the real contract.
- Prototype "escrow" language → real model per `CONTEXT.md`: Pending Payment Order → paid Marketplace Order → Seller Payout released after milestone. Verification queue = **Consignment Intake** (seller ships to YNOTT *before* listing goes live), not post-sale verification.
- Coins vs THB: marketplace is **real-money THB** (satang integers). Coins exist only in the gacha wallet (top-up page).

## 2. Existing system map

- Customer pages: `Website/src/app/(store)/marketplace/{page,cart,watchlist,orders,orders/[orderId],products/[productSlug],listings/[listingId],seller,sellers/[id]}.tsx` — components in `Website/src/features/ynot/Marketplace*.tsx` + `components.tsx` (`MarketplaceExperience`).
- Admin pages: `Website/src/app/admin/marketplace/{page,orders/[orderId],listings/[listingId],seller-submissions/[submissionId]}.tsx`.
- Route guard pattern (copy for every new route): `resolveCurrentProfile` → `publicMarketplaceAccess`/`customerMarketplaceAccess`/`ownerOnlyMarketplaceAccess` → `enforceRateLimit` → lib call → `{ ok: true, request_id, ... }` / `marketplaceErrorResponse`. Mutations go through `prepareMarketplaceMutation` with `allowedFields` + idempotency hash.
- DB conventions (copy in every migration): `marketplace_`-prefixed tables, `check` constraints, `marketplace_touch_updated_at` trigger, `enable row level security` + `revoke all ... from public, anon, authenticated` + `grant ... to service_role`, `create or replace function public.marketplace_*` RPCs, idempotent (`if not exists` / `drop ... if exists`).
- Tests: static architecture tests `Website/scripts/test-marketplace-*.mjs` (node --test) that read migration SQL + source and assert patterns; each has a `package.json` script. `npm run check` cannot pass locally (env gates) — use targeted `npm run test:marketplace-*` + `npm run typecheck`.

## 3. Button → API inventory (the contract map)

Every interactive element in the design, mapped to the verified existing surface. **(NEW)** = added by this plan's tasks.

### Customer — Topbar & My Page drawer (`marketplace-proto-1.jsx:61-152`)
| Element | Wiring |
|---|---|
| Home / Y-Pack / Marketplace nav | Links: `/`, `/ynot` (existing shell nav), `/marketplace` |
| Admin console link (owner only) | Link `/admin/marketplace`; visibility from `resolveAdminSession` (server) |
| Coin pill | Balance from `getYnotDashboardSlice` (already passed to marketplace layout) |
| Bell | No backend — hide (do not ship a dead toast) |
| Avatar → drawer | Client drawer; "My buying & selling" → `/marketplace/orders`; Wallet → `/wallet`; Card history/Personal info → existing profile routes; Log out → existing auth signout |
| Drawer "+" top-up button | Link `/wallet` top-up section (`POST /api/ynot/wallet` flow) |

### Customer — Browse (`marketplace-proto-1.jsx:154-296`)
| Element | Wiring |
|---|---|
| Official / Community market tabs | `GET /api/marketplace/products?source=official_shop` / `source=user_seller` (server component reads searchParams via `marketplaceQueryPlanFromUrl`) |
| Search input | `q` search param |
| Series checkboxes (One Piece / Pokémon) | `q`-based series terms in the query plan (existing behavior in `(store)/marketplace/page.tsx:selectedMarketplaceFilter`); counts from `listMarketplaceProductBrowseFilterCounts` |
| Condition checkboxes (Graded/Raw/Sealed) | `grade` / `condition` query-plan params |
| Sort select | `sort=newest\|price_asc\|price_desc` (query plan also supports `popular`, `recommended`, `recent_sales`) |
| Clear filters | Link to `/marketplace?source=<current>` |
| Listing card click | Link `/marketplace/products/[productSlug]` |
| "Sell a card" | Link `/marketplace/seller` |
| Empty state "Notify me when listed" | **(NEW)** `POST /api/marketplace/alerts` (Task 5/8) |

### Customer — Product detail (`marketplace-proto-2.jsx:10-162`)
| Element | Wiring |
|---|---|
| Breadcrumb "Marketplace" | Link `/marketplace` |
| Grade tabs (All/PSA 10/…) | Client-side filter over `GET /api/marketplace/products/[productSlug]/listings` (each row has `grade_service`, `grade_value`, `item_price_satang`) |
| Buy button per seller row | Link `/marketplace/listings/[listingId]` checkout flow → `POST /api/marketplace/checkout/pending-orders` `{listingId, shippingAddressId, addressConfirmed}` (handles both `official_shop` and `user_seller` sources) |
| Stats (last sale / 90-day avg / lowest ask / sales count) | Derive from `GET /api/marketplace/products/[productSlug]` (detail read model, `lowest_price_satang`) + `.../price-history` (rows: `sold_at`, `item_price_satang`, `grade_service`, `grade_value`) |
| Price-history range 3M/6M/1Y + grade re-draw | `GET .../price-history?grade=…` — filter range client-side from returned `sold_at` |
| Latest sales "All N" | Same price-history payload, expanded list |
| Sold page "Alert me on the next one" | **(NEW)** `POST /api/marketplace/alerts` |
| "Report this listing" (add — supports admin Moderation screen) | **(NEW)** `POST /api/marketplace/listings/[listingId]/report` |
| Similar cards | `GET /api/marketplace/products?q=<same set>` (reuse browse read model) |

### Customer — Checkout (`marketplace-proto-2.jsx:198-400`)
| Element | Wiring |
|---|---|
| Enter checkout | `POST /api/marketplace/checkout/pending-orders` → returns order with server totals (item + shipping fee from money policy) |
| Deliver: "Keep in my bag" vs "Ship to me" | **Decided: ship-only (user, 2026-07-04).** Backend contract requires a shipping address (`assertMarketplaceCheckoutAddress`). Do not render the bag/ship chooser — render one delivery block: confirmed address + server-quoted shipping fee. |
| Bank / PromptPay chips + account details + copy | Render from `Website/src/lib/marketplace/payment-instructions.ts` (server-provided; never hardcode account numbers) |
| Slip upload / drag-drop / Replace | `POST /api/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof` (multipart field `paymentProof`; JPG/PNG/WEBP, magic-byte checked, Slip2GO-verified, dedup vs core + marketplace slips) |
| "Verify slip" button | Same call — upload **is** verification (single request). UI shows checking → verified/failed from response |
| Failure: "Upload a different slip" | Re-POST payment-proof with new file |
| Failure: "Send to manual review" | No extra call — failed Slip2GO proof already parks the order in `payment_submitted` for admin review; UI copies state from response |
| "Place order" | No separate call — order exists since checkout start. Button = navigate to `/marketplace/orders/[orderId]` confirmation once proof accepted |
| Expiry / abandon | `POST /api/marketplace/checkout/pending-orders/[pendingOrderId]/release` (cancel my pending order) |
| Back | Link to product page |

### Customer — Orders "My buying & selling" (`marketplace-proto-5.jsx`)
| Element | Wiring |
|---|---|
| "I'm buying" tab | `GET /api/marketplace/orders` (buyer orders) + `GET /api/marketplace/checkout/pending-orders` (unpaid) |
| Order row expand | `GET /api/marketplace/orders/[orderId]` |
| "I'm selling · sold" tab | `GET /api/marketplace/seller/sales` |
| "My listings" tab | `GET /api/marketplace/seller/submissions` (statuses map: draft/submitted/…​ → "Ship to YNOTT to go live"; `listed` → "Live"; `sold` → "Sold") |
| Seller "Mark as shipped" | `POST /api/marketplace/seller/submissions/[submissionId]/handoff` |
| "Get shipping label" | Out of scope — render intake address text from submission payload instead |
| "Edit listing" | Link `/marketplace/seller?submission=[submissionId]` → `PATCH /api/marketplace/seller/submissions/[submissionId]` (allowed while pre-intake) |
| "Unlist" | `POST /api/marketplace/seller/submissions/[submissionId]/cancel` |
| "Shipping address" (verifying) | Render intake instructions from `GET /api/marketplace/seller/submissions/[submissionId]` |
| Buyer dispute ("problem with this order") | **(NEW)** `POST /api/marketplace/orders/[orderId]/dispute` (Task 4/9) |
| Order confirm: "Track in Orders" / "Back to marketplace" | Links `/marketplace/orders`, `/marketplace` |

### Customer — Sell a card (`marketplace-proto-3.jsx`)
| Element | Wiring |
|---|---|
| First-visit seller gate | `GET /api/marketplace/seller/session` + `GET/POST /api/marketplace/seller/terms` (design omits this — required by backend before submissions) |
| Photo upload (≤10, cover, remove) | `POST /api/marketplace/seller/submissions/[submissionId]/photos` (after draft create) |
| "Fill from cert" | **Cut (user decision, 2026-07-04)** — do not port the button, the autofill handler, or any cert-lookup call into the seller flow |
| Live fee preview ("You receive") | `POST /api/marketplace/seller/payout-preview` `{askingPriceSatang}` — server computes fee from policy |
| "List for ฿X" | `POST /api/marketplace/seller/submissions` with `SELLER_SUBMISSION_FIELDS`: `itemType`, `titleSnapshot`, `conditionCode`, `conditionNotes`, `askingPriceSatang`, `gradeLabel`, `language`, `certNumber`, `variantSnapshot`, `referenceSnapshot`, `sellerNote`, `submitNow: true` (form's series/set/code/variant/print/year → `variantSnapshot`/`referenceSnapshot` JSON; option lists from `src/features/ynot/card-catalog-metadata.ts`) |
| "Save changes" (edit) | `PATCH /api/marketplace/seller/submissions/[submissionId]` |
| Cancel | Back link |

### Customer — Top up coins (`marketplace-proto-4.jsx`)
| Element | Wiring |
|---|---|
| Whole page | Restyle of the existing wallet top-up: packages from `src/features/ynot/top-up-packages.ts`, `POST /api/ynot/wallet` creates `top_up_requests` row, slip upload + Slip2GO verification per existing `YnotTopUp` flow (`src/features/ynot/types.ts:324`), admin fallback `/api/ynot/admin/top-ups`. **No new backend.** |

### Admin console (`marketplace-admin-1/2/3.jsx`)
| Screen / button | Wiring |
|---|---|
| Nav counts + Overview "needs attention" | `GET /api/marketplace/admin/queues` → `{paymentReviewCount, refundOpenCount, reconciliationOpenCount, payoutBlockedCount, providerEventOpenCount}` + **(NEW)** report/alert counts (Task 8) |
| Overview KPIs + GMV chart | **(NEW)** `GET /api/marketplace/admin/stats` (Task 4/9) + existing `buildMarketplaceOpsSnapshot` |
| Orders & escrow table + filter chips | **(NEW)** `GET /api/marketplace/admin/orders?state=…` (Task 9) — today only ops-snapshot slices exist |
| "Review slip" → approve | `POST /api/marketplace/admin/official-orders/[orderId]/payment` `{paymentState, providerReference, providerAmountSatang, providerCurrency, adminNote}` (route name is historical; `recordOfficialPaymentResult` — verify user-seller coverage in Task 9 step 1) |
| Order detail "Cancel & refund" | `POST /api/marketplace/admin/official-orders/[orderId]/refund`; user-seller refunds via `POST /api/marketplace/admin/refunds/[refundRequestId]/transition` |
| "Contact parties" | Out of scope — omit |
| Verification queue rows | `GET /api/marketplace/admin/queues` + ops-snapshot `sellerSubmissions`; detail page exists at `/admin/marketplace/seller-submissions/[submissionId]` |
| Compare modal "Pass" | `POST /api/marketplace/admin/seller-consignments/[submissionId]/transition` (`inspection_passed`) then `POST .../activate` (listing goes live) |
| Compare modal "Fail" | `POST .../transition` (`inspection_failed` → return to seller) |
| Reported listings + review modal | **(NEW)** `GET /api/marketplace/admin/reports`, `POST /api/marketplace/admin/reports/[reportId]/resolve` (`unlist` hides listing via existing `POST /api/marketplace/admin/official-listings/[listingId]/hide` semantics extended to user listings — Task 8) |
| Disputes "Refund buyer" / "Side with seller" | `POST /api/marketplace/admin/refunds/[refundRequestId]/transition` (existing states) |
| Payouts "Mark transferred" | `POST /api/marketplace/admin/seller-payouts/[payoutId]/release` then `POST .../paid` (list: `GET /api/marketplace/admin/seller-payouts`) |
| Official stock table + "Add stock"/"Edit"/"Restock" | `GET/POST /api/marketplace/admin/official-inventory`, `PATCH /api/marketplace/admin/official-inventory/[inventoryId]`, `POST .../publish`, `POST .../archive`; hide listing via `POST /api/marketplace/admin/official-listings/[listingId]/hide` |
| Fees & settings | `GET/POST /api/marketplace/admin/money-policy` — today: `sellerFeeBps`, `buyerServiceFeeBps`, `shippingFeeSatang`, `adminNote`. **(NEW)** `payoutHoldDays`, `disputeWindowDays`, `listingAutoLive`, `slipAutoVerify` (Tasks 1/6). "Escrow release: always on" row is static copy |
| Audit trail links | `GET /api/marketplace/admin/audit/[targetType]/[targetId]` |

## 4. Gap analysis → what needs migrations

Confirmed absent from `Database/marketplace-supabase/migrations/` and `src/lib/marketplace/` (grep: no `dispute`-named, no `report`, no `views`, no alerts):

1. **Money-policy trust controls** — payout hold days, dispute window days, listing auto-live, slip auto-verify (Task 1).
2. **Listing reports (moderation)** — table + report/list/resolve RPCs (Task 2).
3. **Product alerts ("notify me when listed")** — table + subscribe/unsubscribe/list RPCs (Task 3).
4. **Buyer dispute opening** — `marketplace_refund_requests` exists but only admin transition is exposed; need buyer-facing open-dispute RPC gated by the dispute window (Task 4).
5. **Admin order listing + daily GMV stats** — read-only RPCs (Task 4).

Cut from scope (see §6): listing view counters, deliver-to-bag, cert autofill, in-app messaging ("Contact parties"), notifications bell.

## 5. Tasks — Phase 1 (migrations) & Phase 2 (API)

Run all `npm run …` from `Website/`. All migrations go in `Database/marketplace-supabase/migrations/`. After each migration file: apply to the marketplace Supabase project the same way previous marketplace migrations were applied (Supabase MCP `apply_migration` against the **marketplace** project — confirm project ref with `list_projects` first; the gacha project is separate).

### Task 1: Money-policy trust controls (migration)

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260704120000_marketplace_money_policy_trust_controls.sql`
- Test: `Website/scripts/test-marketplace-money-policy-trust-controls.mjs`
- Modify: `Website/package.json` (add script)

- [ ] **Step 1: Write the failing architecture test**

```js
// Website/scripts/test-marketplace-money-policy-trust-controls.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migration = readFileSync(
  path.join(
    repoRoot,
    "Database/marketplace-supabase/migrations/20260704120000_marketplace_money_policy_trust_controls.sql",
  ),
  "utf8",
).toLowerCase();

test("policy table gains the four trust-control columns", () => {
  assert.match(migration, /add column if not exists payout_hold_days integer not null default 10/);
  assert.match(migration, /check \(payout_hold_days between 0 and 30\)/);
  assert.match(migration, /add column if not exists dispute_window_days integer not null default 3/);
  assert.match(migration, /check \(dispute_window_days between 0 and 14\)/);
  assert.match(migration, /add column if not exists listing_auto_live boolean not null default true/);
  assert.match(migration, /add column if not exists slip_auto_verify boolean not null default true/);
});

test("policy json + admin set rpc expose the new fields", () => {
  assert.match(migration, /create or replace function public\.marketplace_money_policy_json/);
  assert.match(migration, /create or replace function public\.marketplace_admin_set_money_policy/);
  assert.match(migration, /p_payout_hold_days/);
  assert.match(migration, /p_dispute_window_days/);
  assert.match(migration, /p_listing_auto_live/);
  assert.match(migration, /p_slip_auto_verify/);
});

test("route and lib carry the new fields", () => {
  const money = readFileSync(path.join(appRoot, "src/lib/marketplace/money.ts"), "utf8");
  assert.match(money, /payoutHoldDays/);
  assert.match(money, /disputeWindowDays/);
  assert.match(money, /listingAutoLive/);
  assert.match(money, /slipAutoVerify/);
  const route = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/admin/money-policy/route.ts"),
    "utf8",
  );
  assert.match(route, /"payoutHoldDays"/);
});
```

- [ ] **Step 2: Add the package script and run to verify it fails**

In `Website/package.json` scripts, after `test:marketplace-customer-cart`:
```json
"test:marketplace-money-policy-trust-controls": "node --test scripts/test-marketplace-money-policy-trust-controls.mjs",
```
Run: `npm run test:marketplace-money-policy-trust-controls` → Expected: FAIL (`ENOENT` on the migration file).

- [ ] **Step 3: Write the migration**

Open `Database/marketplace-supabase/migrations/20260628140000_marketplace_money_policy.sql` and copy the **exact current bodies** of `marketplace_money_policy_json` and `marketplace_admin_set_money_policy` as the base. New file:

```sql
-- Marketplace money policy: trust controls (payout hold, dispute window,
-- auto-live listings, Slip2GO auto verification toggle).

alter table public.marketplace_money_policies
  add column if not exists payout_hold_days integer not null default 10,
  add column if not exists dispute_window_days integer not null default 3,
  add column if not exists listing_auto_live boolean not null default true,
  add column if not exists slip_auto_verify boolean not null default true;

alter table public.marketplace_money_policies
  drop constraint if exists marketplace_money_policies_payout_hold_days_check,
  add constraint marketplace_money_policies_payout_hold_days_check
    check (payout_hold_days between 0 and 30),
  drop constraint if exists marketplace_money_policies_dispute_window_days_check,
  add constraint marketplace_money_policies_dispute_window_days_check
    check (dispute_window_days between 0 and 14);

-- Re-create the JSON projection with the new fields appended to the existing
-- body copied verbatim from 20260628140000, adding:
--   'payout_hold_days', policy_row.payout_hold_days,
--   'dispute_window_days', policy_row.dispute_window_days,
--   'listing_auto_live', policy_row.listing_auto_live,
--   'slip_auto_verify', policy_row.slip_auto_verify
create or replace function public.marketplace_money_policy_json(policy_row public.marketplace_money_policies)
returns jsonb
language sql
stable
as $$ /* copied existing body + four new keys */ $$;

-- Re-create the admin set RPC copied verbatim from 20260628140000 with four
-- new defaulted params (p_payout_hold_days integer default null, etc.) that
-- coalesce onto the active row exactly like p_seller_fee_bps does.
create or replace function public.marketplace_admin_set_money_policy(
  /* existing params …, */
  p_payout_hold_days integer default null,
  p_dispute_window_days integer default null,
  p_listing_auto_live boolean default null,
  p_slip_auto_verify boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$ /* copied existing body, coalescing the four new columns */ $$;
```
The two `/* copied … */` bodies are mechanical copies — the test in Step 1 pins the required tokens; the diff vs the old function must be **only** the new fields/params.

- [ ] **Step 4: Extend `src/lib/marketplace/money.ts`**

Follow the existing field pattern exactly (see `sellerFeeBps` at `money.ts:36/84/176/233`): add the four fields to the policy type, env fallbacks (`payoutHoldDays: 10`, `disputeWindowDays: 3`, `listingAutoLive: true`, `slipAutoVerify: true`), `numberField`/boolean parsing in the policy mapper, and pass `p_payout_hold_days`, `p_dispute_window_days`, `p_listing_auto_live`, `p_slip_auto_verify` in the `marketplace_admin_set_money_policy` RPC call.

- [ ] **Step 5: Extend the route allow-list**

`src/app/api/ynot/marketplace/admin/money-policy/route.ts:16`:
```ts
const MONEY_POLICY_FIELDS = [
  "sellerFeeBps",
  "buyerServiceFeeBps",
  "shippingFeeSatang",
  "payoutHoldDays",
  "disputeWindowDays",
  "listingAutoLive",
  "slipAutoVerify",
  "adminNote",
] as const;
```

- [ ] **Step 6: Run tests**

Run: `npm run test:marketplace-money-policy-trust-controls && npm run typecheck` → Expected: PASS.

- [ ] **Step 7: Apply migration to the marketplace Supabase project, then commit**

```bash
git add Database/marketplace-supabase/migrations/20260704120000_marketplace_money_policy_trust_controls.sql Website/scripts/test-marketplace-money-policy-trust-controls.mjs Website/package.json Website/src/lib/marketplace/money.ts "Website/src/app/api/ynot/marketplace/admin/money-policy/route.ts"
git commit -m "feat: add marketplace money-policy trust controls"
```

### Task 2: Listing reports / moderation (migration)

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260704121000_marketplace_listing_reports.sql`
- Test: `Website/scripts/test-marketplace-listing-reports.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the failing architecture test** (same skeleton as Task 1; script name `test:marketplace-listing-reports`) asserting the migration contains: table `marketplace_listing_reports` with columns `listing_id uuid not null`, `reporter_account_id uuid not null`, `reason_code text not null` with `check (reason_code in ('fake_or_cert_mismatch', 'stolen_photos', 'wrong_item', 'pricing_abuse', 'other'))`, `reason_note text`, `report_state text not null default 'open'` with `check (report_state in ('open', 'dismissed', 'unlisted'))`, `resolved_by_ynot_profile_id uuid`, `resolution_note text`, RLS revoke/grant service_role, `marketplace_touch_updated_at` trigger, and RPCs `marketplace_report_listing`, `marketplace_admin_list_listing_reports`, `marketplace_admin_resolve_listing_report`. Also assert `src/lib/marketplace/listing-reports.ts` exists and references all three RPC names.
- [ ] **Step 2: Run to verify failure** — `npm run test:marketplace-listing-reports` → FAIL.
- [ ] **Step 3: Write the migration**

```sql
-- Community listing reports: buyers flag a live listing; admins resolve by
-- dismissing or unlisting. Listings are never auto-removed by a report.

create table if not exists public.marketplace_listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id),
  reporter_account_id uuid not null references public.marketplace_accounts(id),
  reason_code text not null
    check (reason_code in ('fake_or_cert_mismatch', 'stolen_photos', 'wrong_item', 'pricing_abuse', 'other')),
  reason_note text check (reason_note is null or char_length(reason_note) <= 1000),
  report_state text not null default 'open'
    check (report_state in ('open', 'dismissed', 'unlisted')),
  resolved_by_ynot_profile_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listing_reports_state_idx
  on public.marketplace_listing_reports(report_state, created_at desc);
create unique index if not exists marketplace_listing_reports_dedupe_idx
  on public.marketplace_listing_reports(listing_id, reporter_account_id)
  where report_state = 'open';

drop trigger if exists marketplace_listing_reports_touch_updated_at on public.marketplace_listing_reports;
create trigger marketplace_listing_reports_touch_updated_at
before update on public.marketplace_listing_reports
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_listing_reports enable row level security;
revoke all on public.marketplace_listing_reports from public, anon, authenticated;
grant select, insert, update on public.marketplace_listing_reports to service_role;

create or replace function public.marketplace_report_listing(
  p_listing_id uuid,
  p_reporter_account_id uuid,
  p_reason_code text,
  p_reason_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_report public.marketplace_listing_reports;
begin
  if not exists (
    select 1 from public.marketplace_listings
    where id = p_listing_id and listing_state = 'active'
  ) then
    raise exception 'marketplace_listing_not_reportable';
  end if;
  insert into public.marketplace_listing_reports
    (listing_id, reporter_account_id, reason_code, reason_note)
  values (p_listing_id, p_reporter_account_id, p_reason_code, p_reason_note)
  on conflict do nothing
  returning * into v_report;
  if v_report.id is null then
    select * into v_report from public.marketplace_listing_reports
    where listing_id = p_listing_id and reporter_account_id = p_reporter_account_id
      and report_state = 'open';
  end if;
  return to_jsonb(v_report);
end $$;

create or replace function public.marketplace_admin_list_listing_reports(
  p_state text default 'open'
) returns jsonb
language sql security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  from public.marketplace_listing_reports r
  where p_state is null or r.report_state = p_state;
$$;

create or replace function public.marketplace_admin_resolve_listing_report(
  p_report_id uuid,
  p_resolution text,             -- 'dismissed' | 'unlisted'
  p_admin_profile_id uuid,
  p_resolution_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_report public.marketplace_listing_reports;
begin
  if p_resolution not in ('dismissed', 'unlisted') then
    raise exception 'marketplace_report_resolution_invalid';
  end if;
  update public.marketplace_listing_reports
     set report_state = p_resolution,
         resolved_by_ynot_profile_id = p_admin_profile_id,
         resolution_note = p_resolution_note,
         resolved_at = now()
   where id = p_report_id and report_state = 'open'
   returning * into v_report;
  if v_report.id is null then
    raise exception 'marketplace_report_not_open';
  end if;
  if p_resolution = 'unlisted' then
    update public.marketplace_listings
       set listing_state = 'hidden'
     where id = v_report.listing_id and listing_state = 'active';
  end if;
  return to_jsonb(v_report);
end $$;
```
Before finalizing, confirm the two referenced names against `20260628090000_marketplace_foundation.sql`: the listings table name/state column (`marketplace_listings.listing_state`, hidden/active values) and accounts table (`marketplace_accounts`). Adjust the SQL to the actual names if they differ — the Task-2 test should assert whatever the real names are.
- [ ] **Step 4: Create `src/lib/marketplace/listing-reports.ts`** exporting `reportMarketplaceListing`, `listMarketplaceListingReports`, `resolveMarketplaceListingReport`, each calling the matching RPC through `createMarketplaceSupabaseClient()` and `marketplaceRpcError` (copy the call/error shape from `cart-watchlist.ts:517`).
- [ ] **Step 5: Run** `npm run test:marketplace-listing-reports && npm run typecheck` → PASS.
- [ ] **Step 6: Apply migration, commit** — `git commit -m "feat: add marketplace listing reports for moderation"`.

### Task 3: Product alerts — "notify me when listed" (migration)

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260704122000_marketplace_product_alerts.sql`
- Test: `Website/scripts/test-marketplace-product-alerts.mjs` (+ `package.json` script `test:marketplace-product-alerts`)

- [ ] **Step 1: Failing test** asserting: table `marketplace_product_alerts` (`product_id uuid not null`, `account_id uuid not null`, `alert_state text not null default 'active'` check in `('active','cancelled','notified')`, unique active `(product_id, account_id)` partial index, RLS + trigger) and RPCs `marketplace_subscribe_product_alert`, `marketplace_cancel_product_alert`, `marketplace_list_product_alerts`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Migration** — same structure as Task 2: insert-or-return-existing subscribe RPC, cancel RPC (`update … set alert_state='cancelled' where account_id = p_account_id`), list-by-account RPC returning `jsonb`. Reference the real product table name from `20260629160000_marketplace_product_market.sql` (check whether it is `marketplace_products`; use the actual name).
- [ ] **Step 4: Create `src/lib/marketplace/product-alerts.ts`** with `subscribeProductAlert`, `cancelProductAlert`, `listProductAlerts` wrapping the RPCs.
- [ ] **Step 5: Run tests + typecheck → PASS.**
- [ ] **Step 6: Apply migration, commit** — `git commit -m "feat: add marketplace product alerts"`.

Notification *delivery* is out of scope (no notification channel exists); alerts are stored and surfaced in admin stats until a channel ships. State that in the migration header comment.

### Task 4: Buyer dispute open + admin orders/stats read RPCs (migration)

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260704123000_marketplace_dispute_open_and_admin_reads.sql`
- Test: `Website/scripts/test-marketplace-dispute-open-admin-reads.mjs` (+ script `test:marketplace-dispute-open-admin-reads`)

- [ ] **Step 1: Failing test** asserting the migration defines `marketplace_open_buyer_refund_request`, `marketplace_admin_list_orders`, `marketplace_admin_daily_gmv` and that the dispute RPC enforces the window: matches `/dispute_window_days/` and `/marketplace_dispute_window_closed/`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Migration.** First read `20260628130000_marketplace_ops_hardening.sql` for the exact `marketplace_refund_requests` columns and the order tables' state columns; then:
  - `marketplace_open_buyer_refund_request(p_order_id uuid, p_account_id uuid, p_reason text)` — plpgsql, security definer: assert order belongs to the account and is delivered/completed; assert `char_length(trim(p_reason)) between 10 and 1000` else `raise exception 'marketplace_dispute_reason_invalid'`; assert `now() <= delivered_at + (select dispute_window_days from active policy) * interval '1 day'` else `raise exception 'marketplace_dispute_window_closed'`; insert an open `marketplace_refund_requests` row (matching real columns) and freeze the linked payout if one is pending (`update marketplace_seller_payouts set … blocked` — use the real blocked/hold state value found in ops-hardening). Also add in this migration a partial unique index guaranteeing **one open refund request per order** (`create unique index if not exists marketplace_refund_requests_one_open_per_order_idx on public.marketplace_refund_requests(order_id) where <open-state predicate matching the real state column>` — read the real column/state names first) so repeated dispute clicks and races cannot double-freeze payouts.
  - `marketplace_admin_list_orders(p_state text default null, p_limit integer default 100)` — sql, security definer: join official + user-seller order tables into one jsonb list `{order_id, order_code, source, buyer_account_id, seller_account_id, buyer_total_satang, payment_state, fulfilment_state, created_at}` ordered by `created_at desc`.
  - `marketplace_admin_daily_gmv(p_days integer default 30)` — sql, security definer: `select jsonb_agg(...)` of `date_trunc('day', paid_at)`, `sum(buyer_total_satang)`, `count(*)` over paid orders for the last `p_days` days.
- [ ] **Step 4: Lib** — create `src/lib/marketplace/disputes.ts` (`openBuyerRefundRequest`) and `src/lib/marketplace/admin-orders.ts` (`listAdminMarketplaceOrders`, `getAdminDailyGmv`) wrapping the RPCs.
- [ ] **Step 5: Run tests + typecheck → PASS.**
- [ ] **Step 6: Apply migration, commit** — `git commit -m "feat: add buyer dispute open and admin order/GMV reads"`.

### Task 5: Customer routes — alerts + report listing + open dispute

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/alerts/route.ts` (GET list, POST subscribe, DELETE cancel)
- Create: `Website/src/app/api/ynot/marketplace/listings/[listingId]/report/route.ts` (POST)
- Create: `Website/src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts` (POST)
- Create re-exports: `Website/src/app/api/marketplace/alerts/route.ts`, `Website/src/app/api/marketplace/listings/[listingId]/report/route.ts`, `Website/src/app/api/marketplace/orders/[orderId]/dispute/route.ts`
- Test: extend the Task 2–4 test files with route assertions

- [ ] **Step 1: Extend tests** — in each of the three test files add a test asserting its route file exists, uses `prepareMarketplaceMutation` for POST/DELETE, an `allowedFields` list (`["productId"]` for alerts, `["reasonCode", "reasonNote"]` for report, `["reason"]` for dispute), and re-export files reference the ynot route. Run → FAIL.
- [ ] **Step 2: Implement the POST routes** — copy the guard skeleton from `src/app/api/ynot/marketplace/checkout/pending-orders/route.ts` POST: `prepareMarketplaceMutation(request, { method: "POST", accessMode: "customer", action: "…", rateLimit: { key: "ynot:marketplace:alerts:subscribe", limit: 20, windowMs: 60_000 }, allowedFields: […] })`, resolve account via `ensureMarketplaceAccountForProfile`, call the Task 2–4 lib functions, return `{ ok: true, request_id, … }`. GET on alerts copies the pending-orders GET skeleton with `customerMarketplaceAccess`. Re-export files are one-liners mirroring `src/app/api/marketplace/products/route.ts`.
- [ ] **Step 3: Run** the three test scripts + `npm run typecheck` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: expose alerts, listing report, and buyer dispute routes"`.

### Task 6: Admin routes — reports queue, orders list, stats

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/admin/reports/route.ts` (GET open reports)
- Create: `Website/src/app/api/ynot/marketplace/admin/reports/[reportId]/resolve/route.ts` (POST `{resolution, resolutionNote}`)
- Create: `Website/src/app/api/ynot/marketplace/admin/orders/route.ts` (GET `?state=&limit=`)
- Create: `Website/src/app/api/ynot/marketplace/admin/stats/route.ts` (GET → `{dailyGmv, queueSummary, alertCount, reportCount}`)
- Create matching `/api/marketplace/admin/...` re-exports for all four
- Test: `Website/scripts/test-marketplace-admin-console-reads.mjs` (+ script `test:marketplace-admin-console-reads`)

- [ ] **Step 1: Failing test** asserting the four route files exist, all use `ownerOnlyMarketplaceAccess` (GET) / `prepareMarketplaceMutation` with `accessMode` owner (POST resolve, `allowedFields: ["resolution", "resolutionNote"]`), and stats route references `getAdminDailyGmv` and `listMarketplaceQueueSummary`. Run → FAIL.
- [ ] **Step 2: Implement** — copy the guard skeleton from `src/app/api/ynot/marketplace/admin/queues/route.ts` for GETs and from `admin/seller-payouts/[payoutId]/release/route.ts` for the resolve POST. Resolve handler calls `resolveMarketplaceListingReport({ reportId, resolution, adminProfileId: profile.profileId, resolutionNote })`.
- [ ] **Step 3: While here, verify user-seller payment review coverage** — read `src/lib/marketplace/official-shop.ts` `recordOfficialPaymentResult`: if it operates only on the official orders table, add `recordUserSellerPaymentResult` to `src/lib/marketplace/orders.ts` calling the existing payment-state RPC used by the Slip2GO webhook path (see `src/app/api/ynot/marketplace/payments/webhook/route.ts` for the RPC name) and expose `POST /api/ynot/marketplace/admin/orders/[orderId]/payment` with the same `allowedFields` as the official route. If `recordOfficialPaymentResult` already covers both sources, skip and note it in the commit message.
- [ ] **Step 4: Run** `npm run test:marketplace-admin-console-reads && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add admin moderation queue, orders list, and stats routes"`.

## 6. Scope decisions

Resolved with the user (2026-07-04):

1. **Deliver-to-bag at checkout: NO — ship-only** (`marketplace-proto-2.jsx:271-287`). The pending-order contract keeps requiring a shipping address. Remove the delivery chooser from the checkout UI entirely; if bag delivery is ever wanted it is its own plan (order-table `delivery_method` column + RPC changes + bag surfacing).
2. **"Fill from cert": CUT** (`marketplace-proto-3.jsx:114-118`). Not needed. No button, no autofill handler, no seller-facing cert lookup.

Standing cuts (no product need identified):

3. **Listing view counts** (`views 148` in seller listings): needs a write-per-view counter — cost outweighs value at MVP. **Render without views.**
4. **Notifications bell / "Contact parties" messaging:** no notification or messaging backend. **Hide both.**
5. **Top-up bonus packages** (`p1k → +20 bonus` etc.): design shows bonuses; verify against `src/features/ynot/top-up-packages.ts` actuals and render those (no design-invented bonuses).

## 7. Verification gate for Part 1

- [ ] `npm run typecheck`
- [ ] `npm run test:marketplace-money-policy-trust-controls && npm run test:marketplace-listing-reports && npm run test:marketplace-product-alerts && npm run test:marketplace-dispute-open-admin-reads && npm run test:marketplace-admin-console-reads`
- [ ] `npm run test:marketplace-api-contracts` (existing RPC-contract + doc-traceability guards still green)
- [ ] Existing suite spot-check: `npm run test:marketplace-ops-hardening && npm run test:marketplace-customer-cart`
- [ ] All four migrations applied to the marketplace Supabase project (verify with Supabase MCP `list_migrations`)
