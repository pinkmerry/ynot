alter table public.draw_rounds
add column if not exists featured_cards jsonb not null default '[]'::jsonb,
add column if not exists chase_cards jsonb not null default '[]'::jsonb;
