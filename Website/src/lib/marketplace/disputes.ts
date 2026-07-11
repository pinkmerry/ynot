import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Local admin-role guard, copied from the private (unexported) helper of
// the same name in ops-hardening.ts -- listMarketplaceReconciliationItems
// there uses the identical pattern for a bounded, role-gated admin list
// read. Kept file-local rather than exported from ops-hardening.ts to
// avoid coupling two independently-owned admin read modules over a
// five-line guard.
type AdminRole = "owner" | "admin" | "staff";

function assertAdminRole(
  admin: ResolvedAdminSession | null | undefined,
  allowed: readonly AdminRole[],
) {
  const role = admin?.adminRole as AdminRole | undefined;
  if (!role || !allowed.includes(role)) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: AdminRole };
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

// ---------------------------------------------------------------------------
// Admin read: list refund requests (the admin Disputes & refunds screen)
// ---------------------------------------------------------------------------
//
// marketplace_refund_requests's real state machine (refund_state check
// constraint, Database/marketplace-supabase/migrations/20260628100000_
// marketplace_official_shop.sql:170-171): 'requested' | 'approved' |
// 'rejected' | 'refunded'. Table extended by 20260704123000_marketplace_
// dispute_open_and_admin_reads.sql:17-40 to add opened_by/
// buyer_marketplace_account_id/buyer_reason for buyer-opened disputes,
// and to make admin_note/actor_admin_role nullable (buyer-opened rows
// carry neither).

export type MarketplaceRefundRequestState =
  | "requested"
  | "approved"
  | "rejected"
  | "refunded";

const REFUND_REQUEST_STATES: readonly MarketplaceRefundRequestState[] = [
  "requested",
  "approved",
  "rejected",
  "refunded",
];

// Mirrors listMarketplaceQueueSummary's refundOpenCount definition
// (ops-hardening.ts: .in("refund_state", ["requested", "approved"])) so
// the disputes screen's default view matches what the overview queue
// count and "Refunds open" badge already mean.
const NEEDS_ACTION_REFUND_STATES: readonly MarketplaceRefundRequestState[] = [
  "requested",
  "approved",
];

const DEFAULT_REFUND_REQUEST_LIMIT = 100;
const MAX_REFUND_REQUEST_LIMIT = 500;

const REFUND_REQUEST_LIST_COLUMNS = [
  "id",
  "order_id",
  "refund_state",
  "reason_code",
  "admin_note",
  "buyer_reason",
  "refund_amount_satang",
  "actor_admin_role",
  "opened_by",
  "created_at",
  "updated_at",
].join(",");

const ORDER_CONTEXT_COLUMNS = "id,payment_state,fulfilment_state";

export type MarketplaceRefundRequestRow = {
  id: string;
  order_id: string;
  refund_state: MarketplaceRefundRequestState;
  reason_code: string;
  admin_note: string | null;
  buyer_reason: string | null;
  refund_amount_satang: number;
  actor_admin_role: "owner" | "admin" | "staff" | null;
  opened_by: "buyer" | "admin";
  created_at: string;
  updated_at: string;
  // Batched from marketplace_orders in one .in() lookup below -- never a
  // per-row query. order_code mirrors the rest of the admin console's
  // convention of the order's own uuid doubling as its "code" (see
  // marketplace_admin_list_orders: `ord.id::text as order_code`, and
  // MarketplaceAdminOrderRow in admin-orders.ts).
  order_code: string | null;
  order_payment_state: string | null;
  order_fulfilment_state: string | null;
};

export type ListAdminRefundRequestsInput = {
  admin: ResolvedAdminSession | null;
  /**
   * Omit or pass null/undefined for the default "needs action" view
   * (refund_state in requested/approved). Pass one of the four real
   * enum values for an exact match. There is no "all" option -- every
   * request must be bounded to a known, real state (see the §A2 bounded
   * lists note this function's callers were built against).
   */
  state?: MarketplaceRefundRequestState | null;
  limit?: number;
};

/**
 * Admin read for the Disputes & refunds screen. Follows
 * listMarketplaceReconciliationItems (ops-hardening.ts) as the pattern:
 * role-gated via assertAdminRole, explicit column list (no `select("*")`),
 * a validated state filter, `.order("created_at", { ascending: false })`,
 * and a bounded `.limit()`.
 *
 * order_code/order_payment_state/order_fulfilment_state are filled in by
 * a single extra `.in("id", orderIds)` lookup against marketplace_orders
 * -- batched once for the whole page, never per row, so this stays O(1)
 * queries regardless of how many refund requests are returned.
 */
export async function listAdminRefundRequests(
  input: ListAdminRefundRequestsInput,
): Promise<MarketplaceRefundRequestRow[]> {
  assertAdminRole(input.admin, ["owner", "admin", "staff"]);

  const requestedState = input.state ?? null;
  if (requestedState !== null && !REFUND_REQUEST_STATES.includes(requestedState)) {
    throw new MarketplaceServiceError(
      "marketplace_refund_state_invalid",
      "Marketplace refund state is invalid.",
      400,
    );
  }

  const limit = Math.max(
    1,
    Math.min(Math.floor(input.limit ?? DEFAULT_REFUND_REQUEST_LIMIT), MAX_REFUND_REQUEST_LIMIT),
  );

  const supabase = createMarketplaceSupabaseClient();
  const baseQuery = supabase
    .from("marketplace_refund_requests")
    .select(REFUND_REQUEST_LIST_COLUMNS);
  const filteredQuery = requestedState
    ? baseQuery.eq("refund_state", requestedState)
    : baseQuery.in("refund_state", NEEDS_ACTION_REFUND_STATES);

  const result = await filteredQuery
    .order("created_at", { ascending: false })
    .limit(limit);
  if (result.error) throw marketplaceRpcError(result.error);

  const rows = (result.data ?? []) as unknown as Array<
    Omit<MarketplaceRefundRequestRow, "order_code" | "order_payment_state" | "order_fulfilment_state">
  >;
  if (rows.length === 0) return [];

  const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));
  const ordersResult = await supabase
    .from("marketplace_orders")
    .select(ORDER_CONTEXT_COLUMNS)
    .in("id", orderIds);
  if (ordersResult.error) throw marketplaceRpcError(ordersResult.error);

  const orderById = new Map(
    (
      (ordersResult.data ?? []) as unknown as Array<{
        id: string;
        payment_state: string;
        fulfilment_state: string;
      }>
    ).map((order) => [order.id, order] as const),
  );

  return rows.map((row) => {
    const order = orderById.get(row.order_id);
    return {
      ...row,
      order_code: row.order_id,
      order_payment_state: order?.payment_state ?? null,
      order_fulfilment_state: order?.fulfilment_state ?? null,
    };
  });
}
