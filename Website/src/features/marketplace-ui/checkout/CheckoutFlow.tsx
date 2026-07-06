"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MpBadge,
  MpBtn,
  MpChip,
  MpPanel,
  MpSteps,
  MpToasts,
  useToasts,
  type MpStep,
} from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import type { SlipUploadProofResult } from "./SlipUploader";
import type { MarketplacePaymentInstructions } from "@/lib/marketplace/types";

/**
 * Marketplace checkout state machine — visual redesign of
 * MarketplaceCheckoutClient + MarketplacePaymentProofClient
 * (src/features/ynot/MarketplaceCheckoutClient.tsx,
 * src/features/ynot/MarketplacePaymentProofClient.tsx), styled after
 * ProtoCheckout (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-2.jsx:198-400).
 *
 * Step order follows the REAL contract, not the prototype's: the pending
 * payment order (server-computed totals + listing lock) is created FIRST via
 * POST /api/marketplace/checkout/pending-orders, THEN the buyer transfers and
 * uploads a slip. The prototype verifies a fake slip BEFORE "Place order" —
 * that ordering is not reproduced here.
 *
 * Ship-only: unlike ProtoCheckout's two-way delivery chooser (stay-in-account
 * vs. ship), this renders exactly one delivery block — the confirmed shipping
 * address plus the server-quoted shipping fee once the pending order
 * responds. There is no alternate non-shipping delivery option.
 *
 * All totals are server values. item/shipping/service-fee/total always come
 * from the pending-order response (PendingOrderResponse below) — nothing is
 * computed or guessed client-side. Payment instructions (bank name, account
 * name/number, PromptPay id) are passed in as a prop sourced from
 * getMarketplacePaymentInstructions() (src/lib/marketplace/payment-instructions.ts),
 * which reads real env vars — never hardcoded here.
 */

const SlipUploader = dynamic(
  () => import("./SlipUploader").then((mod) => ({ default: mod.SlipUploader })),
  { ssr: false },
);

export interface CheckoutFlowListing {
  listingId: string;
  title: string;
  photoUrl: string | null;
  itemPriceSatang: number;
  gradeLabel: string;
  isOfficial: boolean;
  listingSource: "official_shop" | "user_seller";
}

export interface CheckoutFlowAddress {
  id: string;
  label: string | null;
  recipientName: string;
  summary: string;
  deliveryNote: string | null;
}

interface PendingOrderResponse {
  pendingPaymentOrderId?: string;
  orderId?: string;
  paymentState?: string;
  fulfilmentState?: string;
  itemPriceSatang?: number;
  shippingFeeSatang?: number;
  buyerServiceFeeSatang?: number;
  buyerTotalSatang?: number;
  currency?: string;
}

export interface CheckoutFlowProps {
  listing: CheckoutFlowListing;
  checkoutEndpoint: string;
  shippingAddresses: CheckoutFlowAddress[];
  paymentInstructions: MarketplacePaymentInstructions;
}

type FlowStep = "review" | "pay" | "slip" | "done";

const EXPIRY_ERROR_CODES = new Set([
  "marketplace_pending_order_expired",
  "marketplace_payment_state_invalid",
]);

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
    code?: string;
    order?: PendingOrderResponse;
  } | null;
  if (!response.ok) {
    const message = body?.error ?? "Marketplace request failed.";
    const error = new Error(message) as Error & { code?: string };
    error.code = body?.code;
    throw error;
  }
  return body;
}

function stepList(step: FlowStep): MpStep[] {
  const paid = step === "slip" || step === "done";
  return [
    { label: "Review", n: 1, status: "done" },
    { label: "Pay by transfer", n: 2, status: paid ? "done" : step === "pay" ? "now" : undefined },
    { label: "Order placed", n: 3, status: step === "done" ? "done" : paid ? "now" : undefined },
  ];
}

