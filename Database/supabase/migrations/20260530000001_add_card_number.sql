-- Optional TCG card number (e.g. "057", "#057/204") on catalog cards.
alter table public.cards
  add column if not exists card_number text;
