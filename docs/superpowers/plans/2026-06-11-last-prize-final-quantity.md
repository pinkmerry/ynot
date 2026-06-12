# Last Prize Final Quantity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `x10` and `x100` pulls to finish a pack and include Last Prize when the pull consumes the final slot, without exposing private stock or house logic.

**Architecture:** Keep `open_gacha_campaign` as the source of truth for awarding rewards. Fix the public-safe availability summary and UI quantity gates so they agree with the RPC's final-slot Last Prize rule. Expose only aggregate allowed/openable counts, never raw stock IDs, prize weights, selected private metadata, or internal owner logic.

**Tech Stack:** Next.js/React, TypeScript, Node test runner, Supabase Postgres migrations, Supabase RPC, Cloudflare Worker deployment.

---

## File Structure

- Modify: `Website/src/features/ynot/open-quantity.ts`
  - Add pure helpers for final-prize-aware openable counts and UI quantity gating.
- Modify: `Website/src/features/ynot/prize-readiness.ts`
  - Use the shared helper when calculating `availablePrizeUnits` and `eligiblePrizeUnits` for Last Prize packs.
- Modify: `Website/src/features/ynot/client.tsx`
  - Replace local duplicate `remainingOpenUnits` math with the shared public-safe helper.
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
  - Disable quantity buttons using the same public-safe openability limit as the reveal page.
- Modify: `Website/src/features/ynot/cr/YPackExperience.tsx`
  - Disable quantity buttons using the same public-safe openability limit as the reveal page.
- Create: `Website/scripts/test-final-open-quantity.mjs`
  - Unit tests for final-slot `x10` and `x100` openability.
- Modify: `Website/scripts/test-pack-opening-flow.mjs`
  - Contract tests that the pack detail, Y-Pack modal, and reveal page all use the same helper.
- Modify: `Website/package.json`
  - Add `test:final-open-quantity`.
- Create via Supabase CLI: `Database/supabase/migrations/<generated>_last_prize_final_quantity_summary.sql`
  - Recreate `public.get_draw_round_inventory_summary` with final-slot-aware aggregate counts.

The implementation should not add new public fields unless the helper/count approach proves insufficient. The preferred path is to keep using existing `remainingSlots`, `availableWinSlots`, and `eligibleUnits`.

---

### Task 1: Lock The Final Quantity Rules With Tests

**Files:**
- Create: `Website/scripts/test-final-open-quantity.mjs`
- Modify: `Website/package.json`
- Modify: `Website/scripts/test-pack-opening-flow.mjs`

- [ ] **Step 1: Add the failing helper test file**

