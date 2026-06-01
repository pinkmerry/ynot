-- Allow free-text card series (brand) so brands can be managed like sets, and
-- expose 'brand' as a card_options kind. Existing pokemon/one_piece values are
-- left untouched; the app maps those two to display names and passes any other
-- brand through verbatim.
alter table public.cards
  drop constraint if exists cards_series_check;

alter table public.card_options
  drop constraint if exists card_options_kind_check;
alter table public.card_options
  add constraint card_options_kind_check
  check (kind in ('set', 'variant', 'language', 'release_year', 'brand'));

insert into public.card_options (kind, name) values
  ('brand', 'Pokemon'),
  ('brand', 'One Piece')
  on conflict do nothing;
