import "server-only";

import { marketplaceConfig } from "./config";
import {
  listMarketplaceListingPage,
  type MarketplaceListingSnapshot,
  type MarketplaceListingQuery,
} from "./listings";
import { mockMarketplaceListings, mockMarketplaceProductMarket } from "./mock-data";
import {
  projectPublicListingSnapshot,
  projectPublicPriceHistoryPoint,
  projectPublicProductMarket,
  projectPublicVariant,
} from "./public-projection";
import {
  marketplaceQueryPlanFromUrl,
  type MarketplaceQueryPlan,
} from "./query-plan";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const PRICE_HISTORY_SELECT = [
  "id",
  "product_id",
  "variant_id",
  "listing_id",
  "listing_source",
  "condition_bucket",
  "grade_service",
  "grade_value",
  "item_price_satang",
  "currency",
  "sold_at",
  "public_snapshot",
].join(",");

type ProductMarketRow = {
  id: string;
  product_slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  series_name: string | null;
  set_name: string | null;
  card_code: string | null;
  language: string | null;
  hero_image_url: string | null;
  product_metadata?: unknown;
  active_listing_count?: unknown;
  lowest_price_satang: number | null;
  sold_count?: unknown;
  updated_at: string | null;
};

export type MarketplaceProductMarketProduct = ProductMarketRow & {
  product_metadata: Record<string, unknown>;
  active_listing_count: number;
  sold_count: number;
};

export type MarketplaceProductMarketVariant = {
  id: string;
  product_id: string;
  variant_slug: string;
  variant_label: string;
  condition_bucket: string;
  grade_service: string | null;
  grade_value: string | null;
  active_listing_count: number;
  variant_snapshot: Record<string, unknown>;
  image_urls: string[];
  updated_at: string | null;
};

export type MarketplaceProductMarketPriceHistoryPoint = {
  id: string;
  product_id: string;
  variant_id: string | null;
  listing_id: string;
  listing_source: "official_shop" | "user_seller";
  condition_bucket: string;
  grade_service: string | null;
  grade_value: string | null;
  item_price_satang: number;
  currency: string;
  sold_at: string;
  public_snapshot: Record<string, unknown>;
};

export type MarketplaceProductMarketView = {
  product: MarketplaceProductMarketProduct;
  variants: MarketplaceProductMarketVariant[];
  listings: MarketplaceListingSnapshot[];
  priceHistory: MarketplaceProductMarketPriceHistoryPoint[];
};

function safeSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,220}$/.test(normalized)) {
    throw new MarketplaceServiceError(
      "marketplace_product_slug_invalid",
      "Marketplace product request is invalid.",
      400,
    );
  }
  return normalized;
}

function listingQueryFromPlan(query: MarketplaceQueryPlan): MarketplaceListingQuery {
  const sort =
    query.sort === "price_asc" || query.sort === "price_desc" || query.sort === "newest"
      ? query.sort
      : "newest";
  return {
    source: query.source,
    itemType: query.itemType,
    q: query.q,
    condition: query.condition,
    grade: query.grade,
    inStockOnly: query.inStockOnly,
    sort,
    limit: Math.min(query.limit, 24),
    cursor: query.cursor,
  };
}

function filterPriceHistory<T extends { condition_bucket: string; listing_source?: string }>(
  rows: T[],
  query: MarketplaceQueryPlan,
) {
  return rows.filter((point) => {
    if (query.source && point.listing_source !== query.source) return false;
    const conditionOrGrade = query.grade ?? query.condition;
    if (conditionOrGrade && point.condition_bucket !== conditionOrGrade) return false;
    return true;
  });
}

function listingProductSlug(listing: MarketplaceListingSnapshot) {
  const slug = listing.snapshot_payload?.productSlug;
  return typeof slug === "string" ? slug : null;
}

function mockProductListings(productSlug: string) {
  return mockMarketplaceListings.filter((listing) => listingProductSlug(listing) === productSlug);
}

function mockListingProductId(listing: MarketplaceListingSnapshot) {
  return listing.product_id ?? listingProductSlug(listing) ?? listing.listing_id;
}

function availableListingUnits(
  listing: Pick<MarketplaceListingSnapshot, "quantity_available_snapshot">,
) {
  return Math.max(Number(listing.quantity_available_snapshot) || 0, 0);
}

function listingVariantCountKey(listing: MarketplaceListingSnapshot) {
  return (
    listing.variant_id ??
    (typeof listing.snapshot_payload?.conditionBucket === "string"
      ? listing.snapshot_payload.conditionBucket
      : null)
  );
}

function activeVariantCounts(listings: MarketplaceListingSnapshot[]) {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    if (listing.listing_state !== "active") continue;
    const key = listingVariantCountKey(listing);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + availableListingUnits(listing));
  }
  return counts;
}