Create `Website/scripts/test-final-open-quantity.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function transpile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const openQuantityModule = { exports: {} };
vm.runInNewContext(transpile("../src/features/ynot/open-quantity.ts"), {
  exports: openQuantityModule.exports,
  module: openQuantityModule,
  require,
});

const {
  finalPrizeAwareOpenableWinSlots,
  openQuantityLimit,
  isOpenQuantityAvailable,
} = openQuantityModule.exports;

test("final prize counts for x10 only when the pull can finish the pack", () => {
  assert.equal(
    finalPrizeAwareOpenableWinSlots({
      remainingSlots: 10,
      normalOpenableWinSlots: 9,
      finalPrizeAvailableUnits: 1,
    }),
    10,
  );
  assert.equal(
    isOpenQuantityAvailable(10, {
      remainingSlots: 10,
      eligiblePrizeUnits: 10,
    }),
    true,
  );
});

test("final prize counts for x100 only when the pull can finish the pack", () => {
  assert.equal(
    finalPrizeAwareOpenableWinSlots({
      remainingSlots: 100,
      normalOpenableWinSlots: 99,
      finalPrizeAvailableUnits: 1,
    }),
    100,
  );
  assert.equal(
    isOpenQuantityAvailable(100, {
      remainingSlots: 100,
      eligiblePrizeUnits: 100,
    }),
    true,
  );
});

test("final prize does not make x100 available when x100 cannot reach the final slot", () => {
  assert.equal(
    finalPrizeAwareOpenableWinSlots({
      remainingSlots: 150,
      normalOpenableWinSlots: 99,
      finalPrizeAvailableUnits: 1,
    }),
    99,
  );
  assert.equal(
    isOpenQuantityAvailable(100, {
      remainingSlots: 150,
      eligiblePrizeUnits: 99,
    }),
    false,
  );
});

test("quantity limit uses the safest public aggregate count", () => {
  assert.equal(
    openQuantityLimit({
      remainingSlots: 10,
      eligiblePrizeUnits: 9,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    9,
  );
  assert.equal(
    openQuantityLimit({
      remainingSlots: 10,
      eligiblePrizeUnits: 10,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    10,
  );
});

test("negative and missing counts fail closed without exposing why", () => {
  assert.equal(
    openQuantityLimit({
      remainingSlots: 10,
      eligiblePrizeUnits: -5,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    0,
  );
  assert.equal(
    openQuantityLimit({
      remainingSlots: undefined,
      eligiblePrizeUnits: undefined,
      availableWinSlots: undefined,
      availablePrizeUnits: undefined,
    }),
    Number.POSITIVE_INFINITY,
  );
});
```

- [ ] **Step 2: Add the package script**

In `Website/package.json`, add this script in the existing `scripts` object near the other gacha tests:

```json
"test:final-open-quantity": "node --test scripts/test-final-open-quantity.mjs"
```

- [ ] **Step 3: Extend the existing pack-opening contract test**

Append this test to `Website/scripts/test-pack-opening-flow.mjs`:

```js
test("all public pull surfaces share the same open quantity availability helper", () => {
  const openQuantity = read("src/features/ynot/open-quantity.ts");
  const client = read("src/features/ynot/client.tsx");
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const ypack = read("src/features/ynot/cr/YPackExperience.tsx");

  assert.match(openQuantity, /export function openQuantityLimit/);
  assert.match(openQuantity, /export function isOpenQuantityAvailable/);
  assert.match(client, /openQuantityLimit/);
  assert.match(client, /isOpenQuantityAvailable/);
  assert.match(detail, /openQuantityLimit/);
  assert.match(detail, /isOpenQuantityAvailable/);
  assert.match(ypack, /openQuantityLimit/);
  assert.match(ypack, /isOpenQuantityAvailable/);

  for (const source of [client, detail, ypack]) {
    assert.doesNotMatch(source, /stockUnitGroupKey/);
    assert.doesNotMatch(source, /unlock_at_sold_pct/);
    assert.doesNotMatch(source, /last_prize_metadata/);
  }
});
```

- [ ] **Step 4: Run the new tests and verify they fail**

Run:

```bash
npm run test:final-open-quantity
npm run test:pack-opening-flow
```

Expected:

- `test:final-open-quantity` fails because `finalPrizeAwareOpenableWinSlots`, `openQuantityLimit`, and `isOpenQuantityAvailable` do not exist yet.
- `test:pack-opening-flow` fails because the public pull surfaces do not all import/use the helper yet.

---

### Task 2: Add Public-Safe Quantity Helpers

**Files:**
- Modify: `Website/src/features/ynot/open-quantity.ts`
- Test: `Website/scripts/test-final-open-quantity.mjs`

- [ ] **Step 1: Implement the helper functions**

Add this code to the end of `Website/src/features/ynot/open-quantity.ts`:

```ts
function optionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeInteger(value: unknown) {
  const numeric = optionalFiniteNumber(value);
  if (numeric === undefined) return 0;
  return Math.max(0, Math.floor(numeric));
}

export type FinalPrizeOpenabilityInput = {
  remainingSlots?: number;
  normalOpenableWinSlots?: number;
  finalPrizeAvailableUnits?: number;
};

export function finalPrizeAwareOpenableWinSlots({
  remainingSlots,
  normalOpenableWinSlots,
  finalPrizeAvailableUnits = 0,
}: FinalPrizeOpenabilityInput) {
  const remaining = optionalFiniteNumber(remainingSlots);
  const normal = nonNegativeInteger(normalOpenableWinSlots);
  const finalPrize = nonNegativeInteger(finalPrizeAvailableUnits) > 0 ? 1 : 0;

  if (remaining === undefined) return normal + finalPrize;

  const safeRemaining = Math.max(0, Math.floor(remaining));
  if (safeRemaining <= 0) return 0;

  const normalOnly = Math.min(safeRemaining, normal);
  const canFinishWithFinalPrize =
    finalPrize > 0 && safeRemaining <= normal + finalPrize;

  return canFinishWithFinalPrize
    ? Math.min(safeRemaining, normal + finalPrize)
    : normalOnly;
}

export type OpenQuantityLimitInput = {
  remainingSlots?: number;
  eligiblePrizeUnits?: number;
  availableWinSlots?: number;
  availablePrizeUnits?: number;
};

export function openQuantityLimit({
  remainingSlots,
  eligiblePrizeUnits,
  availableWinSlots,
  availablePrizeUnits,
}: OpenQuantityLimitInput) {
  const remaining = optionalFiniteNumber(remainingSlots);
  const inventory =
    optionalFiniteNumber(eligiblePrizeUnits) ??
    optionalFiniteNumber(availableWinSlots) ??
    optionalFiniteNumber(availablePrizeUnits);

  if (remaining === undefined && inventory === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  const safeRemaining =
    remaining === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(remaining));
  const safeInventory =
    inventory === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(inventory));

  return Math.min(safeRemaining, safeInventory);
}

export function isOpenQuantityAvailable(
  quantity: number,
  input: OpenQuantityLimitInput,
) {
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  return safeQuantity <= openQuantityLimit(input);
}
```

- [ ] **Step 2: Run helper tests**

Run:

```bash
npm run test:final-open-quantity
```

Expected:

- PASS for helper tests.
- `test:pack-opening-flow` may still fail until UI surfaces use the helper.

---

### Task 3: Use The Helper In Server Readiness And UI Quantity Gates

**Files:**
- Modify: `Website/src/features/ynot/prize-readiness.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
- Modify: `Website/src/features/ynot/cr/YPackExperience.tsx`
- Test: `Website/scripts/test-final-open-quantity.mjs`
- Test: `Website/scripts/test-pack-opening-flow.mjs`

- [ ] **Step 1: Update server-side readiness**

In `Website/src/features/ynot/prize-readiness.ts`, add this import near the existing local imports:

```ts
import { finalPrizeAwareOpenableWinSlots } from "./open-quantity";
```

Replace the current Last Prize reward unit block:

```ts
  const lastPrizeTotalUnits = row.last_prize_card_id ? 1 : 0;
  const lastPrizeAvailableUnits =
    row.last_prize_card_id && !row.last_prize_awarded_at ? 1 : 0;
  const lastPrizeEligibleUnits =
    lastPrizeAvailableUnits > 0 && remainingSlots <= 1 ? 1 : 0;
  const totalRewardUnits = totalPrizeUnits + lastPrizeTotalUnits;
  const availableRewardUnits = availablePrizeUnits + lastPrizeAvailableUnits;
  const eligibleRewardUnits = eligiblePrizeUnits + lastPrizeEligibleUnits;
