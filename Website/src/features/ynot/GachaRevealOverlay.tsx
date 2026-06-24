"use client";

import { ArrowLeft } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  highestPublicPrizeDisplayTier,
  publicPrizeDisplayTierConfig,
  publicPrizeDisplayTierLabel,
  publicPrizeDisplayTierOrder,
  type PublicPrizeDisplayTier,
  type PrizeDisplayTier,
} from "./prize-tier";
import {
  prefersReducedMotion,
  useGachaAnimationPref,
} from "./gacha-animation-pref";
import type {
  YnotGachaOpenItem,
  YnotGachaOpenResult,
  YnotTierAnimation,
} from "./types";
import { useStoreLanguage } from "./StorePreferences";
import { I18nText, localized, type Language } from "./i18n";

type RevealStage = "reveal" | "tierSpin" | "tier" | "spotlight" | "summary";
type PullRarity = "normal" | "rare" | "blackout" | "jackpot";

type Props = {
  result: YnotGachaOpenResult;
  quantity: number;
  displayQuantity?: number;
  summaryNote?: ReactNode;
  summaryTitle?: ReactNode;
  onClose: () => void;
  onFinish: () => void;
  onOpenAgain?: (quantity: number) => void;
  onPullAllAgain?: () => void;
  openAgainOptions?: Array<{
    kind?: "normal" | "pull_all";
    quantity: number;
    disabled?: boolean;
    costCoins?: number;
  }>;
  remainingSlots?: number;
  tierAnimations?: YnotTierAnimation[];
  forceAnimation?: boolean;
};

const TIER_SPIN_MS = 1450;
const TIER_RESULT_MS = 1600;
const SPOTLIGHT_MS = 2100;

function revealRarity(tier: PublicPrizeDisplayTier): PullRarity {
  if (tier === "last_prize" || tier === "rainbow") return "jackpot";
  if (tier === "gold") return "blackout";
  if (tier === "silver") return "rare";
  return "normal";
}

function revealMotionDurationMs(rarity: PullRarity, quantity: number) {
  if (quantity > 1) return 4500;
  if (rarity === "jackpot") return 4900;
  if (rarity === "blackout" || rarity === "rare") return 4400;
  return 4150;
}

function featuredRevealItem(items: YnotGachaOpenItem[]) {
  return items.reduce<YnotGachaOpenItem | null>((best, item) => {
    if (!best) return item;
    const bestOrder = publicPrizeDisplayTierOrder(best.displayTier);
    const itemOrder = publicPrizeDisplayTierOrder(item.displayTier);
    if (itemOrder < bestOrder) return item;
    if (itemOrder === bestOrder && item.position < best.position) return item;
    return best;
  }, null);
}

function isUploadedQuestionPlaceholder(item: YnotGachaOpenItem | null | undefined) {
  if (!item?.imageUrl) return false;
  return (
    item.name.trim().toLowerCase() === "one piece" &&
    item.imageUrl.includes("1779995851519-c99c0801-c923-48ee-9118-3505ec2167d6-psa-10.png")
  );
}

function PackOpenCutoutMotionImage() {
  return (
    <picture>
      <source srcSet="/ynot-pack-open-cutout.avif" type="image/avif" />
      <img
        className="pack-open-cutout-motion"
        src="/ynot-pack-open-cutout.webp"
        alt=""
        aria-hidden="true"
      />
    </picture>
  );
}

function OpenPackShellImage() {
  return (
    <picture className="pack-open-picture">
      <source srcSet="/ynot-open-pack-bg-removed.avif" type="image/avif" />
      <source srcSet="/ynot-open-pack-bg-removed.webp" type="image/webp" />
      <img src="/ynot-open-pack-bg-removed.png" alt="" />
    </picture>
  );
}

function findTierAnimation(
  animations: YnotTierAnimation[] | undefined,
  tier: PrizeDisplayTier,
): YnotTierAnimation | null {
  return animations?.find((a) => a.tier === tier && a.isActive) ?? null;
}

function pickInitialStage(autoSkip: boolean, forceAnimation: boolean): RevealStage {
  if (typeof window === "undefined") return "reveal";
  if (forceAnimation) return "reveal";
  if (autoSkip) return "summary";
  if (prefersReducedMotion()) return "summary";
  return "reveal";
}

