-- stock_skus_and_container_conversion
--
-- First-class editable Sub SKUs plus box -> pack conversion rules.
-- cards remains the product/main SKU table; card_stock_units remains physical
-- stock and receives nullable links to the first-class Sub SKU model.

create extension if not exists pgcrypto;

create table if not exists public.stock_skus (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  sku_code text not null,
  label text not null,
  unit_kind text not null default 'other'
    check (unit_kind in ('card', 'pack', 'box', 'other')),
  image_url text,
  image_storage_path text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stock_skus_card_code_unique_idx
  on public.stock_skus(card_id, lower(sku_code))
  where is_active;

create index if not exists stock_skus_card_kind_idx
  on public.stock_skus(card_id, unit_kind)
  where is_active;

create table if not exists public.stock_sku_conversion_rules (
  id uuid primary key default gen_random_uuid(),
  parent_stock_sku_id uuid not null references public.stock_skus(id) on delete restrict,
  child_stock_sku_id uuid not null references public.stock_skus(id) on delete restrict,
  child_quantity integer not null check (child_quantity between 1 and 1000),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_stock_sku_id <> child_stock_sku_id)
);

alter table public.stock_skus enable row level security;
alter table public.stock_sku_conversion_rules enable row level security;

create unique index if not exists stock_sku_conversion_active_unique_idx
  on public.stock_sku_conversion_rules(parent_stock_sku_id, child_stock_sku_id)
  where is_active;

alter table public.card_stock_units
  add column if not exists stock_sku_id uuid,
  add column if not exists parent_stock_unit_id uuid,
  add column if not exists conversion_rule_id uuid,
  add column if not exists converted_at timestamptz;

alter table public.card_stock_units
  drop constraint if exists card_stock_units_stock_sku_id_fkey,
  drop constraint if exists card_stock_units_parent_stock_unit_id_fkey,
  drop constraint if exists card_stock_units_conversion_rule_id_fkey;

alter table public.card_stock_units
  add constraint card_stock_units_stock_sku_id_fkey
    foreign key (stock_sku_id) references public.stock_skus(id) on delete restrict,
  add constraint card_stock_units_parent_stock_unit_id_fkey
    foreign key (parent_stock_unit_id) references public.card_stock_units(id) on delete set null,
  add constraint card_stock_units_conversion_rule_id_fkey
    foreign key (conversion_rule_id) references public.stock_sku_conversion_rules(id) on delete restrict;

create index if not exists card_stock_units_stock_sku_status_idx
  on public.card_stock_units(stock_sku_id, status, created_at)
  where stock_sku_id is not null;

create index if not exists card_stock_units_parent_stock_unit_idx
  on public.card_stock_units(parent_stock_unit_id)
  where parent_stock_unit_id is not null;

create or replace function app_private.stock_sku_code_part(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9._-]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'SKU'
  );
$$;

create or replace function app_private.stock_sku_default_kind(
  p_catalog_category text,
  p_condition text
)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_catalog_category, '')) like '%box%' then 'box'
    when lower(coalesce(p_catalog_category, '')) like '%pack%' then 'pack'
    when coalesce(p_condition, 'raw') in ('raw', 'graded') then 'card'
    else 'other'
  end;
$$;

create or replace function app_private.stock_sku_default_code(
  p_card_code text,
  p_search_code text,
  p_card_id uuid,
  p_condition text,
  p_grade text,
  p_grading_service text,
  p_cert_number text,
  p_gemrate_id text
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
    end
  );
$$;

create or replace function app_private.ensure_default_stock_sku(
  p_card_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null
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
    p_gemrate_id
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
        'gemrateId', coalesce(p_gemrate_id, '')
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

with missing as (
  select
    stock.id,
    app_private.ensure_default_stock_sku(
      stock.card_id,
      coalesce(nullif(stock.condition, ''), 'raw'),
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grade, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grading_service, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.cert_number, '') else null end,
      case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.gemrate_id, '') else null end,
      stock.image_url,
      stock.image_storage_path
    ) as next_stock_sku_id
  from public.card_stock_units stock
  where stock.stock_sku_id is null
)
update public.card_stock_units stock
set stock_sku_id = missing.next_stock_sku_id,
    updated_at = now()
from missing
where stock.id = missing.id
  and missing.next_stock_sku_id is not null;

