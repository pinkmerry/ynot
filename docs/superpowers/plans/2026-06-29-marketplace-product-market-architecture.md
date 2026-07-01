# Marketplace Product Market Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SNKRDUNK-style marketplace foundation for YNOTT: canonical product pages, variants, typed filters, price history, and default-deny public projection.

**Architecture:** Keep ADR-0003 intact: Marketplace remains a separate Worker and separate Marketplace Supabase project while YNOTT Customer Account remains the shared login. Add a deep Product Market module above Marketplace Listing snapshots, a default-deny Public Projection module before public serialization, and a typed Marketplace Query Plan so filters/search/sort are one interface instead of URL/string/JSON leakage. Price history is projected from paid Marketplace Orders into an immutable public-safe ledger.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript strict, Supabase/PostgreSQL migrations, Cloudflare Workers via OpenNext, Node `node:test` static guard tests, existing marketplace verification scripts.

---

## Scope Check

This plan covers the first coherent slice needed for the SNKRDUNK-like marketplace experience:

- Product Market read model: canonical product, variant, active listing, and sold-history facts.
- Public Projection: allowlisted public serialization for listing/product/variant/history payloads.
- Marketplace Query Plan: typed filters/search/sort/cursor vocabulary.
- Price History: immutable public-safe sale points generated from paid Marketplace Orders.
- Frontend product page: `/marketplace/products/[productSlug]` with variants, filters, live listings, and price-history section.

This plan deliberately does **not** implement three independent architecture candidates from the review:

- Route orchestration adapter.
- Payment Proof route deepening.
- Admin Marketplace operations split.

Those should become separate plans after Product Market is working because each can ship independently and has a different risk profile.

## Domain Terms

Use the existing `CONTEXT.md` terms:

- **YNOTT Customer Account:** shared login identity.
- **Marketplace Account:** internal marketplace record linked to one YNOTT Customer Account.
- **Marketplace Inventory:** marketplace-owned stock, never Customer Bag reward rows.
- **Official Shop Product:** YNOTT-owned Marketplace Inventory.
- **Consignment Intake:** seller-to-YNOTT middleman intake.
- **Marketplace Listing:** public sellable offer from Marketplace Inventory.
- **Marketplace Order:** real-money THB purchase record.
- **Seller Payout:** money owed to seller after fee and release milestone.

New terms introduced by this plan:

- **Product Market:** public-safe read model for a sellable product, its variants, active Marketplace Listings, and sale history.
- **Market Variant:** normalized product variant identity used by filters and Product Market pages.
- **Market Price History:** immutable public-safe sale point derived from a paid Marketplace Order.
- **Public Projection:** default-deny module that serializes only allowlisted fields to public marketplace routes.
- **Marketplace Query Plan:** typed normalized filter/search/sort/cursor plan shared by UI, routes, and DB adapters.

## File Structure

| File | Responsibility |
|---|---|
| `docs/superpowers/plans/2026-06-29-marketplace-product-market-architecture.md` | This implementation plan. |
| `Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql` | Product Market tables, listing links, price-history ledger, indexes, RLS/grants, paid-order trigger. |
| `Website/scripts/test-marketplace-product-market-architecture.mjs` | Static guard tests for schema, modules, routes, public projection, and package scripts. |
| `Website/package.json` | Add scoped test script `test:marketplace-product-market`. |
| `Website/src/lib/marketplace/public-projection.ts` | Default-deny serializers for listing/product/variant/history public payloads. |
| `Website/src/lib/marketplace/query-plan.ts` | Typed parser/normalizer for marketplace filters, condition buckets, grade buckets, sort, cursor, and URL params. |
| `Website/src/lib/marketplace/product-market.ts` | Product Market read module; loads product page data, active listings, variants, and price history. |
| `Website/src/lib/marketplace/listings.ts` | Consume Query Plan and Public Projection; include product/variant fields in public listing snapshots. |
| `Website/src/lib/marketplace/orders.ts` | Reuse Public Projection for nested listing/order payloads. |
| `Website/src/lib/marketplace/mock-data.ts` | Add mock Product Market data for local product page smoke checks. |
| `Website/src/app/api/ynot/marketplace/products/[productSlug]/route.ts` | Canonical Product Market JSON route. |
| `Website/src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts` | Product-scoped listing JSON route with typed filters. |
| `Website/src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts` | Product-scoped price-history JSON route. |
| `Website/src/app/api/marketplace/products/[productSlug]/route.ts` | Alias route re-export. |
| `Website/src/app/api/marketplace/products/[productSlug]/listings/route.ts` | Alias route re-export. |
| `Website/src/app/api/marketplace/products/[productSlug]/price-history/route.ts` | Alias route re-export. |
| `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx` | Product Market page. |
| `Website/src/features/ynot/MarketplaceProductPage.tsx` | Product page presentation module. |
| `Website/src/features/ynot/components.tsx` | Update marketplace filter links and listing card links to Product Market where available. |
| `Website/src/app/globals.css` | Add product-page layout styles. |
| `Website/tools/verification/verify-marketplace-schema.mjs` | Add product-market schema guard checks. |
| `Website/tools/verification/verify-marketplace-hardening.mjs` | Add public-projection leakage guard checks. |
| `Website/tools/verification/verify-marketplace-doc-traceability.mjs` | Add route/module traceability checks. |

---

## Task 1: Add Architecture Guard Test And Package Script

**Files:**
- Create: `Website/scripts/test-marketplace-product-market-architecture.mjs`
- Modify: `Website/package.json`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Write the failing architecture guard test**

Create `Website/scripts/test-marketplace-product-market-architecture.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql",
);
const forbiddenCoreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260629160000_marketplace_product_market.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

test("package exposes the product market architecture test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-product-market"],
    "node --test scripts/test-marketplace-product-market-architecture.mjs",
  );
});

test("product market migration lives only in the Marketplace Supabase stream", () => {
  assert.ok(existsSync(migrationPath), "missing product market marketplace migration");
  assert.ok(
    !existsSync(forbiddenCoreMigrationPath),
    "product market migration must not live in the core YNOTT Supabase stream",
  );

  const sql = compactSql(readFileSync(migrationPath, "utf8"));
  for (const table of [
    "marketplace_products",
    "marketplace_product_variants",
    "marketplace_price_history_points",
  ]) {
    requirePattern(
      sql,
      new RegExp(`create table if not exists public\\.${table}\\b`),
      `missing ${table}`,
    );
    requirePattern(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} must enable RLS`,
    );
    requirePattern(
      sql,
      new RegExp(`grant all on[\\s\\S]*public\\.${table}[\\s\\S]*to service_role`),
      `${table} must be service-role owned`,
    );
    requirePattern(
      sql,
      new RegExp(`revoke all on[\\s\\S]*public\\.${table}[\\s\\S]*from public, anon, authenticated`),
      `${table} must revoke browser-role table access`,
    );
  }

  requirePattern(sql, /alter table public\.marketplace_inventory_items[\s\S]*product_id uuid/);
  requirePattern(sql, /alter table public\.marketplace_listing_snapshots[\s\S]*variant_id uuid/);
  requirePattern(sql, /marketplace_products_slug_idx/);
  requirePattern(sql, /marketplace_variants_product_idx/);
  requirePattern(sql, /marketplace_listing_product_active_idx/);
  requirePattern(sql, /marketplace_price_history_product_idx/);
  requirePattern(sql, /marketplace_record_price_history_for_order/);
  requirePattern(sql, /marketplace_orders_record_price_history_after_paid/);
});

