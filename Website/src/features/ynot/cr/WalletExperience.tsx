"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type {
  YnotPaymentMethod,
  YnotTopUp,
  YnotWallet,
} from "../types";
import {
  createYnotActionIntentId,
  ynotActionIdempotencyKey,
} from "../action-intent";
import { topUpPackages } from "../top-up-packages";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, type Language } from "../i18n";
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

function statusLabel(status: YnotTopUp["status"], language: Language): string {
  const th = language === "th";
  switch (status) {
    case "approved":
      return th ? "อนุมัติแล้ว" : "Approved";
    case "pending_review":
      return th ? "รอตรวจสอบ" : "Pending review";
    case "pending_slip":
      return th ? "รอสลิป" : "Pending slip";
    case "rejected":
      return th ? "ถูกปฏิเสธ" : "Rejected";
    case "cancelled":
      return th ? "ยกเลิกแล้ว" : "Cancelled";
    case "expired":
      return th ? "หมดอายุ" : "Expired";
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

function topUpToEntry(topUp: YnotTopUp, language: Language): TopUpEntry {
  const group = topUpHistoryGroup(topUp.status);
  const approved = group === "approved";
  const rejected = group === "rejected";
  const methodName = topUp.paymentMethod?.displayName ?? (language === "th" ? "ด้วยตนเอง" : "manual");
  return {
    id: topUp.publicCode,
    group,
    kind: approved ? "in" : "out",
    label: approved
      ? language === "th"
        ? `เติมเหรียญ · ${methodName}`
        : `Top-up · ${methodName}`
      : rejected
        ? language === "th"
          ? `เติมเหรียญถูกปฏิเสธ · ${methodName}`
          : `Rejected top-up · ${methodName}`
      : language === "th"
        ? `รอตรวจการเติมเหรียญ · ${methodName}`
        : `Pending top-up · ${methodName}`,
    sub: `฿${formatCoins(topUp.amountThb)} · ${statusLabel(topUp.status, language)}${
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
  const language = useStoreLanguage();
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
  const topUpSubmitInFlightRef = useRef(false);
  const topUpIntentRef = useRef(createYnotActionIntentId("topup"));

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
    const entries = topUps.map((topUp) => topUpToEntry(topUp, language));
    return entries.filter((entry) =>
      historyFilter === "all" ? true : entry.group === historyFilter,
    );
  }, [historyFilter, language, topUps]);

  function submit() {
    if (topUpSubmitInFlightRef.current) return;
    if (!ready) {
      toast("error", language === "th" ? "เลือกจำนวนเหรียญและช่องทางชำระเงินก่อน" : "Pick a coin amount and payment method first.");
      return;
    }
    if (!slip) {
      toast("error", language === "th" ? "อัปโหลดสลิปโอนเงินก่อน" : "Upload your bank or QR transfer slip first.");
      return;
    }
    if (!selectedMethod) {
      toast("error", language === "th" ? "เลือกช่องทางชำระเงินก่อน" : "Choose a payment method first.");
      return;
    }
    topUpSubmitInFlightRef.current = true;
    startSubmit(async () => {
      try {
        const topUpIdempotencyKey = ynotActionIdempotencyKey("topup", topUpIntentRef.current, [
          selectedMethod.id,
          customMode ? "custom" : picked.id,
          buyThb,
        ]);
        const form = new FormData();
        form.set("paymentMethodId", selectedMethod.id);
        form.set("customerNote", note);
        form.set("idempotencyKey", topUpIdempotencyKey);
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
            ? stringValue(payload.error) || (language === "th" ? "ส่งคำขอเติมเหรียญไม่สำเร็จ" : "Top-up request failed.")
            : language === "th" ? "ส่งคำขอเติมเหรียญไม่สำเร็จ" : "Top-up request failed.";
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
              ? language === "th"
                ? `อนุมัติการเติมเหรียญ ${publicCode} แล้ว เหรียญถูกเพิ่มแล้ว`
                : `Top-up ${publicCode} approved. Coins credited.`
              : language === "th"
                ? "อนุมัติการเติมเหรียญแล้ว เหรียญถูกเพิ่มแล้ว"
                : "Top-up approved. Coins credited."
            : autoRejected
              ? publicCode
                ? language === "th"
                  ? `การเติมเหรียญ ${publicCode} ถูกปฏิเสธ สลิปไม่ผ่านการตรวจสอบ`
                  : `Top-up ${publicCode} rejected. Slip did not pass verification.`
                : language === "th"
                  ? "การเติมเหรียญถูกปฏิเสธ สลิปไม่ผ่านการตรวจสอบ"
                  : "Top-up rejected. Slip did not pass verification."
            : publicCode
              ? language === "th"
                ? `ส่งคำขอเติมเหรียญ ${publicCode} เพื่อรอตรวจแล้ว`
                : `Top-up ${publicCode} submitted for review`
              : language === "th"
                ? "ส่งคำขอเติมเหรียญเพื่อรอตรวจแล้ว"
                : "Top-up submitted for review",
        );
        setSlip(null);
        topUpIntentRef.current = createYnotActionIntentId("topup");
        setStep(1);
        // Soft refresh — the new pending record will appear on next paint.
        window.location.assign("/wallet");
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? error.message
            : language === "th"
              ? "ส่งคำขอเติมเหรียญไม่สำเร็จ"
              : "Top-up request failed.",
        );
      } finally {
        topUpSubmitInFlightRef.current = false;
      }
    });
  }

  return (
    <div className="cr-page">
      <PageHead
        eyebrow={<I18nText en="Wallet" th="วอลเล็ต" />}
        title={<I18nText en="Top up" th="เติมเหรียญ" />}
        lead={
          <I18nText
            en="Pick how many coins you want, then pay. We verify the slip and credit your wallet after it passes."
            th="เลือกจำนวนเหรียญที่ต้องการแล้วชำระเงิน เราจะตรวจสลิปและเพิ่มเหรียญเข้าวอลเล็ตเมื่อผ่านการตรวจสอบ"
          />
        }
      />

      <div className="cr-wallet-grid">
        <div className="cr-stack" style={{ gap: 16 }}>
          <div className="cr-balance-card">
            <span className="cr-balance-eyebrow">
              <I18nText en="Current balance" th="ยอดคงเหลือ" />
            </span>
            <div className="cr-balance-num">
              <CoinPip size={28} />
              {formatCoins(wallet.balanceCoins)}
              <small><I18nText en="coins" th="เหรียญ" /></small>
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
                <I18nText en="mid-tier packs" th="แพ็กระดับกลาง" />
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
                <Ico name="plus" size={14} /> <I18nText en="Top up" th="เติมเหรียญ" />
              </button>
              <Link href="/profile" className="cr-btn">
                <Ico name="swap" size={14} /> <I18nText en="Convert cards to coins" th="แลกการ์ดเป็นเหรียญ" />
              </Link>
            </div>
          </div>

          <div className="cr-section">
            <div className="cr-section-head">
              <div className="cr-stack" style={{ gap: 2 }}>
                <span className="cr-eyebrow"><I18nText en="History" th="ประวัติ" /></span>
                <h3><I18nText en="Recent top-up requests" th="คำขอเติมเหรียญล่าสุด" /></h3>
              </div>
              <div className="cr-row" style={{ gap: 4 }}>
                {(
                  [
                    { id: "all", label: language === "th" ? "ทั้งหมด" : "All" },
                    { id: "approved", label: language === "th" ? "อนุมัติแล้ว" : "Approved" },
                    { id: "pending", label: language === "th" ? "รอตรวจ" : "Pending" },
                    { id: "rejected", label: language === "th" ? "ถูกปฏิเสธ" : "Rejected" },
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
                  <I18nText
                    en="No top-up requests match this filter."
                    th="ไม่มีคำขอเติมเหรียญตรงกับตัวกรองนี้"
                  />
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
              <span className="cr-eyebrow"><I18nText en="Top up" th="เติมเหรียญ" /></span>
              <h3>
                <I18nText en={`Step ${step} of 3`} th={`ขั้นตอน ${step} จาก 3`} />
              </h3>
            </div>
            <button
              type="button"
              className="cr-btn cr-btn-ghost cr-btn-sm"
              onClick={() => setStep(1)}
              disabled={step === 1}
            >
              <Ico name="chev-l" size={12} /> <I18nText en="Restart" th="เริ่มใหม่" />
            </button>
          </div>

          <div className="cr-wallet-stepper-wrap">
            <div className="cr-wallet-stepper">
              {[
                { n: 1, label: language === "th" ? "เหรียญ" : "Coins" },
                { n: 2, label: language === "th" ? "ชำระเงิน" : "Payment" },
                { n: 3, label: language === "th" ? "ยืนยัน" : "Confirm" },
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
                <span className="cr-eyebrow">
                  <I18nText en="Pick how many coins" th="เลือกจำนวนเหรียญ" />
                </span>
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
                    <span className="cr-eyebrow">
                      <I18nText en="Custom amount" th="จำนวนที่ต้องการ" />
                    </span>
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
                        placeholder={language === "th" ? "ใส่จำนวนเงิน" : "Enter amount"}
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
                        aria-label={
                          language === "th"
                            ? "จำนวนเติมเหรียญเองเป็นบาท"
                            : "Custom top-up amount in THB"
                        }
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
                  <I18nText
                    en="1 THB = 1 coin. No bonus coins are added."
                    th="1 บาท = 1 เหรียญ ไม่มีเหรียญโบนัสเพิ่มเติม"
                  />
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
                      <I18nText en="You pay" th="คุณชำระ" />
                    </span>
                    <strong className="cr-tnum">฿{formatCoins(buyThb)}</strong>
                  </div>
                  <div
                    className="cr-row"
                    style={{ justifyContent: "space-between", marginTop: 6 }}
                  >
                    <span className="cr-mute" style={{ fontSize: 12.5 }}>
                      <I18nText en="Coins credited" th="เหรียญที่จะได้รับ" />
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
                      <I18nText en="New balance after approve" th="ยอดใหม่หลังอนุมัติ" />
                    </span>
                    <strong className="cr-tnum" style={{ fontSize: 17 }}>
                      {formatCoins(wallet.balanceCoins + buyCoins)}{" "}
                      <I18nText en="coins" th="เหรียญ" />
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="cr-btn cr-btn-primary cr-btn-lg cr-btn-block"
                  disabled={!buyThb || !buyCoins}
                  onClick={() => setStep(2)}
                >
                  <I18nText en="Continue to payment" th="ไปชำระเงิน" />{" "}
                  <Ico name="arrow-right" size={14} />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="cr-stack" style={{ gap: 16 }}>
                <span className="cr-eyebrow">
                  <I18nText en="Pick a payment method" th="เลือกช่องทางชำระเงิน" />
                </span>
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
                    <I18nText
                      en="No active bank transfer method is configured. Admin must add one before customers can submit a top-up."
                      th="ยังไม่มีช่องทางโอนเงินที่เปิดใช้งาน แอดมินต้องเพิ่มช่องทางก่อนลูกค้าจึงจะส่งคำขอเติมเหรียญได้"
                    />
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
                            ? language === "th"
                              ? "สแกนจ่าย"
                              : "Scan & pay"
                            : method.bankName ?? (language === "th" ? "โอนผ่านธนาคาร" : "Bank Transfer")}
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
                    <span className="cr-eyebrow">
                      <I18nText en="Payment details" th="รายละเอียดชำระเงิน" />
                    </span>
                    <div style={{ marginTop: 8, fontSize: 13.5 }}>
                      <div
                        className="cr-row"
                        style={{
                          justifyContent: "space-between",
                          padding: "6px 0",
                        }}
                      >
                        <span className="cr-mute">
                          <I18nText en="Method" th="ช่องทาง" />
                        </span>
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
                          <span className="cr-mute">
                            <I18nText en="Bank" th="ธนาคาร" />
                          </span>
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
                          <span className="cr-mute">
                            <I18nText en="Account no." th="เลขบัญชี" />
                          </span>
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
                          <span className="cr-mute">
                            <I18nText en="Account name" th="ชื่อบัญชี" />
                          </span>
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
                        <span className="cr-mute">
                          <I18nText en="Amount" th="จำนวนเงิน" />
                        </span>
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
                  <span className="cr-wallet-slip-label">
                    <I18nText en="Payment slip" th="สลิปชำระเงิน" />
                  </span>
                  <input
                    id="topup-slip"
                    className="cr-wallet-slip-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      setSlip(e.target.files?.[0] ?? null);
                      topUpIntentRef.current =
                        createYnotActionIntentId("topup");
                    }}
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
                        {slip
                          ? language === "th"
                            ? "เปลี่ยนสลิปชำระเงิน"
                            : "Change payment slip"
                          : language === "th"
                            ? "อัปโหลดสลิปชำระเงิน"
                            : "Upload payment slip"}
                      </strong>
                      <small>
                        {slip
                          ? slip.name
                          : language === "th"
                            ? "JPG, PNG หรือ WEBP สูงสุด 10 MB"
                            : "JPG, PNG, or WEBP up to 10 MB"}
                      </small>
                    </span>
                  </label>
                </div>

                <div className="cr-field">
                  <label htmlFor="topup-note">
                    <I18nText en="Note (optional)" th="หมายเหตุ (ไม่บังคับ)" />
                  </label>
                  <textarea
                    id="topup-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      language === "th"
                        ? "รายละเอียดเพิ่มเติมที่ต้องการแจ้งแอดมินเกี่ยวกับสลิปนี้"
                        : "Anything the admin needs to know about this slip"
                    }
                  />
                </div>

                <div className="cr-row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="cr-btn"
                    onClick={() => setStep(1)}
                  >
                    <Ico name="chev-l" size={12} /> <I18nText en="Back" th="กลับ" />
                  </button>
                  <button
                    type="button"
                    className="cr-btn cr-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => setStep(3)}
                    disabled={!ready || !slip}
                  >
                    <I18nText en="Review & confirm" th="ตรวจสอบและยืนยัน" />{" "}
                    <Ico name="arrow-right" size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="cr-stack" style={{ gap: 16 }}>
                <span className="cr-eyebrow">
                  <I18nText en="Review" th="ตรวจสอบ" />
                </span>
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
                      <I18nText en="Amount" th="จำนวนเงิน" />
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
                      <I18nText en="Coins credited" th="เหรียญที่จะได้รับ" />
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
                      <I18nText en="Method" th="ช่องทาง" />
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
                    <span style={{ fontWeight: 700 }}>
                      <I18nText en="New balance after approve" th="ยอดใหม่หลังอนุมัติ" />
                    </span>
                    <strong className="cr-tnum" style={{ fontSize: 18 }}>
                      {formatCoins(wallet.balanceCoins + buyCoins)}{" "}
                      <I18nText en="coins" th="เหรียญ" />
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
                    <Ico name="chev-l" size={12} /> <I18nText en="Back" th="กลับ" />
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
                      ? language === "th"
                        ? "กำลังส่ง..."
                        : "Submitting..."
                      : language === "th"
                        ? `ยืนยัน · ชำระแล้ว ฿${formatCoins(buyThb)}`
                        : `Confirm · I paid ฿${formatCoins(buyThb)}`}
                  </button>
                </div>
                <small
                  className="cr-mute"
                  style={{ textAlign: "center", fontSize: 11.5 }}
                >
                  <I18nText
                    en="Slip checks must match the amount and receiver before coins are credited. Any unclear slip stays pending for review."
                    th="สลิปต้องตรงกับยอดเงินและผู้รับก่อนเพิ่มเหรียญ สลิปที่ไม่ชัดเจนจะค้างไว้เพื่อรอตรวจสอบ"
                  />
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
