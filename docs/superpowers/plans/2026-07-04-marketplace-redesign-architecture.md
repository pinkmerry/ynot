# Marketplace Redesign Implementation Plan — Part 3: Architecture, Security & Performance Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans. This part has two roles: (1) binding **rules** (§A/§S/§P) that every task in [Part 1](./2026-07-04-marketplace-redesign.md) and [Part 2](./2026-07-04-marketplace-redesign-ui.md) must follow, and (2) four **hardening tasks** (S1, P1, P2, P3) with their own checkboxes. Execute S1 before Part 2 Task 9b; P1–P3 during/after Part 2 Task 1.

**Goal:** The redesigned marketplace ships with the same security posture as the existing backend (or better) and hits the Core Web Vitals / bundle budgets, by design rather than by after-the-fact fixes.

---

## §A — Architecture design

### A1. Rendering topology: server-first, islands for interaction only

All reads happen in **server components calling `src/lib/marketplace/*` in-process** — never client `fetch` for initial data, never route-handler self-HTTP from the server. Client islands exist only where the user mutates or where state is ephemeral:

| Surface | Server component (data) | Client island (why) |
|---|---|---|
| Browse | products page + filter counts | `FilterRail` (URL-state nav), `AlertButton` |
| Product detail | detail read model + listings + price history | `GradeTabs` selection, `PriceHistoryPanel` range, `ReportListingButton` |
| Checkout | listing + address + payment instructions | `CheckoutFlow` (pending order, slip upload) |
| Orders | orders + sales + submissions | row expansion, `handoff`/`cancel`/dispute mutations |
| Sell | seller session + terms + submission (edit) | `SellForm` (photos, debounced payout preview, submit) |
| Admin screens | queues, stats, orders, reports, payouts, inventory, policy | modals + action buttons only |

Rules:
- Filters, tabs, and sort are **URL state** (`?source=&q=&grade=&condition=&sort=&tab=`) rendered by the server. Interaction = `router.push` navigation inside `useTransition` — no client-side data stores, no duplicated server state (per house patterns: URL-as-state, no server-state duplication).
- A client island receives its initial data as props from its server parent; it refetches only after its own mutation (or calls `router.refresh()`).
- No new npm dependencies anywhere in Parts 1–3: charts are inline SVG, drawer/modals are hand-rolled per the prototype, drag-drop uses native events. Any task that thinks it needs a package must stop and re-read this line.

### A2. Data flow & duplication guards

- Parallelize independent server reads with `Promise.all` (product page: detail + price history + similar products; orders page: buyer orders + pending orders + sales + submissions; admin overview: queues + stats + snapshot). No sequential awaits for independent data — this is the single biggest TTFB lever on the product and orders pages.
- One read model call per page. The product page must not re-fetch listings that the detail read model already returned — check the payload before adding calls.
- **PostgREST 1000-row cap:** naive selects silently truncate at 1000 rows. Every new list surface is bounded: admin orders RPC `p_limit default 100` (Part 1 Task 4), price history capped in its existing RPC, reports/alerts lists paginate at 100 with `created_at` cursor if they ever grow. Counts use `count … head: true` selects (or a counting RPC) — never `data.length` over an unbounded select.
- Money stays satang integers end-to-end; formatting only at the leaf (`shared/money.ts`).

### A3. Worker & deployment shape (unchanged, stated so nobody "improves" it)

The marketplace worker (`wrangler.marketplace.jsonc`) keeps serving `/marketplace*`, `/admin/marketplace*`, `/api/marketplace/*`, `/api/ynot/marketplace/*`. The redesign adds zero new route patterns, so **no wrangler changes**. `/api/marketplace/**` files stay one-line re-exports of `/api/ynot/marketplace/**`. Deploy remains `npm run cf:deploy:marketplace:routes` (which gates on `verify:marketplace-production-db`).

### A4. Caching layers

