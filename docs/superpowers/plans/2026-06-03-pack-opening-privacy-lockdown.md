# Pack Opening Privacy Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent customer/browser surfaces from receiving or describing pack-opening house logic, raw database identifiers, prize-unit internals, or other internal data related to opening packs.

**Architecture:** Keep house logic on the server and expose only public display DTOs to React/client code. Customer opens should use public campaign slugs, the server should resolve those slugs to internal UUIDs, and customer collection actions should use opaque action tokens that resolve server-side to real collection item IDs. Admin/private paths may keep full internal fields behind real admin gates.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Supabase service-role server reads/RPCs, Node test runner (`node --test`), Web Crypto HMAC.

---

## Scope Check

This is one subsystem: the customer pack-opening privacy boundary. It includes pack detail pages, the open API, reveal payloads, all-pulls history, collection conversion/shipping action IDs, and privacy regression tests. Admin campaign/prize screens are intentionally out of scope except where they share data helpers.

## File Structure

- Modify `Website/scripts/test-pack-open-privacy.mjs`: extend static privacy tests so they fail before implementation and guard against regression.
- Modify `Website/src/features/ynot/data.ts`: keep customer campaign data sanitized, remove dev-auth private detail from customer reads, return public history IDs, and return opaque collection action tokens instead of raw collection item IDs.
- Modify `Website/src/app/api/ynot/gacha/open/route.ts`: accept a public campaign slug/key from the browser, resolve to the internal campaign UUID on the server, and keep the public open result shape.
- Modify `Website/src/features/ynot/client.tsx`: send campaign slug for pack opens and stop displaying raw/opaque action IDs as card fallback labels.
- Modify `Website/src/features/ynot/cr/PackDetailExperience.tsx`: remove public copy that explains stock-sensitive odds behavior.
- Modify `Website/src/features/ynot/components.tsx`: remove legacy public copy that explains pack setup/remaining inventory behavior.
- Create `Website/src/lib/ynot/collection-action-token.ts`: deterministic opaque token helper for customer collection actions.
- Modify `Website/src/lib/ynot/card-conversion-api.ts`: accept collection action tokens and resolve them server-side before calling conversion RPC.
- Modify `Website/src/app/api/ynot/shipping/route.ts`: accept collection action tokens and resolve them server-side before calling shipping RPC.
- Modify `Website/src/features/ynot/types.ts`: document public IDs on customer history/collection types and remove raw `campaignId` from open history.

## Privacy Rules To Preserve

- Browser/customer code must not receive `logicMode`, `logic_snapshot`, odds weights, sold-unlock thresholds, sold percentage, prize-unit IDs, prize-unit status, stock target SKUs/labels, card-stock-unit IDs, readiness blockers, admin approval internals, raw `gacha_opens.id`, raw `gacha_open_items.id`, raw `draw_round_prizes.id`, or raw `collection_items.id`.
- Browser/customer code may receive public display data: campaign slug/title/price, remaining public stock count, card name/image/public tier label, public open code, public shipping/top-up code, and opaque action tokens.
- Public copy must not explain that lower stock can improve odds, that tier availability is calculated from remaining inventory, or that pack setup drives drop behavior.
- Internal UUIDs are allowed inside server-only code and Supabase RPC calls.

---

### Task 1: Add Failing Privacy Regression Tests

**Files:**
- Modify: `Website/scripts/test-pack-open-privacy.mjs`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Add source reads for customer/client files**

Insert this block after the existing `openRouteSource` constant:

```js
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const crPackDetailSource = readFileSync(
  new URL("../src/features/ynot/cr/PackDetailExperience.tsx", import.meta.url),
  "utf8",
);
const componentsSource = readFileSync(
  new URL("../src/features/ynot/components.tsx", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);
const conversionApiSource = readFileSync(
  new URL("../src/lib/ynot/card-conversion-api.ts", import.meta.url),
  "utf8",
);
const shippingRouteSource = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
```

- [ ] **Step 2: Add tests that capture every current finding**

