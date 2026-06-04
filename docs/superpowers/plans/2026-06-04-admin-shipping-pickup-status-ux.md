# Admin Shipping Pickup Status UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pickup-specific shipping states and redesign the admin shipping request detail panel so admins see status/action first and expand long customer, address, reward, tracking, and timeline details only when needed.

**Architecture:** Keep the existing server-side shipping status RPC as the source of truth for transitions, then reflect the same transition model in TypeScript types, admin API validation, customer labels, and admin UI. Keep the admin page as a single client component for now, but split repeated status and display logic into a small shared shipping-status helper so status labels do not drift across admin shipping, User 360, customer shipping history, and Personal Info.

**Tech Stack:** Next.js App Router, React client components, TypeScript DTOs, Supabase/Postgres migrations and RPCs, existing Node `node:test` static verification, CSS in `Website/src/app/globals.css`.

---

## Scope Check

This plan covers one subsystem: shipping fulfilment status and admin shipping page usability.

Included:
- New statuses `ready_for_pickup` and `picked_up`.
- Server-side transition rules for shipping, pickup, delivered, cancelled, and tracking requirements.
- Admin API/type updates so the new statuses are valid everywhere they must be valid.
- Admin shipping console redesign: status-first action bar plus collapsible detail sections.
- Customer-facing labels for pickup statuses on `/shipping` and `/profile/personal-info`.
- User 360 shipping counts and status labels.
- Static tests, platform verifier updates, lint/typecheck/build verification.

Excluded:
- Carrier API integration.
- Printed labels.
- Customer self-confirm pickup.
- SMS/LINE notification automation.
- Changing collection item status enum beyond existing `shipping_requested` and `shipped`.

Decision: `ready_for_pickup` keeps collection items in `shipping_requested`; `picked_up`, `shipped`, and `delivered` mark collection items as `shipped`. This matches the current collection item enum and avoids a wider collection-state migration.

---

## File Structure

**Create**
- `Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql` - extends `shipping_requests.status` check and replaces `update_shipping_request_status` with pickup-aware transition rules.
- `Website/src/features/ynot/shipping-status.ts` - shared labels, final/active helpers, customer display helpers, and tracking display helper.

**Modify**
- `Website/scripts/test-shipping-flow.mjs` - add failing static tests for pickup statuses, transition rules, admin status-first collapsible UI, and customer labels.
- `Website/tools/verification/verify-platform-foundation.mjs` - add platform checks for pickup statuses and redesigned admin detail sections.
- `Website/src/lib/supabase/types.ts` - add `ready_for_pickup` and `picked_up` to `shipping_requests` row/insert/RPC status unions.
- `Website/src/features/ynot/types.ts` - add pickup statuses to `YnotShippingStatus`.
- `Website/src/app/api/ynot/admin/shipping/route.ts` - accept new statuses and keep tracking required only for shipped/delivered.
- `Website/src/features/ynot/admin/primitives.tsx` - add admin status pill labels for the new statuses.
- `Website/src/features/ynot/admin/AdminShippingConsole.tsx` - status-first action layout, compact queue, collapsible details.
- `Website/src/app/admin/shipping/page.tsx` - count `ready_for_pickup` as active and update page copy/action badge.
- `Website/src/features/ynot/admin/AdminUser360.tsx` - use shared helpers for active/final counts and labels.
- `Website/src/features/ynot/components.tsx` - use shared labels in customer order list.
- `Website/src/features/ynot/cr/PersonalInfoExperience.tsx` - use shared labels and filter `picked_up` with delivered/final shipments.
- `Website/src/app/globals.css` - add admin shipping-specific compact queue/detail/accordion styles.

**Do Not Modify**
- `Website/src/features/ynot/data.ts` - current loader already passes through `shipping_requests.status`, tracking, timeline, user, address, and reward source context.
- `Website/src/app/api/ynot/shipping/route.ts` - customer request creation still starts as `submitted`; pickup statuses are admin-only fulfilment states.
- `Line LIFF/` - no LIFF route behavior changes are needed.

---

### Task 1: Lock Pickup Statuses And Admin UX Contract With Failing Tests

**Files:**
- Modify: `Website/scripts/test-shipping-flow.mjs`
- Modify: `Website/tools/verification/verify-platform-foundation.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Add source reads for the new migration and shared helper**

In `Website/scripts/test-shipping-flow.mjs`, add this constant after the existing `shippingContextMigration` constant:

```js
const shippingPickupMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql", import.meta.url),
);
const shippingStatusSource = readOptionalUrl(
  new URL("../src/features/ynot/shipping-status.ts", import.meta.url),
);
```

- [ ] **Step 2: Add failing tests for pickup status types, RPC transitions, API validation, and labels**

Append these tests after the existing `"admin shipped transition requires tracking in route and database function"` test:

```js
test("shipping status model supports pickup fulfilment states", () => {
  const shippingStatusBlock = typeBlock("YnotShippingStatus");
  const requestTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "shipping_requests: {",
    "shipping_request_items:",
  );
  const rpcTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "update_shipping_request_status:",
    "request_shipping_for_items:",
  );

  assert.match(shippingStatusBlock, /ready_for_pickup/);
  assert.match(shippingStatusBlock, /picked_up/);
  assert.match(requestTypeBlock, /ready_for_pickup/);
  assert.match(requestTypeBlock, /picked_up/);
  assert.match(rpcTypeBlock, /ready_for_pickup/);
  assert.match(rpcTypeBlock, /picked_up/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
});

