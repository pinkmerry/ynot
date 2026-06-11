create or replace function public.get_draw_round_prize_unit_identity_mismatches(
  p_draw_round_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mismatches as (
    select
      units.draw_round_id,
      prizes.id as prize_id,
      units.id as prize_unit_id,
      units.status,
      prizes.card_id as prize_card_id,
      units.card_id as unit_card_id,
      stock.card_id as stock_card_id,
      stock.id as stock_unit_id,
      stock.stock_sku_id,
      coalesce(sku.label, sku.sku_code) as stock_label,
      nullif(prizes.metadata ->> 'stockUnitGroupKey', '') as intended_stock_unit_group_key,
      nullif(prizes.metadata ->> 'stockSkuId', '') as intended_stock_sku_id,
      nullif(prizes.metadata ->> 'stockSku', '') as intended_stock_sku,
      nullif(prizes.metadata ->> 'stockLabel', '') as intended_stock_label,
      case
        when jsonb_typeof(prizes.metadata -> 'stockUnitFilter') = 'object'
        then prizes.metadata -> 'stockUnitFilter'
        else null
      end as intended_stock_unit_filter,
      (units.card_id is distinct from prizes.card_id) as unit_card_mismatch,
      (units.card_stock_unit_id is null or stock.id is null) as missing_stock_unit,
      (stock.id is not null and stock.card_id is distinct from prizes.card_id) as stock_card_mismatch,
      (
        stock.id is not null
        and not public.card_stock_unit_matches_prize_filter(stock, prizes.metadata)
      ) as stock_filter_mismatch,
      case
        when units.card_id is distinct from prizes.card_id then 'unitCardMismatch'
        when units.card_stock_unit_id is null or stock.id is null then 'missingStockUnit'
        when stock.id is not null and stock.card_id is distinct from prizes.card_id then 'stockCardMismatch'
        when stock.id is not null and not public.card_stock_unit_matches_prize_filter(stock, prizes.metadata) then 'stockFilterMismatch'
        else null
      end as primary_reason
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    left join public.card_stock_units stock on stock.id = units.card_stock_unit_id
    left join public.stock_skus sku on sku.id = stock.stock_sku_id
    where units.status <> 'void'
      and (p_draw_round_id is null or units.draw_round_id = p_draw_round_id)
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'drawRoundId', draw_round_id,
        'prizeId', prize_id,
        'prizeUnitId', prize_unit_id,
        'status', status,
        'prizeCardId', prize_card_id,
        'unitCardId', unit_card_id,
        'stockCardId', stock_card_id,
        'stockUnitId', stock_unit_id,
        'stockSkuId', stock_sku_id,
        'stockLabel', stock_label,
        'intendedStockUnitGroupKey', intended_stock_unit_group_key,
        'intendedStockSkuId', intended_stock_sku_id,
        'intendedStockSku', intended_stock_sku,
        'intendedStockLabel', intended_stock_label,
        'intendedStockUnitFilter', intended_stock_unit_filter,
        'reason', jsonb_build_object(
          'unitCardMismatch', unit_card_mismatch,
          'stockCardMismatch', stock_card_mismatch,
          'missingStockUnit', missing_stock_unit,
          'stockFilterMismatch', stock_filter_mismatch
        ),
        'primaryReason', primary_reason
      )
      order by prize_id, prize_unit_id
    ) filter (
      where unit_card_mismatch
         or stock_card_mismatch
         or missing_stock_unit
         or stock_filter_mismatch
    ),
    '[]'::jsonb
  )
  from mismatches;
$$;

