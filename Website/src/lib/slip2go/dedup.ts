import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type ServiceClient = SupabaseClient<Database>;

/**
 * Statuses that "release" a payment slip for re-upload. A user whose top-up
 * was rejected or cancelled is allowed to retry with the same slip image —
 * the previous attempt didn't credit anything. Approved/pending parents
 * still block the re-upload (the slip was consumed or is in flight).
 */
const RELEASED_TOP_UP_STATUSES = new Set(["rejected", "cancelled", "expired"]);
const RELEASED_ORDER_STATUSES = new Set([
  "cancelled",
  "expired",
  "refunded",
  "rejected",
]);

type DedupColumn = "file_sha256" | "slip2go_reference_id" | "decoded_qr_hash";

export type LiveDuplicateSlip = {
  id: string;
  topUpRequestId: string | null;
  orderId: string | null;
};

/**
 * Look up an existing payment_slip whose dedup column matches `value` AND
 * whose parent top-up / order is still in a "live" state. Two-step query
 * because PostgREST embedded resource filters are awkward with `.or()` and
 * we want the same code to handle both top-up and order parents cleanly.
 *
 * The dedup query already filters on `verification_status in ('valid',
 * 'manual_review')` to match the approve_top_up_request gate. The
 * second-step parent-status check is what fixes the "user can't re-upload
 * after their first attempt was rejected" regression introduced by the F2
 * widening (commit 3b0a51e).
 */
export async function findLiveDuplicateSlip(
  supabase: ServiceClient,
  {
    column,
    value,
    excludeSlipId,
  }: {
    column: DedupColumn;
    value: string;
    excludeSlipId?: string;
  },
): Promise<LiveDuplicateSlip | null> {
  let query = supabase
    .from("payment_slips")
    .select("id,top_up_request_id,order_id")
    .eq(column, value)
    .in("verification_status", ["valid", "manual_review"])
    .order("verified_at", { ascending: false })
    .limit(10);
  if (excludeSlipId) query = query.neq("id", excludeSlipId);

  const { data: matches, error: matchesError } = await query;
  if (matchesError) throw matchesError;
  if (!matches || matches.length === 0) return null;

  const topUpIds = matches
    .map((m) => m.top_up_request_id)
    .filter((id): id is string => Boolean(id));
  const orderIds = matches
    .map((m) => m.order_id)
    .filter((id): id is string => Boolean(id));

  const liveTopUpIds = new Set<string>();
  if (topUpIds.length > 0) {
    const { data: topUps, error: topUpsError } = await supabase
      .from("top_up_requests")
      .select("id,status")
      .in("id", topUpIds);
    if (topUpsError) throw topUpsError;
    for (const row of topUps ?? []) {
      if (!RELEASED_TOP_UP_STATUSES.has(row.status)) liveTopUpIds.add(row.id);
    }
  }

  const liveOrderIds = new Set<string>();
  if (orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,status")
      .in("id", orderIds);
    if (ordersError) throw ordersError;
    for (const row of orders ?? []) {
      if (!RELEASED_ORDER_STATUSES.has(row.status)) liveOrderIds.add(row.id);
    }
  }

  for (const match of matches) {
    const topUpId = match.top_up_request_id;
    const orderId = match.order_id;
    if (topUpId && liveTopUpIds.has(topUpId)) {
      return { id: match.id, topUpRequestId: topUpId, orderId: null };
    }
    if (orderId && liveOrderIds.has(orderId)) {
      return { id: match.id, topUpRequestId: null, orderId };
    }
  }

  return null;
}
