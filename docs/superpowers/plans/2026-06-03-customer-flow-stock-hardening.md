# Customer Flow Stock Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden customer shipping and admin stock-unit mutations so they match the safety level of pack opening, card conversion, and top-up without changing the user-visible product flow.

**Architecture:** Keep the pack-opening, conversion, top-up, and history flows unchanged. Add route-level validation and public response mapping to customer shipping, then move admin stock-unit edit/delete into transaction-safe Supabase RPCs so stock identity changes cannot succeed without ledger and audit evidence.

**Tech Stack:** Next.js 16 App Router in `Website/`, TypeScript API routes, Supabase Postgres migrations under `Database/supabase/migrations/`, generated Supabase types in `Website/src/lib/supabase/types.ts`, Node `--test` regression scripts, and browser visual verification on localhost.

---

## Product And UI Decisions

- Customer behavior must not change: users still select owned cards, request shipping, convert cards to coins, view history, open packs, and top up from the same screens.
- No new customer-facing or admin-facing button is required for this hardening. Reuse existing buttons and modals.
- If implementation accidentally adds a new `<button>`, `<Link className="btn">`, or `<Link className="cr-btn">`, completion is blocked until Task 5 proves the new control fits at desktop and mobile sizes with no overlay, clipping, or text outside the box.
- Do not refactor pack-opening probability logic, prize selection, wallet approval, or history readers in this plan.

---

## File Structure

Create:

```text
Website/scripts/test-shipping-flow.mjs
Database/supabase/migrations/20260603130000_card_stock_unit_edit_delete_rpc.sql
```

Modify:

```text
Website/package.json
Website/src/app/api/ynot/shipping/route.ts
Website/src/app/api/ynot/admin/card-stock/unit/route.ts
Website/src/lib/supabase/types.ts
Website/scripts/test-stock-subsku-sql.mjs
Website/tools/verification/verify-platform-foundation.mjs
```

Verification-only surfaces:

```text
Website/src/features/ynot/cr/HistoryExperience.tsx
Website/src/features/ynot/cr/WalletExperience.tsx
Website/src/features/ynot/client.tsx
Website/tools/fixtures/button-map.json
```

---

### Task 1: Lock The Customer Shipping Contract With Failing Tests

**Files:**
- Create: `Website/scripts/test-shipping-flow.mjs`
- Modify: `Website/package.json`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Create the shipping flow regression test**

Create `Website/scripts/test-shipping-flow.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shippingRoute = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
const platformVerifier = readFileSync(
  new URL("../tools/verification/verify-platform-foundation.mjs", import.meta.url),
  "utf8",
);

test("customer shipping route uses the same mutation guard as other customer flows", () => {
  assert.match(shippingRoute, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(shippingRoute, /const crossOrigin = enforceSameOriginMutation\(request\)/);
  assert.match(shippingRoute, /if \(crossOrigin\) return crossOrigin/);
});

test("customer shipping route validates ids, duplicate cards, count, and idempotency before RPC", () => {
  assert.match(shippingRoute, /const UUID_RE\s*=/);
  assert.match(shippingRoute, /const IDEMPOTENCY_KEY_RE\s*=/);
  assert.match(shippingRoute, /const MAX_SHIPPING_ITEMS\s*=/);
  assert.match(shippingRoute, /function normalizeUuid/);
  assert.match(shippingRoute, /function normalizeCollectionItemIds/);
  assert.match(shippingRoute, /function normalizeIdempotencyKey/);
  assert.match(shippingRoute, /Each card can only be selected once/);
  assert.match(shippingRoute, /Ship up to \$\{MAX_SHIPPING_ITEMS\} cards at a time/);
  assert.match(shippingRoute, /Invalid idempotency key/);
});

test("customer shipping route maps database errors to safe customer messages", () => {
  assert.match(shippingRoute, /function shippingErrorMessage/);
  assert.match(shippingRoute, /valid_shipping_address_required/);
  assert.match(shippingRoute, /collection_item_not_shippable/);
  assert.doesNotMatch(
    shippingRoute,
    /Response\.json\(\{\s*error:\s*error\.message/,
  );
});

test("customer shipping route returns an allowlisted public result", () => {
  assert.match(shippingRoute, /function publicShippingResult/);
  assert.match(shippingRoute, /status:/);
  assert.match(shippingRoute, /publicCode:/);
  assert.match(shippingRoute, /itemCount:/);
  assert.match(shippingRoute, /replayed:/);
  assert.doesNotMatch(shippingRoute, /shippingRequestId:\s*value\.shippingRequestId/);
});

test("platform verifier covers customer shipping hardening", () => {
  assert.match(platformVerifier, /shipping request rejects cross-origin cookie mutations/);
  assert.match(platformVerifier, /shipping request validates ids and idempotency keys/);
  assert.match(platformVerifier, /shipping request does not return raw RPC errors/);
  assert.match(platformVerifier, /shipping request returns allowlisted RPC result/);
});
```

