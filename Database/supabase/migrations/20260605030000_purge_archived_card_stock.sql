-- Owner-only: hard-delete a card's ARCHIVED stock units from the database.
--
-- "Remove stock" soft-deletes units to status='archived' (kept for history), so
-- they keep inflating a card's total (e.g. 928/931 · 3 archived). This purges
-- those archived rows for good. Only status='archived' units are touched —
-- available / reserved / allocated (live inventory) are never deleted.
--
-- FK notes (verified): card_stock_reservations.stock_unit_id is ON DELETE
-- RESTRICT, so any reservation on an archived unit is removed first; everything
-- else that points at the unit (card_stock_ledger, draw_round_prize_units,
-- draw_rounds.last_prize_stock_unit_id) is ON DELETE SET NULL and auto-detaches.

create or replace function public.purge_archived_card_stock(
  p_card_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_role text;
  v_unit_ids uuid[];
  v_deleted integer := 0;
begin
  if p_card_id is null then raise exception 'card_required'; end if;
  if p_admin_id is null then raise exception 'active_admin_required'; end if;

  select role into v_admin_role
  from public.admin_users where id = p_admin_id and is_active;
  if v_admin_role is null then raise exception 'active_admin_required'; end if;
  if v_admin_role <> 'owner' then raise exception 'owner_role_required'; end if;

  v_unit_ids := array(
    select id from public.card_stock_units
    where card_id = p_card_id and status = 'archived'
  );
  if array_length(v_unit_ids, 1) is null then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;

  -- card_stock_reservations -> card_stock_units is RESTRICT; clear any first.
  delete from public.card_stock_reservations where stock_unit_id = any(v_unit_ids);

  -- Delete only the archived units. ledger / prize_units / last_prize pointers
  -- are SET NULL, so they detach automatically.
  delete from public.card_stock_units
  where id = any(v_unit_ids) and status = 'archived';
  get diagnostics v_deleted = row_count;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id, 'card_archived_stock_purged',
    jsonb_build_object('cardId', p_card_id, 'deletedUnits', v_deleted));

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.purge_archived_card_stock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_archived_card_stock(uuid, uuid) to service_role;
