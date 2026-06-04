# Admin Shipping Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Plan C admin shipping operations flow so admins can see every shipping request, the user, the shipped reward, the source pack, address context, tracking, and the related User 360 history.

**Architecture:** Keep fulfilment joins server-side in YNOTT data helpers and expose typed DTOs to admin/customer React surfaces. Add one shipping-context migration for address snapshots plus server-side shipping guards, then upgrade admin shipping, User 360, and customer shipping history against the enriched DTOs. Preserve existing status names (`submitted`, `packing`, `shipped`, `delivered`, `cancelled`) and use friendlier labels only in UI.

**Tech Stack:** Next.js App Router, React Server Components, client components with `useTransition`, TypeScript DTOs in `Website/src/features/ynot/types.ts`, Supabase service-role reads/RPCs, PostgreSQL migrations, Node `node:test` static verification.

---

## Scope Check

This plan is one subsystem: shipping operations. It includes the customer shipping request guard, admin fulfilment queue, enriched shipping/user history data, and User 360 support view. It intentionally excludes carrier APIs, printed labels, automated carrier sync, refunds, and pack-opening logic changes.

V1 keeps the existing `1000` selected-card coin-value shipping rule active. The implementation moves that rule to server-side enforcement instead of leaving it as UI-only behavior.

## File Structure

- Modify `Website/scripts/test-shipping-flow.mjs`: add static regression tests for admin all-shipping scope, enriched DTO fields, User 360, customer tracking display, tracking validation, and server-side 1000-coin enforcement.
- Modify `Website/tools/verification/verify-platform-foundation.mjs`: add platform checks for the new shipping operations contract.
- Create `Database/supabase/migrations/20260604100000_shipping_operations_context.sql`: add `shipping_requests.address_snapshot`, enforce complete address + 1000-coin rule in `request_shipping_for_items`, and require tracking when a request is marked shipped.
- Modify `Website/src/lib/supabase/types.ts`: add `address_snapshot` to the generated-style local table type for `shipping_requests`.
- Modify `Website/src/features/ynot/types.ts`: add enriched shipping, admin user detail, wallet ledger, and audit timeline DTOs.
- Modify `Website/src/features/ynot/data.ts`: enrich `getShipping`, add `getAdminUserDetail`, and add small server-only helpers for shipping source context and safe metadata extraction.
- Modify `Website/src/app/api/ynot/shipping/route.ts`: map the new shipping RPC errors to customer-safe messages.
- Modify `Website/src/app/api/ynot/admin/shipping/route.ts`: require tracking provider and tracking number when status is `shipped`, and keep the route aligned with the DB guard.
- Create `Website/src/features/ynot/admin/AdminShippingConsole.tsx`: client-side admin fulfilment console with table, detail drawer, status action form, tracking visibility, and User 360 links.
- Modify `Website/src/app/admin/shipping/page.tsx`: load all shipping requests through `getShipping(undefined, true)` and render `AdminShippingConsole`.
- Create `Website/src/features/ynot/admin/AdminUser360.tsx`: server-rendered admin user detail layout.
- Create `Website/src/app/admin/users/[profileId]/page.tsx`: User 360 route.
- Modify `Website/src/app/admin/users/page.tsx`: add a User 360 link in each directory row.
- Modify `Website/src/features/ynot/components.tsx`: show enriched reward/source/tracking details in shipping history.
- Modify `Website/src/features/ynot/client.tsx`: require complete selected address in the shipping panel, show a final shipping confirmation modal, and keep the 1000-coin copy consistent with the server rule.

## Task 1: Lock The Shipping Operations Contract With Failing Tests

**Files:**
- Modify: `Website/scripts/test-shipping-flow.mjs`
- Modify: `Website/tools/verification/verify-platform-foundation.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Add source reads to `Website/scripts/test-shipping-flow.mjs`**

Change the import at the top from:

```js
import { readFileSync } from "node:fs";
```

to:

```js
import { existsSync, readFileSync } from "node:fs";
```

Then insert this helper and these constants after the existing `platformVerifier` constant:

```js
function readOptionalUrl(url) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);
const adminShippingPage = readFileSync(
  new URL("../src/app/admin/shipping/page.tsx", import.meta.url),
  "utf8",
);
const adminUsersPage = readFileSync(
  new URL("../src/app/admin/users/page.tsx", import.meta.url),
  "utf8",
);
const componentsSource = readFileSync(
  new URL("../src/features/ynot/components.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const adminShippingRoute = readFileSync(
  new URL("../src/app/api/ynot/admin/shipping/route.ts", import.meta.url),
  "utf8",
);
const adminUserRouteSource = readOptionalUrl(
  new URL("../src/app/admin/users/[profileId]/page.tsx", import.meta.url),
);
const shippingContextMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604100000_shipping_operations_context.sql", import.meta.url),
);
```

- [ ] **Step 2: Add helper functions to `Website/scripts/test-shipping-flow.mjs`**

Insert this helper after `callSource`:

```js
function between(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}
```

- [ ] **Step 3: Add tests for the new contract**

Append these tests before the existing `platform verifier covers customer shipping hardening` test:

```js
test("admin shipping page loads all requests and renders the operations console", () => {
  assert.match(adminShippingPage, /getShipping\(undefined,\s*true\)/);
  assert.match(adminShippingPage, /AdminShippingConsole/);
  assert.doesNotMatch(adminShippingPage, /getYnotDashboardSlice\(\{\s*shipping:\s*true\s*\}\)/);
});

test("shipping DTOs include user reward pack address tracking and timeline fields", () => {
  assert.match(typesSource, /export type YnotShippingItem/);
  assert.match(typesSource, /sourceCampaignTitle/);
  assert.match(typesSource, /sourceOpenCode/);
  assert.match(typesSource, /export type YnotShippingCustomer/);
  assert.match(typesSource, /export type YnotShippingAddressSnapshot/);
  assert.match(typesSource, /export type YnotShippingTimelineEvent/);
  assert.match(typesSource, /items\?: YnotShippingItem\[\]/);
  assert.match(typesSource, /customer\?: YnotShippingCustomer \| null/);
  assert.match(typesSource, /addressSnapshot\?: YnotShippingAddressSnapshot \| null/);
  assert.match(typesSource, /timeline\?: YnotShippingTimelineEvent\[\]/);
});

test("shipping loader enriches requests from users items packs addresses and audits", () => {
  const getShippingBlock = between(dataSource, "export async function getShipping", "function publicShippingRequest");

  assert.match(getShippingBlock, /includeAll/);
  assert.match(getShippingBlock, /\.from\("shipping_request_items"\)/);
  assert.match(getShippingBlock, /\.from\("collection_items"\)/);
  assert.match(getShippingBlock, /\.from\("profiles"\)/);
  assert.match(getShippingBlock, /\.from\("user_addresses"\)/);
  assert.match(getShippingBlock, /\.from\("gacha_opens"\)/);
  assert.match(getShippingBlock, /\.from\("draw_rounds"\)/);
  assert.match(getShippingBlock, /\.from\("audit_events"\)/);
  assert.match(getShippingBlock, /addressSnapshotFromRow/);
  assert.match(getShippingBlock, /shippingItemsByRequestId/);
  assert.match(getShippingBlock, /timelineByShippingRequestId/);
});

test("customer public shipping strips admin-only customer and timeline context", () => {
  const publicBlock = between(dataSource, "function publicShippingRequest", "export async function getAddresses");

  assert.match(publicBlock, /customer:\s*null/);
  assert.match(publicBlock, /timeline:\s*\[\]/);
  assert.match(publicBlock, /adminNote:\s*null/);
  assert.match(publicBlock, /id:\s*request\.publicCode/);
});