create or replace function public.upsert_stock_sku(
  p_stock_sku_id uuid default null,
  p_card_id uuid default null,
  p_sku_code text default null,
  p_label text default null,
  p_unit_kind text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_parent_stock_sku_id uuid default null,
  p_child_stock_sku_id uuid default null,
  p_child_quantity integer default null,
  p_admin_id uuid default null,
  p_clear_conversion_rule boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_kind text := nullif(btrim(coalesce(p_unit_kind, '')), '');
  normalized_code text := nullif(btrim(p_sku_code), '');
  normalized_label text := nullif(btrim(p_label), '');
  existing_sku public.stock_skus%rowtype;
  saved_sku public.stock_skus%rowtype;
  child_sku public.stock_skus%rowtype;
  saved_rule public.stock_sku_conversion_rules%rowtype;
  target_kind text;
begin
  if normalized_kind is not null
    and normalized_kind not in ('card', 'pack', 'box', 'other') then
    raise exception 'invalid_stock_sku_kind';
  end if;
  if p_stock_sku_id is null and p_card_id is null then
    raise exception 'card_required';
  end if;
  if p_stock_sku_id is null and (normalized_code is null or normalized_label is null) then
    raise exception 'stock_sku_code_and_label_required';
  end if;

  if p_stock_sku_id is null then
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
      normalized_code,
      normalized_label,
      coalesce(normalized_kind, 'other'),
      nullif(btrim(coalesce(p_image_url, '')), ''),
      nullif(btrim(coalesce(p_image_storage_path, '')), ''),
      jsonb_build_object('createdByAdminId', p_admin_id)
    )
    returning * into saved_sku;
  else
    select * into existing_sku
    from public.stock_skus
    where id = p_stock_sku_id
      and is_active
    for update;

    if existing_sku.id is null then
      raise exception 'stock_sku_not_found';
    end if;

    target_kind := coalesce(normalized_kind, existing_sku.unit_kind);
    if target_kind <> existing_sku.unit_kind and exists (
      select 1
      from public.card_stock_units stock
      where stock.stock_sku_id = existing_sku.id
        and stock.status not in ('deleted', 'archived')
    ) then
      raise exception 'stock_sku_unit_kind_locked';
    end if;

    if target_kind <> 'pack' and exists (
      select 1
      from public.stock_sku_conversion_rules rule
      where rule.child_stock_sku_id = existing_sku.id
        and rule.is_active
    ) then
      raise exception 'child_stock_sku_conversion_in_use';
    end if;

    update public.stock_skus
    set sku_code = coalesce(normalized_code, sku_code),
        label = coalesce(normalized_label, label),
        unit_kind = coalesce(normalized_kind, unit_kind),
        image_url = case when p_image_url is null then image_url else nullif(btrim(p_image_url), '') end,
        image_storage_path = case when p_image_storage_path is null then image_storage_path else nullif(btrim(p_image_storage_path), '') end,
        metadata = metadata || jsonb_build_object('updatedByAdminId', p_admin_id),
        updated_at = now()
    where id = p_stock_sku_id
      and is_active
    returning * into saved_sku;
  end if;

  if saved_sku.id is null then
    raise exception 'stock_sku_not_found';
  end if;

  if p_parent_stock_sku_id is not null and p_parent_stock_sku_id <> saved_sku.id then
    raise exception 'parent_stock_sku_mismatch';
  end if;

  if saved_sku.unit_kind <> 'box' then
    update public.stock_sku_conversion_rules
    set is_active = false,
        updated_at = now()
    where parent_stock_sku_id = saved_sku.id
      and is_active;
  end if;

  if saved_sku.unit_kind = 'box'
    and p_clear_conversion_rule
    and p_child_stock_sku_id is null then
    update public.stock_sku_conversion_rules
    set is_active = false,
        updated_at = now()
    where parent_stock_sku_id = saved_sku.id
      and is_active;
  end if;

  if saved_sku.unit_kind = 'box' and p_child_stock_sku_id is not null then
    if p_child_quantity is null or p_child_quantity < 1 or p_child_quantity > 1000 then
      raise exception 'invalid_child_quantity';
    end if;

    select * into child_sku
    from public.stock_skus
    where id = p_child_stock_sku_id
      and is_active
    for update;

    if child_sku.id is null then
      raise exception 'child_stock_sku_not_found';
    end if;
    if child_sku.card_id <> saved_sku.card_id then
      raise exception 'conversion_cross_card_not_allowed';
    end if;
    if child_sku.unit_kind <> 'pack' then
      raise exception 'child_stock_sku_must_be_pack';
    end if;

    update public.stock_sku_conversion_rules
    set is_active = false,
        updated_at = now()
    where parent_stock_sku_id = saved_sku.id
      and is_active
      and child_stock_sku_id <> p_child_stock_sku_id;

    insert into public.stock_sku_conversion_rules(
      parent_stock_sku_id,
      child_stock_sku_id,
      child_quantity,
      metadata
    )
    values (
      saved_sku.id,
      p_child_stock_sku_id,
      p_child_quantity,
      jsonb_build_object('updatedByAdminId', p_admin_id)
    )
    on conflict (parent_stock_sku_id, child_stock_sku_id)
    where is_active
    do update set
      child_quantity = excluded.child_quantity,
      metadata = public.stock_sku_conversion_rules.metadata || excluded.metadata,
      updated_at = now()
    returning * into saved_rule;
  end if;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id,
    'stock_sku_saved',
    jsonb_build_object(
      'stockSkuId', saved_sku.id,
      'cardId', saved_sku.card_id,
      'sku', saved_sku.sku_code,
      'unitKind', saved_sku.unit_kind,
      'conversionRuleId', saved_rule.id,
      'childStockSkuId', saved_rule.child_stock_sku_id,
      'childQuantity', saved_rule.child_quantity
    )
  );

  return jsonb_build_object(
    'stockSkuId', saved_sku.id,
    'sku', saved_sku.sku_code,
    'label', saved_sku.label,
    'unitKind', saved_sku.unit_kind,
    'imageUrl', saved_sku.image_url,
    'imageStoragePath', saved_sku.image_storage_path,
    'conversionRuleId', saved_rule.id,
    'childStockSkuId', saved_rule.child_stock_sku_id,
    'childQuantity', saved_rule.child_quantity
  );
