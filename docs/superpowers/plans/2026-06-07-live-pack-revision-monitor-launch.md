# Live Pack Revision Monitor Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix pack opening/image correctness, replace direct live-pack mutation with owner-reviewed live revisions, add a safe live-pack monitor, and launch the full change to production.

**Architecture:** Customer opens use a stable per-intent idempotency key and disarm the `auto=1` URL after firing. Live pack edits write a pending revision snapshot instead of mutating live data; owner-only publish applies the approved revision atomically while preserving existing opens, awarded units, collection rows, and ledger history. The monitor is admin-only, manually refreshed, backed by compact server/RPC aggregates, and excludes house-only fields.

**Tech Stack:** Next.js App Router 16, React 19, Supabase Postgres migrations/RPCs, Supabase service-role API routes, Node `node:test` static regression tests, OpenNext Cloudflare deploy.

---

## Scope And Non-Leak Rules

This plan covers one production launch package:

- customer opening flow duplicate-charge safety
- reward image source consistency for reveal, history, collection, shipping
- live-pack edit review/publish workflow
- admin live-pack monitor
- Supabase migration apply if pending
- GitHub `main` push and Cloudflare production deploy

Do not expose house-only or stock-identity data outside owner-only review. Public/customer payloads and the live monitor must not include: `weight`, `unlockAtSoldPct`, raw `valueThb` logic, card stock unit IDs, prize unit IDs, cert numbers, GemRate IDs, internal stock filters, customer email, customer phone, or address fields. Owner-only review may show weights/gates because it is the approval surface.

## File Structure

- Create `Website/src/features/ynot/open-intent.ts`  
  Stable open-intent/idempotency-key helper used by pack detail buttons and the open panel.

- Modify `Website/src/features/ynot/cr/PackDetailExperience.tsx` and `Website/src/features/ynot/cr/YPackExperience.tsx`  
  Add a fresh `intent` parameter when navigating to `/open?auto=1`.

- Modify `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx` and `Website/src/features/ynot/client.tsx`  
  Pass the intent into `GachaOpenPanel`, reuse it as the idempotency key, and strip `auto=1` from history after firing.

- Modify `Website/src/app/api/ynot/gacha/open/route.ts`, `Website/src/features/ynot/data.ts`, `Website/src/features/ynot/public-subsku-images.ts`, `Website/src/features/ynot/types.ts`  
  Ensure the awarded stock-unit/sub-SKU image is the first image source for reveal, reward history, collection, and shipping without exposing internal IDs.

- Create `Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql`  
  Add live revision storage, owner-only publish RPC, and compact monitor RPC.

- Modify `Website/src/lib/supabase/types.ts`  
  Add generated-equivalent table/function entries for `draw_round_live_revisions`, `publish_live_campaign_revision`, and `get_live_pack_monitor`.

- Create `Website/src/features/ynot/live-pack-revisions.ts`  
  Shared server/client-safe types and patch sanitizers for live revision payloads.

- Modify `Website/src/app/api/ynot/admin/campaigns/route.ts`  
  Live saves create a pending live revision instead of calling `edit_live_campaign_inventory` immediately.

- Create `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts`  
  Review actions: submit, approve, request changes, reject, publish, cancel.

- Create `Website/src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts`  
  Admin-only monitor API that calls the monitor RPC.

- Create `Website/src/app/admin/campaigns/[id]/monitor/page.tsx`  
  Monitor page route.

- Create `Website/src/app/admin/campaigns/[id]/live-revisions/[revisionId]/page.tsx`  
  Owner live revision review page.

- Modify `Website/src/features/ynot/client.tsx`  
  Add `Monitor` and `Edit live pack` actions, pending-revision badges, live-revision review UI, and manual-refresh monitor UI.

- Create or modify tests:
  - `Website/scripts/test-pack-opening-flow-safety.mjs`
  - `Website/scripts/test-subsku-image-routing.mjs`
  - `Website/scripts/test-live-pack-revision-review.mjs`
  - `Website/scripts/test-live-pack-monitor-privacy.mjs`
  - `Website/package.json`

---

### Task 1: Add Regression Test Scripts

**Files:**
- Modify: `Website/package.json`
- Create: `Website/scripts/test-pack-opening-flow-safety.mjs`
- Create: `Website/scripts/test-live-pack-revision-review.mjs`
- Create: `Website/scripts/test-live-pack-monitor-privacy.mjs`
- Modify: `Website/scripts/test-subsku-image-routing.mjs`

- [ ] **Step 1: Add package scripts**

In `Website/package.json`, add these entries inside `"scripts"`:

```json
"test:pack-opening-flow": "node --test scripts/test-pack-opening-flow-safety.mjs",
"test:live-pack-revisions": "node --test scripts/test-live-pack-revision-review.mjs",
"test:live-pack-monitor": "node --test scripts/test-live-pack-monitor-privacy.mjs",
"test:pack-launch-flow": "npm run test:pack-opening-flow && npm run test:subsku-images && npm run test:live-pack-revisions && npm run test:live-pack-monitor && npm run test:pack-open-privacy"
```

- [ ] **Step 2: Write failing pack-opening flow test**

Create `Website/scripts/test-pack-opening-flow-safety.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const openIntentSource = () =>
  readFileSync(new URL("../src/features/ynot/open-intent.ts", import.meta.url), "utf8");
const clientSource = () =>
  readFileSync(new URL("../src/features/ynot/client.tsx", import.meta.url), "utf8");
const openPageSource = () =>
  readFileSync(new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url), "utf8");
const packDetailSource = () =>
  readFileSync(new URL("../src/features/ynot/cr/PackDetailExperience.tsx", import.meta.url), "utf8");
const ypackSource = () =>
  readFileSync(new URL("../src/features/ynot/cr/YPackExperience.tsx", import.meta.url), "utf8");

test("pack-open autostart uses a stable intent idempotency key", () => {
  const source = openIntentSource();
  assert.match(source, /export function createOpenIntentId/);
  assert.match(source, /export function normalizeOpenIntentId/);
  assert.match(source, /export function openIntentIdempotencyKey/);
  assert.match(source, /ynot-open:/);
  assert.doesNotMatch(source, /Math\.random/);
});

test("open route forwards intent from the URL into the client panel", () => {
  const source = openPageSource();
  assert.match(source, /const intent = normalizeOpenIntentId/);
  assert.match(source, /<GachaOpenPanel[\s\S]*openIntentId=\{intent\}/);
});

test("entry points create a fresh intent when navigating to auto open", () => {
  assert.match(packDetailSource(), /createOpenIntentId\(\)/);
  assert.match(packDetailSource(), /intent=\$\{encodeURIComponent\(intent\)\}/);
  assert.match(ypackSource(), /createOpenIntentId\(\)/);
  assert.match(ypackSource(), /intent=\$\{encodeURIComponent\(intent\)\}/);
});

test("client does not mint a random idempotency key inside fireOpen", () => {
  const source = clientSource();
  const fireOpenBlock = source.match(/function fireOpen[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(fireOpenBlock, /openIntentIdempotencyKey/);
  assert.doesNotMatch(fireOpenBlock, /crypto\.randomUUID\(\)/);
});

test("autostart disarms the browser-history trigger after firing", () => {
  const source = clientSource();
  assert.match(source, /stripOpenAutoStartUrl/);
  assert.match(source, /router\.replace\(stripOpenAutoStartUrl/);
  assert.match(source, /handleRevealClose[\s\S]*router\.replace\("\/collection"\)/);
});
```

- [ ] **Step 3: Write failing live revision review test**

