"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MarketplaceMoneyPolicy } from "@/lib/marketplace/types";

type MarketplaceMoneyPolicyControlsProps = {
  policy: MarketplaceMoneyPolicy;
};

function nextIdempotencyKey() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:money-policy:${suffix}`;
}

function bpsToPercent(value: number) {
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

function percentToBps(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
    return null;
  }
  return Math.round(numberValue * 100);
}

function thbToSatang(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 10_000) {
    return null;
  }
  return Math.round(numberValue * 100);
}

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Marketplace policy update failed.");
  }
  return body;
}

export function MarketplaceMoneyPolicyControls({
  policy,
}: MarketplaceMoneyPolicyControlsProps) {
  const router = useRouter();
  const [sellerFeePercent, setSellerFeePercent] = useState(
    bpsToPercent(policy.sellerFeeBps),
  );
  const [buyerFeePercent, setBuyerFeePercent] = useState(
    bpsToPercent(policy.buyerServiceFeeBps),
  );
  const [shippingThb, setShippingThb] = useState(
    String(policy.shippingFeeSatang / 100),
  );
  const [adminNote, setAdminNote] = useState(policy.adminNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const sellerFeeBps = percentToBps(sellerFeePercent);
    const buyerServiceFeeBps = percentToBps(buyerFeePercent);
    const shippingFeeSatang = thbToSatang(shippingThb);

    if (
      sellerFeeBps === null ||
      buyerServiceFeeBps === null ||
      shippingFeeSatang === null
    ) {
      setMessage("Policy values are invalid.");
      return;
    }

    setIsSaving(true);
    try {
      await parseJson(
        await fetch("/api/marketplace/admin/money-policy", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey(),
          },
          body: JSON.stringify({
            sellerFeeBps,
            buyerServiceFeeBps,
            shippingFeeSatang,
            adminNote,
            expectedPolicyId: policy.policyId,
          }),
        }),
      );
      setMessage("Marketplace policy updated.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Marketplace policy update failed.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="marketplace-policy-form" onSubmit={submit}>
      <div className="marketplace-policy-grid">
        <label>
          <span>Seller fee %</span>
          <input
            inputMode="decimal"
            value={sellerFeePercent}
            onChange={(event) => setSellerFeePercent(event.currentTarget.value)}
            required
          />
        </label>
        <label>
          <span>Buyer fee %</span>
          <input
            inputMode="decimal"
            value={buyerFeePercent}
            onChange={(event) => setBuyerFeePercent(event.currentTarget.value)}
            required
          />
        </label>
        <label>
          <span>Shipping THB</span>
          <input
            inputMode="decimal"
            value={shippingThb}
            onChange={(event) => setShippingThb(event.currentTarget.value)}
            required
          />
        </label>
      </div>
      <label className="marketplace-policy-note">
        <span>Admin note</span>
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.currentTarget.value)}
          maxLength={1000}
          rows={2}
        />
      </label>
      <div className="marketplace-policy-actions">
        <span className="muted">
          Policy {policy.policyId ? policy.policyId.slice(0, 8) : "fallback"}
        </span>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save policy"}
        </button>
      </div>
      {message ? <p className="marketplace-checkout-status">{message}</p> : null}
    </form>
  );
}
