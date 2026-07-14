import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfficialItemType = "card" | "sealed_box" | "sealed_pack";

export type OfficialOrderDashboardRow = {
  id: string;
  listing_id: string;
  payment_state: string;
  fulfilment_state: string;
  refund_state: string;
  item_price_satang: number;
  shipping_fee_satang: number;
  buyer_service_fee_satang: number;
  buyer_total_satang: number;
  currency: "THB";
  created_at: string | null;
  updated_at: string | null;
};

export const OFFICIAL_INVENTORY_ARCHIVE_FIELDS = [
  "expectedVersion",
  "adminNote",
] as const;

export const OFFICIAL_INVENTORY_UPDATE_FIELDS = [
  "expectedVersion",
  "title",
  "conditionCode",
  "quantityTotal",
  "itemPriceSatang",
  "publicDescription",
  "photoUrls",
  "referenceSnapshot",
  "sourceReferenceId",
  "procurementNote",
  "adminNote",
] as const;

export const OFFICIAL_LISTING_HIDE_FIELDS = [
  "expectedSnapshotVersion",
  "adminNote",
] as const;

export const OFFICIAL_LISTING_UPDATE_FIELDS = [
  "expectedSnapshotVersion",
  "listingState",
  "title",
  "publicDescription",
  "photoUrls",
  "adminNote",
] as const;

const OFFICIAL_ITEM_TYPES: ReadonlySet<string> = new Set([
  "card",
  "sealed_box",
  "sealed_pack",
]);

function textField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return trimmed;
}

function optionalTextField(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return textField(value, label, maxLength);
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return Number(value);
}

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return positiveInteger(value, label);
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return Number(value);
}

function paymentResult(value: unknown) {
  if (value !== "paid" && value !== "failed") {
    throw new MarketplaceServiceError(
      "marketplace_payment_result_invalid",
      "Marketplace payment result is invalid.",
      400,
    );
  }
  return value;
}

function paymentProviderEvidence(body: Record<string, unknown>) {
  const paymentState = paymentResult(body.paymentState);
  const providerReference = optionalTextField(
    body.providerReference,
    "provider_reference",
    160,
  );
  const providerAmountSatang =
    body.providerAmountSatang === undefined ||
    body.providerAmountSatang === null ||
    body.providerAmountSatang === ""
      ? null
      : positiveInteger(body.providerAmountSatang, "provider_amount");
  const providerCurrency = optionalTextField(
    body.providerCurrency,
    "provider_currency",
    8,
  )?.toUpperCase() ?? null;

  if (paymentState === "paid") {
    if (!providerReference || !providerAmountSatang || providerCurrency !== "THB") {
      throw new MarketplaceServiceError(
        "marketplace_payment_evidence_required",
        "Marketplace payment evidence is required.",
        400,
      );
    }
  }

  return {
    paymentState,
    providerReference,
    providerAmountSatang,
    providerCurrency,
  };
}

function jsonObject(value: unknown, label: string) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  const serialized = JSON.stringify(value);
  if (/customer_bag|gacha|reward|draw/i.test(serialized)) {
    throw new MarketplaceServiceError(
      "marketplace_official_stock_only",
      "Official shop inventory must use official stock.",
      422,
    );
  }
  return value as Record<string, unknown>;
}

function optionalJsonObject(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  return jsonObject(value, label);
}

function photoUrls(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw new MarketplaceServiceError(
      "marketplace_photo_urls_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length > 500) {
      throw new MarketplaceServiceError(
        "marketplace_photo_urls_invalid",
        "Marketplace request is invalid.",
        400,
      );
    }
    const url = entry.trim();
    if (!url.startsWith("https://") && !url.startsWith("/")) {
      throw new MarketplaceServiceError(
        "marketplace_photo_urls_invalid",
        "Marketplace product photos must use approved HTTPS or site paths.",
        400,
      );
    }
    return url;
  });
}

function optionalPhotoUrls(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return photoUrls(value);
}

function assertAdmin(admin: ResolvedAdminSession | null | undefined) {
  if (!admin?.profileId || !admin.adminRole) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: "owner" | "admin" | "staff" };
}

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

async function checkoutGroupForOrder(
  supabase: ReturnType<typeof createMarketplaceSupabaseClient>,
  orderId: string,
) {
  const result = await supabase
    .from("marketplace_checkout_items")
    .select("checkout_group_id")
    .eq("order_id", assertUuid(orderId, "order_id"))
    .maybeSingle();
  if (result.error) {
    const material = `${result.error.code ?? ""} ${result.error.message ?? ""}`.toLowerCase();
    if (
      material.includes("42p01") ||
      material.includes("pgrst205") ||
      (material.includes("marketplace_checkout_items") &&
        material.includes("not find"))
    ) {
      return null;
    }
    throw marketplaceRpcError(result.error);
  }
  const row = result.data as { checkout_group_id?: unknown } | null;
  return typeof row?.checkout_group_id === "string"
    ? row.checkout_group_id
    : null;
}