```

with:

```ts
  const lastPrizeTotalUnits = row.last_prize_card_id ? 1 : 0;
  const lastPrizeAvailableUnits =
    row.last_prize_card_id && !row.last_prize_awarded_at ? 1 : 0;
  const totalRewardUnits = totalPrizeUnits + lastPrizeTotalUnits;
  const availableRewardUnits = finalPrizeAwareOpenableWinSlots({
    remainingSlots,
    normalOpenableWinSlots: availablePrizeUnits,
    finalPrizeAvailableUnits: lastPrizeAvailableUnits,
  });
  const eligibleRewardUnits = finalPrizeAwareOpenableWinSlots({
    remainingSlots,
    normalOpenableWinSlots: eligiblePrizeUnits,
    finalPrizeAvailableUnits: lastPrizeAvailableUnits,
  });
```

- [ ] **Step 2: Update `GachaOpenPanel` quantity gating**

In `Website/src/features/ynot/client.tsx`, extend the `open-quantity` import to include:

```ts
  isOpenQuantityAvailable,
  openQuantityLimit,
```

Replace the local `availableOpenUnits` / `remainingOpenUnits` calculation:

```ts
  const availableOpenUnits =
    remainingState.eligibleUnits ??
    remainingState.availableWinSlots ??
    remainingState.availablePrizeUnits ??
    Number.POSITIVE_INFINITY;
  const remainingOpenUnits = Math.min(
    remainingState.remainingSlots ?? Number.POSITIVE_INFINITY,
    availableOpenUnits,
  );
```

with:

```ts
  const remainingOpenUnits = openQuantityLimit({
    remainingSlots: remainingState.remainingSlots,
    eligiblePrizeUnits: remainingState.eligibleUnits,
    availableWinSlots: remainingState.availableWinSlots,
    availablePrizeUnits: remainingState.availablePrizeUnits,
  });
```

Replace:

```ts
  function quantityDisabled(option: number) {
    return Number.isFinite(remainingOpenUnits) && option > remainingOpenUnits;
  }
```

with:

```ts
  function quantityDisabled(option: number) {
    return !isOpenQuantityAvailable(option, {
      remainingSlots: remainingState.remainingSlots,
      eligiblePrizeUnits: remainingState.eligibleUnits,
      availableWinSlots: remainingState.availableWinSlots,
      availablePrizeUnits: remainingState.availablePrizeUnits,
    });
  }
```

- [ ] **Step 3: Update pack detail quantity gating**

In `Website/src/features/ynot/cr/PackDetailExperience.tsx`, extend the `open-quantity` import to include:

```ts
  isOpenQuantityAvailable,
  openQuantityLimit,
```

After:

```ts
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
```

add:

```ts
  const openableQuantityLimit = openQuantityLimit({
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  });
```

Replace:

```ts
  const enoughStock = remaining >= qty;
```

with:

```ts
  const enoughStock = qty <= openableQuantityLimit;
```

Replace both quantity-button disabled checks:

```tsx
disabled={remaining < q}
title={
  remaining < q
    ? `Only ${remaining} packs left`
    : `Open ${q} pack${q === 1 ? "" : "s"}`
}
```

with:

```tsx
disabled={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
}
title={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
    ? `Only ${openableQuantityLimit} openable packs left`
    : `Open ${q} pack${q === 1 ? "" : "s"}`
}
```

For the second quantity dock where the title currently has only the low-stock message, use:

```tsx
disabled={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
}
title={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
    ? `Only ${openableQuantityLimit} openable packs left`
    : ""
}
```

- [ ] **Step 4: Update Y-Pack quantity gating**

In `Website/src/features/ynot/cr/YPackExperience.tsx`, extend the `open-quantity` import to include:

```ts
  isOpenQuantityAvailable,
  openQuantityLimit,
```

After:

```ts
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
```

inside `OpenConfirmModal`, add:

```ts
  const openableQuantityLimit = openQuantityLimit({
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  });
```

Replace:

```ts
  const enoughStock = remaining >= qty;
```

with:

```ts
  const enoughStock = qty <= openableQuantityLimit;