Append these tests after the existing `"pack-open reveal result does not expose raw internal open ids"` test:

```js
test("customer pack pages do not describe stock-sensitive house logic", () => {
  assert.doesNotMatch(crPackDetailSource, /Drop odds shift with stock/i);
  assert.doesNotMatch(crPackDetailSource, /better odds for chase tiers/i);
  assert.doesNotMatch(crPackDetailSource, /Tier availability is calculated from remaining inventory/i);
  assert.doesNotMatch(componentsSource, /Drop behavior and tier availability are calculated/i);
  assert.doesNotMatch(componentsSource, /pack setup and remaining inventory/i);
});

test("customer campaign detail does not use dev auth as a private data gate", () => {
  const getCampaignBlock = between(
    dataSource,
    "export async function getCampaign",
    "async function getPaymentMethodsImpl",
  );
  assert.doesNotMatch(getCampaignBlock, /const includePrivateDetail = viewer\.isAdmin \|\| isDevAuthAllowed\(\)/);
  assert.match(getCampaignBlock, /const includePrivateDetail = viewer\.isAdmin/);
});

test("pack-open browser payload uses public campaign slug and server resolves it internally", () => {
  const openPanelBlock = between(
    clientSource,
    "export function GachaOpenPanel",
    "const revealOverlay = revealResult ?",
  );
  assert.match(openPanelBlock, /campaignId:\s*campaign\.slug/);
  assert.doesNotMatch(openPanelBlock, /campaignId:\s*campaign\.id/);

  assert.match(openRouteSource, /async function resolveOpenCampaignId/);
  assert.doesNotMatch(openRouteSource, /if \(!campaignId \|\| !isUuid\(campaignId\)\)/);
  assert.match(openRouteSource, /p_draw_round_id:\s*resolvedCampaignId/);
});

test("customer pull history does not expose raw open, reward, or campaign ids", () => {
  const historyMapper = between(
    dataSource,
    "export async function getGachaOpenHistory",
    "export async function getExchanges",
  );
  assert.doesNotMatch(historyMapper, /id:\s*open\.id/);
  assert.doesNotMatch(historyMapper, /campaignId:\s*open\.draw_round_id/);
  assert.doesNotMatch(historyMapper, /id:\s*item\.id/);
  assert.match(historyMapper, /id:\s*publicCode/);
  assert.match(historyMapper, /id:\s*`\$\{publicCode\}-\$\{item\.result_position \?\? index \+ 1\}`/);

  const openHistoryType = between(
    typesSource,
    "export type YnotGachaOpenHistory",
    "export type YnotGachaOpenItem",
  );
  assert.doesNotMatch(openHistoryType, /campaignId:/);
});

test("customer collection actions use opaque tokens instead of raw collection item UUIDs", () => {
  assert.match(dataSource, /collectionItemActionToken/);
  const collectionMapper = between(
    dataSource,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
  );
  assert.doesNotMatch(collectionMapper, /id:\s*item\.id/);
  assert.match(collectionMapper, /id:\s*await collectionItemActionToken\(profileId,\s*item\.id\)/);

  assert.match(conversionApiSource, /resolveCollectionItemActionTokens/);
  assert.doesNotMatch(conversionApiSource, /ids\.some\(\(item\) => !UUID_RE\.test\(item\)\)/);
  assert.match(shippingRouteSource, /resolveCollectionItemActionTokens/);
  assert.doesNotMatch(shippingRouteSource, /ids\.some\(\(item\) => !UUID_RE\.test\(item\)\)/);
  assert.doesNotMatch(clientSource, /item\.id\.slice\(0,\s*8\)/);
});
```

- [ ] **Step 3: Run the privacy test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: FAIL. At least one failure should mention each missing fix: public odds copy, dev-auth private gate, slug-based open payload, safe open-history IDs, and collection action token use.

- [ ] **Step 4: Commit the failing tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-pack-open-privacy.mjs
git commit -m "Lock customer pack privacy expectations

