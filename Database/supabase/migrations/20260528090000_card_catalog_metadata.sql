-- Expand the admin card catalog with editable product/card metadata.
--
-- Keep card_code/search_code as the stable stored identity. The UI now calls
-- that value "Model code"; this migration adds descriptive metadata beside it.

alter table public.cards
  add column if not exists language text,
  add column if not exists release_year integer,
  add column if not exists card_set text,
  add column if not exists variant text,
  add column if not exists catalog_category text,
  add column if not exists condition text,
  add column if not exists grading_service text,
  add column if not exists cert_number text,
  add column if not exists gemrate_id text;

update public.cards
set catalog_category = case
  when prize_category = 'sealed_product' then 'packs'
  when prize_category = 'psa10_card' then 'single_cards'
  else 'single_cards'
end
where catalog_category is null
  or catalog_category = ''
  or catalog_category not in (
    'single_cards',
    'packs',
    'boxes',
    'cases',
    'sets',
    'supplies'
  );

update public.cards
set condition = 'raw'
where condition is null
  or condition = ''
  or condition not in ('sealed', 'raw', 'graded');

update public.cards
set grading_service = null
where grading_service is not null
  and grading_service not in ('psa', 'bgs', 'cgc', 'other');

update public.cards
set language = null
where language is not null
  and language not in ('english', 'japanese', 'chinese');

alter table public.cards
  alter column catalog_category set default 'single_cards',
  alter column catalog_category set not null,
  alter column condition set default 'raw',
  alter column condition set not null;

alter table public.cards
  drop constraint if exists cards_language_check,
  drop constraint if exists cards_release_year_check,
  drop constraint if exists cards_catalog_category_check,
  drop constraint if exists cards_condition_check,
  drop constraint if exists cards_grading_service_check;

alter table public.cards
  add constraint cards_language_check
  check (language is null or language in ('english', 'japanese', 'chinese')),
  add constraint cards_release_year_check
  check (release_year is null or release_year between 1990 and 2100),
  add constraint cards_catalog_category_check
  check (
    catalog_category in (
      'single_cards',
      'packs',
      'boxes',
      'cases',
      'sets',
      'supplies'
    )
  ),
  add constraint cards_condition_check
  check (condition in ('sealed', 'raw', 'graded')),
  add constraint cards_grading_service_check
  check (grading_service is null or grading_service in ('psa', 'bgs', 'cgc', 'other'));

create index if not exists cards_catalog_category_condition_idx
on public.cards (catalog_category, condition, grading_service, updated_at desc);

create index if not exists cards_release_year_idx
on public.cards (release_year)
where release_year is not null;
