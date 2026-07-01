-- Customer cart/watchlist RPC contract.
-- Cart and watchlist stay account-persistent, public-safe, and service-role only.

create index if not exists marketplace_cart_items_buyer_listing_idx
  on public.marketplace_cart_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_watchlist_items_buyer_listing_idx
  on public.marketplace_watchlist_items(buyer_marketplace_account_id, listing_id);

create index if not exists marketplace_listing_snapshots_cart_availability_idx
  on public.marketplace_listing_snapshots(listing_id, listing_state, quantity_available_snapshot);

create or replace function public.marketplace_require_customer_account(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_buyer_marketplace_account_id is null or p_actor_profile_id is null then
    raise exception 'marketplace_account_required';
  end if;

  if not exists (
    select 1
    from public.marketplace_accounts account
    where account.id = p_buyer_marketplace_account_id
      and account.ynot_profile_id = p_actor_profile_id
      and account.profile_status_snapshot = 'active'
      and account.buyer_status = 'active'
  ) then
    raise exception 'marketplace_account_required';
  end if;

  return p_buyer_marketplace_account_id;
end;
$$;

create or replace function public.marketplace_customer_listing_payload(
  p_listing public.marketplace_listing_snapshots,
  p_seller_public_profile_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'listingId', p_listing.listing_id,
    'inventoryItemId', p_listing.inventory_item_id,
    'productId', p_listing.product_id,
    'variantId', p_listing.variant_id,
    'sellerPublicProfileId', p_seller_public_profile_id,
    'listingSource', p_listing.listing_source,
    'listingState', p_listing.listing_state,
    'publicSlug', p_listing.public_slug,
    'title', p_listing.title,
    'itemPriceSatang', p_listing.item_price_satang,
    'currency', p_listing.currency,
    'quantityAvailableSnapshot', p_listing.quantity_available_snapshot,
    'publicDescription', p_listing.public_description,
    'photoUrls', coalesce(p_listing.photo_urls, '[]'::jsonb),
    'snapshotVersion', p_listing.snapshot_version,
    'visibleFrom', p_listing.visible_from,
    'updatedAt', p_listing.updated_at,
    'publicAttributes', jsonb_strip_nulls(jsonb_build_object(
      'sourceBadge', p_listing.snapshot_payload ->> 'sourceBadge',
      'itemType', p_listing.snapshot_payload ->> 'itemType',
      'conditionCode', p_listing.snapshot_payload ->> 'conditionCode',
      'sourceKind', p_listing.snapshot_payload ->> 'sourceKind',
      'productSlug', p_listing.snapshot_payload ->> 'productSlug',
      'variantSlug', p_listing.snapshot_payload ->> 'variantSlug',
      'variantLabel', p_listing.snapshot_payload ->> 'variantLabel',
      'conditionBucket', p_listing.snapshot_payload ->> 'conditionBucket',
      'gradeService', p_listing.snapshot_payload ->> 'gradeService',
      'gradeValue', p_listing.snapshot_payload ->> 'gradeValue'
    ))
  );
$$;

create or replace function public.marketplace_get_customer_cart_summary(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with account_guard as (
    select public.marketplace_require_customer_account(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    ) as account_id
  ),
  cart_rows as (
    select
      cart.listing_id,
      coalesce(cart.quantity, 1) as quantity,
      listing.listing_state,
      listing.item_price_satang,
      listing.currency,
      listing.quantity_available_snapshot,
      cart.updated_at
    from public.marketplace_cart_items cart
    left join public.marketplace_listing_snapshots listing
      on listing.listing_id = cart.listing_id
    where cart.buyer_marketplace_account_id = (select account_id from account_guard)
  ),
  watch_rows as (
    select 1
    from public.marketplace_watchlist_items watch
    where watch.buyer_marketplace_account_id = (select account_id from account_guard)
  )
  select jsonb_build_object(
    'cartCount', coalesce(count(*) filter (where listing_state = 'active' and quantity_available_snapshot > 0), 0),
    'watchlistCount', (select count(*) from watch_rows),
    'subtotalSatang', coalesce(sum(item_price_satang * quantity) filter (where listing_state = 'active' and quantity_available_snapshot > 0), 0),
    'unavailableCount', coalesce(count(*) filter (where listing_state is null or listing_state <> 'active' or quantity_available_snapshot < 1), 0),
    'currency', 'THB',
    'updatedAt', max(updated_at)
  )
  from cart_rows;
$$;

create or replace function public.marketplace_list_customer_cart(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with account_guard as (
    select public.marketplace_require_customer_account(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    ) as account_id
  ),
  limited_rows as (
    select
      cart.id,
      cart.listing_id,
      cart.quantity,
      cart.created_at,
      cart.updated_at,
      listing,
      seller_profile.seller_public_profile_id
    from public.marketplace_cart_items cart
    left join public.marketplace_listing_snapshots listing
      on listing.listing_id = cart.listing_id
    left join public.marketplace_public_seller_profiles seller_profile
      on seller_profile.marketplace_account_id = listing.seller_marketplace_account_id
      and seller_profile.status = 'active'
    where cart.buyer_marketplace_account_id = (select account_id from account_guard)
    order by cart.updated_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'listingId', listing_id,
        'quantity', quantity,
        'createdAt', created_at,
        'updatedAt', updated_at,
        'listing', case
          when listing is null then null
          else public.marketplace_customer_listing_payload(listing, seller_public_profile_id)
        end
      )
      order by updated_at desc
    ), '[]'::jsonb),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  )
  from limited_rows;
