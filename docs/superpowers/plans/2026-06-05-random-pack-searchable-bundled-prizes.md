# Random Pack Searchable Bundled Prizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-executing-plans to implement this plan task-by-task.

**Goal:** make random-pack prize setup easier for admin users and add a safe per-win bundle quantity so one prize slot can grant x3, x5, or another configured count of the same reward without exposing house data.

**Architecture:** keep the existing `planned_quantity` meaning as draw-slot count and add `bundle_quantity` as reward units per winning slot. Public surfaces may show `bundleQuantity` and xN badges only. Internal odds, weight, unlock percent, stock-unit ids, sub-SKU filters, and owner metadata stay server/admin-only.

**Tech Stack:** Next.js app in `Website/`, Supabase/Postgres migrations in `Database/supabase/migrations/`, TypeScript React client components, existing service-role API routes, Node `node:test` source/migration checks.

## Decisions

- `Qty` in admin remains the number of winning slots for that prize.
- New admin field is `Per win`; default is `1`, max is `100`.
- Stock required for a prize is `Qty * Per win`.
- Convert coins are stored per physical reward unit. A x3 prize with `convert_coin_value = 100` converts for `300` when the user sells the grouped reward.
- Opening a x3 prize returns one public reveal item with `bundleQuantity: 3`; the database awards three owned collection rows linked to the same `gacha_open_item_id`.
- Pack detail, opening reveal, history, collection, all pulls, and conversion UI show xN where `bundleQuantity > 1`.
- Direct public API output must not include `draw_round_prize_unit_id`, `stockUnitGroupKey`, `stockUnitFilter`, `weight`, `unlockAtSoldPct`, raw hidden tier logic, or stock availability.
- Existing packs remain x1 because database defaults and API normalization default to `1`.

## Data Flow

```text
Admin create/edit
  prize plannedQuantity = visible win slots
  prize bundleQuantity = physical units per win
  stock readiness requires plannedQuantity * bundleQuantity
  live edit RPC materializes plannedQuantity * bundleQuantity prize units

Customer open
  RPC selects one weighted prize slot
  RPC locks bundleQuantity available units for the same draw_round_prize_id
  RPC inserts one gacha_open_items row with bundle_quantity
  RPC inserts bundleQuantity collection_items rows
  RPC links every claimed draw_round_prize_units row to the same gacha_open_item_id

Public read
  reveal/history/collection return safe bundleQuantity only
  UI groups linked collection rows into one visible reward tile when possible
  convert/ship actions submit all child collection item ids for that grouped tile
```

## Task 1: Add Contract Tests First

**Files:**
- `Website/scripts/test-random-pack-bundle-quantity.mjs`
- `Website/scripts/test-stock-readiness.mjs`
- `Website/scripts/test-pack-open-privacy.mjs`
- `Website/scripts/test-campaign-detail-privacy.mjs`
- `Website/package.json`

**Steps:**

- [ ] Create `Website/scripts/test-random-pack-bundle-quantity.mjs` with source assertions that fail until the feature is fully wired.

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function latestMigrationContaining(needle) {
  const dir = path.join(repoRoot, "Database/supabase/migrations");
  const matches = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(path.join(dir, file), "utf8").includes(needle));
  assert.ok(matches.length > 0, `expected a migration containing ${needle}`);
  return readFileSync(path.join(dir, matches.at(-1)), "utf8");
}

