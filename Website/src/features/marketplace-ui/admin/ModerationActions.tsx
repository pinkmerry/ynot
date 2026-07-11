"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";

/**
 * Per-row resolve action for the admin Moderation (reported listings)
 * screen -- Dismiss / Unlist, each with an optional note. Recreated
 * (data-driven, not 1:1 markup) from marketplace-admin-1.jsx's
 * AdminModeration review actions (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:
 * 237-250). The prototype opens a CompareModal (seller photos vs a
 * reference image) to decide; the real marketplace_listing_reports row
 * (Database/marketplace-supabase/migrations/20260704121000_marketplace_
 * listing_reports.sql:4-18) carries only listing_id/reporter_account_id/
 * reason_code/reason_note -- no photos to compare -- so the two
 * decisions are offered inline instead, same inline-panel-in-cell shape
 * as OrderActions.tsx.
 *
 * POSTs to POST /api/marketplace/admin/reports/[reportId]/resolve
 * (src/app/api/ynot/marketplace/admin/reports/[reportId]/resolve/
 * route.ts). allowedFields is exactly ["resolution","resolutionNote"].
 * Legal resolution values, read directly off
 * marketplace_admin_resolve_listing_report (20260704121000_marketplace_
 * listing_reports.sql:85-114) and mirrored by the route's own
 * VALID_RESOLUTIONS set: "dismissed" | "unlisted". resolutionNote is
 * optional -- the route folds a missing/empty note to null with no
 * non-empty check server-side (route.ts:46-49), so unlike DisputeActions'
 * adminNote this one is never required client-side either.
 *
 * Only rendered with anything to do when report_state === "open" -- the
 * resolve RPC requires the row to still be 'open' (line 103: "where id =
 * p_report_id and report_state = 'open'"), so dismissed/unlisted reports
 * are terminal on this screen.
 */

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

export interface ModerationActionReport {
  id: string;
  listing_id: string;
  report_state: string;
}

type PanelMode = "closed" | "dismiss" | "unlist";

type ActionStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function ModerationActions({ report }: { report: ModerationActionReport }) {
  const router = useRouter();
  const [panel, setPanel] = useState<PanelMode>("closed");
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });
  const [note, setNote] = useState("");

  if (report.report_state !== "open") {
    return null;
  }

  const shortListing = report.listing_id.slice(0, 8);

  function togglePanel(next: Exclude<PanelMode, "closed">) {
    setStatus({ kind: "idle" });
    setPanel((current) => (current === next ? "closed" : next));
  }

  async function resolve(resolution: "dismissed" | "unlisted", confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(`/api/marketplace/admin/reports/${report.id}/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey("report-resolve"),
        },
        body: JSON.stringify({
          resolution,
          ...(note.trim() ? { resolutionNote: note.trim() } : {}),
        }),
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
      setPanel("closed");
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  return (
    <div className="mp-stack" style={{ gap: 8, minWidth: 168 }}>
      <div className="mp-row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <MpBtn
          size="sm"
          variant="green"
          onClick={() => togglePanel("dismiss")}
          disabled={status.kind === "busy"}
        >
          Dismiss
        </MpBtn>
        <MpBtn size="sm" onClick={() => togglePanel("unlist")} disabled={status.kind === "busy"}>
          Unlist
        </MpBtn>
      </div>

      {panel === "dismiss" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the record (optional)"
            aria-label="Resolution note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              variant="green"
              onClick={() =>
                resolve("dismissed", `Dismiss this report? Listing ${shortListing} stays live.`)
              }
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : "Confirm dismiss"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("dismiss")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {panel === "unlist" ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the record (optional)"
            aria-label="Resolution note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn
              size="sm"
              onClick={() =>
                resolve(
                  "unlisted",
                  `Unlist listing ${shortListing} and notify the seller? This hides the listing immediately.`,
                )
              }
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Working…" : "Confirm unlist"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => togglePanel("unlist")}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? <p className="mp-alert mp-alert-rose mp-small">{status.message}</p> : null}
    </div>
  );
}