Constraint: Pack-opening logic and internal ids must stay server-side.
Confidence: high
Scope-risk: narrow
Directive: Keep these tests failing until each privacy boundary is fixed.
Tested: npm run test:pack-open-privacy fails on the new privacy assertions
Not-tested: Implementation is intentionally absent in this commit"
```

---

### Task 2: Remove Public Copy That Explains House Logic

**Files:**
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
- Modify: `Website/src/features/ynot/components.tsx`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Replace CR pack-detail odds copy with neutral copy**

In `Website/src/features/ynot/cr/PackDetailExperience.tsx`, replace this block:

```tsx
<div className="cr-stack" style={{ gap: 4 }}>
  <strong style={{ fontSize: 13 }}>Drop odds shift with stock</strong>
  <p
    className="cr-mute"
    style={{ fontSize: 12.5, margin: 0 }}
  >
    Tier availability is calculated from remaining inventory. Lower
    stock can mean better odds for chase tiers.
  </p>
</div>
```

with:

```tsx
<div className="cr-stack" style={{ gap: 4 }}>
  <strong style={{ fontSize: 13 }}>Server-recorded random draw</strong>
  <p
    className="cr-mute"
    style={{ fontSize: 12.5, margin: 0 }}
  >
    Every result is confirmed by YNOTT before rewards move to your
    collection. Public tier labels are display-only.
  </p>
</div>
```

- [ ] **Step 2: Replace legacy detail copy with neutral copy**

In `Website/src/features/ynot/components.tsx`, replace this paragraph:

```tsx
<p>
  Drop behavior and tier availability are calculated from the pack
  setup and remaining inventory. Results are random and are not a
  guarantee that each open returns equal value.
</p>
```

with:

```tsx
<p>
  Results are generated server-side and confirmed before rewards move to
  collection. Public tier labels and prize images are for display only.
</p>
```

- [ ] **Step 3: Run the focused copy/privacy test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: Still FAIL, but the `"customer pack pages do not describe stock-sensitive house logic"` test should now PASS. Remaining failures should be dev-auth, slug-based open payload, history IDs, and collection tokens.

- [ ] **Step 4: Commit the copy fix**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/cr/PackDetailExperience.tsx Website/src/features/ynot/components.tsx
git commit -m "Stop explaining pack logic on public pages

Constraint: Public copy must not reveal stock-sensitive odds behavior.
Rejected: Keep transparency copy about lower stock improving odds | This exposes strategic house behavior.
Confidence: high
Scope-risk: narrow
Tested: npm run test:pack-open-privacy still fails only on remaining privacy tasks
Not-tested: Browser visual smoke pending"
```

---

### Task 3: Stop Dev Auth From Returning Private Campaign Detail To Customer Pages

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Replace the private detail gate**

In `Website/src/features/ynot/data.ts`, inside `getCampaign`, replace:

```ts
const includePrivateDetail = viewer.isAdmin || isDevAuthAllowed();
```

with:

```ts
const includePrivateDetail = viewer.isAdmin;
```

- [ ] **Step 2: Confirm test-campaign preview still uses the existing tester check**

Leave this existing block unchanged:

```ts
if (
  row.is_test &&
  !includePrivateDetail &&
  !(await canReadTestCampaign(supabase, row.id, viewer))
)
  return [];
```

This preserves explicit test-campaign access for allowed testers without exposing private prize/logic fields.

- [ ] **Step 3: Run the focused privacy test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: Still FAIL, but the `"customer campaign detail does not use dev auth as a private data gate"` test should now PASS.

- [ ] **Step 4: Commit the auth-boundary fix**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/data.ts
git commit -m "Keep private campaign details behind real admin

