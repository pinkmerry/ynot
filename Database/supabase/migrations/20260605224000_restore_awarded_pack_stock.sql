-- restore_awarded_pack_stock
--
-- Guarded operator path for replenishing physical stock after an intentionally
-- opened/sold-out pack consumed real stock. This does not release, delete, or
-- mutate the awarded customer rows. It creates replacement available stock
-- units from the consumed units' non-unique identity and image, while keeping
-- cert/GemRate values metadata-only so active slab identifiers are not cloned.

create unique index if not exists card_stock_units_production_stock_restore_source_key
  on public.card_stock_units(source_type, source_id)
  where source_type = 'production_stock_restore'
    and source_id is not null
    and status <> 'deleted';

create unique index if not exists card_stock_ledger_production_restore_stock_created_key
  on public.card_stock_ledger(stock_unit_id)
  where event_type = 'stock_created'
    and metadata ->> 'sourceType' = 'production_stock_restore';

create or replace function public.restore_awarded_pack_stock(
  p_sources jsonb,
  p_admin_id uuid,
  p_reason text default 'production_stock_restore',
  p_run_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_active boolean;
  v_requested integer := 0;
  v_inserted integer := 0;
  v_replacement_total integer := 0;
  v_ledgered integer := 0;
  v_audited integer := 0;
begin
  if p_admin_id is null then
    raise exception 'active_admin_required';
  end if;
  select exists (
    select 1
    from public.admin_users admin
    where admin.id = p_admin_id
      and admin.is_active
  ) into v_admin_active;
  if not v_admin_active then
    raise exception 'active_admin_required';
  end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception 'restore_sources_required';
  end if;

  create temporary table _restore_sources on commit drop as
  select distinct on ((source."sourceStockUnitId")::uuid)
    (source."sourceStockUnitId")::uuid as source_stock_unit_id,
    nullif(source."sourceKind", '') as source_kind,
    nullif(source."sourceCampaignSlug", '') as source_campaign_slug,
    nullif(source."sourceDrawRoundId", '')::uuid as source_draw_round_id,
    nullif(source."sourceDrawRoundPrizeUnitId", '')::uuid as source_draw_round_prize_unit_id,
    nullif(source."sourceDrawRoundPrizeId", '')::uuid as source_draw_round_prize_id,
    nullif(source."sourceCollectionItemId", '')::uuid as source_collection_item_id,
    nullif(source."sourceGachaOpenId", '')::uuid as source_gacha_open_id,
    nullif(source."sourceGachaOpenItemId", '')::uuid as source_gacha_open_item_id
  from jsonb_to_recordset(p_sources) as source(
    "sourceStockUnitId" text,
    "sourceKind" text,
    "sourceCampaignSlug" text,
    "sourceDrawRoundId" text,
    "sourceDrawRoundPrizeUnitId" text,
    "sourceDrawRoundPrizeId" text,
    "sourceCollectionItemId" text,
    "sourceGachaOpenId" text,
    "sourceGachaOpenItemId" text
  )
  where nullif(source."sourceStockUnitId", '') is not null
  order by (source."sourceStockUnitId")::uuid;

  select count(*)::integer into v_requested from _restore_sources;
  if v_requested <= 0 then
    raise exception 'restore_sources_required';
  end if;
  if v_requested > 1000 then
    raise exception 'restore_source_limit_exceeded';
  end if;

  if exists (
    select 1
    from _restore_sources sources
    left join public.card_stock_units stock
      on stock.id = sources.source_stock_unit_id
    where stock.id is null
  ) then
    raise exception 'source_stock_unit_missing';
  end if;

  if exists (
    select 1
    from _restore_sources sources
    join public.card_stock_units stock
      on stock.id = sources.source_stock_unit_id
    where stock.status <> 'allocated'
  ) then
    raise exception 'source_stock_not_consumed';
  end if;

  create temporary table _eligible_restore_sources on commit drop as
  with normal_awards as (
    select distinct on (sources.source_stock_unit_id)
      sources.source_stock_unit_id,
      coalesce(sources.source_kind, 'normal_prize') as source_kind,
      coalesce(sources.source_campaign_slug, round.slug) as source_campaign_slug,
      coalesce(sources.source_draw_round_id, prize_unit.draw_round_id) as source_draw_round_id,
      coalesce(sources.source_draw_round_prize_unit_id, prize_unit.id) as source_draw_round_prize_unit_id,
      coalesce(sources.source_draw_round_prize_id, prize_unit.draw_round_prize_id) as source_draw_round_prize_id,
      coalesce(sources.source_collection_item_id, prize_unit.collection_item_id) as source_collection_item_id,
      coalesce(sources.source_gacha_open_id, prize_unit.gacha_open_id) as source_gacha_open_id,
      coalesce(sources.source_gacha_open_item_id, prize_unit.gacha_open_item_id) as source_gacha_open_item_id
    from _restore_sources sources
    join public.card_stock_units stock
      on stock.id = sources.source_stock_unit_id
     and stock.status = 'allocated'
    join public.draw_round_prize_units prize_unit
      on prize_unit.card_stock_unit_id = sources.source_stock_unit_id
     and prize_unit.status = 'awarded'
    join public.draw_rounds round
      on round.id = prize_unit.draw_round_id
    where (sources.source_kind is null or sources.source_kind = 'normal_prize')
      and (sources.source_draw_round_id is null or sources.source_draw_round_id = prize_unit.draw_round_id)
      and (
        sources.source_draw_round_prize_unit_id is null
        or sources.source_draw_round_prize_unit_id = prize_unit.id
      )
      and (
        sources.source_draw_round_prize_id is null
        or sources.source_draw_round_prize_id = prize_unit.draw_round_prize_id
      )
      and (
        sources.source_collection_item_id is null
        or sources.source_collection_item_id = prize_unit.collection_item_id
      )
      and (
        sources.source_gacha_open_id is null
        or sources.source_gacha_open_id = prize_unit.gacha_open_id
      )
      and (
        sources.source_gacha_open_item_id is null
        or sources.source_gacha_open_item_id = prize_unit.gacha_open_item_id
      )
    order by sources.source_stock_unit_id, prize_unit.awarded_at nulls last, prize_unit.id
  ),
  last_prize_awards as (
    select distinct on (sources.source_stock_unit_id)
      sources.source_stock_unit_id,
      coalesce(sources.source_kind, 'last_prize') as source_kind,
      coalesce(sources.source_campaign_slug, round.slug) as source_campaign_slug,
      coalesce(sources.source_draw_round_id, round.id) as source_draw_round_id,
      null::uuid as source_draw_round_prize_unit_id,
      null::uuid as source_draw_round_prize_id,
      coalesce(sources.source_collection_item_id, round.last_prize_collection_item_id) as source_collection_item_id,
      coalesce(sources.source_gacha_open_id, round.last_prize_awarded_open_id) as source_gacha_open_id,
      coalesce(
        sources.source_gacha_open_item_id,
        app_private.uuid_from_text(stock.metadata #>> '{lastPrizeAward,gachaOpenItemId}')
      ) as source_gacha_open_item_id
    from _restore_sources sources
    join public.card_stock_units stock
      on stock.id = sources.source_stock_unit_id
     and stock.status = 'allocated'
    join public.draw_rounds round
      on round.last_prize_stock_unit_id = sources.source_stock_unit_id
     and round.last_prize_awarded_at is not null
    where (sources.source_kind is null or sources.source_kind = 'last_prize')
      and (sources.source_draw_round_id is null or sources.source_draw_round_id = round.id)
      and sources.source_draw_round_prize_unit_id is null
      and sources.source_draw_round_prize_id is null
      and (
        sources.source_collection_item_id is null
        or sources.source_collection_item_id = round.last_prize_collection_item_id
      )
      and (
        sources.source_gacha_open_id is null
        or sources.source_gacha_open_id = round.last_prize_awarded_open_id
      )
      and (
        sources.source_gacha_open_item_id is null
        or sources.source_gacha_open_item_id = app_private.uuid_from_text(stock.metadata #>> '{lastPrizeAward,gachaOpenItemId}')
      )
    order by sources.source_stock_unit_id, round.last_prize_awarded_at nulls last, round.id
  )
  select distinct on (eligible.source_stock_unit_id) *
  from (
    select * from normal_awards
    union all
    select * from last_prize_awards
  ) eligible
  order by eligible.source_stock_unit_id, case when eligible.source_kind = 'last_prize' then 0 else 1 end;

  if exists (
    select 1
    from _restore_sources sources
    left join _eligible_restore_sources eligible
      on eligible.source_stock_unit_id = sources.source_stock_unit_id
    where eligible.source_stock_unit_id is null
  ) then
    raise exception 'restore_source_not_awarded';
  end if;

  create temporary table _inserted_restore_units on commit drop as
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
      source_unit.card_id,
      'available',
      'production_stock_restore',
      source_unit.id::text,
      p_admin_id,
      jsonb_build_object(
        'reason', coalesce(nullif(p_reason, ''), 'production_stock_restore'),
        'restoreRunId', p_run_id,
        'restoredAt', now(),
        'restoredFrom', jsonb_build_object(
          'sourceKind', sources.source_kind,
          'sourceStockUnitId', source_unit.id,
          'sourceStockStatus', source_unit.status,
          'sourceDrawRoundId', sources.source_draw_round_id,
          'sourceCampaignSlug', sources.source_campaign_slug,
          'sourceDrawRoundPrizeUnitId', sources.source_draw_round_prize_unit_id,
          'sourceDrawRoundPrizeId', sources.source_draw_round_prize_id,
          'sourceCollectionItemId', sources.source_collection_item_id,
          'sourceGachaOpenId', sources.source_gacha_open_id,
          'sourceGachaOpenItemId', sources.source_gacha_open_item_id,
          'originalSourceType', source_unit.source_type,
          'originalSourceId', source_unit.source_id,
          'originalCondition', source_unit.condition,
          'originalGrade', source_unit.grade,
          'originalGradingService', source_unit.grading_service,
          'originalCertNumber', source_unit.cert_number,
          'originalGemrateId', source_unit.gemrate_id
        ),
        'uniqueIdentifiersCopied', false
      ),
      coalesce(nullif(source_unit.condition, ''), 'raw'),
      case when coalesce(nullif(source_unit.condition, ''), 'raw') = 'graded'
        then nullif(source_unit.grade, '')
        else null
      end,
      case when coalesce(nullif(source_unit.condition, ''), 'raw') = 'graded'
        then nullif(source_unit.grading_service, '')
        else null
      end,
      null,
      null,
      nullif(source_unit.image_url, ''),
      nullif(source_unit.image_storage_path, ''),
      1
    from _eligible_restore_sources sources
    join public.card_stock_units source_unit
      on source_unit.id = sources.source_stock_unit_id
    on conflict (source_type, source_id)
      where source_type = 'production_stock_restore'
        and source_id is not null
        and status <> 'deleted'
    do nothing
    returning id, card_id, source_id
  )
  select * from inserted;

  select count(*)::integer into v_inserted from _inserted_restore_units;

  create temporary table _restore_units on commit drop as
  select
    replacement.id,
    replacement.card_id,
    replacement.source_id,
    sources.source_kind,
    sources.source_campaign_slug,
    sources.source_draw_round_id,
    sources.source_draw_round_prize_unit_id,
    sources.source_draw_round_prize_id,
    sources.source_collection_item_id,
    sources.source_gacha_open_id,
    sources.source_gacha_open_item_id
  from public.card_stock_units replacement
  join _eligible_restore_sources sources
    on replacement.source_type = 'production_stock_restore'
   and replacement.source_id = sources.source_stock_unit_id::text
   and replacement.status <> 'deleted';

  select count(*)::integer into v_replacement_total from _restore_units;

  with ledgered as (
    insert into public.card_stock_ledger(
      stock_unit_id,
      card_id,
      draw_round_id,
      draw_round_prize_id,
      event_type,
      actor_admin_id,
      metadata
    )
    select
      restored.id,
      restored.card_id,
      restored.source_draw_round_id,
      restored.source_draw_round_prize_id,
      'stock_created',
      p_admin_id,
      jsonb_strip_nulls(jsonb_build_object(
        'reason', coalesce(nullif(p_reason, ''), 'production_stock_restore'),
        'restoreRunId', p_run_id,
        'sourceType', 'production_stock_restore',
        'sourceStockUnitId', restored.source_id,
        'sourceKind', restored.source_kind,
        'sourceCampaignSlug', restored.source_campaign_slug,
        'sourceDrawRoundPrizeUnitId', restored.source_draw_round_prize_unit_id,
        'sourceCollectionItemId', restored.source_collection_item_id,
        'sourceGachaOpenId', restored.source_gacha_open_id,
        'sourceGachaOpenItemId', restored.source_gacha_open_item_id,
        'uniqueIdentifiersCopied', false
      ))
    from _restore_units restored
    on conflict (stock_unit_id)
      where event_type = 'stock_created'
        and metadata ->> 'sourceType' = 'production_stock_restore'
    do nothing
    returning 1
  )
  select count(*)::integer into v_ledgered from ledgered;

  with audited as (
    insert into public.audit_events(
      actor_admin_id,
      event_type,
      draw_round_id,
      metadata
    )
    select
      p_admin_id,
      'production_stock_restore_applied',
      restored.source_draw_round_id,
      jsonb_strip_nulls(jsonb_build_object(
        'reason', coalesce(nullif(p_reason, ''), 'production_stock_restore'),
        'restoreRunId', p_run_id,
        'sourceType', 'production_stock_restore',
        'requestedUnits', count(*)::integer,
        'replacementUnits', count(*)::integer,
        'sourceCampaignSlug', max(restored.source_campaign_slug),
        'uniqueIdentifiersCopied', false,
        'sourceStockUnitIds', jsonb_agg(restored.source_id order by restored.source_id)
      ))
    from _restore_units restored
    group by restored.source_draw_round_id
    returning 1
  )
  select count(*)::integer into v_audited from audited;

  return jsonb_build_object(
    'ok', true,
    'runId', p_run_id,
    'requestedUnits', v_requested,
    'insertedUnits', v_inserted,
    'replacementUnits', v_replacement_total,
    'ledgerRowsInserted', v_ledgered,
    'auditRowsInserted', v_audited,
    'uniqueIdentifiersCopied', false
  );
end;
$$;

revoke all on function public.restore_awarded_pack_stock(jsonb, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_awarded_pack_stock(jsonb, uuid, text, uuid)
  to service_role;