end;
$$;

create or replace function public.get_admin_stock_sku_summary(
  p_card_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with stock_counts as (
    select
      stock.stock_sku_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      count(*) filter (where stock.status = 'archived')::integer as archived_units,
      (array_remove(array_agg(nullif(stock.image_url, '') order by stock.created_at asc, stock.id asc), null))[1] as sample_unit_image_url
    from public.card_stock_units stock
    where stock.stock_sku_id is not null
      and stock.status <> 'deleted'
    group by stock.stock_sku_id
  ),
  active_rules as (
    select distinct on (rule.parent_stock_sku_id)
      rule.parent_stock_sku_id,
      rule.id as conversion_rule_id,
      rule.child_stock_sku_id,
      child.sku_code as child_sku,
      child.label as child_label,
      rule.child_quantity
    from public.stock_sku_conversion_rules rule
    join public.stock_skus child on child.id = rule.child_stock_sku_id
    where rule.is_active
    order by rule.parent_stock_sku_id, rule.created_at desc, rule.id desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stockSkuId', sku.id,
        'cardId', sku.card_id,
        'sku', sku.sku_code,
        'label', sku.label,
        'unitKind', sku.unit_kind,
        'imageUrl', sku.image_url,
        'imageStoragePath', sku.image_storage_path,
        'sampleUnitImageUrl', stock_counts.sample_unit_image_url,
        'totalUnits', coalesce(stock_counts.total_units, 0),
        'availableUnits', coalesce(stock_counts.available_units, 0),
        'reservedUnits', coalesce(stock_counts.reserved_units, 0),
        'allocatedUnits', coalesce(stock_counts.allocated_units, 0),
        'archivedUnits', coalesce(stock_counts.archived_units, 0),
        'packEquivalent', case
          when sku.unit_kind = 'pack' then coalesce(stock_counts.total_units, 0)
          when sku.unit_kind = 'box' and active_rules.child_quantity is not null then coalesce(stock_counts.total_units, 0) * active_rules.child_quantity
          else null
        end,
        'availablePackEquivalent', case
          when sku.unit_kind = 'pack' then coalesce(stock_counts.available_units, 0)
          when sku.unit_kind = 'box' and active_rules.child_quantity is not null then coalesce(stock_counts.available_units, 0) * active_rules.child_quantity
          else null
        end,
        'conversionRuleId', active_rules.conversion_rule_id,
        'childStockSkuId', active_rules.child_stock_sku_id,
        'childSku', active_rules.child_sku,
        'childLabel', active_rules.child_label,
        'childQuantity', active_rules.child_quantity
      )
      order by sku.card_id, sku.unit_kind, sku.sku_code
    ),
    '[]'::jsonb
  )
  from public.stock_skus sku
  left join stock_counts on stock_counts.stock_sku_id = sku.id
  left join active_rules on active_rules.parent_stock_sku_id = sku.id
  where sku.is_active
    and (p_card_id is null or sku.card_id = p_card_id);
