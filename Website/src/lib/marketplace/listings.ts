import "server-only";

import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";
import { marketplaceConfig } from "./config";
import {
  getMockMarketplaceListing,
  mockMarketplaceListingPage,
} from "./mock-data";
import { projectPublicListingSnapshot } from "./public-projection";
import type {
  MarketplaceListingSnapshot,
  MarketplaceOfficialListingSnapshot,
} from "./types";
export type {
  MarketplaceListingSnapshot,
  MarketplaceOfficialListingSnapshot,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

const LISTING_SELECT = [
  "listing_id",
  "inventory_item_id",
  "product_id",
  "variant_id",
  "seller_public_profile_id",
  "listing_source",
  "listing_state",
  "public_slug",
  "title",
  "item_price_satang",
  "currency",
  "quantity_available_snapshot",
  "public_description",
  "photo_urls",
  "snapshot_payload",
  "snapshot_version",
  "visible_from",
  "updated_at",
].join(",");

const LISTING_SOURCES = new Set(["official_shop", "user_seller"]);
const LISTING_ITEM_TYPES = new Set(["card", "sealed_box", "sealed_pack"]);
const LISTING_SORTS = new Set(["newest", "price_asc", "price_desc"]);
const DEFAULT_LISTING_LIMIT = 24;
const MAX_LISTING_LIMIT = 50;
const MAX_CURSOR_BYTES = 768;

export type MarketplaceListingSource =
  MarketplaceListingSnapshot["listing_source"];
export type MarketplaceListingSort = "newest" | "price_asc" | "price_desc";

export type MarketplaceListingQuery = {
  source?: MarketplaceListingSource;
  itemType?: MarketplaceListingItemType;
  productId?: string;
  variantId?: string;
  sellerPublicProfileId?: string;
  q?: string;
  condition?: string;
  grade?: string;
  inStockOnly?: boolean;
  sort?: MarketplaceListingSort;
  limit?: number;
  cursor?: string | null;
};

type MarketplaceListingItemType = "card" | "sealed_box" | "sealed_pack";

export type MarketplaceListingPage = {
  listings: MarketplaceListingSnapshot[];
  nextCursor: string | null;
};

function safeText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function safeInteger(value: string | number | null | undefined) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return number;
}

function listingLimit(value: string | number | null | undefined) {
  const parsed = safeInteger(value);
  if (!parsed || parsed < 1) return DEFAULT_LISTING_LIMIT;
  return Math.min(parsed, MAX_LISTING_LIMIT);
}

export function marketplaceListingQueryFromUrl(url: string | URL) {
  const searchParams = new URL(url).searchParams;
  const source = safeText(searchParams.get("source"), 32);
  const itemType = safeText(searchParams.get("itemType"), 32);
  const sort = safeText(searchParams.get("sort"), 32);
  const q = safeText(searchParams.get("q"), 80);
  const condition = safeText(searchParams.get("condition"), 40);
  const grade = safeText(searchParams.get("grade"), 60);

  return {
    source:
      source && LISTING_SOURCES.has(source)
        ? (source as MarketplaceListingSource)
        : undefined,
    itemType:
      itemType && LISTING_ITEM_TYPES.has(itemType)
        ? (itemType as MarketplaceListingItemType)
        : undefined,
    q: q ?? undefined,
    condition: condition ?? undefined,
    grade: grade ?? undefined,
    inStockOnly:
      searchParams.get("inStockOnly") === "1" ||
      searchParams.get("inStockOnly") === "true",
    sort: sort && LISTING_SORTS.has(sort) ? (sort as MarketplaceListingSort) : undefined,
    limit: listingLimit(searchParams.get("limit")),
    cursor: safeText(searchParams.get("cursor"), MAX_CURSOR_BYTES),
  } satisfies MarketplaceListingQuery;
}

