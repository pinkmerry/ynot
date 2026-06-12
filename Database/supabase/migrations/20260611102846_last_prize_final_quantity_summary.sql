-- last_prize_final_quantity_summary
--
-- Keep the public inventory summary aligned with open_gacha_campaign's final
-- slot Last Prize rule. This exposes only aggregate counts. It does not expose
-- stock IDs, selected stock filters, weights, unlock rules, or owner logic.

create or replace function public.get_draw_round_inventory_summary(
  p_draw_round_id uuid default null,
  p_profile_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with slot_counts as (
    select
      draw_round_id,
      count(*)::integer as total_slots,
      count(*) filter (where status = 'available')::integer as available_slots,
      count(*) filter (where status in ('picked', 'opened'))::integer as claimed_slots,
      count(*) filter (where status = 'void')::integer as void_slots
    from public.draw_slots
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  ),
  unit_counts as (
    select
      draw_round_id,
      count(*)::integer as total_units,
      count(*) filter (where status = 'available')::integer as available_units,
      count(*) filter (where status = 'awarded')::integer as awarded_units,
      count(*) filter (where status = 'reserved')::integer as reserved_units,
      count(*) filter (where status = 'void')::integer as void_units
    from public.draw_round_prize_units
    where p_draw_round_id is null or draw_round_id = p_draw_round_id
    group by draw_round_id
  ),
  round_inventory as (
    select
      dr.id as draw_round_id,
      dr.sort_order,
      dr.created_at,
      coalesce(sc.total_slots, dr.total_slots, 0) as total_slots,
      coalesce(sc.available_slots, dr.total_slots, 0) as remaining_slots,
      coalesce(sc.claimed_slots, 0) as claimed_slots,
      coalesce(sc.void_slots, 0) as void_slots,
      case
        when coalesce(dr.logic_snapshot->>'mode', 'pure_random') in ('pure_random', 'weighted_templates', 'inventory_gated')
          then coalesce(dr.logic_snapshot->>'mode', 'pure_random')
        else 'pure_random'
      end as logic_mode,
      case
        when coalesce(dr.total_slots, 0) <= 0 then 100::numeric
        else least(
          100::numeric,
          (
            coalesce(sc.claimed_slots, 0)::numeric
            / greatest(dr.total_slots, 1)::numeric
          ) * 100
        )
      end as sold_pct
    from public.draw_rounds dr
    left join slot_counts sc on sc.draw_round_id = dr.id
    where p_draw_round_id is null or dr.id = p_draw_round_id
  ),
  prize_unit_counts as (
    select
      prizes.draw_round_id,
      prizes.id as draw_round_prize_id,
      greatest(coalesce(prizes.planned_quantity, 0), 0)::integer as planned_quantity,
      greatest(coalesce(prizes.bundle_quantity, 1), 1)::integer as bundle_quantity,
      coalesce(prizes.weight, 1) as weight,
      coalesce(prizes.unlock_at_sold_pct, 0) as unlock_at_sold_pct,
      count(units.id) filter (where units.status <> 'void')::integer as total_physical_units,
      count(units.id) filter (where units.status = 'available')::integer as available_physical_units
    from public.draw_round_prizes prizes
    left join public.draw_round_prize_units units on units.draw_round_prize_id = prizes.id
    where (p_draw_round_id is null or prizes.draw_round_id = p_draw_round_id)
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    group by
      prizes.draw_round_id,
      prizes.id,
      prizes.planned_quantity,
      prizes.bundle_quantity,
      prizes.weight,
      prizes.unlock_at_sold_pct
  ),
  normal_win_counts as (
    select
      ri.draw_round_id,
      coalesce(sum(
        least(
          puc.planned_quantity,
          floor(puc.available_physical_units::numeric / puc.bundle_quantity)::integer
        )
      ), 0)::integer as available_win_slots,
      coalesce(sum(
        case
          when (ri.logic_mode = 'pure_random' or puc.weight > 0)
            and (
              ri.logic_mode <> 'inventory_gated'
              or puc.unlock_at_sold_pct <= ri.sold_pct
            )
            then least(
              puc.planned_quantity,
              floor(puc.available_physical_units::numeric / puc.bundle_quantity)::integer
            )
          else 0
        end
      ), 0)::integer as eligible_win_slots
    from round_inventory ri
    left join prize_unit_counts puc on puc.draw_round_id = ri.draw_round_id
    group by ri.draw_round_id
  ),
  last_prize_counts as (
    select
      ri.draw_round_id,
      case
        when dr.last_prize_card_id is not null
          and dr.last_prize_awarded_at is null
          and exists (
            select 1
            from public.card_stock_units stock
            where stock.card_id = dr.last_prize_card_id
              and stock.status = 'available'
              and public.card_stock_unit_matches_prize_filter(stock, dr.last_prize_metadata)
          )
          then 1
        else 0
      end as last_prize_available_units
    from round_inventory ri
    join public.draw_rounds dr on dr.id = ri.draw_round_id
  ),
  public_counts as (
    select
      ri.draw_round_id,
      ri.sort_order,
      ri.created_at,
      ri.total_slots,
      ri.remaining_slots,
      ri.claimed_slots,
      ri.void_slots,
      coalesce(uc.total_units, 0) as total_units,
      coalesce(uc.available_units, 0) as available_units,
      case
        when coalesce(lpc.last_prize_available_units, 0) > 0
          and ri.remaining_slots <= coalesce(nwc.available_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0)
          then least(ri.remaining_slots, coalesce(nwc.available_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0))
        else least(ri.remaining_slots, coalesce(nwc.available_win_slots, 0))
      end as public_available_win_slots,
      case
        when coalesce(lpc.last_prize_available_units, 0) > 0
          and ri.remaining_slots <= coalesce(nwc.eligible_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0)
          then least(ri.remaining_slots, coalesce(nwc.eligible_win_slots, 0) + coalesce(lpc.last_prize_available_units, 0))
        else least(ri.remaining_slots, coalesce(nwc.eligible_win_slots, 0))
      end as public_eligible_units,
      coalesce(uc.awarded_units, 0) as awarded_units,
      coalesce(uc.reserved_units, 0) as reserved_units,
      coalesce(uc.void_units, 0) as void_units
    from round_inventory ri
    left join unit_counts uc on uc.draw_round_id = ri.draw_round_id
    left join normal_win_counts nwc on nwc.draw_round_id = ri.draw_round_id
    left join last_prize_counts lpc on lpc.draw_round_id = ri.draw_round_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'drawRoundId', pc.draw_round_id,
    'totalSlots', pc.total_slots,
    'remainingSlots', pc.remaining_slots,
    'claimedSlots', pc.claimed_slots,
    'voidSlots', pc.void_slots,
    'totalUnits', pc.total_units,
    'availableUnits', pc.available_units,
    'availableWinSlots', pc.public_available_win_slots,
    'eligibleUnits', pc.public_eligible_units,
    'awardedUnits', pc.awarded_units,
    'reservedUnits', pc.reserved_units,
    'voidUnits', pc.void_units
  ) order by pc.sort_order, pc.created_at desc), '[]'::jsonb)
  from public_counts pc;
$$;

revoke all on function public.get_draw_round_inventory_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_draw_round_inventory_summary(uuid, uuid)
  to service_role;
