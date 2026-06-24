-- Variant language axis: make card language a physical-item attribute of
-- card_stock_units (parallel to grade/condition/cert_number) so the same card
-- code can hold EN/JP/KR/CN as distinct, correctly-stocked variants. Language
-- flows into the stock_sku identity (generated sku_code + label) so each
-- language becomes its own variant row. It rides inside the existing p_metadata
-- jsonb arg of the adjust RPCs, so those signatures DO NOT change.

-- (a) Column + CHECK -----------------------------------------------------------
alter table public.card_stock_units
  add column if not exists language text;

alter table public.card_stock_units
  drop constraint if exists card_stock_units_language_check;
alter table public.card_stock_units
  add constraint card_stock_units_language_check
  check (language is null or language in ('english', 'japanese', 'korean', 'chinese'));

-- (b) app_private.stock_sku_default_code ---------------------------------------
-- DROP + recreate with a trailing p_language; append a language code-part as a
-- NEW final concat_ws arg. concat_ws skips NULLs, so when language is absent the
-- generated sku_code stays byte-identical to existing rows (backward compatible).
drop function if exists app_private.stock_sku_default_code(text, text, uuid, text, text, text, text, text);
create or replace function app_private.stock_sku_default_code(
  p_card_code text,
  p_search_code text,
  p_card_id uuid,
  p_condition text,
  p_grade text,
  p_grading_service text,
  p_cert_number text,
  p_gemrate_id text,
  p_language text default null
)
returns text
language sql
stable
as $$
  select concat_ws(
    '-',
    app_private.stock_sku_code_part(coalesce(p_card_code, p_search_code, p_card_id::text)),
    case
      when coalesce(p_condition, 'raw') = 'graded' then concat_ws(
        '',
        app_private.stock_sku_code_part(coalesce(p_grading_service, 'graded')),
        nullif(regexp_replace(coalesce(p_grade, ''), '[^0-9]+', '', 'g'), '')
      )
      when coalesce(p_condition, 'raw') = 'sealed' then 'SEALED'
      else 'RAW'
    end,
    case
      when nullif(p_cert_number, '') is not null
        then concat('CERT-', app_private.stock_sku_code_part(p_cert_number))
      when nullif(p_gemrate_id, '') is not null
        then concat('GEMRATE-', app_private.stock_sku_code_part(p_gemrate_id))
    end,
    case
      when nullif(p_language, '') is not null
        then app_private.stock_sku_code_part(p_language)
    end
  );
$$;

