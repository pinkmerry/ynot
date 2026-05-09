-- Complete admin shipping lifecycle with one transaction-safe RPC.
-- Production guard: apply only after backup, project/env confirmation, and owner approval.

create or replace function public.update_shipping_request_status(
  p_shipping_request_id uuid,
  p_admin_id uuid,
  p_status text,
  p_tracking_provider text default null,
  p_tracking_number text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.shipping_requests%rowtype;
  v_previous_status text;
  v_item_count integer := 0;
  v_tracking_provider text := nullif(left(btrim(coalesce(p_tracking_provider, '')), 120), '');
  v_tracking_number text := nullif(left(btrim(coalesce(p_tracking_number, '')), 120), '');
  v_admin_note text := nullif(left(btrim(coalesce(p_admin_note, '')), 500), '');
begin
  if p_shipping_request_id is null then
    raise exception 'shipping_request_required' using errcode = '22023';
  end if;

  if p_admin_id is null then
    raise exception 'admin_required' using errcode = '22023';
  end if;

  if p_status not in ('submitted', 'packing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid_shipping_status' using errcode = '22023';
  end if;

  perform 1
  from public.admin_users admin
  where admin.id = p_admin_id
    and admin.is_active;

  if not found then
    raise exception 'active_admin_required' using errcode = '28000';
  end if;

  select *
  into v_request
  from public.shipping_requests
  where id = p_shipping_request_id
  for update;

  if not found then
    raise exception 'shipping_request_not_found' using errcode = 'P0002';
  end if;

  v_previous_status := v_request.status;

  if v_previous_status in ('delivered', 'cancelled') and p_status <> v_previous_status then
    raise exception 'shipping_request_terminal' using errcode = '22023';
  end if;

  if v_previous_status = 'draft' and p_status not in ('submitted', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'submitted' and p_status not in ('submitted', 'packing', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'packing' and p_status not in ('packing', 'shipped', 'cancelled') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  elsif v_previous_status = 'shipped' and p_status not in ('shipped', 'delivered') then
    raise exception 'invalid_shipping_transition' using errcode = '22023';
  end if;

  select count(*)
  into v_item_count
  from public.shipping_request_items
  where shipping_request_id = p_shipping_request_id;

  update public.shipping_requests
  set
    status = p_status,
    tracking_provider = v_tracking_provider,
    tracking_number = v_tracking_number,
    admin_note = v_admin_note,
    updated_at = now()
  where id = p_shipping_request_id
  returning * into v_request;

  if p_status in ('shipped', 'delivered') then
    update public.collection_items item
    set
      status = 'shipped',
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status in ('shipping_requested', 'shipped');
  elsif p_status = 'cancelled' then
    update public.collection_items item
    set
      status = 'owned',
      updated_at = now()
    from public.shipping_request_items request_item
    where request_item.shipping_request_id = p_shipping_request_id
      and request_item.collection_item_id = item.id
      and item.status = 'shipping_requested';
  end if;

  insert into public.audit_events (
    actor_admin_id,
    event_type,
    shipping_request_id,
    metadata
  ) values (
    p_admin_id,
    'shipping_status_updated',
    p_shipping_request_id,
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'status', v_request.status,
      'trackingProvider', v_tracking_provider,
      'trackingNumber', v_tracking_number,
      'adminNote', v_admin_note,
      'itemCount', v_item_count
    )
  );

  return jsonb_build_object(
    'shippingRequestId', v_request.id,
    'publicCode', v_request.public_code,
    'previousStatus', v_previous_status,
    'status', v_request.status,
    'itemCount', v_item_count
  );
end;
$$;

revoke all on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) to service_role;
