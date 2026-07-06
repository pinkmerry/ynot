"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";

/**
 * Inline "report a problem with a listing" control. Renders as a small
 * mp-small link that expands into a reason <select> + optional note, then
 * POSTs to /api/marketplace/listings/[listingId]/report with the
 * idempotency-key header (see src/lib/marketplace/request-guard.ts,
 * marketplaceIdempotencyKey() — same primary header AlertButton already
 * sends).
 *
 * Reason codes match REPORT_REASON_CODES in
 * src/app/api/ynot/marketplace/listings/[listingId]/report/route.ts
 * exactly — any drift there would make every report 400.
 */

const REPORT_REASONS = [
  { value: "fake_or_cert_mismatch", label: "Fake item or cert mismatch" },
  { value: "stolen_photos", label: "Stolen photos" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "pricing_abuse", label: "Pricing abuse" },
  { value: "other", label: "Other" },
] as const;

export interface ReportListingButtonProps {
  listingId: string;
}

type ReportStatus =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "unauthenticated" };

async function postListingReport(listingId: string, reasonCode: string, reasonNote: string) {
  const response = await fetch(`/api/marketplace/listings/${listingId}/report`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      reasonCode,
      reasonNote: reasonNote.trim() ? reasonNote.trim() : null,
    }),
  });

  if (response.status === 401) {
    return { ok: false as const, unauthenticated: true as const };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  if (!response.ok || record.ok !== true) {
    const message = typeof record.error === "string" ? record.error : "Could not send this report.";
    return { ok: false as const, unauthenticated: false as const, message };
  }

  return { ok: true as const };
}

export function ReportListingButton({ listingId }: ReportListingButtonProps) {
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>(REPORT_REASONS[0].value);
  const [reasonNote, setReasonNote] = useState("");
  const [status, setStatus] = useState<ReportStatus>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const selectId = useId();
  const noteId = useId();

  function handleSubmit() {
    startTransition(async () => {
      const result = await postListingReport(listingId, reasonCode, reasonNote);
      if (result.ok) {
        setStatus({ kind: "success" });
        return;
      }
      if (result.unauthenticated) {
        setStatus({ kind: "unauthenticated" });
        return;
      }
      setStatus({ kind: "error", message: result.message });
    });
  }

  if (status.kind === "unauthenticated") {
    return (
      <Link href="/login" className="mp-small">
        Log in to report a problem with this listing
      </Link>
    );
  }

  if (status.kind === "success") {
    return <span className="mp-small mp-mute">Reported — our team will review</span>;
  }

  if (!open) {
    return (
      <a
        className="mp-small"
        role="button"
        tabIndex={0}
        style={{ fontWeight: 600, cursor: "pointer" }}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setOpen(true);
        }}
      >
        Report a problem with a listing
      </a>
    );
  }

  return (
    <div className="mp-stack" style={{ gap: 8, maxWidth: 360 }}>
      <label className="mp-small" htmlFor={selectId} style={{ fontWeight: 700 }}>
        What&apos;s wrong with this listing?
      </label>
      <select
        id={selectId}
        className="mp-small"
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value)}
        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--mp-line-strong)" }}
      >
        {REPORT_REASONS.map((reason) => (
          <option key={reason.value} value={reason.value}>
            {reason.label}
          </option>
        ))}
      </select>
      <label className="mp-small" htmlFor={noteId}>
        Additional details (optional)
      </label>
      <textarea
        id={noteId}
        className="mp-small"
        value={reasonNote}
        onChange={(event) => setReasonNote(event.target.value)}
        rows={3}
        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--mp-line-strong)", resize: "vertical" }}
      />
      {status.kind === "error" ? (
        <span className="mp-small" style={{ color: "var(--mp-rose)" }}>
          {status.message}
        </span>
      ) : null}
      <div className="mp-row" style={{ gap: 8 }}>
        <button type="button" className="mp-btn mp-btn-primary mpa-btn-sm" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          className="mp-btn mpa-btn-sm"
          onClick={() => {
            setOpen(false);
            setStatus({ kind: "idle" });
          }}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