describe("random pack bundled prizes", () => {
  it("adds durable bundle quantity columns without exposing metadata grants", () => {
    const sql = latestMigrationContaining("draw_round_prizes_bundle_quantity_check");
    assert.match(sql, /alter table if exists public\.draw_round_prizes[\s\S]*add column if not exists bundle_quantity integer not null default 1/i);
    assert.match(sql, /alter table if exists public\.gacha_open_items[\s\S]*add column if not exists bundle_quantity integer not null default 1/i);
    assert.match(sql, /draw_round_prizes_bundle_quantity_check/i);
    assert.match(sql, /bundle_quantity between 1 and 100/i);
    assert.match(sql, /grant select \([\s\S]*bundle_quantity[\s\S]*\) on public\.draw_round_prizes to anon, authenticated/i);
    assert.doesNotMatch(sql, /grant select \([\s\S]*metadata[\s\S]*\) on public\.draw_round_prizes to anon, authenticated/i);
  });

  it("keeps planned quantity as slot count and multiplies only physical stock", () => {
    const readiness = read("Website/src/features/ynot/stock-readiness.ts");
    assert.match(readiness, /bundleQuantityForPrize/);
    assert.match(readiness, /stockUnitsForPrize[\s\S]*planned[\s\S]*bundle/i);
    assert.match(readiness, /plannedQuantityForPrize/);

    const prizeReadiness = read("Website/src/features/ynot/prize-readiness.ts");
    assert.match(prizeReadiness, /bundleQuantity\?: number/);
    assert.match(prizeReadiness, /totalPrizeUnits[\s\S]*plannedQuantityForPrize/i);
  });

  it("serializes bundle quantity through admin create and live edit APIs", () => {
    const campaignsRoute = read("Website/src/app/api/ynot/admin/campaigns/route.ts");
    assert.match(campaignsRoute, /bundleQuantity/);
    assert.match(campaignsRoute, /bundle_quantity: normalizeBundleQuantity/);
    assert.match(campaignsRoute, /"bundleQuantity"/);

    const client = read("Website/src/features/ynot/client.tsx");
    assert.match(client, /bundleQuantity: defaultBundleQuantity/);
    assert.match(client, /Per win/);
    assert.match(client, /prizeRequiredStockUnits/);
  });

  it("opens one public reward while awarding all bundled collection rows", () => {
    const sql = latestMigrationContaining("bundle_quantity_snapshot");
    assert.match(sql, /bundle_quantity_snapshot/i);
    assert.match(sql, /select[\s\S]*for update skip locked/i);
    assert.match(sql, /jsonb_build_object\([\s\S]*'bundleQuantity'[\s\S]*\)/i);
    assert.match(sql, /insert into public\.collection_items/i);
    assert.match(sql, /for claimed_unit in/i);
  });

  it("public APIs allow bundleQuantity but keep internal reward data private", () => {
    const openRoute = read("Website/src/app/api/ynot/gacha/open/route.ts");
    assert.match(openRoute, /bundleQuantity\?: number/);
    assert.match(openRoute, /bundleQuantity: publicBundleQuantity/);
    assert.doesNotMatch(openRoute, /drawRoundPrizeUnitId:/);
    assert.doesNotMatch(openRoute, /stockUnitFilter:/);

    const data = read("Website/src/features/ynot/data.ts");
    assert.match(data, /bundleQuantity/);
    assert.match(data, /bundleGroupItemIds/);
    assert.doesNotMatch(data, /stockUnitFilter/);
  });

  it("renders xN badges on the related customer surfaces", () => {
    const packDetail = read("Website/src/features/ynot/cr/PackDetailExperience.tsx");
    const client = read("Website/src/features/ynot/client.tsx");
    const history = read("Website/src/features/ynot/cr/HistoryExperience.tsx");
    const pulls = read("Website/src/features/ynot/cr/AllPullsExperience.tsx");
    assert.match(packDetail, /QuantityBadge/);
    assert.match(client, /QuantityBadge/);
    assert.match(history, /QuantityBadge/);
    assert.match(pulls, /QuantityBadge/);
  });

  it("uses an admin combobox instead of a full-page native select", () => {
    const client = read("Website/src/features/ynot/client.tsx");
    assert.match(client, /role="combobox"/);
    assert.match(client, /role="listbox"/);
    assert.match(client, /admin-prize-combobox__menu/);
    assert.doesNotMatch(client, /showSearch=\{false\}[\s\S]*AdminPrizeCardPicker/);
  });
});
```

- [ ] Extend `Website/scripts/test-stock-readiness.mjs` with one direct function case:

```js
assert.equal(
  stockUnitsForPrize({
    plannedQuantity: 2,
    bundleQuantity: 3,
    cardId: "card-a",
    stockUnitGroupKey: "card-a::packs",
  }),
  6,
);
```

- [ ] Extend `Website/scripts/test-pack-open-privacy.mjs` so `bundleQuantity` is allowed and internal bundle data is rejected:

```js
assert.equal(publicItem.bundleQuantity, 3);
assert.equal("prizeUnitId" in publicItem, false);
assert.equal("drawRoundPrizeUnitIds" in publicItem, false);
assert.equal("stockUnitGroupKey" in publicItem, false);
assert.equal("stockUnitFilter" in publicItem, false);
```

- [ ] Extend `Website/scripts/test-campaign-detail-privacy.mjs`:

```js
assert.equal(preview.bundleQuantity, 5);
assert.equal("plannedQuantity" in preview, false);
assert.equal("stockUnitFilter" in preview, false);
assert.equal("stockUnitGroupKey" in preview, false);
```

- [ ] Add this script to `Website/package.json`:

```json
"test:random-pack-bundles": "node --test scripts/test-random-pack-bundle-quantity.mjs"
```

**Verify:**

```bash
cd Website && npm run test:random-pack-bundles
```

Expected output before implementation: failing assertions naming missing `bundle_quantity`, `Per win`, and `QuantityBadge`.

**Commit:**

```bash
git add Website/scripts/test-random-pack-bundle-quantity.mjs Website/scripts/test-stock-readiness.mjs Website/scripts/test-pack-open-privacy.mjs Website/scripts/test-campaign-detail-privacy.mjs Website/package.json
git commit -m $'Protect bundled random-pack reward contract\n\nConstraint: public APIs may expose bundleQuantity only, never stock-unit or house metadata.\nRejected: UI-only xN badges | rewards and convert totals would drift from database truth.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:random-pack-bundles fails for the missing feature contract\nNot-tested: full implementation pending'
```

## Task 2: Add Shared Bundle Quantity Helpers And Types

**Files:**
- `Website/src/features/ynot/bundle-quantity.ts`
- `Website/src/features/ynot/types.ts`
- `Website/src/features/ynot/stock-readiness.ts`
- `Website/src/features/ynot/prize-readiness.ts`

**Steps:**

- [ ] Create `Website/src/features/ynot/bundle-quantity.ts`.

```ts
export const defaultBundleQuantity = 1;
export const maxBundleQuantity = 100;

export function normalizeBundleQuantity(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : defaultBundleQuantity;
  if (!Number.isFinite(numeric)) return defaultBundleQuantity;
  const integer = Math.trunc(numeric);
  if (integer < defaultBundleQuantity) return defaultBundleQuantity;
  if (integer > maxBundleQuantity) return maxBundleQuantity;
  return integer;
}

export function publicBundleQuantity(value: unknown): number | undefined {
  const normalized = normalizeBundleQuantity(value);
  return normalized > defaultBundleQuantity ? normalized : undefined;
}

