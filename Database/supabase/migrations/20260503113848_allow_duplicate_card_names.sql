alter table public.cards
drop constraint if exists cards_search_name_key;

create index if not exists cards_search_name_lookup_idx
on public.cards (search_name);
