alter table public.draw_rounds
  add column if not exists banner_image_url text,
  add column if not exists banner_image_storage_path text;
