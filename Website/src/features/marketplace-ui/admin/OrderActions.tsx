"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";

/**
 * Per-row order actions for the admin Orders & escrow screen -- "View slip"
 * (always available) plus "Approve"/"Reject" manual payment review (only
 * when payment_state === "payment_submitted"). Ported (data-driven, not
 * 1:1 markup) from marketplace-admin-2.jsx's row action cell and
 * marketplace-admin-3.jsx's SlipModal approve/reject buttons (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:58-64).
 *
 * SlipModal is loaded via next/dynamic with ssr:false -- it's purely
 * interaction-gated (only rendered after a click) and pulls in an <img> of
 * a signed URL that never needs to exist on the server-rendered page.
 *
 * Both decisions POST to the single unified route
 * POST /api/marketplace/admin/orders/[orderId]/payment
 * (src/app/api/ynot/marketplace/admin/orders/[orderId]/payment/route.ts),
 * which branches on official_shop vs user_seller internally -- this
 * component does not need to know or care which kind of order it is.
 * allowedFields is exactly ["paymentState","providerReference",
 * "providerAmountSatang","providerCurrency","adminNote"]; sending any other
 * key 400s (marketplace_unexpected_fields), so the request bodies below
 * are built from that list only.
 *
 * "paid" requires providerReference + providerAmountSatang (must equal the
 * order's buyer_total_satang exactly -- the RPC 409s
 * marketplace_payment_amount_mismatch otherwise) + providerCurrency "THB".
 * The amount field is pre-filled from order.buyer_total_satang (THB
 * display, matching every other total shown in this admin console) but
 * stays editable for the rare case the admin is recording a manual/offline
 * transfer that legitimately differs. "failed" only takes an optional
 * adminNote. Server errors (e.g. the 409 mismatch) are surfaced verbatim,
 * not rewritten.
 */

const SlipModal = dynamic(
  () => import("./SlipModal").then((mod) => ({ default: mod.SlipModal })),
  { ssr: false },
);

export interface OrderActionsOrder {
  order_id: string;
  order_code: string;
  payment_state: string;
  buyer_total_satang: number;
}

type PanelMode = "closed" | "slip" | "approve" | "reject";

type DecisionStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

/** Satang -> THB input text, e.g. 12800 -> "128", 12850 -> "128.50". */
function thbInputFor(satang: number) {
  return (satang / 100).toFixed(2).replace(/\.00$/, "");
}

/** THB input text -> whole satang, or null when not a usable positive amount. */
function thbInputToSatang(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function OrderActions({ order }: { order: OrderActionsOrder }) {
  const router = useRouter();
  const [panel, setPanel] = useState<PanelMode>("closed");
  const [status, setStatus] = useState<DecisionStatus>({ kind: "idle" });
  const [providerReference, setProviderReference] = useState("");
  const [providerAmountThb, setProviderAmountThb] = useState(() =>
    thbInputFor(order.buyer_total_satang),
  );
  const [adminNote, setAdminNote] = useState("");

  const needsPaymentReview = order.payment_state === "payment_submitted";
  const shortCode = order.order_code.slice(0, 8);

  function togglePanel(next: Exclude<PanelMode, "closed">) {
    setStatus({ kind: "idle" });
    setPanel((current) => (current === next ? "closed" : next));
  }

  async function postPaymentDecision(
    body: Record<string, unknown>,
    confirmMessage: string,
  ) {
    if (!window.confirm(confirmMessage)) return;
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(
        `/api/marketplace/admin/orders/${order.order_id}/payment`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("order-payment"),
          },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        setStatus({
          kind: "error",
          message: payload?.error ?? "That action could not be completed.",
        });
        return;
      }
      setPanel("closed");
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  async function approve() {
    const providerAmountSatang = thbInputToSatang(providerAmountThb);
    if (!providerReference.trim() || providerAmountSatang === null) {
      setStatus({
        kind: "error",
        message: "Enter the provider reference and a valid amount.",
      });
      return;
    }
    await postPaymentDecision(
      {
        paymentState: "paid",
        providerReference: providerReference.trim(),
        providerAmountSatang,
        providerCurrency: "THB",
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      },
      `Approve payment for order ${shortCode} at ${formatThb(providerAmountSatang)}?`,
    );
  }

  async function reject() {
    await postPaymentDecision(
      {
        paymentState: "failed",
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      },
      `Mark payment failed for order ${shortCode}? The order is cancelled and the buyer must resubmit.`,
    );
  }

  return (
    <div className="mp-stack" style={{ gap: 8, minWidth: 168 }}>
      <div className="mp-row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <MpBtn size="sm" onClick={() => togglePanel("slip")}>
          View slip
        </MpBtn>
        {needsPaymentReview ? (
          <>
            <MpBtn
              size="sm"
              variant="green"
              onClick={() => togglePanel("approve")}
              disabled={status.kind === "busy"}
            >
              Approve
            </MpBtn>
            <MpBtn
              size="sm"
              onClick={() => togglePanel("reject")}
              disabled={status.kind === "busy"}
            >
              Reject
            </MpBtn>
          </>
        ) : null}
      </div>

      {panel === "approve" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <input
            className="mp-input"
            placeholder="Provider reference"
            aria-label="Provider reference"
            value={providerReference}
            onChange={(event) => setProviderReference(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <span className="mp-mono mp-small">฿</span>
            <input
              className="mp-input"
              inputMode="decimal"
              aria-label="Provider amount in Thai baht"
              value={providerAmountThb}
              onChange={(event) => setProviderAmountThb(event.target.value)}
            />
          </div>
          <input
            className="mp-input"
            placeholder="Admin note (optional)"
            aria-label="Admin note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              variant="green"
              onClick={approve}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Approving…" : "Confirm paid"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("approve")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {panel === "reject" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the record (optional)"
            aria-label="Rejection note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn size="sm" onClick={reject} disabled={status.kind === "busy"}>
              {status.kind === "busy" ? "Rejecting…" : "Confirm failed"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("reject")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
      ) : null}

      {panel === "slip" ? (
        <SlipModal
          orderId={order.order_id}
          orderCode={order.order_code}
          onClose={() => setPanel("closed")}
        />
      ) : null}
    </div>
  );
}