$$;

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
  stock_sku_counts as (
    select
      stock.card_id,
      stock.stock_sku_id,
      count(*) filter (where stock.status <> 'deleted')::integer as total_units,
      count(*) filter (where stock.status = 'available')::integer as available_units,
      count(*) filter (where stock.status = 'reserved')::integer as reserved_units,
      count(*) filter (where stock.status = 'allocated')::integer as allocated_units,
      (array_remove(array_agg(nullif(stock.image_url, '') order by stock.created_at asc, stock.id asc), null))[1] as sample_unit_image_url,
      (array_agg(coalesce(nullif(stock.condition, ''), 'raw') order by stock.created_at asc, stock.id asc))[1] as legacy_condition,
      (array_remove(array_agg(
        case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grade, '') else null end
        order by stock.created_at asc, stock.id asc
      ), null))[1] as legacy_grade,
      (array_remove(array_agg(
        case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.grading_service, '') else null end
        order by stock.created_at asc, stock.id asc
      ), null))[1] as legacy_grading_service,
      (array_remove(array_agg(
        case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.cert_number, '') else null end
        order by stock.created_at asc, stock.id asc
      ), null))[1] as legacy_cert_number,
      (array_remove(array_agg(
        case when coalesce(nullif(stock.condition, ''), 'raw') = 'graded' then nullif(stock.gemrate_id, '') else null end
        order by stock.created_at asc, stock.id asc
      ), null))[1] as legacy_gemrate_id
    from public.card_stock_units stock
    join requested_cards requested on requested.card_id = stock.card_id
    where stock.stock_sku_id is not null
      and stock.status not in ('deleted', 'archived')
    group by stock.card_id, stock.stock_sku_id
  ),
  legacy_normalized_subsku as (
    select
      stock.id,
      stock.card_id,
      stock.stock_sku_id,
      sku.unit_kind as stock_unit_kind,
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
    left join public.stock_skus sku on sku.id = stock.stock_sku_id
    where stock.status not in ('deleted', 'archived')
      and coalesce(sku.unit_kind, '') <> 'box'
  ),
  legacy_subsku_counts as (
    select
      normalized.card_id,
      (array_remove(array_agg(normalized.stock_sku_id order by normalized.created_at asc, normalized.id asc), null))[1] as stock_sku_id,
      normalized.condition,
      normalized.grade,
      normalized.grading_service,
      normalized.cert_number,
      normalized.gemrate_id,
      (array_remove(array_agg(normalized.image_url order by normalized.created_at asc, normalized.id asc), null))[1] as sample_unit_image_url,
      count(*)::integer as total_units,
      count(*) filter (where normalized.status = 'available')::integer as available_units,
      count(*) filter (where normalized.status = 'reserved')::integer as reserved_units,
      count(*) filter (where normalized.status = 'allocated')::integer as allocated_units
    from legacy_normalized_subsku normalized
    group by
      normalized.card_id,
      normalized.condition,
      normalized.grade,
      normalized.grading_service,
      normalized.cert_number,
      normalized.gemrate_id
  ),
  active_rules as (
    select distinct on (rule.parent_stock_sku_id)
      rule.parent_stock_sku_id,
      rule.id as conversion_rule_id,
      rule.child_stock_sku_id,
      child.sku_code as child_sku,
      child.label as child_label,
      rule.child_quantity
    from public.stock_sku_conversion_rules rule
    join public.stock_skus child on child.id = rule.child_stock_sku_id
    where rule.is_active
    order by rule.parent_stock_sku_id, rule.created_at desc, rule.id desc
  ),
  first_class_subsku_rows as (
    select
        jsonb_build_object(
          'cardId', sku.card_id,
          'stockSkuId', sku.id,
          'stockUnitGroupKey', concat('stock-sku:', sku.id::text),
          'legacyStockUnitGroupKey', case
            when coalesce(stock_sku_counts.legacy_condition, nullif(sku.metadata -> 'backfillIdentity' ->> 'condition', '')) is not null then concat_ws(
              chr(31),
              coalesce(stock_sku_counts.legacy_condition, nullif(sku.metadata -> 'backfillIdentity' ->> 'condition', '')),
              coalesce(stock_sku_counts.legacy_grade, nullif(sku.metadata -> 'backfillIdentity' ->> 'grade', ''), ''),
              coalesce(stock_sku_counts.legacy_grading_service, nullif(sku.metadata -> 'backfillIdentity' ->> 'gradingService', ''), ''),
              coalesce(stock_sku_counts.legacy_cert_number, nullif(sku.metadata -> 'backfillIdentity' ->> 'certNumber', ''), ''),
              coalesce(stock_sku_counts.legacy_gemrate_id, nullif(sku.metadata -> 'backfillIdentity' ->> 'gemrateId', ''), '')
            )
          end,
          'sku', sku.sku_code,
          'label', sku.label,
          'unitKind', sku.unit_kind,
          'condition', coalesce(stock_sku_counts.legacy_condition, nullif(sku.metadata -> 'backfillIdentity' ->> 'condition', '')),
          'grade', coalesce(stock_sku_counts.legacy_grade, nullif(sku.metadata -> 'backfillIdentity' ->> 'grade', '')),
          'gradingService', coalesce(stock_sku_counts.legacy_grading_service, nullif(sku.metadata -> 'backfillIdentity' ->> 'gradingService', '')),
          'certNumber', coalesce(stock_sku_counts.legacy_cert_number, nullif(sku.metadata -> 'backfillIdentity' ->> 'certNumber', '')),
          'gemrateId', coalesce(stock_sku_counts.legacy_gemrate_id, nullif(sku.metadata -> 'backfillIdentity' ->> 'gemrateId', '')),
          'imageUrl', coalesce(nullif(sku.image_url, ''), stock_sku_counts.sample_unit_image_url),
          'imageStoragePath', sku.image_storage_path,
          'totalUnits', coalesce(stock_sku_counts.total_units, 0),
          'availableUnits', coalesce(stock_sku_counts.available_units, 0),
          'reservedUnits', coalesce(stock_sku_counts.reserved_units, 0),
          'allocatedUnits', coalesce(stock_sku_counts.allocated_units, 0),
          'packEquivalent', case
            when sku.unit_kind = 'pack' then coalesce(stock_sku_counts.total_units, 0)
            when sku.unit_kind = 'box' and active_rules.child_quantity is not null then coalesce(stock_sku_counts.total_units, 0) * active_rules.child_quantity
            else null
          end,
          'availablePackEquivalent', case
            when sku.unit_kind = 'pack' then coalesce(stock_sku_counts.available_units, 0)
            when sku.unit_kind = 'box' and active_rules.child_quantity is not null then coalesce(stock_sku_counts.available_units, 0) * active_rules.child_quantity
            else null
          end,
          'conversionRuleId', active_rules.conversion_rule_id,
          'childStockSkuId', active_rules.child_stock_sku_id,
          'childSku', active_rules.child_sku,
          'childLabel', active_rules.child_label,
          'childQuantity', active_rules.child_quantity
        ) as row_payload
    from public.stock_skus sku
    join requested_cards requested on requested.card_id = sku.card_id
    left join stock_sku_counts on stock_sku_counts.stock_sku_id = sku.id
    left join active_rules on active_rules.parent_stock_sku_id = sku.id
    where sku.is_active
  ),
  legacy_subsku_rows as (
    select
      jsonb_build_object(
        'cardId', legacy.card_id,
        'stockSkuId', null::uuid,
        'sourceStockSkuId', legacy.stock_sku_id,
        'stockUnitGroupKey', concat_ws(
          chr(31),
          legacy.condition,
          coalesce(legacy.grade, ''),
          coalesce(legacy.grading_service, ''),
          coalesce(legacy.cert_number, ''),
          coalesce(legacy.gemrate_id, '')
        ),
        'legacyStockUnitGroupKey', true,
        'sku', sku.sku_code,
        'label', case
          when legacy.condition = 'graded' then concat_ws(' - ', upper(coalesce(legacy.grading_service, 'graded')), legacy.grade, case when legacy.cert_number is not null then '#' || legacy.cert_number end)
          when legacy.condition = 'sealed' then 'Sealed'
          else 'Raw'
        end,
        'unitKind', coalesce(sku.unit_kind, case when legacy.condition = 'sealed' then 'other' else 'card' end),
        'imageUrl', coalesce(nullif(sku.image_url, ''), legacy.sample_unit_image_url),
        'imageStoragePath', sku.image_storage_path,
        'totalUnits', legacy.total_units,
        'availableUnits', legacy.available_units,
        'reservedUnits', legacy.reserved_units,
        'allocatedUnits', legacy.allocated_units,
        'packEquivalent', case
          when sku.unit_kind = 'pack' then legacy.total_units
          when sku.unit_kind = 'box' and active_rules.child_quantity is not null then legacy.total_units * active_rules.child_quantity
          else null
        end,
        'availablePackEquivalent', case
          when sku.unit_kind = 'pack' then legacy.available_units
          when sku.unit_kind = 'box' and active_rules.child_quantity is not null then legacy.available_units * active_rules.child_quantity
          else null
        end,
        'conversionRuleId', active_rules.conversion_rule_id,
        'childStockSkuId', active_rules.child_stock_sku_id,
        'childSku', active_rules.child_sku,
        'childLabel', active_rules.child_label,
        'childQuantity', active_rules.child_quantity
      ) as row_payload
    from legacy_subsku_counts legacy
    left join public.stock_skus sku on sku.id = legacy.stock_sku_id
    left join active_rules on active_rules.parent_stock_sku_id = sku.id
  ),
  combined_subsku_rows as (
    select row_payload from first_class_subsku_rows
    union all
    select row_payload from legacy_subsku_rows
  ),
  subsku_summaries as (
    select coalesce(
      jsonb_agg(
        row_payload
        order by row_payload ->> 'cardId', row_payload ->> 'stockUnitGroupKey'
      ),
      '[]'::jsonb
    ) as rows
    from combined_subsku_rows
  )
  select jsonb_build_object(
    'stockSummaries', coalesce((select rows from stock_summaries), '[]'::jsonb),
    'subSkuSummaries', coalesce((select rows from subsku_summaries), '[]'::jsonb)
  );
