# Backend Security Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden YNOTT admin/backend mutation security and reduce avoidable Cloudflare/Supabase load while keeping public pack/reward responses free of house logic.

**Architecture:** Keep business decisions in the existing API/RPC/database contracts and make the hardening additive: static contract tests first, then same-origin coverage for admin mutations, then lazy Admin User 360 detail sections, then narrow backend selects. Public/customer DTOs stay explicit allowlists; admin/service-role paths may read internal fields only when the route needs them.

**Tech Stack:** Next.js App Router API routes, TypeScript, Supabase service-role queries/RPC, Node test runner, OpenNext Cloudflare Worker runtime.

---

## Scope And Safety Contracts

- Do not change prize selection math, pack-open RNG, wallet debit, idempotency behavior, inventory unlock math, Last Prize award logic, top-up approval/rejection RPC behavior, or shipping status transitions.
- Do not expose these fields in customer/public responses: `weight`, `unlockAtSoldPct`, `soldPct`, `logic_snapshot`, `logicMode`, `stockUnitFilter`, `stockUnitGroupKey`, `certNumber`, `gemrateId`, `stockUnitId`, `drawRoundPrizeUnitIds`, `intendedStock`, `identityMismatch`, `primaryReason`, raw `tier`, or raw internal IDs.
- Admin pages can show operational detail to authorized admins, but admin mutation APIs must reject cross-site mutation attempts before body parsing.
- Admin User 360 must still let admins see profile overview, wallet, prize wins, pack opens, shipping, top-ups, exchanges, wallet ledger, and support audit events.
- For Supabase linked DB work, run dry-run first. Apply migrations only after the dry-run output proves the pending migration set is expected.

## File Structure

- Create `Website/scripts/test-admin-backend-hardening.mjs`: static regression suite for admin same-origin mutation coverage, Admin User 360 lazy sections, select minimization, and public house-info boundaries.
- Modify `Website/package.json`: add `test:admin-backend-hardening`.
- Modify admin mutation routes under `Website/src/app/api/ynot/admin/**/route.ts`: add `enforceSameOriginMutation(request)` to every `POST`, `PATCH`, and `DELETE` route that lacks it.
- Modify `Website/src/features/ynot/types.ts`: add Admin User 360 section/summary result types.
- Modify `Website/src/features/ynot/data.ts`: add explicit profile select, `getAdminUserDetailSummary`, `getAdminUser360Section`, and keep `getAdminUserDetail` as a compatibility composition helper.
- Modify `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts`: support `section=summary|collection|gacha|shipping|topUps|exchanges|ledger|audit` with no-store admin-only responses.
- Modify `Website/src/app/admin/users/[profileId]/page.tsx`: load only the summary on first render.
- Modify `Website/src/features/ynot/admin/AdminUser360.tsx`: render summary and delegate section loading to a client component.
- Create `Website/src/features/ynot/admin/AdminUser360Sections.tsx`: client-side section tab loader for the detailed Admin User 360 tables/lists.
- Modify `Website/src/app/api/ynot/wallet/route.ts`: replace top-up replay/refresh `select("*")` reads with a top-up response select.
- Modify `Website/src/app/api/ynot/admin/cards/route.ts`, `Website/src/app/api/ynot/admin/categories/route.ts`, `Website/src/app/api/ynot/admin/payment-methods/route.ts`, and `Website/src/app/api/ynot/admin/tier-animations/route.ts`: replace mutation return `select("*")` with narrow return selects.

---

### Task 1: Add Backend Hardening Contract Tests

**Files:**
- Create: `Website/scripts/test-admin-backend-hardening.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the failing hardening test**

Create `Website/scripts/test-admin-backend-hardening.mjs` with this complete content:

```js
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(join(appRoot, path), "utf8");
}

function readOptional(path) {
  const fullPath = join(appRoot, path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function collectRouteFiles(dir, files = []) {
  const full = join(appRoot, dir);
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = join(full, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") files.push(child);
  }
  return files;
}

function rel(path) {
  return path.slice(appRoot.length + 1);
}

function between(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: missing ${endMarker}`);
  return source.slice(start, end);
}

function exportedMutations(source) {
  return [...source.matchAll(/export async function (POST|PATCH|DELETE)\s*\(/g)].map(
    (match) => match[1],
  );
}

function assertNoForbiddenPublicFields(source, label) {
  for (const field of [
    "weight",
    "unlockAtSoldPct",
    "soldPct",
    "logic_snapshot",
    "logicMode",
    "stockUnitFilter",
    "stockUnitGroupKey",
    "certNumber",
    "gemrateId",
    "stockUnitId",
    "drawRoundPrizeUnitIds",
    "intendedStock",
    "identityMismatch",
    "primaryReason",
  ]) {
    assert.doesNotMatch(source, new RegExp(`${field}\\s*:`), `${label} must not expose ${field}`);
  }
  assert.doesNotMatch(source, /\btier\s*:/, `${label} must not expose raw tier`);
}

const packageSource = read("package.json");
const dataSource = read("src/features/ynot/data.ts");
const typesSource = read("src/features/ynot/types.ts");
const userDetailPage = read("src/app/admin/users/[profileId]/page.tsx");
const userDetailRoute = read("src/app/api/ynot/admin/users/[profileId]/detail/route.ts");
const adminUser360 = read("src/features/ynot/admin/AdminUser360.tsx");
const adminUser360Sections = readOptional("src/features/ynot/admin/AdminUser360Sections.tsx");
const walletRoute = read("src/app/api/ynot/wallet/route.ts");
const cardsRoute = read("src/app/api/ynot/admin/cards/route.ts");
const categoriesRoute = read("src/app/api/ynot/admin/categories/route.ts");
const paymentMethodsRoute = read("src/app/api/ynot/admin/payment-methods/route.ts");
const tierAnimationsRoute = read("src/app/api/ynot/admin/tier-animations/route.ts");
const gachaOpenRoute = read("src/app/api/ynot/gacha/open/route.ts");

test("package exposes the backend hardening regression script", () => {
  assert.match(packageSource, /"test:admin-backend-hardening":\s*"node --test scripts\/test-admin-backend-hardening\.mjs"/);
});

test("every admin mutation route enforces same-origin before mutation work", () => {
  const failures = [];
  for (const file of collectRouteFiles("src/app/api/ynot/admin")) {
    const source = readFileSync(file, "utf8");
    const mutations = exportedMutations(source);
    if (mutations.length === 0) continue;
    if (!/enforceSameOriginMutation\s*\(\s*request\s*\)/.test(source)) {
      failures.push(`${rel(file)} exports ${mutations.join(",")} without enforceSameOriginMutation(request)`);
    }
  }
  assert.deepEqual(failures, []);
});

test("Admin User 360 supports summary-first loading and section APIs", () => {
  assert.match(typesSource, /export type YnotAdminUser360Section/);
  assert.match(typesSource, /"summary"/);
  assert.match(typesSource, /"collection"/);
  assert.match(typesSource, /"gacha"/);
  assert.match(typesSource, /"shipping"/);
  assert.match(typesSource, /"topUps"/);
  assert.match(typesSource, /"exchanges"/);
  assert.match(typesSource, /"ledger"/);
  assert.match(typesSource, /"audit"/);
  assert.match(typesSource, /export type YnotAdminUserDetailSummary/);
  assert.match(typesSource, /export type YnotAdminUser360SectionResult/);

  assert.match(dataSource, /const ADMIN_USER_PROFILE_SELECT =/);
  assert.match(dataSource, /export function normalizeAdminUser360Section/);
  assert.match(dataSource, /export async function getAdminUserDetailSummary/);
  assert.match(dataSource, /export async function getAdminUser360Section/);

  const summaryBlock = between(
    dataSource,
    "export async function getAdminUserDetailSummary",
    "export async function getAdminUser360Section",
    "admin user summary block",
  );
  assert.doesNotMatch(summaryBlock, /\.select\("\*"\)/);
  assert.match(summaryBlock, /ADMIN_USER_PROFILE_SELECT/);

  assert.match(userDetailRoute, /normalizeAdminUser360Section/);
  assert.match(userDetailRoute, /getAdminUserDetailSummary/);
  assert.match(userDetailRoute, /getAdminUser360Section/);
  assert.match(userDetailRoute, /searchParams\.get\("section"\)/);
  assert.match(userDetailRoute, /Cache-Control",\s*"no-store"/);

  assert.match(userDetailPage, /getAdminUserDetailSummary\(profileId/);
  assert.doesNotMatch(userDetailPage, /getAdminUserDetail\(profileId/);
  assert.match(adminUser360, /summary=\{/);
  assert.match(adminUser360, /AdminUser360Sections/);
  assert.match(adminUser360Sections, /"use client"/);
  assert.match(adminUser360Sections, /fetch\(`/);
  assert.match(adminUser360Sections, /section=\$\{activeSection\}/);
});

