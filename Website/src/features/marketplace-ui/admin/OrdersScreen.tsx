import Link from "next/link";
import type { MarketplaceAdminOrderRow } from "@/lib/marketplace/admin-orders";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { ORDER_STEP_LABELS, orderStepState } from "../orders/orderStepIndex";
import { OrderActions } from "./OrderActions";

/**
 * Marketplace admin Orders & escrow screen -- filter chips by payment
 * state, a dense order table, and per-row actions. Ported (data-driven, not
 * 1:1 markup) from marketplace-admin-2.jsx's AdminOrders (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:11-80).
 *
 * The prototype filters by a synthetic 6-stage escrow pipeline and fake
 * buyer/seller handles; the real contract only has payment_state to filter
 * on (marketplace_admin_list_orders's p_state does an exact match against
 * marketplace_orders.payment_state -- see Database/marketplace-supabase/
 * migrations/20260704123000_marketplace_dispute_open_and_admin_reads.sql:
 * 165-189) and only account UUIDs for buyer/seller, so the chips and table
 * columns are adapted to that instead of invented.
 *
 * Pure presentational server component: the page (page.tsx) loads `orders`
 * up front via listAdminMarketplaceOrders({ state, limit: 100 }) and passes
 * it down as a prop -- this file only renders it, same split as
 * OverviewScreen.tsx/page.tsx. Stage dots reuse the exact same
 * orderStepIndex.ts module (ORDER_STEP_LABELS/orderStepState) the
 * customer-facing OrderTimeline uses, so "Paid" here always means the same
 * thing it means on a buyer's own order page.
 */

const ORDER_STATE_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "pending_payment", label: "Pending" },
  { value: "payment_submitted", label: "Payment review" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

// Kept file-local rather than imported from OverviewScreen.tsx -- the two
// admin screens are independently tested and this mapping is a ~10-line
// pure display helper, not worth coupling two already-shipped surfaces over.
function paymentStateBadge(state: string): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "paid":
      return { kind: "official", label: "Paid" };
    case "payment_submitted":
      return { kind: "graded", label: "Payment review" };
    case "pending_payment":
      return { kind: "raw", label: "Pending" };
    case "refunded":
      return { kind: "community", label: "Refunded" };
    case "failed":
      return { kind: "sold", label: "Failed" };
    default:
      return { kind: "raw", label: state.replace(/_/g, " ") };
  }
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function filterHref(state: string | null) {
  return state ? `/admin/marketplace/orders?state=${state}` : "/admin/marketplace/orders";
}

/**
 * Compact stage indicator for a table row: the current step label plus a
 * row of dots. Reuses the exact .mp-order-steps/.mp-step/.mp-step-dot
 * classes the customer OrderTimeline (orders/OrderTimeline.tsx) already
 * uses -- those rules key off ancestor "done"/"now"/"ended" classes, not
 * text content, so dropping the per-step <span>{label}</span> here (to fit
 * a table cell) needs no new CSS.
 */
function StageCell({ order }: { order: MarketplaceAdminOrderRow }) {
  const step = orderStepState(order);
  const currentLabel = step.ended ? step.endedLabel : ORDER_STEP_LABELS[step.index];
  return (
    <div className="mp-stack" style={{ gap: 4 }}>
      <span className="mp-small" style={{ fontWeight: 700 }}>
        {currentLabel}
      </span>
      <ol className="mp-order-steps" aria-label="Order stage" style={{ gap: 4 }}>
        {ORDER_STEP_LABELS.map((label, index) => {
          const stateClass =
            step.ended && index >= step.index
              ? "ended"
              : index < step.index
                ? "done"
                : index === step.index
                  ? "now"
                  : "todo";
          return (
            <li key={label} className={`mp-step ${stateClass}`} title={label}>
              <span className="mp-step-dot" aria-hidden />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface OrdersScreenProps {
  orders: MarketplaceAdminOrderRow[];
  activeState: string | null;
}

export function OrdersScreen({ orders, activeState }: OrdersScreenProps) {
  const emptyTitle = activeState ? "No orders match this filter" : "No orders yet";
  const emptyHint = activeState
    ? "Try a different payment state, or view all orders."
    : "Orders will show up here once buyers start checking out.";

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Operations</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Orders &amp; escrow
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Every marketplace order and where its money sits. Manual payment review
            can be approved or rejected straight from this list.
          </p>
        </div>
      </div>

      <div className="mp-row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {ORDER_STATE_FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filterHref(filter.value)}
            prefetch={false}
            className={`mp-chip${activeState === filter.value ? " active" : ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <MpEmpty glyph="bag" title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="mpa-table-wrap">
          <table className="mpa-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Source</th>
                <th>Buyer → Seller</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Payment</th>
                <th>Stage</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const payment = paymentStateBadge(order.payment_state);
                return (
                  <tr key={order.order_id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/orders/${order.order_id}`}
                        prefetch={false}
                        className="mp-mono"
                        style={{ fontWeight: 700 }}
                      >
                        {shortId(order.order_id)}
                      </Link>
                      <div className="mp-small mp-mute mp-mono">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}
                      </div>
                    </td>
                    <td className="mp-small mp-mute">
                      {order.source === "official_shop" ? "Official" : "Community"}
                    </td>
                    <td className="mp-mono mp-small">
                      {shortId(order.buyer_account_id)}
                      <div className="mp-mute">
                        → {order.seller_account_id ? shortId(order.seller_account_id) : "YNOTT Shop"}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatThb(order.buyer_total_satang)}
                    </td>
                    <td>
                      <MpBadge kind={payment.kind}>{payment.label}</MpBadge>
                    </td>
                    <td>
                      <StageCell order={order} />
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <OrderActions
                        order={{
                          order_id: order.order_id,
                          order_code: order.order_code,
                          payment_state: order.payment_state,
                          buyer_total_satang:
                            order.payment_review_amount_satang ??
                            order.buyer_total_satang,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
