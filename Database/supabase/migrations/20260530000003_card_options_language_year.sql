-- Extend managed card options to Language and Release year, and free the
-- cards.language column from its fixed enum so custom languages can be saved.

-- 1. Allow the new option kinds.
alter table public.card_options
  drop constraint if exists card_options_kind_check;
alter table public.card_options
  add constraint card_options_kind_check
  check (kind in ('set', 'variant', 'language', 'release_year'));

-- 2. Language becomes free text (drop the english/japanese/chinese check) and
--    normalize existing values to Title Case so they match the seeded options.
alter table public.cards
  drop constraint if exists cards_language_check;
update public.cards
  set language = initcap(language)
  where language is not null and language <> '';

-- 3. Seed starter options.
insert into public.card_options (kind, name) values
  ('language', 'English'),
  ('language', 'Japanese'),
  ('language', 'Chinese')
  on conflict do nothing;

insert into public.card_options (kind, name)
  select 'release_year', y::text
  from generate_series(2015, 2026) as y
  on conflict do nothing;
