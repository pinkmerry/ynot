"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";

/**
 * Per-card transition/activate actions for the admin Verification queue.
 * Ported (data-driven, not 1:1 markup) from marketplace-admin-1.jsx's
 * AdminVerify pass/fail buttons (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:256-310)
 * -- the prototype's "verify a card already in escrow" flow doesn't exist
 * in the real schema; the real flow is seller *intake* (submission -> vault
 * receipt -> inspection -> activation), so the buttons below are the real
 * legal transitions instead.
 *
 * Real state machine, read directly off the two RPCs this component calls:
 *
 * POST /api/marketplace/admin/seller-consignments/[submissionId]/transition
 * -> marketplace_admin_transition_seller_intake (Database/marketplace-
 *    supabase/migrations/20260628110000_marketplace_seller_consignment.sql:
 *    1020-1195). allowedFields: expectedVersion, status, adminNote,
 *    intakeInstructionId (ADMIN_SELLER_INTAKE_TRANSITION_FIELDS in
 *    src/lib/marketplace/seller-consignment.ts). Legal p_target_status
 *    values and their required current status (lines 1104-1115):
 *      -> intake_instruction_sent   from: submitted, handoff_confirmed
 *      -> received                  from: intake_instruction_sent, handoff_confirmed
 *      -> inspection_passed/failed  from: received
 *
 * POST /api/marketplace/admin/seller-consignments/[submissionId]/activate
 * -> marketplace_admin_activate_seller_listing (.../20260628120000_
 *    marketplace_user_seller_purchase.sql:80-260). allowedFields:
 *    expectedVersion, publicDescription, photoUrls, adminNote
 *    (SELLER_LISTING_ACTIVATION_FIELDS) -- notably NO price field: the
 *    listing price is always submission.asking_price_satang, already set
 *    at intake time, so "activate with price confirm" means the admin
 *    confirms that already-set price in a window.confirm() rather than
 *    editing it here. Guard (lines 149-154): only legal when status is
 *    exactly 'inspection_passed' and neither approved_inventory_id nor
 *    listing_id is set yet.
 *
 * Anything else (draft, inspection_failed, inventory_created, listed, sold,
 * cancelled, returned) has no admin action on this screen.
 *
 * adminNote is optional server-side for every transition (optionalTextField
 * in seller-consignment.ts) -- including inspection_failed -- so the
 * "reject" note below is offered but never required client-side either.
 */

const TARGET_STATUSES = [
  "intake_instruction_sent",
  "received",
  "inspection_passed",
  "inspection_failed",
] as const;

type TargetStatus = (typeof TARGET_STATUSES)[number];

type TransitionAction = {
  kind: "transition";
  target: TargetStatus;
  label: string;
  confirm: (title: string) => string;
};

type ActivateAction = { kind: "activate"; label: string };

type Action = TransitionAction | ActivateAction;

const SEND_INTAKE_INSTRUCTIONS: TransitionAction = {
  kind: "transition",
  target: "intake_instruction_sent",
  label: "Send intake instructions",
  confirm: (title) => `Send intake instructions for "${title}"?`,
};

const MARK_RECEIVED: TransitionAction = {
  kind: "transition",
  target: "received",
  label: "Mark received",
  confirm: (title) => `Mark "${title}" as received at the vault?`,
};

const PASS_INSPECTION: TransitionAction = {
  kind: "transition",
  target: "inspection_passed",
  label: "Pass inspection",
  confirm: (title) => `Pass inspection for "${title}"? This clears it to go live.`,
};

/** Real legal-transition source statuses -> the actions available from them. */
function actionsFor(status: string): Action[] {
  switch (status) {
    case "submitted":
      return [SEND_INTAKE_INSTRUCTIONS];
    case "handoff_confirmed":
      return [SEND_INTAKE_INSTRUCTIONS, MARK_RECEIVED];
    case "intake_instruction_sent":
      return [MARK_RECEIVED];
    case "received":
      return [PASS_INSPECTION, { kind: "transition", target: "inspection_failed", label: "Fail inspection", confirm: (title) => `Fail inspection for "${title}"?` }];
    case "inspection_passed":
      return [{ kind: "activate", label: "Activate listing" }];
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

export interface VerifyActionSubmission {
  id: string;
  status: string;
  version: number;
  title_snapshot: string;
  asking_price_satang: number;
}

type ActionStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function VerifyActions({ submission }: { submission: VerifyActionSubmission }) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });
  const [showFailNote, setShowFailNote] = useState(false);
  const [failNote, setFailNote] = useState("");

  const actions = actionsFor(submission.status);

  async function post(url: string, body: Record<string, unknown>, scope: string) {
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey(scope),
        },
        body: JSON.stringify(body),
      });
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
      setStatus({ kind: "idle" });
      setShowFailNote(false);
      setFailNote("");
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  function runTransition(target: TargetStatus, confirmMessage: string, note?: string) {
    if (!window.confirm(confirmMessage)) return;
    void post(
      `/api/marketplace/admin/seller-consignments/${submission.id}/transition`,
      {
        expectedVersion: submission.version,
        status: target,
        ...(note && note.trim() ? { adminNote: note.trim() } : {}),
      },
      "verify-transition",
    );
  }

  function runActivate() {
    const confirmMessage = `Activate "${submission.title_snapshot}" at ${formatThb(submission.asking_price_satang)}? It goes live on the market immediately.`;
    if (!window.confirm(confirmMessage)) return;
    void post(
      `/api/marketplace/admin/seller-consignments/${submission.id}/activate`,
      { expectedVersion: submission.version },
      "verify-activate",
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
        {actions.map((action) => {
          if (action.kind === "activate") {
            return (
              <MpBtn
                key="activate"
                size="sm"
                variant="green"
                onClick={runActivate}
                disabled={status.kind === "busy"}
              >
                {status.kind === "busy" ? "Activating…" : action.label}
              </MpBtn>
            );
          }
          if (action.target === "inspection_failed") {
            return (
              <MpBtn
                key={action.target}
                size="sm"
                onClick={() => setShowFailNote((open) => !open)}
                disabled={status.kind === "busy"}
              >
                {action.label}
              </MpBtn>
            );
          }
          return (
            <MpBtn
              key={action.target}
              size="sm"
              variant={action.target === "inspection_passed" ? "green" : undefined}
              onClick={() => runTransition(action.target, action.confirm(submission.title_snapshot))}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : action.label}
            </MpBtn>
          );
        })}
      </div>

      {showFailNote ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the seller (optional)"
            aria-label="Inspection failure note"
            value={failNote}
            onChange={(event) => setFailNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              onClick={() =>
                runTransition(
                  "inspection_failed",
                  `Fail inspection for "${submission.title_snapshot}"?`,
                  failNote,
                )
              }
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : "Confirm fail"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => setShowFailNote(false)}>
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