test("product market source modules and routes exist", () => {
  for (const relPath of [
    "src/lib/marketplace/public-projection.ts",
    "src/lib/marketplace/query-plan.ts",
    "src/lib/marketplace/product-market.ts",
    "src/app/api/ynot/marketplace/products/[productSlug]/route.ts",
    "src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts",
    "src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts",
    "src/app/api/marketplace/products/[productSlug]/route.ts",
    "src/app/api/marketplace/products/[productSlug]/listings/route.ts",
    "src/app/api/marketplace/products/[productSlug]/price-history/route.ts",
    "src/app/(store)/marketplace/products/[productSlug]/page.tsx",
    "src/features/ynot/MarketplaceProductPage.tsx",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("public projection uses allowlists and blocks private marketplace keys", () => {
  const projection = readApp("src/lib/marketplace/public-projection.ts");
  requirePattern(projection, /PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS/);
  requirePattern(projection, /PUBLIC_PRODUCT_METADATA_KEYS/);
  requirePattern(projection, /PUBLIC_PRICE_HISTORY_KEYS/);
  requirePattern(projection, /projectPublicListingSnapshot/);
  requirePattern(projection, /projectPublicProductMarket/);
  requirePattern(projection, /projectPublicPriceHistoryPoint/);
  assert.doesNotMatch(
    projection,
    /sellerPayoutState|sellerPayoutSatang|privateAdminNote|procurementNote/,
    "private keys must not be allowlisted",
  );
});

test("query plan owns typed market filters instead of q-string chips", () => {
  const queryPlan = readApp("src/lib/marketplace/query-plan.ts");
  requirePattern(queryPlan, /MarketplaceConditionBucket/);
  requirePattern(queryPlan, /MarketplaceGradeBucket/);
  requirePattern(queryPlan, /marketplaceQueryPlanFromUrl/);
  requirePattern(queryPlan, /marketplaceQueryPlanToSearchParams/);
  requirePattern(queryPlan, /condition/);
  requirePattern(queryPlan, /grade/);
  requirePattern(queryPlan, /inStockOnly/);

  const components = readApp("src/features/ynot/components.tsx");
  assert.doesNotMatch(
    components,
    /case "psa10":[\s\S]*params\.set\("q", "psa 10"\)/,
    "PSA 10 filter must use typed grade params, not q text",
  );
});

test("marketplace verifiers cover product market and public projection", () => {
  const schemaVerifier = readApp("tools/verification/verify-marketplace-schema.mjs");
  const hardeningVerifier = readApp("tools/verification/verify-marketplace-hardening.mjs");
  const traceVerifier = readApp("tools/verification/verify-marketplace-doc-traceability.mjs");

  requirePattern(schemaVerifier, /marketplace_products/);
  requirePattern(schemaVerifier, /marketplace_product_variants/);
  requirePattern(schemaVerifier, /marketplace_price_history_points/);
  requirePattern(hardeningVerifier, /projectPublicListingSnapshot/);
  requirePattern(hardeningVerifier, /PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS/);
  requirePattern(traceVerifier, /products\/\[productSlug\]/);
});

test("architecture ADR remains honored", () => {
  const adr = readRepo("docs/adr/0003-marketplace-separate-service-and-database.md");
  assert.match(adr, /separate Marketplace Worker\/service/);
  assert.match(adr, /separate Marketplace Supabase project/);
  assert.match(adr, /one YNOTT login/);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd Website
node --test scripts/test-marketplace-product-market-architecture.mjs
```

Expected: FAIL with `test:marketplace-product-market` missing from `package.json`.

- [ ] **Step 3: Add the package script**

Modify `Website/package.json` inside `scripts`:

```json
"test:marketplace-product-market": "node --test scripts/test-marketplace-product-market-architecture.mjs"
```

Place it near the other marketplace test scripts, after `test:marketplace-ops-hardening`.

- [ ] **Step 4: Run the test to verify the next failure moves to the missing migration/modules**

Run:

```bash
cd Website
npm run test:marketplace-product-market
```

Expected: FAIL with `missing product market marketplace migration`.

- [ ] **Step 5: Commit**

```bash
git add Website/package.json Website/scripts/test-marketplace-product-market-architecture.mjs
git commit -m "Guard Product Market architecture before implementation" \
  -m "Constraint: Marketplace must remain in the separate Marketplace Supabase stream." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep product-market tests static and fast before adding live DB checks." \
  -m "Tested: cd Website && node --test scripts/test-marketplace-product-market-architecture.mjs failed on missing migration as expected." \
  -m "Not-tested: Runtime Product Market routes are not implemented yet."
```

---

## Task 2: Add Product Market Database Migration

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Create the Product Market migration**

Create `Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql`:

```sql
-- Marketplace Product Market read model.
-- Canonical product/variant identity stays in the separate Marketplace Supabase project.
-- Existing Marketplace Listing snapshots keep working while product_id/variant_id are backfilled.

create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null unique check (product_slug ~ '^[a-z0-9][a-z0-9-]{2,180}$'),
  product_type text not null default 'card'
    check (product_type in ('card', 'sealed_box', 'sealed_pack')),
  title text not null check (length(title) between 1 and 240),
  brand text,
  category text,
  series_name text,
  set_name text,
  card_code text,
  language text,
  release_date date,
  hero_image_url text,
  search_text text not null default '',
  reference_source text,
  reference_card_id text,
  reference_snapshot jsonb not null default '{}'::jsonb,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hero_image_url is null or hero_image_url ~ '^(https://|/)'),
  check (jsonb_typeof(reference_snapshot) = 'object'),
  check (jsonb_typeof(public_metadata) = 'object')
);

create table if not exists public.marketplace_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete restrict,
  variant_slug text not null unique check (variant_slug ~ '^[a-z0-9][a-z0-9-]{2,220}$'),
  variant_label text not null check (length(variant_label) between 1 and 240),
  language text,
  printing text,
  rarity text,
  grade_service text,
  grade_value text,
  condition_bucket text not null default 'raw'
    check (condition_bucket in (
      'raw',
      'sealed',
      'a',
      'b',
      'c',
      'd',
      'psa_10',
      'psa_9',
      'psa_8_under',
      'bgs_10_black',
      'bgs_10_gold',
      'bgs_9_5',
      'bgs_9_under',
      'ars_10_plus',
      'ars_10',
      'ars_9',
      'ars_8_under',
      'other_graded'
    )),
  reference_variant_id text,
  variant_snapshot jsonb not null default '{}'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(variant_snapshot) = 'object'),
  check (jsonb_typeof(image_urls) = 'array'),
  check (jsonb_array_length(image_urls) <= 12)
);

alter table public.marketplace_inventory_items
  add column if not exists product_id uuid references public.marketplace_products(id) on delete restrict,
  add column if not exists variant_id uuid references public.marketplace_product_variants(id) on delete restrict;

alter table public.marketplace_listing_snapshots
  add column if not exists product_id uuid references public.marketplace_products(id) on delete restrict,
  add column if not exists variant_id uuid references public.marketplace_product_variants(id) on delete restrict,
  add column if not exists item_type_public text,
  add column if not exists condition_bucket text,
  add column if not exists grade_service text,
  add column if not exists grade_value text;

create table if not exists public.marketplace_price_history_points (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete restrict,
  variant_id uuid references public.marketplace_product_variants(id) on delete restrict,
  listing_id uuid not null,
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  condition_bucket text not null default 'raw'
    check (condition_bucket in (
      'raw',
      'sealed',
      'a',
      'b',
      'c',
      'd',
      'psa_10',
      'psa_9',
      'psa_8_under',
      'bgs_10_black',
      'bgs_10_gold',
      'bgs_9_5',
      'bgs_9_under',
      'ars_10_plus',
      'ars_10',
      'ars_9',
      'ars_8_under',
      'other_graded'
    )),
  grade_service text,
  grade_value text,
  item_price_satang integer not null check (item_price_satang > 0),
  currency text not null default 'THB' check (currency = 'THB'),
  sold_at timestamptz not null default now(),
  public_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(public_snapshot) = 'object')
);

create index if not exists marketplace_products_slug_idx
  on public.marketplace_products(product_slug);
create index if not exists marketplace_products_search_idx
  on public.marketplace_products using gin (to_tsvector('simple', search_text));
create index if not exists marketplace_variants_product_idx
  on public.marketplace_product_variants(product_id, condition_bucket, updated_at desc);
create index if not exists marketplace_inventory_product_idx
  on public.marketplace_inventory_items(product_id, variant_id, item_state, updated_at desc);
create index if not exists marketplace_listing_product_active_idx
  on public.marketplace_listing_snapshots(product_id, variant_id, condition_bucket, item_price_satang, visible_from desc, listing_id)
  where listing_state = 'active';
create index if not exists marketplace_listing_product_source_idx
  on public.marketplace_listing_snapshots(product_id, listing_source, listing_state, item_price_satang, visible_from desc, listing_id);
create index if not exists marketplace_price_history_product_idx
  on public.marketplace_price_history_points(product_id, variant_id, condition_bucket, sold_at desc);
create index if not exists marketplace_price_history_listing_idx
  on public.marketplace_price_history_points(listing_id, sold_at desc);

drop trigger if exists marketplace_products_touch_updated_at on public.marketplace_products;
create trigger marketplace_products_touch_updated_at
before update on public.marketplace_products
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_product_variants_touch_updated_at on public.marketplace_product_variants;
create trigger marketplace_product_variants_touch_updated_at
before update on public.marketplace_product_variants
for each row execute function public.marketplace_touch_updated_at();

create or replace view public.marketplace_public_product_markets as
select
  product.id,
  product.product_slug,
  product.product_type,
  product.title,
  product.brand,
  product.category,
  product.series_name,
  product.set_name,
  product.card_code,
  product.language,
  product.release_date,
  product.hero_image_url,
  product.public_metadata,
  product.updated_at,
  coalesce(active_stats.active_listing_count, 0)::integer as active_listing_count,
  active_stats.lowest_price_satang,
  coalesce(history_stats.sold_count, 0)::integer as sold_count,
  history_stats.last_sold_at
from public.marketplace_products product
left join lateral (
  select
    count(*) as active_listing_count,
    min(listing.item_price_satang) as lowest_price_satang
  from public.marketplace_listing_snapshots listing
  where listing.product_id = product.id
    and listing.listing_state = 'active'
) active_stats on true
left join lateral (
  select
    count(*) as sold_count,
    max(point.sold_at) as last_sold_at
  from public.marketplace_price_history_points point
  where point.product_id = product.id
) history_stats on true;

create or replace function public.marketplace_record_price_history_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  inserted_row public.marketplace_price_history_points%rowtype;
begin
  select * into order_row
  from public.marketplace_orders
  where id = p_order_id;

  if order_row.id is null then
    raise exception 'marketplace_order_not_found';
  end if;

  if order_row.payment_state <> 'paid' or order_row.refund_state <> 'none' then
    return jsonb_build_object('recorded', false, 'reason', 'order_not_public_history_eligible');
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = order_row.listing_id;

  if listing_row.id is null or listing_row.product_id is null then
    return jsonb_build_object('recorded', false, 'reason', 'listing_product_missing');
  end if;

  insert into public.marketplace_price_history_points(
    product_id,
    variant_id,
    listing_id,
    order_id,
    listing_source,
    condition_bucket,
    grade_service,
    grade_value,
    item_price_satang,
    currency,
    sold_at,
    public_snapshot
  )
  values (
    listing_row.product_id,
    listing_row.variant_id,
    listing_row.listing_id,
    order_row.id,
    order_row.listing_source,
    coalesce(listing_row.condition_bucket, 'raw'),
    listing_row.grade_service,
    listing_row.grade_value,
    order_row.item_price_satang,
    order_row.currency,
    coalesce(order_row.updated_at, now()),
    jsonb_build_object(
      'listingSource', order_row.listing_source,
      'conditionBucket', coalesce(listing_row.condition_bucket, 'raw'),
      'gradeService', listing_row.grade_service,
      'gradeValue', listing_row.grade_value
    )
  )
  on conflict (order_id) do update
    set product_id = excluded.product_id,
        variant_id = excluded.variant_id,
        listing_id = excluded.listing_id,
        listing_source = excluded.listing_source,
        condition_bucket = excluded.condition_bucket,
        grade_service = excluded.grade_service,
        grade_value = excluded.grade_value,
        item_price_satang = excluded.item_price_satang,
        currency = excluded.currency,
        sold_at = excluded.sold_at,
        public_snapshot = excluded.public_snapshot
  returning * into inserted_row;

  return jsonb_build_object(
    'recorded', true,
    'priceHistoryPointId', inserted_row.id,
    'orderId', inserted_row.order_id,
    'productId', inserted_row.product_id
  );
end;
$$;

create or replace function public.marketplace_record_price_history_after_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_state = 'paid'
    and old.payment_state is distinct from new.payment_state
    and new.refund_state = 'none' then
    perform public.marketplace_record_price_history_for_order(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_orders_record_price_history_after_paid
  on public.marketplace_orders;
create trigger marketplace_orders_record_price_history_after_paid
after update of payment_state on public.marketplace_orders
for each row execute function public.marketplace_record_price_history_after_paid();

alter table public.marketplace_products enable row level security;
alter table public.marketplace_product_variants enable row level security;
alter table public.marketplace_price_history_points enable row level security;

revoke all on table
  public.marketplace_products,
  public.marketplace_product_variants,
  public.marketplace_price_history_points
from public, anon, authenticated;
grant all on table
  public.marketplace_products,
  public.marketplace_product_variants,
  public.marketplace_price_history_points
to service_role;

revoke all on function public.marketplace_record_price_history_for_order(uuid)
from public, anon, authenticated;
revoke all on function public.marketplace_record_price_history_after_paid()
from public, anon, authenticated;
grant execute on function public.marketplace_record_price_history_for_order(uuid)
to service_role;
grant execute on function public.marketplace_record_price_history_after_paid()
to service_role;
```

- [ ] **Step 2: Run architecture test**

Run:

```bash
cd Website
npm run test:marketplace-product-market
```

Expected: FAIL with missing `public-projection.ts`, `query-plan.ts`, and `product-market.ts`.

- [ ] **Step 3: Run existing marketplace schema test to catch SQL-pattern regressions**

Run:

```bash
cd Website
npm run verify:marketplace-schema
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260629160000_marketplace_product_market.sql
git commit -m "Create Product Market schema for public marketplace pages" \
  -m "Constraint: Marketplace product tables stay in Database/marketplace-supabase, not core Database/supabase." \
  -m "Rejected: Deriving price history directly from private order payloads | would leak private transaction implementation into public pages." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Do not expose product-market tables directly to anon/authenticated roles." \
  -m "Tested: cd Website && npm run verify:marketplace-schema passed; npm run test:marketplace-product-market failed on missing source modules as expected." \
  -m "Not-tested: Migration not applied to linked production Supabase."
```

---

## Task 3: Add Default-Deny Public Projection Module

**Files:**
- Create: `Website/src/lib/marketplace/public-projection.ts`
- Modify: `Website/src/lib/marketplace/listings.ts`
- Modify: `Website/src/lib/marketplace/orders.ts`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Create the public projection module**

Create `Website/src/lib/marketplace/public-projection.ts`:

```ts
import "server-only";

type JsonObject = Record<string, unknown>;

export const PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS = new Set([
  "sourceBadge",
  "itemType",
  "conditionCode",
  "conditionBucket",
  "gradeService",
  "gradeValue",
  "sourceKind",
  "productSlug",
  "variantSlug",
]);

export const PUBLIC_PRODUCT_METADATA_KEYS = new Set([
  "rarity",
  "artist",
  "cardNumber",
  "setCode",
  "boxProductSlug",
  "packProductSlug",
]);

export const PUBLIC_VARIANT_SNAPSHOT_KEYS = new Set([
  "language",
  "printing",
  "rarity",
  "gradeService",
  "gradeValue",
  "conditionBucket",
  "certNumberPublicSuffix",
]);

export const PUBLIC_PRICE_HISTORY_KEYS = new Set([
  "listingSource",
  "conditionBucket",
  "gradeService",
  "gradeValue",
]);

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function projectObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (!isObject(value)) return {};
  const projected: JsonObject = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (allowedKeys.has(key)) projected[key] = fieldValue;
  }
  return projected;
}