test("shipping request stores address snapshot and enforces complete address plus value minimum", () => {
  assert.match(shippingContextMigration, /add column if not exists address_snapshot jsonb/);
  assert.match(shippingContextMigration, /shipping_minimum_coin_value_required/);
  assert.match(shippingContextMigration, /valid_shipping_address_required/);
  assert.match(shippingContextMigration, /recipient_name/);
  assert.match(shippingContextMigration, /postal_code/);
  assert.match(shippingContextMigration, /convert_coin_value_snapshot/);
  assert.match(shippingRoute, /shipping_minimum_coin_value_required/);
});

test("admin shipped transition requires tracking in route and database function", () => {
  assert.match(adminShippingRoute, /status === "shipped"/);
  assert.match(adminShippingRoute, /Tracking provider and tracking number are required/);
  assert.match(shippingContextMigration, /shipping_tracking_required/);
});

test("admin user directory links to User 360 and the detail route loads admin user history", () => {
  assert.match(adminUsersPage, /href=\{`\/admin\/users\/\$\{user\.id\}`\}/);
  assert.match(adminUserRouteSource, /getAdminUserDetail/);
  assert.match(adminUserRouteSource, /AdminUser360/);
  assert.match(typesSource, /export type YnotAdminUserDetail/);
  assert.match(dataSource, /export async function getAdminUserDetail/);
});

test("customer shipping history shows reward source pack and tracking details", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");

  assert.match(orderListBlock, /order\.items/);
  assert.match(orderListBlock, /sourceCampaignTitle/);
  assert.match(orderListBlock, /trackingProvider/);
  assert.match(orderListBlock, /trackingNumber/);
});

test("customer shipping panel requires a complete address and confirms reward lock before submit", () => {
  const convertPanelBlock = between(clientSource, "export function CollectionConvertPanel", "export function WalletTopUpPanel");

  assert.match(convertPanelBlock, /function isCompleteShippingAddress/);
  assert.match(convertPanelBlock, /showShippingConfirm/);
  assert.match(convertPanelBlock, /This reward will be locked/);
  assert.match(convertPanelBlock, /SHIPPING_REQUEST_MIN_COINS/);
});
```

- [ ] **Step 4: Add platform verifier checks**

Append these checks after the existing customer shipping verifier block in `Website/tools/verification/verify-platform-foundation.mjs`:

```js
check("src/app/admin/shipping/page.tsx", "admin shipping page loads all customer requests", /getShipping\(undefined,\s*true\)[\s\S]*AdminShippingConsole/);
check("src/features/ynot/types.ts", "shipping DTO carries fulfilment context", /YnotShippingItem[\s\S]*sourceCampaignTitle[\s\S]*YnotShippingCustomer[\s\S]*YnotShippingAddressSnapshot[\s\S]*YnotShippingTimelineEvent/);
check("src/features/ynot/data.ts", "shipping loader enriches admin fulfilment context", /getShipping[\s\S]*shipping_request_items[\s\S]*collection_items[\s\S]*profiles[\s\S]*user_addresses[\s\S]*gacha_opens[\s\S]*draw_rounds[\s\S]*audit_events/);
check("src/app/api/ynot/admin/shipping/route.ts", "admin shipped status requires tracking", /status === "shipped"[\s\S]*Tracking provider and tracking number are required/);
check("src/app/admin/users/[profileId]/page.tsx", "admin User 360 route renders user detail history", /getAdminUserDetail[\s\S]*AdminUser360/);
check("src/features/ynot/components.tsx", "customer shipping history shows item source and tracking", /OrderList[\s\S]*order\.items[\s\S]*sourceCampaignTitle[\s\S]*trackingNumber/);
check("src/features/ynot/client.tsx", "customer shipping panel confirms complete shipment details", /isCompleteShippingAddress[\s\S]*showShippingConfirm[\s\S]*This reward will be locked/);
check("../Database/supabase/migrations/20260604100000_shipping_operations_context.sql", "shipping migration stores address snapshots and server-side shipment guards", /address_snapshot jsonb[\s\S]*shipping_minimum_coin_value_required[\s\S]*shipping_tracking_required/);
```

- [ ] **Step 5: Run tests to verify they fail**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
```

Expected: FAIL. Failures should mention the missing migration file, admin shipping console, enriched DTOs, User 360 route, customer history display, and tracking/minimum guards.

- [ ] **Step 6: Commit the failing contract**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-shipping-flow.mjs Website/tools/verification/verify-platform-foundation.mjs
git commit -m "Lock admin shipping operations contract

Constraint: Fulfilment needs user, reward, pack, address, status, and tracking context before UI work starts.
Rejected: Manual QA only | the current thin queue can regress silently.
Confidence: high
Scope-risk: narrow
Directive: Keep these assertions aligned with the Plan C shipping operations spec.
Tested: npm run test:shipping-flow fails on the new shipping operations assertions
Not-tested: Implementation is intentionally in later tasks.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 2: Add Shipping Context Migration And Route Guards

**Files:**
- Create: `Database/supabase/migrations/20260604100000_shipping_operations_context.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/src/app/api/ynot/shipping/route.ts`
- Modify: `Website/src/app/api/ynot/admin/shipping/route.ts`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Create the shipping context migration**

Create `Database/supabase/migrations/20260604100000_shipping_operations_context.sql` with this content:

```sql
-- Store immutable shipping context and enforce server-side shipment guards.
-- Production guard: apply only after backup, project/env confirmation, and owner approval.

alter table public.shipping_requests
  add column if not exists address_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.request_shipping_for_items(
  p_profile_id uuid,
  p_address_id uuid,
  p_collection_item_ids uuid[],
  p_customer_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  requested_count integer;
  valid_count integer;
  shipping_row public.shipping_requests%rowtype;
  existing_request public.shipping_requests%rowtype;
  address_row public.user_addresses%rowtype;
  selected_coin_value integer := 0;
  minimum_coin_value integer := 1000;
  address_snapshot jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;

  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select *
  into address_row
  from public.user_addresses ua
  where ua.id = p_address_id
    and ua.profile_id = p_profile_id;

  if not found
    or nullif(btrim(coalesce(address_row.recipient_name, '')), '') is null
    or nullif(btrim(coalesce(address_row.phone, '')), '') is null
    or nullif(btrim(coalesce(address_row.address_line1, '')), '') is null
    or nullif(btrim(coalesce(address_row.subdistrict, '')), '') is null
    or nullif(btrim(coalesce(address_row.district, '')), '') is null
    or nullif(btrim(coalesce(address_row.province, '')), '') is null
    or nullif(btrim(coalesce(address_row.postal_code, '')), '') is null
    or nullif(btrim(coalesce(address_row.country, '')), '') is null
  then
    raise exception 'valid_shipping_address_required';
  end if;

  select count(distinct item_id)
  into requested_count
  from unnest(p_collection_item_ids) as item_id;

  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_request
    from public.shipping_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_request.id is not null then
      return jsonb_build_object(
        'status', existing_request.status,
        'shippingRequestId', existing_request.id,
        'publicCode', existing_request.public_code,
        'replayed', true
      );
    end if;
  end if;

  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
  for update;

  select
    count(*),
    coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)
  into valid_count, selected_coin_value
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned';

  if valid_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;

  if selected_coin_value < minimum_coin_value then
    raise exception 'shipping_minimum_coin_value_required';
  end if;

  address_snapshot := jsonb_build_object(
    'label', address_row.label,
    'recipientName', address_row.recipient_name,
    'phone', address_row.phone,
    'addressLine1', address_row.address_line1,
    'addressLine2', address_row.address_line2,
    'subdistrict', address_row.subdistrict,
    'district', address_row.district,
    'province', address_row.province,
    'postalCode', address_row.postal_code,
    'country', address_row.country,
    'deliveryNote', address_row.delivery_note
  );

  insert into public.shipping_requests(
    profile_id,
    address_id,
    address_snapshot,
    status,
    customer_note,
    idempotency_key
  )
  values (
    p_profile_id,
    p_address_id,
    address_snapshot,
    'submitted',
    p_customer_note,
    p_idempotency_key
  )
  returning * into shipping_row;

  insert into public.shipping_request_items(shipping_request_id, collection_item_id, card_id)
  select shipping_row.id, ci.id, ci.card_id
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id;

  update public.collection_items
  set
    status = 'shipping_requested',
    updated_at = now()
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (
    p_profile_id,
    'shipping_submitted',
    shipping_row.id,
    jsonb_build_object(
      'item_count', requested_count,
      'selectedCoinValue', selected_coin_value,
      'minimumCoinValue', minimum_coin_value
    )
  );

  return jsonb_build_object(
    'status', 'submitted',
    'shippingRequestId', shipping_row.id,
    'publicCode', shipping_row.public_code,
    'itemCount', requested_count
  );
end;
$$;

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

  if p_status not in ('submitted', 'packing', 'shipped', 'delivered', 'cancelled') then
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

  if v_previous_status in ('delivered', 'cancelled') and p_status <> v_previous_status then
    raise exception 'shipping_request_terminal' using errcode = '22023';
  end if;

  if v_previous_status = 'draft' and p_status not in ('submitted', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'submitted' and p_status not in ('submitted', 'packing', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'packing' and p_status not in ('packing', 'shipped', 'cancelled') then
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

  if p_status in ('shipped', 'delivered') then
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

revoke all on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) to service_role;

revoke all on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) to service_role;
```

