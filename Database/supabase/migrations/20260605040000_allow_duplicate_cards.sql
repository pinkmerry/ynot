-- Allow duplicate card product names AND model codes (e.g. several box
-- variations that share one model code, or repeated product names). Drops the
-- uniqueness on cards.search_name and cards.search_code; the GIN full-text index
-- on search_name stays, and all dedup is now an optional app-layer concern.
--
-- Safe: no runtime path uses ON CONFLICT (search_name/search_code); the catalog
-- upsert helper already SELECTs ... ORDER BY updated_at DESC LIMIT 1, so it keeps
-- working with duplicates.

-- Drop the unique constraint on search_name (created inline as
-- `search_name text unique`, default name cards_search_name_key — but resolve it
-- robustly in case the name differs).
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
  from pg_constraint c
  where c.conrelid = 'public.cards'::regclass
    and c.contype = 'u'
    and c.conkey = array[(
      select a.attnum from pg_attribute a
      where a.attrelid = 'public.cards'::regclass
        and a.attname = 'search_name'
        and not a.attisdropped
    )];
  if v_conname is not null then
    execute format('alter table public.cards drop constraint %I', v_conname);
  end if;
end $$;

-- Drop the unique index on search_code.
drop index if exists public.cards_search_code_unique_idx;
