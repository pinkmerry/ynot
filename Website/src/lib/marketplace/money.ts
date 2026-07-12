import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "./config";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";
import type { MarketplaceMoneyPolicy } from "./types";
export type { MarketplaceMoneyPolicy } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MARKETPLACE_CURRENCY = "THB" as const;
export const DEFAULT_MARKETPLACE_SHIPPING_FEE_SATANG = 15_000;
export const DEFAULT_MARKETPLACE_SELLER_FEE_BPS = 1_000;
export const DEFAULT_MARKETPLACE_BUYER_SERVICE_FEE_BPS = 1_000;
export const DEFAULT_MARKETPLACE_PAYOUT_HOLD_DAYS = 10;
export const DEFAULT_MARKETPLACE_DISPUTE_WINDOW_DAYS = 3;
export const DEFAULT_MARKETPLACE_LISTING_AUTO_LIVE = true;
export const DEFAULT_MARKETPLACE_SLIP_AUTO_VERIFY = true;

function envInteger(name: string, fallback: number, options: { min: number; max: number }) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    return fallback;
  }
  return value;
}

export function marketplaceMoneyPolicy(): MarketplaceMoneyPolicy {
  return {
    policyId: null,
    shippingFeeSatang: envInteger(
      "YNOT_MARKETPLACE_SHIPPING_FEE_SATANG",
      DEFAULT_MARKETPLACE_SHIPPING_FEE_SATANG,
      { min: 0, max: 1_000_000 },
    ),
    sellerFeeBps: envInteger(
      "YNOT_MARKETPLACE_SELLER_FEE_BPS",
      DEFAULT_MARKETPLACE_SELLER_FEE_BPS,
      { min: 0, max: 10_000 },
    ),
    buyerServiceFeeBps: envInteger(
      "YNOT_MARKETPLACE_BUYER_SERVICE_FEE_BPS",
      DEFAULT_MARKETPLACE_BUYER_SERVICE_FEE_BPS,
      { min: 0, max: 10_000 },
    ),
    currency: MARKETPLACE_CURRENCY,
    calculationVersion: 1,
    effectiveFrom: null,
    adminNote: "Environment/default fallback policy",
    payoutHoldDays: envInteger(
      "YNOT_MARKETPLACE_PAYOUT_HOLD_DAYS",
      DEFAULT_MARKETPLACE_PAYOUT_HOLD_DAYS,
      { min: 0, max: 30 },
    ),
    disputeWindowDays: envInteger(
      "YNOT_MARKETPLACE_DISPUTE_WINDOW_DAYS",
      DEFAULT_MARKETPLACE_DISPUTE_WINDOW_DAYS,
      { min: 0, max: 14 },
    ),
    listingAutoLive: DEFAULT_MARKETPLACE_LISTING_AUTO_LIVE,
    slipAutoVerify: DEFAULT_MARKETPLACE_SLIP_AUTO_VERIFY,
  };
}

function numberField(value: unknown, fallback: number, label: string, options: { min: number; max: number }) {
  const normalized = Number(value ?? fallback);
  if (
    !Number.isInteger(normalized) ||
    normalized < options.min ||
    normalized > options.max
  ) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace money policy is invalid.",
      500,
    );
  }
  return normalized;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanField(value: unknown, fallback: boolean, label: string) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace money policy is invalid.",
      500,
    );
  }
  return value;
}

function normalizePolicy(value: unknown): MarketplaceMoneyPolicy {
  const fallback = marketplaceMoneyPolicy();
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const currency = record.currency === "THB" ? "THB" : fallback.currency;

  return {
    policyId: optionalString(record.policyId),
    sellerFeeBps: numberField(
      record.sellerFeeBps,
      fallback.sellerFeeBps,
      "seller_fee",
      { min: 0, max: 10_000 },
    ),
    buyerServiceFeeBps: numberField(
      record.buyerServiceFeeBps,
      fallback.buyerServiceFeeBps,
      "buyer_service_fee",
      { min: 0, max: 10_000 },
    ),
    shippingFeeSatang: numberField(
      record.shippingFeeSatang,
      fallback.shippingFeeSatang,
      "shipping_fee",
      { min: 0, max: 1_000_000 },
    ),
    currency,
    calculationVersion: numberField(
      record.calculationVersion,
      fallback.calculationVersion,
      "calculation_version",
      { min: 1, max: 1000 },
    ),
    effectiveFrom: optionalString(record.effectiveFrom),
    adminNote: optionalString(record.adminNote),
    payoutHoldDays: numberField(
      record.payoutHoldDays,
      fallback.payoutHoldDays,
      "payout_hold_days",
      { min: 0, max: 30 },
    ),
    disputeWindowDays: numberField(
      record.disputeWindowDays,
      fallback.disputeWindowDays,
      "dispute_window_days",
      { min: 0, max: 14 },
    ),
    listingAutoLive: booleanField(
      record.listingAutoLive,
      fallback.listingAutoLive,
      "listing_auto_live",
    ),
    slipAutoVerify: booleanField(
      record.slipAutoVerify,
      fallback.slipAutoVerify,
      "slip_auto_verify",
    ),
  };
}

function assertAdmin(admin: ResolvedAdminSession | null | undefined) {
  if (!admin?.profileId || !admin.adminRole || !["owner", "admin"].includes(admin.adminRole)) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: "owner" | "admin" };
}