- [ ] **Step 2: Add the test script**

Modify `Website/package.json` inside the existing `"scripts"` object:

```json
"test:shipping-flow": "node --test scripts/test-shipping-flow.mjs"
```

Place it near the other YNOTT flow tests:

```json
"test:top-up-flow": "node --test scripts/test-top-up-flow.mjs",
"test:shipping-flow": "node --test scripts/test-shipping-flow.mjs",
"test:rate-limits": "node --test scripts/test-rate-limit-config.mjs"
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: FAIL. The current route does not yet import `enforceSameOriginMutation`, does not define `UUID_RE`, and returns raw `error.message`.

- [ ] **Step 4: Commit the failing tests**

```bash
git add Website/package.json Website/scripts/test-shipping-flow.mjs
git commit -m "Lock customer shipping hardening contract

Constraint: Customer shipping mutates owned card state and must match pack open / conversion safety.
Confidence: medium
Scope-risk: narrow
Tested: npm run test:shipping-flow fails for the expected missing hardening
Not-tested: implementation pending"
```

---

### Task 2: Harden Customer Shipping API

**Files:**
- Modify: `Website/src/app/api/ynot/shipping/route.ts`
- Modify: `Website/tools/verification/verify-platform-foundation.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Replace the shipping route with the hardened implementation**

Replace `Website/src/app/api/ynot/shipping/route.ts` with:

```ts
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{1,120}$/;
const MAX_SHIPPING_ITEMS = 50;

type ShippingBody = {
  addressId?: unknown;
  collectionItemIds?: unknown;
  note?: unknown;
  idempotencyKey?: unknown;
};

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : "";
}

function normalizeCollectionItemIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ids: [] as string[],
      error: "Select at least one card.",
      status: 400,
    };
  }
  if (value.length > MAX_SHIPPING_ITEMS) {
    return {
      ids: [] as string[],
      error: `Ship up to ${MAX_SHIPPING_ITEMS} cards at a time.`,
      status: 400,
    };
  }
  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  if (ids.length !== value.length || ids.some((item) => !UUID_RE.test(item))) {
    return {
      ids: [] as string[],
      error: "Choose valid collection items to ship.",
      status: 400,
    };
  }
  if (new Set(ids).size !== ids.length) {
    return {
      ids: [] as string[],
      error: "Each card can only be selected once.",
      status: 400,
    };
  }
  return { ids, error: null, status: 200 };
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { key: crypto.randomUUID(), error: null };
  }
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_RE.test(value.trim())) {
    return { key: null, error: "Invalid idempotency key." };
  }
  return { key: value.trim(), error: null };
}

function shippingErrorMessage(message?: string) {
  if (!message) return "Could not request shipping. Please refresh and try again.";
  if (message.includes("profile_required")) return "Login is required.";
  if (message.includes("collection_items_required")) return "Select at least one card.";
  if (message.includes("valid_shipping_address_required")) {
    return "Choose a valid shipping address.";
  }
  if (message.includes("duplicate_collection_items")) {
    return "Each card can only be selected once.";
  }
  if (message.includes("collection_item_not_shippable")) {
    return "One or more cards are no longer available for shipping.";
  }
  return "Could not request shipping. Please refresh and try again.";
}

function publicShippingResult(raw: unknown) {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    status: typeof value.status === "string" ? value.status : "submitted",
    publicCode: typeof value.publicCode === "string" ? value.publicCode : "",
    itemCount: Number.isFinite(Number(value.itemCount))
      ? Math.max(0, Math.round(Number(value.itemCount)))
      : 0,
    replayed: value.replayed === true,
  };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;

  const limited = await enforceRateLimit(
    request,
    "ynot:shipping:request",
    { limit: 20, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as ShippingBody | null;
  const addressId = normalizeUuid(body?.addressId);
  const { ids: collectionItemIds, error: itemError, status } =
    normalizeCollectionItemIds(body?.collectionItemIds);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;
  const { key: idempotencyKey, error: keyError } = normalizeIdempotencyKey(
    body?.idempotencyKey,
  );

  if (!addressId) {
    return Response.json({ error: "Shipping address is required." }, { status: 400 });
  }
  if (itemError) return Response.json({ error: itemError }, { status });
  if (keyError || !idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("request_shipping_for_items", {
    p_profile_id: session.profileId,
    p_address_id: addressId,
    p_collection_item_ids: collectionItemIds,
    p_customer_note: note,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    return Response.json({ error: shippingErrorMessage(error.message) }, { status: 409 });
  }
  return Response.json({ result: publicShippingResult(data) });
}
```

