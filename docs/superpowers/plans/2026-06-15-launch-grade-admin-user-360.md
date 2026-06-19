# Launch Grade Admin User 360 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a launch-ready user detail flow where `/admin/users` can find any customer and `/admin/users/[profileId]` shows the customer's profile, wallet, pack opens, prize wins, exchange, shipping, top-up, and audit details without leaking house information to customer APIs.

**Architecture:** Keep customer/public DTOs and admin DTOs separate. Extend the existing server-rendered admin pages and Next.js App Router route handlers, backed by service-role Supabase reads and the existing mutation RPCs for shipping/top-up operations. Avoid new database RPCs in this phase unless verification proves the read path cannot scale with the existing indexed tables.

**Tech Stack:** Next.js App Router route handlers, React Server Components, TypeScript, Supabase service-role data access, existing Supabase RPCs (`update_shipping_request_status`, `approve_top_up_request`, `reject_top_up_request`, `open_gacha_campaign`, `submit_top_up_request`), Node `node:test` static contract scripts.

---

## Scope Check

This is one coherent admin-ops feature because the user directory, User 360 detail page, admin read APIs, shipping queue filter, top-up queue filter, and API/RPC contract checks all support the same launch requirement: staff must be able to inspect one user's full operational state quickly.

This plan does not change public pack-opening odds, stock logic, or customer-facing prize DTOs. It also does not apply production Supabase migrations. If implementation later needs a database index, add a separate guarded migration plan and run the linked Supabase dry-run gate before any live apply.

## File Structure

- Create: `Website/scripts/test-admin-user360-flow.mjs`
  - Static contract guard for the directory, detail page, admin read APIs, privacy boundary, and related mutation RPC wiring.
- Modify: `Website/package.json`
  - Add `test:admin-user360-flow`.
- Modify: `Website/src/features/ynot/types.ts`
  - Add admin directory/search/result types, User 360 section types, and exchange history to `YnotAdminUserDetail`.
- Modify: `Website/src/features/ynot/data.ts`
  - Add query normalizers, searchable/paginated `getAdminUserDirectory`, detail-section normalization, profile-filtered admin shipping/top-up loaders, and exchange history in `getAdminUserDetail`.
- Modify: `Website/src/app/api/ynot/admin/users/route.ts`
  - Keep existing owner-only `PATCH`, add admin-only `GET` for directory search.
- Create: `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts`
  - Admin-only JSON detail endpoint for User 360.
- Modify: `Website/src/app/admin/users/page.tsx`
  - Use `searchParams`, render search/filter/pagination, and keep role management.
- Modify: `Website/src/app/admin/users/[profileId]/page.tsx`
  - Accept section/page params and pass normalized detail into User 360.
- Modify: `Website/src/features/ynot/admin/AdminUser360.tsx`
  - Render launch-grade detail sections with full loaded rows, not hard-coded UI slices.
- Modify: `Website/src/app/admin/shipping/page.tsx`
  - Accept `profileId` query string so User 360 can open the shipping queue filtered to one user.
- Modify: `Website/src/app/admin/top-ups/page.tsx`
  - Accept `profileId` query string so User 360 can open top-up history filtered to one user.
- Test existing scripts:
  - `npm run test:admin-user360-flow`
  - `npm run test:shipping-flow`
  - `npm run test:top-up-flow`
  - `npm run test:pack-open-privacy`
  - `npm run typecheck`

---

### Task 1: Lock Admin User 360 Contract Tests

**Files:**
- Create: `Website/scripts/test-admin-user360-flow.mjs`
- Modify: `Website/package.json`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Write the failing contract test**

