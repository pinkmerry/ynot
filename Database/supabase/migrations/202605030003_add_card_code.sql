alter table public.cards
add column if not exists card_code text,
add column if not exists search_code text;

update public.cards
set
  card_code = nullif(upper(trim(card_code)), ''),
  search_code = nullif(lower(trim(search_code)), '')
where card_code is not null or search_code is not null;

create unique index if not exists cards_search_code_unique_idx
on public.cards (search_code)
where search_code is not null;

create index if not exists cards_card_code_idx
on public.cards (card_code)
where card_code is not null;
