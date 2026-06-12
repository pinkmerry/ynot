-- open_gacha_subsku_reveal_image
--
-- Keep the reveal payload aligned with the exact awarded stock-unit image.
-- This is a function-only replacement: it does not rewrite pack, stock, user,
-- wallet, collection, or history rows.

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

  fn := replace(
    fn,
$snippet$          'imageUrl', cards.image_url,
          'tier', items.tier,$snippet$,
$snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'tier', items.tier,$snippet$
  );

  fn := replace(
    fn,
$snippet$        from public.gacha_open_items items
        join public.cards cards on cards.id = items.card_id
        left join public.draw_round_prizes prizes on prizes.id = items.draw_round_prize_id
        where items.gacha_open_id = existing_open.id$snippet$,
$snippet$        from public.gacha_open_items items
        join public.cards cards on cards.id = items.card_id
        left join public.draw_round_prize_units prize_unit
          on prize_unit.id = items.draw_round_prize_unit_id
        left join public.card_stock_units stock
          on stock.id = prize_unit.card_stock_unit_id
        left join public.draw_round_prizes prizes on prizes.id = items.draw_round_prize_id
        where items.gacha_open_id = existing_open.id$snippet$
  );

  fn := replace(
    fn,
$snippet$      cards.name,
      cards.image_url,
      coalesce($snippet$,
$snippet$      cards.name,
      coalesce(stock.image_url, cards.image_url),
      coalesce($snippet$
  );

  fn := replace(
    fn,
$snippet$    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    join public.cards cards on cards.id = units.card_id
    where units.draw_round_id = p_draw_round_id$snippet$,
$snippet$    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    join public.cards cards on cards.id = units.card_id
    left join public.card_stock_units stock
      on stock.id = units.card_stock_unit_id
    where units.draw_round_id = p_draw_round_id$snippet$
  );

  if fn not like '%coalesce(stock.image_url, cards.image_url)%'
    or fn not like '%left join public.card_stock_units stock%'
    or fn like '%''imageUrl'', cards.image_url,%'
  then
    raise exception 'open_gacha_campaign_subsku_image_patch_failed';
  end if;

  execute fn;
end;
$migration$;