Create `Website/scripts/test-admin-user360-flow.mjs` with this content:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function readOptional(rel) {
  const url = new URL(`../${rel}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

const packageSource = read("package.json");
const dataSource = read("src/features/ynot/data.ts");
const typesSource = read("src/features/ynot/types.ts");
const adminUsersPage = read("src/app/admin/users/page.tsx");
const adminUserDetailPage = read("src/app/admin/users/[profileId]/page.tsx");
const adminUser360 = read("src/features/ynot/admin/AdminUser360.tsx");
const adminUsersRoute = read("src/app/api/ynot/admin/users/route.ts");
const adminUserDetailRoute = readOptional("src/app/api/ynot/admin/users/[profileId]/detail/route.ts");
const adminShippingPage = read("src/app/admin/shipping/page.tsx");
const adminTopUpsPage = read("src/app/admin/top-ups/page.tsx");
const adminShippingRoute = read("src/app/api/ynot/admin/shipping/route.ts");
const adminTopUpsRoute = read("src/app/api/ynot/admin/top-ups/route.ts");
const gachaOpenRoute = read("src/app/api/ynot/gacha/open/route.ts");
const walletRoute = read("src/app/api/ynot/wallet/route.ts");

test("package exposes the admin User 360 regression script", () => {
  assert.match(packageSource, /"test:admin-user360-flow":\s*"node --test scripts\/test-admin-user360-flow\.mjs"/);
});

test("admin user directory supports search pagination and a read API", () => {
  assert.match(typesSource, /export type YnotAdminUserDirectoryQuery/);
  assert.match(typesSource, /export type YnotAdminUserDirectoryResult/);
  assert.match(dataSource, /export function normalizeAdminUserDirectoryQuery/);
  assert.match(dataSource, /export async function getAdminUserDirectory/);
  assert.match(adminUsersPage, /searchParams/);
  assert.match(adminUsersPage, /getAdminUserDirectory/);
  assert.match(adminUsersPage, /name="q"/);
  assert.match(adminUsersPage, /name="role"/);
  assert.match(adminUsersPage, /name="status"/);
  assert.match(adminUsersPage, /Next page/);
  assert.match(adminUsersRoute, /export async function GET\(request: Request\)/);
  assert.match(adminUsersRoute, /resolveAdminSession\(\)/);
  assert.match(adminUsersRoute, /getAdminUserDirectory/);
  assert.match(adminUsersRoute, /Cache-Control",\s*"no-store"/);
});

test("User 360 detail page shows full launch sections without UI-only slices", () => {
  assert.match(typesSource, /export type YnotAdminUser360Section/);
  assert.match(typesSource, /exchanges: YnotExchangeOrder\[\]/);
  assert.match(dataSource, /export function normalizeAdminUser360Query/);
  assert.match(dataSource, /getExchanges\(profileId/);
  assert.match(adminUserDetailPage, /searchParams/);
  assert.match(adminUserDetailPage, /normalizeAdminUser360Query/);
  assert.match(adminUserDetailPage, /getAdminUserDetail\(profileId,\s*detailQuery\)/);
  assert.match(adminUser360, /Prize wins/);
  assert.match(adminUser360, /Pack open rewards/);
  assert.match(adminUser360, /Shipping and address/);
  assert.match(adminUser360, /Wallet and top-ups/);
  assert.match(adminUser360, /Exchange history/);
  assert.match(adminUser360, /Support timeline/);
  assert.doesNotMatch(adminUser360, /\.slice\(0,\s*(?:3|8|12|20|30)\)/);
});

test("admin User 360 detail API is admin-only and no-store", () => {
  assert.notEqual(adminUserDetailRoute, "", "detail route must exist");
  assert.match(adminUserDetailRoute, /export const dynamic = "force-dynamic"/);
  assert.match(adminUserDetailRoute, /RouteContext<["']\/api\/ynot\/admin\/users\/\[profileId\]\/detail["']>/);
  assert.match(adminUserDetailRoute, /resolveAdminSession\(\)/);
  assert.match(adminUserDetailRoute, /getAdminUserDetail\(profileId,\s*detailQuery\)/);
  assert.match(adminUserDetailRoute, /Cache-Control",\s*"no-store"/);
  assert.doesNotMatch(adminUserDetailRoute, /error:\s*error\.message/);
});

test("User 360 can deep-link to filtered shipping and top-up operations", () => {
  assert.match(adminUser360, /\/admin\/shipping\?profileId=/);
  assert.match(adminUser360, /\/admin\/top-ups\?profileId=/);
  assert.match(adminShippingPage, /searchParams/);
  assert.match(adminShippingPage, /getShipping\(profileId,\s*true/);
  assert.match(adminTopUpsPage, /profileId/);
  assert.match(adminTopUpsPage, /getTopUps\(profileId,\s*true/);
  const getShippingBlock = between(dataSource, "export async function getShipping", "function publicShippingRequest");
  assert.match(getShippingBlock, /if \(profileId\) query = query\.eq\("profile_id", profileId\)/);
});

test("related admin APIs still call the intended database RPCs", () => {
  assert.match(adminShippingRoute, /rpc\("update_shipping_request_status"/);
  assert.match(adminTopUpsRoute, /rpc\("approve_top_up_request"/);
  assert.match(adminTopUpsRoute, /rpc\("reject_top_up_request"/);
  assert.match(gachaOpenRoute, /rpc\("open_gacha_campaign"/);
  assert.match(walletRoute, /rpc\("submit_top_up_request"/);
});

test("User 360 work does not widen public house-info responses", () => {
  const publicOpenItem = between(gachaOpenRoute, "function toPublicOpenItem", "function toPublicOpenResult");
  const publicOpenResult = between(gachaOpenRoute, "function toPublicOpenResult", "function openErrorMessage");
  const publicCampaign = between(dataSource, "function publicYnotCampaign", "function localOwnerMockPrizeLineup");
  for (const privateField of [
    "logic_snapshot",
    "logicMode",
    "weight",
    "unlockAtSoldPct",
    "stockUnitId",
    "stockSkuId",
    "stockLabel",
    "drawRoundPrizeUnitIds",
    "identityMismatch",
    "primaryReason",
    "intendedStock",
  ]) {
    assert.doesNotMatch(publicOpenItem, new RegExp(privateField));
    assert.doesNotMatch(publicOpenResult, new RegExp(privateField));
    assert.doesNotMatch(publicCampaign, new RegExp(`${privateField}:`));
  }
});
```

- [ ] **Step 2: Add the npm script**

Modify `Website/package.json` inside `"scripts"` and add this line near the other `test:*` entries:

```json
"test:admin-user360-flow": "node --test scripts/test-admin-user360-flow.mjs",
```

- [ ] **Step 3: Run the new test and verify it fails**

Run:

```bash
cd Website
npm run test:admin-user360-flow
```

Expected: FAIL. The first missing items should mention `YnotAdminUserDirectoryQuery`, `getAdminUserDirectory`, the new detail API route, or missing User 360 section strings.

- [ ] **Step 4: Commit the failing contract test**

Run:

```bash
git add Website/package.json Website/scripts/test-admin-user360-flow.mjs
git commit -m "Lock admin User 360 launch expectations" \
  -m "Constraint: launch ops needs complete per-user visibility without public house-info leaks." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep this test focused on admin/user360 contracts and related RPC wiring." \
  -m "Tested: npm run test:admin-user360-flow fails on the missing planned contracts." \
  -m "Not-tested: implementation is intentionally not present yet."
```

---

### Task 2: Add Admin User 360 Types and Query Normalizers

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Extend the admin types**

Modify `Website/src/features/ynot/types.ts`. Replace the current `YnotAdminUserDetail` block with this complete block, keeping the existing surrounding types unchanged:

```ts
export type YnotAdminUserDirectoryRoleFilter =
  | "all"
  | "owner"
  | "admin"
  | "staff"
  | "customer";

export type YnotAdminUserDirectoryStatusFilter =
  | "all"
  | "active"
  | "flagged"
  | "suspended"
  | "disabled";

export type YnotAdminUserDirectoryQuery = {
  q: string;
  role: YnotAdminUserDirectoryRoleFilter;
  status: YnotAdminUserDirectoryStatusFilter;
  page: number;
  pageSize: number;
};

export type YnotAdminUserDirectoryRow = {
  id: string;
  email?: string | null;
  displayName: string;
  lineDisplayName?: string | null;
  lineUserId?: string | null;
  phone?: string | null;
  status?: string | null;
  adminRole?: "owner" | "admin" | "staff" | null;
  adminActive: boolean;
  createdAt: string;
};

export type YnotAdminUserDirectoryResult = {
  users: YnotAdminUserDirectoryRow[];
  query: YnotAdminUserDirectoryQuery;
  total: number;
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type YnotAdminUser360Section =
  | "overview"
  | "prizes"
  | "opens"
  | "shipping"
  | "wallet"
  | "topups"
  | "exchanges"
  | "audit";

export type YnotAdminUser360Query = {
  section: YnotAdminUser360Section;
  page: number;
  pageSize: number;
};

export type YnotAdminUserDetail = {
  profile: YnotShippingCustomer & {
    fullName?: string | null;
    avatarUrl?: string | null;
    preferredLanguage?: "th" | "en" | string | null;
  };
  wallet: YnotWallet;
  addresses: YnotAddress[];
  collection: YnotCollectionItem[];
  gachaOpens: YnotGachaOpenHistory[];
  shipping: YnotShippingRequest[];
  topUps: YnotTopUp[];
  exchanges: YnotExchangeOrder[];
  walletLedger: YnotWalletLedgerEntry[];
  auditTimeline: YnotShippingTimelineEvent[];
  query: YnotAdminUser360Query;
};
```

- [ ] **Step 2: Add query normalizers in the data layer**

In `Website/src/features/ynot/data.ts`, add these imports to the existing type import list from `@/features/ynot/types`:

```ts
  type YnotAdminUser360Query,
  type YnotAdminUser360Section,
  type YnotAdminUserDirectoryQuery,
  type YnotAdminUserDirectoryRoleFilter,
  type YnotAdminUserDirectoryResult,
  type YnotAdminUserDirectoryStatusFilter,
```

Then add this code just before `export async function getAdminUsers()`:

```ts
const ADMIN_USER_DIRECTORY_DEFAULT_PAGE_SIZE = 50;
const ADMIN_USER_DIRECTORY_MAX_PAGE_SIZE = 100;
const ADMIN_USER360_DEFAULT_PAGE_SIZE = 100;
const ADMIN_USER360_MAX_PAGE_SIZE = 500;

const adminUserDirectoryRoles = new Set<YnotAdminUserDirectoryRoleFilter>([
  "all",
  "owner",
  "admin",
  "staff",
  "customer",
]);

const adminUserDirectoryStatuses = new Set<YnotAdminUserDirectoryStatusFilter>([
  "all",
  "active",
  "flagged",
  "suspended",
  "disabled",
]);

const adminUser360Sections = new Set<YnotAdminUser360Section>([
  "overview",
  "prizes",
  "opens",
  "shipping",
  "wallet",
  "topups",
  "exchanges",
  "audit",
]);

function pageNumber(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function boundedPageSize(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function adminSearchText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[,%]/g, " ").slice(0, 120);
}

export function normalizeAdminUserDirectoryQuery(
  input: {
    q?: unknown;
    role?: unknown;
    status?: unknown;
    page?: unknown;
    pageSize?: unknown;
  } = {},
): YnotAdminUserDirectoryQuery {
  const role = adminUserDirectoryRoles.has(input.role as YnotAdminUserDirectoryRoleFilter)
    ? (input.role as YnotAdminUserDirectoryRoleFilter)
    : "all";
  const status = adminUserDirectoryStatuses.has(input.status as YnotAdminUserDirectoryStatusFilter)
    ? (input.status as YnotAdminUserDirectoryStatusFilter)
    : "all";
  return {
    q: adminSearchText(input.q),
    role,
    status,
    page: pageNumber(input.page),
    pageSize: boundedPageSize(
      input.pageSize,
      ADMIN_USER_DIRECTORY_DEFAULT_PAGE_SIZE,
      ADMIN_USER_DIRECTORY_MAX_PAGE_SIZE,
    ),
  };
}

export function normalizeAdminUser360Query(
  input: {
    section?: unknown;
    page?: unknown;
    pageSize?: unknown;
  } = {},
): YnotAdminUser360Query {
  const section = adminUser360Sections.has(input.section as YnotAdminUser360Section)
    ? (input.section as YnotAdminUser360Section)
    : "overview";
  return {
    section,
    page: pageNumber(input.page),
    pageSize: boundedPageSize(
      input.pageSize,
      ADMIN_USER360_DEFAULT_PAGE_SIZE,
      ADMIN_USER360_MAX_PAGE_SIZE,
    ),
  };
}
```

- [ ] **Step 3: Run the contract test and typecheck**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run typecheck
```

Expected: `test:admin-user360-flow` still FAILS on missing data/API/UI work. `typecheck` should PASS after import names are correct.

- [ ] **Step 4: Commit the type/query foundation**

Run:

```bash
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts
git commit -m "Define admin User 360 query contracts" \
  -m "Constraint: admin detail must be queryable without reusing public DTOs." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep query normalizers server-side and validate search params before DB reads." \
  -m "Tested: npm run typecheck" \
  -m "Not-tested: full admin-user360 contract still fails until later tasks land."
```

---

### Task 3: Build Searchable Admin User Directory Data and GET API

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/app/api/ynot/admin/users/route.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Replace `getAdminUsers` with directory result plus wrapper**

In `Website/src/features/ynot/data.ts`, replace the existing `export async function getAdminUsers()` with this implementation:

```ts
function postgresInList(values: string[]) {
  return `(${values.join(",")})`;
}

export async function getAdminUserDirectory(
  input: Partial<YnotAdminUserDirectoryQuery> = {},
): Promise<YnotAdminUserDirectoryResult> {
  const queryInput = normalizeAdminUserDirectoryQuery(input);
  if (!isSupabaseConfigured()) {
    return {
      users: [],
      query: queryInput,
      total: 0,
      page: queryInput.page,
      pageSize: queryInput.pageSize,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return {
      users: [],
      query: queryInput,
      total: 0,
      page: queryInput.page,
      pageSize: queryInput.pageSize,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }

  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_user_directory", async () => {
    const { data: allAdminRows, error: allAdminError } = await supabase
      .from("admin_users")
      .select("id,profile_id,role,is_active,created_at");
    if (allAdminError) throw allAdminError;

    const activeAdminRows = (allAdminRows ?? []).filter((row) => row.is_active);
    const activeAdminProfileIds = activeAdminRows.map((row) => row.profile_id);
    const roleProfileIds =
      queryInput.role === "all" || queryInput.role === "customer"
        ? []
        : activeAdminRows
            .filter((row) => row.role === queryInput.role)
            .map((row) => row.profile_id);

    if (queryInput.role !== "all" && queryInput.role !== "customer" && roleProfileIds.length === 0) {
      return [{
        users: [],
        query: queryInput,
        total: 0,
        page: queryInput.page,
        pageSize: queryInput.pageSize,
        hasPreviousPage: queryInput.page > 1,
        hasNextPage: false,
      }];
    }

    const offset = (queryInput.page - 1) * queryInput.pageSize;
    let profilesQuery = supabase
      .from("profiles")
      .select(
        "id,email,display_name,line_display_name,line_user_id,phone,profile_status,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + queryInput.pageSize - 1);

    if (queryInput.q) {
      const term = queryInput.q;
      const searchTerms = [
          `email.ilike.%${term}%`,
          `display_name.ilike.%${term}%`,
          `line_display_name.ilike.%${term}%`,
          `line_user_id.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
        ];
      if (looksLikeUuid(term)) searchTerms.unshift(`id.eq.${term}`);
      profilesQuery = profilesQuery.or(searchTerms.join(","));
    }

    if (queryInput.status !== "all") {
      profilesQuery = profilesQuery.eq("profile_status", queryInput.status);
    }

    if (queryInput.role !== "all" && queryInput.role !== "customer") {
      profilesQuery = profilesQuery.in("id", roleProfileIds);
    }

    if (queryInput.role === "customer" && activeAdminProfileIds.length) {
      profilesQuery = profilesQuery.not("id", "in", postgresInList(activeAdminProfileIds));
    }

    const { data: profiles, error: profilesError, count } = await profilesQuery;
    if (profilesError) throw profilesError;

    const adminByProfile = new Map(
      activeAdminRows.map((row) => [row.profile_id, row]),
    );
    const users = (profiles ?? []).map((profile) => {
      const adminRow = adminByProfile.get(profile.id);
      return {
        id: profile.id,
        email: profile.email,
        displayName:
          profile.display_name ?? profile.line_display_name ?? "YNot Customer",
        lineDisplayName: profile.line_display_name,
        lineUserId: profile.line_user_id,
        phone: profile.phone,
        status: profile.profile_status,
        adminRole: adminRow?.role ?? null,
        adminActive: Boolean(adminRow?.is_active),
        createdAt: profile.created_at,
      };
    });

    const total = count ?? users.length;
    return [{
      users,
      query: queryInput,
      total,
      page: queryInput.page,
      pageSize: queryInput.pageSize,
      hasPreviousPage: queryInput.page > 1,
      hasNextPage: offset + users.length < total,
    }];
  }).then((rows) => rows[0] ?? {
    users: [],
    query: queryInput,
    total: 0,
    page: queryInput.page,
    pageSize: queryInput.pageSize,
    hasPreviousPage: false,
    hasNextPage: false,
  });
}

export async function getAdminUsers() {
  const directory = await getAdminUserDirectory();
  return directory.users;
}
```

- [ ] **Step 2: Add admin directory GET API**

Modify `Website/src/app/api/ynot/admin/users/route.ts`. Add `getAdminUserDirectory` to imports:

```ts
import { getAdminUserDirectory } from "@/features/ynot/data";
```

Then add this `GET` handler before the existing `PATCH` handler:

```ts
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:users:read",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const result = await getAdminUserDirectory({
    q: url.searchParams.get("q") ?? "",
    role: url.searchParams.get("role") ?? "all",
    status: url.searchParams.get("status") ?? "all",
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "50",
  });
  const response = Response.json({ result });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run typecheck
```

Expected: `test:admin-user360-flow` still FAILS on detail-page/UI sections. The directory/API assertions should now pass. `typecheck` should PASS.

- [ ] **Step 4: Commit directory data/API**

Run:

```bash
git add Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/users/route.ts
git commit -m "Add searchable admin user directory API" \
  -m "Constraint: launch admins need lookup by identity fields without exposing this data publicly." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep directory reads admin-gated and no-store." \
  -m "Tested: npm run typecheck; npm run test:admin-user360-flow partially passes through directory/API assertions." \
  -m "Not-tested: visual directory filters land in a later task."
```

---

### Task 4: Expand User 360 Data With Exchanges, Larger Section Limits, and Profile Filters

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Add limit options to existing loaders**

In `Website/src/features/ynot/data.ts`, add this helper near the query normalizers:

```ts
function boundedRowLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}
```

Change the `getTopUps` signature and first query limit:

```ts
export async function getTopUps(
  profileId?: string,
  includeAll = false,
  options: { includeSensitiveSlipDetails?: boolean; limit?: number } = {},
): Promise<YnotTopUp[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const includeSensitiveSlipDetails =
    options.includeSensitiveSlipDetails ?? includeAll;
  const safeLimit = boundedRowLimit(options.limit, includeAll ? 200 : 80, 500);
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("topups", async () => {
    let query = supabase
      .from("top_up_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (profileId) query = query.eq("profile_id", profileId);
```

Change the `getCollection` signature and `collectionLimit`:

```ts
export async function getCollection(
  profileId?: string,
  options: { limit?: number } = {},
): Promise<YnotCollectionItem[]> {
  if (!profileId) return [];
  const collectionLimit = boundedRowLimit(
    options.limit,
    isDevAuthAllowed() &&
      profileId === process.env.YNOT_PREVIEW_PROFILE_ID?.trim()
      ? 1000
      : 200,
    1000,
  );
```

Change the `getGachaOpenHistory` signature and `.limit(50)`:

```ts
export async function getGachaOpenHistory(
  profileId?: string,
  options: { limit?: number } = {},
): Promise<YnotGachaOpenHistory[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  const safeLimit = boundedRowLimit(options.limit, 50, 500);
  const supabase = createServiceSupabaseClient();
  const opens = await readOrEmpty("gacha_opens", async () => {
    const { data, error } = await supabase
      .from("gacha_opens")
      .select("*")
      .eq("profile_id", profileId)
      .order("opened_at", { ascending: false })
      .limit(safeLimit);
```

Change the `getExchanges` signature and `.limit(80)`:

```ts
export async function getExchanges(
  profileId?: string,
  includeAll = false,
  options: { limit?: number } = {},
): Promise<YnotExchangeOrder[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const safeLimit = boundedRowLimit(options.limit, 80, 500);
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("exchanges", async () => {
    let query = supabase
      .from("exchange_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (profileId) query = query.eq("profile_id", profileId);
```

Change the `getShipping` signature and profile filtering:

```ts
export async function getShipping(
  profileId?: string,
  includeAll = false,
  options: { limit?: number } = {},
): Promise<YnotShippingRequest[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  if (includeAll && !(await resolveAdminSession())) return [];
  const safeLimit = boundedRowLimit(options.limit, includeAll ? 200 : 80, 500);
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("shipping", async () => {
    let query = supabase
      .from("shipping_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (profileId) query = query.eq("profile_id", profileId);
```

- [ ] **Step 2: Expand `getAdminUserDetail`**

Change the function signature:

```ts
export async function getAdminUserDetail(
  profileId: string,
  input: Partial<YnotAdminUser360Query> = {},
): Promise<YnotAdminUserDetail | null> {
```

Add this after the Supabase client is created:

```ts
  const detailQuery = normalizeAdminUser360Query(input);
  const sectionLimit = detailQuery.pageSize;
```

In the `Promise.all` list, add exchanges and larger section limits:

```ts
  const [
    wallet,
    addresses,
    collection,
    gachaOpens,
    shipping,
    topUps,
    exchanges,
    walletLedger,
    auditRows,
  ] = await Promise.all([
    getWallet(profileId),
    getAddresses(profileId),
    getCollection(profileId, { limit: sectionLimit }),
    getGachaOpenHistory(profileId, { limit: sectionLimit }),
    getShipping(profileId, false, { limit: sectionLimit }),
    getTopUps(profileId, false, {
      includeSensitiveSlipDetails: true,
      limit: sectionLimit,
    }),
    getExchanges(profileId, false, { limit: sectionLimit }),
    readOrEmpty("admin_user_wallet_ledger", async () => {
      const { data, error } = await supabase
        .from("coin_ledger")
        .select(
          "id,entry_type,amount_coins,balance_before,balance_after,reference_type,created_at",
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(sectionLimit);
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("admin_user_audit", async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select(AUDIT_EVENT_TIMELINE_SELECT)
        .eq("actor_profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(sectionLimit);
      if (error) throw error;
      return data ?? [];
    }),
  ]);
```

In the return object, add:

```ts
    exchanges,
    query: detailQuery,
```

- [ ] **Step 3: Run loader/RPC guard tests**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run test:shipping-flow
npm run test:top-up-flow
npm run typecheck
```

Expected: User 360 contract still FAILS on missing API/UI sections. Shipping and top-up tests should PASS because the existing mutation RPC routes remain unchanged.

- [ ] **Step 4: Commit expanded User 360 data**

Run:

```bash
git add Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts
git commit -m "Expand admin User 360 data coverage" \
  -m "Constraint: launch admins need exchange, prize, open, shipping, top-up, ledger, and audit context on one user." \
  -m "Rejected: new database RPC | existing service-role reads are enough for the first launch pass." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Do not reuse this admin detail shape in customer routes." \
  -m "Tested: npm run test:shipping-flow; npm run test:top-up-flow; npm run typecheck" \
  -m "Not-tested: User 360 UI and detail API land in later tasks."
```

---

### Task 5: Add Admin User 360 Detail API Route

**Files:**
- Create: `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Create the detail API route**

Create `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts`:

```ts
import { getAdminUserDetail, normalizeAdminUser360Query } from "@/features/ynot/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/ynot/admin/users/[profileId]/detail">,
) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:user360:read",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const { profileId } = await ctx.params;
  if (!UUID_RE.test(profileId)) {
    return Response.json({ error: "Invalid profile id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const detailQuery = normalizeAdminUser360Query({
    section: url.searchParams.get("section") ?? "overview",
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "100",
  });
  const detail = await getAdminUserDetail(profileId, detailQuery);
  if (!detail) {
    return Response.json({ error: "User was not found." }, { status: 404 });
  }

  const response = Response.json({ result: detail });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
```

- [ ] **Step 2: Run route/type verification**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run typecheck
```

Expected: User 360 contract still FAILS on UI page assertions. Detail API assertions should pass. `typecheck` should PASS after Next route context types are generated by the existing toolchain.

- [ ] **Step 3: Commit the detail API**

Run:

```bash
git add 'Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts'
git commit -m "Expose admin-only User 360 detail API" \
  -m "Constraint: read API must be admin-gated, rate-limited, and no-store." \
  -m "Confidence: medium" \
  -m "Scope-risk: narrow" \
  -m "Directive: Return only normalized admin detail, never raw Supabase rows or raw errors." \
  -m "Tested: npm run typecheck; npm run test:admin-user360-flow partially passes through API assertions." \
  -m "Not-tested: browser interaction lands with the UI tasks."
```

---

### Task 6: Upgrade `/admin/users` Search, Filters, and Pagination

**Files:**
- Modify: `Website/src/app/admin/users/page.tsx`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Change imports and page signature**

In `Website/src/app/admin/users/page.tsx`, change the data import:

```ts
import {
  getAdminMergeRequests,
  getAdminUserDirectory,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
```

Change the page signature and data loading block:

```ts
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    role?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await (searchParams ?? Promise.resolve({}));
  const [data, directory, mergeRequests] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminUserDirectory(params),
    getAdminMergeRequests(),
  ]);
  const users = directory.users;
```

- [ ] **Step 2: Add filter URL helper**

Add this helper inside the component before `return`:

```ts
  function directoryHref(next: Partial<typeof directory.query>) {
    const merged = {
      ...directory.query,
      ...next,
    };
    const url = new URLSearchParams();
    if (merged.q) url.set("q", merged.q);
    if (merged.role !== "all") url.set("role", merged.role);
    if (merged.status !== "all") url.set("status", merged.status);
    if (merged.page > 1) url.set("page", String(merged.page));
    if (merged.pageSize !== 50) url.set("pageSize", String(merged.pageSize));
    const qs = url.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }
```

- [ ] **Step 3: Replace static tabs/actions with search controls**

Replace the current `actions` prop on the main `AdminCardHead` for the directory with:

```tsx
actions={
  <form action="/admin/users" className="tabs" style={{ gap: 8 }}>
    <input
      className="input"
      name="q"
      placeholder="Search email, LINE, phone, profile"
      defaultValue={directory.query.q}
      style={{ minWidth: 260 }}
    />
    <select className="input" name="role" defaultValue={directory.query.role}>
      <option value="all">All roles</option>
      <option value="customer">Customers</option>
      <option value="owner">Owner</option>
      <option value="admin">Admin</option>
      <option value="staff">Staff</option>
    </select>
    <select className="input" name="status" defaultValue={directory.query.status}>
      <option value="all">All status</option>
      <option value="active">Active</option>
      <option value="flagged">Flagged</option>
      <option value="suspended">Suspended</option>
      <option value="disabled">Disabled</option>
    </select>
    <button className="btn btn-primary" type="submit">
      <AdminIcon name="search" />
      Search
    </button>
  </form>
}
```

Change the title from:

```tsx
title={`All users · ${users.length}`}
```

to:

```tsx
title={`Users · ${directory.total}`}
```

- [ ] **Step 4: Add pagination below the table**

After the `</div>` that wraps the table, add:

```tsx
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className="muted">
              Page {directory.page} · showing {users.length} of {directory.total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                className={`btn ${directory.hasPreviousPage ? "btn-ghost" : "disabled"}`}
                href={directory.hasPreviousPage ? directoryHref({ page: directory.page - 1 }) : directoryHref({ page: 1 })}
                prefetch={false}
              >
                Previous page
              </Link>
              <Link
                className={`btn ${directory.hasNextPage ? "btn-ghost" : "disabled"}`}
                href={directory.hasNextPage ? directoryHref({ page: directory.page + 1 }) : directoryHref({ page: directory.page })}
                prefetch={false}
              >
                Next page
              </Link>
            </div>
          </div>
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run typecheck
```

Expected: User 360 contract still FAILS on detail UI strings until Task 7. Directory assertions should pass. `typecheck` should PASS.

- [ ] **Step 6: Commit directory UI**

Run:

```bash
git add Website/src/app/admin/users/page.tsx
git commit -m "Make admin user directory searchable" \
  -m "Constraint: launch support needs direct lookup by customer identity and public support references." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep search server-rendered and admin-gated." \
  -m "Tested: npm run typecheck; npm run test:admin-user360-flow partially passes through directory UI assertions." \
  -m "Not-tested: full detail UI lands in the next task."
```

---

### Task 7: Upgrade User 360 Detail UI and Deep Links

**Files:**
- Modify: `Website/src/app/admin/users/[profileId]/page.tsx`
- Modify: `Website/src/features/ynot/admin/AdminUser360.tsx`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Pass normalized detail query from the route**

Modify `Website/src/app/admin/users/[profileId]/page.tsx` imports:

```ts
import {
  getAdminUserDetail,
  getYnotDashboardSlice,
  normalizeAdminUser360Query,
} from "@/features/ynot/data";
```

Change the page signature and load:

```ts
export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams?: Promise<{ section?: string; page?: string; pageSize?: string }>;
}) {
  const { profileId } = await params;
  const detailQuery = normalizeAdminUser360Query(
    await (searchParams ?? Promise.resolve({})),
  );
  const [data, detail] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminUserDetail(profileId, detailQuery),
  ]);
```

- [ ] **Step 2: Add section helper functions in `AdminUser360.tsx`**

In `Website/src/features/ynot/admin/AdminUser360.tsx`, add these helpers after `formatDate`:

```tsx
function profileScopedHref(path: string, profileId: string) {
  return `${path}?profileId=${encodeURIComponent(profileId)}`;
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

function openRewardSummary(open: YnotGachaOpenHistory) {
  if (!open.rewards.length) return "No reward rows";
  return open.rewards
    .map((reward) => `${reward.resultPosition}. ${reward.cardName}`)
    .join(" | ");
}
```

Make sure the type import includes:

```ts
  type YnotGachaOpenHistory,
```

- [ ] **Step 3: Replace summary cards with launch-grade sections**

Inside `AdminUser360`, keep the KPI grid and profile card. Replace the old shipping, reward history, pack opens, wallet/top-up, and support timeline cards with these sections. The snippets below are complete JSX blocks that can be inserted after the profile card grid:

```tsx
          <AdminCard>
            <AdminCardHead
              label="Shipping and address"
              title={`Shipping requests - ${detail.shipping.length}`}
              actions={
                <Link
                  className="btn btn-ghost"
                  href={profileScopedHref("/admin/shipping", detail.profile.profileId)}
                  prefetch={false}
                >
                  <AdminIcon name="truck" />
                  Open shipping queue
                </Link>
              }
            />
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
                  {detail.shipping.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ padding: 24 }}>
                        No shipping requests yet.
                      </td>
                    </tr>
                  ) : (
                    detail.shipping.map((request) => (
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
                            <div className="row-sub" key={line}>{line}</div>
                          ))}
                        </td>
                        <td><AdminStatusPill status={request.status} /></td>
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
          </AdminCard>

          <AdminCard>
            <AdminCardHead
              label="Prize wins"
              title={`Collection - ${detail.collection.length}`}
              actions={<AdminPill kind="default">{detail.gachaOpens.length} pack opens</AdminPill>}
            />
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
                  {detail.collection.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ padding: 24 }}>
                        No collection rewards yet.
                      </td>
                    </tr>
                  ) : (
                    detail.collection.map((item) => (
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
                        <td><AdminStatusPill status={item.status} /></td>
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
          </AdminCard>
```

Add these cards in the lower grid:

```tsx
        <AdminCard>
          <AdminCardHead label="Pack open rewards" title={`Pack opens - ${detail.gachaOpens.length}`} />
          <div className="list">
            {detail.gachaOpens.length === 0 ? (
              <div className="list-row text-mute">No pack opens yet.</div>
            ) : (
              detail.gachaOpens.map((open) => (
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
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Wallet and top-ups"
            title="Ledger and top-up history"
            actions={
              <Link
                className="btn btn-ghost"
                href={profileScopedHref("/admin/top-ups", detail.profile.profileId)}
                prefetch={false}
              >
                <AdminIcon name="coin" />
                Open top-ups
              </Link>
            }
          />
          <div className="list">
            {detail.walletLedger.map((entry) => (
              <div className="list-row" key={entry.id}>
                <AdminIcon name="coin" />
                <div>
                  <strong>{entry.amountCoins > 0 ? "+" : ""}{fmtCoin(entry.amountCoins)}</strong>
                  <div className="row-sub mono">
                    {fmtCoin(entry.balanceBefore)} {" -> "} {fmtCoin(entry.balanceAfter)}
                  </div>
                  <div className="row-sub">
                    {entry.entryType}
                    {entry.referenceType ? ` | ${entry.referenceType}` : ""} | {formatDate(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {detail.topUps.map((topUp) => (
              <div className="list-row" key={topUp.id ?? topUp.publicCode}>
                <AdminIcon name="tag" />
                <div>
                  <strong>{topUp.publicCode} | {fmtTHB(topUp.amountThb)}</strong>
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
            ))}
            {detail.walletLedger.length === 0 && detail.topUps.length === 0 ? (
              <div className="list-row text-mute">No wallet or top-up activity.</div>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Exchange history" title={`Exchange orders - ${detail.exchanges.length}`} />
          <div className="list">
            {detail.exchanges.length === 0 ? (
              <div className="list-row text-mute">No exchange orders.</div>
            ) : (
              detail.exchanges.map((exchange) => (
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
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Support timeline" title={`Audit events - ${detail.auditTimeline.length}`} />
          <div className="list">
            {detail.auditTimeline.length === 0 ? (
              <div className="list-row text-mute">No support audit events.</div>
            ) : (
              detail.auditTimeline.map((event) => (
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
        </AdminCard>
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run test:shipping-flow
npm run test:top-up-flow
npm run test:pack-open-privacy
npm run typecheck
```

Expected: `test:admin-user360-flow` should now PASS except for shipping/top-up page filter assertions if Task 8 is not done yet. Existing shipping, top-up, privacy, and typecheck must PASS.

- [ ] **Step 5: Commit User 360 UI**

Run:

```bash
git add 'Website/src/app/admin/users/[profileId]/page.tsx' Website/src/features/ynot/admin/AdminUser360.tsx
git commit -m "Make admin User 360 launch-grade" \
  -m "Constraint: admins need operational detail while customers must keep public-safe DTOs." \
  -m "Rejected: one more high-level dashboard | per-user drilldown is the launch blocker." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep full prize/open/payment detail behind AdminGate and admin APIs only." \
  -m "Tested: npm run test:shipping-flow; npm run test:top-up-flow; npm run test:pack-open-privacy; npm run typecheck" \
  -m "Not-tested: filtered shipping/top-up queues land in the next task."
```

---

### Task 8: Wire Filtered Shipping and Top-Up Operations From User 360

**Files:**
- Modify: `Website/src/app/admin/shipping/page.tsx`
- Modify: `Website/src/app/admin/top-ups/page.tsx`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-admin-user360-flow.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Add profile filter to shipping page**

Replace the current `AdminShippingPage` signature and loading block in `Website/src/app/admin/shipping/page.tsx` with:

```tsx
export default async function AdminShippingPage({
  searchParams,
}: {
  searchParams?: Promise<{ profileId?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({}));
  const profileId =
    typeof params.profileId === "string" && params.profileId.trim()
      ? params.profileId.trim()
      : undefined;
  const [data, shipping] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getShipping(profileId, true),
  ]);
  const active = shipping.filter((request) => isActiveYnotShippingStatus(request.status)).length;
```

Change the page title to show filtered mode:

```tsx
title={profileId ? "Shipping fulfilment for user" : "Shipping fulfilment"}
```

- [ ] **Step 2: Add profile filter to top-ups page**

In `Website/src/app/admin/top-ups/page.tsx`, change the data import:

```ts
import { getTopUps, getYnotDashboardSlice } from "@/features/ynot/data";
```

Change the page signature type:

```ts
searchParams?: Promise<{ filter?: string; profileId?: string }>;
```

Replace data loading:

```ts
  const params = await (searchParams ?? Promise.resolve({} as { filter?: string; profileId?: string }));
  const activeFilter = normalizeTopUpFilter(params.filter);
  const profileId =
    typeof params.profileId === "string" && params.profileId.trim()
      ? params.profileId.trim()
      : undefined;
  const [data, adminTopUps] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    profileId
      ? getTopUps(profileId, true, { includeSensitiveSlipDetails: true, limit: 500 })
      : getTopUps(undefined, true, { includeSensitiveSlipDetails: true, limit: 500 }),
  ]);
```

Then replace every `data.adminTopUps` reference in this page with `adminTopUps`.

Change filter link href generation from:

```tsx
href={`/admin/top-ups?filter=${filter.key}`}
```

to:

```tsx
href={`/admin/top-ups?filter=${filter.key}${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ""}`}
```

Change the main title to:

```tsx
title={profileId ? "Manual payment confirmation for user" : "Manual payment confirmation"}
```

- [ ] **Step 3: Run all related API/RPC contract tests**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run test:shipping-flow
npm run test:top-up-flow
npm run test:pack-open-privacy
npm run typecheck
```

Expected: all commands PASS. This proves the new admin read/API flow is present and the existing related RPC routes still call the intended database functions.

- [ ] **Step 4: Commit filtered ops links**

Run:

```bash
git add Website/src/app/admin/shipping/page.tsx Website/src/app/admin/top-ups/page.tsx Website/src/features/ynot/data.ts
git commit -m "Link User 360 into filtered admin operations" \
  -m "Constraint: support staff must jump from a customer to that customer's shipping and payment records." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Do not weaken same-origin or RPC mutation guards while adding read filters." \
  -m "Tested: npm run test:admin-user360-flow; npm run test:shipping-flow; npm run test:top-up-flow; npm run test:pack-open-privacy; npm run typecheck" \
  -m "Not-tested: browser visual smoke happens in final verification."
```

---

### Task 9: Final Verification and Launch Readiness Notes

**Files:**
- Modify only if final verification reveals a small typo in files changed by Tasks 1-8.
- Test: all commands below.

- [ ] **Step 1: Run final static and type verification**

Run:

```bash
cd Website
npm run test:admin-user360-flow
npm run test:shipping-flow
npm run test:top-up-flow
npm run test:pack-open-privacy
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Run privacy and launch-safety guard**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:pack-opening-flow
```

Expected: all PASS. These guard that User 360 work did not disturb pack opening, reveal shape, or the launch-safe open path.

- [ ] **Step 3: Run lint**

Run:

```bash
cd Website
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Build if the branch is intended for deployment review**

Run:

```bash
cd Website
npm run build
```

Expected: PASS.

- [ ] **Step 5: Check for accidental public leaks**

Run:

```bash
cd Website
rg -n "logic_snapshot|unlockAtSoldPct|stockUnitId|stockSkuId|drawRoundPrizeUnitIds|identityMismatch|primaryReason|intendedStock" src/app/api/ynot src/features/ynot | sed -n '1,160p'
```

Expected: matches are limited to admin/server internals and existing privacy tests. If a match appears inside a customer response mapper or customer component, stop and remove that public field before completion.

- [ ] **Step 6: Commit final verification note if fixes were needed**

If Step 1-5 required a small fix, commit it:

```bash
git add Website
git commit -m "Verify admin User 360 launch readiness" \
  -m "Constraint: launch admin visibility must keep customer APIs public-safe." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Re-run admin-user360, shipping, top-up, and pack privacy tests before future User 360 edits." \
  -m "Tested: npm run test:admin-user360-flow; npm run test:shipping-flow; npm run test:top-up-flow; npm run test:pack-open-privacy; npm run typecheck; npm run lint; npm run build" \
  -m "Not-tested: live production admin smoke unless a deploy task explicitly follows."
```

If no fix was needed, do not create an empty commit.

---

## API/RPC Coverage Matrix

| Surface | File | Verification |
| --- | --- | --- |
| Admin user directory read API | `Website/src/app/api/ynot/admin/users/route.ts` | `npm run test:admin-user360-flow` checks `GET`, admin session, rate limit, and no-store. |
| Admin User 360 detail read API | `Website/src/app/api/ynot/admin/users/[profileId]/detail/route.ts` | `npm run test:admin-user360-flow` checks route context, admin gate, safe errors, and no-store. |
| Admin role mutation API | `Website/src/app/api/ynot/admin/users/route.ts` | Existing `PATCH` remains owner-only; `npm run typecheck` guards imports and handler shape. |
| Admin shipping mutation API/RPC | `Website/src/app/api/ynot/admin/shipping/route.ts` -> `update_shipping_request_status` | `npm run test:shipping-flow` and `npm run test:admin-user360-flow`. |
| Admin top-up mutation API/RPC | `Website/src/app/api/ynot/admin/top-ups/route.ts` -> `approve_top_up_request`, `reject_top_up_request` | `npm run test:top-up-flow` and `npm run test:admin-user360-flow`. |
| Customer top-up submit RPC | `Website/src/app/api/ynot/wallet/route.ts` -> `submit_top_up_request` | `npm run test:top-up-flow` and `npm run test:admin-user360-flow`. |
| Customer pack-open RPC | `Website/src/app/api/ynot/gacha/open/route.ts` -> `open_gacha_campaign` | `npm run test:pack-open-privacy`, `npm run test:gacha-open-launch-safety`, and `npm run test:admin-user360-flow`. |
| Public privacy boundary | public mappers in `Website/src/features/ynot/data.ts` and `Website/src/app/api/ynot/gacha/open/route.ts` | `npm run test:pack-open-privacy` and Task 9 leak scan. |

## Self-Review

1. Spec coverage: The plan covers admin user lookup, clickable User 360, prize win/open detail, shipping detail, wallet/top-up detail, exchange history, audit timeline, filtered admin operations, API handlers, and related RPC verification.
2. Placeholder scan: The plan uses concrete files, code snippets, commands, and expected outcomes. It does not rely on deferred wording.
3. Type consistency: The names used across tasks are consistent: `YnotAdminUserDirectoryQuery`, `YnotAdminUserDirectoryResult`, `YnotAdminUser360Query`, `normalizeAdminUserDirectoryQuery`, `normalizeAdminUser360Query`, `getAdminUserDirectory`, and `getAdminUserDetail(profileId, detailQuery)`.
