# Admin Ops API/RPC Performance Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debug and harden the admin operations flow for top-ups, payment methods, shipping, and categories so API/RPC calls are correct, top-up review behavior stays the same, admin-only actions do not leak private implementation details, and repeated admin data fetches are reduced.

**Architecture:** Preserve existing Supabase RPC contracts for sensitive state transitions, add route-level guardrails and source-based regression tests, then move high-churn admin screens toward local state updates and bounded server queries. Top-up `PATCH` keeps using `approve_top_up_request` and `reject_top_up_request`; shipping keeps using `update_shipping_request_status`; admin read paths get filters, limits, and safer response boundaries.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase service-role server clients, Supabase RPCs, Node test runner source-regression scripts.

---

## Current Evidence

The debug pass found these concrete points:

- `Website/src/app/api/ynot/admin/top-ups/route.ts` already validates admin session, same-origin, rate limit, UUID shape, and calls only `approve_top_up_request` or `reject_top_up_request` for review mutations.
- `Website/src/app/api/ynot/admin/top-ups/route.ts` admin `GET` currently has no request-scoped rate limit and calls `getTopUps(undefined, true)` without status, cursor, or limit parsing.
- `Website/src/features/ynot/data.ts` `getTopUps()` fetches top-up rows, payment methods, and slips separately. It supports a limit but no status or cursor filters, so admin pages can fetch more rows than needed.
- `Website/src/features/ynot/client.tsx` `AdminTopUpActions` posts a review mutation but does not update local rows or refresh the page. This can make already-reviewed rows look pending until a navigation/reload.
- `Website/src/app/api/ynot/admin/payment-methods/route.ts` accepts any active admin, performs a service-role upsert, and returns `error.message` on failure.
- `Website/src/app/api/ynot/admin/shipping/route.ts` calls `update_shipping_request_status` correctly, but does not validate the shipping UUID before the RPC and returns raw `error.message`.
- `Website/src/features/ynot/data.ts` `publicTopUp()` already strips `id`, `profileId`, `adminNote`, provider slip details, and internal payment method data from public top-up payloads. Keep this boundary intact.

## Non-Negotiable Behavior

- Do not change the top-up customer submit flow.
- Do not change the signatures or names of `approve_top_up_request`, `reject_top_up_request`, or `update_shipping_request_status`.
- Do not expose provider details, slip metadata, internal stock/proof fields, admin notes, or house logic through public APIs.
- Do not add a database migration for this pass. This is route/data/client hardening plus tests.
- Do not remove existing category, payment, shipping, or top-up functionality while reducing repeated reads.

## Scope

In scope:

- Admin top-ups route, admin top-ups page, top-up data loader, and top-up client review state.
- Admin payment-method settings route and QR upload route.
- Admin shipping route error/UUID hardening.
- Category admin local state improvement only if the implementation stays contained to existing category components.
- Source-regression tests and existing flow tests.

Out of scope:

- Supabase schema changes.
- Live production mutations.
- Public pack-opening behavior.
- Rewriting the full admin dashboard shell.

---

## Task 1: Add Failing Source-Regression Coverage First

- [ ] Create `Website/scripts/test-admin-ops-api-rpc-performance.mjs`.
- [ ] Add a package script in `Website/package.json`.
- [ ] Run the new test and confirm it fails before implementation.

Create this file:

```js
// Website/scripts/test-admin-ops-api-rpc-performance.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

function optionalSource(path) {
  const fullPath = join(root, path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

test("admin top-up route keeps review RPCs stable and adds bounded list protections", () => {
  const route = source("src/app/api/ynot/admin/top-ups/route.ts");
  assert.match(route, /approve_top_up_request/);
  assert.match(route, /reject_top_up_request/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /ynot:admin:top-ups:list/);
  assert.match(route, /new URL\(request\.url\)/);
  assert.match(route, /statuses/);
  assert.match(route, /cursorCreatedAt/);
});

test("getTopUps supports admin status and cursor filtering without changing public redaction", () => {
  const data = source("src/features/ynot/data.ts");
  assert.match(data, /statuses\?: readonly/);
  assert.match(data, /cursorCreatedAt\?: string/);
  assert.match(data, /\.in\("status", statuses\)/);
  assert.match(data, /\.lt\("created_at", options\.cursorCreatedAt\)/);

  const publicTopUpStart = data.indexOf("export function publicTopUp");
  assert.ok(publicTopUpStart > -1, "publicTopUp must exist");
  const publicTopUp = data.slice(publicTopUpStart, publicTopUpStart + 900);
  assert.match(publicTopUp, /id: undefined/);
  assert.match(publicTopUp, /profileId: undefined/);
  assert.match(publicTopUp, /adminNote: undefined/);
  assert.match(publicTopUp, /providerReference: undefined/);
  assert.match(publicTopUp, /rawPayload: undefined/);
});

test("admin payment method routes require high privilege and return safe failures", () => {
  const paymentRoute = source("src/app/api/ynot/admin/payment-methods/route.ts");
  const qrRoute = source("src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  for (const route of [paymentRoute, qrRoute]) {
    assert.match(route, /enforceSameOriginMutation/);
    assert.match(route, /requireAdminRoleResponse/);
    assert.doesNotMatch(route, /error\.message/);
  }
});

test("admin shipping route validates IDs and maps RPC errors safely", () => {
  const shippingRoute = source("src/app/api/ynot/admin/shipping/route.ts");
  assert.match(shippingRoute, /const UUID_RE/);
  assert.match(shippingRoute, /adminShippingErrorMessage/);
  assert.match(shippingRoute, /update_shipping_request_status/);
  assert.doesNotMatch(shippingRoute, /error\.message/);
});

test("admin top-up UI removes reviewed rows without a full duplicate fetch", () => {
  const consoleSource = optionalSource("src/features/ynot/admin/AdminTopUpConsole.tsx");
  assert.match(consoleSource, /"use client"/);
  assert.match(consoleSource, /useState\(initialTopUps\)/);
  assert.match(consoleSource, /handleReviewed/);
  assert.match(consoleSource, /setTopUps/);
  assert.doesNotMatch(consoleSource, /router\.refresh\(\)/);
});

test("settings and category admin screens update local state after saves", () => {
  const clientSource = source("src/features/ynot/client.tsx");
  assert.match(clientSource, /setMethodOptions/);
  assert.match(clientSource, /onSaved\?\./);

  const categoryWorkspace = optionalSource("src/features/ynot/admin/AdminCategoryWorkspace.tsx");
  assert.match(categoryWorkspace, /"use client"/);
  assert.match(categoryWorkspace, /setCategories/);
});
```

Update `Website/package.json`:

```json
{
  "scripts": {
    "test:admin-ops-api-rpc-performance": "node --test scripts/test-admin-ops-api-rpc-performance.mjs"
  }
}
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
```

Commit after the failing test is in place:

```bash
git add Website/package.json Website/scripts/test-admin-ops-api-rpc-performance.mjs
git commit -m "$(cat <<'MSG'
Lock admin ops API and RPC performance expectations

Constraint: Top-up review RPC names and public redaction boundaries must remain stable.
Rejected: Manual-only verification | source-regression coverage catches route drift quickly.
Confidence: high
Scope-risk: narrow
Directive: Keep this test focused on admin API contracts and non-leak boundaries.
Tested: npm run test:admin-ops-api-rpc-performance fails before implementation as expected.
Not-tested: Live Supabase admin mutation.
MSG
)"
```

---

## Task 2: Add Shared Admin Role and Safe Error Helpers

- [ ] Add a small role helper for owner/admin-only admin operations.
- [ ] Add safe admin error mapping that never returns raw Supabase error messages.
- [ ] Keep existing `mappedAdminErrorResponse()` intact for routes that deliberately use it today.

Create `Website/src/lib/auth/admin-role-guard.ts`:

```ts
import "server-only";

import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

import type { ResolvedAdminSession } from "./resolve-current-profile";

export type AdminRole = ResolvedAdminSession["adminRole"];

export function adminHasRole(admin: ResolvedAdminSession, allowedRoles: readonly AdminRole[]) {
  return allowedRoles.includes(admin.adminRole);
}

export function requireAdminRoleResponse(
  admin: ResolvedAdminSession,
  allowedRoles: readonly AdminRole[],
  message = "Owner or admin access is required.",
) {
  if (adminHasRole(admin, allowedRoles)) {
    return null;
  }

  return adminErrorResponse("forbidden", message, 403, {
    adminRole: admin.adminRole,
  });
}
```

Update `Website/src/lib/ynot/admin-api-errors.ts` by adding these exports after `mappedAdminErrorResponse()`:

```ts
export function safeMappedAdminErrorResponse(
  error: unknown,
  knownErrors: readonly AdminErrorMapEntry[],
  fallback: {
    code: string;
    message: string;
    status?: number;
    extra?: Record<string, unknown>;
  },
) {
  const text = adminErrorText(error);
  const mapped =
    text &&
    knownErrors.find((entry) =>
      entry.match instanceof RegExp ? entry.match.test(text) : text.includes(entry.match),
    );

  if (mapped) {
    return adminErrorResponse(mapped.code, mapped.message, mapped.status, fallback.extra);
  }

  return adminErrorResponse(fallback.code, fallback.message, fallback.status ?? 500, fallback.extra);
}

export function adminRouteErrorLog(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {},
) {
  const parts = errorParts(error);
  console.warn(scope, {
    ...extra,
    code: parts.code,
    message: parts.message,
    detail: parts.detail,
    hint: parts.hint,
  });
}
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
```

Expected result: tests still fail on routes and client state, but helper compilation errors must be absent once the next typecheck runs.

Commit:

```bash
git add Website/src/lib/auth/admin-role-guard.ts Website/src/lib/ynot/admin-api-errors.ts
git commit -m "$(cat <<'MSG'
Centralize safe admin route guards

Constraint: Admin APIs need consistent role checks and non-leaking error responses.
Rejected: Copying per-route role checks | shared helpers keep behavior auditable.
Confidence: high
Scope-risk: narrow
Directive: Do not return raw database error text from sensitive admin routes.
Tested: npm run test:admin-ops-api-rpc-performance reaches remaining expected failures.
Not-tested: Live Supabase admin mutation.
MSG
)"
```

---

## Task 3: Harden Payment Method Settings APIs Without Changing Settings Behavior

- [ ] Add same-origin defense-in-depth to payment method save and QR upload routes.
- [ ] Require `owner` or `admin` for payment method settings changes.
- [ ] Return a camel-case `paymentMethod` DTO after save so the settings UI can update locally.
- [ ] Replace raw `error.message` responses with safe mapped responses and server logs.

Update `Website/src/app/api/ynot/admin/payment-methods/route.ts` imports:

```ts
import { enforceSameOriginMutation } from "@/lib/auth/action-token";
import { requireAdminRoleResponse } from "@/lib/auth/admin-role-guard";
import {
  adminErrorResponse,
  adminRouteErrorLog,
  safeMappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";
```

Add a local DTO mapper near the top of the route:

```ts
function toAdminPaymentMethod(row: {
  id: string;
  type: string;
  display_name: string;
  account_name: string | null;
  account_number: string | null;
  qr_image_url: string | null;
  instructions: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  provider: string | null;
}) {
  return {
    id: row.id,
    type: row.type,
    displayName: row.display_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    qrImageUrl: row.qr_image_url,
    instructions: row.instructions,
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order ?? 0,
    provider: row.provider,
  };
}
```

Inside `POST(request: Request)`, immediately after the Supabase config guard:

```ts
const originFailure = enforceSameOriginMutation(request);
if (originFailure) {
  return originFailure;
}
```

After `resolveAdminSession()`:

```ts
const roleFailure = requireAdminRoleResponse(admin, ["owner", "admin"]);
if (roleFailure) {
  return roleFailure;
}
```

Replace the upsert error branch:

```ts
if (error) {
  adminRouteErrorLog("admin payment method save failed", error, {
    adminId: admin.id,
    paymentMethodId: id,
  });
  return safeMappedAdminErrorResponse(error, [], {
    code: "payment_method_save_failed",
    message: "Could not save payment method.",
    status: 500,
  });
}
```

Replace the response body:

```ts
return Response.json({ paymentMethod: toAdminPaymentMethod(data) });
```

Apply the same guard style to `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`:

```ts
const originFailure = enforceSameOriginMutation(request);
if (originFailure) {
  return originFailure;
}

const admin = await resolveAdminSession();
if (!admin) {
  return adminErrorResponse("unauthorized", "Admin access required.", 401);
}

const roleFailure = requireAdminRoleResponse(admin, ["owner", "admin"]);
if (roleFailure) {
  return roleFailure;
}
```

For QR storage/upload failures, log the raw error server-side and return:

```ts
return adminErrorResponse("qr_upload_failed", "Could not upload QR image.", 500);
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run test:uploads
```

Commit:

```bash
git add Website/src/app/api/ynot/admin/payment-methods/route.ts Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts
git commit -m "$(cat <<'MSG'
Protect admin payment settings mutations

Constraint: Payment destination settings are high-risk admin configuration.
Rejected: Keeping active-admin-only access | lower roles should not change payment rails.
Confidence: high
Scope-risk: narrow
Directive: Keep raw storage and database errors in logs, not API responses.
Tested: npm run test:admin-ops-api-rpc-performance; npm run test:uploads
Not-tested: Live QR upload against production storage.
MSG
)"
```

---

## Task 4: Harden Shipping Admin RPC Calls Without Changing Shipping Flow

- [ ] Validate `shippingRequestId` before calling `update_shipping_request_status`.
- [ ] Keep existing status transition payload unchanged.
- [ ] Map known RPC failures to safe admin messages.
- [ ] Stop returning raw Supabase error text.

Update `Website/src/app/api/ynot/admin/shipping/route.ts` imports:

```ts
import {
  adminErrorResponse,
  adminRouteErrorLog,
  safeMappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";
```

Add near the top:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const adminShippingErrorMap = [
  {
    match: "shipping_request_not_found",
    code: "shipping_request_not_found",
    message: "Shipping request not found.",
    status: 404,
  },
  {
    match: "invalid_shipping_transition",
    code: "invalid_shipping_transition",
    message: "This shipping status change is not allowed.",
    status: 409,
  },
  {
    match: "shipping_tracking_required",
    code: "shipping_tracking_required",
    message: "Carrier and tracking number are required for shipped requests.",
    status: 400,
  },
  {
    match: "active_admin_required",
    code: "active_admin_required",
    message: "Active admin access is required.",
    status: 403,
  },
] as const;

function adminShippingErrorMessage(error: unknown) {
  return safeMappedAdminErrorResponse(error, adminShippingErrorMap, {
    code: "shipping_update_failed",
    message: "Could not update shipping request.",
    status: 500,
  });
}
```

Before the RPC call:

```ts
if (!UUID_RE.test(shippingRequestId)) {
  return adminErrorResponse("invalid_shipping_request", "Invalid shipping request.", 400);
}
```

Replace the RPC error branch:

```ts
if (error) {
  adminRouteErrorLog("admin shipping status update failed", error, {
    adminId: admin.id,
    shippingRequestId,
    status,
  });
  return adminShippingErrorMessage(error);
}
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run test:shipping-flow
```

Commit:

```bash
git add Website/src/app/api/ynot/admin/shipping/route.ts
git commit -m "$(cat <<'MSG'
Keep shipping RPC failures safe for admins

Constraint: Shipping state transitions must continue through update_shipping_request_status.
Rejected: Letting malformed IDs reach the RPC | route validation avoids wasted database work.
Confidence: high
Scope-risk: narrow
Directive: Preserve tracking requirements and RPC argument names.
Tested: npm run test:admin-ops-api-rpc-performance; npm run test:shipping-flow
Not-tested: Live production shipping status mutation.
MSG
)"
```

---

## Task 5: Add Bounded Top-Up Admin Listing Without Changing Review Mutations

- [ ] Extend `getTopUps()` with status and cursor options.
- [ ] Add request parsing and rate limiting to admin top-up `GET`.
- [ ] Keep `PATCH` action, request body, RPC calls, and success shape unchanged.

Update `Website/src/features/ynot/data.ts` near the existing `getTopUps()` options type:

```ts
type TopUpStatus = Database["public"]["Tables"]["top_up_requests"]["Row"]["status"];