export function projectPublicListingSnapshot<T extends { snapshot_payload: unknown }>(
  row: T,
) {
  return {
    ...row,
    snapshot_payload: projectObject(
      row.snapshot_payload,
      PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS,
    ),
  };
}

export function projectPublicProductMarket<T extends { public_metadata: unknown }>(
  row: T,
) {
  return {
    ...row,
    public_metadata: projectObject(
      row.public_metadata,
      PUBLIC_PRODUCT_METADATA_KEYS,
    ),
  };
}

export function projectPublicVariant<T extends { variant_snapshot: unknown }>(
  row: T,
) {
  return {
    ...row,
    variant_snapshot: projectObject(
      row.variant_snapshot,
      PUBLIC_VARIANT_SNAPSHOT_KEYS,
    ),
  };
}

export function projectPublicPriceHistoryPoint<T extends { public_snapshot: unknown }>(
  row: T,
) {
  return {
    ...row,
    public_snapshot: projectObject(
      row.public_snapshot,
      PUBLIC_PRICE_HISTORY_KEYS,
    ),
  };
}
```

- [ ] **Step 2: Run test to verify projection module failure moves forward**

Run:

```bash
cd Website
npm run test:marketplace-product-market
```

Expected: FAIL with missing `query-plan.ts` and `product-market.ts`.

- [ ] **Step 3: Use projection in `listings.ts`**

Modify `Website/src/lib/marketplace/listings.ts`:

```ts
import { projectPublicListingSnapshot } from "./public-projection";
```

Update `LISTING_SELECT` to include Product Market columns after `inventory_item_id`:

```ts
  "product_id",
  "variant_id",
```

Update `MarketplaceListingSnapshot`:

```ts
  product_id: string | null;
  variant_id: string | null;
```

Update row return in `listMarketplaceListingPage`:

```ts
  const rows = ((result.data ?? []) as unknown as MarketplaceListingSnapshot[]).map(
    projectPublicListingSnapshot,
  );
```

Update `getMarketplaceListing` return:

```ts
  return projectPublicListingSnapshot(
    result.data as unknown as MarketplaceListingSnapshot,
  );
```

- [ ] **Step 4: Use projection in `orders.ts` listing summary sanitizer**

Modify `Website/src/lib/marketplace/orders.ts`:

```ts
import { projectPublicListingSnapshot } from "./public-projection";
```

Replace `sanitizeListingSummary` with:

```ts
function sanitizeListingSummary(row: ListingSummaryRow | null) {
  if (!row) return null;
  return projectPublicListingSnapshot(row);
}
```

Keep `sanitizeBuyerPayload` because it protects buyer order payloads that are not listing snapshots.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cd Website
npm run test:marketplace-product-market
npm run verify:marketplace-hardening
```

Expected: `test:marketplace-product-market` still fails on missing Query Plan/Product Market modules; `verify:marketplace-hardening` passes.

- [ ] **Step 6: Commit**

```bash
git add Website/src/lib/marketplace/public-projection.ts Website/src/lib/marketplace/listings.ts Website/src/lib/marketplace/orders.ts
git commit -m "Default-deny public marketplace projection" \
  -m "Constraint: Product variants and price history must not expose private seller, payout, procurement, or payment fields." \
  -m "Rejected: SQL blacklist-only projection | new private JSON keys could bypass old blacklist names." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Add new public payload keys only through public-projection.ts allowlists and tests." \
  -m "Tested: cd Website && npm run verify:marketplace-hardening passed; npm run test:marketplace-product-market failed on missing Query Plan/Product Market modules." \
  -m "Not-tested: Public product routes are not implemented yet."
```

---

## Task 4: Add Marketplace Query Plan Module

**Files:**
- Create: `Website/src/lib/marketplace/query-plan.ts`
- Modify: `Website/src/lib/marketplace/listings.ts`
- Modify: `Website/src/features/ynot/components.tsx`
- Modify: `Website/src/app/(store)/marketplace/page.tsx`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Create typed Query Plan module**

Create `Website/src/lib/marketplace/query-plan.ts`:

```ts
export type MarketplaceListingSource = "official_shop" | "user_seller";
export type MarketplaceItemType = "card" | "sealed_box" | "sealed_pack";
export type MarketplaceSort = "newest" | "price_asc" | "price_desc";
export type MarketplaceConditionBucket =
  | "raw"
  | "sealed"
  | "a"
  | "b"
  | "c"
  | "d"
  | "psa_10"
  | "psa_9"
  | "psa_8_under"
  | "bgs_10_black"
  | "bgs_10_gold"
  | "bgs_9_5"
  | "bgs_9_under"
  | "ars_10_plus"
  | "ars_10"
  | "ars_9"
  | "ars_8_under"
  | "other_graded";
export type MarketplaceGradeBucket = Exclude<
  MarketplaceConditionBucket,
  "raw" | "sealed" | "a" | "b" | "c" | "d"
>;

export type MarketplaceQueryPlan = {
  source?: MarketplaceListingSource;
  itemType?: MarketplaceItemType;
  condition?: MarketplaceConditionBucket;
  grade?: MarketplaceGradeBucket;
  q?: string;
  sort: MarketplaceSort;
  inStockOnly: boolean;
  limit: number;
  cursor: string | null;
};

const SOURCES = new Set(["official_shop", "user_seller"]);
const ITEM_TYPES = new Set(["card", "sealed_box", "sealed_pack"]);
const SORTS = new Set(["newest", "price_asc", "price_desc"]);
const CONDITIONS = new Set([
  "raw",
  "sealed",
  "a",
  "b",
  "c",
  "d",
  "psa_10",
  "psa_9",
  "psa_8_under",
  "bgs_10_black",
  "bgs_10_gold",
  "bgs_9_5",
  "bgs_9_under",
  "ars_10_plus",
  "ars_10",
  "ars_9",
  "ars_8_under",
  "other_graded",
]);
const GRADES = new Set([
  "psa_10",
  "psa_9",
  "psa_8_under",
  "bgs_10_black",
  "bgs_10_gold",
  "bgs_9_5",
  "bgs_9_under",
  "ars_10_plus",
  "ars_10",
  "ars_9",
  "ars_8_under",
  "other_graded",
]);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_CURSOR_BYTES = 768;

function text(value: string | null, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function int(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function limit(value: string | null) {
  const parsed = int(value);
  if (!parsed || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function bool(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

export function marketplaceQueryPlanFromUrl(url: string | URL): MarketplaceQueryPlan {
  const params = new URL(url).searchParams;
  const source = text(params.get("source"), 32);
  const itemType = text(params.get("itemType"), 32);
  const condition = text(params.get("condition"), 40);
  const grade = text(params.get("grade"), 40);
  const sort = text(params.get("sort"), 32);
  const cursor = text(params.get("cursor"), MAX_CURSOR_BYTES);

  return {
    source: source && SOURCES.has(source) ? (source as MarketplaceListingSource) : undefined,
    itemType:
      itemType && ITEM_TYPES.has(itemType) ? (itemType as MarketplaceItemType) : undefined,
    condition:
      condition && CONDITIONS.has(condition)
        ? (condition as MarketplaceConditionBucket)
        : undefined,
    grade: grade && GRADES.has(grade) ? (grade as MarketplaceGradeBucket) : undefined,
    q: text(params.get("q"), 80) ?? undefined,
    sort: sort && SORTS.has(sort) ? (sort as MarketplaceSort) : "newest",
    inStockOnly: bool(params.get("inStockOnly")),
    limit: limit(params.get("limit")),
    cursor,
  };
}

export function marketplaceQueryPlanToSearchParams(plan: Partial<MarketplaceQueryPlan>) {
  const params = new URLSearchParams();
  if (plan.source) params.set("source", plan.source);
  if (plan.itemType) params.set("itemType", plan.itemType);
  if (plan.condition) params.set("condition", plan.condition);
  if (plan.grade) params.set("grade", plan.grade);
  if (plan.q) params.set("q", plan.q);
  if (plan.sort && plan.sort !== "newest") params.set("sort", plan.sort);
  if (plan.inStockOnly) params.set("inStockOnly", "true");
  if (plan.limit && plan.limit !== DEFAULT_LIMIT) params.set("limit", String(plan.limit));
  if (plan.cursor) params.set("cursor", plan.cursor);
  return params;
}
```

- [ ] **Step 2: Run query-plan test**

Run:

```bash
cd Website
npm run test:marketplace-product-market
```

Expected: FAIL because `product-market.ts` and Product Market routes/pages are still missing.

- [ ] **Step 3: Refactor `listings.ts` to consume Query Plan**

Modify `Website/src/lib/marketplace/listings.ts` imports:

```ts
import {
  marketplaceQueryPlanFromUrl,
  type MarketplaceItemType,
  type MarketplaceListingSource,
  type MarketplaceQueryPlan,
  type MarketplaceSort,
} from "./query-plan";
```

Replace local source/item/sort sets and `marketplaceListingQueryFromUrl` with:

```ts
export type MarketplaceListingQuery = MarketplaceQueryPlan;

export function marketplaceListingQueryFromUrl(url: string | URL) {
  return marketplaceQueryPlanFromUrl(url);
}
```

Update query filters in `listMarketplaceListingPage`:

```ts
  if (options.itemType) {
    query = query.eq("item_type_public", options.itemType);
  }
  const conditionOrGrade = options.grade ?? options.condition;
  if (conditionOrGrade) {
    query = query.eq("condition_bucket", conditionOrGrade);
  }
  if (options.inStockOnly) {
    query = query.gt("quantity_available_snapshot", 0);
  }
```

Keep the existing `q` filter for title search in this task; search indexing is in Task 2 migration.

- [ ] **Step 4: Update marketplace UI filter links to typed params**

Modify `Website/src/features/ynot/components.tsx` in `marketplaceFilterParams`:

```ts
    case "psa10":
      params.set("grade", "psa_10");
      break;
```

Do not set `q=psa 10` for PSA 10.

- [ ] **Step 5: Update selected filter mapping**

Modify `Website/src/app/(store)/marketplace/page.tsx` in `selectedMarketplaceFilter`:

```ts
  if (query.grade === "psa_10") return "psa10";
```

Remove the old `if (query.q === "psa 10") return "psa10";` branch.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd Website
npm run test:marketplace-product-market
npm run typecheck
```

Expected: `test:marketplace-product-market` fails on missing Product Market modules/routes/pages; `typecheck` passes.

- [ ] **Step 7: Commit**

```bash
git add Website/src/lib/marketplace/query-plan.ts Website/src/lib/marketplace/listings.ts Website/src/features/ynot/components.tsx 'Website/src/app/(store)/marketplace/page.tsx'
git commit -m "Centralize marketplace filters in Query Plan" \
  -m "Constraint: Marketplace filters must change route/data, not only active styling." \
  -m "Rejected: Keeping grade filters as q text | typed grade filters are needed for Product Market and indexed queries." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Add new marketplace filters through query-plan.ts first." \
  -m "Tested: cd Website && npm run typecheck passed; npm run test:marketplace-product-market failed on missing Product Market modules/routes/pages." \
  -m "Not-tested: Browser smoke for Product Market page is not available yet."
```

---

## Task 5: Add Product Market Read Module And Mock Data

**Files:**
- Create: `Website/src/lib/marketplace/product-market.ts`
- Modify: `Website/src/lib/marketplace/mock-data.ts`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Add mock Product Market data**

Modify `Website/src/lib/marketplace/mock-data.ts` by adding exports after `mockMarketplaceListingPage`:

```ts
export const mockMarketplaceProductMarket = {
  product: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    product_slug: "pikachu-gem-mint-promo",
    product_type: "card",
    title: "Pikachu Gem Mint Promo",
    brand: "Pokemon",
    category: "Trading Card",
    series_name: "Promo",
    set_name: "YNOTT Vault",
    card_code: "PROMO-025",
    language: "Japanese",
    release_date: null,
    hero_image_url: "/images/marketplace/pikachu-psa10.svg",
    public_metadata: { rarity: "Promo", setCode: "YNOTT" },
    updated_at: new Date("2026-06-29T00:00:00.000Z").toISOString(),
    active_listing_count: 1,
    lowest_price_satang: 128000,
    sold_count: 0,
    last_sold_at: null,
  },
  variants: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      variant_slug: "pikachu-gem-mint-promo-psa-10-jp",
      variant_label: "PSA 10 · Japanese",
      language: "Japanese",
      printing: "Promo",
      rarity: "Promo",
      grade_service: "PSA",
      grade_value: "10",
      condition_bucket: "psa_10",
      reference_variant_id: "mock-pikachu-psa10-jp",
      variant_snapshot: {
        language: "Japanese",
        printing: "Promo",
        rarity: "Promo",
        gradeService: "PSA",
        gradeValue: "10",
        conditionBucket: "psa_10",
      },
      image_urls: ["/images/marketplace/pikachu-psa10.svg"],
      updated_at: new Date("2026-06-29T00:00:00.000Z").toISOString(),
    },
  ],
  listings: mockMarketplaceListings.filter(
    (listing) => listing.listing_id === "11111111-1111-4111-8111-111111111111",
  ),
  priceHistory: [],
};
```

Update the first mock listing to include Product Market IDs and public payload fields:

```ts
    product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    variant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
```

Inside its `snapshot_payload`, add:

```ts
      productSlug: "pikachu-gem-mint-promo",
      variantSlug: "pikachu-gem-mint-promo-psa-10-jp",
      conditionBucket: "psa_10",
      gradeService: "PSA",
      gradeValue: "10",
```

- [ ] **Step 2: Create Product Market read module**

Create `Website/src/lib/marketplace/product-market.ts`:

```ts
import "server-only";

import { marketplaceConfig } from "./config";
import { listMarketplaceListingPage } from "./listings";
import { mockMarketplaceProductMarket } from "./mock-data";
import {
  projectPublicPriceHistoryPoint,
  projectPublicProductMarket,
  projectPublicVariant,
} from "./public-projection";
import { marketplaceQueryPlanFromUrl, type MarketplaceQueryPlan } from "./query-plan";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const PRODUCT_SELECT = [
  "id",
  "product_slug",
  "product_type",
  "title",
  "brand",
  "category",
  "series_name",
  "set_name",
  "card_code",
  "language",
  "release_date",
  "hero_image_url",
  "public_metadata",
  "updated_at",
  "active_listing_count",
  "lowest_price_satang",
  "sold_count",
  "last_sold_at",
].join(",");

