import "server-only";

import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

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

export type OpenBuyerRefundRequestInput = {
  orderId: string;
  accountId: string;
  reason: string;
  buyerYnotProfileId: string;
};

// Buyer-safe minimal projection only: id/state/created_at. Amounts,
// seller identity, and admin fields never reach the buyer who opened
// the dispute.
export type MarketplaceBuyerRefundRequestSummary = {
  id: string;
  refund_state: "requested";
  created_at: string;
};

export async function openBuyerRefundRequest(
  input: OpenBuyerRefundRequestInput,
): Promise<MarketplaceBuyerRefundRequestSummary> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_open_buyer_refund_request", {
    p_order_id: assertUuid(input.orderId, "order_id"),
    p_account_id: assertUuid(input.accountId, "account_id"),
    p_reason: input.reason,
    p_buyer_ynot_profile_id: assertUuid(
      input.buyerYnotProfileId,
      "buyer_ynot_profile_id",
    ),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceBuyerRefundRequestSummary;
}