type ListingCursorPayload = {
  v: 1;
  sort: MarketplaceListingSort;
  source: MarketplaceListingSource | null;
  itemType: MarketplaceListingItemType | null;
  productId: string | null;
  variantId: string | null;
  sellerPublicProfileId: string | null;
  q: string | null;
  condition: string | null;
  grade: string | null;
  inStockOnly: boolean;
  listingId: string;
  visibleFrom: string | null;
  itemPriceSatang: number;
};

function normalizedSort(sort: MarketplaceListingSort | undefined) {
  return sort ?? "newest";
}

function isStrictIsoTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function encodeListingCursor(
  listing: MarketplaceListingSnapshot,
  options: MarketplaceListingQuery,
  sort: MarketplaceListingSort,
) {
  const payload: ListingCursorPayload = {
    v: 1,
    sort,
    source: options.source ?? null,
    itemType: options.itemType ?? null,
    productId: options.productId ?? null,
    variantId: options.variantId ?? null,
    sellerPublicProfileId: options.sellerPublicProfileId ?? null,
    q: options.q ?? null,
    condition: options.condition ?? null,
    grade: options.grade ?? null,
    inStockOnly: Boolean(options.inStockOnly),
    listingId: listing.listing_id,
    visibleFrom: listing.visible_from ?? null,
    itemPriceSatang: listing.item_price_satang,
  };
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeListingCursor(
  rawCursor: string | null | undefined,
  options: MarketplaceListingQuery,
  sort: MarketplaceListingSort,
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
    const payload = JSON.parse(atob(padded)) as Partial<ListingCursorPayload>;
    if (
      payload.v !== 1 ||
      payload.sort !== sort ||
      payload.source !== (options.source ?? null) ||
      payload.itemType !== (options.itemType ?? null) ||
      payload.productId !== (options.productId ?? null) ||
      payload.variantId !== (options.variantId ?? null) ||
      payload.sellerPublicProfileId !== (options.sellerPublicProfileId ?? null) ||
      payload.q !== (options.q ?? null) ||
      payload.condition !== (options.condition ?? null) ||
      payload.grade !== (options.grade ?? null) ||
      payload.inStockOnly !== Boolean(options.inStockOnly) ||
      typeof payload.listingId !== "string" ||
      !UUID_RE.test(payload.listingId) ||
      typeof payload.itemPriceSatang !== "number" ||
      !Number.isInteger(payload.itemPriceSatang) ||
      (payload.visibleFrom !== null &&
        (typeof payload.visibleFrom !== "string" ||
          !isStrictIsoTimestamp(payload.visibleFrom)))
    ) {
      throw new Error("cursor mismatch");
    }
    return payload as ListingCursorPayload;
  } catch {
    throw new MarketplaceServiceError(
      "marketplace_cursor_invalid",
      "Marketplace cursor is invalid.",
      400,
    );
  }
}

