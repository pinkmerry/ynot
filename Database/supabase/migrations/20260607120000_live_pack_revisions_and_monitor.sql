-- Live random-pack edits now stage as owner-reviewed revisions. The live
-- pack, awarded items, ledgers, and customer history stay untouched until the
-- owner publishes the approved revision.

create table if not exists public.draw_round_live_revisions (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'published', 'cancelled')),
  requested_by_admin_id uuid not null references public.admin_users(id),
  reviewed_by_admin_id uuid references public.admin_users(id),
  published_by_admin_id uuid references public.admin_users(id),
  base_updated_at timestamptz not null,
  scalar_patch jsonb not null default '{}'::jsonb,
  logic_snapshot jsonb,
  category_ids uuid[],
  prize_snapshot jsonb not null default '[]'::jsonb,
  note text,
  review_note text,
  publish_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz
);

create index if not exists draw_round_live_revisions_round_status_idx
  on public.draw_round_live_revisions(draw_round_id, status, updated_at desc);

create unique index if not exists draw_round_live_revisions_one_open_idx
  on public.draw_round_live_revisions(draw_round_id)
  where status in ('pending_review', 'approved');

alter table public.draw_round_live_revisions enable row level security;
revoke all on public.draw_round_live_revisions from public, anon, authenticated;
grant select, insert, update on public.draw_round_live_revisions to service_role;

create or replace function public.touch_draw_round_live_revision_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_draw_round_live_revision_updated_at on public.draw_round_live_revisions;
create trigger touch_draw_round_live_revision_updated_at
before update on public.draw_round_live_revisions
for each row
execute function public.touch_draw_round_live_revision_updated_at();

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
      when revision.scalar_patch ? 'seed_run_id' then nullif(revision.scalar_patch->>'seed_run_id', '')
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

