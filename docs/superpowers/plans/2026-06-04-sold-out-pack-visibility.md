# Sold Out Pack Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show sold-out public Y-Packs as sold out on every customer-facing pack surface while keeping opening, reward assignment, history, collection, and public data privacy unchanged.

**Architecture:** Keep `open_gacha_campaign` and `/api/ynot/gacha/open` as the only reward-assignment authority. Widen public campaign readers so sold-out packs can reach existing UI, then harden all open entrypoints so only `campaign.openable` campaigns can enter the reveal flow. Preserve existing public DTOs for prize lineup, reveal items, history, collection, and shipping images.

**Tech Stack:** Next.js App Router, React 19, Supabase service client, static Node test scripts, existing YNOTT data helpers in `Website/src/features/ynot/data.ts`.

---

## Scope And Decision

Implement option 1 from the discussion: show sold-out packs on all customer pack-related pages.

- `/packs` should include live, public, approved sold-out packs.
- `/packs/:slug` should render the CR pack detail and sold-out dock.
- `/gacha/:slug` should render the legacy detail and sold-out disabled state.
- `/gacha/:slug/open?auto=1` should not render the reveal auto-start page when the pack is sold out.
- Any older homepage or campaign-card surface using `CampaignCard` should say `Sold out` and disable its open action.
- `/api/ynot/gacha/open` should stay unchanged. The RPC already rejects exhausted stock and writes rewards atomically.
- Reward history and collection data calling should stay unchanged except for tests proving they still use public image URLs and hide internal IDs.

## File Structure

- Modify: `Website/scripts/test-campaign-detail-privacy.mjs`
  - Adds static tests that public detail can return sold-out campaigns only through `publicYnotCampaign`.
- Modify: `Website/scripts/test-pack-open-privacy.mjs`
  - Adds static tests for public list visibility, dynamic detail visibility, open-page auto-start gating, legacy detail disabled sold-out state, and unchanged public reward/history DTO privacy.
- Modify: `Website/src/features/ynot/data.ts`
  - Changes public campaign list/detail filtering from `openable` only to `openable || soldOut`.
  - Keeps `publicYnotCampaign` as the only customer projection.
  - Bumps public cache keys to avoid stale cached null/list responses.
- Modify: `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`
  - Allows auto-start reveal only when `campaign.openable === true`.
  - Redirects sold-out campaign open links back to `/packs/:slug`.
- Modify: `Website/src/features/ynot/components.tsx`
  - Adds a shared sold-out helper for legacy pack cards/detail.
  - Shows `Sold out` instead of `0/total` where the older UI would otherwise still say stock.
  - Replaces old unconditional open links with disabled sold-out buttons.
- Existing UI requiring no direct code change:
  - `Website/src/features/ynot/cr/YPackExperience.tsx` already renders sold-out cards and disables opening once sold-out packs reach it.
  - `Website/src/features/ynot/cr/PackDetailExperience.tsx` already renders the sold-out detail dock once sold-out packs reach it.
  - `Website/src/features/ynot/client.tsx` already refuses auto-start when `!campaign.openable`.
  - `Website/src/app/api/ynot/gacha/open/route.ts` already resolves only live public approved slugs and lets `open_gacha_campaign` enforce inventory.
  - `Website/src/features/ynot/data.ts` collection/history functions already resolve exact won stock-unit images without exposing stock IDs.

---

### Task 1: Add Failing Static Tests For Sold-Out Visibility And Open Gates

**Files:**
- Modify: `Website/scripts/test-campaign-detail-privacy.mjs`
- Modify: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Add public detail sold-out visibility test**

Append this test to `Website/scripts/test-campaign-detail-privacy.mjs` after the `"cached public detail loader returns only the public projection"` test:

```js
test("cached public detail loader returns sold-out campaigns through the public projection", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(
    impl,
    /if \(!campaign\.openable && !campaign\.soldOut\) return null;/,
    "sold-out public packs must reach the customer detail renderer",
  );
  assert.doesNotMatch(
    impl,
    /if \(!campaign\.openable\) return null;/,
    "sold-out public packs must not be treated as missing campaigns",
  );
  assert.match(
    impl,
    /return publicYnotCampaign\(campaign\);/,
    "sold-out public packs must still use the public projection",
  );
});
```

