-- Allow editing a stock unit even after a pack has reserved or allocated it.
-- Admins need to correct a unit's identity (condition/grade/cert/gemrate) or
-- attach an image after the unit is already used in a random pack. The unit is
-- linked to draw_round_prize_units by its stable UUID, so the pack assignment
-- survives the edit; only the unit's displayed sub-SKU identity changes.
--
-- Deletion stays restricted to 'available' units (delete_card_stock_unit is
-- unchanged) because removing an allocated unit would orphan a pack prize slot.
create or replace function public.edit_card_stock_unit(
  p_unit_id uuid,
  p_admin_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit public.card_stock_units%rowtype;
  v_admin_is_active boolean;
  v_condition text := lower(nullif(btrim(coalesce(p_condition, '')), ''));
  v_grade text := nullif(btrim(coalesce(p_grade, '')), '');
  v_grading_service text := lower(nullif(btrim(coalesce(p_grading_service, '')), ''));
  v_cert_number text := nullif(btrim(coalesce(p_cert_number, '')), '');
  v_gemrate_id text := nullif(btrim(coalesce(p_gemrate_id, '')), '');
  v_image_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_image_storage_path text := nullif(btrim(coalesce(p_image_storage_path, '')), '');
begin
  if p_unit_id is null then
    raise exception 'stock_unit_required';
  end if;
  if p_admin_id is null then
    raise exception 'active_admin_required';
  end if;

  select exists (
    select 1
    from public.admin_users admin
    where admin.id = p_admin_id
      and admin.is_active
  )
  into v_admin_is_active;
  if not v_admin_is_active then
    raise exception 'active_admin_required';
  end if;

  if v_condition is null or v_condition not in ('sealed', 'raw', 'graded') then
    raise exception 'invalid_condition';
  end if;
  if v_condition = 'graded' then
    if v_grade is null or v_grading_service is null then
      raise exception 'graded_stock_identity_required';
    end if;
    if v_grading_service not in ('psa', 'bgs', 'cgc', 'other') then
      raise exception 'invalid_grading_service';
    end if;
  else
    v_grade := null;
    v_grading_service := null;
    v_cert_number := null;
    v_gemrate_id := null;
  end if;

  -- Editable while the unit is live in inventory or a pack; archived/deleted
  -- units stay locked.
  select *
  into v_unit
  from public.card_stock_units
  where id = p_unit_id
    and status in ('available', 'reserved', 'allocated')
  for update;

  if not found then
    raise exception 'stock_unit_not_editable';
  end if;

  if v_cert_number is not null and exists (
    select 1
    from public.card_stock_units unit
    where unit.cert_number = v_cert_number
      and unit.id <> p_unit_id
      and unit.status <> 'deleted'
  ) then
    raise exception 'stock_cert_number_already_used';
  end if;

  update public.card_stock_units
  set condition = v_condition,
      grade = v_grade,
      grading_service = v_grading_service,
      cert_number = v_cert_number,
      gemrate_id = v_gemrate_id,
      image_url = v_image_url,
      image_storage_path = v_image_storage_path,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lastEditedByAdminId', p_admin_id
      ),
      updated_at = now()
  where id = p_unit_id;

  insert into public.card_stock_ledger(
    stock_unit_id,
    card_id,
    event_type,
    actor_admin_id,
    metadata
  )
  values (
    p_unit_id,
    v_unit.card_id,
    'edited',
    p_admin_id,
    jsonb_build_object(
      'action', 'unit_edited',
      'previousStatus', v_unit.status,
      'previousCondition', v_unit.condition,
      'newCondition', v_condition,
      'previousGrade', v_unit.grade,
      'newGrade', v_grade,
      'previousGradingService', v_unit.grading_service,
      'newGradingService', v_grading_service,
      'previousCertNumber', v_unit.cert_number,
      'newCertNumber', v_cert_number
    )
  );

  insert into public.audit_events(
    actor_admin_id,
    event_type,
    metadata
  )
  values (
    p_admin_id,
    'card_stock_unit_edited',
    jsonb_build_object(
      'unitId', p_unit_id,
      'cardId', v_unit.card_id,
      'previousStatus', v_unit.status,
      'previousCondition', v_unit.condition,
      'newCondition', v_condition,
      'previousGrade', v_unit.grade,
      'newGrade', v_grade,
      'previousGradingService', v_unit.grading_service,
      'newGradingService', v_grading_service,
      'previousCertNumber', v_unit.cert_number,
      'newCertNumber', v_cert_number
    )
  );

  return jsonb_build_object(
    'status', 'edited',
    'unitId', p_unit_id,
    'cardId', v_unit.card_id
  );
end;
$$;

revoke all on function public.edit_card_stock_unit(
  uuid, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.edit_card_stock_unit(
  uuid, uuid, text, text, text, text, text, text, text
) to service_role;