| Layer | What | Setting |
|---|---|---|
| HTTP (public GETs) | products browse (exists), product detail, listings-per-product, price history | `Cache-Control: public, max-age=15, stale-while-revalidate=45` — same header the browse route already sets; Task P3 adds it to the other three public reads |
| HTTP (personal/admin GETs) | orders, submissions, alerts, all admin reads | `no-store` (payment-proof route pattern already does this — copy `jsonNoStore`) |
| DB | read models already materialize browse/detail | no change; new RPCs are aggregates with limits |
| None | do NOT add a KV/edge cache layer in this project phase | prior decision — KV caching is gated on user-provided Cloudflare resources |

## §S — Security design

### S0. Existing mechanisms (verified in-repo) — every new surface must ride them

| Mechanism | Where | Rule for new code |
|---|---|---|
| Nonce-based CSP + security headers | `src/middleware.ts` (`buildContentSecurityPolicy`), `next.config.ts` (`X-Frame-Options: DENY` etc.) | No inline `<script>`/`<style>` that bypasses the nonce; no new third-party origins (fonts move self-hosted in P1, which *removes* two origins) |
| CSRF | `enforceSameOriginMutation` inside `prepareMarketplaceMutation` | Every mutation route goes through `prepareMarketplaceMutation` — no hand-rolled POST handlers (Part 1 Tasks 5–6 already comply) |
| Input allow-listing | `allowedFields` per route | New routes: alerts `["productId"]`, report `["reasonCode","reasonNote"]`, dispute `["reason"]`, resolve `["resolution","resolutionNote"]` — plus **value** validation in RPC/lib (S2) |
| Idempotency | idempotency key + request hash in mutation guard | All new mutations pass a request hash (already specified in Part 1) |
| Rate limiting | `enforceRateLimit` (DB-backed, per-profile) | Abuse-prone new endpoints get tight budgets: report **5/min**, alert subscribe **20/min**, dispute open **3/min**, admin resolve **20/min** |
| Upload safety | `magic-bytes.ts` (type sniffing, `maxSlipBytes`), Slip2GO dedup (sha256 / provider ref / QR hash) | Reused as-is by checkout + top-up; seller photos go through the existing submissions photos route — no new upload paths |
| RLS | every marketplace table: `revoke all from public, anon, authenticated; grant … to service_role` | Part 1 migrations already follow it; reviewer must reject any migration missing the revoke/grant block |
| Public projection (customer-leak invariant) | `src/lib/marketplace/public-projection.ts` allow-list keys | See S3 — the invariant extends to every new response |
| Audit | `admin/audit/[targetType]/[targetId]` | Report resolution and dispute transitions record actor profile id (Part 1 SQL already stores `resolved_by_ynot_profile_id`) |

### S1. Task: signed URLs for payment-proof viewing (required by Part 2 Task 9b)