```

Replace:

```tsx
disabled={remaining < q}
title={remaining < q ? `Only ${remaining} packs left` : ""}
```

with:

```tsx
disabled={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
}
title={
  !isOpenQuantityAvailable(q, {
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  })
    ? `Only ${openableQuantityLimit} openable packs left`
    : ""
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:final-open-quantity
npm run test:pack-opening-flow
```

Expected: both PASS.

---

### Task 4: Fix Supabase Inventory Summary

**Files:**
- Create via CLI: `Database/supabase/migrations/<generated>_last_prize_final_quantity_summary.sql`
- Test: `Website/scripts/test-final-open-quantity.mjs`
- Test: `Website/scripts/test-gacha-open-performance-shape.mjs`

- [ ] **Step 1: Create the migration with Supabase CLI**

Run from `Database/supabase`:

```bash
SUPABASE_NO_TELEMETRY=1 supabase migration new last_prize_final_quantity_summary
```

Expected: Supabase creates a timestamped file ending with:

```text
_last_prize_final_quantity_summary.sql
```

Do not hand-create the migration filename.

- [ ] **Step 2: Replace the migration contents**

Put this SQL into the generated migration file:

```sql
-- last_prize_final_quantity_summary
--
-- Keep the public inventory summary aligned with open_gacha_campaign's final
-- slot Last Prize rule. This exposes only aggregate counts. It does not expose
-- stock IDs, selected stock filters, weights, unlock rules, or owner logic.

create or replace function public.get_draw_round_inventory_summary(
  p_draw_round_id uuid default null,
  p_profile_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with slot_counts as (
    select
      draw_round_id,
      count(*)::integer as total_slots,
      count(*) filter (where status = 'available')::integer as available_slots,
      count(*) filter (where status in ('picked', 'opened'))::integer as claimed_slots,
      count(*) filter (where status = 'void')::integer as void_slots
    from public.draw_slots
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  ),
  unit_counts as (
    select
      draw_round_id,
      count(*)::integer as total_units,
      count(*) filter (where status = 'available')::integer as available_units,
      count(*) filter (where status = 'awarded')::integer as awarded_units,
      count(*) filter (where status = 'reserved')::integer as reserved_units,
      count(*) filter (where status = 'void')::integer as void_units
    from public.draw_round_prize_units
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  ),
  round_inventory as (
    select
      dr.id as draw_round_id,
      dr.sort_order,
      dr.created_at,
      coalesce(sc.total_slots, dr.total_slots, 0) as total_slots,
      coalesce(sc.available_slots, dr.total_slots, 0) as remaining_slots,
      coalesce(sc.claimed_slots, 0) as claimed_slots,
      coalesce(sc.void_slots, 0) as void_slots,
      case
        when coalesce(dr.logic_snapshot->>'mode', 'pure_random') in ('pure_random', 'weighted_templates', 'inventory_gated')
          then coalesce(dr.logic_snapshot->>'mode', 'pure_random')
        else 'pure_random'
      end as logic_mode,
      case
        when coalesce(dr.total_slots, 0) <= 0 then 100::numeric
        else least(
          100::numeric,
          (
            coalesce(sc.claimed_slots, 0)::numeric
            / greatest(dr.total_slots, 1)::numeric
          ) * 100
        )
      end as sold_pct
    from public.draw_rounds dr
    left join slot_counts sc on sc.draw_round_id = dr.id
    where p_draw_round_id is null or dr.id = p_draw_round_id
  ),
  prize_unit_counts as (
    select
      prizes.draw_round_id,
      prizes.id as draw_round_prize_id,
      greatest(coalesce(prizes.planned_quantity, 0), 0)::integer as planned_quantity,
      greatest(coalesce(prizes.bundle_quantity, 1), 1)::integer as bundle_quantity,
      coalesce(prizes.weight, 1) as weight,
      coalesce(prizes.unlock_at_sold_pct, 0) as unlock_at_sold_pct,
      count(units.id) filter (where units.status <> 'void')::integer as total_physical_units,
      count(units.id) filter (where units.status = 'available')::integer as available_physical_units
    from public.draw_round_prizes prizes
    left join public.draw_round_prize_units units on units.draw_round_prize_id = prizes.id
    where (p_draw_round_id is null or prizes.draw_round_id = p_draw_round_id)
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    group by
      prizes.draw_round_id,
      prizes.id,
      prizes.planned_quantity,
      prizes.bundle_quantity,
      prizes.weight,
      prizes.unlock_at_sold_pct
  ),
  normal_win_counts as (
    select
      ri.draw_round_id,
      coalesce(sum(
        least(
          puc.planned_quantity,
          floor(puc.available_physical_units::numeric / puc.bundle_quantity)::integer
        )
      ), 0)::integer as available_win_slots,
      coalesce(sum(
        case
          when (ri.logic_mode = 'pure_random' or puc.weight > 0)
            and (
              ri.logic_mode <> 'inventory_gated'
              or puc.unlock_at_sold_pct <= ri.sold_pct
            )
            then least(
              puc.planned_quantity,
              floor(puc.available_physical_units::numeric / puc.bundle_quantity)::integer
            )
          else 0
        end
      ), 0)::integer as eligible_win_slots
    from round_inventory ri
    left join prize_unit_counts puc on puc.draw_round_id = ri.draw_round_id
    group by ri.draw_round_id
  ),
  last_prize_counts as (
    select
      ri.draw_round_id,
      case
        when dr.last_prize_card_id is not null
          and dr.last_prize_awarded_at is null
          and exists (
            select 1
            from public.card_stock_units stock
            where stock.card_id = dr.last_prize_card_id
              and stock.status = 'available'
              and public.card_stock_unit_matches_prize_filter(stock, dr.last_prize_metadata)
          )
          then 1
        else 0
      end as last_prize_available_units
    from round_inventory ri
    join public.draw_rounds dr on dr.id = ri.draw_round_id
  ),
  public_counts as (
    select
      ri.draw_round_id,
      ri.sort_order,
      ri.created_at,
      ri.total_slots,
      ri.remaining_slots,
      ri.claimed_slots,
      ri.void_slots,
      coalesce(uc.total_units, 0) as total_units,
      coalesce(uc.available_units, 0) as available_units,
      case
        when coalesce(lpc.last_prize_available_units, 0) > 0
          and ri.remaining_slots <= coalesce(nwc.available_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0)
          then least(ri.remaining_slots, coalesce(nwc.available_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0))
        else least(ri.remaining_slots, coalesce(nwc.available_win_slots, 0))
      end as public_available_win_slots,
      case
        when coalesce(lpc.last_prize_available_units, 0) > 0
          and ri.remaining_slots <= coalesce(nwc.eligible_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0)
          then least(ri.remaining_slots, coalesce(nwc.eligible_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0))
        else least(ri.remaining_slots, coalesce(nwc.eligible_win_slots, 0))
      end as public_eligible_units,
      coalesce(uc.awarded_units, 0) as awarded_units,
      coalesce(uc.reserved_units, 0) as reserved_units,
      coalesce(uc.void_units, 0) as void_units
    from round_inventory ri
    left join unit_counts uc on uc.draw_round_id = ri.draw_round_id
    left join normal_win_counts nwc on nwc.draw_round_id = ri.draw_round_id
    left join last_prize_counts lpc on lpc.draw_round_id = ri.draw_round_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'drawRoundId', pc.draw_round_id,
    'totalSlots', pc.total_slots,
    'remainingSlots', pc.remaining_slots,
    'claimedSlots', pc.claimed_slots,
    'voidSlots', pc.void_slots,
    'totalUnits', pc.total_units,
    'availableUnits', pc.available_units,
    'availableWinSlots', pc.public_available_win_slots,
    'eligibleUnits', pc.public_eligible_units,
    'awardedUnits', pc.awarded_units,
    'reservedUnits', pc.reserved_units,
    'voidUnits', pc.void_units
  ) order by pc.sort_order, pc.created_at desc), '[]'::jsonb)
  from public_counts pc;
