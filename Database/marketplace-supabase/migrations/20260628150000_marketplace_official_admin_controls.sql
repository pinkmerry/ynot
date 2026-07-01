-- Slice 7 Marketplace official inventory admin controls.
--
-- Additive rollback posture:
-- - Disable listing activation through marketplace feature flags.
-- - Restore visibility by publishing the inventory again when policy allows.
-- - Keep archived inventory, listing snapshots, orders, and audit events for history.

drop function if exists public.marketplace_hide_official_listing(uuid, text, text, text, uuid, text, integer, text);

create or replace function public.marketplace_hide_official_listing(
  p_listing_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_snapshot_version integer,
  p_admin_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'marketplace_admin_note_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'official_listing.hide',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_listing.hide'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = p_listing_id
    and listing_source = 'official_shop'
  for update;

  if listing_row.id is null then
    raise exception 'marketplace_listing_not_found';
  end if;
  if listing_row.snapshot_version <> p_expected_snapshot_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if listing_row.listing_state not in ('active', 'hidden') then
    raise exception 'marketplace_listing_state_invalid';
  end if;

  if exists (
    select 1
    from public.marketplace_pending_payment_orders pending_order
    where pending_order.inventory_item_id = listing_row.inventory_item_id
      and pending_order.order_state in ('pending_payment', 'payment_submitted')
      and pending_order.expires_at > now()
  ) then
    raise exception 'marketplace_official_active_pending_order_exists';
  end if;

  if exists (
    select 1
    from public.marketplace_orders orders
    where orders.inventory_item_id = listing_row.inventory_item_id
      and orders.payment_state in ('pending_payment', 'payment_submitted', 'paid')
      and orders.fulfilment_state not in ('cancelled', 'refunded', 'completed')
  ) then
    raise exception 'marketplace_official_active_order_exists';
  end if;

  update public.marketplace_listing_snapshots
  set listing_state = 'hidden',
      snapshot_version = snapshot_version + 1,
      updated_at = now()
  where id = listing_row.id
  returning * into listing_row;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_listing_hidden',
    jsonb_build_object(
      'listingId', listing_row.listing_id,
      'inventoryItemId', listing_row.inventory_item_id,
      'adminNote', trim(p_admin_note)
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'listingId', listing_row.listing_id,
    'inventoryId', listing_row.inventory_item_id,
    'listingState', listing_row.listing_state,
    'snapshotVersion', listing_row.snapshot_version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_update_official_inventory(uuid, text, text, text, uuid, text, bigint, text, text, integer, integer, text, jsonb, jsonb, text, text, text);

create or replace function public.marketplace_update_official_inventory(
  p_inventory_item_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint,
  p_title text default null,
  p_condition_code text default null,
  p_quantity_total integer default null,
  p_item_price_satang integer default null,
  p_public_description text default null,
  p_photo_urls jsonb default null,
  p_reference_snapshot jsonb default null,
  p_source_reference_id text default null,
  p_procurement_note text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  reserved_quantity integer := 0;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  next_title text;
  next_condition_code text;
  next_quantity_total integer;
  next_quantity_available integer;
  next_item_price_satang integer;
  next_public_description text;
  next_photo_urls jsonb;
  next_reference_snapshot jsonb;
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_admin_note is null then
    raise exception 'marketplace_admin_note_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'official_inventory.update',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_inventory.update'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = p_inventory_item_id
    and seller_type = 'official_shop'
    and source_kind = 'official_stock'
  for update;

  if inventory_row.id is null then
    raise exception 'marketplace_inventory_not_found';
  end if;
  if inventory_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if inventory_row.item_state in ('sold', 'archived') then
    raise exception 'marketplace_inventory_state_invalid';
  end if;

  if exists (
    select 1
    from public.marketplace_pending_payment_orders pending_order
    where pending_order.inventory_item_id = inventory_row.id
      and pending_order.order_state in ('pending_payment', 'payment_submitted')
      and pending_order.expires_at > now()
  ) then
    raise exception 'marketplace_official_active_pending_order_exists';
  end if;

  if exists (
    select 1
    from public.marketplace_orders orders
    where orders.inventory_item_id = inventory_row.id
      and orders.payment_state in ('pending_payment', 'payment_submitted', 'paid')
      and orders.fulfilment_state not in ('cancelled', 'refunded', 'completed')
  ) then
    raise exception 'marketplace_official_active_order_exists';
  end if;

  if p_quantity_total is not null and p_quantity_total < 1 then
    raise exception 'marketplace_quantity_invalid';
  end if;
  if p_item_price_satang is not null and p_item_price_satang <= 0 then
    raise exception 'marketplace_price_invalid';
  end if;
  if p_photo_urls is not null and (
    jsonb_typeof(p_photo_urls) <> 'array'
    or jsonb_array_length(p_photo_urls) > 10
  ) then
    raise exception 'marketplace_photo_urls_invalid';
  end if;
  if coalesce(p_reference_snapshot, '{}'::jsonb)::text ~* '(customer_bag|gacha|reward|draw)' then
    raise exception 'marketplace_official_stock_only';
  end if;

  reserved_quantity := greatest(inventory_row.quantity_total - inventory_row.quantity_available, 0);
  next_quantity_total := coalesce(p_quantity_total, inventory_row.quantity_total);
  if next_quantity_total < reserved_quantity then
    raise exception 'marketplace_quantity_invalid';
  end if;
  next_quantity_available := next_quantity_total - reserved_quantity;
  next_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), inventory_row.title_snapshot);
  next_condition_code := coalesce(nullif(trim(coalesce(p_condition_code, '')), ''), inventory_row.condition_code);
  next_item_price_satang := coalesce(p_item_price_satang, inventory_row.item_price_satang);
  next_public_description := coalesce(
    nullif(trim(coalesce(p_public_description, '')), ''),
    inventory_row.public_description
  );
  next_photo_urls := coalesce(p_photo_urls, inventory_row.photo_urls, '[]'::jsonb);
  next_reference_snapshot := coalesce(p_reference_snapshot, inventory_row.reference_snapshot, '{}'::jsonb);

  update public.marketplace_inventory_sources
  set source_reference_id = coalesce(
        nullif(trim(coalesce(p_source_reference_id, '')), ''),
        source_reference_id
      ),
      procurement_note = coalesce(
        nullif(trim(coalesce(p_procurement_note, '')), ''),
        procurement_note
      ),
      private_admin_note = concat_ws(E'\n', nullif(private_admin_note, ''), normalized_admin_note),
      updated_at = now()
  where id = inventory_row.inventory_source_id
    and source_kind = 'official_stock';

  update public.marketplace_inventory_items
  set title_snapshot = next_title,
      condition_code = next_condition_code,
      reference_snapshot = next_reference_snapshot,
      quantity_total = next_quantity_total,
      quantity_available = next_quantity_available,
      item_price_satang = next_item_price_satang,
      public_description = next_public_description,
      photo_urls = next_photo_urls,
      admin_note = concat_ws(E'\n', nullif(admin_note, ''), normalized_admin_note),
      version = version + 1,
      updated_at = now()
  where id = inventory_row.id
  returning * into inventory_row;

  update public.marketplace_listing_snapshots
  set title = inventory_row.title_snapshot,
      item_price_satang = inventory_row.item_price_satang,
      quantity_available_snapshot = inventory_row.quantity_available,
      public_description = inventory_row.public_description,
      photo_urls = inventory_row.photo_urls,
      snapshot_payload = coalesce(snapshot_payload, '{}'::jsonb) || jsonb_build_object(
        'sourceBadge', 'Official shop',
        'itemType', inventory_row.item_type,
        'conditionCode', inventory_row.condition_code,
        'sourceKind', 'official_stock'
      ),
      snapshot_version = snapshot_version + 1,
      updated_at = now()
  where inventory_item_id = inventory_row.id
    and listing_source = 'official_shop'
    and listing_state in ('draft', 'active', 'hidden');

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_inventory_updated',
    jsonb_build_object(
      'inventoryItemId', inventory_row.id,
      'version', inventory_row.version,
      'adminNote', normalized_admin_note
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'inventoryId', inventory_row.id,
    'itemState', inventory_row.item_state,
    'quantityTotal', inventory_row.quantity_total,
    'quantityAvailable', inventory_row.quantity_available,
    'itemPriceSatang', inventory_row.item_price_satang,
    'version', inventory_row.version,
    'currency', inventory_row.currency
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_update_official_listing(uuid, text, text, text, uuid, text, integer, text, text, text, jsonb, text);

create or replace function public.marketplace_update_official_listing(
  p_listing_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_snapshot_version integer,
  p_listing_state text default null,
  p_title text default null,
  p_public_description text default null,
  p_photo_urls jsonb default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  normalized_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  next_listing_state text;
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_admin_note is null then
    raise exception 'marketplace_admin_note_required';
  end if;
  if p_listing_state is not null and p_listing_state not in ('active', 'hidden') then
    raise exception 'marketplace_listing_state_invalid';
  end if;
  if p_photo_urls is not null and (
    jsonb_typeof(p_photo_urls) <> 'array'
    or jsonb_array_length(p_photo_urls) > 10
  ) then
    raise exception 'marketplace_photo_urls_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'official_listing.update',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_listing.update'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = p_listing_id
    and listing_source = 'official_shop'
  for update;

  if listing_row.id is null then
    raise exception 'marketplace_listing_not_found';
  end if;
  if listing_row.snapshot_version <> p_expected_snapshot_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if listing_row.listing_state not in ('active', 'hidden') then
    raise exception 'marketplace_listing_state_invalid';
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = listing_row.inventory_item_id
    and seller_type = 'official_shop'
    and source_kind = 'official_stock'
  for update;

  if inventory_row.id is null then
    raise exception 'marketplace_inventory_not_found';
  end if;
  if inventory_row.item_state in ('sold', 'archived') then
    raise exception 'marketplace_inventory_state_invalid';
  end if;

  if exists (
    select 1
    from public.marketplace_pending_payment_orders pending_order
    where pending_order.inventory_item_id = inventory_row.id
      and pending_order.order_state in ('pending_payment', 'payment_submitted')
      and pending_order.expires_at > now()
  ) then
    raise exception 'marketplace_official_active_pending_order_exists';
  end if;

  if exists (
    select 1
    from public.marketplace_orders orders
    where orders.inventory_item_id = inventory_row.id
      and orders.payment_state in ('pending_payment', 'payment_submitted', 'paid')
      and orders.fulfilment_state not in ('cancelled', 'refunded', 'completed')
  ) then
    raise exception 'marketplace_official_active_order_exists';
  end if;

  next_listing_state := coalesce(p_listing_state, listing_row.listing_state);
  if next_listing_state = 'active' and listing_row.quantity_available_snapshot < 1 then
    raise exception 'marketplace_listing_not_available';
  end if;

  update public.marketplace_listing_snapshots
  set listing_state = next_listing_state,
      title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
      public_description = coalesce(
        nullif(trim(coalesce(p_public_description, '')), ''),
        public_description
      ),
      photo_urls = coalesce(p_photo_urls, photo_urls, '[]'::jsonb),
      snapshot_version = snapshot_version + 1,
      updated_at = now()
  where id = listing_row.id
  returning * into listing_row;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_listing_updated',
    jsonb_build_object(
      'listingId', listing_row.listing_id,
      'inventoryItemId', listing_row.inventory_item_id,
      'listingState', listing_row.listing_state,
      'adminNote', normalized_admin_note
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'listingId', listing_row.listing_id,
    'inventoryId', listing_row.inventory_item_id,
    'listingState', listing_row.listing_state,
    'snapshotVersion', listing_row.snapshot_version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

drop function if exists public.marketplace_archive_official_inventory(uuid, text, text, text, uuid, text, bigint, text);

create or replace function public.marketplace_archive_official_inventory(
  p_inventory_item_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint,
  p_admin_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  listing_count integer := 0;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'marketplace_admin_note_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_admin_profile_id,
    'official_inventory.archive',
    normalized_idempotency_key,
    normalized_request_hash,
    now(),
    now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'official_inventory.archive'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into inventory_row
  from public.marketplace_inventory_items
  where id = p_inventory_item_id
    and seller_type = 'official_shop'
    and source_kind = 'official_stock'
  for update;

  if inventory_row.id is null then
    raise exception 'marketplace_inventory_not_found';
  end if;
  if inventory_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if inventory_row.item_state in ('sold', 'archived') then
    raise exception 'marketplace_inventory_state_invalid';
  end if;

  if exists (
    select 1
    from public.marketplace_pending_payment_orders pending_order
    where pending_order.inventory_item_id = inventory_row.id
      and pending_order.order_state in ('pending_payment', 'payment_submitted')
      and pending_order.expires_at > now()
  ) then
    raise exception 'marketplace_official_active_pending_order_exists';
  end if;

  if exists (
    select 1
    from public.marketplace_orders orders
    where orders.inventory_item_id = inventory_row.id
      and orders.payment_state in ('pending_payment', 'payment_submitted', 'paid')
      and orders.fulfilment_state not in ('cancelled', 'refunded')
  ) then
    raise exception 'marketplace_official_active_order_exists';
  end if;

  update public.marketplace_listing_snapshots
  set listing_state = 'archived',
      snapshot_version = snapshot_version + 1,
      updated_at = now()
  where inventory_item_id = inventory_row.id
    and listing_source = 'official_shop'
    and listing_state in ('draft', 'active', 'hidden');

  get diagnostics listing_count = row_count;

  update public.marketplace_inventory_sources
  set source_state = 'archived'
  where id = inventory_row.inventory_source_id
    and source_kind = 'official_stock';

  update public.marketplace_inventory_items
  set item_state = 'archived',
      version = version + 1,
      admin_note = concat_ws(E'\n', nullif(admin_note, ''), trim(p_admin_note)),
      updated_at = now()
  where id = inventory_row.id
  returning * into inventory_row;

  insert into public.marketplace_audit_events(
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    p_admin_profile_id,
    p_admin_role,
    'marketplace_official_inventory_archived',
    jsonb_build_object(
      'inventoryItemId', inventory_row.id,
      'listingRowsArchived', coalesce(listing_count, 0),
      'adminNote', trim(p_admin_note)
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'inventoryId', inventory_row.id,
    'itemState', inventory_row.item_state,
    'version', inventory_row.version,
    'listingRowsArchived', coalesce(listing_count, 0)
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_hide_official_listing(uuid, text, text, text, uuid, text, integer, text)
from public, anon, authenticated;
revoke all on function public.marketplace_archive_official_inventory(uuid, text, text, text, uuid, text, bigint, text)
from public, anon, authenticated;
revoke all on function public.marketplace_update_official_inventory(uuid, text, text, text, uuid, text, bigint, text, text, integer, integer, text, jsonb, jsonb, text, text, text)
from public, anon, authenticated;
revoke all on function public.marketplace_update_official_listing(uuid, text, text, text, uuid, text, integer, text, text, text, jsonb, text)
from public, anon, authenticated;

grant execute on function public.marketplace_hide_official_listing(uuid, text, text, text, uuid, text, integer, text)
to service_role;
grant execute on function public.marketplace_archive_official_inventory(uuid, text, text, text, uuid, text, bigint, text)
to service_role;
grant execute on function public.marketplace_update_official_inventory(uuid, text, text, text, uuid, text, bigint, text, text, integer, integer, text, jsonb, jsonb, text, text, text)
to service_role;
grant execute on function public.marketplace_update_official_listing(uuid, text, text, text, uuid, text, integer, text, text, text, jsonb, text)
to service_role;
