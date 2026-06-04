-- Human-readable random-pack code (PCK-00001, PCK-00002, ...) for easy
-- reference in admin, search and conversation. Sequential and concurrency-safe
-- via a dedicated sequence + a before-insert trigger; existing packs are
-- backfilled in creation order.
create sequence if not exists public.draw_round_pack_code_seq;

alter table public.draw_rounds
  add column if not exists pack_code text;

-- Backfill existing rows in creation order. Each row consumes a nextval so the
-- sequence stays positioned after the last assigned code for future inserts.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.draw_rounds
    where pack_code is null or pack_code = ''
    order by created_at asc nulls last, id asc
  loop
    update public.draw_rounds
    set pack_code = 'PCK-' || lpad(nextval('public.draw_round_pack_code_seq')::text, 5, '0')
    where id = r.id;
  end loop;
end $$;

create unique index if not exists draw_rounds_pack_code_key
  on public.draw_rounds (pack_code)
  where pack_code is not null;

create or replace function public.assign_draw_round_pack_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.pack_code is null or new.pack_code = '' then
    new.pack_code := 'PCK-' || lpad(nextval('public.draw_round_pack_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists draw_rounds_assign_pack_code on public.draw_rounds;
create trigger draw_rounds_assign_pack_code
  before insert on public.draw_rounds
  for each row
  execute function public.assign_draw_round_pack_code();
