-- Product detail read model for SNKRDUNK-style product pages.
--
-- Keeps product detail reads behind one service-role RPC so the website does
-- not fan out across product, variant, listing, and price-history queries.

create or replace function public.marketplace_get_product_market_detail(
  p_slug text,
  p_source text default null,
  p_condition text default null,
  p_grade text default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_slug text := lower(trim(coalesce(p_slug, '')));
  safe_limit integer := least(greatest(coalesce(p_limit, 24), 1), 50);
  condition_or_grade text := nullif(trim(coalesce(p_grade, p_condition, '')), '');
  product_id_value uuid;
  product_payload jsonb;
  variants_payload jsonb;
  listings_payload jsonb;
  price_history_payload jsonb;
  selected_variant_payload jsonb;
  available_count integer;
begin
  if safe_slug !~ '^[a-z0-9][a-z0-9-]{2,220}$' then
    raise exception 'marketplace_product_slug_invalid';
  end if;

  if p_source is not null and p_source not in ('official_shop', 'user_seller') then
    raise exception 'marketplace_source_invalid';
  end if;

  select product.id
    into product_id_value
  from public.marketplace_products product
  where product.product_slug = safe_slug
  limit 1;

  if product_id_value is null then
    return jsonb_build_object(
      'product', null,
      'variants', '[]'::jsonb,
      'selectedVariant', null,
      'listings', '[]'::jsonb,
      'priceHistory', '[]'::jsonb,
      'relatedVariants', '[]'::jsonb,
      'availableCount', 0,
      'updatedAt', null
    );
  end if;

  select jsonb_build_object(
      'id', product.id,
      'product_slug', product.product_slug,
      'title', product.title,
      'brand', product.brand,
      'category', product.category,
      'series_name', product.series_name,
      'set_name', product.set_name,
      'card_code', product.card_code,
      'language', product.language,
      'hero_image_url', product.hero_image_url,
      'product_metadata', product.product_metadata,
      'active_listing_count', product.active_listing_count,
      'lowest_price_satang', product.lowest_price_satang,
      'sold_count', product.sold_count,
      'updated_at', product.updated_at
    )
    into product_payload
  from public.marketplace_public_product_markets product
  where product.id = product_id_value
  limit 1;

  select coalesce(sum(listing.quantity_available_snapshot), 0)::integer
    into available_count
  from public.marketplace_public_listing_snapshots listing
  where listing.product_id = product_id_value
    and (p_source is null or listing.listing_source = p_source)
    and (condition_or_grade is null or listing.snapshot_payload ->> 'conditionBucket' = condition_or_grade);

  select coalesce(jsonb_agg(variant_payload order by variant_updated_at desc), '[]'::jsonb)
    into variants_payload
  from (
    select
      variant.updated_at as variant_updated_at,
      jsonb_build_object(
        'id', variant.id,
        'product_id', variant.product_id,
        'variant_slug', variant.variant_slug,
        'variant_label', variant.variant_label,
        'condition_bucket', variant.condition_bucket,
        'grade_service', variant.grade_service,
        'grade_value', variant.grade_value,
        'variant_snapshot', variant.variant_snapshot,
        'image_urls', variant.image_urls,
        'active_listing_count', coalesce(listing_counts.active_listing_count, 0),
        'updated_at', variant.updated_at
      ) as variant_payload
    from public.marketplace_product_variants variant
    left join lateral (
      select coalesce(sum(listing.quantity_available_snapshot), 0)::integer as active_listing_count
      from public.marketplace_public_listing_snapshots listing
      where listing.product_id = variant.product_id
        and (
          listing.variant_id = variant.id
          or listing.snapshot_payload ->> 'conditionBucket' = variant.condition_bucket
        )
        and (p_source is null or listing.listing_source = p_source)
        and (condition_or_grade is null or listing.snapshot_payload ->> 'conditionBucket' = condition_or_grade)
    ) listing_counts on true
    where variant.product_id = product_id_value
    order by variant.updated_at desc
    limit 50
  ) variants;

  select variant_payload.value
    into selected_variant_payload
  from jsonb_array_elements(variants_payload) as variant_payload(value)
  where condition_or_grade is null
    or variant_payload.value ->> 'condition_bucket' = condition_or_grade
    or variant_payload.value ->> 'grade_value' = condition_or_grade
  limit 1;

  select coalesce(
      jsonb_agg(
        (to_jsonb(listing_row) - 'listing_sort_price' - 'listing_sort_recent')
        order by listing_sort_price asc, listing_sort_recent desc
      ),
      '[]'::jsonb
    )
    into listings_payload
  from (
    select
      listing.listing_id,
      listing.inventory_item_id,
      listing.product_id,
      listing.variant_id,
      listing.seller_public_profile_id,
      listing.listing_source,
      listing.listing_state,
      listing.public_slug,
      listing.title,
      listing.item_price_satang,
      listing.currency,
      listing.quantity_available_snapshot,
      listing.public_description,
      listing.photo_urls,
      listing.snapshot_payload,
      listing.snapshot_version,
      listing.visible_from,
      listing.updated_at,
      listing.item_price_satang as listing_sort_price,
      coalesce(listing.visible_from, listing.updated_at) as listing_sort_recent
    from public.marketplace_public_listing_snapshots listing
    where listing.product_id = product_id_value
      and (p_source is null or listing.listing_source = p_source)
      and (condition_or_grade is null or listing.snapshot_payload ->> 'conditionBucket' = condition_or_grade)
    order by listing.item_price_satang asc, coalesce(listing.visible_from, listing.updated_at) desc
    limit safe_limit
  ) listing_row;

  select coalesce(jsonb_agg(to_jsonb(history_row) order by sold_at desc), '[]'::jsonb)
    into price_history_payload
  from (
    select
      history.id,
      history.product_id,
      history.variant_id,
      history.listing_id,
      history.listing_source,
      history.condition_bucket,
      history.grade_service,
      history.grade_value,
      history.item_price_satang,
      history.currency,
      history.sold_at,
      history.public_snapshot
    from public.marketplace_price_history_points history
    where history.product_id = product_id_value
      and (p_source is null or history.listing_source = p_source)
      and (condition_or_grade is null or history.condition_bucket = condition_or_grade)
    order by history.sold_at desc
    limit 40
  ) history_row;

  return jsonb_build_object(
    'product', product_payload,
    'variants', variants_payload,
    'selectedVariant', selected_variant_payload,
    'listings', listings_payload,
    'priceHistory', price_history_payload,
    'relatedVariants', variants_payload,
    'availableCount', available_count,
    'updatedAt', product_payload ->> 'updated_at'
  );
end;
$$;

create index if not exists marketplace_price_history_product_source_condition_idx
  on public.marketplace_price_history_points(product_id, listing_source, condition_bucket, sold_at desc);

revoke all on function public.marketplace_get_product_market_detail(
  text,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.marketplace_get_product_market_detail(
  text,
  text,
  text,
  text,
  integer
) to service_role;
