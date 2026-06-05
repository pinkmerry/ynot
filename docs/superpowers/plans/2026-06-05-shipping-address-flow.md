# Shipping Address Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shipping requests easy: complete Personal Info becomes a saved shipping address automatically, users can choose an existing address or add a new one during the shipping request, and incomplete addresses are blocked before submit.

**Architecture:** Keep profile/contact fields and saved shipping addresses separate. Add a shared address-completeness helper used by both customer shipping UIs, plus a server-side address helper that lazily creates one default `user_addresses` row from complete profile fields only when no saved address exists. Return full address DTOs from address creation so the UI can select newly created addresses without a refresh.

**Tech Stack:** Next.js App Router, React client components, Supabase service client, Node test runner, existing YNOTT data/API helpers.

---

## Current Findings

- `Website/src/app/api/lucky-draw/profile/route.ts` currently uses default shipping address fields as profile form values and updates the first/default address on profile save.
- `Website/src/features/ynot/data.ts:getAddresses()` reads only `user_addresses`, so older users with complete `profiles` address fields but no `user_addresses` row cannot use shipping until they re-save or add a new address.
- `Website/src/features/ynot/cr/HistoryExperience.tsx:ShipModal` lets users choose saved addresses but does not let them add a new address when one already exists.
- `Website/src/features/ynot/cr/HistoryExperience.tsx:ShipModal` enables submit for any address id, while the RPC requires recipient, phone, address line 1, subdistrict, district, province, postal code, and country.
- `Website/src/features/ynot/client.tsx:AddressForm` saves a new address but tells the user to refresh before it becomes selectable in `CollectionConvertPanel`.

## File Structure

- Create `Website/src/features/ynot/address-utils.ts`
  - One shared definition of required shipping address fields.
  - Exports `missingShippingAddressFields(address)` and `isCompleteShippingAddress(address)`.
  - Safe for server and client imports.
- Create `Website/src/features/ynot/server-addresses.ts`
  - Supabase-only helpers for address row selection, profile-to-address creation, and YNOTT address DTO mapping.
  - Exports `ensureDefaultAddressFromProfile(profileId)` and `getProfileAddresses(profileId)`.
- Modify `Website/src/app/api/lucky-draw/profile/route.ts`
  - Stop preferring shipping address fields in `toProfileInfo`.
  - On profile save, create a default shipping address only if the profile is complete and the user has no saved address.
  - On profile read, lazily create the address for older complete profiles with no saved address.
- Modify `Website/src/features/ynot/data.ts`
  - Make `getAddresses(profileId)` call the server helper so dashboard, shipping page, personal-info page, and collection modal see the same backfilled saved address.
- Modify `Website/src/app/api/ynot/addresses/route.ts`
  - Require all RPC-required fields for newly saved addresses.
  - Return the full `YnotAddress` DTO, not only `id`, `label`, and `addressLine1`.
- Modify `Website/src/features/ynot/cr/HistoryExperience.tsx`
  - Keep an address state list inside the collection experience.
  - Use the shared completeness helper.
  - Add an inline “Add new address” mode inside `ShipModal`.
  - Disable incomplete address choices and show missing field names.
- Modify `Website/src/features/ynot/client.tsx`
  - Add subdistrict to `AddressForm`.
  - Let `AddressForm` call `onAddressSaved(address)`.
  - Let `CollectionConvertPanel` update its selected address when `addresses` props change.
  - Add a small `ShippingRequestExperience` wrapper so `/shipping` shares address state between the selector and add form.
- Modify `Website/src/app/(store)/shipping/page.tsx`
  - Render `ShippingRequestExperience` instead of separate disconnected components.
- Modify `Website/scripts/test-personal-info-address-sync.mjs`
  - Lock profile/address separation and lazy profile-to-address backfill.
- Modify `Website/scripts/test-shipping-flow.mjs`
  - Lock inline add-new-address flow, complete-address validation, and new address DTO behavior.

---

### Task 1: Add Shared Address Completeness Utilities

**Files:**
- Create: `Website/src/features/ynot/address-utils.ts`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `Website/scripts/test-shipping-flow.mjs`:

```js
test("shipping address completeness helper matches the shipping RPC required fields", () => {
  const helper = readProject("src/features/ynot/address-utils.ts");

  assert.match(helper, /export const REQUIRED_SHIPPING_ADDRESS_FIELDS/);
  assert.match(helper, /key: "recipientName", label: "recipient name"/);
  assert.match(helper, /key: "phone", label: "phone"/);
  assert.match(helper, /key: "addressLine1", label: "address line 1"/);
  assert.match(helper, /key: "subdistrict", label: "subdistrict"/);
  assert.match(helper, /key: "district", label: "district"/);
  assert.match(helper, /key: "province", label: "province"/);
  assert.match(helper, /key: "postalCode", label: "postal code"/);
  assert.match(helper, /key: "country", label: "country"/);
  assert.match(helper, /export function missingShippingAddressFields/);
  assert.match(helper, /export function isCompleteShippingAddress/);
});

test("customer shipping UIs reuse the shared complete-address helper", () => {
  const history = readProject("src/features/ynot/cr/HistoryExperience.tsx");
  const client = readProject("src/features/ynot/client.tsx");

  assert.match(history, /from "..\/address-utils"/);
  assert.match(history, /isCompleteShippingAddress/);
  assert.match(history, /missingShippingAddressFields/);
  assert.doesNotMatch(history, /function isCompleteShippingAddress\(address/);
  assert.match(client, /from ".\/address-utils"/);
  assert.match(client, /isCompleteShippingAddress/);
  assert.doesNotMatch(client, /function isCompleteShippingAddress\(address/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: FAIL because `src/features/ynot/address-utils.ts` does not exist and both UI files still contain local completeness logic.

- [ ] **Step 3: Create the shared helper**

Create `Website/src/features/ynot/address-utils.ts` with this exact content:

```ts
import type { YnotAddress } from "./types";

