import "server-only";

import { createMarketplaceSupabaseClient, marketplaceRpcError } from "./supabase-adapter";

const DEFAULT_ORDER_LIST_LIMIT = 100;
const MAX_ORDER_LIST_LIMIT = 500;
const DEFAULT_GMV_DAYS = 30;
const MAX_GMV_DAYS = 366;

function clampLimit(value: number | undefined, fallback: number, max: number) {
  const candidate = Math.floor(value ?? fallback);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(1, Math.min(candidate, max));
}

export type MarketplaceAdminOrderRow = {
  order_id: string;
  order_code: string;
  source: "official_shop" | "user_seller";
  buyer_account_id: string;
  seller_account_id: string | null;
  buyer_total_satang: number;
  payment_state: string;
  fulfilment_state: string;
  created_at: string;
};

export type ListAdminMarketplaceOrdersInput = {
  state?: string | null;
  limit?: number;
};

export type MarketplaceDailyGmvRow = {
  day: string;
  gmv_satang: number;
  order_count: number;
};

export type GetAdminDailyGmvInput = {
  days?: number;
};

export async function listAdminMarketplaceOrders(
  input?: ListAdminMarketplaceOrdersInput,
): Promise<MarketplaceAdminOrderRow[]> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_admin_list_orders", {
    p_state: input?.state ?? null,
    p_limit: clampLimit(input?.limit, DEFAULT_ORDER_LIST_LIMIT, MAX_ORDER_LIST_LIMIT),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as MarketplaceAdminOrderRow[];
}

export async function getAdminDailyGmv(
  input?: GetAdminDailyGmvInput,
): Promise<MarketplaceDailyGmvRow[]> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_admin_daily_gmv", {
    p_days: clampLimit(input?.days, DEFAULT_GMV_DAYS, MAX_GMV_DAYS),
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as MarketplaceDailyGmvRow[];
}
