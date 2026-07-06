"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import {
  ORDER_STEP_LABELS,
  orderStepState,
  type OrderStepFields,
} from "./orderStepIndex";

/**
 * Buyer order timeline + dispute affordance. Visuals ported from the prototype
 * OrderTimeline (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-5.jsx:10-75).
 *
 * The dispute window is enforced SERVER-SIDE by marketplace_open_buyer_refund_request
 * (dispute_window_days from the active money policy). This component shows the
 * "Report a problem" affordance on delivered orders and surfaces whatever error the
 * server returns (e.g. window closed) — it never computes the window client-side.
 */

export type BuyerTimelineOrder = OrderStepFields & {
  id: string;
  item_price_satang: number;
  shipping_fee_satang: number;
  buyer_service_fee_satang: number;
  buyer_total_satang: number;
};

const MIN_REASON = 10;
const MAX_REASON = 1000;

type DisputeStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done" };

export function OrderTimeline({ order }: { order: BuyerTimelineOrder }) {
  const router = useRouter();
  const step = orderStepState(order);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<DisputeStatus>({ kind: "idle" });

  const alreadyDisputed =
    (order.refund_state ?? "none") !== "none";
  const canDispute =
    order.fulfilment_state === "completed" && !alreadyDisputed;

  async function submitDispute() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON || trimmed.length > MAX_REASON) {
      setStatus({
        kind: "error",
        message: `Describe the problem in ${MIN_REASON}–${MAX_REASON} characters.`,
      });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch(`/api/marketplace/orders/${order.id}/dispute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (res.status === 401) {
        setStatus({
          kind: "error",
          message: "Please log in to report a problem.",
        });
        return;
      }
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        setStatus({
          kind: "error",
          message:
            payload?.error ?? "Could not open the dispute. Please try again.",
        });
        return;
      }
      setStatus({ kind: "done" });
      router.refresh();
    } catch {
      setStatus({
        kind: "error",
        message: "Network error. Please try again.",
      });
    }
  }

  return (
    <div className="mp-order-timeline">
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

      <dl className="mp-order-totals">
        <div>
          <dt>Item</dt>
          <dd>{formatThb(order.item_price_satang)}</dd>
        </div>
        <div>
          <dt>Service fee</dt>
          <dd>{formatThb(order.buyer_service_fee_satang)}</dd>
        </div>
        <div>
          <dt>Shipping</dt>
          <dd>{formatThb(order.shipping_fee_satang)}</dd>
        </div>
        <div>
          <dt>Total paid</dt>
          <dd>{formatThb(order.buyer_total_satang)}</dd>
        </div>
      </dl>

      {alreadyDisputed ? (
        <p className="mp-small mp-mute">
          A problem report is open on this order — our team is reviewing it.
        </p>
      ) : canDispute ? (
        status.kind === "done" ? (
          <p className="mp-alert mp-alert-green mp-small">
            Dispute opened — our team will review it.
          </p>
        ) : showReport ? (
          <div className="mp-report-box">
            <label className="mp-small mp-mute" htmlFor={`dispute-${order.id}`}>
              What went wrong?
            </label>
            <textarea
              id={`dispute-${order.id}`}
              className="mp-textarea"
              rows={3}
              maxLength={MAX_REASON}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the problem (min 10 characters)…"
            />
            {status.kind === "error" ? (
              <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
            ) : null}
            <div className="mp-report-actions">
              <MpBtn
                size="sm"
                onClick={submitDispute}
                disabled={status.kind === "submitting"}
              >
                {status.kind === "submitting" ? "Sending…" : "Submit report"}
              </MpBtn>
              <MpBtn
                size="sm"
                onClick={() => {
                  setShowReport(false);
                  setStatus({ kind: "idle" });
                }}
              >
                Cancel
              </MpBtn>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mp-small mp-link"
            onClick={() => setShowReport(true)}
          >
            Report a problem with this order
          </button>
        )
      ) : null}
    </div>
  );
}