export function plannedQuantityForPrize(prize: {
  quantity?: unknown;
  plannedQuantity?: unknown;
  planned_quantity?: unknown;
}): number {
  const raw = prize.quantity ?? prize.plannedQuantity ?? prize.planned_quantity ?? 0;
  const numeric = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export function bundledStockUnitRequirement(prize: {
  quantity?: unknown;
  plannedQuantity?: unknown;
  planned_quantity?: unknown;
  bundleQuantity?: unknown;
  bundle_quantity?: unknown;
}): number {
  const planned = plannedQuantityForPrize(prize);
  const bundle = normalizeBundleQuantity(prize.bundleQuantity ?? prize.bundle_quantity);
  return planned * bundle;
}

export function bundledConvertCoinValue(
  perUnitConvertCoinValue: unknown,
  bundleQuantity: unknown,
): number {
  const perUnit =
    typeof perUnitConvertCoinValue === "number"
      ? perUnitConvertCoinValue
      : Number.parseInt(String(perUnitConvertCoinValue ?? 0), 10);
  if (!Number.isFinite(perUnit) || perUnit <= 0) return 0;
  return Math.trunc(perUnit) * normalizeBundleQuantity(bundleQuantity);
}
```

- [ ] Add bundle fields to `Website/src/features/ynot/types.ts`.

```ts
export type YnotGachaOpenItem = {
  id: string;
  cardId: string;
  cardCode?: string | null;
  cardName: string;
  imageUrl?: string | null;
  displayTier?: string | null;
  valueThb?: number | null;
  resultPosition?: number | null;
  bundleQuantity?: number;
};

export type YnotCollectionItem = {
  id: string;
  cardId: string;
  cardCode?: string | null;
  cardName: string;
  imageUrl?: string | null;
  status: "owned" | "locked" | "exchange_requested" | "exchanged" | "shipping_requested" | "shipped" | "void";
  convertCoinValue?: number | null;
  bundleQuantity?: number;
  bundleIndex?: number;
  bundleGroupId?: string | null;
  bundleGroupItemIds?: string[];
};

export type YnotPrizePreview = {
  id: string;
  cardId: string;
  cardCode?: string | null;
  cardName: string;
  imageUrl?: string | null;
  displayTier?: string | null;
  valueThb?: number | null;
  convertCoinValue?: number | null;
  bundleQuantity?: number;
};

export type YnotPrizePoolItem = YnotPrizePreview & {
  plannedQuantity?: number;
  availableQuantity?: number;
  bundleQuantity?: number;
};
```

- [ ] Update `Website/src/features/ynot/stock-readiness.ts` to distinguish slot quantity from stock quantity.

```ts
import {
  bundledStockUnitRequirement,
  normalizeBundleQuantity,
  plannedQuantityForPrize,
} from "./bundle-quantity";

export type StockReadinessPrize = {
  cardId?: string | null;
  quantity?: number | string | null;
  plannedQuantity?: number | string | null;
  planned_quantity?: number | string | null;
  bundleQuantity?: number | string | null;
  bundle_quantity?: number | string | null;
  stockUnitGroupKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function bundleQuantityForPrize(prize: StockReadinessPrize): number {
  return normalizeBundleQuantity(prize.bundleQuantity ?? prize.bundle_quantity);
}

export function stockUnitsForPrize(prize: StockReadinessPrize): number {
  return bundledStockUnitRequirement(prize);
}
```

- [ ] Keep the total slot validation in `Website/src/features/ynot/prize-readiness.ts` based on planned quantity only.

```ts
import {
  normalizeBundleQuantity,
  plannedQuantityForPrize,
  bundledStockUnitRequirement,
} from "./bundle-quantity";

export type PrizeDraftInput = {
  cardId?: string | null;
  quantity?: number | string | null;
  plannedQuantity?: number | string | null;
  bundleQuantity?: number | string | null;
  tier?: string | null;
  metadata?: Record<string, unknown> | null;
};

const plannedQuantity = plannedQuantityForPrize(prize);
const bundleQuantity = normalizeBundleQuantity(prize.bundleQuantity);
const stockUnitsRequired = bundledStockUnitRequirement(prize);
```

- [ ] Update readiness issue text to display both counts:

```ts
`Requires ${stockUnitsRequired} stock unit${stockUnitsRequired === 1 ? "" : "s"} (${plannedQuantity} win slot${plannedQuantity === 1 ? "" : "s"} x ${bundleQuantity} per win).`
```

**Verify:**

```bash
cd Website && npm run test:stock-readiness
cd Website && npm run typecheck
```

Expected output: stock-readiness tests pass and TypeScript reports no type errors from the new fields.

**Commit:**

```bash
git add Website/src/features/ynot/bundle-quantity.ts Website/src/features/ynot/types.ts Website/src/features/ynot/stock-readiness.ts Website/src/features/ynot/prize-readiness.ts
git commit -m $'Separate random-pack slot counts from bundled stock counts\n\nConstraint: Qty must remain the odds slot count while Per win multiplies physical reward units.\nRejected: replacing planned_quantity semantics | existing pack math and sold-out checks depend on slot counts.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:stock-readiness; npm run typecheck\nNot-tested: database RPC changes pending'
```

## Task 3: Add Database Bundle Columns And RPC Behavior

**Files:**
- `Database/supabase/migrations/20260605090000_random_pack_bundle_quantity.sql`
- `Database/supabase/migrations/20260526000001_gacha_csprng.sql` as reference only
- `Database/supabase/migrations/20260604180000_fix_live_edit_seed_run_id_cast.sql` as reference only
- `Database/supabase/migrations/20260602142946_random_pack_sub_sku_filters.sql` as reference only
- `Database/supabase/migrations/20260525100000_card_convert_to_coin.sql` as reference only

**Steps:**

- [ ] Create `Database/supabase/migrations/20260605090000_random_pack_bundle_quantity.sql` with schema additions:

```sql
-- Add per-win bundled reward counts without exposing owner stock metadata.

alter table if exists public.draw_round_prizes
  add column if not exists bundle_quantity integer not null default 1;

alter table if exists public.gacha_open_items
  add column if not exists bundle_quantity integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_bundle_quantity_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_bundle_quantity_check
      check (bundle_quantity between 1 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gacha_open_items_bundle_quantity_check'
      and conrelid = 'public.gacha_open_items'::regclass
  ) then
    alter table public.gacha_open_items
      add constraint gacha_open_items_bundle_quantity_check
      check (bundle_quantity between 1 and 100);
  end if;
end $$;

revoke select on public.draw_round_prizes from anon, authenticated;

grant select (
  id,
  draw_round_id,
  card_id,
  tier,
  rank,
  value_thb,
  convert_coin_value,
  planned_quantity,
  bundle_quantity,
  is_test,
  seed_run_id,
  created_at,
  updated_at
) on public.draw_round_prizes to anon, authenticated;
```

- [ ] Redefine `public.reserve_draw_round_stock` and `public.materialize_draw_round_prize_units` by copying the latest function bodies from `20260602142946_random_pack_sub_sku_filters.sql` into the new migration, then make these concrete changes:

```sql
-- Inside the loop over prize_row:
required_units := greatest(coalesce(prize_row.planned_quantity, 1), 0)
  * greatest(coalesce(prize_row.bundle_quantity, 1), 1);

-- Use required_units anywhere the function currently reserves or materializes
-- coalesce(prize_row.planned_quantity, 1) physical units.
```

Add these declarations in each function body that loops over prize rows:

```sql
required_units integer;
```

- [ ] Redefine `public.edit_live_campaign_inventory` by copying the latest body from `20260604180000_fix_live_edit_seed_run_id_cast.sql` into the new migration and update `_desired_prizes`.

```sql
create temporary table _desired_prizes on commit drop as
select
  nullif(x.id, '')::uuid as id,
  nullif(x.card_id, '')::uuid as card_id,
  coalesce(x.tier, 'bronze') as tier,
  coalesce(x.rank, 1)::integer as rank,
  greatest(coalesce(x.value_thb, 0)::integer, 0) as value_thb,
  greatest(coalesce(x.convert_coin_value, 0)::integer, 0) as convert_coin_value,
  greatest(coalesce(x.weight, 1)::integer, 1) as weight,
  least(greatest(coalesce(x.unlock_at_sold_pct, 0)::integer, 0), 100) as unlock_at_sold_pct,
  greatest(coalesce(x.planned_quantity, 1)::integer, 1) as planned_quantity,
  least(greatest(coalesce(x.bundle_quantity, 1)::integer, 1), 100) as bundle_quantity,
  coalesce(x.is_test, false)::boolean as is_test,
  nullif(x.seed_run_id, '')::uuid as seed_run_id,
  coalesce(x.metadata, '{}'::jsonb) as metadata,
  coalesce(x.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb as hidden
from jsonb_to_recordset(coalesce(p_prizes, '[]'::jsonb)) as x(
  id text,
  card_id text,
  tier text,
  rank integer,
  value_thb integer,
  convert_coin_value integer,
  weight integer,
  unlock_at_sold_pct integer,
  planned_quantity integer,
  bundle_quantity integer,
  is_test boolean,
  seed_run_id text,
  metadata jsonb
);
```

Update insert/upsert for `draw_round_prizes` to include `bundle_quantity`:

```sql
insert into public.draw_round_prizes(
  id, draw_round_id, card_id, tier, rank, value_thb, convert_coin_value,
  weight, unlock_at_sold_pct, planned_quantity, bundle_quantity,
  is_test, seed_run_id, metadata
)
values (
  coalesce(desired.id, gen_random_uuid()), p_draw_round_id, desired.card_id,
  desired.tier, desired.rank, desired.value_thb, desired.convert_coin_value,
  desired.weight, desired.unlock_at_sold_pct, desired.planned_quantity,
  desired.bundle_quantity, desired.is_test, desired.seed_run_id, desired.metadata
)
on conflict (id) do update set
  card_id = excluded.card_id,
  tier = excluded.tier,
  rank = excluded.rank,
  value_thb = excluded.value_thb,
  convert_coin_value = excluded.convert_coin_value,
  weight = excluded.weight,
  unlock_at_sold_pct = excluded.unlock_at_sold_pct,
  planned_quantity = excluded.planned_quantity,
  bundle_quantity = excluded.bundle_quantity,
  is_test = excluded.is_test,
  seed_run_id = excluded.seed_run_id,
  metadata = excluded.metadata;
```

Use separate slot and stock totals:

```sql
select
  coalesce(sum(planned_quantity) filter (where not hidden), 0),
  coalesce(sum(planned_quantity * bundle_quantity) filter (where not hidden), 0)
into v_planned_total, v_required_stock_total
from _desired_prizes;
```

Keep `draw_slots` count aligned to `v_planned_total`. Use `desired.planned_quantity * desired.bundle_quantity` when calculating materialized `draw_round_prize_units` deltas.

- [ ] Lock bundle changes once any unit for the prize is awarded:

```sql
if existing.id is not null
  and coalesce(existing.bundle_quantity, 1) <> desired.bundle_quantity
  and exists (
    select 1
    from public.draw_round_prize_units units
    where units.draw_round_prize_id = existing.id
      and units.status = 'awarded'
  )
then
  raise exception 'prize_bundle_locked_after_award';
end if;
```

- [ ] Redefine `public.open_gacha_campaign` by copying the latest body from `20260526000001_gacha_csprng.sql` into the new migration and change only the reward allocation section.

Add declarations:

```sql
selected_bundle_quantity integer;
claimed_unit record;
claimed_unit_ids uuid[] := array[]::uuid[];
claimed_collection_item_ids uuid[] := array[]::uuid[];
bundle_index integer;
```

Filter the candidate prize unit query so a selected prize has enough available units for its configured bundle:

```sql
and (
  select count(*)
  from public.draw_round_prize_units siblings
  where siblings.draw_round_prize_id = prizes.id
    and siblings.status = 'available'
) >= greatest(coalesce(prizes.bundle_quantity, 1), 1)
```

After selecting the primary `unit_row`, set:

```sql
selected_bundle_quantity := greatest(coalesce(unit_row.bundle_quantity, 1), 1);
claimed_unit_ids := array[unit_row.id];
```

Then lock the additional units:

```sql
for claimed_unit in
  select units.id
  from public.draw_round_prize_units units
  where units.draw_round_prize_id = unit_row.draw_round_prize_id
    and units.status = 'available'
    and units.id <> unit_row.id
  order by units.created_at, units.id
  limit greatest(selected_bundle_quantity - 1, 0)
  for update skip locked
loop
  claimed_unit_ids := array_append(claimed_unit_ids, claimed_unit.id);
end loop;

if coalesce(array_length(claimed_unit_ids, 1), 0) <> selected_bundle_quantity then
  raise exception 'not_enough_prize_inventory';
end if;
```

Insert one public open item:

```sql
insert into public.gacha_open_items(
  gacha_open_id,
  card_id,
  draw_round_prize_id,
  draw_round_prize_unit_id,
  tier,
  value_thb,
  result_position,
  bundle_quantity
)
values (
  open_id,
  unit_row.card_id,
  unit_row.draw_round_prize_id,
  unit_row.id,
  unit_row.display_tier,
  unit_row.value_thb,
  position_index,
  selected_bundle_quantity
)
returning id into open_item_id;
```

Insert one owned collection item per physical reward and link each unit to the same open item:

```sql
bundle_index := 0;
for claimed_unit in
  select units.id, units.card_id
  from public.draw_round_prize_units units
  where units.id = any(claimed_unit_ids)
  order by case when units.id = unit_row.id then 0 else 1 end, units.created_at, units.id
loop
  bundle_index := bundle_index + 1;

  insert into public.collection_items(
    profile_id,
    card_id,
    source_type,
    source_id,
    status,
    serial_no,
    convert_coin_value_snapshot
  )
  values (
    profile_id,
    claimed_unit.card_id,
    'gacha_open',
    open_id,
    'owned',
    round_row.public_code || '-' || lpad(position_index::text, 2, '0') || '-' || lpad(bundle_index::text, 2, '0'),
    unit_row.convert_coin_value
  )
  returning id into collection_item_id;

  claimed_collection_item_ids := array_append(claimed_collection_item_ids, collection_item_id);

  update public.draw_round_prize_units
  set
    status = 'awarded',
    awarded_at = now(),
    gacha_open_item_id = open_item_id,
    collection_item_id = collection_item_id,
    metadata = metadata || jsonb_build_object(
      'slotId', slot_id,
      'position', position_index,
      'bundleQuantity', selected_bundle_quantity,
      'bundleIndex', bundle_index,
      'bundleOpenItemId', open_item_id
    )
  where id = claimed_unit.id;
end loop;
```

Append one safe result item:

```sql
result_items := result_items || jsonb_build_array(
  jsonb_build_object(
    'id', open_item_id,
    'cardId', unit_row.card_id,
    'cardCode', unit_row.card_code,
    'cardName', unit_row.card_name,
    'imageUrl', unit_row.image_url,
    'displayTier', unit_row.display_tier,
    'valueThb', unit_row.value_thb,
    'resultPosition', position_index,
    'bundleQuantity', selected_bundle_quantity
  )
);
```

- [ ] Update the convert snapshot trigger in the same migration so old `PUBLIC-01` and new `PUBLIC-01-02` serials both resolve the result position:

```sql
match_position := nullif(
  regexp_replace(
    coalesce(new.serial_no, ''),
    '^.*-(\d{2})(?:-\d{2})?$',
    '\1'
  ),
  coalesce(new.serial_no, '')
)::int;
```

The open RPC already writes `convert_coin_value_snapshot`, so this trigger update is a compatibility guard for future inserts and backfills.

**Verify:**

```bash
cd Website && npm run test:random-pack-bundles
cd Database && supabase db push --linked --dry-run --include-all
```

Expected output: random-pack bundle source assertions pass for migration/RPC strings; Supabase dry-run shows the new migration pending and does not apply it.

**Commit:**

```bash
git add Database/supabase/migrations/20260605090000_random_pack_bundle_quantity.sql
git commit -m $'Make bundled random-pack rewards durable in Postgres\n\nConstraint: one visible win can require multiple physical stock units without leaking unit ids or owner filters.\nRejected: materializing one prize unit per visible slot only | bundled rewards would not grant every unit.\nConfidence: medium\nScope-risk: broad\nTested: npm run test:random-pack-bundles; supabase db push --linked --dry-run --include-all\nNot-tested: production migration apply'
```

## Task 4: Wire Admin Create/Edit APIs

**Files:**
- `Website/src/app/api/ynot/admin/campaigns/route.ts`
- `Website/src/app/api/ynot/admin/prizes/route.ts`
- `Website/src/features/ynot/prize-readiness.ts`

**Steps:**

- [ ] Import the helper:

```ts
import { normalizeBundleQuantity } from "@/features/ynot/bundle-quantity";
```

- [ ] Add `bundleQuantity?: number` to `CampaignBody.initialPrizes` and `PrizeDraftInput`.

- [ ] In `saveInitialPrizes`, insert `bundle_quantity` beside `planned_quantity`:

```ts
bundle_quantity: normalizeBundleQuantity(prize.bundleQuantity),
planned_quantity: prize.quantity,
metadata: {
  ...prize.metadata,
  displayTier: prize.displayTier,
  sourceType: "admin_initial_prize",
},
```

- [ ] In `liveEditPrizeRpcRows`, send camelCase input the SQL function expects:

```ts
bundleQuantity: normalizeBundleQuantity(prize.bundleQuantity),
plannedQuantity: prize.quantity,
```

- [ ] In the legacy `Website/src/app/api/ynot/admin/prizes/route.ts`, normalize incoming `bundleQuantity` and save `bundle_quantity` on insert/update:

```ts
const bundleQuantityValue = normalizeBundleQuantity(body.bundleQuantity);

bundle_quantity: bundleQuantityValue,
planned_quantity: quantityValue,
```

- [ ] Update stock validation calls so the required stock count is multiplied:

```ts
const requiredStockUnits = quantityValue * bundleQuantityValue;
await validatePlannedPrizeStock({
  cardId,
  quantity: requiredStockUnits,
  stockUnitGroupKey,
  metadata,
});
```

- [ ] Keep audit metadata safe:

```ts
metadata: {
  quantity: quantityValue,
  bundleQuantity: bundleQuantityValue,
  requiredStockUnits: quantityValue * bundleQuantityValue,
}
```

Do not include `stockUnitFilter`, stock certs, or stock unit ids in public logs or responses. Admin audit events can store `requiredStockUnits` because it is operational count data, not customer-visible odds data.

**Verify:**

```bash
cd Website && npm run test:random-pack-bundles
cd Website && npm run typecheck
```

Expected output: admin API assertions pass and TypeScript accepts bundle fields.

**Commit:**

```bash
git add Website/src/app/api/ynot/admin/campaigns/route.ts Website/src/app/api/ynot/admin/prizes/route.ts Website/src/features/ynot/prize-readiness.ts
git commit -m $'Carry bundled prize quantity through admin save paths\n\nConstraint: admin Qty remains slot count and Per win becomes stock multiplier.\nRejected: storing bundle count only in metadata | live edit and stock checks need typed values.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:random-pack-bundles; npm run typecheck\nNot-tested: browser admin form entry'
```

## Task 5: Replace Admin Prize Select With Searchable Clickable Combobox

**Files:**
- `Website/src/features/ynot/client.tsx`
- `Website/src/app/globals.css`

**Steps:**

- [ ] Extend `CampaignPrizeDraft`:

```ts
bundleQuantity: number;
```

- [ ] In `createPrizeDraft` and `prizeLineupToDrafts`, default and load bundle quantity:

```ts
bundleQuantity: defaultBundleQuantity,
```

```ts
bundleQuantity: normalizeBundleQuantity(prize.bundleQuantity),
```

- [ ] Rename helpers so the math is explicit:

```ts
function prizeSlotCount(prize: CampaignPrizeDraft): number {
  return Math.max(0, Number.isFinite(prize.quantity) ? Math.trunc(prize.quantity) : 0);
}

function prizeRequiredStockUnits(prize: CampaignPrizeDraft): number {
  return prizeSlotCount(prize) * normalizeBundleQuantity(prize.bundleQuantity);
}
```

Use `prizeSlotCount` anywhere total rows/remaining slots are calculated. Use `prizeRequiredStockUnits` in stock warnings and row summaries only.

- [ ] Replace the native `<select>` inside `AdminPrizeCardPicker` with an input-backed listbox. Keep browse/click support by showing options when the input is focused, even when the search query is empty.

```tsx
const [open, setOpen] = useState(false);
const [activeIndex, setActiveIndex] = useState(0);
const selectedOption = options.find((option) => option.id === value) ?? null;
const visibleOptions = useMemo(() => {
  const q = query.trim().toLowerCase();
  const source = q
    ? options.filter((option) => adminPrizeCardSearchText(option).includes(q))
    : options;
  return source.slice(0, 80);
}, [options, query]);

return (
  <div className="admin-prize-combobox">
    <input
      role="combobox"
      aria-expanded={open}
      aria-controls={`${id}-listbox`}
      aria-autocomplete="list"
      className="admin-input admin-prize-combobox__input"
      value={open ? query : selectedOption ? adminPrizeCardOptionLabel(selectedOption) : ""}
      placeholder="Search or choose prize item"
      onFocus={() => {
        setOpen(true);
        setQuery("");
        setActiveIndex(0);
      }}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
        setActiveIndex(0);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" && open && visibleOptions[activeIndex]) {
          event.preventDefault();
          onChange(visibleOptions[activeIndex].id);
          setOpen(false);
          setQuery("");
        } else if (event.key === "Escape") {
          setOpen(false);
          setQuery("");
        }
      }}
    />
    {open ? (
      <div id={`${id}-listbox`} role="listbox" className="admin-prize-combobox__menu">
        {visibleOptions.length > 0 ? (
          visibleOptions.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`admin-prize-combobox__option ${index === activeIndex ? "is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
                setQuery("");
              }}
            >
              {adminPrizeCardOptionLabel(option)}
            </button>
          ))
        ) : (
          <span className="admin-prize-combobox__empty">No matching prize items</span>
        )}
      </div>
    ) : null}
  </div>
);
```

- [ ] Remove `showSearch={false}` from every `AdminPrizeCardPicker` row usage.

- [ ] Add `Per win` column next to `Qty` in the admin prize table:

```tsx
<th scope="col">Qty</th>
<th scope="col">Per win</th>
<th scope="col">Stock units</th>
```

```tsx
<input
  className="admin-input"
  type="number"
  min={1}
  max={maxBundleQuantity}
  value={prize.bundleQuantity}
  onChange={(event) =>
    onPrizeChange(prize.localId, {
      bundleQuantity: normalizeBundleQuantity(event.target.value),
    })
  }
/>
```

```tsx
<span className="admin-prize-stock-units">
  {prizeRequiredStockUnits(prize)}
</span>
```

- [ ] Add CSS that prevents the dropdown from taking the full page height:

```css
.admin-prize-combobox {
  position: relative;
  min-width: min(100%, 320px);
}

.admin-prize-combobox__input {
  width: 100%;
}

.admin-prize-combobox__menu {
  position: absolute;
  z-index: 80;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: min(320px, 45vh);
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: #111412;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
  padding: 6px;
}

.admin-prize-combobox__option {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.admin-prize-combobox__option:hover,
.admin-prize-combobox__option.is-active {
  background: rgba(255, 224, 126, 0.14);
}

.admin-prize-combobox__empty {
  display: block;
  padding: 10px;
  color: rgba(255, 255, 255, 0.58);
}
```

- [ ] In the submit payload, serialize bundle quantity:

```ts
bundleQuantity: normalizeBundleQuantity(prize.bundleQuantity),
quantity: prizeSlotCount(prize),
```

**Verify:**

```bash
cd Website && npm run test:random-pack-bundles
cd Website && npm run lint
cd Website && npm run typecheck
```

Manual browser check after implementation: create random pack, click an empty prize field, confirm the list opens with items; type `OP14`, confirm results filter; arrow down and Enter selects; click select also works; dropdown height stays under 45vh while the page scrolls.

**Commit:**

```bash
git add Website/src/features/ynot/client.tsx Website/src/app/globals.css
git commit -m $'Make random-pack prize selection searchable and bundled\n\nConstraint: admin needs both typing search and click browsing without full-page native dropdown overflow.\nRejected: native select with separate search field | large prize catalogs remain painful to browse.\nConfidence: medium\nScope-risk: moderate\nTested: npm run test:random-pack-bundles; npm run lint; npm run typecheck\nNot-tested: manual browser click path'
```

## Task 6: Wire Public Open, Lineup, History, Collection, And Conversion Data

**Files:**
- `Website/src/app/api/ynot/gacha/open/route.ts`
- `Website/src/features/ynot/data.ts`
- `Website/src/features/ynot/types.ts`
- `Website/src/features/ynot/cr/HistoryExperience.tsx`
- `Website/src/features/ynot/cr/AllPullsExperience.tsx`

**Steps:**

- [ ] In `Website/src/app/api/ynot/gacha/open/route.ts`, add safe bundle fields:

```ts
import { publicBundleQuantity } from "@/features/ynot/bundle-quantity";

type RawOpenItem = {
  id: string;
  cardId: string;
  cardCode?: string | null;
  cardName: string;
  imageUrl?: string | null;
  displayTier?: string | null;
  valueThb?: number | null;
  resultPosition?: number | null;
  bundleQuantity?: number | null;
  prizeUnitId?: string | null;
};

type PublicOpenItem = Omit<RawOpenItem, "prizeUnitId"> & {
  bundleQuantity?: number;
};

function toPublicOpenItem(item: RawOpenItem): PublicOpenItem {
  return {
    id: item.id,
    cardId: item.cardId,
    cardCode: item.cardCode ?? null,
    cardName: item.cardName,
    imageUrl: item.imageUrl ?? null,
    displayTier: item.displayTier ?? null,
    valueThb: item.valueThb ?? null,
    resultPosition: item.resultPosition ?? null,
    bundleQuantity: publicBundleQuantity(item.bundleQuantity),
  };
}
```

- [ ] In `hydrateItems`, select `bundle_quantity` from `gacha_open_items` and map to `bundleQuantity`.

```ts
.select("id, card_id, draw_round_prize_id, tier, value_thb, result_position, bundle_quantity")
```

- [ ] In `Website/src/features/ynot/data.ts`, add `bundle_quantity` to public prize selects and map:

```ts
bundleQuantity: publicBundleQuantity(prize.bundle_quantity),
```

- [ ] For collection grouping, derive groups through `draw_round_prize_units.gacha_open_item_id` and expose safe group fields only:

```ts
const bundleGroups = new Map<string, YnotCollectionItem[]>();
for (const item of mappedCollection) {
  if (!item.bundleGroupId) continue;
  const group = bundleGroups.get(item.bundleGroupId) ?? [];
  group.push(item);
  bundleGroups.set(item.bundleGroupId, group);
}

for (const group of bundleGroups.values()) {
  const ids = group.map((item) => item.id);
  const quantity = group.length;
  group.forEach((item, index) => {
    item.bundleQuantity = quantity > 1 ? quantity : undefined;
    item.bundleIndex = index + 1;
    item.bundleGroupItemIds = ids;
  });
}
```

Use the existing `draw_round_prize_units` link to `gacha_open_item_id`; do not return `draw_round_prize_unit_id` to client code.

- [ ] In `getGachaOpenHistory`, map each reward with:

```ts
bundleQuantity: publicBundleQuantity(item.bundle_quantity),
```

- [ ] In `HistoryExperience.tsx`, group display rows by `bundleGroupId` before rendering. A grouped tile uses:

```ts
const representedIds = card.bundleGroupItemIds?.length
  ? card.bundleGroupItemIds
  : [card.id];
```

When selecting for sell or ship, toggle all `representedIds`. When calculating totals, continue summing the selected individual `collection_items`, so x3 convert value is exactly three per-unit snapshots.

- [ ] In `AllPullsExperience.tsx`, add `bundleQuantity` to `PullRow` and set row value to grouped total when the collection item has group ids:

```ts
bundleQuantity: c.bundleQuantity,
valueCoins: (c.convertCoinValue ?? 0) * (c.bundleQuantity ?? 1),
```

**Verify:**

```bash
cd Website && npm run test:pack-open-privacy
cd Website && npm run test:campaign-detail-privacy
cd Website && npm run test:random-pack-bundles
cd Website && npm run typecheck
```

Expected output: privacy tests pass and prove `bundleQuantity` is public while stock-unit and owner metadata remain absent.

**Commit:**

```bash
git add Website/src/app/api/ynot/gacha/open/route.ts Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/cr/HistoryExperience.tsx Website/src/features/ynot/cr/AllPullsExperience.tsx
git commit -m $'Expose bundled rewards safely on customer data paths\n\nConstraint: customers may see xN but never internal odds, stock-unit ids, or owner stock filters.\nRejected: returning draw_round_prize_units to group rewards client-side | that exposes house inventory structure.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:pack-open-privacy; npm run test:campaign-detail-privacy; npm run test:random-pack-bundles; npm run typecheck\nNot-tested: visual badge placement'
```

## Task 7: Add xN Badge UI On Related Customer Surfaces

**Files:**
- `Website/src/features/ynot/cr/QuantityBadge.tsx`
- `Website/src/features/ynot/cr/PackDetailExperience.tsx`
- `Website/src/features/ynot/components.tsx`
- `Website/src/features/ynot/client.tsx`
- `Website/src/features/ynot/cr/HistoryExperience.tsx`
- `Website/src/features/ynot/cr/AllPullsExperience.tsx`
- `Website/src/features/ynot/cr/theme.css`

**Steps:**

- [ ] Create shared badge component:

```tsx
export function QuantityBadge({ quantity }: { quantity?: number | null }) {
  if (!quantity || quantity <= 1) return null;
  return <span className="cr-qty-badge">x{quantity}</span>;
}
```

- [ ] Add badge CSS:

```css
.cr-qty-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  min-width: 42px;
  padding: 7px 9px;
  background: rgba(19, 20, 21, 0.92);
  color: #fff;
  font-weight: 900;
  font-size: 22px;
  line-height: 1;
  text-align: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
}
```

- [ ] In `PackDetailExperience.tsx`, render the badge inside each prize art wrapper:

```tsx
<QuantityBadge quantity={prize.bundleQuantity} />
```

- [ ] In legacy `components.tsx` `PrizeLineup`, render the same badge so old pack detail surfaces stay aligned.

- [ ] In `client.tsx` opening reveal result cards, render:

```tsx
<QuantityBadge quantity={item.bundleQuantity} />
```

- [ ] In `HistoryExperience.tsx` collection tiles, render:

```tsx
<QuantityBadge quantity={card.bundleQuantity} />
```

Change text totals:

```tsx
<CoinPip size={10} /> Sell for {formatCoins(card.sellValueCoins * (card.bundleQuantity ?? 1))}
```

- [ ] In `AllPullsExperience.tsx`, render the badge on thumbnails and include xN in compact row metadata:

```tsx
{row.bundleQuantity && row.bundleQuantity > 1 ? (
  <span className="cr-pulls-bundle">x{row.bundleQuantity}</span>
) : null}
```

**Verify:**

```bash
cd Website && npm run test:random-pack-bundles
cd Website && npm run lint
cd Website && npm run typecheck
```

Manual visual check after implementation: one x3 pack prize shows one tile with an x3 badge on pack detail, opening reveal, collection, and all pulls. x1 items show no badge.

**Commit:**

```bash
git add Website/src/features/ynot/cr/QuantityBadge.tsx Website/src/features/ynot/cr/PackDetailExperience.tsx Website/src/features/ynot/components.tsx Website/src/features/ynot/client.tsx Website/src/features/ynot/cr/HistoryExperience.tsx Website/src/features/ynot/cr/AllPullsExperience.tsx Website/src/features/ynot/cr/theme.css
git commit -m $'Show bundled reward quantity on related customer surfaces\n\nConstraint: xN display belongs only to related reward surfaces, not unrelated pages.\nRejected: global badge injection | unrelated card grids would show bundle context they do not own.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:random-pack-bundles; npm run lint; npm run typecheck\nNot-tested: browser visual screenshots'
```

## Task 8: End-To-End Verification And Production Readiness Gate

**Files:**
- `Website/package.json`
- `Database/supabase/migrations/20260605090000_random_pack_bundle_quantity.sql`
- Changed source files from Tasks 1-7

**Steps:**

- [ ] Run focused test suite:

```bash
cd Website && npm run test:stock-readiness
cd Website && npm run test:pack-open-privacy
cd Website && npm run test:campaign-detail-privacy
cd Website && npm run test:random-pack-bundles
```

Expected output: all four commands pass.

- [ ] Run general code quality checks:

```bash
cd Website && npm run lint
cd Website && npm run typecheck
```

Expected output: lint exits 0 and TypeScript exits 0.

- [ ] Run Supabase migration safety check only:

```bash
cd Database && supabase migration list --linked
cd Database && supabase db push --linked --dry-run --include-all
```

Expected output: migration list connects successfully; dry-run shows `20260605090000_random_pack_bundle_quantity.sql` pending and does not apply it.

- [ ] Manual admin QA:
  - Open admin random-pack create/edit page.
  - In Bronze tier, click prize item field with empty search. The list opens and can be clicked.
  - Type `OP14`; list filters to matching pack/box/card items.
  - Use arrow keys and Enter to choose an item.
  - Set `Qty = 87`, `Per win = 3`; stock units summary shows `261`.
  - Set convert coins to `100`; row summary shows per-win convert total `300`.
  - Save as draft and reload. `Per win` stays `3`.

- [ ] Manual customer QA on a staging/test pack:
  - Open a test random pack containing one x3 pack/box bronze prize.
  - Reveal shows one reward card with x3 badge.
  - User collection shows one grouped visual tile and selecting sell selects all three underlying owned items.
  - Convert preview shows `3 * perUnitConvertCoinValue`.
  - Shipping selection for the grouped tile submits all child item ids.
  - All pulls/history show one grouped reward with x3 badge.

- [ ] Privacy QA:
  - Inspect `/api/ynot/gacha/open` response. It includes `bundleQuantity` only when greater than 1.
  - Confirm response does not include `prizeUnitId`, `drawRoundPrizeUnitIds`, `weight`, `unlockAtSoldPct`, `stockUnitGroupKey`, `stockUnitFilter`, cert number, or stock metadata.
  - Inspect campaign detail prize lineup. It includes safe item display and `bundleQuantity`; it does not include planned quantity or owner stock filters.

**Commit:**

```bash
git status --short
git commit --allow-empty -m $'Verify bundled random-pack reward journey\n\nConstraint: production migration must remain dry-run-only until explicit deployment approval.\nRejected: applying production Supabase changes during verification | user asked for planning and safety first.\nConfidence: high\nScope-risk: moderate\nTested: npm run test:stock-readiness; npm run test:pack-open-privacy; npm run test:campaign-detail-privacy; npm run test:random-pack-bundles; npm run lint; npm run typecheck; supabase db push --linked --dry-run --include-all\nNot-tested: production traffic after migration'
```

## Rollback Plan

- If migration dry-run fails, do not apply to production. Fix the SQL locally and rerun dry-run.
- If the open RPC fails in staging, keep the app deployed without the migration or revert the migration before production apply.
- If the admin combobox regresses form entry, revert Task 5 only; data model and public APIs remain compatible with x1 default.
- If grouped conversion has a UI issue, keep all underlying collection rows individually selectable and preserve correct convert totals while fixing grouping in a follow-up patch.

## Self-Review

- [x] All related functions are covered: admin create/edit, stock readiness, migration/materialization, open RPC, public open API, prize lineup, history, collection, all pulls, convert totals, and related UI.
- [x] `Qty` and `Per win` have separate meanings, so odds stay stable and stock math becomes correct.
- [x] Convert coins are multiplied by issuing multiple physical collection items, so the existing conversion sum remains correct.
- [x] Public outputs expose only `bundleQuantity` and xN display, not house data.
- [x] Existing packs default to x1 through database defaults and TypeScript normalization.
- [x] The plan includes test-first steps, verification commands, and production dry-run gate.
