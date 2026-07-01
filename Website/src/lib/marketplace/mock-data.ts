import "server-only";

import type {
  MarketplaceListingPage,
  MarketplaceListingQuery,
  MarketplaceListingSnapshot,
  MarketplaceListingSort,
} from "./listings";

const NOW = "2026-06-29T09:00:00.000Z";
const MOCK_PRODUCT_ID = "99999999-9999-4999-8999-999999999999";
const MOCK_VARIANT_PSA10_ID = "99999999-aaaa-4aaa-8aaa-999999999999";
const MOCK_VARIANT_RAW_A_ID = "99999999-bbbb-4bbb-8bbb-999999999999";
const MOCK_VARIANT_SEALED_ID = "99999999-cccc-4ccc-8ccc-999999999999";
const MOCK_ZORO_PRODUCT_ID = "99999999-1234-4abc-8abc-999999999999";
const MOCK_ZORO_VARIANT_PSA10_ID = "99999999-1234-4abe-8abe-999999999999";
const MOCK_ZORO_VARIANT_RAW_A_ID = "99999999-1234-4abd-8abd-999999999999";
export const MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID =
  "77777777-0000-4777-8777-777777777777";
export const MOCK_USER_SELLER_PUBLIC_PROFILE_ID =
  "77777777-1111-4777-8777-777777777777";
const MOCK_CARD_PHOTOS = [
  "/test-assets/ynot-test-card-gold.svg",
  "/test-assets/ynot-test-card-blue.svg",
  "/test-assets/ynot-test-pack-one-piece.svg",
];
const MOCK_PACK_PHOTOS = [
  "/test-assets/ynot-test-pack-pokemon.svg",
  "/test-assets/ynot-test-pack-one-piece.svg",
  "/test-assets/ynot-test-card-gold.svg",
];

export const MOCK_MARKETPLACE_ADDRESS = {
  id: "mock-address-bangkok",
  label: "Local mock address",
  recipientName: "Boo Boo",
  phone: "0800000000",
  summary: "YNOT Local Store, Siam, Pathum Wan, Bangkok 10330, Thailand",
  deliveryNote: "Mock checkout only. No real shipment.",
};

function zoroListing(input: {
  listingId: string;
  inventoryItemId: string;
  index: number;
  source: MarketplaceListingSnapshot["listing_source"];
  variantId: string;
  variantSlug: string;
  variantLabel: string;
  conditionBucket: string;
  conditionCode: string;
  priceSatang: number;
  photoUrl: string;
  photoUrls?: string[];
}) {
  const sourceBadge =
    input.source === "official_shop" ? "Official shop" : "User seller";
  const sourceKind =
    input.source === "official_shop" ? "official_stock" : "seller_consignment";
  const dayMinute = String(50 - input.index).padStart(2, "0");
  return {
    listing_id: input.listingId,
    inventory_item_id: input.inventoryItemId,
    product_id: MOCK_ZORO_PRODUCT_ID,
    variant_id: input.variantId,
    seller_public_profile_id:
      input.source === "official_shop"
        ? MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID
        : MOCK_USER_SELLER_PUBLIC_PROFILE_ID,
    listing_source: input.source,
    listing_state: "active",
    public_slug: `${input.variantSlug}-eb02-001-roronoa-zoro-${input.index}`,
    title: "EB02-001 Roronoa Zoro",
    item_price_satang: input.priceSatang,
    currency: "THB",
    quantity_available_snapshot: 1,
    public_description:
      "EB02-001 Roronoa Zoro mock market offer used to verify variant filtering and counts.",
    photo_urls: input.photoUrls ?? [input.photoUrl],
    snapshot_payload: {
      sourceBadge,
      itemType: "card",
      conditionCode: input.conditionCode,
      sourceKind,
      productSlug: "eb02-001-roronoa-zoro",
      variantSlug: input.variantSlug,
      variantLabel: input.variantLabel,
      conditionBucket: input.conditionBucket,
      gradeService: input.conditionBucket === "psa_10" ? "PSA" : undefined,
      gradeValue: input.conditionBucket === "psa_10" ? "10" : undefined,
    },
    snapshot_version: 1,
    visible_from: `2026-06-29T08:${dayMinute}:00.000Z`,
    updated_at: `2026-06-29T08:${dayMinute}:00.000Z`,
  } satisfies MarketplaceListingSnapshot;
}

