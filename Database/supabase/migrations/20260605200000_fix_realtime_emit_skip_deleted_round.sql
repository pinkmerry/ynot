-- Fix: app_private.emit_lucky_draw_realtime_event() must never INSERT a
-- lucky_draw_realtime_events row that references a draw_round which is in the
-- middle of being deleted.
--
-- Symptom: deleting a draw_round (e.g. via purge_test_draw_round) raised
--   23503  insert or update on table "lucky_draw_realtime_events" violates
--          foreign key constraint "lucky_draw_realtime_events_draw_round_id_fkey"
--          Key (draw_round_id)=(<round>) is not present in table "draw_rounds".
-- The AFTER-DELETE emit trigger fires once for the round's own delete AND once for
-- every cascade-deleted draw_slot (this pack had 450), each trying to INSERT an
-- event whose draw_round_id is the row already removed in the same command.
--
-- A prior fix nulled the id only for the draw_rounds DELETE branch; that did not
-- cover the draw_slots cascade, so the delete still failed.
--
-- Robust fix: gate the public insert on the round still existing. In normal
-- operation the round is present, so this emits exactly as before. During any
-- delete/cascade the round is already gone in the command snapshot, so the insert
-- is skipped — and existing events are removed by the ON DELETE CASCADE FK anyway.
-- (The draw_rounds DELETE -> null branch is kept as a second layer of defense.)
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

  -- Only emit when the referenced round still exists. This skips the insert during
  -- a round (or draw_slot cascade) delete and prevents the FK violation, while
  -- leaving every normal-path emission untouched.
  if public_topic is not null
     and public_draw_round_id is not null
     and exists (select 1 from public.draw_rounds dr where dr.id = public_draw_round_id) then
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
