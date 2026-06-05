-- Add a "Print label" managed-dropdown field to cards, mirroring "variant".
--
-- print_label behaves exactly like variant: a free-text value stored on the card,
-- chosen from a managed option list (card_options kind 'print_label') that admins
-- can search / add / rename / delete from the Edit-card form.

-- (a) Free-text column on cards (plain nullable text, no constraint — like variant).
alter table public.cards
  add column if not exists print_label text;

-- (b) Allow kind 'print_label' in the managed option list. card_options.kind has a
--     CHECK constraint; follow the established drop/re-add pattern used by every
--     prior kind addition (set/variant/language/release_year/brand/catalog_category).
alter table public.card_options
  drop constraint if exists card_options_kind_check;
alter table public.card_options
  add constraint card_options_kind_check
  check (kind in ('set', 'variant', 'language', 'release_year', 'brand', 'catalog_category', 'print_label'));
