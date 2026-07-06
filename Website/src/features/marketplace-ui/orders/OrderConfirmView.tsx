import Link from "next/link";
import { MpIcon } from "../shared/MpIcon";
import { MpBtn, MpPanel } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import {
  ORDER_STEP_LABELS,
  orderStepState,
  type OrderStepFields,
} from "./orderStepIndex";

/**
 * Placed-order confirmation view. Ported from the prototype's ProtoOrderConfirm
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-5.jsx:189-213).
 * Shown on the order detail page for orders that are no longer resumable.
 */

export type ConfirmOrder = OrderStepFields & {
  id: string;
  buyer_total_satang: number;
  created_at: string;
  title?: string | null;
};

export function OrderConfirmView({ order }: { order: ConfirmOrder }) {
  const step = orderStepState(order);
  return (
    <MpPanel className="mp-order-confirm">
      <div className="mp-order-confirm-check" aria-hidden>
        <MpIcon name="check" size={28} />
      </div>
      <h1 className="mp-h1">Order placed</h1>
      <p className="mp-mute">
        {order.title ? `${order.title} · ` : ""}Order {order.id.slice(0, 8)}
      </p>
      <p className="mp-order-confirm-total">{formatThb(order.buyer_total_satang)}</p>

      <ol className="mp-steps mp-order-steps" aria-label="Order progress">
        {ORDER_STEP_LABELS.map((label, i) => {
          const state =
            step.ended && i >= step.index
              ? "ended"
              : i < step.index
                ? "done"
                : i === step.index
                  ? "now"
                  : "todo";
          return (
            <li key={label} className={`mp-step ${state}`}>
              <span className="mp-step-dot" aria-hidden />
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      {step.ended && step.endedLabel ? (
        <p className="mp-order-ended mp-mute mp-small">{step.endedLabel}</p>
      ) : null}

      <div className="mp-order-confirm-actions">
        <Link href="/marketplace/orders">
          <MpBtn variant="primary">Track in Orders</MpBtn>
        </Link>
        <Link href="/marketplace">
          <MpBtn>Back to marketplace</MpBtn>
        </Link>
      </div>
    </MpPanel>
  );
}
