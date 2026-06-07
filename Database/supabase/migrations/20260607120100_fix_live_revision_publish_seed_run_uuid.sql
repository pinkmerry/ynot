-- Republish failed when scalar_patch contained seed_run_id because the CASE
-- branch mixed JSON text with the uuid draw_rounds.seed_run_id column.
create or replace function public.publish_live_campaign_revision(
  p_revision_id uuid,
  p_owner_admin_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.draw_round_live_revisions%rowtype;
  campaign public.draw_rounds%rowtype;
  owner_role text;
  prize_count integer;
begin
  if p_owner_admin_id is null then
    raise exception 'live_revision_owner_required';
  end if;

  select role into owner_role
  from public.admin_users
  where id = p_owner_admin_id
    and is_active = true;

  if owner_role is distinct from 'owner' then
    raise exception 'live_revision_owner_required';
  end if;

  select * into revision
  from public.draw_round_live_revisions
  where id = p_revision_id
  for update;

  if revision.id is null then
    raise exception 'live_revision_not_found';
  end if;

  if revision.status <> 'approved' then
    raise exception 'live_revision_must_be_approved';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = revision.draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;

  if campaign.status <> 'live' then
    raise exception 'campaign_not_live_editable';
  end if;

  if campaign.updated_at is distinct from revision.base_updated_at then
    raise exception 'live_revision_base_changed';
  end if;

  if jsonb_typeof(revision.prize_snapshot) <> 'array' then
    raise exception 'live_revision_prizes_must_be_array';
  end if;

  prize_count := jsonb_array_length(revision.prize_snapshot);
  if prize_count <= 0 then
    raise exception 'live_revision_prizes_required';
  end if;

  update public.draw_rounds
  set
    slug = case
      when revision.scalar_patch ? 'slug' then coalesce(nullif(revision.scalar_patch->>'slug', ''), campaign.slug)
      else campaign.slug
    end,
    title_th = case
      when revision.scalar_patch ? 'title_th' then coalesce(nullif(revision.scalar_patch->>'title_th', ''), campaign.title_th)
      else campaign.title_th
    end,
    title_en = case
      when revision.scalar_patch ? 'title_en' then coalesce(nullif(revision.scalar_patch->>'title_en', ''), campaign.title_en)
      else campaign.title_en
    end,
    series = case
      when revision.scalar_patch ? 'series'
        and revision.scalar_patch->>'series' in ('one_piece', 'pokemon')
      then revision.scalar_patch->>'series'
      else campaign.series
    end,
    mode = case
      when revision.scalar_patch ? 'mode'
        and revision.scalar_patch->>'mode' in ('slot_pick', 'instant_gacha')
      then revision.scalar_patch->>'mode'
      else campaign.mode
    end,
    price_thb = case
      when revision.scalar_patch ? 'price_thb' then greatest(1, (revision.scalar_patch->>'price_thb')::integer)
      else campaign.price_thb
    end,
    cost_coins = case
      when revision.scalar_patch ? 'cost_coins' then greatest(1, (revision.scalar_patch->>'cost_coins')::integer)
      else campaign.cost_coins
    end,
    display_tags = case
      when revision.scalar_patch ? 'display_tags' then coalesce(
        array(select jsonb_array_elements_text(revision.scalar_patch->'display_tags')),
        campaign.display_tags
      )
      else campaign.display_tags
    end,
    sort_order = case
      when revision.scalar_patch ? 'sort_order' then (revision.scalar_patch->>'sort_order')::integer
      else campaign.sort_order
    end,
    banner_image_url = case
      when revision.scalar_patch ? 'banner_image_url' then revision.scalar_patch->>'banner_image_url'
      else campaign.banner_image_url
    end,
    banner_image_storage_path = case
      when revision.scalar_patch ? 'banner_image_storage_path' then revision.scalar_patch->>'banner_image_storage_path'
      else campaign.banner_image_storage_path
    end,
    is_test = case
      when revision.scalar_patch ? 'is_test' then (revision.scalar_patch->>'is_test')::boolean
      else campaign.is_test
    end,
    seed_run_id = case
      when revision.scalar_patch ? 'seed_run_id' then nullif(revision.scalar_patch->>'seed_run_id', '')::uuid
      else campaign.seed_run_id
    end,
    convert_deadline_days = case
      when revision.scalar_patch ? 'convert_deadline_days' then nullif(revision.scalar_patch->>'convert_deadline_days', '')::integer
      else campaign.convert_deadline_days
    end,
    last_prize_card_id = case
      when revision.scalar_patch ? 'last_prize_card_id' then nullif(revision.scalar_patch->>'last_prize_card_id', '')::uuid
      else campaign.last_prize_card_id
    end,
    last_prize_metadata = case
      when revision.scalar_patch ? 'last_prize_metadata' then revision.scalar_patch->'last_prize_metadata'
      else campaign.last_prize_metadata
    end,
    logic_snapshot = coalesce(revision.logic_snapshot, campaign.logic_snapshot),
    status = 'live',
    visibility = 'public',
    updated_at = now()
  where id = revision.draw_round_id;

  if revision.category_ids is not null then
    delete from public.draw_round_categories
    where draw_round_id = revision.draw_round_id;

    insert into public.draw_round_categories(draw_round_id, category_id, is_primary)
    select revision.draw_round_id, category_id, ordinality = 1
    from unnest(revision.category_ids) with ordinality as category(category_id, ordinality)
    on conflict do nothing;
  end if;

  perform public.edit_live_campaign_inventory(
    revision.draw_round_id,
    p_owner_admin_id,
    revision.prize_snapshot
  );

  update public.draw_round_live_revisions
  set
    status = 'published',
    published_by_admin_id = p_owner_admin_id,
    published_at = now(),
    publish_note = nullif(p_note, '')
  where id = revision.id;

  insert into public.audit_events(actor_admin_id, event_type, draw_round_id, metadata)
  values (
    p_owner_admin_id,
    'campaign_live_revision_published',
    revision.draw_round_id,
    jsonb_build_object('revisionId', revision.id, 'prizeCount', prize_count)
  );

  return jsonb_build_object(
    'ok', true,
    'revisionId', revision.id,
    'drawRoundId', revision.draw_round_id,
    'status', 'published'
  );
end;
$$;

revoke all on function public.publish_live_campaign_revision(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_live_campaign_revision(uuid, uuid, text) to service_role;