$$;

create or replace function public.marketplace_list_customer_watchlist(
  p_buyer_marketplace_account_id uuid,
  p_actor_profile_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with account_guard as (
    select public.marketplace_require_customer_account(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    ) as account_id
  ),
  limited_rows as (
    select
      watch.id,
      watch.listing_id,
      watch.created_at,
      watch.updated_at,
      listing,
      seller_profile.seller_public_profile_id
    from public.marketplace_watchlist_items watch
    left join public.marketplace_listing_snapshots listing
      on listing.listing_id = watch.listing_id
    left join public.marketplace_public_seller_profiles seller_profile
      on seller_profile.marketplace_account_id = listing.seller_marketplace_account_id
      and seller_profile.status = 'active'
    where watch.buyer_marketplace_account_id = (select account_id from account_guard)
    order by watch.updated_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'listingId', listing_id,
        'createdAt', created_at,
        'updatedAt', updated_at,
        'listing', case
          when listing is null then null
          else public.marketplace_customer_listing_payload(listing, seller_public_profile_id)
        end
      )
      order by updated_at desc
    ), '[]'::jsonb),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  )
  from limited_rows;
$$;

create or replace function public.marketplace_add_customer_cart_item(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  cart_row public.marketplace_cart_items%rowtype;
  seller_public_profile_id uuid;
  was_inserted boolean := false;
  mutation_status text := 'already_in_cart';
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  safe_quantity integer := 1;
  rpc_response_payload jsonb;
begin
  perform public.marketplace_require_customer_account(
    p_buyer_marketplace_account_id,
    p_actor_profile_id
  );
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;
  if p_quantity is not null and p_quantity <> 1 then
    raise exception 'marketplace_quantity_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    'cart.item.add',
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
    where ynot_profile_id = p_actor_profile_id
      and scope = 'cart.item.add'
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
  for update;

  if listing_row.listing_id is null then
    raise exception 'marketplace_listing_not_found';
  end if;
  if listing_row.listing_state <> 'active' or listing_row.quantity_available_snapshot < 1 then
    raise exception 'marketplace_listing_not_available';
  end if;

  select seller_profile.seller_public_profile_id into seller_public_profile_id
  from public.marketplace_public_seller_profiles seller_profile
  where seller_profile.marketplace_account_id = listing_row.seller_marketplace_account_id
    and seller_profile.status = 'active';

  insert into public.marketplace_cart_items(
    buyer_marketplace_account_id,
    listing_id,
    quantity
  ) values (
    p_buyer_marketplace_account_id,
    p_listing_id,
    safe_quantity
  )
  on conflict (buyer_marketplace_account_id, listing_id)
  do nothing
  returning * into cart_row;

  was_inserted := cart_row.id is not null;

  if not was_inserted then
    select * into cart_row
    from public.marketplace_cart_items
    where buyer_marketplace_account_id = p_buyer_marketplace_account_id
      and listing_id = p_listing_id;
  end if;

  mutation_status := case when was_inserted then 'added' else 'already_in_cart' end;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    p_actor_profile_id,
    'marketplace_cart_item_added',
    jsonb_build_object(
      'listingId', p_listing_id,
      'cartItemId', cart_row.id,
      'status', mutation_status
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'status', mutation_status,
    'item', jsonb_build_object(
      'id', cart_row.id,
      'listingId', cart_row.listing_id,
      'quantity', cart_row.quantity,
      'createdAt', cart_row.created_at,
      'updatedAt', cart_row.updated_at,
      'listing', public.marketplace_customer_listing_payload(listing_row, seller_public_profile_id)
    ),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_remove_customer_cart_item(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  cart_row public.marketplace_cart_items%rowtype;
  mutation_status text := 'not_in_cart';
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  perform public.marketplace_require_customer_account(
    p_buyer_marketplace_account_id,
    p_actor_profile_id
  );
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    'cart.item.remove',
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
    where ynot_profile_id = p_actor_profile_id
      and scope = 'cart.item.remove'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  delete from public.marketplace_cart_items
  where buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_id = p_listing_id
  returning * into cart_row;

  mutation_status := case when cart_row.id is null then 'not_in_cart' else 'removed' end;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    p_actor_profile_id,
    'marketplace_cart_item_removed',
    jsonb_build_object(
      'listingId', p_listing_id,
      'status', mutation_status
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'status', mutation_status,
    'item', null,
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_watch_listing(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  watch_row public.marketplace_watchlist_items%rowtype;
  seller_public_profile_id uuid;
  was_inserted boolean := false;
  mutation_status text := 'already_watched';
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  perform public.marketplace_require_customer_account(
    p_buyer_marketplace_account_id,
    p_actor_profile_id
  );
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    'watchlist.item.watch',
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
    where ynot_profile_id = p_actor_profile_id
      and scope = 'watchlist.item.watch'
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
  for update;

  if listing_row.listing_id is null then
    raise exception 'marketplace_listing_not_found';
  end if;
  if listing_row.listing_state <> 'active' or listing_row.quantity_available_snapshot < 1 then
    raise exception 'marketplace_listing_not_available';
  end if;

  select seller_profile.seller_public_profile_id into seller_public_profile_id
  from public.marketplace_public_seller_profiles seller_profile
  where seller_profile.marketplace_account_id = listing_row.seller_marketplace_account_id
    and seller_profile.status = 'active';

  insert into public.marketplace_watchlist_items(
    buyer_marketplace_account_id,
    listing_id
  ) values (
    p_buyer_marketplace_account_id,
    p_listing_id
  )
  on conflict (buyer_marketplace_account_id, listing_id)
  do nothing
  returning * into watch_row;

  was_inserted := watch_row.id is not null;

  if not was_inserted then
    select * into watch_row
    from public.marketplace_watchlist_items
    where buyer_marketplace_account_id = p_buyer_marketplace_account_id
      and listing_id = p_listing_id;
  end if;

  mutation_status := case when was_inserted then 'watched' else 'already_watched' end;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    p_actor_profile_id,
    'marketplace_listing_watched',
    jsonb_build_object(
      'listingId', p_listing_id,
      'watchlistItemId', watch_row.id,
      'status', mutation_status
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'status', mutation_status,
    'item', jsonb_build_object(
      'id', watch_row.id,
      'listingId', watch_row.listing_id,
      'createdAt', watch_row.created_at,
      'updatedAt', watch_row.updated_at,
      'listing', public.marketplace_customer_listing_payload(listing_row, seller_public_profile_id)
    ),
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

create or replace function public.marketplace_unwatch_listing(
  p_buyer_marketplace_account_id uuid,
  p_listing_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  watch_row public.marketplace_watchlist_items%rowtype;
  mutation_status text := 'not_watched';
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  rpc_response_payload jsonb;
begin
  perform public.marketplace_require_customer_account(
    p_buyer_marketplace_account_id,
    p_actor_profile_id
  );
  if normalized_idempotency_key is null or length(normalized_idempotency_key) < 8 then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if normalized_request_hash is null or length(normalized_request_hash) < 16 then
    raise exception 'marketplace_request_hash_required';
  end if;

  insert into public.marketplace_idempotency_keys(
    marketplace_account_id,
    ynot_profile_id,
    scope,
    idempotency_key,
    request_hash,
    locked_at,
    expires_at
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    'watchlist.item.unwatch',
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
    where ynot_profile_id = p_actor_profile_id
      and scope = 'watchlist.item.unwatch'
      and idempotency_key = normalized_idempotency_key
    for update;

    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  delete from public.marketplace_watchlist_items
  where buyer_marketplace_account_id = p_buyer_marketplace_account_id
    and listing_id = p_listing_id
  returning * into watch_row;

  mutation_status := case when watch_row.id is null then 'not_watched' else 'unwatched' end;

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    event_type,
    event_payload,
    request_id
  ) values (
    p_buyer_marketplace_account_id,
    p_actor_profile_id,
    p_actor_profile_id,
    'marketplace_listing_unwatched',
    jsonb_build_object(
      'listingId', p_listing_id,
      'status', mutation_status
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'status', mutation_status,
    'item', null,
    'summary', public.marketplace_get_customer_cart_summary(
      p_buyer_marketplace_account_id,
      p_actor_profile_id
    )
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_require_customer_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_customer_listing_payload(public.marketplace_listing_snapshots, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_list_customer_cart(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.marketplace_get_customer_cart_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_add_customer_cart_item(uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_remove_customer_cart_item(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_list_customer_watchlist(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.marketplace_watch_listing(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_unwatch_listing(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.marketplace_require_customer_account(uuid, uuid) to service_role;
grant execute on function public.marketplace_customer_listing_payload(public.marketplace_listing_snapshots, uuid) to service_role;
grant execute on function public.marketplace_list_customer_cart(uuid, uuid, integer) to service_role;
grant execute on function public.marketplace_get_customer_cart_summary(uuid, uuid) to service_role;
grant execute on function public.marketplace_add_customer_cart_item(uuid, uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_remove_customer_cart_item(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_list_customer_watchlist(uuid, uuid, integer) to service_role;
grant execute on function public.marketplace_watch_listing(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.marketplace_unwatch_listing(uuid, uuid, text, text, text, uuid) to service_role;