export const REQUIRED_SHIPPING_ADDRESS_FIELDS = [
  { key: "recipientName", label: "recipient name" },
  { key: "phone", label: "phone" },
  { key: "addressLine1", label: "address line 1" },
  { key: "subdistrict", label: "subdistrict" },
  { key: "district", label: "district" },
  { key: "province", label: "province" },
  { key: "postalCode", label: "postal code" },
  { key: "country", label: "country" },
] as const satisfies readonly {
  key: keyof Pick<
    YnotAddress,
    | "recipientName"
    | "phone"
    | "addressLine1"
    | "subdistrict"
    | "district"
    | "province"
    | "postalCode"
    | "country"
  >;
  label: string;
}[];

export function missingShippingAddressFields(address?: YnotAddress | null) {
  return REQUIRED_SHIPPING_ADDRESS_FIELDS.filter(({ key }) => {
    const value = address?.[key];
    return typeof value !== "string" || !value.trim();
  }).map(({ label }) => label);
}

export function isCompleteShippingAddress(address?: YnotAddress | null) {
  return missingShippingAddressFields(address).length === 0;
}
```

- [ ] **Step 4: Run test to verify remaining failure is only UI imports**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: FAIL only on the assertions that `HistoryExperience.tsx` and `client.tsx` import and use the shared helper.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/address-utils.ts Website/scripts/test-shipping-flow.mjs
git commit -m "Add shared shipping address validation contract

Constraint: Shipping RPC requires a complete saved user_addresses row.
Rejected: Duplicated client-side completeness checks | They drifted from the RPC and from each other.
Confidence: high
Scope-risk: narrow
Tested: npm run test:shipping-flow failed at the expected UI integration assertions
Not-tested: UI integration pending in later tasks"
```

---

### Task 2: Add Server Address Backfill Helpers

**Files:**
- Create: `Website/src/features/ynot/server-addresses.ts`
- Test: `Website/scripts/test-personal-info-address-sync.mjs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `Website/scripts/test-personal-info-address-sync.mjs`:

```js
test("server address helper lazily creates one default address from complete profile fields only when none exists", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /import "server-only"/);
  assert.match(helper, /export const profileAddressSelect/);
  assert.match(helper, /export const userAddressSelect/);
  assert.match(helper, /function profileRowToAddressInput/);
  assert.match(helper, /isCompleteShippingAddress\(profileAddress\)/);
  assert.match(helper, /export async function ensureDefaultAddressFromProfile/);
  assert.match(helper, /\.from\("profiles"\)[\s\S]*\.select\(profileAddressSelect\)/);
  assert.match(helper, /\.from\("user_addresses"\)[\s\S]*\.select\(userAddressSelect\)/);
  assert.match(helper, /if \(existing\.length > 0\) return existing/);
  assert.match(helper, /\.insert\(\{[\s\S]*label: "Profile default"[\s\S]*is_default: true/);
});

