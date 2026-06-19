# Pull All Switch And Customer Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pull All visually obvious in admin, expose real Pull All on every customer pull surface, and stop normal pack opens from hitting the one-minute wait during human continuous play.

**Architecture:** Admin state uses one shared lighted switch component inside `Website/src/features/ynot/client.tsx` with CSS in `Website/src/app/globals.css`. Customer Pull All must be separate from normal `x1/x10/x100` quantity selection: quote with `/api/ynot/gacha/bulk-open/quote`, confirm the returned `targetRewards` and `totalCostCoins`, then start with `/api/ynot/gacha/bulk-open/start`. Normal repeated opens keep using `/api/ynot/gacha/open`, but with wider per-minute request/unit limits.

**Tech Stack:** Next.js App Router, React 19 client components, Supabase RPC-backed API routes, Node test scripts.

---

### Task 1: Admin Pull All Switch Clarity

**Files:**
- Modify: `Website/scripts/test-bulk-open-admin-flow.mjs`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/globals.css`

- [ ] **Step 1: Write the failing test**

Update `Website/scripts/test-bulk-open-admin-flow.mjs` so the Pack Studio test requires a reusable lighted switch:

```js
assert.match(clientSource, /function PullAllSwitchButton/);
assert.match(clientSource, /pull-all-switch-button/);
assert.match(clientSource, /pull-all-status-light/);
assert.match(clientSource, /pull-all-switch-text/);
assert.match(clientSource, /pullAllEnabled \? "Pull All open" : "Pull All closed"/);
assert.match(clientSource, /pullAllEnabled \? "Turn Pull All off" : "Turn Pull All on"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website && npm run test:bulk-open-admin-flow
```

Expected: FAIL because `PullAllSwitchButton` and the new CSS class names do not exist yet.

- [ ] **Step 3: Implement the switch**

Add `PullAllSwitchButton` near shared client helpers in `Website/src/features/ynot/client.tsx`, then replace the Pack Studio, owner review, and quick edit Pull All checkbox/toggles with it. The component must set `aria-pressed`, show `ON`/`OFF`, and render a `.pull-all-status-light`.

- [ ] **Step 4: Add CSS**

Add `.pull-all-switch-button`, `.pull-all-status-light`, `.pull-all-switch-track`, `.pull-all-switch-thumb`, `.pull-all-switch-text`, and active/off variants to `Website/src/app/globals.css`.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd Website && npm run test:bulk-open-admin-flow
```

Expected: PASS.

### Task 2: Real Customer Pull All Flow

**Files:**
- Modify: `Website/scripts/test-pack-opening-flow.mjs`
- Modify: `Website/scripts/test-pack-open-pull-contract.mjs`
- Modify: `Website/src/features/ynot/cr/YPackExperience.tsx`
- Modify: `Website/src/features/ynot/cr/PackDetailArena.tsx`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/GachaRevealOverlay.tsx`
- Modify: `Website/src/app/globals.css`

- [ ] **Step 1: Write failing tests for the screenshot bug**

In `Website/scripts/test-pack-opening-flow.mjs`, require the customer pack list modal to import/use `pullAllQuantity`, render a separate `cr-pull-all-action`, call `/api/ynot/gacha/bulk-open/quote`, and start with `/api/ynot/gacha/bulk-open/start`.

In `Website/scripts/test-pack-open-pull-contract.mjs`, require `GachaOpenPanel` to include Pull All in repeat options from updated `remainingState` and require `GachaRevealOverlay` to treat Pull All options as distinct from normal quantity options.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd Website && npm run test:pack-opening-flow && npm run test:pack-open-pull-contract
```

Expected: FAIL because customer UI only has normal quantity selection and the reveal overlay does not receive a Pull All option.

- [ ] **Step 3: Implement shared customer Pull All client flow**

Create local helpers in the client components that:

```ts
type BulkOpenQuote = {
  startToken: string;
  targetRewards: number;
  totalCostCoins: number;
  costPerReward: number;
  expiresAt: string;
};
```

Quote:

```ts
const quotePayload = await postJson("/api/ynot/gacha/bulk-open/quote", {
  campaignId: campaign.slug,
});
```

Start:

```ts
const startedPayload = await postJson("/api/ynot/gacha/bulk-open/start", {
  startToken: quote.startToken,
});
```

After start, navigate the user to `/collection` or `/profile/all-pulls` so the existing `BulkOpenBagStatus` can show progress.

- [ ] **Step 4: Keep Pull All visually separate from x100**

In `PackDetailArena` and `YPackExperience`, do not set the normal `qty` to Pull All. The Pull All button should open its own quote confirmation showing `targetRewards` and `totalCostCoins`, so x100 cannot stay active when All is selected.

- [ ] **Step 5: Add Pull All to repeated open flow**

In `GachaOpenPanel`, compute the post-open Pull All availability from `remainingState`. Pass a distinct option to `GachaRevealOverlay` with `kind: "pull_all"` or an equivalent flag, and have the overlay trigger the Pull All quote/start callback instead of normal `onOpenAgain`.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd Website && npm run test:pack-opening-flow && npm run test:pack-open-pull-contract && npm run test:bulk-open-api-flow && npm run test:bulk-open-bag-ui
```

Expected: PASS.

### Task 3: Continuous Normal Open Rate Limit

**Files:**
- Modify: `Website/scripts/test-rate-limit-config.mjs`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`

- [ ] **Step 1: Write failing test**

Update `Website/scripts/test-rate-limit-config.mjs` so normal gacha open limits are:

```js
limit: 120
limit: 1_200
limit: 6_000
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd Website && npm run test:rate-limits
```

Expected: FAIL because the current route uses `30`, `120`, and `600`.

- [ ] **Step 3: Implement new limits**

In `Website/src/app/api/ynot/gacha/open/route.ts`, change:

```ts
limit: 30
limit: 120
limit: 600
```

to:

```ts
limit: 120
limit: 1_200
limit: 6_000
```

Keep the weighted `cost: quantity` enforcement.

- [ ] **Step 4: Run rate-limit and launch-safety tests**

Run:

```bash
cd Website && npm run test:rate-limits && npm run test:gacha-open-launch-safety
```

Expected: PASS.

### Task 4: Browser Verification

**Files:**
- Verify only unless a bug is found.

- [ ] **Step 1: Start local dev server**

Run:

```bash
cd Website && YNOT_ENABLE_DEV_AUTH=true NEXT_PUBLIC_ENABLE_LINE_LOGIN=false npm run dev
```

- [ ] **Step 2: Verify admin switch**

Open admin campaign create/edit surfaces and click Pull All on/off. Expected: clear ON/OFF text and status light, no ambiguous small pill.

- [ ] **Step 3: Verify customer Pull All**

Open `/packs`, `/packs/[slug]`, and repeat open overlay. Expected: Pull All is visible anywhere the customer can pull when the pack qualifies; clicking it opens Pull All quote confirmation with all target rewards and correct total cost; x100 is not simultaneously active.

- [ ] **Step 4: Verify normal continuous pulls**

Open a test pack repeatedly. Expected: normal opens do not show the one-minute wait under realistic manual play.