$$;

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
      p_image_storage_path
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

create or replace function public.open_stock_container(
  p_parent_stock_sku_id uuid,
  p_quantity integer,
  p_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  rule_row public.stock_sku_conversion_rules%rowtype;
  parent_sku public.stock_skus%rowtype;
  child_sku public.stock_skus%rowtype;
  parent_unit record;
  opened_count integer := 0;
  child_count integer := 0;
  children_for_parent integer := 0;
  child_condition text;
begin
  if p_parent_stock_sku_id is null then
    raise exception 'parent_stock_sku_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'invalid_open_quantity';
  end if;

  select * into rule_row
  from public.stock_sku_conversion_rules
  where parent_stock_sku_id = p_parent_stock_sku_id
    and is_active
  order by created_at desc, id desc
  limit 1;

  if rule_row.id is null then
    raise exception 'conversion_rule_required';
  end if;

  select * into parent_sku
  from public.stock_skus
  where id = rule_row.parent_stock_sku_id
    and is_active
  for update;

  select * into child_sku
  from public.stock_skus
  where id = rule_row.child_stock_sku_id
    and is_active
  for update;

  if parent_sku.id is null or child_sku.id is null then
    raise exception 'stock_sku_not_found';
  end if;
  if parent_sku.card_id <> child_sku.card_id then
    raise exception 'conversion_cross_card_not_allowed';
  end if;
  if parent_sku.unit_kind <> 'box' or child_sku.unit_kind <> 'pack' then
    raise exception 'invalid_conversion_rule_unit_kind';
  end if;

  child_condition := case when child_sku.unit_kind in ('pack', 'box', 'other') then 'sealed' else 'raw' end;

  for parent_unit in
    select *
    from public.card_stock_units
    where stock_sku_id = parent_sku.id
      and status = 'available'
    order by created_at asc, id asc
    limit p_quantity
    for update skip locked
  loop
    opened_count := opened_count + 1;

    update public.card_stock_units
    set status = 'archived',
        source_type = 'container_opened',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'openedByAdminId', p_admin_id,
          'conversionRuleId', rule_row.id,
          'parentStockSkuId', parent_sku.id,
          'childStockSkuId', child_sku.id,
          'childQuantity', rule_row.child_quantity,
          'note', p_note
        ),
        converted_at = now(),
        updated_at = now()
    where id = parent_unit.id;

    insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
    values (
      parent_unit.id,
      parent_unit.card_id,
      'archived',
      p_admin_id,
      jsonb_build_object(
        'sourceType', 'container_opened',
        'parentStockSkuId', parent_sku.id,
        'childStockSkuId', child_sku.id,
        'childQuantity', rule_row.child_quantity,
        'note', p_note
      )
    );

    with child_units as (
      insert into public.card_stock_units(
        card_id,
        stock_sku_id,
        parent_stock_unit_id,
        conversion_rule_id,
        status,
        condition,
        source_type,
        source_id,
        created_by_admin_id,
        image_url,
        image_storage_path,
        metadata,
        quantity
      )
      select
        child_sku.card_id,
        child_sku.id,
        parent_unit.id,
        rule_row.id,
        'available',
        child_condition,
        'container_child_created',
        parent_unit.id::text,
        p_admin_id,
        child_sku.image_url,
        child_sku.image_storage_path,
        jsonb_build_object(
          'createdByOpeningStockUnitId', parent_unit.id,
          'openedByAdminId', p_admin_id,
          'parentStockSkuId', parent_sku.id,
          'childStockSkuId', child_sku.id,
          'conversionRuleId', rule_row.id
        ),
        1
      from generate_series(1, rule_row.child_quantity)
      returning id, card_id
    ),
    child_ledger as (
      insert into public.card_stock_ledger(stock_unit_id, card_id, event_type, actor_admin_id, metadata)
      select
        id,
        card_id,
        'stock_created',
        p_admin_id,
        jsonb_build_object(
          'sourceType', 'container_child_created',
          'parentStockUnitId', parent_unit.id,
          'parentStockSkuId', parent_sku.id,
          'childStockSkuId', child_sku.id,
          'conversionRuleId', rule_row.id
        )
      from child_units
      returning 1
    )
    select count(*)::integer into children_for_parent
    from child_units;

    if children_for_parent <> rule_row.child_quantity then
      raise exception 'container_child_creation_mismatch';
    end if;

    child_count := child_count + children_for_parent;
  end loop;

  if opened_count <> p_quantity then
    raise exception 'not_enough_available_container_stock';
  end if;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id,
    'stock_container_opened',
    jsonb_build_object(
      'parentStockSkuId', parent_sku.id,
      'childStockSkuId', child_sku.id,
      'conversionRuleId', rule_row.id,
      'openedContainers', opened_count,
      'createdChildUnits', child_count,
      'childQuantity', rule_row.child_quantity,
      'note', p_note
    )
  );

  return jsonb_build_object(
    'parentStockSkuId', parent_sku.id,
    'childStockSkuId', child_sku.id,
    'conversionRuleId', rule_row.id,
    'openedContainers', opened_count,
    'createdChildUnits', child_count,
    'childQuantity', rule_row.child_quantity
  );