function mockGeneratedProduct(productSlug: string, listings: MarketplaceListingSnapshot[]) {
  const firstListing = listings[0];
  if (!firstListing) return null;
  const lowestPriceSatang = listings.reduce(
    (lowest, listing) => Math.min(lowest, listing.item_price_satang),
    firstListing.item_price_satang,
  );
  const lowerTitle = firstListing.title.toLowerCase();

  return projectPublicProductMarket({
    id: mockListingProductId(firstListing),
    product_slug: productSlug,
    title: firstListing.title,
    brand: lowerTitle.includes("one piece")
      ? "One Piece"
      : lowerTitle.includes("pokemon")
        ? "Pokemon"
        : null,
    category: "Trading Cards",
    series_name: null,
    set_name: null,
    card_code: null,
    language: null,
    hero_image_url: firstListing.photo_urls?.[0] ?? null,
    product_metadata: {
      itemType: firstListing.snapshot_payload?.itemType ?? "card",
      conditionCode: firstListing.snapshot_payload?.conditionCode ?? null,
      sourceKind: firstListing.snapshot_payload?.sourceKind ?? null,
    },
    active_listing_count: listings.length,
    lowest_price_satang: lowestPriceSatang,
    sold_count: 0,
    updated_at: firstListing.updated_at,
  }) as MarketplaceProductMarketProduct;
}

function mockGeneratedVariants(listings: MarketplaceListingSnapshot[]) {
  const variants = new Map<string, MarketplaceProductMarketVariant>();
  const counts = activeVariantCounts(listings);
  for (const listing of listings) {
    const variantSlug =
      typeof listing.snapshot_payload?.variantSlug === "string"
        ? listing.snapshot_payload.variantSlug
        : "default";
    const conditionBucket =
      typeof listing.snapshot_payload?.conditionBucket === "string"
        ? listing.snapshot_payload.conditionBucket
        : "raw_a";
    if (variants.has(variantSlug)) continue;
    variants.set(
      variantSlug,
      projectPublicVariant({
        id:
          listing.variant_id ??
          `${mockListingProductId(listing)}-${variantSlug.replace(/[^a-z0-9-]/gi, "")}`,
        product_id: mockListingProductId(listing),
        variant_slug: variantSlug,
        variant_label:
          typeof listing.snapshot_payload?.variantLabel === "string"
            ? listing.snapshot_payload.variantLabel
            : listing.snapshot_payload?.conditionCode ?? "Default",
        condition_bucket: conditionBucket,
        grade_service:
          typeof listing.snapshot_payload?.gradeService === "string"
            ? listing.snapshot_payload.gradeService
            : null,
        grade_value:
          typeof listing.snapshot_payload?.gradeValue === "string"
            ? listing.snapshot_payload.gradeValue
            : null,
        active_listing_count:
          counts.get(listing.variant_id ?? conditionBucket) ?? 0,
        variant_snapshot: {
          conditionBucket,
          conditionCode: listing.snapshot_payload?.conditionCode ?? null,
          variantLabel: listing.snapshot_payload?.variantLabel ?? null,
        },
        image_urls: listing.photo_urls ?? [],
        updated_at: listing.updated_at,
      }),
    );
  }
  return Array.from(variants.values());
}

function mockGeneratedPriceHistory(
  listings: MarketplaceListingSnapshot[],
  query: MarketplaceQueryPlan,
) {
  const history = listings.map((listing) => ({
    id: `${listing.listing_id}-history`,
    product_id: mockListingProductId(listing),
    variant_id: listing.variant_id,
    listing_id: listing.listing_id,
    listing_source: listing.listing_source as "official_shop" | "user_seller",
    condition_bucket:
      typeof listing.snapshot_payload?.conditionBucket === "string"
        ? listing.snapshot_payload.conditionBucket
        : "raw_a",
    grade_service:
      typeof listing.snapshot_payload?.gradeService === "string"
        ? listing.snapshot_payload.gradeService
        : null,
    grade_value:
      typeof listing.snapshot_payload?.gradeValue === "string"
        ? listing.snapshot_payload.gradeValue
        : null,
    item_price_satang: listing.item_price_satang,
    currency: listing.currency,
    sold_at: listing.updated_at,
    public_snapshot: {
      listingSource: listing.listing_source,
      conditionBucket: listing.snapshot_payload?.conditionBucket ?? null,
      sourceBadge: listing.snapshot_payload?.sourceBadge ?? null,
    },
  }));
  return filterPriceHistory(history, query).map(
    projectPublicPriceHistoryPoint,
  ) as MarketplaceProductMarketPriceHistoryPoint[];
}