test("server address helper maps saved address rows to full action-token DTOs", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /export async function toYnotAddress/);
  assert.match(helper, /await addressActionToken\(profileId, row\.id\)/);
  assert.match(helper, /recipientName: row\.recipient_name/);
  assert.match(helper, /subdistrict: row\.subdistrict/);
  assert.match(helper, /postalCode: row\.postal_code/);
  assert.match(helper, /deliveryNote: row\.delivery_note/);
  assert.match(helper, /export async function getProfileAddresses/);
  assert.match(helper, /return Promise\.all\(rows\.map\(\(row\) => toYnotAddress\(profileId, row\)\)\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:personal-info
```

Expected: FAIL because `server-addresses.ts` does not exist.

- [ ] **Step 3: Create the server helper**

Create `Website/src/features/ynot/server-addresses.ts` with this exact content:

```ts
import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { addressActionToken } from "@/lib/ynot/address-action-tokens";
import { isCompleteShippingAddress } from "./address-utils";
import type { YnotAddress } from "./types";

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export const profileAddressSelect =
  "full_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note";

export const userAddressSelect =
  "id,label,recipient_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note,is_default";

export type ProfileAddressRow = {
  full_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_note: string | null;
};

export type UserAddressRow = {
  id: string;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_note: string | null;
  is_default: boolean;
};

export function toPublicAddressShape(row: UserAddressRow): Omit<YnotAddress, "id"> {
  return {
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    deliveryNote: row.delivery_note,
    isDefault: row.is_default,
  };
}

export async function toYnotAddress(
  profileId: string,
  row: UserAddressRow,
): Promise<YnotAddress> {
  return {
    id: await addressActionToken(profileId, row.id),
    ...toPublicAddressShape(row),
  };
}

function profileRowToAddressInput(row: ProfileAddressRow): Omit<YnotAddress, "id" | "label" | "isDefault"> {
  return {
    recipientName: row.full_name,
    phone: row.phone,
    addressLine1: row.address_line1 ?? "",
    addressLine2: row.address_line2,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country ?? "Thailand",
    deliveryNote: row.delivery_note,
  };
}

async function readAddressRows(
  supabase: SupabaseClient,
  profileId: string,
): Promise<UserAddressRow[]> {
  const { data, error } = await supabase
    .from("user_addresses")
    .select(userAddressSelect)
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as UserAddressRow[];
}

export async function ensureDefaultAddressFromProfile(
  profileId: string,
  supabase = createServiceSupabaseClient(),
): Promise<UserAddressRow[]> {
  const existing = await readAddressRows(supabase, profileId);
  if (existing.length > 0) return existing;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(profileAddressSelect)
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return existing;

  const profileAddress = profileRowToAddressInput(profile as ProfileAddressRow);
  if (!isCompleteShippingAddress({ id: "profile", label: "Profile default", isDefault: true, ...profileAddress })) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("user_addresses")
    .insert({
      profile_id: profileId,
      label: "Profile default",
      recipient_name: profileAddress.recipientName,
      phone: profileAddress.phone,
      address_line1: profileAddress.addressLine1,
      address_line2: profileAddress.addressLine2,
      subdistrict: profileAddress.subdistrict,
      district: profileAddress.district,
      province: profileAddress.province,
      postal_code: profileAddress.postalCode,
      country: profileAddress.country ?? "Thailand",
      delivery_note: profileAddress.deliveryNote,
      is_default: true,
    })
    .select(userAddressSelect)
    .single();

  if (insertError) throw insertError;
  return inserted ? [inserted as UserAddressRow] : existing;
}

export async function getProfileAddresses(profileId: string): Promise<YnotAddress[]> {
  const rows = await ensureDefaultAddressFromProfile(profileId);
  return Promise.all(rows.map((row) => toYnotAddress(profileId, row)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd Website
npm run test:personal-info
```

Expected: PASS for the new server helper tests plus the existing tests that still pass before route rewiring.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/server-addresses.ts Website/scripts/test-personal-info-address-sync.mjs
git commit -m "Create server helpers for profile address backfill

Constraint: Existing complete profile details must become usable for shipping without a risky production migration.
Rejected: Always overwriting the default shipping address from profile save | It destroys deliberate alternate shipping choices.
Confidence: high
Scope-risk: moderate
Tested: npm run test:personal-info
Not-tested: API routes not rewired yet"
```

---

### Task 3: Rewire Profile and Address APIs

**Files:**
- Modify: `Website/src/app/api/lucky-draw/profile/route.ts`
- Modify: `Website/src/app/api/ynot/addresses/route.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-personal-info-address-sync.mjs`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Write the failing API tests**

Append these tests to `Website/scripts/test-personal-info-address-sync.mjs`:

```js
test("profile API keeps profile fields separate from shipping address fields", () => {
  const route = readProject("src/app/api/lucky-draw/profile/route.ts");

  assert.match(route, /import \{[\s\S]*ensureDefaultAddressFromProfile[\s\S]*toYnotAddress[\s\S]*\} from "@\/features\/ynot\/server-addresses"/);
  assert.match(route, /addressLine1: row\.address_line1 \?\? ""/);
  assert.doesNotMatch(route, /addressLine1: defaultAddress\?\.address_line1 \?\? row\.address_line1/);
  assert.doesNotMatch(route, /const defaultAddress = await syncDefaultAddress/);
  assert.doesNotMatch(route, /async function syncDefaultAddress/);
  assert.match(route, /const addresses = await ensureDefaultAddressFromProfile\(session\.profileId, supabase\)/);
});

test("dashboard address loader uses lazy profile backfill", () => {
  const dataFile = readProject("src/features/ynot/data.ts");

  assert.match(dataFile, /import \{ getProfileAddresses \} from "\.\/server-addresses"/);
  assert.match(dataFile, /return readOrEmpty\("addresses", \(\) => getProfileAddresses\(profileId\)\)/);
  assert.doesNotMatch(dataFile, /\.from\("user_addresses"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("profile_id", profileId\)/);
});
```

Append this test to `Website/scripts/test-shipping-flow.mjs`:

```js
test("address creation API validates and returns a full selectable address DTO", () => {
  const route = readProject("src/app/api/ynot/addresses/route.ts");

  assert.match(route, /import \{[\s\S]*toYnotAddress[\s\S]*\} from "@\/features\/ynot\/server-addresses"/);
  assert.match(route, /const recipientName = clean\(body\?\.recipientName, 120\)/);
  assert.match(route, /const phone = clean\(body\?\.phone, 40\)/);
  assert.match(route, /const subdistrict = clean\(body\?\.subdistrict, 100\)/);
  assert.match(route, /const district = clean\(body\?\.district, 100\)/);
  assert.match(route, /const province = clean\(body\?\.province, 100\)/);
  assert.match(route, /const postalCode = clean\(body\?\.postalCode, 20\)/);
  assert.match(route, /if \(\[recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country\]\.some\(\(value\) => !value\)\)/);
  assert.match(route, /address: await toYnotAddress\(session\.profileId, data\)/);
  assert.doesNotMatch(route, /address: \{\s*id: await addressActionToken/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd Website
npm run test:personal-info
npm run test:shipping-flow
```

Expected: FAIL because APIs and loader have not been rewired.

- [ ] **Step 3: Update `profile/route.ts` imports**

In `Website/src/app/api/lucky-draw/profile/route.ts`, add:

```ts
import {
  ensureDefaultAddressFromProfile,
  toYnotAddress,
  userAddressSelect,
  type ProfileAddressRow,
  type UserAddressRow,
} from "@/features/ynot/server-addresses";
```

Remove the local `addressSelect` constant and the local `AddressRow` type. Keep `profileSelect`.

- [ ] **Step 4: Replace `toProfileInfo`**

Replace `toProfileInfo` in `Website/src/app/api/lucky-draw/profile/route.ts` with:

```ts
function toProfileInfo(row: ProfileRow) {
  return {
    fullName: row.full_name ?? "",
    phone: row.phone ?? "",
    addressLine1: row.address_line1 ?? "",
    addressLine2: row.address_line2 ?? "",
    subdistrict: row.subdistrict ?? "",
    district: row.district ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "Thailand",
    deliveryNote: row.delivery_note ?? "",
  } satisfies ProfileInfo;
}
```

- [ ] **Step 5: Replace `getDefaultAddress` and remove `syncDefaultAddress`**

Remove the entire local `syncDefaultAddress` function. Replace `getDefaultAddress` with:

```ts
async function getDefaultAddress(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("user_addresses")
    .select(userAddressSelect)
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as UserAddressRow | null;
}
```

- [ ] **Step 6: Rewire profile GET**

In `readProfile()`, replace:

```ts
const defaultAddress = await getDefaultAddress(supabase, session.profileId);

return jsonNoStore({
  displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
  profile: toProfileInfo(data, defaultAddress),
  defaultAddress: defaultAddress ? toAddressPayload(defaultAddress) : null,
});
```

with:

```ts
const addresses = await ensureDefaultAddressFromProfile(session.profileId, supabase);
const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0] ?? null;

return jsonNoStore({
  displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
  profile: toProfileInfo(data as ProfileAddressRow & ProfileRow),
  defaultAddress: defaultAddress
    ? await toYnotAddress(session.profileId, defaultAddress)
    : null,
});
```

- [ ] **Step 7: Rewire profile PATCH**

In `PATCH`, replace:

```ts
const defaultAddress = await syncDefaultAddress(
  supabase,
  session.profileId,
  patch,
);

return jsonNoStore({
  displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
  profile: toProfileInfo(data, defaultAddress),
  defaultAddress: defaultAddress ? toAddressPayload(defaultAddress) : null,
});
```

with:

```ts
const addresses = await ensureDefaultAddressFromProfile(session.profileId, supabase);
const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0] ?? null;

return jsonNoStore({
  displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
  profile: toProfileInfo(data as ProfileAddressRow & ProfileRow),
  defaultAddress: defaultAddress
    ? await toYnotAddress(session.profileId, defaultAddress)
    : null,
});
```

- [ ] **Step 8: Rewire `getAddresses`**

In `Website/src/features/ynot/data.ts`, add this import near other local imports:

```ts
import { getProfileAddresses } from "./server-addresses";
```

Replace the body of `getAddresses(profileId?: string)` with:

```ts
export async function getAddresses(profileId?: string): Promise<YnotAddress[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  return readOrEmpty("addresses", () => getProfileAddresses(profileId));
}
```

- [ ] **Step 9: Rewire address POST validation and response**

In `Website/src/app/api/ynot/addresses/route.ts`, replace imports:

```ts
import { getAddresses } from "@/features/ynot/data";
import { addressActionToken } from "@/lib/ynot/address-action-tokens";
```

with:

```ts
import { getAddresses } from "@/features/ynot/data";
import { toYnotAddress, type UserAddressRow } from "@/features/ynot/server-addresses";
```

Inside `POST`, replace the field setup and validation block:

```ts
const addressLine1 = clean(body?.addressLine1, 180);
if (!addressLine1) return Response.json({ error: "Address line 1 is required." }, { status: 400 });
```

with:

```ts
const recipientName = clean(body?.recipientName, 120);
const phone = clean(body?.phone, 40);
const addressLine1 = clean(body?.addressLine1, 180);
const addressLine2 = clean(body?.addressLine2, 180);
const subdistrict = clean(body?.subdistrict, 100);
const district = clean(body?.district, 100);
const province = clean(body?.province, 100);
const postalCode = clean(body?.postalCode, 20);
const country = clean(body?.country, 80) ?? "Thailand";
const deliveryNote = clean(body?.deliveryNote, 240);
if ([recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country].some((value) => !value)) {
  return Response.json(
    { error: "Complete recipient name, phone, and full shipping address before saving." },
    { status: 400 },
  );
}
```

Replace insert fields:

```ts
recipient_name: clean(body?.recipientName, 120),
phone: clean(body?.phone, 40),
address_line1: addressLine1,
address_line2: clean(body?.addressLine2, 180),
subdistrict: clean(body?.subdistrict, 100),
district: clean(body?.district, 100),
province: clean(body?.province, 100),
postal_code: clean(body?.postalCode, 20),
country: clean(body?.country, 80) ?? "Thailand",
delivery_note: clean(body?.deliveryNote, 240),
```

with:

```ts
recipient_name: recipientName,
phone,
address_line1: addressLine1,
address_line2: addressLine2,
subdistrict,
district,
province,
postal_code: postalCode,
country,
delivery_note: deliveryNote,
```

Replace the response body:

```ts
{
  address: {
    id: await addressActionToken(session.profileId, data.id),
    label: data.label,
    addressLine1: data.address_line1,
  },
}
```

with:

```ts
{
  address: await toYnotAddress(session.profileId, data as UserAddressRow),
}
```

- [ ] **Step 10: Run API tests**

Run:

```bash
cd Website
npm run test:personal-info
npm run test:shipping-flow
```

Expected: PASS for API/loader tests, with UI tests from Task 1 still failing until Task 4 rewires the components.

- [ ] **Step 11: Commit**

```bash
git add Website/src/app/api/lucky-draw/profile/route.ts Website/src/app/api/ynot/addresses/route.ts Website/src/features/ynot/data.ts Website/scripts/test-personal-info-address-sync.mjs Website/scripts/test-shipping-flow.mjs
git commit -m "Separate profile details from saved shipping addresses

Constraint: Users who already filled Personal Info need a saved address without overwriting custom addresses.
Rejected: Keeping profile PATCH as the source of truth for every default address | It conflates personal contact fields with fulfilment destinations.
Confidence: high
Scope-risk: moderate
Tested: npm run test:personal-info && npm run test:shipping-flow
Not-tested: Browser flow pending"
```

---

### Task 4: Make the Collection Ship Modal Easy

**Files:**
- Modify: `Website/src/features/ynot/cr/HistoryExperience.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Write the failing UI tests**

Append these tests to `Website/scripts/test-shipping-flow.mjs`:

```js
test("collection ship modal lets users choose existing address or add a new one inline", () => {
  const history = readProject("src/features/ynot/cr/HistoryExperience.tsx");

  assert.match(history, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(history, /function handleAddressSaved\(address: YnotAddress\)/);
  assert.match(history, /<ShipModal[\s\S]*addresses=\{addressRows\}[\s\S]*onAddressSaved=\{handleAddressSaved\}/);
  assert.match(history, /const \[addingAddress, setAddingAddress\] = useState\(false\)/);
  assert.match(history, /Add a new address/);
  assert.match(history, /saveAddress\(\)/);
  assert.match(history, /onAddressSaved\(address\)/);
  assert.match(history, /setAddressId\(address\.id\)/);
});

test("collection ship modal disables incomplete saved addresses before submit", () => {
  const history = readProject("src/features/ynot/cr/HistoryExperience.tsx");

  assert.match(history, /const missingFields = missingShippingAddressFields\(a\)/);
  assert.match(history, /const complete = missingFields\.length === 0/);
  assert.match(history, /disabled=\{!complete \|\| submitting\}/);
  assert.match(history, /Missing \{missingFields\.join\(", "\)\}/);
  assert.match(history, /const selectedAddress = addresses\.find\(\(address\) => address\.id === addressId\)/);
  assert.match(history, /disabled=\{submitting \|\| !isCompleteShippingAddress\(selectedAddress\)\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: FAIL because the collection modal does not yet own address state, add inline addresses, or disable incomplete addresses.

- [ ] **Step 3: Import shared helper in `HistoryExperience.tsx`**

In `Website/src/features/ynot/cr/HistoryExperience.tsx`, add:

```ts
import {
  isCompleteShippingAddress,
  missingShippingAddressFields,
} from "../address-utils";
```

- [ ] **Step 4: Add address state to `HistoryExperience`**

Inside `HistoryExperience`, after `const [selected, setSelected] = useState<Set<string>>(new Set());`, add:

```ts
const [addressRows, setAddressRows] = useState(addresses);
```

Add this function before `submitShip`:

```ts
function handleAddressSaved(address: YnotAddress) {
  setAddressRows((current) => {
    const withoutCurrent = current
      .filter((row) => row.id !== address.id)
      .map((row) => (address.isDefault ? { ...row, isDefault: false } : row));
    return address.isDefault
      ? [address, ...withoutCurrent]
      : [...withoutCurrent, address];
  });
}
```

Change the `ShipModal` call from:

```tsx
<ShipModal
  open={shipOpen}
  addresses={addresses}
  cards={selectedCards}
  submitting={submitting}
  onClose={() => setShipOpen(false)}
  onConfirm={submitShip}
/>
```

to:

```tsx
<ShipModal
  open={shipOpen}
  addresses={addressRows}
  cards={selectedCards}
  submitting={submitting}
  onAddressSaved={handleAddressSaved}
  onClose={() => setShipOpen(false)}
  onConfirm={submitShip}
/>
```

- [ ] **Step 5: Expand `ShipModal` props**

Change the `ShipModal` signature to include `onAddressSaved`:

```ts
function ShipModal({
  open,
  addresses,
  cards,
  submitting,
  onAddressSaved,
  onClose,
  onConfirm,
}: {
  open: boolean;
  addresses: YnotAddress[];
  cards: EnrichedItem[];
  submitting: boolean;
  onAddressSaved: (address: YnotAddress) => void;
  onClose: () => void;
  onConfirm: (addressId: string) => void;
}) {
```

Inside `ShipModal`, after `addressId`, add:

```ts
const [addingAddress, setAddingAddress] = useState(false);
const [newAddress, setNewAddress] = useState({
  label: "Home",
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: "Thailand",
  deliveryNote: "",
  isDefault: addresses.length === 0,
});
const [addressMessage, setAddressMessage] = useState("");
const selectedAddress = addresses.find((address) => address.id === addressId);

function updateAddressField(key: keyof typeof newAddress, value: string | boolean) {
  setNewAddress((current) => ({ ...current, [key]: value }));
}

async function saveAddress() {
  setAddressMessage("");
  const response = await fetch("/api/ynot/addresses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...newAddress,
      isDefault: addresses.length === 0 ? true : newAddress.isDefault,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Could not save address.",
    );
  }
  const address =
    isRecord(payload) && isRecord(payload.address)
      ? (payload.address as YnotAddress)
      : null;
  if (!address) throw new Error("Address could not be saved.");
  onAddressSaved(address);
  setAddressId(address.id);
  setAddingAddress(false);
  setNewAddress({
    label: "Home",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
    country: "Thailand",
    deliveryNote: "",
    isDefault: false,
  });
  setAddressMessage("Address saved and selected.");
}
```

- [ ] **Step 6: Disable confirm unless selected address is complete**

In `ShipModal` footer, replace:

```tsx
disabled={submitting || !addressId}
```

with:

```tsx
disabled={submitting || !isCompleteShippingAddress(selectedAddress)}
```

- [ ] **Step 7: Replace the address choice body**

Replace the `addresses.length === 0 ? ... : ...` block in `ShipModal` with:

```tsx
<div className="cr-stack" style={{ gap: 10 }}>
  <div className="cr-row" style={{ gap: 10, alignItems: "center" }}>
    <span className="cr-eyebrow">Ship to</span>
    <span style={{ flex: 1 }} />
    <button
      type="button"
      className="cr-btn cr-btn-primary cr-btn-sm"
      onClick={() => setAddingAddress((current) => !current)}
      disabled={submitting}
    >
      <Ico name="plus" size={12} /> Add a new address
    </button>
  </div>

  {addresses.length === 0 ? (
    <div
      style={{
        padding: 20,
        textAlign: "center",
        border: "1px dashed var(--cr-line-strong)",
        borderRadius: "var(--cr-r-md)",
        background: "var(--cr-paper-2)",
      }}
    >
      <strong style={{ display: "block", marginBottom: 6 }}>
        No shipping address saved
      </strong>
      <small className="cr-mute">
        Add one here and it will be selected for this request.
      </small>
    </div>
  ) : (
    addresses.map((a) => {
      const missingFields = missingShippingAddressFields(a);
      const complete = missingFields.length === 0;
      return (
        <label
          key={a.id}
          className={`cr-addr-card ${addressId === a.id ? "default" : ""}`}
          style={{
            cursor: complete ? "pointer" : "not-allowed",
            opacity: complete ? 1 : 0.62,
          }}
        >
          <input
            type="radio"
            name="ship-addr"
            checked={addressId === a.id}
            disabled={!complete || submitting}
            onChange={() => setAddressId(a.id)}
            style={{ marginTop: 4 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{a.label}</h4>
            {a.recipientName && (
              <div className="lines">
                <strong style={{ color: "var(--cr-ink)" }}>
                  {a.recipientName}
                </strong>
                {a.phone ? ` · ${a.phone}` : ""}
              </div>
            )}
            <div className="lines">{a.addressLine1}</div>
            {a.addressLine2 && <div className="lines">{a.addressLine2}</div>}
            <div className="lines">
              {[a.subdistrict, a.district, a.province, a.postalCode]
                .filter(Boolean)
                .join(" ")}
            </div>
            {!complete && (
              <small className="cr-mute">
                Missing {missingFields.join(", ")}
              </small>
            )}
            {a.deliveryNote && <small className="cr-mute">{a.deliveryNote}</small>}
          </div>
          {a.isDefault && <span className="cr-pill cr-pill-ink">Default</span>}
        </label>
      );
    })
  )}

  {addingAddress && (
    <div className="cr-section" style={{ padding: 14 }}>
      <div className="cr-grid-2">
        <label className="cr-field">
          <span>Label</span>
          <input value={newAddress.label} onChange={(e) => updateAddressField("label", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Recipient name</span>
          <input value={newAddress.recipientName} onChange={(e) => updateAddressField("recipientName", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Phone</span>
          <input value={newAddress.phone} onChange={(e) => updateAddressField("phone", e.target.value)} />
        </label>
        <label className="cr-field cr-field-full">
          <span>Address line 1</span>
          <input value={newAddress.addressLine1} onChange={(e) => updateAddressField("addressLine1", e.target.value)} />
        </label>
        <label className="cr-field cr-field-full">
          <span>Address line 2</span>
          <input value={newAddress.addressLine2} onChange={(e) => updateAddressField("addressLine2", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Subdistrict</span>
          <input value={newAddress.subdistrict} onChange={(e) => updateAddressField("subdistrict", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>District</span>
          <input value={newAddress.district} onChange={(e) => updateAddressField("district", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Province</span>
          <input value={newAddress.province} onChange={(e) => updateAddressField("province", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Postal code</span>
          <input value={newAddress.postalCode} onChange={(e) => updateAddressField("postalCode", e.target.value)} />
        </label>
        <label className="cr-field">
          <span>Country</span>
          <input value={newAddress.country} onChange={(e) => updateAddressField("country", e.target.value)} />
        </label>
      </div>
      <label className="cr-row" style={{ gap: 8, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={newAddress.isDefault}
          disabled={addresses.length === 0}
          onChange={(e) => updateAddressField("isDefault", e.target.checked)}
        />
        <span className="cr-mute">Make this my default shipping address</span>
      </label>
      <div className="cr-row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button
          type="button"
          className="cr-btn cr-btn-primary cr-btn-sm"
          disabled={submitting}
          onClick={() => {
            void saveAddress().catch((error) => {
              setAddressMessage(error instanceof Error ? error.message : "Could not save address.");
            });
          }}
        >
          Save and use this address
        </button>
      </div>
    </div>
  )}

  {addressMessage && <small className="cr-mute">{addressMessage}</small>}
</div>
```

- [ ] **Step 8: Run tests**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: PASS for collection ship modal tests.

- [ ] **Step 9: Commit**

```bash
git add Website/src/features/ynot/cr/HistoryExperience.tsx Website/scripts/test-shipping-flow.mjs
git commit -m "Let collection shipping add and validate addresses inline

Constraint: Shipping request must be easy from the request point, not a detour to another page.
Rejected: Linking to Personal Info only | It breaks the shipping flow when the user wants a one-time alternate address.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:shipping-flow
Not-tested: Browser modal interaction pending"
```

---

### Task 5: Make `/shipping` Address Add and Select Reactive

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/(store)/shipping/page.tsx`
- Test: `Website/scripts/test-shipping-flow.mjs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `Website/scripts/test-shipping-flow.mjs`:

```js
test("legacy shipping page shares newly saved addresses between form and request panel", () => {
  const client = readProject("src/features/ynot/client.tsx");
  const shippingPage = readProject("src/app/(store)/shipping/page.tsx");

  assert.match(client, /export function ShippingRequestExperience/);
  assert.match(client, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(client, /function handleAddressSaved\(address: YnotAddress\)/);
  assert.match(client, /<CollectionConvertPanel collection=\{collection\} addresses=\{addressRows\}/);
  assert.match(client, /<AddressForm addresses=\{addressRows\} onAddressSaved=\{handleAddressSaved\}/);
  assert.match(shippingPage, /import \{ ShippingRequestExperience \} from "@\/features\/ynot\/client"/);
  assert.match(shippingPage, /<ShippingRequestExperience[\s\S]*collection=\{data\.collection\}[\s\S]*addresses=\{data\.addresses\}/);
  assert.doesNotMatch(shippingPage, /<CollectionConvertPanel collection=\{data\.collection\} addresses=\{data\.addresses\} \/>/);
});

test("address form captures every required shipping field and returns saved address to parent state", () => {
  const client = readProject("src/features/ynot/client.tsx");

  assert.match(client, /export function AddressForm\(\{ addresses, onAddressSaved \}/);
  assert.match(client, /const \[subdistrict, setSubdistrict\] = useState\(""\)/);
  assert.match(client, /subdistrict,/);
  assert.match(client, /const address = payload\?\.address as YnotAddress \| undefined/);
  assert.match(client, /onAddressSaved\?\.\(address\)/);
  assert.match(client, /setMessage\("Address saved and ready to use\."\)/);
  assert.doesNotMatch(client, /Refresh to see it in your saved addresses/);
});

test("collection convert panel tracks address prop changes after an address is saved", () => {
  const client = readProject("src/features/ynot/client.tsx");

  assert.match(client, /useEffect\(\(\) => \{[\s\S]*if \(addresses\.some\(\(address\) => address\.id === addressId\)\) return;[\s\S]*setAddressId\(addresses\[0\]\?\.id \?\? ""\);[\s\S]*\}, \[addresses, addressId\]\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: FAIL because `/shipping` components are disconnected.

- [ ] **Step 3: Import `useEffect` and shared helper in `client.tsx`**

At the top of `Website/src/features/ynot/client.tsx`, ensure React import includes `useEffect`.

Add:

```ts
import { isCompleteShippingAddress } from "./address-utils";
```

Remove the local `function isCompleteShippingAddress(address?: YnotAddress)` inside `CollectionConvertPanel`.

- [ ] **Step 4: Change `AddressForm` props and state**

Change the function signature from:

```ts
export function AddressForm({ addresses }: { addresses: YnotAddress[] }) {
```

to:

```ts
export function AddressForm({
  addresses,
  onAddressSaved,
}: {
  addresses: YnotAddress[];
  onAddressSaved?: (address: YnotAddress) => void;
}) {
```

Add state:

```ts
const [label, setLabel] = useState("Home");
const [subdistrict, setSubdistrict] = useState("");
const [country, setCountry] = useState("Thailand");
```

In `postJson("/api/ynot/addresses", ...)`, include:

```ts
label,
recipientName,
phone,
addressLine1,
subdistrict,
district,
province,
postalCode,
country,
isDefault: !addresses.length,
```

Replace:

```ts
await postJson("/api/ynot/addresses", {
```

with:

```ts
const payload = await postJson("/api/ynot/addresses", {
```

After the post, replace the refresh message with:

```ts
const address = payload?.address as YnotAddress | undefined;
if (address) onAddressSaved?.(address);
setLabel("Home");
setRecipientName("");
setPhone("");
setAddressLine1("");
setSubdistrict("");
setDistrict("");
setProvince("");
setPostalCode("");
setCountry("Thailand");
setMessage("Address saved and ready to use.");
```

- [ ] **Step 5: Add the missing inputs to `AddressForm`**

Add label input before recipient name:

```tsx
<input
  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
  placeholder="Label"
  value={label}
  onChange={(event) => setLabel(event.target.value)}
/>
```

Add subdistrict input before district:

```tsx
<input
  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
  placeholder="Subdistrict"
  value={subdistrict}
  onChange={(event) => setSubdistrict(event.target.value)}
/>
```

Add country input after postal code:

```tsx
<input
  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
  placeholder="Country"
  value={country}
  onChange={(event) => setCountry(event.target.value)}
/>
```

- [ ] **Step 6: Keep `CollectionConvertPanel` selected address synced**

Inside `CollectionConvertPanel`, after state declarations, add:

```ts
useEffect(() => {
  if (addresses.some((address) => address.id === addressId)) return;
  setAddressId(addresses[0]?.id ?? "");
}, [addresses, addressId]);
```

- [ ] **Step 7: Add `ShippingRequestExperience` wrapper**

In `Website/src/features/ynot/client.tsx`, add this component near `AddressForm`:

```tsx
export function ShippingRequestExperience({
  collection,
  addresses,
}: {
  collection: YnotCollectionItem[];
  addresses: YnotAddress[];
}) {
  const [addressRows, setAddressRows] = useState(addresses);

  function handleAddressSaved(address: YnotAddress) {
    setAddressRows((current) => {
      const withoutCurrent = current
        .filter((row) => row.id !== address.id)
        .map((row) => (address.isDefault ? { ...row, isDefault: false } : row));
      return address.isDefault
        ? [address, ...withoutCurrent]
        : [...withoutCurrent, address];
    });
  }

  return (
    <>
      <CollectionConvertPanel collection={collection} addresses={addressRows} />
      <AddressForm addresses={addressRows} onAddressSaved={handleAddressSaved} />
    </>
  );
}
```

- [ ] **Step 8: Rewire `/shipping/page.tsx`**

In `Website/src/app/(store)/shipping/page.tsx`, replace:

```ts
import { AddressForm, CollectionConvertPanel } from "@/features/ynot/client";
```

with:

```ts
import { ShippingRequestExperience } from "@/features/ynot/client";
```

Replace:

```tsx
<CollectionConvertPanel collection={data.collection} addresses={data.addresses} />
<AddressForm addresses={data.addresses} />
```

with:

```tsx
<ShippingRequestExperience
  collection={data.collection}
  addresses={data.addresses}
/>
```

- [ ] **Step 9: Run tests**

Run:

```bash
cd Website
npm run test:shipping-flow
```

Expected: PASS for `/shipping` reactive address tests.

- [ ] **Step 10: Commit**

```bash
git add Website/src/features/ynot/client.tsx Website/src/app/\(store\)/shipping/page.tsx Website/scripts/test-shipping-flow.mjs
git commit -m "Make shipping page addresses update without refresh

Constraint: Users must be able to add and immediately choose a new shipping address during the request flow.
Rejected: Save then ask the user to refresh | It is unnecessary friction and leaves the request button disabled.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:shipping-flow
Not-tested: Browser flow pending"
```

---

### Task 6: Full Verification and Production Readiness

**Files:**
- No code files unless verification reveals a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd Website
npm run test:personal-info
npm run test:shipping-flow
```

Expected:

```text
test:personal-info: pass
test:shipping-flow: pass
```

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
cd Website
npm run typecheck
npm run lint
```

Expected:

```text
typecheck: exits 0
lint: exits 0
```

- [ ] **Step 3: Run production DB readiness verifier**

Run:

```bash
cd Website
npm run verify:production-db
```

Expected:

```text
Production Supabase readiness checks passed
```

This plan does not require a Supabase migration because the backfill is lazy and code-driven. If the verifier reports pending migrations from unrelated upstream work, stop and run the normal guarded migration ledger check before deployment.

- [ ] **Step 4: Run a local browser smoke test**

Run the dev server:

```bash
cd Website
npm run dev
```

Expected: local server starts on `http://localhost:3000` or the next available port.

Manual smoke flow:

```text
1. Log in as a normal customer account.
2. Open /profile/personal-info.
3. Fill full name, phone, address line 1, subdistrict, district, province, postal code, and country.
4. Save personal info.
5. Open /profile or /shipping.
6. Confirm the profile-derived address appears as "Profile default".
7. Select a card for shipping.
8. Confirm an existing complete address can be selected.
9. Click "Add a new address".
10. Fill all required fields and save.
11. Confirm the new address becomes selected immediately.
12. Confirm incomplete saved addresses show missing field names and cannot be selected for submit.
```

- [ ] **Step 5: Run final status and diff checks**

Run:

```bash
git status --short --branch
git diff --check
git diff --stat
```

Expected:

```text
git status shows only the files from this plan
git diff --check exits 0
diff stat includes only shipping/profile/address/test files
```

- [ ] **Step 6: Final commit or amend**

If all tasks were committed individually, run:

```bash
git log --oneline --decorate -6
```

Expected: the four implementation commits plus any verification-fix commit are visible on top of `main`.

If the implementation was done in one pass and not committed per task, commit all planned files:

```bash
git add Website/src/features/ynot/address-utils.ts Website/src/features/ynot/server-addresses.ts Website/src/app/api/lucky-draw/profile/route.ts Website/src/app/api/ynot/addresses/route.ts Website/src/features/ynot/data.ts Website/src/features/ynot/cr/HistoryExperience.tsx Website/src/features/ynot/client.tsx Website/src/app/\(store\)/shipping/page.tsx Website/scripts/test-personal-info-address-sync.mjs Website/scripts/test-shipping-flow.mjs
git commit -m "Simplify customer shipping address flow

Constraint: Existing complete profile details must become usable shipping addresses without overwriting custom saved addresses.
Rejected: Separate profile detour for every new address | The request flow should let customers finish shipping in one place.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:personal-info; npm run test:shipping-flow; npm run typecheck; npm run lint; npm run verify:production-db; git diff --check
Not-tested: Production customer account smoke until deploy"
```

---

## Self-Review

**Spec coverage:** Covered existing profile fields auto-adding to shipping address, selecting existing address during request, adding a new address during request, keeping the UX easy, preventing incomplete-address RPC failures, and regression verification.

**Placeholder scan:** No unresolved placeholder marker, open-ended edge-case instruction, or unspecified test step remains. Every task has exact files, commands, and expected results.

**Type consistency:** `YnotAddress` fields match `Website/src/features/ynot/types.ts`. Required field names match the `request_shipping_for_items` RPC validation: recipient name, phone, address line 1, subdistrict, district, province, postal code, and country.