end;
$$;

drop function if exists public.edit_card_stock_unit(
  uuid, uuid, text, text, text, text, text, text, text
);

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
      v_image_storage_path
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

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.restore_awarded_pack_stock(jsonb,uuid,text,uuid)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'restore_awarded_pack_stock_not_found';
  end if;

  fn := replace(
    fn,
$snippet$    insert into public.card_stock_units(
      card_id,
      status,$snippet$,
$snippet$    insert into public.card_stock_units(
      card_id,
      stock_sku_id,
      status,$snippet$
  );

  fn := replace(
    fn,
$snippet$      source_unit.card_id,
      'available',$snippet$,
$snippet$      source_unit.card_id,
      source_unit.stock_sku_id,
      'available',$snippet$
  );

  fn := replace(
    fn,
$snippet$        ),
        'uniqueIdentifiersCopied', false
      ),$snippet$,
$snippet$        ),
        'uniqueIdentifiersCopied', false,
        'stockSkuId', source_unit.stock_sku_id
      ),$snippet$
  );

  if fn not like '%stock_sku_id,%'
    or fn not like '%source_unit.stock_sku_id%'
    or fn not like '%''stockSkuId'', source_unit.stock_sku_id%' then
    raise exception 'restore_awarded_pack_stock_stock_sku_patch_failed';
  end if;

  execute fn;
