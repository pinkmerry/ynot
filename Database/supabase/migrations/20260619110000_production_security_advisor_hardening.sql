-- Production hardening for Supabase advisor warnings before Pull All rollout.
-- These changes do not expose house logic and do not change pack-opening behavior.

alter function app_private.stock_sku_default_kind(text, text)
  set search_path = pg_catalog, app_private, public;

alter function app_private.stock_sku_default_code(text, text, uuid, text, text, text, text, text)
  set search_path = pg_catalog, app_private, public;

alter function app_private.last_prize_convert_coin_value(jsonb)
  set search_path = pg_catalog, app_private, public;

alter function app_private.collection_convert_deadline(timestamptz, integer)
  set search_path = pg_catalog, app_private, public;

alter function app_private.uuid_from_text(text)
  set search_path = pg_catalog, app_private, public;

alter function app_private.stock_sku_code_part(text)
  set search_path = pg_catalog, app_private, public;

-- This function is only used by a trigger. It should not be callable through
-- the public RPC surface by anon/authenticated users.
revoke execute on function public.touch_draw_round_live_revision_updated_at()
  from public, anon, authenticated;

-- The bucket itself is public, so public object URLs still work without a broad
-- SELECT policy that also allows clients to list bucket objects.
drop policy if exists "Public can read tier animation assets" on storage.objects;
