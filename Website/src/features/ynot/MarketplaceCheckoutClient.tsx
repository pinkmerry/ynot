"use client";

import Link from "next/link";
import { useState } from "react";
import {
  MarketplacePaymentProofClient,
  type MarketplacePaymentProofOrder,
} from "./MarketplacePaymentProofClient";
import type { MarketplacePaymentInstructions } from "@/lib/marketplace/types";

type MarketplaceCheckoutClientProps = {
  listingId: string;
  checkoutEndpoint: string;
  listingSource: "official_shop" | "user_seller";
  checkoutEnabled: boolean;
  shippingAddresses: CheckoutAddress[];
  itemPriceSatang: number;
  paymentInstructions: MarketplacePaymentInstructions;
  mockMode?: boolean;
};

type CheckoutAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  summary: string;
  deliveryNote: string | null;
};

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    order?: MarketplacePaymentProofOrder;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Marketplace request failed.");
  }
  return body;
}

export function MarketplaceCheckoutClient({
  listingId,
  checkoutEndpoint,
  listingSource,
  checkoutEnabled,
  shippingAddresses,
  itemPriceSatang,
  paymentInstructions,
  mockMode = false,
}: MarketplaceCheckoutClientProps) {
  const [order, setOrder] = useState<MarketplacePaymentProofOrder | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState(
    shippingAddresses[0]?.id ?? "",
  );
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checkout" | null>(null);
  const isUserSellerCheckout =
    listingSource === "user_seller" || checkoutEndpoint.includes("user-seller");
  const selectedAddress = shippingAddresses.find(
    (address) => address.id === selectedAddressId,
  );

  async function createCheckout() {
    if (!checkoutEnabled || !selectedAddress || !addressConfirmed) return;
    setBusy("checkout");
    setStatus(null);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        setOrder({
          pendingPaymentOrderId: `mock-pending-${listingId.slice(0, 8)}`,
          orderId: `mock-order-${listingId.slice(0, 8)}`,
          paymentState: "pending_payment",
          fulfilmentState: "unfulfilled",
          itemPriceSatang,
          currency: "THB",
        });
        setStatus("Mock pending payment order created");
        return;
      }

      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey(
            isUserSellerCheckout ? "checkout:user-seller" : "checkout:official",
          ),
        },
        body: JSON.stringify({
          listingId,
          shippingAddressId: selectedAddress.id,
          addressConfirmed,
        }),
      });
      const body = await parseJson(response);
      setOrder(body?.order ?? null);
      setStatus(
        isUserSellerCheckout
          ? "Seller consignment pending payment"
          : "Official shop pending payment",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="marketplace-checkout-panel">
      {!order ? (
        <>
          <div className="marketplace-shipping-confirm">
            <strong>{mockMode ? "Mock ship to" : "Ship to"}</strong>
            {shippingAddresses.length ? (
              <>
                <select
                  value={selectedAddressId}
                  onChange={(event) => {
                    setSelectedAddressId(event.currentTarget.value);
                    setAddressConfirmed(false);
                  }}
                  aria-label="Marketplace shipping address"
                >
                  {shippingAddresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label ?? "Saved address"} - {address.recipientName}
                    </option>
                  ))}
                </select>
                {selectedAddress ? (
                  <p>
                    {selectedAddress.summary}
                    {selectedAddress.deliveryNote
                      ? ` · ${selectedAddress.deliveryNote}`
                      : ""}
                  </p>
                ) : null}
                <label className="marketplace-address-check">
                  <input
                    type="checkbox"
                    checked={addressConfirmed}
                    onChange={(event) =>
                      setAddressConfirmed(event.currentTarget.checked)
                    }
                  />
                  <span>I confirm this shipping address for marketplace checkout.</span>
                </label>
              </>
            ) : (
              <p>
                Add a complete shipping address before checkout.{" "}
                <Link href="/profile/personal-info" prefetch={false}>
                  Manage address
                </Link>
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy === "checkout" ||
              !checkoutEnabled ||
              !selectedAddress ||
              !addressConfirmed
            }
            onClick={createCheckout}
          >
            {busy === "checkout"
              ? "Creating..."
              : mockMode
                ? "Mock checkout"
                : checkoutEnabled
                ? "Checkout"
                : "Checkout unavailable"}
          </button>
        </>
      ) : (
        <MarketplacePaymentProofClient
          order={order}
          paymentInstructions={paymentInstructions}
          mockMode={mockMode}
          onOrderChange={setOrder}
          onReleased={() => setOrder(null)}
        />
      )}
      {status ? <p className="marketplace-checkout-status">{status}</p> : null}
    </section>
  );
}