Constraint: Dev auth must not turn customer pack pages into private admin reads.
Rejected: Keep isDevAuthAllowed as a private detail gate | It can leak house logic outside production.
Confidence: high
Scope-risk: narrow
Tested: npm run test:pack-open-privacy still fails only on remaining privacy tasks
Not-tested: Admin browser smoke pending"
```

---

### Task 4: Open Packs By Public Slug And Resolve Internal UUID Server-Side

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Send the campaign slug from the browser**

In `Website/src/features/ynot/client.tsx`, inside `GachaOpenPanel.fireOpen`, replace:

```ts
const payload = await postJson("/api/ynot/gacha/open", {
  campaignId: campaign.id,
  quantity: targetQuantity,
  idempotencyKey: crypto.randomUUID(),
});
```

with:

```ts
const payload = await postJson("/api/ynot/gacha/open", {
  campaignId: campaign.slug,
  quantity: targetQuantity,
  idempotencyKey: crypto.randomUUID(),
});
```

- [ ] **Step 2: Add campaign key normalization to the open API**

In `Website/src/app/api/ynot/gacha/open/route.ts`, after `function isUuid`, insert:

```ts
const CAMPAIGN_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/i;

function normalizeCampaignKey(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (isUuid(trimmed)) return trimmed;
  return CAMPAIGN_SLUG_RE.test(trimmed) ? trimmed : "";
}
```

- [ ] **Step 3: Add server-side campaign key resolution**

In `Website/src/app/api/ynot/gacha/open/route.ts`, after `normalizeIdempotencyKey`, insert:

```ts
async function resolveOpenCampaignId(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignKey: string,
) {
  let query = supabase
    .from("draw_rounds")
    .select("id")
    .eq("status", "live")
    .eq("visibility", "public")
    .eq("approval_status", "approved")
    .limit(1);
  query = isUuid(campaignKey)
    ? query.eq("id", campaignKey)
    : query.eq("slug", campaignKey);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
```

- [ ] **Step 4: Use the resolved ID for preview and real RPC calls**

In `Website/src/app/api/ynot/gacha/open/route.ts`, inside `POST`, replace:

```ts
const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
const quantity = Number(body?.quantity ?? 1);
const idempotencyKey = normalizeIdempotencyKey(body?.idempotencyKey);
if (!campaignId || !isUuid(campaignId)) return Response.json({ error: "Campaign is required." }, { status: 400 });
if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });
if (!idempotencyKey) return Response.json({ error: "Invalid idempotency key." }, { status: 400 });
```

with:

```ts
const campaignKey = normalizeCampaignKey(body?.campaignId);
const quantity = Number(body?.quantity ?? 1);
const idempotencyKey = normalizeIdempotencyKey(body?.idempotencyKey);
if (!campaignKey) return Response.json({ error: "Campaign is required." }, { status: 400 });
if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });
if (!idempotencyKey) return Response.json({ error: "Invalid idempotency key." }, { status: 400 });

const supabase = createServiceSupabaseClient();
const resolvedCampaignId = await resolveOpenCampaignId(supabase, campaignKey);
if (!resolvedCampaignId) {
  return Response.json({ error: "This pack is not openable right now." }, { status: 404 });
}
```

Then replace the preview response:

```ts
result: await buildPreviewOpenResult(campaignId, quantity),
```

with:

```ts
result: await buildPreviewOpenResult(resolvedCampaignId, quantity),
```

Then remove this later duplicate line:

```ts
const supabase = createServiceSupabaseClient();
```

Then replace the RPC call:

```ts
const { data, error } = await supabase.rpc("open_gacha_campaign", { p_profile_id: session.profileId, p_draw_round_id: campaignId, p_quantity: quantity, p_idempotency_key: idempotencyKey });
```

with:

```ts
const { data, error } = await supabase.rpc("open_gacha_campaign", {
  p_profile_id: session.profileId,
  p_draw_round_id: resolvedCampaignId,
  p_quantity: quantity,
  p_idempotency_key: idempotencyKey,
});
```

- [ ] **Step 5: Run the focused privacy test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: Still FAIL, but the `"pack-open browser payload uses public campaign slug and server resolves it internally"` test should now PASS.

- [ ] **Step 6: Commit the slug-open fix**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/client.tsx Website/src/app/api/ynot/gacha/open/route.ts
git commit -m "Resolve pack opens from public campaign slugs

Constraint: Raw draw_round UUIDs should not be required in customer open payloads.
Rejected: Keep browser POSTs tied to campaign.id | It exposes internal database identity.
Confidence: high
Scope-risk: moderate
Tested: npm run test:pack-open-privacy still fails only on remaining privacy tasks
Not-tested: Live Supabase open smoke pending"
```

