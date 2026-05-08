create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  search_name text unique not null,
  series text not null check (series in ('one_piece', 'pokemon')),
  grade text not null default 'Ungraded',
  tone text not null default 'gold' check (tone in ('red', 'gold', 'blue', 'green', 'rose', 'violet')),
  image_url text,
  image_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draw_round_prizes (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid not null references public.draw_rounds(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  tier text not null check (tier in ('normal', 'high')),
  rank integer not null check (rank > 0),
  value_thb integer check (value_thb is null or value_thb >= 0),
  tone text check (tone in ('red', 'gold', 'blue', 'green', 'rose', 'violet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draw_round_id, tier, rank)
);

create index if not exists cards_search_name_idx on public.cards using gin (to_tsvector('simple', search_name));
create index if not exists draw_round_prizes_round_tier_rank_idx on public.draw_round_prizes(draw_round_id, tier, rank);
create index if not exists draw_round_prizes_card_id_idx on public.draw_round_prizes(card_id);

drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at
before update on public.cards
for each row execute function app_private.touch_updated_at();

drop trigger if exists draw_round_prizes_touch_updated_at on public.draw_round_prizes;
create trigger draw_round_prizes_touch_updated_at
before update on public.draw_round_prizes
for each row execute function app_private.touch_updated_at();

alter table public.cards enable row level security;
alter table public.draw_round_prizes enable row level security;

drop policy if exists "Anyone can read card catalog" on public.cards;
create policy "Anyone can read card catalog"
on public.cards
for select
using (true);

drop policy if exists "Anyone can read public live draw prizes" on public.draw_round_prizes;
create policy "Anyone can read public live draw prizes"
on public.draw_round_prizes
for select
using (
  exists (
    select 1
    from public.draw_rounds dr
    where dr.id = draw_round_prizes.draw_round_id
      and dr.status in ('live', 'draft')
  )
);

with json_cards as (
  select
    item->>'name' as name,
    lower(trim(regexp_replace(item->>'name', '\s+', ' ', 'g'))) as search_name,
    case when item->>'series' = 'Pokemon' then 'pokemon' else 'one_piece' end as series,
    coalesce(nullif(item->>'grade', ''), 'Ungraded') as grade,
    case
      when item->>'tone' in ('red', 'gold', 'blue', 'green', 'rose', 'violet') then item->>'tone'
      else 'gold'
    end as tone,
    nullif(item->>'photoUrl', '') as image_url
  from public.draw_rounds dr
  cross join lateral jsonb_array_elements(coalesce(dr.featured_cards, '[]'::jsonb) || coalesce(dr.chase_cards, '[]'::jsonb)) as item
  where item ? 'name'
    and nullif(item->>'name', '') is not null
)
insert into public.cards (name, search_name, series, grade, tone, image_url)
select distinct on (search_name)
  name,
  search_name,
  series,
  grade,
  tone,
  image_url
from json_cards
where search_name is not null
order by search_name, image_url nulls last
on conflict (search_name) do update
set
  name = excluded.name,
  series = excluded.series,
  grade = excluded.grade,
  tone = excluded.tone,
  image_url = coalesce(excluded.image_url, public.cards.image_url);

with featured as (
  select
    dr.id as draw_round_id,
    item,
    ordinality::integer as rank
  from public.draw_rounds dr
  cross join lateral jsonb_array_elements(coalesce(dr.featured_cards, '[]'::jsonb)) with ordinality as item(item, ordinality)
  where item ? 'name'
    and nullif(item->>'name', '') is not null
),
chase as (
  select
    dr.id as draw_round_id,
    item,
    case
      when item->>'rank' ~ '^[0-9]+$' then (item->>'rank')::integer
      else ordinality::integer
    end as rank
  from public.draw_rounds dr
  cross join lateral jsonb_array_elements(coalesce(dr.chase_cards, '[]'::jsonb)) with ordinality as item(item, ordinality)
  where item ? 'name'
    and nullif(item->>'name', '') is not null
),
prizes as (
  select
    draw_round_id,
    item,
    'normal'::text as tier,
    rank,
    null::integer as value_thb
  from featured
  union all
  select
    draw_round_id,
    item,
    'high'::text as tier,
    rank,
    case
      when item->>'value' ~ '^[0-9]+$' then (item->>'value')::integer
      else 0
    end as value_thb
  from chase
)
insert into public.draw_round_prizes (draw_round_id, card_id, tier, rank, value_thb, tone)
select
  prizes.draw_round_id,
  cards.id,
  prizes.tier,
  prizes.rank,
  prizes.value_thb,
  case
    when prizes.item->>'tone' in ('red', 'gold', 'blue', 'green', 'rose', 'violet') then prizes.item->>'tone'
    else cards.tone
  end as tone
from prizes
join public.cards
  on cards.search_name = lower(trim(regexp_replace(prizes.item->>'name', '\s+', ' ', 'g')))
on conflict (draw_round_id, tier, rank) do update
set
  card_id = excluded.card_id,
  value_thb = excluded.value_thb,
  tone = excluded.tone;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cards'
    ) then
      alter publication supabase_realtime add table public.cards;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draw_round_prizes'
    ) then
      alter publication supabase_realtime add table public.draw_round_prizes;
    end if;
  end if;
end $$;