const mockZoroListings: MarketplaceListingSnapshot[] = [
  ...Array.from({ length: 10 }, (_, index) =>
    zoroListing({
      listingId: `14141414-1414-4141-8141-1414141414${String(index + 1).padStart(2, "0")}`,
      inventoryItemId: `24141414-1414-4141-8141-1414141414${String(index + 1).padStart(2, "0")}`,
      index,
      source: index % 2 === 0 ? "official_shop" : "user_seller",
      variantId: MOCK_ZORO_VARIANT_PSA10_ID,
      variantSlug: "psa-10",
      variantLabel: "PSA 10",
      conditionBucket: "psa_10",
      conditionCode: "PSA 10",
      priceSatang: 560_000 + index * 7_500,
      photoUrl: "/test-assets/ynot-test-card-gold.svg",
      photoUrls: index === 0 ? MOCK_CARD_PHOTOS : undefined,
    }),
  ),
  zoroListing({
    listingId: "12121212-1212-4121-8121-121212121212",
    inventoryItemId: "22121212-1212-4121-8121-121212121212",
    index: 10,
    source: "official_shop",
    variantId: MOCK_ZORO_VARIANT_RAW_A_ID,
    variantSlug: "raw-a",
    variantLabel: "Raw A",
    conditionBucket: "raw_a",
    conditionCode: "NM",
    priceSatang: 420_000,
    photoUrl: "/test-assets/ynot-test-card-gold.svg",
    photoUrls: MOCK_CARD_PHOTOS,
  }),
  zoroListing({
    listingId: "13131313-1313-4131-8131-131313131313",
    inventoryItemId: "23131313-1313-4131-8131-131313131313",
    index: 11,
    source: "user_seller",
    variantId: MOCK_ZORO_VARIANT_RAW_A_ID,
    variantSlug: "raw-a",
    variantLabel: "Raw A",
    conditionBucket: "raw_a",
    conditionCode: "NM",
    priceSatang: 390_000,
    photoUrl: "/test-assets/ynot-test-card-blue.svg",
    photoUrls: [
      "/test-assets/ynot-test-card-blue.svg",
      "/test-assets/ynot-test-card-gold.svg",
      "/test-assets/ynot-test-pack-pokemon.svg",
    ],
  }),
  ...Array.from({ length: 3 }, (_, index) =>
    zoroListing({
      listingId: `15151515-1515-4151-8151-1515151515${String(index + 1).padStart(2, "0")}`,
      inventoryItemId: `25151515-1515-4151-8151-1515151515${String(index + 1).padStart(2, "0")}`,
      index: 12 + index,
      source: index % 2 === 0 ? "user_seller" : "official_shop",
      variantId: MOCK_ZORO_VARIANT_RAW_A_ID,
      variantSlug: "raw-a",
      variantLabel: "Raw A",
      conditionBucket: "raw_a",
      conditionCode: "NM",
      priceSatang: 405_000 + index * 8_000,
      photoUrl:
        index % 2 === 0
          ? "/test-assets/ynot-test-card-blue.svg"
          : "/test-assets/ynot-test-card-gold.svg",
    }),
  ),
];

