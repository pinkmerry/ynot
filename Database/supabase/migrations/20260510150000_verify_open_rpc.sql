-- Sprint 5 — Public verification endpoint for gacha opens.
-- Anyone with the public_code receipt can fetch the RNG witness data for an
-- open: the campaign's committed server_seed_hash, the open's client_seed,
-- and per-item (nonce, rng_input, rng_output_hex, pool_size, pool_index).
-- The server_seed itself is included only after the campaign has been
-- closed and the seed revealed via reveal_draw_round_seed. Player identity
-- is intentionally NOT returned.

create or replace function public.get_gacha_open_verification(
  p_public_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  open_row public.gacha_opens%rowtype;
  campaign public.draw_rounds%rowtype;
  items jsonb := '[]'::jsonb;
begin
  if p_public_code is null or length(trim(p_public_code)) = 0 then
    return jsonb_build_object('available', false, 'reason', 'public_code_required');
  end if;

  select * into open_row
  from public.gacha_opens
  where public_code = trim(p_public_code)
  limit 1;

  if open_row.id is null then
    return jsonb_build_object('available', false, 'reason', 'open_not_found');
  end if;

  select * into campaign
  from public.draw_rounds
  where id = open_row.draw_round_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position', items_row.result_position,
    'cardId', items_row.card_id,
    'prizeUnitId', items_row.draw_round_prize_unit_id,
    'tier', items_row.tier,
    'valueThb', items_row.value_thb,
    'nonce', items_row.nonce,
    'rngInput', items_row.rng_input,
    'rngOutputHex', items_row.rng_output_hex,
    'rngPoolSize', items_row.rng_pool_size,
    'rngPoolIndex', items_row.rng_pool_index
  ) order by items_row.result_position), '[]'::jsonb)
  into items
  from public.gacha_open_items items_row
  where items_row.gacha_open_id = open_row.id;

  return jsonb_build_object(
    'available', true,
    'publicCode', open_row.public_code,
    'openId', open_row.id,
    'drawRoundId', open_row.draw_round_id,
    'campaignSlug', campaign.slug,
    'campaignTitle', campaign.title_en,
    'rngVersion', coalesce(open_row.rng_version, campaign.rng_version),
    'serverSeedHash', campaign.server_seed_hash,
    'serverSeedRevealedAt', campaign.server_seed_revealed_at,
    'serverSeed', case
      when campaign.server_seed_revealed_at is not null then campaign.server_seed
      else null
    end,
    'clientSeed', open_row.client_seed,
    'openedAt', open_row.opened_at,
    'items', items
  );
end;
$$;

revoke all on function public.get_gacha_open_verification(text) from public;
grant execute on function public.get_gacha_open_verification(text) to anon, authenticated, service_role;

comment on function public.get_gacha_open_verification(text) is
  'Public RNG witness for one gacha open by public_code. Server seed only after reveal. No player identity.';