test("priority broad selects are replaced with narrow return selects", () => {
  const walletFetchByIdempotency = between(
    walletRoute,
    "async function fetchExistingTopUpByIdempotency",
    "async function fetchTopUpById",
    "wallet idempotency fetch",
  );
  const walletFetchById = between(
    walletRoute,
    "async function fetchTopUpById",
    "function replayTopUpResponse",
    "wallet top-up fetch",
  );
  assert.match(walletRoute, /const TOP_UP_RESPONSE_SELECT =/);
  assert.doesNotMatch(walletFetchByIdempotency, /\.select\("\*"\)/);
  assert.doesNotMatch(walletFetchById, /\.select\("\*"\)/);

  assert.match(cardsRoute, /const ADMIN_CARD_RETURN_SELECT =/);
  assert.doesNotMatch(cardsRoute, /\.select\("\*"\)\.single\(\)/);

  assert.match(categoriesRoute, /const ADMIN_CATEGORY_RETURN_SELECT =/);
  assert.doesNotMatch(categoriesRoute, /\.select\("\*"\)\.single\(\)/);

  assert.match(paymentMethodsRoute, /const ADMIN_PAYMENT_METHOD_RETURN_SELECT =/);
  assert.doesNotMatch(paymentMethodsRoute, /\.select\("\*"\)\.single\(\)/);

  assert.match(tierAnimationsRoute, /const ADMIN_TIER_ANIMATION_RETURN_SELECT =/);
  assert.doesNotMatch(tierAnimationsRoute, /\.select\("\*"\)\.single\(\)/);
});

test("public pack-open DTO still excludes house logic fields", () => {
  const publicItem = between(
    gachaOpenRoute,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
    "pack-open public item mapper",
  );
  const publicResult = between(
    gachaOpenRoute,
    "function toPublicOpenResult",
    "function openErrorMessage",
    "pack-open public result mapper",
  );
  assertNoForbiddenPublicFields(publicItem, "pack-open public item");
  assertNoForbiddenPublicFields(publicResult, "pack-open public result");
});
```

- [ ] **Step 2: Add the package script**

Modify `Website/package.json` inside `scripts`:

```json
"test:admin-backend-hardening": "node --test scripts/test-admin-backend-hardening.mjs"
```

- [ ] **Step 3: Run the new test and confirm it fails for missing hardening**

Run:

```bash
cd Website && npm run test:admin-backend-hardening
```

Expected: FAIL with admin mutation routes missing `enforceSameOriginMutation(request)` and missing Admin User 360 section symbols.

- [ ] **Step 4: Commit the failing contract test**

Run:

```bash
git add Website/package.json Website/scripts/test-admin-backend-hardening.mjs
git commit \
  -m "Lock backend hardening contracts before changes" \
  -m "Constraint: Admin security and public privacy changes must be proven by static contracts before refactors." \
  -m "Rejected: Manual route spot-checking only | misses future admin mutation routes." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep this script strict when new admin mutation routes are added." \
  -m "Tested: npm run test:admin-backend-hardening fails on current gaps" \
  -m "Not-tested: runtime behavior unchanged in test-only commit"
```

---

### Task 2: Enforce Same-Origin Guard On Admin Mutations

**Files:**
- Modify: `Website/src/app/api/ynot/admin/cards/route.ts`
- Modify: `Website/src/app/api/ynot/admin/categories/route.ts`
- Modify: `Website/src/app/api/ynot/admin/users/route.ts`
- Modify: `Website/src/app/api/ynot/admin/card-options/route.ts`
- Modify: `Website/src/app/api/ynot/admin/cards/image/route.ts`
- Modify: `Website/src/app/api/ynot/admin/tier-animations/route.ts`
- Modify: `Website/src/app/api/ynot/admin/featured-packs/route.ts`
- Modify: `Website/src/app/api/ynot/admin/gemrate-cert/route.ts`
- Modify: `Website/src/app/api/ynot/admin/prizes/odds/route.ts`
- Modify: `Website/src/app/api/ynot/admin/merge-requests/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Test: `Website/scripts/test-admin-backend-hardening.mjs`

- [ ] **Step 1: Add imports to mutation route files that do not already import the guard**

In each listed route file that lacks it, add:

```ts
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
```

- [ ] **Step 2: Add the guard as the first mutation-only gate**

At the top of every exported `POST`, `PATCH`, and `DELETE` function in the listed files, after any `isSupabaseConfigured()` guard and before `resolveAdminSession()`, `request.json()`, or `request.formData()`, insert:

```ts
const crossOrigin = enforceSameOriginMutation(request);
if (crossOrigin) return crossOrigin;
```

For `Website/src/app/api/ynot/admin/cards/route.ts`, the beginning of `POST` should become:

```ts
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", adminCardMutationRateLimit, admin.profileId);
  if (limited) return limited;
```

