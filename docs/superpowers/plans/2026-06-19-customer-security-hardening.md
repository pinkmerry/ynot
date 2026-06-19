# Customer Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden customer-facing authentication, legacy lucky-draw APIs, customer action tokens, and CSP without changing normal customer/admin behavior.

**Architecture:** Keep existing public endpoints and UI flows stable, then add the same guardrails already used by modern YNOTT money/gacha/shipping flows: same-origin checks, verified-anchor checks for paid actions, shared rate limiting, idempotency, generic public errors, dedicated signing secrets, and regression tests. Do not change admin/owner authorization policy; only add regression checks where customer routes share RPCs with admin routes.

**Tech Stack:** Next.js App Router 16.2, React 19 server actions, Supabase service client/RPCs, Cloudflare/OpenNext middleware, Node `node:test` static regression scripts, SQL migrations.

---

## Scope Check

This plan covers several customer/intruder security concerns, but they share one boundary: public auth and customer mutation surfaces. Keep them in one plan so the final verification can prove the related APIs/RPCs still work together:

- Password and Google login public error/rate-limit behavior.
- Legacy lucky-draw order, pick, and profile endpoints.
- User-facing action-token and signup HMAC secrets.
- CSP script policy for public pages.
- Dependency audit gate.
- Related RPCs: `consume_api_rate_limit_weighted`, `claim_order_slots`, and existing modern customer RPC callers remain compatible.

Admin/owner/staff-only policy changes are out of scope. The only admin check in this plan is a regression that `src/app/api/lucky-draw/admin/order/route.ts` can still call `claim_order_slots` after the customer pick wrapper changes.

## API/RPC Map To Preserve

| Surface | Current behavior to preserve | Hardening to add |
| --- | --- | --- |
| `Website/src/features/auth/actions.ts` | Password login creates Supabase auth + YNOT session cookie; signup code flows keep their current limits. | Add password-login rate limit and generic failed-login message. Keep signup limiter behavior. |
| `Website/src/app/api/auth/google/start/route.ts` | Redirects to Supabase Google OAuth and returns to `next`. | Keep redirect flow, replace raw provider error with generic public message. |
| `Website/src/app/api/lucky-draw/route.ts` `POST` | Logged-in customer creates a legacy order, uploads slip, Slip2Go can auto-approve, response shape is `{ order }`. | Same-origin guard, verified-anchor guard, rate limit, content-length pre-buffer reject, idempotency key support, generic storage/provider errors. |
| `Website/src/features/lucky-draw/state/useLuckyDrawController.ts` | Same checkout UI and local fallback behavior. | Reuse one browser idempotency key across a retry, reset after a successful order. |
| `Database/supabase/migrations/20260619170000_legacy_lucky_draw_order_idempotency.sql` | Existing `orders` rows remain readable. | Add nullable `orders.idempotency_key` plus partial unique index on `(profile_id, idempotency_key)`. |
| `Website/src/app/api/lucky-draw/picks/route.ts` | Customer confirms slots for their approved order through `claim_order_slots`. | Rate limit, same-origin guard, profile-scoped public-code lookup, generic public error for not-found/RPC failures. |
| `Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql` | RPC blocks picking another customer order and supports admin picks. | No SQL change planned; add regression coverage. |
| `Website/src/app/api/lucky-draw/profile/route.ts` | Customer profile PII updates and default address backfill still work. | Add profile update rate limit before JSON parsing. |
| Token files under `Website/src/lib/**/**action-tokens.ts` and `pending-signup.ts` | Existing token formats stay the same (`ua_`, `pm_`, `ci_`, `ui_`, signup OTP HMAC). | Require dedicated secrets; remove service-role/auth-secret fallbacks from user-token signing. |
| `Website/src/middleware.ts` and `Website/next.config.ts` | Existing apex redirect and API same-origin mutation guard keep working. | Move CSP to request-time nonce header and remove static `script-src 'unsafe-inline'`. |

## File Structure

Create:

- `Website/scripts/test-customer-security-hardening.mjs` - static regression coverage for the customer/intruder security fixes and related API/RPC boundaries.
- `Website/src/lib/security/action-token-secret.ts` - one small helper that reads dedicated HMAC/action-token secrets with a local-dev-only fallback string that is not the service-role key.
- `Website/src/lib/security/csp.ts` - CSP nonce generation and directive builder used by middleware.
- `Database/supabase/migrations/20260619170000_legacy_lucky_draw_order_idempotency.sql` - nullable idempotency column and unique partial index for legacy lucky-draw orders.

Modify:

- `Website/package.json` - add `test:customer-security-hardening`; include it in `verify:hardening`.
- `Website/src/features/auth/actions.ts` - shared auth rate-limit helper, password login limiter, generic auth failures.
- `Website/src/app/api/auth/google/start/route.ts` - generic Google OAuth start failure.
- `Website/src/features/lucky-draw/state/useLuckyDrawController.ts` - legacy order idempotency key per retry.
- `Website/src/app/api/lucky-draw/route.ts` - paid-action guards, idempotency, content-length guard, generic public errors.
- `Website/src/lib/lucky-draw/data.ts` - profile-scoped order lookup and idempotency lookup helpers.
- `Website/src/app/api/lucky-draw/picks/route.ts` - scoped lookup, rate limit, generic error mapping.
- `Website/src/app/api/lucky-draw/profile/route.ts` - profile update rate limit.
- `Website/src/lib/supabase/types.ts` - add `orders.idempotency_key`.
- `Website/src/features/auth/pending-signup.ts` - use dedicated signup OTP secret helper.
- `Website/src/lib/auth/identity-action-tokens.ts` - use dedicated identity token secret helper.
- `Website/src/lib/ynot/address-action-tokens.ts` - use dedicated address token secret helper.
- `Website/src/lib/ynot/collection-action-tokens.ts` - use dedicated collection token secret helper.
- `Website/src/lib/ynot/payment-method-action-tokens.ts` - use dedicated payment-method token secret helper.
- `Website/tools/verification/verify-production-env.mjs` - require and sanity-check dedicated customer-token secrets.
- `Website/src/middleware.ts` - attach nonce CSP while preserving redirect/API same-origin behavior.
- `Website/next.config.ts` - keep non-CSP security headers, remove static CSP.
- `Website/src/app/layout.tsx` - force dynamic rendering for nonce CSP.
- `Website/src/app/pack-open-prototype/page.tsx` - remove `force-static` conflict or set `force-dynamic`.

---

### Task 1: Customer Security Regression Harness

