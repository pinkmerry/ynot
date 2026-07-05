import "server-only";

import type { ResolvedProfileSession } from "@/lib/auth/resolve-current-profile";
import { type SafeMarketplaceAccount } from "./account-bridge";
import type { MarketplaceCheckoutAddress } from "./checkout-address";
import { marketplaceConfig } from "./config";
import {
  getActiveMarketplaceMoneyPolicy,
  marketplaceMoneyPreview,
} from "./money";
import {
  getMockMarketplaceListing,
  getMockMarketplaceOrder,
  mockMarketplaceOrders,
} from "./mock-data";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_VERIFICATION_STATUSES = new Set([
  "submitted",
  "valid",
  "manual_review",
  "provider_error",
  "amount_mismatch",
  "receiver_mismatch",
  "date_mismatch",
  "not_found",
  "fraud",
  "duplicate",
  "rejected",
]);

type BuyerPendingPaymentOrder = {
  id: string;
  listing_id: string;
  listing_source: "official_shop" | "user_seller";
  order_state: string;
  buyer_total_satang: number;
  currency: "THB";
  expires_at: string;
};

type BuyerOrderRow = {
  id: string;
  pending_payment_order_id: string;
  listing_id: string;
  inventory_item_id: string;
  listing_source: "official_shop" | "user_seller";
  payment_state: string;
  fulfilment_state: string;
  refund_state: string;
  item_price_satang: number;
  shipping_fee_satang: number;
  buyer_service_fee_satang: number;
  buyer_total_satang: number;
  currency: "THB";
  created_at: string;
  updated_at: string;
};

type ListingSummaryRow = {
  listing_id: string;
  listing_source: "official_shop" | "user_seller";
  listing_state: string;
  title: string;
  public_slug: string | null;
  public_description: string | null;
  photo_urls: string[] | null;
  snapshot_payload: Record<string, unknown> | null;
  updated_at: string | null;
};

const ORDER_SELECT = [
  "id",
  "pending_payment_order_id",
  "listing_id",
  "inventory_item_id",
  "listing_source",
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
].join(",");

const LISTING_SUMMARY_SELECT = [
  "listing_id",
  "listing_source",
  "listing_state",
  "title",
  "public_slug",
  "public_description",
  "photo_urls",
  "snapshot_payload",
  "updated_at",
].join(",");

const PRIVATE_SNAPSHOT_FIELDS = new Set([
  "privateAdminNote",
  "procurementNote",
  "sellerPayoutState",
]);
const PRIVATE_BUYER_ORDER_FIELDS = new Set([
  "sellerPayoutId",
  "sellerPayoutSatang",
  "sellerPayoutState",
  "sellerFeeBps",
  "sellerFeeSatang",
  "seller_payout_id",
  "seller_payout_satang",
  "seller_payout_state",
  "seller_fee_bps",
  "seller_fee_satang",
]);

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

function assertCheckoutAccount(account: SafeMarketplaceAccount | null) {
  if (!account) {
    throw new MarketplaceServiceError(
      "marketplace_account_required",
      "Marketplace account is required.",
      400,
    );
  }
  if (!account.capabilities.canCheckout) {
    throw new MarketplaceServiceError(
      "marketplace_checkout_blocked",
      "Marketplace checkout is not available for this account.",
      403,
    );
  }
  return account;
}

function assertAccount(account: SafeMarketplaceAccount | null) {
  if (!account) {
    throw new MarketplaceServiceError(
      "marketplace_account_required",
      "Marketplace account is required.",
      400,
    );
  }
  return account;
}

function paymentVerificationStatus(value: string) {
  if (!PAYMENT_VERIFICATION_STATUSES.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_payment_status_invalid",
      "Marketplace payment status is invalid.",
      400,
    );
  }
  return value;
}

function sanitizeListingSummary(row: ListingSummaryRow | null) {
  if (!row) return null;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row.snapshot_payload ?? {})) {
    if (!PRIVATE_SNAPSHOT_FIELDS.has(key)) payload[key] = value;
  }
  return {
    ...row,
    snapshot_payload: payload,
  };
}

function sanitizeBuyerPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeBuyerPayload(item));
  if (!value || typeof value !== "object") return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!PRIVATE_BUYER_ORDER_FIELDS.has(key)) {
      sanitized[key] = sanitizeBuyerPayload(fieldValue);
    }
  }
  return sanitized;
}

function mockUuid(seed: string, offset = 0) {
  const compactHex = seed.replace(/[^0-9a-f]/gi, "").padEnd(64, "0");
  const rotatedHex = `${compactHex.slice(offset)}${compactHex.slice(0, offset)}`;
  const hex = rotatedHex.padEnd(32, "0").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function mockPendingPaymentOrder(input: {
  listingId: string;
  listingSource: "official_shop" | "user_seller";
  shippingSnapshot: MarketplaceCheckoutAddress;
  requestHash: string;
}) {
  const listingId = assertUuid(input.listingId, "listing_id");
  const listing = getMockMarketplaceListing(listingId);
  if (!listing || listing.listing_source !== input.listingSource) {
    throw new MarketplaceServiceError(
      "marketplace_listing_unavailable",
      "Marketplace listing is not available.",
      409,
    );
  }

  const money = marketplaceMoneyPreview({
    itemPriceSatang: listing.item_price_satang,
  });
  const pendingPaymentOrderId = mockUuid(input.requestHash);
  const orderId = mockUuid(input.requestHash, 32);

  return sanitizeBuyerPayload({
    pendingPaymentOrderId,
    orderId,
    listingId,
    listingSource: input.listingSource,
    paymentState: "pending_payment",
    fulfilmentState: "unfulfilled",
    refundState: "none",
    itemPriceSatang: money.itemPriceSatang,
    shippingFeeSatang: money.shippingFeeSatang,
    buyerServiceFeeSatang: money.buyerServiceFeeSatang,
    buyerTotalSatang: money.buyerTotalSatang,
    currency: money.currency,
    shippingSnapshot: input.shippingSnapshot,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
}

export async function createOfficialPendingPaymentOrder(input: {
  listingId: string;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  shippingSnapshot: MarketplaceCheckoutAddress;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const account = assertCheckoutAccount(input.account);
  if (marketplaceConfig().mockData) {
    return mockPendingPaymentOrder({
      listingId: input.listingId,
      listingSource: "official_shop",
      shippingSnapshot: input.shippingSnapshot,
      requestHash: input.requestHash,
    });
  }

  const moneyPolicy = await getActiveMarketplaceMoneyPolicy();
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_create_pending_payment_order", {
    p_listing_id: assertUuid(input.listingId, "listing_id"),
    p_buyer_marketplace_account_id: account.accountId,
    p_buyer_ynot_profile_id: input.profile.profileId,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_quantity: 1,
    p_shipping_fee_satang: moneyPolicy.shippingFeeSatang,
    p_buyer_service_fee_bps: moneyPolicy.buyerServiceFeeBps,
    p_shipping_snapshot: input.shippingSnapshot,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}

export async function createUserSellerPendingPaymentOrder(input: {
  listingId: string;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  shippingSnapshot: MarketplaceCheckoutAddress;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const account = assertCheckoutAccount(input.account);
  if (marketplaceConfig().mockData) {
    return mockPendingPaymentOrder({
      listingId: input.listingId,
      listingSource: "user_seller",
      shippingSnapshot: input.shippingSnapshot,
      requestHash: input.requestHash,
    });
  }

  const moneyPolicy = await getActiveMarketplaceMoneyPolicy();
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_create_user_seller_pending_payment_order",
    {
      p_listing_id: assertUuid(input.listingId, "listing_id"),
      p_buyer_marketplace_account_id: account.accountId,
      p_buyer_ynot_profile_id: input.profile.profileId,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_quantity: 1,
      p_shipping_fee_satang: moneyPolicy.shippingFeeSatang,
      p_buyer_service_fee_bps: moneyPolicy.buyerServiceFeeBps,
      p_shipping_snapshot: input.shippingSnapshot,
    },
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}

export async function listBuyerOrders(account: SafeMarketplaceAccount | null) {
  if (!account) {
    throw new MarketplaceServiceError(
      "marketplace_account_required",
      "Marketplace account is required.",
      400,
    );
  }

  if (marketplaceConfig().mockData) {
    return mockMarketplaceOrders as BuyerOrderRow[];
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select(ORDER_SELECT)
    .eq("buyer_marketplace_account_id", account.accountId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data ?? []) as BuyerOrderRow[];
}

export async function getBuyerOrder(input: {
  orderId: string;
  account: SafeMarketplaceAccount | null;
}) {
  const account = assertAccount(input.account);
  if (marketplaceConfig().mockData) {
    const order = getMockMarketplaceOrder(input.orderId);
    if (!order) {
      throw new MarketplaceServiceError(
        "marketplace_order_not_found",
        "Marketplace order was not found.",
        404,
      );
    }
    return sanitizeBuyerPayload(order) as BuyerOrderRow & {
      listing: ListingSummaryRow | null;
    };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select(ORDER_SELECT)
    .eq("id", assertUuid(input.orderId, "order_id"))
    .eq("buyer_marketplace_account_id", account.accountId)
    .maybeSingle();

  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data) {
    throw new MarketplaceServiceError(
      "marketplace_order_not_found",
      "Marketplace order was not found.",
      404,
    );
  }

  const order = result.data as unknown as BuyerOrderRow;
  const listingResult = await supabase
    .from("marketplace_listing_snapshots")
    .select(LISTING_SUMMARY_SELECT)
    .eq("listing_id", order.listing_id)
    .maybeSingle();

  if (listingResult.error) throw marketplaceRpcError(listingResult.error);

  return {
    ...(sanitizeBuyerPayload(order) as BuyerOrderRow),
    listing: sanitizeListingSummary(
      listingResult.data as unknown as ListingSummaryRow | null,
    ),
  };
}

export async function listBuyerPendingPaymentOrders(
  account: SafeMarketplaceAccount | null,
) {
  const buyerAccount = assertAccount(account);
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_pending_payment_orders")
    .select(
      [
        "id",
        "listing_id",
        "listing_source",
        "order_state",
        "item_price_satang",
        "shipping_fee_satang",
        "buyer_service_fee_satang",
        "buyer_total_satang",
        "currency",
        "expires_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("buyer_marketplace_account_id", buyerAccount.accountId)
    .in("order_state", ["pending_payment", "payment_submitted"])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data ?? [];
}

export async function getBuyerPendingPaymentOrder(input: {
  pendingOrderId: string;
  account: SafeMarketplaceAccount | null;
}): Promise<BuyerPendingPaymentOrder> {
  const account = assertAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_pending_payment_orders")
    .select(
      [
        "id",
        "listing_id",
        "listing_source",
        "order_state",
        "buyer_total_satang",
        "currency",
        "expires_at",
      ].join(","),
    )
    .eq("id", assertUuid(input.pendingOrderId, "pending_order_id"))
    .eq("buyer_marketplace_account_id", account.accountId)
    .maybeSingle();

  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data) {
    throw new MarketplaceServiceError(
      "marketplace_pending_order_not_found",
      "Marketplace pending order was not found.",
      404,
    );
  }
  return result.data as unknown as BuyerPendingPaymentOrder;
}

type ReleasePendingPaymentOrderInput = {
  pendingOrderId: string;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  releaseReason: "buyer_cancelled" | "expired";
};

export async function submitOfficialPaymentProof(input: {
  pendingOrderId: string;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  fileSha256: string;
  fileSizeBytes: number;
  contentType: string;
  proofStoragePath: string;
  verificationStatus: string;
  providerCode: string | null;
  providerMessage: string | null;
  providerResponse: unknown;
  referenceId: string | null;
  decodedQrHash: string | null;
}) {
  return submitMarketplacePaymentProof(input);
}

export async function submitMarketplacePaymentProof(input: {
  pendingOrderId: string;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  fileSha256: string;
  fileSizeBytes: number;
  contentType: string;
  proofStoragePath: string;
  verificationStatus: string;
  providerCode: string | null;
  providerMessage: string | null;
  providerResponse: unknown;
  referenceId: string | null;
  decodedQrHash: string | null;
}) {
  const account = assertAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_submit_marketplace_payment_proof",
    {
      p_pending_payment_order_id: assertUuid(
        input.pendingOrderId,
        "pending_order_id",
      ),
      p_buyer_marketplace_account_id: account.accountId,
      p_buyer_ynot_profile_id: input.profile.profileId,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_file_sha256: input.fileSha256,
      p_file_size_bytes: input.fileSizeBytes,
      p_content_type: input.contentType,
      p_proof_storage_path: input.proofStoragePath,
      p_verification_status: paymentVerificationStatus(input.verificationStatus),
      p_provider_code: input.providerCode,
      p_provider_message: input.providerMessage,
      p_provider_response: input.providerResponse,
      p_reference_id: input.referenceId,
      p_decoded_qr_hash: input.decodedQrHash,
    },
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}

export async function releaseOfficialPendingPaymentOrder(
  input: ReleasePendingPaymentOrderInput,
) {
  const account = assertAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_release_pending_payment_order", {
    p_pending_payment_order_id: assertUuid(
      input.pendingOrderId,
      "pending_order_id",
    ),
    p_actor_marketplace_account_id: account.accountId,
    p_actor_ynot_profile_id: input.profile.profileId,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_release_reason: input.releaseReason,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}

export async function releaseUserSellerPendingPaymentOrder(
  input: ReleasePendingPaymentOrderInput,
) {
  const account = assertAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_release_user_seller_pending_payment_order",
    {
      p_pending_payment_order_id: assertUuid(
        input.pendingOrderId,
        "pending_order_id",
      ),
      p_actor_marketplace_account_id: account.accountId,
      p_actor_ynot_profile_id: input.profile.profileId,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_release_reason: input.releaseReason,
    },
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}

export async function releaseMarketplacePendingPaymentOrder(
  input: ReleasePendingPaymentOrderInput,
) {
  const account = assertAccount(input.account);
  const pendingOrder = await getBuyerPendingPaymentOrder({
    pendingOrderId: input.pendingOrderId,
    account,
  });
  const releaseInput = { ...input, account };

  if (pendingOrder.listing_source === "user_seller") {
    return releaseUserSellerPendingPaymentOrder(releaseInput);
  }

  return releaseOfficialPendingPaymentOrder(releaseInput);
}

type MarketplacePaymentProofRow = {
  proof_storage_path: string | null;
};

const PAYMENT_PROOF_BUCKET = "marketplace-payment-proofs";

export async function getMarketplaceOrderProofPath(
  orderId: string,
): Promise<{ bucket: string; path: string } | null> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_payment_proofs")
    .select("proof_storage_path")
    .eq("order_id", assertUuid(orderId, "order_id"))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw marketplaceRpcError(result.error);

  const row = result.data as unknown as MarketplacePaymentProofRow | null;
  if (!row || !row.proof_storage_path) return null;

  return { bucket: PAYMENT_PROOF_BUCKET, path: row.proof_storage_path };
}

type MarketplaceOrderSourceRow = {
  listing_source: "official_shop" | "user_seller";
};

export async function getMarketplaceOrderSource(
  orderId: string,
): Promise<"official_shop" | "user_seller" | null> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select("listing_source")
    .eq("id", assertUuid(orderId, "order_id"))
    .maybeSingle();

  if (result.error) throw marketplaceRpcError(result.error);

  const row = result.data as unknown as MarketplaceOrderSourceRow | null;
  return row?.listing_source ?? null;
}

export async function expireMarketplacePendingPaymentOrders(input?: {
  requestId?: string | null;
  limit?: number | null;
}) {
  if (marketplaceConfig().mockData) {
    return {
      ok: true,
      expiredCount: 0,
      officialCount: 0,
      userSellerCount: 0,
      limit: Math.max(1, Math.min(Math.floor(input?.limit ?? 100), 200)),
      expiredPendingOrderIds: [],
    };
  }

  const limit = Math.max(1, Math.min(Math.floor(input?.limit ?? 100), 200));
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_expire_pending_payment_orders", {
    p_request_id: input?.requestId ?? null,
    p_limit: limit,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return sanitizeBuyerPayload(result.data);
}