end;
$migration$;

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
  stock_sku_text text;
  expected_stock_sku_id uuid;
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

  stock_sku_text := nullif(p_prize_metadata ->> 'stockSkuId', '');
  if stock_sku_text is not null then
    if stock_sku_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    expected_stock_sku_id := stock_sku_text::uuid;
    return p_unit.stock_sku_id = expected_stock_sku_id;
  end if;

  group_key := coalesce(p_prize_metadata ->> 'stockUnitGroupKey', '');
  if group_key like 'stock-sku:%' then
    stock_sku_text := substring(group_key from 11);
    if stock_sku_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    expected_stock_sku_id := stock_sku_text::uuid;
    return p_unit.stock_sku_id = expected_stock_sku_id;
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
    return coalesce(nullif(p_unit.condition, ''), 'raw') = filter_condition
      and (
        filter_condition <> 'sealed'
        or p_unit.stock_sku_id is null
        or exists (
          select 1
          from public.stock_skus sku
          where sku.id = p_unit.stock_sku_id
            and sku.unit_kind <> 'box'
        )
      );
  end if;

  return coalesce(nullif(p_unit.condition, ''), 'raw') = filter_condition
    and coalesce(p_unit.grade, '') = expected_grade
    and coalesce(p_unit.grading_service, '') = expected_grading_service
    and coalesce(p_unit.cert_number, '') = expected_cert_number
    and coalesce(p_unit.gemrate_id, '') = expected_gemrate_id;
