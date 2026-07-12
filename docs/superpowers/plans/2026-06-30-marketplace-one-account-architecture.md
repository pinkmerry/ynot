# Marketplace One-Account Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YNOT Marketplace feel like one smooth YNOT account journey while keeping real-money marketplace runtime, data, admin, and security controls internally separated.

**Architecture:** The browser stays on `www.ynotopen.com` with one YNOT login/session, one header language, and no visible second-account setup. Marketplace internals use marketplace-owned Worker routes, marketplace Supabase RPCs, and marketplace Modules for actor context, ops snapshots, and scheduled jobs. The central mutation guard remains the security gate for writes; any new actor context must not hide same-origin, rate-limit, idempotency, request-hash, or allowlist checks.

**Tech Stack:** Next.js App Router, OpenNext Cloudflare Workers, Wrangler JSONC configs, Supabase RPCs, Node test scripts, TypeScript server-only marketplace Modules.

---

## Non-Negotiable Product Invariants

- One user-facing account: a customer logs in once with YNOT and can browse, cart, buy, upload bank-transfer slip, see orders, sell cards, and check seller status without creating a second visible account.
- Marketplace Account is internal: backend resolves `current YNOT profile -> Marketplace Account -> allowed action`.
- Browser never supplies trusted marketplace account IDs, seller account IDs, buyer account IDs, payout account IDs, or actor profile IDs.
- Marketplace route/runtime split must be invisible to customers: same domain, same auth/session, same UX language.
- Real-money mutations keep the central mutation guard: method, same-origin, login, marketplace launch gate, action flag, rate limit, idempotency key, canonical request hash, JSON allowlist.
- Marketplace admin is a marketplace surface, not gacha admin with marketplace panels bolted on.

## File Structure

### Cloudflare Ownership

- Modify: `Website/wrangler.marketplace.jsonc`
  - Add marketplace admin route patterns.
- Modify: `Website/tools/verification/verify-cloudflare-config.mjs`
  - Update expected marketplace route list.
- Modify: `Website/tools/verification/verify-marketplace-launch-gates.mjs`
  - Verify marketplace Worker owns `/admin/marketplace*`.
- Modify: `Website/scripts/test-marketplace-ops-hardening.mjs`
  - Assert marketplace admin page remains owner-gated and redacted after route ownership changes.

### One-Account Flow Guard

- Create: `Website/scripts/test-marketplace-one-account-flow.mjs`
  - Static architecture test for smooth one-account invariants.
- Modify: `Website/package.json`
  - Add `test:marketplace-one-account-flow`.
  - Include it in `verify:marketplace`.

### Marketplace Actor Context

- Create: `Website/src/lib/marketplace/actor-context.ts`
  - Server-only read context for pages and read routes.
  - Does not replace `prepareMarketplaceMutation`.
- Modify selectively:
  - `Website/src/app/api/ynot/marketplace/account/me/route.ts`
  - `Website/src/app/api/ynot/marketplace/orders/route.ts`
  - `Website/src/app/api/ynot/marketplace/cart/route.ts`
  - `Website/src/app/(store)/marketplace/cart/page.tsx`
  - `Website/src/app/(store)/marketplace/orders/page.tsx`

### Marketplace Ops Snapshot

- Create: `Website/src/lib/marketplace/ops-snapshot.ts`
  - Builds redacted admin dashboard DTO with parallel safe reads.
- Modify: `Website/src/app/admin/marketplace/page.tsx`
  - Render snapshot instead of orchestrating low-level reads.
- Modify: `Website/scripts/test-marketplace-ops-hardening.mjs`
  - Move admin dashboard checks toward snapshot contract.

### Worker Scheduled Runtime

- Create: `Website/src/lib/worker/core-scheduled-jobs.ts`
  - Core Bulk Open, Reward Conversion, Shipping Request recovery orchestration.
- Create: `Website/src/lib/worker/marketplace-scheduled-jobs.ts`
  - Marketplace pending payment expiry orchestration.
- Modify: `Website/bulk-open-worker.ts`
  - Keep entry small and dispatch scheduled work by Worker env flags.
- Modify: `Website/tools/verification/verify-marketplace-launch-gates.mjs`
  - Assert marketplace Worker has no Pull All queue binding but can run marketplace cron.
- Modify: `Website/tools/verification/verify-cloudflare-config.mjs`
  - Keep website queue expectations and marketplace no-queue expectations explicit.

### Docs and Smoke

- Modify: `docs/adr/0003-marketplace-separate-service-and-database.md`
  - Clarify “separate internals, one account UX.”
- Create or modify: `Website/docs/plans/marketplace/one-account-runtime-seam.md`
  - Document click path and backend path.

---

## Task 1: Lock Marketplace Admin Route Ownership

**Files:**
- Modify: `Website/wrangler.marketplace.jsonc`
- Modify: `Website/tools/verification/verify-cloudflare-config.mjs`
- Modify: `Website/tools/verification/verify-marketplace-launch-gates.mjs`

