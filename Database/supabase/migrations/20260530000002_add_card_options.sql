-- Managed autocomplete options for catalog "Set" and "Variant" fields.
-- The chosen name is still stored as text on cards.card_set / cards.variant;
-- this table just backs the searchable create/edit/delete dropdown.
create table if not exists public.card_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('set', 'variant')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists card_options_kind_name_idx
  on public.card_options (kind, lower(name));

create index if not exists card_options_kind_idx
  on public.card_options (kind, name);

alter table public.card_options enable row level security;
