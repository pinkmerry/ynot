import "server-only";

import { marketplaceConfig } from "./config";
import {
  groupMarketplaceListingsByProductSlug,
  mockMarketplaceListings,
} from "./mock-data";
import { projectPublicProductBrowseSummary } from "./public-projection";
import type {
  MarketplaceProductSort,
  MarketplaceQueryPlan,
} from "./query-plan";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

type ProductBrowseCursorPayload = {
  v: 1;
  sort: MarketplaceProductSort;
  source: string | null;
  itemType: string | null;
  q: string | null;
  condition: string | null;
  grade: string | null;
  productSlug: string;
  lowestPriceSatang: number | null;
  recentAt: string | null;
  rankingScore: number | null;
};

export type MarketplaceProductBrowseSummary = {
  product_id: string;
  product_slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  series_name: string | null;
  set_name: string | null;
  card_code: string | null;
  language: string | null;
  hero_image_url: string | null;
  product_metadata: Record<string, unknown>;
  active_listing_count: number;
  official_listing_count: number;
  user_seller_listing_count: number;
  variant_count: number;
  lowest_price_satang: number;
  highest_price_satang: number;
  recent_listing_at: string | null;
  sold_count: number;
  last_sold_at: string | null;
  ranking_score: number;
};

export type MarketplaceProductBrowsePage = {
  products: MarketplaceProductBrowseSummary[];
  nextCursor: string | null;
};

export type MarketplaceBrowseFilterKey =
  | "all"
  | "official_shop"
  | "user_seller"
  | "pokemon"
  | "one_piece"
  | "psa10"
  | "raw"
  | "holo"
  | "promo";

export type MarketplaceBrowseFilterCount = {
  productCount: number;
  offerCount: number;
};

export type MarketplaceBrowseFilterCounts = Partial<
  Record<MarketplaceBrowseFilterKey, MarketplaceBrowseFilterCount>
>;

const MAX_PRODUCT_BROWSE_LIMIT = 50;
const DEFAULT_PRODUCT_BROWSE_LIMIT = 24;
const MAX_CURSOR_BYTES = 768;

function productBrowseLimit(value: number | undefined) {
  if (!value || value < 1) return DEFAULT_PRODUCT_BROWSE_LIMIT;
  return Math.min(value, MAX_PRODUCT_BROWSE_LIMIT);
}

function productBrowseSort(sort: MarketplaceQueryPlan["sort"]): MarketplaceProductSort {
  if (
    sort === "popular" ||
    sort === "newest" ||
    sort === "price_asc" ||
    sort === "price_desc" ||
    sort === "recent_sales"
  ) {
    return sort;
  }
  return "recommended";
}

function cursorIdentity(query: MarketplaceQueryPlan, sort: MarketplaceProductSort) {
  return {
    sort,
    source: query.source ?? null,
    itemType: query.itemType ?? null,
    q: query.q ?? null,
    condition: query.condition ?? null,
    grade: query.grade ?? null,
  };
}

