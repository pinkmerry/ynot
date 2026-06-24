"use client";

import { useEffect, useState } from "react";
import type { YnotCampaign } from "../types";
import {
  preparePullAllQuote,
  pullAllClientErrorMessage,
  startPullAllSession,
  type PullAllQuote,
  type PullAllStartedSession,
  type PublicWalletSnapshot,
} from "../pull-all-client";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText } from "../i18n";
import { CoinPip, formatCoins } from "./Icons";
import { Modal, useToast } from "./UiKit";

type PullAllConfirmModalProps = {
  balanceCoins: number;
  campaign: YnotCampaign | null;
  onClose: () => void;
  onStarted?: (session: PullAllStartedSession, quote: PullAllQuote) => void;
  onWalletSnapshot?: (wallet: PublicWalletSnapshot) => void;
  open: boolean;
};

type PullAllQuoteState = {
  error: string;
  key: string;
  quote: PullAllQuote | null;
};

type PullAllStartErrorState = {
  error: string;
  key: string;
};

export function PullAllConfirmModal({
  balanceCoins,
  campaign,
  onClose,
  onStarted,
  onWalletSnapshot,
  open,
}: PullAllConfirmModalProps) {
  const { toast } = useToast();
  const language = useStoreLanguage();
  const [quoteState, setQuoteState] = useState<PullAllQuoteState>({
    error: "",
    key: "",
    quote: null,
  });
  const [startError, setStartError] = useState<PullAllStartErrorState>({
    error: "",
    key: "",
  });
  const [starting, setStarting] = useState(false);
  const quoteKey = open && campaign ? campaign.slug : "";

  useEffect(() => {
    if (!open || !campaign) return;
    let active = true;
    preparePullAllQuote(campaign.slug)
      .then((nextQuote) => {
        if (!active) return;
        setQuoteState({ error: "", key: campaign.slug, quote: nextQuote });
        if (nextQuote.wallet) onWalletSnapshot?.(nextQuote.wallet);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setQuoteState({
          error: pullAllClientErrorMessage(caught),
          key: campaign.slug,
          quote: null,
        });
      });
    return () => {
      active = false;
    };
  }, [campaign, onWalletSnapshot, open]);

  if (!open || !campaign) return null;

  const title = campaign.titleEn || campaign.titleTh;
  const quoteStateMatches = quoteState.key === quoteKey;
  const startErrorMatches = startError.key === quoteKey;
  const quote = quoteStateMatches ? quoteState.quote : null;
  const error =
    (quoteStateMatches ? quoteState.error : "") ||
    (startErrorMatches ? startError.error : "");
  const loading = Boolean(quoteKey) && !quoteStateMatches;
  const totalCost = quote?.totalCostCoins ?? 0;
  const enoughCoins = quote ? balanceCoins >= totalCost : false;
  const balanceAfter = quote ? balanceCoins - totalCost : balanceCoins;
  const startDisabled = loading || starting || !quote || Boolean(error) || !enoughCoins;

  function handleClose() {
    setQuoteState({ error: "", key: "", quote: null });
    setStartError({ error: "", key: "" });
    setStarting(false);
    onClose();
  }

  async function handleStart() {
    if (!quote || startDisabled) return;
    setStarting(true);
    setStartError({ error: "", key: quoteKey });
    try {
      const session = await startPullAllSession(quote.startToken);
      if (session.wallet) onWalletSnapshot?.(session.wallet);
      toast(
        "success",
        language === "th"
          ? "เริ่มเปิดทั้งหมดแล้ว กำลังเผยรางวัลเด่น"
          : "Pull All started. Revealing top rewards.",
      );
      onStarted?.(session, quote);
      handleClose();
    } catch (caught) {
      setStartError({ error: pullAllClientErrorMessage(caught), key: quoteKey });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow={<I18nText en="Pull All" th="เปิดทั้งหมด" />}
      title={
        <>
          <I18nText en="Pull All" th="เปิดทั้งหมด" /> {title}
        </>
      }
      size="md"
      footer={
        <>
          <button type="button" className="cr-btn" onClick={handleClose} disabled={starting}>
            <I18nText en="Cancel" th="ยกเลิก" />
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={handleStart}
            disabled={startDisabled}
            title={
              !enoughCoins && quote
                ? language === "th"
                  ? "เติมเหรียญเพื่อเริ่มเปิดทั้งหมด"
                  : "Top up to start Pull All."
                : undefined
            }
          >
            <CoinPip size={14} />{" "}
            {starting
              ? <I18nText en="Starting Pull All..." th="กำลังเริ่มเปิดทั้งหมด..." />
              : quote
                ? (
                    <I18nText
                      en={`Start for ${formatCoins(totalCost)} coins`}
                      th={`เริ่มด้วย ${formatCoins(totalCost)} เหรียญ`}
                    />
                  )
                : <I18nText en="Preparing quote..." th="กำลังคำนวณราคา..." />}
          </button>
        </>
      }
    >
      <div className="cr-stack" style={{ gap: 16, padding: "4px 0" }}>
        {loading ? (
          <div className="cr-pull-all-quote" aria-busy="true">
            <I18nText en="Preparing Pull All quote..." th="กำลังคำนวณราคาเปิดทั้งหมด..." />
          </div>
        ) : null}
        {error ? <div className="cr-pull-all-error">{error}</div> : null}
        {quote ? (
          <div className="cr-pull-all-quote">
            <div className="cr-pull-all-quote-row">
              <span><I18nText en="Total pulls" th="จำนวนที่เปิด" /></span>
              <strong>{quote.targetRewards.toLocaleString()}</strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span><I18nText en="Cost per pull" th="ราคาต่อครั้ง" /></span>
              <strong>
                <CoinPip size={13} /> {formatCoins(quote.costPerReward)}
              </strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span><I18nText en="Total cost" th="ยอดรวม" /></span>
              <strong>
                <CoinPip size={13} /> {formatCoins(totalCost)}
              </strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span><I18nText en="Your balance" th="ยอดคงเหลือ" /></span>
              <strong>{formatCoins(balanceCoins)}c</strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span><I18nText en="Balance after Pull All" th="ยอดหลังเปิดทั้งหมด" /></span>
              <strong style={{ color: enoughCoins ? "var(--cr-ink)" : "var(--cr-rose)" }}>
                {formatCoins(balanceAfter)}c
              </strong>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