-- (c) app_private.ensure_default_stock_sku -------------------------------------
-- DROP + recreate with a trailing p_language. Existing callers using the old
-- 8-arg arity bind to this function with p_language => null. The language is
-- appended to the generated sku_code (9th arg), to the label, and recorded in
-- the backfillIdentity metadata.
drop function if exists app_private.ensure_default_stock_sku(uuid, text, text, text, text, text, text, text);
create or replace function app_private.ensure_default_stock_sku(
  p_card_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_language text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  card_row public.cards%rowtype;
  next_code text;
  next_label text;
  next_kind text;
  stock_sku_id uuid;
begin
  select * into card_row
  from public.cards
  where id = p_card_id;

  if card_row.id is null then
    raise exception 'card_required';
  end if;

  next_code := app_private.stock_sku_default_code(
    card_row.card_code,
    card_row.search_code,
    card_row.id,
    coalesce(nullif(p_condition, ''), 'raw'),
    p_grade,
    p_grading_service,
    p_cert_number,
    p_gemrate_id,
    p_language
  );
  next_kind := app_private.stock_sku_default_kind(
    card_row.catalog_category,
    coalesce(nullif(p_condition, ''), 'raw')
  );
  next_label := case
    when coalesce(nullif(p_condition, ''), 'raw') = 'graded' then
      concat_ws(' - ', upper(coalesce(p_grading_service, 'graded')), nullif(p_grade, ''), case when nullif(p_cert_number, '') is not null then '#' || p_cert_number end)
    when coalesce(nullif(p_condition, ''), 'raw') = 'sealed' then 'Sealed'
    else 'Raw'
  end;

  if nullif(p_language, '') is not null then
    next_label := next_label || ' · ' || case lower(p_language)
      when 'english' then 'EN'
      when 'japanese' then 'JP'
      when 'korean' then 'KR'
      when 'chinese' then 'CN'
      else upper(p_language)
    end;
  end if;

  insert into public.stock_skus(
    card_id,
    sku_code,
    label,
    unit_kind,
    image_url,
    image_storage_path,
    metadata
  )
  values (
    p_card_id,
    next_code,
    next_label,
    next_kind,
    nullif(p_image_url, ''),
    nullif(p_image_storage_path, ''),
    jsonb_build_object(
      'backfillIdentity',
      jsonb_build_object(
        'condition', coalesce(nullif(p_condition, ''), 'raw'),
        'grade', coalesce(p_grade, ''),
        'gradingService', coalesce(p_grading_service, ''),
        'certNumber', coalesce(p_cert_number, ''),
        'gemrateId', coalesce(p_gemrate_id, ''),
        'language', coalesce(p_language, '')
      )
    )
  )
  on conflict do nothing;

  select id into stock_sku_id
  from public.stock_skus
  where card_id = p_card_id
    and lower(sku_code) = lower(next_code)
    and is_active
  order by created_at asc, id asc
  limit 1;

  return stock_sku_id;
end;
$$;

-- (d) public.edit_card_stock_unit ----------------------------------------------
-- Signature UNCHANGED. Preserve language: read the existing unit row's language
-- and pass it through to ensure_default_stock_sku (9th arg), and write it back
-- onto the unit so the identity is retained.
create or replace function public.edit_card_stock_unit(
  p_unit_id uuid,
  p_admin_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_stock_sku_id uuid default null
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
  v_stock_sku_id uuid := p_stock_sku_id;
  v_language text;
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

  select *
  into v_unit
  from public.card_stock_units
  where id = p_unit_id
    and status in ('available', 'reserved', 'allocated')
  for update;

  if not found then
    raise exception 'stock_unit_not_editable';
  end if;

  v_language := nullif(v_unit.language, '');

  if v_stock_sku_id is not null
    and (
      coalesce(nullif(v_unit.condition, ''), 'raw') <> v_condition
      or (
        v_condition = 'graded'
        and (
          coalesce(v_unit.grade, '') <> coalesce(v_grade, '')
          or coalesce(v_unit.grading_service, '') <> coalesce(v_grading_service, '')
          or coalesce(v_unit.cert_number, '') <> coalesce(v_cert_number, '')
          or coalesce(v_unit.gemrate_id, '') <> coalesce(v_gemrate_id, '')
        )
      )
    ) then
    v_stock_sku_id := null;
  end if;

  if v_stock_sku_id is not null and not exists (
    select 1
    from public.stock_skus sku
    where sku.id = v_stock_sku_id
      and sku.card_id = v_unit.card_id
      and sku.is_active
  ) then
    raise exception 'stock_sku_not_found';
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

	  if v_stock_sku_id is null
	    and coalesce(nullif(v_unit.condition, ''), 'raw') = v_condition
	    and (
	      v_condition <> 'graded'
	      or (
	        coalesce(v_unit.grade, '') = coalesce(v_grade, '')
	        and coalesce(v_unit.grading_service, '') = coalesce(v_grading_service, '')
	        and coalesce(v_unit.cert_number, '') = coalesce(v_cert_number, '')
	        and coalesce(v_unit.gemrate_id, '') = coalesce(v_gemrate_id, '')
	      )
	    ) then
	    v_stock_sku_id := v_unit.stock_sku_id;
	  end if;
  if v_stock_sku_id is null then
    v_stock_sku_id := app_private.ensure_default_stock_sku(
      v_unit.card_id,
      v_condition,
      v_grade,
      v_grading_service,
      v_cert_number,
      v_gemrate_id,
      v_image_url,
      v_image_storage_path,
      v_language
    );
  end if;
  if v_stock_sku_id is null then
    raise exception 'stock_sku_not_found';
  end if;

  update public.card_stock_units
  set condition = v_condition,
      grade = v_grade,
      grading_service = v_grading_service,
      cert_number = v_cert_number,
      gemrate_id = v_gemrate_id,
      image_url = v_image_url,
      image_storage_path = v_image_storage_path,
      stock_sku_id = v_stock_sku_id,
      language = v_language,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lastEditedByAdminId', p_admin_id,
        'stockSkuId', v_stock_sku_id
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
      'newCertNumber', v_cert_number,
      'previousStockSkuId', v_unit.stock_sku_id,
      'newStockSkuId', v_stock_sku_id
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
      'newCertNumber', v_cert_number,
      'previousStockSkuId', v_unit.stock_sku_id,
      'newStockSkuId', v_stock_sku_id
    )
  );

  return jsonb_build_object(
    'status', 'edited',
    'unitId', p_unit_id,
    'cardId', v_unit.card_id,
    'stockSkuId', v_stock_sku_id
  );