function normalizeItemType(value: unknown) {
  if (typeof value !== "string" || !OFFICIAL_ITEM_TYPES.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_item_type_invalid",
      "Official shop supports cards, sealed boxes, and sealed packs.",
      400,
    );
  }
  return value as OfficialItemType;
}

function optionalUpdateTextField(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (value === undefined || value === null) return undefined;
  return optionalTextField(value, label, maxLength);
}

function normalizeListingState(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value !== "active" && value !== "hidden") {
    throw new MarketplaceServiceError(
      "marketplace_listing_state_invalid",
      "Marketplace listing state is invalid.",
      400,
    );
  }
  return value;
}

function withoutUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export function normalizeOfficialInventoryInput(body: Record<string, unknown>) {
  return {
    itemType: normalizeItemType(body.itemType),
    title: textField(body.title, "title", 240),
    conditionCode: optionalTextField(body.conditionCode, "condition_code", 80),
    quantityTotal: positiveInteger(body.quantityTotal, "quantity"),
    itemPriceSatang: positiveInteger(body.itemPriceSatang, "price"),
    publicDescription: optionalTextField(
      body.publicDescription,
      "public_description",
      1000,
    ),
    photoUrls: photoUrls(body.photoUrls),
    referenceSnapshot: jsonObject(body.referenceSnapshot, "reference_snapshot"),
    sourceReferenceId: optionalTextField(
      body.sourceReferenceId,
      "source_reference_id",
      160,
    ),
    procurementNote: optionalTextField(
      body.procurementNote,
      "procurement_note",
      1000,
    ),
    adminNote: optionalTextField(body.adminNote, "admin_note", 1000),
  };
}

function normalizeOfficialInventoryUpdateInput(body: Record<string, unknown>) {
  return {
    expectedVersion: positiveInteger(body.expectedVersion, "version"),
    title: optionalUpdateTextField(body.title, "title", 240),
    conditionCode: optionalUpdateTextField(
      body.conditionCode,
      "condition_code",
      80,
    ),
    quantityTotal: optionalPositiveInteger(body.quantityTotal, "quantity"),
    itemPriceSatang: optionalPositiveInteger(body.itemPriceSatang, "price"),
    publicDescription: optionalUpdateTextField(
      body.publicDescription,
      "public_description",
      1000,
    ),
    photoUrls: optionalPhotoUrls(body.photoUrls),
    referenceSnapshot: optionalJsonObject(
      body.referenceSnapshot,
      "reference_snapshot",
    ),
    sourceReferenceId: optionalUpdateTextField(
      body.sourceReferenceId,
      "source_reference_id",
      160,
    ),
    procurementNote: optionalUpdateTextField(
      body.procurementNote,
      "procurement_note",
      1000,
    ),
    adminNote: textField(body.adminNote, "admin_note", 1000),
  };
}

function normalizeOfficialListingUpdateInput(body: Record<string, unknown>) {
  return {
    expectedSnapshotVersion: positiveInteger(
      body.expectedSnapshotVersion,
      "version",
    ),
    listingState: normalizeListingState(body.listingState),
    title: optionalUpdateTextField(body.title, "title", 240),
    publicDescription: optionalUpdateTextField(
      body.publicDescription,
      "public_description",
      1000,
    ),
    photoUrls: optionalPhotoUrls(body.photoUrls),
    adminNote: textField(body.adminNote, "admin_note", 1000),
  };
}