- [ ] **Step 2: Add platform verifier checks**

In `Website/tools/verification/verify-platform-foundation.mjs`, add these checks near the existing collection/conversion checks:

```js
check("src/app/api/ynot/shipping/route.ts", "shipping request rejects cross-origin cookie mutations", /enforceSameOriginMutation\(request\)/);
check("src/app/api/ynot/shipping/route.ts", "shipping request validates ids and idempotency keys", /UUID_RE[\s\S]*IDEMPOTENCY_KEY_RE[\s\S]*normalizeCollectionItemIds[\s\S]*normalizeIdempotencyKey/);
notCheck("src/app/api/ynot/shipping/route.ts", "shipping request does not return raw RPC errors", /Response\.json\(\{\s*error:\s*error\.message/);
check("src/app/api/ynot/shipping/route.ts", "shipping request returns allowlisted RPC result", /function publicShippingResult[\s\S]*publicCode[\s\S]*itemCount[\s\S]*replayed/);
```

- [ ] **Step 3: Run targeted shipping tests**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: PASS. The test should report 5 passing checks.

- [ ] **Step 4: Run affected platform checks**

Run:

```bash
cd Website
npm run verify:platform
```

Expected: PASS, including the four new shipping hardening checks.

- [ ] **Step 5: Commit shipping hardening**

```bash
git add Website/src/app/api/ynot/shipping/route.ts Website/tools/verification/verify-platform-foundation.mjs
git commit -m "Harden customer shipping mutation boundary

Constraint: Shipping changes collection item state and must match adjacent customer mutation safeguards.
Rejected: Broad customer-flow refactor | Pack open, conversion, top-up, and history already have profile-scoped guards.
Confidence: high
Scope-risk: narrow
Tested: npm run test:shipping-flow; npm run verify:platform
Not-tested: Browser visual QA comes in a later task"
```

---

### Task 3: Add Transactional Stock Unit RPCs And Regression Tests

**Files:**
- Create: `Database/supabase/migrations/20260603130000_card_stock_unit_edit_delete_rpc.sql`
- Modify: `Website/scripts/test-stock-subsku-sql.mjs`
- Test: `Website/scripts/test-stock-subsku-sql.mjs`

- [ ] **Step 1: Add failing stock transaction tests**

Append these tests to `Website/scripts/test-stock-subsku-sql.mjs`:

