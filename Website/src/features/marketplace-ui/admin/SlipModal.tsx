"use client";

import { useEffect, useState } from "react";
import { MpIcon } from "../shared/MpIcon";

/**
 * Payment slip viewer modal. Visuals ported from marketplace-admin-3.jsx's
 * SlipModal/MpaModal (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-3.jsx:9-98) --
 * same overlay/modal chrome, same "amount mismatch" framing, but wired to
 * the real signed-URL contract instead of the prototype's synthetic
 * makeSampleSlip() canvas image.
 *
 * Real contract: GET /api/marketplace/admin/orders/[orderId]/payment-proof-url
 * (src/app/api/ynot/marketplace/admin/orders/[orderId]/payment-proof-url/route.ts)
 * returns { ok, url, expiresInSeconds } where url is a 120s Supabase Storage
 * signed URL, or 404 { code: "marketplace_proof_missing" } when no proof was
 * ever uploaded (a manual/offline payment, or the buyer hasn't submitted a
 * slip yet). Because the URL expires in 120 seconds, it is fetched fresh
 * every time this modal opens (useEffect keyed on orderId, component state
 * only) and is NEVER cached at module scope -- reopening the modal always
 * requests a new signed URL rather than replaying a stale one.
 */

export interface SlipModalProps {
  orderId: string;
  orderCode: string;
  onClose: () => void;
}

type ProofState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function SlipModal({ orderId, orderCode, onClose }: SlipModalProps) {
  const [state, setState] = useState<ProofState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    fetch(`/api/marketplace/admin/orders/${orderId}/payment-proof-url`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setState({ kind: "missing" });
          return;
        }
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; url?: string; error?: string }
          | null;
        if (!response.ok || !body?.ok || !body.url) {
          setState({
            kind: "error",
            message: body?.error ?? "Could not load the payment slip.",
          });
          return;
        }
        setState({ kind: "ready", url: body.url });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: "error", message: "Network error. Try again." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="mpa-overlay" onClick={onClose}>
      <div
        className="mpa-modal"
        style={{ maxWidth: 560 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mp-row" style={{ marginBottom: 16 }}>
          <div className="mp-stack" style={{ gap: 2 }}>
            <h2 className="mp-h2" style={{ fontSize: 18 }}>
              Payment slip
            </h2>
            <span className="mp-small mp-mute mp-mono">{orderCode.slice(0, 8)}</span>
          </div>
          <span className="mp-spacer" />
          <button
            type="button"
            className="mp-icon-btn"
            onClick={onClose}
            aria-label="Close payment slip"
          >
            <MpIcon name="x" size={15} />
          </button>
        </div>

        {state.kind === "loading" ? (
          <p className="mp-small mp-mute">Loading slip…</p>
        ) : null}

        {state.kind === "missing" ? (
          <p className="mp-alert mp-alert-gold mp-small">
            No proof on file. This order has no uploaded payment slip yet.
          </p>
        ) : null}

        {state.kind === "error" ? (
          <p className="mp-alert mp-alert-rose mp-small">{state.message}</p>
        ) : null}

        {state.kind === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.url}
            alt={`Payment slip for order ${orderCode.slice(0, 8)}`}
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid var(--mp-line)",
              display: "block",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
