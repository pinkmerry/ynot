export type MarketplaceListingSnapshot = {
  listing_id: string;
  inventory_item_id: string;
  product_id: string | null;
  variant_id: string | null;
  seller_public_profile_id: string | null;
  listing_source: "official_shop" | "user_seller";
  listing_state: "active";
  public_slug: string | null;
  title: string;
  item_price_satang: number;
  currency: "THB";
  quantity_available_snapshot: number;
  public_description: string | null;
  photo_urls: string[] | null;
  snapshot_payload: {
    sourceBadge?: string;
    itemType?: string;
    conditionCode?: string | null;
    sourceKind?: string;
    productSlug?: string;
    variantSlug?: string;
    variantLabel?: string;
    conditionBucket?: string;
    gradeService?: string;
    gradeValue?: string;
  } | null;
  snapshot_version: number;
  visible_from: string | null;
  updated_at: string | null;
};

export type MarketplaceOfficialListingSnapshot = MarketplaceListingSnapshot & {
  listing_source: "official_shop";
};

export type MarketplacePaymentInstructions = {
  method: "bank_transfer";
  currency: "THB";
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  promptPayId: string | null;
  paymentWindowMinutes: number;
  receiverConfigured: boolean;
  acceptedImageTypes: readonly string[];
};

export type MarketplaceMoneyPolicy = {
  policyId: string | null;
  sellerFeeBps: number;
  buyerServiceFeeBps: number;
  shippingFeeSatang: number;
  currency: "THB";
  calculationVersion: number;
  effectiveFrom: string | null;
  adminNote: string | null;
};

export type MarketplaceCartSummary = {
  cartCount: number;
  watchlistCount: number;
  subtotalSatang: number;
  unavailableCount: number;
  currency: "THB";
  updatedAt: string | null;
};

export type MarketplaceCartItem = {
  id: string;
  listingId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  listing: MarketplaceListingSnapshot;
};

export type MarketplaceWatchlistItem = {
  id: string;
  listingId: string;
  createdAt: string;
  updatedAt: string;
  listing: MarketplaceListingSnapshot;
};

export type MarketplaceCustomerCartState = {
  items: MarketplaceCartItem[];
  summary: MarketplaceCartSummary;
};

export type MarketplaceWatchlistState = {
  items: MarketplaceWatchlistItem[];
  summary: MarketplaceCartSummary;
};

export type MarketplaceCartMutationResult = {
  status: "added" | "already_in_cart" | "removed" | "not_in_cart" | "unknown";
  item: MarketplaceCartItem | null;
  summary: MarketplaceCartSummary;
};

export type MarketplaceWatchlistMutationResult = {
  status:
    | "watched"
    | "already_watched"
    | "unwatched"
    | "not_watched"
    | "unknown";
  item: MarketplaceWatchlistItem | null;
  summary: MarketplaceCartSummary;
};

export type MarketplacePublicListingPayload = {
  listingId: string;
  inventoryItemId: string;
  productId: string | null;
  variantId: string | null;
  sellerPublicProfileId: string | null;
  listingSource: "official_shop" | "user_seller";
  listingState: string;
  publicSlug: string | null;
  title: string;
  itemPriceSatang: number;
  currency: "THB";
  quantityAvailableSnapshot: number;
  publicDescription: string | null;
  photoUrls: string[];
  publicAttributes: NonNullable<MarketplaceListingSnapshot["snapshot_payload"]>;
  snapshotVersion: number;
  visibleFrom: string | null;
  updatedAt: string | null;
};

export type MarketplacePublicCartItem = Omit<
  MarketplaceCartItem,
  "listing"
> & {
  listing: MarketplacePublicListingPayload;
};

export type MarketplacePublicWatchlistItem = Omit<
  MarketplaceWatchlistItem,
  "listing"
> & {
  listing: MarketplacePublicListingPayload;
};