```js
test("single stock-unit edit and delete use transaction-safe RPCs", () => {
  const sql = migrationSql();
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.edit_card_stock_unit/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.delete_card_stock_unit/i);
  assert.match(sql, /stock_unit_not_editable/);
  assert.match(sql, /card_stock_unit_edited/);
  assert.match(sql, /card_stock_unit_deleted/);
  assert.match(sql, /grant execute on function public\.edit_card_stock_unit/i);
  assert.match(sql, /grant execute on function public\.delete_card_stock_unit/i);
});

test("admin stock-unit route calls RPCs instead of split update plus ledger writes", () => {
  assert.match(cardStockUnitRouteSource, /enforceSameOriginMutation\(request\)/);
  assert.match(cardStockUnitRouteSource, /rpc\("edit_card_stock_unit"/);
  assert.match(cardStockUnitRouteSource, /rpc\("delete_card_stock_unit"/);
  assert.doesNotMatch(
    cardStockUnitRouteSource,
    /from\("card_stock_units"\)[\s\S]*\.update/,
  );
  assert.doesNotMatch(
    cardStockUnitRouteSource,
    /from\("card_stock_ledger"\)\.insert/,
  );
});
```

- [ ] **Step 2: Run the stock tests and verify they fail**

Run:

```bash
cd Website
npm run test:stock-readiness
```

Expected: FAIL. The new RPC migration does not exist yet and `card-stock/unit/route.ts` still writes `card_stock_units` and `card_stock_ledger` in separate calls.

- [ ] **Step 3: Create the stock-unit RPC migration**

Create `Database/supabase/migrations/20260603130000_card_stock_unit_edit_delete_rpc.sql`:

```sql
-- card_stock_unit_edit_delete_rpc
-- Keep stock identity edits, ledger rows, and audit events in one DB transaction.

create or replace function public.edit_card_stock_unit(
  p_unit_id uuid,
  p_admin_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_unit public.card_stock_units%rowtype;
  updated_unit public.card_stock_units%rowtype;
  v_condition text := nullif(lower(btrim(coalesce(p_condition, ''))), '');
  v_grade text := nullif(btrim(coalesce(p_grade, '')), '');
  v_grading_service text := nullif(lower(btrim(coalesce(p_grading_service, ''))), '');
  v_cert_number text := nullif(btrim(coalesce(p_cert_number, '')), '');
  v_gemrate_id text := nullif(btrim(coalesce(p_gemrate_id, '')), '');
  v_image_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_image_storage_path text := nullif(btrim(coalesce(p_image_storage_path, '')), '');
begin
  if p_unit_id is null then
    raise exception 'stock_unit_required';
  end if;
  if p_admin_id is null or not exists (
    select 1 from public.admin_users admin
    where admin.id = p_admin_id
      and admin.is_active
  ) then
    raise exception 'active_admin_required';
  end if;
  if v_condition not in ('sealed', 'raw', 'graded') then
    raise exception 'invalid_condition';
  end if;
  if v_condition = 'graded' then
    if v_grade is null or v_grading_service is null then
      raise exception 'graded_stock_identity_required';
    end if;
    if v_grading_service not in ('psa', 'bgs', 'cgc', 'other') then
      raise exception 'invalid_grading_service';
    end if;
  else
    v_grade := null;
    v_grading_service := null;
    v_cert_number := null;
    v_gemrate_id := null;
  end if;

  select *
  into locked_unit
  from public.card_stock_units
  where id = p_unit_id
    and status = 'available'
  for update;

  if not found then
    raise exception 'stock_unit_not_editable';
  end if;

  if v_cert_number is not null and exists (
    select 1
    from public.card_stock_units other_unit
    where other_unit.cert_number = v_cert_number
      and other_unit.id <> p_unit_id
      and other_unit.status <> 'deleted'
  ) then
    raise exception 'stock_cert_number_already_used';
  end if;

  update public.card_stock_units
  set
    condition = v_condition,
    grade = v_grade,
    grading_service = v_grading_service,
    cert_number = v_cert_number,
    gemrate_id = v_gemrate_id,
    image_url = v_image_url,
    image_storage_path = v_image_storage_path,
    metadata = metadata || jsonb_build_object('lastEditedByAdminId', p_admin_id),
    updated_at = now()
  where id = p_unit_id
  returning * into updated_unit;

  insert into public.card_stock_ledger(
    stock_unit_id,
    card_id,
    event_type,
    actor_admin_id,
    metadata
  ) values (
    updated_unit.id,
    updated_unit.card_id,
    'edited',
    p_admin_id,
    jsonb_build_object(
      'action', 'unit_edited',
      'previousCondition', locked_unit.condition,
      'condition', updated_unit.condition,
      'previousGrade', locked_unit.grade,
      'grade', updated_unit.grade,
      'previousGradingService', locked_unit.grading_service,
      'gradingService', updated_unit.grading_service,
      'previousCertNumber', locked_unit.cert_number,
      'certNumber', updated_unit.cert_number
    )
  );

  insert into public.audit_events(
    actor_admin_id,
    event_type,
    metadata
  ) values (
    p_admin_id,
    'card_stock_unit_edited',
    jsonb_build_object('unitId', updated_unit.id, 'cardId', updated_unit.card_id)
  );

  return jsonb_build_object(
    'status', 'edited',
    'unitId', updated_unit.id,
    'cardId', updated_unit.card_id
  );
end;
$$;

create or replace function public.delete_card_stock_unit(
  p_unit_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_unit public.card_stock_units%rowtype;
begin
  if p_unit_id is null then
    raise exception 'stock_unit_required';
  end if;
  if p_admin_id is null or not exists (
    select 1 from public.admin_users admin
    where admin.id = p_admin_id
      and admin.is_active
  ) then
    raise exception 'active_admin_required';
  end if;

  update public.card_stock_units
  set
    status = 'deleted',
    metadata = metadata || jsonb_build_object('deletedByAdminId', p_admin_id),
    updated_at = now()
  where id = p_unit_id
    and status = 'available'
  returning * into removed_unit;

  if not found then
    raise exception 'stock_unit_not_removable';
  end if;

  insert into public.card_stock_ledger(
    stock_unit_id,
    card_id,
    event_type,
    actor_admin_id,
    metadata
  ) values (
    removed_unit.id,
    removed_unit.card_id,
    'deleted',
    p_admin_id,
    jsonb_build_object('action', 'unit_deleted')
  );

  insert into public.audit_events(
    actor_admin_id,
    event_type,
    metadata
  ) values (
    p_admin_id,
    'card_stock_unit_deleted',
    jsonb_build_object('unitId', removed_unit.id, 'cardId', removed_unit.card_id)
  );

  return jsonb_build_object(
    'status', 'deleted',
    'unitId', removed_unit.id,
    'cardId', removed_unit.card_id
  );
end;
$$;

revoke all on function public.edit_card_stock_unit(
  uuid, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.delete_card_stock_unit(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function public.edit_card_stock_unit(
  uuid, uuid, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.delete_card_stock_unit(
  uuid, uuid
) to service_role;
```

