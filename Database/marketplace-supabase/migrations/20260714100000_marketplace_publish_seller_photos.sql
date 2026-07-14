-- Publish approved seller-submission photos in their stored display order.
--
-- The Storage bucket remains private. The application supplies guarded site
-- URLs for the submitted photos, and this activation transaction persists the
-- same ordered array on Inventory + Listing while making element zero the
-- canonical Product hero shown on the Marketplace browse page.
--
-- Rollback: create a forward migration that restores the prior activation
-- function from 20260628120000_marketplace_user_seller_purchase.sql.

create or replace function public.marketplace_admin_activate_seller_listing(
  p_submission_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_expected_version bigint,
  p_public_description text default null,
  p_photo_urls jsonb default '[]'::jsonb,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  submission_row public.marketplace_seller_submissions%rowtype;
  source_row public.marketplace_inventory_sources%rowtype;
  inventory_row public.marketplace_inventory_items%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  product_row public.marketplace_products%rowtype;
  variant_row public.marketplace_product_variants%rowtype;
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_request_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  public_photo_prefix text;
  resolved_condition_bucket text;
  resolved_grade_service text;
  resolved_grade_value text;
  rpc_response_payload jsonb;
begin
  if p_admin_profile_id is null or p_admin_role not in ('owner', 'admin', 'staff') then
    raise exception 'marketplace_admin_required';
  end if;
  if normalized_idempotency_key is null or normalized_request_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if jsonb_typeof(coalesce(p_photo_urls, '[]'::jsonb)) <> 'array' then
    raise exception 'marketplace_seller_photo_invalid';
  end if;
  if jsonb_array_length(coalesce(p_photo_urls, '[]'::jsonb)) < 1
    or jsonb_array_length(coalesce(p_photo_urls, '[]'::jsonb)) > 10 then
    raise exception 'marketplace_seller_photo_required';
  end if;

  public_photo_prefix := '/api/marketplace/files/seller-submissions/'
    || p_submission_id::text || '/photos/';
  if exists (
    select 1
    from jsonb_array_elements_text(p_photo_urls) as photo_url(value)
    where photo_url.value not like public_photo_prefix || '%'
      or length(photo_url.value) > 500
  ) then
    raise exception 'marketplace_seller_photo_invalid';
  end if;

  insert into public.marketplace_idempotency_keys(
    ynot_profile_id, scope, idempotency_key, request_hash, locked_at, expires_at
  ) values (
    p_admin_profile_id, 'seller_listing.activate', normalized_idempotency_key,
    normalized_request_hash, now(), now() + interval '24 hours'
  )
  on conflict (ynot_profile_id, scope, idempotency_key) do nothing
  returning * into idempotency_row;

  if idempotency_row.id is null then
    select * into idempotency_row
    from public.marketplace_idempotency_keys
    where ynot_profile_id = p_admin_profile_id
      and scope = 'seller_listing.activate'
      and idempotency_key = normalized_idempotency_key
    for update;
    if idempotency_row.request_hash <> normalized_request_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  select * into submission_row
  from public.marketplace_seller_submissions
  where id = p_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'marketplace_seller_submission_not_found';
  end if;
  if submission_row.version <> p_expected_version then
    raise exception 'marketplace_version_conflict';
  end if;
  if submission_row.status <> 'inspection_passed' then
    raise exception 'marketplace_listing_activation_guard_failed';
  end if;
  if submission_row.approved_inventory_id is not null or submission_row.listing_id is not null then
    raise exception 'marketplace_listing_activation_guard_failed';
  end if;

  if coalesce(submission_row.reference_card_id, '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into product_row
    from public.marketplace_products
    where id = submission_row.reference_card_id::uuid
    for update;
  end if;

  if product_row.id is null then
    insert into public.marketplace_products(
      product_slug,
      title,
      category,
      series_name,
      set_name,
      card_code,
      language,
      hero_image_url,
      product_metadata
    ) values (
      'seller-' || replace(submission_row.id::text, '-', ''),
      submission_row.title_snapshot,
      coalesce(
        nullif(submission_row.reference_snapshot ->> 'categoryLabel', ''),
        nullif(submission_row.reference_snapshot ->> 'category', ''),
        'Single Cards'
      ),
      nullif(submission_row.variant_snapshot ->> 'series', ''),
      nullif(submission_row.variant_snapshot ->> 'set', ''),
      nullif(submission_row.variant_snapshot ->> 'code', ''),
      nullif(submission_row.language, ''),
      p_photo_urls ->> 0,
      jsonb_strip_nulls(
        jsonb_build_object(
          'sourceKind', 'seller_consignment',
          'sellerSubmissionId', submission_row.id,
          'sellerSubmissionNumber', submission_row.submission_number
        )
      )
    )
    returning * into product_row;
  else
    update public.marketplace_products
    set hero_image_url = p_photo_urls ->> 0,
        product_metadata = coalesce(product_metadata, '{}'::jsonb)
          || jsonb_build_object('lastSellerSubmissionId', submission_row.id),
        updated_at = now()
    where id = product_row.id
    returning * into product_row;
  end if;

  if coalesce(submission_row.reference_variant_id, '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into variant_row
    from public.marketplace_product_variants
    where id = submission_row.reference_variant_id::uuid
      and product_id = product_row.id
    for update;
  end if;

  resolved_grade_service := case lower(coalesce(submission_row.variant_snapshot ->> 'grader', ''))
    when 'psa' then 'PSA'
    when 'bgs' then 'BGS'
    when 'ars' then 'ARS'
    else case when submission_row.condition_code = 'graded' then 'OTHER' else null end
  end;
  resolved_grade_value := nullif(trim(coalesce(submission_row.grade_label, '')), '');
  resolved_condition_bucket := case
    when submission_row.condition_code <> 'graded' then 'raw_a'
    when resolved_grade_service = 'PSA' and resolved_grade_value ~* '(^|[^0-9])10([^0-9]|$)' then 'psa_10'
    when resolved_grade_service = 'PSA' and resolved_grade_value ~* '(^|[^0-9])9([^0-9]|$)' then 'psa_9'
    when resolved_grade_service = 'PSA' then 'psa_8_or_under'
    when resolved_grade_service = 'BGS' and resolved_grade_value ~* 'black label' then 'bgs_10_black_label'
    when resolved_grade_service = 'BGS' and resolved_grade_value ~* '(^|[^0-9])10([^0-9]|$)' then 'bgs_10_gold_label'
    when resolved_grade_service = 'BGS' and resolved_grade_value ~* '9[.]5' then 'bgs_9_5'
    when resolved_grade_service = 'BGS' then 'bgs_9_or_under'
    when resolved_grade_service = 'ARS' and resolved_grade_value ~* '10[+]' then 'ars_10_plus'
    when resolved_grade_service = 'ARS' and resolved_grade_value ~* '(^|[^0-9])10([^0-9]|$)' then 'ars_10'
    when resolved_grade_service = 'ARS' and resolved_grade_value ~* '(^|[^0-9])9([^0-9]|$)' then 'ars_9'
    when resolved_grade_service = 'ARS' then 'ars_8_or_under'
    else 'other_graded'
  end;

  if variant_row.id is null then
    insert into public.marketplace_product_variants(
      product_id,
      variant_slug,
      variant_label,
      condition_bucket,
      grade_service,
      grade_value,
      variant_snapshot,
      image_urls
    ) values (
      product_row.id,
      'seller-' || replace(submission_row.id::text, '-', ''),
      left(coalesce(resolved_grade_value, initcap(submission_row.condition_code)), 120),
      resolved_condition_bucket,
      resolved_grade_service,
      resolved_grade_value,
      coalesce(submission_row.variant_snapshot, '{}'::jsonb),
      p_photo_urls
    )
    returning * into variant_row;
  else
    update public.marketplace_product_variants
    set image_urls = p_photo_urls,
        updated_at = now()
    where id = variant_row.id
    returning * into variant_row;
  end if;

  insert into public.marketplace_inventory_sources(
    source_kind,
    source_state,
    source_reference_id,
    source_payload,
    private_admin_note,
    created_by_ynot_profile_id
  ) values (
    'seller_consignment',
    'approved',
    submission_row.submission_number,
    jsonb_build_object(
      'sellerConsignment', true,
      'submissionId', submission_row.id,
      'submissionNumber', submission_row.submission_number
    ),
    nullif(trim(coalesce(p_admin_note, '')), ''),
    p_admin_profile_id
  )
  returning * into source_row;

  insert into public.marketplace_inventory_items(
    owner_marketplace_account_id,
    inventory_source_id,
    product_id,
    variant_id,
    source_kind,
    seller_type,
    item_type,
    item_state,
    title_snapshot,
    condition_code,
    reference_snapshot,
    quantity_total,
    quantity_available,
    item_price_satang,
    currency,
    public_description,
    photo_urls,
    admin_note,
    seller_payout_state,
    created_by_ynot_profile_id,
    inspected_by_ynot_profile_id
  ) values (
    submission_row.marketplace_account_id,
    source_row.id,
    product_row.id,
    variant_row.id,
    'seller_consignment',
    'user_seller',
    submission_row.item_type,
    'listed',
    submission_row.title_snapshot,
    submission_row.condition_code,
    submission_row.reference_snapshot,
    1,
    1,
    submission_row.asking_price_satang,
    'THB',
    nullif(trim(coalesce(p_public_description, '')), ''),
    p_photo_urls,
    nullif(trim(coalesce(p_admin_note, '')), ''),
    'pending',
    submission_row.ynot_profile_id,
    p_admin_profile_id
  )
  returning * into inventory_row;

  insert into public.marketplace_listing_snapshots(
    inventory_item_id,
    seller_marketplace_account_id,
    product_id,
    variant_id,
    listing_source,
    listing_state,
    public_slug,
    title,
    item_price_satang,
    currency,
    quantity_available_snapshot,
    public_description,
    photo_urls,
    seller_payout_state,
    snapshot_payload,
    snapshot_version,
    visible_from
  ) values (
    inventory_row.id,
    submission_row.marketplace_account_id,
    product_row.id,
    variant_row.id,
    'user_seller',
    'active',
    'seller-' || replace(inventory_row.id::text, '-', ''),
    submission_row.title_snapshot,
    submission_row.asking_price_satang,
    'THB',
    1,
    nullif(trim(coalesce(p_public_description, '')), ''),
    p_photo_urls,
    'pending',
    jsonb_build_object(
      'sourceBadge', 'Seller consignment',
      'itemType', submission_row.item_type,
      'conditionCode', submission_row.condition_code,
      'conditionBucket', resolved_condition_bucket,
      'gradeService', resolved_grade_service,
      'gradeValue', resolved_grade_value,
      'sourceKind', 'seller_consignment',
      'sellerMarketplaceFeeBps', submission_row.seller_marketplace_fee_bps
    ),
    submission_row.version,
    now()
  )
  returning * into listing_row;

  update public.marketplace_seller_submissions
  set status = 'listed',
      approved_inventory_id = inventory_row.id,
      listing_id = listing_row.listing_id,
      admin_visible_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      version = version + 1
  where id = submission_row.id
  returning * into submission_row;

  insert into public.marketplace_seller_submission_events(
    submission_id,
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    before_status,
    after_status,
    event_payload,
    request_id
  ) values (
    submission_row.id,
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_listing_activated',
    'inspection_passed',
    'listed',
    jsonb_build_object(
      'inventoryItemId', inventory_row.id,
      'listingId', listing_row.listing_id,
      'productId', product_row.id,
      'variantId', variant_row.id,
      'photoCount', jsonb_array_length(p_photo_urls)
    ),
    p_request_id
  );

  insert into public.marketplace_audit_events(
    marketplace_account_id,
    ynot_profile_id,
    actor_ynot_profile_id,
    actor_admin_role,
    event_type,
    event_payload,
    request_id
  ) values (
    submission_row.marketplace_account_id,
    submission_row.ynot_profile_id,
    p_admin_profile_id,
    p_admin_role,
    'marketplace_seller_listing_activated',
    jsonb_build_object(
      'submissionId', submission_row.id,
      'inventoryItemId', inventory_row.id,
      'listingId', listing_row.listing_id,
      'productId', product_row.id,
      'variantId', variant_row.id,
      'sourceKind', 'seller_consignment',
      'photoCount', jsonb_array_length(p_photo_urls)
    ),
    p_request_id
  );

  rpc_response_payload := jsonb_build_object(
    'submissionId', submission_row.id,
    'inventoryId', inventory_row.id,
    'listingId', listing_row.listing_id,
    'productId', product_row.id,
    'productSlug', product_row.product_slug,
    'variantId', variant_row.id,
    'listingState', listing_row.listing_state,
    'sourceBadge', 'Seller consignment',
    'heroImageUrl', product_row.hero_image_url,
    'currency', 'THB',
    'sellerPayoutState', 'pending',
    'version', submission_row.version
  );

  update public.marketplace_idempotency_keys
  set response_payload = rpc_response_payload,
      locked_at = now(),
      expires_at = now() + interval '24 hours'
  where id = idempotency_row.id;

  return rpc_response_payload;
end;
$$;

revoke all on function public.marketplace_admin_activate_seller_listing(
  uuid, text, text, text, uuid, text, bigint, text, jsonb, text
)
from public, anon, authenticated;

grant execute on function public.marketplace_admin_activate_seller_listing(
  uuid, text, text, text, uuid, text, bigint, text, jsonb, text
)
to service_role;