type GetTopUpsOptions = {
  includeSensitiveSlipDetails?: boolean;
  limit?: number;
  statuses?: readonly TopUpStatus[];
  cursorCreatedAt?: string;
};
```

Inside `getTopUps()`, after the base query is created:

```ts
const statuses = Array.from(new Set(options.statuses ?? [])).filter(Boolean);
if (statuses.length > 0) {
  query = query.in("status", statuses);
}

if (options.cursorCreatedAt) {
  query = query.lt("created_at", options.cursorCreatedAt);
}
```

Update `Website/src/app/api/ynot/admin/top-ups/route.ts`:

```ts
const TOP_UP_STATUS_VALUES = new Set([
  "pending_slip",
  "pending_review",
  "approved",
  "rejected",
] as const);

function parseAdminTopUpListOptions(request: Request) {
  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.trunc(limitValue), 500)) : 200;
  const statuses = url.searchParams
    .getAll("status")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value): value is Database["public"]["Tables"]["top_up_requests"]["Row"]["status"] =>
      TOP_UP_STATUS_VALUES.has(value as Database["public"]["Tables"]["top_up_requests"]["Row"]["status"]),
    );
  const cursorCreatedAt = url.searchParams.get("cursorCreatedAt")?.trim() || undefined;

  return { limit, statuses, cursorCreatedAt };
}
```

Change `GET()` to accept a request, apply a list rate limit, and pass options:

```ts
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ topUps: [] });
  const admin = await resolveAdminSession();
  if (!admin) return adminErrorResponse("unauthorized", "Admin access required.", 401);

  const rateLimit = enforceRateLimit(`ynot:admin:top-ups:list:${admin.id}`, {
    limit: 90,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return adminErrorResponse("rate_limited", "Too many top-up list requests. Try again shortly.", 429);
  }

  const options = parseAdminTopUpListOptions(request);
  const topUps = await getTopUps(undefined, true, {
    includeSensitiveSlipDetails: true,
    ...options,
  });
  return Response.json({ topUps });
}
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run test:top-up-flow
```

Commit:

```bash
git add Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/top-ups/route.ts
git commit -m "$(cat <<'MSG'
Bound admin top-up listing work

Constraint: Review mutations must keep the existing approve and reject RPC contracts.
Rejected: Rewriting top-up review through a new endpoint | the existing RPC path is already protected and tested.
Confidence: high
Scope-risk: moderate
Directive: Keep list filters read-only and avoid changing PATCH response semantics.
Tested: npm run test:admin-ops-api-rpc-performance; npm run test:top-up-flow
Not-tested: Live production top-up review.
MSG
)"
```

---

## Task 6: Remove Duplicate Top-Up Fetch Pressure From Admin Review UI

- [ ] Create a small client console for admin top-up list state.
- [ ] Remove reviewed pending rows locally after a successful approve/reject.
- [ ] Avoid `router.refresh()` for the review action.
- [ ] Keep the review button API call exactly on `/api/ynot/admin/top-ups` with `PATCH`.

Create `Website/src/features/ynot/admin/AdminTopUpConsole.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";

import type { YnotTopUp } from "@/features/ynot/types";

import { AdminCard, AdminCardHead, AdminIcon, AdminStatusPill, TopUpTable } from "./components";

type TopUpFilter = "all" | "pending" | "approved" | "rejected" | "valid" | "mismatch" | "duplicate" | "provider_error";

type Props = {
  initialTopUps: YnotTopUp[];
  activeFilter: TopUpFilter;
};