function tierLabel(tier: PublicPrizeDisplayTier, language: Language) {
  const copy: Record<PublicPrizeDisplayTier, { en: string; th: string }> = {
    rainbow: { en: "Rainbow", th: "เรนโบว์" },
    gold: { en: "Gold", th: "โกลด์" },
    silver: { en: "Silver", th: "ซิลเวอร์" },
    bronze: { en: "Bronze", th: "บรอนซ์" },
    last_prize: { en: "Last Prize", th: "รางวัลสุดท้าย" },
  };
  return localized(copy[tier] ?? { en: publicPrizeDisplayTierLabel(tier), th: publicPrizeDisplayTierLabel(tier) }, language);
}

export function GachaRevealOverlay({
  result,
  quantity,
  displayQuantity,
  summaryNote,
  summaryTitle,
  onClose,
  onFinish,
  onOpenAgain,
  onPullAllAgain,
  openAgainOptions = [],
  remainingSlots,
  tierAnimations,
  forceAnimation = false,
}: Props) {
  const { pref, setAutoSkip, setMuted } = useGachaAnimationPref();
  const language = useStoreLanguage();
  const [stage, setStage] = useState<RevealStage>(() =>
    pickInitialStage(pref.autoSkip, forceAnimation),
  );

  const items: YnotGachaOpenItem[] = useMemo(
    () => result.items ?? [],
    [result.items],
  );
  const displayedPullCount = Math.max(
    0,
    Math.floor(displayQuantity ?? items.length),
  );
  const highestTier = useMemo<PublicPrizeDisplayTier>(
    () =>
      items.length
        ? highestPublicPrizeDisplayTier(items.map((item) => item.displayTier))
        : "bronze",
    [items],
  );
  const highestTierConfig = publicPrizeDisplayTierConfig(highestTier);
  const animation = highestTierConfig.animation;
  const tierAsset =
    highestTier === "last_prize" ? null : findTierAnimation(tierAnimations, highestTier);
  const featuredItem = useMemo(() => featuredRevealItem(items), [items]);
  const featuredItemImageUrl = isUploadedQuestionPlaceholder(featuredItem)
    ? null
    : featuredItem?.imageUrl;
  const featuredPlaceholderLabel = isUploadedQuestionPlaceholder(featuredItem)
    ? "?"
    : highestTierConfig.shortLabel;
  const motionRarity = revealRarity(highestTier);
  const revealInstanceKey = `${result.openId}-${quantity}-${highestTier}-${items.length}`;
  const revealDurationMs = tierAsset?.videoUrl
    ? Math.max(1200, tierAsset.durationMs || animation.durationMs)
    : revealMotionDurationMs(motionRarity, quantity);
  const remainingStockLabel =
    typeof remainingSlots === "number" && Number.isFinite(remainingSlots)
      ? localized(
          {
            en: `${Math.max(0, Math.floor(remainingSlots)).toLocaleString()} left`,
            th: `เหลือ ${Math.max(0, Math.floor(remainingSlots)).toLocaleString("th-TH")}`,
          },
          language,
        )
      : null;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [motionArmed, setMotionArmed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (stage !== "reveal") return;
    const timer = setTimeout(() => setStage("tierSpin"), revealDurationMs);
    return () => clearTimeout(timer);
  }, [stage, revealDurationMs]);

  useEffect(() => {
    if (stage !== "tierSpin") return;
    const timer = setTimeout(() => setStage("tier"), TIER_SPIN_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "tier") return;
    const timer = setTimeout(() => setStage("spotlight"), TIER_RESULT_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "spotlight") return;
    const timer = setTimeout(() => setStage("summary"), SPOTLIGHT_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "reveal") return;
    if (!tierAsset?.soundUrl) return;
    if (pref.muted) return;
    const audio = new Audio(tierAsset.soundUrl);
    audio.volume = 0.7;
    audio.play().catch(() => {
      // Browser may block autoplay; nothing to do.
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, [stage, tierAsset?.soundUrl, pref.muted]);

  useEffect(() => {
    if (stage !== "reveal") return;
    if (!tierAsset?.videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    video.load();
    video.play().catch(() => {
      // Browser may block autoplay; the visible frame is still reset to start.
    });
  }, [stage, revealInstanceKey, tierAsset?.videoUrl]);

  useEffect(() => {
    if (stage !== "reveal") return;
    if (tierAsset?.videoUrl) return;
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setMotionArmed(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [stage, revealInstanceKey, tierAsset?.videoUrl]);

  function resetRevealVideo(video: HTMLVideoElement) {
    video.pause();
    video.currentTime = 0;
    setVideoReady(true);
    video.play().catch(() => {
      // Browser may block autoplay; the visible frame is still reset to start.
    });
  }

  function skipToSummary() {
    setStage("summary");
  }

  return (
    <div
      className="gacha-reveal-overlay"
      data-stage={stage}
      data-tier={highestTier}
      role="dialog"
      aria-modal="true"
      aria-label={localized({ en: "Pack reveal", th: "หน้าสรุปการเปิดแพ็ก" }, language)}
    >
      <div className="gacha-reveal-backdrop" aria-hidden="true" />

      {stage === "summary" && (
        <button
          type="button"
          className="gacha-reveal-back"
          aria-label={localized({ en: "Back to pack detail", th: "กลับไปหน้ารายละเอียดแพ็ก" }, language)}
          onClick={onFinish}
        >
          <ArrowLeft aria-hidden="true" />
          <span><I18nText en="Pack detail" th="รายละเอียดแพ็ก" /></span>
        </button>
      )}

      <button
        type="button"
        className="gacha-reveal-mute"
        aria-label={
          pref.muted
            ? localized({ en: "Unmute sound", th: "เปิดเสียง" }, language)
            : localized({ en: "Mute sound", th: "ปิดเสียง" }, language)
        }
        onClick={() => setMuted(!pref.muted)}
      >
        {pref.muted ? "🔇" : "🔊"}
      </button>

      {stage === "reveal" && (
        <div
          className="gacha-reveal-stage gacha-reveal-show gacha-reveal-pack-open-stage"
          data-shake={animation.screenShake ? "1" : "0"}
        >
          {tierAsset?.videoUrl ? (
            <video
              key={`video-${revealInstanceKey}`}
              ref={videoRef}
              className="gacha-reveal-video"
              src={tierAsset.videoUrl}
              poster={tierAsset.posterUrl ?? undefined}
              autoPlay
              data-ready={videoReady ? "1" : "0"}
              muted={pref.muted}
              playsInline
              preload="metadata"
              onLoadedData={(event) => resetRevealVideo(event.currentTarget)}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = 0;
              }}
              onEnded={() => setStage("tierSpin")}
            />
          ) : (
            <div
              key={`pack-${revealInstanceKey}`}
              className={`pack-open-prototype gacha-reveal-pack-motion ${motionArmed ? "charging" : ""} ${quantity > 1 ? "batch" : "single"} phase-pull rarity-${motionRarity} speed-2`}
              data-animation-key={revealInstanceKey}
              role="group"
              aria-label={localized({ en: "Opening pack animation", th: "แอนิเมชันเปิดแพ็ก" }, language)}
            >
              <div className="pack-open-grain" aria-hidden="true" />
              <div className="pack-open-visual gacha-reveal-pack-motion-visual">
                <div className="pack-open-aura" aria-hidden="true" />
                <span className="pack-open-scanline" aria-hidden="true" />
                <span className="pack-open-flash" aria-hidden="true" />
                <div className="gacha-reveal-pack-motion-layer gacha-reveal-pack-motion-layer-cutout">
                  <PackOpenCutoutMotionImage />
                </div>
                <div className="gacha-reveal-pack-motion-layer gacha-reveal-pack-motion-layer-shell">
                  <div className="pack-open-pack-shell" aria-hidden="true">
                    <div className="pack-open-pack pack-open-pack-base">
                      <OpenPackShellImage />
                    </div>
                    <div className="pack-open-pack-split pack-open-pack-top">
                      <OpenPackShellImage />
                    </div>
                    <div className="pack-open-pack-split pack-open-pack-body">
                      <OpenPackShellImage />
                    </div>
                    <span className="pack-open-tear" />
                    <span className="pack-open-mouth-shadow" aria-hidden="true" />
                    <span className="pack-open-crinkles" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="pack-open-sheen" />
                  </div>
                </div>
                <span className="pack-open-slot" aria-hidden="true" />
                <span className="pack-open-burst" aria-hidden="true" />
                <span className="pack-open-rarity-ring" aria-hidden="true" />
                <div className="gacha-reveal-pack-motion-layer gacha-reveal-pack-motion-layer-card">
                  <div className="pack-open-card-wrap" aria-hidden="true">
                    <div className="gacha-reveal-pack-light-card" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "tierSpin" && (
        <div
          className="gacha-reveal-stage gacha-reveal-tier-result"
          style={
            {
              "--card-ring": highestTierConfig.animation.ringColor,
              "--card-glow": highestTierConfig.animation.glowColor,
            } as CSSProperties
          }
        >
          <div
            className="gacha-reveal-tier-spin-card"
            aria-label={localized({ en: "Prize card spinning", th: "การ์ดรางวัลกำลังหมุน" }, language)}
          >
            <div className="gacha-reveal-tier-spin-face">
              <span>YNOT</span>
            </div>
          </div>
        </div>
      )}

      {stage === "tier" && (
        <div
          className="gacha-reveal-stage gacha-reveal-tier-result"
          style={
            {
              "--card-ring": highestTierConfig.animation.ringColor,
              "--card-glow": highestTierConfig.animation.glowColor,
            } as CSSProperties
          }
        >
          <div
            className="gacha-reveal-tier-card"
            aria-label={localized(
              {
                en: `${tierLabel(highestTier, "en")} prize tier result`,
                th: `ผลรางวัลระดับ${tierLabel(highestTier, "th")}`,
              },
              language,
            )}
          >
            <div className="gacha-reveal-tier-face gacha-reveal-tier-face-back">
              <span>YNOT</span>
            </div>
            <div className="gacha-reveal-tier-face gacha-reveal-tier-face-front">
              <span><I18nText en="Prize tier" th="ระดับรางวัล" /></span>
              <strong>{tierLabel(highestTier, language)}</strong>
              <small>
                {displayedPullCount.toLocaleString()}{" "}
                {language === "th"
                  ? "ครั้ง"
                  : displayedPullCount === 1
                    ? "pull"
                    : "pulls"}
              </small>
            </div>
          </div>
        </div>
      )}

      {stage === "spotlight" && (
        <div
          className="gacha-reveal-stage gacha-reveal-spotlight"
          data-tier={highestTier}
          style={
            {
              "--card-ring": highestTierConfig.animation.ringColor,
              "--card-glow": highestTierConfig.animation.glowColor,
            } as CSSProperties
          }
        >
          <div className="gacha-reveal-spotlight-burst" aria-hidden="true" />
          <div
            className="gacha-reveal-spotlight-card"
          >
            <div className="gacha-reveal-spotlight-frame">
              {featuredItemImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featuredItemImageUrl}
                  alt={featuredItem?.name ?? localized({ en: "Pulled card", th: "การ์ดที่เปิดได้" }, language)}
                />
              ) : (
                <div className="gacha-reveal-spotlight-placeholder">
                  {featuredPlaceholderLabel}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {stage === "summary" && (
        <div className="gacha-reveal-stage gacha-reveal-summary">
          <header className="gacha-reveal-summary-header">
            <p className="gacha-reveal-summary-eyebrow">
              {tierLabel(highestTier, language).toUpperCase()} ·{" "}
              {displayedPullCount.toLocaleString()}{" "}
              {language === "th"
                ? "ครั้ง"
                : displayedPullCount === 1
                  ? "PULL"
                  : "PULLS"}
            </p>
            <h2>{summaryTitle ?? <I18nText en="Your Reward" th="รางวัลของคุณ" />}</h2>
            {summaryNote ? (
              <p className="gacha-reveal-summary-note">{summaryNote}</p>
            ) : null}
          </header>

          <ul className="gacha-reveal-grid" data-quantity={items.length}>
            {items.map((item) => {
              const tier = publicPrizeDisplayTierConfig(item.displayTier);
              const isLastPrize = item.isLastPrize === true;
              const itemImageUrl = isUploadedQuestionPlaceholder(item)
                ? null
                : item.imageUrl;
              const placeholderLabel = isUploadedQuestionPlaceholder(item)
                ? "?"
                : tier.shortLabel;
              return (
                <li
                  key={item.position}
                  className={`gacha-reveal-card${isLastPrize ? " last-prize" : ""}`}
                  data-tier={isLastPrize ? "last-prize" : tier.value}
                  style={
                    {
                      "--card-ring": isLastPrize
                        ? "linear-gradient(135deg, #ffd76a, #e0a316)"
                        : tier.animation.ringColor,
                      "--card-glow": isLastPrize
                        ? "rgba(224, 163, 22, 0.55)"
                        : tier.animation.glowColor,
                    } as CSSProperties
                  }
                >
                  <div className="gacha-reveal-card-frame">
                    {isLastPrize && (
                      <span
                        className="gacha-reveal-card-last-prize"
                        aria-label={localized({ en: "Last one prize", th: "รางวัลสุดท้าย" }, language)}
                      >
                        <I18nText en="LAST ONE PRIZE!" th="รางวัลสุดท้าย!" />
                      </span>
                    )}
                    {itemImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="gacha-reveal-card-image"
                        src={itemImageUrl}
                        alt={item.name}
                        loading="eager"
                      />
                    ) : (
                      <div className="gacha-reveal-card-placeholder">
                        {placeholderLabel}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <footer className="gacha-reveal-summary-footer">
            {(onOpenAgain || onPullAllAgain) && openAgainOptions.length > 0 && (
              <div className="gacha-reveal-repeat-stack">
                {remainingStockLabel && (
                  <p className="gacha-reveal-repeat-stock-left" aria-live="polite">
                    <span><I18nText en="Stock left" th="สต็อกคงเหลือ" /></span>
                    <strong>{remainingStockLabel}</strong>
                  </p>
                )}
                <div
                  className="gacha-reveal-repeat-row"
                  role="group"
                  aria-label={localized({ en: "Pull again", th: "เปิดอีกครั้ง" }, language)}
                >
                  {openAgainOptions.map((option) => {
                    const isPullAll = option.kind === "pull_all";
                    return (
                      <button
                        key={`${option.kind ?? "normal"}-${option.quantity}`}
                        type="button"
                        className={`gacha-reveal-repeat-action${isPullAll ? " cr-pull-all-action" : ""}`}
                        disabled={option.disabled}
                        onClick={() =>
                          isPullAll
                            ? onPullAllAgain?.()
                            : onOpenAgain?.(option.quantity)
                        }
                      >
                        <span>
                          {isPullAll
                            ? <I18nText en="Pull All" th="เปิดทั้งหมด" />
                            : localized({ en: `Pull x${option.quantity}`, th: `เปิด x${option.quantity}` }, language)}
                        </span>
                        {isPullAll ? (
                          <small>
                            {localized(
                              {
                                en: `${option.quantity.toLocaleString()} left`,
                                th: `เหลือ ${option.quantity.toLocaleString("th-TH")}`,
                              },
                              language,
                            )}
                          </small>
                        ) : typeof option.costCoins === "number" ? (
                          <small>
                            {localized(
                              {
                                en: `${option.costCoins.toLocaleString()} coins`,
                                th: `${option.costCoins.toLocaleString("th-TH")} เหรียญ`,
                              },
                              language,
                            )}
                          </small>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              className="gacha-reveal-dock"
              role="group"
              aria-label={localized({ en: "Pack actions", th: "คำสั่งหลังเปิดแพ็ก" }, language)}
            >
              <button
                type="button"
                className="gacha-reveal-dock-action is-primary"
                onClick={onFinish}
              >
                <span className="gacha-reveal-dock-action-label">
                  <I18nText en="Back to pack detail" th="กลับรายละเอียดแพ็ก" />
                </span>
                <span className="gacha-reveal-dock-action-hint">
                  <I18nText en="Open again there" th="เปิดอีกครั้งจากหน้านั้น" />
                </span>
              </button>
              <button
                type="button"
                className="gacha-reveal-dock-action is-ghost"
                onClick={onClose}
              >
                <span className="gacha-reveal-dock-action-label">
                  <I18nText en="View collection" th="ดูคอลเลกชัน" />
                </span>
                <span className="gacha-reveal-dock-action-hint">
                  <I18nText en="Check inventory" th="ตรวจของในกระเป๋า" />
                </span>
              </button>
            </div>
            <label className="gacha-reveal-toggle">
              <input
                type="checkbox"
                checked={pref.autoSkip}
                onChange={(event) => setAutoSkip(event.target.checked)}
              />
              <span><I18nText en="Skip animation next time" th="ข้ามแอนิเมชันครั้งต่อไป" /></span>
            </label>
          </footer>
        </div>
      )}

      {stage !== "summary" && (
        <button
          type="button"
          className="gacha-reveal-skip"
          onClick={skipToSummary}
        >
          <I18nText en="[ SKIP ]" th="[ ข้าม ]" />
        </button>
      )}
    </div>
  );
}