export async function listMarketplaceListingPage(
  options: MarketplaceListingQuery = {},
): Promise<MarketplaceListingPage> {
  if (marketplaceConfig().mockData) {
    return mockMarketplaceListingPage(options);
  }

  const supabase = createMarketplaceSupabaseClient();
  const limit = listingLimit(options.limit);
  const sort = normalizedSort(options.sort);
  const cursor = decodeListingCursor(options.cursor, options, sort);
  let query = supabase
    .from("marketplace_public_listing_snapshots")
    .select(LISTING_SELECT);

  if (options.productId) {
    query = query.eq("product_id", assertUuid(options.productId, "product_id"));
  }
  if (options.variantId) {
    query = query.eq("variant_id", assertUuid(options.variantId, "variant_id"));
  }
  if (options.sellerPublicProfileId) {
    query = query.eq(
      "seller_public_profile_id",
      assertUuid(options.sellerPublicProfileId, "seller_public_profile_id"),
    );
  }
  if (options.source) {
    query = query.eq("listing_source", options.source);
  }
  if (options.itemType) {
    query = query.filter("snapshot_payload->>itemType", "eq", options.itemType);
  }
  if (options.condition) {
    query = query.filter("snapshot_payload->>conditionBucket", "eq", options.condition);
  }
  if (options.grade) {
    query = query.filter("snapshot_payload->>conditionBucket", "eq", options.grade);
  }
  if (options.inStockOnly) {
    query = query.gt("quantity_available_snapshot", 0);
  }
  if (options.q) {
    query = query.ilike("title", `%${options.q.replace(/[%_]/g, "")}%`);
  }

  switch (sort) {
    case "price_asc":
      query = query
        .order("item_price_satang", { ascending: true })
        .order("listing_id", { ascending: true });
      if (cursor) {
        query = query.or(
          `item_price_satang.gt.${cursor.itemPriceSatang},and(item_price_satang.eq.${cursor.itemPriceSatang},listing_id.gt.${cursor.listingId})`,
        );
      }
      break;
    case "price_desc":
      query = query
        .order("item_price_satang", { ascending: false })
        .order("listing_id", { ascending: false });
      if (cursor) {
        query = query.or(
          `item_price_satang.lt.${cursor.itemPriceSatang},and(item_price_satang.eq.${cursor.itemPriceSatang},listing_id.lt.${cursor.listingId})`,
        );
      }
      break;
    case "newest":
    default:
      query = query
        .order("visible_from", { ascending: false })
        .order("listing_id", { ascending: false });
      if (cursor) {
        if (!cursor.visibleFrom) {
          throw new MarketplaceServiceError(
            "marketplace_cursor_invalid",
            "Marketplace cursor is invalid.",
            400,
          );
        }
        query = query.or(
          `visible_from.lt.${cursor.visibleFrom},and(visible_from.eq.${cursor.visibleFrom},listing_id.lt.${cursor.listingId})`,
        );
      }
      break;
  }

  const result = await query.limit(limit + 1);

  if (result.error) throw marketplaceRpcError(result.error);
  const rows = ((result.data ?? []) as unknown[]).map((row) =>
    projectPublicListingSnapshot(row as Record<string, unknown>),
  ) as MarketplaceListingSnapshot[];
  const listings = rows.slice(0, limit);
  return {
    listings,
    nextCursor:
      rows.length > limit
        ? encodeListingCursor(listings[listings.length - 1], options, sort)
        : null,
  };
}

export async function listMarketplaceListings(
  options: MarketplaceListingQuery = {},
) {
  return (await listMarketplaceListingPage(options)).listings;
}

export async function listOfficialListings() {
  const listings = await listMarketplaceListings();
  return listings.filter(
    (listing): listing is MarketplaceOfficialListingSnapshot =>
      listing.listing_source === "official_shop",
  );
}

export async function getMarketplaceListing(listingId: string) {
  if (marketplaceConfig().mockData) {
    const listing = getMockMarketplaceListing(listingId);
    if (!listing) {
      throw new MarketplaceServiceError(
        "marketplace_listing_not_found",
        "Marketplace listing was not found.",
        404,
      );
    }
    return listing;
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_public_listing_snapshots")
    .select(LISTING_SELECT)
    .eq("listing_id", assertUuid(listingId, "listing_id"))
    .maybeSingle();

  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data) {
    throw new MarketplaceServiceError(
      "marketplace_listing_not_found",
      "Marketplace listing was not found.",
      404,
    );
  }
  return projectPublicListingSnapshot(
    result.data as unknown as Record<string, unknown>,
  ) as MarketplaceListingSnapshot;
}

export async function getOfficialListing(listingId: string) {
  const listing = await getMarketplaceListing(listingId);
  if (listing.listing_source !== "official_shop") {
    throw new MarketplaceServiceError(
      "marketplace_listing_not_found",
      "Marketplace listing was not found.",
      404,
    );
  }
  return listing as MarketplaceOfficialListingSnapshot;
}
