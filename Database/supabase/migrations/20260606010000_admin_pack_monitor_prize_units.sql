create or replace function public.get_admin_pack_monitor_prize_units(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_winners_per_prize integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  winner_limit integer := least(100, greatest(0, coalesce(p_winners_per_prize, 20)));
begin
  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.id = p_admin_id
      and admin_user.is_active = true
  ) then
    raise exception 'admin authorization required'
      using errcode = '42501';
  end if;

  return coalesce(
    (
      with args as (
        select winner_limit
      ),
      unit_counts as (
        select
          prize.id as prize_id,
          count(unit.id) as total_units,
          count(unit.id) filter (
            where unit.status in ('available', 'reserved')
          ) as remaining_units,
          count(unit.id) filter (
            where unit.status = 'awarded'
          ) as out_units,
          max(coalesce(unit.awarded_at, unit.updated_at, unit.created_at)) as updated_at
        from public.draw_round_prizes prize
        left join public.draw_round_prize_units unit
          on unit.draw_round_prize_id = prize.id
        where prize.draw_round_id = p_draw_round_id
        group by prize.id
      ),
      winner_rows as (
        select
          ranked.draw_round_prize_id,
          ranked.opened_at,
          jsonb_build_object(
            'status', ranked.status,
            'openedAt', ranked.opened_at,
            'ownerLabel', ranked.owner_label,
            'ownerEmail', ranked.owner_email,
            'ownerLineUserId', ranked.owner_line_user_id,
            'publicOpenCode', ranked.public_open_code
          ) as winner
        from (
          select
            unit.draw_round_prize_id,
            unit.status,
            coalesce(unit.awarded_at, open_row.opened_at, unit.updated_at) as opened_at,
            coalesce(
              profile.display_name,
              profile.line_display_name,
              profile.email,
              'YNot customer'
            ) as owner_label,
            profile.email as owner_email,
            profile.line_user_id as owner_line_user_id,
            open_row.public_code as public_open_code,
            row_number() over (
              partition by unit.draw_round_prize_id
              order by coalesce(unit.awarded_at, open_row.opened_at, unit.updated_at) desc nulls last
            ) as winner_rank
          from public.draw_round_prize_units unit
          left join public.gacha_opens open_row
            on open_row.id = unit.gacha_open_id
          left join public.profiles profile
            on profile.id = coalesce(unit.profile_id, open_row.profile_id)
          where unit.draw_round_id = p_draw_round_id
            and unit.status = 'awarded'
        ) ranked
        cross join args
        where ranked.winner_rank <= args.winner_limit
      ),
      winner_groups as (
        select
          winner_rows.draw_round_prize_id,
          jsonb_agg(winner_rows.winner order by winner_rows.opened_at desc nulls last) as winners
        from winner_rows
        group by winner_rows.draw_round_prize_id
      )
      select jsonb_agg(
        jsonb_build_object(
          'prizeId', unit_counts.prize_id,
          'totalUnits', unit_counts.total_units,
          'remainingUnits', unit_counts.remaining_units,
          'outUnits', unit_counts.out_units,
          'updatedAt', unit_counts.updated_at,
          'winners', coalesce(winner_groups.winners, '[]'::jsonb)
        )
        order by unit_counts.prize_id
      )
      from unit_counts
      left join winner_groups
        on winner_groups.draw_round_prize_id = unit_counts.prize_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_admin_pack_monitor_prize_units(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_admin_pack_monitor_prize_units(uuid, uuid, integer)
  to service_role;
