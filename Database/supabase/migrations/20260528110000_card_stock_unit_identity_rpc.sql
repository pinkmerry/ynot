-- ============================================================================
-- Product → Unit split, phase 2 — stamp unit identity on creation
--
-- Extends adjust_card_stock_units so newly-created stock units carry their own
-- physical-item identity (condition / grade / grading service / cert / GemRate)
-- instead of inheriting it from the parent card. The model is row-based:
--   * graded slab  → add one row at a time (quantity_delta = 1) with a cert;
--   * raw / sealed → add N identical rows (quantity_delta = N), no cert.
--
-- The inventory state machine (reserve → allocate → release → gacha draw) is
-- unchanged: every unit is still one row driven by `status`, so this is a
-- low-risk, additive extension. The archive (negative-delta) branch is
-- untouched.
-- ============================================================================

-- Old signature must be dropped before re-creating with extra params.
drop function if exists public.adjust_card_stock_units(uuid, integer, uuid, text, text, jsonb);

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
  p_gemrate_id text default null
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
  v_condition text := coalesce(nullif(p_condition, ''), 'raw');
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
  if v_condition not in ('sealed', 'raw', 'graded') then
    raise exception 'invalid_condition';
  end if;
  -- A cert identifies one physical slab, so it can only attach to a single
  -- row. Bulk creation with a cert would duplicate it.
  if v_cert is not null and p_quantity_delta <> 1 then
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
        nullif(p_grade, ''),
        nullif(p_grading_service, ''),
        v_cert,
        nullif(p_gemrate_id, ''),
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

-- Re-apply the original grants for the new signature.
revoke all on function public.adjust_card_stock_units(
  uuid, integer, uuid, text, text, jsonb, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.adjust_card_stock_units(
  uuid, integer, uuid, text, text, jsonb, text, text, text, text, text
) to service_role;
