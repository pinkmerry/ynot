import "server-only";

import { type SafeMarketplaceAccount } from "./account-bridge";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
} from "./supabase-adapter";

export type MarketplaceBagSummary = {
  accountId: string | null;
  ordersTotal: number;
  pendingPaymentOrders: number;
  paidOrders: number;
  refundOrders: number;
  sellerSubmissions: number;
  sellerListings: number;
  sellerPayouts: number;
};

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getMarketplaceBagSummary(
  account: SafeMarketplaceAccount | null,
): Promise<MarketplaceBagSummary> {
  if (!account) {
    return {
      accountId: null,
      ordersTotal: 0,
      pendingPaymentOrders: 0,
      paidOrders: 0,
      refundOrders: 0,
      sellerSubmissions: 0,
      sellerListings: 0,
      sellerPayouts: 0,
    };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_get_bag_summary", {
    p_marketplace_account_id: account.accountId,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  const summary = (result.data ?? {}) as Record<string, unknown>;

  return {
    accountId: account.accountId,
    ordersTotal: numberField(summary.ordersTotal),
    pendingPaymentOrders: numberField(summary.pendingPaymentOrders),
    paidOrders: numberField(summary.paidOrders),
    refundOrders: numberField(summary.refundOrders),
    sellerSubmissions: numberField(summary.sellerSubmissions),
    sellerListings: numberField(summary.sellerListings),
    sellerPayouts: numberField(summary.sellerPayouts),
  };
}