---

### Task 5: Return Public IDs From Pull History

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Remove raw campaign ID from the customer open-history type**

In `Website/src/features/ynot/types.ts`, replace:

```ts
export type YnotGachaOpenReward = {
  id: string;
  cardName: string;
  cardCode?: string | null;
  tier?: string | null;
  valueThb?: number | null;
  resultPosition: number;
};

export type YnotGachaOpenHistory = {
  id: string;
  publicCode: string;
  campaignId: string;
  campaignSlug?: string | null;
  campaignTitle: string;
  costCoins: number;
  quantity: number;
  status: "reserved" | "completed" | "failed" | "refunded";
  openedAt: string;
  createdAt: string;
  rewards: YnotGachaOpenReward[];
};
```

with:

```ts
export type YnotGachaOpenReward = {
  /** Public row key for React rendering. This is not gacha_open_items.id. */
  id: string;
  cardName: string;
  cardCode?: string | null;
  tier?: string | null;
  valueThb?: number | null;
  resultPosition: number;
};

export type YnotGachaOpenHistory = {
  /** Public open code used as the customer-facing row key. */
  id: string;
  publicCode: string;
  campaignSlug?: string | null;
  campaignTitle: string;
  costCoins: number;
  quantity: number;
  status: "reserved" | "completed" | "failed" | "refunded";
  openedAt: string;
  createdAt: string;
  rewards: YnotGachaOpenReward[];
};
```

- [ ] **Step 2: Map history rows to public IDs only**

In `Website/src/features/ynot/data.ts`, inside `getGachaOpenHistory`, replace:

```ts
const rewards = (itemsByOpenId.get(open.id) ?? []).map((item) => {
  const card = cardsById.get(item.card_id);
  return {
    id: item.id,
    cardName: card?.name ?? "Mystery reward",
    cardCode: card?.code,
    tier: item.tier,
    valueThb: item.value_thb,
    resultPosition: item.result_position,
  };
});

return {
  id: open.id,
  publicCode: open.public_code,
  campaignId: open.draw_round_id,
  campaignSlug: campaign?.slug,
  campaignTitle: campaign?.title_en ?? campaign?.title_th ?? "Mystery pack",
  costCoins: open.cost_coins,
  quantity: open.quantity,
  status: open.status,
  openedAt: open.opened_at,
  createdAt: open.created_at,
  rewards,
};
```

with:

```ts
const publicCode = open.public_code || `OPEN-${open.opened_at ?? open.created_at}`;
const rewards = (itemsByOpenId.get(open.id) ?? []).map((item, index) => {
  const card = cardsById.get(item.card_id);
  return {
    id: `${publicCode}-${item.result_position ?? index + 1}`,
    cardName: card?.name ?? "Mystery reward",
    cardCode: card?.code,
    tier: item.tier,
    valueThb: item.value_thb,
    resultPosition: item.result_position,
  };
});

return {
  id: publicCode,
  publicCode,
  campaignSlug: campaign?.slug,
  campaignTitle: campaign?.title_en ?? campaign?.title_th ?? "Mystery pack",
  costCoins: open.cost_coins,
  quantity: open.quantity,
  status: open.status,
  openedAt: open.opened_at,
  createdAt: open.created_at,
  rewards,
};
```

- [ ] **Step 3: Run the focused privacy test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: Still FAIL, but the `"customer pull history does not expose raw open, reward, or campaign ids"` test should now PASS.

- [ ] **Step 4: Commit the public-history fix**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts
git commit -m "Use public ids for customer pull history

