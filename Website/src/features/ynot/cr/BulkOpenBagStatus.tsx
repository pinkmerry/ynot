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
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, localized, type Language } from "../i18n";

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

function statusCopy(status: BulkOpenStatus, language: Language) {
  if (status === "queued") {
    return localized(
      { en: "Getting your rewards ready", th: "กำลังเตรียมรางวัลของคุณ" },
      language,
    );
  }
  if (status === "processing") {
    return localized(
      { en: "Rewards are landing in your bag", th: "รางวัลกำลังเข้ากระเป๋า" },
      language,
    );
  }
  if (status === "retry_required") {
    return localized(
      { en: "Finishing your rewards", th: "กำลังเก็บงานรางวัลให้เสร็จ" },
      language,
    );
  }
  return localized(
    { en: "Rewards are in your bag", th: "รางวัลอยู่ในกระเป๋าแล้ว" },
    language,
  );
}

function tierLabel(highlight: PublicBulkOpenHighlight, language: Language) {
  if (highlight.isLastPrize || highlight.displayTier === "last_prize") {
    return localized({ en: "Last Prize", th: "รางวัลสุดท้าย" }, language);
  }
  return highlight.displayTier;
}

function highlightName(highlight: PublicBulkOpenHighlight, language: Language) {
  if (highlight.name === "Mystery reward") {
    return localized({ en: "Mystery reward", th: "รางวัลลับ" }, language);
  }
  return highlight.name;
}

function tierClassName(highlight: PublicBulkOpenHighlight) {
  return highlight.isLastPrize || highlight.displayTier === "last_prize"
    ? "last-prize"
    : highlight.displayTier;
}

export function BulkOpenBagStatus() {
  const language = useStoreLanguage();
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
              <p className="cr-eyebrow">
                <I18nText en="Pull all progress" th="ความคืบหน้า Pull All" />
              </p>
              <h2>{statusCopy(session.status, language)}</h2>
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
              <strong className="cr-tnum">{session.landedRewards}</strong>{" "}
              {language === "th" ? "จาก " : "of "}
              <strong className="cr-tnum">
                {session.totalPurchasedRewards}
              </strong>{" "}
              {localized({ en: "landed", th: "รางวัลเข้าแล้ว" }, language)}
            </span>
            <span>
              <strong className="cr-tnum">
                {Math.round(percentComplete)}
              </strong>
              % {localized({ en: "complete", th: "เสร็จแล้ว" }, language)}
            </span>
            <span>
              <strong className="cr-tnum">{session.settlingRewards}</strong>{" "}
              {localized({ en: "still settling", th: "ยังประมวลผลอยู่" }, language)}
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
          throw new Error(
            localized(
              {
                en: "Try again when your connection is stable.",
                th: "ลองอีกครั้งเมื่อการเชื่อมต่อเสถียร",
              },
              language,
            ),
          );
        }
        setSession(null);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : localized(
                {
                  en: "Try again when your connection is stable.",
                  th: "ลองอีกครั้งเมื่อการเชื่อมต่อเสถียร",
                },
                language,
              ),
        );
      }
    });
  }

  return (
    <section className="cr-bulk-open-status complete" aria-live="polite">
      <div className="cr-bulk-open-main">
        <div className="cr-bulk-open-complete-head">
          <div className="cr-grow">
            <p className="cr-eyebrow">
              <I18nText en="Pull all complete" th="Pull All เสร็จแล้ว" />
            </p>
            <h2>
              <I18nText en="All rewards are in your bag" th="รางวัลทั้งหมดอยู่ในกระเป๋าแล้ว" />
            </h2>
            <p className="cr-lead">
              <I18nText
                en="Top highlights are shown here. Open your bag or all pulls to see every reward."
                th="ไฮไลต์หลักจะแสดงที่นี่ เปิดกระเป๋าหรือประวัติทั้งหมดเพื่อดูรางวัลทุกใบ"
              />
            </p>
          </div>
          <div className="cr-bulk-open-actions">
            <Link className="cr-btn cr-btn-sm" href="/collection">
              <Ico name="card" size={14} /> <I18nText en="Bag" th="กระเป๋า" />
            </Link>
            <Link className="cr-btn cr-btn-sm" href="/profile/all-pulls">
              <Ico name="grid" size={14} /> <I18nText en="All pulls" th="ประวัติทั้งหมด" />
            </Link>
            <button
              type="button"
              className="cr-btn cr-btn-sm cr-btn-primary"
              disabled={acknowledging}
              onClick={acknowledgeHighlights}
            >
              <Ico name="check" size={14} />
              {acknowledging
                ? localized({ en: "Saving", th: "กำลังบันทึก" }, language)
                : localized({ en: "Got it", th: "รับทราบ" }, language)}
            </button>
          </div>
        </div>

        <div className="cr-bulk-open-meta complete">
          <span>
            <strong className="cr-tnum">{session.landedRewards}</strong>{" "}
            {localized({ en: "rewards landed", th: "รางวัลเข้าแล้ว" }, language)}
          </span>
          <span>
            <strong className="cr-tnum">
              {session.totalPurchasedRewards}
            </strong>{" "}
            {localized({ en: "total pulled", th: "รายการที่เปิดทั้งหมด" }, language)}
          </span>
          <span>
            <strong className="cr-tnum">{session.settlingRewards}</strong>{" "}
            {localized({ en: "still settling", th: "ยังประมวลผลอยู่" }, language)}
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
                  {tierLabel(highlight, language)}
                </span>
                <strong>{highlightName(highlight, language)}</strong>
                {highlight.valueThb !== null ? (
                  <small className="cr-mute cr-tnum">
                    {language === "th" ? "มูลค่า " : "Value "}
                    {highlight.valueThb.toLocaleString()} THB
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
