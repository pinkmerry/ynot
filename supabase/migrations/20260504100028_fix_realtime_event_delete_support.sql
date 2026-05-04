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
    next_draw_round_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'draw_round_prizes' then
    next_topic := 'cards';
    next_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'draw_slots' then
    next_topic := 'slots';
    next_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'payment_slips' then
    next_topic := 'payments';
    next_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  elsif tg_table_name = 'order_picks' then
    next_topic := 'slots';
    next_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  else
    next_topic := 'orders';
    next_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
    next_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  insert into public.lucky_draw_realtime_events (topic, draw_round_id, order_id)
  values (next_topic, next_draw_round_id, next_order_id);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
