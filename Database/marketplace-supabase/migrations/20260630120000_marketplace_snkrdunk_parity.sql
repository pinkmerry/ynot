-- SNKRDUNK parity public projection, cart, and watchlist schema.
--
-- Keeps listing detail and grouped product pages on public-safe identifiers
-- while buyer/seller account IDs stay behind service-role APIs.

create table if not exists public.marketplace_public_seller_profiles (
  seller_public_profile_id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid not null unique references public.marketplace_accounts(id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 120),
  seller_kind text not null check (seller_kind in ('official_shop', 'user_seller')),
  status text not null default 'active' check (status in ('active', 'paused', 'suspended')),
  fulfilled_order_count integer not null default 0 check (fulfilled_order_count >= 0),
  positive_rating_count integer not null default 0 check (positive_rating_count >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_cart_items (
  id uuid primary key default gen_random_uuid(),
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listing_snapshots(listing_id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_marketplace_account_id, listing_id)
);

create table if not exists public.marketplace_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  buyer_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listing_snapshots(listing_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_marketplace_account_id, listing_id)
);

create index if not exists marketplace_cart_items_buyer_idx
  on public.marketplace_cart_items(buyer_marketplace_account_id, updated_at desc);
create index if not exists marketplace_cart_items_listing_idx
  on public.marketplace_cart_items(listing_id);
create index if not exists marketplace_watchlist_items_buyer_idx
  on public.marketplace_watchlist_items(buyer_marketplace_account_id, updated_at desc);
create index if not exists marketplace_watchlist_items_listing_idx
  on public.marketplace_watchlist_items(listing_id);
create index if not exists marketplace_public_seller_profiles_account_idx
  on public.marketplace_public_seller_profiles(marketplace_account_id);
create index if not exists marketplace_public_seller_profiles_status_idx
  on public.marketplace_public_seller_profiles(seller_kind, status, updated_at desc);

drop view if exists public.marketplace_public_listing_snapshots;

create view public.marketplace_public_listing_snapshots
with (security_invoker = true)
as
select
  listing.listing_id,
  listing.inventory_item_id,
  listing.product_id,
  listing.variant_id,
  seller_profile.seller_public_profile_id,
  listing.listing_source,
  listing.listing_state,
  listing.public_slug,
  listing.title,
  listing.item_price_satang,
  listing.currency,
  listing.quantity_available_snapshot,
  listing.public_description,
  listing.photo_urls,
  jsonb_strip_nulls(
    jsonb_build_object(
      'sourceBadge', listing.snapshot_payload -> 'sourceBadge',
      'itemType', listing.snapshot_payload -> 'itemType',
      'conditionCode', listing.snapshot_payload -> 'conditionCode',
      'sourceKind', listing.snapshot_payload -> 'sourceKind',
      'productSlug', listing.snapshot_payload -> 'productSlug',
      'variantSlug', listing.snapshot_payload -> 'variantSlug',
      'variantLabel', listing.snapshot_payload -> 'variantLabel',
      'conditionBucket', listing.snapshot_payload -> 'conditionBucket',
      'gradeService', listing.snapshot_payload -> 'gradeService',
      'gradeValue', listing.snapshot_payload -> 'gradeValue'
    )
  ) as snapshot_payload,
  listing.snapshot_version,
  listing.visible_from,
  listing.updated_at
from public.marketplace_listing_snapshots listing
left join public.marketplace_public_seller_profiles seller_profile
  on seller_profile.marketplace_account_id = listing.seller_marketplace_account_id
  and seller_profile.status = 'active'
where listing.listing_state = 'active';

drop trigger if exists marketplace_public_seller_profiles_touch_updated_at on public.marketplace_public_seller_profiles;
create trigger marketplace_public_seller_profiles_touch_updated_at
before update on public.marketplace_public_seller_profiles
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_cart_items_touch_updated_at on public.marketplace_cart_items;
create trigger marketplace_cart_items_touch_updated_at
before update on public.marketplace_cart_items
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_watchlist_items_touch_updated_at on public.marketplace_watchlist_items;
create trigger marketplace_watchlist_items_touch_updated_at
before update on public.marketplace_watchlist_items
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_public_seller_profiles enable row level security;
alter table public.marketplace_cart_items enable row level security;
alter table public.marketplace_watchlist_items enable row level security;

revoke all on
  public.marketplace_public_seller_profiles,
  public.marketplace_cart_items,
  public.marketplace_watchlist_items
from public, anon, authenticated;

revoke all on public.marketplace_public_listing_snapshots
from public, anon, authenticated;

grant all on
  public.marketplace_public_seller_profiles,
  public.marketplace_cart_items,
  public.marketplace_watchlist_items
to service_role;

grant select on public.marketplace_public_listing_snapshots to service_role;
