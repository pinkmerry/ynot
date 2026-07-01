-- Product-level marketplace browse read model.
--
-- Browse groups active seller and official listings by canonical
-- marketplace_products.id. Checkout remains listing-level.

create extension if not exists pg_trgm with schema extensions;

alter table public.marketplace_products
  add column if not exists search_text text generated always as (
    lower(
      coalesce(title, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(series_name, '') || ' ' ||
      coalesce(set_name, '') || ' ' ||
      coalesce(card_code, '') || ' ' ||
      coalesce(language, '') || ' ' ||
      coalesce(product_metadata ->> 'productCode', '') || ' ' ||
      coalesce(product_metadata ->> 'setNumber', '')
    )
  ) stored;

create index if not exists marketplace_products_search_trgm_idx
  on public.marketplace_products using gin (search_text extensions.gin_trgm_ops);

create index if not exists marketplace_listing_product_active_browse_idx
  on public.marketplace_listing_snapshots(
    product_id,
    listing_source,
    item_price_satang,
    visible_from desc,
    listing_id
  )
  where listing_state = 'active'
    and product_id is not null
    and quantity_available_snapshot > 0;

create index if not exists marketplace_listing_product_variant_active_browse_idx
  on public.marketplace_listing_snapshots(
    product_id,
    variant_id,
    item_price_satang,
    visible_from desc,
    listing_id
  )
  where listing_state = 'active'
    and product_id is not null
    and quantity_available_snapshot > 0;

create index if not exists marketplace_price_history_product_recent_idx
  on public.marketplace_price_history_points(product_id, sold_at desc);

create or replace function public.marketplace_browse_product_markets(
  p_source text default null,
  p_item_type text default null,
  p_q text default null,
  p_condition text default null,
  p_grade text default null,
  p_sort text default 'recommended',
  p_limit integer default 24,
  p_after_product_slug text default null,
  p_after_price_satang integer default null,
  p_after_recent_at timestamptz default null,
  p_after_ranking_score numeric default null
)
returns table (
  product_id uuid,
  product_slug text,
  title text,
  brand text,
  category text,
  series_name text,
  set_name text,
  card_code text,
  language text,
  hero_image_url text,
  product_metadata jsonb,
  active_listing_count integer,
  official_listing_count integer,
  user_seller_listing_count integer,
  variant_count integer,
  lowest_price_satang integer,
  highest_price_satang integer,
  recent_listing_at timestamptz,
  sold_count integer,
  last_sold_at timestamptz,
  ranking_score numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 24), 1), 51);
  safe_sort text := case
    when p_sort in ('recommended', 'popular', 'newest', 'price_asc', 'price_desc', 'recent_sales') then p_sort
    else 'recommended'
  end;
  normalized_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  condition_or_grade text := nullif(trim(coalesce(p_grade, p_condition, '')), '');