export const mockMarketplaceListings: MarketplaceListingSnapshot[] = [
  ...mockZoroListings,
  {
    listing_id: "11111111-1111-4111-8111-111111111111",
    inventory_item_id: "21111111-1111-4111-8111-111111111111",
    product_id: MOCK_PRODUCT_ID,
    variant_id: MOCK_VARIANT_PSA10_ID,
    seller_public_profile_id: MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID,
    listing_source: "official_shop",
    listing_state: "active",
    public_slug: "official-psa-gold-pikachu",
    title: "YNOT Official PSA 10 Pikachu Gold Promo",
    item_price_satang: 128_000,
    currency: "THB",
    quantity_available_snapshot: 2,
    public_description:
      "Official shop sample card with clean slab condition and ready-to-ship stock.",
    photo_urls: MOCK_CARD_PHOTOS,
    snapshot_payload: {
      sourceBadge: "Official shop",
      itemType: "card",
      conditionCode: "PSA 10",
      sourceKind: "official_stock",
      productSlug: "pikachu-gem-mint-promo",
      variantSlug: "psa-10",
      variantLabel: "PSA 10",
      conditionBucket: "psa_10",
      gradeService: "PSA",
      gradeValue: "10",
    },
    snapshot_version: 1,
    visible_from: NOW,
    updated_at: NOW,
  },
  {
    listing_id: "22222222-2222-4222-8222-222222222222",
    inventory_item_id: "22222222-3333-4333-8333-222222222222",
    product_id: MOCK_PRODUCT_ID,
    variant_id: MOCK_VARIANT_RAW_A_ID,
    seller_public_profile_id: MOCK_USER_SELLER_PUBLIC_PROFILE_ID,
    listing_source: "user_seller",
    listing_state: "active",
    public_slug: "seller-one-piece-manga-rare",
    title: "Seller Consignment One Piece Manga Rare",
    item_price_satang: 86_000,
    currency: "THB",
    quantity_available_snapshot: 1,
    public_description:
      "Member-listed card inspected for marketplace sale. Buyer sees clear item condition and price.",
    photo_urls: [
      "/test-assets/ynot-test-card-blue.svg",
      "/test-assets/ynot-test-card-gold.svg",
      "/test-assets/ynot-test-pack-pokemon.svg",
    ],
    snapshot_payload: {
      sourceBadge: "User seller",
      itemType: "card",
      conditionCode: "NM",
      sourceKind: "seller_consignment",
      productSlug: "pikachu-gem-mint-promo",
      variantSlug: "raw-a",
      variantLabel: "A",
      conditionBucket: "raw_a",
    },
    snapshot_version: 1,
    visible_from: "2026-06-29T08:30:00.000Z",
    updated_at: "2026-06-29T08:30:00.000Z",
  },
  {
    listing_id: "33333333-3333-4333-8333-333333333333",
    inventory_item_id: "23333333-3333-4333-8333-333333333333",
    product_id: "99999999-dddd-4ddd-8ddd-999999999999",
    variant_id: MOCK_VARIANT_SEALED_ID,
    seller_public_profile_id: MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID,
    listing_source: "official_shop",
    listing_state: "active",
    public_slug: "official-pokemon-sealed-box",
    title: "Pokemon Scarlet & Violet Sealed Booster Box",
    item_price_satang: 54_000,
    currency: "THB",
    quantity_available_snapshot: 5,
    public_description:
      "Official sealed box sample. Buyer sees item price first, then checkout fees.",
    photo_urls: MOCK_PACK_PHOTOS,
    snapshot_payload: {
      sourceBadge: "Official shop",
      itemType: "sealed_box",
      conditionCode: "Sealed",
      sourceKind: "official_stock",
      productSlug: "pokemon-sealed-booster-box",
      variantSlug: "sealed-box",
      variantLabel: "Sealed box",
      conditionBucket: "raw_a",
    },
    snapshot_version: 1,
    visible_from: "2026-06-29T08:00:00.000Z",
    updated_at: "2026-06-29T08:00:00.000Z",
  },
  {
    listing_id: "44444444-4444-4444-8444-444444444444",
    inventory_item_id: "24444444-4444-4444-8444-444444444444",
    product_id: "99999999-eeee-4eee-8eee-999999999999",
    variant_id: null,
    seller_public_profile_id: MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID,
    listing_source: "official_shop",
    listing_state: "active",
    public_slug: "official-one-piece-sealed-pack",
    title: "One Piece OP Sample Sealed Pack",
    item_price_satang: 12_500,
    currency: "THB",
    quantity_available_snapshot: 12,
    public_description:
      "Low-price sealed pack sample for testing listing cards and checkout totals.",
    photo_urls: [
      "/test-assets/ynot-test-pack-one-piece.svg",
      "/test-assets/ynot-test-pack-pokemon.svg",
    ],
    snapshot_payload: {
      sourceBadge: "Official shop",
      itemType: "sealed_pack",
      conditionCode: "Sealed",
      sourceKind: "official_stock",
      productSlug: "one-piece-sample-sealed-pack",
      variantSlug: "sealed-pack",
      variantLabel: "Sealed pack",
      conditionBucket: "raw_a",
    },
    snapshot_version: 1,
    visible_from: "2026-06-29T07:30:00.000Z",
    updated_at: "2026-06-29T07:30:00.000Z",
  },
];

