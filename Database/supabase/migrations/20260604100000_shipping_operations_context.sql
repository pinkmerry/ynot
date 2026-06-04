-- Store immutable shipping context and enforce server-side shipment guards.
-- Production guard: apply only after backup, project/env confirmation, and owner approval.

alter table public.shipping_requests
  add column if not exists address_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.prevent_shipping_address_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.address_snapshot is distinct from new.address_snapshot
    and old.address_snapshot <> '{}'::jsonb
  then
    raise exception 'shipping_address_snapshot_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists shipping_requests_address_snapshot_immutable
  on public.shipping_requests;

create trigger shipping_requests_address_snapshot_immutable
before update of address_snapshot on public.shipping_requests
for each row
execute function public.prevent_shipping_address_snapshot_update();

create index if not exists audit_events_shipping_request_created_idx
  on public.audit_events(shipping_request_id, created_at)
  where shipping_request_id is not null;

create index if not exists audit_events_actor_profile_created_idx
  on public.audit_events(actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create index if not exists draw_round_prize_units_collection_item_open_item_idx
  on public.draw_round_prize_units(collection_item_id, gacha_open_item_id)
  where collection_item_id is not null;

create or replace function public.request_shipping_for_items(
  p_profile_id uuid,
  p_address_id uuid,
  p_collection_item_ids uuid[],
  p_customer_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  requested_count integer;
  valid_count integer;
  shipping_row public.shipping_requests%rowtype;
  existing_request public.shipping_requests%rowtype;
  address_row public.user_addresses%rowtype;
  selected_coin_value integer := 0;
  minimum_coin_value integer := 1000;
  address_snapshot jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_request
    from public.shipping_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_request.id is not null then
      return jsonb_build_object(
        'status', existing_request.status,
        'shippingRequestId', existing_request.id,
        'publicCode', existing_request.public_code,
        'replayed', true
      );
    end if;
  end if;

  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select *
  into address_row
  from public.user_addresses ua
  where ua.id = p_address_id
    and ua.profile_id = p_profile_id;

  if not found
    or nullif(btrim(coalesce(address_row.recipient_name, '')), '') is null
    or nullif(btrim(coalesce(address_row.phone, '')), '') is null
    or nullif(btrim(coalesce(address_row.address_line1, '')), '') is null
    or nullif(btrim(coalesce(address_row.subdistrict, '')), '') is null
    or nullif(btrim(coalesce(address_row.district, '')), '') is null
    or nullif(btrim(coalesce(address_row.province, '')), '') is null
    or nullif(btrim(coalesce(address_row.postal_code, '')), '') is null
    or nullif(btrim(coalesce(address_row.country, '')), '') is null
  then
    raise exception 'valid_shipping_address_required';
  end if;

  select count(distinct item_id)
  into requested_count
  from unnest(p_collection_item_ids) as item_id;

  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
  for update;

  select
    count(*),
    coalesce(sum(coalesce(ci.convert_coin_value_snapshot, 0)), 0)
  into valid_count, selected_coin_value
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned';

  if valid_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;

  if selected_coin_value < minimum_coin_value then
    raise exception 'shipping_minimum_coin_value_required';
  end if;

  address_snapshot := jsonb_build_object(
    'label', address_row.label,
    'recipientName', address_row.recipient_name,
    'phone', address_row.phone,
    'addressLine1', address_row.address_line1,
    'addressLine2', address_row.address_line2,
    'subdistrict', address_row.subdistrict,
    'district', address_row.district,
    'province', address_row.province,
    'postalCode', address_row.postal_code,
    'country', address_row.country,
    'deliveryNote', address_row.delivery_note
  );

  insert into public.shipping_requests(
    profile_id,
    address_id,
    address_snapshot,
    status,
    customer_note,
    idempotency_key
  )
  values (
    p_profile_id,
    p_address_id,
    address_snapshot,
    'submitted',
    p_customer_note,
    p_idempotency_key
  )
  returning * into shipping_row;

  insert into public.shipping_request_items(shipping_request_id, collection_item_id, card_id)
  select shipping_row.id, ci.id, ci.card_id
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id;

  update public.collection_items
  set
    status = 'shipping_requested',
    updated_at = now()
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (
    p_profile_id,
    'shipping_submitted',
    shipping_row.id,
    jsonb_build_object(
      'item_count', requested_count,
      'selectedCoinValue', selected_coin_value,
      'minimumCoinValue', minimum_coin_value
    )
  );

  return jsonb_build_object(
    'status', 'submitted',
    'shippingRequestId', shipping_row.id,
    'publicCode', shipping_row.public_code,
    'itemCount', requested_count
  );
end;
$$;

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
  v_next_tracking_provider text;
  v_next_tracking_number text;
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

  v_next_tracking_provider := coalesce(v_tracking_provider, v_request.tracking_provider);
  v_next_tracking_number := coalesce(v_tracking_number, v_request.tracking_number);

  if p_status in ('shipped', 'delivered')
    and (v_next_tracking_provider is null or v_next_tracking_number is null)
  then
    raise exception 'shipping_tracking_required' using errcode = '22023';
  end if;

  select count(*)
  into v_item_count
  from public.shipping_request_items
  where shipping_request_id = p_shipping_request_id;

  update public.shipping_requests
  set
    status = p_status,
    tracking_provider = v_next_tracking_provider,
    tracking_number = v_next_tracking_number,
    admin_note = coalesce(v_admin_note, admin_note),
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
      'trackingProvider', v_next_tracking_provider,
      'trackingNumber', v_next_tracking_number,
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

revoke all on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text) to service_role;

revoke all on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_shipping_request_status(uuid, uuid, text, text, text, text) to service_role;