const VARIANT_SELECT = [
  "id",
  "product_id",
  "variant_slug",
  "variant_label",
  "language",
  "printing",
  "rarity",
  "grade_service",
  "grade_value",
  "condition_bucket",
  "reference_variant_id",
  "variant_snapshot",
  "image_urls",
  "updated_at",
].join(",");

const PRICE_HISTORY_SELECT = [
  "id",
  "product_id",
  "variant_id",
  "listing_id",
  "listing_source",
  "condition_bucket",
  "grade_service",
  "grade_value",
  "item_price_satang",
  "currency",
  "sold_at",
  "public_snapshot",
].join(",");

function safeSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,220}$/.test(normalized)) {
    throw new MarketplaceServiceError(
      "marketplace_product_slug_invalid",
      "Marketplace product request is invalid.",
      400,
    );
  }
  return normalized;
}

export async function getMarketplaceProductMarket(
  productSlug: string,
  query: MarketplaceQueryPlan = marketplaceQueryPlanFromUrl("http://ynott.local/marketplace"),
) {
  const slug = safeSlug(productSlug);
  if (marketplaceConfig().mockData && slug === mockMarketplaceProductMarket.product.product_slug) {
    return mockMarketplaceProductMarket;
  }

  const supabase = createMarketplaceSupabaseClient();
  const productResult = await supabase
    .from("marketplace_public_product_markets")
    .select(PRODUCT_SELECT)
    .eq("product_slug", slug)
    .maybeSingle();

  if (productResult.error) throw marketplaceRpcError(productResult.error);
  if (!productResult.data) {
    throw new MarketplaceServiceError(
      "marketplace_product_not_found",
      "Marketplace product was not found.",
      404,
    );
  }

  const product = projectPublicProductMarket(productResult.data);
  const [variantResult, listingPage, priceHistory] = await Promise.all([
    supabase
      .from("marketplace_product_variants")
      .select(VARIANT_SELECT)
      .eq("product_id", product.id)
      .order("updated_at", { ascending: false })
      .limit(24),
    listMarketplaceListingPage({
      ...query,
      cursor: null,
      limit: Math.min(query.limit, 24),
    }),
    listMarketplaceProductPriceHistory(product.id, query),
  ]);

  if (variantResult.error) throw marketplaceRpcError(variantResult.error);

  return {
    product,
    variants: ((variantResult.data ?? []) as Array<{ variant_snapshot: unknown }>).map(
      projectPublicVariant,
    ),
    listings: listingPage.listings.filter((listing) => listing.product_id === product.id),
    priceHistory,
  };
}

export async function listMarketplaceProductListings(
  productSlug: string,
  query: MarketplaceQueryPlan,
) {
  const market = await getMarketplaceProductMarket(productSlug, query);
  return market.listings;
}

export async function listMarketplaceProductPriceHistory(
  productIdOrSlug: string,
  query: MarketplaceQueryPlan,
) {
  if (
    marketplaceConfig().mockData &&
    productIdOrSlug === mockMarketplaceProductMarket.product.product_slug
  ) {
    return mockMarketplaceProductMarket.priceHistory;
  }
  const supabase = createMarketplaceSupabaseClient();
  let productId = productIdOrSlug;
  if (!/^[0-9a-f]{8}-/i.test(productIdOrSlug)) {
    const productResult = await supabase
      .from("marketplace_products")
      .select("id")
      .eq("product_slug", safeSlug(productIdOrSlug))
      .maybeSingle();
    if (productResult.error) throw marketplaceRpcError(productResult.error);
    if (!productResult.data?.id) return [];
    productId = String(productResult.data.id);
  }

  let historyQuery = supabase
    .from("marketplace_price_history_points")
    .select(PRICE_HISTORY_SELECT)
    .eq("product_id", productId)
    .order("sold_at", { ascending: false })
    .limit(40);

  const conditionOrGrade = query.grade ?? query.condition;
  if (conditionOrGrade) historyQuery = historyQuery.eq("condition_bucket", conditionOrGrade);

  const result = await historyQuery;
  if (result.error) throw marketplaceRpcError(result.error);
  return ((result.data ?? []) as Array<{ public_snapshot: unknown }>).map(
    projectPublicPriceHistoryPoint,
  );
}
```

- [ ] **Step 3: Run Product Market test**

Run:

```bash
cd Website
npm run test:marketplace-product-market
```

Expected: FAIL with missing product routes and product page files.

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd Website
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/marketplace/product-market.ts Website/src/lib/marketplace/mock-data.ts
git commit -m "Add Product Market read module and local data" \
  -m "Constraint: Local mock mode must exercise product pages without live Marketplace writes." \
  -m "Rejected: Product page querying listing detail directly | would keep product identity shallow inside listing snapshots." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Product Market routes should call product-market.ts, not raw listing queries." \
  -m "Tested: cd Website && npm run typecheck passed; npm run test:marketplace-product-market failed on missing routes/pages." \
  -m "Not-tested: Browser product page is not created yet."
```

---