Constraint: All-pulls must not receive raw open, reward, or campaign database ids.
Rejected: Keep internal UUIDs as React keys | Public codes and positions are sufficient.
Confidence: high
Scope-risk: narrow
Tested: npm run test:pack-open-privacy still fails only on collection token task
Not-tested: All-pulls browser smoke pending"
```

---

### Task 6: Add Opaque Collection Action Tokens

**Files:**
- Create: `Website/src/lib/ynot/collection-action-token.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/lib/ynot/card-conversion-api.ts`
- Modify: `Website/src/app/api/ynot/shipping/route.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Create the collection action token helper**

Create `Website/src/lib/ynot/collection-action-token.ts`:

```ts
import "server-only";

import type { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceSupabase = ReturnType<typeof createServiceSupabaseClient>;

const COLLECTION_TOKEN_PREFIX = "ci_";
const COLLECTION_TOKEN_RE = /^ci_[A-Za-z0-9_-]{43}$/;
let hmacKeyPromise: Promise<CryptoKey> | null = null;

function actionTokenSecret() {
  const secret =
    process.env.YNOT_ACTION_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("YNOT collection action token secret is not configured.");
  }
  return secret;
}

function base64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return globalThis
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hmacKey() {
  hmacKeyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(actionTokenSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hmacKeyPromise;
}

async function hmacToken(message: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(message),
  );
  return base64Url(new Uint8Array(signature));
}

export function isCollectionItemActionToken(value: string) {
  return COLLECTION_TOKEN_RE.test(value);
}

export async function collectionItemActionToken(profileId: string, itemId: string) {
  return `${COLLECTION_TOKEN_PREFIX}${await hmacToken(`${profileId}:${itemId}`)}`;
}

export async function resolveCollectionItemActionTokens(
  supabase: ServiceSupabase,
  profileId: string,
  tokens: string[],
) {
  if (!tokens.length) return [] as string[];
  const { data, error } = await supabase
    .from("collection_items")
    .select("id")
    .eq("profile_id", profileId)
    .limit(2000);
  if (error) throw error;

  const tokenPairs = await Promise.all(
    (data ?? []).map(async (row) => {
      const token = await collectionItemActionToken(profileId, row.id);
      return [token, row.id] as const;
    }),
  );
  const itemIdByToken = new Map(tokenPairs);
  const resolved: string[] = [];
  for (const token of tokens) {
    const itemId = itemIdByToken.get(token);
    if (!itemId) return null;
    resolved.push(itemId);
  }
  return resolved;
}
```

- [ ] **Step 2: Import the helper in data.ts**

In `Website/src/features/ynot/data.ts`, add this import near the other imports:

```ts
import { collectionItemActionToken } from "@/lib/ynot/collection-action-token";
```

- [ ] **Step 3: Return action tokens from customer collection rows**

In `Website/src/features/ynot/data.ts`, inside `getCollection`, replace:

```ts
return items.map((item) => {
```

with:

```ts
return Promise.all(items.map(async (item) => {
```

Then inside the returned object replace:

```ts
id: item.id,
```

with:

```ts
id: await collectionItemActionToken(profileId, item.id),
```

Then replace the closing line:

```ts
});
```

that closes the `items.map` call with:

```ts
}));
```

- [ ] **Step 4: Update conversion API to accept action tokens**

In `Website/src/lib/ynot/card-conversion-api.ts`, add this import:

```ts
import {
  isCollectionItemActionToken,
  resolveCollectionItemActionTokens,
} from "@/lib/ynot/collection-action-token";
```

Remove this constant:

```ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
```

Replace `normalizeCollectionItemIds` with:

```ts
function normalizeCollectionItemTokens(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      error: "Select at least one card to convert.",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (value.length > MAX_CONVERT_ITEMS) {
    return {
      error: `Convert up to ${MAX_CONVERT_ITEMS} cards at a time.`,
      status: 400,
      tokens: [] as string[],
    };
  }

  const tokens = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  if (
    tokens.length !== value.length ||
    tokens.some((item) => !isCollectionItemActionToken(item))
  ) {
    return {
      error: "Choose valid collection items to convert.",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (new Set(tokens).size !== tokens.length) {
    return {
      error: "Each card can only be selected once.",
      status: 400,
      tokens: [] as string[],
    };
  }

  return { tokens, error: null, status: 200 };
}
```

