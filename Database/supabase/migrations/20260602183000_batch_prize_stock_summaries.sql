-- batch_prize_stock_summaries
--
-- Random-pack readiness checks need card-level stock coverage plus exact
-- sub-SKU coverage for the selected prize cards. Fetching each card with its
-- own RPC pair adds avoidable latency and load when an admin saves a large pack.

create or replace function public.get_admin_prize_stock_summaries(
  p_card_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requested_cards as (
    select distinct card_id
    from unnest(coalesce(p_card_ids, '{}'::uuid[])) as card_id
    where card_id is not null
  ),
  unit_counts as (
    select
      stock.card_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      count(*) filter (where stock.status = 'archived')::integer as archived_units,
      count(*) filter (where stock.status = 'deleted')::integer as deleted_units
    from public.card_stock_units stock
    join requested_cards requested on requested.card_id = stock.card_id
    group by stock.card_id
  ),
  stock_summaries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', cards.id,
          'totalUnits', coalesce(unit_counts.total_units, 0),
          'availableUnits', coalesce(unit_counts.available_units, 0),
          'reservedUnits', coalesce(unit_counts.reserved_units, 0),
          'allocatedUnits', coalesce(unit_counts.allocated_units, 0),
          'archivedUnits', coalesce(unit_counts.archived_units, 0),
          'deletedUnits', coalesce(unit_counts.deleted_units, 0)
        )
        order by cards.updated_at desc
      ),
      '[]'::jsonb
    ) as rows
    from public.cards cards
    join requested_cards requested on requested.card_id = cards.id
    left join unit_counts on unit_counts.card_id = cards.id
  ),
  normalized_subsku as (
    select
      stock.id,
      stock.card_id,
      stock.status,
      stock.created_at,
      coalesce(nullif(stock.condition, ''), 'raw') as condition,
      case
        when coalesce(nullif(stock.condition, ''), 'raw') = 'graded'
          then nullif(stock.grade, '')
        else null
      end as grade,
      case
        when coalesce(nullif(stock.condition, ''), 'raw') = 'graded'
          then nullif(stock.grading_service, '')
        else null
      end as grading_service,
      case
        when coalesce(nullif(stock.condition, ''), 'raw') = 'graded'
          then nullif(stock.cert_number, '')
        else null
      end as cert_number,
      case
        when coalesce(nullif(stock.condition, ''), 'raw') = 'graded'
          then nullif(stock.gemrate_id, '')
        else null
      end as gemrate_id,
      nullif(stock.image_url, '') as image_url
    from public.card_stock_units stock
    join requested_cards requested on requested.card_id = stock.card_id
    where stock.status not in ('deleted', 'archived')
  ),
  grouped_subsku as (
    select
      normalized.card_id,
      (array_agg(normalized.id order by normalized.created_at asc, normalized.id asc))[1] as sample_unit_id,
      normalized.condition,
      normalized.grade,
      normalized.grading_service,
      normalized.cert_number,
      normalized.gemrate_id,
      (array_remove(array_agg(normalized.image_url order by normalized.created_at asc, normalized.id asc), null))[1] as image_url,
      count(*)::integer as total_units,
      count(*) filter (where normalized.status = 'available')::integer as available_units,
      count(*) filter (where normalized.status = 'reserved')::integer as reserved_units,
      count(*) filter (where normalized.status = 'allocated')::integer as allocated_units
    from normalized_subsku normalized
    group by
      normalized.card_id,
      normalized.condition,
      normalized.grade,
      normalized.grading_service,
      normalized.cert_number,
      normalized.gemrate_id
  ),
  subsku_summaries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', grouped.card_id,
          'sampleUnitId', grouped.sample_unit_id,
          'condition', grouped.condition,
          'grade', grouped.grade,
          'gradingService', grouped.grading_service,
          'certNumber', grouped.cert_number,
          'gemrateId', grouped.gemrate_id,
          'imageUrl', grouped.image_url,
          'totalUnits', grouped.total_units,
          'availableUnits', grouped.available_units,
          'reservedUnits', grouped.reserved_units,
          'allocatedUnits', grouped.allocated_units,
          'stockUnitGroupKey', concat_ws(
            chr(31),
            grouped.condition,
            coalesce(grouped.grade, ''),
            coalesce(grouped.grading_service, ''),
            coalesce(grouped.cert_number, ''),
            coalesce(grouped.gemrate_id, '')
          )
        )
        order by grouped.card_id, grouped.condition, grouped.grade, grouped.grading_service
      ),
      '[]'::jsonb
    ) as rows
    from grouped_subsku grouped
  )
  select jsonb_build_object(
    'stockSummaries', coalesce((select rows from stock_summaries), '[]'::jsonb),
    'subSkuSummaries', coalesce((select rows from subsku_summaries), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_prize_stock_summaries(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_admin_prize_stock_summaries(uuid[])
  to service_role;