create or replace function public.get_live_pack_monitor(p_draw_round_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with campaign as (
  select
    dr.id,
    dr.slug,
    dr.pack_code,
    dr.title_th,
    dr.title_en,
    dr.status,
    dr.visibility,
    dr.total_slots,
    dr.updated_at
  from public.draw_rounds dr
  where dr.id = p_draw_round_id
),
open_summary as (
  select
    coalesce(sum(go.quantity) filter (where go.status = 'completed'), 0)::integer as opened_slots,
    coalesce(count(*) filter (where go.status = 'completed'), 0)::integer as open_count,
    max(go.opened_at) filter (where go.status = 'completed') as last_opened_at
  from public.gacha_opens go
  where go.draw_round_id = p_draw_round_id
),
unit_summary as (
  select
    drp.id as prize_id,
    count(*) filter (where unit.status = 'available')::integer as free_units,
    count(distinct unit.gacha_open_item_id) filter (
      where unit.status = 'awarded'
        and unit.gacha_open_item_id is not null
    )::integer as out_wins,
    count(*) filter (
      where unit.status = 'awarded'
        and unit.gacha_open_item_id is null
    )::integer as unlinked_out_units
  from public.draw_round_prizes drp
  left join public.draw_round_prize_units unit
    on unit.draw_round_prize_id = drp.id
  where drp.draw_round_id = p_draw_round_id
  group by drp.id
),
prize_rows as (
  select
    drp.id,
    drp.tier,
    drp.rank,
    drp.planned_quantity,
    greatest(1, drp.bundle_quantity) as bundle_quantity,
    cards.name as card_name,
    cards.card_code,
    coalesce(
      max(nullif(csu.image_url, '')) filter (where unit.status = 'available'),
      max(nullif(csu.image_url, '')),
      cards.image_url
    ) as image_url,
    coalesce(unit_summary.out_wins, 0)
      + floor(coalesce(unit_summary.unlinked_out_units, 0)::numeric / greatest(1, drp.bundle_quantity))::integer as out_wins,
    least(
      drp.planned_quantity,
      floor(coalesce(unit_summary.free_units, 0)::numeric / greatest(1, drp.bundle_quantity))::integer
    ) as left_wins
  from public.draw_round_prizes drp
  join public.cards cards on cards.id = drp.card_id
  left join unit_summary on unit_summary.prize_id = drp.id
  left join public.draw_round_prize_units unit
    on unit.draw_round_prize_id = drp.id
  left join public.card_stock_units csu on csu.id = unit.card_stock_unit_id
  where drp.draw_round_id = p_draw_round_id
  group by
    drp.id,
    drp.tier,
    drp.rank,
    drp.planned_quantity,
    drp.bundle_quantity,
    cards.name,
    cards.card_code,
    cards.image_url,
    unit_summary.out_wins,
    unit_summary.unlinked_out_units,
    unit_summary.free_units
),
award_groups as (
  select
    unit.gacha_open_item_id,
    (array_agg(unit.profile_id order by unit.awarded_at desc nulls last))[1] as profile_id,
    max(unit.awarded_at) as awarded_at
  from public.draw_round_prize_units unit
  where unit.draw_round_id = p_draw_round_id
    and unit.status = 'awarded'
    and unit.gacha_open_item_id is not null
  group by unit.gacha_open_item_id
),
recent_awards as (
  select
    go.public_code,
    go.opened_at,
    cards.name as card_name,
    cards.card_code,
    coalesce(
      max(nullif(csu.image_url, '')),
      cards.image_url
    ) as image_url,
    goi.bundle_quantity,
    goi.tier,
    goi.result_position,
    coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.line_display_name, ''),
      'Customer'
    ) as customer_label
  from award_groups awards
  join public.gacha_open_items goi on goi.id = awards.gacha_open_item_id
  join public.gacha_opens go on go.id = goi.gacha_open_id
  join public.cards cards on cards.id = goi.card_id
  left join public.draw_round_prize_units awarded_unit
    on awarded_unit.gacha_open_item_id = goi.id
   and awarded_unit.status = 'awarded'
  left join public.card_stock_units csu on csu.id = awarded_unit.card_stock_unit_id
  left join public.profiles profile on profile.id = awards.profile_id
  group by
    go.public_code,
    go.opened_at,
    cards.name,
    cards.card_code,
    cards.image_url,
    goi.bundle_quantity,
    goi.tier,
    goi.result_position,
    profile.display_name,
    profile.line_display_name
  order by max(awards.awarded_at) desc nulls last, go.opened_at desc
  limit 80
),
pending_revision as (
  select
    rev.id,
    rev.status,
    rev.created_at,
    rev.updated_at,
    rev.reviewed_at
  from public.draw_round_live_revisions rev
  where rev.draw_round_id = p_draw_round_id
    and rev.status in ('pending_review', 'approved')
  order by rev.updated_at desc
  limit 1
)
select jsonb_build_object(
  'campaign', jsonb_build_object(
    'id', campaign.id,
    'slug', campaign.slug,
    'packCode', campaign.pack_code,
    'titleTh', campaign.title_th,
    'titleEn', campaign.title_en,
    'status', campaign.status,
    'visibility', campaign.visibility,
    'totalSlots', campaign.total_slots,
    'openedSlots', open_summary.opened_slots,
    'remainingSlots', greatest(0, campaign.total_slots - open_summary.opened_slots),
    'openCount', open_summary.open_count,
    'lastOpenedAt', open_summary.last_opened_at,
    'updatedAt', campaign.updated_at
  ),
  'prizes', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'prizeKey', prize_rows.tier || ':' || prize_rows.rank::text,
        'tier', prize_rows.tier,
        'rank', prize_rows.rank,
        'cardName', prize_rows.card_name,
        'cardCode', prize_rows.card_code,
        'imageUrl', prize_rows.image_url,
        'plannedWins', prize_rows.planned_quantity,
        'bundleQuantity', prize_rows.bundle_quantity,
        'leftWins', greatest(0, prize_rows.left_wins),
        'outWins', least(prize_rows.planned_quantity, greatest(0, prize_rows.out_wins))
      )
      order by prize_rows.tier, prize_rows.rank
    )
    from prize_rows
  ), '[]'::jsonb),
  'recentAwards', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'openKey', recent_awards.public_code || ':' || recent_awards.result_position::text,
        'openCode', recent_awards.public_code,
        'openedAt', recent_awards.opened_at,
        'customerLabel', recent_awards.customer_label,
        'cardName', recent_awards.card_name,
        'cardCode', recent_awards.card_code,
        'imageUrl', recent_awards.image_url,
        'tier', recent_awards.tier,
        'bundleQuantity', recent_awards.bundle_quantity
      )
      order by recent_awards.opened_at desc
    )
    from recent_awards
  ), '[]'::jsonb),
  'pendingRevision', (
    select case
      when pending_revision.id is null then null
      else jsonb_build_object(
        'status', pending_revision.status,
        'requestedAt', pending_revision.created_at,
        'updatedAt', pending_revision.updated_at,
        'reviewedAt', pending_revision.reviewed_at
      )
    end
    from pending_revision
  ),
  'loadedAt', now()
)
from campaign, open_summary;
$$;

revoke all on function public.get_live_pack_monitor(uuid) from public, anon, authenticated;
grant execute on function public.get_live_pack_monitor(uuid) to service_role;
