-- last_prize_bonus_award
--
-- Last One Prize becomes a BONUS handed to the final opener instead of
-- substituting their normal prize. The buyer who opens the last pack now
-- draws a normal prize like everyone else AND receives the Last Prize as an
-- extra reveal item (result_position = p_quantity + 1, no slot consumed).
-- Normal prize rows must therefore cover every slot (planned = total_slots).
--
-- Already-live packs were materialized under the old substitute rule (one
-- fewer normal unit than slots). open_gacha_campaign self-detects that
-- shortfall on the final open and falls back to the old behavior, so packs
-- published before this migration still sell out cleanly without an edit.

-- 1) Normal prize rows now cover every slot; the Last Prize no longer
--    occupies one. Used by submit/approve/publish/live-edit validations.
create or replace function app_private.last_prize_normal_prize_target(
  p_total_slots integer,
  p_last_prize_card_id uuid
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(p_total_slots, 0), 0)::integer;
$$;

-- 2) Live edits: public slot count equals the normal lineup again (no +1).
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

  if position('v_public_total_slots := v_planned_total + case when campaign.last_prize_card_id is null then 0 else 1 end;' in fn) = 0 then
    raise exception 'last_prize_bonus_patch_anchor_missing_edit_live_campaign_inventory';
  end if;

  fn := replace(
    fn,
    'v_public_total_slots := v_planned_total + case when campaign.last_prize_card_id is null then 0 else 1 end;',
    'v_public_total_slots := v_planned_total;'
  );

  execute fn;
end;
$migration$;

-- 3) open_gacha_campaign: award the Last Prize as an extra item on the final
--    open; keep the old substitute path for legacy-materialized packs.
do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'open_gacha_campaign_not_found';
  end if;

  if position($snippet$  last_prize_needed boolean := false;$snippet$ in fn) = 0
     or position($snippet$  normal_units_needed := p_quantity - case when last_prize_needed then 1 else 0 end;$snippet$ in fn) = 0
     or position($snippet$  if available_unit_count < normal_units_needed then
    raise exception 'not_enough_prize_inventory';
  end if;$snippet$ in fn) = 0
     or position($snippet$        'last_prize',
        null,
        position_index,
        1
      )$snippet$ in fn) = 0
     or position($snippet$      result_items := result_items || jsonb_build_array(jsonb_build_object(
        'cardId', campaign.last_prize_card_id,
        'name', lp_card_name,
        'imageUrl', coalesce(lp_unit_image_url, lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', position_index,
        'bundleQuantity', 1
      ));

      continue;$snippet$ in fn) = 0
     or position($snippet$  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)$snippet$ in fn) = 0 then
    raise exception 'last_prize_bonus_patch_anchor_missing_open_gacha_campaign';
  end if;

  fn := replace(
    fn,
$snippet$  last_prize_needed boolean := false;$snippet$,
$snippet$  last_prize_needed boolean := false;
  last_prize_substitutes boolean := false;
  lp_bonus_item jsonb;$snippet$
  );

  fn := replace(
    fn,
$snippet$  normal_units_needed := p_quantity - case when last_prize_needed then 1 else 0 end;$snippet$,
$snippet$  normal_units_needed := p_quantity;$snippet$
  );

  fn := replace(
    fn,
$snippet$  if available_unit_count < normal_units_needed then
    raise exception 'not_enough_prize_inventory';
  end if;$snippet$,
$snippet$  if last_prize_needed and available_unit_count < normal_units_needed then
    -- Legacy pack: materialized one fewer normal unit than slots because the
    -- Last Prize used to substitute the final slot. Keep the old behavior so
    -- packs published before the bonus rule still sell out cleanly.
    last_prize_substitutes := true;
    normal_units_needed := normal_units_needed - 1;
  end if;

  if available_unit_count < normal_units_needed then
    raise exception 'not_enough_prize_inventory';
  end if;$snippet$
  );

  fn := replace(
    fn,
$snippet$        'last_prize',
        null,
        position_index,
        1
      )$snippet$,
$snippet$        'last_prize',
        null,
        case when last_prize_substitutes then position_index else p_quantity + 1 end,
        1
      )$snippet$
  );

  fn := replace(
    fn,
$snippet$      result_items := result_items || jsonb_build_array(jsonb_build_object(
        'cardId', campaign.last_prize_card_id,
        'name', lp_card_name,
        'imageUrl', coalesce(lp_unit_image_url, lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', position_index,
        'bundleQuantity', 1
      ));

      continue;$snippet$,
$snippet$      lp_bonus_item := jsonb_build_object(
        'cardId', campaign.last_prize_card_id,
        'name', lp_card_name,
        'imageUrl', coalesce(lp_unit_image_url, lp_card_image_url),
        'tier', 'last_prize',
        'displayTier', 'last_prize',
        'isLastPrize', true,
        'valueThb', null,
        'position', case when last_prize_substitutes then position_index else p_quantity + 1 end,
        'bundleQuantity', 1
      );

      if last_prize_substitutes then
        result_items := result_items || jsonb_build_array(lp_bonus_item);
        lp_bonus_item := null;
        continue;
      end if;$snippet$
  );

  fn := replace(
    fn,
$snippet$  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)$snippet$,
$snippet$  end loop;

  if lp_bonus_item is not null then
    result_items := result_items || jsonb_build_array(lp_bonus_item);
  end if;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)$snippet$
  );

  if position('last_prize_substitutes boolean := false;' in fn) = 0
     or position('normal_units_needed := p_quantity;' in fn) = 0
     or position('lp_bonus_item is not null' in fn) = 0 then
    raise exception 'last_prize_bonus_patch_failed_open_gacha_campaign';
  end if;

  execute fn;
end;
$migration$;
