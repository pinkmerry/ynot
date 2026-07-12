"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBadge, MpBtn, MpEmpty } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";

/**
 * "My listings" tab — seller submissions with status badges + Edit / Unlist /
 * Ship-to-YNOTT (handoff). Visuals ported from the prototype's listings tab
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-5.jsx).
 *
 * Actions are offered optimistically; the server (cancel / handoff routes)
 * enforces which states allow which action and returns a clean error we surface.
 */

export type SubmissionRow = {
  id: string;
  submission_number: string;
  status: string;
  title_snapshot: string;
  condition_code: string;
  asking_price_satang: number;
  payout_preview_satang: number;
  version: number;
};

const HANDOFF_METHODS = [
  { value: "ship_to_store", label: "Ship to YNOTT" },
  { value: "bring_to_store", label: "Bring to YNOTT store" },
] as const;

// Statuses where the seller has not yet confirmed handoff, so "Mark as
// shipped" is meaningful. Real enum: submitted / intake_instruction_sent
// (see 20260628110000_marketplace_seller_consignment.sql). Post-handoff
// states (handoff_confirmed, received, inspection_*, inventory_created,
// listed, sold, returned) never re-offer it.
const PRE_HANDOFF_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "intake_instruction_sent",
]);

function badgeFor(status: string): {
  kind: "community" | "sold" | "graded";
  label: string;
} {
  if (status === "listed") return { kind: "community", label: "Live on market" };
  if (status === "sold") return { kind: "sold", label: "Sold" };
  return { kind: "graded", label: "Ship to YNOTT to go live" };
}

function prettify(status: string) {
  return status.replace(/_/g, " ");
}

type RowStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

export function ListingsTab({ submissions }: { submissions: SubmissionRow[] }) {
  const router = useRouter();
  const [openHandoff, setOpenHandoff] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [method, setMethod] = useState<string>(HANDOFF_METHODS[0].value);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");

  function setStatus(id: string, s: RowStatus) {
    setRowStatus((prev) => ({ ...prev, [id]: s }));
  }

  async function post(
    url: string,
    body: Record<string, unknown>,
    id: string,
  ): Promise<boolean> {
    setStatus(id, { kind: "busy" });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setStatus(id, { kind: "error", message: "Please log in again." });
        return false;
      }
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        setStatus(id, {
          kind: "error",
          message: payload?.error ?? "That action could not be completed.",
        });
        return false;
      }
      setStatus(id, { kind: "idle" });
      return true;
    } catch {
      setStatus(id, { kind: "error", message: "Network error. Try again." });
      return false;
    }
  }

  async function unlist(row: SubmissionRow) {
    if (!window.confirm(`Unlist "${row.title_snapshot}"? This cannot be undone.`)) {
      return;
    }
    const ok = await post(
      `/api/marketplace/seller/submissions/${row.id}/cancel`,
      { expectedVersion: row.version },
      row.id,
    );
    if (ok) router.refresh();
  }

  async function confirmHandoff(row: SubmissionRow) {
    const ok = await post(
      `/api/marketplace/seller/submissions/${row.id}/handoff`,
      {
        expectedVersion: row.version,
        handoffMethod: method,
        carrier: carrier.trim() || null,
        trackingCode: tracking.trim() || null,
        sellerNote: note.trim() || null,
      },
      row.id,
    );
    if (ok) {
      setOpenHandoff(null);
      router.refresh();
    }
  }

  if (submissions.length === 0) {
    return (
      <MpEmpty
        glyph="tag"
        title="No listings yet"
        hint="List a card to see it here."
      >
        <Link href="/marketplace/seller">
          <MpBtn variant="primary">Sell a card</MpBtn>
        </Link>
      </MpEmpty>
    );
  }

  return (
    <div className="mp-listings-tab">
      {submissions.map((row) => {
        const badge = badgeFor(row.status);
        const isTerminal = row.status === "sold";
        const isLive = row.status === "listed";
        const canHandoff = PRE_HANDOFF_STATUSES.has(row.status);
        const status = rowStatus[row.id] ?? { kind: "idle" };
        return (
          <div key={row.id} className="mp-listing-row">
            <div className="mp-listing-main">
              <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
              <strong>{row.title_snapshot}</strong>
              <span className="mp-small mp-mute">
                #{row.submission_number} · {prettify(row.status)}
              </span>
            </div>
            <div className="mp-listing-money">
              <span>{formatThb(row.asking_price_satang)}</span>
              <span className="mp-small mp-mute">
                You receive {formatThb(row.payout_preview_satang)}
              </span>
            </div>
            <div className="mp-listing-actions">
              {!isTerminal && !isLive ? (
                <Link href={`/marketplace/seller?submission=${row.id}`}>
                  <MpBtn size="sm">Edit</MpBtn>
                </Link>
              ) : null}
              {canHandoff ? (
                <MpBtn
                  size="sm"
                  onClick={() =>
                    setOpenHandoff(openHandoff === row.id ? null : row.id)
                  }
                >
                  Mark as shipped
                </MpBtn>
              ) : null}
              {!isTerminal ? (
                <MpBtn
                  size="sm"
                  onClick={() => unlist(row)}
                  disabled={status.kind === "busy"}
                >
                  Unlist
                </MpBtn>
              ) : null}
            </div>

            {openHandoff === row.id ? (
              <div className="mp-handoff-box">
                <label className="mp-small mp-mute">
                  How did you send it to YNOTT?
                  <select
                    className="mp-select"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {HANDOFF_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="mp-input"
                  placeholder="Carrier (optional)"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
                <input
                  className="mp-input"
                  placeholder="Tracking code (optional)"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                />
                <input
                  className="mp-input"
                  placeholder="Note for YNOTT (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mp-report-actions">
                  <MpBtn
                    variant="primary"
                    size="sm"
                    onClick={() => confirmHandoff(row)}
                    disabled={status.kind === "busy"}
                  >
                    {status.kind === "busy" ? "Confirming…" : "Confirm handoff"}
                  </MpBtn>
                  <MpBtn size="sm" onClick={() => setOpenHandoff(null)}>
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
      })}
    </div>
  );
}