For `Website/src/app/api/ynot/admin/users/route.ts`, the beginning of `PATCH` should become:

```ts
export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:users", { limit: 30, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
```

For helper-style routes such as `Website/src/app/api/ynot/admin/categories/route.ts`, keep `GET` unchanged and add the guard directly inside `POST`, `PATCH`, and `DELETE` before calling `requireAdmin(request)`:

```ts
export async function POST(request: Request) {
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
```

- [ ] **Step 3: Run same-origin coverage test**

Run:

```bash
cd Website && npm run test:admin-backend-hardening
```

Expected: still FAIL for Admin User 360 lazy sections and select minimization, but the `every admin mutation route enforces same-origin` test passes.

- [ ] **Step 4: Run existing admin operation regression**

Run:

```bash
cd Website && npm run test:admin-ops-api-rpc-performance
```

Expected: PASS. Existing admin top-up, shipping, and RPC call-shape assertions remain unchanged.

- [ ] **Step 5: Commit same-origin coverage**

Run:

```bash
git add Website/src/app/api/ynot/admin
git commit \
  -m "Require same-origin checks for admin mutations" \
  -m "Constraint: Admin mutation routes use cookie-backed auth and must reject cross-site writes before parsing request bodies." \
  -m "Rejected: Relying only on admin session checks | browser-submitted cross-site mutations can still carry cookies." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: New admin POST PATCH DELETE routes must call enforceSameOriginMutation(request)." \
  -m "Tested: npm run test:admin-backend-hardening same-origin case passes; npm run test:admin-ops-api-rpc-performance passes" \
  -m "Not-tested: live browser click path"
```

---

### Task 3: Split Admin User 360 Backend Into Summary And Sections

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`
- Test: `Website/scripts/test-admin-backend-hardening.mjs`

- [ ] **Step 1: Add Admin User 360 section types**

Modify `Website/src/features/ynot/types.ts` after `YnotAdminUser360Query`:

```ts
export type YnotAdminUser360Section =
  | "summary"
  | "collection"
  | "gacha"
  | "shipping"
  | "topUps"
  | "exchanges"
  | "ledger"
  | "audit";

export type YnotAdminUserDetailSummary = {
  profile: YnotAdminUserDetail["profile"];
  wallet: YnotWallet;
  addresses: YnotAddress[];
  counts: {
    collection: number;
    gachaOpens: number;
    shipping: number;
    activeShipping: number;
    finalShipping: number;
    topUps: number;
    exchanges: number;
    walletLedger: number;
    auditTimeline: number;
  };
  query: YnotAdminUser360Query;
};

export type YnotAdminUser360SectionResult =
  | { section: "collection"; collection: YnotCollectionItem[]; query: YnotAdminUser360Query }
  | { section: "gacha"; gachaOpens: YnotGachaOpenHistory[]; query: YnotAdminUser360Query }
  | { section: "shipping"; shipping: YnotShippingRequest[]; query: YnotAdminUser360Query }
  | { section: "topUps"; topUps: YnotTopUp[]; query: YnotAdminUser360Query }
  | { section: "exchanges"; exchanges: YnotExchangeOrder[]; query: YnotAdminUser360Query }
  | { section: "ledger"; walletLedger: YnotWalletLedgerEntry[]; query: YnotAdminUser360Query }
  | { section: "audit"; auditTimeline: YnotShippingTimelineEvent[]; query: YnotAdminUser360Query };
```

- [ ] **Step 2: Import the new types in data.ts**

Add these names to the existing import from `Website/src/features/ynot/types.ts`:

```ts
YnotAdminUser360Section,
YnotAdminUser360SectionResult,
YnotAdminUserDetailSummary,
```

- [ ] **Step 3: Add explicit Admin User profile select and section normalizer**

In `Website/src/features/ynot/data.ts`, near the existing Admin User 360 constants, add:

```ts
const ADMIN_USER_PROFILE_SELECT =
  "id,display_name,line_display_name,full_name,avatar_url,email,line_user_id,phone,profile_status,preferred_language,created_at,last_seen_at";

const adminUser360Sections = new Set<YnotAdminUser360Section>([
  "summary",
  "collection",
  "gacha",
  "shipping",
  "topUps",
  "exchanges",
  "ledger",
  "audit",
]);

export function normalizeAdminUser360Section(
  value: unknown,
): YnotAdminUser360Section | null {
  return typeof value === "string" && adminUser360Sections.has(value as YnotAdminUser360Section)
    ? (value as YnotAdminUser360Section)
    : null;
}
```

- [ ] **Step 4: Add reusable profile mapper**

Add this helper before `getAdminUserDetail`:

```ts
type AdminUserProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "display_name"
  | "line_display_name"
  | "full_name"
  | "avatar_url"
  | "email"
  | "line_user_id"
  | "phone"
  | "profile_status"
  | "preferred_language"
  | "created_at"
  | "last_seen_at"
>;

