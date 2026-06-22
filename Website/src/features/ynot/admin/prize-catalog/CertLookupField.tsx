"use client";

import { useRef, useState } from "react";
import { lookupCert, type CertLookup } from "./catalog-api";
import type { GradingService } from "./add-stock/types";

type CertLookupFieldProps = {
  /** The cert string — controlled by the parent. */
  value: string;
  /** Called on every keystroke so the parent owns the cert value. */
  onChange: (cert: string) => void;
  grader: GradingService;
  onResult: (lookup: CertLookup) => void;
};

/**
 * **Controlled** cert-number input + "Look up" button backed by the real
 * GemRate route.  The parent owns the cert string via `value`/`onChange`
 * so `certNumber` is always in sync with the drawer's state.
 *
 * On a successful lookup, calls `onResult` with the lookup payload so the
 * parent wizard can autofill identity/grade + store `gemrateId`.
 *
 * Handles:
 *  - 503 (GEMRATE_API_KEY not configured) with a friendly message
 *  - 404 (cert not found) with the route's message
 *  - network errors
 *
 * Uses the real GemRate route only — no hardcoded mock cert databases.
 */
export function CertLookupField({ value, onChange, grader, onResult }: CertLookupFieldProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleLookup() {
    const trimmed = value.trim();
    if (!trimmed) {
      setHint({ kind: "warn", text: "Enter a cert number first." });
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setHint(null);

    const res = await lookupCert(trimmed, grader);

    setBusy(false);

    if (!res.ok) {
      // The route returns a human-readable error — surface it verbatim.
      setHint({ kind: "warn", text: res.error });
      return;
    }

    const lookup = res.data.lookup;
    onResult(lookup);

    const label = [lookup.name, lookup.grade ? `${grader.toUpperCase()} ${lookup.grade}` : null]
      .filter(Boolean)
      .join(" - ");

    setHint({
      kind: "ok",
      text: label ? `Verified: ${label}` : "Found - grade & identity carried into the form.",
    });
  }

  return (
    <div className="pcx-cert-lookup">
      <div className="pcx-cert-row">
        <input
          ref={inputRef}
          className="pcx-input mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Serial on the slab"
          maxLength={14}
          aria-label="Cert number"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleLookup();
            }
          }}
        />
        <button
          type="button"
          className="pcx-btn pcx-btn-ghost pcx-cert-btn"
          disabled={busy}
          onClick={handleLookup}
        >
          {busy ? "Looking up..." : "Look up"}
        </button>
      </div>
      {hint && (
        <span className={`pcx-cert-hint ${hint.kind}`} role="status">
          {hint.text}
        </span>
      )}
    </div>
  );
}
