# Prize Unit Identity Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent future YNOTT packs from showing one prize card while allocating another stock unit, without adding a customer open-flow blocker.
**Architecture:** Add a database identity checker and wire it into approval, live-edit, and publish paths. Customer open APIs keep the existing RPC and error contract; admin/readiness/catalog surfaces consume checker output to show actual versus intended stock and prevent bad states before packs are approved or live revisions are published.
**Tech Stack:** Supabase/Postgres SQL migrations, Next.js route handlers, TypeScript admin data mappers, Node `node:test` regression scripts.
---

## Scope

- [ ] Treat old affected packs as an operations cleanup outside this implementation. The user will remove/archive them; this plan protects future packs.
- [ ] Do not add a new hard block to `open_gacha_campaign` or `/api/ynot/gacha/open`.
- [ ] Keep the customer opening function behavior the same: it awards the already-materialized unit and returns the existing payload shape.
- [ ] Add hard prevention before future bad materialization can reach customers: initial approval, live edit, and live revision publish.
- [ ] Add admin/show diagnostics so Prize Catalog, stock usage, and pack monitor distinguish intended prize card from actual materialized stock.

## Files

- [ ] Create `Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql`.
- [ ] Create `Website/scripts/test-prize-unit-identity-guards.mjs`.
- [ ] Modify `Website/package.json`.
- [ ] Modify `Website/src/features/ynot/data.ts`.
- [ ] Modify `Website/src/features/ynot/prize-readiness.ts`.
- [ ] Modify `Website/src/features/ynot/stock-sku-usage.ts`.
- [ ] Modify `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts` only if the route needs better admin error wording for the new RPC exceptions.
- [ ] Do not modify `Website/src/app/api/ynot/gacha/open/route.ts` unless a regression test proves the existing contract is already broken.

## Task 1: Add Regression Tests For The Intended Contract

- [ ] Create `Website/scripts/test-prize-unit-identity-guards.mjs` with the same plain Node `node:test` style used by `Website/scripts/test-live-pack-revisions.mjs`.

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

function readRepo(relativePath) {
  return readFileSync(new URL(relativePath, repoRoot), "utf8");
}

function latestMigrationContaining(needle) {
  const dir = new URL("../Database/supabase/migrations/", repoRoot);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .reverse()
    .map((file) => ({ file, source: readFileSync(join(dir.pathname, file), "utf8") }))
    .find((entry) => entry.source.includes(needle));
}

function latestFunctionSource(functionName) {
  const entry = latestMigrationContaining(`function public.${functionName}`);
  assert.ok(entry, `expected a migration defining ${functionName}`);
  return entry.source;
}