function listingProductSlug(listing: MarketplaceListingSnapshot) {
  const productSlug = listing.snapshot_payload?.productSlug;
  return typeof productSlug === "string" && productSlug ? productSlug : null;
}

function listingRecentTime(listing: MarketplaceListingSnapshot) {
  return listing.visible_from ?? listing.updated_at ?? "1970-01-01T00:00:00.000Z";
}

function productBrandFromListing(listing: MarketplaceListingSnapshot) {
  const searchable = `${listing.title} ${listing.public_description ?? ""}`.toLowerCase();
  if (searchable.includes("one piece") || searchable.includes("zoro")) return "One Piece";
  if (searchable.includes("pokemon") || searchable.includes("pikachu")) return "Pokemon";
  return null;
}

function productCardCodeFromSlug(productSlug: string) {
  const match = productSlug.match(/^([a-z]{1,4}\d{0,3}-\d{3})/i);
  return match ? match[1].toUpperCase() : null;
}

export function groupMarketplaceListingsByProductSlug(
  listings: MarketplaceListingSnapshot[] = mockMarketplaceListings,
) {
  const groups = new Map<
    string,
    {
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
      variantIds: Set<string>;
      lowest_price_satang: number;
      highest_price_satang: number;
      recent_listing_at: string | null;
      sold_count: number;
      last_sold_at: string | null;
      ranking_score: number;
    }
  >();

  for (const listing of listings) {
    if (listing.listing_state !== "active" || listing.quantity_available_snapshot <= 0) {
      continue;
    }
    const productSlug = listingProductSlug(listing);
    if (!productSlug) continue;
    const existing = groups.get(productSlug);
    const recentTime = listingRecentTime(listing);
    if (!existing) {
      groups.set(productSlug, {
        product_id: listing.product_id ?? productSlug,
        product_slug: productSlug,
        title: listing.title,
        brand: productBrandFromListing(listing),
        category: "Trading Cards",
        series_name: null,
        set_name: null,
        card_code: productCardCodeFromSlug(productSlug),
        language: null,
        hero_image_url: listing.photo_urls?.[0] ?? null,
        product_metadata: {
          productCode: productCardCodeFromSlug(productSlug),
          language: null,
        },
        active_listing_count: 1,
        official_listing_count: listing.listing_source === "official_shop" ? 1 : 0,
        user_seller_listing_count: listing.listing_source === "user_seller" ? 1 : 0,
        variantIds: new Set(listing.variant_id ? [listing.variant_id] : []),
        lowest_price_satang: listing.item_price_satang,
        highest_price_satang: listing.item_price_satang,
        recent_listing_at: recentTime,
        sold_count: 0,
        last_sold_at: null,
        ranking_score: 10 + Date.parse(recentTime) / 86_400_000_000,
      });
      continue;
    }

    existing.active_listing_count += 1;
    if (listing.listing_source === "official_shop") existing.official_listing_count += 1;
    if (listing.listing_source === "user_seller") existing.user_seller_listing_count += 1;
    if (listing.variant_id) existing.variantIds.add(listing.variant_id);
    existing.lowest_price_satang = Math.min(
      existing.lowest_price_satang,
      listing.item_price_satang,
    );
    existing.highest_price_satang = Math.max(
      existing.highest_price_satang,
      listing.item_price_satang,
    );
    if (
      !existing.recent_listing_at ||
      Date.parse(recentTime) > Date.parse(existing.recent_listing_at)
    ) {
      existing.recent_listing_at = recentTime;
    }
    existing.ranking_score =
      existing.active_listing_count * 10 +
      Date.parse(existing.recent_listing_at ?? recentTime) / 86_400_000_000;
  }

  return Array.from(groups.values()).map(({ variantIds, ...product }) => ({
    ...product,
    variant_count: Math.max(variantIds.size, 1),
  }));
}

