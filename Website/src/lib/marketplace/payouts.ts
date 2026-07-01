import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SELLER_PAYOUT_RELEASE_FIELDS = ["adminNote"] as const;
export const SELLER_PAYOUT_PAID_FIELDS = [
  "transferReference",
  "adminNote",
] as const;

export type SellerPayoutQueueRow = {
  id: string;
  order_id: string;
  listing_id: string;
  payout_state: string;
  item_price_satang: number;
  seller_fee_satang: number;
  payout_amount_satang: number;
  currency: "THB";
  release_eligible_at: string | null;
  released_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function assertOwner(admin: ResolvedAdminSession | null | undefined) {
  if (admin?.adminRole !== "owner") {
    throw new MarketplaceServiceError(
      "marketplace_owner_required",
      "Marketplace owner access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: "owner" };
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

function optionalTextField(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
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

function requiredTextField(value: unknown, label: string, maxLength: number) {
  const normalized = optionalTextField(value, label, maxLength);
  if (!normalized) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_required`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return normalized;
}

export async function listSellerPayoutQueue() {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_seller_payouts")
    .select(
      [
        "id",
        "order_id",
        "listing_id",
        "payout_state",
        "item_price_satang",
        "seller_fee_satang",
        "payout_amount_satang",
        "currency",
        "release_eligible_at",
        "released_at",
        "paid_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .in("payout_state", ["held", "eligible", "released"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as unknown as SellerPayoutQueueRow[];
}

export async function releaseSellerPayout(input: {
  payoutId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertOwner(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_release_seller_payout", {
    p_payout_id: assertUuid(input.payoutId, "payout_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function markSellerPayoutPaid(input: {
  payoutId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertOwner(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_mark_seller_payout_paid", {
    p_payout_id: assertUuid(input.payoutId, "payout_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_transfer_reference: requiredTextField(
      input.body.transferReference,
      "transfer_reference",
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
