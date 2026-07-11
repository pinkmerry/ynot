"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";

/**
 * Per-row release/mark-transferred actions for the admin Seller payouts
 * screen. Recreated (data-driven, not 1:1 markup) from
 * marketplace-admin-2.jsx's AdminPayouts "Mark transferred" button
 * (prototype: /Users/pinkmerry/Downloads/ynott/project/
 * marketplace-admin-2.jsx:85-125) -- the prototype collapses the real
 * two-step payout to a single "Mark transferred" click; the real backend
 * requires an explicit release step first (money moves out of the seller's
 * holding state only once an owner calls marketplace_release_seller_payout)
 * before a second, separate "mark paid" step records the actual transfer,
 * so this component splits it into that real two-step flow instead.
 *
 * Release POSTs to POST /api/marketplace/admin/seller-payouts/[payoutId]/release
 * (src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/release/
 * route.ts). allowedFields is exactly SELLER_PAYOUT_RELEASE_FIELDS =
 * ["adminNote"] (src/lib/marketplace/payouts.ts) -- adminNote is optional.
 *
 * Mark transferred POSTs to POST /api/marketplace/admin/seller-payouts/
 * [payoutId]/paid ([payoutId]/paid/route.ts). allowedFields is exactly
 * SELLER_PAYOUT_PAID_FIELDS = ["transferReference", "adminNote"] --
 * transferReference is REQUIRED (markSellerPayoutPaid's requiredTextField),
 * adminNote stays optional.
 *
 * Button visibility is gated on payout_state alone: "Release" whenever
 * payout_state is "held" or "eligible", "Mark transferred" only once it's
 * "released" (mirrors marketplace_mark_seller_payout_paid's own
 * `payout_row.payout_state <> 'released'` guard,
 * 20260628120000_marketplace_user_seller_purchase.sql:1402-1403). The
 * release RPC additionally requires the order to be paid, shipped/
 * completed, refund_state in ('none','rejected') (rejected disputes don't
 * block release -- see 20260704124000_marketplace_payout_refund_gate.sql),
 * and to have no open reconciliation item
 * (marketplace_release_seller_payout, 20260628130000_marketplace_ops_
 * hardening.sql:843-113) -- none of which this row carries (payouts.ts's
 * SellerPayoutQueueRow has no order/refund/reconciliation fields), so this
 * component does not try to pre-compute eligibility beyond what
 * payout_state already implies. If the RPC still rejects (e.g.
 * marketplace_payout_not_eligible because a dispute is open), that error is
 * surfaced verbatim in the status line below, same as OrderActions/
 * DisputeActions/ModerationActions.
 *
 * Both actions move real money, so each gets its own window.confirm naming
 * the order and the net amount on top of the inline panel.
 */

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

export interface PayoutActionRow {
  id: string;
  order_id: string;
  payout_state: string;
  payout_amount_satang: number;
}

type PayoutPanel = "closed" | "release" | "paid";

type ActionStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function PayoutActions({ payout }: { payout: PayoutActionRow }) {
  const router = useRouter();
  const [panel, setPanel] = useState<PayoutPanel>("closed");
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });
  const [adminNote, setAdminNote] = useState("");
  const [transferReference, setTransferReference] = useState("");

  const canRelease = payout.payout_state === "held" || payout.payout_state === "eligible";
  const canMarkPaid = payout.payout_state === "released";
  const shortOrder = payout.order_id.slice(0, 8);
  const netLabel = formatThb(payout.payout_amount_satang);

  if (!canRelease && !canMarkPaid) {
    return status.kind === "error" ? (
      <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
    ) : null;
  }

  function togglePanel(next: Exclude<PayoutPanel, "closed">) {
    setStatus({ kind: "idle" });
    setPanel((current) => (current === next ? "closed" : next));
  }

  async function submit(
    endpoint: "release" | "paid",
    body: Record<string, unknown>,
    confirmMessage: string,
  ) {
    if (!window.confirm(confirmMessage)) return;
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(
        `/api/marketplace/admin/seller-payouts/${payout.id}/${endpoint}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey(`payout-${endpoint}`),
          },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setStatus({ kind: "error", message: "Login is required. Refresh and sign back in." });
          return;
        }
        setStatus({
          kind: "error",
          message: payload?.error ?? "That action could not be completed.",
        });
        return;
      }
      setPanel("closed");
      setStatus({ kind: "idle" });
      setAdminNote("");
      setTransferReference("");
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  function submitRelease() {
    void submit(
      "release",
      adminNote.trim() ? { adminNote: adminNote.trim() } : {},
      `Release ${netLabel} for order ${shortOrder}? This moves it into the seller's payout queue for transfer.`,
    );
  }

  function submitPaid() {
    if (!transferReference.trim()) {
      setStatus({ kind: "error", message: "Enter the transfer reference before marking paid." });
      return;
    }
    void submit(
      "paid",
      {
        transferReference: transferReference.trim(),
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      },
      `Mark ${netLabel} as transferred for order ${shortOrder}? This cannot be undone.`,
    );
  }

  return (
    <div className="mp-stack" style={{ gap: 8, minWidth: 168 }}>
      <div className="mp-row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {canRelease ? (
          <MpBtn
            size="sm"
            variant="green"
            onClick={() => togglePanel("release")}
            disabled={status.kind === "busy"}
          >
            Release
          </MpBtn>
        ) : null}
        {canMarkPaid ? (
          <MpBtn
            size="sm"
            variant="green"
            onClick={() => togglePanel("paid")}
            disabled={status.kind === "busy"}
          >
            Mark transferred
          </MpBtn>
        ) : null}
      </div>

      {panel === "release" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Admin note (optional)"
            aria-label="Admin note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              variant="green"
              onClick={submitRelease}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : "Confirm release"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("release")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {panel === "paid" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <input
            className="mp-input"
            placeholder="Transfer reference"
            aria-label="Transfer reference"
            value={transferReference}
            onChange={(event) => setTransferReference(event.target.value)}
          />
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Admin note (optional)"
            aria-label="Admin note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              variant="green"
              onClick={submitPaid}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : "Confirm transferred"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("paid")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
      ) : null}
    </div>
  );
}