export const mockMarketplaceProductMarket = {
  product: {
    id: MOCK_PRODUCT_ID,
    product_slug: "pikachu-gem-mint-promo",
    title: "Pikachu Gem Mint Promo",
    brand: "Pokemon",
    category: "Trading Cards",
    series_name: "Scarlet & Violet",
    set_name: "YNOT Promo Set",
    card_code: "YNP-025",
    language: "JP",
    hero_image_url: "/test-assets/ynot-test-card-gold.svg",
    product_metadata: {
      releaseDate: "2026-06-01",
      rarity: "Promo",
      productCode: "YNP-025",
      language: "JP",
    },
    active_listing_count: 2,
    lowest_price_satang: 86_000,
    sold_count: 4,
    updated_at: NOW,
  },
  variants: [
    {
      id: MOCK_VARIANT_PSA10_ID,
      product_id: MOCK_PRODUCT_ID,
      variant_slug: "psa-10",
      variant_label: "PSA 10",
      condition_bucket: "psa_10",
      grade_service: "PSA",
      grade_value: "10",
      variant_snapshot: {
        conditionBucket: "psa_10",
        gradeService: "PSA",
        gradeValue: "10",
        variantLabel: "PSA 10",
      },
      image_urls: ["/test-assets/ynot-test-card-gold.svg"],
      updated_at: NOW,
    },
    {
      id: MOCK_VARIANT_RAW_A_ID,
      product_id: MOCK_PRODUCT_ID,
      variant_slug: "raw-a",
      variant_label: "A",
      condition_bucket: "raw_a",
      grade_service: null,
      grade_value: null,
      variant_snapshot: {
        conditionBucket: "raw_a",
        variantLabel: "A",
      },
      image_urls: ["/test-assets/ynot-test-card-blue.svg"],
      updated_at: "2026-06-29T08:30:00.000Z",
    },
  ],
  listings: mockMarketplaceListings.filter(
    (listing) => listing.product_id === MOCK_PRODUCT_ID,
  ),
  priceHistory: [
    {
      id: "99999999-1111-4111-8111-999999999999",
      product_id: MOCK_PRODUCT_ID,
      variant_id: MOCK_VARIANT_PSA10_ID,
      listing_id: "11111111-1111-4111-8111-111111111111",
      listing_source: "official_shop",
      condition_bucket: "psa_10",
      grade_service: "PSA",
      grade_value: "10",
      item_price_satang: 128_000,
      currency: "THB",
      sold_at: "2026-06-28T12:00:00.000Z",
      public_snapshot: {
        listingSource: "official_shop",
        conditionBucket: "psa_10",
        gradeService: "PSA",
        gradeValue: "10",
      },
    },
    {
      id: "99999999-2222-4222-8222-999999999999",
      product_id: MOCK_PRODUCT_ID,
      variant_id: MOCK_VARIANT_RAW_A_ID,
      listing_id: "22222222-2222-4222-8222-222222222222",
      listing_source: "user_seller",
      condition_bucket: "raw_a",
      grade_service: null,
      grade_value: null,
      item_price_satang: 86_000,
      currency: "THB",
      sold_at: "2026-06-27T12:00:00.000Z",
      public_snapshot: {
        listingSource: "user_seller",
        conditionBucket: "raw_a",
      },
    },
  ],
};

export const mockMarketplaceSellerSubmissions = [
  {
    id: "77777777-7777-4777-8777-777777777777",
    submission_number: "MKT-MOCK-1001",
    status: "inspection_passed",
    item_type: "card",
    title_snapshot: "Mock Seller PSA 9 Charizard V Alt Art",
    condition_code: "graded",
    asking_price_satang: 95_000,
    currency: "THB",
    seller_marketplace_fee_bps: 1000,
    seller_marketplace_fee_satang: 9_500,
    payout_preview_satang: 85_500,
    source_kind: "seller_physical_intake",
    version: 2,
    created_at: "2026-06-29T08:10:00.000Z",
    updated_at: "2026-06-29T08:45:00.000Z",
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    submission_number: "MKT-MOCK-1002",
    status: "submitted_for_review",
    item_type: "sealed_pack",
    title_snapshot: "Mock Seller One Piece OP Pack",
    condition_code: "sealed",
    asking_price_satang: 18_000,
    currency: "THB",
    seller_marketplace_fee_bps: 1000,
    seller_marketplace_fee_satang: 1_800,
    payout_preview_satang: 16_200,
    source_kind: "seller_physical_intake",
    version: 1,
    created_at: "2026-06-29T07:50:00.000Z",
    updated_at: "2026-06-29T07:50:00.000Z",
  },
];

