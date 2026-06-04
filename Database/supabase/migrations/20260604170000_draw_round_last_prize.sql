-- Last One Prize (ラストワン賞): an optional bonus card awarded to whoever opens
-- the final pack of a random pack. Stored on the draw_round itself — NOT as a
-- draw_round_prizes row — so the slot pool, materialization invariants and open
-- odds are completely untouched. The award unit is chosen at open time by
-- matching last_prize_card_id + the selected sub-SKU identity in
-- last_prize_metadata.
alter table public.draw_rounds
  add column if not exists last_prize_card_id uuid references public.cards(id) on delete set null,
  add column if not exists last_prize_metadata jsonb;
