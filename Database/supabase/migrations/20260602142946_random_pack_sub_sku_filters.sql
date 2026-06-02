-- Keep random-pack reservation aligned with the selected sub-SKU.
--
-- Product cards still own the main SKU. The random-pack prize metadata can now
-- carry a stockUnitFilter describing the selected physical identity
-- (raw/sealed/graded, grading service, grade, cert, GemRate). During owner
-- review submission we must reserve rows that match that identity, not just any
-- available row for the same card_id.

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

  return coalesce(p_unit.condition, 'raw') = coalesce(expected_condition, 'raw')
    and coalesce(p_unit.grade, '') = expected_grade
    and coalesce(p_unit.grading_service, '') = expected_grading_service
    and coalesce(p_unit.cert_number, '') = expected_cert_number
    and coalesce(p_unit.gemrate_id, '') = expected_gemrate_id;
end;
$$;

create or replace function public.submit_campaign_review(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_logic_snapshot jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  prize_row public.draw_round_prizes%rowtype;
  selected_ids uuid[];
  selected_count integer;
  planned_total integer;
  visible_prize_count integer;
  initial_eligible_units integer;
  next_logic_snapshot jsonb;
  logic_mode text;
  reserved_total integer := 0;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;
  if campaign.status <> 'draft' then
    raise exception 'campaign_must_be_draft';
  end if;
  if campaign.approval_status = 'approved' then
    raise exception 'approved_campaign_inventory_locked';
  end if;

  next_logic_snapshot := coalesce(p_logic_snapshot, campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb);
  logic_mode := coalesce(next_logic_snapshot ->> 'mode', 'pure_random');
  if logic_mode not in ('pure_random', 'weighted_templates', 'inventory_gated') then
    logic_mode := 'pure_random';
    next_logic_snapshot := jsonb_set(next_logic_snapshot, '{mode}', to_jsonb(logic_mode), true);
  end if;

  select
    count(*)::integer,
    coalesce(sum(planned_quantity), 0)::integer,
    coalesce(sum(
      case
        when planned_quantity <= 0 then 0
        when logic_mode = 'pure_random' then planned_quantity
        when coalesce(weight, 1) <= 0 then 0
        when logic_mode = 'inventory_gated' and coalesce(unlock_at_sold_pct, 0) > 0 then 0
        else planned_quantity
      end
    ), 0)::integer
  into visible_prize_count, planned_total, initial_eligible_units
  from public.draw_round_prizes
  where draw_round_id = p_draw_round_id
    and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb);

  if visible_prize_count <= 0 then
    raise exception 'prize_inventory_required';
  end if;
  if planned_total <> campaign.total_slots then
    raise exception 'planned_prize_quantity_must_equal_total_slots';
  end if;
  if initial_eligible_units <= 0 then
    raise exception 'launch_prize_pool_required';
  end if;

  perform public.release_campaign_reservations(
    p_draw_round_id,
    p_admin_id,
    'resubmitted',
    'Released old reservations before owner review resubmission.'
  );

  for prize_row in
    select *
    from public.draw_round_prizes
    where draw_round_id = p_draw_round_id
      and planned_quantity > 0
      and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    order by tier, rank
    for update
  loop
    select coalesce(array_agg(id), '{}'::uuid[])
    into selected_ids
    from (
      select stock.id
      from public.card_stock_units stock
      where stock.card_id = prize_row.card_id
        and stock.status = 'available'
        and public.card_stock_unit_matches_prize_filter(stock, prize_row.metadata)
      order by stock.created_at, stock.id
      limit prize_row.planned_quantity
      for update skip locked
    ) selected;

    selected_count := coalesce(array_length(selected_ids, 1), 0);
    if selected_count < prize_row.planned_quantity then
      insert into public.card_stock_ledger(card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
      values (
        prize_row.card_id,
        p_draw_round_id,
        prize_row.id,
        'approval_failed',
        p_admin_id,
        jsonb_strip_nulls(jsonb_build_object(
          'reason', 'insufficient_matching_card_stock',
          'requiredUnits', prize_row.planned_quantity,
          'availableUnits', selected_count,
          'stockSku', prize_row.metadata ->> 'stockSku',
          'stockLabel', prize_row.metadata ->> 'stockLabel',
          'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey',
          'stockUnitFilter', prize_row.metadata -> 'stockUnitFilter'
        ))
      );
      raise exception 'insufficient_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'reserved',
        reserved_by_admin_id = p_admin_id,
        metadata = units.metadata || jsonb_strip_nulls(jsonb_build_object(
          'reservedByAdminId', p_admin_id,
          'reservedForStockSku', prize_row.metadata ->> 'stockSku'
        )),
        updated_at = now()
    where units.id = any(selected_ids);

    insert into public.card_stock_reservations(
      stock_unit_id,
      draw_round_id,
      draw_round_prize_id,
      status,
      reserved_by_admin_id,
      metadata
    )
    select
      unnest(selected_ids),
      p_draw_round_id,
      prize_row.id,
      'reserved',
      p_admin_id,
      jsonb_strip_nulls(jsonb_build_object(
        'logicMode', logic_mode,
        'plannedQuantity', prize_row.planned_quantity,
        'stockSku', prize_row.metadata ->> 'stockSku',
        'stockLabel', prize_row.metadata ->> 'stockLabel',
        'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey',
        'stockUnitFilter', prize_row.metadata -> 'stockUnitFilter'
      ));

    insert into public.card_stock_ledger(stock_unit_id, card_id, draw_round_id, draw_round_prize_id, event_type, actor_admin_id, metadata)
    select
      unnest(selected_ids),
      prize_row.card_id,
      p_draw_round_id,
      prize_row.id,
      'reserved',
      p_admin_id,
      jsonb_strip_nulls(jsonb_build_object(
        'logicMode', logic_mode,
        'stockSku', prize_row.metadata ->> 'stockSku',
        'stockUnitGroupKey', prize_row.metadata ->> 'stockUnitGroupKey'
      ));

    reserved_total := reserved_total + selected_count;
  end loop;

  update public.draw_rounds
  set logic_snapshot = next_logic_snapshot,
      approval_status = 'pending_review',
      approval_requested_by = p_admin_id,
      approval_requested_at = now(),
      approved_by = null,
      approved_at = null,
      rejected_by = null,
      rejected_at = null,
      approval_notes = p_note,
      status = 'draft',
      visibility = 'private'
  where id = p_draw_round_id;

  return jsonb_build_object(
    'drawRoundId', p_draw_round_id,
    'approvalStatus', 'pending_review',
    'status', 'draft',
    'visibility', 'private',
    'logicMode', logic_mode,
    'plannedUnits', planned_total,
    'reservedUnits', reserved_total
  );
end;
$$;

revoke all on function public.card_stock_unit_matches_prize_filter(public.card_stock_units, jsonb) from public, anon, authenticated;
revoke all on function public.submit_campaign_review(uuid, uuid, jsonb, text) from public, anon, authenticated;

grant execute on function public.card_stock_unit_matches_prize_filter(public.card_stock_units, jsonb) to service_role;
grant execute on function public.submit_campaign_review(uuid, uuid, jsonb, text) to service_role;