- [ ] **Step 4: Run the stock tests and verify the migration half passes**

Run:

```bash
cd Website
npm run test:stock-readiness
```

Expected: still FAIL until Task 4 changes `card-stock/unit/route.ts` to call the new RPCs.

- [ ] **Step 5: Commit migration and tests**

```bash
git add Database/supabase/migrations/20260603130000_card_stock_unit_edit_delete_rpc.sql Website/scripts/test-stock-subsku-sql.mjs
git commit -m "Add transactional stock unit edit contract

Constraint: Stock identity edits require ledger and audit evidence in the same transaction.
Rejected: TypeScript rollback after partial failure | Separate Supabase calls cannot guarantee one transaction.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:stock-readiness fails until route is switched to RPC
Not-tested: route integration pending"
```

---

### Task 4: Route Admin Stock Unit Mutations Through RPCs

**Files:**
- Modify: `Website/src/app/api/ynot/admin/card-stock/unit/route.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-stock-subsku-sql.mjs`

- [ ] **Step 1: Add same-origin protection to the admin stock-unit guard**

In `Website/src/app/api/ynot/admin/card-stock/unit/route.ts`, add this import:

```ts
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
```

Then change the start of `guard(request: Request)` to:

```ts
async function guard(request: Request) {
  if (!isSupabaseConfigured()) {
    return {
      error: Response.json(
        { error: "Supabase is not configured." },
        { status: 503 },
      ),
    };
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return { error: crossOrigin };
  const admin = await resolveAdminSession();
```

- [ ] **Step 2: Add route-safe stock unit error mapping**

Add this function below `text()`:

```ts
function stockUnitErrorMessage(message?: string) {
  if (!message) return "Stock unit could not be updated.";
  if (message.includes("active_admin_required")) return "Admin access is required.";
  if (message.includes("stock_unit_required")) return "unitId is required.";
  if (message.includes("stock_unit_not_editable")) {
    return "Unit not found or not editable (must be available).";
  }
  if (message.includes("stock_unit_not_removable")) {
    return "Unit not found or not removable (must be available).";
  }
  if (message.includes("invalid_condition")) return "Choose a valid stock condition.";
  if (message.includes("graded_stock_identity_required")) {
    return "Choose a grade and grading service for graded stock.";
  }
  if (message.includes("invalid_grading_service")) {
    return "Choose a valid grading service.";
  }
  if (message.includes("stock_cert_number_already_used")) {
    return "That cert number is already used by another unit.";
  }
  return "Stock unit could not be updated.";
}
```

- [ ] **Step 3: Replace direct edit writes with `edit_card_stock_unit`**

In the `PATCH` handler, keep the body normalization and validation, then replace the direct `card_stock_units.update`, `card_stock_ledger.insert`, and `audit_events.insert` block with:

```ts
const supabase = createServiceSupabaseClient();
const { error } = await supabase.rpc("edit_card_stock_unit", {
  p_unit_id: unitId,
  p_admin_id: admin.adminId,
  p_condition: condition,
  p_grade: grade,
  p_grading_service: gradingService,
  p_cert_number: certNumber,
  p_gemrate_id: gemrateId,
  p_image_url: text(body?.imageUrl, 600) || null,
  p_image_storage_path: text(body?.imageStoragePath, 400) || null,
});

if (error) {
  return Response.json(
    { error: stockUnitErrorMessage(error.message), code: "UNIT_UPDATE_FAILED" },
    { status: 409 },
  );
}
revalidateTag("campaigns", "max");
return Response.json({ ok: true });
```

Delete the old cert-clash query from the route. The RPC now owns cert uniqueness inside the transaction.

- [ ] **Step 4: Replace direct delete writes with `delete_card_stock_unit`**

In the `DELETE` handler, replace the direct `card_stock_units.update`, `card_stock_ledger.insert`, and `audit_events.insert` block with:

```ts
const supabase = createServiceSupabaseClient();
const { error } = await supabase.rpc("delete_card_stock_unit", {
  p_unit_id: unitId,
  p_admin_id: admin.adminId,
});

if (error) {
  return Response.json(
    { error: stockUnitErrorMessage(error.message), code: "UNIT_DELETE_FAILED" },
    { status: 409 },
  );
}
revalidateTag("campaigns", "max");
return Response.json({ ok: true });
```

- [ ] **Step 5: Add Supabase RPC type entries**

In `Website/src/lib/supabase/types.ts`, add these RPC entries inside `Database["public"]["Functions"]`:

```ts
      edit_card_stock_unit: {
        Args: {
          p_unit_id: string;
          p_admin_id: string;
          p_condition: string;
          p_grade?: string | null;
          p_grading_service?: string | null;
          p_cert_number?: string | null;
          p_gemrate_id?: string | null;
          p_image_url?: string | null;
          p_image_storage_path?: string | null;
        };
        Returns: Json;
      };
      delete_card_stock_unit: {
        Args: {
          p_unit_id: string;
          p_admin_id: string;
        };
        Returns: Json;
      };
```

- [ ] **Step 6: Run stock tests**

Run:

```bash
cd Website
npm run test:stock-readiness
```

Expected: PASS, including the two new stock-unit RPC tests.

- [ ] **Step 7: Run TypeScript**

Run:

```bash
cd Website
npm run typecheck
```

Expected: PASS. If TypeScript rejects the manual RPC type shape, adjust only the new `Functions` entries so route calls remain typed.

- [ ] **Step 8: Commit stock route integration**

```bash
git add Website/src/app/api/ynot/admin/card-stock/unit/route.ts Website/src/lib/supabase/types.ts
git commit -m "Route stock unit edits through transactional RPCs

Constraint: Admin stock identity changes must not outlive their audit and ledger rows.
Rejected: Ignoring ledger insert failures | It hides exactly the audit evidence this flow needs.
Confidence: high
Scope-risk: moderate
Tested: npm run test:stock-readiness; npm run typecheck
Not-tested: Browser visual QA comes in the next task"
```

