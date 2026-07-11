"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";

/**
 * Per-dispute approve/reject/mark-refunded actions for the admin
 * Disputes & refunds screen. Recreated (data-driven, not 1:1 markup) from
 * marketplace-admin-2.jsx's AdminDisputes resolve buttons (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:
 * 172-175) -- the prototype's binary "refund buyer / side with seller"
 * click collapses the real three-way resolution into one step; the real
 * backend requires a separate approve-then-mark-refunded step (money only
 * actually leaves escrow once you attach real transfer evidence), so this
 * component splits it into that two-step flow instead.
 *
 * POSTs to POST /api/marketplace/admin/refunds/[refundRequestId]/transition
 * (src/app/api/ynot/marketplace/admin/refunds/[refundRequestId]/transition/
 * route.ts). allowedFields is exactly REFUND_TRANSITION_FIELDS =
 * ["refundState","providerReference","adminNote"] (src/lib/marketplace/
 * ops-hardening.ts:19-23). Real legal transitions, read directly off
 * marketplace_record_refund_transition (Database/marketplace-supabase/
 * migrations/20260628130000_marketplace_ops_hardening.sql:603-754):
 *   - refundState must be "approved" | "rejected" | "refunded" (line
 *     631) -- the RPC does not gate on the row's CURRENT refund_state
 *     (no "where refund_state = ..." precondition), but the product
 *     flow only ever offers Approve/Reject from "requested" and Mark
 *     refunded from "approved" -- actionsFor() below encodes exactly
 *     that pair, and rejected/refunded are terminal (no actions) on
 *     this screen.
 *   - adminNote is REQUIRED and non-empty for every transition (line
 *     637-639, raises "marketplace_admin_note_required" otherwise) --
 *     unlike OrderActions'/ModerationActions' optional notes, this one
 *     blocks submission client-side on an empty note too.
 *   - providerReference is REQUIRED only when refundState === "refunded"
 *     (line 634-636, "marketplace_evidence_required").
 * Admin role for this RPC is owner/admin only, not staff (line 628) --
 * unlike the read side (listAdminRefundRequests allows staff to view).
 * No role-based UI hiding is done here, same as OrderActions/
 * VerifyActions: a staff account sees the buttons and gets the server's
 * 403 surfaced verbatim if they try.
 *
 * Mark-refunded moves real money out of escrow, so it gets a
 * window.confirm naming the order ref and the exact state change, on top
 * of the confirm every transition already requires.
 */

type DisputeActionKind = "approve" | "reject" | "refund";

interface DisputeActionDef {
  kind: DisputeActionKind;
  label: string;
  variant?: "green";
}

const APPROVE_ACTION: DisputeActionDef = { kind: "approve", label: "Approve", variant: "green" };
const REJECT_ACTION: DisputeActionDef = { kind: "reject", label: "Reject" };
const REFUND_ACTION: DisputeActionDef = { kind: "refund", label: "Mark refunded", variant: "green" };

const PANEL_CONFIRM_LABEL: Record<DisputeActionKind, string> = {
  approve: "Confirm approve",
  reject: "Confirm reject",
  refund: "Confirm refunded",
};

/** Real legal-transition source states -> the actions available from them. */
function actionsFor(refundState: string): DisputeActionDef[] {
  switch (refundState) {
    case "requested":
      return [APPROVE_ACTION, REJECT_ACTION];
    case "approved":
      return [REFUND_ACTION];
    default:
      return [];
  }
}

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

export interface DisputeActionRefund {
  id: string;
  order_id: string;
  refund_state: string;
  refund_amount_satang: number;
}

type ActionStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function DisputeActions({ dispute }: { dispute: DisputeActionRefund }) {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<DisputeActionKind | null>(null);
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });
  const [adminNote, setAdminNote] = useState("");
  const [providerReference, setProviderReference] = useState("");

  const actions = actionsFor(dispute.refund_state);
  const shortOrder = dispute.order_id.slice(0, 8);

  function togglePanel(kind: DisputeActionKind) {
    setStatus({ kind: "idle" });
    setOpenPanel((current) => (current === kind ? null : kind));
  }

  async function transition(body: Record<string, unknown>, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(`/api/marketplace/admin/refunds/${dispute.id}/transition`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey("refund-transition"),
        },
        body: JSON.stringify(body),
      });
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
      setOpenPanel(null);
      setStatus({ kind: "idle" });
      setAdminNote("");
      setProviderReference("");
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  function submitPanel(kind: DisputeActionKind) {
    if (!adminNote.trim()) {
      setStatus({ kind: "error", message: "Add a note explaining the decision." });
      return;
    }
    if (kind === "approve") {
      void transition(
        { refundState: "approved", adminNote: adminNote.trim() },
        `Approve the refund for order ${shortOrder}? The seller payout stays frozen until you mark it refunded.`,
      );
      return;
    }
    if (kind === "reject") {
      void transition(
        { refundState: "rejected", adminNote: adminNote.trim() },
        `Reject the refund for order ${shortOrder}? The seller payout can proceed on its normal schedule.`,
      );
      return;
    }
    if (!providerReference.trim()) {
      setStatus({ kind: "error", message: "Enter the provider reference before marking refunded." });
      return;
    }
    void transition(
      {
        refundState: "refunded",
        providerReference: providerReference.trim(),
        adminNote: adminNote.trim(),
      },
      `Mark order ${shortOrder} as refunded (approved → refunded), ${formatThb(dispute.refund_amount_satang)} sent to the buyer? This cannot be undone.`,
    );
  }

  if (actions.length === 0) {
    return status.kind === "error" ? (
      <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
    ) : null;
  }

  return (
    <div className="mp-stack" style={{ gap: 8 }}>
      <div className="mp-row" style={{ gap: 6, flexWrap: "wrap" }}>
        {actions.map((action) => (
          <MpBtn
            key={action.kind}
            size="sm"
            variant={action.variant}
            onClick={() => togglePanel(action.kind)}
            disabled={status.kind === "busy"}
          >
            {action.label}
          </MpBtn>
        ))}
      </div>

      {openPanel ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          {openPanel === "refund" ? (
            <input
              className="mp-input"
              placeholder="Provider reference"
              aria-label="Provider reference"
              value={providerReference}
              onChange={(event) => setProviderReference(event.target.value)}
            />
          ) : null}
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the record (required)"
            aria-label="Admin note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              variant="green"
              onClick={() => submitPanel(openPanel)}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : PANEL_CONFIRM_LABEL[openPanel]}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel(openPanel)}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? <p className="mp-alert mp-alert-rose mp-small">{status.message}</p> : null}
    </div>
  );
}