Then replace:

```ts
const { ids, error: itemError, status } = normalizeCollectionItemIds(
  body?.collectionItemIds,
);
if (itemError) return Response.json({ error: itemError }, { status });
```

with:

```ts
const { tokens, error: itemError, status } = normalizeCollectionItemTokens(
  body?.collectionItemIds,
);
if (itemError) return Response.json({ error: itemError }, { status });
```

Then replace:

```ts
const supabase = createServiceSupabaseClient();
const { data, error } = await supabase.rpc("submit_card_conversion", {
  p_profile_id: session.profileId,
  p_collection_item_ids: ids,
  p_idempotency_key: idempotencyKey,
});
```

with:

```ts
const supabase = createServiceSupabaseClient();
const ids = await resolveCollectionItemActionTokens(
  supabase,
  session.profileId,
  tokens,
);
if (!ids?.length) {
  return Response.json(
    { error: "Choose valid collection items to convert." },
    { status: 400 },
  );
}
const { data, error } = await supabase.rpc("submit_card_conversion", {
  p_profile_id: session.profileId,
  p_collection_item_ids: ids,
  p_idempotency_key: idempotencyKey,
});
```

- [ ] **Step 5: Update shipping API to accept action tokens**

In `Website/src/app/api/ynot/shipping/route.ts`, add this import:

```ts
import {
  isCollectionItemActionToken,
  resolveCollectionItemActionTokens,
} from "@/lib/ynot/collection-action-token";
```

Leave `UUID_RE` in place because `addressId` is still a UUID.

Replace `normalizeCollectionItemIds` with:

```ts
function normalizeCollectionItemTokens(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      tokens: [] as string[],
      error: "Select at least one card.",
      status: 400,
    };
  }

  const tokens = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());

  if (value.length > MAX_SHIPPING_ITEMS) {
    return {
      tokens,
      error: `Ship up to ${MAX_SHIPPING_ITEMS} cards at a time.`,
      status: 400,
    };
  }
  if (
    tokens.length !== value.length ||
    tokens.some((item) => !isCollectionItemActionToken(item))
  ) {
    return {
      tokens,
      error: "Choose valid collection items to ship.",
      status: 400,
    };
  }
  if (new Set(tokens).size !== tokens.length) {
    return {
      tokens,
      error: "Each card can only be selected once.",
      status: 400,
    };
  }

  return { tokens, error: null, status: 200 };
}
```

Then replace:

```ts
const { ids: collectionItemIds, error: itemError, status } =
  normalizeCollectionItemIds(body?.collectionItemIds);
```

with:

```ts
const { tokens: collectionItemTokens, error: itemError, status } =
  normalizeCollectionItemTokens(body?.collectionItemIds);
```

Then replace:

```ts
if (!collectionItemIds.length) {
```

with:

```ts
if (!collectionItemTokens.length) {
```

Then after:

```ts
const supabase = createServiceSupabaseClient();
```

insert:

```ts
const collectionItemIds = await resolveCollectionItemActionTokens(
  supabase,
  session.profileId,
  collectionItemTokens,
);
if (!collectionItemIds?.length) {
  return Response.json(
    { error: "Choose valid collection items to ship." },
    { status: 400 },
  );
}
```

- [ ] **Step 6: Stop rendering raw/opaque IDs as card fallback labels**

In `Website/src/features/ynot/client.tsx`, inside `CollectionConvertPanel`, replace:

```tsx
{item.serialNo ?? item.id.slice(0, 8)}
```

with:

```tsx
{item.serialNo ?? "YNOT"}
```

- [ ] **Step 7: Run the focused privacy test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: PASS, 12 tests passing.

