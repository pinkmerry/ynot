"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type {
  YnotPaymentMethod,
  YnotTopUp,
  YnotWallet,
} from "../types";
import { topUpPackages } from "../top-up-packages";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { PageHead, useToast } from "./UiKit";

type Step = 1 | 2 | 3;
type HistoryFilter = "all" | "approved" | "pending" | "rejected";
type HistoryGroup = Exclude<HistoryFilter, "all">;
const maxCustomTopUpThb = 20_000;

type TopUpEntry = {
  id: string;
  group: HistoryGroup;
  kind: "in" | "out";
  label: string;
  sub: string;
  coins: number;
  when: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function statusLabel(status: YnotTopUp["status"]): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending_review":
      return "Pending review";
    case "pending_slip":
      return "Pending slip";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function topUpHistoryGroup(status: YnotTopUp["status"]): HistoryGroup {
  if (status === "approved") return "approved";
  if (status === "rejected" || status === "cancelled" || status === "expired") {
    return "rejected";
  }
  return "pending";
}

function topUpToEntry(topUp: YnotTopUp): TopUpEntry {
  const group = topUpHistoryGroup(topUp.status);
  const approved = group === "approved";
  const rejected = group === "rejected";
  return {
    id: topUp.id,
    group,
    kind: approved ? "in" : "out",
    label: approved
      ? `Top-up · ${topUp.paymentMethod?.displayName ?? "manual"}`
      : rejected
        ? `Rejected top-up · ${topUp.paymentMethod?.displayName ?? "manual"}`
      : `Pending top-up · ${topUp.paymentMethod?.displayName ?? "manual"}`,
    sub: `฿${formatCoins(topUp.amountThb)} · ${statusLabel(topUp.status)}${
      topUp.publicCode ? ` · ${topUp.publicCode}` : ""
    }`,
    coins: approved ? topUp.coinAmount : -topUp.amountThb,
    when: new Date(topUp.createdAt).toLocaleString(),
  };
}

export type WalletExperienceProps = {
  wallet: YnotWallet;
  paymentMethods: YnotPaymentMethod[];
  topUps: YnotTopUp[];
};

export function WalletExperience({
  wallet,
  paymentMethods,
  topUps,
}: WalletExperienceProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [pickedPackageIdx, setPickedPackageIdx] = useState<number>(1);
  const [customMode, setCustomMode] = useState(false);
  const [customThb, setCustomThb] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>(
    paymentMethods[0]?.id ?? "",
  );
  const [slip, setSlip] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [submitting, startSubmit] = useTransition();

  const picked = topUpPackages[pickedPackageIdx] ?? topUpPackages[0];
  const customThbNum = Math.min(
    maxCustomTopUpThb,
    Math.max(0, Number(customThb) || 0),
  );
  const buyThb = customMode ? customThbNum : picked.amountThb;
  const buyCoins = customMode ? customThbNum : picked.coins;
  const ready = buyThb > 0 && buyCoins > 0 && !!paymentMethodId;
  const selectedMethod =
    paymentMethods.find((m) => m.id === paymentMethodId) ??
    paymentMethods[0] ??
    null;

  const historyEntries = useMemo(() => {
    const entries = topUps.map(topUpToEntry);
    return entries.filter((entry) =>
      historyFilter === "all" ? true : entry.group === historyFilter,
    );
  }, [historyFilter, topUps]);

  function submit() {
    if (!ready) {
      toast("error", "Pick a coin amount and payment method first.");
      return;
    }
    if (!slip) {
      toast("error", "Upload your bank or QR transfer slip first.");
      return;
    }
    if (!selectedMethod) {
      toast("error", "Choose a payment method first.");
      return;
    }
    startSubmit(async () => {
      try {
        const form = new FormData();
        form.set("paymentMethodId", selectedMethod.id);
        form.set("customerNote", note);
        if (customMode) {
          form.set("customAmountThb", String(buyThb));
        } else {
          form.set("packageId", picked.id);
        }
        form.set("slip", slip);
        const response = await fetch("/api/ynot/wallet", {
          method: "POST",
          body: form,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const errMsg = isRecord(payload)
            ? stringValue(payload.error) || "Top-up request failed."
            : "Top-up request failed.";
          throw new Error(errMsg);
        }
        const publicCode =
          isRecord(payload) && isRecord(payload.topUp)
            ? stringValue(payload.topUp.publicCode)
            : "";
        const topUpStatus =
          isRecord(payload) && isRecord(payload.topUp)
            ? stringValue(payload.topUp.status)
            : "";
        const autoApproved =
          (isRecord(payload) && payload.autoApproved === true) ||
          topUpStatus === "approved";
        const autoRejected =
          (isRecord(payload) && payload.autoRejected === true) ||
          topUpStatus === "rejected";
        toast(
          autoRejected ? "error" : "success",
          autoApproved
            ? publicCode
              ? `Top-up ${publicCode} approved. Coins credited.`
              : "Top-up approved. Coins credited."
            : autoRejected
              ? publicCode
                ? `Top-up ${publicCode} rejected. Slip did not pass verification.`
                : "Top-up rejected. Slip did not pass verification."
            : publicCode
              ? `Top-up ${publicCode} submitted for review`
              : "Top-up submitted for review",
        );
        setSlip(null);
        setStep(1);
        // Soft refresh — the new pending record will appear on next paint.
        window.location.assign("/wallet");
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Top-up request failed.",
        );
      }
    });
  }

  return (
    <div className="cr-page">
      <PageHead
        eyebrow="Wallet"
        title="Top up"
        lead="Pick how many coins you want, then pay. We verify the slip and credit your wallet after it passes."
      />

      <div className="cr-wallet-grid">
        <div className="cr-stack" style={{ gap: 16 }}>
          <div className="cr-balance-card">
            <span className="cr-balance-eyebrow">Current balance</span>
            <div className="cr-balance-num">
              <CoinPip size={28} />
              {formatCoins(wallet.balanceCoins)}
              <small>coins</small>
            </div>
            <div
              className="cr-row"
              style={{
                gap: 16,
                marginTop: 6,
                color: "var(--cr-mute)",
                fontSize: 12.5,
              }}
            >
              <span>
                ≈{" "}
                <strong
                  className="cr-tnum"
                  style={{ color: "var(--cr-ink)" }}
                >
                  {Math.floor(wallet.balanceCoins / 320)}
                </strong>{" "}
                mid-tier packs
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={() => {
                  setStep(1);
                  setCustomMode(false);
                  setPickedPackageIdx(1);
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                <Ico name="plus" size={14} /> Top up
              </button>
              <Link href="/profile" className="cr-btn">
                <Ico name="swap" size={14} /> Convert cards to coins
              </Link>
            </div>
          </div>

          <div className="cr-section">
            <div className="cr-section-head">
              <div className="cr-stack" style={{ gap: 2 }}>
                <span className="cr-eyebrow">History</span>
                <h3>Recent top-up requests</h3>
              </div>
              <div className="cr-row" style={{ gap: 4 }}>
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "approved", label: "Approved" },
                    { id: "pending", label: "Pending" },
                    { id: "rejected", label: "Rejected" },
                  ] as { id: HistoryFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`cr-btn cr-btn-sm ${
                      historyFilter === f.id ? "cr-btn-primary" : "cr-btn-ghost"
                    }`}
                    onClick={() => setHistoryFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {historyEntries.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--cr-mute)",
                    fontSize: 13,
                  }}
                >
                  No top-up requests match this filter.
                </div>
              ) : (
                historyEntries.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="cr-tx-row">
                    <span className={`cr-tx-ico ${entry.kind}`}>
                      <Ico
                        name={
                          entry.kind === "in" ? "arrow-down" : "arrow-up"
                        }
                        size={14}
                      />
                    </span>
                    <div className="cr-tx-meta">
                      <strong>{entry.label}</strong>
                      <small>{entry.sub}</small>
                    </div>
                    <span
                      className="cr-mute"
                      style={{ fontSize: 11.5, whiteSpace: "nowrap" }}
                    >
                      {entry.when}
                    </span>
                    <span className={`cr-tx-amount ${entry.kind}`}>
                      {entry.kind === "in" ? "+" : ""}
                      {formatCoins(Math.abs(entry.coins))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="cr-section cr-wallet-topup-card">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow">Top up</span>
              <h3>Step {step} of 3</h3>
            </div>
            <button
              type="button"
              className="cr-btn cr-btn-ghost cr-btn-sm"
              onClick={() => setStep(1)}
              disabled={step === 1}
            >
              <Ico name="chev-l" size={12} /> Restart
            </button>
          </div>

          <div className="cr-wallet-stepper-wrap">
            <div className="cr-wallet-stepper">
              {[
                { n: 1, label: "Coins" },
                { n: 2, label: "Payment" },
                { n: 3, label: "Confirm" },
              ].map((sx, i) => (
                <div key={sx.n} className="cr-wallet-step">
                  <span
                    className="cr-wallet-step-dot"
                    style={{
                      background:
                        step >= sx.n
                          ? "var(--cr-ink)"
                          : "var(--cr-line-soft)",
                      color: step >= sx.n ? "#fff" : "var(--cr-mute)",
                    }}
                  >
                    {step > sx.n ? <Ico name="check" size={12} /> : sx.n}
                  </span>
                  <strong
                    className="cr-wallet-step-label"
                    style={{
                      color: step >= sx.n ? "var(--cr-ink)" : "var(--cr-mute)",
                    }}
                  >
                    {sx.label}
                  </strong>
                  {i < 2 && (
                    <span
                      className="cr-wallet-step-line"
                      style={{
                        background:
                          step > sx.n ? "var(--cr-ink)" : "var(--cr-line)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="cr-section-body" style={{ paddingTop: 18 }}>
            {step === 1 && (
              <div className="cr-stack" style={{ gap: 16 }}>
                <span className="cr-eyebrow">Pick how many coins</span>
                <div className="cr-wallet-package-grid">
                  {topUpPackages.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`cr-pkg ${
                        !customMode && pickedPackageIdx === i ? "active" : ""
                      }`}
                      onClick={() => {
                        setPickedPackageIdx(i);
                        setCustomMode(false);
                      }}
                    >
                      <div className="coins">
                        <CoinPip size={18} />
                        <span>{formatCoins(p.coins)}</span>
                      </div>
                      <div className="price">฿{formatCoins(p.amountThb)}</div>
                    </button>
                  ))}
                  <div
                    className={`cr-pkg custom cr-wallet-custom-pkg ${
                      customMode ? "active" : ""
                    }`}
                    onClick={() => setCustomMode(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setCustomMode(true);
                    }}
                  >
                    <span className="cr-eyebrow">Custom amount</span>
                    <div
                      className="cr-row cr-wallet-custom-input-row"
                      style={{ gap: 8, marginTop: 4 }}
                    >
                      <span
                        style={{ fontWeight: 700, color: "var(--cr-mute)" }}
                      >
                        ฿
                      </span>
                      <input
                        value={customThb}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "");
                          const amount = Math.min(
                            maxCustomTopUpThb,
                            Number(digits) || 0,
                          );
                          setCustomThb(amount ? String(amount) : "");
                        }}
                        onFocus={() => setCustomMode(true)}
                        placeholder="Enter amount"
                        style={{
                          flex: 1,
                          border: 0,
                          background: "transparent",
                          outline: "none",
                          fontSize: 22,
                          fontWeight: 800,
                          fontFamily: "inherit",
                          color: "var(--cr-ink)",
                        }}
                        aria-label="Custom top-up amount in THB"
                        inputMode="numeric"
                      />
                      {customThbNum > 0 && (
                        <span
                          className="cr-row"
                          style={{
                            gap: 6,
                            color: "var(--cr-coin-ink)",
                            fontWeight: 700,
                          }}
                        >
                          <CoinPip size={14} /> {formatCoins(customThbNum)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <small className="cr-mute">
                  1 THB = 1 coin. No bonus coins are added.
                </small>

                <div
                  style={{
                    background: "var(--cr-bg-soft)",
                    border: "1px solid var(--cr-line)",
                    padding: "14px 18px",
                    borderRadius: "var(--cr-r-md)",
                  }}
                >
                  <div
                    className="cr-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      You pay
                    </span>
                    <strong className="cr-tnum">฿{formatCoins(buyThb)}</strong>
                  </div>
                  <div
                    className="cr-row"
                    style={{ justifyContent: "space-between", marginTop: 6 }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      Coins credited
                    </span>
                    <strong
                      className="cr-tnum"
                      style={{ color: "var(--cr-coin-ink)" }}
                    >
                      <CoinPip size={12} /> {formatCoins(buyCoins)}
                    </strong>
                  </div>
                  <hr
                    style={{
                      border: 0,
                      height: 1,
                      background: "var(--cr-line-soft)",
                      margin: "8px 0",
                    }}
                  />
                  <div
                    className="cr-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                      New balance after approve
                    </span>
                    <strong className="cr-tnum" style={{ fontSize: 17 }}>
                      {formatCoins(wallet.balanceCoins + buyCoins)} coins
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="cr-btn cr-btn-primary cr-btn-lg cr-btn-block"
                  disabled={!buyThb || !buyCoins}
                  onClick={() => setStep(2)}
                >
                  Continue to payment <Ico name="arrow-right" size={14} />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="cr-stack" style={{ gap: 16 }}>
                <span className="cr-eyebrow">Pick a payment method</span>
                {paymentMethods.length === 0 ? (
                  <div
                    style={{
                      padding: 18,
                      background: "var(--cr-rose-soft)",
                      border: "1px solid var(--cr-rose-soft)",
                      borderRadius: "var(--cr-r-md)",
                      color: "var(--cr-rose)",
                      fontSize: 13,
                    }}
                  >
                    No active bank transfer method is configured. Admin must
                    add one before customers can submit a top-up.
                  </div>
                ) : (
                  <div className="cr-wallet-payment-grid">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        className={`cr-pkg ${
                          paymentMethodId === method.id ? "active" : ""
                        }`}
                        onClick={() => setPaymentMethodId(method.id)}
                        style={{ alignItems: "flex-start", textAlign: "left" }}
                      >
                        <span className="cr-row" style={{ gap: 10 }}>
                          <span
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: "var(--cr-bg-soft)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ico
                              name={
                                method.type === "promptpay_qr" ? "qr" : "bank"
                              }
                              size={16}
                            />
                          </span>
                          <strong style={{ fontSize: 14 }}>
                            {method.displayName}
                          </strong>
                        </span>
                        <small className="cr-mute" style={{ marginTop: 2 }}>
                          {method.type === "promptpay_qr"
                            ? "Scan & pay"
                            : method.bankName ?? "Bank Transfer"}
                        </small>
                      </button>
                    ))}
                  </div>
                )}

                {selectedMethod && (
                  <div
                    style={{
                      padding: 18,
                      background: "var(--cr-bg-soft)",
                      border: "1px solid var(--cr-line)",
                      borderRadius: "var(--cr-r-md)",
                    }}
                  >
                    <span className="cr-eyebrow">Payment details</span>
                    <div style={{ marginTop: 8, fontSize: 13.5 }}>
                      <div
                        className="cr-row"
                        style={{
                          justifyContent: "space-between",
                          padding: "6px 0",
                        }}
                      >
                        <span className="cr-mute">Method</span>
                        <strong>{selectedMethod.displayName}</strong>
                      </div>
                      {selectedMethod.bankName && (
                        <div
                          className="cr-row"
                          style={{
                            justifyContent: "space-between",
                            padding: "6px 0",
                          }}
                        >
                          <span className="cr-mute">Bank</span>
                          <strong>{selectedMethod.bankName}</strong>
                        </div>
                      )}
                      {selectedMethod.accountNumber && (
                        <div
                          className="cr-row"
                          style={{
                            justifyContent: "space-between",
                            padding: "6px 0",
                          }}
                        >
                          <span className="cr-mute">Account no.</span>
                          <strong className="cr-tnum">
                            {selectedMethod.accountNumber}
                          </strong>
                        </div>
                      )}
                      {selectedMethod.accountName && (
                        <div
                          className="cr-row"
                          style={{
                            justifyContent: "space-between",
                            padding: "6px 0",
                          }}
                        >
                          <span className="cr-mute">Account name</span>
                          <strong>{selectedMethod.accountName}</strong>
                        </div>
                      )}
                      {selectedMethod.type === "promptpay_qr" &&
                        selectedMethod.promptpayId && (
                          <div
                            className="cr-row"
                            style={{
                              justifyContent: "space-between",
                              padding: "6px 0",
                            }}
                          >
                            <span className="cr-mute">PromptPay ID</span>
                            <strong className="cr-tnum">
                              {selectedMethod.promptpayId}
                            </strong>
                          </div>
                        )}
                      <div
                        className="cr-row"
                        style={{
                          justifyContent: "space-between",
                          padding: "6px 0",
                        }}
                      >
                        <span className="cr-mute">Amount</span>
                        <strong className="cr-tnum">
                          ฿{formatCoins(buyThb)}.00
                        </strong>
                      </div>
                      {selectedMethod.instructions && (
                        <p
                          className="cr-mute"
                          style={{ marginTop: 8, fontSize: 12 }}
                        >
                          {selectedMethod.instructions}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="cr-field cr-wallet-slip-field">
                  <span className="cr-wallet-slip-label">Payment slip</span>
                  <input
                    id="topup-slip"
                    className="cr-wallet-slip-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="topup-slip"
                    className={`cr-wallet-slip-button ${slip ? "has-file" : ""}`}
                  >
                    <span className="cr-wallet-slip-icon">
                      <Ico name="upload" size={16} />
                    </span>
                    <span className="cr-wallet-slip-copy">
                      <strong>
                        {slip ? "Change payment slip" : "Upload payment slip"}
                      </strong>
                      <small>
                        {slip ? slip.name : "JPG, PNG, or WEBP up to 10 MB"}
                      </small>
                    </span>
                  </label>
                </div>

                <div className="cr-field">
                  <label htmlFor="topup-note">Note (optional)</label>
                  <textarea
                    id="topup-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything the admin needs to know about this slip"
                  />
                </div>

                <div className="cr-row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="cr-btn"
                    onClick={() => setStep(1)}
                  >
                    <Ico name="chev-l" size={12} /> Back
                  </button>
                  <button
                    type="button"
                    className="cr-btn cr-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => setStep(3)}
                    disabled={!ready || !slip}
                  >
                    Review &amp; confirm <Ico name="arrow-right" size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="cr-stack" style={{ gap: 16 }}>
                <span className="cr-eyebrow">Review</span>
                <div
                  style={{
                    padding: 18,
                    background: "var(--cr-bg-soft)",
                    border: "1px solid var(--cr-line)",
                    borderRadius: "var(--cr-r-md)",
                  }}
                >
                  <div
                    className="cr-row"
                    style={{
                      justifyContent: "space-between",
                      padding: "6px 0",
                    }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      Amount
                    </span>
                    <strong className="cr-tnum">฿{formatCoins(buyThb)}</strong>
                  </div>
                  <div
                    className="cr-row"
                    style={{
                      justifyContent: "space-between",
                      padding: "6px 0",
                    }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      Coins credited
                    </span>
                    <strong
                      className="cr-tnum"
                      style={{ color: "var(--cr-coin-ink)" }}
                    >
                      <CoinPip size={12} /> {formatCoins(buyCoins)}
                    </strong>
                  </div>
                  <div
                    className="cr-row"
                    style={{
                      justifyContent: "space-between",
                      padding: "6px 0",
                    }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      Method
                    </span>
                    <strong>
                      {selectedMethod?.displayName ?? "—"}
                    </strong>
                  </div>
                  <hr
                    style={{
                      border: 0,
                      height: 1,
                      background: "var(--cr-line-soft)",
                      margin: "8px 0",
                    }}
                  />
                  <div
                    className="cr-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <span style={{ fontWeight: 700 }}>New balance after approve</span>
                    <strong className="cr-tnum" style={{ fontSize: 18 }}>
                      {formatCoins(wallet.balanceCoins + buyCoins)} coins
                    </strong>
                  </div>
                </div>

                <div className="cr-row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="cr-btn"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                  >
                    <Ico name="chev-l" size={12} /> Back
                  </button>
                  <button
                    type="button"
                    className="cr-btn cr-btn-gold cr-btn-lg"
                    style={{ flex: 1 }}
                    onClick={submit}
                    disabled={submitting || !ready || !slip}
                  >
                    <Ico name="check" size={14} />{" "}
                    {submitting
                      ? "Submitting..."
                      : `Confirm · I paid ฿${formatCoins(buyThb)}`}
                  </button>
                </div>
                <small
                  className="cr-mute"
                  style={{ textAlign: "center", fontSize: 11.5 }}
                >
                  Slip checks must match the amount and receiver before coins
                  are credited. Any unclear slip stays pending for review.
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