- [ ] **Step 2: Add open-page source import**

In `Website/scripts/test-pack-open-privacy.mjs`, add this source read after `openRouteSource`:

```js
const gachaOpenPageSource = readFileSync(
  new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url),
  "utf8",
);
```

- [ ] **Step 3: Add public list/detail sold-out tests**

Append these tests to `Website/scripts/test-pack-open-privacy.mjs` after `"customer campaign props hide house logic and internal prize inventory"`:

```js
test("public campaign list keeps sold-out packs visible but hides other not-openable packs", () => {
  const impl = between(
    dataSource,
    "async function getCampaignsImpl",
    "const getPublicCampaignsCached",
  );
  assert.match(
    impl,
    /campaigns\.filter\(\(campaign\) => campaign\.openable \|\| campaign\.soldOut\)/,
  );
  assert.doesNotMatch(
    impl,
    /campaigns\.filter\(\(campaign\) => campaign\.openable\)/,
  );
});

test("non-admin dynamic campaign detail keeps sold-out public packs visible through public DTOs", () => {
  const getCampaignBlock = between(
    dataSource,
    "export async function getCampaign",
    "async function getPaymentMethodsImpl",
  );
  assert.match(
    getCampaignBlock,
    /const customerCampaign = includePrivateDetail \? campaign : publicYnotCampaign\(campaign\);/,
  );
  assert.match(
    getCampaignBlock,
    /if \(!includePrivateDetail && !campaign\.openable && !campaign\.soldOut\) return \[\];/,
  );
  assert.doesNotMatch(
    getCampaignBlock,
    /if \(!includePrivateDetail && !campaign\.openable\) return \[\];/,
  );
});
```

- [ ] **Step 4: Add open route and legacy UI sold-out tests**

Append these tests to `Website/scripts/test-pack-open-privacy.mjs` after `"pack-open browser payload uses public campaign slug and server resolves it internally"`:

```js
test("open page only renders auto-start reveal for openable campaigns", () => {
  assert.match(
    gachaOpenPageSource,
    /if \(campaign && campaign\.openable && autoStart\)/,
  );
  assert.doesNotMatch(
    gachaOpenPageSource,
    /if \(campaign && autoStart\)/,
  );
  assert.match(
    gachaOpenPageSource,
    /if \(campaign\) \{\s*redirect\(`\/packs\/\$\{campaign\.slug\}`\);\s*\}/,
  );
});

test("legacy campaign card and detail disable open actions for sold-out packs", () => {
  const campaignCard = between(
    componentsSource,
    "export function CampaignCard",
    "export function CampaignDetailPanel",
  );
  assert.match(campaignCard, /const soldOut = isCampaignSoldOut\(campaign\);/);
  assert.match(campaignCard, /\{soldOut \? \(/);
  assert.match(campaignCard, />\s*Sold out\s*<\/button>/);
  assert.doesNotMatch(
    campaignCard,
    /<Link className="primary-action" href=\{`\/gacha\/\$\{campaign\.slug\}\/open`\}>\s*Open\s*<\/Link>/,
  );

  const campaignDetailPanel = between(
    componentsSource,
    "export function CampaignDetailPanel",
    "export function RewardTierList",
  );
  assert.match(
    campaignDetailPanel,
    /const soldOut = isCampaignSoldOut\(campaign\);/,
  );
  assert.match(
    campaignDetailPanel,
    /const canOpen =\s*campaign\.demo \|\| \(!soldOut && \(campaign\.openable \|\| isDevAuthAllowed\(\)\)\);/,
  );
  assert.match(
    campaignDetailPanel,
    /const unavailableCopy = soldOut\s*\?\s*"Sold out"\s*:\s*"This pack is not ready to open yet\. Please check back later\.";/,
  );
});
```

- [ ] **Step 5: Run tests and verify failure**

Run from `Website/`:

```bash
npm run test:campaign-detail-privacy
npm run test:pack-open-privacy
```

