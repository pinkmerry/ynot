alter table public.cards
  add column if not exists prize_category text;

update public.cards
set prize_category = case
  when card_code = 'RANDOM-PSA10' or search_code = 'random-psa10' then 'psa10_card'
  when name ~* '(airpods?|headphones?|earbuds?|audio)' then 'audio_electronics'
  when name ~* '(playstation|ps5|nintendo|switch|xbox|console|gaming)' then 'console_gaming'
  when name ~* '(store credit|wallet|coin|coins|credit)' then 'store_credit'
  when name ~* '(sealed|booster|box|pack|display)' then 'sealed_product'
  when prize_category is null or prize_category = '' then 'psa10_card'
  else prize_category
end
where prize_category is null
  or prize_category = ''
  or prize_category = 'psa10_card';

update public.cards
set prize_category = 'other'
where prize_category not in (
  'psa10_card',
  'sealed_product',
  'console_gaming',
  'audio_electronics',
  'store_credit',
  'other'
);

alter table public.cards
  alter column prize_category set default 'psa10_card',
  alter column prize_category set not null;

alter table public.cards
  drop constraint if exists cards_prize_category_check;

alter table public.cards
  add constraint cards_prize_category_check
  check (
    prize_category in (
      'psa10_card',
      'sealed_product',
      'console_gaming',
      'audio_electronics',
      'store_credit',
      'other'
    )
  );

create index if not exists cards_prize_category_idx
on public.cards (prize_category, is_test, series, search_name);