- [ ] **Step 1: Write the failing route verification**

In `Website/tools/verification/verify-marketplace-launch-gates.mjs`, replace the route-pattern loop:

```js
for (const pattern of [
  "www.ynotopen.com/marketplace*",
  "www.ynotopen.com/api/marketplace/*",
  "www.ynotopen.com/api/ynot/marketplace/*",
]) {
  check(`marketplace Worker owns ${pattern}`, routePatterns.includes(pattern));
}
```

with:

```js
for (const pattern of [
  "www.ynotopen.com/marketplace*",
  "www.ynotopen.com/admin/marketplace*",
  "www.ynotopen.com/api/marketplace/*",
  "www.ynotopen.com/api/ynot/marketplace/*",
  "ynotopen.com/marketplace*",
  "ynotopen.com/admin/marketplace*",
  "ynotopen.com/api/marketplace/*",
  "ynotopen.com/api/ynot/marketplace/*",
]) {
  check(`marketplace Worker owns ${pattern}`, routePatterns.includes(pattern));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run verify:marketplace-launch-gates
```

Expected: FAIL for missing `www.ynotopen.com/admin/marketplace*` and `ynotopen.com/admin/marketplace*`.

- [ ] **Step 3: Add marketplace admin routes**

In `Website/wrangler.marketplace.jsonc`, add these route objects immediately after the existing `www.ynotopen.com/marketplace*` route:

```json
{
  "pattern": "www.ynotopen.com/admin/marketplace*",
  "zone_name": "ynotopen.com"
},
```

and immediately after the existing `ynotopen.com/marketplace*` route:

```json
{
  "pattern": "ynotopen.com/admin/marketplace*",
  "zone_name": "ynotopen.com"
},
```

- [ ] **Step 4: Update Cloudflare config verifier**

In `Website/tools/verification/verify-cloudflare-config.mjs`, update the `wrangler.marketplace.jsonc` `routePatterns` list to:

```js
routePatterns: [
  "www.ynotopen.com/marketplace*",
  "www.ynotopen.com/admin/marketplace*",
  "www.ynotopen.com/api/marketplace/*",
  "www.ynotopen.com/api/ynot/marketplace/*",
  "ynotopen.com/marketplace*",
  "ynotopen.com/admin/marketplace*",
  "ynotopen.com/api/marketplace/*",
  "ynotopen.com/api/ynot/marketplace/*",
],
```

- [ ] **Step 5: Verify route ownership passes**

Run:

```bash
cd Website
npm run verify:marketplace-launch-gates
node tools/verification/verify-cloudflare-config.mjs
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/wrangler.marketplace.jsonc Website/tools/verification/verify-cloudflare-config.mjs Website/tools/verification/verify-marketplace-launch-gates.mjs
git commit -m "Route marketplace admin through marketplace runtime

Constraint: Marketplace must feel like one YNOT account while real-money admin lives in the marketplace runtime lane.
Rejected: Leave /admin/marketplace under the website wildcard | hides marketplace ops under the gacha/admin Worker route surface.
Confidence: high
Scope-risk: narrow
Directive: Keep CI route-safe configs route-empty unless intentionally deploying production route ownership.
Tested: npm run verify:marketplace-launch-gates; node tools/verification/verify-cloudflare-config.mjs
Not-tested: live Cloudflare route precedence"
```

---

## Task 2: Add One-Account Flow Architecture Guard

**Files:**
- Create: `Website/scripts/test-marketplace-one-account-flow.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Add the failing architecture test**

Create `Website/scripts/test-marketplace-one-account-flow.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(appRoot, relPath), "utf8");
}

const marketplaceMutationRoutes = [
  "src/app/api/ynot/marketplace/account/ensure/route.ts",
  "src/app/api/ynot/marketplace/cart/items/route.ts",
  "src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts",
  "src/app/api/ynot/marketplace/checkout/official/route.ts",
  "src/app/api/ynot/marketplace/checkout/user-seller/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/route.ts",
  "src/app/api/ynot/marketplace/seller/terms/route.ts",
  "src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts",
];

test("marketplace mutation routes derive marketplace actor from the current YNOT login", () => {
  for (const relPath of marketplaceMutationRoutes) {
    const source = read(relPath);
    assert.match(source, /prepareMarketplaceMutation|resolveCurrentProfile/, `${relPath} must start from the current YNOT login`);
    assert.doesNotMatch(
      source,
      /body\.(buyerMarketplaceAccountId|sellerMarketplaceAccountId|marketplaceAccountId|actorYnotProfileId)|buyer_marketplace_account_id|seller_marketplace_account_id|actor_ynot_profile_id/,
      `${relPath} must not trust browser-supplied marketplace identity`,
    );
    assert.match(
      source,
      /ensureMarketplaceAccountForProfile|account\.accountId|mutation\.profile\.profileId|profile\.profileId/,
      `${relPath} must resolve marketplace identity from YNOT profile server-side`,
    );
  }
});