Expected:

```text
FAIL cached public detail loader returns sold-out campaigns through the public projection
FAIL public campaign list keeps sold-out packs visible but hides other not-openable packs
FAIL non-admin dynamic campaign detail keeps sold-out public packs visible through public DTOs
FAIL open page only renders auto-start reveal for openable campaigns
FAIL legacy campaign card and detail disable open actions for sold-out packs
```

- [ ] **Step 6: Commit failing tests**

```bash
git add Website/scripts/test-campaign-detail-privacy.mjs Website/scripts/test-pack-open-privacy.mjs
git commit -m "Guard sold-out pack visibility behavior before changing loaders" \
  -m "Constraint: sold-out packs must be visible without exposing house stock data or opening exhausted packs." \
  -m "Rejected: only changing UI copy | loaders currently hide the sold-out campaign before the UI can render." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep sold-out visibility separate from openability; opening remains RPC-enforced." \
  -m "Tested: npm run test:campaign-detail-privacy and npm run test:pack-open-privacy fail on the new guards." \
  -m "Not-tested: Implementation not applied yet."
```

---

### Task 2: Widen Public Campaign Readers To Include Sold-Out Packs Safely

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-campaign-detail-privacy.mjs`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Update public campaign list filtering**

In `Website/src/features/ynot/data.ts`, replace the return block in `getCampaignsImpl`:

```ts
    return options.includePrivate
      ? campaigns
      : campaigns.filter((campaign) => campaign.openable);
```

with:

```ts
    return options.includePrivate
      ? campaigns
      : campaigns.filter((campaign) => campaign.openable || campaign.soldOut);
```

- [ ] **Step 2: Bump public campaign list cache key**

In `Website/src/features/ynot/data.ts`, replace:

```ts
  ["ynot-campaigns-public-v2-all"],
```

with:

```ts
  ["ynot-campaigns-public-v3-all"],
```

- [ ] **Step 3: Update cached public detail guard**

In `loadPublicCampaignDetailImpl`, replace:

```ts
  if (!campaign.openable) return null;
  return publicYnotCampaign(campaign);
```

with:

```ts
  if (!campaign.openable && !campaign.soldOut) return null;
  return publicYnotCampaign(campaign);
```

- [ ] **Step 4: Bump public detail cache key**

In `getPublicCampaignDetailCached`, replace:

```ts
    ["ynot-campaign-detail-public-v1", slug],
```

with:

```ts
    ["ynot-campaign-detail-public-v2", slug],
```

- [ ] **Step 5: Update cache comment**

In `getCampaign`, replace this comment text:

```ts
  // never cached or shared. Cache returns null for not-found / not-openable /
  // test packs, which correctly falls through.
```

with:

```ts
  // never cached or shared. Cache returns null for not-found / not-visible /
  // test packs, which correctly falls through.
```

- [ ] **Step 6: Update dynamic non-admin detail guard**

In the dynamic `getCampaign` path, replace:

```ts
    const customerCampaign = includePrivateDetail ? campaign : publicYnotCampaign(campaign);
    if (!includePrivateDetail && !campaign.openable) return [];
    return [customerCampaign];
```

with:

```ts
    const customerCampaign = includePrivateDetail ? campaign : publicYnotCampaign(campaign);
    if (!includePrivateDetail && !campaign.openable && !campaign.soldOut) return [];
    return [customerCampaign];
```

- [ ] **Step 7: Run targeted tests**

Run from `Website/`:

```bash
npm run test:campaign-detail-privacy
npm run test:pack-open-privacy
```

Expected:

```text
npm run test:campaign-detail-privacy: PASS
npm run test:pack-open-privacy: still FAILS only the open-page and legacy UI sold-out tests
```

- [ ] **Step 8: Commit public reader changes**

```bash
git add Website/src/features/ynot/data.ts
git commit -m "Show sold-out public packs through safe campaign DTOs" \
  -m "Constraint: customer data must continue to use publicYnotCampaign and hide internal prize inventory." \
  -m "Rejected: marking sold-out packs closed in the database | the stock truth is already correct and the bug is read filtering." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Public visibility may include sold-out packs; openability must still require campaign.openable." \
  -m "Tested: npm run test:campaign-detail-privacy passes; npm run test:pack-open-privacy has remaining planned UI gate failures." \
  -m "Not-tested: Browser smoke pending UI gate task."
