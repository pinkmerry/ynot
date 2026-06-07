-- open_gacha_replay_remaining
--
-- Keep idempotent replay responses aligned with fresh open responses. The
-- Website uses this remaining summary to keep 1-pull/10-pull/100-pull buttons
-- and stock-left counters current without adding a second Worker/Supabase read.

do $migration$
declare
  fn text;
  before_snippet text := $snippet$      return jsonb_build_object(
        'status', existing_open.status,
        'openId', existing_open.id,
        'publicCode', existing_open.public_code,
        'replayed', true,
        'items', coalesce(replay_items, '[]'::jsonb)
      );$snippet$;
  after_snippet text := $snippet$      return jsonb_build_object(
        'status', existing_open.status,
        'openId', existing_open.id,
        'publicCode', existing_open.public_code,
        'replayed', true,
        'items', coalesce(replay_items, '[]'::jsonb),
        'remaining', (
          select coalesce(summary, '{}'::jsonb)
          from jsonb_array_elements(
            public.get_draw_round_inventory_summary(existing_open.draw_round_id, p_profile_id)
          ) with ordinality as replay_remaining(summary, ord)
          order by ord
          limit 1
        )
      );$snippet$;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'open_gacha_campaign_not_found';
  end if;

  if fn like '%''remaining'', (
          select coalesce(summary, ''{}''::jsonb)
          from jsonb_array_elements(
            public.get_draw_round_inventory_summary(existing_open.draw_round_id, p_profile_id)
          )%' then
    return;
  end if;

  if position(before_snippet in fn) = 0 then
    raise exception 'open_gacha_replay_remaining_patch_target_missing';
  end if;

  fn := replace(fn, before_snippet, after_snippet);

  if fn not like '%''remaining'', (
          select coalesce(summary, ''{}''::jsonb)
          from jsonb_array_elements(
            public.get_draw_round_inventory_summary(existing_open.draw_round_id, p_profile_id)
          )%' then
    raise exception 'open_gacha_replay_remaining_patch_failed';
  end if;

  execute fn;
end;
$migration$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