end;
$$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.edit_live_campaign_inventory(uuid,uuid,jsonb)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'edit_live_campaign_inventory_not_found';
  end if;

  fn := replace(
    fn,
$snippet$          desired.card_id <> existing.card_id
          or coalesce(desired.metadata ->> 'stockUnitGroupKey', '')
             <> coalesce(existing.metadata ->> 'stockUnitGroupKey', '')
          or coalesce(desired.metadata -> 'stockUnitFilter', '{}'::jsonb)
             <> coalesce(existing.metadata -> 'stockUnitFilter', '{}'::jsonb);$snippet$,
$snippet$          desired.card_id <> existing.card_id
          or coalesce(desired.metadata ->> 'stockSkuId', '')
             <> coalesce(existing.metadata ->> 'stockSkuId', '')
          or coalesce(desired.metadata ->> 'stockUnitGroupKey', '')
             <> coalesce(existing.metadata ->> 'stockUnitGroupKey', '')
          or coalesce(desired.metadata -> 'stockUnitFilter', '{}'::jsonb)
             <> coalesce(existing.metadata -> 'stockUnitFilter', '{}'::jsonb);$snippet$
  );

  if fn not like '%desired.metadata ->> ''stockSkuId''%' then
    raise exception 'edit_live_campaign_inventory_stock_sku_patch_failed';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public._materialize_live_prize_units(uuid,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception '_materialize_live_prize_units_not_found';
  end if;

  fn := replace(
    fn,
$snippet$        'liveEdited', true,
        'stockSku', p_metadata ->> 'stockSku',
        'stockUnitGroupKey', p_metadata ->> 'stockUnitGroupKey',$snippet$,
$snippet$        'liveEdited', true,
        'stockSkuId', p_metadata ->> 'stockSkuId',
        'stockSku', p_metadata ->> 'stockSku',
        'stockUnitGroupKey', p_metadata ->> 'stockUnitGroupKey',$snippet$
  );

  if fn not like '%''stockSkuId'', p_metadata ->> ''stockSkuId''%' then
    raise exception '_materialize_live_prize_units_stock_sku_patch_failed';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.publish_live_campaign_revision(uuid,uuid,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'publish_live_campaign_revision_not_found';
  end if;
  if fn not like '%revision.prize_snapshot%' then
    raise exception 'publish_live_campaign_revision_prize_snapshot_missing';
  end if;
  -- publish_live_campaign_revision preserves stockSkuId by forwarding the full
  -- prize_snapshot JSON array into edit_live_campaign_inventory.
end;
$migration$;

revoke all on table public.stock_skus from public, anon, authenticated;
revoke all on table public.stock_sku_conversion_rules from public, anon, authenticated;
grant all on table public.stock_skus to service_role;
grant all on table public.stock_sku_conversion_rules to service_role;

revoke all on function public.upsert_stock_sku(uuid, uuid, text, text, text, text, text, uuid, uuid, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_admin_stock_sku_summary(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_prize_stock_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.adjust_stock_sku_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.adjust_card_stock_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.open_stock_container(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.edit_card_stock_unit(uuid, uuid, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.card_stock_unit_matches_prize_filter(public.card_stock_units, jsonb) from public, anon, authenticated;
revoke all on function app_private.ensure_default_stock_sku(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.upsert_stock_sku(uuid, uuid, text, text, text, text, text, uuid, uuid, integer, uuid, boolean) to service_role;
grant execute on function public.get_admin_stock_sku_summary(uuid) to service_role;
grant execute on function public.get_admin_prize_stock_summaries(uuid[]) to service_role;
grant execute on function public.adjust_stock_sku_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) to service_role;
grant execute on function public.adjust_card_stock_units(uuid, integer, uuid, text, text, jsonb, text, text, text, text, text, text, text) to service_role;
grant execute on function public.open_stock_container(uuid, integer, uuid, text) to service_role;
grant execute on function public.edit_card_stock_unit(uuid, uuid, text, text, text, text, text, text, text, uuid) to service_role;
grant execute on function public.card_stock_unit_matches_prize_filter(public.card_stock_units, jsonb) to service_role;
grant execute on function app_private.ensure_default_stock_sku(uuid, text, text, text, text, text, text, text) to service_role;
