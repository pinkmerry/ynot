-- bulk_open_last_prize_bonus_result
--
-- Bulk Pull All was introduced after Last Prize changed from a final-slot
-- substitute to a bonus reward. Keep the paid slot count and cost tied to the
-- remaining draw slots, but append the Last Prize as an extra highlight/result
-- when the final bulk slot closes the pack.

alter table public.gacha_bulk_open_results
  alter column draw_slot_id drop not null;

do $migration$
declare
  fn text;
  before_branch text := $before$
      if lp_stock_unit_id is null then
        raise exception 'not_enough_prize_inventory';
      end if;

      insert into public.gacha_open_items(
        gacha_open_id,
        card_id,
        draw_round_prize_id,
        draw_round_prize_unit_id,
        tier,
        value_thb,
        result_position,
        bundle_quantity,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        open_row.id,
        campaign.last_prize_card_id,
        null,
        null,
        'last_prize',
        null,
        position_index,
        1,
        session_row.id,
        bulk_sequence
      )
      returning id into lp_open_item_id;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        campaign.last_prize_card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-LP',
        lp_stock_unit_id,
        lp_open_item_id,
        session_row.id,
        bulk_sequence
      )
      returning id into lp_collection_item_id;

      update public.card_stock_units
      set status = 'allocated',
          allocated_draw_round_id = session_row.draw_round_id,
          allocated_draw_round_prize_id = null,
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'lastPrizeAward', jsonb_build_object(
              'drawRoundId', session_row.draw_round_id,
              'profileId', session_row.profile_id,
              'gachaOpenId', open_row.id,
              'gachaOpenItemId', lp_open_item_id,
              'collectionItemId', lp_collection_item_id,
              'bulkOpenSessionId', session_row.id,
              'bulkOpenSequence', bulk_sequence,
              'awardedAt', now()
            )
          )
      where id = lp_stock_unit_id;

      update public.draw_rounds
      set last_prize_awarded_at = now(),
          last_prize_awarded_open_id = open_row.id,
          last_prize_stock_unit_id = lp_stock_unit_id,
          last_prize_collection_item_id = lp_collection_item_id,
          status = 'closed',
          updated_at = now()
      where id = session_row.draw_round_id
      returning * into campaign;

      insert into public.card_stock_ledger(
        stock_unit_id,
        card_id,
        draw_round_id,
        draw_round_prize_id,
        event_type,
        actor_admin_id,
        metadata
      )
      values (
        lp_stock_unit_id,
        campaign.last_prize_card_id,
        session_row.draw_round_id,
        null,
        'allocated',
        null,
        jsonb_build_object(
          'reason', 'bulk_open_last_prize_final_slot',
          'gachaOpenId', open_row.id,
          'collectionItemId', lp_collection_item_id,
          'bulkOpenSessionId', session_row.id,
          'bulkOpenSequence', bulk_sequence
        )
      );

      result_payload := jsonb_build_object(
        'name', lp_card_name,
        'imageUrl', coalesce(nullif(lp_unit_image_url, ''), lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', bulk_sequence,
        'bundleQuantity', 1
      );

      insert into public.gacha_bulk_open_results(
        bulk_open_session_id,
        draw_slot_id,
        bulk_open_sequence,
        status,
        gacha_open_id,
        gacha_open_item_id,
        collection_item_id,
        result_payload
      )
      values (
        session_row.id,
        slot_id,
        bulk_sequence,
        'awarded',
        open_row.id,
        lp_open_item_id,
        lp_collection_item_id,
        result_payload
      )
      on conflict (bulk_open_session_id, draw_slot_id) do update
      set bulk_open_sequence = excluded.bulk_open_sequence,
          status = 'awarded',
          gacha_open_id = excluded.gacha_open_id,
          gacha_open_item_id = excluded.gacha_open_item_id,
          collection_item_id = excluded.collection_item_id,
          result_payload = excluded.result_payload,
          error_code = null,
          updated_at = now();

      inserted_count := inserted_count + 1;
      open_item_count := open_item_count + 1;
      collection_item_count := collection_item_count + 1;
      continue;
$before$;
  after_branch text := $after$
      if lp_stock_unit_id is null then
        raise exception 'not_enough_prize_inventory';
      end if;

      select exists(
        select 1
        from public.draw_round_prize_units units
        join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
        where units.draw_round_id = session_row.draw_round_id
          and units.status = 'available'
          and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
          and (logic_mode = 'pure_random' or coalesce(prizes.weight, 1) > 0)
          and (
            logic_mode <> 'inventory_gated'
            or coalesce(prizes.unlock_at_sold_pct, 0) <= sold_pct
          )
          and (
            select count(*)
            from public.draw_round_prize_units siblings
            where siblings.draw_round_prize_id = prizes.id
              and siblings.status = 'available'
          ) >= greatest(coalesce(prizes.bundle_quantity, 1), 1)
        limit 1
      )
      into normal_bonus_available;

      lp_bonus_sequence := case when normal_bonus_available then bulk_sequence + 1 else bulk_sequence end;

      insert into public.gacha_open_items(
        gacha_open_id,
        card_id,
        draw_round_prize_id,
        draw_round_prize_unit_id,
        tier,
        value_thb,
        result_position,
        bundle_quantity,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        open_row.id,
        campaign.last_prize_card_id,
        null,
        null,
        'last_prize',
        null,
        case when normal_bonus_available then position_index + 1 else position_index end,
        1,
        session_row.id,
        lp_bonus_sequence
      )
      returning id into lp_open_item_id;

      insert into public.collection_items(
        profile_id,
        card_id,
        source_type,
        source_id,
        status,
        serial_no,
        card_stock_unit_id,
        gacha_open_item_id,
        bulk_open_session_id,
        bulk_open_sequence
      )
      values (
        session_row.profile_id,
        campaign.last_prize_card_id,
        'gacha_open',
        open_row.id,
        'owned',
        open_row.public_code || '-LP',
        lp_stock_unit_id,
        lp_open_item_id,
        session_row.id,
        lp_bonus_sequence
      )
      returning id into lp_collection_item_id;

      update public.card_stock_units
      set status = 'allocated',
          allocated_draw_round_id = session_row.draw_round_id,
          allocated_draw_round_prize_id = null,
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'lastPrizeAward', jsonb_build_object(
              'drawRoundId', session_row.draw_round_id,
              'profileId', session_row.profile_id,
              'gachaOpenId', open_row.id,
              'gachaOpenItemId', lp_open_item_id,
              'collectionItemId', lp_collection_item_id,
              'bulkOpenSessionId', session_row.id,
              'bulkOpenSequence', lp_bonus_sequence,
              'awardedAt', now()
            )
          )
      where id = lp_stock_unit_id;

      update public.draw_rounds
      set last_prize_awarded_at = now(),
          last_prize_awarded_open_id = open_row.id,
          last_prize_stock_unit_id = lp_stock_unit_id,
          last_prize_collection_item_id = lp_collection_item_id,
          status = 'closed',
          updated_at = now()
      where id = session_row.draw_round_id
      returning * into campaign;

      insert into public.card_stock_ledger(
        stock_unit_id,
        card_id,
        draw_round_id,
        draw_round_prize_id,
        event_type,
        actor_admin_id,
        metadata
      )
      values (
        lp_stock_unit_id,
        campaign.last_prize_card_id,
        session_row.draw_round_id,
        null,
        'allocated',
        null,
        jsonb_build_object(
          'reason', 'bulk_open_last_prize_final_slot',
          'gachaOpenId', open_row.id,
          'collectionItemId', lp_collection_item_id,
          'bulkOpenSessionId', session_row.id,
          'bulkOpenSequence', lp_bonus_sequence
        )
      );

      result_payload := jsonb_build_object(
        'name', lp_card_name,
        'imageUrl', coalesce(nullif(lp_unit_image_url, ''), lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', lp_bonus_sequence,
        'bundleQuantity', 1
      );

      insert into public.gacha_bulk_open_results(
        bulk_open_session_id,
        draw_slot_id,
        bulk_open_sequence,
        status,
        gacha_open_id,
        gacha_open_item_id,
        collection_item_id,
        result_payload
      )
      values (
        session_row.id,
        case when normal_bonus_available then null::uuid else slot_id end,
        lp_bonus_sequence,
        'awarded',
        open_row.id,
        lp_open_item_id,
        lp_collection_item_id,
        result_payload
      )
      on conflict (bulk_open_session_id, draw_slot_id) do update
      set bulk_open_sequence = excluded.bulk_open_sequence,
          status = 'awarded',
          gacha_open_id = excluded.gacha_open_id,
          gacha_open_item_id = excluded.gacha_open_item_id,
          collection_item_id = excluded.collection_item_id,
          result_payload = excluded.result_payload,
          error_code = null,
          updated_at = now();

      open_item_count := open_item_count + 1;
      collection_item_count := collection_item_count + 1;

      if not normal_bonus_available then
        inserted_count := inserted_count + 1;
        continue;
      end if;
$after$;
begin
  select pg_get_functiondef(
    'public.process_bulk_open_chunk(uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'process_bulk_open_chunk_not_found';
  end if;

  if position('  lp_collection_item_id uuid;' in fn) = 0
     or position(before_branch in fn) = 0 then
    raise exception 'bulk_open_last_prize_bonus_patch_anchor_missing_process';
  end if;

  fn := replace(
    fn,
    '  lp_collection_item_id uuid;',
    '  lp_collection_item_id uuid;
  lp_bonus_sequence integer;
  normal_bonus_available boolean := false;'
  );

  fn := replace(fn, before_branch, after_branch);

  if position('lp_bonus_sequence := case when normal_bonus_available then bulk_sequence + 1 else bulk_sequence end;' in fn) = 0
     or position('case when normal_bonus_available then null::uuid else slot_id end' in fn) = 0
     or position('if not normal_bonus_available then' in fn) = 0 then
    raise exception 'bulk_open_last_prize_bonus_patch_failed_process';
  end if;

  execute fn;
end;
$migration$;

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.finalize_bulk_open_session(uuid)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'finalize_bulk_open_session_not_found';
  end if;

  if position('processed_slots = greatest(processed_slots, awarded_result_count),' in fn) = 0 then
    raise exception 'bulk_open_last_prize_bonus_patch_anchor_missing_finalize';
  end if;

  fn := replace(
    fn,
    'processed_slots = greatest(processed_slots, awarded_result_count),',
    'processed_slots = session_row.target_slots,'
  );

  if position('processed_slots = session_row.target_slots,' in fn) = 0 then
    raise exception 'bulk_open_last_prize_bonus_patch_failed_finalize';
  end if;

  execute fn;
end;
$migration$;
