-- Keep the legacy synchronous shipping fallback aligned with the newer
-- quote/start shipping flow. It remains for older clients, but it must honor
-- reward fulfillment policy at the database boundary.

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
  updated_count integer;
  shipping_row public.shipping_requests%rowtype;
  existing_request public.shipping_requests%rowtype;
  address_row public.user_addresses%rowtype;
  selected_coin_value integer := 0;
  minimum_coin_value integer := 1000;
  ship_only_count integer := 0;
  address_snapshot jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ynot-profile-action:' || p_profile_id::text, 0));

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

  if exists (
    select 1
    from public.shipping_request_jobs active_job
    where active_job.profile_id = p_profile_id
      and active_job.status in ('preparing', 'processing', 'retry_required')
  ) then
    raise exception 'shipping_request_active_exists';
  end if;

  if exists (
    select 1
    from public.reward_conversion_jobs active_conversion
    where active_conversion.profile_id = p_profile_id
      and active_conversion.status in ('queued', 'processing', 'retry_required')
  ) then
    raise exception 'reward_conversion_active_blocks_shipping';
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
    and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
    and ci.shipping_request_job_id is null
  for update;

  select
    count(*),
    coalesce(sum(case
      when ci.fulfillment_policy_snapshot = 'ship_or_convert'
        then coalesce(ci.convert_coin_value_snapshot, 0)
      else 0
    end), 0),
    (count(*) filter (where ci.fulfillment_policy_snapshot = 'ship_only'))::int
  into valid_count, selected_coin_value, ship_only_count
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
    and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
    and ci.shipping_request_job_id is null;

  if valid_count <> requested_count then
    raise exception 'collection_item_not_shippable';
  end if;

  if ship_only_count = 0 and selected_coin_value < minimum_coin_value then
    raise exception 'shipping_minimum_coin_value_required';
  end if;

  address_snapshot := public.shipping_address_snapshot(address_row);

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
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
    and ci.fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
    and ci.shipping_request_job_id is null;

  update public.collection_items
  set
    status = 'shipping_requested',
    shipping_request_id = shipping_row.id,
    shipping_request_job_id = null,
    updated_at = now()
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id
    and status = 'owned'
    and fulfillment_policy_snapshot in ('ship_or_convert', 'ship_only')
    and shipping_request_job_id is null;

  get diagnostics updated_count = row_count;
  if updated_count <> requested_count then
    raise exception 'shipping_claim_mismatch';
  end if;

  insert into public.audit_events(actor_profile_id, event_type, shipping_request_id, metadata)
  values (
    p_profile_id,
    'shipping_submitted',
    shipping_row.id,
    jsonb_build_object(
      'item_count', requested_count,
      'selectedCoinValue', selected_coin_value,
      'minimumCoinValue', minimum_coin_value,
      'shipOnlyCount', ship_only_count,
      'legacyFallback', true
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

revoke all on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.request_shipping_for_items(uuid, uuid, uuid[], text, text)
  to service_role;