end;
$$;

-- (e) public.adjust_card_stock_units -------------------------------------------
-- Signature UNCHANGED. Language travels in p_metadata. Read it into v_language,
-- pass it to ensure_default_stock_sku (9th arg), set it on new units (graded AND
-- raw), and include it in the negative-delta non-stock_sku matching branch.
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
  metadata_stock_sku_id text := nullif(normalized_metadata ->> 'stockSkuId', '');
  metadata_group_key text := nullif(normalized_metadata ->> 'stockUnitGroupKey', '');
  v_condition text := nullif(p_condition, '');
  v_cert text := nullif(p_cert_number, '');
  v_grade text := nullif(p_grade, '');
  v_grading_service text := nullif(p_grading_service, '');
  v_language text := nullif(normalized_metadata ->> 'language', '');
  v_stock_sku_id uuid;
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

  if p_quantity_delta < 0 then
    if metadata_stock_sku_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_stock_sku_id := metadata_stock_sku_id::uuid;
    elsif coalesce(metadata_group_key, '') ~* '^stock-sku:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_stock_sku_id := substring(metadata_group_key from 11)::uuid;
    end if;
  end if;

  if p_quantity_delta > 0 then
    v_condition := coalesce(v_condition, 'raw');
  elsif v_condition is null and v_stock_sku_id is null then
    raise exception 'stock_subsku_required';
  end if;

  if v_condition is not null and v_condition not in ('sealed', 'raw', 'graded') then
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
  if p_quantity_delta < 0 and v_stock_sku_id is not null and not exists (
    select 1
    from public.stock_skus sku
    where sku.id = v_stock_sku_id
      and sku.card_id = p_card_id
      and sku.is_active
  ) then
    raise exception 'stock_sku_not_found';
  end if;

  if p_quantity_delta > 0 then
    v_stock_sku_id := app_private.ensure_default_stock_sku(
      p_card_id,
      v_condition,
      case when v_condition = 'graded' then v_grade else null end,
      case when v_condition = 'graded' then v_grading_service else null end,
      case when v_condition = 'graded' then v_cert else null end,
      case when v_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
      p_image_url,
      p_image_storage_path,
      v_language
    );

    with inserted as (
      insert into public.card_stock_units(
        card_id,
        stock_sku_id,
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
        language,
        quantity
      )
      select
        p_card_id,
        v_stock_sku_id,
        'available',
        coalesce(nullif(p_source_type, ''), 'admin_adjustment'),
        nullif(p_source_id, ''),
        p_admin_id,
        normalized_metadata || jsonb_build_object(
          'createdByAdminId', p_admin_id,
          'stockSkuId', v_stock_sku_id
        ),
        v_condition,
        case when v_condition = 'graded' then v_grade else null end,
        case when v_condition = 'graded' then v_grading_service else null end,
        case when v_condition = 'graded' then v_cert else null end,
        case when v_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
        nullif(p_image_url, ''),
        nullif(p_image_storage_path, ''),
        v_language,
        1
      from generate_series(1, p_quantity_delta)
      returning id, card_id
    ),
    ledgered as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'stock_created', p_admin_id, normalized_metadata || jsonb_build_object('stockSkuId', v_stock_sku_id)
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
      from public.card_stock_units stock
      where stock.card_id = p_card_id
        and stock.status = 'available'
        and (
          (
            v_stock_sku_id is not null
            and stock.stock_sku_id = v_stock_sku_id
          )
          or (
            v_stock_sku_id is null
            and coalesce(nullif(stock.condition, ''), 'raw') = v_condition
            and coalesce(stock.language, '') = coalesce(v_language, '')
            and (
              v_condition <> 'sealed'
              or stock.stock_sku_id is null
              or exists (
                select 1
                from public.stock_skus sku
                where sku.id = stock.stock_sku_id
                  and sku.unit_kind <> 'box'
              )
            )
            and (
              v_condition <> 'graded'
              or (
                coalesce(stock.grade, '') = coalesce(v_grade, '')
                and coalesce(stock.grading_service, '') = coalesce(v_grading_service, '')
                and coalesce(stock.cert_number, '') = coalesce(v_cert, '')
                and coalesce(stock.gemrate_id, '') = coalesce(nullif(p_gemrate_id, ''), '')
              )
            )
          )
        )
      order by stock.created_at desc, stock.id desc
      limit abs(p_quantity_delta)
      for update skip locked
    ) selected;

    if coalesce(array_length(selected_ids, 1), 0) < abs(p_quantity_delta) then
      raise exception 'insufficient_available_card_stock';
    end if;

    update public.card_stock_units units
    set status = 'archived',
        metadata = coalesce(units.metadata, '{}'::jsonb) || normalized_metadata || jsonb_build_object('archivedByAdminId', p_admin_id),
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
    'stockSkuId', v_stock_sku_id,
    'stock', public.get_card_stock_summary(p_card_id)
  );