export function encodeProductBrowseCursor(
  product: MarketplaceProductBrowseSummary,
  query: MarketplaceQueryPlan,
  sort: MarketplaceProductSort,
) {
  const payload: ProductBrowseCursorPayload = {
    v: 1,
    ...cursorIdentity(query, sort),
    productSlug: product.product_slug,
    lowestPriceSatang: product.lowest_price_satang,
    recentAt: sort === "recent_sales" ? product.last_sold_at : product.recent_listing_at,
    rankingScore: product.ranking_score,
  };
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeProductBrowseCursor(
  rawCursor: string | null | undefined,
  query: MarketplaceQueryPlan,
  sort: MarketplaceProductSort,
) {
  if (!rawCursor) return null;
  if (rawCursor.length > MAX_CURSOR_BYTES) {
    throw new MarketplaceServiceError(
      "marketplace_cursor_invalid",
      "Marketplace cursor is invalid.",
      400,
    );
  }

  try {
    const normalized = rawCursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Partial<ProductBrowseCursorPayload>;
    const identity = cursorIdentity(query, sort);
    if (
      payload.v !== 1 ||
      payload.sort !== identity.sort ||
      payload.source !== identity.source ||
      payload.itemType !== identity.itemType ||
      payload.q !== identity.q ||
      payload.condition !== identity.condition ||
      payload.grade !== identity.grade ||
      typeof payload.productSlug !== "string" ||
      !/^[a-z0-9][a-z0-9-]{2,220}$/.test(payload.productSlug)
    ) {
      throw new Error("cursor mismatch");
    }
    return payload as ProductBrowseCursorPayload;
  } catch {
    throw new MarketplaceServiceError(
      "marketplace_cursor_invalid",
      "Marketplace cursor is invalid.",
      400,
    );
  }
}

function listingMatchesQuery(
  listing: (typeof mockMarketplaceListings)[number],
  query: MarketplaceQueryPlan,
) {
  if (listing.listing_state !== "active") return false;
  if (query.source && listing.listing_source !== query.source) return false;
  if (query.itemType && listing.snapshot_payload?.itemType !== query.itemType) return false;
  if (query.condition && listing.snapshot_payload?.conditionBucket !== query.condition) {
    return false;
  }
  if (query.grade && listing.snapshot_payload?.conditionBucket !== query.grade) return false;
  if (query.inStockOnly && listing.quantity_available_snapshot <= 0) return false;
  return true;
}

function productMatchesSearch(
  product: MarketplaceProductBrowseSummary,
  query: MarketplaceQueryPlan,
) {
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  const searchable = [
    product.title,
    product.product_slug,
    product.brand,
    product.category,
    product.series_name,
    product.set_name,
    product.card_code,
    product.language,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return searchable.includes(q);
}

function dateValue(value: string | null) {
  return value ? Date.parse(value) || 0 : 0;
}

function compareProductBrowseSummary(
  sort: MarketplaceProductSort,
  left: MarketplaceProductBrowseSummary,
  right: MarketplaceProductBrowseSummary,
) {
  if (sort === "price_asc") {
    return (
      left.lowest_price_satang - right.lowest_price_satang ||
      left.product_slug.localeCompare(right.product_slug)
    );
  }
  if (sort === "price_desc") {
    return (
      right.lowest_price_satang - left.lowest_price_satang ||
      right.product_slug.localeCompare(left.product_slug)
    );
  }
  if (sort === "newest") {
    return (
      dateValue(right.recent_listing_at) - dateValue(left.recent_listing_at) ||
      right.product_slug.localeCompare(left.product_slug)
    );
  }
  if (sort === "recent_sales") {
    return (
      dateValue(right.last_sold_at) - dateValue(left.last_sold_at) ||
      right.product_slug.localeCompare(left.product_slug)
    );
  }
  return (
    right.ranking_score - left.ranking_score ||
    right.product_slug.localeCompare(left.product_slug)
  );
}

function cursorIndex(
  products: MarketplaceProductBrowseSummary[],
  cursor: ProductBrowseCursorPayload | null,
) {
  if (!cursor) return -1;
  return products.findIndex((product) => product.product_slug === cursor.productSlug);
}

function mockMarketplaceProductBrowsePage(
  query: MarketplaceQueryPlan,
  limit: number,
  sort: MarketplaceProductSort,
  cursor: ProductBrowseCursorPayload | null,
): MarketplaceProductBrowsePage {
  const grouped = groupMarketplaceListingsByProductSlug(
    mockMarketplaceListings.filter((listing) => listingMatchesQuery(listing, query)),
  ) as MarketplaceProductBrowseSummary[];
  const products = grouped
    .filter((product) => productMatchesSearch(product, query))
    .map((row) => projectPublicProductBrowseSummary(row) as MarketplaceProductBrowseSummary)
    .sort((left, right) => compareProductBrowseSummary(sort, left, right));
  const startIndex = cursorIndex(products, cursor) + 1;
  const rows = products.slice(startIndex, startIndex + limit + 1);
  const pageProducts = rows.slice(0, limit);
  return {
    products: pageProducts,
    nextCursor:
      rows.length > limit
        ? encodeProductBrowseCursor(pageProducts[pageProducts.length - 1], query, sort)
        : null,
  };
}

export async function listMarketplaceProductBrowsePage(
  query: MarketplaceQueryPlan,
): Promise<MarketplaceProductBrowsePage> {
  const limit = productBrowseLimit(query.limit);
  const sort = productBrowseSort(query.sort);
  const cursor = decodeProductBrowseCursor(query.cursor, query, sort);

  if (marketplaceConfig().mockData) {
    return mockMarketplaceProductBrowsePage(query, limit, sort, cursor);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_browse_product_markets", {
    p_source: query.source ?? null,
    p_item_type: query.itemType ?? null,
    p_q: query.q ?? null,
    p_condition: query.condition ?? null,
    p_grade: query.grade ?? null,
    p_sort: sort,
    p_limit: limit + 1,
    p_after_product_slug: cursor?.productSlug ?? null,
    p_after_price_satang: cursor?.lowestPriceSatang ?? null,
    p_after_recent_at: cursor?.recentAt ?? null,
    p_after_ranking_score: cursor?.rankingScore ?? null,
  });

  if (result.error) throw marketplaceRpcError(result.error);
  const rows = ((result.data ?? []) as unknown[]).map((row) =>
    projectPublicProductBrowseSummary(row as Record<string, unknown>),
  ) as MarketplaceProductBrowseSummary[];
  const products = rows.slice(0, limit);
  return {
    products,
    nextCursor:
      rows.length > limit
        ? encodeProductBrowseCursor(products[products.length - 1], query, sort)
        : null,
  };
}

export async function listMarketplaceProductBrowse(
  query: MarketplaceQueryPlan,
) {
  return (await listMarketplaceProductBrowsePage(query)).products;
}

function countQueryForFilter(
  filterKey: MarketplaceBrowseFilterKey,
): MarketplaceQueryPlan {
  const query: MarketplaceQueryPlan = {
    inStockOnly: true,
    limit: MAX_PRODUCT_BROWSE_LIMIT,
    cursor: null,
    sort: "recommended",
  };

  switch (filterKey) {
    case "official_shop":
      query.source = "official_shop";
      break;
    case "user_seller":
      query.source = "user_seller";
      break;
    case "pokemon":
      query.q = "pokemon";
      break;
    case "one_piece":
      query.q = "one piece";
      break;
    case "psa10":
      query.grade = "psa_10";
      break;
    case "raw":
      query.condition = "raw_a";
      break;
    case "holo":
      query.q = "holo";
      break;
    case "promo":
      query.q = "promo";
      break;
    case "all":
    default:
      break;
  }

  return query;
}

function countProducts(products: MarketplaceProductBrowseSummary[]) {
  return {
    productCount: products.length,
    offerCount: products.reduce(
      (total, product) => total + product.active_listing_count,
      0,
    ),
  };
}

function mockFilterCount(filterKey: MarketplaceBrowseFilterKey) {
  const query = countQueryForFilter(filterKey);
  const sort = "recommended";
  const grouped = groupMarketplaceListingsByProductSlug(
    mockMarketplaceListings.filter((listing) => listingMatchesQuery(listing, query)),
  ) as MarketplaceProductBrowseSummary[];
  const products = grouped
    .filter((product) => productMatchesSearch(product, query))
    .map((row) => projectPublicProductBrowseSummary(row) as MarketplaceProductBrowseSummary)
    .sort((left, right) => compareProductBrowseSummary(sort, left, right));
  return countProducts(products);
}

function normalizeFilterCounts(payload: unknown): MarketplaceBrowseFilterCounts {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {};
  }
  const counts: MarketplaceBrowseFilterCounts = {};
  for (const filterKey of Object.keys(payload) as MarketplaceBrowseFilterKey[]) {
    const value = (payload as Record<string, unknown>)[filterKey];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const productCount = Number(record.productCount ?? 0);
    const offerCount = Number(record.offerCount ?? 0);
    counts[filterKey] = {
      productCount: Number.isFinite(productCount) ? productCount : 0,
      offerCount: Number.isFinite(offerCount) ? offerCount : 0,
    };
  }
  return counts;
}

export async function listMarketplaceProductBrowseFilterCounts(): Promise<MarketplaceBrowseFilterCounts> {
  const filterKeys: MarketplaceBrowseFilterKey[] = [
    "all",
    "official_shop",
    "user_seller",
    "pokemon",
    "one_piece",
    "psa10",
    "raw",
    "holo",
    "promo",
  ];
  if (marketplaceConfig().mockData) {
    return Object.fromEntries(
      filterKeys.map((filterKey) => [filterKey, mockFilterCount(filterKey)] as const),
    ) as MarketplaceBrowseFilterCounts;
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_browse_filter_counts");
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeFilterCounts(result.data);
}
