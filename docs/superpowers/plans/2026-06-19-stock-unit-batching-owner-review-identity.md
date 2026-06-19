# Stock Unit Batching and Owner Review Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent large customer bags from losing stock-unit enrichment and make admin owner-review prize rows stable, warning-safe, and unambiguous.
**Architecture:** Add one shared batched `card_stock_units` reader for customer collection, pull history, and shipping data hydration. Add explicit owner-review row identity helpers so React render identity is unique, backend override identity remains compatible, and duplicate backend prize IDs cannot silently share editable state.
**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/PostgREST, Node test runner scripts, Chrome browser QA.

---

## Scope Check

This fix covers two related findings from the latest GitHub-main review and browser/code inspection:

1. Large customer accounts can make a single oversized PostgREST `.in("id", stockUnitIds)` request against `card_stock_units`, causing `ynot_data_read_unavailable` errors such as `collection_stock_units` or missing pull-history stock-unit images.
2. Admin owner-review tables can render duplicate React keys, and the deeper risk is that `cardEdits` is keyed by `prize.id`, so duplicate backend prize identities can collide when odds edits are applied.

The implementation keeps backend payload compatibility: `overrides.byCard` remains keyed by backend prize identity. The UI gets separate render identity and blocks ambiguous per-row edits when duplicate backend IDs are present.

## File Structure

Modify these files:

```text
Website/src/features/ynot/data.ts
Website/src/features/ynot/client.tsx
Website/scripts/test-bulk-open-admin-flow.mjs
Website/scripts/test-gacha-dedup.mjs
Website/scripts/test-last-prize-stock-link.mjs
Website/scripts/test-pack-open-pull-contract.mjs
Website/scripts/test-subsku-image-routing.mjs
```

No database migration is required.

## Task 1: Lock Large Stock-Unit Read Regressions

- [ ] Update source-level regression tests before or alongside implementation so direct oversized `card_stock_units` reads cannot return.

In `Website/scripts/test-gacha-dedup.mjs`, ensure `getGachaOpenHistory` goes through the helper:

```js
test("getGachaOpenHistory batches stock-unit image lookups instead of one large PostgREST filter", () => {
  const match = dataSource.match(/export async function getGachaOpenHistory[\s\S]*?(?=\nexport async function|\nfunction get)/);
  assert.ok(match, "getGachaOpenHistory source should be present");
  assert.match(match[0], /readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/);
  assert.doesNotMatch(match[0], /\.from\("card_stock_units"\)[\s\S]*?\.in\("id", stockUnitIds\)/);
});
```

In `Website/scripts/test-subsku-image-routing.mjs`, assert all three customer hydration paths use the helper:

```js
test("stock-unit enrichment uses the batched reader on customer collection, history, and shipping paths", () => {
  assert.match(dataSource, /const collectionStockRows = await readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/);
  assert.match(dataSource, /const stockUnitRows = await readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/);
  assert.match(dataSource, /const stockRows = await readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/);
  assert.match(dataSource, /const stockImage = stockUnitId \? stockImageByUnitId\.get\(stockUnitId\) : null;/);
});
```

In `Website/scripts/test-last-prize-stock-link.mjs`, replace any assertion that expects a direct `card_stock_units` query in customer code with:

```js
assert.match(
  dataSource,
  /readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/,
  "customer stock-unit enrichment should use the batched reader",
);
```

In `Website/scripts/test-pack-open-pull-contract.mjs`, replace direct-read expectations with:

```js
assert.match(
  dataSource,
  /readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/,
  "pull contract hydration should use the batched stock-unit reader",
);
```

Run:

```bash
cd Website
npm run test:subsku-images
npm run test:gacha-dedup
npm run test:last-prize-stock-link
npm run test:pack-open-pull-contract
```

Expected before implementation:

```text
At least one assertion fails because one or more customer paths still perform direct card_stock_units .in("id", ...) reads or do not expose the shared helper.
```

Expected after implementation:

```text
All four test scripts pass.
```

## Task 2: Implement Batched `card_stock_units` Reads

- [ ] Add a bounded helper in `Website/src/features/ynot/data.ts`.

Place this near existing read helpers:

```ts
const CARD_STOCK_UNIT_ID_BATCH_SIZE = 250;

async function readCardStockUnitRowsByIds<T>(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  label: string,
  stockUnitIds: Iterable<string>,
  select: string,
): Promise<T[]> {
  const uniqueIds = [...new Set([...stockUnitIds].filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  const rows: T[] = [];
  for (let i = 0; i < uniqueIds.length; i += CARD_STOCK_UNIT_ID_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + CARD_STOCK_UNIT_ID_BATCH_SIZE);
    const batchRows = await readSupabaseRows<T>(
      `${label}_batch_${Math.floor(i / CARD_STOCK_UNIT_ID_BATCH_SIZE) + 1}`,
      async () => {
        const { data, error } = await supabase
          .from("card_stock_units")
          .select(select)
          .in("id", batch);
        return { data: (data ?? []) as T[], error };
      },
    );
    rows.push(...batchRows);
  }

  return rows;
}
```

- [ ] Replace collection stock-unit enrichment with the helper.

Use this structure where collection stock-unit images and won-unit identity are hydrated:

```ts
const collectionStockRows = await readCardStockUnitRowsByIds<{
  id: string;
  card_id: string | null;
  grade: string | null;
  condition: string | null;
  grading_service: string | null;
  image_url: string | null;
}>(
  supabase,
  "collection_stock_units",
  collectionRows.map((item) => item.card_stock_unit_id).filter(Boolean) as string[],
  "id,card_id,grade,condition,grading_service,image_url",
);

const stockImageByUnitId = new Map(
  collectionStockRows
    .filter((row) => row.id && row.image_url)
    .map((row) => [row.id, row.image_url as string]),
);
```

- [ ] Replace pull-history stock-unit image hydration with the helper.

Use this structure inside `getGachaOpenHistory` after collecting `stockUnitIds`:

```ts
const stockUnitRows = await readCardStockUnitRowsByIds<{
  id: string;
  card_id: string | null;
  image_url: string | null;
}>(
  supabase,
  "gacha_history_stock_unit_images",
  stockUnitIds,
  "id, card_id, image_url",
);
```

- [ ] Replace shipping stock-unit image hydration with the helper.

Use this structure where shipping rows are enriched:

```ts
const stockRows = await readCardStockUnitRowsByIds<{
  id: string;
  card_id: string | null;
  image_url: string | null;
}>(
  supabase,
  "shipping_stock_unit_images",
  shippingStockUnitIds,
  "id, card_id, image_url",
);
```

- [ ] Verify the stock-unit batching change.

Run:

```bash
cd Website
npm run test:subsku-images
npm run test:gacha-dedup
npm run test:last-prize-stock-link
npm run test:pack-open-pull-contract
```

Expected:

```text
All selected test suites pass.
No test expects a direct customer-facing .from("card_stock_units").in("id", allIds) request.
```

## Task 3: Lock Owner-Review Identity Regression

- [ ] Strengthen `Website/scripts/test-bulk-open-admin-flow.mjs` so it verifies render keys and edit keys are deliberate.

Add or replace the owner-review key assertion with:

```js
test("admin owner review separates render keys from editable override keys", () => {
  assert.match(clientSource, /function ownerReviewPrizeRowKey\(/);
  assert.match(clientSource, /function ownerReviewPrizeEditKey\(/);
  assert.match(clientSource, /function ownerReviewDuplicatePrizeIds\(/);
  assert.match(clientSource, /const duplicatePrizeIds = useMemo\(\(\) => ownerReviewDuplicatePrizeIds\(prizes\), \[prizes\]\);/);
  assert.match(clientSource, /rows\.map\(\(prize, index\) =>/);
  assert.match(clientSource, /const editKey = ownerReviewPrizeEditKey\(prize\);/);
  assert.match(clientSource, /<tr key=\{ownerReviewPrizeRowKey\(prize, index\)\}>/);
  assert.match(clientSource, /updateCardEdit\(editKey,/);
  assert.match(clientSource, /duplicatePrizeIds\.has\(editKey\)/);
  assert.doesNotMatch(clientSource, /<tr key=\{prize\.id\}>/);
  assert.doesNotMatch(clientSource, /updateCardEdit\(prize\.id,/);
});
```

Run:

```bash
cd Website
npm run test:bulk-open-admin-flow
```

Expected before implementation:

```text
The test fails because owner-review rendering still keys or edits directly by prize.id without duplicate-id handling.
```

Expected after implementation:

```text
The test passes.
```

## Task 4: Implement Owner-Review Row and Edit Identity

- [ ] Add helper functions in `Website/src/features/ynot/client.tsx`.

Place these near `type OwnerReviewCardEdit`:

```tsx
function ownerReviewPrizeRowKey(prize: YnotPrizePreview, index: number) {
  const stableId = prize.id || prize.cardId || prize.cardCode || prize.cardName || "prize";
  return `${stableId}-${prize.tier || "tier"}-${prize.rank || index + 1}-${index}`;
}

function ownerReviewPrizeEditKey(prize: YnotPrizePreview) {
  return prize.id;
}

function ownerReviewDuplicatePrizeIds(prizes: YnotPrizePreview[]) {
  const counts = new Map<string, number>();
  for (const prize of prizes) {
    if (!prize.id) {
      continue;
    }
    counts.set(prize.id, (counts.get(prize.id) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
}
```