describe("prize unit identity guards", () => {
  it("adds a checker RPC that compares intended prize identity with materialized stock", () => {
    const source = latestFunctionSource("get_draw_round_prize_unit_identity_mismatches");

    assert.match(source, /draw_round_prize_units/i);
    assert.match(source, /draw_round_prizes/i);
    assert.match(source, /card_stock_units/i);
    assert.match(source, /card_stock_unit_matches_prize_filter/i);
    assert.match(source, /unitCardMismatch/i);
    assert.match(source, /stockCardMismatch/i);
    assert.match(source, /stockFilterMismatch/i);
  });

  it("adds an assertion RPC for approval, live edit, and publish gates", () => {
    const source = latestFunctionSource("assert_draw_round_prize_unit_identity");

    assert.match(source, /get_draw_round_prize_unit_identity_mismatches/i);
    assert.match(source, /prize_unit_identity_mismatch/i);
  });

  it("rechecks reserved stock identity before campaign approval materializes units", () => {
    const source = latestFunctionSource("approve_campaign_inventory");

    assert.match(source, /reserved_stock_identity_mismatch/i);
    assert.match(source, /card_stock_unit_matches_prize_filter/i);
    assert.match(source, /stock\.card_id\s+is\s+distinct\s+from\s+prizes\.card_id/i);
  });

  it("live edit releases and rematerializes unawarded units when prize identity changes", () => {
    const source = latestFunctionSource("edit_live_campaign_inventory");

    assert.match(source, /v_identity_changed/i);
    assert.match(source, /prize_identity_locked_after_award/i);
    assert.match(source, /release_live_prize_units/i);
    assert.match(source, /assert_draw_round_prize_unit_identity/i);
  });

  it("live revision publish verifies identity after applying the reviewed snapshot", () => {
    const source = latestFunctionSource("publish_live_campaign_revision");

    assert.match(source, /edit_live_campaign_inventory/i);
    assert.match(source, /assert_draw_round_prize_unit_identity/i);
  });

  it("admin data surfaces expose intended versus actual identity diagnostics", () => {
    const dataSource = read("src/features/ynot/data.ts");
    const readinessSource = read("src/features/ynot/prize-readiness.ts");
    const usageSource = read("src/features/ynot/stock-sku-usage.ts");

    assert.match(dataSource, /get_draw_round_prize_unit_identity_mismatches/i);
    assert.match(dataSource, /identityMismatchCount/i);
    assert.match(readinessSource, /identityMismatchCount/i);
    assert.match(usageSource, /actualStockCardId/i);
  });

  it("customer open API keeps the same RPC contract and has no new identity-mismatch blocker", () => {
    const source = read("src/app/api/ynot/gacha/open/route.ts");

    assert.match(source, /\.rpc\("open_gacha_campaign"/);
    assert.match(source, /not_enough_available_slots/);
    assert.match(source, /not_enough_prize_inventory/);
    assert.doesNotMatch(source, /prize_unit_identity_mismatch/);
    assert.doesNotMatch(source, /assert_draw_round_prize_unit_identity/);
  });
});
```

- [ ] Add this script to `Website/package.json`.

```json
"test:prize-unit-identity-guards": "node --test scripts/test-prize-unit-identity-guards.mjs"
```

- [ ] Run the new test and confirm it fails before implementation because the checker migration and admin diagnostics are absent.

```bash
cd Website
npm run test:prize-unit-identity-guards
```

## Task 2: Add The Database Checker RPCs

- [ ] In `Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql`, add a checker that returns every non-void materialized unit whose actual stock identity does not match its visible prize row.

```sql
create or replace function public.get_draw_round_prize_unit_identity_mismatches(
  p_draw_round_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with scoped_units as (
    select
      units.id as prize_unit_id,
      units.draw_round_id,
      units.draw_round_prize_id,
      units.card_id as unit_card_id,
      units.card_stock_unit_id,
      units.status,
      prizes.card_id as prize_card_id,
      prizes.metadata as prize_metadata,
      stock.card_id as stock_card_id,
      stock.stock_sku_id,
      stock.label as stock_label
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes
      on prizes.id = units.draw_round_prize_id
    left join public.card_stock_units stock
      on stock.id = units.card_stock_unit_id
    where units.status <> 'void'
      and (p_draw_round_id is null or units.draw_round_id = p_draw_round_id)
  ),
  mismatches as (
    select *
    from scoped_units
    where unit_card_id is distinct from prize_card_id
       or stock_card_id is distinct from prize_card_id
       or card_stock_unit_id is null
       or not public.card_stock_unit_matches_prize_filter(
         (select s from public.card_stock_units s where s.id = scoped_units.card_stock_unit_id),
         prize_metadata
       )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'drawRoundId', draw_round_id,
        'prizeId', draw_round_prize_id,
        'prizeUnitId', prize_unit_id,
        'status', status,
        'prizeCardId', prize_card_id,
        'unitCardId', unit_card_id,
        'stockCardId', stock_card_id,
        'stockUnitId', card_stock_unit_id,
        'stockSkuId', stock_sku_id,
        'stockLabel', stock_label,
        'reason', jsonb_strip_nulls(jsonb_build_object(
          'unitCardMismatch', unit_card_id is distinct from prize_card_id,
          'stockCardMismatch', stock_card_id is distinct from prize_card_id,
          'missingStockUnit', card_stock_unit_id is null,
          'stockFilterMismatch',
            card_stock_unit_id is not null
            and not public.card_stock_unit_matches_prize_filter(
              (select s from public.card_stock_units s where s.id = mismatches.card_stock_unit_id),
              prize_metadata
            )
        ))
      )
      order by draw_round_id, draw_round_prize_id, prize_unit_id
    ),
    '[]'::jsonb
  )
  from mismatches;
$$;

