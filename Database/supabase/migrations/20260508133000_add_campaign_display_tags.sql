alter table public.draw_rounds
add column if not exists display_tags text[] not null default array['PSA10', 'New Exclusive']::text[];

update public.draw_rounds
set display_tags = case
  when series = 'pokemon' then array['PSA10', 'New Exclusive']::text[]
  else array['Manga', 'New Exclusive']::text[]
end
where coalesce(array_length(display_tags, 1), 0) = 0;
