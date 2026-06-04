# Admin Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the admin/auth findings from the review: revoked logout sessions, no dev-auth database mutation bypass, fail-closed LINE config, dedicated signup OTP secret, password-login throttling, and owner-only payment destination controls.

**Architecture:** Keep the existing app-session design: signed `ynot_session` cookies carry `sessionVersion`, and database RPCs own revocation. Harden the server edges that create, revoke, or authorize privileged sessions; use static regression tests for route guard drift because most risky paths are route-handler authorization checks. Do not add new roles in this pass because `admin_users.role` currently allows only `owner`, `admin`, and `staff`; use owner-only for money destination changes now.

**Tech Stack:** Next.js App Router route handlers and server actions, Supabase service-role server client, existing Node `node:test` static tests, `npm run test:*`, `npm run lint`, `npm run typecheck`.

---

## File Structure

**Modify**
- `Website/scripts/test-auth-session-hardening.mjs` - auth-session static regression tests for logout revocation, LINE config, signup secret, and password-login brute-force controls.
- `Website/scripts/test-admin-authz-hardening.mjs` - new admin authorization static regression tests for dev-auth bypass removal and owner-only payment destination routes.
- `Website/package.json` - add `test:admin-authz-hardening` and wire it into `verify:auth`.
- `Website/src/lib/lucky-draw/session.ts` - add `revokeProfileSessions(profileId)` RPC helper beside `fetchSessionVersion(profileId)`.
- `Website/src/features/auth/actions.ts` - revoke current app session on logout and rate-limit password login.
- `Website/src/app/api/line/session/route.ts` - revoke LINE app session on `DELETE` and fail closed when LINE channel ID is not configured.
- `Website/src/app/api/ynot/admin/campaigns/cost/route.ts` - require real admin session for configured Supabase mutations.
- `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts` - require real admin session for configured Supabase mutations while keeping no-Supabase demo-cookie mode.
- `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts` - remove fake owner session fallback for configured Supabase mutations.
- `Website/src/features/auth/pending-signup.ts` - require `SIGNUP_OTP_SECRET` in production, allow service-role fallback only outside production.
- `Website/tools/verification/verify-production-env.mjs` - require `SIGNUP_OTP_SECRET` in production env checks.
- `Website/src/lib/ynot/admin-authz.ts` - shared owner-only admin guard for sensitive admin routes.
- `Website/src/app/api/ynot/admin/payment-methods/route.ts` - require owner role before payment destination upsert.
- `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts` - require owner role before QR asset upload.

**Do Not Modify**
- `Database/supabase/migrations/20260528000000_audit_actor_semantics.sql` - already provides `revoke_profile_sessions(uuid)`.
- `Website/src/lib/security/rate-limit.ts` - existing helper already supports the required app-level throttles.
- `Website/src/middleware.ts` - global same-origin API mutation guard is already covered by tests.

---

### Task 1: Revoke Custom App Sessions On Logout

**Files:**
- Modify: `Website/scripts/test-auth-session-hardening.mjs`
- Modify: `Website/src/lib/lucky-draw/session.ts`
- Modify: `Website/src/features/auth/actions.ts`
- Modify: `Website/src/app/api/line/session/route.ts`

- [ ] **Step 1: Write the failing logout revocation test**

Append this test to `Website/scripts/test-auth-session-hardening.mjs` after the existing `"site session cookies require current versioned JWT payloads"` test:

```js
test("logout revokes the current profile session version before clearing cookies", () => {
  const session = source("../src/lib/lucky-draw/session.ts");
  const actions = source("../src/features/auth/actions.ts");
  const lineRoute = source("../src/app/api/line/session/route.ts");

  assert.match(
    session,
    /export async function revokeProfileSessions\(profileId: string\)/,
    "session helper exposes the revoke_profile_sessions RPC",
  );
  assert.match(
    actions,
    /const appSession = readSessionCookie\(cookieStore\)/,
    "web sign-out reads the current app session before clearing cookies",
  );
  assert.match(
    actions,
    /await revokeProfileSessions\(appSession\.profileId\)/,
    "web sign-out bumps the profile session version",
  );
  assert.match(
    lineRoute,
    /export async function DELETE\(request: NextRequest\)/,
    "LIFF sign-out can read cookies from a NextRequest",
  );
  assert.match(
    lineRoute,
    /const appSession = readSessionCookie\(request\.cookies\)/,
    "LIFF sign-out reads the current app session before clearing cookies",
  );
  assert.match(
    lineRoute,
    /await revokeProfileSessions\(appSession\.profileId\)/,
    "LIFF sign-out bumps the profile session version",
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: FAIL with at least one assertion message containing `session helper exposes the revoke_profile_sessions RPC`.

- [ ] **Step 3: Add the session revocation helper**

In `Website/src/lib/lucky-draw/session.ts`, insert this function after `fetchSessionVersion(profileId)`:

```ts
/**
 * Increment the per-profile session_version so every previously minted app
 * session cookie for this profile fails isSessionVersionCurrent().
 */