$$;

revoke all on function public.get_draw_round_inventory_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_draw_round_inventory_summary(uuid, uuid)
  to service_role;
```

- [ ] **Step 3: Add SQL contract assertions**

Add this test to `Website/scripts/test-final-open-quantity.mjs`:

```js
test("inventory summary counts Last Prize only when aggregate counts can finish the pack", () => {
  const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const { readdirSync } = require("node:fs");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_last_prize_final_quantity_summary.sql"))
    .sort()
    .at(-1);
  assert.ok(migrationName, "missing last prize final quantity migration");
  const sql = readFileSync(new URL(migrationName, migrationsDir), "utf8");

  assert.match(sql, /last_prize_available_units/);
  assert.match(sql, /ri\.remaining_slots <= coalesce\(nwc\.available_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/);
  assert.match(sql, /ri\.remaining_slots <= coalesce\(nwc\.eligible_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/);
  assert.match(sql, /'availableWinSlots', pc\.public_available_win_slots/);
  assert.match(sql, /'eligibleUnits', pc\.public_eligible_units/);
  assert.doesNotMatch(sql, /'lastPrizeMetadata'/);
  assert.doesNotMatch(sql, /'stockUnitGroupKey'/);
  assert.doesNotMatch(sql, /'unlockAtSoldPct'/);
});
```

- [ ] **Step 4: Run SQL/text contract tests**

Run:

```bash
npm run test:final-open-quantity
npm run test:gacha-open-performance
```

Expected: PASS.

---

### Task 5: Verify Behavior And Privacy Locally

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run from `Website/`:

```bash
npm run test:final-open-quantity
npm run test:pack-opening-flow
npm run test:gacha-open-bundle
npm run test:gacha-open-launch-safety
npm run test:random-pack-bundles
npm run test:pack-open-privacy
npm run test:campaign-detail-privacy
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with `tsc --noEmit`.

- [ ] **Step 3: Run local build if typecheck passes**

Run:

```bash
npm run build
```

Expected: PASS. If build is too slow but typecheck/tests pass, record the build gap in the final handoff and do not claim a full local build.

- [ ] **Step 4: Confirm no house data is exposed in public response code**

Run:

```bash
rg -n "stockUnitGroupKey|last_prize_metadata|unlock_at_sold_pct|weight|card_stock_unit_id" Website/src/features/ynot/cr Website/src/features/ynot/GachaRevealOverlay.tsx Website/src/app/api/ynot/gacha/open/route.ts
```

Expected:

- No matches in `Website/src/features/ynot/cr`.
- No matches in `Website/src/features/ynot/GachaRevealOverlay.tsx`.
- In `route.ts`, any matches must remain server-side hydration/sanitization only and must not be returned in `toPublicOpenResult`.

---

### Task 6: Production Migration, GitHub Main, And Launch

**Files:**
- Migration file from Task 4.
- Modified Website files from Tasks 2 and 3.

- [ ] **Step 1: Check git state**

Run from repo root:

```bash
git status --short --branch
```

Expected:

- Only files from this plan are changed.
- No unrelated user work is reverted or staged.

- [ ] **Step 2: Check Supabase migration status**

Run from `Database/supabase`:

```bash
SUPABASE_NO_TELEMETRY=1 supabase migration list --linked
SUPABASE_NO_TELEMETRY=1 supabase db push --linked --dry-run --include-all
```

Expected:

- The new migration is pending locally.
- Dry-run does not include unrelated unexpected migrations.

If the Supabase CLI is unavailable in the shell, use the existing production Supabase access path for read-only verification first, then apply only the generated migration SQL. Do not print secrets.

- [ ] **Step 3: Apply the production migration**

Run from `Database/supabase`:

```bash
SUPABASE_NO_TELEMETRY=1 supabase db push --linked
```

Expected:

- The new migration applies successfully.
- Existing production data remains intact.

- [ ] **Step 4: Production read-only verification query**

Run a read-only production query that checks only public-safe aggregate counts. For a synthetic or current Last Prize pack snapshot, verify:

```text
remainingSlots = 10, normal eligible = 9, Last Prize available => eligibleUnits = 10
remainingSlots = 100, normal eligible = 99, Last Prize available => eligibleUnits = 100
remainingSlots = 150, normal eligible = 99, Last Prize available => eligibleUnits = 99
```

Do not print raw stock IDs, profile IDs, stock filters, owner odds, or hidden prize metadata.

- [ ] **Step 5: Commit with Lore protocol**

Run:

```bash
git add Website/src/features/ynot/open-quantity.ts \
  Website/src/features/ynot/prize-readiness.ts \
  Website/src/features/ynot/client.tsx \
  Website/src/features/ynot/cr/PackDetailExperience.tsx \
  Website/src/features/ynot/cr/YPackExperience.tsx \
  Website/scripts/test-final-open-quantity.mjs \
  Website/scripts/test-pack-opening-flow.mjs \
  Website/package.json \
  Database/supabase/migrations/*_last_prize_final_quantity_summary.sql

git commit -m "Allow final pulls to include Last Prize availability" \
  -m "Constraint: Public UI must not expose stock IDs, owner odds, unlock rules, or hidden prize metadata." \
  -m "Rejected: Changing open_gacha_campaign award logic | the RPC already handles final-slot Last Prize correctly." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep Last Prize availability as aggregate counts only unless a future UI needs explicit safe allowed-quantity fields." \
  -m "Tested: npm run test:final-open-quantity; npm run test:pack-opening-flow; npm run test:gacha-open-bundle; npm run test:gacha-open-launch-safety; npm run test:random-pack-bundles; npm run test:pack-open-privacy; npm run test:campaign-detail-privacy; npm run typecheck" \
  -m "Not-tested: Production real-money open simulation; use read-only aggregate verification after migration."
```

- [ ] **Step 6: Push to GitHub main**

Run:

```bash
git fetch origin --prune
CURRENT_BRANCH="$(git branch --show-current)"
git switch main
git pull --ff-only origin main
if [ "$CURRENT_BRANCH" != "main" ]; then
  git merge --ff-only "$CURRENT_BRANCH"
fi
git push origin main
```

If the implementation branch is already `main`, run:

```bash
git push origin main
```

Expected: push succeeds and starts the production deploy workflow.

- [ ] **Step 7: Watch deployment**

Run:

```bash
gh run list --branch main --limit 5
gh run watch --exit-status
```

Expected: production deployment succeeds.

- [ ] **Step 8: Production smoke check**

Run:

```bash
/usr/bin/curl -L -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://www.ynotopen.com/
/usr/bin/curl -L -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://www.ynotopen.com/packs
```

Expected: both return `200`.

---

## Self-Review

**Spec coverage:**
- `x10` final pull: Task 1 and Task 4 cover `10 remaining + 9 normal + Last Prize`.
- `x100` final pull: Task 1 and Task 4 cover `100 remaining + 99 normal + Last Prize`.
- Related API/RPC impact: Task 4 changes only `get_draw_round_inventory_summary`; `open_gacha_campaign` is intentionally unchanged.
- No house info leak: Task 4 keeps aggregate fields only, Task 5 runs privacy checks.
- Production launch: Task 6 includes Supabase migration, GitHub main push, deploy watch, and production smoke checks.

**Placeholder scan:** No task uses `TBD`, `TODO`, or undefined future work. The only generated filename is the Supabase migration created by the required CLI command.

**Type consistency:** Helper names are consistent across tests and implementation: `finalPrizeAwareOpenableWinSlots`, `openQuantityLimit`, and `isOpenQuantityAvailable`.
