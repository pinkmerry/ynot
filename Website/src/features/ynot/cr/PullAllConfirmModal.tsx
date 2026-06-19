"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { YnotCampaign } from "../types";
import {
  preparePullAllQuote,
  pullAllClientErrorMessage,
  startPullAllSession,
  type PullAllQuote,
} from "../pull-all-client";
import { CoinPip, formatCoins } from "./Icons";
import { Modal, useToast } from "./UiKit";

type PullAllConfirmModalProps = {
  balanceCoins: number;
  campaign: YnotCampaign | null;
  onClose: () => void;
  onStarted?: () => void;
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
  open,
}: PullAllConfirmModalProps) {
  const router = useRouter();
  const { toast } = useToast();
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
  }, [campaign, open]);

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
      await startPullAllSession(quote.startToken);
      toast("success", "Pull All started. Watch progress in All pulls.");
      onStarted?.();
      handleClose();
      router.push("/profile/all-pulls");
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
      eyebrow="Pull All"
      title={`Pull All ${title}`}
      size="md"
      footer={
        <>
          <button type="button" className="cr-btn" onClick={handleClose} disabled={starting}>
            Cancel
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={handleStart}
            disabled={startDisabled}
            title={!enoughCoins && quote ? "Top up to start Pull All." : undefined}
          >
            <CoinPip size={14} />{" "}
            {starting
              ? "Starting Pull All..."
              : quote
                ? `Start for ${formatCoins(totalCost)} coins`
                : "Preparing quote..."}
          </button>
        </>
      }
    >
      <div className="cr-stack" style={{ gap: 16, padding: "4px 0" }}>
        {loading ? (
          <div className="cr-pull-all-quote" aria-busy="true">
            Preparing Pull All quote...
          </div>
        ) : null}
        {error ? <div className="cr-pull-all-error">{error}</div> : null}
        {quote ? (
          <div className="cr-pull-all-quote">
            <div className="cr-pull-all-quote-row">
              <span>Total pulls</span>
              <strong>{quote.targetRewards.toLocaleString()}</strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span>Cost per pull</span>
              <strong>
                <CoinPip size={13} /> {formatCoins(quote.costPerReward)}
              </strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span>Total cost</span>
              <strong>
                <CoinPip size={13} /> {formatCoins(totalCost)}
              </strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span>Your balance</span>
              <strong>{formatCoins(balanceCoins)}c</strong>
            </div>
            <div className="cr-pull-all-quote-row">
              <span>Balance after Pull All</span>
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
