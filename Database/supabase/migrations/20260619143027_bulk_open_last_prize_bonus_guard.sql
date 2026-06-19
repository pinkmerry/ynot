-- bulk_open_last_prize_bonus_guard
--
-- Last Prize bonus results intentionally do not consume a paid draw slot, so
-- draw_slot_id is NULL for that bonus row. Keep the invariant explicit:
-- at most one no-slot Last Prize bonus result can exist per bulk-open session.

do $migration$
declare
  duplicate_session_count integer;
begin
  select count(*)::integer
  into duplicate_session_count
  from (
    select bulk_open_session_id
    from public.gacha_bulk_open_results
    where draw_slot_id is null
      and result_payload @> '{"isLastPrize": true}'::jsonb
    group by bulk_open_session_id
    having count(*) > 1
  ) duplicate_sessions;

  if duplicate_session_count > 0 then
    raise exception 'bulk_open_duplicate_last_prize_bonus_results';
  end if;
end;
$migration$;

create unique index if not exists gacha_bulk_open_results_one_last_prize_bonus_per_session_idx
  on public.gacha_bulk_open_results(bulk_open_session_id)
  where draw_slot_id is null
    and result_payload @> '{"isLastPrize": true}'::jsonb;
