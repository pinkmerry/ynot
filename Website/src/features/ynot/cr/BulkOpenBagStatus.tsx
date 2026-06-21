"use client";

/* eslint-disable @next/next/no-img-element -- Pull All highlights use public Supabase image URLs, and this app has no next/image remote config for them. */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type {
  BulkOpenPublicDisplayTier,
  BulkOpenStatus,
  PublicBulkOpenHighlight,
  PublicBulkOpenSessionSummary,
} from "../bulk-open";
import { CoinPip, Ico, formatCoins } from "./Icons";

const BULK_OPEN_BAG_POLL_MS = 15_000;
const BULK_OPEN_BAG_HIGHLIGHT_LIMIT = 100;

const activeBulkOpenStatuses = new Set<BulkOpenStatus>([
  "queued",
  "processing",
  "retry_required",
]);
const publicDisplayTiers = new Set<BulkOpenPublicDisplayTier>([
  "last_prize",
  "rainbow",
  "gold",
  "silver",
  "bronze",
]);

function isActiveBulkOpenStatus(status: BulkOpenStatus) {
  return activeBulkOpenStatuses.has(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function readDisplayTier(value: unknown): BulkOpenPublicDisplayTier {
  return typeof value === "string" &&
    publicDisplayTiers.has(value as BulkOpenPublicDisplayTier)
    ? (value as BulkOpenPublicDisplayTier)
    : "bronze";
}

function readHighlight(value: unknown): PublicBulkOpenHighlight | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : "Mystery reward";
  const displayTier =
    value.isLastPrize === true ? "last_prize" : readDisplayTier(value.displayTier);
  const numberValue = Number(value.valueThb);
  const highlight: PublicBulkOpenHighlight = {
    name,
    imageUrl:
      typeof value.imageUrl === "string" && value.imageUrl.trim()
        ? value.imageUrl.trim()
        : null,
    displayTier,
    valueThb: Number.isFinite(numberValue) ? numberValue : null,
  };
  if (value.isLastPrize === true || displayTier === "last_prize") {
    highlight.isLastPrize = true;
  }
  return highlight;
}

function readSession(payload: unknown): PublicBulkOpenSessionSummary | null {
  if (!isRecord(payload)) return null;
  const session = payload.session;
  if (!isRecord(session)) return null;
  const status = typeof session.status === "string" ? session.status : "";
  if (
    status !== "completed" &&
    !activeBulkOpenStatuses.has(status as BulkOpenStatus)
  ) {
    return null;
  }

  const highlights = Array.isArray(session.highlights)
    ? session.highlights
        .map(readHighlight)
        .filter((highlight): highlight is PublicBulkOpenHighlight =>
          Boolean(highlight),
        )
    : [];

  return {
    publicCode:
      typeof session.publicCode === "string" ? session.publicCode.trim() : "",
    status: status as BulkOpenStatus,
    statusLabel:
      status === "completed"
        ? "complete"
        : status === "retry_required"
          ? "finishing"
          : status === "processing"
            ? "landing"
            : "starting",
    totalPurchasedRewards: readNonNegativeInteger(session.totalPurchasedRewards),
    landedRewards: readNonNegativeInteger(session.landedRewards),
    settlingRewards: readNonNegativeInteger(session.settlingRewards),
    percentComplete: Math.min(100, readNonNegativeInteger(session.percentComplete)),
    totalCostCoins: readNonNegativeInteger(session.totalCostCoins),
    highlights,
  };
}

function statusCopy(status: BulkOpenStatus) {
  if (status === "queued") return "Getting your rewards ready";
  if (status === "processing") return "Rewards are landing in your bag";
  if (status === "retry_required") return "Finishing your rewards";
  return "Rewards are in your bag";
}

function tierLabel(highlight: PublicBulkOpenHighlight) {
  if (highlight.isLastPrize || highlight.displayTier === "last_prize") {
    return "Last Prize";
  }
  return highlight.displayTier;
}

function tierClassName(highlight: PublicBulkOpenHighlight) {
  return highlight.isLastPrize || highlight.displayTier === "last_prize"
    ? "last-prize"
    : highlight.displayTier;
}

export function BulkOpenBagStatus() {
  const [session, setSession] = useState<PublicBulkOpenSessionSummary | null>(
    null,
  );
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [acknowledging, startAcknowledge] = useTransition();

  const loadCurrentSession = useCallback(async () => {
    try {
      const response = await fetch("/api/ynot/gacha/bulk-open/current", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        setSession(null);
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      setSession(readSession(payload));
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCurrentSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCurrentSession]);

  useEffect(() => {
    function syncVisibility() {
      setHidden(document.visibilityState !== "visible");
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const isActive = session ? isActiveBulkOpenStatus(session.status) : false;

  useEffect(() => {
    if (!isActive || hidden) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadCurrentSession();
    }, BULK_OPEN_BAG_POLL_MS);
    return () => window.clearInterval(interval);
  }, [hidden, isActive, loadCurrentSession]);

  const highlights = useMemo(
    () => session?.highlights.slice(0, BULK_OPEN_BAG_HIGHLIGHT_LIMIT) ?? [],
    [session],
  );

  if (!session) return null;

  if (isActive) {
    const percentComplete = Math.max(0, Math.min(100, session.percentComplete));
    return (
      <section className="cr-bulk-open-status" aria-live="polite">
        <div className="cr-bulk-open-main">
          <div className="cr-bulk-open-title-row">
            <span className="cr-bulk-open-icon">
              <Ico name="sparkle" size={16} />
            </span>
            <div className="cr-grow">
              <p className="cr-eyebrow">Pull all progress</p>
              <h2>{statusCopy(session.status)}</h2>
            </div>
          </div>
          <div className="cr-bulk-open-progress">
            <div
              className="cr-bulk-open-progress-fill"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="cr-bulk-open-meta">
            <span>
              <strong className="cr-tnum">{session.landedRewards}</strong> of{" "}
              <strong className="cr-tnum">
                {session.totalPurchasedRewards}
              </strong>{" "}
              landed
            </span>
            <span>
              <strong className="cr-tnum">
                {Math.round(percentComplete)}
              </strong>
              % complete
            </span>
            <span>
              <strong className="cr-tnum">{session.settlingRewards}</strong>{" "}
              still settling
            </span>
            <span>
              <CoinPip /> {formatCoins(session.totalCostCoins)}
            </span>
          </div>
        </div>
      </section>
    );
  }

  if (session.status !== "completed" || highlights.length === 0) return null;

  function acknowledgeHighlights() {
    setMessage(null);
    startAcknowledge(async () => {
      try {
        const response = await fetch(
          "/api/ynot/gacha/bulk-open/highlights-seen",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ publicCode: session?.publicCode }),
          },
        );
        if (!response.ok) {
          throw new Error("Try again when your connection is stable.");
        }
        setSession(null);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Try again when your connection is stable.",
        );
      }
    });
  }

  return (
    <section className="cr-bulk-open-status complete" aria-live="polite">
      <div className="cr-bulk-open-main">
        <div className="cr-bulk-open-complete-head">
          <div className="cr-grow">
            <p className="cr-eyebrow">Pull all complete</p>
            <h2>All rewards are in your bag</h2>
            <p className="cr-lead">
              Top highlights are shown here. Open your bag or all pulls to see
              every reward.
            </p>
          </div>
          <div className="cr-bulk-open-actions">
            <Link className="cr-btn cr-btn-sm" href="/collection">
              <Ico name="card" size={14} /> Bag
            </Link>
            <Link className="cr-btn cr-btn-sm" href="/profile/all-pulls">
              <Ico name="grid" size={14} /> All pulls
            </Link>
            <button
              type="button"
              className="cr-btn cr-btn-sm cr-btn-primary"
              disabled={acknowledging}
              onClick={acknowledgeHighlights}
            >
              <Ico name="check" size={14} />
              {acknowledging ? "Saving" : "Got it"}
            </button>
          </div>
        </div>

        <div className="cr-bulk-open-meta complete">
          <span>
            <strong className="cr-tnum">{session.landedRewards}</strong>{" "}
            rewards landed
          </span>
          <span>
            <strong className="cr-tnum">
              {session.totalPurchasedRewards}
            </strong>{" "}
            total pulled
          </span>
          <span>
            <strong className="cr-tnum">{session.settlingRewards}</strong>{" "}
            still settling
          </span>
          <span>
            <CoinPip /> {formatCoins(session.totalCostCoins)}
          </span>
        </div>

        <div className="cr-bulk-open-highlights">
          {highlights.map((highlight, index) => (
            <article
              className="cr-bulk-open-highlight"
              key={`${highlight.name}-${index}`}
              style={
                {
                  "--cr-highlight-index": index,
                } as CSSProperties & { "--cr-highlight-index": number }
              }
            >
              <div
                className={`cr-bulk-open-highlight-art ${tierClassName(
                  highlight,
                )}`}
              >
                {highlight.imageUrl ? (
                  <img
                    src={highlight.imageUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <Ico name="card" size={22} />
                )}
              </div>
              <div className="cr-bulk-open-highlight-copy">
                <span className="cr-bulk-open-highlight-tier">
                  {tierLabel(highlight)}
                </span>
                <strong>{highlight.name}</strong>
                {highlight.valueThb !== null ? (
                  <small className="cr-mute cr-tnum">
                    Value {highlight.valueThb.toLocaleString()} THB
                  </small>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {message ? <p className="cr-bulk-open-note">{message}</p> : null}
      </div>
    </section>
  );
}
