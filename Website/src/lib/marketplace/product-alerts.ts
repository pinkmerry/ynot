import "server-only";

import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
} from "./supabase-adapter";

export type MarketplaceProductAlertState = "active" | "cancelled" | "notified";

export type MarketplaceProductAlertRow = {
  id: string;
  product_id: string;
  account_id: string;
  alert_state: MarketplaceProductAlertState;
  created_at: string;
  updated_at: string;
};

export type SubscribeProductAlertInput = {
  productId: string;
  accountId: string;
};

export type CancelProductAlertInput = {
  productId: string;
  accountId: string;
};

export type ListProductAlertsInput = {
  accountId: string;
};

export async function subscribeProductAlert(
  input: SubscribeProductAlertInput,
): Promise<MarketplaceProductAlertRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_subscribe_product_alert", {
    p_product_id: input.productId,
    p_account_id: input.accountId,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceProductAlertRow;
}

export async function cancelProductAlert(
  input: CancelProductAlertInput,
): Promise<MarketplaceProductAlertRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_cancel_product_alert", {
    p_product_id: input.productId,
    p_account_id: input.accountId,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceProductAlertRow;
}

export async function listProductAlerts(
  input: ListProductAlertsInput,
): Promise<MarketplaceProductAlertRow[]> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_list_product_alerts", {
    p_account_id: input.accountId,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as MarketplaceProductAlertRow[];
}