export function CheckoutFlow({
  listing,
  checkoutEndpoint,
  shippingAddresses,
  paymentInstructions,
}: CheckoutFlowProps) {
  const router = useRouter();
  const { toasts, toast } = useToasts();
  const [step, setStep] = useState<FlowStep>("review");
  const [selectedAddressId, setSelectedAddressId] = useState(shippingAddresses[0]?.id ?? "");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [order, setOrder] = useState<PendingOrderResponse | null>(null);
  const [busy, setBusy] = useState<"create" | "release" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualReviewNote, setManualReviewNote] = useState<SlipUploadProofResult | null>(null);

  const selectedAddress = useMemo(
    () => shippingAddresses.find((address) => address.id === selectedAddressId),
    [shippingAddresses, selectedAddressId],
  );

  const total = Number(order?.buyerTotalSatang ?? 0);
  const isUserSellerCheckout = listing.listingSource === "user_seller";

  async function createPendingOrder() {
    if (!selectedAddress || !addressConfirmed) return;
    setBusy("create");
    setErrorMessage(null);
    try {
      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey(
            isUserSellerCheckout ? "checkout:user-seller" : "checkout:official",
          ),
        },
        body: JSON.stringify({
          listingId: listing.listingId,
          shippingAddressId: selectedAddress.id,
          addressConfirmed,
        }),
      });
      const body = await parseJson(response);
      setOrder(body?.order ?? null);
      setStep("pay");
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      const message = error instanceof Error ? error.message : "Checkout failed.";
      if (code && EXPIRY_ERROR_CODES.has(code)) {
        toast(message, "error");
        setStep("review");
        setOrder(null);
        return;
      }
      setErrorMessage(message);
      toast(message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function releaseOrder() {
    if (!order?.pendingPaymentOrderId) return;
    setBusy("release");
    try {
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
      toast("Order cancelled", "info");
      setOrder(null);
      setStep("review");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cancel failed.";
      toast(message, "error");
    } finally {
      setBusy(null);
    }
  }

  function copyAccountNumber(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => undefined);
    }
    toast("Copied", "success");
  }

  function handleSlipVerified() {
    setStep("done");
    if (order?.orderId) router.push(`/marketplace/orders/${order.orderId}`);
  }

  function handleManualReview(result: SlipUploadProofResult) {
    setManualReviewNote(result);
    setStep("done");
    if (order?.orderId) router.push(`/marketplace/orders/${order.orderId}`);
  }

  return (
    <div className="mp-stack" style={{ gap: 20 }}>
      <MpSteps steps={stepList(step)} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 22, alignItems: "start" }}>
        <div className="mp-stack" style={{ gap: 16 }}>
          {/* item snapshot */}
          <MpPanel>
            <div className="mp-row" style={{ gap: 16 }}>
              <div
                style={{
                  width: 92,
                  borderRadius: 10,
                  border: "1px solid var(--mp-line)",
                  aspectRatio: "3/4",
                  flexShrink: 0,
                  backgroundImage: listing.photoUrl ? `url(${listing.photoUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  background: listing.photoUrl
                    ? undefined
                    : "repeating-linear-gradient(-45deg, #f1eee3 0 8px, #eceadf 8px 16px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!listing.photoUrl ? (
                  <span className="mp-mono" style={{ fontSize: 8.5, color: "var(--mp-mute-2)" }}>
                    [ card ]
                  </span>
                ) : null}
              </div>
              <div className="mp-stack" style={{ gap: 5, flex: 1 }}>
                <div className="mp-row" style={{ gap: 8 }}>
                  <MpBadge kind={listing.isOfficial ? "official" : "community"}>
                    {listing.isOfficial ? (
                      <>
                        <MpIcon name="shield" size={10} /> Official
                      </>
                    ) : (
                      "Community"
                    )}
                  </MpBadge>
                  <MpBadge kind="graded">{listing.gradeLabel}</MpBadge>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{listing.title}</span>
              </div>
              <span style={{ textAlign: "right", fontFamily: "var(--mp-mono)", fontWeight: 700 }}>
                {formatThb(listing.itemPriceSatang)}
              </span>
            </div>
          </MpPanel>

          {/* delivery — ship-only, single block, no alternate delivery chooser */}
          <div className="mp-stack" style={{ gap: 10 }}>
            <span className="mp-eyebrow">Delivery</span>
            {selectedAddress ? (
              <div className="mp-opt on">
                <span className="rad" />
                <div className="mp-stack" style={{ gap: 2 }}>
                  <span className="t">
                    <MpIcon name="truck" size={13} /> Ship to {selectedAddress.recipientName}
                  </span>
                  <span className="s">
                    {selectedAddress.summary}
                    {selectedAddress.deliveryNote ? ` · ${selectedAddress.deliveryNote}` : ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mp-alert mp-alert-rose">
                <MpIcon name="x" size={15} />
                <span>
                  Add a complete shipping address before checkout.{" "}
                  <Link href="/profile/personal-info" prefetch={false}>
                    Manage address
                  </Link>
                </span>
              </div>
            )}
            {shippingAddresses.length > 1 && step === "review" ? (
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
            ) : null}
            {step === "review" && selectedAddress ? (
              <label className="mp-row" style={{ gap: 8, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={addressConfirmed}
                  onChange={(event) => setAddressConfirmed(event.currentTarget.checked)}
                />
                <span>I confirm this shipping address for marketplace checkout.</span>
              </label>
            ) : null}
            <span className="mp-small mp-mute">
              {step === "review"
                ? "Shipping fee is quoted once the order is created."
                : "Shipping fee shown in the totals below."}
            </span>
          </div>

          {/* pay + slip */}
          {step === "pay" || step === "slip" || step === "done" ? (
            <MpPanel>
              <div className="mp-row" style={{ marginBottom: 12 }}>
                <span className="mp-eyebrow">Pay {formatThb(total)} by transfer</span>
                <span className="mp-spacer" />
                <span className="mp-small mp-mute mp-mono">checked by Slip2Go</span>
              </div>
              <div className="mp-row" style={{ gap: 10, marginBottom: 14 }}>
                <MpChip active>Bank transfer</MpChip>
                {paymentInstructions.promptPayId ? <MpChip>PromptPay</MpChip> : null}
              </div>
              <dl className="mp-spec" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
                <div>
                  <div className="k">Bank</div>
                  <div className="v">{paymentInstructions.bankName ?? "Contact support"}</div>
                </div>
                <div>
                  <div className="k">Account name</div>
                  <div className="v">{paymentInstructions.accountName ?? "YNOT"}</div>
                </div>
                <div
                  style={{ cursor: paymentInstructions.accountNumber ? "pointer" : undefined }}
                  onClick={() =>
                    paymentInstructions.accountNumber && copyAccountNumber(paymentInstructions.accountNumber)
                  }
                >
                  <div className="k">Account no. · tap to copy</div>
                  <div className="v">{paymentInstructions.accountNumber ?? "Contact support"}</div>
                </div>
              </dl>
              {paymentInstructions.promptPayId ? (
                <p className="mp-small mp-mute" style={{ marginBottom: 14 }}>
                  PromptPay ID <span className="mp-mono">{paymentInstructions.promptPayId}</span>
                </p>
              ) : null}
              {!paymentInstructions.receiverConfigured ? (
                <div className="mp-alert mp-alert-rose" style={{ marginBottom: 14 }}>
                  <MpIcon name="x" size={15} />
                  <span>Payment receiver is not configured. Contact support before transfer.</span>
                </div>
              ) : null}

              {step === "pay" ? (
                <MpBtn variant="primary" size="lg" onClick={() => setStep("slip")}>
                  I&apos;ve transferred — upload slip
                </MpBtn>
              ) : null}

              {(step === "slip" || step === "done") && order?.pendingPaymentOrderId ? (
                <SlipUploader
                  order={{
                    pendingPaymentOrderId: order.pendingPaymentOrderId,
                    buyerTotalSatang: total,
                  }}
                  onVerified={handleSlipVerified}
                  onManualReview={handleManualReview}
                  toast={toast}
                />
              ) : null}
            </MpPanel>
          ) : null}

          {step === "done" && manualReviewNote ? (
            <div className="mp-alert mp-alert-gold">
              <MpIcon name="shield" size={15} />
              <span>
                Your slip needs manual review. The order stays in review and our team will confirm it —
                no further action is needed from you.
              </span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mp-alert mp-alert-rose">
              <MpIcon name="x" size={15} />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>

        {/* summary */}
        <MpPanel className="mp-checkout-summary-panel">
          <span className="mp-eyebrow" style={{ marginBottom: 6 }}>
            Summary
          </span>
          <div className="mp-line-row">
            <span className="l">Card price</span>
            <span className="v">
              {formatThb(order?.itemPriceSatang ?? listing.itemPriceSatang)}
            </span>
          </div>
          <div className="mp-line-row">
            <span className="l">Service fee</span>
            <span className="v">
              {typeof order?.buyerServiceFeeSatang === "number"
                ? formatThb(order.buyerServiceFeeSatang)
                : "Quoted at order creation"}
            </span>
          </div>
          <div className="mp-line-row">
            <span className="l">Shipping</span>
            <span className="v">
              {typeof order?.shippingFeeSatang === "number"
                ? formatThb(order.shippingFeeSatang)
                : "Quoted at order creation"}
            </span>
          </div>
          <hr className="mp-hairline" style={{ margin: "8px 0" }} />
          <div className="mp-line-row total">
            <span className="l">Total</span>
            <span className="v">{order ? formatThb(total) : "—"}</span>
          </div>

          {step === "review" ? (
            <MpBtn
              variant="primary"
              size="lg"
              style={{ marginTop: 12 }}
              disabled={busy === "create" || !selectedAddress || !addressConfirmed}
              onClick={createPendingOrder}
            >
              {busy === "create" ? "Creating order..." : "Continue to payment"}
            </MpBtn>
          ) : null}

          {step === "pay" ? (
            <MpBtn
              size="lg"
              style={{ marginTop: 12 }}
              disabled={busy === "release"}
              onClick={releaseOrder}
            >
              {busy === "release" ? "Cancelling..." : "Cancel order"}
            </MpBtn>
          ) : null}

          {step === "review" ? (
            <Link href={`/marketplace/listings/${listing.listingId}`} className="mp-btn mp-btn-lg" prefetch={false}>
              Back
            </Link>
          ) : null}
        </MpPanel>
      </div>

      <MpToasts toasts={toasts} />
    </div>
  );
}