create or replace function public.assert_draw_round_prize_unit_identity(
  p_draw_round_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mismatches jsonb;
begin
  v_mismatches := public.get_draw_round_prize_unit_identity_mismatches(p_draw_round_id);

  if jsonb_array_length(v_mismatches) > 0 then
    raise exception 'prize_unit_identity_mismatch'
      using errcode = 'P0001',
            detail = v_mismatches::text;
  end if;
end;
$$;

revoke all on function public.get_draw_round_prize_unit_identity_mismatches(uuid) from public;
grant execute on function public.get_draw_round_prize_unit_identity_mismatches(uuid) to authenticated, service_role;

revoke all on function public.assert_draw_round_prize_unit_identity(uuid) from public;
grant execute on function public.assert_draw_round_prize_unit_identity(uuid) to service_role;
```

- [ ] If Postgres rejects composite-row subqueries in `card_stock_unit_matches_prize_filter`, change only that expression to a `left join lateral` row alias and keep the returned JSON fields unchanged.
- [ ] Verify the migration file parses far enough for static tests.

```bash
cd Website
npm run test:prize-unit-identity-guards
```

## Task 3: Guard Initial Approval Before Reserved Stock Becomes Pack Units

- [ ] Patch `public.approve_campaign_inventory` in the same migration using the repo's existing `pg_get_functiondef` plus `replace` migration pattern.
- [ ] Insert this guard immediately before the existing `with reserved as (` materialization block.

```sql
  if exists (
    select 1
    from public.card_stock_reservations reservations
    join public.card_stock_units stock
      on stock.id = reservations.stock_unit_id
    join public.draw_round_prizes prizes
      on prizes.id = reservations.draw_round_prize_id
    where reservations.draw_round_id = p_draw_round_id
      and reservations.status = 'reserved'
      and stock.status = 'reserved'
      and (
        stock.card_id is distinct from prizes.card_id
        or not public.card_stock_unit_matches_prize_filter(stock, prizes.metadata)
      )
  ) then
    raise exception 'reserved_stock_identity_mismatch';
  end if;
```

- [ ] Also call the assertion after inserting `draw_round_prize_units` and before returning success.

```sql
  perform public.assert_draw_round_prize_unit_identity(p_draw_round_id);
```

- [ ] Preserve all existing approval function behavior:
  - [ ] Same function name and parameters.
  - [ ] Same success payload shape.
  - [ ] Same existing quantity and readiness checks.
  - [ ] New exception only when the reserved stock no longer matches the prize identity being approved.

- [ ] Run the targeted SQL-shape test.

```bash
cd Website
npm run test:prize-unit-identity-guards
```

## Task 4: Guard Live Edit Without Blocking Customer Opening

- [ ] Patch `public.edit_live_campaign_inventory` in the same migration.
- [ ] Keep the existing award lock: if any non-void awarded unit exists for a prize row and the card/SKU/filter identity changes, raise `prize_identity_locked_after_award`.
- [ ] Add identity-change handling for unawarded materialized units. When identity changes and there are zero awarded units, release/void existing non-void units for that prize row before materializing the new target units.

Insert this logic after the current `v_awarded` and `v_nonvoid` counts are known for an existing prize row, before `v_delta := v_target_units - v_nonvoid;`.

```sql
      v_identity_changed :=
        existing.card_id is distinct from desired.card_id
        or coalesce(existing.metadata ->> 'stockSkuId', '') is distinct from coalesce(desired.metadata ->> 'stockSkuId', '')
        or coalesce(existing.metadata ->> 'skuLabel', '') is distinct from coalesce(desired.metadata ->> 'skuLabel', '')
        or coalesce(existing.metadata ->> 'variantLabel', '') is distinct from coalesce(desired.metadata ->> 'variantLabel', '')
        or coalesce(existing.metadata ->> 'grade', '') is distinct from coalesce(desired.metadata ->> 'grade', '')
        or coalesce(existing.metadata ->> 'language', '') is distinct from coalesce(desired.metadata ->> 'language', '');

      if v_awarded > 0 and v_identity_changed then
        raise exception 'prize_identity_locked_after_award';
      end if;

      if v_identity_changed and v_nonvoid > 0 then
        perform public.release_live_prize_units(
          p_draw_round_id,
          v_prize_id,
          v_nonvoid,
          p_actor_admin_id
        );

        v_nonvoid := 0;
      end if;
```

- [ ] If the existing helper name is not `release_live_prize_units`, use the actual local release helper already used by `edit_live_campaign_inventory`; do not create a second release path.
- [ ] After all desired rows are processed and before returning success, call:

```sql
  perform public.assert_draw_round_prize_unit_identity(p_draw_round_id);
```

- [ ] Preserve live edit behavior:
  - [ ] No change to input JSON shape.
  - [ ] No change to success payload shape.
  - [ ] Quantity-only changes still add or release delta units as before.
  - [ ] Identity changes with awarded units are still rejected.
  - [ ] Identity changes with only available/held/unopened units rematerialize correct stock instead of leaving stale units attached.

- [ ] Run the targeted tests.

```bash
cd Website
npm run test:prize-unit-identity-guards
npm run test:random-pack-bundles
```

## Task 5: Guard Live Revision Publish

- [ ] Patch `public.publish_live_campaign_revision` in `Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql`.
- [ ] Keep the existing call to `public.edit_live_campaign_inventory(revision.draw_round_id, p_owner_admin_id, revision.prize_snapshot)`.
- [ ] Immediately after that call, add:

```sql
  perform public.assert_draw_round_prize_unit_identity(revision.draw_round_id);
```

- [ ] Preserve revision publish behavior:
  - [ ] Existing owner/admin auth stays unchanged.
  - [ ] Existing revision status transitions stay unchanged.
  - [ ] Existing call from `Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts` to `publish_live_campaign_revision` stays unchanged.
  - [ ] New failure happens only if the reviewed snapshot cannot produce matching materialized stock.

- [ ] If the admin route maps database errors to friendly text, add the new messages without changing the RPC call.

```ts
if (message.includes("reserved_stock_identity_mismatch")) {
  return "The reserved stock no longer matches the prize setup. Refresh stock readiness and approve again.";
}
if (message.includes("prize_unit_identity_mismatch")) {
  return "This pack has a prize/stock identity mismatch. Review Prize Catalog diagnostics before publishing.";
}
```

- [ ] Run the live revision tests.

```bash
cd Website
npm run test:prize-unit-identity-guards
npm run test:live-pack-revisions
```

## Task 6: Show Intended Versus Actual Identity In Admin Data

- [ ] In `Website/src/features/ynot/data.ts`, add a narrow type for the checker output.

```ts
type PrizeUnitIdentityMismatch = {
  drawRoundId: string;
  prizeId: string;
  prizeUnitId: string;
  status: string;
  prizeCardId: string | null;
  unitCardId: string | null;
  stockCardId: string | null;
  stockUnitId: string | null;
  stockSkuId: string | null;
  stockLabel: string | null;
  reason: {
    unitCardMismatch?: boolean;
    stockCardMismatch?: boolean;
    missingStockUnit?: boolean;
    stockFilterMismatch?: boolean;
  };
};
```

- [ ] Add a helper in `data.ts` that calls the RPC and normalizes bad/null responses to an empty array.

```ts
async function loadPrizeUnitIdentityMismatches(
  supabase: SupabaseClient,
  drawRoundId: string,
): Promise<PrizeUnitIdentityMismatch[]> {
  const { data, error } = await supabase.rpc("get_draw_round_prize_unit_identity_mismatches", {
    p_draw_round_id: drawRoundId,
  });

  if (error) {
    console.warn("[ynot] Failed to load prize unit identity mismatches", {
      drawRoundId,
      message: error.message,
    });
    return [];
  }

  return Array.isArray(data) ? (data as PrizeUnitIdentityMismatch[]) : [];
}
```

- [ ] Thread this helper through the admin pack surfaces that currently show prize and stock state:
  - [ ] `getAdminPackMonitor`.
  - [ ] `getLivePackMonitor` if the page renders live monitor rows from TypeScript instead of only from the SQL RPC.
  - [ ] `getAdminPrizePool`.

- [ ] Add these fields to admin-only data objects without changing public pack payloads:

```ts
identityMismatchCount: number;
identityMismatches: PrizeUnitIdentityMismatch[];
actualStockCardId?: string | null;
actualStockSkuId?: string | null;
actualStockLabel?: string | null;
```

- [ ] Make the catalog/monitor display rule explicit in code:
  - [ ] `draw_round_prizes.card_id` is the intended visible prize card.
  - [ ] `draw_round_prize_units.card_id` and `card_stock_units.card_id` are the actual materialized stock identity.
  - [ ] If these differ, admin display must show a warning and label the row as a mismatch instead of implying the intended card is allocated.

- [ ] In `Website/src/features/ynot/prize-readiness.ts`, add `identityMismatchCount` to readiness results and make readiness fail for admin approval/publish when mismatch count is greater than zero.
- [ ] In `Website/src/features/ynot/stock-sku-usage.ts`, extend materialized usage rows with `actualStockCardId`, `actualStockSkuId`, and `identityMismatch` so the global stock view explains why a card can remain `1/1 available`.
- [ ] Run TypeScript-focused tests.

```bash
cd Website
npm run test:prize-unit-identity-guards
npm run test:stock-readiness
npm run test:stock-sku-usage
npm run test:stock-sku-presentation
```

## Task 7: Verify API/RPC Calls Stay Correct

- [ ] Confirm `/api/ynot/admin/campaigns` still creates owner-reviewed live revisions for live packs instead of directly editing inventory from the route.

```bash
rg -n "createLivePackRevision|edit_live_campaign_inventory|publish_live_campaign_revision" Website/src/app/api/ynot/admin/campaigns Website/src/app/api/ynot/admin/campaigns/live-revisions
```

- [ ] Confirm `/api/ynot/admin/campaigns/live-revisions` still calls only `publish_live_campaign_revision` for publish.
- [ ] Confirm `/api/ynot/gacha/open` still calls only `open_gacha_campaign` for customer opening and does not call either checker RPC.
- [ ] Confirm the open error mapping remains the existing customer-facing behavior for stock/count failures.

```bash
cd Website
npm run test:prize-unit-identity-guards
npm run test:gacha-open-launch-safety
npm run test:gacha-open-bundle
```

## Task 8: Full Validation

- [ ] Run the focused regression set.

```bash
cd Website
npm run test:prize-unit-identity-guards
npm run test:live-pack-revisions
npm run test:live-pack-monitor
npm run test:admin-pack-monitor
npm run test:stock-readiness
npm run test:stock-sku-usage
npm run test:stock-sku-presentation
npm run test:gacha-open-launch-safety
npm run test:gacha-open-bundle
npm run typecheck
```

- [ ] If any test fails, inspect the failing assertion and fix the smallest relevant implementation surface.
- [ ] Re-run only the failing test first, then re-run the full validation set above.
- [ ] Use this smoke SQL after applying the migration to a non-production database.

```sql
select public.get_draw_round_prize_unit_identity_mismatches(null);
```

- [ ] Expected smoke result on a clean future state: `[]`.
- [ ] Expected smoke result on a deliberately corrupted local fixture: at least one object with `prizeCardId`, `unitCardId`, `stockCardId`, and `reason`.

## Task 9: Commit

- [ ] Review the diff.

```bash
git status --short
git diff -- Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql Website/scripts/test-prize-unit-identity-guards.mjs Website/package.json Website/src/features/ynot/data.ts Website/src/features/ynot/prize-readiness.ts Website/src/features/ynot/stock-sku-usage.ts Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts
```

- [ ] Commit using the repository Lore protocol.

```bash
git add Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql \
  Website/scripts/test-prize-unit-identity-guards.mjs \
  Website/package.json \
  Website/src/features/ynot/data.ts \
  Website/src/features/ynot/prize-readiness.ts \
  Website/src/features/ynot/stock-sku-usage.ts \
  Website/src/app/api/ynot/admin/campaigns/live-revisions/route.ts

git commit -m "$(cat <<'MSG'
Prevent future prize stock identity drift

Constraint: customer opening must keep using the existing open_gacha_campaign contract without a new identity-blocking gate.
Rejected: blocking pack opening on prize_unit_identity_mismatch | the requested fix belongs to admin display, approval, live edit, and publish paths.
Confidence: high
Scope-risk: moderate
Directive: keep intended prize identity and actual materialized stock identity visible as separate admin concepts.
Tested: npm run test:prize-unit-identity-guards; npm run test:live-pack-revisions; npm run test:live-pack-monitor; npm run test:admin-pack-monitor; npm run test:stock-readiness; npm run test:stock-sku-usage; npm run test:stock-sku-presentation; npm run test:gacha-open-launch-safety; npm run test:gacha-open-bundle; npm run typecheck
Not-tested: production migration execution
MSG
)"
```

## Self-Review Checklist

- [ ] No plan step blocks customer opening.
- [ ] Every new hard guard runs before or during admin approval/live edit/publish.
- [ ] Prize Catalog and admin stock views show the difference between intended visible card and actual allocated stock.
- [ ] Existing API/RPC call graph remains stable:
  - [ ] Customer open route -> `open_gacha_campaign`.
  - [ ] Live revision publish route -> `publish_live_campaign_revision`.
  - [ ] Publish RPC -> `edit_live_campaign_inventory` -> `assert_draw_round_prize_unit_identity`.
  - [ ] Approval RPC -> reservation identity recheck -> materialization -> `assert_draw_round_prize_unit_identity`.
- [ ] Test names and commands are exact and runnable.
- [ ] No placeholders remain in the implementation tasks.