end;
$$;

-- (f) public.adjust_stock_sku_units --------------------------------------------
-- Signature UNCHANGED. Read language from p_metadata into v_language and set it
-- on newly inserted units.
create or replace function public.adjust_stock_sku_units(
  p_stock_sku_id uuid,
  p_quantity_delta integer,
  p_admin_id uuid,
  p_source_type text default 'admin_stock_adjusted',
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
  sku_row public.stock_skus%rowtype;
  normalized_condition text;
  inserted_count integer := 0;
  removed_count integer := 0;
  v_language text := nullif(coalesce(p_metadata, '{}'::jsonb) ->> 'language', '');
begin
  if p_stock_sku_id is null then
    raise exception 'stock_sku_required';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then
    raise exception 'invalid_quantity_delta';
  end if;

  select * into sku_row
  from public.stock_skus
  where id = p_stock_sku_id
    and is_active
  for update;

  if sku_row.id is null then
    raise exception 'stock_sku_not_found';
  end if;

  normalized_condition := coalesce(
    nullif(p_condition, ''),
    case when sku_row.unit_kind in ('box', 'pack', 'other') then 'sealed' else 'raw' end
  );
  if normalized_condition not in ('sealed', 'raw', 'graded') then
    raise exception 'invalid_condition';
  end if;

  if p_quantity_delta > 0 then
    if normalized_condition = 'graded' and (nullif(p_grade, '') is null or nullif(p_grading_service, '') is null) then
      raise exception 'graded_stock_identity_required';
    end if;
    if nullif(p_cert_number, '') is not null and p_quantity_delta <> 1 then
      raise exception 'stock_cert_requires_single_unit';
    end if;

    with inserted as (
      insert into public.card_stock_units(
        card_id,
        stock_sku_id,
        status,
        condition,
        grade,
        grading_service,
        cert_number,
        gemrate_id,
        image_url,
        image_storage_path,
        language,
        source_type,
        source_id,
        created_by_admin_id,
        metadata,
        quantity
      )
      select
        sku_row.card_id,
        sku_row.id,
        'available',
        normalized_condition,
        case when normalized_condition = 'graded' then nullif(p_grade, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_grading_service, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_cert_number, '') else null end,
        case when normalized_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
        coalesce(nullif(p_image_url, ''), sku_row.image_url),
        coalesce(nullif(p_image_storage_path, ''), sku_row.image_storage_path),
        v_language,
        coalesce(nullif(p_source_type, ''), 'admin_stock_adjusted'),
        nullif(p_source_id, ''),
        p_admin_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('stockSkuId', sku_row.id),
        1
      from generate_series(1, p_quantity_delta)
      returning id, card_id
    ),
    ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'stock_created', p_admin_id, jsonb_build_object('stockSkuId', sku_row.id, 'sourceType', p_source_type)
      from inserted
      returning 1
    )
    select count(*)::integer into inserted_count
    from inserted;
  else
    with victims as (
      select id
      from public.card_stock_units
      where stock_sku_id = sku_row.id
        and status = 'available'
      order by created_at desc, id desc
      limit abs(p_quantity_delta)
      for update skip locked
    ),
    archived as (
      update public.card_stock_units stock
      set status = 'archived',
          source_type = coalesce(nullif(p_source_type, ''), 'admin_stock_adjusted'),
          source_id = nullif(p_source_id, ''),
          metadata = coalesce(stock.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('stockSkuId', sku_row.id),
          updated_at = now()
      from victims
      where stock.id = victims.id
      returning stock.id, stock.card_id
    ),
    ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select id, card_id, 'archived', p_admin_id, jsonb_build_object('stockSkuId', sku_row.id, 'sourceType', p_source_type)
      from archived
      returning 1
    )
    select count(*)::integer into removed_count
    from archived;

    if removed_count <> abs(p_quantity_delta) then
      raise exception 'not_enough_available_stock_sku_units';
    end if;
  end if;

  return jsonb_build_object(
    'stockSkuId', sku_row.id,
    'quantityDelta', p_quantity_delta,
    'createdUnits', inserted_count,
    'archivedUnits', removed_count
  );
end;
$$;