```

---

### Task 3: Prevent Sold-Out Packs From Entering Open Pages Or Legacy Open Links

**Files:**
- Modify: `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`
- Modify: `Website/src/features/ynot/components.tsx`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Gate auto-start reveal by `campaign.openable`**

In `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx`, replace:

```tsx
  if (campaign && autoStart) {
    const tierAnimations = await getTierAnimations();
    return (
      <GachaOpenPanelLazy
        campaign={campaign}
        authenticated={data.viewer.authenticated}
        initialQuantity={initialQuantity}
        tierAnimations={tierAnimations}
        autoStart
        immersive
      />
    );
  }
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
```

with:

```tsx
  if (campaign && campaign.openable && autoStart) {
    const tierAnimations = await getTierAnimations();
    return (
      <GachaOpenPanelLazy
        campaign={campaign}
        authenticated={data.viewer.authenticated}
        initialQuantity={initialQuantity}
        tierAnimations={tierAnimations}
        autoStart
        immersive
      />
    );
  }
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
```

- [ ] **Step 2: Add legacy sold-out helper**

In `Website/src/features/ynot/components.tsx`, insert this helper after `remainingRatioText`:

```tsx
function isCampaignSoldOut(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  return Boolean(campaign.soldOut) || (remainingSlots !== null && remainingSlots <= 0);
}
```

- [ ] **Step 3: Make legacy progress zero for sold-out packs**

In `remainingPercent`, replace:

```tsx
function remainingPercent(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return null;
  return Math.max(
    3,
    Math.min(100, (remainingSlots / Math.max(campaign.totalSlots, 1)) * 100),
  );
}
```

with:

```tsx
function remainingPercent(campaign: YnotCampaign) {
  if (isCampaignSoldOut(campaign)) return 0;
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return null;
  return Math.max(
    3,
    Math.min(100, (remainingSlots / Math.max(campaign.totalSlots, 1)) * 100),
  );
}
```

- [ ] **Step 4: Make legacy remaining text say sold out**

In `remainingRatioText`, replace:

```tsx
function remainingRatioText(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return "Server-tracked stock";
  return `${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
}
```

with:

```tsx
function remainingRatioText(campaign: YnotCampaign) {
  if (isCampaignSoldOut(campaign)) return "Sold out";
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return "Server-tracked stock";
  return `${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
}
```

- [ ] **Step 5: Update legacy campaign card sold-out state**

In `CampaignCard`, after `const remainingSlots = remaining(campaign);`, add:

```tsx
  const soldOut = isCampaignSoldOut(campaign);
```

Then replace the `remainingLabel` block:

```tsx
  const remainingLabel =
    remainingSlots === null
      ? "Stock tracked by server"
      : `Remaining ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
```

with:

```tsx
  const remainingLabel = soldOut
    ? "Sold out"
    : remainingSlots === null
      ? "Stock tracked by server"
      : `Remaining ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
```

Then replace the unconditional open link:

```tsx
        <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>
          Open
        </Link>
```

with:

```tsx
        {soldOut ? (
          <button className="primary-action" type="button" disabled>
            Sold out
          </button>
        ) : (
          <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>
            Open
          </Link>
        )}
```

- [ ] **Step 6: Update legacy detail sold-out state**

In `CampaignDetailPanel`, replace:

```tsx
  const detailTags = campaignDisplayTags(campaign);
  const canOpen =
    campaign.demo || campaign.openable || isDevAuthAllowed();
  const packTitle = campaign.titleTh || campaign.titleEn;
```

with:

```tsx
  const detailTags = campaignDisplayTags(campaign);
  const soldOut = isCampaignSoldOut(campaign);
  const canOpen =
    campaign.demo || (!soldOut && (campaign.openable || isDevAuthAllowed()));
  const unavailableCopy = soldOut
    ? "Sold out"
    : "This pack is not ready to open yet. Please check back later.";
  const packTitle = campaign.titleTh || campaign.titleEn;
```

Then replace the stock stat:

```tsx
          <div className="detail-stat-card detail-stat-card-stock">
            <span>Stock</span>
            <strong>{remainingRatioText(campaign)}</strong>
            <em>Remaining</em>
          </div>
```

with:

```tsx
          <div className="detail-stat-card detail-stat-card-stock">
            <span>Stock</span>
            <strong>{soldOut ? "Sold out" : remainingRatioText(campaign)}</strong>
            <em>{soldOut ? "No packs left" : "Remaining"}</em>
          </div>
```

Then replace the open dock label:

```tsx
          <p className="section-label">Open this pack</p>
```

with:

```tsx
          <p className="section-label">{soldOut ? "Pack sold out" : "Open this pack"}</p>
```

Then replace the disabled message:

```tsx
            <p className="admin-form-message gacha-detail-open-dock-disabled">
              This pack is not ready to open yet. Please check back later.
            </p>
```

with:

```tsx
            <p className="admin-form-message gacha-detail-open-dock-disabled">
              {unavailableCopy}
            </p>
```

- [ ] **Step 7: Run targeted tests**

Run from `Website/`:

```bash
npm run test:pack-open-privacy
```

Expected:

```text
PASS
```

- [ ] **Step 8: Commit open gate and legacy UI changes**

```bash
git add 'Website/src/app/(store)/gacha/[campaignId]/open/page.tsx' Website/src/features/ynot/components.tsx
git commit -m "Block sold-out packs from open entrypoints" \
  -m "Constraint: sold-out packs should be visible but never enter the opening flow." \
  -m "Rejected: relying only on client-side GachaOpenPanel guard | server route can redirect sold-out open URLs before rendering a blank reveal host." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: New open links must check campaign.openable, not only campaign existence." \
  -m "Tested: npm run test:pack-open-privacy passes." \
  -m "Not-tested: Full browser smoke pending."
```

---

### Task 4: Verify Reward History, Collection, And Public Image Data Calling

**Files:**
- Test: `Website/scripts/test-subsku-image-routing.mjs`
- Test: `Website/scripts/test-pack-open-privacy.mjs`
- Test: `Website/scripts/test-campaign-detail-privacy.mjs`

- [ ] **Step 1: Run public DTO and image routing tests**

Run from `Website/`:

```bash
npm run test:subsku-images
npm run test:pack-open-privacy
npm run test:campaign-detail-privacy
```

Expected:

```text
npm run test:subsku-images: PASS
npm run test:pack-open-privacy: PASS
npm run test:campaign-detail-privacy: PASS
```

These tests prove:

- Pack detail prize lineups prefer linked sub-SKU images.
- Pack opening reveal uses awarded stock-unit images without exposing prize unit IDs.
- Reward history uses `stockImageUrlByOpenItemId`.
- Collection uses collection item action tokens instead of raw UUIDs.
- Customer DTOs do not expose cert identifiers, raw open IDs, reward IDs, campaign IDs, weights, unlock percentages, or stock unit IDs.

- [ ] **Step 2: Run typecheck**

Run from `Website/`:

```bash
npm run typecheck
```

Expected:

```text
PASS
```

- [ ] **Step 3: Run production DB readiness check**

Run from `Website/`:

```bash
npm run verify:production-db
```

Expected:

```text
PASS store_categories
PASS draw_round_categories
PASS draw_round_prize_units
PASS seed_runs
PASS rpc get_draw_round_inventory_summary
PASS legacy cards.tone removed
PASS legacy draw_round_prizes.tone removed
```

- [ ] **Step 4: Commit verification-only checkpoint if tests required no edits**

If Task 4 required no file edits, do not create a commit. Record the command outputs in the final implementation report.

---

### Task 5: Browser And Production Smoke Checks

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Build locally**

Run from `Website/`:

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 2: Start local server**

Run from `Website/`:

```bash
npm run dev -- --port 3022
```

Expected:

```text
Local: http://localhost:3022
```

- [ ] **Step 3: Smoke `/packs`**

Open:

```text
http://localhost:3022/packs
```

Expected visual result:

- A sold-out public pack is still visible in the pack grid.
- The card says `Sold out`.
- The card does not show an enabled `Open` button.
- Active packs still show normal remaining stock and open actions.

- [ ] **Step 4: Smoke `/packs/op2000coins`**

Open:

```text
http://localhost:3022/packs/op2000coins
```

Expected visual result:

- Page renders `one piece two piece`.
- Hero/dock says `Sold out`.
- No enabled open button appears.
- Prize lineup still renders public-safe prize card images.

- [ ] **Step 5: Smoke `/gacha/op2000coins`**

Open:

```text
http://localhost:3022/gacha/op2000coins
```

Expected visual result:

- Page renders pack detail instead of `Campaign not found`.
- Stock field says `Sold out`.
- Open dock says `Sold out`.
- No enabled open quantity links appear.

- [ ] **Step 6: Smoke sold-out open URL**

Open:

```text
http://localhost:3022/gacha/op2000coins/open?qty=1&auto=1
```

Expected result:

- Browser redirects to `/packs/op2000coins`.
- Reveal animation does not start.
- No network request to `/api/ynot/gacha/open` is fired by page auto-start.

- [ ] **Step 7: Smoke collection and history**

Open while logged in as the same test/admin user:

```text
http://localhost:3022/collection
```

Expected visual result:

- Collection cards still load.
- Reward images use existing sub-SKU images where present.
- No raw IDs, cert numbers, stock unit IDs, or internal open IDs are visible in the UI.

- [ ] **Step 8: Production curl smoke after deploy**

After deployment, run:

```bash
curl -s https://www.ynotopen.com/packs/op2000coins | rg -i "one piece two piece|sold out|pack not found"
curl -s https://www.ynotopen.com/gacha/op2000coins | rg -i "one piece two piece|sold out|campaign not found"
```

Expected:

```text
one piece two piece
Sold out
```

The output must not include:

```text
Pack not found
Campaign not found
Missing campaign
```

---

## Final Verification Checklist

- [ ] `npm run test:campaign-detail-privacy` passes.
- [ ] `npm run test:pack-open-privacy` passes.
- [ ] `npm run test:subsku-images` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run verify:production-db` passes.
- [ ] Local `/packs` shows sold-out packs as disabled.
- [ ] Local `/packs/op2000coins` shows `Sold out`.
- [ ] Local `/gacha/op2000coins` shows `Sold out`.
- [ ] Local `/gacha/op2000coins/open?qty=1&auto=1` redirects to `/packs/op2000coins`.
- [ ] Production `/packs/op2000coins` shows `Sold out` after deploy.
- [ ] Production `/gacha/op2000coins` shows `Sold out` after deploy.
- [ ] No code path exposes house odds, stock target SKUs, raw campaign IDs, prize unit IDs, card stock unit IDs, cert identifiers, raw open IDs, raw reward IDs, or raw collection item IDs.

## Self-Review

Spec coverage:

- Sold-out public pack list visibility is covered by Task 2.
- Sold-out public pack detail visibility is covered by Task 2.
- Sold-out visibility on every customer pack-related page is covered by Task 3, including older `CampaignCard` surfaces and `/gacha/:slug` detail.
- Legacy `/gacha/:slug` detail behavior is covered by Task 3.
- Open route safety is covered by Task 3.
- Reward and collection data-calling privacy is covered by Task 4.
- Production-facing smoke checks are covered by Task 5.

Placeholder scan:

- The plan contains no unresolved labels, deferred implementation notes, or unspecified test cases.

Type consistency:

- All snippets use existing `YnotCampaign`, `campaign.openable`, `campaign.soldOut`, `publicYnotCampaign`, `getCampaignsImpl`, `loadPublicCampaignDetailImpl`, `getCampaign`, `GachaOpenPage`, `CampaignCard`, and `CampaignDetailPanel` names.
- New helper name `isCampaignSoldOut` is introduced in Task 3 before use in `CampaignCard` and `CampaignDetailPanel`.
