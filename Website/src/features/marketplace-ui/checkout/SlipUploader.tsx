"use client";

import { useRef, useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";

/**
 * Slip upload + verify UI, ported from ProtoCheckout's payment card
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-2.jsx:320-377):
 * drop zone -> preview thumbnail + Verify/Replace -> checking spinner ->
 * verified/failed result panel.
 *
 * Deliberately NOT ported: the prototype's synthetic canvas-drawn demo-slip
 * helper and its setTimeout-based fake verification in ProtoCheckout.verify().
 * This component performs exactly ONE real network call: a multipart POST to
 * the real payment-proof route
 * (POST /api/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof,
 * backed by src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts).
 * That route reads the file under form field "paymentProof" (with "slip" as
 * a same-route fallback — see getPaymentProofFile there); we always send
 * "paymentProof" to match MarketplacePaymentProofClient's existing behavior.
 *
 * Client-side accept/size guard mirrors the server's real limits:
 * allowedSlipTypes (image/jpeg, image/png, image/webp) and maxSlipBytes
 * (10 MB) from src/lib/uploads/magic-bytes.ts. The server re-verifies magic
 * bytes independently — this is a UX guard, not the security boundary.
 *
 * Duplicate/mismatch handling: the route does NOT fail the HTTP request for
 * a duplicate or amount-mismatch slip — it returns ok:true with
 * proof.verificationStatus set to "duplicate" | "amount_mismatch" | ... (see
 * PAYMENT_VERIFICATION_STATUSES in src/lib/marketplace/orders.ts). Only
 * actual request errors (missing file, bad content-type, size limit, expired
 * order, etc.) come back as a non-ok response with { error, code }. We treat
 * "valid" as success, "duplicate" and any other non-"valid" status as the
 * failure branch that still renders the server's own message/reference
 * fields rather than inventing new copy.
 */

const ACCEPTED_SLIP_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SLIP_BYTES = 10 * 1024 * 1024;

export interface SlipUploaderPendingOrder {
  pendingPaymentOrderId: string;
  buyerTotalSatang: number;
}

export interface SlipUploadProofResult {
  ok: boolean;
  verificationStatus?: string;
  providerCode?: string | null;
  providerMessage?: string | null;
  referenceId?: string | null;
  errorMessage?: string;
  errorCode?: string;
}

interface SlipUploaderProps {
  order: SlipUploaderPendingOrder;
  onVerified: (result: SlipUploadProofResult) => void;
  onManualReview: (result: SlipUploadProofResult) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}

type UploaderPhase = "idle" | "checking" | "verified" | "failed";

function nextIdempotencyKey() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:proof:${suffix}`;
}

function fileSizeLabel(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SlipUploader({ order, onVerified, onManualReview, toast }: SlipUploaderProps) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploaderPhase>("idle");
  const [result, setResult] = useState<SlipUploadProofResult | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function resetSlip() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setFile(null);
    setPhase("idle");
    setResult(null);
    setPickError(null);
  }

  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    if (!ACCEPTED_SLIP_TYPES.includes(candidate.type)) {
      setPickError("Upload a JPG, PNG, or WEBP image of your transfer slip.");
      return;
    }
    if (candidate.size > MAX_SLIP_BYTES) {
      setPickError(`That file is ${fileSizeLabel(candidate.size)} — the limit is 10 MB.`);
      return;
    }
    setPickError(null);
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(candidate), name: candidate.name });
    setFile(candidate);
    setPhase("idle");
    setResult(null);
  }

  async function submitSlip() {
    if (!file) return;
    setPhase("checking");
    try {
      const form = new FormData();
      form.set("paymentProof", file);
      const response = await fetch(
        `/api/marketplace/checkout/pending-orders/${order.pendingPaymentOrderId}/payment-proof`,
        {
          method: "POST",
          headers: {
            "idempotency-key": nextIdempotencyKey(),
          },
          body: form,
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        proof?: {
          verificationStatus?: string;
          providerCode?: string | null;
          providerMessage?: string | null;
          referenceId?: string | null;
        };
      } | null;

      if (!response.ok) {
        const failure: SlipUploadProofResult = {
          ok: false,
          errorMessage: body?.error ?? "Slip upload failed.",
          errorCode: body?.code,
        };
        setPhase("failed");
        setResult(failure);
        return;
      }

      const verificationStatus = body?.proof?.verificationStatus ?? "manual_review";
      const outcome: SlipUploadProofResult = {
        ok: verificationStatus === "valid",
        verificationStatus,
        providerCode: body?.proof?.providerCode,
        providerMessage: body?.proof?.providerMessage,
        referenceId: body?.proof?.referenceId,
      };

      if (outcome.ok) {
        setPhase("verified");
        setResult(outcome);
        toast("Payment verified", "success");
        onVerified(outcome);
        return;
      }

      setPhase("failed");
      setResult(outcome);
    } catch {
      setPhase("failed");
      setResult({ ok: false, errorMessage: "Slip upload failed. Check your connection and try again." });
    }
  }

  return (
    <div className="mp-panel">
      <div className="mp-row" style={{ marginBottom: 12 }}>
        <span className="mp-eyebrow">Upload transfer slip</span>
        <span className="mp-spacer" />
        <span className="mp-small mp-mute mp-mono">Slip2Go verified</span>
      </div>

      {!preview ? (
        <div className="mp-stack" style={{ gap: 8 }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptFile(event.dataTransfer.files?.[0]);
            }}
            style={{
              border: "1.5px dashed var(--mp-line-strong)",
              borderRadius: 14,
              padding: "22px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--mp-bg-soft)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--mp-paper)",
                border: "1px solid var(--mp-line-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--mp-mute)",
              }}
            >
              <MpIcon name="plus" size={18} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Upload your transfer slip</span>
            <span className="mp-small mp-mute">JPG, PNG or WEBP · up to 10 MB</span>
          </div>
          {pickError ? (
            <span className="mp-small" style={{ color: "var(--mp-rose)" }}>
              {pickError}
            </span>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
          />
        </div>
      ) : (
        <div className="mp-row" style={{ gap: 14, alignItems: "flex-start" }}>
          <div
            style={{
              width: 84,
              height: 112,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--mp-line)",
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="Transfer slip preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div className="mp-stack" style={{ gap: 10, flex: 1 }}>
            <span className="mp-small" style={{ fontWeight: 700 }}>
              {preview.name}
            </span>

            {phase === "idle" ? (
              <div className="mp-row">
                <MpBtn variant="primary" onClick={submitSlip}>
                  <MpIcon name="shield" size={13} /> Verify slip
                </MpBtn>
                <MpBtn onClick={resetSlip}>Replace</MpBtn>
              </div>
            ) : null}

            {phase === "checking" ? (
              <div className="mp-alert mp-alert-gold" style={{ alignItems: "center" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 15,
                    height: 15,
                    border: "2px solid var(--mp-gold-ink)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "mpSpin .7s linear infinite",
                    flexShrink: 0,
                  }}
                />
                <span>Contacting Slip2Go... reading bank, amount, and transfer reference from your slip.</span>
              </div>
            ) : null}

            {phase === "verified" && result ? (
              <div className="mp-stack" style={{ gap: 10 }}>
                <div className="mp-alert mp-alert-green">
                  <MpIcon name="check" size={15} />
                  <span>
                    <b>Payment verified.</b>{" "}
                    {result.providerMessage ?? "Transfer matched your order total."}
                  </span>
                </div>
                <dl className="mp-spec" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <div className="k">Reference</div>
                    <div className="v">{result.referenceId ?? "-"}</div>
                  </div>
                  <div>
                    <div className="k">Amount</div>
                    <div className="v">{formatThb(order.buyerTotalSatang)}</div>
                  </div>
                </dl>
              </div>
            ) : null}

            {phase === "failed" && result ? (
              <div className="mp-stack" style={{ gap: 10 }}>
                <div className="mp-alert mp-alert-rose">
                  <MpIcon name="x" size={15} />
                  <span>
                    <b>Verification failed.</b>{" "}
                    {result.providerMessage ?? result.errorMessage ?? "This slip could not be verified."}
                  </span>
                </div>
                <div className="mp-row">
                  <MpBtn variant="primary" onClick={resetSlip}>
                    Upload a different slip
                  </MpBtn>
                  <MpBtn onClick={() => onManualReview(result)}>Keep for manual review</MpBtn>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
