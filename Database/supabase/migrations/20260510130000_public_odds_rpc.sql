-- Sprint 2 — Public odds + remaining-by-tier disclosure (Toreca-parity).
-- Adds a public RPC that exposes per-tier total + remaining counts for one
-- live draw round. Does NOT leak unit ids or ordering, so it cannot be used
-- to predict which specific unit comes next.

-- 1. public-callable odds RPC --------------------------------------------------

create or replace function public.get_draw_round_public_odds(
  p_draw_round_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  total_units integer;
  available_units integer;
  awarded_units integer;
  available_slots integer;
  total_slots integer;
  tiers jsonb := '[]'::jsonb;
begin
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status in ('live', 'closed')
    and visibility = 'public';

  if campaign.id is null then
    return jsonb_build_object('available', false);
  end if;

  select count(*)::integer into total_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id;

  select count(*)::integer into available_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available';

  select
    count(*)::integer,
    count(*) filter (where status = 'available')::integer,
    count(*) filter (where status = 'awarded')::integer
    into total_units, available_units, awarded_units
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  -- per-tier breakdown.  Aggregated only — no unit ids escape this RPC.
  select coalesce(jsonb_agg(row order by tier_label), '[]'::jsonb)
  into tiers
  from (
    select
      jsonb_build_object(
        'tier', prizes.tier,
        'totalUnits', count(units.*)::integer,
        'availableUnits', count(units.*) filter (where units.status = 'available')::integer,
        'awardedUnits', count(units.*) filter (where units.status = 'awarded')::integer
      ) as row,
      prizes.tier as tier_label
    from public.draw_round_prizes prizes
    left join public.draw_round_prize_units units
      on units.draw_round_prize_id = prizes.id
    where prizes.draw_round_id = p_draw_round_id
    group by prizes.tier
  ) tier_rows;

  return jsonb_build_object(
    'available', true,
    'drawRoundId', campaign.id,
    'status', campaign.status,
    'totalSlots', coalesce(total_slots, campaign.total_slots),
    'availableSlots', coalesce(available_slots, 0),
    'totalUnits', coalesce(total_units, 0),
    'availableUnits', coalesce(available_units, 0),
    'awardedUnits', coalesce(awarded_units, 0),
    'tiers', tiers,
    'rngVersion', campaign.rng_version,
    'serverSeedHash', campaign.server_seed_hash,
    'serverSeedRevealedAt', campaign.server_seed_revealed_at
  );
end;
$$;

revoke all on function public.get_draw_round_public_odds(uuid) from public;
grant execute on function public.get_draw_round_public_odds(uuid) to anon, authenticated, service_role;

comment on function public.get_draw_round_public_odds(uuid) is
  'Public odds + remaining inventory for a live/closed campaign. Aggregated only — no unit ids leaked.';

-- 2. RLS audit confirmation ---------------------------------------------------
-- draw_round_prize_units already has RLS enabled and SELECT/INSERT/UPDATE/DELETE
-- revoked from anon and authenticated (see 20260509100000_admin_test_categories_inventory.sql:159-168).
-- This migration re-asserts those grants idempotently so a future migration
-- cannot accidentally widen access without showing up in review.

revoke all on table public.draw_round_prize_units from public, anon, authenticated;
grant all on table public.draw_round_prize_units to service_role;
