-- open_gacha_stock_image_proof
--
-- Teach open_gacha_campaign to mark when the reveal image came from the exact
-- awarded stock unit. The API uses this private proof to avoid expensive
-- post-RPC hydration, but strips the proof before returning customer payloads.

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
$snippet$  unit_card_image_url text;
  unit_display_tier text;$snippet$,
$snippet$  unit_card_image_url text;
  unit_image_resolved_from_stock_unit boolean;
  unit_display_tier text;$snippet$
  );

  fn := replace(
    fn,
$snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'tier', items.tier,$snippet$,
$snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'imageResolvedFromStockUnit', nullif(stock.image_url, '') is not null,
          'tier', items.tier,$snippet$
  );

  fn := replace(
    fn,
$snippet$      cards.name,
      coalesce(stock.image_url, cards.image_url),
      coalesce($snippet$,
$snippet$      cards.name,
      coalesce(stock.image_url, cards.image_url),
      nullif(stock.image_url, '') is not null,
      coalesce($snippet$
  );

  fn := replace(
    fn,
$snippet$      unit_card_name,
      unit_card_image_url,
      unit_display_tier,$snippet$,
$snippet$      unit_card_name,
      unit_card_image_url,
      unit_image_resolved_from_stock_unit,
      unit_display_tier,$snippet$
  );

  fn := replace(
    fn,
$snippet$      'imageUrl', unit_card_image_url,
      'tier', unit_tier,$snippet$,
$snippet$      'imageUrl', unit_card_image_url,
      'imageResolvedFromStockUnit', unit_image_resolved_from_stock_unit,
      'tier', unit_tier,$snippet$
  );

  if fn not like '%''imageResolvedFromStockUnit'', nullif(stock.image_url, '''') is not null%'
    or fn not like '%unit_image_resolved_from_stock_unit boolean%'
    or fn not like '%''imageResolvedFromStockUnit'', unit_image_resolved_from_stock_unit%'
    or fn like '%''imageResolvedFromStockUnit'', true%'
  then
    raise exception 'open_gacha_stock_image_proof_patch_failed';
  end if;

  execute fn;
end;
$migration$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