---

### Task 5: UI And Button Containment Verification

**Files:**
- Verification only: `Website/src/features/ynot/cr/HistoryExperience.tsx`
- Verification only: `Website/src/features/ynot/cr/WalletExperience.tsx`
- Verification only: `Website/src/features/ynot/client.tsx`
- Verification only: `Website/tools/fixtures/button-map.json`

- [ ] **Step 1: Confirm this implementation did not add buttons**

Run:

```bash
git diff --unified=0 -- \
  Website/src/features/ynot/cr/HistoryExperience.tsx \
  Website/src/features/ynot/cr/WalletExperience.tsx \
  Website/src/features/ynot/client.tsx \
  | rg '^\+.*(<button|className=.*\b(?:btn|cr-btn)\b)'
```

Expected: no output. If there is output, inspect each added control and continue through Steps 2-5 before completion.

- [ ] **Step 2: Keep any new button on existing button systems**

If Step 1 finds a new button, change it to one of these class patterns:

```tsx
<button type="button" className="cr-btn cr-btn-primary">
  Save
</button>
```

or:

```tsx
<button type="button" className="btn btn-sm">
  Save
</button>
```

Do not introduce one-off inline width, absolute positioning, negative margins, or z-index for a normal action button.

- [ ] **Step 3: Update the button map if a new button exists**

If Step 1 finds a new user-facing control, add an entry to `Website/tools/fixtures/button-map.json` with this exact shape:

```json
{
  "route": "/collection",
  "label": "Request shipping",
  "role": "customer",
  "expectedAction": "Submits selected owned cards to /api/ynot/shipping after address selection"
}
```

Use the real route, label, role, and expected action for the new button. Do not add placeholder expected actions such as `"todo"`, `"noop"`, or `"unsupported"`.

- [ ] **Step 4: Run browser visual checks**

Start or reuse localhost:

```bash
cd Website
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open these pages at desktop `1440x1000` and mobile `390x844`:

```text
http://127.0.0.1:3002/collection
http://127.0.0.1:3002/wallet
http://127.0.0.1:3002/admin/prizes
```

Pass criteria:

```text
- Buttons stay inside their parent cards, rows, modals, or toolbars.
- Button text does not overflow horizontally.
- Modal footer buttons do not overlap the modal border or each other.
- Shipping and convert to coin toasts display inside the viewport.
- Admin stock edit/remove controls remain clickable and do not sit on top of row text.
```

- [ ] **Step 5: Fix any visual overflow using existing layout primitives**

If visual QA fails, apply only these CSS-safe fixes in the owning component stylesheet or existing class block:

```css
min-width: 0;
max-width: 100%;
flex-wrap: wrap;
overflow-wrap: anywhere;
```

For button rows, prefer:

```css
display: flex;
flex-wrap: wrap;
gap: 8px;
align-items: center;
```

Do not use `position: absolute` to force-fit action buttons.

- [ ] **Step 6: Run platform verifier for button-map coverage**

Run:

```bash
cd Website
npm run verify:platform
```

Expected: PASS, including `button map covers first-release controls without unsupported/no-op actions`.

- [ ] **Step 7: Commit UI verification fixes if any were needed**

If no files changed in this task, do not commit. If UI fixes or button map changes were needed, run:

```bash
git add Website/src/features/ynot/cr/HistoryExperience.tsx Website/src/features/ynot/cr/WalletExperience.tsx Website/src/features/ynot/client.tsx Website/tools/fixtures/button-map.json
git commit -m "Keep hardening UI controls contained

Constraint: New action controls must not overlay, clip, or overflow at desktop or mobile widths.
Rejected: One-off absolute positioning | Existing button systems already handle normal actions.
Confidence: high
Scope-risk: narrow
Tested: Browser visual check at 1440x1000 and 390x844; npm run verify:platform
Not-tested: No production browser session in this task"
```

---

### Task 6: Full Verification, Review, And Handoff

**Files:**
- Verification only: all changed files

- [ ] **Step 1: Run targeted tests**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run test:stock-readiness
npm run test:pack-open-privacy
npm run test:personal-info
npm run test:auth-session-hardening
npm run test:rate-limits
```