function filterTopUps(topUps: YnotTopUp[], activeFilter: TopUpFilter) {
  if (activeFilter === "all") {
    return topUps.filter((topUp) => topUp.status === "pending_review" || topUp.status === "pending_slip");
  }
  if (activeFilter === "pending") {
    return topUps.filter((topUp) => topUp.status === "pending_review");
  }
  if (activeFilter === "approved" || activeFilter === "rejected") {
    return topUps.filter((topUp) => topUp.status === activeFilter);
  }
  return topUps.filter((topUp) => topUp.slipVerification?.status === activeFilter);
}

function AdminTopUpActions({
  topUp,
  onReviewed,
}: {
  topUp: YnotTopUp;
  onReviewed: (topUpId: string, status: "approved" | "rejected") => void;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (action: "approve" | "reject") => {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/ynot/admin/top-ups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topUpId: topUp.id, action, note }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        result?: { status?: "approved" | "rejected"; replayed?: boolean };
      } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Could not update top-up.");
        return;
      }

      const nextStatus = payload?.result?.status ?? (action === "approve" ? "approved" : "rejected");
      onReviewed(topUp.id, nextStatus);
      setNote("");
      setMessage(payload?.result?.replayed ? `${action} already recorded.` : `${action} complete.`);
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        aria-label="Admin note"
        className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submit("approve")}
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => submit("reject")}
          disabled={isPending}
          className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

