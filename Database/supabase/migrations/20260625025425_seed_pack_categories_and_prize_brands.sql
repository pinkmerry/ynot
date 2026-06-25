-- Keep the admin Pack Category list aligned with the Prize Catalog brand list.
-- Dragonball is a normal pack category, not a legacy draw_rounds.series value.
insert into public.store_categories (
  slug,
  name_th,
  name_en,
  description,
  icon,
  legacy_series,
  sort_order,
  is_active,
  is_test,
  metadata
)
values
  (
    'pokemon',
    'POKEMON',
    'Pokemon',
    'Pokemon random pack category.',
    'PKM',
    'pokemon',
    10,
    true,
    false,
    jsonb_build_object('systemSeed', 'pack-category-brand-alignment')
  ),
  (
    'one-piece',
    'ONE PIECE',
    'One Piece',
    'One Piece random pack category.',
    'OP',
    'one_piece',
    20,
    true,
    false,
    jsonb_build_object('systemSeed', 'pack-category-brand-alignment')
  ),
  (
    'dragonball',
    'DRAGONBALL',
    'Dragonball',
    'Dragonball random pack category.',
    'DB',
    null,
    30,
    true,
    false,
    jsonb_build_object('systemSeed', 'pack-category-brand-alignment')
  )
on conflict (slug) do update
set name_th = excluded.name_th,
    name_en = excluded.name_en,
    description = excluded.description,
    icon = excluded.icon,
    legacy_series = excluded.legacy_series,
    sort_order = excluded.sort_order,
    is_active = true,
    is_test = false,
    metadata = public.store_categories.metadata || excluded.metadata,
    updated_at = now();

insert into public.card_options (kind, name)
values
  ('brand', 'Pokemon'),
  ('brand', 'One Piece'),
  ('brand', 'Dragonball')
on conflict do nothing;