test("customer marketplace pages keep one-site UX language", () => {
  const layout = read("src/app/(store)/marketplace/layout.tsx");
  const cart = read("src/app/(store)/marketplace/cart/page.tsx");
  const orders = read("src/app/(store)/marketplace/orders/page.tsx");
  assert.doesNotMatch(layout + cart + orders, /create a marketplace account|sign up for marketplace|second account/i);
  assert.match(layout + cart + orders, /marketplace/i);
});

test("marketplace admin remains a marketplace surface without exposing private payment data", () => {
  const adminPage = read("src/app/admin/marketplace/page.tsx");
  assert.match(adminPage, /surface="marketplace"/);
  assert.doesNotMatch(adminPage, /provider_response|proof_storage_path|buyer_marketplace_account_id|seller_marketplace_account_id/i);
});
```

- [ ] **Step 2: Run test to see current state**

Run:

```bash
cd Website
node --test scripts/test-marketplace-one-account-flow.mjs
```

Expected: it may FAIL if any route still exposes browser-supplied marketplace identity or missing one-account derivation markers.

- [ ] **Step 3: Add npm script**

In `Website/package.json`, add:

```json
"test:marketplace-one-account-flow": "node --test scripts/test-marketplace-one-account-flow.mjs",
```

and update `verify:marketplace` to include the new script at the end:

```json
"verify:marketplace": "npm run verify:marketplace-product-grouping && npm run verify:marketplace-schema && npm run verify:marketplace-identity-bridge && npm run verify:marketplace-rls && npm run verify:marketplace-customer-cart-sql && npm run verify:marketplace-hardening && npm run verify:marketplace-launch-gates && npm run verify:marketplace-no-gacha-inventory && npm run verify:marketplace-doc-traceability && npm run test:marketplace-one-account-flow",
```

- [ ] **Step 4: Fix any route that fails the test**

For each failing route, preserve this pattern:

```ts
const mutation = await prepareMarketplaceMutation(request, {
  method: "POST",
  accessMode: "customer",
  action: "checkout",
  rateLimit: { key: "ynot:marketplace:checkout", limit: 20, windowMs: 60_000 },
  allowedFields: ["listingId", "quantity"],
});
if (!mutation.ok) return mutation.response;

const account = await ensureMarketplaceAccountForProfile(mutation.profile, {
  admin: mutation.access.admin,
  idempotencyKey: mutation.idempotencyKey,
  requestHash: await mutation.requestHash("account.ensure"),
  requestId: mutation.requestId,
});
```

Do not read `buyerMarketplaceAccountId`, `sellerMarketplaceAccountId`, `marketplaceAccountId`, or `actorYnotProfileId` from `mutation.body`.

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-one-account-flow
npm run verify:marketplace
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/scripts/test-marketplace-one-account-flow.mjs Website/package.json Website/src/app/api/ynot/marketplace
git commit -m "Guard marketplace one-account flow

Constraint: Customers must never manage a second visible marketplace account.
Rejected: Trust marketplace account IDs from browser requests | breaks the one-login security model.
Confidence: high
Scope-risk: moderate
Directive: Marketplace Account remains internal; derive it from the current YNOT profile.
Tested: npm run test:marketplace-one-account-flow; npm run verify:marketplace
Not-tested: browser click path"
```

---

## Task 3: Add Read-Only Marketplace Actor Context Without Weakening Mutation Guard

**Files:**
- Create: `Website/src/lib/marketplace/actor-context.ts`
- Modify: `Website/src/app/api/ynot/marketplace/account/me/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/orders/route.ts`
- Modify: `Website/src/app/api/ynot/marketplace/cart/route.ts`
- Modify: `Website/scripts/test-marketplace-one-account-flow.mjs`

- [ ] **Step 1: Add failing test for separate read context and mutation guard**

Append this test to `Website/scripts/test-marketplace-one-account-flow.mjs`:

```js
test("marketplace actor context is read-only and does not replace mutation guard", () => {
  const actorContext = read("src/lib/marketplace/actor-context.ts");
  const mutationGuard = read("src/lib/marketplace/mutation-guard.ts");
  assert.match(actorContext, /resolveCurrentProfile/);
  assert.match(actorContext, /getMarketplaceAccountForProfile|ensureMarketplaceAccountForProfile/);
  assert.doesNotMatch(actorContext, /enforceSameOriginMutation|marketplaceIdempotencyKey|readMarketplaceJsonBody/);
  assert.match(mutationGuard, /enforceSameOriginMutation/);
  assert.match(mutationGuard, /marketplaceIdempotencyKey/);
  assert.match(mutationGuard, /readMarketplaceJsonBody/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:marketplace-one-account-flow
```

Expected: FAIL because `src/lib/marketplace/actor-context.ts` does not exist.

- [ ] **Step 3: Create actor context Module**

Create `Website/src/lib/marketplace/actor-context.ts`:

```ts
import "server-only";

import {
  resolveCurrentProfile,
  type ResolvedAdminSession,
  type ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import {
  ensureMarketplaceAccountForProfile,
  getMarketplaceAccountForProfile,
  type SafeMarketplaceAccount,
} from "./account-bridge";
import {
  customerMarketplaceAccess,
  ownerOnlyMarketplaceAccess,
  publicMarketplaceAccess,
  type MarketplaceAccessResult,
} from "./route-guards";

type MarketplaceActorMode = "public" | "customer" | "owner";

export type MarketplaceActorContext =
  | {
      ok: false;
      response: Response;
      profile: null;
      admin: ResolvedAdminSession | null;
      account: null;
    }
  | {
      ok: true;
      response: null;
      profile: ResolvedProfileSession;
      admin: ResolvedAdminSession | null;
      account: SafeMarketplaceAccount | null;
    };

function loginRequired() {
  return Response.json(
    { error: "Login is required.", code: "marketplace_login_required" },
    { status: 401 },
  );
}

async function accessForMode(
  mode: MarketplaceActorMode,
  profile: ResolvedProfileSession,
): Promise<MarketplaceAccessResult> {
  if (mode === "owner") return ownerOnlyMarketplaceAccess(profile);
  if (mode === "customer") return customerMarketplaceAccess(profile);
  return publicMarketplaceAccess(profile);
}

export async function getMarketplaceActorContext(options: {
  mode: MarketplaceActorMode;
  requireAccount?: boolean;
  ensureAccount?: {
    idempotencyKey: string;
    requestHash: string;
    requestId?: string | null;
  };
}): Promise<MarketplaceActorContext> {
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return { ok: false, response: loginRequired(), profile: null, admin: null, account: null };
  }

  const access = await accessForMode(options.mode, profile);
  if (!access.allowed) {
    return {
      ok: false,
      response: access.response,
      profile: null,
      admin: access.admin,
      account: null,
    };
  }

  const account = options.ensureAccount
    ? await ensureMarketplaceAccountForProfile(profile, {
        admin: access.admin,
        idempotencyKey: options.ensureAccount.idempotencyKey,
        requestHash: options.ensureAccount.requestHash,
        requestId: options.ensureAccount.requestId ?? null,
      })
    : options.requireAccount
      ? await getMarketplaceAccountForProfile(profile, access.admin)
      : null;

  return {
    ok: true,
    response: null,
    profile,
    admin: access.admin,
    account,
  };
}
```

- [ ] **Step 4: Use actor context in read routes only**

For `Website/src/app/api/ynot/marketplace/account/me/route.ts`, shape the route like:

```ts
import { getMarketplaceActorContext } from "@/lib/marketplace/actor-context";
import { safeMarketplaceAccountResponse } from "@/lib/marketplace/account-bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getMarketplaceActorContext({
    mode: "customer",
    requireAccount: true,
  });
  if (!actor.ok) return actor.response;

  return Response.json({
    ok: true,
    ...safeMarketplaceAccountResponse(actor.account, actor.admin),
  });
}
```

For read-only orders/cart routes, use:

```ts
const actor = await getMarketplaceActorContext({
  mode: "customer",
  requireAccount: true,
});
if (!actor.ok) return actor.response;
if (!actor.account) {
  return Response.json({ ok: true, items: [] });
}
```

Do not change mutation routes to use actor context instead of `prepareMarketplaceMutation`.

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-one-account-flow
npm run verify:marketplace-hardening
npm run verify:marketplace
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/src/lib/marketplace/actor-context.ts Website/src/app/api/ynot/marketplace/account/me/route.ts Website/src/app/api/ynot/marketplace/orders/route.ts Website/src/app/api/ynot/marketplace/cart/route.ts Website/scripts/test-marketplace-one-account-flow.mjs
git commit -m "Add marketplace actor context for read flows