export function AdminTopUpConsole({ initialTopUps, activeFilter }: Props) {
  const [topUps, setTopUps] = useState(initialTopUps);
  const visibleTopUps = useMemo(() => filterTopUps(topUps, activeFilter), [activeFilter, topUps]);
  const pendingReview = useMemo(
    () => topUps.filter((topUp) => topUp.status === "pending_review"),
    [topUps],
  );

  const handleReviewed = (topUpId: string, status: "approved" | "rejected") => {
    setTopUps((current) =>
      current.map((topUp) =>
        topUp.id === topUpId
          ? {
              ...topUp,
              status,
              reviewedAt: new Date().toISOString(),
            }
          : topUp,
      ),
    );
  };

  return (
    <section className="space-y-6">
      <AdminCard>
        <AdminCardHead icon={<AdminIcon name="wallet" />} title="Top-up review queue" />
        {pendingReview.length === 0 ? (
          <p className="text-sm text-slate-500">No pending top-ups need review.</p>
        ) : (
          <div className="space-y-4">
            {pendingReview.map((topUp) => (
              <div key={topUp.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {topUp.customer?.displayName ?? topUp.customer?.name ?? "Unknown customer"}
                    </p>
                    <p className="text-xs text-slate-500">{topUp.paymentMethod?.displayName ?? topUp.paymentMethod?.type}</p>
                  </div>
                  <AdminStatusPill status={topUp.status} />
                </div>
                <AdminTopUpActions topUp={topUp} onReviewed={handleReviewed} />
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHead icon={<AdminIcon name="wallet" />} title="Top-up history" />
        <TopUpTable topUps={visibleTopUps} admin />
      </AdminCard>
    </section>
  );
}
```

Update `Website/src/app/admin/top-ups/page.tsx`:

```tsx
import { AdminTopUpConsole } from "@/features/ynot/admin/AdminTopUpConsole";
```

Replace the inline queue and history render with:

```tsx
<AdminTopUpConsole initialTopUps={adminTopUps} activeFilter={activeFilter} />
```

Remove the old `AdminTopUpActions` import from this page. If `AdminTopUpActions` is no longer imported anywhere, remove its export from `Website/src/features/ynot/client.tsx` after confirming:

```bash
rg "AdminTopUpActions" Website/src
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run test:top-up-flow
npm run typecheck
```

Commit:

```bash
git add Website/src/features/ynot/admin/AdminTopUpConsole.tsx Website/src/app/admin/top-ups/page.tsx Website/src/features/ynot/client.tsx
git commit -m "$(cat <<'MSG'
Make admin top-up review update locally

Constraint: Top-up review must keep the same PATCH endpoint and RPC-backed mutation behavior.
Rejected: Full page refresh after every review | local state removes duplicate list fetch pressure.
Confidence: high
Scope-risk: moderate
Directive: Keep top-up review state changes limited to successful API responses.
Tested: npm run test:admin-ops-api-rpc-performance; npm run test:top-up-flow; npm run typecheck
Not-tested: Browser click-through against live admin session.
MSG
)"
```

---

## Task 7: Keep Settings and Category Admin State Fresh After Saves

- [ ] Update payment method settings state locally after save.
- [ ] Add a small category workspace only if it can reuse existing category form and manager components.
- [ ] Avoid broad page refreshes as the primary consistency mechanism.

Update `AdminPaymentMethodForm` in `Website/src/features/ynot/client.tsx`:

```tsx
const [methodOptions, setMethodOptions] = useState(paymentMethods);

useEffect(() => {
  setMethodOptions(paymentMethods);
}, [paymentMethods]);
```

Replace references that search `paymentMethods` inside the form with `methodOptions`.

After the save response:

```tsx
const payload = (await response.json().catch(() => null)) as {
  error?: string;
  paymentMethod?: YnotPaymentMethod;
} | null;

if (!response.ok) {
  setMessage(payload?.error ?? "Could not save payment method.");
  return;
}

if (payload?.paymentMethod) {
  setMethodOptions((current) => {
    const exists = current.some((method) => method.id === payload.paymentMethod?.id);
    if (exists) {
      return current.map((method) =>
        method.id === payload.paymentMethod?.id ? payload.paymentMethod : method,
      );
    }
    return [...current, payload.paymentMethod].sort((a, b) => a.sortOrder - b.sortOrder);
  });
  setSelectedId(payload.paymentMethod.id);
}
```

Update `AdminCategoryForm` in `Website/src/features/ynot/client.tsx` props:

```tsx
export function AdminCategoryForm({
  categories,
  onSaved,
}: {
  categories: YnotCategory[];
  onSaved?: (category: YnotCategory) => void;
}) {
```

After a successful category save:

```tsx
if (payload?.category) {
  onSaved?.(payload.category);
}
```

Create `Website/src/features/ynot/admin/AdminCategoryWorkspace.tsx`:

```tsx
"use client";

import { useState } from "react";

import { AdminCategoryForm } from "@/features/ynot/client";
import type { YnotCampaign, YnotCategory } from "@/features/ynot/types";

import { AdminCard, AdminCardHead, AdminCategoryManager, AdminIcon } from "./components";

type Props = {
  campaigns: YnotCampaign[];
  initialCategories: YnotCategory[];
};

export function AdminCategoryWorkspace({ campaigns, initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);

  const handleSaved = (category: YnotCategory) => {
    setCategories((current) => {
      const exists = current.some((item) => item.id === category.id);
      const next = exists
        ? current.map((item) => (item.id === category.id ? category : item))
        : [...current, category];
      return [...next].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    });
  };

  return (
    <div className="space-y-6">
      <AdminCard>
        <AdminCardHead icon={<AdminIcon name="box" />} title="Create or edit category" />
        <AdminCategoryForm categories={categories} onSaved={handleSaved} />
      </AdminCard>
      <AdminCard>
        <AdminCardHead icon={<AdminIcon name="box" />} title="Category manager" />
        <AdminCategoryManager categories={categories} campaigns={campaigns} />
      </AdminCard>
    </div>
  );
}
```

Update `Website/src/app/admin/categories/page.tsx`:

```tsx
import { AdminCategoryWorkspace } from "@/features/ynot/admin/AdminCategoryWorkspace";
```

Replace separate form and manager cards with:

```tsx
<AdminCategoryWorkspace campaigns={campaigns} initialCategories={categories} />
```

Run:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run typecheck
```

Commit:

```bash
git add Website/src/features/ynot/client.tsx Website/src/features/ynot/admin/AdminCategoryWorkspace.tsx Website/src/app/admin/categories/page.tsx
git commit -m "$(cat <<'MSG'
Keep admin settings edits in local state

Constraint: Admin save flows should reflect successful writes without unnecessary duplicate page data fetches.
Rejected: Calling router.refresh after each settings save | local state preserves responsiveness and reduces read load.
Confidence: medium
Scope-risk: moderate
Directive: Keep local state updates driven only by successful API responses.
Tested: npm run test:admin-ops-api-rpc-performance; npm run typecheck
Not-tested: Browser click-through for category and payment settings.
MSG
)"
```

---

## Task 8: Full Verification Pass

- [ ] Run targeted source-regression and existing flow tests.
- [ ] Run typecheck.
- [ ] Run a focused search to prove no new raw admin error leak was added.
- [ ] Verify top-up RPC names are unchanged.

Commands:

```bash
cd Website
npm run test:admin-ops-api-rpc-performance
npm run test:top-up-flow
npm run test:shipping-flow
npm run test:uploads
npm run typecheck
rg "error\\.message" src/app/api/ynot/admin
rg "approve_top_up_request|reject_top_up_request|update_shipping_request_status" src/app/api/ynot src/features/ynot Database
```

Expected verification:

- `test:admin-ops-api-rpc-performance` passes.
- `test:top-up-flow` passes and still sees `approve_top_up_request` and `reject_top_up_request`.
- `test:shipping-flow` passes and still sees `update_shipping_request_status`.
- `test:uploads` passes after QR route guard changes.
- `typecheck` passes.
- `rg "error\\.message" src/app/api/ynot/admin` returns no sensitive route leaks for the touched routes. If another admin route appears, inspect whether it is unrelated and record it in the final report.
- RPC search shows existing function names unchanged and no replacement mutation path.

Final commit:

```bash
git status --short
git commit -m "$(cat <<'MSG'
Verify admin ops hardening keeps RPC contracts

Constraint: Launch admin workflows require safe APIs without changing top-up or shipping mutation semantics.
Rejected: Bundling database migrations into this pass | the observed issues are route and client read behavior.
Confidence: high
Scope-risk: moderate
Directive: Re-run admin ops source-regression tests when touching top-up, shipping, payment, or category admin flows.
Tested: npm run test:admin-ops-api-rpc-performance; npm run test:top-up-flow; npm run test:shipping-flow; npm run test:uploads; npm run typecheck
Not-tested: Live production admin mutations.
MSG
)"
```

---

## Implementation Order

1. Add the failing regression test.
2. Add shared admin guard/error helpers.
3. Harden payment-method and QR upload routes.
4. Harden shipping route input and error mapping.
5. Add bounded top-up admin list filters and list rate limiting.
6. Move admin top-up review list to local state.
7. Update payment/category admin state locally after saves.
8. Run full verification and document any remaining risk.

## Expected Improvements

- Fewer duplicate admin reads after top-up review, payment save, and category save.
- Admin top-up list endpoint can be bounded by status, cursor, and limit.
- Payment settings mutations are protected as high-privilege operations.
- Shipping route rejects invalid IDs before spending a database RPC call.
- Raw Supabase/storage error messages are kept in server logs instead of API responses.
- Public top-up response boundary remains unchanged and private slip/provider details stay hidden.

## Risk Controls

- Source-regression test locks all sensitive RPC names before implementation.
- Top-up `PATCH` behavior is preserved and verified with `npm run test:top-up-flow`.
- Shipping status behavior is preserved and verified with `npm run test:shipping-flow`.
- QR upload behavior is preserved and verified with `npm run test:uploads`.
- No database migration or production data mutation is included in this plan.

## Final Report Template

Use this structure after implementation:

```md
Implemented the admin ops API/RPC performance debug plan.

Changed:
- Top-up admin listing now supports bounded filters and rate-limited reads while review mutations still call approve_top_up_request/reject_top_up_request.
- Shipping admin updates still call update_shipping_request_status, with route UUID validation and safe RPC error mapping.
- Payment method and QR settings mutations now require owner/admin access and avoid raw error leaks.
- Top-up, payment, and category admin UIs update local state after successful writes to reduce duplicate fetches.

Verified:
- npm run test:admin-ops-api-rpc-performance
- npm run test:top-up-flow
- npm run test:shipping-flow
- npm run test:uploads
- npm run typecheck

Not verified:
- Live production admin mutations.
```