test("shipping pickup migration enforces pickup transitions without tracking", () => {
  assert.match(shippingPickupMigration, /drop constraint if exists shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /add constraint shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /ready_for_pickup/);
  assert.match(shippingPickupMigration, /picked_up/);
  assert.match(
    shippingPickupMigration,
    /v_previous_status = 'packing'[\s\S]*p_status not in \('packing', 'ready_for_pickup', 'shipped', 'cancelled'\)/,
  );
  assert.match(
    shippingPickupMigration,
    /v_previous_status = 'ready_for_pickup'[\s\S]*p_status not in \('ready_for_pickup', 'picked_up', 'cancelled'\)/,
  );
  assert.match(
    shippingPickupMigration,
    /v_previous_status in \('delivered', 'picked_up', 'cancelled'\)/,
  );
  assert.match(
    shippingPickupMigration,
    /if p_status in \('shipped', 'delivered'\)[\s\S]*shipping_tracking_required/,
  );
  assert.doesNotMatch(
    shippingPickupMigration,
    /if p_status in \('shipped', 'delivered', 'picked_up'\)[\s\S]*shipping_tracking_required/,
  );
  assert.match(
    shippingPickupMigration,
    /if p_status in \('shipped', 'delivered', 'picked_up'\)[\s\S]*status = 'shipped'/,
  );
});

