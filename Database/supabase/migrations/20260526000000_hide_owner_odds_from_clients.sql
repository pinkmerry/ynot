-- Hide owner-configured odds (weight, unlock_at_sold_pct) from anon and
-- authenticated clients. They were previously readable through Supabase's
-- default table-level select grant combined with the existing
-- "Anyone can read public live draw prizes" RLS policy.
--
-- Browser-side code never reads these columns (verified across src/features,
-- src/components, src/lib browser entrypoints, and Supabase realtime
-- subscriptions). Server reads always go through service_role, which retains
-- grant all from 20260514045933_global_card_inventory_owner_approval.sql,
-- so the open_gacha_campaign RPC and admin routes keep working.
--
-- Strategy: revoke the implicit table-level SELECT, then re-grant only the
-- columns players legitimately need. Postgres RLS still gates which rows are
-- visible; column grants now also gate which fields anyone can request.

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
  metadata,
  created_at,
  updated_at
) on public.draw_round_prizes to anon, authenticated;

-- Per-unit inventory is service-only by design (used by the gacha RPC to lock
-- and award units). Players have no business reading it directly, and the
-- counts could be correlated with weight to back out odds. Lock it down.
revoke select on public.draw_round_prize_units from anon, authenticated;

-- service_role keeps grant all from prior migrations, so admin routes and the
-- open_gacha_campaign RPC are unaffected.

-- Realtime leak: Supabase realtime publishes raw replication payloads and
-- respects RLS but NOT column-level grants. A subscriber to
-- public.draw_round_prizes would still receive weight / unlock_at_sold_pct on
-- every UPDATE despite the revoke above. The browser code only subscribes to
-- lucky_draw_realtime_events / app_realtime_events (verified across src/), so
-- we can safely drop draw_round_prizes from the supabase_realtime publication
-- without breaking any UI. The DB-side trigger
-- (draw_round_prizes_emit_lucky_draw_realtime_event) still fires and writes
-- the "something changed" notification to lucky_draw_realtime_events, which
-- is the safe channel.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'draw_round_prizes'
     )
  then
    alter publication supabase_realtime drop table public.draw_round_prizes;
  end if;
end $$;

-- Sanity hook: if a future migration adds a new column to draw_round_prizes
-- and forgets to extend the grant above, the new column will be invisible to
-- anon/authenticated by default. That's the safe direction.