- [ ] **Step 2: Update local Supabase types**

In `Website/src/lib/supabase/types.ts`, add `address_snapshot` to `shipping_requests.Row` and `shipping_requests.Insert`.

The `Row` object must become:

```ts
Row: { id: string; public_code: string; profile_id: string; address_id: string | null; address_snapshot: Json; status: "draft" | "submitted" | "packing" | "shipped" | "delivered" | "cancelled"; shipping_fee_coins: number; tracking_provider: string | null; tracking_number: string | null; customer_note: string | null; admin_note: string | null; idempotency_key: string | null; created_at: string; updated_at: string };
```

The `Insert` object must become:

```ts
Insert: { id?: string; public_code?: string; profile_id: string; address_id?: string | null; address_snapshot?: Json; status?: "draft" | "submitted" | "packing" | "shipped" | "delivered" | "cancelled"; shipping_fee_coins?: number; tracking_provider?: string | null; tracking_number?: string | null; customer_note?: string | null; admin_note?: string | null; idempotency_key?: string | null; created_at?: string; updated_at?: string };
```

- [ ] **Step 3: Map new customer shipping errors**

In `Website/src/app/api/ynot/shipping/route.ts`, update `shippingErrorMessage` with these branches before the final fallback:

```ts
  if (message.includes("shipping_minimum_coin_value_required")) {
    return "A total of 1,000 coins or more in selected cards is required for shipping.";
  }
  if (message.includes("valid_shipping_address_required")) {
    return "Complete your recipient name, phone, and full shipping address before requesting shipping.";
  }
```

Keep the existing `valid_shipping_address_required` branch only once; replace the old shorter message with the complete-address message above.

- [ ] **Step 4: Require tracking in the admin route before RPC**

In `Website/src/app/api/ynot/admin/shipping/route.ts`, replace the tracking normalization block with:

```ts
  const trackingProvider =
    typeof body?.trackingProvider === "string"
      ? body.trackingProvider.trim().slice(0, 120)
      : "";
  const trackingNumber =
    typeof body?.trackingNumber === "string"
      ? body.trackingNumber.trim().slice(0, 120)
      : "";
  if (status === "shipped" && (!trackingProvider || !trackingNumber)) {
    return Response.json(
      { error: "Tracking provider and tracking number are required before marking a shipment shipped." },
      { status: 400 },
    );
  }
```

Then pass nullable values to the RPC:

```ts
    p_tracking_provider: trackingProvider || null,
    p_tracking_number: trackingNumber || null,
```

- [ ] **Step 5: Run the contract test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
```

Expected: FAIL only on assertions for DTO enrichment, admin console, User 360, and customer UI/history. The migration and route-guard assertions should now pass.

- [ ] **Step 6: Commit the migration and route guard**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Database/supabase/migrations/20260604100000_shipping_operations_context.sql Website/src/lib/supabase/types.ts Website/src/app/api/ynot/shipping/route.ts Website/src/app/api/ynot/admin/shipping/route.ts
git commit -m "Guard shipping requests with fulfilment context

Constraint: Customer shipping must keep the existing value rule and preserve the address used at request time.
Rejected: UI-only validation | direct server routes and future callers could bypass it.
Confidence: high
Scope-risk: moderate
Directive: Keep address snapshots immutable per request and require tracking before shipped state.
Tested: npm run test:shipping-flow fails only on remaining UI/data assertions
Not-tested: Linked Supabase migration apply is reserved for the production publish workflow.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 3: Add Enriched Shipping And User Detail DTOs

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Add shipping operation types**

In `Website/src/features/ynot/types.ts`, replace `YnotShippingRequest` with this block:

```ts
export type YnotShippingStatus =
  | "draft"
  | "submitted"
  | "packing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type YnotShippingCustomer = {
  profileId: string;
  displayName: string;
  email?: string | null;
  lineDisplayName?: string | null;
  lineUserId?: string | null;
  phone?: string | null;
  status?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
};

export type YnotShippingAddressSnapshot = {
  label?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  deliveryNote?: string | null;
};

export type YnotShippingItem = {
  cardName: string;
  cardCode?: string | null;
  imageUrl?: string | null;
  status?: YnotCollectionItem["status"] | null;
  serialNo?: string | null;
  acquiredAt?: string | null;
  sourceCampaignTitle?: string | null;
  sourceCampaignSlug?: string | null;
  sourceOpenCode?: string | null;
  sourceOpenPosition?: number | null;
  sourcePrizeTierLabel?: string | null;
  sourcePrizeValueThb?: number | null;
};

export type YnotShippingTimelineEvent = {
  id: string;
  eventType: string;
  label: string;
  createdAt: string;
  actorLabel?: string | null;
  previousStatus?: string | null;
  status?: string | null;
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
};

export type YnotShippingRequest = {
  id: string;
  publicCode: string;
  profileId?: string;
  status: YnotShippingStatus;
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  customerNote?: string | null;
  adminNote?: string | null;
  shippingFeeCoins?: number;
  customer?: YnotShippingCustomer | null;
  addressSnapshot?: YnotShippingAddressSnapshot | null;
  items?: YnotShippingItem[];
  timeline?: YnotShippingTimelineEvent[];
};
```

- [ ] **Step 2: Add User 360 types**

In `Website/src/features/ynot/types.ts`, add these types after `YnotShippingRequest`:

```ts
export type YnotWalletLedgerEntry = {
  id: string;
  entryType: string;
  amountCoins: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  createdAt: string;
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
  walletLedger: YnotWalletLedgerEntry[];
  auditTimeline: YnotShippingTimelineEvent[];
};
```

- [ ] **Step 3: Import the new types in `data.ts`**

Update the type import list in `Website/src/features/ynot/data.ts` to include:

```ts
  YnotAdminUserDetail,
  YnotShippingAddressSnapshot,
  YnotShippingItem,
  YnotShippingTimelineEvent,