begin
  if p_source is not null and p_source not in ('official_shop', 'user_seller') then
    raise exception 'marketplace_source_invalid';
  end if;

  if p_item_type is not null and p_item_type not in ('card', 'sealed_box', 'sealed_pack') then
    raise exception 'marketplace_item_type_invalid';
  end if;

  return query
  with active_listing as (
    select listing.*
    from public.marketplace_listing_snapshots listing
    where listing.listing_state = 'active'
      and listing.product_id is not null
      and listing.quantity_available_snapshot > 0
      and (p_source is null or listing.listing_source = p_source)
      and (p_item_type is null or listing.snapshot_payload ->> 'itemType' = p_item_type)
      and (condition_or_grade is null or listing.snapshot_payload ->> 'conditionBucket' = condition_or_grade)
  ),
  listing_stats as (
    select
      listing.product_id,
      count(*)::integer as active_listing_count,
      count(*) filter (where listing.listing_source = 'official_shop')::integer as official_listing_count,
      count(*) filter (where listing.listing_source = 'user_seller')::integer as user_seller_listing_count,
      count(distinct listing.variant_id)::integer as variant_count,
      min(listing.item_price_satang)::integer as lowest_price_satang,
      max(listing.item_price_satang)::integer as highest_price_satang,
      max(coalesce(listing.visible_from, listing.updated_at)) as recent_listing_at
    from active_listing listing
    group by listing.product_id
  ),
  sold_stats as (
    select
      history.product_id,
      count(*)::integer as sold_count,
      max(history.sold_at) as last_sold_at
    from public.marketplace_price_history_points history
    where (p_source is null or history.listing_source = p_source)
      and (condition_or_grade is null or history.condition_bucket = condition_or_grade)
    group by history.product_id
  ),
  ranked as (
    select
      product.id as product_id,
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
      stats.active_listing_count,
      stats.official_listing_count,
      stats.user_seller_listing_count,
      greatest(stats.variant_count, 1)::integer as variant_count,
      stats.lowest_price_satang,
      stats.highest_price_satang,
      stats.recent_listing_at,
      coalesce(sold.sold_count, 0)::integer as sold_count,
      sold.last_sold_at,
      (
        coalesce(sold.sold_count, 0)::numeric * 100
        + stats.active_listing_count::numeric * 10
        + greatest(0, 30 - extract(epoch from (now() - stats.recent_listing_at)) / 86400)::numeric
      ) as ranking_score
    from public.marketplace_products product
    join listing_stats stats on stats.product_id = product.id
    left join sold_stats sold on sold.product_id = product.id
    where normalized_q is null
      or product.search_text ilike '%' || replace(replace(normalized_q, '%', ''), '_', '') || '%'
  )
  select
    ranked.product_id,
    ranked.product_slug,
    ranked.title,
    ranked.brand,
    ranked.category,
    ranked.series_name,
    ranked.set_name,
    ranked.card_code,
    ranked.language,
    ranked.hero_image_url,
    ranked.product_metadata,
    ranked.active_listing_count,
    ranked.official_listing_count,
    ranked.user_seller_listing_count,
    ranked.variant_count,
    ranked.lowest_price_satang,
    ranked.highest_price_satang,
    ranked.recent_listing_at,
    ranked.sold_count,
    ranked.last_sold_at,
    ranked.ranking_score
  from ranked
  where p_after_product_slug is null
    or (
      safe_sort = 'price_asc'
      and (
        ranked.lowest_price_satang > coalesce(p_after_price_satang, -1)
        or (
          ranked.lowest_price_satang = coalesce(p_after_price_satang, -1)
          and ranked.product_slug > p_after_product_slug
        )
      )
    )
    or (
      safe_sort = 'price_desc'
      and (
        ranked.lowest_price_satang < coalesce(p_after_price_satang, 2147483647)
        or (
          ranked.lowest_price_satang = coalesce(p_after_price_satang, 2147483647)
          and ranked.product_slug < p_after_product_slug
        )
      )
    )
    or (
      safe_sort in ('newest', 'recent_sales')
      and (
        coalesce(
          case when safe_sort = 'recent_sales' then ranked.last_sold_at else ranked.recent_listing_at end,
          '-infinity'::timestamptz
        ) < coalesce(p_after_recent_at, 'infinity'::timestamptz)
        or (
          coalesce(
            case when safe_sort = 'recent_sales' then ranked.last_sold_at else ranked.recent_listing_at end,
            '-infinity'::timestamptz
          ) = coalesce(p_after_recent_at, 'infinity'::timestamptz)
          and ranked.product_slug < p_after_product_slug
        )
      )
    )
    or (
      safe_sort in ('recommended', 'popular')
      and (
        ranked.ranking_score < coalesce(p_after_ranking_score, 999999999)
        or (
          ranked.ranking_score = coalesce(p_after_ranking_score, 999999999)
          and ranked.product_slug < p_after_product_slug
        )
      )
    )
  order by
    case when safe_sort = 'price_asc' then ranked.lowest_price_satang end asc nulls last,
    case when safe_sort = 'price_asc' then ranked.product_slug end asc,
    case when safe_sort = 'price_desc' then ranked.lowest_price_satang end desc nulls last,
    case when safe_sort = 'price_desc' then ranked.product_slug end desc,
    case when safe_sort = 'newest' then ranked.recent_listing_at end desc nulls last,
    case when safe_sort = 'recent_sales' then ranked.last_sold_at end desc nulls last,
    case when safe_sort in ('recommended', 'popular') then ranked.ranking_score end desc,
    ranked.product_slug desc
  limit safe_limit;
end;
$$;

revoke all on function public.marketplace_browse_product_markets(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer,
  timestamptz,
  numeric
) from public, anon, authenticated;

grant execute on function public.marketplace_browse_product_markets(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer,
  timestamptz,
  numeric
) to service_role;