function adminUserDetailProfile(profile: AdminUserProfileRow): YnotAdminUserDetail["profile"] {
  return {
    profileId: profile.id,
    displayName:
      profile.display_name ??
      profile.line_display_name ??
      profile.full_name ??
      "YNot Customer",
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    email: profile.email,
    lineDisplayName: profile.line_display_name,
    lineUserId: profile.line_user_id,
    phone: profile.phone,
    status: profile.profile_status,
    preferredLanguage: profile.preferred_language,
    createdAt: profile.created_at,
    lastSeenAt: profile.last_seen_at,
  };
}
```

- [ ] **Step 5: Add summary loader**

Add this function before `getAdminUserDetail`:

```ts
export async function getAdminUserDetailSummary(
  profileId: string,
  input: { pageSize?: unknown } = {},
): Promise<YnotAdminUserDetailSummary | null> {
  if (!profileId || !isSupabaseConfigured()) return null;
  const admin = await resolveAdminSession();
  if (!admin) return null;
  const supabase = createServiceSupabaseClient();
  const detailQuery = normalizeAdminUser360Query(input);

  const profileRows = await readOrEmpty("admin_user_detail_profile", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select(ADMIN_USER_PROFILE_SELECT)
      .eq("id", profileId)
      .limit(1);
    if (error) throw error;
    return (data ?? []) as AdminUserProfileRow[];
  });
  const profile = profileRows[0];
  if (!profile) return null;

  const [
    wallet,
    addresses,
    collectionCount,
    gachaCount,
    shippingRows,
    topUpCount,
    exchangeCount,
    ledgerCount,
    auditCount,
  ] = await Promise.all([
    getWallet(profileId),
    getAddresses(profileId),
    countRows(supabase, "collection_items", "profile_id", profileId),
    countRows(supabase, "gacha_opens", "profile_id", profileId),
    readOrEmpty("admin_user_shipping_status_counts", async () => {
      const { data, error } = await supabase
        .from("shipping_requests")
        .select("status")
        .eq("profile_id", profileId);
      if (error) throw error;
      return data ?? [];
    }),
    countRows(supabase, "top_up_requests", "profile_id", profileId),
    countRows(supabase, "exchange_orders", "profile_id", profileId),
    countRows(supabase, "coin_ledger", "profile_id", profileId),
    countRows(supabase, "audit_events", "actor_profile_id", profileId),
  ]);

  const activeShipping = shippingRows.filter((row) =>
    isActiveYnotShippingStatus(row.status),
  ).length;
  const finalShipping = shippingRows.filter((row) =>
    isFinalYnotShippingStatus(row.status),
  ).length;

  return {
    profile: adminUserDetailProfile(profile),
    wallet,
    addresses,
    counts: {
      collection: collectionCount,
      gachaOpens: gachaCount,
      shipping: shippingRows.length,
      activeShipping,
      finalShipping,
      topUps: topUpCount,
      exchanges: exchangeCount,
      walletLedger: ledgerCount,
      auditTimeline: auditCount,
    },
    query: detailQuery,
  };
}
```

Add this helper near `postgresInList`:

```ts
async function countRows(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await (supabase.from as unknown as (
    name: string,
  ) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (column: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
    };
  })(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 6: Add section loader**

Add this function after `getAdminUserDetailSummary`:

```ts
export async function getAdminUser360Section(
  profileId: string,
  section: Exclude<YnotAdminUser360Section, "summary">,
  input: { pageSize?: unknown } = {},
): Promise<YnotAdminUser360SectionResult | null> {
  if (!profileId || !isSupabaseConfigured()) return null;
  const admin = await resolveAdminSession();
  if (!admin) return null;
  const supabase = createServiceSupabaseClient();
  const detailQuery = normalizeAdminUser360Query(input);
  const sectionLimit = detailQuery.pageSize;

  if (section === "collection") {
    return {
      section,
      collection: await getCollection(profileId, { limit: sectionLimit }),
      query: detailQuery,
    };
  }
  if (section === "gacha") {
    return {
      section,
      gachaOpens: await getGachaOpenHistory(profileId, { limit: sectionLimit }),
      query: detailQuery,
    };
  }
  if (section === "shipping") {
    return {
      section,
      shipping: await getShipping(profileId, false, { limit: sectionLimit }),
      query: detailQuery,
    };
  }
  if (section === "topUps") {
    return {
      section,
      topUps: await getTopUps(profileId, false, {
        includeSensitiveSlipDetails: true,
        limit: sectionLimit,
      }),
      query: detailQuery,
    };
  }
  if (section === "exchanges") {
    return {
      section,
      exchanges: await getExchanges(profileId, false, { limit: sectionLimit }),
      query: detailQuery,
    };
  }
  if (section === "ledger") {
    const walletLedger = await readOrEmpty("admin_user_wallet_ledger", async () => {
      const { data, error } = await supabase
        .from("coin_ledger")
        .select("id,entry_type,amount_coins,balance_before,balance_after,reference_type,created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(sectionLimit);
      if (error) throw error;
      return data ?? [];
    });
    return {
      section,
      walletLedger: walletLedger.map((entry) => ({
        id: entry.id,
        entryType: entry.entry_type,
        amountCoins: entry.amount_coins,
        balanceBefore: entry.balance_before,
        balanceAfter: entry.balance_after,
        referenceType: entry.reference_type,
        createdAt: entry.created_at,
      })),
      query: detailQuery,
    };
  }

  const auditRows = await readOrEmpty("admin_user_audit", async () => {
    const { data, error } = await supabase
      .from("audit_events")
      .select(AUDIT_EVENT_TIMELINE_SELECT)
      .eq("actor_profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(sectionLimit);
    if (error) throw error;
    return data ?? [];
  });
  return {
    section: "audit",
    auditTimeline: auditRows.map(shippingTimelineEvent),
    query: detailQuery,
  };
}
```

- [ ] **Step 7: Recompose the existing full-detail helper from summary and sections**

Replace the body of `getAdminUserDetail` with this compatibility composition:

```ts
export async function getAdminUserDetail(
  profileId: string,
  input: { pageSize?: unknown } = {},
): Promise<YnotAdminUserDetail | null> {
  const summary = await getAdminUserDetailSummary(profileId, input);
  if (!summary) return null;
  const [collection, gacha, shipping, topUps, exchanges, ledger, audit] =
    await Promise.all([
      getAdminUser360Section(profileId, "collection", input),
      getAdminUser360Section(profileId, "gacha", input),
      getAdminUser360Section(profileId, "shipping", input),
      getAdminUser360Section(profileId, "topUps", input),
      getAdminUser360Section(profileId, "exchanges", input),
      getAdminUser360Section(profileId, "ledger", input),
      getAdminUser360Section(profileId, "audit", input),
    ]);

  return {
    profile: summary.profile,
    wallet: summary.wallet,
    addresses: summary.addresses,
    collection: collection?.section === "collection" ? collection.collection : [],
    gachaOpens: gacha?.section === "gacha" ? gacha.gachaOpens : [],
    shipping: shipping?.section === "shipping" ? shipping.shipping : [],
    topUps: topUps?.section === "topUps" ? topUps.topUps : [],
    exchanges: exchanges?.section === "exchanges" ? exchanges.exchanges : [],
    walletLedger: ledger?.section === "ledger" ? ledger.walletLedger : [],
    auditTimeline: audit?.section === "audit" ? audit.auditTimeline : [],
    query: summary.query,
  };
}
```

- [ ] **Step 8: Update the detail API route**

Modify `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts` imports:

```ts
import {
  getAdminUser360Section,
  getAdminUserDetailSummary,
  normalizeAdminUser360Query,
  normalizeAdminUser360Section,
} from "@/features/ynot/data";
```

Replace the detail loading block with:

```ts
const url = new URL(request.url);
const section = normalizeAdminUser360Section(
  url.searchParams.get("section") ?? "summary",
);
if (!section) {
  return Response.json({ error: "Invalid section." }, { status: 400 });
}
const detailQuery = normalizeAdminUser360Query({
  pageSize: url.searchParams.get("pageSize") ?? "100",
});
const result =
  section === "summary"
    ? await getAdminUserDetailSummary(profileId, detailQuery)
    : await getAdminUser360Section(profileId, section, detailQuery);
if (!result) {
  return Response.json({ error: "User was not found." }, { status: 404 });
}

const response = Response.json({ result });
response.headers.set("Cache-Control", "no-store");
return response;
```

- [ ] **Step 9: Run backend section tests**

Run:

```bash
cd Website && npm run test:admin-backend-hardening
```

Expected: same-origin and Admin User 360 source-shape tests pass; select minimization may still fail until Task 5.

- [ ] **Step 10: Run existing Admin User 360 regression**

Run:

```bash
cd Website && npm run test:admin-user360-flow
```

Expected: FAIL until Task 4 updates the UI/source expectations from full-detail server render to summary-first section render.

- [ ] **Step 11: Commit backend split**

Run:

```bash
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts
git commit \
  -m "Split Admin User 360 detail reads by section" \
  -m "Constraint: Launch admins still need all user detail, but Cloudflare should not load every section on first render." \
  -m "Rejected: Removing User 360 sections | loses launch visibility." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep getAdminUserDetail only as compatibility glue; use summary and section APIs for new UI reads." \
  -m "Tested: npm run test:admin-backend-hardening partial pass" \
  -m "Not-tested: UI source expectations updated in next task"
```

---

### Task 4: Make Admin User 360 Summary-First In The UI

**Files:**
- Modify: `Website/src/app/admin/users/[profileId]/page.tsx`
- Modify: `Website/src/features/ynot/admin/AdminUser360.tsx`
- Create: `Website/src/features/ynot/admin/AdminUser360Sections.tsx`
- Modify: `Website/scripts/test-admin-user360-flow.mjs`
- Test: `Website/scripts/test-admin-backend-hardening.mjs`

- [ ] **Step 1: Update the page to fetch only summary**

In `Website/src/app/admin/users/[profileId]/page.tsx`, replace the imports:

```ts
import {
  getAdminUserDetailSummary,
  getYnotDashboardSlice,
  normalizeAdminUser360Query,
} from "@/features/ynot/data";
```

Replace the `Promise.all` block:

```ts
const [data, summary] = await Promise.all([
  getYnotDashboardSlice({ wallet: false }),
  getAdminUserDetailSummary(profileId, detailQuery),
]);

if (!summary) notFound();
```

Replace title and component usage:

```tsx
title={summary.profile.displayName}
```

```tsx
<AdminUser360 summary={summary} />
```

- [ ] **Step 2: Change AdminUser360 props from full detail to summary**

In `Website/src/features/ynot/admin/AdminUser360.tsx`, replace the type import:

```ts
import type {
  YnotAdminUserDetailSummary,
  YnotShippingRequest,
} from "@/features/ynot/types";
```

Add:

```ts
import { AdminUser360Sections } from "@/features/ynot/admin/AdminUser360Sections";
```

Change the exported function signature:

```ts
export function AdminUser360({ summary }: { summary: YnotAdminUserDetailSummary }) {
  const defaultAddress =
    summary.addresses.find((address) => address.isDefault) ??
    summary.addresses[0];
```

Update KPI reads:

```tsx
<AdminKPI
  label="Wallet balance"
  value={fmtCoin(summary.wallet.balanceCoins)}
  color="var(--a-gold)"
/>
<AdminKPI
  label="Collection rewards"
  value={summary.counts.collection}
  color="var(--a-mint)"
/>
<AdminKPI
  label="Pack opens"
  value={summary.counts.gachaOpens}
  color="var(--a-sky)"
/>
<AdminKPI
  label="Active shipping"
  value={summary.counts.activeShipping}
  delta={`${summary.counts.finalShipping} sent`}
  deltaDir={summary.counts.activeShipping ? "down" : "up"}
  color="var(--a-rose)"
/>
```

Replace `detail.profile` references with `summary.profile`, and replace the section table/list area with:

```tsx
<AdminUser360Sections summary={summary} />
```

- [ ] **Step 3: Create the section loader component**

Create `Website/src/features/ynot/admin/AdminUser360Sections.tsx` with this complete content:

```tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type {
  YnotAdminUser360Section,
  YnotAdminUser360SectionResult,
  YnotAdminUserDetailSummary,
  YnotCollectionItem,
  YnotGachaOpenHistory,
  YnotShippingItem,
  YnotShippingRequest,
} from "@/features/ynot/types";
import {
  AdminCard,
  AdminCardHead,
  AdminIcon,
  AdminStatusPill,
  fmtCoin,
  fmtTHB,
} from "@/features/ynot/admin";
import {
  ynotShippingStatusLabel,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";

const sectionTabs: Exclude<YnotAdminUser360Section, "summary">[] = [
  "shipping",
  "collection",
  "gacha",
  "topUps",
  "exchanges",
  "ledger",
  "audit",
];

const sectionLabels: Record<Exclude<YnotAdminUser360Section, "summary">, string> = {
  shipping: "Shipping",
  collection: "Prize wins",
  gacha: "Pack opens",
  topUps: "Top-ups",
  exchanges: "Exchanges",
  ledger: "Ledger",
  audit: "Audit",
};

function sectionCount(
  summary: YnotAdminUserDetailSummary,
  section: Exclude<YnotAdminUser360Section, "summary">,
) {
  if (section === "collection") return summary.counts.collection;
  if (section === "gacha") return summary.counts.gachaOpens;
  if (section === "shipping") return summary.counts.shipping;
  if (section === "topUps") return summary.counts.topUps;
  if (section === "exchanges") return summary.counts.exchanges;
  if (section === "ledger") return summary.counts.walletLedger;
  return summary.counts.auditTimeline;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return date.toLocaleString();
}

function profileScopedHref(path: string, profileId: string) {
  return `${path}${encodeURIComponent(profileId)}`;
}

function addressLines(address: YnotShippingRequest["addressSnapshot"]) {
  if (!address) return ["No address snapshot"];
  return [
    address.recipientName,
    address.phone,
    address.addressLine1,
    address.addressLine2,
    address.subdistrict,
    address.district,
    address.province,
    address.postalCode,
    address.country,
    address.deliveryNote,
  ].filter((value): value is string => Boolean(value));
}

function sourcePack(item?: YnotCollectionItem | YnotShippingItem) {
  return item?.sourceCampaignTitle ?? "No pack source";
}

function openRewardSummary(open: YnotGachaOpenHistory) {
  if (!open.rewards.length) return "No reward rows";
  return open.rewards
    .map((reward) => `${reward.resultPosition}. ${reward.cardName}`)
    .join(" | ");
}

function renderShipping(result: Extract<YnotAdminUser360SectionResult, { section: "shipping" }>) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Order</th>
            <th>Items</th>
            <th>Address snapshot</th>
            <th>Status</th>
            <th>Tracking</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {result.shipping.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted" style={{ padding: 24 }}>
                No shipping requests yet.
              </td>
            </tr>
          ) : (
            result.shipping.map((request) => (
              <tr key={request.id}>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {request.publicCode}
                </td>
                <td>
                  {(request.items ?? []).map((item) => (
                    <div key={`${request.id}-${item.cardCode ?? item.cardName}-${item.sourceOpenPosition ?? "x"}`}>
                      <div className="row-title">{item.cardName}</div>
                      <div className="row-sub">
                        {sourcePack(item)}
                        {item.sourceOpenCode ? ` | ${item.sourceOpenCode}` : ""}
                        {item.serialNo ? ` | Serial ${item.serialNo}` : ""}
                      </div>
                    </div>
                  ))}
                </td>
                <td>
                  {addressLines(request.addressSnapshot).map((line) => (
                    <div className="row-sub" key={line}>
                      {line}
                    </div>
                  ))}
                </td>
                <td>
                  <AdminStatusPill status={request.status} />
                </td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {ynotShippingTrackingLabel(request)}
                </td>
                <td className="mono muted" style={{ fontSize: 11 }}>
                  {formatDate(request.createdAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderCollection(result: Extract<YnotAdminUser360SectionResult, { section: "collection" }>) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Reward</th>
            <th>Pack source</th>
            <th>Status</th>
            <th>Value</th>
            <th>Acquired</th>
          </tr>
        </thead>
        <tbody>
          {result.collection.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted" style={{ padding: 24 }}>
                No collection rewards yet.
              </td>
            </tr>
          ) : (
            result.collection.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="row-title">{item.cardName}</div>
                  <div className="row-sub mono" style={{ fontSize: 11 }}>
                    {item.cardCode ?? "No code"}
                    {item.serialNo ? ` | Serial ${item.serialNo}` : ""}
                    {item.sourcePrizeTierLabel ? ` | ${item.sourcePrizeTierLabel}` : ""}
                    {item.sourceIsLastPrize ? " | Last Prize" : ""}
                  </div>
                </td>
                <td>{sourcePack(item)}</td>
                <td>
                  <AdminStatusPill status={item.status} />
                </td>
                <td>{fmtCoin(item.convertCoinValue ?? 0)}</td>
                <td className="mono muted" style={{ fontSize: 11 }}>
                  {formatDate(item.acquiredAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderGacha(result: Extract<YnotAdminUser360SectionResult, { section: "gacha" }>) {
  return (
    <div className="list">
      {result.gachaOpens.length === 0 ? (
        <div className="list-row text-mute">No pack opens yet.</div>
      ) : (
        result.gachaOpens.map((open) => (
          <div className="list-row" key={open.id}>
            <AdminIcon name="sparkles" />
            <div>
              <strong>{open.campaignTitle}</strong>
              <div className="row-sub mono">
                {open.publicCode} | {open.quantity} item(s) | {fmtCoin(open.costCoins)} | {open.status}
              </div>
              <div className="row-sub">{openRewardSummary(open)}</div>
              <div className="row-sub">{formatDate(open.openedAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function renderTopUps(result: Extract<YnotAdminUser360SectionResult, { section: "topUps" }>) {
  return (
    <div className="list">
      {result.topUps.length === 0 ? (
        <div className="list-row text-mute">No top-up activity.</div>
      ) : (
        result.topUps.map((topUp) => (
          <div className="list-row" key={topUp.id ?? topUp.publicCode}>
            <AdminIcon name="tag" />
            <div>
              <strong>
                {topUp.publicCode} | {fmtTHB(topUp.amountThb)}
              </strong>
              <div className="row-sub">
                {fmtCoin(topUp.coinAmount)} | {topUp.status} | {formatDate(topUp.createdAt)}
              </div>
              <div className="row-sub">
                Slip: {topUp.slipVerification?.status ?? "not uploaded"}
                {topUp.slipVerification?.providerCode ? ` | ${topUp.slipVerification.providerCode}` : ""}
              </div>
              {topUp.slipVerification?.providerMessage ? (
                <div className="row-sub">{topUp.slipVerification.providerMessage}</div>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function renderExchanges(result: Extract<YnotAdminUser360SectionResult, { section: "exchanges" }>) {
  return (
    <div className="list">
      {result.exchanges.length === 0 ? (
        <div className="list-row text-mute">No exchange orders.</div>
      ) : (
        result.exchanges.map((exchange) => (
          <div className="list-row" key={exchange.id}>
            <AdminIcon name="swap" />
            <div>
              <strong>{exchange.publicCode}</strong>
              <div className="row-sub">
                {exchange.status} | requested {fmtCoin(exchange.requestedCoinValue)}
                {exchange.approvedCoinValue ? ` | approved ${fmtCoin(exchange.approvedCoinValue)}` : ""}
              </div>
              <div className="row-sub">{formatDate(exchange.createdAt)}</div>
              {exchange.adminNote ? <div className="row-sub">{exchange.adminNote}</div> : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function renderLedger(result: Extract<YnotAdminUser360SectionResult, { section: "ledger" }>) {
  return (
    <div className="list">
      {result.walletLedger.length === 0 ? (
        <div className="list-row text-mute">No wallet ledger activity.</div>
      ) : (
        result.walletLedger.map((entry) => (
          <div className="list-row" key={entry.id}>
            <AdminIcon name="coin" />
            <div>
              <strong>
                {entry.amountCoins > 0 ? "+" : ""}
                {fmtCoin(entry.amountCoins)}
              </strong>
              <div className="row-sub mono">
                {fmtCoin(entry.balanceBefore)} {" -> "} {fmtCoin(entry.balanceAfter)}
              </div>
              <div className="row-sub">
                {entry.entryType}
                {entry.referenceType ? ` | ${entry.referenceType}` : ""} | {formatDate(entry.createdAt)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function renderAudit(result: Extract<YnotAdminUser360SectionResult, { section: "audit" }>) {
  return (
    <div className="list">
      {result.auditTimeline.length === 0 ? (
        <div className="list-row text-mute">No support audit events.</div>
      ) : (
        result.auditTimeline.map((event) => (
          <div className="list-row" key={event.id}>
            <AdminIcon name="clock" />
            <div>
              <strong>{event.label}</strong>
              <div className="row-sub">{formatDate(event.createdAt)}</div>
              <div className="row-sub">
                {event.previousStatus ? `${ynotShippingStatusLabel(event.previousStatus)} -> ` : ""}
                {event.status ? ynotShippingStatusLabel(event.status) : "status unchanged"}
              </div>
              {event.trackingNumber ? (
                <div className="row-sub mono">
                  {event.trackingProvider ?? "tracking"} | {event.trackingNumber}
                </div>
              ) : null}
              {event.note ? <div className="row-sub">{event.note}</div> : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function renderSection(result: YnotAdminUser360SectionResult) {
  if (result.section === "shipping") return renderShipping(result);
  if (result.section === "collection") return renderCollection(result);
  if (result.section === "gacha") return renderGacha(result);
  if (result.section === "topUps") return renderTopUps(result);
  if (result.section === "exchanges") return renderExchanges(result);
  if (result.section === "ledger") return renderLedger(result);
  return renderAudit(result);
}

export function AdminUser360Sections({
  summary,
}: {
  summary: YnotAdminUserDetailSummary;
}) {
  const [activeSection, setActiveSection] =
    useState<Exclude<YnotAdminUser360Section, "summary">>("shipping");
  const [sections, setSections] = useState<
    Partial<Record<Exclude<YnotAdminUser360Section, "summary">, YnotAdminUser360SectionResult>>
  >({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const profileId = summary.profile.profileId;
  const loaded = sections[activeSection];

  useEffect(() => {
    if (sections[activeSection]) return;
    startTransition(async () => {
      setMessage("");
      const params = new URLSearchParams({
        section: activeSection,
        pageSize: String(summary.query.pageSize),
      });
      const response = await fetch(
        `/api/ynot/admin/users/${encodeURIComponent(profileId)}/detail?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(payload.error ?? "Could not load this section.");
        return;
      }
      const payload = (await response.json()) as { result?: YnotAdminUser360SectionResult };
      if (!payload.result) {
        setMessage("Could not load this section.");
        return;
      }
      setSections((current) => ({
        ...current,
        [activeSection]: payload.result,
      }));
    });
  }, [activeSection, profileId, sections, summary.query.pageSize]);

  const tabs = useMemo(
    () =>
      sectionTabs.map((section) => (
        <button
          className={`t ${activeSection === section ? "active" : ""}`}
          key={section}
          onClick={() => setActiveSection(section)}
          type="button"
        >
          {sectionLabels[section]} · {sectionCount(summary, section)}
        </button>
      )),
    [activeSection, summary],
  );

  return (
    <AdminCard>
      <AdminCardHead
        label="User detail"
        title={sectionLabels[activeSection]}
        actions={<div className="tabs">{tabs}</div>}
      />
      {message ? <div className="card-pad text-mute">{message}</div> : null}
      {isPending && !loaded ? (
        <div className="card-pad text-mute">Loading section...</div>
      ) : null}
      {loaded ? (
        <div className="card-pad">
          {renderSection(loaded)}
        </div>
      ) : null}
      <div className="card-pad">
        <Link
          className="btn btn-ghost"
          href={profileScopedHref("/admin/shipping?profileId=", profileId)}
          prefetch={false}
        >
          <AdminIcon name="truck" />
          Open shipping queue
        </Link>
      </div>
    </AdminCard>
  );
}
```

- [ ] **Step 4: Update the existing Admin User 360 static test**

Modify `Website/scripts/test-admin-user360-flow.mjs`:

Replace the test name `User 360 detail page shows full launch sections without UI-only slices` with:

```js
test("User 360 detail page loads summary first and exposes lazy launch sections", () => {
```

Inside that test, replace the old expectations that `normalizeAdminUser360Query` has no `section` and the page calls `getAdminUserDetail` with:

```js
assert.match(typesSource, /export type YnotAdminUser360Section/);
assert.match(typesSource, /export type YnotAdminUserDetailSummary/);
assert.match(dataSource, /export async function getAdminUserDetailSummary/);
assert.match(dataSource, /export async function getAdminUser360Section/);
assert.match(adminUserDetailPage, /getAdminUserDetailSummary\(profileId/);
assert.doesNotMatch(adminUserDetailPage, /getAdminUserDetail\(profileId/);
assert.match(adminUser360, /AdminUser360Sections/);
assert.match(adminUser360, /summary\.counts\.collection/);
assert.match(adminUser360, /summary\.counts\.gachaOpens/);
```

In the detail API test, replace old no-section assertions with:

```js
assert.match(adminUserDetailRoute, /normalizeAdminUser360Section/);
assert.match(adminUserDetailRoute, /searchParams\.get\("section"\)/);
assert.match(adminUserDetailRoute, /getAdminUserDetailSummary/);
assert.match(adminUserDetailRoute, /getAdminUser360Section/);
```

- [ ] **Step 5: Run Admin User 360 tests**

Run:

```bash
cd Website && npm run test:admin-user360-flow
```

Expected: PASS.

- [ ] **Step 6: Run backend hardening tests**

Run:

```bash
cd Website && npm run test:admin-backend-hardening
```

Expected: PASS for same-origin and Admin User 360 cases; select minimization may still fail until Task 5.

- [ ] **Step 7: Commit UI split**

Run:

```bash
git add Website/src/app/admin/users/[profileId]/page.tsx Website/src/features/ynot/admin/AdminUser360.tsx Website/src/features/ynot/admin/AdminUser360Sections.tsx Website/scripts/test-admin-user360-flow.mjs
git commit \
  -m "Load Admin User 360 detail sections lazily" \
  -m "Constraint: Admins need full launch detail, but first render should not fetch every history section." \
  -m "Rejected: Keeping full server-side detail fanout | high Cloudflare and Supabase load on every profile open." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: New User 360 sections must load through the section API and stay admin-only no-store." \
  -m "Tested: npm run test:admin-user360-flow; npm run test:admin-backend-hardening partial pass" \
  -m "Not-tested: browser click path"
```

---

### Task 5: Minimize Priority Broad Selects

**Files:**
- Modify: `Website/src/app/api/ynot/wallet/route.ts`
- Modify: `Website/src/app/api/ynot/admin/cards/route.ts`
- Modify: `Website/src/app/api/ynot/admin/categories/route.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/route.ts`
- Modify: `Website/src/app/api/ynot/admin/tier-animations/route.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-admin-backend-hardening.mjs`

- [ ] **Step 1: Add wallet top-up response select**

In `Website/src/app/api/ynot/wallet/route.ts`, after `TOP_UP_IDEMPOTENCY_KEY_RE`, add:

```ts
const TOP_UP_RESPONSE_SELECT =
  "id,public_code,profile_id,amount_thb,coin_amount,status,admin_note,customer_note,payment_method_id,created_at,reviewed_at,idempotency_key";
```

Replace both `.from("top_up_requests").select("*")` calls in `fetchExistingTopUpByIdempotency` and `fetchTopUpById` with:

```ts
.select(TOP_UP_RESPONSE_SELECT)
```

Replace the two auto-approval/auto-rejection refresh selects with:

```ts
.select(TOP_UP_RESPONSE_SELECT)
```

- [ ] **Step 2: Add admin card return select**

In `Website/src/app/api/ynot/admin/cards/route.ts`, after `adminCardMutationRateLimit`, add:

```ts
const ADMIN_CARD_RETURN_SELECT =
  "id,name,card_code,series,grade,language,release_year,card_set,variant,print_label,catalog_category,condition,grading_service,cert_number,gemrate_id,prize_category,image_url,image_storage_path,is_test,asset_source,asset_license,asset_manifest_key,seed_run_id,created_at,updated_at";
```

Replace card create/update return selects:

```ts
.select(ADMIN_CARD_RETURN_SELECT)
```

- [ ] **Step 3: Add admin category return select**

In `Website/src/app/api/ynot/admin/categories/route.ts`, near the top-level constants, add:

```ts
const ADMIN_CATEGORY_RETURN_SELECT =
  "id,slug,name_th,name_en,description_th,description_en,banner_image_url,sort_order,is_active,is_test,seed_run_id,created_at,updated_at";
```

Replace category list/create/update `.select("*")` calls with:

```ts
.select(ADMIN_CATEGORY_RETURN_SELECT)
```

- [ ] **Step 4: Add payment method return select**

In `Website/src/app/api/ynot/admin/payment-methods/route.ts`, after `type PaymentMethodRow`, add:

```ts
const ADMIN_PAYMENT_METHOD_RETURN_SELECT =
  "id,code,type,display_name,bank_name,account_name,account_number,promptpay_id,qr_image_path,instructions,is_active,sort_order";
```

Replace the upsert return select:

```ts
.select(ADMIN_PAYMENT_METHOD_RETURN_SELECT)
```

- [ ] **Step 5: Add tier animation return select**

In `Website/src/app/api/ynot/admin/tier-animations/route.ts`, after `MAX_BYTES`, add:

```ts
const ADMIN_TIER_ANIMATION_RETURN_SELECT =
  "id,tier,video_url,sound_url,poster_url,duration_ms,is_active,updated_at,updated_by_admin_id";
```

Replace the update return select:

```ts
.select(ADMIN_TIER_ANIMATION_RETURN_SELECT)
```

- [ ] **Step 6: Keep toTopUp compatible with narrowed rows**

In `Website/src/features/ynot/data.ts`, change the `toTopUp` row parameter type to a focused pick so API route narrow rows still typecheck:

```ts
type TopUpDisplayRow = Pick<
  Database["public"]["Tables"]["top_up_requests"]["Row"],
  | "id"
  | "public_code"
  | "profile_id"
  | "amount_thb"
  | "coin_amount"
  | "status"
  | "admin_note"
  | "customer_note"
  | "payment_method_id"
  | "created_at"
  | "reviewed_at"
>;
```

Then change:

```ts
row: Database["public"]["Tables"]["top_up_requests"]["Row"],
```

to:

```ts
row: TopUpDisplayRow,
```

- [ ] **Step 7: Run select minimization tests**

Run:

```bash
cd Website && npm run test:admin-backend-hardening
```

Expected: PASS.

- [ ] **Step 8: Run related behavior tests**

Run:

```bash
cd Website && npm run test:top-up-flow && npm run test:admin-ops-api-rpc-performance && npm run test:admin-user360-flow
```

Expected: PASS. Top-up submit/replay, admin operations, and Admin User 360 contracts remain intact.

- [ ] **Step 9: Commit select minimization**

Run:

```bash
git add Website/src/app/api/ynot/wallet/route.ts Website/src/app/api/ynot/admin/cards/route.ts Website/src/app/api/ynot/admin/categories/route.ts Website/src/app/api/ynot/admin/payment-methods/route.ts Website/src/app/api/ynot/admin/tier-animations/route.ts Website/src/features/ynot/data.ts
git commit \
  -m "Narrow priority backend return selects" \
  -m "Constraint: Public and admin API behavior must stay the same while reducing unnecessary row payload." \
  -m "Rejected: Repo-wide select star cleanup in one pass | too broad for launch hardening." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: New API mutation return payloads should use named select constants." \
  -m "Tested: npm run test:admin-backend-hardening; npm run test:top-up-flow; npm run test:admin-ops-api-rpc-performance; npm run test:admin-user360-flow" \
  -m "Not-tested: production Supabase latency"
```

---

### Task 6: Final Verification And Supabase Dry-Run Gate

**Files:**
- Verify: `Website/package.json`
- Verify: `Website/scripts/test-admin-backend-hardening.mjs`
- Verify: `docs/superpowers/plans/2026-06-17-api-rpc-cloudflare-load-privacy.md`

- [ ] **Step 1: Run focused backend/security tests**

Run:

```bash
cd Website && npm run test:admin-backend-hardening && npm run test:admin-user360-flow && npm run test:admin-ops-api-rpc-performance && npm run test:top-up-flow && npm run test:pack-open-privacy && npm run test:rate-limits
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
cd Website && npm run typecheck && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run Cloudflare build**

Run:

```bash
cd Website && npm run cf:build:website
```

Expected: PASS. The OpenNext Cloudflare build completes without type or route-handler errors.

- [ ] **Step 4: Check Supabase migration status without applying**

Run:

```bash
cd Database && npx supabase migration list --linked
```

Expected: command prints local/remote migration status. If the CLI reports auth/link problems, stop and report the exact message.

- [ ] **Step 5: Dry-run pending DB changes**

Run:

```bash
cd Database && npx supabase db push --linked --dry-run --include-all
```

Expected safe outcomes:
- `Remote database is up to date.` means no live DB apply is needed.
- A dry-run showing only expected new hardening/RPC migrations can be reviewed before apply.

If the dry-run shows unrelated pending migrations, migration ledger mismatch, destructive table changes, or unknown SQL, stop and report. Do not apply live DB changes from this plan without that review.

- [ ] **Step 6: Optional local browser smoke after implementation**

Run:

```bash
cd Website && npm run dev
```

Open `/admin/users`, click a user, and verify:
- First render shows profile, wallet KPI, address, and counts.
- Clicking each User 360 section loads only that section.
- Admin top-ups and shipping deep links still include `profileId`.
- Public pack open response still hides house fields.

- [ ] **Step 7: Final commit if verification required fixes**

If Task 6 required source changes, commit them:

```bash
git add Website Database docs/superpowers/plans
git commit \
  -m "Verify backend hardening for launch" \
  -m "Constraint: Launch verification must prove admin security, top-up behavior, pack privacy, and Cloudflare build health." \
  -m "Rejected: Skipping DB dry-run | linked Supabase state can drift from local migrations." \
  -m "Confidence: medium" \
  -m "Scope-risk: narrow" \
  -m "Directive: Re-run focused backend tests before shipping admin/backend hardening changes." \
  -m "Tested: npm run test:admin-backend-hardening; npm run test:admin-user360-flow; npm run test:admin-ops-api-rpc-performance; npm run test:top-up-flow; npm run test:pack-open-privacy; npm run test:rate-limits; npm run typecheck; npm run lint; npm run cf:build:website; npx supabase db push --linked --dry-run --include-all" \
  -m "Not-tested: live production mutation clicks unless browser smoke was completed"
```

---

## Self-Review

- Spec coverage: admin same-origin hardening is covered by Tasks 1-2; Admin User 360 performance is covered by Tasks 3-4; duplicate/broad data reads are covered by Task 5; no house-info leak is covered by Task 1 and final pack-open privacy verification; Supabase/RPC caution is covered by Task 6.
- Placeholder scan: no deferred fields, vague implementation markers, or unspecified test commands remain in this plan.
- Type consistency: `YnotAdminUser360Section`, `YnotAdminUserDetailSummary`, and `YnotAdminUser360SectionResult` are defined before usage; `getAdminUserDetailSummary`, `getAdminUser360Section`, and `normalizeAdminUser360Section` are introduced before page/API usage.