```

- [ ] **Step 4: Add JSON/address/timeline helpers in `data.ts`**

Add this helper block above `export async function getShipping`:

```ts
function shippingAddressSnapshotFromValue(
  value: unknown,
): YnotShippingAddressSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    label: metadataString(value, "label") ?? null,
    recipientName: metadataString(value, "recipientName") ?? null,
    phone: metadataString(value, "phone") ?? null,
    addressLine1: metadataString(value, "addressLine1") ?? null,
    addressLine2: metadataString(value, "addressLine2") ?? null,
    subdistrict: metadataString(value, "subdistrict") ?? null,
    district: metadataString(value, "district") ?? null,
    province: metadataString(value, "province") ?? null,
    postalCode: metadataString(value, "postalCode") ?? null,
    country: metadataString(value, "country") ?? null,
    deliveryNote: metadataString(value, "deliveryNote") ?? null,
  };
}

function shippingAddressSnapshotFromAddress(
  address?: Database["public"]["Tables"]["user_addresses"]["Row"],
): YnotShippingAddressSnapshot | null {
  if (!address) return null;
  return {
    label: address.label,
    recipientName: address.recipient_name,
    phone: address.phone,
    addressLine1: address.address_line1,
    addressLine2: address.address_line2,
    subdistrict: address.subdistrict,
    district: address.district,
    province: address.province,
    postalCode: address.postal_code,
    country: address.country,
    deliveryNote: address.delivery_note,
  };
}

function shippingTimelineLabel(eventType: string, status?: string | null) {
  if (eventType === "shipping_submitted") return "Shipping requested";
  if (eventType === "shipping_status_updated") {
    if (status === "packing") return "Marked packing";
    if (status === "shipped") return "Marked shipped";
    if (status === "delivered") return "Marked delivered";
    if (status === "cancelled") return "Cancelled";
  }
  return eventType.replaceAll("_", " ");
}

