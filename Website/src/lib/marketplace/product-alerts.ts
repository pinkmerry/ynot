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
  limit?: number;
};

export async function subscribeProductAlert(
  input: SubscribeProductAlertInput,
): Promise<MarketplaceProductAlertRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_subscribe_product_alert", {
    p_product_id: assertUuid(input.productId, "product_id"),
    p_account_id: assertUuid(input.accountId, "account_id"),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceProductAlertRow;
}

export async function cancelProductAlert(
  input: CancelProductAlertInput,
): Promise<MarketplaceProductAlertRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_cancel_product_alert", {
    p_product_id: assertUuid(input.productId, "product_id"),
    p_account_id: assertUuid(input.accountId, "account_id"),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceProductAlertRow;
}

export async function listProductAlerts(
  input: ListProductAlertsInput,
): Promise<MarketplaceProductAlertRow[]> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_list_product_alerts", {
    p_account_id: assertUuid(input.accountId, "account_id"),
    p_limit: input.limit ?? 100,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as MarketplaceProductAlertRow[];
}

function normalizeCountResult(data: unknown) {
  return typeof data === "number" && Number.isFinite(data) ? data : 0;
}

export async function countActiveProductAlerts(): Promise<number> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_product_alerts")
    .select("id", { count: "exact", head: true })
    .eq("alert_state", "active");
  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeCountResult(result.count);
}
