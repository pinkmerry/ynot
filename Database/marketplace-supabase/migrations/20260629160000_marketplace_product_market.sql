-- Product Market read model and public-safe price history.
--
-- Product Market belongs to the separate Marketplace Supabase project. It
-- links canonical products and variants to Marketplace Inventory and Listing
-- snapshots without moving checkout state out of Marketplace Listing pages.

create extension if not exists pgcrypto;

create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null unique check (product_slug ~ '^[a-z0-9][a-z0-9-]{2,220}$'),
  title text not null check (length(title) between 1 and 240),
  brand text,
  category text,
  series_name text,
  set_name text,
  card_code text,
  language text,
  hero_image_url text,
  product_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  variant_slug text not null check (variant_slug ~ '^[a-z0-9][a-z0-9-]{1,160}$'),
  variant_label text not null check (length(variant_label) between 1 and 120),
  condition_bucket text not null
    check (
      condition_bucket in (
        'raw_a',
        'raw_b',
        'raw_c',
        'raw_d',
        'psa_10',
        'psa_9',
        'psa_8_or_under',
        'bgs_10_black_label',
        'bgs_10_gold_label',
        'bgs_9_5',
        'bgs_9_or_under',
        'ars_10_plus',
        'ars_10',
        'ars_9',
        'ars_8_or_under',
        'other_graded'
      )
    ),
  grade_service text check (grade_service in ('PSA', 'BGS', 'ARS', 'OTHER')),
  grade_value text,
  variant_snapshot jsonb not null default '{}'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_slug)
);

create table if not exists public.marketplace_price_history_points (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  product_id uuid not null references public.marketplace_products(id) on delete restrict,
  variant_id uuid references public.marketplace_product_variants(id) on delete set null,
  listing_id uuid not null,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),
  condition_bucket text not null,
  grade_service text,
  grade_value text,
  item_price_satang integer not null check (item_price_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  sold_at timestamptz not null default now(),
  public_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_id)
);

alter table public.marketplace_inventory_items
  add column if not exists product_id uuid references public.marketplace_products(id) on delete set null,
  add column if not exists variant_id uuid references public.marketplace_product_variants(id) on delete set null;

alter table public.marketplace_listing_snapshots
  add column if not exists product_id uuid references public.marketplace_products(id) on delete set null,
  add column if not exists variant_id uuid references public.marketplace_product_variants(id) on delete set null;

create or replace view public.marketplace_public_product_markets
with (security_invoker = true)
as
select
  product.id,
  product.product_slug,
  product.title,
  product.brand,
  product.category,
  product.series_name,
  product.set_name,
  product.card_code,
  product.language,
  product.hero_image_url,
  product.product_metadata,
  coalesce(active_listing_stats.active_listing_count, 0) as active_listing_count,
  active_listing_stats.lowest_price_satang,
  coalesce(sold_stats.sold_count, 0) as sold_count,
  product.updated_at
from public.marketplace_products product
left join lateral (
  select
    count(*)::integer as active_listing_count,
    min(listing.item_price_satang)::integer as lowest_price_satang
  from public.marketplace_listing_snapshots listing
  where listing.product_id = product.id
    and listing.listing_state = 'active'
) active_listing_stats on true
left join lateral (
  select count(*)::integer as sold_count
  from public.marketplace_price_history_points history
  where history.product_id = product.id
) sold_stats on true;

create index if not exists marketplace_products_slug_idx
  on public.marketplace_products(product_slug);
create index if not exists marketplace_products_brand_category_idx
  on public.marketplace_products(brand, category, updated_at desc);
create index if not exists marketplace_variants_product_idx
  on public.marketplace_product_variants(product_id, condition_bucket, updated_at desc);
create index if not exists marketplace_inventory_product_idx
  on public.marketplace_inventory_items(product_id, variant_id, item_state, updated_at desc);
create index if not exists marketplace_listing_product_active_idx
  on public.marketplace_listing_snapshots(product_id, variant_id, item_price_satang, updated_at desc)
  where listing_state = 'active';
create index if not exists marketplace_price_history_product_idx
  on public.marketplace_price_history_points(product_id, variant_id, sold_at desc);
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

create or replace function public.marketplace_record_price_history_for_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_row public.marketplace_listing_snapshots%rowtype;
  variant_row public.marketplace_product_variants%rowtype;
  resolved_product_id uuid;
  resolved_variant_id uuid;
  resolved_condition_bucket text;
  resolved_grade_service text;
  resolved_grade_value text;
begin
  if new.payment_state <> 'paid' then
    return new;
  end if;

  select *
    into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = new.listing_id
  limit 1;

  resolved_product_id := coalesce(listing_row.product_id, null);
  resolved_variant_id := listing_row.variant_id;

  if resolved_product_id is null then
    select product_id, variant_id
      into resolved_product_id, resolved_variant_id
    from public.marketplace_inventory_items
    where id = new.inventory_item_id
    limit 1;
  end if;

  if resolved_product_id is null then
    return new;
  end if;

  if resolved_variant_id is not null then
    select *
      into variant_row
    from public.marketplace_product_variants
    where id = resolved_variant_id
    limit 1;
  end if;

  resolved_condition_bucket := coalesce(
    variant_row.condition_bucket,
    nullif(listing_row.snapshot_payload ->> 'conditionBucket', ''),
    nullif(listing_row.snapshot_payload ->> 'conditionCode', ''),
    'raw_a'
  );
  resolved_grade_service := coalesce(variant_row.grade_service, listing_row.snapshot_payload ->> 'gradeService');
  resolved_grade_value := coalesce(variant_row.grade_value, listing_row.snapshot_payload ->> 'gradeValue');

  insert into public.marketplace_price_history_points(
    order_id,
    product_id,
    variant_id,
    listing_id,
    listing_source,
    condition_bucket,
    grade_service,
    grade_value,
    item_price_satang,
    currency,
    sold_at,
    public_snapshot
  ) values (
    new.id,
    resolved_product_id,
    resolved_variant_id,
    new.listing_id,
    new.listing_source,
    resolved_condition_bucket,
    resolved_grade_service,
    resolved_grade_value,
    new.item_price_satang,
    new.currency,
    now(),
    jsonb_strip_nulls(
      jsonb_build_object(
        'listingSource', new.listing_source,
        'conditionBucket', resolved_condition_bucket,
        'gradeService', resolved_grade_service,
        'gradeValue', resolved_grade_value
      )
    )
  )
  on conflict (order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists marketplace_orders_record_price_history_after_paid on public.marketplace_orders;
create trigger marketplace_orders_record_price_history_after_paid
after insert or update of payment_state on public.marketplace_orders
for each row
when (new.payment_state = 'paid')
execute function public.marketplace_record_price_history_for_order();

alter table public.marketplace_products enable row level security;
alter table public.marketplace_product_variants enable row level security;
alter table public.marketplace_price_history_points enable row level security;

revoke all on
  public.marketplace_products,
  public.marketplace_product_variants,
  public.marketplace_price_history_points
from public, anon, authenticated;

grant all on
  public.marketplace_products,
  public.marketplace_product_variants,
  public.marketplace_price_history_points
to service_role;

revoke all on function public.marketplace_record_price_history_for_order()
from public, anon, authenticated;

grant execute on function public.marketplace_record_price_history_for_order()
to service_role;