async function mockProductMarket(
  productSlug: string,
  query: MarketplaceQueryPlan,
): Promise<MarketplaceProductMarketView> {
  if (productSlug === mockMarketplaceProductMarket.product.product_slug) {
    const page = await listMarketplaceListingPage({
      ...listingQueryFromPlan(query),
      productId: mockMarketplaceProductMarket.product.id,
    });

    return {
      product: projectPublicProductMarket(
        mockMarketplaceProductMarket.product,
      ) as MarketplaceProductMarketProduct,
      variants: mockMarketplaceProductMarket.variants.map((variant) =>
        projectPublicVariant(variant),
      ) as MarketplaceProductMarketVariant[],
      listings: page.listings,
      priceHistory: filterPriceHistory(mockMarketplaceProductMarket.priceHistory, query).map(
        projectPublicPriceHistoryPoint,
      ) as MarketplaceProductMarketPriceHistoryPoint[],
    };
  }

  const allProductListings = mockProductListings(productSlug);
  const product = mockGeneratedProduct(productSlug, allProductListings);
  if (!product) {
    throw new MarketplaceServiceError(
      "marketplace_product_not_found",
      "Marketplace product was not found.",
      404,
    );
  }
  const page = await listMarketplaceListingPage({
    ...listingQueryFromPlan(query),
    productId: product.id,
  });

  return {
    product,
    variants: mockGeneratedVariants(allProductListings),
    listings: page.listings,
    priceHistory: mockGeneratedPriceHistory(allProductListings, query),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function productMarketFromRpcPayload(payload: unknown): MarketplaceProductMarketView {
  if (!isRecord(payload) || !isRecord(payload.product)) {
    throw new MarketplaceServiceError(
      "marketplace_product_not_found",
      "Marketplace product was not found.",
      404,
    );
  }

  return {
    product: projectPublicProductMarket(payload.product) as MarketplaceProductMarketProduct,
    variants: recordArray(payload.variants).map((variant) =>
      projectPublicVariant(variant),
    ) as MarketplaceProductMarketVariant[],
    listings: recordArray(payload.listings).map((listing) =>
      projectPublicListingSnapshot(listing),
    ) as MarketplaceListingSnapshot[],
    priceHistory: recordArray(payload.priceHistory).map((point) =>
      projectPublicPriceHistoryPoint(point),
    ) as MarketplaceProductMarketPriceHistoryPoint[],
  };
}

export async function getMarketplaceProductMarket(
  productSlug: string,
  query: MarketplaceQueryPlan = marketplaceQueryPlanFromUrl("http://ynott.local/marketplace"),
): Promise<MarketplaceProductMarketView> {
  const slug = safeSlug(productSlug);
  if (marketplaceConfig().mockData) {
    return mockProductMarket(slug, query);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_get_product_market_detail", {
    p_slug: slug,
    p_source: query.source ?? null,
    p_condition: query.condition ?? null,
    p_grade: query.grade ?? null,
    p_limit: Math.min(query.limit, 40),
  });

  if (result.error) throw marketplaceRpcError(result.error);
  return productMarketFromRpcPayload(result.data);
}

export async function listMarketplaceProductListings(
  productSlug: string,
  query: MarketplaceQueryPlan,
) {
  const market = await getMarketplaceProductMarket(productSlug, query);
  return market.listings;
}

export async function listMarketplaceProductPriceHistory(
  productIdOrSlug: string,
  query: MarketplaceQueryPlan,
): Promise<MarketplaceProductMarketPriceHistoryPoint[]> {
  if (marketplaceConfig().mockData) {
    if (productIdOrSlug === mockMarketplaceProductMarket.product.product_slug) {
      return filterPriceHistory(mockMarketplaceProductMarket.priceHistory, query).map(
        projectPublicPriceHistoryPoint,
      ) as MarketplaceProductMarketPriceHistoryPoint[];
    }

    const listing = /^[0-9a-f]{8}-/i.test(productIdOrSlug)
      ? mockMarketplaceListings.find((item) => item.product_id === productIdOrSlug)
      : null;
    const productSlug = listing ? listingProductSlug(listing) : safeSlug(productIdOrSlug);
    return productSlug
      ? mockGeneratedPriceHistory(mockProductListings(productSlug), query)
      : [];
  }

  const supabase = createMarketplaceSupabaseClient();
  let productId = productIdOrSlug;
  if (!/^[0-9a-f]{8}-/i.test(productIdOrSlug)) {
    const productResult = await supabase
      .from("marketplace_products")
      .select("id")
      .eq("product_slug", safeSlug(productIdOrSlug))
      .maybeSingle();
    if (productResult.error) throw marketplaceRpcError(productResult.error);
    if (!productResult.data?.id) return [];
    productId = String(productResult.data.id);
  }

  let historyQuery = supabase
    .from("marketplace_price_history_points")
    .select(PRICE_HISTORY_SELECT)
    .eq("product_id", productId)
    .order("sold_at", { ascending: false })
    .limit(40);

  const conditionOrGrade = query.grade ?? query.condition;
  if (conditionOrGrade) {
    historyQuery = historyQuery.eq("condition_bucket", conditionOrGrade);
  }
  if (query.source) {
    historyQuery = historyQuery.eq("listing_source", query.source);
  }

  const result = await historyQuery;
  if (result.error) throw marketplaceRpcError(result.error);
  return ((result.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) =>
    projectPublicPriceHistoryPoint(row),
  ) as MarketplaceProductMarketPriceHistoryPoint[];
}
