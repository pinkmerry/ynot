create table if not exists public.lucky_draw_realtime_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('draw', 'orders', 'slots', 'payments', 'cards')),
  draw_round_id uuid references public.draw_rounds(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists lucky_draw_realtime_events_created_at_idx
on public.lucky_draw_realtime_events(created_at desc);

alter table public.lucky_draw_realtime_events enable row level security;

drop policy if exists "Anyone can receive lucky draw refresh events" on public.lucky_draw_realtime_events;
create policy "Anyone can receive lucky draw refresh events"
on public.lucky_draw_realtime_events
for select
to anon, authenticated
using (true);

create or replace function app_private.emit_lucky_draw_realtime_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_topic text;
  next_draw_round_id uuid;
  next_order_id uuid;
begin
  if tg_table_name = 'draw_rounds' then
    next_topic := 'draw';
    next_draw_round_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'draw_round_prizes' then
    next_topic := 'cards';
    next_draw_round_id := coalesce(new.draw_round_id, old.draw_round_id);
  elsif tg_table_name = 'draw_slots' then
    next_topic := 'slots';
    next_draw_round_id := coalesce(new.draw_round_id, old.draw_round_id);
  elsif tg_table_name = 'payment_slips' then
    next_topic := 'payments';
    next_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_picks' then
    next_topic := 'slots';
    next_order_id := coalesce(new.order_id, old.order_id);
  else
    next_topic := 'orders';
    next_draw_round_id := coalesce(new.draw_round_id, old.draw_round_id);
    next_order_id := coalesce(new.id, old.id);
  end if;

  insert into public.lucky_draw_realtime_events (topic, draw_round_id, order_id)
  values (next_topic, next_draw_round_id, next_order_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists draw_rounds_emit_lucky_draw_realtime_event on public.draw_rounds;
create trigger draw_rounds_emit_lucky_draw_realtime_event
after insert or update or delete on public.draw_rounds
for each row execute function app_private.emit_lucky_draw_realtime_event();

drop trigger if exists orders_emit_lucky_draw_realtime_event on public.orders;
create trigger orders_emit_lucky_draw_realtime_event
after insert or update or delete on public.orders
for each row execute function app_private.emit_lucky_draw_realtime_event();

drop trigger if exists draw_slots_emit_lucky_draw_realtime_event on public.draw_slots;
create trigger draw_slots_emit_lucky_draw_realtime_event
after insert or update or delete on public.draw_slots
for each row execute function app_private.emit_lucky_draw_realtime_event();

drop trigger if exists order_picks_emit_lucky_draw_realtime_event on public.order_picks;
create trigger order_picks_emit_lucky_draw_realtime_event
after insert or update or delete on public.order_picks
for each row execute function app_private.emit_lucky_draw_realtime_event();

drop trigger if exists payment_slips_emit_lucky_draw_realtime_event on public.payment_slips;
create trigger payment_slips_emit_lucky_draw_realtime_event
after insert or update or delete on public.payment_slips
for each row execute function app_private.emit_lucky_draw_realtime_event();

drop trigger if exists draw_round_prizes_emit_lucky_draw_realtime_event on public.draw_round_prizes;
create trigger draw_round_prizes_emit_lucky_draw_realtime_event
after insert or update or delete on public.draw_round_prizes
for each row execute function app_private.emit_lucky_draw_realtime_event();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lucky_draw_realtime_events'
    ) then
      alter publication supabase_realtime add table public.lucky_draw_realtime_events;
    end if;
  end if;
end;
$$;
