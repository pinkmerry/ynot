"use client";

import { useState } from "react";
import type { MarketplacePaymentInstructions } from "@/lib/marketplace/payment-instructions";

export type MarketplacePaymentProofOrder = {
  pendingPaymentOrderId?: string;
  orderId?: string;
  paymentState?: string;
  fulfilmentState?: string;
  itemPriceSatang?: number;
  shippingFeeSatang?: number;
  buyerServiceFeeSatang?: number;
  buyerTotalSatang?: number;
  currency?: string;
};

type MarketplacePaymentProofClientProps = {
  order: MarketplacePaymentProofOrder;
  paymentInstructions: MarketplacePaymentInstructions;
  mockMode?: boolean;
  allowCancel?: boolean;
  onOrderChange?: (order: MarketplacePaymentProofOrder) => void;
  onReleased?: () => void;
};

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    order?: MarketplacePaymentProofOrder;
    proof?: {
      paymentState?: string;
      verificationStatus?: string;
      nextAction?: string;
    };
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Marketplace request failed.");
  }
  return body;
}

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function stateLabel(value: string | undefined) {
  return value ? value.replace(/_/g, " ") : "pending";
}

function paymentIsOpen(order: MarketplacePaymentProofOrder) {
  return (
    order.paymentState === "pending_payment" ||
    order.paymentState === "payment_submitted"
  );
}

export function MarketplacePaymentProofClient({
  order: initialOrder,
  paymentInstructions,
  mockMode = false,
  allowCancel = true,
  onOrderChange,
  onReleased,
}: MarketplacePaymentProofClientProps) {
  const [order, setOrder] = useState(initialOrder);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"proof" | "release" | null>(null);
  const canUpload = Boolean(order.pendingPaymentOrderId && paymentIsOpen(order));
  const total = Number(order.buyerTotalSatang ?? order.itemPriceSatang ?? 0);

  function updateOrder(nextOrder: MarketplacePaymentProofOrder) {
    setOrder(nextOrder);
    onOrderChange?.(nextOrder);
  }

  async function uploadProof() {
    if (!order.pendingPaymentOrderId || !proofFile) return;
    setBusy("proof");
    setStatus(null);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const nextOrder = {
          ...order,
          paymentState: "payment_submitted",
        };
        updateOrder(nextOrder);
        setStatus("Mock slip uploaded. Admin review is now waiting.");
        return;
      }

      const form = new FormData();
      form.set("paymentProof", proofFile);
      const response = await fetch(
        `/api/marketplace/checkout/pending-orders/${order.pendingPaymentOrderId}/payment-proof`,
        {
          method: "POST",
          headers: {
            "idempotency-key": nextIdempotencyKey("proof"),
          },
          body: form,
        },
      );
      const body = await parseJson(response);
      const nextOrder = {
        ...order,
        paymentState: body?.proof?.paymentState ?? order.paymentState,
      };
      updateOrder(nextOrder);
      setProofFile(null);
      setStatus(
        body?.proof?.verificationStatus
          ? `Slip ${body.proof.verificationStatus}.`
          : "Slip uploaded.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function releaseOrder() {
    if (!order.pendingPaymentOrderId) return;
    setBusy("release");
    setStatus(null);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        setProofFile(null);
        setStatus("Mock order cancelled.");
        onReleased?.();
        return;
      }

      const response = await fetch(
        `/api/marketplace/checkout/pending-orders/${order.pendingPaymentOrderId}/release`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("release"),
          },
          body: JSON.stringify({ releaseReason: "buyer_cancelled" }),
        },
      );
      await parseJson(response);
      setProofFile(null);
      setStatus("Order cancelled.");
      onReleased?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cancel failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="marketplace-payment-proof-panel">
      <dl className="marketplace-checkout-summary">
        <div>
          <dt>Item</dt>
          <dd>{thb(Number(order.itemPriceSatang ?? 0))}</dd>
        </div>
        <div>
          <dt>Service fee</dt>
          <dd>
            {typeof order.buyerServiceFeeSatang === "number"
              ? thb(order.buyerServiceFeeSatang)
              : "Awaiting quote"}
          </dd>
        </div>
        <div>
          <dt>Shipping</dt>
          <dd>
            {typeof order.shippingFeeSatang === "number"
              ? thb(order.shippingFeeSatang)
              : "Awaiting quote"}
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{total > 0 ? thb(total) : "Awaiting quote"}</dd>
        </div>
      </dl>

      <div className="marketplace-bank-transfer-panel">
        <span className="marketplace-card-eyebrow">Bank transfer only</span>
        <h3>Transfer {total > 0 ? thb(total) : "the exact total"}</h3>
        <dl>
          <div>
            <dt>Bank</dt>
            <dd>{paymentInstructions.bankName ?? "YNOT receiving bank"}</dd>
          </div>
          <div>
            <dt>Account name</dt>
            <dd>{paymentInstructions.accountName ?? "YNOT"}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>{paymentInstructions.accountNumber ?? "Contact support"}</dd>
          </div>
          {paymentInstructions.promptPayId ? (
            <div>
              <dt>PromptPay</dt>
              <dd>{paymentInstructions.promptPayId}</dd>
            </div>
          ) : null}
        </dl>
        <p>
          Upload one transfer slip image after paying. YNOT checks the receiver,
          total amount, duplicate slip status, and payment time before shipment.
        </p>
        {!paymentInstructions.receiverConfigured ? (
          <p className="marketplace-checkout-status">
            Payment receiver is not configured. Contact support before transfer.
          </p>
        ) : null}
      </div>

      <div className="marketplace-order-states">
        <span className="status-pill ready">
          Payment {stateLabel(order.paymentState)}
        </span>
        <span className="status-pill">
          Fulfilment {stateLabel(order.fulfilmentState)}
        </span>
      </div>

      {canUpload ? (
        <div className="marketplace-proof-upload">
          <label>
            <span>Transfer slip image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setProofFile(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!proofFile || busy === "proof"}
            onClick={uploadProof}
          >
            {busy === "proof" ? "Uploading slip..." : "Upload slip"}
          </button>
          {allowCancel ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy === "release"}
              onClick={releaseOrder}
            >
              {busy === "release" ? "Cancelling..." : "Cancel order"}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="marketplace-checkout-status">
          Slip upload is closed for this order state.
        </p>
      )}
      {status ? <p className="marketplace-checkout-status">{status}</p> : null}
    </section>
  );
}