export const mockMarketplaceOrders = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    pending_payment_order_id: "55555555-aaaa-4555-8555-555555555555",
    listing_id: "11111111-1111-4111-8111-111111111111",
    inventory_item_id: "21111111-1111-4111-8111-111111111111",
    listing_source: "official_shop",
    payment_state: "payment_submitted",
    fulfilment_state: "admin_reviewing_payment",
    refund_state: "none",
    item_price_satang: 128_000,
    shipping_fee_satang: 15_000,
    buyer_service_fee_satang: 12_800,
    buyer_total_satang: 155_800,
    currency: "THB",
    created_at: "2026-06-29T08:55:00.000Z",
    updated_at: "2026-06-29T08:57:00.000Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    pending_payment_order_id: "66666666-aaaa-4666-8666-666666666666",
    listing_id: "22222222-2222-4222-8222-222222222222",
    inventory_item_id: "22222222-3333-4333-8333-222222222222",
    listing_source: "user_seller",
    payment_state: "valid",
    fulfilment_state: "ready_to_ship",
    refund_state: "none",
    item_price_satang: 86_000,
    shipping_fee_satang: 15_000,
    buyer_service_fee_satang: 8_600,
    buyer_total_satang: 109_600,
    currency: "THB",
    created_at: "2026-06-29T08:05:00.000Z",
    updated_at: "2026-06-29T08:25:00.000Z",
  },
];

function normalizedSort(sort: MarketplaceListingSort | undefined) {
  return sort ?? "newest";
}

export function mockMarketplaceListingPage(
  options: MarketplaceListingQuery = {},
): MarketplaceListingPage {
  const sort = normalizedSort(options.sort);
  const q = options.q?.trim().toLowerCase();
  const filtered = mockMarketplaceListings
    .filter((listing) =>
      options.productId ? listing.product_id === options.productId : true,
    )
    .filter((listing) =>
      options.variantId ? listing.variant_id === options.variantId : true,
    )
    .filter((listing) =>
      options.sellerPublicProfileId
        ? listing.seller_public_profile_id === options.sellerPublicProfileId
        : true,
    )
    .filter((listing) =>
      options.source ? listing.listing_source === options.source : true,
    )
    .filter((listing) =>
      options.itemType
        ? listing.snapshot_payload?.itemType === options.itemType
        : true,
    )
    .filter((listing) =>
      options.condition
        ? listing.snapshot_payload?.conditionBucket === options.condition
        : true,
    )
    .filter((listing) =>
      options.grade
        ? listing.snapshot_payload?.conditionBucket === options.grade
        : true,
    )
    .filter((listing) =>
      options.inStockOnly ? listing.quantity_available_snapshot > 0 : true,
    )
    .filter((listing) => {
      if (!q) return true;
      const searchable = [
        listing.title,
        listing.public_slug,
        listing.public_description,
        listing.snapshot_payload?.sourceBadge,
        listing.snapshot_payload?.itemType,
        listing.snapshot_payload?.conditionCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });

  filtered.sort((left, right) => {
    if (sort === "price_asc") {
      return left.item_price_satang - right.item_price_satang;
    }
    if (sort === "price_desc") {
      return right.item_price_satang - left.item_price_satang;
    }
    return (
      Date.parse(right.visible_from ?? "") - Date.parse(left.visible_from ?? "")
    );
  });

  return {
    listings: filtered.slice(0, options.limit ?? 24),
    nextCursor: null,
  };
}

export function getMockMarketplaceListing(listingId: string) {
  return (
    mockMarketplaceListings.find(
      (listing) =>
        listing.listing_id === listingId || listing.public_slug === listingId,
    ) ?? null
  );
}

export function getMockMarketplaceOrder(orderId: string) {
  const order = mockMarketplaceOrders.find((entry) => entry.id === orderId);
  if (!order) return null;
  return {
    ...order,
    listing: getMockMarketplaceListing(order.listing_id),
  };
}
