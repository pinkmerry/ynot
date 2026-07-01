-- Single-read facet counts for the marketplace browse page.
-- Counts come from active public listing snapshots and return only product/offer totals.

create or replace function public.marketplace_browse_filter_counts()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with active_listing as (
    select
      listing.product_id,
      listing.listing_source,
      listing.snapshot_payload,
      product.search_text
    from public.marketplace_listing_snapshots listing
    join public.marketplace_products product on product.id = listing.product_id
    where listing.listing_state = 'active'
      and listing.product_id is not null
      and listing.quantity_available_snapshot > 0
  ),
  filter_counts as (
    select
      'all'::text as filter_key,
      count(distinct product_id)::integer as product_count,
      count(*)::integer as offer_count
    from active_listing

    union all
    select
      'official_shop',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where listing_source = 'official_shop'

    union all
    select
      'user_seller',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where listing_source = 'user_seller'

    union all
    select
      'pokemon',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where search_text ilike '%pokemon%'

    union all
    select
      'one_piece',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where search_text ilike '%one piece%'

    union all
    select
      'psa10',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where snapshot_payload ->> 'conditionBucket' = 'psa_10'

    union all
    select
      'raw',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where snapshot_payload ->> 'conditionBucket' = 'raw_a'

    union all
    select
      'holo',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where search_text ilike '%holo%'

    union all
    select
      'promo',
      count(distinct product_id)::integer,
      count(*)::integer
    from active_listing
    where search_text ilike '%promo%'
  )
  select coalesce(
    jsonb_object_agg(
      filter_key,
      jsonb_build_object(
        'productCount', product_count,
        'offerCount', offer_count
      )
    ),
    '{}'::jsonb
  )
  from filter_counts;
$$;

revoke all on function public.marketplace_browse_filter_counts() from public;
grant execute on function public.marketplace_browse_filter_counts() to service_role;
