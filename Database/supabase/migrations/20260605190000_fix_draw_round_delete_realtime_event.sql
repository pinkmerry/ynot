create or replace function app_private.emit_lucky_draw_realtime_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  public_topic text;
  public_draw_round_id uuid;
  private_topic text;
  private_draw_round_id uuid;
  private_order_id uuid;
  private_profile_id uuid;
  private_entity_type text;
  private_entity_id uuid;
begin
  if tg_table_name = 'draw_rounds' then
    public_topic := 'draw';
    if tg_op = 'DELETE' then
      public_draw_round_id := null;
    else
      public_draw_round_id := new.id;
    end if;
  elsif tg_table_name = 'draw_round_prizes' then
    public_topic := 'cards';
    public_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'draw_slots' then
    public_topic := 'slots';
    public_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
  elsif tg_table_name = 'orders' then
    private_topic := 'orders';
    private_draw_round_id := case when tg_op = 'DELETE' then old.draw_round_id else new.draw_round_id end;
    private_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
    private_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    private_entity_type := 'order';
    private_entity_id := private_order_id;
    public_topic := 'draw';
    public_draw_round_id := private_draw_round_id;
  elsif tg_table_name = 'payment_slips' then
    private_topic := 'payments';
    private_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    private_entity_type := 'payment_slip';
    private_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

    select o.draw_round_id, o.profile_id
    into private_draw_round_id, private_profile_id
    from public.orders o
    where o.id = private_order_id;

    public_topic := 'draw';
    public_draw_round_id := private_draw_round_id;
  elsif tg_table_name = 'order_picks' then
    private_topic := 'slots';
    private_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    private_entity_type := 'order_pick';
    private_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

    select o.draw_round_id, o.profile_id
    into private_draw_round_id, private_profile_id
    from public.orders o
    where o.id = private_order_id;

    public_topic := 'slots';
    public_draw_round_id := private_draw_round_id;
  end if;

  if public_topic is not null and public_draw_round_id is not null then
    insert into public.lucky_draw_realtime_events (topic, draw_round_id, order_id)
    values (public_topic, public_draw_round_id, null);
  end if;

  if private_topic is not null and private_profile_id is not null then
    insert into public.app_realtime_events (
      topic,
      profile_id,
      draw_round_id,
      order_id,
      entity_type,
      entity_id,
      admin_only
    )
    values (
      private_topic,
      private_profile_id,
      private_draw_round_id,
      private_order_id,
      private_entity_type,
      private_entity_id,
      false
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