Constraint: One-account UX needs shared account resolution, but mutations must keep the central guard.
Rejected: Move all route security into actor context | risks hiding same-origin, idempotency, and body allowlist checks.
Confidence: medium
Scope-risk: moderate
Directive: Use actor context for reads/pages; use prepareMarketplaceMutation for writes.
Tested: npm run test:marketplace-one-account-flow; npm run verify:marketplace-hardening; npm run verify:marketplace
Not-tested: full browser session continuity"
```

---

## Task 4: Extract Marketplace Ops Snapshot

**Files:**
- Create: `Website/src/lib/marketplace/ops-snapshot.ts`
- Modify: `Website/src/app/admin/marketplace/page.tsx`
- Modify: `Website/scripts/test-marketplace-ops-hardening.mjs`

- [ ] **Step 1: Add failing snapshot contract test**

In `Website/scripts/test-marketplace-ops-hardening.mjs`, append:

```js
test("marketplace ops dashboard uses redacted ops snapshot module", () => {
  const snapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  const page = readApp("src/app/admin/marketplace/page.tsx");
  assert.match(snapshot, /buildMarketplaceOpsSnapshot/);
  assert.match(snapshot, /Promise\.all/);
  assert.match(snapshot, /listOfficialOrderDashboard/);
  assert.match(snapshot, /listSellerPayoutQueue/);
  assert.match(snapshot, /listMarketplaceQueueSummary/);
  assert.match(snapshot, /listMarketplaceReconciliationItems/);
  assert.doesNotMatch(snapshot, /provider_response|proof_storage_path|buyer_marketplace_account_id/i);
  assert.match(page, /buildMarketplaceOpsSnapshot/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:marketplace-ops-hardening
```

Expected: FAIL because `src/lib/marketplace/ops-snapshot.ts` does not exist.

- [ ] **Step 3: Create snapshot Module**

Create `Website/src/lib/marketplace/ops-snapshot.ts`:

```ts
import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "./config";
import { getActiveMarketplaceMoneyPolicy, marketplaceMoneyPolicy } from "./money";
import { mockMarketplaceOrders } from "./mock-data";
import { listOfficialOrderDashboard } from "./official-shop";
import {
  listMarketplaceQueueSummary,
  listMarketplaceReconciliationItems,
} from "./ops-hardening";
import { listSellerPayoutQueue } from "./payouts";
import { listAdminSellerSubmissionQueue } from "./seller-consignment";

const emptyOfficialOrderDashboard = {
  orders: [],
  summary: {
    paidRevenueSatang: 0,
    paidOrderCount: 0,
    paymentReviewCount: 0,
    fulfilmentOpenCount: 0,
    refundReviewCount: 0,
  },
};

const emptyQueueSummary = {
  paymentReviewCount: 0,
  refundOpenCount: 0,
  reconciliationOpenCount: 0,
  payoutBlockedCount: 0,
  providerEventOpenCount: 0,
};

function mockOfficialOrderDashboard() {
  const orders = mockMarketplaceOrders.filter(
    (order) => order.listing_source === "official_shop",
  );
  const summary = orders.reduce(
    (acc, order) => {
      if (order.payment_state === "paid" || order.payment_state === "valid") {
        acc.paidRevenueSatang += Number(order.buyer_total_satang ?? 0);
        acc.paidOrderCount += 1;
      }
      if (order.payment_state === "payment_submitted") acc.paymentReviewCount += 1;
      if (
        ["paid", "valid"].includes(order.payment_state) &&
        order.fulfilment_state !== "completed"
      ) {
        acc.fulfilmentOpenCount += 1;
      }
      if (order.refund_state === "requested") acc.refundReviewCount += 1;
      return acc;
    },
    {
      paidRevenueSatang: 0,
      paidOrderCount: 0,
      paymentReviewCount: 0,
      fulfilmentOpenCount: 0,
      refundReviewCount: 0,
    },
  );
  return { orders, summary };
}

function mockSellerPayoutQueue() {
  return mockMarketplaceOrders
    .filter((order) => order.listing_source === "user_seller")
    .map((order) => {
      const sellerFeeSatang = Math.floor(Number(order.item_price_satang ?? 0) * 0.1);
      return {
        id: `mock-payout-${order.id}`,
        order_id: order.id,
        listing_id: order.listing_id,
        payout_state: "held",
        item_price_satang: order.item_price_satang,
        seller_fee_satang: sellerFeeSatang,
        payout_amount_satang: Number(order.item_price_satang ?? 0) - sellerFeeSatang,
        currency: "THB" as const,
        release_eligible_at: null,
        released_at: null,
        paid_at: null,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
    });
}

export async function buildMarketplaceOpsSnapshot(admin: ResolvedAdminSession | null) {
  const config = marketplaceConfig();
  const marketplaceAdminAllowed =
    config.unavailableReason === null &&
    (!config.ownerOnly || admin?.adminRole === "owner");
  const canReadMarketplaceQueues = marketplaceAdminAllowed && !config.mockData;

  const [
    dashboard,
    sellerPayouts,
    sellerSubmissions,
    moneyPolicy,
    queueSummary,
    reconciliationItems,
  ] = await Promise.all([
    canReadMarketplaceQueues
      ? listOfficialOrderDashboard()
      : config.mockData
        ? mockOfficialOrderDashboard()
        : emptyOfficialOrderDashboard,
    canReadMarketplaceQueues
      ? listSellerPayoutQueue()
      : config.mockData
        ? mockSellerPayoutQueue()
        : [],
    marketplaceAdminAllowed && admin ? listAdminSellerSubmissionQueue(admin) : [],
    marketplaceAdminAllowed ? getActiveMarketplaceMoneyPolicy() : marketplaceMoneyPolicy(),
    canReadMarketplaceQueues && admin ? listMarketplaceQueueSummary(admin) : emptyQueueSummary,
    canReadMarketplaceQueues && admin
      ? listMarketplaceReconciliationItems({ admin, state: "open" })
      : [],
  ]);

  const sellerPayoutTotalSatang = sellerPayouts.reduce(
    (total, payout) => total + Number(payout.payout_amount_satang ?? 0),
    0,
  );
  const sellerSubmissionTotalSatang = sellerSubmissions.reduce(
    (total, submission) => total + Number(submission.asking_price_satang ?? 0),
    0,
  );
  const sellerSubmissionReviewCount = sellerSubmissions.filter((submission) =>
    ["submitted", "intake_instruction_sent", "received"].includes(
      submission.status,
    ),
  ).length;

  return {
    config,
    marketplaceAdminAllowed,
    canReadMarketplaceQueues,
    dashboard,
    sellerPayouts,
    sellerSubmissions,
    moneyPolicy,
    queueSummary,
    reconciliationItems,
    sellerPayoutTotalSatang,
    sellerSubmissionTotalSatang,
    sellerSubmissionReviewCount,
  };
}
```

- [ ] **Step 4: Update admin page**

In `Website/src/app/admin/marketplace/page.tsx`:

1. Remove imports for:

```ts
import { marketplaceConfig } from "@/lib/marketplace/config";
import {
  getActiveMarketplaceMoneyPolicy,
  marketplaceMoneyPolicy,
} from "@/lib/marketplace/money";
import { listOfficialOrderDashboard } from "@/lib/marketplace/official-shop";
import {
  listMarketplaceQueueSummary,
  listMarketplaceReconciliationItems,
} from "@/lib/marketplace/ops-hardening";
import { listSellerPayoutQueue } from "@/lib/marketplace/payouts";
import { mockMarketplaceOrders } from "@/lib/marketplace/mock-data";
import { listAdminSellerSubmissionQueue } from "@/lib/marketplace/seller-consignment";
```

2. Add:

```ts
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";
```

3. Remove local helper functions `emptyOfficialOrderDashboard`, `emptyQueueSummary`, `mockOfficialOrderDashboard`, and `mockSellerPayoutQueue`.

4. Replace the low-level dashboard composition with:

```ts
const snapshot = await buildMarketplaceOpsSnapshot(admin);
const {
  config,
  marketplaceAdminAllowed,
  dashboard,
  sellerPayouts,
  sellerSubmissions,
  moneyPolicy,
  queueSummary,
  reconciliationItems,
  sellerPayoutTotalSatang,
  sellerSubmissionTotalSatang,
  sellerSubmissionReviewCount,
} = snapshot;
```

- [ ] **Step 5: Verify**

Run:

```bash
cd Website
npm run test:marketplace-ops-hardening
npm run verify:marketplace-admin-workflow
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/src/lib/marketplace/ops-snapshot.ts Website/src/app/admin/marketplace/page.tsx Website/scripts/test-marketplace-ops-hardening.mjs
git commit -m "Extract marketplace ops snapshot

Constraint: Marketplace admin should render a redacted ops snapshot, not orchestrate real-money reads inline.
Rejected: Leave dashboard composition in the page | keeps query order, mock fallback, and KPI derivation scattered in presentation.
Confidence: medium
Scope-risk: moderate
Directive: Keep private payment/provider fields out of snapshot and page output.
Tested: npm run test:marketplace-ops-hardening; npm run verify:marketplace-admin-workflow; npm run typecheck
Not-tested: live production marketplace Supabase latency"
```

---

## Task 5: Separate Core and Marketplace Scheduled Runtime Modules

**Files:**
- Create: `Website/src/lib/worker/core-scheduled-jobs.ts`
- Create: `Website/src/lib/worker/marketplace-scheduled-jobs.ts`
- Modify: `Website/bulk-open-worker.ts`
- Modify: `Website/tools/verification/verify-marketplace-launch-gates.mjs`

- [ ] **Step 1: Add failing verification for scheduled job ownership**

In `Website/tools/verification/verify-marketplace-launch-gates.mjs`, append:

```js
const workerEntry = readWebsite("bulk-open-worker.ts");
includes(workerEntry, "runCoreScheduledJobs", "Worker entry delegates core scheduled jobs");
includes(workerEntry, "runMarketplaceScheduledJobs", "Worker entry delegates marketplace scheduled jobs");
includes(workerEntry, "MARKETPLACE_ENVIRONMENT", "Worker entry can distinguish marketplace runtime");
```

- [ ] **Step 2: Run verification to confirm failure**

Run:

```bash
cd Website
npm run verify:marketplace-launch-gates
```

Expected: FAIL until worker scheduled Modules exist and are imported.

- [ ] **Step 3: Create marketplace scheduled jobs Module**

Create `Website/src/lib/worker/marketplace-scheduled-jobs.ts`:

```ts
import "server-only";

type MarketplaceScheduledEnv = {
  MARKETPLACE_ENVIRONMENT?: string;
  MARKETPLACE_SUPABASE_URL?: string;
  MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY?: string;
};

function marketplaceSupabaseRpcHeaders(env: MarketplaceScheduledEnv) {
  const serviceKey = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("marketplace_expiry_missing_service_role_key");
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

async function callMarketplaceSupabaseRpc(
  env: MarketplaceScheduledEnv,
  functionName: string,
  args: Record<string, unknown>,
) {
  const supabaseUrl = env.MARKETPLACE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) throw new Error("marketplace_expiry_missing_supabase_url");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: marketplaceSupabaseRpcHeaders(env),
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 160);
    throw new Error(`marketplace_expiry_rpc_failed:${functionName}:${response.status}:${detail}`);
  }

  return response.json().catch(() => null);
}

async function expireMarketplacePendingPaymentOrders(env: MarketplaceScheduledEnv) {
  if (!env.MARKETPLACE_ENVIRONMENT) return;
  if (!env.MARKETPLACE_SUPABASE_URL || !env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    await callMarketplaceSupabaseRpc(env, "marketplace_expire_pending_payment_orders", {
      p_request_id: `cloudflare-cron:${new Date().toISOString()}`,
      p_limit: 100,
    });
  } catch (error) {
    console.warn("marketplace_pending_order_expiry_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
  }
}

export async function runMarketplaceScheduledJobs(env: MarketplaceScheduledEnv) {
  await expireMarketplacePendingPaymentOrders(env);
}
```

- [ ] **Step 4: Create core scheduled jobs Module**

Create `Website/src/lib/worker/core-scheduled-jobs.ts` by moving the existing core queue Adapter code from `Website/bulk-open-worker.ts` into this Module:

```ts
import "server-only";

type QueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};

export type CoreScheduledEnv = {
  BULK_OPEN_QUEUE?: QueueBinding;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export async function runCoreScheduledJobs(env: CoreScheduledEnv) {
  await Promise.all([
    recoverBulkOpenSessions(env),
    recoverRewardConversionJobs(env),
    recoverShippingRequestJobs(env),
  ]);
}
```

Then include the existing `QueueJobAdapter`, `bulkOpenAdapter`, `rewardConversionAdapter`, `shippingRequestAdapter`, `runScheduledRecovery`, `recoverBulkOpenSessions`, `recoverRewardConversionJobs`, and `recoverShippingRequestJobs` implementations unchanged inside this file. Remove marketplace-specific env fields and marketplace RPC helper from the core Module.

- [ ] **Step 5: Slim worker entry**

In `Website/bulk-open-worker.ts`, keep OpenNext fetch and queue handling, import the scheduled job Modules:

```ts
import { runCoreScheduledJobs } from "./src/lib/worker/core-scheduled-jobs";
import { runMarketplaceScheduledJobs } from "./src/lib/worker/marketplace-scheduled-jobs";
```

Replace scheduled handler body with:

```ts
async scheduled(_event: unknown, env: BulkOpenEnv, ctx: WorkerContext) {
  ctx.waitUntil?.(Promise.all([
    runCoreScheduledJobs(env),
    runMarketplaceScheduledJobs(env),
  ]));
},
```

Keep `queue(batch, env)` handling for core queue messages unless moving that queue dispatch into `core-scheduled-jobs.ts` in the same task. If moving it, export `handleCoreQueueMessage` and keep the Worker entry as a thin dispatcher.

- [ ] **Step 6: Verify**

Run:

```bash
cd Website
npm run verify:marketplace-launch-gates
npm run test:bulk-open-api-flow
npm run test:marketplace-payment-resume-expiry
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Website/bulk-open-worker.ts Website/src/lib/worker/core-scheduled-jobs.ts Website/src/lib/worker/marketplace-scheduled-jobs.ts Website/tools/verification/verify-marketplace-launch-gates.mjs
git commit -m "Separate marketplace scheduled runtime

Constraint: Marketplace pending payment expiry should live in the marketplace runtime lane while core queue jobs stay core-owned.
Rejected: Keep marketplace expiry inline in bulk-open-worker.ts | mixes core queue recovery with real-money marketplace cron behavior.
Confidence: medium
Scope-risk: moderate
Directive: Do not bind Pull All queue to the marketplace Worker.
Tested: npm run verify:marketplace-launch-gates; npm run test:bulk-open-api-flow; npm run test:marketplace-payment-resume-expiry; npm run typecheck
Not-tested: Cloudflare scheduled event in production"
```

---

## Task 6: Document the Smooth One-Account Flow

**Files:**
- Modify: `docs/adr/0003-marketplace-separate-service-and-database.md`
- Create: `Website/docs/plans/marketplace/one-account-runtime-seam.md`
- Modify: `Website/tools/verification/verify-marketplace-doc-traceability.mjs`

- [ ] **Step 1: Update ADR language**

Replace `docs/adr/0003-marketplace-separate-service-and-database.md` content with:

```md
# Marketplace uses a separate runtime and database behind one YNOT account

Marketplace runs behind a separate Marketplace Worker/service and a separate Marketplace Supabase project while the customer keeps one YNOT login and one website experience.

The user-facing invariant is simple: a customer logs in once with YNOT and can browse, cart, buy by bank transfer, upload payment proof, see orders, sell cards, and check seller status without creating or managing a second visible account.

The internal invariant is stricter: the backend resolves `current YNOT profile -> Marketplace Account -> allowed action`. Browser requests must not supply trusted marketplace account IDs, seller account IDs, buyer account IDs, payout account IDs, or actor profile IDs.

We rejected putting marketplace tables and real-money workflows directly into the existing YNOT core database because marketplace orders, seller payouts, audit, and double-sell prevention need a tighter blast radius from gacha rewards, wallet coins, and Customer Bag operations.
```

- [ ] **Step 2: Create runtime seam doc**

Create `Website/docs/plans/marketplace/one-account-runtime-seam.md`:

```md
# Marketplace One-Account Runtime Seam

## User flow

1. Customer signs in once with YNOT.
2. Customer opens `/marketplace`.
3. Public browse reads grouped marketplace products and offers.
4. Customer adds an offer to cart.
5. Backend resolves the current YNOT profile and loads or creates the internal Marketplace Account.
6. Customer creates a pending payment order.
7. Customer pays by bank transfer and uploads slip proof.
8. Backend validates payment proof and updates the pending order state.
9. Customer sees the order in `/marketplace/orders`.
10. Seller flows use the same YNOT session and internal Marketplace Account.

## Backend rule

Every marketplace buyer/seller action follows:

`current YNOT profile -> marketplace launch gate -> action flag -> rate limit -> request hash/idempotency -> Marketplace Account -> RPC`.

## Runtime rule

Marketplace customer pages, marketplace admin pages, and marketplace HTTP routes are owned by the marketplace Worker route set. The split is internal; the public domain and session stay the same.

## Security rule

Browser requests do not provide trusted marketplace account identity. Server code derives identity from the authenticated YNOT profile.
```

- [ ] **Step 3: Add doc traceability checks**

In `Website/tools/verification/verify-marketplace-doc-traceability.mjs`, add checks for:

```js
const oneAccountDoc = readWebsite("docs/plans/marketplace/one-account-runtime-seam.md");
includes(oneAccountDoc, "current YNOT profile -> Marketplace Account -> allowed action", "one-account doc states backend identity chain");
includes(oneAccountDoc, "bank transfer", "one-account doc covers bank transfer payment flow");
includes(oneAccountDoc, "marketplace Worker route set", "one-account doc covers marketplace route ownership");
```

- [ ] **Step 4: Verify**

Run:

```bash
cd Website
npm run verify:marketplace-doc-traceability
npm run verify:marketplace
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0003-marketplace-separate-service-and-database.md Website/docs/plans/marketplace/one-account-runtime-seam.md Website/tools/verification/verify-marketplace-doc-traceability.mjs
git commit -m "Document marketplace one-account runtime seam

Constraint: Separate marketplace internals must not create a second user-facing account experience.
Rejected: Describe only service/database separation | misses the customer journey invariant.
Confidence: high
Scope-risk: narrow
Directive: Keep all future marketplace plans grounded in one YNOT account UX.
Tested: npm run verify:marketplace-doc-traceability; npm run verify:marketplace
Not-tested: none"
```

---

## Final Verification

- [ ] Run targeted marketplace checks:

```bash
cd Website
npm run test:marketplace-one-account-flow
npm run verify:marketplace-launch-gates
npm run verify:marketplace-hardening
npm run verify:marketplace-admin-workflow
npm run verify:marketplace-doc-traceability
```

Expected: PASS.

- [ ] Run broader checks:

```bash
cd Website
npm run typecheck
npm run verify:marketplace
git diff --check
```

Expected: PASS.

- [ ] Browser smoke if a local server is running:

```bash
curl -I 'http://127.0.0.1:3010/marketplace'
curl -I 'http://127.0.0.1:3010/marketplace/cart'
curl -I 'http://127.0.0.1:3010/marketplace/orders'
curl -I 'http://127.0.0.1:3010/admin/marketplace'
```

Expected: HTTP responses are not 404. Auth-gated pages may return redirect/401 depending local session.

## Self-Review

- Spec coverage:
  - One-account smooth UX: Task 2, Task 3, Task 6.
  - Separate marketplace runtime/data internally: Task 1, Task 5, Task 6.
  - Performance: Task 4 parallelizes marketplace admin reads; Task 5 reduces mixed scheduled runtime ownership.
  - Security: Task 2 guards no browser-supplied marketplace identity; Task 3 preserves central mutation guard; Task 4 keeps redaction; Task 5 keeps marketplace secret-bearing work out of core queue logic.
- Placeholder scan:
  - No placeholder markers or unspecified testing steps remain.
- Type consistency:
  - `getMarketplaceActorContext`, `MarketplaceActorContext`, `buildMarketplaceOpsSnapshot`, `runCoreScheduledJobs`, and `runMarketplaceScheduledJobs` are defined before use.

## Execution Handoff

Plan complete. Recommended execution is subagent-driven because Tasks 1/2, Task 4, and Task 5 can be reviewed independently without mixing route config, admin dashboard extraction, and Worker runtime changes in one risky edit pass.