function shippingTimelineEvent(
  row: Database["public"]["Tables"]["audit_events"]["Row"],
): YnotShippingTimelineEvent {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const status = metadataString(metadata, "status") ?? null;
  return {
    id: row.id,
    eventType: row.event_type,
    label: shippingTimelineLabel(row.event_type, status),
    createdAt: row.created_at,
    previousStatus: metadataString(metadata, "previousStatus") ?? null,
    status,
    trackingProvider: metadataString(metadata, "trackingProvider") ?? null,
    trackingNumber: metadataString(metadata, "trackingNumber") ?? null,
    note: metadataString(metadata, "adminNote") ?? null,
  };
}
```

- [ ] **Step 5: Replace `getShipping` with an enriched implementation**

Replace the existing `export async function getShipping` body with this implementation:

```ts
export async function getShipping(
  profileId?: string,
  includeAll = false,
): Promise<YnotShippingRequest[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("shipping", async () => {
    let query = supabase
      .from("shipping_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(includeAll ? 200 : 80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];

    const requestIds = rows.map((row) => row.id);
    const profileIds = Array.from(new Set(rows.map((row) => row.profile_id)));
    const addressIds = Array.from(
      new Set(rows.map((row) => row.address_id).filter((id): id is string => Boolean(id))),
    );

    const [requestItems, profiles, addresses, auditEvents, cards] =
      await Promise.all([
        readOrEmpty("shipping_request_items", async () => {
          const { data, error } = await supabase
            .from("shipping_request_items")
            .select("*")
            .in("shipping_request_id", requestIds);
          if (error) throw error;
          return data ?? [];
        }),
        includeAll
          ? readOrEmpty("shipping_profiles", async () => {
              const { data, error } = await supabase
                .from("profiles")
                .select("id,email,line_user_id,line_display_name,display_name,phone,profile_status,created_at,last_seen_at")
                .in("id", profileIds);
              if (error) throw error;
              return data ?? [];
            })
          : Promise.resolve([]),
        addressIds.length
          ? readOrEmpty("shipping_addresses", async () => {
              const { data, error } = await supabase
                .from("user_addresses")
                .select("*")
                .in("id", addressIds);
              if (error) throw error;
              return data ?? [];
            })
          : Promise.resolve([]),
        readOrEmpty("shipping_audit_events", async () => {
          const { data, error } = await supabase
            .from("audit_events")
            .select("*")
            .in("shipping_request_id", requestIds)
            .order("created_at", { ascending: true });
          if (error) throw error;
          return data ?? [];
        }),
        readOrEmpty("shipping_card_catalog", async () => getCardCatalog(supabase)),
      ]);

    const collectionItemIds = Array.from(
      new Set(requestItems.map((item) => item.collection_item_id)),
    );
    const collectionItems = collectionItemIds.length
      ? await readOrEmpty("shipping_collection_items", async () => {
          const { data, error } = await supabase
            .from("collection_items")
            .select("*")
            .in("id", collectionItemIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];

    const gachaOpenIds = Array.from(
      new Set(
        collectionItems
          .filter((item) => item.source_type === "gacha_open" && item.source_id)
          .map((item) => item.source_id as string),
      ),
    );
    const opens = gachaOpenIds.length
      ? await readOrEmpty("shipping_source_opens", async () => {
          const { data, error } = await supabase
            .from("gacha_opens")
            .select("id,public_code,draw_round_id")
            .in("id", gachaOpenIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const campaignIds = Array.from(new Set(opens.map((open) => open.draw_round_id)));
    const campaigns = campaignIds.length
      ? await readOrEmpty("shipping_source_campaigns", async () => {
          const { data, error } = await supabase
            .from("draw_rounds")
            .select("id,slug,title_th,title_en")
            .in("id", campaignIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const prizeUnits = collectionItemIds.length
      ? await readOrEmpty("shipping_prize_units", async () => {
          const { data, error } = await supabase
            .from("draw_round_prize_units")
            .select("collection_item_id,gacha_open_item_id")
            .in("collection_item_id", collectionItemIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const openItemIds = Array.from(
      new Set(
        prizeUnits
          .map((unit) => unit.gacha_open_item_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const openItems = openItemIds.length
      ? await readOrEmpty("shipping_source_open_items", async () => {
          const { data, error } = await supabase
            .from("gacha_open_items")
            .select("id,draw_round_prize_id,result_position,value_thb,tier")
            .in("id", openItemIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const prizeIds = Array.from(
      new Set(
        openItems
          .map((item) => item.draw_round_prize_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const prizes = prizeIds.length
      ? await readOrEmpty("shipping_source_prizes", async () => {
          const { data, error } = await supabase
            .from("draw_round_prizes")
            .select("id,tier,rank,value_thb,metadata")
            .in("id", prizeIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];

    const requestItemsByRequestId = new Map<string, typeof requestItems>();
    for (const item of requestItems) {
      const group = requestItemsByRequestId.get(item.shipping_request_id) ?? [];
      group.push(item);
      requestItemsByRequestId.set(item.shipping_request_id, group);
    }
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const addressById = new Map(addresses.map((address) => [address.id, address]));
    const cardById = new Map(cards.map((card) => [card.catalogCardId, card]));
    const collectionItemById = new Map(collectionItems.map((item) => [item.id, item]));
    const openById = new Map(opens.map((open) => [open.id, open]));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const openItemIdByCollectionItemId = new Map(
      prizeUnits
        .filter((unit) => unit.collection_item_id && unit.gacha_open_item_id)
        .map((unit) => [unit.collection_item_id, unit.gacha_open_item_id as string]),
    );
    const openItemById = new Map(openItems.map((item) => [item.id, item]));
    const prizeById = new Map(prizes.map((prize) => [prize.id, prize]));
    const timelineByShippingRequestId = new Map<string, YnotShippingTimelineEvent[]>();
    for (const event of auditEvents) {
      if (!event.shipping_request_id) continue;
      const group = timelineByShippingRequestId.get(event.shipping_request_id) ?? [];
      group.push(shippingTimelineEvent(event));
      timelineByShippingRequestId.set(event.shipping_request_id, group);
    }

    const shippingItemsByRequestId = new Map<string, YnotShippingItem[]>();
    for (const row of rows) {
      const mappedItems = (requestItemsByRequestId.get(row.id) ?? []).map((requestItem) => {
        const collectionItem = collectionItemById.get(requestItem.collection_item_id);
        const card = cardById.get(requestItem.card_id);
        const sourceOpen = collectionItem?.source_id
          ? openById.get(collectionItem.source_id)
          : undefined;
        const campaign = sourceOpen
          ? campaignById.get(sourceOpen.draw_round_id)
          : undefined;
        const sourceOpenItemId = openItemIdByCollectionItemId.get(requestItem.collection_item_id);
        const sourceOpenItem = sourceOpenItemId ? openItemById.get(sourceOpenItemId) : undefined;
        const sourcePrize = sourceOpenItem?.draw_round_prize_id
          ? prizeById.get(sourceOpenItem.draw_round_prize_id)
          : undefined;
        const sourceTier = sourcePrize
          ? displayTierFromPrizeMetadata(sourcePrize)
          : sourceOpenItem?.tier
            ? prizeDisplayTierValue(sourceOpenItem.tier)
            : null;
        return {
          cardName: card?.name ?? "Mystery reward",
          cardCode: card?.code ?? null,
          imageUrl: card?.photoUrl ?? null,
          status: collectionItem?.status ?? null,
          serialNo: collectionItem?.serial_no ?? null,
          acquiredAt: collectionItem?.acquired_at ?? null,
          sourceCampaignTitle: campaign?.title_en ?? campaign?.title_th ?? null,
          sourceCampaignSlug: campaign?.slug ?? null,
          sourceOpenCode: sourceOpen?.public_code ?? null,
          sourceOpenPosition: sourceOpenItem?.result_position ?? null,
          sourcePrizeTierLabel: sourceTier
            ? metadataString(sourcePrize?.metadata, "displayTierLabel") ??
              prizeDisplayTierLabel(sourceTier)
            : null,
          sourcePrizeValueThb: sourceOpenItem?.value_thb ?? sourcePrize?.value_thb ?? null,
        };
      });
      shippingItemsByRequestId.set(row.id, mappedItems);
    }

    return rows.map((row) => {
      const profile = includeAll ? profileById.get(row.profile_id) : undefined;
      const addressSnapshot =
        shippingAddressSnapshotFromValue(row.address_snapshot) ??
        shippingAddressSnapshotFromAddress(
          row.address_id ? addressById.get(row.address_id) : undefined,
        );
      return {
        id: row.id,
        publicCode: row.public_code,
        profileId: row.profile_id,
        status: row.status,
        trackingProvider: row.tracking_provider,
        trackingNumber: row.tracking_number,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        customerNote: row.customer_note,
        adminNote: row.admin_note,
        shippingFeeCoins: row.shipping_fee_coins,
        customer: profile
          ? {
              profileId: profile.id,
              displayName:
                profile.display_name ??
                profile.line_display_name ??
                "YNot Customer",
              email: profile.email,
              lineDisplayName: profile.line_display_name,
              lineUserId: profile.line_user_id,
              phone: profile.phone,
              status: profile.profile_status,
              createdAt: profile.created_at,
              lastSeenAt: profile.last_seen_at,
            }
          : null,
        addressSnapshot,
        items: shippingItemsByRequestId.get(row.id) ?? [],
        timeline: timelineByShippingRequestId.get(row.id) ?? [],
      };
    });
  });
}
```

- [ ] **Step 6: Keep customer shipping public**

Replace `publicShippingRequest` with:

```ts
function publicShippingRequest(
  request: YnotShippingRequest,
): YnotShippingRequest {
  return {
    ...request,
    id: request.publicCode,
    profileId: undefined,
    customer: null,
    timeline: [],
    adminNote: null,
  };
}
```

- [ ] **Step 7: Add admin user detail helper**

Add this function after `getAdminUsers`:

```ts
export async function getAdminUserDetail(
  profileId: string,
): Promise<YnotAdminUserDetail | null> {
  if (!profileId || !isSupabaseConfigured()) return null;
  const admin = await resolveAdminSession();
  if (!admin) return null;
  const supabase = createServiceSupabaseClient();
  const profileRows = await readOrEmpty("admin_user_detail_profile", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .limit(1);
    if (error) throw error;
    return data ?? [];
  });
  const profile = profileRows[0];
  if (!profile) return null;

  const [wallet, addresses, collection, gachaOpens, shipping, topUps, walletLedger, auditRows] =
    await Promise.all([
      getWallet(profileId),
      getAddresses(profileId),
      getCollection(profileId),
      getGachaOpenHistory(profileId),
      getShipping(profileId),
      getTopUps(profileId, false, { includeSensitiveSlipDetails: true }),
      readOrEmpty("admin_user_wallet_ledger", async () => {
        const { data, error } = await supabase
          .from("coin_ledger")
          .select("id,entry_type,amount_coins,balance_before,balance_after,reference_type,created_at")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (error) throw error;
        return data ?? [];
      }),
      readOrEmpty("admin_user_audit", async () => {
        const { data, error } = await supabase
          .from("audit_events")
          .select("*")
          .eq("actor_profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (error) throw error;
        return data ?? [];
      }),
    ]);

  return {
    profile: {
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
    },
    wallet,
    addresses,
    collection,
    gachaOpens,
    shipping,
    topUps,
    walletLedger: walletLedger.map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type,
      amountCoins: entry.amount_coins,
      balanceBefore: entry.balance_before,
      balanceAfter: entry.balance_after,
      referenceType: entry.reference_type,
      createdAt: entry.created_at,
    })),
    auditTimeline: auditRows.map(shippingTimelineEvent),
  };
}
```

- [ ] **Step 8: Run the contract test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
```

Expected: FAIL only on assertions for admin page rendering, User 360 route/component, customer history UI, and customer shipping confirmation.

- [ ] **Step 9: Commit enriched data helpers**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts
git commit -m "Enrich shipping and user history data

Constraint: Admin fulfilment needs server-side joins across shipping, collection, packs, profiles, addresses, and audit history.
Rejected: Client-side joins | customer and admin surfaces should consume safe DTOs.
Confidence: medium
Scope-risk: moderate
Directive: Do not expose admin customer or audit context through public shipping history.
Tested: npm run test:shipping-flow fails only on remaining UI assertions
Not-tested: Live Supabase data shape will be verified during final smoke checks.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 4: Build The Admin Shipping Operations Console

**Files:**
- Create: `Website/src/features/ynot/admin/AdminShippingConsole.tsx`
- Modify: `Website/src/app/admin/shipping/page.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Create `AdminShippingConsole`**

Create `Website/src/features/ynot/admin/AdminShippingConsole.tsx` with this content:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { YnotShippingRequest } from "@/features/ynot/types";
import { AdminIcon } from "./Icon";
import { AdminPill, AdminStatusPill } from "./primitives";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return date.toLocaleString();
}

function formatAddress(request: YnotShippingRequest) {
  const address = request.addressSnapshot;
  if (!address) return "No address snapshot";
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
  ]
    .filter(Boolean)
    .join(" | ");
}

function primaryItemLabel(request: YnotShippingRequest) {
  const item = request.items?.[0];
  if (!item) return "No items linked";
  const suffix =
    (request.items?.length ?? 0) > 1 ? ` +${(request.items?.length ?? 1) - 1}` : "";
  return `${item.cardName}${suffix}`;
}

function statusCounts(requests: YnotShippingRequest[]) {
  return {
    submitted: requests.filter((request) => request.status === "submitted").length,
    packing: requests.filter((request) => request.status === "packing").length,
    shipped: requests.filter((request) => request.status === "shipped").length,
    delivered: requests.filter((request) => request.status === "delivered").length,
  };
}

export function AdminShippingConsole({
  requests,
}: {
  requests: YnotShippingRequest[];
}) {
  const router = useRouter();
  const counts = useMemo(() => statusCounts(requests), [requests]);
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0];
  const [status, setStatus] = useState<YnotShippingRequest["status"]>(
    selected?.status ?? "submitted",
  );
  const [trackingProvider, setTrackingProvider] = useState(
    selected?.trackingProvider ?? "",
  );
  const [trackingNumber, setTrackingNumber] = useState(
    selected?.trackingNumber ?? "",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function selectRequest(request: YnotShippingRequest) {
    setSelectedId(request.id);
    setStatus(request.status);
    setTrackingProvider(request.trackingProvider ?? "");
    setTrackingNumber(request.trackingNumber ?? "");
    setNote("");
    setMessage("");
  }

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch("/api/ynot/admin/shipping", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shippingRequestId: selected.id,
            status,
            trackingProvider,
            trackingNumber,
            note,
          }),
        });
        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => null))?.error ??
              "Shipping update failed.",
          );
        }
        setMessage("Shipping updated.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Shipping update failed.",
        );
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Submitted</div>
          <div className="value">{counts.submitted}</div>
        </div>
        <div className="kpi">
          <div className="label">Packing</div>
          <div className="value">{counts.packing}</div>
        </div>
        <div className="kpi">
          <div className="label">Shipped</div>
          <div className="value">{counts.shipped}</div>
        </div>
        <div className="kpi">
          <div className="label">Delivered</div>
          <div className="value">{counts.delivered}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="section-label">Queue</p>
              <h3>Shipping requests · {requests.length}</h3>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>User</th>
                  <th>Reward</th>
                  <th>Pack</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 24 }}>
                      No shipping requests.
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => {
                    const primaryItem = request.items?.[0];
                    return (
                      <tr
                        key={request.id}
                        onClick={() => selectRequest(request)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="mono" style={{ fontWeight: 700 }}>
                          {request.publicCode}
                        </td>
                        <td>
                          <div className="row-title">
                            {request.customer?.displayName ?? "Unknown user"}
                          </div>
                          <div className="row-sub mono" style={{ fontSize: 11 }}>
                            {request.customer?.email ?? request.customer?.profileId ?? "-"}
                          </div>
                        </td>
                        <td>{primaryItemLabel(request)}</td>
                        <td>{primaryItem?.sourceCampaignTitle ?? "-"}</td>
                        <td>
                          <AdminStatusPill status={request.status} />
                        </td>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {request.trackingProvider && request.trackingNumber
                            ? `${request.trackingProvider} | ${request.trackingNumber}`
                            : "-"}
                        </td>
                        <td className="mono muted" style={{ fontSize: 11 }}>
                          {formatDate(request.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card">
          {!selected ? (
            <div className="muted">Select a shipping request.</div>
          ) : (
            <div className="grid gap-4">
              <div className="card-head">
                <div>
                  <p className="section-label">Selected request</p>
                  <h3>{selected.publicCode}</h3>
                </div>
                <AdminStatusPill status={selected.status} />
              </div>

              <div className="list">
                <div className="list-row">
                  <AdminIcon name="users" />
                  <div>
                    <strong>{selected.customer?.displayName ?? "Unknown user"}</strong>
                    <div className="row-sub">{selected.customer?.email ?? "-"}</div>
                    {selected.customer?.profileId ? (
                      <Link href={`/admin/users/${selected.customer.profileId}`}>
                        Open User 360
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="list-row">
                  <AdminIcon name="truck" />
                  <div>
                    <strong>Address snapshot</strong>
                    <div className="row-sub">{formatAddress(selected)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {(selected.items ?? []).map((item, index) => (
                  <div className="list-row" key={`${item.cardName}-${index}`}>
                    <AdminIcon name="gift" />
                    <div>
                      <strong>{item.cardName}</strong>
                      <div className="row-sub">
                        {item.cardCode ?? "No code"} | {item.sourceCampaignTitle ?? "No pack"}
                      </div>
                      <div className="row-sub">
                        {item.sourceOpenCode ? `Open ${item.sourceOpenCode}` : "No open code"}
                        {item.sourceOpenPosition ? ` | Position ${item.sourceOpenPosition}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-2">
                <label className="field">
                  <span>Status</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value as YnotShippingRequest["status"])}>
                    <option value="submitted">Submitted</option>
                    <option value="packing">Packing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tracking provider</span>
                  <input value={trackingProvider} onChange={(event) => setTrackingProvider(event.target.value)} />
                </label>
                <label className="field">
                  <span>Tracking number</span>
                  <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
                </label>
                <label className="field">
                  <span>Admin note</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                <button className="btn btn-primary" type="button" disabled={isPending} onClick={submit}>
                  <AdminIcon name="check" />
                  Update shipping
                </button>
                {message ? <p className="text-mute">{message}</p> : null}
              </div>

              <div className="grid gap-2">
                <p className="section-label">Timeline</p>
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
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the admin shipping page**

Replace `Website/src/app/admin/shipping/page.tsx` with:

```tsx
import { AdminShippingConsole } from "@/features/ynot/admin/AdminShippingConsole";
import { AdminGate } from "@/features/ynot/components";
import { getShipping, getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminFrame,
  AdminIcon,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const [data, shipping] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getShipping(undefined, true),
  ]);
  const active = shipping.filter((r) =>
    r.status === "submitted" || r.status === "packing"
  ).length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/shipping"
        trail={["Admin", "Operations", "Shipping"]}
        eyebrow="Admin shipping"
        title="Shipping fulfilment"
        desc="Review every customer shipment with user, reward, pack source, address, tracking, and status history."
        badges={{ "/admin/shipping": active || undefined }}
        actions={
          <span className="btn btn-primary">
            <AdminIcon name="truck" />
            {active} active
          </span>
        }
      >
        <AdminShippingConsole requests={shipping} />
      </AdminFrame>
    </AdminGate>
  );
}
```

- [ ] **Step 3: Run test and typecheck**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
npm run typecheck
```

Expected: `test:shipping-flow` still FAILS only on User 360 and customer UI/history assertions. `typecheck` must PASS.

- [ ] **Step 4: Commit the admin shipping console**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/admin/AdminShippingConsole.tsx Website/src/app/admin/shipping/page.tsx
git commit -m "Show shipping fulfilment context to admins

Constraint: Fulfilment staff need shipment, user, reward, pack, address, and tracking context on one page.
Rejected: Separate thin action forms per row | admins lose the trace needed to ship safely.
Confidence: medium
Scope-risk: moderate
Directive: Keep admin-only customer and audit context behind AdminGate and server-side data helpers.
Tested: npm run typecheck; npm run test:shipping-flow fails only on remaining User 360 and customer UI assertions
Not-tested: Browser visual QA waits until all UI surfaces exist.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 5: Add Admin User 360

**Files:**
- Create: `Website/src/features/ynot/admin/AdminUser360.tsx`
- Create: `Website/src/app/admin/users/[profileId]/page.tsx`
- Modify: `Website/src/app/admin/users/page.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Create the User 360 component**

Create `Website/src/features/ynot/admin/AdminUser360.tsx` with this content:

```tsx
import Link from "next/link";
import type { YnotAdminUserDetail } from "@/features/ynot/types";
import {
  AdminCard,
  AdminCardHead,
  AdminKPI,
  AdminPill,
  AdminStatusPill,
  fmtCoin,
} from "./primitives";

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return date.toLocaleString();
}

export function AdminUser360({ detail }: { detail: YnotAdminUserDetail }) {
  const shipped = detail.shipping.filter((request) => request.status === "shipped").length;
  const delivered = detail.shipping.filter((request) => request.status === "delivered").length;
  const activeRewards = detail.collection.filter((item) => item.status === "owned").length;

  return (
    <div className="grid gap-4">
      <div className="kpi-grid">
        <AdminKPI label="Wallet" value={fmtCoin(detail.wallet.balanceCoins)} color="var(--a-gold)" />
        <AdminKPI label="Rewards" value={detail.collection.length} color="var(--a-mint)" />
        <AdminKPI label="Owned" value={activeRewards} color="var(--a-sky)" />
        <AdminKPI label="Shipped / delivered" value={`${shipped} / ${delivered}`} color="var(--a-rose)" />
      </div>

      <AdminCard>
        <AdminCardHead label="Profile" title={detail.profile.displayName} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="list-row">
            <div>
              <strong>Email</strong>
              <div className="row-sub">{detail.profile.email ?? "-"}</div>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>LINE</strong>
              <div className="row-sub">{detail.profile.lineDisplayName ?? detail.profile.lineUserId ?? "-"}</div>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>Phone</strong>
              <div className="row-sub">{detail.profile.phone ?? "-"}</div>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>Created</strong>
              <div className="row-sub">{fmtDate(detail.profile.createdAt)}</div>
            </div>
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="Reward history" title={`Rewards · ${detail.collection.length}`} />
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Reward</th>
                <th>Status</th>
                <th>Pack</th>
                <th>Won</th>
              </tr>
            </thead>
            <tbody>
              {detail.collection.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="row-title">{item.cardName}</div>
                    <div className="row-sub">{item.cardCode ?? item.serialNo ?? "-"}</div>
                  </td>
                  <td><AdminStatusPill status={item.status} /></td>
                  <td>{item.sourceCampaignTitle ?? "-"}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{fmtDate(item.acquiredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="Shipping history" title={`Shipping · ${detail.shipping.length}`} />
        <div className="grid gap-3">
          {detail.shipping.length === 0 ? (
            <AdminPill kind="default">No shipping requests</AdminPill>
          ) : (
            detail.shipping.map((request) => (
              <div className="list-row" key={request.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong className="mono">{request.publicCode}</strong>
                    <AdminStatusPill status={request.status} />
                  </div>
                  <div className="row-sub">
                    {(request.items ?? []).map((item) => item.cardName).join(", ") || "No items"}
                  </div>
                  <div className="row-sub">
                    {request.trackingProvider && request.trackingNumber
                      ? `${request.trackingProvider} | ${request.trackingNumber}`
                      : "No tracking yet"}
                  </div>
                </div>
                <Link href="/admin/shipping">Open shipping</Link>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="Pack openings" title={`Opens · ${detail.gachaOpens.length}`} />
        <div className="grid gap-2">
          {detail.gachaOpens.map((open) => (
            <div className="list-row" key={open.id}>
              <div>
                <strong>{open.campaignTitle}</strong>
                <div className="row-sub mono">{open.publicCode} | {fmtDate(open.openedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="Wallet timeline" title={`Ledger · ${detail.walletLedger.length}`} />
        <div className="grid gap-2">
          {detail.walletLedger.map((entry) => (
            <div className="list-row" key={entry.id}>
              <div>
                <strong>{entry.entryType}</strong>
                <div className="row-sub">
                  {fmtCoin(entry.amountCoins)} | {fmtDate(entry.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
```

- [ ] **Step 2: Create the route**

Create `Website/src/app/admin/users/[profileId]/page.tsx` with this content:

```tsx
import { notFound } from "next/navigation";
import { AdminGate } from "@/features/ynot/components";
import { getAdminUserDetail, getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminFrame } from "@/features/ynot/admin";
import { AdminUser360 } from "@/features/ynot/admin/AdminUser360";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const [data, detail] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminUserDetail(profileId),
  ]);
  if (!detail) notFound();

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/users"
        trail={["Admin", "People", "User 360"]}
        eyebrow="Admin User 360"
        title={detail.profile.displayName}
        desc="Profile, wallet, reward, pack-opening, and shipping history for support review."
      >
        <AdminUser360 detail={detail} />
      </AdminFrame>
    </AdminGate>
  );
}
```

- [ ] **Step 3: Link from the user directory**

In `Website/src/app/admin/users/page.tsx`, add `Link`:

```tsx
import Link from "next/link";
```

Change the table headers from:

```tsx
<th>Role action</th>
```

to:

```tsx
<th>Open</th>
<th>Role action</th>
```

Change the empty state `colSpan` from `6` to `7`.

Add this table cell before the role action cell:

```tsx
<td>
  <Link className="btn btn-ghost" href={`/admin/users/${user.id}`}>
    Open User 360
  </Link>
</td>
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
npm run typecheck
```

Expected: `test:shipping-flow` still FAILS only on customer shipping history and shipping confirmation assertions. `typecheck` must PASS.

- [ ] **Step 5: Commit User 360**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/admin/AdminUser360.tsx Website/src/app/admin/users/[profileId]/page.tsx Website/src/app/admin/users/page.tsx
git commit -m "Add admin User 360 history view

Constraint: Support needs one user page for identity, reward, pack, wallet, and shipping history.
Rejected: Directory-only admin users page | it cannot answer fulfilment trace questions.
Confidence: medium
Scope-risk: moderate
Directive: Keep User 360 read-only in this pass except for links to existing admin actions.
Tested: npm run typecheck; npm run test:shipping-flow fails only on remaining customer UI assertions
Not-tested: Browser visual QA waits until customer shipping history is updated.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 6: Improve Customer Shipping Confirmation And History

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/components.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Add complete-address helper in `CollectionConvertPanel`**

Inside `Website/src/features/ynot/client.tsx`, add this function near `formatCollectionGradeLabel`:

```tsx
function isCompleteShippingAddress(address?: YnotAddress) {
  return Boolean(
    address?.recipientName?.trim() &&
      address.phone?.trim() &&
      address.addressLine1?.trim() &&
      address.subdistrict?.trim() &&
      address.district?.trim() &&
      address.province?.trim() &&
      address.postalCode?.trim() &&
      address.country?.trim(),
  );
}
```

- [ ] **Step 2: Track shipping confirmation state**

Inside `CollectionConvertPanel`, add this state next to `showConvertConfirm`:

```tsx
  const [showShippingConfirm, setShowShippingConfirm] = useState(false);
```

Add this memo after `selectedItems`:

```tsx
  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === addressId),
    [addressId, addresses],
  );
```

Update `canShip` to require a complete address:

```tsx
  const canShip =
    !isPending &&
    selectedItems.length > 0 &&
    isCompleteShippingAddress(selectedAddress) &&
    selectedTotalCoins >= SHIPPING_REQUEST_MIN_COINS;
```

- [ ] **Step 3: Make the shipping button open confirmation**

Change the shipping button `onClick` from:

```tsx
onClick={submitShipping}
```

to:

```tsx
onClick={() => setShowShippingConfirm(true)}
```

Replace the foot copy with:

```tsx
        <p className="collection-convert-dock-foot">
          A total of {SHIPPING_REQUEST_MIN_COINS.toLocaleString()} coins or more
          in selected cards is required for shipping request. Complete recipient
          name, phone, and address before submitting.
        </p>
```

- [ ] **Step 4: Close the shipping modal when submitting**

At the top of `submitShipping`, after `setMessage(null);`, add:

```tsx
        setShowShippingConfirm(false);
```

- [ ] **Step 5: Add the shipping confirmation modal**

Add this modal after the existing convert confirmation modal block:

```tsx
      {showShippingConfirm ? (
        <div
          className="collection-convert-modal-backdrop"
          role="presentation"
          onClick={() => setShowShippingConfirm(false)}
        >
          <div
            className="collection-convert-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm shipping"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="collection-convert-modal-head">
              <h3>Confirm shipping request</h3>
              <button
                type="button"
                className="collection-convert-modal-close"
                onClick={() => setShowShippingConfirm(false)}
                aria-label="Close"
              >
                x
              </button>
            </header>
            <div className="collection-convert-modal-body">
              <p>
                This reward will be locked after request. Admin will see the
                exact address below for fulfilment.
              </p>
              <ul>
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    {item.cardName}
                    {item.sourceCampaignTitle ? ` from ${item.sourceCampaignTitle}` : ""}
                  </li>
                ))}
              </ul>
              <p className="collection-convert-modal-warn">
                Ship to: {selectedAddress?.recipientName ?? "-"} |{" "}
                {selectedAddress?.phone ?? "-"} |{" "}
                {selectedAddress?.addressLine1 ?? "-"}{" "}
                {selectedAddress?.subdistrict ?? ""}{" "}
                {selectedAddress?.district ?? ""}{" "}
                {selectedAddress?.province ?? ""}{" "}
                {selectedAddress?.postalCode ?? ""}
              </p>
            </div>
            <footer className="collection-convert-modal-foot">
              <button
                type="button"
                className="collection-convert-modal-button is-ghost"
                onClick={() => setShowShippingConfirm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="collection-convert-modal-button is-primary"
                onClick={submitShipping}
                disabled={isPending}
              >
                Request shipping
              </button>
            </footer>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 6: Improve customer shipping history display**

In `Website/src/features/ynot/components.tsx`, inside `OrderList`, add this helper before the return:

```tsx
  function shippingDetails(order: YnotExchangeOrder | YnotShippingRequest) {
    if (!("trackingProvider" in order)) return null;
    return (
      <div className="mt-3 grid gap-2 text-xs">
        {(order.items ?? []).map((item, index) => (
          <div key={`${order.id}-${index}`}>
            <strong>{item.cardName}</strong>
            {item.sourceCampaignTitle ? (
              <span className="text-mute"> from {item.sourceCampaignTitle}</span>
            ) : null}
            {item.sourceOpenCode ? (
              <div className="txt-mono">Open {item.sourceOpenCode}</div>
            ) : null}
          </div>
        ))}
        {order.trackingProvider && order.trackingNumber ? (
          <div className="txt-mono">
            Tracking {order.trackingProvider} | {order.trackingNumber}
          </div>
        ) : null}
      </div>
    );
  }
```

Then render it inside each `.request-card` after the created date:

```tsx
              {shippingDetails(order)}
```

- [ ] **Step 7: Run tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
npm run test:personal-info
npm run typecheck
```

Expected: all three commands PASS.

- [ ] **Step 8: Commit customer shipping improvements**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/client.tsx Website/src/features/ynot/components.tsx
git commit -m "Clarify customer shipping requests and history

Constraint: Customers must confirm exactly what reward and address will be locked for fulfilment.
Rejected: Submit button without confirmation | address and reward mistakes become admin fulfilment problems.
Confidence: high
Scope-risk: moderate
Directive: Keep public shipping history free of admin-only user and audit context.
Tested: npm run test:shipping-flow; npm run test:personal-info; npm run typecheck
Not-tested: Browser visual QA is handled in final verification.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

## Task 7: Final Platform Verification And Browser Smoke

**Files:**
- Modify only if verification finds a small issue in files changed by Tasks 1-6.
- Test: `Website/scripts/test-shipping-flow.mjs`
- Test: `Website/scripts/test-personal-info-address-sync.mjs`
- Test: `Website/tools/verification/verify-platform-foundation.mjs`

- [ ] **Step 1: Run full targeted verification**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
npm run test:personal-info
npm run verify:platform
npm run typecheck
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 2: Start local dev server**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run dev
```

Expected: Next.js starts on an available localhost port. If `3000` is busy, use the port printed by Next.js.

- [ ] **Step 3: Browser smoke admin shipping**

Open:

```text
http://localhost:3000/api/dev/preview-auth?mode=on&next=/admin/shipping
```

Expected visible checks:

- Page title is `Shipping fulfilment`.
- Queue table has columns for order, user, reward, pack, status, tracking, and created date.
- Selecting a row shows the detail panel.
- Detail panel shows address snapshot, reward, source pack/open code when data exists, action fields, and timeline.
- Shipped rows show tracking provider and tracking number.

- [ ] **Step 4: Browser smoke User 360**

From `/admin/users`, click `Open User 360` on a user row.

Expected visible checks:

- User 360 page loads.
- Profile block shows email/LINE/phone when available.
- Reward history table shows reward, status, pack, and won date.
- Shipping history shows request code, items, status, and tracking if shipped.
- Wallet timeline renders without blocking the page.

- [ ] **Step 5: Browser smoke customer shipping**

Open:

```text
http://localhost:3000/api/dev/preview-auth?mode=on&next=/shipping
```

Expected visible checks:

- Shipping panel still lists owned cards.
- Incomplete addresses do not allow submit.
- Clicking `Shipping Request` opens a confirmation modal when a complete address and selected card value are present.
- Confirmation modal shows reward, source pack when available, recipient, phone, address, and lock warning.
- Shipping history shows reward/source/tracking details when requests exist.

- [ ] **Step 6: Commit final verification fixes if needed**

If Step 1 through Step 5 required code fixes, commit only those fixes:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src Database/supabase/migrations Website/scripts Website/tools
git commit -m "Finish shipping operations verification

Constraint: Final browser and static checks must match the approved shipping operations spec.
Rejected: Leaving visual or typecheck regressions for follow-up | fulfilment is an admin-critical workflow.
Confidence: high
Scope-risk: narrow
Directive: Keep this commit limited to verification fixes from the shipping operations implementation.
Tested: npm run test:shipping-flow; npm run test:personal-info; npm run verify:platform; npm run typecheck; git diff --check; browser smoke for admin shipping, User 360, and customer shipping
Not-tested: Carrier APIs and label printing remain out of scope.
Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

If no fixes were needed, skip this commit.

## Self-Review Checklist

- Spec coverage: The plan covers all approved requirements: admin all-shipping scope, reward/source pack visibility, shipped tracking visibility, complete customer shipping info, address snapshot, User 360, reward history, wallet context, shipping history, server-side guards, customer tracking display, and verification.
- Placeholder scan: The plan contains exact paths, concrete code blocks, exact commands, expected outcomes, and commit messages.
- Type consistency: `YnotShippingRequest`, `YnotShippingItem`, `YnotShippingCustomer`, `YnotShippingAddressSnapshot`, `YnotShippingTimelineEvent`, `YnotAdminUserDetail`, and `YnotWalletLedgerEntry` are introduced before they are consumed.
- Scope control: Carrier integrations, labels, automated delivery sync, refunds, and pack-opening mechanics stay out of scope.