The `marketplace-payment-proofs` bucket is written by the checkout route but nothing serves it to admins — and it must never be public.

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/admin/orders/[orderId]/payment-proof-url/route.ts`
- Create: `Website/src/app/api/marketplace/admin/orders/[orderId]/payment-proof-url/route.ts` (re-export)
- Test: extend `Website/scripts/test-marketplace-admin-console-reads.mjs`

- [ ] **Step 1: Failing test** — add to the admin-console-reads test: route file exists, contains `ownerOnlyMarketplaceAccess`, `createSignedUrl`, a TTL ≤ `120`, and `no-store`. Run `npm run test:marketplace-admin-console-reads` → FAIL.
- [ ] **Step 2: Implement** — copy the GET guard skeleton from `admin/queues/route.ts` (owner-only + rate limit `{ limit: 30, windowMs: 60_000 }`, key `ynot:marketplace:admin:order:proof-url`), then:

```ts
// after guards: look up the order's stored proof object path.
// Read src/lib/marketplace/orders.ts / the payment-proof route to find where
// the object path is persisted (the checkout route uploads to
// `marketplace-payment-proofs`); expose a lib helper
// getMarketplaceOrderProofPath(orderId) in src/lib/marketplace/orders.ts
// that returns { bucket: "marketplace-payment-proofs", path } or null.
const proof = await getMarketplaceOrderProofPath(orderId);
if (!proof) {
  return Response.json(
    { error: "No payment proof on file.", code: "marketplace_proof_missing" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
const supabase = createMarketplaceSupabaseClient();
const { data, error } = await supabase.storage
  .from(proof.bucket)
  .createSignedUrl(proof.path, 120); // 2-minute TTL: enough to render the modal
if (error || !data?.signedUrl) {
  return marketplaceErrorResponse(
    new MarketplaceServiceError("marketplace_proof_url_failed", "Could not create proof link.", 500),
    requestId,
  );
}
return Response.json(
  { ok: true, request_id: requestId, url: data.signedUrl, expiresInSeconds: 120 },
  { headers: { "cache-control": "no-store" } },
);
```
(If the proof was stored via the **core** service client rather than the marketplace one, use `createServiceSupabaseClient` instead — the checkout route shows which client wrote it; match that.)
- [ ] **Step 3:** Run `npm run test:marketplace-admin-console-reads && npm run typecheck` → PASS.
- [ ] **Step 4:** Commit — `git commit -m "feat: signed-url endpoint for admin payment-proof review"`.

### S2. Value validation on the new write routes (fold into Part 1 Tasks 5–6, not a separate task)

`allowedFields` restricts keys, not values. Each new route validates before calling the lib:

```ts
const REPORT_REASON_CODES = new Set([
  "fake_or_cert_mismatch", "stolen_photos", "wrong_item", "pricing_abuse", "other",
]);
// report route:
if (!REPORT_REASON_CODES.has(String(body.reasonCode))) {
  return Response.json({ error: "Invalid reason.", code: "marketplace_report_reason_invalid" }, { status: 400 });
}
const reasonNote = body.reasonNote == null ? null : String(body.reasonNote).trim().slice(0, 1000);
// dispute route:
const reason = String(body.reason ?? "").trim();
if (reason.length < 10 || reason.length > 1000) {
  return Response.json({ error: "Describe the problem in 10–1000 characters.", code: "marketplace_dispute_reason_invalid" }, { status: 400 });
}
// alerts route:
if (!isUuid(String(body.productId ?? ""))) {  // reuse the assertUuid/isUuid helper from lib/marketplace (ops-hardening uses assertUuid)
  return Response.json({ error: "Invalid product.", code: "marketplace_alert_product_invalid" }, { status: 400 });
}
```
The RPCs enforce the same constraints again (DB checks in Part 1 SQL) — defense in depth; the route check exists for clean 400s, the DB check is the guarantee.

### S3. Leak-invariant rules for the new surfaces (bind Part 2 tasks)

House invariant: internal/house data never reaches non-admin customers. Applied here:

- **Reports:** the customer response returns only `{ok, report: {id, report_state}}` — never other reporters, never seller identity beyond what the listing already shows publicly. Admin list may include reporter account id (admins only).
- **Disputes:** buyer sees `{id, state, created_at}` — never seller bank fields, payout amounts, or fee internals. Payout freeze is invisible to the buyer beyond "under review".
- **Admin stats/orders (`marketplace_admin_list_orders`, `dailyGmv`):** owner-only routes; the RPC output includes account UUIDs and totals — these fields must never be re-served through any customer route or embedded in customer page props.
- **Alerts:** listing an account's alerts returns only that account's rows (RPC filters by `p_account_id` — never trust a client-supplied account id; derive it from the session via `getMarketplaceAccountForProfile`, same as every existing route).
- **Payment instructions** (bank account, PromptPay id) render from `payment-instructions.ts` server config — never hardcoded in components, so rotating accounts is a config change.
- Static guard: extend each new-route test (Part 1 Tasks 5–6) with a negative assertion, e.g. for the dispute route `assert.doesNotMatch(routeSource, /bank|payout_amount/i)` and for customer-facing lib functions `assert.doesNotMatch(libSource, /seller_payout_bank/i)` (adjust to the real column names found while implementing). Mirrors the existing customer-leak static tests; remember these are static tests — the runtime guarantee is the RPC + projection, the test only pins the pattern.

### S4. Feature-level threat checklist (review at Part 2 Task 10)

| Threat | Mitigation (already in plan) |
|---|---|
| Slip reuse / fake slips | Slip2GO verification + tri-key dedup + magic-byte + size cap + private bucket + S1 signed URLs |
| Report bombing a competitor's listing | 5/min rate limit + one open report per (listing, reporter) unique index + reports never auto-unlist (admin decides) |
| Dispute abuse to freeze payouts | dispute window enforced in RPC + one open refund request per order (partial unique index, Part 1 Task 4) + 3/min rate limit + reason length check |
| Alert-table flooding | 20/min rate limit + unique active (product, account) index |
| IDOR on orders/submissions/alerts | every lib call scoped by the session-derived marketplace account (existing pattern); new routes copy it — no client-supplied account ids, ever |
| Admin endpoints reachable by customers | `ownerOnlyMarketplaceAccess` on every admin read/write (pinned by static tests) |
| XSS via report notes / dispute reasons / seller text | React text rendering only — **grep gate:** `dangerouslySetInnerHTML` must not appear in `src/features/marketplace-ui/` (add to Part 2 Task 10) |
| Clickjacking on admin console | existing `X-Frame-Options: DENY` global header |
| Secrets | no new secrets; Slip2GO + Supabase keys stay env-side; nothing enters client bundles (`NEXT_PUBLIC_` audit in Task 10) |

## §P — Performance design

### Budgets (gates, not aspirations — checked in Task P-GATE below)

| Metric | Budget | Where measured |
|---|---|---|
| LCP | < 2.5s | `/marketplace` and one product page, mobile emulation |
| INP | < 200ms | filter/tab interactions |
| CLS | < 0.1 | browse grid + product page |
| First-load JS per marketplace route | < 200 KB gz (app-page budget is 300; we target 200 since no heavy libs are allowed) | `next build` route table |
| Theme CSS | < 30 KB raw | file size |
| Admin modal code | not in first load | dynamic import (P2) |

### P1. Task: self-host fonts (kills two render-blocking third-party origins)

The prototype loads JetBrains Mono from Google Fonts CDN. The site already ships Helvetica system stack for text; only the mono face is new.

**Files:** modify `Website/src/app/(store)/marketplace/layout.tsx`, `Website/src/app/admin/marketplace/layout.tsx`, `Website/src/features/marketplace-ui/theme/marketplace-theme.css`.

- [ ] **Step 1:** In each layout:

```tsx
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mp-font-mono",
});
// wrap: <div className={jetbrainsMono.variable}> … </div>
```
(`next/font/google` self-hosts at build time — no runtime Google origin, no CSP addition.) In the theme CSS set `--mp-mono: var(--mp-font-mono), ui-monospace, monospace;` and keep `--mp-font` as the Helvetica stack from the prototype. Do **not** copy the prototype's `<link href="fonts.googleapis.com…">`.
- [ ] **Step 2:** `npm run typecheck`; dev-check mono digits render on prices. Commit — `git commit -m "perf: self-host marketplace mono font"`.

### P2. Task: code-split heavy client islands

**Files:** modify the admin screen components (Part 2 Task 9) and `checkout/CheckoutFlow.tsx` as they are built — this task is a rule + a final sweep.

- [ ] **Step 1:** All four admin modals load via `next/dynamic`:

```tsx
import dynamic from "next/dynamic";
const CompareModal = dynamic(() => import("./modals/CompareModal"), { ssr: false });
```
Same for `SlipModal`, `OrderDetailModal`, `StockModal`, and the customer `MyPageDrawer` + `SlipUploader` (below-the-fold, interaction-gated).
- [ ] **Step 2:** After Part 2 Task 9 lands, run `npm run build` and read the route-size table: every `/marketplace/**` and `/admin/marketplace/**` route ≤ 200 KB first-load gz. If any route exceeds it, the offender is visible in the table — split it before proceeding.
- [ ] **Step 3:** Commit — `git commit -m "perf: code-split marketplace modals and uploader"`.

### P3. Task: cache headers on the remaining public reads

**Files:** modify `src/app/api/ynot/marketplace/products/[productSlug]/route.ts`, `.../[productSlug]/listings/route.ts`, `.../[productSlug]/price-history/route.ts`. Test: extend `scripts/test-marketplace-admin-console-reads.mjs` (or a new tiny `test-marketplace-public-cache-headers.mjs`) asserting all three route sources contain `stale-while-revalidate=45`.

- [ ] **Step 1:** Failing test → run → FAIL.
- [ ] **Step 2:** Add the exact header block the browse route already uses (`products/route.ts:36-40`) to the three GETs: `"Cache-Control": "public, max-age=15, stale-while-revalidate=45"`. These are public, non-personalized reads (guarded by `publicMarketplaceAccess`) — verify that guard on each route before adding the header; any route with per-user output keeps `no-store`.
- [ ] **Step 3:** Run test + typecheck → PASS. Commit — `git commit -m "perf: swr cache headers on public product reads"`.

### P4. Rules bound into Part 2 tasks (no separate task)

- **CLS:** every card art / chart / slip preview box declares `aspect-ratio` (prototype uses 3/4 and 4/3) or explicit dimensions; the price chart SVG has a fixed `viewBox` + CSS height — zero late layout shift. Real listing photos render via `next/image` with `width`/`height` (or `fill` inside the aspect-ratio box), `loading="lazy"` below the fold, and `fetchpriority="high"` only on the product-page hero art.
- **INP:** filter/tab URL navigations wrap in `useTransition` with the pending state dimming the grid (prototype's opacity style); no synchronous work in click handlers; debounce 400ms on payout preview and search-as-you-type (search submits on Enter — no per-keystroke navigation).
- **Animation:** drawer/modal/toast animate `transform`/`opacity` only (prototype already does) — no layout-property animation anywhere.
- **No polling:** admin counts load per navigation; no `setInterval` refreshers.
- **Server waterfalls:** `Promise.all` per A2 — reviewer checks each server page for sequential awaits on independent reads.

### P-GATE (append to Part 2 Task 10 verification)

- [ ] `npm run build` route table: all marketplace routes ≤ 200 KB first-load gz; theme CSS < 30 KB.
- [ ] Lighthouse (mobile) on `/marketplace` and one product page: LCP < 2.5s, CLS < 0.1, no render-blocking third-party origins.
- [ ] `grep -rn "dangerouslySetInnerHTML" Website/src/features/marketplace-ui/` → no matches.
- [ ] `grep -rn "NEXT_PUBLIC_" Website/src/features/marketplace-ui/` → nothing secret-shaped (only flags/site URL).
- [ ] `grep -rn "fonts.googleapis\|unpkg.com" Website/src/features/marketplace-ui/ Website/src/app/\(store\)/marketplace Website/src/app/admin/marketplace` → no matches.
- [ ] S4 threat checklist walked row-by-row against the diff; S3 negative assertions present in the new test files.

## Self-review notes

- Every mechanism cited in §S0 was verified in the repo during planning (middleware CSP, same-origin guard, allowedFields, rate limiter, magic bytes, dedup, RLS grants, public projection) — nothing is aspirational except the four new tasks, which have their own tests.
- S1 is the only net-new attack-surface change (a signed-URL issuer); it is owner-only, rate-limited, 120-second TTL, `no-store`, and 404s when no proof exists.
- P1–P3 change no behavior, only delivery: fonts self-hosted, modals lazy, public reads cached with the header pattern the codebase already uses.
- The 1000-row PostgREST cap and the no-KV-cache constraint are recorded so an executor doesn't "optimize" into a known footgun.