test("admin shipping route accepts pickup statuses without tracking", () => {
  const trackingGuard = between(
    adminShippingRoute,
    "if (",
    "const adminNote",
  );

  assert.match(adminShippingRoute, /ready_for_pickup/);
  assert.match(adminShippingRoute, /picked_up/);
  assert.match(trackingGuard, /status === "shipped"/);
  assert.match(trackingGuard, /status === "delivered"/);
  assert.doesNotMatch(trackingGuard, /ready_for_pickup/);
  assert.doesNotMatch(trackingGuard, /picked_up/);
});
```

- [ ] **Step 3: Replace the current admin-console transition test with the pickup-aware version**

Replace the body of the existing `"admin shipping console only offers valid status transitions"` test with this code:

```js
test("admin shipping console only offers valid pickup-aware status transitions", () => {
  const nextStatusesBody = functionBody(
    adminShippingConsoleSource,
    "nextShippingStatuses",
  );

  assert.match(nextStatusesBody, /case "submitted":[\s\S]*\["submitted", "packing", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "packing":[\s\S]*\["packing", "ready_for_pickup", "shipped", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "ready_for_pickup":[\s\S]*\["ready_for_pickup", "picked_up", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "shipped":[\s\S]*\["shipped", "delivered"\]/);
  assert.match(nextStatusesBody, /case "delivered":[\s\S]*\["delivered"\]/);
  assert.match(nextStatusesBody, /case "picked_up":[\s\S]*\["picked_up"\]/);
  assert.match(nextStatusesBody, /case "cancelled":[\s\S]*\["cancelled"\]/);
  assert.match(adminShippingConsoleSource, /statusOptions\.map/);
});
```

- [ ] **Step 4: Add failing tests for the status-first collapsible admin UI**

Append this test after the pickup transition test:

```js
test("admin shipping console shows status action first and collapses long detail sections", () => {
  assert.match(adminShippingConsoleSource, /admin-shipping-action-bar/);
  assert.match(adminShippingConsoleSource, /admin-shipping-status-select/);
  assert.match(adminShippingConsoleSource, /ShippingDetailSection/);
  assert.match(adminShippingConsoleSource, /<details/);
  assert.match(adminShippingConsoleSource, /Customer/);
  assert.match(adminShippingConsoleSource, /Address/);
  assert.match(adminShippingConsoleSource, /Reward and pack source/);
  assert.match(adminShippingConsoleSource, /Tracking/);
  assert.match(adminShippingConsoleSource, /Timeline/);
  assert.match(adminShippingConsoleSource, /admin-shipping-queue-status-cell/);
  assert.match(adminShippingConsoleSource, /aria-label="Select shipping request/);
});
```

- [ ] **Step 5: Add failing tests for customer-friendly pickup labels**

Append this test after `"customer shipping history shows reward source pack and tracking details"`:

```js
test("customer shipping history uses friendly pickup labels instead of raw statuses", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");
  const personalInfoShippingBlock = between(
    personalInfoSource,
    "function ShippingHistorySection",
    undefined,
  );

  assert.match(shippingStatusSource, /ynotShippingStatusCustomerLabel/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
  assert.match(orderListBlock, /ynotShippingStatusCustomerLabel/);
  assert.match(personalInfoShippingBlock, /ynotShippingStatusCustomerLabel/);
  assert.doesNotMatch(personalInfoShippingBlock, /shp\.status\.replace\(/);
});
```

- [ ] **Step 6: Add platform verifier checks**

In `Website/tools/verification/verify-platform-foundation.mjs`, replace the existing admin transition check:

```js
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping console limits status actions to valid transitions", /function nextShippingStatuses[\s\S]*case "submitted":[\s\S]*\["submitted", "packing", "cancelled"\][\s\S]*case "packing":[\s\S]*\["packing", "shipped", "cancelled"\][\s\S]*case "shipped":[\s\S]*\["shipped", "delivered"\][\s\S]*statusOptions\.map/);
```

with:

```js
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping console limits status actions to valid pickup transitions", /function nextShippingStatuses[\s\S]*case "submitted":[\s\S]*\["submitted", "packing", "cancelled"\][\s\S]*case "packing":[\s\S]*\["packing", "ready_for_pickup", "shipped", "cancelled"\][\s\S]*case "ready_for_pickup":[\s\S]*\["ready_for_pickup", "picked_up", "cancelled"\][\s\S]*statusOptions\.map/);
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping selected request starts with status action bar", /admin-shipping-action-bar[\s\S]*admin-shipping-status-select[\s\S]*Update shipping/);
check("src/features/ynot/admin/AdminShippingConsole.tsx", "admin shipping detail sections are collapsible", /function ShippingDetailSection[\s\S]*<details[\s\S]*Reward and pack source[\s\S]*Timeline/);
check("src/features/ynot/shipping-status.ts", "shipping pickup statuses have friendly labels", /ready_for_pickup[\s\S]*Ready for pickup[\s\S]*picked_up[\s\S]*Picked up/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin pickup statuses do not require tracking", /ready_for_pickup[\s\S]*picked_up[\s\S]*status === "shipped"[\s\S]*status === "delivered"/);
```

- [ ] **Step 7: Run tests to verify they fail before implementation**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run verify:platform
```

Expected:

```text
FAIL shipping status model supports pickup fulfilment states
FAIL shipping pickup migration enforces pickup transitions without tracking
FAIL admin shipping route accepts pickup statuses without tracking
FAIL admin shipping console only offers valid pickup-aware status transitions
FAIL admin shipping console shows status action first and collapses long detail sections
FAIL customer shipping history uses friendly pickup labels instead of raw statuses
```

- [ ] **Step 8: Commit the failing contract tests**

```bash
git add Website/scripts/test-shipping-flow.mjs Website/tools/verification/verify-platform-foundation.mjs
git commit -m "Lock pickup shipping operations contract" \
  -m "Shipping fulfilment needs pickup states and a status-first admin detail surface, so the regression contract is written before changing the implementation." \
  -m "Constraint: Status transitions are enforced in both the API and the Supabase RPC." \
  -m "Rejected: UI-only pickup labels | they would let admins select states the database rejects." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test:shipping-flow fails on missing pickup/status-first contract; npm run verify:platform fails on missing pickup/status-first contract" \
  -m "Not-tested: implementation not written yet"
```

---

### Task 2: Add Pickup Statuses To Database, Types, API, And Shared Labels

**Files:**
- Create: `Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql`
- Create: `Website/src/features/ynot/shipping-status.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/app/api/ynot/admin/shipping/route.ts`
- Modify: `Website/src/features/ynot/admin/primitives.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Create the pickup status migration**

Create `Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql` with this full content:

```sql
-- Adds pickup-specific fulfilment states while keeping collection item state
-- inside the existing collection_items.status check constraint.

alter table public.shipping_requests
  drop constraint if exists shipping_requests_status_check;

alter table public.shipping_requests
  add constraint shipping_requests_status_check
  check (status in (
    'draft',
    'submitted',
    'packing',
    'ready_for_pickup',
    'picked_up',
    'shipped',
    'delivered',
    'cancelled'
  ));

create or replace function public.update_shipping_request_status(
  p_shipping_request_id uuid,
  p_admin_id uuid,
  p_status text,
  p_tracking_provider text default null,
  p_tracking_number text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.shipping_requests%rowtype;
  v_previous_status text;
  v_item_count integer := 0;
  v_tracking_provider text := nullif(left(btrim(coalesce(p_tracking_provider, '')), 120), '');
  v_tracking_number text := nullif(left(btrim(coalesce(p_tracking_number, '')), 120), '');
  v_admin_note text := nullif(left(btrim(coalesce(p_admin_note, '')), 500), '');
  v_next_tracking_provider text;
  v_next_tracking_number text;
begin
  if p_shipping_request_id is null then
    raise exception 'shipping_request_required' using errcode = '22023';
  end if;

  if p_admin_id is null then
    raise exception 'admin_required' using errcode = '22023';
  end if;

  if p_status not in (
    'submitted',
    'packing',
    'ready_for_pickup',
    'picked_up',
    'shipped',
    'delivered',
    'cancelled'
  ) then
    raise exception 'invalid_shipping_status' using errcode = '22023';
  end if;

  perform 1
  from public.admin_users admin
  where admin.id = p_admin_id
    and admin.is_active;

  if not found then
    raise exception 'active_admin_required' using errcode = '28000';
  end if;

  select *
  into v_request
  from public.shipping_requests
  where id = p_shipping_request_id
  for update;

  if not found then
    raise exception 'shipping_request_not_found' using errcode = 'P0002';
  end if;

  v_previous_status := v_request.status;

  if v_previous_status in ('delivered', 'picked_up', 'cancelled') and p_status <> v_previous_status then
    raise exception 'shipping_request_terminal' using errcode = '22023';
  end if;

  if v_previous_status = 'draft' and p_status not in ('submitted', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'submitted' and p_status not in ('submitted', 'packing', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'packing' and p_status not in ('packing', 'ready_for_pickup', 'shipped', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'ready_for_pickup' and p_status not in ('ready_for_pickup', 'picked_up', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'shipped' and p_status not in ('shipped', 'delivered') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  end if;

  v_next_tracking_provider := coalesce(v_tracking_provider, v_request.tracking_provider);
  v_next_tracking_number := coalesce(v_tracking_number, v_request.tracking_number);

  if p_status in ('shipped', 'delivered')
    and (v_next_tracking_provider is null or v_next_tracking_number is null)
  then
    raise exception 'shipping_tracking_required' using errcode = '22023';
  end if;

  select count(*)
  into v_item_count
  from public.shipping_request_items
  where shipping_request_id = p_shipping_request_id;

  update public.shipping_requests
  set
    status = p_status,
    tracking_provider = v_next_tracking_provider,
    tracking_number = v_next_tracking_number,
    admin_note = coalesce(v_admin_note, admin_note),
    updated_at = now()
  where id = p_shipping_request_id
  returning * into v_request;

  if p_status in ('shipped', 'delivered', 'picked_up') then
    update public.collection_items item
    set
      status = 'shipped',
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status in ('shipping_requested', 'shipped');
  elsif p_status = 'cancelled' then
    update public.collection_items item
    set
      status = 'owned',
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status = 'shipping_requested';
  end if;

  insert into public.audit_events (
    actor_admin_id,
    event_type,
    shipping_request_id,
    metadata
  ) values (
    p_admin_id,
    'shipping_status_updated',
    p_shipping_request_id,
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'status', v_request.status,
      'trackingProvider', v_next_tracking_provider,
      'trackingNumber', v_next_tracking_number,
      'adminNote', v_admin_note,
      'itemCount', v_item_count
    )
  );

  return jsonb_build_object(
    'shippingRequestId', v_request.id,
    'publicCode', v_request.public_code,
    'previousStatus', v_previous_status,
    'status', v_request.status,
    'itemCount', v_item_count
  );
end;
$$;

revoke all on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) to service_role;
```

- [ ] **Step 2: Create the shared shipping status helper**

Create `Website/src/features/ynot/shipping-status.ts` with this full content:

```ts
import type { YnotShippingRequest, YnotShippingStatus } from "./types";

export const ynotShippingStatusLabels: Record<YnotShippingStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  packing: "Packing",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ynotShippingStatusCustomerLabels: Record<YnotShippingStatus, string> = {
  draft: "Draft",
  submitted: "Request submitted",
  packing: "Packing your reward",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const activeShippingStatuses = new Set<YnotShippingStatus>([
  "submitted",
  "packing",
  "ready_for_pickup",
  "shipped",
]);

const finalShippingStatuses = new Set<YnotShippingStatus>([
  "delivered",
  "picked_up",
  "cancelled",
]);

export function ynotShippingStatusLabel(status: string) {
  return ynotShippingStatusLabels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function ynotShippingStatusCustomerLabel(status: string) {
  return ynotShippingStatusCustomerLabels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function isActiveYnotShippingStatus(status: YnotShippingStatus) {
  return activeShippingStatuses.has(status);
}

export function isFinalYnotShippingStatus(status: YnotShippingStatus) {
  return finalShippingStatuses.has(status);
}

export function ynotShippingTrackingLabel(
  request: Pick<YnotShippingRequest, "trackingProvider" | "trackingNumber" | "status">,
) {
  if (request.trackingProvider && request.trackingNumber) {
    return `${request.trackingProvider} | ${request.trackingNumber}`;
  }
  if (request.status === "ready_for_pickup") return "Pickup at shop";
  if (request.status === "picked_up") return "Picked up by user";
  return "Tracking not added yet";
}
```

- [ ] **Step 3: Update public shipping status type**

In `Website/src/features/ynot/types.ts`, replace the current `YnotShippingStatus` union with:

```ts
export type YnotShippingStatus =
  | "draft"
  | "submitted"
  | "packing"
  | "ready_for_pickup"
  | "picked_up"
  | "shipped"
  | "delivered"
  | "cancelled";
```

- [ ] **Step 4: Update Supabase generated-style status unions**

In `Website/src/lib/supabase/types.ts`, update the `shipping_requests` row and insert status unions to:

```ts
status: "draft" | "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled";
```

and:

```ts
status?: "draft" | "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled";
```

Then update the `update_shipping_request_status` RPC `p_status` union to:

```ts
p_status: "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled";
```

- [ ] **Step 5: Update admin shipping API validation**

In `Website/src/app/api/ynot/admin/shipping/route.ts`, replace the status set with:

```ts
const statuses = new Set<ShippingStatus>([
  "submitted",
  "packing",
  "ready_for_pickup",
  "picked_up",
  "shipped",
  "delivered",
  "cancelled",
]);
```

Keep the tracking guard exactly as:

```ts
if (
  (status === "shipped" || status === "delivered") &&
  (!trackingProvider || !trackingNumber)
) {
  return Response.json(
    {
      error:
        "Tracking provider and tracking number are required before marking a shipment shipped or delivered.",
    },
    { status: 400 },
  );
}
```

- [ ] **Step 6: Update admin status pill labels**

In `Website/src/features/ynot/admin/primitives.tsx`, add these entries to `STATUS_MAP` after `packing`:

```ts
  ready_for_pickup: ["warn", "Ready for pickup"],
  picked_up: ["live", "Picked up"],
```

- [ ] **Step 7: Run tests to verify Task 2 passes**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run verify:platform
npm run typecheck
```

Expected:

```text
test:shipping-flow passes the pickup status model, migration, API validation, and label tests
verify:platform passes the pickup status helper/API checks that do not depend on the redesigned admin UI yet
typecheck passes with no errors
```

- [ ] **Step 8: Commit Task 2**

```bash
git add Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql Website/src/features/ynot/shipping-status.ts Website/src/lib/supabase/types.ts Website/src/features/ynot/types.ts Website/src/app/api/ynot/admin/shipping/route.ts Website/src/features/ynot/admin/primitives.tsx
git commit -m "Add pickup states to shipping fulfilment" \
  -m "Admins need to distinguish carrier delivery from customer pickup, so pickup states are enforced in the RPC, accepted by the admin API, and exposed through shared status labels." \
  -m "Constraint: collection_items.status has no pickup-specific final state, so picked_up maps collection items to shipped." \
  -m "Rejected: adding collection item pickup statuses | it widens a separate enum and is unnecessary for fulfilment visibility." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test:shipping-flow; npm run verify:platform; npm run typecheck" \
  -m "Not-tested: linked Supabase migration apply"
```

---

### Task 3: Redesign Admin Shipping Console Around Status-First Actions And Collapsible Details

**Files:**
- Modify: `Website/src/features/ynot/admin/AdminShippingConsole.tsx`
- Modify: `Website/src/app/admin/shipping/page.tsx`
- Modify: `Website/src/app/globals.css`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Update imports and status labels in the admin console**

In `Website/src/features/ynot/admin/AdminShippingConsole.tsx`, replace:

```ts
import type { YnotShippingRequest } from "@/features/ynot/types";
```

with:

```ts
import type { ReactNode } from "react";
import type { YnotShippingRequest } from "@/features/ynot/types";
import {
  isActiveYnotShippingStatus,
  isFinalYnotShippingStatus,
  ynotShippingStatusLabel,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";
```

Then replace the current `shippingStatusLabels` object with:

```ts
const shippingStatusLabels: Record<AdminShippingActionStatus, string> = {
  submitted: "Submitted",
  packing: "Packing",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
```

- [ ] **Step 2: Update admin console transition choices**

Replace `nextShippingStatuses` with:

```ts
function nextShippingStatuses(
  status: YnotShippingRequest["status"],
): AdminShippingActionStatus[] {
  switch (status) {
    case "draft":
      return ["submitted", "cancelled"];
    case "submitted":
      return ["submitted", "packing", "cancelled"];
    case "packing":
      return ["packing", "ready_for_pickup", "shipped", "cancelled"];
    case "ready_for_pickup":
      return ["ready_for_pickup", "picked_up", "cancelled"];
    case "shipped":
      return ["shipped", "delivered"];
    case "delivered":
      return ["delivered"];
    case "picked_up":
      return ["picked_up"];
    case "cancelled":
      return ["cancelled"];
  }
}
```

- [ ] **Step 3: Add display helpers and collapsible detail component**

Add these helpers after `primaryItemLabel`:

```tsx
function secondaryItemLabel(request: YnotShippingRequest) {
  const item = request.items?.[0];
  if (!item) return "Reward details pending";
  const pack = item.sourceCampaignTitle ?? "Pack source pending";
  return `${pack}${item.sourceOpenCode ? ` | Open ${item.sourceOpenCode}` : ""}`;
}

function isTrackingRequiredForStatus(status: AdminShippingActionStatus) {
  return status === "shipped" || status === "delivered";
}

function ShippingDetailSection({
  title,
  summary,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary: ReactNode;
  icon: Parameters<typeof AdminIcon>[0]["name"];
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="admin-shipping-detail-section" open={defaultOpen}>
      <summary>
        <span className="admin-shipping-detail-summary-icon">
          <AdminIcon name={icon} size={14} />
        </span>
        <span>
          <strong>{title}</strong>
          <em>{summary}</em>
        </span>
      </summary>
      <div className="admin-shipping-detail-body">{children}</div>
    </details>
  );
}
```

- [ ] **Step 4: Update status counts**

Replace `statusCounts` with:

```ts
function statusCounts(requests: YnotShippingRequest[]) {
  return {
    submitted: requests.filter((request) => request.status === "submitted")
      .length,
    packing: requests.filter((request) => request.status === "packing").length,
    readyForPickup: requests.filter(
      (request) => request.status === "ready_for_pickup",
    ).length,
    shipped: requests.filter((request) => request.status === "shipped").length,
    final: requests.filter((request) => isFinalYnotShippingStatus(request.status))
      .length,
    active: requests.filter((request) => isActiveYnotShippingStatus(request.status))
      .length,
  };
}
```

- [ ] **Step 5: Replace the KPI grid with pickup-aware counts**

In the component return, replace the existing four `.kpi` cards with:

```tsx
<div className="kpi-grid admin-shipping-kpi-grid">
  <div className="kpi">
    <div className="label">Submitted</div>
    <div className="value">{counts.submitted}</div>
  </div>
  <div className="kpi">
    <div className="label">Packing</div>
    <div className="value">{counts.packing}</div>
  </div>
  <div className="kpi">
    <div className="label">Ready pickup</div>
    <div className="value">{counts.readyForPickup}</div>
  </div>
  <div className="kpi">
    <div className="label">Shipped</div>
    <div className="value">{counts.shipped}</div>
  </div>
  <div className="kpi">
    <div className="label">Final</div>
    <div className="value">{counts.final}</div>
  </div>
</div>
```

- [ ] **Step 6: Replace the queue table header**

Replace the queue table `<thead>` with:

```tsx
<thead>
  <tr>
    <th>Status</th>
    <th>Order</th>
    <th>User</th>
    <th>Reward</th>
    <th>Pack</th>
    <th>Tracking</th>
    <th>Created</th>
  </tr>
</thead>
```

- [ ] **Step 7: Replace each queue row with compact status-first cells**

Replace the `requests.map` row body with:

```tsx
requests.map((request) => {
  const selectedRow = request.id === selected?.id;
  return (
    <tr
      key={request.id}
      className={selectedRow ? "admin-shipping-row selected" : "admin-shipping-row"}
      onClick={() => selectRequest(request)}
      style={{ cursor: "pointer" }}
      aria-label={`Select shipping request ${request.publicCode}`}
    >
      <td className="admin-shipping-queue-status-cell">
        <AdminStatusPill status={request.status} />
      </td>
      <td className="mono" style={{ fontWeight: 700 }}>
        {request.publicCode}
      </td>
      <td>
        <div className="row-title">
          {request.customer?.displayName ?? "Unknown user"}
        </div>
        <div className="row-sub" style={{ fontSize: 11 }}>
          {request.customer?.phone ?? request.customer?.email ?? "-"}
        </div>
      </td>
      <td>{primaryItemLabel(request)}</td>
      <td>{secondaryItemLabel(request)}</td>
      <td className="mono" style={{ fontSize: 11 }}>
        {ynotShippingTrackingLabel(request)}
      </td>
      <td className="mono muted" style={{ fontSize: 11 }}>
        {formatDate(request.createdAt)}
      </td>
    </tr>
  );
})
```

- [ ] **Step 8: Replace the selected request panel with status-first action and collapsible sections**

Replace the selected request `<div className="grid gap-4">` inside the `<aside className="card">` with:

```tsx
<div className="admin-shipping-selected-stack">
  <div className="admin-shipping-action-bar">
    <div>
      <p className="section-label">Selected request</p>
      <h3>{selected.publicCode}</h3>
      <div className="admin-shipping-action-meta">
        <AdminStatusPill status={selected.status} />
        <span>{primaryItemLabel(selected)}</span>
      </div>
    </div>
    <div className="admin-shipping-action-controls">
      <label className="admin-shipping-status-select">
        <span>Next status</span>
        <select
          className="select"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as AdminShippingActionStatus)
          }
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {shippingStatusLabels[option]}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-primary"
        type="button"
        disabled={isPending}
        onClick={submit}
      >
        <AdminIcon name="check" />
        Update shipping
      </button>
    </div>
  </div>

  {isTrackingRequiredForStatus(status) ? (
    <div className="admin-shipping-inline-note">
      Tracking provider and tracking number are required for shipped or delivered.
    </div>
  ) : null}
  {message ? <p className="text-mute">{message}</p> : null}

  <ShippingDetailSection
    title="Reward and pack source"
    summary={primaryItemLabel(selected)}
    icon="gift"
    defaultOpen
  >
    <div className="grid gap-2">
      {(selected.items ?? []).map((item, index) => (
        <div className="list-row" key={`${item.cardName}-${index}`}>
          <AdminIcon name="gift" />
          <div>
            <strong>{item.cardName}</strong>
            <div className="row-sub">
              {item.cardCode ?? "No code"} |{" "}
              {item.sourceCampaignTitle ?? "No pack"}
            </div>
            <div className="row-sub">
              {item.sourceOpenCode
                ? `Open ${item.sourceOpenCode}`
                : "No open code"}
              {item.sourceOpenPosition
                ? ` | Position ${item.sourceOpenPosition}`
                : ""}
              {item.sourcePrizeTierLabel
                ? ` | ${item.sourcePrizeTierLabel}`
                : ""}
            </div>
            <div className="row-sub">
              Status: {item.status ?? "unknown"}
              {item.serialNo ? ` | Serial ${item.serialNo}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  </ShippingDetailSection>

  <ShippingDetailSection
    title="Customer"
    summary={selected.customer?.displayName ?? "Unknown user"}
    icon="users"
  >
    <div className="list-row">
      <AdminIcon name="users" />
      <div>
        <strong>{selected.customer?.displayName ?? "Unknown user"}</strong>
        <div className="row-sub">{selected.customer?.email ?? "-"}</div>
        <div className="row-sub">Phone: {selected.customer?.phone ?? "-"}</div>
        <div className="row-sub">
          LINE:{" "}
          {selected.customer?.lineDisplayName ??
            selected.customer?.lineUserId ??
            "not linked"}
        </div>
        <div className="row-sub mono">
          Profile: {selected.customer?.profileId ?? "-"}
        </div>
        {selected.customer?.profileId ? (
          <Link href={`/admin/users/${selected.customer.profileId}`}>
            Open User 360
          </Link>
        ) : null}
      </div>
    </div>
  </ShippingDetailSection>

  <ShippingDetailSection
    title="Address"
    summary={selected.addressSnapshot?.recipientName ?? "No address snapshot"}
    icon="truck"
  >
    <div className="list-row">
      <AdminIcon name="truck" />
      <div>
        <strong>Address snapshot</strong>
        <div className="row-sub">{formatAddress(selected)}</div>
      </div>
    </div>
  </ShippingDetailSection>

  <ShippingDetailSection
    title="Tracking"
    summary={ynotShippingTrackingLabel(selected)}
    icon="truck"
  >
    <div className="grid gap-2">
      <div className="field">
        <label>Tracking provider</label>
        <input
          className="input"
          value={trackingProvider}
          onChange={(event) => setTrackingProvider(event.target.value)}
          placeholder={status === "ready_for_pickup" ? "Pickup at shop" : ""}
        />
      </div>
      <div className="field">
        <label>Tracking number</label>
        <input
          className="input"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Admin note</label>
        <input
          className="input"
          placeholder={selected.adminNote ?? "Add fulfilment note"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {selected.customerNote ? (
        <div className="text-mute" style={{ fontSize: 12 }}>
          Customer note: {selected.customerNote}
        </div>
      ) : null}
      {selected.adminNote ? (
        <div className="text-mute" style={{ fontSize: 12 }}>
          Current admin note: {selected.adminNote}
        </div>
      ) : null}
    </div>
  </ShippingDetailSection>

  <ShippingDetailSection
    title="Timeline"
    summary={`${selected.timeline?.length ?? 0} audit events`}
    icon="clock"
  >
    <div className="grid gap-2">
      {(selected.timeline ?? []).length === 0 ? (
        <AdminPill kind="default">No audit events</AdminPill>
      ) : (
        selected.timeline?.map((event) => (
          <div className="list-row" key={event.id}>
            <AdminIcon name="clock" />
            <div>
              <strong>{event.label}</strong>
              <div className="row-sub">{formatDate(event.createdAt)}</div>
              {event.trackingNumber ? (
                <div className="row-sub mono">
                  {event.trackingProvider} | {event.trackingNumber}
                </div>
              ) : null}
              {event.note ? (
                <div className="row-sub">{event.note}</div>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  </ShippingDetailSection>
</div>
```

- [ ] **Step 9: Update admin shipping page active count**

In `Website/src/app/admin/shipping/page.tsx`, add this import:

```ts
import { isActiveYnotShippingStatus } from "@/features/ynot/shipping-status";
```

Then replace the current active count:

```ts
const active = shipping.filter(
  (request) => request.status === "submitted" || request.status === "packing",
).length;
```

with:

```ts
const active = shipping.filter((request) =>
  isActiveYnotShippingStatus(request.status),
).length;
```

Replace the `desc` prop with:

```tsx
desc="Review shipment status first, then expand customer, address, reward, tracking, and timeline details only when needed."
```

- [ ] **Step 10: Add admin shipping CSS**

Append this CSS near the other admin-specific blocks in `Website/src/app/globals.css`:

```css
/* Admin shipping fulfilment: status-first queue and collapsible request detail */
html[data-ynot-theme] .admin-frame .admin-shipping-kpi-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

html[data-ynot-theme] .admin-frame .admin-shipping-row.selected {
  background: rgba(241, 215, 124, 0.08);
}

html[data-ynot-theme] .admin-frame .admin-shipping-queue-status-cell {
  min-width: 132px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-selected-stack {
  display: grid;
  gap: 12px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-action-bar {
  align-items: start;
  background: rgba(241, 215, 124, 0.08);
  border: 1px solid rgba(241, 215, 124, 0.22);
  border-radius: 12px;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
  padding: 14px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-action-meta,
html[data-ynot-theme] .admin-frame .admin-shipping-action-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-action-meta span:last-child {
  color: var(--a-muted, #9b9daf);
  font-size: 0.78rem;
  font-weight: 750;
  text-wrap: pretty;
}

html[data-ynot-theme] .admin-frame .admin-shipping-status-select {
  display: grid;
  gap: 5px;
  min-width: min(100%, 210px);
}

html[data-ynot-theme] .admin-frame .admin-shipping-status-select span {
  color: var(--a-muted, #9b9daf);
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

html[data-ynot-theme] .admin-frame .admin-shipping-inline-note {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--a-muted, #9b9daf);
  font-size: 0.78rem;
  padding: 10px 12px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section {
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 10px;
  list-style: none;
  min-height: 44px;
  padding: 10px 14px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary::-webkit-details-marker {
  display: none;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary::before {
  color: var(--a-gold, #f1d77c);
  content: "▸";
  flex: 0 0 auto;
  font-size: 0.78rem;
  transition: transform 0.15s ease;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section[open] summary::before {
  transform: rotate(90deg);
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-summary-icon {
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  color: var(--a-gold, #f1d77c);
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary span:last-child {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary strong {
  color: var(--a-fg, #f4efe1);
  font-size: 0.8rem;
  font-weight: 900;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-section summary em {
  color: var(--a-muted, #9b9daf);
  font-size: 0.73rem;
  font-style: normal;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  text-wrap: pretty;
  white-space: nowrap;
}

html[data-ynot-theme] .admin-frame .admin-shipping-detail-body {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: grid;
  gap: 10px;
  padding: 12px;
}

@media (min-width: 1100px) {
  html[data-ynot-theme] .admin-frame .admin-shipping-action-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

@media (max-width: 900px) {
  html[data-ynot-theme] .admin-frame .admin-shipping-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  html[data-ynot-theme] .admin-frame .admin-shipping-action-controls {
    align-items: stretch;
    flex-direction: column;
  }

  html[data-ynot-theme] .admin-frame .admin-shipping-action-controls .btn,
  html[data-ynot-theme] .admin-frame .admin-shipping-status-select {
    width: 100%;
  }
}
```

- [ ] **Step 11: Run tests to verify Task 3 passes**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run verify:platform
npm run lint -- src/features/ynot/admin/AdminShippingConsole.tsx src/app/admin/shipping/page.tsx
npm run typecheck
```

Expected:

```text
test:shipping-flow passes all 20 shipping tests
verify:platform passes admin shipping status/action/detail checks
targeted lint exits 0 with no new errors
typecheck exits 0
```

- [ ] **Step 12: Commit Task 3**

```bash
git add Website/src/features/ynot/admin/AdminShippingConsole.tsx Website/src/app/admin/shipping/page.tsx Website/src/app/globals.css
git commit -m "Make admin shipping status first" \
  -m "Admins need to scan status and next action before reading long fulfilment context, so selected-request details are collapsed behind focused sections." \
  -m "Constraint: Keep the existing admin frame and table primitives to avoid a broad admin redesign." \
  -m "Rejected: full modal replacement | the side panel already works and only needs hierarchy and disclosure." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test:shipping-flow; npm run verify:platform; targeted admin shipping lint; npm run typecheck" \
  -m "Not-tested: browser visual smoke"
```

---

### Task 4: Update Customer History And User 360 To Use Friendly Pickup Statuses

**Files:**
- Modify: `Website/src/features/ynot/components.tsx`
- Modify: `Website/src/features/ynot/cr/PersonalInfoExperience.tsx`
- Modify: `Website/src/features/ynot/admin/AdminUser360.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Update customer order list imports**

In `Website/src/features/ynot/components.tsx`, add this import after the existing local imports:

```ts
import {
  ynotShippingStatusCustomerLabel,
  ynotShippingTrackingLabel,
} from "./shipping-status";
```

- [ ] **Step 2: Update `OrderList` tracking and status label**

In `OrderList.shippingDetails`, replace `trackingLabel` with:

```ts
const trackingLabel = ynotShippingTrackingLabel(order);
```

Then replace:

```tsx
<StatusBadge status={order.status} />
```

with:

```tsx
<StatusBadge status={ynotShippingStatusCustomerLabel(order.status)} />
```

- [ ] **Step 3: Update Personal Info shipping history imports**

In `Website/src/features/ynot/cr/PersonalInfoExperience.tsx`, add this import:

```ts
import {
  isFinalYnotShippingStatus,
  ynotShippingStatusCustomerLabel,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";
```

- [ ] **Step 4: Update Personal Info final filter and labels**

Replace:

```ts
if (filter === "delivered") return shp.status === "delivered";
return shp.status !== "delivered" && shp.status !== "cancelled";
```

with:

```ts
if (filter === "delivered") return isFinalYnotShippingStatus(shp.status);
return !isFinalYnotShippingStatus(shp.status);
```

Replace:

```tsx
{shp.trackingProvider && shp.trackingNumber
  ? `${shp.trackingProvider} · ${shp.trackingNumber}`
  : "Pending pickup"}
```

with:

```tsx
{ynotShippingTrackingLabel(shp)}
```

Replace:

```tsx
{shp.status.replace(/_/g, " ")}
```

with:

```tsx
{ynotShippingStatusCustomerLabel(shp.status)}
```

- [ ] **Step 5: Update User 360 imports**

In `Website/src/features/ynot/admin/AdminUser360.tsx`, add this import:

```ts
import {
  isActiveYnotShippingStatus,
  isFinalYnotShippingStatus,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";
```

- [ ] **Step 6: Update User 360 counts and tracking label**

Replace:

```ts
function trackingLabel(request: YnotShippingRequest) {
  if (!request.trackingProvider || !request.trackingNumber) return "No tracking yet";
  return `${request.trackingProvider} | ${request.trackingNumber}`;
}
```

with:

```ts
function trackingLabel(request: YnotShippingRequest) {
  return ynotShippingTrackingLabel(request);
}
```

Replace:

```ts
const activeShipments = detail.shipping.filter(
  (request) => request.status === "submitted" || request.status === "packing",
).length;
const shipped = detail.shipping.filter(
  (request) => request.status === "shipped" || request.status === "delivered",
).length;
```

with:

```ts
const activeShipments = detail.shipping.filter((request) =>
  isActiveYnotShippingStatus(request.status),
).length;
const shipped = detail.shipping.filter((request) =>
  isFinalYnotShippingStatus(request.status),
).length;
```

- [ ] **Step 7: Run tests to verify Task 4 passes**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run test:personal-info
npm run verify:platform
npm run lint -- src/features/ynot/components.tsx src/features/ynot/cr/PersonalInfoExperience.tsx src/features/ynot/admin/AdminUser360.tsx
npm run typecheck
```

Expected:

```text
test:shipping-flow passes customer-friendly pickup label checks
test:personal-info passes existing address/shipping history checks
verify:platform passes pickup labels and shipping checks
targeted lint exits 0 with no new errors
typecheck exits 0
```

- [ ] **Step 8: Commit Task 4**

```bash
git add Website/src/features/ynot/components.tsx Website/src/features/ynot/cr/PersonalInfoExperience.tsx Website/src/features/ynot/admin/AdminUser360.tsx
git commit -m "Show pickup shipping labels across history" \
  -m "Customers and support admins need pickup states to read as fulfilment language instead of raw database status strings." \
  -m "Constraint: Customer history and User 360 both render shipping rows from the same DTO shape." \
  -m "Rejected: duplicating pickup labels per component | shared labels prevent future drift." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test:shipping-flow; npm run test:personal-info; npm run verify:platform; targeted lint; npm run typecheck" \
  -m "Not-tested: browser visual smoke"
```

---

### Task 5: Full Verification And Browser Smoke

**Files:**
- Verify: `Website/src/features/ynot/admin/AdminShippingConsole.tsx`
- Verify: `Website/src/app/admin/shipping/page.tsx`
- Verify: `Website/src/app/(store)/shipping/page.tsx`
- Verify: `Website/src/app/(store)/profile/personal-info/page.tsx`

- [ ] **Step 1: Run the focused verification suite**

Run:

```bash
cd Website
npm run test:shipping-flow
npm run test:personal-info
npm run test:uploads
npm run test:rate-limits
npm run verify:platform
SUPABASE_AUTH_PASSWORD_MIN_VERIFIED=8 npm run verify:hardening
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected:

```text
All commands exit 0.
Known lint warnings that already exist on origin/main are acceptable only if they remain warnings and no new errors appear.
Next.js build may print the existing middleware-to-proxy deprecation warning; the build must still exit 0.
```

- [ ] **Step 2: Start local dev server for visual smoke**

Run:

```bash
cd Website
YNOT_ENABLE_DEV_AUTH=true npm run dev -- --port 3000
```

Expected:

```text
Local server starts on http://localhost:3000
```

- [ ] **Step 3: Browser-smoke admin shipping page**

Open:

```text
http://localhost:3000/admin/shipping
```

Verify:
- Status cards include Submitted, Packing, Ready pickup, Shipped, Final.
- Queue row shows status before long user/reward details.
- Selected request panel starts with order code, current status, next status dropdown, and Update shipping button.
- Reward and pack source section is open.
- Customer, Address, Tracking, and Timeline sections are collapsed by default.
- Expanding each section shows the expected detail without text overlapping.
- The status select includes `Ready for pickup` when current status is `Packing`.
- The status select includes `Picked up` when current status is `Ready for pickup`.
- Tracking note appears only for `Shipped` or `Delivered`.

- [ ] **Step 4: Browser-smoke customer shipping history**

Open:

```text
http://localhost:3000/shipping
http://localhost:3000/profile/personal-info
```

Verify:
- Customer status labels show `Ready for pickup` and `Picked up` when those statuses exist.
- Tracking text for pickup states reads `Pickup at shop` or `Picked up by user`.
- Personal Info "Delivered" filter includes delivered, picked up, and cancelled final rows through `isFinalYnotShippingStatus`.

- [ ] **Step 5: Stop the dev server**

Stop the server with `Ctrl-C` in the terminal running `npm run dev`.

Expected:

```text
No local dev server remains running for this task.
```

- [ ] **Step 6: Commit final verification notes if files changed during smoke**

If browser smoke requires CSS or UI fixes, commit them with:

```bash
git add Website/src/features/ynot/admin/AdminShippingConsole.tsx Website/src/app/globals.css Website/src/features/ynot/components.tsx Website/src/features/ynot/cr/PersonalInfoExperience.tsx Website/src/features/ynot/admin/AdminUser360.tsx
git commit -m "Polish admin shipping pickup workflow" \
  -m "Browser smoke exposed final spacing or label issues in the pickup shipping workflow, so the status-first layout is tightened before handoff." \
  -m "Constraint: Keep the admin shipping page dense enough for operations while hiding long detail fields behind disclosure controls." \
  -m "Rejected: adding a modal flow | the side-panel interaction remains faster for queue work." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: browser smoke on /admin/shipping, /shipping, /profile/personal-info; full verification suite from Task 5 Step 1" \
  -m "Not-tested: production Supabase migration apply"
```

If no files changed during smoke, do not create an empty commit.

---

## Self-Review

**Spec coverage**
- Admin sees status first: Task 3 Step 8.
- Long selected request content becomes dropdown/collapsible: Task 3 Step 8 and Step 10.
- Admin can choose pickup statuses: Task 2 database/API/types plus Task 3 transition options.
- `ready_for_pickup` and `picked_up` both included: Task 2 and Task 3.
- Delivered remains supported: Task 2 keeps shipped/delivered carrier flow and Task 3 keeps delivered transition.
- Tracking required only for shipped/delivered: Task 2 Step 1 and Step 5.
- User/customer history and User 360 remain related and functional: Task 4.
- Admin UI polish and easy scanning: Task 3 CSS uses existing admin disclosure pattern, 44px summaries, status-first queue, and scoped transitions.

**Placeholder scan**
- No placeholder markers, deferred implementation notes, or open-ended validation steps are used.
- Every code-changing step includes concrete code snippets and exact file paths.
- Every test step includes exact commands and expected outcomes.

**Type consistency**
- Status literals match across SQL, Supabase types, DTOs, API validation, admin transition choices, and shared label helper:
  `submitted`, `packing`, `ready_for_pickup`, `picked_up`, `shipped`, `delivered`, `cancelled`.
- `draft` remains a database/customer DTO state but is excluded from admin action POST/PATCH statuses.