- [ ] **Step 8: Commit the collection-token fix**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/lib/ynot/collection-action-token.ts Website/src/features/ynot/data.ts Website/src/lib/ynot/card-conversion-api.ts Website/src/app/api/ynot/shipping/route.ts Website/src/features/ynot/client.tsx
git commit -m "Use opaque tokens for customer collection actions

Constraint: Customer conversion and shipping must not expose raw collection item ids.
Rejected: Signed cleartext payload tokens | They still reveal internal ids when decoded.
Confidence: medium
Scope-risk: moderate
Tested: npm run test:pack-open-privacy
Not-tested: Live conversion and shipping RPC smoke pending"
```

---

### Task 7: Full Verification Pass

**Files:**
- Verify: `Website/scripts/test-pack-open-privacy.mjs`
- Verify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Verify: `Website/src/features/ynot/data.ts`
- Verify: `Website/src/lib/ynot/card-conversion-api.ts`
- Verify: `Website/src/app/api/ynot/shipping/route.ts`

- [ ] **Step 1: Run focused privacy tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected:

```text
pass 12
fail 0
```

- [ ] **Step 2: Run customer flow regression tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
```

Expected:

```text
fail 0
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run lint
```

Expected: exits 0. Existing unrelated warnings may remain, but no new warnings should be introduced in touched files.

- [ ] **Step 5: Run whitespace check**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git diff --check
```

Expected: exits 0 with no whitespace errors.

- [ ] **Step 6: Do a final static leak scan**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
rg -n "logicMode|logic_snapshot|unlockAtSoldPct|soldPct|weight|prizeUnitId|draw_round_prize_id|card_stock_unit_id|item\\.id\\.slice|campaignId:\\s*campaign\\.id|id:\\s*open\\.id|id:\\s*item\\.id|campaignId:\\s*open\\.draw_round_id|Drop odds shift|better odds for chase tiers|remaining inventory" Website/src/app/'(store)' Website/src/features/ynot Website/src/app/api/ynot/gacha/open/route.ts Website/src/lib/ynot/card-conversion-api.ts Website/src/app/api/ynot/shipping/route.ts
```

Expected: remaining matches are either admin-only files, type names, server-only internals, or public stock display copy that does not explain odds behavior. No customer/browser mapper should still contain raw open/reward/collection ID mappings or house-logic fields.

- [ ] **Step 7: Commit verification-only adjustments if needed**

If verification required small fixes, run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-pack-open-privacy.mjs Website/src/features/ynot/data.ts Website/src/app/api/ynot/gacha/open/route.ts Website/src/features/ynot/client.tsx Website/src/features/ynot/cr/PackDetailExperience.tsx Website/src/features/ynot/components.tsx Website/src/features/ynot/types.ts Website/src/lib/ynot/collection-action-token.ts Website/src/lib/ynot/card-conversion-api.ts Website/src/app/api/ynot/shipping/route.ts
git commit -m "Finish pack privacy verification fixes

Constraint: Final verification must prove customer pack-opening internals stay server-side.
Confidence: high
Scope-risk: narrow
Tested: npm run test:pack-open-privacy; npm run test:shipping-flow; npm run typecheck; npm run lint; git diff --check
Not-tested: Live production pack open"
```

If no fixes were needed, skip this commit.

---

## Self-Review

- Spec coverage: Task 2 removes public house-logic copy. Task 3 closes the dev-auth private campaign leak. Task 4 removes raw campaign UUID from customer open POSTs. Task 5 removes raw open/reward/campaign IDs from all-pulls history. Task 6 removes raw collection item IDs from customer collection/convert/shipping. Task 7 verifies the whole pack-opening privacy boundary.
- Placeholder scan: This plan has no `TBD`, no unfinished tasks, and every code-changing step includes exact code.
- Type consistency: `YnotGachaOpenHistory` no longer has `campaignId`; `AllPullsExperience` does not use that field. `YnotCollectionItem.id` remains the UI/action identifier but becomes an opaque action token. Conversion and shipping keep the request property name `collectionItemIds` for compatibility while treating the values as action tokens server-side.