export async function revokeProfileSessions(profileId: string): Promise<number | null> {
  if (!profileId) return null;
  try {
    const supabase = createServiceSupabaseClient();
    const callRpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const { data, error } = await callRpc("revoke_profile_sessions", {
      p_profile_id: profileId,
    });
    if (error) {
      console.warn("profile_session_revoke_failed", error.message);
      return null;
    }
    const nextVersion = Number(data);
    return Number.isFinite(nextVersion) ? nextVersion : null;
  } catch (error) {
    console.warn(
      "profile_session_revoke_threw",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
```

- [ ] **Step 4: Wire web sign-out to revoke before clearing cookies**

In `Website/src/features/auth/actions.ts`, add `revokeProfileSessions` to the existing import from `@/lib/lucky-draw/session`:

```ts
import {
  createSessionCookieValue,
  fetchSessionVersion,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  readSessionCookie,
  revokeProfileSessions,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
```

Replace `signOutAction()` with:

```ts
export async function signOutAction() {
  const cookieStore = await cookies();
  const appSession = readSessionCookie(cookieStore);
  if (appSession?.profileId) {
    await revokeProfileSessions(appSession.profileId);
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const secure = shouldUseSecureCookies();
  cookieStore.set(luckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  cookieStore.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  redirect(withMessage("/login", "message", "You have signed out."));
}
```

- [ ] **Step 5: Wire LIFF sign-out to revoke before clearing cookies**

In `Website/src/app/api/line/session/route.ts`, replace the imports at the top with:

```ts
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  readSessionCookie,
  revokeProfileSessions,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { linkLineIdentity } from "@/lib/line/link-identity";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
import { NextResponse, type NextRequest } from "next/server";
```

Replace the `DELETE` handler with:

```ts
export async function DELETE(request: NextRequest) {
  const appSession = readSessionCookie(request.cookies);
  if (appSession?.profileId) {
    await revokeProfileSessions(appSession.profileId);
  }

  const response = NextResponse.json({ ok: true });
  const secure = shouldUseSecureCookies(request);
  response.cookies.set(luckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  response.cookies.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  return response;
}
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: PASS. The output includes:

```text
✔ logout revokes the current profile session version before clearing cookies
```

- [ ] **Step 7: Commit Task 1**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-auth-session-hardening.mjs Website/src/lib/lucky-draw/session.ts Website/src/features/auth/actions.ts Website/src/app/api/line/session/route.ts
git commit -m "Revoke app sessions when auth exits" \
  -m "Constraint: app cookies use per-profile session_version for revocation
Rejected: clearing cookies only | stolen app cookies remain valid until expiry
Confidence: high
Scope-risk: narrow
Directive: keep logout revocation server-side through revoke_profile_sessions
Tested: npm run test:auth-session-hardening
Not-tested: live browser logout against production Supabase"
```

---

### Task 2: Remove Dev-Auth Bypass From Configured Supabase Admin Mutations

**Files:**
- Create: `Website/scripts/test-admin-authz-hardening.mjs`
- Modify: `Website/package.json`
- Modify: `Website/src/app/api/ynot/admin/campaigns/cost/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`

- [ ] **Step 1: Create the failing admin authz regression test**

Create `Website/scripts/test-admin-authz-hardening.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("configured Supabase campaign mutations require a real admin session", () => {
  const routes = [
    ["cost", source("../src/app/api/ynot/admin/campaigns/cost/route.ts")],
    ["reorder", source("../src/app/api/ynot/admin/campaigns/reorder/route.ts")],
    ["lifecycle", source("../src/app/api/ynot/admin/campaigns/lifecycle/route.ts")],
  ];

  for (const [name, route] of routes) {
    assert.match(
      route,
      /const admin = await resolveAdminSession\(\)/,
      `${name} route resolves the real admin session`,
    );
    assert.doesNotMatch(
      route,
      /!admin && !isDev/,
      `${name} route must not treat dev-auth as an admin substitute`,
    );
    assert.doesNotMatch(
      route,
      /!admin && isDev/,
      `${name} route must not fabricate an admin when dev-auth is enabled`,
    );
  }

  const lifecycle = routes.find(([name]) => name === "lifecycle")[1];
  assert.doesNotMatch(
    lifecycle,
    /adminRole:\s*"owner"/,
    "lifecycle route must not fabricate an owner role",
  );
});
```

- [ ] **Step 2: Wire the new test into package scripts**

In `Website/package.json`, change the scripts block entries to:

```json
"verify:auth": "node tools/verification/verify-auth-foundation.mjs && node tools/verification/verify-signup-pending-flow.mjs && npm run test:identity-review-db-safety && npm run test:auth-session-hardening && npm run test:admin-authz-hardening",
"test:admin-authz-hardening": "node --test scripts/test-admin-authz-hardening.mjs",
```

Keep the existing `test:auth-session-hardening` entry unchanged:

```json
"test:auth-session-hardening": "node --test scripts/test-auth-session-hardening.mjs",
```

- [ ] **Step 3: Run the new test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-authz-hardening
```

Expected: FAIL with assertion text containing `must not treat dev-auth as an admin substitute` or `must not fabricate an owner role`.

- [ ] **Step 4: Patch the campaign cost route**

In `Website/src/app/api/ynot/admin/campaigns/cost/route.ts`, remove this import:

```ts
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
```

Replace the route comment and admin gate section with:

```ts
/**
 * Single-purpose endpoint: move a campaign into a different price tier by
 * rewriting its `cost_coins` column. The storefront groups packs into
 * Legendary / Gold / Silver / Common purely by cost, so the easiest way
 * for an admin to "add a pack to COMMON" is to click an existing pack and
 * let us set the cost to a value inside that bucket.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
```

Keep the existing rate limit call with `admin.profileId`:

```ts
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaigns:cost",
    { limit: 40, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;
```

- [ ] **Step 5: Patch the campaign reorder route**

In `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts`, remove this import:

```ts
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
```

Replace the top of `POST` through the configured-Supabase admin gate with:

```ts
export async function POST(request: Request) {
  const supabaseReady = isSupabaseConfigured();
  let admin: Awaited<ReturnType<typeof resolveAdminSession>> | null = null;
  if (supabaseReady) {
    admin = await resolveAdminSession();
    if (!admin) {
      return adminErrorResponse(
        "ADMIN_ACCESS_REQUIRED",
        "Admin access is required.",
        403,
      );
    }
    const limited = await enforceRateLimit(
      request,
      "ynot:admin:campaign-reorder",
      { limit: 60, windowMs: 60_000 },
      admin.profileId,
    );
    if (limited) return limited;
  }
```

Keep the existing no-Supabase demo-cookie branch:

```ts
  if (!supabaseReady) {
    const cookieStore = await cookies();
    const existingRaw = cookieStore.get(DEMO_PACK_ORDER_COOKIE)?.value;
```

- [ ] **Step 6: Patch the campaign lifecycle route**

In `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`, remove this import:

```ts
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
```

Replace the admin resolution block starting at `const isDev = isDevAuthAllowed();` with:

```ts
  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaign-lifecycle",
    { limit: 50, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;
```

Keep the existing owner-only lifecycle check:

```ts
  if (actionRequiresOwner(action) && admin.adminRole !== "owner") {
    return adminErrorResponse(
      "OWNER_ROLE_REQUIRED",
      "Only an owner can save review logic, approve, reject, request changes, publish, or delete a pack.",
      403,
    );
  }
```

- [ ] **Step 7: Run the new admin authz test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-authz-hardening
```

Expected: PASS. The output includes:

```text
✔ configured Supabase campaign mutations require a real admin session
```

- [ ] **Step 8: Commit Task 2**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-admin-authz-hardening.mjs Website/package.json Website/src/app/api/ynot/admin/campaigns/cost/route.ts Website/src/app/api/ynot/admin/campaigns/reorder/route.ts Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts
git commit -m "Require real admins for configured campaign mutations" \
  -m "Constraint: dev-auth may be enabled locally while Supabase points at a real project
Rejected: dev flag as admin substitute | service-role writes can touch configured Supabase data
Confidence: high
Scope-risk: moderate
Directive: dev-auth can support mock/no-DB paths only, not configured Supabase mutations
Tested: npm run test:admin-authz-hardening
Not-tested: manual admin UI reorder/cost/lifecycle smoke"
```

---

### Task 3: Fail Closed On LINE Channel Config And Require Dedicated Signup OTP Secret

**Files:**
- Modify: `Website/scripts/test-auth-session-hardening.mjs`
- Modify: `Website/src/app/api/line/session/route.ts`
- Modify: `Website/src/features/auth/pending-signup.ts`
- Modify: `Website/tools/verification/verify-production-env.mjs`

- [ ] **Step 1: Add failing tests for LINE config and signup OTP secret isolation**

Append this test to `Website/scripts/test-auth-session-hardening.mjs`:

```js
test("LINE session and signup OTP secrets fail closed in production", () => {
  const lineRoute = source("../src/app/api/line/session/route.ts");
  const pendingSignup = source("../src/features/auth/pending-signup.ts");
  const productionEnv = source("../tools/verification/verify-production-env.mjs");

  assert.match(
    lineRoute,
    /function configuredLineChannelId\(\)/,
    "LIFF session route resolves LINE channel through a helper",
  );
  assert.doesNotMatch(
    lineRoute,
    /2009971080/,
    "LIFF session route must not hardcode a LINE channel fallback",
  );
  assert.match(
    lineRoute,
    /LINE channel is not configured\./,
    "LIFF session route returns a config error instead of verifying against a fallback channel",
  );
  assert.doesNotMatch(
    pendingSignup,
    /SIGNUP_OTP_SECRET\?\.[\s\S]*\?\?\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
    "signup OTP secret must not fall through to service-role in production",
  );
  assert.match(
    pendingSignup,
    /process\.env\.NODE_ENV !== "production"[\s\S]*SUPABASE_SERVICE_ROLE_KEY/,
    "service-role fallback is limited to non-production development",
  );
  assert.match(
    productionEnv,
    /"SIGNUP_OTP_SECRET"/,
    "production env verification requires a dedicated signup OTP secret",
  );
});
```

- [ ] **Step 2: Run the auth hardening test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: FAIL with assertion text containing `must not hardcode a LINE channel fallback` and `production env verification requires a dedicated signup OTP secret`.

- [ ] **Step 3: Replace the hardcoded LINE channel fallback with a helper**

In `Website/src/app/api/line/session/route.ts`, replace the current `const lineChannelId = ...` block with:

```ts
function configuredLineChannelId() {
  const explicit = process.env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (explicit) return explicit;

  const liffChannel = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0]?.trim();
  return liffChannel || null;
}
```

At the start of `POST`, immediately after validating `idToken`, add:

```ts
  const lineChannelId = configuredLineChannelId();
  if (!lineChannelId) {
    return Response.json(
      { error: "LINE channel is not configured." },
      { status: 503 },
    );
  }
```

The top of `POST` should read:

```ts
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
  const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
  if (!idToken) {
    return Response.json({ error: "LINE ID token is required." }, { status: 400 });
  }

  const lineChannelId = configuredLineChannelId();
  if (!lineChannelId) {
    return Response.json(
      { error: "LINE channel is not configured." },
      { status: 503 },
    );
  }

  const ipLimited = await enforceRateLimit(
    request,
    "line:session:mint:ip",
    { limit: 30, windowMs: 15 * 60_000 },
  );
```

- [ ] **Step 4: Require `SIGNUP_OTP_SECRET` in production**

In `Website/src/features/auth/pending-signup.ts`, replace `signupSecret()` with:

```ts
function signupSecret() {
  const dedicated = process.env.SIGNUP_OTP_SECRET?.trim();
  if (dedicated) return dedicated;

  if (process.env.NODE_ENV !== "production") {
    const devFallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (devFallback) return devFallback;
  }

  throw new Error("Missing SIGNUP_OTP_SECRET");
}
```

- [ ] **Step 5: Add `SIGNUP_OTP_SECRET` to production env verification**

In `Website/tools/verification/verify-production-env.mjs`, replace `REQUIRED_SECRETS` with:

```js
const REQUIRED_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_LOGIN_CHANNEL_SECRET",
  "LINE_SESSION_SECRET",
  "SIGNUP_OTP_SECRET",
  "SLIP2GO_SECRET_KEY",
  "RESEND_API_KEY",
];
```

After the `LINE_SESSION_SECRET` length checks, add:

```js
if (env.SIGNUP_OTP_SECRET) {
  check(
    "SIGNUP_OTP_SECRET length >= 32 chars",
    env.SIGNUP_OTP_SECRET.length >= 32,
    "use at least 32 random characters (openssl rand -base64 32)",
  );
  check(
    "SIGNUP_OTP_SECRET is separate from SUPABASE_SERVICE_ROLE_KEY",
    env.SIGNUP_OTP_SECRET !== env.SUPABASE_SERVICE_ROLE_KEY,
    "do not reuse the service-role database secret for OTP HMAC signing",
  );
}
```

- [ ] **Step 6: Run auth hardening tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: PASS. The output includes:

```text
✔ LINE session and signup OTP secrets fail closed in production
```

- [ ] **Step 7: Commit Task 3**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-auth-session-hardening.mjs Website/src/app/api/line/session/route.ts Website/src/features/auth/pending-signup.ts Website/tools/verification/verify-production-env.mjs
git commit -m "Fail closed on auth secret misconfiguration" \
  -m "Constraint: LINE and signup flows mint sessions or setup tokens
Rejected: hardcoded channel and service-role OTP fallback | misconfiguration can authenticate the wrong boundary
Confidence: high
Scope-risk: narrow
Directive: production auth secrets must be explicit and separated by purpose
Tested: npm run test:auth-session-hardening
Not-tested: production env secret inventory"
```

---

### Task 4: Rate-Limit Password Login And Hide Provider Error Text

**Files:**
- Modify: `Website/scripts/test-auth-session-hardening.mjs`
- Modify: `Website/src/features/auth/actions.ts`

- [ ] **Step 1: Add the failing password-login regression test**

Append this test to `Website/scripts/test-auth-session-hardening.mjs`:

```js
test("password sign-in is app-rate-limited and uses generic failure copy", () => {
  const actions = source("../src/features/auth/actions.ts");

  assert.match(
    actions,
    /async function currentRequestForRateLimit\(path: string\)/,
    "server actions create a Request wrapper for shared rate limiting",
  );
  assert.match(
    actions,
    /"auth:password:signin:email"/,
    "password sign-in has an email-subject rate limit",
  );
  assert.match(
    actions,
    /"auth:password:signin:ip"/,
    "password sign-in has an IP fallback rate limit",
  );
  assert.match(
    actions,
    /Email or password is incorrect\./,
    "password sign-in uses generic failure copy",
  );
  assert.doesNotMatch(
    actions,
    /error\?\.message \?\? "Login failed\."/,
    "password sign-in must not reflect provider error text to the browser",
  );
});
```

- [ ] **Step 2: Run the auth hardening test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: FAIL with assertion text containing `server actions create a Request wrapper for shared rate limiting`.

- [ ] **Step 3: Add server-action rate-limit helpers**

In `Website/src/features/auth/actions.ts`, insert these helpers after `appOrigin()`:

```ts
async function currentRequestForRateLimit(path: string) {
  const headerStore = await headers();
  return new Request(`https://ynot.local${path}`, {
    headers: new Headers(headerStore),
  });
}

async function passwordSignInRateLimit(email: string) {
  const request = await currentRequestForRateLimit("/login");
  const emailLimited = await enforceRateLimit(
    request,
    "auth:password:signin:email",
    { limit: 8, windowMs: 15 * 60_000 },
    email,
  );
  if (emailLimited) return emailLimited;

  return enforceRateLimit(
    request,
    "auth:password:signin:ip",
    { limit: 20, windowMs: 15 * 60_000 },
  );
}
```

- [ ] **Step 4: Apply the limit before Supabase password auth**

In `signInWithPasswordAction`, insert this block after the missing email/password check and before `const supabase = await createSupabaseServerClient();`:

```ts
  const limited = await passwordSignInRateLimit(email);
  if (limited) {
    redirect(
      withMessage(
        "/login",
        "error",
        limited.status === 503
          ? "Login is temporarily unavailable. Please try again."
          : "Too many login attempts. Please wait and try again.",
        nextPath,
      ),
    );
  }
```

Replace the provider-error redirect block with:

```ts
  if (error || !data.user) {
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

- [ ] **Step 5: Run the auth hardening test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:auth-session-hardening
```

Expected: PASS. The output includes:

```text
✔ password sign-in is app-rate-limited and uses generic failure copy
```

- [ ] **Step 6: Commit Task 4**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-auth-session-hardening.mjs Website/src/features/auth/actions.ts
git commit -m "Throttle password sign-in attempts" \
  -m "Constraint: password auth is a brute-force target and server actions cannot return route-handler responses
Rejected: relying only on provider limits | app-specific abuse remains invisible and inconsistent with OTP routes
Confidence: high
Scope-risk: narrow
Directive: keep browser-facing auth failures generic
Tested: npm run test:auth-session-hardening
Not-tested: live Supabase provider lockout behavior"
```

---

### Task 5: Restrict Payment Destination Admin Routes To Owner

**Files:**
- Modify: `Website/scripts/test-admin-authz-hardening.mjs`
- Create: `Website/src/lib/ynot/admin-authz.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/route.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`

- [ ] **Step 1: Add the failing payment destination owner-role test**

Append this test to `Website/scripts/test-admin-authz-hardening.mjs`:

```js
test("payment destination routes require owner role", () => {
  const helper = source("../src/lib/ynot/admin-authz.ts");
  const paymentMethods = source("../src/app/api/ynot/admin/payment-methods/route.ts");
  const qrImage = source("../src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  assert.match(
    helper,
    /export function ownerRoleRequiredResponse/,
    "shared owner-role helper exists",
  );
  assert.match(
    helper,
    /admin\.adminRole !== "owner"/,
    "shared owner-role helper rejects non-owner admins",
  );
  assert.match(
    paymentMethods,
    /ownerRoleRequiredResponse\(admin\)/,
    "payment method upsert requires owner role",
  );
  assert.match(
    qrImage,
    /ownerRoleRequiredResponse\(admin\)/,
    "payment QR upload requires owner role",
  );
});
```

- [ ] **Step 2: Run the admin authz test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-authz-hardening
```

Expected: FAIL with `ENOENT` for `src/lib/ynot/admin-authz.ts` or assertion text containing `shared owner-role helper exists`.

- [ ] **Step 3: Create the shared owner-role helper**

Create `Website/src/lib/ynot/admin-authz.ts`:

```ts
import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import { adminErrorResponse } from "./admin-api-errors";

export function ownerRoleRequiredResponse(admin: ResolvedAdminSession) {
  if (admin.adminRole === "owner") return null;
  return adminErrorResponse(
    "OWNER_ROLE_REQUIRED",
    "Owner access is required for payment destination settings.",
    403,
  );
}
```

- [ ] **Step 4: Gate payment method upsert with owner role**

In `Website/src/app/api/ynot/admin/payment-methods/route.ts`, add this import:

```ts
import { ownerRoleRequiredResponse } from "@/lib/ynot/admin-authz";
```

After the existing `if (!admin)` check, insert:

```ts
  const ownerRequired = ownerRoleRequiredResponse(admin);
  if (ownerRequired) return ownerRequired;
```

The beginning of `POST` should read:

```ts
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const ownerRequired = ownerRoleRequiredResponse(admin);
  if (ownerRequired) return ownerRequired;
  const limited = await enforceRateLimit(request, "ynot:admin:payment-methods", { limit: 30, windowMs: 60_000 }, admin.profileId);
```

- [ ] **Step 5: Gate payment QR upload with owner role**

In `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`, add this import:

```ts
import { ownerRoleRequiredResponse } from "@/lib/ynot/admin-authz";
```

After the existing `if (!admin)` check, insert:

```ts
  const ownerRequired = ownerRoleRequiredResponse(admin);
  if (ownerRequired) return ownerRequired;
```

The admin gate should read:

```ts
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }

  const ownerRequired = ownerRoleRequiredResponse(admin);
  if (ownerRequired) return ownerRequired;

  const limited = await enforceRateLimit(
    request,
    "ynot:admin:payment-methods:qr-image",
    { limit: 30, windowMs: 60_000 },
    admin.profileId,
  );
```

- [ ] **Step 6: Run the admin authz test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-authz-hardening
```

Expected: PASS. The output includes:

```text
✔ payment destination routes require owner role
```

- [ ] **Step 7: Commit Task 5**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-admin-authz-hardening.mjs Website/src/lib/ynot/admin-authz.ts Website/src/app/api/ynot/admin/payment-methods/route.ts Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts
git commit -m "Restrict payment destination changes to owners" \
  -m "Constraint: admin_users role currently supports owner/admin/staff only
Rejected: broad admin access for payment settings | payout destination changes are money-sensitive
Confidence: high
Scope-risk: narrow
Directive: use owner-only until a dedicated finance role exists in the database contract
Tested: npm run test:admin-authz-hardening
Not-tested: manual payment settings UI smoke"
```

---

### Task 6: Full Verification And Handoff

**Files:**
- Verify only: no additional file modifications expected.

- [ ] **Step 1: Run auth verification**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:auth
```

Expected: PASS. The output includes all of these lines:

```text
✔ logout revokes the current profile session version before clearing cookies
✔ LINE session and signup OTP secrets fail closed in production
✔ password sign-in is app-rate-limited and uses generic failure copy
✔ configured Supabase campaign mutations require a real admin session
✔ payment destination routes require owner role
```

- [ ] **Step 2: Run TypeScript and lint**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
npm run lint
```

Expected:

```text
tsc --noEmit
```

returns exit code 0, and `eslint` returns exit code 0. Existing warnings are acceptable only if they were already present before this branch.

- [ ] **Step 3: Run full hardening verification**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:hardening
```

Expected: PASS. The output ends with:

```text
Hardening verification passed.
```

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git diff --stat
git diff -- Website/scripts/test-auth-session-hardening.mjs Website/scripts/test-admin-authz-hardening.mjs Website/package.json Website/src/lib/lucky-draw/session.ts Website/src/features/auth/actions.ts Website/src/app/api/line/session/route.ts Website/src/app/api/ynot/admin/campaigns/cost/route.ts Website/src/app/api/ynot/admin/campaigns/reorder/route.ts Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts Website/src/features/auth/pending-signup.ts Website/tools/verification/verify-production-env.mjs Website/src/lib/ynot/admin-authz.ts Website/src/app/api/ynot/admin/payment-methods/route.ts Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts
```

Expected: the diff only contains the planned auth/admin hardening changes. No generated files, env files, lockfiles, or unrelated UI edits appear.

- [ ] **Step 5: Commit verification-only script wiring if it was left unstaged**

Run this only if `git status --short` still shows unstaged verification-script or package-script changes after earlier task commits:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/package.json Website/scripts/test-auth-session-hardening.mjs Website/scripts/test-admin-authz-hardening.mjs
git commit -m "Wire admin auth hardening verification" \
  -m "Constraint: auth findings need persistent regression coverage
Rejected: one-off manual review only | route guard drift is easy to reintroduce
Confidence: high
Scope-risk: narrow
Directive: keep auth/admin hardening tests in verify:auth
Tested: npm run verify:auth
Not-tested: full production deploy"
```

- [ ] **Step 6: Final status report**

Report this exact structure:

```markdown
Implemented admin/auth hardening plan.

Changed:
- Session revocation now calls revoke_profile_sessions on web and LIFF logout.
- Configured Supabase admin mutations require a real admin session.
- LIFF session minting fails closed without LINE channel env.
- Signup OTP HMAC requires SIGNUP_OTP_SECRET in production.
- Password sign-in is app-rate-limited and uses generic failure copy.
- Payment destination settings are owner-only.

Verified:
- npm run verify:auth
- npm run typecheck
- npm run lint
- npm run verify:hardening

Remaining risk:
- Payment settings use owner-only until a future database migration introduces a dedicated finance role.
- Live browser smoke on admin payment/campaign pages still recommended before production deploy.
```

---

## Self-Review

**Spec coverage:** Covered all admin/auth findings from the review: logout revocation, dev-auth configured-Supabase bypass, hardcoded LINE channel fallback, signup OTP service-role fallback, password login throttling/error leakage, and generic-admin access to payment destination settings.

**Placeholder scan:** No placeholder tasks remain. Every code-changing step includes the exact code block to insert or replace, and every test step includes an exact command plus expected result.

**Type consistency:** The plan uses existing types and function names: `ResolvedAdminSession`, `readSessionCookie`, `revokeProfileSessions`, `resolveAdminSession`, `enforceRateLimit`, `ownerRoleRequiredResponse`, and `adminErrorResponse`. The only new function names are defined before later tasks use them.
