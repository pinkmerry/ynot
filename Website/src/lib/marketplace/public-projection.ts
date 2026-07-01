type JsonRecord = Record<string, unknown>;

export const PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS = [
  "sourceBadge",
  "itemType",
  "conditionCode",
  "sourceKind",
  "productSlug",
  "variantSlug",
  "variantLabel",
  "conditionBucket",
  "gradeService",
  "gradeValue",
] as const;

export const PUBLIC_PRODUCT_METADATA_KEYS = [
  "releaseDate",
  "rarity",
  "productCode",
  "language",
  "illustrator",
  "setNumber",
] as const;

export const PUBLIC_PRICE_HISTORY_KEYS = [
  "listingSource",
  "conditionBucket",
  "gradeService",
  "gradeValue",
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickRecord(
  value: unknown,
  keys: readonly string[],
): JsonRecord {
  if (!isRecord(value)) return {};
  const output: JsonRecord = {};
  for (const key of keys) {
    const field = value[key];
    if (
      typeof field === "string" ||
      typeof field === "number" ||
      typeof field === "boolean" ||
      field === null
    ) {
      output[key] = field;
    }
  }
  return output;
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 16)
    : [];
}

export function projectPublicListingSnapshot<
  T extends { snapshot_payload?: unknown; photo_urls?: unknown },
>(row: T) {
  return {
    ...row,
    photo_urls: safeStringArray(row.photo_urls),
    snapshot_payload: pickRecord(
      row.snapshot_payload,
      PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS,
    ),
  };
}

export function projectPublicProductMarket<
  T extends { product_metadata?: unknown; active_listing_count?: unknown; sold_count?: unknown },
>(row: T) {
  return {
    ...row,
    product_metadata: pickRecord(row.product_metadata, PUBLIC_PRODUCT_METADATA_KEYS),
    active_listing_count: Number(row.active_listing_count ?? 0),
    sold_count: Number(row.sold_count ?? 0),
  };
}

export function projectPublicProductBrowseSummary<
  T extends {
    product_metadata?: unknown;
    active_listing_count?: unknown;
    official_listing_count?: unknown;
    user_seller_listing_count?: unknown;
    variant_count?: unknown;
    lowest_price_satang?: unknown;
    highest_price_satang?: unknown;
    sold_count?: unknown;
    ranking_score?: unknown;
  },
>(row: T) {
  return {
    ...row,
    product_metadata: pickRecord(row.product_metadata, PUBLIC_PRODUCT_METADATA_KEYS),
    active_listing_count: Number(row.active_listing_count ?? 0),
    official_listing_count: Number(row.official_listing_count ?? 0),
    user_seller_listing_count: Number(row.user_seller_listing_count ?? 0),
    variant_count: Number(row.variant_count ?? 0),
    lowest_price_satang: Number(row.lowest_price_satang ?? 0),
    highest_price_satang: Number(row.highest_price_satang ?? 0),
    sold_count: Number(row.sold_count ?? 0),
    ranking_score: Number(row.ranking_score ?? 0),
  };
}

export function projectPublicVariant<
  T extends {
    variant_snapshot?: unknown;
    image_urls?: unknown;
    active_listing_count?: unknown;
  },
>(row: T) {
  return {
    ...row,
    variant_snapshot: pickRecord(row.variant_snapshot, PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS),
    image_urls: safeStringArray(row.image_urls),
    active_listing_count: Number(row.active_listing_count ?? 0),
  };
}

export function projectPublicPriceHistoryPoint<
  T extends { public_snapshot?: unknown },
>(row: T) {
  return {
    ...row,
    public_snapshot: pickRecord(row.public_snapshot, PUBLIC_PRICE_HISTORY_KEYS),
  };
}
