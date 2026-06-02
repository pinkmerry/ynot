-- Fast admin catalog stock summaries.
--
-- The catalog UI needs one row per main SKU + sub-SKU, not every physical
-- stock unit. Physical rows still remain the source of truth for reservation,
-- allocation, and customer pulls.

create index if not exists card_stock_units_subsku_lookup_idx
  on public.card_stock_units (
    card_id,
    status,
    condition,
    grade,
    grading_service,
    cert_number,
    gemrate_id,
    created_at
  )
  where status not in ('deleted', 'archived');

create or replace function public.get_admin_card_stock_subsku_summary(
  p_card_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with grouped as (
    select
      stock.card_id,
      (array_agg(stock.id order by stock.created_at asc, stock.id asc))[1] as sample_unit_id,
      coalesce(nullif(stock.condition, ''), 'raw') as condition,
      nullif(stock.grade, '') as grade,
      nullif(stock.grading_service, '') as grading_service,
      nullif(stock.cert_number, '') as cert_number,
      nullif(stock.gemrate_id, '') as gemrate_id,
      (array_remove(array_agg(nullif(stock.image_url, '') order by stock.created_at asc, stock.id asc), null))[1] as image_url,
      count(*) filter (where stock.status <> 'deleted' and stock.status <> 'archived')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units
    from public.card_stock_units stock
    where (p_card_id is null or stock.card_id = p_card_id)
      and stock.status not in ('deleted', 'archived')
    group by
      stock.card_id,
      coalesce(nullif(stock.condition, ''), 'raw'),
      nullif(stock.grade, ''),
      nullif(stock.grading_service, ''),
      nullif(stock.cert_number, ''),
      nullif(stock.gemrate_id, '')
  )
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
  )
  from grouped;
$$;

revoke all on function public.get_admin_card_stock_subsku_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_card_stock_subsku_summary(uuid)
  to service_role;