## Task 6: Add Product Market API Routes

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/products/[productSlug]/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts`
- Create: `Website/src/app/api/marketplace/products/[productSlug]/route.ts`
- Create: `Website/src/app/api/marketplace/products/[productSlug]/listings/route.ts`
- Create: `Website/src/app/api/marketplace/products/[productSlug]/price-history/route.ts`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Create canonical product API route**

Create `Website/src/app/api/ynot/marketplace/products/[productSlug]/route.ts`:

```ts
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import { getMarketplaceProductMarket } from "@/lib/marketplace/product-market";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
  publicMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ productSlug: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  const access = await publicMarketplaceAccess(profile);
  if (!access.allowed) return access.response;
  const actionDenied = marketplaceActionDeniedResponse("browse", requestId);
  if (actionDenied) return actionDenied;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:products:read",
    { limit: 90, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { productSlug } = await ctx.params;
    const market = await getMarketplaceProductMarket(
      productSlug,
      marketplaceQueryPlanFromUrl(request.url),
    );
    return Response.json({ ok: true, request_id: requestId, market });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
```

- [ ] **Step 2: Create product listings API route**

Create `Website/src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts`:

```ts
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import { listMarketplaceProductListings } from "@/lib/marketplace/product-market";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
  publicMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ productSlug: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  const access = await publicMarketplaceAccess(profile);
  if (!access.allowed) return access.response;
  const actionDenied = marketplaceActionDeniedResponse("browse", requestId);
  if (actionDenied) return actionDenied;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:products:listings",
    { limit: 90, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { productSlug } = await ctx.params;
    const listings = await listMarketplaceProductListings(
      productSlug,
      marketplaceQueryPlanFromUrl(request.url),
    );
    return Response.json({ ok: true, request_id: requestId, listings });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
```

- [ ] **Step 3: Create product price-history API route**

Create `Website/src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts`:

```ts
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import { listMarketplaceProductPriceHistory } from "@/lib/marketplace/product-market";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
  publicMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ productSlug: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  const access = await publicMarketplaceAccess(profile);
  if (!access.allowed) return access.response;
  const actionDenied = marketplaceActionDeniedResponse("browse", requestId);
  if (actionDenied) return actionDenied;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:products:price-history",
    { limit: 90, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { productSlug } = await ctx.params;
    const priceHistory = await listMarketplaceProductPriceHistory(
      productSlug,
      marketplaceQueryPlanFromUrl(request.url),
    );
    return Response.json({ ok: true, request_id: requestId, priceHistory });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
```

- [ ] **Step 4: Create alias route re-exports**

Create `Website/src/app/api/marketplace/products/[productSlug]/route.ts`:

```ts
export {
  GET,
} from "@/app/api/ynot/marketplace/products/[productSlug]/route";
```

Create `Website/src/app/api/marketplace/products/[productSlug]/listings/route.ts`:

```ts
export {
  GET,
} from "@/app/api/ynot/marketplace/products/[productSlug]/listings/route";
```

Create `Website/src/app/api/marketplace/products/[productSlug]/price-history/route.ts`:

```ts
export {
  GET,
} from "@/app/api/ynot/marketplace/products/[productSlug]/price-history/route";
```

- [ ] **Step 5: Run route tests and typecheck**

Run:

```bash
cd Website
npm run test:marketplace-product-market
npm run typecheck
```

Expected: `test:marketplace-product-market` fails on missing storefront product page files; `typecheck` passes.

- [ ] **Step 6: Commit**

```bash
git add Website/src/app/api/ynot/marketplace/products Website/src/app/api/marketplace/products
git commit -m "Expose Product Market read routes" \
  -m "Constraint: Public Product Market routes must reuse existing browse gates and rate limits." \
  -m "Rejected: Reading price history through listing detail route | product pages need their own read interface." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep /api/marketplace/* aliases as re-exports until route migration is decided in a separate plan." \
  -m "Tested: cd Website && npm run typecheck passed; npm run test:marketplace-product-market failed on missing storefront page files." \
  -m "Not-tested: Browser smoke for product page is not available yet."
```

---

## SNKRDUNK-Inspired UI Target

The Product Market page should follow the useful SNKRDUNK marketplace interaction pattern while keeping YNOTT's brand, copy, icons, and assets original. Do not copy SNKRDUNK logos, partner banners, wording, or proprietary imagery.

Observed reference pattern from `https://snkrdunk.com/en/trading-cards/254303` on June 29, 2026:

- Centered marketplace product page, not a dashboard card layout.
- Header area places the main card image first, centered, with a horizontal thumbnail rail under it.
- Product title appears below the image rail.
- Variant/condition filters are horizontal pill chips: `All`, raw condition grades, and graded-card buckets such as `PSA 10`, `PSA 9`, `BGS 10`, etc.
- Selected chip is solid black; unselected chips are light outline pills.
- Lead price is a large bold "from" price.
- Small trust badges sit under the price.
- A low-height promo/service strip sits below the price area.
- Trust row has four compact icon+label items.
- Listed items section uses image tiles in a grid, not list rows. Each tile has card image, optional sold/source ribbon, grade badge, and price.
- "See More" is a centered understated button/link below the listing grid.
- Recent sales or price history can be partially gated for anonymous users, with a signup/login prompt.
- Related product rails and item-description metadata sit below the market blocks.
- A sticky bottom action bar stays visible with favorite count, lead price, and primary action such as "See All (n)" or "Buy".
- On mobile, the same sequence is preserved with horizontally scrolling chips and a sticky bottom bar; listing tiles remain compact in a 2-3 column grid.

YNOTT adaptation:

- Use Thai baht prices and YNOTT copy.
- Use the YNOTT shell/header, but the product content should be full-width centered, quiet, and marketplace-native.
- Use YNOTT trust concepts: Authentic check, seller protection, verified inventory, secure transfer.
- Official shop and user-seller listings should share the same product grid anatomy, with small source badges.
- Filters must update URL query params and refetch/re-render data. Local-only visual state is not acceptable.
- Price history must only expose Public Projection fields. It can show gated detail for anonymous users, but the backend should still return only safe public data.

---

## Task 7: Add Product Market Storefront Page

**Files:**
- Create: `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx`
- Create: `Website/src/features/ynot/MarketplaceProductPage.tsx`
- Modify: `Website/src/features/ynot/components.tsx`
- Modify: `Website/src/app/globals.css`
- Test: `Website/scripts/test-marketplace-product-market-architecture.mjs`

- [ ] **Step 1: Create product page presentation module**

Create `Website/src/features/ynot/MarketplaceProductPage.tsx`:

```tsx
import Link from "next/link";
import type { MarketplaceListingSnapshot } from "@/lib/marketplace/listings";

type ProductMarket = {
  product: {
    product_slug: string;
    title: string;
    brand: string | null;
    category: string | null;
    series_name: string | null;
    set_name: string | null;
    card_code: string | null;
    language: string | null;
    hero_image_url: string | null;
    active_listing_count: number;
    lowest_price_satang: number | null;
    sold_count: number;
  };
  variants: Array<{
    variant_slug: string;
    variant_label: string;
    condition_bucket: string;
    grade_service: string | null;
    grade_value: string | null;
    image_urls: string[];
  }>;
  listings: MarketplaceListingSnapshot[];
  priceHistory: Array<{
    id: string;
    item_price_satang: number;
    currency: "THB";
    sold_at: string;
    condition_bucket: string;
    grade_service: string | null;
    grade_value: string | null;
  }>;
};

function thb(amountSatang: number | null) {
  if (amountSatang === null) return "No live price";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function listingHref(listing: MarketplaceListingSnapshot) {
  return `/marketplace/listings/${listing.listing_id}`;
}

function filterHref(productSlug: string, grade: string | null) {
  const params = new URLSearchParams();
  if (grade) params.set("grade", grade);
  const query = params.toString();
  return `/marketplace/products/${productSlug}${query ? `?${query}` : ""}`;
}

function listingPhoto(listing: MarketplaceListingSnapshot) {
  return listing.photo_urls?.[0] ?? null;
}

function listingGradeLabel(listing: MarketplaceListingSnapshot) {
  return (
    listing.snapshot_payload?.conditionCode ??
    listing.snapshot_payload?.itemType ??
    listing.snapshot_payload?.sourceBadge ??
    "Item"
  );
}

const TRUST_ITEMS = [
  "Authentic",
  "Seller protection",
  "Secure transfer",
  "Verified inventory",
];

export function MarketplaceProductPage({
  market,
  selectedGrade = null,
}: {
  market: ProductMarket;
  selectedGrade?: string | null;
}) {
  const heroImage = market.product.hero_image_url;
  const thumbnailUrls = [
    heroImage,
    ...market.variants.flatMap((variant) => variant.image_urls.slice(0, 1)),
  ].filter((value): value is string => Boolean(value));
  const meta = [
    market.product.brand,
    market.product.set_name,
    market.product.card_code,
    market.product.language,
  ].filter(Boolean);
  const variantFilters = [
    { label: "All", value: null },
    ...market.variants.map((variant) => ({
      label: variant.variant_label,
      value: variant.condition_bucket,
    })),
  ];
  const visibleHistory = market.priceHistory.slice(0, 6);
  const relatedVariants = market.variants.slice(0, 8);

  return (
    <div className="marketplace-product-page">
      <div className="marketplace-product-shell">
        <Link href="/marketplace" className="marketplace-back-link" prefetch={false}>
          Marketplace
        </Link>

        <section className="marketplace-product-gallery" aria-label="Product images">
          <div
            className="marketplace-product-art"
            aria-label={market.product.title}
            style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
          >
            {!heroImage ? <span>{market.product.title.slice(0, 1)}</span> : null}
          </div>
          {thumbnailUrls.length > 0 ? (
            <div className="marketplace-product-thumbnails" aria-label="Product thumbnails">
              {thumbnailUrls.slice(0, 16).map((url, index) => (
                <span
                  key={`${url}-${index}`}
                  className={index === 0 ? "is-active" : undefined}
                  style={{ backgroundImage: `url(${url})` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="marketplace-product-summary">
          <h1>{market.product.title}</h1>
          {meta.length > 0 ? <p>{meta.join(" / ")}</p> : null}

          <div className="marketplace-variant-strip" aria-label="Variant filters">
            {variantFilters.map((filter, index) => {
              const active = filter.value === selectedGrade;
              return (
                <Link
                  key={`${filter.label}-${index}`}
                  href={filterHref(market.product.product_slug, filter.value)}
                  className={active ? "marketplace-variant-chip is-active" : "marketplace-variant-chip"}
                  prefetch={false}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <strong className="marketplace-product-price">
            {thb(market.product.lowest_price_satang)}~
          </strong>
          <div className="marketplace-product-badges">
            <span>Authentic</span>
            <span>Verified shipping</span>
          </div>
          <div className="marketplace-product-service-strip">
            Marketplace listings are checked before transfer. Combine items when possible to reduce shipping.
          </div>
          <div className="marketplace-product-trust-row">
            {TRUST_ITEMS.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Listed Items</h2>
            <span>{market.listings.length} live</span>
          </div>
          <div className="marketplace-product-listings">
            {market.listings.map((listing) => (
              <Link
                key={listing.listing_id}
                href={listingHref(listing)}
                className="marketplace-product-listing-tile"
                prefetch={false}
              >
                <span
                  className="marketplace-product-listing-image"
                  style={
                    listingPhoto(listing)
                      ? { backgroundImage: `url(${listingPhoto(listing)})` }
                      : undefined
                  }
                >
                  <span className="marketplace-product-ribbon">
                    {listing.snapshot_payload?.sourceBadge ?? "YNOTT"}
                  </span>
                  <span className="marketplace-product-grade">
                    {listingGradeLabel(listing)}
                  </span>
                </span>
                <strong>{thb(listing.item_price_satang)}</strong>
                <span>{listing.title}</span>
              </Link>
            ))}
            {market.listings.length === 0 ? (
              <div className="marketplace-empty">
                <strong>No live listings for this filter</strong>
                <p>Try another variant or check again after new Marketplace Inventory is listed.</p>
              </div>
            ) : null}
          </div>
          {market.listings.length > 8 ? (
            <Link
              href={`/marketplace/products/${market.product.product_slug}?limit=24`}
              className="marketplace-see-more"
              prefetch={false}
            >
              See More
            </Link>
          ) : null}
        </section>

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Recent Sales Data</h2>
            <span>{market.priceHistory.length} points</span>
          </div>
          <div className="marketplace-price-history" aria-label="Recent sales data">
            {visibleHistory.map((point) => (
              <div key={point.id} className="marketplace-price-history-row">
                <span>{new Date(point.sold_at).toLocaleDateString("en-US")}</span>
                <span>{point.condition_bucket}</span>
                <strong>{thb(point.item_price_satang)}</strong>
              </div>
            ))}
            {market.priceHistory.length === 0 ? (
              <div className="marketplace-empty">
                <strong>Not enough sales yet</strong>
                <p>Recent sold data appears here after paid Marketplace Orders create price-history points.</p>
              </div>
            ) : null}
          </div>
          <div className="marketplace-history-gate">
            <strong>Sign up for free to view deeper market data</strong>
            <Link
              href={`/login?next=/marketplace/products/${market.product.product_slug}`}
              prefetch={false}
            >
              Log in
            </Link>
          </div>
        </section>

        {relatedVariants.length > 0 ? (
          <section className="marketplace-product-section">
            <div className="marketplace-product-section-head">
              <h2>Related Variants</h2>
            </div>
            <div className="marketplace-related-strip">
              {relatedVariants.map((variant) => (
                <Link
                  key={variant.variant_slug}
                  href={filterHref(market.product.product_slug, variant.condition_bucket)}
                  className="marketplace-related-card"
                  prefetch={false}
                >
                  <span
                    style={
                      variant.image_urls[0]
                        ? { backgroundImage: `url(${variant.image_urls[0]})` }
                        : undefined
                    }
                  />
                  <strong>{variant.variant_label}</strong>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Item Description</h2>
          </div>
          <dl className="marketplace-product-metadata">
            <div><dt>Brand</dt><dd>{market.product.brand ?? "-"}</dd></div>
            <div><dt>Category</dt><dd>{market.product.category ?? "Trading Cards"}</dd></div>
            <div><dt>Series</dt><dd>{market.product.series_name ?? "-"}</dd></div>
            <div><dt>Set</dt><dd>{market.product.set_name ?? "-"}</dd></div>
            <div><dt>Product Code</dt><dd>{market.product.card_code ?? "-"}</dd></div>
            <div><dt>Condition</dt><dd>Check condition and grade on each listing page</dd></div>
          </dl>
        </section>
      </div>

      <div className="marketplace-product-sticky-bar" aria-label="Marketplace product action">
        <span className="marketplace-product-favorite" aria-label="Watch count">
          {market.product.sold_count}
        </span>
        <Link
          href={`/marketplace/products/${market.product.product_slug}?source=official_shop`}
          className="marketplace-product-primary-action"
          prefetch={false}
        >
          <span>{thb(market.product.lowest_price_satang)}~</span>
          <strong>See All ({market.product.active_listing_count})</strong>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create App Router page**

Create `Website/src/app/(store)/marketplace/products/[productSlug]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { MarketplaceProductPage } from "@/features/ynot/MarketplaceProductPage";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import { getMarketplaceProductMarket } from "@/lib/marketplace/product-market";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

type ProductPageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryUrl(
  productSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const url = new URL(`http://ynott.local/marketplace/products/${productSlug}`);
  for (const [key, value] of Object.entries(searchParams)) {
    const firstValue = firstSearchValue(value);
    if (firstValue) url.searchParams.set(key, firstValue);
  }
  return url;
}

export default async function MarketplaceProductRoute({
  params,
  searchParams,
}: {
  params: Promise<{ productSlug: string }>;
  searchParams?: ProductPageSearchParams;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const config = marketplaceConfig();
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true;

  if (!allowed) redirect("/packs");
  if (config.unavailableReason !== null || !config.actions.browse) {
    redirect("/marketplace");
  }

  const { productSlug } = await params;
  const query = marketplaceQueryPlanFromUrl(
    queryUrl(productSlug, searchParams ? await searchParams : {}),
  );

  let market: Awaited<ReturnType<typeof getMarketplaceProductMarket>>;
  try {
    market = await getMarketplaceProductMarket(productSlug, query);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_product_not_found"
    ) {
      notFound();
    }
    throw error;
  }

  const data = await getYnotDashboardSlice({
    wallet: Boolean(profile?.profileId),
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <MarketplaceProductPage market={market} selectedGrade={query.grade ?? null} />
    </YnotShell>
  );
}
```

- [ ] **Step 3: Link listing cards to Product Market when product slug exists**

Modify `Website/src/features/ynot/components.tsx` inside the marketplace listing card map:

```tsx
const productSlug =
  typeof item.snapshot_payload?.productSlug === "string"
    ? item.snapshot_payload.productSlug
    : null;
const href = productSlug
  ? `/marketplace/products/${productSlug}`
  : `/marketplace/listings/${item.listing_id}`;
```

Use `href={href}` in the listing card `Link`.

- [ ] **Step 4: Add product page styles**

Append to `Website/src/app/globals.css`:

```css
.marketplace-product-page {
  padding-bottom: 92px;
}

.marketplace-product-shell {
  width: min(100%, 820px);
  margin: 0 auto;
  display: grid;
  gap: 28px;
}

.marketplace-product-gallery {
  display: grid;
  gap: 18px;
  justify-items: center;
}

.marketplace-product-art {
  width: min(100%, 260px);
  aspect-ratio: 3 / 4;
  background: var(--surface-muted);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  display: grid;
  place-items: center;
  font-size: 56px;
  font-weight: 800;
}

.marketplace-product-thumbnails,
.marketplace-variant-strip,
.marketplace-related-strip {
  width: 100%;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 6px;
}

.marketplace-product-thumbnails span {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border: 1px solid var(--border);
  background: var(--surface-muted) center / contain no-repeat;
}

.marketplace-product-thumbnails .is-active {
  border-color: var(--foreground);
  box-shadow: inset 0 0 0 1px var(--foreground);
}

.marketplace-product-summary {
  display: grid;
  gap: 12px;
}

.marketplace-product-summary h1 {
  margin: 0;
  font-size: clamp(22px, 4vw, 30px);
  line-height: 1.2;
}

.marketplace-product-summary p {
  margin: 0;
  color: var(--muted);
}

.marketplace-variant-chip {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: inherit;
  padding: 9px 14px;
  text-decoration: none;
  font-weight: 700;
  white-space: nowrap;
}

.marketplace-variant-chip.is-active {
  border-color: var(--foreground);
  background: var(--foreground);
  color: var(--background);
}

.marketplace-product-price {
  display: block;
  font-size: clamp(28px, 6vw, 40px);
  line-height: 1;
}

.marketplace-product-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.marketplace-product-badges span {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--muted);
  font-size: 12px;
}

.marketplace-product-service-strip {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--foreground);
  padding: 12px 16px;
  font-size: 14px;
}

.marketplace-product-trust-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.marketplace-product-trust-row span {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.marketplace-product-section {
  display: grid;
  gap: 14px;
  padding-top: 2px;
}

.marketplace-product-section + .marketplace-product-section {
  border-top: 8px solid var(--surface-muted);
  padding-top: 24px;
}

.marketplace-product-section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.marketplace-product-section-head h2 {
  margin: 0;
  font-size: 20px;
}

.marketplace-product-section-head span,
.marketplace-product-listing-tile > span:last-child,
.marketplace-price-history-row span,
.marketplace-product-metadata dt {
  color: var(--muted);
  font-size: 13px;
}

.marketplace-product-listings {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.marketplace-product-listing-tile {
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.marketplace-product-listing-image {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 6px;
  background: var(--surface-muted) center / cover no-repeat;
}

.marketplace-product-ribbon {
  position: absolute;
  top: 8px;
  left: -28px;
  width: 92px;
  transform: rotate(-45deg);
  background: rgb(0 0 0 / 72%);
  color: white;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.marketplace-product-grade {
  position: absolute;
  right: 6px;
  bottom: 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 78%);
  color: white;
  padding: 3px 5px;
  font-size: 11px;
  font-weight: 800;
}

.marketplace-product-listing-tile strong {
  display: block;
  margin-top: 6px;
  font-size: 14px;
}

.marketplace-see-more {
  justify-self: center;
  color: inherit;
  text-decoration: none;
  padding: 12px 28px;
}

.marketplace-price-history {
  display: grid;
  gap: 8px;
}

.marketplace-price-history-row,
.marketplace-product-metadata div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.marketplace-history-gate {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 20px;
  background: var(--surface-muted);
  text-align: center;
}

.marketplace-history-gate a {
  color: inherit;
  font-weight: 800;
}

.marketplace-related-card {
  flex: 0 0 132px;
  color: inherit;
  text-decoration: none;
}

.marketplace-related-card span {
  display: block;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  background: var(--surface-muted) center / cover no-repeat;
}

.marketplace-related-card strong {
  display: block;
  margin-top: 8px;
  font-size: 13px;
}

.marketplace-product-metadata {
  display: grid;
  margin: 0;
}

.marketplace-product-metadata dd {
  margin: 0;
  text-align: right;
}

.marketplace-product-sticky-bar {
  position: fixed;
  left: 50%;
  bottom: 14px;
  z-index: 30;
  width: min(calc(100% - 32px), 620px);
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.marketplace-product-favorite {
  display: grid;
  place-items: center;
  min-height: 52px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-weight: 800;
}

.marketplace-product-primary-action {
  min-height: 52px;
  border-radius: 4px;
  background: var(--foreground);
  color: var(--background);
  display: flex;
  justify-content: center;
  gap: 16px;
  align-items: center;
  text-decoration: none;
  font-weight: 800;
}

@media (max-width: 720px) {
  .marketplace-product-shell {
    width: 100%;
    gap: 22px;
  }

  .marketplace-product-listings {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .marketplace-product-trust-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .marketplace-price-history-row {
    grid-template-columns: 1fr;
  }

  .marketplace-product-sticky-bar {
    bottom: 8px;
    width: calc(100% - 16px);
    grid-template-columns: 48px minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd Website
npm run test:marketplace-product-market
npm run typecheck
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit**

```bash
git add 'Website/src/app/(store)/marketplace/products' Website/src/features/ynot/MarketplaceProductPage.tsx Website/src/features/ynot/components.tsx Website/src/app/globals.css
git commit -m "Add Product Market storefront page" \
  -m "Constraint: Product page must keep Marketplace Listing checkout as the exact sale page." \
  -m "Rejected: Replacing listing detail with product intelligence | checkout needs exact listing photos, source, and state." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Product page shows market intelligence; listing page remains checkout-first." \
  -m "Tested: cd Website && npm run test:marketplace-product-market && npm run typecheck passed." \
  -m "Not-tested: Browser visual smoke still pending."
```

---

## Task 8: Extend Verification Scripts

**Files:**
- Modify: `Website/tools/verification/verify-marketplace-schema.mjs`
- Modify: `Website/tools/verification/verify-marketplace-hardening.mjs`
- Modify: `Website/tools/verification/verify-marketplace-doc-traceability.mjs`
- Test: `Website/tools/verification/verify-marketplace-schema.mjs`

- [ ] **Step 1: Add schema verifier checks**

Modify `Website/tools/verification/verify-marketplace-schema.mjs`:

```js
includes(compactSql, "create table if not exists public.marketplace_products", "product market products table exists");
includes(compactSql, "create table if not exists public.marketplace_product_variants", "product market variants table exists");
includes(compactSql, "create table if not exists public.marketplace_price_history_points", "market price history table exists");
includes(compactSql, "marketplace_listing_product_active_idx", "product listing active index exists");
includes(compactSql, "marketplace_price_history_product_idx", "price history product index exists");
includes(compactSql, "marketplace_record_price_history_for_order", "price history projection RPC exists");
includes(compactSql, "marketplace_orders_record_price_history_after_paid", "paid order price-history trigger exists");
```

Place these after existing marketplace table/index checks.

- [ ] **Step 2: Add hardening verifier checks**

Modify `Website/tools/verification/verify-marketplace-hardening.mjs`:

```js
const publicProjection = readWebsite("src/lib/marketplace/public-projection.ts");
includes(publicProjection, "PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS", "public listing projection uses allowlist");
includes(publicProjection, "PUBLIC_PRODUCT_METADATA_KEYS", "public product projection uses allowlist");
includes(publicProjection, "PUBLIC_PRICE_HISTORY_KEYS", "public price history projection uses allowlist");
includes(publicProjection, "projectPublicListingSnapshot", "listing projection function exists");
includes(publicProjection, "projectPublicProductMarket", "product market projection function exists");
includes(publicProjection, "projectPublicPriceHistoryPoint", "price history projection function exists");
notMatches(publicProjection, /privateAdminNote|procurementNote|sellerPayoutState|sellerPayoutSatang/, "public projection does not allow private marketplace fields");
```

Place these near the existing buyer payload/listing sanitizer checks.

- [ ] **Step 3: Add doc traceability checks**

Modify `Website/tools/verification/verify-marketplace-doc-traceability.mjs`:

```js
includes(source, "src/lib/marketplace/product-market.ts", "product market module is traceable");
includes(source, "src/lib/marketplace/query-plan.ts", "query plan module is traceable");
includes(source, "src/lib/marketplace/public-projection.ts", "public projection module is traceable");
includes(source, "products/[productSlug]", "product market product routes are traceable");
```

If this verifier does not expose a `source` variable, add:

```js
const source = marketplaceSourceText() + "\n" + readWebsite("src/app/(store)/marketplace/products/[productSlug]/page.tsx");
```

- [ ] **Step 4: Run verification**

Run:

```bash
cd Website
npm run verify:marketplace-schema
npm run verify:marketplace-hardening
npm run verify:marketplace-doc-traceability
npm run test:marketplace-product-market
```

Expected: PASS for all four commands.

- [ ] **Step 5: Commit**

```bash
git add Website/tools/verification/verify-marketplace-schema.mjs Website/tools/verification/verify-marketplace-hardening.mjs Website/tools/verification/verify-marketplace-doc-traceability.mjs
git commit -m "Verify Product Market architecture contracts" \
  -m "Constraint: Marketplace architecture must remain executable through fast verification scripts." \
  -m "Rejected: Relying only on typecheck | schema and privacy contracts are mostly source and SQL invariants." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Any Product Market schema or projection change must update these verifier checks." \
  -m "Tested: cd Website && npm run verify:marketplace-schema && npm run verify:marketplace-hardening && npm run verify:marketplace-doc-traceability && npm run test:marketplace-product-market passed." \
  -m "Not-tested: Full verify:marketplace still pending."
```

---

## Task 9: Local Browser Smoke And Full Marketplace Verification

**Files:**
- No source edits expected.
- Test: local browser and existing marketplace verification scripts.

- [ ] **Step 1: Start local mock marketplace**

Run:

```bash
cd Website
YNOT_MARKETPLACE_ENABLED=true \
YNOT_MARKETPLACE_OWNER_ONLY=false \
MARKETPLACE_ENVIRONMENT=local \
YNOT_MARKETPLACE_MOCK_DATA=true \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3010 \
npm run dev -- --port 3010
```

Expected: Next dev server prints `Ready` for `http://localhost:3010`.

- [ ] **Step 2: Smoke product page HTML**

Run in another terminal:

```bash
curl -sS http://127.0.0.1:3010/marketplace/products/pikachu-gem-mint-promo | rg "Pikachu Gem Mint Promo|Listed Items|Recent Sales Data|See All"
```

Expected output contains:

```text
Pikachu Gem Mint Promo
Listed Items
Recent Sales Data
See All
```

- [ ] **Step 3: Smoke Product Market API**

Run:

```bash
curl -sS http://127.0.0.1:3010/api/marketplace/products/pikachu-gem-mint-promo | node -e '
let data="";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  const json = JSON.parse(data);
  if (!json.ok) throw new Error("not ok");
  if (json.market.product.product_slug !== "pikachu-gem-mint-promo") throw new Error("bad slug");
  if (!Array.isArray(json.market.variants)) throw new Error("variants missing");
  console.log("PASS product market api");
});
'
```

Expected:

```text
PASS product market api
```

- [ ] **Step 4: Browser visual smoke the SNKRDUNK-inspired page anatomy**

Use the available browser tool or local Chrome. Open:

```text
http://127.0.0.1:3010/marketplace/products/pikachu-gem-mint-promo
```

Verify desktop at about `1440x1200`:

- Centered product shell, not dashboard card grid.
- Main product image appears above the title.
- Thumbnail rail appears under the main image.
- Horizontal variant chips appear under the title with `All` selected in black.
- Lead price appears large and bold.
- Trust strip appears below the price.
- `Listed Items` uses image tiles, not rows.
- Tile includes source ribbon, grade badge, and price.
- `Recent Sales Data` appears below listings.
- Sticky bottom bar shows watch count, lead price, and `See All`.

Verify mobile at about `390x1200`:

- Same section order as desktop.
- Variant chips scroll horizontally without wrapping into broken rows.
- Listing grid remains compact and readable.
- Sticky bottom bar does not cover primary content when scrolled to listing/history sections.

- [ ] **Step 5: Run focused marketplace checks**

Run:

```bash
cd Website
npm run test:marketplace-product-market
npm run verify:marketplace
npm run typecheck
```

Expected: PASS for all commands.

- [ ] **Step 6: Stop local dev server**

Press `Ctrl-C` in the dev server terminal.

Expected: process exits and port `3010` is no longer serving.

- [ ] **Step 7: Commit verification-only updates if any docs/scripts changed during smoke**

If no files changed, skip this commit. If a verification doc or script was updated, commit:

```bash
git add Website/tools/verification docs/superpowers/plans/2026-06-29-marketplace-product-market-architecture.md
git commit -m "Document Product Market verification evidence" \
  -m "Constraint: Verification evidence should stay with the implementation plan and fast marketplace checks." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep browser smoke evidence read-only unless a visual defect is found." \
  -m "Tested: local mock product page, Product Market API, verify:marketplace, and typecheck passed." \
  -m "Not-tested: Production route enablement was not performed."
```

---

## Task 10: Final Prelaunch Gate Notes

**Files:**
- Modify: `Website/docs/plans/marketplace/08-mvp-function-list-and-release-plan.md`
- Test: `Website/tools/verification/verify-marketplace-doc-traceability.mjs`

- [ ] **Step 1: Add Product Market release note**

Append this section to `Website/docs/plans/marketplace/08-mvp-function-list-and-release-plan.md`:

```markdown
## Product Market Page Slice

The marketplace now separates:

- Product Market pages at `/marketplace/products/[productSlug]`: canonical product, Market Variant strip, live Marketplace Listings, and Market Price History.
- Marketplace Listing pages at `/marketplace/listings/[listingId]`: exact sale checkout, address selection, payment proof, and listing-source checkout path.

Public Product Market payloads pass through `src/lib/marketplace/public-projection.ts`, which is default-deny for nested JSON payloads. New public product/variant/history keys must be allowlisted there and covered by `npm run test:marketplace-product-market`.

Prelaunch remains owner-gated until production Cloudflare route behavior and Marketplace Supabase secrets are verified.
```

- [ ] **Step 2: Run doc traceability**

Run:

```bash
cd Website
npm run verify:marketplace-doc-traceability
```

Expected: PASS.

- [ ] **Step 3: Commit docs**

```bash
git add Website/docs/plans/marketplace/08-mvp-function-list-and-release-plan.md docs/superpowers/plans/2026-06-29-marketplace-product-market-architecture.md
git commit -m "Record Product Market prelaunch contract" \
  -m "Constraint: Public marketplace launch remains gated until Cloudflare and Marketplace Supabase production evidence is checked." \
  -m "Rejected: Documenting Product Market as checkout replacement | listing detail remains checkout-first." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep Product Market and Marketplace Listing responsibilities separate in future docs." \
  -m "Tested: cd Website && npm run verify:marketplace-doc-traceability passed." \
  -m "Not-tested: Production deploy not performed."
```

---

## Self-Review

**Spec coverage:**

- Frontend Product Market page: Task 7.
- SNKRDUNK-inspired UI anatomy: `SNKRDUNK-Inspired UI Target`, Task 7, and Task 9 browser visual smoke.
- Backend Product Market read model: Tasks 2, 5, 6.
- Performance: Task 2 indexes and Task 4 Query Plan.
- Security/privacy: Task 3 Public Projection and Task 8 hardening checks.
- Existing marketplace separation: Tasks 1, 2, and ADR guard.
- Price history: Tasks 2, 5, 6, 7.
- Typed filters: Task 4 and Task 7.
- Local verification: Task 9.
- Prelaunch docs: Task 10.

**Placeholder scan:** No placeholder markers or unnamed validation steps remain in this plan.

**Type consistency:** `MarketplaceQueryPlan`, `MarketplaceConditionBucket`, `MarketplaceGradeBucket`, `Product Market`, `Public Projection`, and `Market Price History` names are consistent across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-marketplace-product-market-architecture.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using superpower-executing-plans, batch execution with checkpoints.

Which approach?
