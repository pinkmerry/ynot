import "server-only";

import { type SafeMarketplaceAccount } from "./account-bridge";
import { marketplaceConfig } from "./config";
import {
  getMarketplaceListing,
  type MarketplaceListingSnapshot,
} from "./listings";
import { mockMarketplaceListings } from "./mock-data";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";
import type {
  MarketplaceCartItem,
  MarketplaceCartMutationResult,
  MarketplaceCartSummary,
  MarketplaceCustomerCartState,
  MarketplacePublicCartItem,
  MarketplacePublicListingPayload,
  MarketplacePublicWatchlistItem,
  MarketplaceWatchlistItem,
  MarketplaceWatchlistMutationResult,
  MarketplaceWatchlistState,
} from "./types";
export type {
  MarketplaceCartItem,
  MarketplaceCartMutationResult,
  MarketplaceCartSummary,
  MarketplaceCustomerCartState,
  MarketplacePublicCartItem,
  MarketplacePublicListingPayload,
  MarketplacePublicWatchlistItem,
  MarketplaceWatchlistItem,
  MarketplaceWatchlistMutationResult,
  MarketplaceWatchlistState,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MarketplaceCartRow = {
  id: string;
  listing_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

type MarketplaceWatchlistRow = {
  id: string;
  listing_id: string;
  created_at: string;
  updated_at: string;
};

export type MarketplaceCartAccount = Pick<SafeMarketplaceAccount, "accountId">;

export type MarketplaceCartMutationInput = {
  account: MarketplaceCartAccount;
  listingId: string;
  actorProfileId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  quantity?: number;
};

export type MarketplaceWatchlistMutationInput = Omit<
  MarketplaceCartMutationInput,
  "quantity"
>;

const EMPTY_SUMMARY: MarketplaceCartSummary = {
  cartCount: 0,
  watchlistCount: 0,
  subtotalSatang: 0,
  unavailableCount: 0,
  currency: "THB",
  updatedAt: null,
};

const mockCartRows = new Map<string, MarketplaceCartRow[]>();
const mockWatchlistRows = new Map<string, MarketplaceWatchlistRow[]>();

export function assertMarketplaceCartUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function mockRowId(prefix: string, accountId: string, listingId: string) {
  const input = `${prefix}:${accountId}:${listingId}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, "0");
  return `${suffix.slice(0, 8)}-${suffix.slice(0, 4)}-4${suffix.slice(1, 4)}-8${suffix.slice(2, 5)}-${suffix}${suffix.slice(0, 4)}`;
}

function defaultMockCartRows(accountId: string): MarketplaceCartRow[] {
  const listedAt = nowIso();
  return mockMarketplaceListings.slice(0, 2).map((listing) => ({
    id: mockRowId("cart", accountId, listing.listing_id),
    listing_id: listing.listing_id,
    quantity: 1,
    created_at: listedAt,
    updated_at: listedAt,
  }));
}

function defaultMockWatchlistRows(accountId: string): MarketplaceWatchlistRow[] {
  const listedAt = nowIso();
  return mockMarketplaceListings.slice(1, 3).map((listing) => ({
    id: mockRowId("watchlist", accountId, listing.listing_id),
    listing_id: listing.listing_id,
    created_at: listedAt,
    updated_at: listedAt,
  }));
}

function cartRowsForMockAccount(accountId: string) {
  const normalized = assertMarketplaceCartUuid(accountId, "account_id");
  const rows = mockCartRows.get(normalized) ?? defaultMockCartRows(normalized);
  mockCartRows.set(normalized, rows);
  return rows;
}

function watchlistRowsForMockAccount(accountId: string) {
  const normalized = assertMarketplaceCartUuid(accountId, "account_id");
  const rows =
    mockWatchlistRows.get(normalized) ?? defaultMockWatchlistRows(normalized);
  mockWatchlistRows.set(normalized, rows);
  return rows;
}

function assertListingAvailable(listing: MarketplaceListingSnapshot) {
  if (
    listing.listing_state !== "active" ||
    Number(listing.quantity_available_snapshot) <= 0
  ) {
    throw new MarketplaceServiceError(
      "marketplace_listing_not_available",
      "Marketplace listing is not available.",
      409,
    );
  }
  return listing;
}

async function activeListingOrUnavailable(listingId: string) {
  const listing = await getMarketplaceListing(listingId);
  return assertListingAvailable(listing);
}

async function safeListing(listingId: string) {
  try {
    return await getMarketplaceListing(listingId);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_listing_not_found"
    ) {
      return null;
    }
    throw error;
  }
}

async function cartItemFromRow(row: MarketplaceCartRow) {
  const listing = await safeListing(row.listing_id);
  if (!listing) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    quantity: Number(row.quantity || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listing,
  } satisfies MarketplaceCartItem;
}

async function watchlistItemFromRow(row: MarketplaceWatchlistRow) {
  const listing = await safeListing(row.listing_id);
  if (!listing) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listing,
  } satisfies MarketplaceWatchlistItem;
}

async function compactCartRows(rows: MarketplaceCartRow[]) {
  const items = await Promise.all(rows.map(cartItemFromRow));
  return items.filter((item): item is MarketplaceCartItem => Boolean(item));
}

async function compactWatchlistRows(rows: MarketplaceWatchlistRow[]) {
  const items = await Promise.all(rows.map(watchlistItemFromRow));
  return items.filter((item): item is MarketplaceWatchlistItem => Boolean(item));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSummary(value: unknown): MarketplaceCartSummary {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    cartCount: numberField(input.cartCount),
    watchlistCount: numberField(input.watchlistCount),
    subtotalSatang: numberField(input.subtotalSatang),
    unavailableCount: numberField(input.unavailableCount),
    currency: "THB",
    updatedAt: stringOrNull(input.updatedAt),
  };
}

function safePhotoUrl(value: unknown) {
  if (typeof value !== "string") return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (
      !/(\.|^)ynotopen\.com$/.test(url.hostname) &&
      !/(\.|^)supabase\.co$/.test(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeSnapshotPayload(value: unknown) {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    sourceBadge: stringOrNull(input.sourceBadge) ?? undefined,
    itemType: stringOrNull(input.itemType) ?? undefined,
    conditionCode: stringOrNull(input.conditionCode),
    sourceKind: stringOrNull(input.sourceKind) ?? undefined,
    productSlug: stringOrNull(input.productSlug) ?? undefined,
    variantSlug: stringOrNull(input.variantSlug) ?? undefined,
    variantLabel: stringOrNull(input.variantLabel) ?? undefined,
    conditionBucket: stringOrNull(input.conditionBucket) ?? undefined,
    gradeService: stringOrNull(input.gradeService) ?? undefined,
    gradeValue: stringOrNull(input.gradeValue) ?? undefined,
  } satisfies NonNullable<MarketplaceListingSnapshot["snapshot_payload"]>;
}

function listingStateField(
  value: unknown,
): MarketplaceListingSnapshot["listing_state"] {
  switch (value) {
    case "draft":
    case "active":
    case "hidden":
    case "pending_payment":
    case "sold":
    case "archived":
      return value;
    default:
      return "hidden";
  }
}

function normalizeListing(value: unknown): MarketplaceListingSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const listingId = stringOrNull(input.listingId);
  if (!listingId) return null;
  return {
    listing_id: listingId,
    inventory_item_id: stringOrNull(input.inventoryItemId) ?? "",
    product_id: stringOrNull(input.productId),
    variant_id: stringOrNull(input.variantId),
    seller_public_profile_id: stringOrNull(input.sellerPublicProfileId),
    listing_source:
      input.listingSource === "user_seller" ? "user_seller" : "official_shop",
    listing_state: listingStateField(input.listingState),
    public_slug: stringOrNull(input.publicSlug),
    title:
      typeof input.title === "string" && input.title.length > 0
        ? input.title
        : "Marketplace listing",
    item_price_satang: numberField(input.itemPriceSatang),
    currency: "THB",
    quantity_available_snapshot: numberField(
      input.quantityAvailableSnapshot,
    ),
    public_description: stringOrNull(input.publicDescription),
    photo_urls: arrayField(input.photoUrls)
      .map(safePhotoUrl)
      .filter((url): url is string => Boolean(url)),
    snapshot_payload: normalizeSnapshotPayload(input.publicAttributes),
    snapshot_version: numberField(input.snapshotVersion) || 1,
    visible_from: stringOrNull(input.visibleFrom),
    updated_at: stringOrNull(input.updatedAt),
  };
}

function publicListingPayload(
  listing: MarketplaceListingSnapshot,
): MarketplacePublicListingPayload {
  return {
    listingId: listing.listing_id,
    inventoryItemId: listing.inventory_item_id,
    productId: listing.product_id,
    variantId: listing.variant_id,
    sellerPublicProfileId: listing.seller_public_profile_id,
    listingSource: listing.listing_source,
    listingState: listing.listing_state,
    publicSlug: listing.public_slug,
    title: listing.title,
    itemPriceSatang: listing.item_price_satang,
    currency: "THB",
    quantityAvailableSnapshot: listing.quantity_available_snapshot,
    publicDescription: listing.public_description,
    photoUrls: (listing.photo_urls ?? [])
      .map(safePhotoUrl)
      .filter((url): url is string => Boolean(url)),
    publicAttributes: normalizeSnapshotPayload(listing.snapshot_payload),
    snapshotVersion: listing.snapshot_version,
    visibleFrom: listing.visible_from,
    updatedAt: listing.updated_at,
  };
}

export function toMarketplacePublicCartItem(
  item: MarketplaceCartItem,
): MarketplacePublicCartItem {
  return {
    id: item.id,
    listingId: item.listingId,
    quantity: item.quantity,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    listing: publicListingPayload(item.listing),
  };
}

export function toMarketplacePublicWatchlistItem(
  item: MarketplaceWatchlistItem,
): MarketplacePublicWatchlistItem {
  return {
    id: item.id,
    listingId: item.listingId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    listing: publicListingPayload(item.listing),
  };
}

export function toMarketplacePublicCartState(
  state: MarketplaceCustomerCartState,
) {
  return {
    items: state.items.map(toMarketplacePublicCartItem),
    summary: state.summary,
  };
}

export function toMarketplacePublicWatchlistState(
  state: MarketplaceWatchlistState,
) {
  return {
    items: state.items.map(toMarketplacePublicWatchlistItem),
    summary: state.summary,
  };
}

export function toMarketplacePublicCartMutation(
  result: MarketplaceCartMutationResult,
) {
  return {
    status: result.status,
    item: result.item ? toMarketplacePublicCartItem(result.item) : null,
    summary: result.summary,
  };
}

export function toMarketplacePublicWatchlistMutation(
  result: MarketplaceWatchlistMutationResult,
) {
  return {
    status: result.status,
    item: result.item ? toMarketplacePublicWatchlistItem(result.item) : null,
    summary: result.summary,
  };
}

function normalizeCartItems(value: unknown): MarketplaceCartItem[] {
  return arrayField(value)
    .map((item) => {
      const input = (item ?? {}) as Record<string, unknown>;
      const listing = normalizeListing(input.listing);
      if (!listing) return null;
      return {
        id: String(input.id ?? ""),
        listingId: String(input.listingId ?? ""),
        quantity: Math.max(1, numberField(input.quantity) || 1),
        createdAt: stringOrNull(input.createdAt) ?? new Date(0).toISOString(),
        updatedAt: stringOrNull(input.updatedAt) ?? new Date(0).toISOString(),
        listing,
      } satisfies MarketplaceCartItem;
    })
    .filter((item): item is MarketplaceCartItem => Boolean(item));
}

function normalizeWatchlistItems(value: unknown): MarketplaceWatchlistItem[] {
  return arrayField(value)
    .map((item) => {
      const input = (item ?? {}) as Record<string, unknown>;
      const listing = normalizeListing(input.listing);
      if (!listing) return null;
      return {
        id: String(input.id ?? ""),
        listingId: String(input.listingId ?? ""),
        createdAt: stringOrNull(input.createdAt) ?? new Date(0).toISOString(),
        updatedAt: stringOrNull(input.updatedAt) ?? new Date(0).toISOString(),
        listing,
      } satisfies MarketplaceWatchlistItem;
    })
    .filter((item): item is MarketplaceWatchlistItem => Boolean(item));
}

function normalizeCartMutationResult(
  value: unknown,
): MarketplaceCartMutationResult {
  const input = (value ?? {}) as Record<string, unknown>;
  const status =
    typeof input.status === "string"
      ? (input.status as MarketplaceCartMutationResult["status"])
      : "unknown";
  return {
    status,
    item: input.item ? normalizeCartItems([input.item])[0] ?? null : null,
    summary: normalizeSummary(input.summary),
  };
}

function normalizeWatchlistMutationResult(
  value: unknown,
): MarketplaceWatchlistMutationResult {
  const input = (value ?? {}) as Record<string, unknown>;
  const status =
    typeof input.status === "string"
      ? (input.status as MarketplaceWatchlistMutationResult["status"])
      : "unknown";
  return {
    status,
    item: input.item ? normalizeWatchlistItems([input.item])[0] ?? null : null,
    summary: normalizeSummary(input.summary),
  };
}

function summaryFromMock(
  cartItems: MarketplaceCartItem[],
  watchlistItems: MarketplaceWatchlistItem[],
): MarketplaceCartSummary {
  const activeCartItems = cartItems.filter(
    (item) =>
      item.listing.listing_state === "active" &&
      item.listing.quantity_available_snapshot > 0,
  );
  return {
    cartCount: activeCartItems.length,
    watchlistCount: watchlistItems.length,
    subtotalSatang: activeCartItems.reduce(
      (total, item) =>
        total + item.listing.item_price_satang * Math.max(1, item.quantity),
      0,
    ),
    unavailableCount: cartItems.length - activeCartItems.length,
    currency: "THB",
    updatedAt: cartItems[0]?.updatedAt ?? watchlistItems[0]?.updatedAt ?? null,
  };
}

function requireActorProfile(actorProfileId: string | null) {
  if (!actorProfileId) {
    throw new MarketplaceServiceError(
      "marketplace_profile_required",
      "Login is required.",
      401,
    );
  }
  return assertMarketplaceCartUuid(actorProfileId, "profile_id");
}

export async function getMarketplaceCustomerCartState(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCustomerCartState> {
  if (!account || !actorProfileId) return { items: [], summary: EMPTY_SUMMARY };
  const buyerAccountId = assertMarketplaceCartUuid(
    account.accountId,
    "account_id",
  );
  if (marketplaceConfig().mockData) {
    const items = await compactCartRows(cartRowsForMockAccount(buyerAccountId));
    const watchlistItems = await compactWatchlistRows(
      watchlistRowsForMockAccount(buyerAccountId),
    );
    return { items, summary: summaryFromMock(items, watchlistItems) };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_list_customer_cart", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_actor_profile_id: requireActorProfile(actorProfileId),
    p_limit: 50,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  const payload = (result.data ?? {}) as Record<string, unknown>;
  return {
    items: normalizeCartItems(payload.items),
    summary: normalizeSummary(payload.summary),
  };
}

export async function getMarketplaceCustomerCartSummary(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceCartSummary> {
  if (!account || !actorProfileId) return EMPTY_SUMMARY;
  const buyerAccountId = assertMarketplaceCartUuid(
    account.accountId,
    "account_id",
  );
  if (marketplaceConfig().mockData) {
    const cartItems = await compactCartRows(cartRowsForMockAccount(buyerAccountId));
    const watchlistItems = await compactWatchlistRows(
      watchlistRowsForMockAccount(buyerAccountId),
    );
    return summaryFromMock(cartItems, watchlistItems);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_get_customer_cart_summary", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_actor_profile_id: requireActorProfile(actorProfileId),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeSummary(result.data);
}

export async function listMarketplaceCart(
  accountId: string,
  actorProfileId: string | null,
) {
  return getMarketplaceCustomerCartState(
    { accountId },
    actorProfileId,
  ).then((state) => state.items);
}

export async function getMarketplaceWatchlistState(
  account: MarketplaceCartAccount | null,
  actorProfileId: string | null,
): Promise<MarketplaceWatchlistState> {
  if (!account || !actorProfileId) return { items: [], summary: EMPTY_SUMMARY };
  const buyerAccountId = assertMarketplaceCartUuid(
    account.accountId,
    "account_id",
  );
  if (marketplaceConfig().mockData) {
    const items = await compactWatchlistRows(
      watchlistRowsForMockAccount(buyerAccountId),
    );
    const cartItems = await compactCartRows(cartRowsForMockAccount(buyerAccountId));
    return { items, summary: summaryFromMock(cartItems, items) };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_list_customer_watchlist", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_actor_profile_id: requireActorProfile(actorProfileId),
    p_limit: 100,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  const payload = (result.data ?? {}) as Record<string, unknown>;
  return {
    items: normalizeWatchlistItems(payload.items),
    summary: normalizeSummary(payload.summary),
  };
}

export async function listMarketplaceWatchlist(
  accountId: string,
  actorProfileId: string | null,
) {
  return getMarketplaceWatchlistState(
    { accountId },
    actorProfileId,
  ).then((state) => state.items);
}

export async function addMarketplaceCartItem(
  input: MarketplaceCartMutationInput,
): Promise<MarketplaceCartMutationResult> {
  const buyerAccountId = assertMarketplaceCartUuid(
    input.account.accountId,
    "account_id",
  );
  const safeListingId = assertMarketplaceCartUuid(input.listingId, "listing_id");
  const quantity = Number(input.quantity ?? 1);
  if (quantity !== 1) {
    throw new MarketplaceServiceError(
      "marketplace_quantity_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }

  if (marketplaceConfig().mockData) {
    await activeListingOrUnavailable(safeListingId);
    const rows = cartRowsForMockAccount(buyerAccountId);
    const existing = rows.find((row) => row.listing_id === safeListingId);
    if (existing) {
      const item = await cartItemFromRow(existing);
      const summary = await getMarketplaceCustomerCartSummary(
        input.account,
        input.actorProfileId,
      );
      return { status: "already_in_cart", item, summary };
    }
    const row = {
      id: mockRowId("cart", buyerAccountId, safeListingId),
      listing_id: safeListingId,
      quantity,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    rows.unshift(row);
    const item = await cartItemFromRow(row);
    const summary = await getMarketplaceCustomerCartSummary(
      input.account,
      input.actorProfileId,
    );
    return { status: "added", item, summary };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_add_customer_cart_item", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_listing_id: safeListingId,
    p_quantity: quantity,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_request_id: input.requestId,
    p_actor_profile_id: requireActorProfile(input.actorProfileId),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeCartMutationResult(result.data);
}

export async function removeMarketplaceCartItem(
  input: MarketplaceWatchlistMutationInput,
): Promise<MarketplaceCartMutationResult> {
  const buyerAccountId = assertMarketplaceCartUuid(
    input.account.accountId,
    "account_id",
  );
  const safeListingId = assertMarketplaceCartUuid(input.listingId, "listing_id");

  if (marketplaceConfig().mockData) {
    const rows = cartRowsForMockAccount(buyerAccountId);
    const index = rows.findIndex((row) => row.listing_id === safeListingId);
    if (index === -1) {
      const summary = await getMarketplaceCustomerCartSummary(
        input.account,
        input.actorProfileId,
      );
      return { status: "not_in_cart", item: null, summary };
    }
    const [removed] = rows.splice(index, 1);
    const item = await cartItemFromRow(removed);
    const summary = await getMarketplaceCustomerCartSummary(
      input.account,
      input.actorProfileId,
    );
    return { status: "removed", item, summary };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_remove_customer_cart_item", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_listing_id: safeListingId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_request_id: input.requestId,
    p_actor_profile_id: requireActorProfile(input.actorProfileId),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeCartMutationResult(result.data);
}

export async function watchMarketplaceWatchlistItem(
  input: MarketplaceWatchlistMutationInput,
): Promise<MarketplaceWatchlistMutationResult> {
  const buyerAccountId = assertMarketplaceCartUuid(
    input.account.accountId,
    "account_id",
  );
  const safeListingId = assertMarketplaceCartUuid(input.listingId, "listing_id");

  if (marketplaceConfig().mockData) {
    await activeListingOrUnavailable(safeListingId);
    const rows = watchlistRowsForMockAccount(buyerAccountId);
    const existing = rows.find((row) => row.listing_id === safeListingId);
    if (existing) {
      const item = await watchlistItemFromRow(existing);
      const summary = await getMarketplaceCustomerCartSummary(
        input.account,
        input.actorProfileId,
      );
      return { status: "already_watched", item, summary };
    }
    const row = {
      id: mockRowId("watchlist", buyerAccountId, safeListingId),
      listing_id: safeListingId,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    rows.unshift(row);
    const item = await watchlistItemFromRow(row);
    const summary = await getMarketplaceCustomerCartSummary(
      input.account,
      input.actorProfileId,
    );
    return { status: "watched", item, summary };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_watch_listing", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_listing_id: safeListingId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_request_id: input.requestId,
    p_actor_profile_id: requireActorProfile(input.actorProfileId),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeWatchlistMutationResult(result.data);
}

export async function removeMarketplaceWatchlistItem(
  input: MarketplaceWatchlistMutationInput,
): Promise<MarketplaceWatchlistMutationResult> {
  const buyerAccountId = assertMarketplaceCartUuid(
    input.account.accountId,
    "account_id",
  );
  const safeListingId = assertMarketplaceCartUuid(input.listingId, "listing_id");

  if (marketplaceConfig().mockData) {
    const rows = watchlistRowsForMockAccount(buyerAccountId);
    const index = rows.findIndex((row) => row.listing_id === safeListingId);
    if (index === -1) {
      const summary = await getMarketplaceCustomerCartSummary(
        input.account,
        input.actorProfileId,
      );
      return { status: "not_watched", item: null, summary };
    }
    const [removed] = rows.splice(index, 1);
    const item = await watchlistItemFromRow(removed);
    const summary = await getMarketplaceCustomerCartSummary(
      input.account,
      input.actorProfileId,
    );
    return { status: "unwatched", item, summary };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_unwatch_listing", {
    p_buyer_marketplace_account_id: buyerAccountId,
    p_listing_id: safeListingId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_request_id: input.requestId,
    p_actor_profile_id: requireActorProfile(input.actorProfileId),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeWatchlistMutationResult(result.data);
}