function policyInteger(value: unknown, label: string, options: { min: number; max: number }) {
  if (!Number.isInteger(value) || Number(value) < options.min || Number(value) > options.max) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace money policy is invalid.",
      400,
    );
  }
  return Number(value);
}

function policyNote(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 1000) {
    throw new MarketplaceServiceError(
      "marketplace_admin_note_invalid",
      "Marketplace admin note is invalid.",
      400,
    );
  }
  return value.trim();
}

function optionalPolicyInteger(
  value: unknown,
  label: string,
  options: { min: number; max: number },
) {
  if (value === undefined || value === null) return null;
  return policyInteger(value, label, options);
}

function optionalPolicyBoolean(value: unknown, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace money policy is invalid.",
      400,
    );
  }
  return value;
}

function optionalPolicyUuid(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace money policy is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

export async function getActiveMarketplaceMoneyPolicy() {
  if (marketplaceConfig().mockData) return marketplaceMoneyPolicy();

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_get_active_money_policy")) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return normalizePolicy(result.data);
}

export async function updateMarketplaceMoneyPolicy(input: {
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_admin_set_money_policy", {
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_seller_fee_bps: policyInteger(input.body.sellerFeeBps, "seller_fee", {
      min: 0,
      max: 10_000,
    }),
    p_buyer_service_fee_bps: policyInteger(
      input.body.buyerServiceFeeBps,
      "buyer_service_fee",
      { min: 0, max: 10_000 },
    ),
    p_shipping_fee_satang: policyInteger(
      input.body.shippingFeeSatang,
      "shipping_fee",
      { min: 0, max: 1_000_000 },
    ),
    p_admin_note: policyNote(input.body.adminNote),
    p_payout_hold_days: optionalPolicyInteger(
      input.body.payoutHoldDays,
      "payout_hold_days",
      { min: 0, max: 30 },
    ),
    p_dispute_window_days: optionalPolicyInteger(
      input.body.disputeWindowDays,
      "dispute_window_days",
      { min: 0, max: 14 },
    ),
    p_listing_auto_live: optionalPolicyBoolean(
      input.body.listingAutoLive,
      "listing_auto_live",
    ),
    p_slip_auto_verify: optionalPolicyBoolean(
      input.body.slipAutoVerify,
      "slip_auto_verify",
    ),
    p_expected_policy_id: optionalPolicyUuid(
      input.body.expectedPolicyId,
      "expected_policy_id",
    ),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  const payload =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  return normalizePolicy(payload.policy);
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label}_must_be_non_negative_satang`);
  }
}

function feeFromBasisPoints(amountSatang: number, basisPoints: number) {
  assertNonNegativeInteger(amountSatang, "amount");
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("fee_basis_points_out_of_range");
  }
  return Math.floor((amountSatang * basisPoints) / 10_000);
}

export function marketplaceMoneyPreview(input: {
  itemPriceSatang: number;
  shippingFeeSatang?: number;
  sellerFeeBps?: number;
  buyerServiceFeeBps?: number;
  policy?: MarketplaceMoneyPolicy;
}) {
  const policy = input.policy ?? marketplaceMoneyPolicy();
  const shippingFeeSatang =
    input.shippingFeeSatang ?? policy.shippingFeeSatang;
  assertNonNegativeInteger(input.itemPriceSatang, "item_price");
  assertNonNegativeInteger(shippingFeeSatang, "shipping_fee");

  const sellerMarketplaceFeeSatang = feeFromBasisPoints(
    input.itemPriceSatang,
    input.sellerFeeBps ?? policy.sellerFeeBps,
  );
  const buyerServiceFeeSatang = feeFromBasisPoints(
    input.itemPriceSatang,
    input.buyerServiceFeeBps ?? policy.buyerServiceFeeBps,
  );
  const sellerPayoutSatang =
    input.itemPriceSatang - sellerMarketplaceFeeSatang;
  if (sellerPayoutSatang < 0) throw new Error("seller_payout_negative");

  return {
    currency: MARKETPLACE_CURRENCY,
    itemPriceSatang: input.itemPriceSatang,
    shippingFeeSatang,
    buyerServiceFeeSatang,
    buyerTotalSatang:
      input.itemPriceSatang + shippingFeeSatang + buyerServiceFeeSatang,
    sellerMarketplaceFeeSatang,
    sellerPayoutSatang,
  };
}

export function marketplaceOfficialOrderMoney(input: {
  itemPriceSatang: number;
  shippingFeeSatang?: number;
  buyerServiceFeeBps?: number;
}) {
  const preview = marketplaceMoneyPreview({
    itemPriceSatang: input.itemPriceSatang,
    shippingFeeSatang: input.shippingFeeSatang,
    sellerFeeBps: 0,
    buyerServiceFeeBps: input.buyerServiceFeeBps,
  });

  return {
    currency: preview.currency,
    itemPriceSatang: preview.itemPriceSatang,
    shippingFeeSatang: preview.shippingFeeSatang,
    buyerServiceFeeSatang: preview.buyerServiceFeeSatang,
    buyerTotalSatang: preview.buyerTotalSatang,
    sellerMarketplaceFeeSatang: 0,
    sellerPayoutSatang: 0,
    sellerPayoutState: "not_applicable" as const,
  };
}