Create `Website/scripts/test-live-pack-revision-review.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = () =>
  readFileSync(
    new URL("../../Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql", import.meta.url),
    "utf8",
  );
const campaignsRoute = () =>
  readFileSync(new URL("../src/app/api/ynot/admin/campaigns/route.ts", import.meta.url), "utf8");
const liveRevisionRoute = () =>
  readFileSync(new URL("../src/app/api/ynot/admin/campaigns/live-revisions/route.ts", import.meta.url), "utf8");
const clientSource = () =>
  readFileSync(new URL("../src/features/ynot/client.tsx", import.meta.url), "utf8");
const helperSource = () =>
  readFileSync(new URL("../src/features/ynot/live-pack-revisions.ts", import.meta.url), "utf8");

test("migration creates owner-reviewed live revisions and publish RPC", () => {
  const source = migration();
  assert.match(source, /create table if not exists public\.draw_round_live_revisions/);
  assert.match(source, /status text not null default 'pending_review'/);
  assert.match(source, /references public\.draw_rounds\(id\) on delete cascade/);
  assert.match(source, /create or replace function public\.publish_live_campaign_revision/);
  assert.match(source, /public\.edit_live_campaign_inventory/);
  assert.match(source, /live_revision_base_changed/);
  assert.match(source, /grant execute on function public\.publish_live_campaign_revision/);
});

test("live pack save creates a pending revision instead of immediate live mutation", () => {
  const source = campaignsRoute();
  const liveBranch = source.match(/if \(current\.status === "live"\)[\s\S]*?return Response\.json/)?.[0] ?? "";
  assert.match(liveBranch, /createLivePackRevision/);
  assert.match(liveBranch, /requiresOwnerReview:\s*true/);
  assert.doesNotMatch(liveBranch, /edit_live_campaign_inventory/);
});

test("revision payload preserves odds fields without revealing them to non-owner UI", () => {
  const source = helperSource();
  assert.match(source, /weight:\s*normalizeRevisionWeight/);
  assert.match(source, /unlockAtSoldPct:\s*normalizeRevisionUnlockAtSoldPct/);
  assert.match(source, /export function publicLiveRevisionSummary/);
  const publicSummary = source.match(/export function publicLiveRevisionSummary[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(publicSummary, /weight|unlockAtSoldPct|valueThb|stockUnitFilter|certNumber|gemrateId/);
});

test("live revision actions enforce owner-only approve and publish", () => {
  const source = liveRevisionRoute();
  assert.match(source, /action === "approve"/);
  assert.match(source, /action === "publish"/);
  assert.match(source, /admin\.adminRole !== "owner"/);
  assert.match(source, /OWNER_ROLE_REQUIRED/);
  assert.match(source, /publish_live_campaign_revision/);
});

test("admin list separates monitor from edit live pack", () => {
  const source = clientSource();
  assert.match(source, /href=\{`\/admin\/campaigns\/\$\{campaign\.id\}\/monitor`\}/);
  assert.match(source, />Monitor</);
  assert.match(source, />Edit live pack</);
  assert.doesNotMatch(source, /changes apply immediately and re-materialize stock/);
});
```

- [ ] **Step 4: Write failing monitor privacy test**

Create `Website/scripts/test-live-pack-monitor-privacy.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = () =>
  readFileSync(
    new URL("../../Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql", import.meta.url),
    "utf8",
  );
const route = () =>
  readFileSync(new URL("../src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts", import.meta.url), "utf8");
const page = () =>
  readFileSync(new URL("../src/app/admin/campaigns/[id]/monitor/page.tsx", import.meta.url), "utf8");
const client = () =>
  readFileSync(new URL("../src/features/ynot/client.tsx", import.meta.url), "utf8");

test("monitor RPC returns compact operational data only", () => {
  const source = migration();
  const functionBlock = source.match(/create or replace function public\.get_live_pack_monitor[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(functionBlock, /jsonb_build_object/);
  assert.match(functionBlock, /openedCount/);
  assert.match(functionBlock, /remainingCount/);
  assert.match(functionBlock, /awardedItems/);
  assert.doesNotMatch(functionBlock, /email|phone|address|line_user_id|cert_number|gemrate_id|weight|unlock_at_sold_pct|value_thb/);
});

test("monitor route is admin-only, dynamic, no-store, and rate limited", () => {
  const source = route();
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /resolveAdminSession/);
  assert.match(source, /enforceRateLimit/);
  assert.match(source, /get_live_pack_monitor/);
  assert.match(source, /Cache-Control", "no-store"/);
});

test("monitor page loads latest data on open and manual refresh only", () => {
  assert.match(page(), /getLivePackMonitor/);
  const source = client();
  const monitorBlock = source.match(/function LivePackMonitor[\s\S]*?function /)?.[0] ?? "";
  assert.match(monitorBlock, /Refresh/);
  assert.match(monitorBlock, /fetch\(`\/api\/ynot\/admin\/campaigns\/\$\{campaignId\}\/monitor`\)/);
  assert.doesNotMatch(monitorBlock, /setInterval|setTimeout\([\s\S]*fetch/);
});
```

- [ ] **Step 5: Run tests and verify they fail**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-launch-flow
```

Expected: FAIL because the new helper, migration, revision route, and monitor route do not exist yet.

- [ ] **Step 6: Commit tests**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/package.json Website/scripts/test-pack-opening-flow-safety.mjs Website/scripts/test-live-pack-revision-review.mjs Website/scripts/test-live-pack-monitor-privacy.mjs Website/scripts/test-subsku-image-routing.mjs
git commit -m "Lock pack launch regression targets

Constraint: production pack opens and live pack edits are money/inventory paths.
Rejected: manual-only verification | browser history and live edit regressions need repeatable guards.
Confidence: high
Scope-risk: narrow
Directive: keep customer payloads free of house-only fields and stock-unit identifiers.
Tested: npm run test:pack-launch-flow fails before implementation
Not-tested: implementation not added yet"
```

---

### Task 2: Fix Pack Opening Auto-Start Idempotency

**Files:**
- Create: `Website/src/features/ynot/open-intent.ts`
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
- Modify: `Website/src/features/ynot/cr/YPackExperience.tsx`
- Modify: `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-pack-opening-flow-safety.mjs`

- [ ] **Step 1: Read Next router docs before changing App Router code**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
sed -n '1,180p' Website/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md
sed -n '1,180p' Website/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
```

Expected: docs confirm `router.replace` is the correct client-side history replacement API.

- [ ] **Step 2: Add open intent helper**

Create `Website/src/features/ynot/open-intent.ts`:

```ts
const openIntentPrefix = "ynot-open";
const openIntentPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createOpenIntentId() {
  return crypto.randomUUID();
}

export function normalizeOpenIntentId(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return openIntentPattern.test(clean) ? clean.toLowerCase() : null;
}

export function openIntentIdempotencyKey(intentId: string | null, campaignId: string, quantity: number) {
  const normalized = normalizeOpenIntentId(intentId);
  if (normalized) return `${openIntentPrefix}:${campaignId}:${quantity}:${normalized}`;
  return `${openIntentPrefix}:${campaignId}:${quantity}:${createOpenIntentId()}`;
}

