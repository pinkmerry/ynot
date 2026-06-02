-- random_pack_requires_subsku_selection
--
-- Random-pack prize rows and bulk stock removal must target an explicit
-- physical stock sub-SKU. Missing metadata used to behave like "match any
-- available unit for this card", which can mix RAW, PSA, BGS, sealed, and other
-- identities under the same main card SKU.

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
    return false;
  end if;

  filter_metadata := p_prize_metadata -> 'stockUnitFilter';

  if jsonb_typeof(filter_metadata) = 'object' then
    expected_condition := nullif(filter_metadata ->> 'condition', '');
    if expected_condition is null then
      return false;
    end if;
    expected_grade := coalesce(filter_metadata ->> 'grade', '');
    expected_grading_service := coalesce(filter_metadata ->> 'gradingService', '');
    expected_cert_number := coalesce(filter_metadata ->> 'certNumber', '');
    expected_gemrate_id := coalesce(filter_metadata ->> 'gemrateId', '');
  else
    group_key := coalesce(p_prize_metadata ->> 'stockUnitGroupKey', '');
    if group_key = '' then
      return false;
    end if;

    group_parts := string_to_array(group_key, chr(31));
    expected_condition := nullif(group_parts[1], '');
    if expected_condition is null then
      return false;
    end if;
    expected_grade := coalesce(group_parts[2], '');
    expected_grading_service := coalesce(group_parts[3], '');
    expected_cert_number := coalesce(group_parts[4], '');
    expected_gemrate_id := coalesce(group_parts[5], '');
  end if;

  filter_condition := expected_condition;
  if filter_condition not in ('sealed', 'raw', 'graded') then
    return false;
  end if;

  if filter_condition <> 'graded' then
    return coalesce(nullif(p_unit.condition, ''), 'raw') = filter_condition;
  end if;

  return coalesce(nullif(p_unit.condition, ''), 'raw') = filter_condition
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

create or replace function public.adjust_card_stock_units(
  p_card_id uuid,
  p_quantity_delta integer,
  p_admin_id uuid,
  p_source_type text default 'admin_adjustment',
  p_source_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_condition text default null,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  selected_ids uuid[];
  archived_count integer := 0;
  normalized_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_condition text := nullif(p_condition, '');
  v_cert text := nullif(p_cert_number, '');
begin
  if p_card_id is null then
    raise exception 'card_required';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then
    raise exception 'invalid_stock_quantity_delta';
  end if;
  if not exists (select 1 from public.cards where id = p_card_id) then
    raise exception 'card_not_found';
  end if;

  if p_quantity_delta > 0 then
    v_condition := coalesce(v_condition, 'raw');
  elsif v_condition is null then
    raise exception 'stock_subsku_required';
  end if;

  if v_condition not in ('sealed', 'raw', 'graded') then
    raise exception 'invalid_condition';
  end if;
  if p_quantity_delta > 0 and v_cert is not null and p_quantity_delta <> 1 then
    raise exception 'cert_requires_single_unit';
  end if;

  if p_quantity_delta > 0 then
    with inserted as (
      insert into public.card_stock_units(
        card_id,
        status,
        source_type,
        source_id,
        created_by_admin_id,
        metadata,
        condition,
        grade,
        grading_service,
        cert_number,
        gemrate_id,
        image_url,
        image_storage_path,
        quantity
      )
      select
        p_card_id,
        'available',
        coalesce(nullif(p_source_type, ''), 'admin_adjustment'),
        nullif(p_source_id, ''),
        p_admin_id,
        normalized_metadata || jsonb_build_object('createdByAdminId', p_admin_id),
        v_condition,
        case when v_condition = 'graded' then nullif(p_grade, '') else null end,
        case when v_condition = 'graded' then nullif(p_grading_service, '') else null end,
        case when v_condition = 'graded' then v_cert else null end,
        case when v_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
        nullif(p_image_url, ''),
        nullif(p_image_storage_path, ''),
        1
      from generate_series(1, p_quantity_delta)
      returning id, card_id
    ),
    ledgered as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'stock_created', p_admin_id, normalized_metadata
      from inserted
      returning 1
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into selected_ids
    from inserted;
  else
    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select id
      from public.card_stock_units
      where card_id = p_card_id
        and status = 'available'
        and coalesce(nullif(condition, ''), 'raw') = v_condition
        and (
          v_condition <> 'graded'
          or (
            coalesce(grade, '') = coalesce(nullif(p_grade, ''), '')
            and coalesce(grading_service, '') = coalesce(nullif(p_grading_service, ''), '')
            and coalesce(cert_number, '') = coalesce(v_cert, '')
            and coalesce(gemrate_id, '') = coalesce(nullif(p_gemrate_id, ''), '')
          )
        )
      order by created_at desc, id desc
      limit abs(p_quantity_delta)
      for update skip locked
    ) selected;

    if coalesce(array_length(selected_ids, 1), 0) < abs(p_quantity_delta) then
      raise exception 'insufficient_available_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'archived',
        metadata = units.metadata || normalized_metadata || jsonb_build_object('archivedByAdminId', p_admin_id),
        updated_at = now()
    where units.id = any(selected_ids);
    get diagnostics archived_count = row_count;

    insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
    select id, card_id, 'archived', p_admin_id, normalized_metadata
    from public.card_stock_units
    where id = any(selected_ids);
  end if;

  return jsonb_build_object(
    'cardId', p_card_id,
    'quantityDelta', p_quantity_delta,
    'changedUnits', greatest(p_quantity_delta, archived_count),
    'stock', public.get_card_stock_summary(p_card_id)
  );
end;
$$;

revoke all on function public.adjust_card_stock_units(
  uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.adjust_card_stock_units(
  uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text
) to service_role;