Expected: all commands PASS.

- [ ] **Step 2: Run top-up HTTP smoke against active localhost**

If localhost `3002` is running, run:

```bash
cd Website
TOP_UP_BASE_URL=http://127.0.0.1:3002 npm run test:top-up-flow
```

Expected: PASS with all top-up tests passing. If no server is running, start `npm run dev -- --hostname 127.0.0.1 --port 3002` and rerun.

- [ ] **Step 3: Run broad verification**

Run:

```bash
cd Website
npm run verify:platform
npm run verify:hardening
npm run typecheck
npm run lint
```

Expected:

```text
verify:platform PASS
verify:hardening PASS
typecheck PASS
lint PASS with 0 errors; existing warnings are acceptable only if unchanged
```

- [ ] **Step 4: Check whitespace and migration visibility**

Run:

```bash
git diff --check
git status --short
```

Expected:

```text
git diff --check prints no output
git status --short shows only intended files
```

- [ ] **Step 5: Request code review**

Use `$superpower-requesting-code-review` with this scope:

```text
Review the customer shipping hardening, stock-unit edit/delete RPC migration, stock-unit admin route integration, and UI containment verification. Confirm pack opening, conversion, history, top-up, and selected shipping still route to the correct user/profile and do not expose internal IDs or raw database errors.
```

Expected: no Critical or Important issues. Fix any valid Critical or Important issue before merging.

- [ ] **Step 6: Final commit if the implementation used task commits in a worktree**

If execution produced multiple task commits and the branch is ready, keep the Lore commit messages already made. If execution used one working-tree batch instead, commit with:

```bash
git add Database/supabase/migrations/20260603130000_card_stock_unit_edit_delete_rpc.sql Website/package.json Website/scripts/test-shipping-flow.mjs Website/scripts/test-stock-subsku-sql.mjs Website/src/app/api/ynot/shipping/route.ts Website/src/app/api/ynot/admin/card-stock/unit/route.ts Website/src/lib/supabase/types.ts Website/tools/verification/verify-platform-foundation.mjs
git commit -m "Harden customer shipping and stock unit mutations

Constraint: Shipping and stock identity edits mutate user-owned or physical stock state and need the same guard/transaction standard as pack open and conversion.
Rejected: Broad prize catalog refactor | The review findings are narrower and do not require changing pack-opening behavior.
Confidence: high
Scope-risk: moderate
Directive: Keep future customer mutations on the same guard, validation, safe-error, and allowlisted-response pattern.
Tested: npm run test:shipping-flow; npm run test:stock-readiness; npm run test:pack-open-privacy; npm run test:personal-info; npm run test:auth-session-hardening; npm run test:rate-limits; TOP_UP_BASE_URL=http://127.0.0.1:3002 npm run test:top-up-flow; npm run verify:platform; npm run verify:hardening; npm run typecheck; npm run lint; git diff --check
Not-tested: Production Supabase migration apply"
```

---

## Self-Review

Spec coverage:

```text
Customer shipping hardening: Task 1 and Task 2.
Admin stock-unit same-origin guard: Task 3 and Task 4.
Stock edit/delete atomicity: Task 3 and Task 4.
Raw DB error removal: Task 1 and Task 2.
UI/button containment: Task 5.
All related user flows still verified: Task 6.
```

Placeholder scan:

```text
No task uses forbidden placeholder language from the planning-skill checklist.
Every code-changing task includes concrete code or exact snippets.
```

Type consistency:

```text
Shipping helper names match tests: normalizeUuid, normalizeCollectionItemIds, normalizeIdempotencyKey, shippingErrorMessage, publicShippingResult.
Stock RPC names match route and tests: edit_card_stock_unit, delete_card_stock_unit.
Supabase RPC argument names match SQL: p_unit_id, p_admin_id, p_condition, p_grade, p_grading_service, p_cert_number, p_gemrate_id, p_image_url, p_image_storage_path.
```
