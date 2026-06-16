-- open_gacha_replay_reveal_image
--
-- PRODUCTION-GATED MIGRATION. There is no accessible database to dry-run this
-- against in the authoring environment, so the patch below is written
-- string-exact against the migration chain and is self-protecting: every
-- `replace` is preceded by a `position(anchor in fn) = 0` assert and followed
-- by a post-assert, so it raises a clear exception instead of silently
-- producing a broken function if the live anchor text has drifted.
--
-- A DRY RUN ON A SUPABASE BRANCH IS MANDATORY BEFORE ANY PRODUCTION APPLY.
-- Use the gate + branch dry-run model from
-- docs/superpowers/plans/2026-06-15-apply-drop-unused-tables-migration.md:
-- apply on a non-prod branch first, trigger an open, replay the same
-- idempotency key, confirm the API response is byte-identical to before this
-- migration, and confirm (via get_logs / explain) that the replay path no
-- longer needs `hydrateItems` to backfill `card_stock_units`. Only apply to
-- prod after that branch verification passes.
--
-- Goal: let replayed gacha opens carry `imageUrl` +
-- `imageResolvedFromStockUnit` so the API's `needsOpenItemHydration`
-- (Website/src/app/api/ynot/gacha/open/route.ts) can skip the 4-5 backfill
-- queries on replays, the same way it already can on the DRAW path. The DRAW
-- path already emits these fields (added by
-- 20260606020000_open_gacha_subsku_reveal_image.sql and
-- 20260607011450_open_gacha_stock_image_proof.sql) and is NOT touched here.
-- No award/random/last-prize logic is touched. `hydrateItems` remains the
-- fallback on the Website, so this is safe to land before it is applied to
-- production.
--
-- Anchor provenance (read this before editing the `replace` calls below):
-- The idempotency-replay subquery was originally introduced in
-- 20260605210000_last_prize_final_slot.sql (~lines 235-263) with
--   from public.gacha_open_items items
--   join public.cards cards on cards.id = items.card_id
--   left join public.draw_round_prizes prizes on prizes.id = items.draw_round_prize_id
--   where items.gacha_open_id = existing_open.id
-- and `'imageUrl', cards.image_url,` inside the replay jsonb_build_object.
-- However, 20260606020000_open_gacha_subsku_reveal_image.sql (a LATER
-- migration) already patched that SAME replay subquery: it inserted the
--   left join public.draw_round_prize_units prize_unit
--     on prize_unit.id = items.draw_round_prize_unit_id
--   left join public.card_stock_units stock
--     on stock.id = prize_unit.card_stock_unit_id
-- joins into this exact FROM clause and rewrote the replay `'imageUrl'` key
-- to `coalesce(stock.image_url, cards.image_url)`. So on the live function,
-- BOTH joins and the resolved `imageUrl` already exist on the replay path;
-- only `imageResolvedFromStockUnit` (added to the DRAW path's reveal object
-- by 20260612090000_last_prize_bonus_award.sql / 20260607011450) is still
-- missing from the REPLAY object. This migration's anchor is therefore the
-- CUMULATIVE post-20260606020000 replay text, not the original
-- 20260605210000 text -- adding the joins again would collide with the
-- existing `prize_unit`/`stock` aliases. If a future migration changes this
-- block again before this one is applied, the asserts below will raise
-- 'open_replay_reveal_anchor_missing' instead of corrupting the function.

do $migration$
declare
  fn text;
  replay_from_anchor text := $snippet$        from public.gacha_open_items items
        join public.cards cards on cards.id = items.card_id
        left join public.draw_round_prize_units prize_unit
          on prize_unit.id = items.draw_round_prize_unit_id
        left join public.card_stock_units stock
          on stock.id = prize_unit.card_stock_unit_id
        left join public.draw_round_prizes prizes on prizes.id = items.draw_round_prize_id
        where items.gacha_open_id = existing_open.id$snippet$;
  replay_image_key_before text := $snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'tier', items.tier,$snippet$;
  replay_image_key_after text := $snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'imageResolvedFromStockUnit', nullif(stock.image_url, '') is not null,
          'tier', items.tier,$snippet$;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'open_gacha_campaign_not_found';
  end if;

  -- Guard 1: the replay FROM clause (with the card_stock_units join already
  -- present from 20260606020000) must exist verbatim. If it doesn't, the live
  -- function text has drifted from what this patch assumes -- raise instead
  -- of guessing.
  if position(replay_from_anchor in fn) = 0 then
    raise exception 'open_replay_reveal_anchor_missing';
  end if;

  -- Guard 2: the replay jsonb_build_object's 'imageUrl' key must already be
  -- resolved through `stock.image_url` (also from 20260606020000). This is
  -- what makes it safe to add `imageResolvedFromStockUnit` right next to it
  -- without re-adding the joins.
  if position(replay_image_key_before in fn) = 0 then
    raise exception 'open_replay_reveal_image_key_anchor_missing';
  end if;

  -- Patch: add `imageResolvedFromStockUnit` to the replay reveal object so it
  -- matches the DRAW path's reveal object shape exactly.
  fn := replace(fn, replay_image_key_before, replay_image_key_after);

  -- Post-assert: `imageResolvedFromStockUnit` already exists elsewhere in
  -- this function (the DRAW path's jsonb_build_object, added by
  -- 20260607011450_open_gacha_stock_image_proof.sql), so a bare
  -- `position('imageResolvedFromStockUnit' in fn) = 0` check would pass
  -- trivially even if THIS replace did nothing. Assert the exact replacement
  -- text -- which is unique to the replay block (it pairs with
  -- `'tier', items.tier,`, not the draw-loop's `unit_tier`) -- is present
  -- instead.
  if position(replay_image_key_after in fn) = 0 then
    raise exception 'open_replay_reveal_patch_failed';
  end if;

  execute fn;
end;
$migration$;