export function stripOpenAutoStartUrl(pathname: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("auto");
  params.delete("intent");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
```

- [ ] **Step 3: Add fresh intent to pack detail entry point**

In `Website/src/features/ynot/cr/PackDetailExperience.tsx`, import `createOpenIntentId`:

```ts
import { createOpenIntentId } from "@/features/ynot/open-intent";
```

Replace the open navigation with:

```ts
const intent = createOpenIntentId();
router.push(
  `/gacha/${campaign.slug}/open?qty=${qty}&auto=1&intent=${encodeURIComponent(intent)}`,
);
```

- [ ] **Step 4: Add fresh intent to pack list entry point**

In `Website/src/features/ynot/cr/YPackExperience.tsx`, import `createOpenIntentId`:

```ts
import { createOpenIntentId } from "@/features/ynot/open-intent";
```

Replace the open navigation with:

```ts
const intent = createOpenIntentId();
router.push(
  `/gacha/${campaign.slug}/open?qty=${qty}&auto=1&intent=${encodeURIComponent(intent)}`,
);
```

- [ ] **Step 5: Pass intent through the open page**

In `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`, import the normalizer:

```ts
import { normalizeOpenIntentId } from "@/features/ynot/open-intent";
```

Inside the page component, add:

```ts
const intent = normalizeOpenIntentId(searchParams.intent);
```

Pass it to the panel:

```tsx
<GachaOpenPanel
  campaign={campaign}
  viewer={viewer}
  autoStart={autoStart}
  initialQuantity={initialQuantity}
  openIntentId={intent}
/>
```

- [ ] **Step 6: Reuse intent key and disarm history in the client**

In `Website/src/features/ynot/client.tsx`, import:

```ts
import {
  openIntentIdempotencyKey,
  stripOpenAutoStartUrl,
} from "./open-intent";
```

Update `GachaOpenPanel` props:

```ts
openIntentId?: string | null;
```

Update `fireOpen` body so the API payload uses:

```ts
idempotencyKey: openIntentIdempotencyKey(
  openIntentId ?? null,
  campaign.id,
  targetQuantity,
),
```

Before calling `fireOpen(initialOption)` in the autostart effect, add:

```ts
router.replace(
  stripOpenAutoStartUrl(
    window.location.pathname,
    new URLSearchParams(window.location.search),
  ),
);
```

Change the collection close handler to replace instead of push:

```ts
function handleRevealClose() {
  router.replace("/collection");
}
```

- [ ] **Step 7: Verify pack-opening test passes**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-opening-flow
```

Expected: PASS.

- [ ] **Step 8: Commit opening fix**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/open-intent.ts Website/src/features/ynot/cr/PackDetailExperience.tsx Website/src/features/ynot/cr/YPackExperience.tsx Website/src/app/\(store\)/gacha/\[campaignId\]/open/page.tsx Website/src/features/ynot/client.tsx Website/scripts/test-pack-opening-flow-safety.mjs
git commit -m "Make pack opens idempotent across history

Constraint: browser back and refresh must not spend coins twice.
Rejected: relying only on a React ref | it resets after remount.
Confidence: high
Scope-risk: narrow
Directive: side-effecting open URLs must carry a stable intent and disarm after firing.
Tested: npm run test:pack-opening-flow
Not-tested: browser smoke pending final verification"
```

---

### Task 3: Fix Awarded Image Source Everywhere

**Files:**
- Modify: `Website/src/features/ynot/public-subsku-images.ts`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/ProfileRewardsTabs.tsx`
- Modify: `Website/src/features/ynot/cr/HistoryExperience.tsx`
- Modify: `Website/src/features/ynot/cr/AllPullsExperience.tsx`
- Modify: `Website/scripts/test-subsku-image-routing.mjs`

- [ ] **Step 1: Extend helper contract**

Ensure `Website/src/features/ynot/public-subsku-images.ts` contains:

```ts
export function publicSubSkuImageUrl(stockUnitImageUrl: unknown, fallbackImageUrl?: unknown) {
  return cleanText(stockUnitImageUrl) ?? cleanText(fallbackImageUrl);
}
```

The helper must return the awarded stock-unit image first and the catalog/card image only as fallback.

- [ ] **Step 2: Ensure reveal API hydrates exact awarded stock image**

In `Website/src/app/api/ynot/gacha/open/route.ts`, keep the response public but resolve image from `draw_round_prize_units.card_stock_unit_id -> card_stock_units.image_url`:

```ts
const stockImageUrl = prizeUnitId ? imageByPrizeUnitId.get(prizeUnitId) : null;
return {
  ...item,
  cardId,
  name: item.name ?? card?.name ?? "Mystery card",
  imageUrl: publicSubSkuImageUrl(stockImageUrl, item.imageUrl ?? card?.image_url ?? null),
  imageResolvedFromStockUnit: Boolean(stockImageUrl),
  tier,
  displayTier,
  valueThb: item.valueThb ?? openItem?.value_thb ?? null,
  bundleQuantity:
    item.bundleQuantity ??
    (typeof openItem?.bundle_quantity === "number"
      ? openItem.bundle_quantity
      : undefined),
};
```

`toPublicOpenItem` must not expose `cardId`, `draw_round_prize_unit_id`, or `card_stock_unit_id`.

- [ ] **Step 3: Ensure collection and reward history use won-unit image**

In `Website/src/features/ynot/data.ts`, collection rows should map:

```ts
imageUrl: publicSubSkuImageUrl(wonUnit?.imageUrl, card?.photoUrl),
```

Gacha reward history rows should map:

```ts
imageUrl: publicSubSkuImageUrl(
  rewardImageByOpenItemId.get(item.id),
  card?.photoUrl,
),
```

Shipping rows should map:

```ts
imageUrl: item ? imageByCollectionItemId.get(item.id) ?? null : null,
```

- [ ] **Step 4: Keep stock identity out of customer types**

In `Website/src/features/ynot/types.ts`, customer types may include `imageUrl?: string | null`, but must not add stock-unit IDs:

```ts
imageUrl?: string | null;
```

- [ ] **Step 5: Verify sub-SKU image tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:subsku-images
npm run test:pack-open-privacy
```

Expected: PASS; public responses still hide internal stock and house fields.

- [ ] **Step 6: Commit image fix**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/public-subsku-images.ts Website/src/app/api/ynot/gacha/open/route.ts Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/ProfileRewardsTabs.tsx Website/src/features/ynot/cr/HistoryExperience.tsx Website/src/features/ynot/cr/AllPullsExperience.tsx Website/scripts/test-subsku-image-routing.mjs
git commit -m "Use awarded stock images for pack rewards

Constraint: customers must see the exact won sub-SKU image without internal stock identifiers.
Rejected: catalog image fallback as primary | it shows the wrong reward for sub-SKU packs.
Confidence: high
Scope-risk: moderate
Directive: public reward payloads may include image URLs only, never stock-unit IDs or owner odds.
Tested: npm run test:subsku-images; npm run test:pack-open-privacy
Not-tested: live browser image smoke pending final verification"
```

---

### Task 4: Add Supabase Live Revision And Monitor Migration

**Files:**
- Create: `Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-live-pack-revision-review.mjs`
- Test: `Website/scripts/test-live-pack-monitor-privacy.mjs`

- [ ] **Step 1: Create revision table and owner publish RPC**

Create `Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql` with this SQL:

```sql
create table if not exists public.draw_round_live_revisions (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','changes_requested','rejected','published','cancelled')),
  base_updated_at timestamptz,
  campaign_patch jsonb not null default '{}'::jsonb,
  prize_config jsonb not null default '[]'::jsonb,
  last_prize_patch jsonb not null default '{}'::jsonb,
  public_summary jsonb not null default '{}'::jsonb,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  submitted_by_admin_id uuid references public.admin_users(id) on delete set null,
  reviewed_by_admin_id uuid references public.admin_users(id) on delete set null,
  published_by_admin_id uuid references public.admin_users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists draw_round_live_revisions_round_status_idx
  on public.draw_round_live_revisions(draw_round_id, status, updated_at desc);

create unique index if not exists draw_round_live_revisions_one_open_idx
  on public.draw_round_live_revisions(draw_round_id)
  where status in ('pending_review','approved','changes_requested');

alter table public.draw_round_live_revisions enable row level security;
revoke all on public.draw_round_live_revisions from public, anon, authenticated;
grant select, insert, update on public.draw_round_live_revisions to service_role;

create or replace function public.publish_live_campaign_revision(
  p_revision_id uuid,
  p_owner_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.draw_round_live_revisions%rowtype;
  campaign public.draw_rounds%rowtype;
  owner_ok boolean;
  patch jsonb;
  last_patch jsonb;
  prizes jsonb;
begin
  select exists (
    select 1
    from public.admin_users admin
    where admin.id = p_owner_admin_id
      and admin.role = 'owner'
      and admin.is_active
  ) into owner_ok;

  if not owner_ok then
    raise exception 'owner_role_required';
  end if;

  select *
  into revision
  from public.draw_round_live_revisions
  where id = p_revision_id
  for update;

  if revision.id is null then
    raise exception 'live_revision_not_found';
  end if;

  if revision.status <> 'approved' then
    raise exception 'live_revision_must_be_approved';
  end if;

  select *
  into campaign
  from public.draw_rounds
  where id = revision.draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;

  if campaign.status <> 'live' or campaign.approval_status <> 'approved' then
    raise exception 'campaign_must_be_live_approved';
  end if;

  if revision.base_updated_at is not null and campaign.updated_at <> revision.base_updated_at then
    raise exception 'live_revision_base_changed';
  end if;

  patch := coalesce(revision.campaign_patch, '{}'::jsonb);
  last_patch := coalesce(revision.last_prize_patch, '{}'::jsonb);
  prizes := coalesce(revision.prize_config, '[]'::jsonb);

  update public.draw_rounds
  set
    title_th = coalesce(nullif(patch->>'titleTh', ''), title_th),
    title_en = coalesce(nullif(patch->>'titleEn', ''), title_en),
    slug = coalesce(nullif(patch->>'slug', ''), slug),
    series = coalesce(nullif(patch->>'series', '')::text, series),
    cost_coins = coalesce(nullif(patch->>'costCoins', '')::integer, cost_coins),
    price_thb = coalesce(nullif(patch->>'priceThb', '')::integer, price_thb),
    banner_image_url = case when patch ? 'bannerImageUrl' then nullif(patch->>'bannerImageUrl', '') else banner_image_url end,
    banner_image_storage_path = case when patch ? 'bannerImageStoragePath' then nullif(patch->>'bannerImageStoragePath', '') else banner_image_storage_path end,
    display_tags = case when patch ? 'displayTags' then patch->'displayTags' else display_tags end,
    open_quantity_options = case when patch ? 'openQuantityOptions' then patch->'openQuantityOptions' else open_quantity_options end,
    last_prize_card_id = case when last_patch ? 'lastPrizeCardId' then nullif(last_patch->>'lastPrizeCardId', '')::uuid else last_prize_card_id end,
    last_prize_metadata = case when last_patch ? 'lastPrizeMetadata' then last_patch->'lastPrizeMetadata' else last_prize_metadata end,
    updated_at = now()
  where id = revision.draw_round_id;

  if jsonb_typeof(prizes) <> 'array' then
    raise exception 'live_revision_prizes_must_be_array';
  end if;

  perform public.edit_live_campaign_inventory(
    revision.draw_round_id,
    p_owner_admin_id,
    prizes
  );

  update public.draw_round_live_revisions
  set
    status = 'published',
    published_by_admin_id = p_owner_admin_id,
    published_at = now(),
    updated_at = now()
  where id = revision.id;

  insert into public.audit_events(actor_admin_id, event_type, draw_round_id, metadata)
  values (
    p_owner_admin_id,
    'live_pack_revision_published',
    revision.draw_round_id,
    jsonb_build_object('revisionId', revision.id)
  );

  return jsonb_build_object(
    'ok', true,
    'revisionId', revision.id,
    'campaignId', revision.draw_round_id,
    'status', 'published'
  );
end;
$$;

revoke all on function public.publish_live_campaign_revision(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_live_campaign_revision(uuid, uuid) to service_role;
```

- [ ] **Step 2: Add monitor RPC to same migration**

Append this SQL to the same migration:

```sql
create or replace function public.get_live_pack_monitor(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  pack jsonb;
  prize_rows jsonb;
  awarded_rows jsonb;
  pending_revision jsonb;
  safe_limit integer;
begin
  select exists (
    select 1 from public.admin_users admin
    where admin.id = p_admin_id
      and admin.is_active
      and admin.role in ('owner','admin','staff')
  ) into is_admin;

  if not is_admin then
    raise exception 'admin_required';
  end if;

  safe_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  select jsonb_build_object(
    'id', round.id,
    'slug', round.slug,
    'title', coalesce(round.title_en, round.title_th),
    'status', round.status,
    'approvalStatus', round.approval_status,
    'totalSlots', round.total_slots,
    'openedCount', count(slot.id) filter (where slot.status in ('opened','picked')),
    'remainingCount', count(slot.id) filter (where slot.status = 'available'),
    'soldOut', count(slot.id) filter (where slot.status = 'available') = 0,
    'updatedAt', round.updated_at
  )
  into pack
  from public.draw_rounds round
  left join public.draw_slots slot on slot.draw_round_id = round.id
  where round.id = p_draw_round_id
  group by round.id;

  if pack is null then
    raise exception 'campaign_not_found';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'rank'), '[]'::jsonb)
  into prize_rows
  from (
    select jsonb_build_object(
      'prizeId', prize.id,
      'cardName', card.name,
      'cardCode', card.card_code,
      'tierLabel', case
        when prize.rank <= 1 then 'Rainbow'
        when prize.rank <= 3 then 'Gold'
        when prize.rank <= 8 then 'Silver'
        else 'Bronze'
      end,
      'rank', prize.rank,
      'plannedCount', count(unit.id) filter (where unit.status <> 'void'),
      'availableCount', count(unit.id) filter (where unit.status = 'available'),
      'awardedCount', count(unit.id) filter (where unit.status = 'awarded')
    ) as row_data
    from public.draw_round_prizes prize
    join public.cards card on card.id = prize.card_id
    left join public.draw_round_prize_units unit on unit.draw_round_prize_id = prize.id
    where prize.draw_round_id = p_draw_round_id
    group by prize.id, card.name, card.card_code
  ) rows;

  select coalesce(jsonb_agg(row_data order by row_data->>'awardedAt' desc), '[]'::jsonb)
  into awarded_rows
  from (
    select jsonb_build_object(
      'cardName', card.name,
      'cardCode', card.card_code,
      'tierLabel', case
        when prize.rank <= 1 then 'Rainbow'
        when prize.rank <= 3 then 'Gold'
        when prize.rank <= 8 then 'Silver'
        else 'Bronze'
      end,
      'openCode', open.public_code,
      'winnerName', coalesce(profile.display_name, profile.line_display_name, 'YNot Customer'),
      'awardedAt', unit.awarded_at
    ) as row_data
    from public.draw_round_prize_units unit
    join public.draw_round_prizes prize on prize.id = unit.draw_round_prize_id
    join public.cards card on card.id = unit.card_id
    left join public.gacha_opens open on open.id = unit.gacha_open_id
    left join public.profiles profile on profile.id = unit.profile_id
    where unit.draw_round_id = p_draw_round_id
      and unit.status = 'awarded'
    order by unit.awarded_at desc nulls last
    limit safe_limit
  ) rows;

  select to_jsonb(rev) - 'prize_config' - 'campaign_patch' - 'last_prize_patch'
  into pending_revision
  from public.draw_round_live_revisions rev
  where rev.draw_round_id = p_draw_round_id
    and rev.status in ('pending_review','approved','changes_requested')
  order by rev.updated_at desc
  limit 1;

  return jsonb_build_object(
    'pack', pack,
    'prizes', prize_rows,
    'awardedItems', awarded_rows,
    'pendingRevision', pending_revision,
    'loadedAt', now()
  );
end;
$$;

revoke all on function public.get_live_pack_monitor(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_live_pack_monitor(uuid, uuid, integer) to service_role;
```

- [ ] **Step 3: Update generated Supabase types manually**

In `Website/src/lib/supabase/types.ts`, add:

```ts
draw_round_live_revisions: {
  Row: {
    id: string;
    draw_round_id: string;
    status: "pending_review" | "approved" | "changes_requested" | "rejected" | "published" | "cancelled";
    base_updated_at: string | null;
    campaign_patch: Json;
    prize_config: Json;
    last_prize_patch: Json;
    public_summary: Json;
    created_by_admin_id: string | null;
    submitted_by_admin_id: string | null;
    reviewed_by_admin_id: string | null;
    published_by_admin_id: string | null;
    review_note: string | null;
    created_at: string;
    submitted_at: string;
    reviewed_at: string | null;
    published_at: string | null;
    updated_at: string;
  };
  Insert: {
    id?: string;
    draw_round_id: string;
    status?: "pending_review" | "approved" | "changes_requested" | "rejected" | "published" | "cancelled";
    base_updated_at?: string | null;
    campaign_patch?: Json;
    prize_config?: Json;
    last_prize_patch?: Json;
    public_summary?: Json;
    created_by_admin_id?: string | null;
    submitted_by_admin_id?: string | null;
    reviewed_by_admin_id?: string | null;
    published_by_admin_id?: string | null;
    review_note?: string | null;
    created_at?: string;
    submitted_at?: string;
    reviewed_at?: string | null;
    published_at?: string | null;
    updated_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["draw_round_live_revisions"]["Insert"]>;
};
```

Add function entries:

```ts
publish_live_campaign_revision: { Args: { p_revision_id: string; p_owner_admin_id: string }; Returns: Json };
get_live_pack_monitor: { Args: { p_draw_round_id: string; p_admin_id: string; p_limit?: number }; Returns: Json };
```

- [ ] **Step 4: Verify migration tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:live-pack-revisions
npm run test:live-pack-monitor
```

Expected: PASS for migration/type presence tests once API/UI files are created in following tasks; at this step the migration-specific assertions pass and route/UI assertions still fail.

- [ ] **Step 5: Commit migration foundation**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql Website/src/lib/supabase/types.ts
git commit -m "Add live pack revision storage

Constraint: live pack edits need owner approval before changing customer-facing inventory.
Rejected: immediate in-place live mutation | owner cannot review logic before it affects customers.
Confidence: medium
Scope-risk: broad
Directive: live revision tables and monitor RPCs must never expose house odds or stock-unit identity to non-owner surfaces.
Tested: migration static assertions
Not-tested: linked Supabase dry-run pending launch task"
```

---

### Task 5: Route Live Saves Into Pending Revisions

**Files:**
- Create: `Website/src/features/ynot/live-pack-revisions.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Create: `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts`
- Test: `Website/scripts/test-live-pack-revision-review.mjs`

- [ ] **Step 1: Add shared live revision helper**

Create `Website/src/features/ynot/live-pack-revisions.ts`:

```ts
import type { Json } from "@/lib/supabase/types";
import type { PrizeDraftInput } from "./prize-readiness";

export type LiveRevisionStatus =
  | "pending_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "published"
  | "cancelled";

function numberOrFallback(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeRevisionWeight(value: unknown) {
  return numberOrFallback(value, 1, 0.0001, 1_000_000);
}

export function normalizeRevisionUnlockAtSoldPct(value: unknown) {
  return numberOrFallback(value, 0, 0, 100);
}

export function liveRevisionPrizeConfig(prizes: PrizeDraftInput[], adminId: string, isTest: boolean, seedRunId: string | null) {
  return prizes.map((prize) => ({
    cardId: prize.cardId,
    tier: prize.tier,
    rank: prize.rank,
    plannedQuantity: prize.quantity,
    bundleQuantity: prize.bundleQuantity,
    convertCoinValue: prize.convertCoinValue,
    valueThb: prize.valueThb,
    weight: normalizeRevisionWeight(prize.weight),
    unlockAtSoldPct: normalizeRevisionUnlockAtSoldPct(prize.unlockAtSoldPct),
    metadata: prize.metadata ?? {},
    adminId,
    isTest,
    seedRunId,
  })) as Json;
}

export function publicLiveRevisionSummary(input: {
  changedFields: string[];
  prizeCount: number;
  plannedUnits: number;
  submittedByRole: string;
}) {
  return {
    changedFields: input.changedFields,
    prizeCount: input.prizeCount,
    plannedUnits: input.plannedUnits,
    submittedByRole: input.submittedByRole,
  };
}
```

- [ ] **Step 2: Preserve odds for non-owner live revisions without exposing them**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, stop using `initialPrizesForAdminRole` in the live branch. For non-owner live saves, merge current prize odds from the database before creating the revision:

```ts
const normalizedLivePrizes = normalizePrizeDrafts(body.initialPrizes);
const livePrizes = await preserveExistingLiveOddsForNonOwner(
  supabase,
  campaignId,
  normalizedLivePrizes,
  admin.adminRole,
);
```

Add helper in the same file:

```ts
async function preserveExistingLiveOddsForNonOwner(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  prizes: PrizeDraftInput[],
  adminRole: "owner" | "admin" | "staff",
) {
  if (adminRole === "owner") return prizes;
  const { data, error } = await supabase
    .from("draw_round_prizes")
    .select("card_id,rank,weight,unlock_at_sold_pct")
    .eq("draw_round_id", campaignId);
  if (error) throw error;
  const existing = new Map(
    (data ?? []).map((row) => [
      `${row.card_id}:${row.rank}`,
      {
        weight: Number(row.weight ?? 1),
        unlockAtSoldPct: Number(row.unlock_at_sold_pct ?? 0),
      },
    ]),
  );
  return prizes.map((prize) => {
    const current = existing.get(`${prize.cardId}:${prize.rank}`);
    return current
      ? { ...prize, weight: current.weight, unlockAtSoldPct: current.unlockAtSoldPct }
      : { ...prize, weight: 1, unlockAtSoldPct: 0 };
  });
}
```

- [ ] **Step 3: Replace immediate live RPC with revision insert**

In the `if (current.status === "live")` branch of `Website/src/app/api/ynot/admin/campaigns/route.ts`, replace the call to `edit_live_campaign_inventory` with:

```ts
const revisionPrizeConfig = liveRevisionPrizeConfig(
  livePrizes,
  admin.adminId,
  Boolean(body.isTest),
  text(body.seedRunId, 80) || null,
);
const publicSummary = publicLiveRevisionSummary({
  changedFields: ["pack", "prizes", "lastPrize"],
  prizeCount: livePrizes.length,
  plannedUnits: livePrizes.reduce((sum, prize) => sum + prize.quantity, 0),
  submittedByRole: admin.adminRole,
});

const { data: revision, error: revisionError } = await supabase
  .from("draw_round_live_revisions")
  .insert({
    draw_round_id: campaignId,
    status: "pending_review",
    base_updated_at: current.updated_at,
    campaign_patch: {
      titleTh: patch.title_th,
      titleEn: patch.title_en,
      slug: patch.slug,
      series: patch.series,
      costCoins: patch.cost_coins,
      priceThb: patch.price_thb,
      bannerImageUrl: patch.banner_image_url,
      bannerImageStoragePath: patch.banner_image_storage_path,
      displayTags: patch.display_tags,
      openQuantityOptions: patch.open_quantity_options,
    },
    prize_config: revisionPrizeConfig,
    last_prize_patch: {
      lastPrizeCardId: patch.last_prize_card_id,
      lastPrizeMetadata: patch.last_prize_metadata,
    },
    public_summary: publicSummary,
    created_by_admin_id: admin.adminId,
    submitted_by_admin_id: admin.adminId,
  })
  .select("id,status")
  .single();

if (revisionError) {
  return adminErrorResponse(
    revisionError.code ?? "LIVE_REVISION_CREATE_FAILED",
    revisionError.message,
    409,
    { detail: revisionError.details ?? null, hint: revisionError.hint ?? null },
  );
}

return Response.json({
  ok: true,
  campaignId,
  liveRevisionId: revision.id,
  approvalStatus: current.approval_status,
  requiresOwnerReview: true,
  message: "Live pack update saved for owner review. Current live pack is unchanged until owner publish.",
});
```

- [ ] **Step 4: Add live revision action route**

Create `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts`:

```ts
import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

type RevisionAction = "approve" | "request_changes" | "reject" | "publish" | "cancel";

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function actionValue(value: unknown): RevisionAction | null {
  return value === "approve" ||
    value === "request_changes" ||
    value === "reject" ||
    value === "publish" ||
    value === "cancel"
    ? value
    : null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse("SUPABASE_NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const admin = await resolveAdminSession();
  if (!admin) return adminErrorResponse("ADMIN_REQUIRED", "Admin access is required.", 403);
  const limited = await enforceRateLimit(request, "ynot:admin:live-revisions", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { revisionId?: unknown; action?: unknown; note?: unknown } | null;
  const revisionId = text(body?.revisionId, 80);
  const action = actionValue(body?.action);
  const note = text(body?.note, 500);
  if (!revisionId || !action) {
    return adminErrorResponse("LIVE_REVISION_INVALID_INPUT", "revisionId and action are required.", 400);
  }
  if ((action === "approve" || action === "publish") && admin.adminRole !== "owner") {
    return adminErrorResponse("OWNER_ROLE_REQUIRED", "Only an owner can approve or publish live pack revisions.", 403);
  }

  const supabase = createServiceSupabaseClient();
  if (action === "publish") {
    const { data, error } = await supabase.rpc("publish_live_campaign_revision", {
      p_revision_id: revisionId,
      p_owner_admin_id: admin.adminId,
    });
    if (error) {
      return adminErrorResponse(error.code ?? "LIVE_REVISION_PUBLISH_FAILED", error.message, 409, {
        detail: error.details ?? null,
        hint: error.hint ?? null,
      });
    }
    revalidateTag("ynot-campaigns");
    return Response.json({ ok: true, result: data });
  }

  const nextStatus =
    action === "approve"
      ? "approved"
      : action === "request_changes"
        ? "changes_requested"
        : action === "reject"
          ? "rejected"
          : "cancelled";

  const { data, error } = await supabase
    .from("draw_round_live_revisions")
    .update({
      status: nextStatus,
      reviewed_by_admin_id: admin.adminId,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", revisionId)
    .select("id,draw_round_id,status")
    .single();
  if (error) {
    return adminErrorResponse(error.code ?? "LIVE_REVISION_UPDATE_FAILED", error.message, 409, {
      detail: error.details ?? null,
      hint: error.hint ?? null,
    });
  }
  return Response.json({ ok: true, revision: data });
}
```

- [ ] **Step 5: Verify live revision tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:live-pack-revisions
```

Expected: PASS for API and helper assertions.

- [ ] **Step 6: Commit API revision flow**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/live-pack-revisions.ts Website/src/app/api/ynot/admin/campaigns/route.ts Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts Website/scripts/test-live-pack-revision-review.mjs
git commit -m "Route live pack edits through owner review

Constraint: live edits must not alter customer-facing inventory until owner publish.
Rejected: admin/staff save mutates weight and gate values | it can flatten pack logic silently.
Confidence: medium
Scope-risk: broad
Directive: preserve existing play/open/collection/ledger rows and keep house logic owner-only.
Tested: npm run test:live-pack-revisions
Not-tested: linked database publish RPC pending launch verification"
```

---

### Task 6: Add Live Revision Review UI

**Files:**
- Create: `Website/src/app/admin/campaigns/[id]/live-revisions/[revisionId]/page.tsx`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-live-pack-revision-review.mjs`

- [ ] **Step 1: Add types**

In `Website/src/features/ynot/types.ts`, add:

```ts
export type YnotLivePackRevisionReview = {
  id: string;
  campaignId: string;
  status: "pending_review" | "approved" | "changes_requested" | "rejected" | "published" | "cancelled";
  publicSummary: {
    changedFields: string[];
    prizeCount: number;
    plannedUnits: number;
    submittedByRole: string;
  };
  ownerLogic: {
    prizes: Array<{
      cardName: string;
      cardCode?: string | null;
      rank: number;
      plannedQuantity: number;
      bundleQuantity: number;
      weight: number;
      unlockAtSoldPct: number;
    }>;
  };
  submittedAt: string;
  reviewNote?: string | null;
};
```

- [ ] **Step 2: Add server read function**

In `Website/src/features/ynot/data.ts`, add `getLivePackRevisionReview`:

```ts
export async function getLivePackRevisionReview(revisionId: string) {
  const admin = await resolveAdminSession();
  if (!admin || admin.adminRole !== "owner") return null;
  const supabase = createServiceSupabaseClient();
  const { data: revision, error } = await supabase
    .from("draw_round_live_revisions")
    .select("id,draw_round_id,status,public_summary,prize_config,submitted_at,review_note")
    .eq("id", revisionId)
    .single();
  if (error || !revision) return null;
  const prizeConfig = Array.isArray(revision.prize_config) ? revision.prize_config : [];
  const cardIds = [...new Set(prizeConfig.map((row) => row?.cardId).filter(Boolean))];
  const { data: cards } = cardIds.length
    ? await supabase.from("cards").select("id,name,card_code").in("id", cardIds)
    : { data: [] };
  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  return {
    id: revision.id,
    campaignId: revision.draw_round_id,
    status: revision.status,
    publicSummary: revision.public_summary,
    ownerLogic: {
      prizes: prizeConfig.map((row) => {
        const card = cardById.get(row.cardId);
        return {
          cardName: card?.name ?? "Unknown prize",
          cardCode: card?.card_code ?? null,
          rank: Number(row.rank ?? 0),
          plannedQuantity: Number(row.plannedQuantity ?? 0),
          bundleQuantity: Number(row.bundleQuantity ?? 1),
          weight: Number(row.weight ?? 1),
          unlockAtSoldPct: Number(row.unlockAtSoldPct ?? 0),
        };
      }),
    },
    submittedAt: revision.submitted_at,
    reviewNote: revision.review_note,
  } satisfies YnotLivePackRevisionReview;
}
```

- [ ] **Step 3: Create review page**

Create `Website/src/app/admin/campaigns/[id]/live-revisions/[revisionId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getLivePackRevisionReview } from "@/features/ynot/data";
import { LivePackRevisionReview } from "@/features/ynot/client";

export const dynamic = "force-dynamic";

export default async function LivePackRevisionReviewPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { revisionId } = await params;
  const review = await getLivePackRevisionReview(revisionId);
  if (!review) notFound();
  return <LivePackRevisionReview review={review} />;
}
```

- [ ] **Step 4: Add owner review component**

In `Website/src/features/ynot/client.tsx`, export:

```tsx
export function LivePackRevisionReview({
  review,
}: {
  review: YnotLivePackRevisionReview;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: "approve" | "request_changes" | "reject" | "publish") {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/live-revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: review.id, action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.error || "Revision action failed");
      }
      setMessage(action === "publish" ? "Live revision published." : "Review status updated.");
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Revision action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="admin-live-review">
      <header className="admin-live-review-head">
        <span className="section-label">Live pack revision</span>
        <h1>Owner approval required</h1>
        <p>Current live pack stays unchanged until this revision is published.</p>
      </header>
      <div className="admin-live-review-grid">
        <article className="soft-card">
          <h3>Change summary</h3>
          <p>{review.publicSummary.prizeCount} prize rows · {review.publicSummary.plannedUnits} planned units</p>
          <p>Status: {review.status}</p>
        </article>
        <article className="soft-card">
          <h3>Owner logic</h3>
          <table className="admin-live-review-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Rank</th>
                <th>Units</th>
                <th>Bundle</th>
                <th>Weight</th>
                <th>Unlock</th>
              </tr>
            </thead>
            <tbody>
              {review.ownerLogic.prizes.map((prize) => (
                <tr key={`${prize.cardName}-${prize.rank}`}>
                  <td>{prize.cardName}</td>
                  <td>{prize.rank}</td>
                  <td>{prize.plannedQuantity}</td>
                  <td>{prize.bundleQuantity}</td>
                  <td>{prize.weight}</td>
                  <td>{prize.unlockAtSoldPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <footer className="admin-live-review-actions">
        <button type="button" onClick={() => submit("request_changes")} disabled={Boolean(pending)}>
          Request changes
        </button>
        <button type="button" onClick={() => submit("reject")} disabled={Boolean(pending)}>
          Reject
        </button>
        <button type="button" onClick={() => submit("approve")} disabled={Boolean(pending) || review.status === "approved"}>
          Approve
        </button>
        <button type="button" onClick={() => submit("publish")} disabled={Boolean(pending) || review.status !== "approved"}>
          Publish to live
        </button>
      </footer>
    </section>
  );
}
```

- [ ] **Step 5: Change live edit save copy**

In `Website/src/features/ynot/client.tsx`, replace live-save success copy:

```ts
? `✓ "${packLabel}" saved for owner review. Current live pack is unchanged until owner publish.`
```

The UI must not say live changes apply now.

- [ ] **Step 6: Commit review UI**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/app/admin/campaigns/\[id\]/live-revisions/\[revisionId\]/page.tsx Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/client.tsx
git commit -m "Add owner review for live pack revisions

Constraint: owner must see live logic before republishing.
Rejected: silent live save success copy | it hides the approval step.
Confidence: medium
Scope-risk: moderate
Directive: owner review may show logic details; non-owner and customer surfaces may not.
Tested: npm run test:live-pack-revisions
Not-tested: browser review flow pending final verification"
```

---

### Task 7: Add Live Pack Monitor

**Files:**
- Create: `Website/src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts`
- Create: `Website/src/app/admin/campaigns/[id]/monitor/page.tsx`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-live-pack-monitor-privacy.mjs`

- [ ] **Step 1: Add monitor types**

In `Website/src/features/ynot/types.ts`, add:

```ts
export type YnotLivePackMonitor = {
  pack: {
    id: string;
    slug: string;
    title: string;
    status: string;
    approvalStatus: string;
    totalSlots: number;
    openedCount: number;
    remainingCount: number;
    soldOut: boolean;
    updatedAt: string;
  };
  prizes: Array<{
    prizeId: string;
    cardName: string;
    cardCode?: string | null;
    tierLabel: string;
    rank: number;
    plannedCount: number;
    availableCount: number;
    awardedCount: number;
  }>;
  awardedItems: Array<{
    cardName: string;
    cardCode?: string | null;
    tierLabel: string;
    openCode?: string | null;
    winnerName: string;
    awardedAt?: string | null;
  }>;
  pendingRevision?: {
    id: string;
    status: string;
    updated_at: string;
  } | null;
  loadedAt: string;
};
```

- [ ] **Step 2: Add server monitor reader**

In `Website/src/features/ynot/data.ts`, add:

```ts
export async function getLivePackMonitor(campaignId: string) {
  const admin = await resolveAdminSession();
  if (!admin) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_live_pack_monitor", {
    p_draw_round_id: campaignId,
    p_admin_id: admin.adminId,
    p_limit: 100,
  });
  if (error) return null;
  return data as YnotLivePackMonitor;
}
```

- [ ] **Step 3: Add monitor API route**

Create `Website/src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts`:

```ts
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse("SUPABASE_NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const admin = await resolveAdminSession();
  if (!admin) return adminErrorResponse("ADMIN_REQUIRED", "Admin access is required.", 403);
  const limited = await enforceRateLimit(request, "ynot:admin:live-monitor", { limit: 20, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const { id } = await params;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_live_pack_monitor", {
    p_draw_round_id: id,
    p_admin_id: admin.adminId,
    p_limit: 100,
  });
  if (error) {
    return adminErrorResponse(error.code ?? "LIVE_MONITOR_LOAD_FAILED", error.message, 409, {
      detail: error.details ?? null,
      hint: error.hint ?? null,
    });
  }
  return Response.json(
    { ok: true, monitor: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Add monitor page**

Create `Website/src/app/admin/campaigns/[id]/monitor/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getLivePackMonitor } from "@/features/ynot/data";
import { LivePackMonitor } from "@/features/ynot/client";

export const dynamic = "force-dynamic";

export default async function LivePackMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const monitor = await getLivePackMonitor(id);
  if (!monitor) notFound();
  return <LivePackMonitor campaignId={id} initialMonitor={monitor} />;
}
```

- [ ] **Step 5: Add monitor component with manual refresh only**

In `Website/src/features/ynot/client.tsx`, export:

```tsx
export function LivePackMonitor({
  campaignId,
  initialMonitor,
}: {
  campaignId: string;
  initialMonitor: YnotLivePackMonitor;
}) {
  const [monitor, setMonitor] = useState(initialMonitor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ynot/admin/campaigns/${campaignId}/monitor`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.error || "Monitor refresh failed");
      }
      setMonitor(payload.monitor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Monitor refresh failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-live-monitor">
      <header className="admin-live-monitor-head">
        <span className="section-label">Live pack monitor</span>
        <h1>{monitor.pack.title}</h1>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="kpi-grid">
        <AdminKPI label="Opened" value={monitor.pack.openedCount.toLocaleString()} color="var(--a-sky)" />
        <AdminKPI label="Remaining" value={monitor.pack.remainingCount.toLocaleString()} color="var(--a-mint)" />
        <AdminKPI label="Total slots" value={monitor.pack.totalSlots.toLocaleString()} color="var(--a-gold)" />
      </div>
      <section className="soft-card">
        <h3>Prize situation</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Prize</th>
              <th>Tier</th>
              <th>Out</th>
              <th>Left</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {monitor.prizes.map((prize) => (
              <tr key={prize.prizeId}>
                <td>{prize.cardName}</td>
                <td>{prize.tierLabel}</td>
                <td>{prize.awardedCount}</td>
                <td>{prize.availableCount}</td>
                <td>{prize.plannedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="soft-card">
        <h3>Already out</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Prize</th>
              <th>User</th>
              <th>Open</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {monitor.awardedItems.map((item, index) => (
              <tr key={`${item.openCode}-${index}`}>
                <td>{item.cardName}</td>
                <td>{item.winnerName}</td>
                <td>{item.openCode ?? "-"}</td>
                <td>{item.awardedAt ? new Date(item.awardedAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
```

- [ ] **Step 6: Add admin table actions**

In the live row actions inside `Website/src/features/ynot/client.tsx`, replace the single `Edit live` action with:

```tsx
{campaign.status === "live" && (
  <>
    <a
      href={`/admin/campaigns/${campaign.id}/monitor`}
      className="admin-pack-table-action"
      title="Open latest live pack monitor"
    >
      Monitor
    </a>
    <a
      href={`/admin/campaigns/${campaign.id}/edit`}
      className="admin-pack-table-action"
      title="Prepare a live pack revision for owner review"
    >
      Edit live pack
    </a>
  </>
)}
```

- [ ] **Step 7: Verify monitor tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:live-pack-monitor
```

Expected: PASS. The component has no `setInterval`, and the RPC/function blocks do not contain forbidden private fields.

- [ ] **Step 8: Commit monitor**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/app/api/ynot/admin/campaigns/\[id\]/monitor/route.ts Website/src/app/admin/campaigns/\[id\]/monitor/page.tsx Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/client.tsx Website/scripts/test-live-pack-monitor-privacy.mjs
git commit -m "Add safe live pack monitor

Constraint: admins need latest pack situation without Cloudflare-heavy polling or house data leaks.
Rejected: always-on dashboard polling | it can waste Worker CPU and trigger production instability.
Confidence: medium
Scope-risk: moderate
Directive: monitor returns operational counts and winner labels only; owner logic stays in owner review.
Tested: npm run test:live-pack-monitor
Not-tested: production monitor smoke pending launch"
```

---

### Task 8: Full Local Verification

**Files:**
- All changed files

- [ ] **Step 1: Run focused pack launch tests**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-launch-flow
```

Expected: PASS.

- [ ] **Step 2: Run adjacent inventory and privacy tests**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:stock-readiness
npm run test:gacha-open-bundle
npm run test:random-pack-bundles
npm run test:prize-unit-counts
npm run test:last-prize-stock-link
npm run test:campaign-detail-privacy
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and lint**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run Cloudflare production build locally**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run cf:build:website
```

Expected: build completes without Next/OpenNext errors.

- [ ] **Step 5: Commit verification fixes if needed**

If a verification command required code fixes, commit the fixes:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website Database
git commit -m "Stabilize live pack launch verification

Constraint: production launch requires passing focused tests, typecheck, lint, and Cloudflare build.
Rejected: shipping with known verification failures | this path spends coins and changes live inventory.
Confidence: high
Scope-risk: narrow
Directive: keep final fixes scoped to pack opening, live revision, monitor, and privacy boundaries.
Tested: npm run test:pack-launch-flow; npm run typecheck; npm run lint; npm run cf:build:website
Not-tested: production deploy pending"
```

---

### Task 9: Supabase Migration Preflight And Apply

**Files:**
- `Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql`
- `Database/supabase/config.toml`
- `Website/.env.local`

- [ ] **Step 1: Confirm production config exists without printing secrets**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
test -f Website/.env.local && echo "Website env present"
test -f Database/supabase/config.toml && echo "Supabase config present"
```

Expected:

```text
Website env present
Supabase config present
```

Do not print secret values.

- [ ] **Step 2: Inspect linked migration ledger**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
```

Expected: command succeeds and shows whether production is behind the local migration list.

- [ ] **Step 3: Dry-run all pending migrations**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --dry-run --include-all
```

Expected: output either says `Remote database is up to date.` or lists the pending migration including `20260607120000_live_pack_revisions_and_monitor.sql`.

- [ ] **Step 4: Apply pending migrations only if dry-run shows them**

If the dry-run lists pending migrations, run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --include-all --yes
```

Expected: Supabase applies the pending batch successfully. Existing production rows remain in place because the migration only creates a new table/functions and does not delete or rewrite customer data.

- [ ] **Step 5: Verify linked migration ledger after apply**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
```

Expected: local and remote ledgers match through `20260607120000_live_pack_revisions_and_monitor.sql`.

- [ ] **Step 6: Verify production DB readiness**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:production-db
```

Expected: PASS.

---

### Task 10: Merge, Push GitHub Main, Deploy Cloudflare

**Files:**
- All changed files

- [ ] **Step 1: Fetch and confirm branch state**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git fetch origin --prune
git status --short --branch
```

Expected: working tree clean except committed implementation branch; branch is ahead of `origin/main` by the planned commits.

- [ ] **Step 2: Rebase or fast-forward onto latest main**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git checkout main
git pull --ff-only origin main
git merge --ff-only codex/pack-opening-cloudflare-stability
```

Expected: `main` now contains the implementation commits. If fast-forward is impossible, stop and resolve with a normal merge commit only after re-running the verification commands.

- [ ] **Step 3: Re-run production-critical verification on main**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-launch-flow
npm run typecheck
npm run lint
npm run cf:build:website
npm run verify:production-db
```

Expected: PASS.

- [ ] **Step 4: Push GitHub main**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git push origin main
```

Expected: GitHub `main` updates successfully.

- [ ] **Step 5: Deploy production website to Cloudflare**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run cf:deploy:website
```

Expected: OpenNext build and Cloudflare deploy succeed.

- [ ] **Step 6: Smoke production routes**

Run:

```bash
curl -I https://www.ynotopen.com/
curl -I https://www.ynotopen.com/packs
curl -I https://www.ynotopen.com/login
curl -I https://ynott-website.puppeteer-55b.workers.dev/packs
```

Expected:

```text
https://www.ynotopen.com/ -> 200 or 30x to a healthy page
https://www.ynotopen.com/packs -> 200
https://www.ynotopen.com/login -> 200
workers.dev fallback /packs -> 200
```

- [ ] **Step 7: Smoke admin live monitor manually**

In a logged-in admin browser:

```text
/admin/campaigns -> live row -> Monitor
```

Expected: monitor loads latest counts on page open, refresh button reloads once, no auto-polling, no Cloudflare 1102, no private customer contact data, no weights/gates on monitor.

- [ ] **Step 8: Smoke live revision flow manually**

In a logged-in admin/owner browser:

```text
/admin/campaigns -> live row -> Edit live pack -> Save
owner opens live revision review -> Approve -> Publish to live
```

Expected:

- current live pack remains live before publish
- save creates pending revision
- owner review shows logic
- publish succeeds
- existing opens, collection items, awarded units, wallet ledger, and shipping/exchange rows remain unchanged
- future opens use the newly published live revision

- [ ] **Step 9: Smoke pack opening back/refresh behavior**

Use a low-risk test pack only:

```text
open pack -> reveal -> browser Back / Forward / Refresh
```

Expected: no second coin spend and no second inventory consumption; if the same URL replays, the server returns the original idempotent result.

- [ ] **Step 10: Post-launch production data check**

Run read-only checks for the affected live packs:

```text
Check live pack prize rows for weight/unlock values.
Check recent gacha_opens count did not jump unexpectedly during smoke.
Check awarded collection images resolve to stock-unit/sub-SKU image URLs.
```

Expected: no guessed odds are written. If old packs need corrected odds/gates, create an owner-reviewed live revision using the new UI and publish only after owner confirms the intended values.

---

## Self-Review

Spec coverage:

- Opening duplicate charge via browser back/refresh: Task 1 and Task 2.
- Reveal/card spin image correctness: Task 3.
- Client bag/collection image correctness: Task 3.
- Live edit must require owner approval before republish: Task 4, Task 5, Task 6.
- Existing playing info preserved after republish: Task 4 publish RPC calls awarded-aware live inventory edit and never touches open/history/collection/ledger tables directly.
- Admin monitor with live situation, prizes left/out, and winner labels: Task 7.
- Avoid Cloudflare 1102: Task 7 manual refresh, compact RPC, rate limit, no polling.
- Push GitHub main: Task 10.
- Supabase migration if needed: Task 9.
- Full production launch: Task 9 and Task 10.
- No house info leak: non-leak rules, Task 1 privacy tests, Task 7 monitor privacy, owner-only review boundary.

Placeholder scan:

- Placeholder scan completed; no unspecified implementation steps are intentionally left in this plan.
- Every new route/helper/test has concrete file paths and code snippets.

Type consistency:

- `LiveRevisionStatus`, `YnotLivePackRevisionReview`, and `YnotLivePackMonitor` are defined before use.
- API actions use the same strings as tests: `approve`, `request_changes`, `reject`, `publish`, `cancel`.
- Supabase RPC names match the type entries and API calls.
