-- Manage Prize catalog (cards.catalog_category) as free text, like sets and
-- brands. The built-in slugs are migrated to their human labels so the managed
-- dropdown shows clean names; the app canonicalizes both slug and label forms
-- when deriving prize/fulfilment categories, and any custom category falls back
-- to the "sealed product" prize source.
alter table public.cards
  drop constraint if exists cards_catalog_category_check;

update public.cards set catalog_category = 'Single Cards' where catalog_category = 'single_cards';
update public.cards set catalog_category = 'Packs'        where catalog_category = 'packs';
update public.cards set catalog_category = 'Boxes'        where catalog_category = 'boxes';
update public.cards set catalog_category = 'Cases'        where catalog_category = 'cases';
update public.cards set catalog_category = 'Sets'         where catalog_category = 'sets';
update public.cards set catalog_category = 'Supplies'     where catalog_category = 'supplies';

alter table public.cards
  alter column catalog_category set default 'Single Cards';

alter table public.card_options
  drop constraint if exists card_options_kind_check;
alter table public.card_options
  add constraint card_options_kind_check
  check (kind in ('set', 'variant', 'language', 'release_year', 'brand', 'catalog_category'));

insert into public.card_options (kind, name) values
  ('catalog_category', 'Single Cards'),
  ('catalog_category', 'Packs'),
  ('catalog_category', 'Boxes'),
  ('catalog_category', 'Cases'),
  ('catalog_category', 'Sets'),
  ('catalog_category', 'Supplies')
  on conflict do nothing;
