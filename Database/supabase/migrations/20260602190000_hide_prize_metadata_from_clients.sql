-- Keep draw_round_prizes.metadata service-only.
--
-- The sub-SKU random-pack flow stores owner-only stock targeting fields in
-- metadata, including stockSku, stockUnitGroupKey, and stockUnitFilter. Public
-- clients only need the typed display columns below; server routes can still
-- read metadata through service_role.

revoke select on public.draw_round_prizes from anon, authenticated;

grant select (
  id,
  draw_round_id,
  card_id,
  tier,
  rank,
  value_thb,
  convert_coin_value,
  planned_quantity,
  is_test,
  seed_run_id,
  created_at,
  updated_at
) on public.draw_round_prizes to anon, authenticated;
