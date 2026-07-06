/**
 * Pure order-state → timeline-step mapping for the marketplace redesign.
 *
 * This module is a plain client-safe TS module (no directive) with NO
 * server-only imports so it can be shared by both the customer timeline and the
 * admin orders/escrow console (which renders the same stage dots). Keep it
 * dependency-free.
 *
 * Real state machine (from src/lib/marketplace/orders.ts):
 *   payment_state    : pending_payment | payment_submitted | paid | failed | refunded
 *   fulfilment_state : unfulfilled | packed | shipped | completed | cancelled | refunded
 *   refund_state     : none | requested | approved | rejected | refunded
 */

export const ORDER_STEP_LABELS = ["Placed", "Paid", "Shipped", "Delivered"] as const;

export type OrderStepFields = {
  payment_state: string;
  fulfilment_state: string;
  refund_state?: string;
};

export type OrderStepState = {
  /** Index into ORDER_STEP_LABELS of the furthest-reached step. */
  index: number;
  /** True when the order ended off the happy path (cancelled/failed/refunded). */
  ended: boolean;
  /** Human label for an ended order, e.g. "Cancelled". Null when not ended. */
  endedLabel: string | null;
};

/**
 * Furthest happy-path step index (0-3). Ended orders return the index they had
 * reached before ending; use orderStepState() to know they ended.
 */
export function orderStepIndex(order: OrderStepFields): number {
  const payment = order.payment_state;
  const fulfilment = order.fulfilment_state;

  if (fulfilment === "completed") return 3;
  if (fulfilment === "shipped") return 2;
  if (payment === "paid") return 1;
  // pending_payment, payment_submitted, and any pre-paid state
  return 0;
}

export function orderStepState(order: OrderStepFields): OrderStepState {
  const index = orderStepIndex(order);
  const refund = order.refund_state ?? "none";

  if (order.payment_state === "refunded" || refund === "refunded") {
    return { index, ended: true, endedLabel: "Refunded" };
  }
  if (order.fulfilment_state === "cancelled") {
    return { index, ended: true, endedLabel: "Cancelled" };
  }
  if (order.payment_state === "failed") {
    return { index: 0, ended: true, endedLabel: "Payment failed" };
  }
  return { index, ended: false, endedLabel: null };
}