export async function createOfficialInventory(input: {
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const inventory = normalizeOfficialInventoryInput(input.body);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_create_official_inventory", {
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_item_type: inventory.itemType,
    p_title: inventory.title,
    p_condition_code: inventory.conditionCode,
    p_quantity_total: inventory.quantityTotal,
    p_item_price_satang: inventory.itemPriceSatang,
    p_public_description: inventory.publicDescription,
    p_photo_urls: inventory.photoUrls,
    p_reference_snapshot: inventory.referenceSnapshot,
    p_source_reference_id: inventory.sourceReferenceId,
    p_procurement_note: inventory.procurementNote,
    p_admin_note: inventory.adminNote,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function listOfficialInventory() {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_inventory_items")
    .select(
      [
        "id",
        "item_type",
        "item_state",
        "title_snapshot",
        "condition_code",
        "quantity_total",
        "quantity_available",
        "item_price_satang",
        "currency",
        "version",
        "updated_at",
      ].join(","),
    )
    .eq("seller_type", "official_shop")
    .eq("source_kind", "official_stock")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data ?? [];
}

export async function getOfficialInventoryDetail(inventoryId: string) {
  const supabase = createMarketplaceSupabaseClient();
  const inventoryResult = await supabase
    .from("marketplace_inventory_items")
    .select(
      [
        "id",
        "inventory_source_id",
        "item_type",
        "item_state",
        "seller_type",
        "source_kind",
        "title_snapshot",
        "condition_code",
        "reference_snapshot",
        "quantity_total",
        "quantity_available",
        "item_price_satang",
        "currency",
        "public_description",
        "photo_urls",
        "admin_note",
        "seller_payout_state",
        "version",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("id", assertUuid(inventoryId, "inventory_id"))
    .eq("seller_type", "official_shop")
    .eq("source_kind", "official_stock")
    .maybeSingle();

  if (inventoryResult.error) throw marketplaceRpcError(inventoryResult.error);
  if (!inventoryResult.data) {
    throw new MarketplaceServiceError(
      "marketplace_inventory_not_found",
      "Marketplace inventory was not found.",
      404,
    );
  }

  const inventory = inventoryResult.data as unknown as Record<string, unknown>;
  const sourceId =
    typeof inventory.inventory_source_id === "string"
      ? inventory.inventory_source_id
      : "";
  const [sourceResult, listingResult] = await Promise.all([
    supabase
      .from("marketplace_inventory_sources")
      .select(
        [
          "id",
          "source_kind",
          "source_state",
          "source_reference_id",
          "procurement_note",
          "private_admin_note",
          "updated_at",
        ].join(","),
      )
      .eq("id", sourceId)
      .eq("source_kind", "official_stock")
      .maybeSingle(),
    supabase
      .from("marketplace_listing_snapshots")
      .select(
        [
          "listing_id",
          "listing_state",
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
        ].join(","),
      )
      .eq("inventory_item_id", inventory.id)
      .eq("listing_source", "official_shop")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  if (sourceResult.error) throw marketplaceRpcError(sourceResult.error);
  if (listingResult.error) throw marketplaceRpcError(listingResult.error);

  const photoUrlsValue = inventory.photo_urls;
  const photoCount = Array.isArray(photoUrlsValue) ? photoUrlsValue.length : 0;
  const quantityAvailable = Number(inventory.quantity_available ?? 0);
  const itemPriceSatang = Number(inventory.item_price_satang ?? 0);

  return {
    inventory,
    source: sourceResult.data ?? null,
    listings: listingResult.data ?? [],
    publishReadiness: {
      hasPhoto: photoCount > 0,
      hasPrice: itemPriceSatang > 0,
      hasQuantity: quantityAvailable > 0,
      canPublish: photoCount > 0 && itemPriceSatang > 0 && quantityAvailable > 0,
    },
  };
}

export async function updateOfficialInventory(input: {
  inventoryId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const inventory = normalizeOfficialInventoryUpdateInput(input.body);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_update_official_inventory",
    withoutUndefined({
      p_inventory_item_id: assertUuid(input.inventoryId, "inventory_id"),
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_admin_profile_id: admin.profileId,
      p_admin_role: admin.adminRole,
      p_expected_version: inventory.expectedVersion,
      p_title: inventory.title,
      p_condition_code: inventory.conditionCode,
      p_quantity_total: inventory.quantityTotal,
      p_item_price_satang: inventory.itemPriceSatang,
      p_public_description: inventory.publicDescription,
      p_photo_urls: inventory.photoUrls,
      p_reference_snapshot: inventory.referenceSnapshot,
      p_source_reference_id: inventory.sourceReferenceId,
      p_procurement_note: inventory.procurementNote,
      p_admin_note: inventory.adminNote,
    }),
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function publishOfficialListing(input: {
  inventoryId: string;
  expectedVersion: unknown;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_publish_official_listing", {
    p_inventory_item_id: assertUuid(input.inventoryId, "inventory_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_expected_version: positiveInteger(input.expectedVersion, "version"),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function archiveOfficialInventory(input: {
  inventoryId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_archive_official_inventory", {
    p_inventory_item_id: assertUuid(input.inventoryId, "inventory_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_expected_version: positiveInteger(input.body.expectedVersion, "version"),
    p_admin_note: textField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function hideOfficialListing(input: {
  listingId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_hide_official_listing", {
    p_listing_id: assertUuid(input.listingId, "listing_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_expected_snapshot_version: positiveInteger(
      input.body.expectedSnapshotVersion,
      "version",
    ),
    p_admin_note: textField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function updateOfficialListing(input: {
  listingId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const listing = normalizeOfficialListingUpdateInput(input.body);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_update_official_listing",
    withoutUndefined({
      p_listing_id: assertUuid(input.listingId, "listing_id"),
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_admin_profile_id: admin.profileId,
      p_admin_role: admin.adminRole,
      p_expected_snapshot_version: listing.expectedSnapshotVersion,
      p_listing_state: listing.listingState,
      p_title: listing.title,
      p_public_description: listing.publicDescription,
      p_photo_urls: listing.photoUrls,
      p_admin_note: listing.adminNote,
    }),
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function recordOfficialFulfilment(input: {
  orderId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const fulfilmentState = textField(
    input.body.fulfilmentState,
    "fulfilment_state",
    40,
  );
  if (!["packed", "shipped", "completed"].includes(fulfilmentState)) {
    throw new MarketplaceServiceError(
      "marketplace_fulfilment_state_invalid",
      "Marketplace fulfilment state is invalid.",
      400,
    );
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_record_official_fulfilment", {
    p_order_id: assertUuid(input.orderId, "order_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_fulfilment_state: fulfilmentState,
    p_tracking_code: optionalTextField(
      input.body.trackingCode,
      "tracking_code",
      160,
    ),
    p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function recordOfficialPaymentResult(input: {
  orderId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const evidence = paymentProviderEvidence(input.body);
  const supabase = createMarketplaceSupabaseClient();
  const checkoutGroupId = await checkoutGroupForOrder(supabase, input.orderId);
  if (checkoutGroupId) {
    const result = (await supabase.rpc(
      "marketplace_record_checkout_payment_result",
      {
        p_checkout_group_id: checkoutGroupId,
        p_request_id: input.requestId,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
        p_admin_profile_id: admin.profileId,
        p_admin_role: admin.adminRole,
        p_payment_state: evidence.paymentState,
        p_provider_reference: evidence.providerReference,
        p_provider_amount_satang: evidence.providerAmountSatang,
        p_provider_currency: evidence.providerCurrency,
        p_admin_note: optionalTextField(
          input.body.adminNote,
          "admin_note",
          1000,
        ),
      },
    )) as {
      data: unknown;
      error: { message?: string; code?: string } | null;
    };
    if (result.error) throw marketplaceRpcError(result.error);
    return result.data;
  }
  const result = (await supabase.rpc("marketplace_record_official_payment_result", {
    p_order_id: assertUuid(input.orderId, "order_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_payment_state: evidence.paymentState,
    p_provider_reference: evidence.providerReference,
    p_provider_amount_satang: evidence.providerAmountSatang,
    p_provider_currency: evidence.providerCurrency,
    p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function recordUserSellerPaymentResult(input: {
  orderId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const evidence = paymentProviderEvidence(input.body);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_record_user_seller_payment_result", {
    p_order_id: assertUuid(input.orderId, "order_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_payment_state: evidence.paymentState,
    p_provider_reference: evidence.providerReference,
    p_provider_amount_satang: evidence.providerAmountSatang,
    p_provider_currency: evidence.providerCurrency,
    p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function createOfficialRefund(input: {
  orderId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_create_official_refund", {
    p_order_id: assertUuid(input.orderId, "order_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_reason_code: textField(input.body.reasonCode, "reason_code", 80),
    p_admin_note: textField(input.body.adminNote, "admin_note", 1000),
    p_refund_amount_satang: nonNegativeInteger(
      input.body.refundAmountSatang,
      "refund_amount",
    ),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function listOfficialOrderDashboard() {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select(
      [
        "id",
        "listing_id",
        "payment_state",
        "fulfilment_state",
        "refund_state",
        "item_price_satang",
        "shipping_fee_satang",
        "buyer_service_fee_satang",
        "buyer_total_satang",
        "currency",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("listing_source", "official_shop")
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) throw marketplaceRpcError(result.error);
  const orders = (result.data ?? []) as unknown as OfficialOrderDashboardRow[];
  const summary = orders.reduce(
    (acc, order) => {
      if (order.payment_state === "paid") {
        acc.paidRevenueSatang += Number(order.buyer_total_satang ?? 0);
        acc.paidOrderCount += 1;
      }
      if (order.payment_state === "payment_submitted") {
        acc.paymentReviewCount += 1;
      }
      if (
        order.payment_state === "paid" &&
        order.fulfilment_state !== "completed"
      ) {
        acc.fulfilmentOpenCount += 1;
      }
      if (order.refund_state === "requested") {
        acc.refundReviewCount += 1;
      }
      return acc;
    },
    {
      paidRevenueSatang: 0,
      paidOrderCount: 0,
      paymentReviewCount: 0,
      fulfilmentOpenCount: 0,
      refundReviewCount: 0,
    },
  );

  return { orders, summary };
}
