-- non_graded_stock_identity_is_condition_only
--
-- Raw/sealed physical units do not use grade, grading service, cert number, or
-- GemRate as identity. Older backfilled rows may contain grade = 'Ungraded',
-- but they should still be the same RAW sub-SKU as newer blank-grade rows.
-- Graded stock remains exact by grade/grader/cert/GemRate.

create or replace function public.get_admin_card_stock_subsku_summary(
  p_card_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with normalized as (
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
    where (p_card_id is null or stock.card_id = p_card_id)
      and stock.status not in ('deleted', 'archived')
  ),
  grouped as (
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
    from normalized
    group by
      normalized.card_id,
      normalized.condition,
      normalized.grade,
      normalized.grading_service,
      normalized.cert_number,
      normalized.gemrate_id
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

create or replace function public.card_stock_unit_matches_prize_filter(
  p_unit public.card_stock_units,
  p_prize_metadata jsonb
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  filter_metadata jsonb;
  group_key text;
  group_parts text[];
  expected_condition text;
  expected_grade text;
  expected_grading_service text;
  expected_cert_number text;
  expected_gemrate_id text;
  filter_condition text;
begin
  if p_prize_metadata is null then
    return true;
  end if;

  filter_metadata := p_prize_metadata -> 'stockUnitFilter';

  if jsonb_typeof(filter_metadata) = 'object' then
    expected_condition := nullif(filter_metadata ->> 'condition', '');
    expected_grade := coalesce(filter_metadata ->> 'grade', '');
    expected_grading_service := coalesce(filter_metadata ->> 'gradingService', '');
    expected_cert_number := coalesce(filter_metadata ->> 'certNumber', '');
    expected_gemrate_id := coalesce(filter_metadata ->> 'gemrateId', '');
  else
    group_key := coalesce(p_prize_metadata ->> 'stockUnitGroupKey', '');
    if group_key = '' then
      return true;
    end if;

    group_parts := string_to_array(group_key, chr(31));
    expected_condition := nullif(group_parts[1], '');
    expected_grade := coalesce(group_parts[2], '');
    expected_grading_service := coalesce(group_parts[3], '');
    expected_cert_number := coalesce(group_parts[4], '');
    expected_gemrate_id := coalesce(group_parts[5], '');
  end if;

  filter_condition := coalesce(expected_condition, 'raw');

  if filter_condition <> 'graded' then
    return coalesce(p_unit.condition, 'raw') = filter_condition;
  end if;

  return coalesce(p_unit.condition, 'raw') = filter_condition
    and coalesce(p_unit.grade, '') = expected_grade
    and coalesce(p_unit.grading_service, '') = expected_grading_service
    and coalesce(p_unit.cert_number, '') = expected_cert_number
    and coalesce(p_unit.gemrate_id, '') = expected_gemrate_id;
end;
$$;

revoke all on function public.card_stock_unit_matches_prize_filter(
  public.card_stock_units,
  jsonb
) from public, anon, authenticated;
grant execute on function public.card_stock_unit_matches_prize_filter(
  public.card_stock_units,
  jsonb
) to service_role;