create or replace function public.assert_draw_round_prize_unit_identity(
  p_draw_round_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  mismatches jsonb;
begin
  if p_draw_round_id is null then
    raise exception 'campaign_required';
  end if;

  mismatches := public.get_draw_round_prize_unit_identity_mismatches(p_draw_round_id);
  if jsonb_array_length(mismatches) > 0 then
    raise exception 'prize_unit_identity_mismatch'
      using detail = mismatches::text;
  end if;
end;
$$;

revoke all on function public.get_draw_round_prize_unit_identity_mismatches(uuid) from public, anon, authenticated;
revoke all on function public.assert_draw_round_prize_unit_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_draw_round_prize_unit_identity_mismatches(uuid) to service_role;
grant execute on function public.assert_draw_round_prize_unit_identity(uuid) to service_role;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.approve_campaign_inventory(uuid,uuid,jsonb,text)'::regprocedure
  )
  into fn;

  if fn is null
     or position('with reserved as (' in fn) = 0
     or position('return jsonb_build_object(' in fn) = 0 then
    raise exception 'approve_campaign_inventory_identity_patch_anchor_missing';
  end if;

  fn := replace(
    fn,
    'with reserved as (',
    'if exists (
    select 1
    from public.card_stock_reservations reservations
    join public.card_stock_units stock on stock.id = reservations.stock_unit_id
    join public.draw_round_prizes prizes on prizes.id = reservations.draw_round_prize_id
    where reservations.draw_round_id = p_draw_round_id
      and reservations.status = ''reserved''
      and stock.status = ''reserved''
      and (
        stock.card_id is distinct from prizes.card_id
        or not public.card_stock_unit_matches_prize_filter(stock, prizes.metadata)
      )
  ) then
    raise exception ''reserved_stock_identity_mismatch'';
  end if;

  with reserved as ('
  );

  fn := replace(
    fn,
    'return jsonb_build_object(',
    'perform public.assert_draw_round_prize_unit_identity(p_draw_round_id);

  return jsonb_build_object('
  );

  if position('reserved_stock_identity_mismatch' in fn) = 0
     or position('stock.card_id is distinct from prizes.card_id' in fn) = 0
     or position('public.card_stock_unit_matches_prize_filter(stock, prizes.metadata)' in fn) = 0
     or position('public.assert_draw_round_prize_unit_identity(p_draw_round_id)' in fn) = 0 then
    raise exception 'approve_campaign_inventory_identity_patch_failed';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.edit_live_campaign_inventory(uuid,uuid,jsonb)'::regprocedure
  )
  into fn;

  if fn is null
     or position('if v_identity_changed then
          raise exception ''prize_identity_locked_after_award'';
        end if;' in fn) = 0
     or position('insert into public.draw_round_prizes(' in fn) = 0
     or position('return jsonb_build_object(' in fn) = 0 then
    raise exception 'edit_live_campaign_inventory_identity_patch_anchor_missing';
  end if;

  fn := replace(
    fn,
    'if v_identity_changed then
          raise exception ''prize_identity_locked_after_award'';
        end if;',
    'if v_identity_changed then
          raise exception ''prize_identity_locked_after_award'';
        end if;
      else
        v_identity_changed :=
          desired.card_id <> existing.card_id
          or coalesce(desired.metadata ->> ''stockSkuId'', '''')
             <> coalesce(existing.metadata ->> ''stockSkuId'', '''')
          or coalesce(desired.metadata ->> ''stockUnitGroupKey'', '''')
             <> coalesce(existing.metadata ->> ''stockUnitGroupKey'', '''')
          or coalesce(desired.metadata -> ''stockUnitFilter'', ''{}''::jsonb)
             <> coalesce(existing.metadata -> ''stockUnitFilter'', ''{}''::jsonb);
        if v_identity_changed then
          perform public._release_live_prize_units(
            p_draw_round_id, existing.id, p_admin_id, null
          );
        end if;'
  );

  fn := replace(
    fn,
    'return jsonb_build_object(',
    'perform public.assert_draw_round_prize_unit_identity(p_draw_round_id);

  return jsonb_build_object('
  );

  if position('v_identity_changed' in fn) = 0
     or position('prize_identity_locked_after_award' in fn) = 0
     or position('public._release_live_prize_units' in fn) = 0
     or position('public.assert_draw_round_prize_unit_identity(p_draw_round_id)' in fn) = 0 then
    raise exception 'edit_live_campaign_inventory_identity_patch_failed';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.publish_campaign(uuid,uuid,text)'::regprocedure
  )
  into fn;

  if fn is null
     or position('update public.draw_rounds
  set status = ''live'',
      visibility = ''public'',' in fn) = 0 then
    raise exception 'publish_campaign_identity_patch_anchor_missing';
  end if;

  fn := replace(
    fn,
    'update public.draw_rounds
  set status = ''live'',
      visibility = ''public'',',
    'perform public.assert_draw_round_prize_unit_identity(p_draw_round_id);

  update public.draw_rounds
  set status = ''live'',
      visibility = ''public'','
  );

  if position('public.assert_draw_round_prize_unit_identity(p_draw_round_id)' in fn) = 0 then
    raise exception 'publish_campaign_identity_patch_failed';
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

  if fn is null
     or position('perform public.edit_live_campaign_inventory(
    revision.draw_round_id,
    p_owner_admin_id,
    revision.prize_snapshot
  );' in fn) = 0 then
    raise exception 'publish_live_campaign_revision_identity_patch_anchor_missing';
  end if;

  fn := replace(
    fn,
    'perform public.edit_live_campaign_inventory(
    revision.draw_round_id,
    p_owner_admin_id,
    revision.prize_snapshot
  );',
    'perform public.edit_live_campaign_inventory(
    revision.draw_round_id,
    p_owner_admin_id,
    revision.prize_snapshot
  );

  perform public.assert_draw_round_prize_unit_identity(revision.draw_round_id);'
  );

  if position('public.edit_live_campaign_inventory' in fn) = 0
     or position('public.assert_draw_round_prize_unit_identity(revision.draw_round_id)' in fn) = 0 then
    raise exception 'publish_live_campaign_revision_identity_patch_failed';
  end if;

  execute fn;
end;
$migration$;