- [ ] Compute duplicate backend IDs in the owner-review component.

Inside the component that has `prizes`, `cardEdits`, `updateCardEdit`, and the owner-review table, add:

```tsx
const duplicatePrizeIds = useMemo(() => ownerReviewDuplicatePrizeIds(prizes), [prizes]);
```

- [ ] Keep effective-prize edits keyed by backend identity.

Update the effective-prize mapping to derive the edit key through the helper:

```tsx
const effectivePrizes = useMemo(() => {
  return prizes.map((prize) => {
    const editKey = ownerReviewPrizeEditKey(prize);
    const edit = cardEdits[editKey];
    if (!edit) {
      return prize;
    }
    return {
      ...prize,
      initialQuantity: edit.quantity ?? prize.initialQuantity,
      weight: edit.weight ?? prize.weight,
    };
  });
}, [cardEdits, prizes]);
```

- [ ] Render a warning when duplicate backend IDs make per-row edits ambiguous.

Place this above the prize table:

```tsx
{duplicatePrizeIds.size > 0 ? (
  <div className="row-sub">
    Some owner-review rows share the same prize identity. Per-row odds edits are disabled for those rows until the prize identities are repaired.
  </div>
) : null}
```

- [ ] Update the table row mapping to separate render identity from edit identity.

Change the row loop to:

```tsx
{rows.map((prize, index) => {
  const editKey = ownerReviewPrizeEditKey(prize);
  const isDuplicatePrizeId = duplicatePrizeIds.has(editKey);
  const editable = logicMode !== "pure_random" && !isDuplicatePrizeId;
  const duplicateTitle = isDuplicatePrizeId
    ? "Duplicate prize identity. Edit this prize from the pack builder or repair the prize identity before changing odds here."
    : undefined;

  return (
    <tr key={ownerReviewPrizeRowKey(prize, index)}>
      {/* existing cells stay in the same order */}
```

Within the quantity input, use `editKey` and block ambiguous duplicate edits:

```tsx
<input
  type="number"
  min={0}
  value={prize.initialQuantity}
  disabled={!editable}
  title={duplicateTitle}
  onChange={(event) => {
    if (!editable) {
      return;
    }
    updateCardEdit(editKey, { quantity: Math.max(0, Number(event.target.value) || 0) });
  }}
/>
```

Within the weight input, use `editKey` and block ambiguous duplicate edits:

```tsx
<input
  type="number"
  min={0}
  step="0.01"
  value={prize.weight}
  disabled={!editable}
  title={duplicateTitle}
  onChange={(event) => {
    if (!editable) {
      return;
    }
    updateCardEdit(editKey, { weight: Math.max(0, Number(event.target.value) || 0) });
  }}
/>
```

Close the row loop with the existing JSX structure:

```tsx
    </tr>
  );
})}
```

Backend compatibility is preserved because `updateCardEdit(editKey, ...)` still writes `cardEdits` by backend prize ID, and submit continues to send:

```tsx
overrides: { byCard: cardEdits },
```

- [ ] Verify the owner-review identity change.

Run:

```bash
cd Website
npm run test:bulk-open-admin-flow
```

Expected:

```text
The owner-review identity regression test passes.
The client no longer renders <tr key={prize.id}>.
The client no longer calls updateCardEdit(prize.id, ...).
Duplicate backend prize IDs are visible and non-editable instead of silently sharing state.
```

## Task 5: Full Local Verification

- [ ] Run focused source-level tests.

```bash
cd Website
npm run test:bulk-open-admin-flow
npm run test:subsku-images
npm run test:gacha-dedup
npm run test:last-prize-stock-link
npm run test:pack-open-pull-contract
```

Expected:

```text
All selected test scripts pass.
```

- [ ] Run project static checks.

```bash
cd Website
npm run typecheck
npm run lint
```

Expected:

```text
TypeScript exits 0.
ESLint exits 0.
```

- [ ] Start the local website with dev auth for browser QA.

```bash
cd Website
NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
NEXT_PUBLIC_ENABLE_LINE_LOGIN=false \
YNOT_ENABLE_DEV_AUTH=true \
YNOT_PREVIEW_PROFILE_ID=0b4b31a9-a59d-4f59-8bff-ceea74537989 \
npm run dev
```

Expected:

```text
Next.js dev server starts on http://localhost:3000.
```

- [ ] Use Chrome to verify customer collection, all pulls, and shipping flows.

Open these paths step by step:

```text
http://localhost:3000/api/dev/preview-auth?mode=on&next=/collection
http://localhost:3000/collection
http://localhost:3000/profile/all-pulls
http://localhost:3000/shipping
```

Expected browser and terminal evidence:

```text
Collection renders for the large customer profile.
All Pulls renders pull-history cards.
Shipping renders available shippable items.
No browser console error contains collection_stock_units.
No browser console error contains gacha_history_stock_unit_images.
No network response for these pages is 400, 500, or 502.
```

- [ ] Use Chrome to verify admin owner-review edit flow.

Open the admin edit path that showed the React key warning during review:

```text
http://localhost:3000/api/dev/preview-auth?mode=on&next=/admin/campaigns/d045cc0a-679d-4f4c-8329-bc14d5ef8408/edit
```

Click through:

```text
Admin campaign edit page
Instant gacha / pack configuration section
Owner-review or prize-edit table
Quantity input on a non-duplicate row
Weight input on a non-duplicate row
Save or review action that posts overrides
```

Expected browser and terminal evidence:

```text
No React console warning contains "Encountered two children with the same key".
Rows with duplicate backend prize IDs, if present, show the duplicate-identity warning and have disabled per-row odds inputs.
Rows without duplicate backend prize IDs remain editable.
Save/review requests keep overrides.byCard keyed by backend prize IDs.
No API response for lifecycle or live-revisions owner-review calls is 400 or 500.
```

## Task 6: Final Review and Commit

- [ ] Inspect changed files.

```bash
git diff -- Website/src/features/ynot/data.ts Website/src/features/ynot/client.tsx Website/scripts/test-bulk-open-admin-flow.mjs Website/scripts/test-gacha-dedup.mjs Website/scripts/test-last-prize-stock-link.mjs Website/scripts/test-pack-open-pull-contract.mjs Website/scripts/test-subsku-image-routing.mjs
```

Expected:

```text
Diff only contains the stock-unit batching fix, owner-review identity fix, and focused regression tests.
No unrelated formatting churn is present.
```

- [ ] Stage the final files.

```bash
git add \
  Website/src/features/ynot/data.ts \
  Website/src/features/ynot/client.tsx \
  Website/scripts/test-bulk-open-admin-flow.mjs \
  Website/scripts/test-gacha-dedup.mjs \
  Website/scripts/test-last-prize-stock-link.mjs \
  Website/scripts/test-pack-open-pull-contract.mjs \
  Website/scripts/test-subsku-image-routing.mjs
```

- [ ] Commit with the repo Lore protocol.

```bash
git commit -m "$(cat <<'MSG'
Keep large bag hydration and owner review edits bounded

Constraint: Supabase/PostgREST rejects oversized stock-unit id filters, and owner-review overrides are keyed by backend prize identity.
Rejected: Silencing React keys with array-only identity | it hides duplicate backend edit keys and can mask owner-review state collisions.
Confidence: high
Scope-risk: moderate
Directive: Keep customer stock-unit enrichment batched and keep owner-review render identity separate from backend override identity.
Tested: npm run test:bulk-open-admin-flow; npm run test:subsku-images; npm run test:gacha-dedup; npm run test:last-prize-stock-link; npm run test:pack-open-pull-contract; npm run typecheck; npm run lint
Not-tested: production owner-review mutation
MSG
)"
```

Expected:

```text
Commit succeeds with a Lore-formatted message.
```

## Rollback Plan

- [ ] If stock-unit batching causes an unexpected customer-data regression, revert the `readCardStockUnitRowsByIds` call-site changes while keeping the tests red as evidence that a bounded alternative is still required.
- [ ] If owner-review duplicate-id blocking prevents a legitimate admin workflow, keep `ownerReviewPrizeRowKey` and replace the duplicate-id disabled state with a backend-supported per-row identity contract. Do not return to shared `cardEdits[prize.id]` edits for duplicate rows.

## Completion Criteria

- [ ] Large customer collection opens locally without `collection_stock_units` read failures.
- [ ] All Pulls and Shipping pages keep stock-unit-specific images without oversized `card_stock_units` filters.
- [ ] Admin owner-review pages no longer emit duplicate React key warnings.
- [ ] Duplicate backend prize IDs cannot silently share editable row state.
- [ ] Focused Node tests pass.
- [ ] Typecheck and lint pass.
- [ ] Chrome QA covers customer collection, all pulls, shipping, and admin owner-review save/review paths.