**Files:**
- Create: `Website/scripts/test-customer-security-hardening.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the static regression harness**

Create `Website/scripts/test-customer-security-hardening.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function readApp(relPath) {
  return readFileSync(appPath(relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(repoPath(relPath), "utf8");
}

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end marker after ${start}: ${end}`);
  return source.slice(from, to);
}

function latestMigrationMatching(pattern) {
  const migrationDir = repoPath("Database/supabase/migrations");
  const match = readdirSync(migrationDir)
    .filter((name) => pattern.test(name))
    .sort()
    .at(-1);
  assert.ok(match, `missing migration matching ${pattern}`);
  return readRepo(`Database/supabase/migrations/${match}`);
}

test("customer security regression harness can read app, database, and test files", () => {
  assert.ok(existsSync(appPath("src/features/auth/actions.ts")));
  assert.ok(existsSync(appPath("src/app/api/lucky-draw/route.ts")));
  assert.ok(existsSync(repoPath("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql")));
});
```

- [ ] **Step 2: Add the package script**

In `Website/package.json`, add this script entry near the existing security tests:

```json
"test:customer-security-hardening": "node --test scripts/test-customer-security-hardening.mjs",
```

Update `verify:hardening` so this new test runs with the existing hardening suite:

```json
"verify:hardening": "npm run test:uploads && npm run test:production-security-regressions && npm run test:customer-security-hardening && node tools/verification/verify-hardening.mjs && node tools/verification/verify-rls-coverage.mjs",
```

- [ ] **Step 3: Run the harness**

Run:

```bash
cd Website
npm run test:customer-security-hardening
```

Expected: PASS with 1 test.

- [ ] **Step 4: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/package.json
git commit -m "Add customer security regression harness

Constraint: customer-facing security hardening needs executable guardrails before behavior changes
Confidence: high
Scope-risk: narrow
Directive: keep this script focused on public/customer and related RPC boundaries
Tested: npm run test:customer-security-hardening
Not-tested: no product code changed"
```

---

### Task 2: Password And Google Auth Hardening

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Modify: `Website/src/features/auth/actions.ts`
- Modify: `Website/src/app/api/auth/google/start/route.ts`

- [ ] **Step 1: Add the failing auth regression test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("customer auth failures are rate-limited and do not expose provider messages", () => {
  const actions = readApp("src/features/auth/actions.ts");
  const passwordBlock = blockBetween(
    actions,
    "export async function signInWithPasswordAction",
    "export async function requestPendingSignUpCodeAction",
  );

  assert.match(actions, /async function authRateLimitError/);
  assert.match(passwordBlock, /authRateLimitError\(\s*"ynot:auth:password",\s*email,/);
  assert.ok(
    passwordBlock.indexOf("authRateLimitError") < passwordBlock.indexOf("signInWithPassword"),
    "password login must consume rate limit before hitting Supabase auth",
  );
  assert.match(passwordBlock, /"Email or password is incorrect\."/);
  assert.doesNotMatch(passwordBlock, /error\?\.message/);

  const googleActionBlock = blockBetween(
    actions,
    "export async function signInWithGoogleAction",
    "export async function signOutAction",
  );
  assert.match(googleActionBlock, /logAuthServerError\("google_sign_in_start_failed", error\)/);
  assert.match(googleActionBlock, /"Google login could not start\. Please try again\."/);
  assert.doesNotMatch(googleActionBlock, /error\?\.message/);

  const googleRoute = readApp("src/app/api/auth/google/start/route.ts");
  assert.match(googleRoute, /console\.warn\("google_oauth_start_failed"/);
  assert.match(googleRoute, /"Google login could not start\. Please try again\."/);
  assert.doesNotMatch(googleRoute, /error\?\.message/);
});
```

- [ ] **Step 2: Run the auth test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "customer auth" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because `authRateLimitError` does not exist yet and the auth code still returns `error?.message`.

- [ ] **Step 3: Replace the signup-only rate-limit helper with a shared auth helper**

In `Website/src/features/auth/actions.ts`, replace `signupRequestMetadata` and `signupRateLimitError` with:

```ts
async function authRequestMetadata() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress:
      headerStore.get("cf-connecting-ip") ??
      headerStore.get("x-real-ip") ??
      forwardedFor ??
      null,
    userAgent: headerStore.get("user-agent"),
  };
}

async function authRateLimitError(
  scope: string,
  subject: string,
  unavailableMessage: string,
) {
  const metadata = await authRequestMetadata();
  const request = new Request("https://ynot.local/auth", {
    headers: {
      ...(metadata.ipAddress ? { "x-forwarded-for": metadata.ipAddress } : {}),
      ...(metadata.userAgent ? { "user-agent": metadata.userAgent } : {}),
    },
  });
  const limited = await enforceRateLimit(
    request,
    scope,
    {
      limit: 6,
      windowMs: 10 * 60 * 1000,
    },
    subject,
  );

  if (!limited) return null;
  if (limited.status === 429) {
    return "Too many requests. Please wait and try again.";
  }
  return unavailableMessage;
}
```

Then replace each call to `signupRequestMetadata()` with `authRequestMetadata()`.

Then replace each signup rate-limit call with:

```ts
const rateLimitError = await authRateLimitError(
  "ynot:signup:request",
  email,
  "Sign up is temporarily unavailable. Please try again later.",
);
```

Use the same pattern for the existing signup verify/resend scopes:

```ts
const rateLimitError = await authRateLimitError(
  "ynot:signup:verify",
  email,
  "Sign up is temporarily unavailable. Please try again later.",
);
```

```ts
const rateLimitError = await authRateLimitError(
  "ynot:signup:resend",
  email,
  "Sign up is temporarily unavailable. Please try again later.",
);
```

- [ ] **Step 4: Add password-login rate limiting and generic failed-login output**

In `signInWithPasswordAction`, insert this block after the missing email/password check and before `createSupabaseServerClient()`:

```ts
  const rateLimitError = await authRateLimitError(
    "ynot:auth:password",
    email,
    "Login is temporarily unavailable. Please try again later.",
  );
  if (rateLimitError) {
    redirect(withMessage("/login", "error", rateLimitError, nextPath));
  }
```

Replace the password auth failure branch with:

```ts
  if (error || !data.user) {
    if (error) logAuthServerError("password_sign_in_failed", error);
    redirect(
      withMessage(
        "/login",
        "error",
        "Email or password is incorrect.",
        nextPath,
      ),
    );
  }
```

- [ ] **Step 5: Make Google server-action failures generic**

In `signInWithGoogleAction`, replace the `if (error || !data.url)` branch with:

```ts
  if (error || !data.url) {
    if (error) logAuthServerError("google_sign_in_start_failed", error);
    redirect(
      withMessage(
        "/login",
        "error",
        "Google login could not start. Please try again.",
        nextPath,
      ),
    );
  }
```

- [ ] **Step 6: Make the Google route failure generic**

In `Website/src/app/api/auth/google/start/route.ts`, replace the `if (error || !data.url)` branch with:

```ts
  if (error || !data.url) {
    if (error) {
      console.warn("google_oauth_start_failed", {
        message: error.message,
      });
    }
    return redirectWith(
      request,
      nextPath,
      "error",
      "Google login could not start. Please try again.",
    );
  }
```

- [ ] **Step 7: Run targeted auth verification**

Run:

```bash
cd Website
node --test --test-name-pattern "customer auth" scripts/test-customer-security-hardening.mjs
npm run test:auth-session-hardening
npm run test:rate-limits
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/features/auth/actions.ts Website/src/app/api/auth/google/start/route.ts
git commit -m "Harden customer auth failure handling

Constraint: public auth must not leak provider details or allow unbounded password attempts
Rejected: relying only on Supabase auth throttles | app-level rate limiting protects the shared Worker/Supabase boundary
Confidence: high
Scope-risk: narrow
Directive: keep customer-facing auth errors generic and log provider details server-side only
Tested: node --test --test-name-pattern \"customer auth\" scripts/test-customer-security-hardening.mjs; npm run test:auth-session-hardening; npm run test:rate-limits
Not-tested: live Supabase auth provider response timing"
```

---

### Task 3: Legacy Order Idempotency Schema And Client Key

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Create: `Database/supabase/migrations/20260619170000_legacy_lucky_draw_order_idempotency.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/src/features/lucky-draw/state/useLuckyDrawController.ts`

- [ ] **Step 1: Add the failing schema/client idempotency test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("legacy lucky-draw orders have idempotency schema and browser retry key", () => {
  const migration = latestMigrationMatching(/legacy_lucky_draw_order_idempotency\.sql$/);
  assert.match(migration, /alter table public\.orders\s+add column if not exists idempotency_key text/i);
  assert.match(
    migration,
    /create unique index if not exists orders_profile_idempotency_unique_idx\s+on public\.orders\s*\(\s*profile_id,\s*idempotency_key\s*\)\s+where idempotency_key is not null/i,
  );

  const types = readApp("src/lib/supabase/types.ts");
  const ordersBlock = blockBetween(types, "orders: {", "payment_slips:");
  assert.match(ordersBlock, /idempotency_key: string \| null/);
  assert.match(ordersBlock, /idempotency_key\?: string \| null/);

  const controller = readApp("src/features/lucky-draw/state/useLuckyDrawController.ts");
  assert.match(controller, /const orderIdempotencyKeyRef = useRef\(""\)/);
  assert.match(controller, /orderIdempotencyKeyRef\.current = crypto\.randomUUID\(\)/);
  assert.match(controller, /form\.set\("idempotencyKey", orderIdempotencyKeyRef\.current\)/);
});
```

- [ ] **Step 2: Run the idempotency test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy lucky-draw orders have idempotency" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the migration and client idempotency key do not exist yet.

- [ ] **Step 3: Add the migration**

Create `Database/supabase/migrations/20260619170000_legacy_lucky_draw_order_idempotency.sql`:

```sql
-- Add idempotency to the legacy lucky-draw order creation path.
-- Existing rows remain valid because the column is nullable.

alter table public.orders
add column if not exists idempotency_key text;

create unique index if not exists orders_profile_idempotency_unique_idx
on public.orders(profile_id, idempotency_key)
where idempotency_key is not null;
```

- [ ] **Step 4: Update Supabase types for `orders.idempotency_key`**

In `Website/src/lib/supabase/types.ts`, inside `orders.Row`, add:

```ts
          idempotency_key: string | null;
```

Place it after `customer_note: string | null;`.

Inside `orders.Insert`, add:

```ts
          idempotency_key?: string | null;
```

Place it after `customer_note?: string | null;`.

- [ ] **Step 5: Add a retry-stable idempotency key to the legacy checkout controller**

In `Website/src/features/lucky-draw/state/useLuckyDrawController.ts`, add this ref after `pickSubmitInFlightRef`:

```ts
  const orderIdempotencyKeyRef = useRef("");
```

In `createOrder()`, immediately before `const form = new FormData();`, insert:

```ts
        if (!orderIdempotencyKeyRef.current) {
          orderIdempotencyKeyRef.current = crypto.randomUUID();
        }
```

Immediately after setting `slipName`, add:

```ts
        form.set("idempotencyKey", orderIdempotencyKeyRef.current);
```

After the successful database order response sets `setPaymentSlip(null);`, add:

```ts
          orderIdempotencyKeyRef.current = crypto.randomUUID();
```

After the local fallback sets `setPaymentSlip(null);`, add:

```ts
      orderIdempotencyKeyRef.current = crypto.randomUUID();
```

- [ ] **Step 6: Run targeted verification**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy lucky-draw orders have idempotency" scripts/test-customer-security-hardening.mjs
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add Database/supabase/migrations/20260619170000_legacy_lucky_draw_order_idempotency.sql Website/scripts/test-customer-security-hardening.mjs Website/src/lib/supabase/types.ts Website/src/features/lucky-draw/state/useLuckyDrawController.ts
git commit -m "Add legacy order idempotency contract

Constraint: legacy checkout must preserve current UI while replaying duplicate customer submits safely
Rejected: API-generated-only idempotency keys | they cannot replay a lost browser response
Confidence: high
Scope-risk: moderate
Directive: keep the idempotency key profile-scoped and nullable for old rows
Tested: node --test --test-name-pattern \"legacy lucky-draw orders have idempotency\" scripts/test-customer-security-hardening.mjs; npm run typecheck
Not-tested: linked Supabase migration apply"
```

---

### Task 4: Legacy Order API Paid-Action Guardrails

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Modify: `Website/src/app/api/lucky-draw/route.ts`
- Modify: `Website/src/lib/lucky-draw/data.ts`

- [ ] **Step 1: Add the failing legacy order API test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("legacy lucky-draw order POST uses modern paid-action guardrails", () => {
  const route = readApp("src/app/api/lucky-draw/route.ts");
  const postBlock = blockBetween(route, "export async function POST", "  const localDuplicateSlip");

  assert.match(route, /import \{ requireVerifiedAnchor \} from "@\/lib\/auth\/verified-anchor"/);
  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(route, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(route, /LEGACY_ORDER_IDEMPOTENCY_KEY_RE/);
  assert.match(route, /normalizeLegacyOrderIdempotencyKey/);
  assert.match(route, /fetchOrderByProfileIdempotency/);
  assert.match(route, /replayLegacyOrderResponse/);

  assert.ok(
    postBlock.indexOf("enforceSameOriginMutation(request)") < postBlock.indexOf("resolveCurrentProfile()"),
    "same-origin guard must run before auth work",
  );
  assert.match(postBlock, /requireVerifiedAnchor\(session\)/);
  assert.match(postBlock, /enforceRateLimit\(\s*request,\s*"ynot:legacy-order:create",\s*\{\s*limit:\s*6,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.ok(
    postBlock.indexOf("content-length") < postBlock.indexOf("readCreateOrderRequest(request)"),
    "content-length reject must happen before multipart parsing",
  );
  assert.match(postBlock, /idempotency_key: idempotencyKey/);
  assert.doesNotMatch(postBlock, /uploadError\.message/);
});
```

- [ ] **Step 2: Run the legacy order API test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy lucky-draw order POST" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the route does not yet have the paid-action guardrails.

- [ ] **Step 3: Add order idempotency helpers to lucky-draw data**

In `Website/src/lib/lucky-draw/data.ts`, add this helper after `findOrderByPublicCode`:

```ts
export async function fetchOrderByProfileIdempotency(
  supabase: Supabase,
  profileId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("profile_id", profileId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Add imports and request fields in the legacy order route**

In `Website/src/app/api/lucky-draw/route.ts`, update imports:

```ts
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
```

Extend the existing lucky-draw data import to include `fetchOrderByProfileIdempotency`:

```ts
import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import { fetchOrderByProfileIdempotency, getActiveDraw, getLuckyDrawState, isSupabaseConfigured, toOrder } from "@/lib/lucky-draw/data";
```

Extend `CreateOrderBody`:

```ts
type CreateOrderBody = {
  quantity?: unknown;
  slipName?: unknown;
  customerNote?: unknown;
  idempotencyKey?: unknown;
};
```

Add constants and helpers after `const slipBucketName = "payment-slips";`:

```ts
const LEGACY_ORDER_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_-]{16,180}$/;

function normalizeLegacyOrderIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return crypto.randomUUID();
  }
  const clean = value.trim();
  return LEGACY_ORDER_IDEMPOTENCY_KEY_RE.test(clean) ? clean : null;
}
```

Update the return type of `readCreateOrderRequest` so it includes `idempotencyKey`:

```ts
  idempotencyKey: string | null;
```

In the multipart branch, add:

```ts
      idempotencyKey: normalizeLegacyOrderIdempotencyKey(form.get("idempotencyKey")),
```

In the JSON branch, add:

```ts
    idempotencyKey: normalizeLegacyOrderIdempotencyKey(body.idempotencyKey),
```

- [ ] **Step 5: Add a replay response helper**

In `Website/src/app/api/lucky-draw/route.ts`, add this helper before `export async function GET()`:

```ts
async function latestSlipForOrder(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("payment_slips")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function replayLegacyOrderResponse(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  order: NonNullable<Awaited<ReturnType<typeof fetchOrderByProfileIdempotency>>>,
  lineName?: string | null,
) {
  const slip = await latestSlipForOrder(supabase, order.id);
  return jsonNoStore({
    order: toOrder({
      order,
      lineName,
      slipName: slip?.original_filename ?? "manual-transfer",
      slipProvider: slip?.storage_provider ?? "manual_line",
      slipFilePath: slip?.file_path ?? null,
      slipVerificationStatus: slip?.verification_status ?? "manual_review",
      slipProviderCode: slip?.provider_code ?? null,
      slipProviderMessage: slip?.provider_message ?? null,
      slots: [],
    }),
    replayed: true,
  });
}
```

- [ ] **Step 6: Add paid-action guards before parsing the body**

In `POST`, immediately after the Supabase configured check, insert:

```ts
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
```

After the login check, insert:

```ts
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;

  const limited = await enforceRateLimit(
    request,
    "ynot:legacy-order:create",
    { limit: 6, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSlipBytes + 64 * 1024) {
    return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 413 });
  }
```

- [ ] **Step 7: Use the idempotency key before side effects**

After parsing the body, replace:

```ts
  const { quantity, slipName, customerNote, slipFile } = parsed;
```

with:

```ts
  const { quantity, slipName, customerNote, slipFile, idempotencyKey } = parsed;
  if (!idempotencyKey) {
    return jsonNoStore({ error: "Invalid idempotency key." }, { status: 400 });
  }
```

Immediately after `const supabase = createServiceSupabaseClient();`, add:

```ts
  const existingOrder = await fetchOrderByProfileIdempotency(
    supabase,
    session.profileId,
    idempotencyKey,
  );
  if (existingOrder) {
    return replayLegacyOrderResponse(
      supabase,
      existingOrder,
      session.displayName,
    );
  }
```

In the `orders.insert` payload, add:

```ts
      idempotency_key: idempotencyKey,
```

After `const { data: order, error: orderError } = ...`, replace the error branch with:

```ts
  if (orderError) {
    const replayOrder = await fetchOrderByProfileIdempotency(
      supabase,
      session.profileId,
      idempotencyKey,
    );
    if (replayOrder) {
      return replayLegacyOrderResponse(
        supabase,
        replayOrder,
        session.displayName,
      );
    }
    throw orderError;
  }
```

- [ ] **Step 8: Make storage upload failure generic**

Replace:

```ts
      return Response.json({ error: uploadError.message }, { status: 500 });
```

with:

```ts
      console.warn("legacy_order_slip_upload_failed", {
        orderPublicCode: order.public_code,
        message: uploadError.message,
      });
      return jsonNoStore(
        { error: "Could not upload this slip. Please try again." },
        { status: 500 },
      );
```

- [ ] **Step 9: Run targeted verification**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy lucky-draw order POST" scripts/test-customer-security-hardening.mjs
npm run test:uploads
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 10: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/app/api/lucky-draw/route.ts Website/src/lib/lucky-draw/data.ts
git commit -m "Harden legacy lucky draw order creation

Constraint: old checkout endpoint must keep returning the existing order DTO while adopting modern paid-action guards
Rejected: deleting the legacy endpoint | current customer UI still posts to it
Confidence: medium
Scope-risk: moderate
Directive: keep replay responses scoped to profile_id plus idempotency_key
Tested: node --test --test-name-pattern \"legacy lucky-draw order POST\" scripts/test-customer-security-hardening.mjs; npm run test:uploads; npm run typecheck
Not-tested: live Slip2Go provider response"
```

---

### Task 5: Customer Pick Route No-Oracle Hardening

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Modify: `Website/src/lib/lucky-draw/data.ts`
- Modify: `Website/src/app/api/lucky-draw/picks/route.ts`

- [ ] **Step 1: Add the failing pick-route test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("legacy customer pick route is rate-limited and not a public-code oracle", () => {
  const data = readApp("src/lib/lucky-draw/data.ts");
  assert.match(data, /export async function findOrderByPublicCodeForProfile/);
  assert.match(data, /\.eq\("public_code", publicCode\)[\s\S]*\.eq\("profile_id", profileId\)/);

  const route = readApp("src/app/api/lucky-draw/picks/route.ts");
  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(route, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(route, /findOrderByPublicCodeForProfile/);
  assert.doesNotMatch(route, /findOrderByPublicCode\(supabase, body\.orderId\)/);
  assert.match(route, /enforceRateLimit\(\s*request,\s*"ynot:legacy-picks:confirm",\s*\{\s*limit:\s*30,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.match(route, /"Could not confirm selected numbers\. Please refresh and try again\."/);
  assert.doesNotMatch(route, /error\.message/);

  const claimRpc = readRepo("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql");
  assert.match(claimRpc, /locked_order\.profile_id is distinct from p_actor_profile_id/);
  assert.match(claimRpc, /not_allowed_to_pick_for_order/);

  const adminOrderRoute = readApp("src/app/api/lucky-draw/admin/order/route.ts");
  assert.match(adminOrderRoute, /claim_order_slots/);
  assert.match(adminOrderRoute, /p_actor_admin_id: session\.adminId/);
});
```

- [ ] **Step 2: Run the pick-route test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy customer pick route" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the profile-scoped lookup and route limiter do not exist yet.

- [ ] **Step 3: Add a profile-scoped lookup helper**

In `Website/src/lib/lucky-draw/data.ts`, add this helper after `findOrderByPublicCode`:

```ts
export async function findOrderByPublicCodeForProfile(
  supabase: Supabase,
  publicCode: string,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("public_code", publicCode)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Harden `picks/route.ts`**

Replace the imports in `Website/src/app/api/lucky-draw/picks/route.ts` with:

```ts
import { findOrderByPublicCodeForProfile, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
```

Add this helper below `type PickBody`:

```ts
const pickFailureMessage = "Could not confirm selected numbers. Please refresh and try again.";
```

After the configured check in `POST`, insert:

```ts
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
```

After the login check, insert:

```ts
  const limited = await enforceRateLimit(
    request,
    "ynot:legacy-picks:confirm",
    { limit: 30, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;
```

Replace:

```ts
  const order = await findOrderByPublicCode(supabase, body.orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }
```

with:

```ts
  const order = await findOrderByPublicCodeForProfile(
    supabase,
    body.orderId,
    session.profileId,
  );
  if (!order) {
    return Response.json({ error: pickFailureMessage }, { status: 404 });
  }
```

Replace:

```ts
    return Response.json({ error: "Select exactly the number of slots in this order." }, { status: 400 });
```

with:

```ts
    return Response.json({ error: pickFailureMessage }, { status: 400 });
```

Replace:

```ts
  if (error) {
    return Response.json({ error: error.message }, { status: 409 });
  }
```

with:

```ts
  if (error) {
    console.warn("legacy_customer_pick_failed", {
      profileId: session.profileId,
      orderPublicCode: body.orderId,
      message: error.message,
    });
    return Response.json({ error: pickFailureMessage }, { status: 409 });
  }
```

- [ ] **Step 5: Run targeted verification**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy customer pick route" scripts/test-customer-security-hardening.mjs
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/lib/lucky-draw/data.ts Website/src/app/api/lucky-draw/picks/route.ts
git commit -m "Remove customer pick order-code oracle

Constraint: customer picks share claim_order_slots with admin picks, so the API wrapper must tighten customer lookup without changing the RPC
Rejected: changing claim_order_slots | database ownership checks are already correct and admin picks depend on the existing signature
Confidence: high
Scope-risk: narrow
Directive: keep customer order lookup scoped by public_code and profile_id
Tested: node --test --test-name-pattern \"legacy customer pick route\" scripts/test-customer-security-hardening.mjs; npm run typecheck
Not-tested: manual browser slot-pick retry"
```

---

### Task 6: Legacy Profile PATCH Rate Limit

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Modify: `Website/src/app/api/lucky-draw/profile/route.ts`

- [ ] **Step 1: Add the failing profile limiter test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("legacy profile PATCH keeps PII scoped and rate-limited", () => {
  const route = readApp("src/app/api/lucky-draw/profile/route.ts");
  const patchBlock = blockBetween(route, "export async function PATCH", "    let body: ProfileBody");

  assert.match(route, /import \{ enforceRateLimit \} from "@\/lib\/security\/rate-limit"/);
  assert.match(patchBlock, /enforceSameOriginMutation\(request\)/);
  assert.match(patchBlock, /resolveCurrentProfile\(\)/);
  assert.match(patchBlock, /enforceRateLimit\(\s*request,\s*"ynot:legacy-profile:update",\s*\{\s*limit:\s*12,\s*windowMs:\s*60_000\s*\},\s*session\.profileId/);
  assert.ok(
    patchBlock.indexOf("enforceRateLimit") < patchBlock.indexOf("request.json()"),
    "profile write limiter must run before parsing and updating PII",
  );
});
```

- [ ] **Step 2: Run the profile limiter test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy profile PATCH" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the profile route has same-origin/session checks but no rate limit.

- [ ] **Step 3: Add the limiter**

In `Website/src/app/api/lucky-draw/profile/route.ts`, add:

```ts
import { enforceRateLimit } from "@/lib/security/rate-limit";
```

After the session check in `PATCH`, insert:

```ts
    const limited = await enforceRateLimit(
      request,
      "ynot:legacy-profile:update",
      { limit: 12, windowMs: 60_000 },
      session.profileId,
    );
    if (limited) return limited;
```

- [ ] **Step 4: Run targeted verification**

Run:

```bash
cd Website
node --test --test-name-pattern "legacy profile PATCH" scripts/test-customer-security-hardening.mjs
npm run test:personal-info
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/app/api/lucky-draw/profile/route.ts
git commit -m "Rate-limit customer profile PII updates

Constraint: profile PATCH already scopes writes to session.profileId and must keep the same response shape
Confidence: high
Scope-risk: narrow
Directive: run the limiter before parsing customer PII
Tested: node --test --test-name-pattern \"legacy profile PATCH\" scripts/test-customer-security-hardening.mjs; npm run test:personal-info; npm run typecheck
Not-tested: live browser address backfill"
```

---

### Task 7: Dedicated User Token Secrets

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Create: `Website/src/lib/security/action-token-secret.ts`
- Modify: `Website/src/features/auth/pending-signup.ts`
- Modify: `Website/src/lib/auth/identity-action-tokens.ts`
- Modify: `Website/src/lib/ynot/address-action-tokens.ts`
- Modify: `Website/src/lib/ynot/collection-action-tokens.ts`
- Modify: `Website/src/lib/ynot/payment-method-action-tokens.ts`
- Modify: `Website/tools/verification/verify-production-env.mjs`

- [ ] **Step 1: Add the failing dedicated-secret test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("customer action tokens use dedicated secrets instead of service-role fallbacks", () => {
  const helper = readApp("src/lib/security/action-token-secret.ts");
  assert.match(helper, /export function dedicatedActionTokenSecret/);
  assert.doesNotMatch(helper, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(helper, /dev-local-\$\{envKey\.toLowerCase\(\)\}-secret/);

  for (const file of [
    "src/features/auth/pending-signup.ts",
    "src/lib/auth/identity-action-tokens.ts",
    "src/lib/ynot/address-action-tokens.ts",
    "src/lib/ynot/collection-action-tokens.ts",
    "src/lib/ynot/payment-method-action-tokens.ts",
  ]) {
    const source = readApp(file);
    assert.match(source, /dedicatedActionTokenSecret/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /AUTH_SECRET/);
    assert.doesNotMatch(source, /NEXTAUTH_SECRET/);
  }

  const envVerifier = readApp("tools/verification/verify-production-env.mjs");
  for (const name of [
    "SIGNUP_OTP_SECRET",
    "YNOT_IDENTITY_ACTION_TOKEN_SECRET",
    "YNOT_COLLECTION_ACTION_TOKEN_SECRET",
    "YNOT_ADDRESS_ACTION_TOKEN_SECRET",
    "YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET",
  ]) {
    assert.match(envVerifier, new RegExp(`"${name}"`));
  }
  assert.match(envVerifier, /DEDICATED_CUSTOMER_TOKEN_SECRETS/);
  assert.match(envVerifier, /is separate from SUPABASE_SERVICE_ROLE_KEY/);
});
```

- [ ] **Step 2: Run the dedicated-secret test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "customer action tokens use dedicated secrets" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the helper does not exist and token files still include fallback secret names.

- [ ] **Step 3: Create the dedicated-secret helper**

Create `Website/src/lib/security/action-token-secret.ts`:

```ts
import "server-only";

export function dedicatedActionTokenSecret(envKey: string) {
  const value = process.env[envKey]?.trim();
  if (value) return value;

  if (process.env.NODE_ENV !== "production") {
    return `dev-local-${envKey.toLowerCase()}-secret`;
  }

  throw new Error(`Missing dedicated customer token secret: ${envKey}`);
}
```

- [ ] **Step 4: Update signup OTP signing**

In `Website/src/features/auth/pending-signup.ts`, add:

```ts
import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
```

Replace the entire `signupSecret()` function with:

```ts
function signupSecret() {
  return dedicatedActionTokenSecret("SIGNUP_OTP_SECRET");
}
```

- [ ] **Step 5: Update identity action tokens**

In `Website/src/lib/auth/identity-action-tokens.ts`, add:

```ts
import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
```

Delete `IDENTITY_ACTION_TOKEN_SECRET_ENV_KEYS`.

Replace `identityActionTokenSecret()` with:

```ts
function identityActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_IDENTITY_ACTION_TOKEN_SECRET");
}
```

- [ ] **Step 6: Update address action tokens**

In `Website/src/lib/ynot/address-action-tokens.ts`, add:

```ts
import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
```

Delete `ADDRESS_ACTION_TOKEN_SECRET_ENV_KEYS`.

Replace `addressActionTokenSecret()` with:

```ts
function addressActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_ADDRESS_ACTION_TOKEN_SECRET");
}
```

- [ ] **Step 7: Update collection action tokens**

In `Website/src/lib/ynot/collection-action-tokens.ts`, add:

```ts
import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
```

Delete `COLLECTION_ACTION_TOKEN_SECRET_ENV_KEYS`.

Replace `collectionActionTokenSecret()` with:

```ts
function collectionActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_COLLECTION_ACTION_TOKEN_SECRET");
}
```

- [ ] **Step 8: Update payment-method action tokens**

In `Website/src/lib/ynot/payment-method-action-tokens.ts`, add:

```ts
import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
```

Delete `PAYMENT_METHOD_ACTION_TOKEN_SECRET_ENV_KEYS`.

Replace `paymentMethodActionTokenSecret()` with:

```ts
function paymentMethodActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET");
}
```

- [ ] **Step 9: Require dedicated secrets in production verification**

In `Website/tools/verification/verify-production-env.mjs`, add this constant after `REQUIRED_SECRETS`:

```js
const DEDICATED_CUSTOMER_TOKEN_SECRETS = [
  "SIGNUP_OTP_SECRET",
  "YNOT_IDENTITY_ACTION_TOKEN_SECRET",
  "YNOT_COLLECTION_ACTION_TOKEN_SECRET",
  "YNOT_ADDRESS_ACTION_TOKEN_SECRET",
  "YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET",
];
```

Append the dedicated secrets to required-secret checking by replacing:

```js
for (const name of REQUIRED_SECRETS) {
  check(`secret ${name} is set`, Boolean(env[name]?.length), "secret missing");
}
```

with:

```js
for (const name of [...REQUIRED_SECRETS, ...DEDICATED_CUSTOMER_TOKEN_SECRETS]) {
  check(`secret ${name} is set`, Boolean(env[name]?.length), "secret missing");
}
```

After the `LINE_SESSION_SECRET` checks, add:

```js
for (const name of DEDICATED_CUSTOMER_TOKEN_SECRETS) {
  if (!env[name]) continue;
  check(
    `${name} length >= 32 chars`,
    env[name].length >= 32,
    "use at least 32 random characters",
  );
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    check(
      `${name} is separate from SUPABASE_SERVICE_ROLE_KEY`,
      env[name] !== env.SUPABASE_SERVICE_ROLE_KEY,
      "dedicated customer token secrets must not reuse the service-role key",
    );
  }
}
```

- [ ] **Step 10: Run targeted verification**

Run:

```bash
cd Website
node --test --test-name-pattern "customer action tokens use dedicated secrets" scripts/test-customer-security-hardening.mjs
npm run test:personal-info
npm run test:reward-conversion-flow
npm run test:shipping-flow
npm run test:top-up-flow
npm run typecheck
```

Expected: all commands PASS. Local tests use the dev-only deterministic fallback from `dedicatedActionTokenSecret`; production verification requires real secrets.

- [ ] **Step 11: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/lib/security/action-token-secret.ts Website/src/features/auth/pending-signup.ts Website/src/lib/auth/identity-action-tokens.ts Website/src/lib/ynot/address-action-tokens.ts Website/src/lib/ynot/collection-action-tokens.ts Website/src/lib/ynot/payment-method-action-tokens.ts Website/tools/verification/verify-production-env.mjs
git commit -m "Use dedicated customer token secrets

Constraint: customer action-token signing must not share the service-role blast radius
Rejected: keeping AUTH_SECRET/NEXTAUTH_SECRET fallbacks | unrelated auth secret rotation would invalidate customer action tokens
Confidence: high
Scope-risk: moderate
Directive: production must set each dedicated secret before deploy
Tested: node --test --test-name-pattern \"customer action tokens use dedicated secrets\" scripts/test-customer-security-hardening.mjs; npm run test:personal-info; npm run test:reward-conversion-flow; npm run test:shipping-flow; npm run test:top-up-flow; npm run typecheck
Not-tested: production secret inventory"
```

---

### Task 8: Strict Customer CSP With Request Nonce

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`
- Create: `Website/src/lib/security/csp.ts`
- Modify: `Website/src/middleware.ts`
- Modify: `Website/next.config.ts`
- Modify: `Website/src/app/layout.tsx`
- Modify: `Website/src/app/pack-open-prototype/page.tsx`

- [ ] **Step 1: Read the local Next CSP guide before editing**

Run:

```bash
cd Website
sed -n '34,120p;179,200p;385,430p;544,585p' node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
```

Expected: the output explains nonce-based CSP through request-time proxy/middleware headers, automatic nonce extraction, and the dynamic-rendering requirement.

- [ ] **Step 2: Add the failing CSP regression test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("production CSP uses request nonces instead of unsafe inline scripts", () => {
  const csp = readApp("src/lib/security/csp.ts");
  assert.match(csp, /export const nonceHeaderName = "x-nonce"/);
  assert.match(csp, /export function createCspNonce/);
  assert.match(csp, /export function buildContentSecurityPolicy/);
  assert.match(csp, /`'nonce-\$\{nonce\}'`/);
  assert.match(csp, /"'strict-dynamic'"/);
  assert.doesNotMatch(csp, /script-src[\s\S]*'unsafe-inline'/);

  const middleware = readApp("src/middleware.ts");
  assert.match(middleware, /buildContentSecurityPolicy/);
  assert.match(middleware, /createCspNonce/);
  assert.match(middleware, /requestHeaders\.set\(nonceHeaderName, nonce\)/);
  assert.match(middleware, /response\.headers\.set\("Content-Security-Policy", cspHeader\)/);

  const nextConfig = readApp("next.config.ts");
  assert.doesNotMatch(nextConfig, /Content-Security-Policy/);
  assert.doesNotMatch(nextConfig, /script-src[\s\S]*'unsafe-inline'/);

  const rootLayout = readApp("src/app/layout.tsx");
  assert.match(rootLayout, /export const dynamic = "force-dynamic"/);

  const prototype = readApp("src/app/pack-open-prototype/page.tsx");
  assert.doesNotMatch(prototype, /force-static/);
});
```

- [ ] **Step 3: Run the CSP test and verify it fails**

Run:

```bash
cd Website
node --test --test-name-pattern "production CSP uses request nonces" scripts/test-customer-security-hardening.mjs
```

Expected: FAIL because the CSP helper does not exist and `next.config.ts` still contains static `script-src 'unsafe-inline'`.

- [ ] **Step 4: Create the CSP helper**

Create `Website/src/lib/security/csp.ts`:

```ts
export const nonceHeaderName = "x-nonce";

export function createCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: {
  nonce: string;
  isDevelopment: boolean;
}) {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://static.line-scdn.net",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const styleSrc = [
    "'self'",
    isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`,
    "https://fonts.googleapis.com",
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.line.me https://access.line.me",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://liff.line.me https://access.line.me",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://access.line.me",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
```

- [ ] **Step 5: Attach nonce CSP in middleware without breaking existing guards**

In `Website/src/middleware.ts`, add:

```ts
import {
  buildContentSecurityPolicy,
  createCspNonce,
  nonceHeaderName,
} from "@/lib/security/csp";
```

Add these helpers above `export async function middleware`:

```ts
function cspContext(request: NextRequest) {
  const nonce = createCspNonce();
  const cspHeader = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(nonceHeaderName, nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);
  return { cspHeader, requestHeaders };
}

function withCspResponse<T extends NextResponse>(
  response: T,
  cspHeader: string,
) {
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

function nextWithCsp(requestHeaders: Headers, cspHeader: string) {
  return withCspResponse(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    cspHeader,
  );
}
```

At the top of `middleware`, add:

```ts
  const { cspHeader, requestHeaders } = cspContext(request);
```

Replace:

```ts
    return NextResponse.redirect(url, 308);
```

with:

```ts
    return withCspResponse(NextResponse.redirect(url, 308), cspHeader);
```

Replace:

```ts
    if (blocked) return blocked;
    return NextResponse.next();
```

with:

```ts
    if (blocked) return withCspResponse(blocked, cspHeader);
    return nextWithCsp(requestHeaders, cspHeader);
```

Replace the final `return NextResponse.next();` with:

```ts
  return nextWithCsp(requestHeaders, cspHeader);
```

- [ ] **Step 6: Remove static CSP from `next.config.ts`**

In `Website/next.config.ts`, delete:

```ts
const isDevelopment = process.env.NODE_ENV === "development";

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  "https://static.line-scdn.net",
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.line.me https://access.line.me",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://liff.line.me https://access.line.me",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://access.line.me",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");
```

Remove this entry from `securityHeaders`:

```ts
  { key: "Content-Security-Policy", value: cspDirectives },
```

Keep HSTS, frame options, content type options, referrer policy, and permissions policy.

- [ ] **Step 7: Force dynamic rendering for nonce support**

In `Website/src/app/layout.tsx`, add after the imports:

```ts
export const dynamic = "force-dynamic";
```

In `Website/src/app/pack-open-prototype/page.tsx`, replace:

```ts
export const dynamic = "force-static";
```

with:

```ts
export const dynamic = "force-dynamic";
```

- [ ] **Step 8: Run targeted CSP verification**

Run:

```bash
cd Website
node --test --test-name-pattern "production CSP uses request nonces" scripts/test-customer-security-hardening.mjs
npm run test:production-security-regressions
npm run typecheck
npm run cf:build:website
```

Expected: all commands PASS. The Cloudflare build is required because nonce CSP touches middleware and rendering mode.

- [ ] **Step 9: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs Website/src/lib/security/csp.ts Website/src/middleware.ts Website/next.config.ts Website/src/app/layout.tsx Website/src/app/pack-open-prototype/page.tsx
git commit -m "Move production CSP to request nonces

Constraint: Next nonce CSP requires request-time headers and dynamic rendering
Rejected: leaving script-src unsafe-inline | it weakens XSS containment for customer pages
Confidence: medium
Scope-risk: moderate
Directive: keep CSP changes gated by cf:build and browser smoke checks before deploy
Tested: node --test --test-name-pattern \"production CSP uses request nonces\" scripts/test-customer-security-hardening.mjs; npm run test:production-security-regressions; npm run typecheck; npm run cf:build:website
Not-tested: live browser CSP violation console on production domain"
```

---

### Task 9: Related Customer API/RPC Regression Sweep

**Files:**
- Modify: `Website/scripts/test-customer-security-hardening.mjs`

- [ ] **Step 1: Add the related API/RPC boundary test**

Append this test to `Website/scripts/test-customer-security-hardening.mjs`:

```js
test("related customer APIs and RPCs keep their existing guardrails", () => {
  for (const [file, scope] of [
    ["src/app/api/ynot/wallet/route.ts", "ynot:wallet:top-up"],
    ["src/app/api/ynot/shipping/route.ts", "ynot:shipping:request"],
    ["src/lib/ynot/card-conversion-api.ts", "ynot:convert:submit"],
  ]) {
    const source = readApp(file);
    assert.match(source, /enforceSameOriginMutation\(request\)/, `${file} missing same-origin guard`);
    assert.match(source, /requireVerifiedAnchor\(session\)/, `${file} missing verified-anchor guard`);
    assert.match(source, new RegExp(`"${scope}"`), `${file} missing rate-limit scope ${scope}`);
    assert.match(source, /p_idempotency_key: idempotencyKey/, `${file} missing idempotency RPC argument`);
  }

  const gachaOpen = readApp("src/app/api/ynot/gacha/open/route.ts");
  assert.match(gachaOpen, /enforceSameOriginMutation\(request\)/);
  assert.match(gachaOpen, /requireVerifiedAnchor\(session\)/);
  assert.match(gachaOpen, /gachaOpenRequestRateLimit\.scope/);
  assert.match(gachaOpen, /gachaOpenProfileUnitRateLimit\.scope[\s\S]*cost: quantity/);
  assert.match(gachaOpen, /gachaOpenIpUnitRateLimit\.scope[\s\S]*cost: quantity/);
  assert.match(gachaOpen, /p_idempotency_key: idempotencyKey/);

  const rateLimitRpc = readRepo("Database/supabase/migrations/20260607011459_weighted_api_rate_limit.sql");
  assert.match(rateLimitRpc, /consume_api_rate_limit_weighted/);
  assert.match(rateLimitRpc, /p_cost integer default 1/);
  assert.match(rateLimitRpc, /grant execute on function public\.consume_api_rate_limit_weighted\(text, integer, integer, integer\) to service_role/);

  const claimRpc = readRepo("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql");
  assert.match(claimRpc, /locked_order\.profile_id is distinct from p_actor_profile_id/);
  assert.match(claimRpc, /grant execute on function public\.claim_order_slots\(uuid, integer\[\], uuid, uuid\) to service_role/);
});
```

- [ ] **Step 2: Run the related API/RPC test**

Run:

```bash
cd Website
node --test --test-name-pattern "related customer APIs and RPCs" scripts/test-customer-security-hardening.mjs
```

Expected: PASS. If it fails, inspect the named route before changing assertions; the purpose is to catch accidental regression in modern routes while fixing legacy ones.

- [ ] **Step 3: Run the existing customer flow suites**

Run:

```bash
cd Website
npm run test:top-up-flow
npm run test:reward-conversion-flow
npm run test:shipping-flow
npm run test:gacha-open-launch-safety
npm run test:pack-opening-flow
npm run test:rate-limits
```

Expected: all commands PASS.

- [ ] **Step 4: Commit**

```bash
git add Website/scripts/test-customer-security-hardening.mjs
git commit -m "Add related customer API RPC guardrail tests

Constraint: legacy security fixes must not weaken wallet, gacha, conversion, shipping, or shared RPC protections
Confidence: high
Scope-risk: narrow
Directive: update this test only when a route intentionally changes its public mutation contract
Tested: node --test --test-name-pattern \"related customer APIs and RPCs\" scripts/test-customer-security-hardening.mjs; npm run test:top-up-flow; npm run test:reward-conversion-flow; npm run test:shipping-flow; npm run test:gacha-open-launch-safety; npm run test:pack-opening-flow; npm run test:rate-limits
Not-tested: live linked Supabase RPC execution"
```

---

### Task 10: Dependency Audit And Full Verification

**Files:**
- Modify: `Website/package-lock.json` only when `npm audit fix --package-lock-only --omit=dev` changes it.

- [ ] **Step 1: Run the dependency audit**

Run:

```bash
cd Website
npm audit --omit=dev
```

Expected: PASS with zero production dependency vulnerabilities.

- [ ] **Step 2: Refresh the lockfile when audit reports fixable production advisories**

Run this only when Step 1 returns vulnerability advisories rather than a registry/DNS transport error:

```bash
cd Website
npm audit fix --package-lock-only --omit=dev
npm install
npm audit --omit=dev
```

Expected: final audit PASS. If `npm audit fix` updates `package-lock.json`, include it in the commit for this task.

- [ ] **Step 3: Record transport failure separately from vulnerability failure**

When Step 1 fails with a registry transport error such as `ENOTFOUND registry.npmjs.org`, run:

```bash
cd Website
npm audit --omit=dev
```

Expected: PASS on retry. If the second attempt has the same transport error, stop this task with a verification gap named `npm audit unavailable due registry DNS`, then continue the local test/build verification in Step 4.

- [ ] **Step 4: Run the full customer security verification set**

Run:

```bash
cd Website
npm run test:customer-security-hardening
npm run test:auth-session-hardening
npm run test:production-security-regressions
npm run test:rate-limits
npm run test:personal-info
npm run test:top-up-flow
npm run test:reward-conversion-flow
npm run test:shipping-flow
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:pack-opening-flow
npm run test:pack-open-privacy
npm run typecheck
npm run cf:build:website
```

Expected: all commands PASS.

- [ ] **Step 5: Check migration/RPC status without applying production changes**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
supabase migration list --linked
```

Expected: command returns the linked migration state. Do not apply the new migration in this task unless the user explicitly asks for production/Supabase apply. If linked credentials are unavailable, record the gap as `linked Supabase migration status not verified`.

- [ ] **Step 6: Commit dependency lockfile changes when present**

If `package-lock.json` changed in Step 2:

```bash
git add Website/package-lock.json
git commit -m "Refresh production dependency audit lockfile

Constraint: customer security hardening must leave npm audit clean for production dependencies
Confidence: medium
Scope-risk: narrow
Directive: keep dependency updates limited to audit-required lockfile changes
Tested: npm audit --omit=dev; full customer security verification set
Not-tested: production deploy"
```

If `package-lock.json` did not change, do not create an empty commit.

---

## Final Execution Checklist

- [ ] New regression script passes: `npm run test:customer-security-hardening`.
- [ ] Auth tests pass: `npm run test:auth-session-hardening`.
- [ ] Existing production security tests pass: `npm run test:production-security-regressions`.
- [ ] Rate-limit tests pass: `npm run test:rate-limits`.
- [ ] Customer profile/address tests pass: `npm run test:personal-info`.
- [ ] Wallet/top-up flow tests pass: `npm run test:top-up-flow`.
- [ ] Conversion tests pass: `npm run test:reward-conversion-flow`.
- [ ] Shipping tests pass: `npm run test:shipping-flow`.
- [ ] Gacha and pack opening tests pass: `npm run test:gacha-open-launch-safety`, `npm run test:gacha-open-performance`, `npm run test:pack-opening-flow`, `npm run test:pack-open-privacy`.
- [ ] TypeScript passes: `npm run typecheck`.
- [ ] Cloudflare website build passes: `npm run cf:build:website`.
- [ ] Production dependency audit passes, or the final report names a registry transport failure separately from vulnerability advisories.
- [ ] Linked Supabase migration status is inspected; production migration apply remains a separate explicit action.

## Self-Review

Spec coverage:

- Password-login rate limit and generic auth errors: Task 2.
- Legacy lucky-draw order upload/order spam hardening: Tasks 3 and 4.
- Legacy pick order-code enumeration hardening: Task 5.
- Legacy profile write limiter: Task 6.
- Dedicated token/signup secrets: Task 7.
- CSP `script-src 'unsafe-inline'` removal with Next nonce constraints: Task 8.
- Related API/RPC regression coverage: Task 9.
- Dependency audit and full verification: Task 10.

Marker scan:

- The plan contains concrete file paths, commands, code snippets, expected failures, expected passes, and commit messages.
- The plan avoids unspecified follow-up work inside implementation tasks.

Type consistency:

- New helper names are consistent across tests and implementation snippets: `authRateLimitError`, `fetchOrderByProfileIdempotency`, `findOrderByPublicCodeForProfile`, `dedicatedActionTokenSecret`, `createCspNonce`, `buildContentSecurityPolicy`, and `nonceHeaderName`.
- New rate-limit scopes are consistent across tests and route snippets: `ynot:auth:password`, `ynot:legacy-order:create`, `ynot:legacy-picks:confirm`, and `ynot:legacy-profile:update`.
