-- require_graded_stock_identity
-- Require graded stock additions to carry the identity that makes a sub-SKU unique.
-- Raw and sealed stock remain condition-only so legacy non-graded rows stay grouped.

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
  v_grade text := nullif(p_grade, '');
  v_grading_service text := nullif(p_grading_service, '');
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
  if p_quantity_delta > 0 and v_condition = 'graded' then
    if v_grade is null or v_grading_service is null then
      raise exception 'graded_stock_identity_required';
    end if;
    if v_grading_service not in ('psa', 'bgs', 'cgc', 'other') then
      raise exception 'invalid_grading_service';
    end if;
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
        case when v_condition = 'graded' then v_grade else null end,
        case when v_condition = 'graded' then v_grading_service else null end,
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
            coalesce(grade, '') = coalesce(v_grade, '')
            and coalesce(grading_service, '') = coalesce(v_grading_service, '')
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
