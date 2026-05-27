"use client";

import { ArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  highestPrizeDisplayTier,
  prizeDisplayTierConfig,
  prizeDisplayTierLabel,
  prizeDisplayTierOrder,
  prizeTierAnimationConfig,
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

type RevealStage = "reveal" | "tierSpin" | "tier" | "spotlight" | "summary";
type PullRarity = "normal" | "rare" | "blackout" | "jackpot";

type Props = {
  result: YnotGachaOpenResult;
  quantity: number;
  onClose: () => void;
  onFinish: () => void;
  onOpenAgain?: (quantity: number) => void;
  openAgainOptions?: Array<{
    quantity: number;
    disabled?: boolean;
    costCoins?: number;
  }>;
  tierAnimations?: YnotTierAnimation[];
  forceAnimation?: boolean;
};

const TIER_SPIN_MS = 1450;
const TIER_RESULT_MS = 1600;
const SPOTLIGHT_MS = 2100;

function revealRarity(tier: PrizeDisplayTier): PullRarity {
  if (tier === "rainbow") return "jackpot";
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
    const bestOrder = prizeDisplayTierOrder(best.displayTier);
    const itemOrder = prizeDisplayTierOrder(item.displayTier);
    if (itemOrder < bestOrder) return item;
    if (itemOrder === bestOrder && item.position < best.position) return item;
    return best;
  }, null);
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

export function GachaRevealOverlay({
  result,
  quantity,
  onClose,
  onFinish,
  onOpenAgain,
  openAgainOptions = [],
  tierAnimations,
  forceAnimation = false,
}: Props) {
  const { pref, setAutoSkip, setMuted } = useGachaAnimationPref();
  const [stage, setStage] = useState<RevealStage>(() =>
    pickInitialStage(pref.autoSkip, forceAnimation),
  );

  const items: YnotGachaOpenItem[] = useMemo(
    () => result.items ?? [],
    [result.items],
  );
  const highestTier = useMemo<PrizeDisplayTier>(
    () =>
      items.length
        ? highestPrizeDisplayTier(items.map((item) => item.displayTier))
        : "bronze",
    [items],
  );
  const animation = prizeTierAnimationConfig(highestTier);
  const highestTierConfig = prizeDisplayTierConfig(highestTier);
  const tierAsset = findTierAnimation(tierAnimations, highestTier);
  const featuredItem = useMemo(() => featuredRevealItem(items), [items]);
  const motionRarity = revealRarity(highestTier);
  const revealInstanceKey = `${result.openId}-${quantity}-${highestTier}-${items.length}`;
  const revealDurationMs = tierAsset?.videoUrl
    ? Math.max(1200, tierAsset.durationMs || animation.durationMs)
    : revealMotionDurationMs(motionRarity, quantity);
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
      aria-label="Pack reveal"
    >
      <div className="gacha-reveal-backdrop" aria-hidden="true" />

      {stage === "summary" && (
        <button
          type="button"
          className="gacha-reveal-back"
          aria-label="Back to pack detail"
          onClick={onFinish}
        >
          <ArrowLeft aria-hidden="true" />
          <span>Pack detail</span>
        </button>
      )}

      <button
        type="button"
        className="gacha-reveal-mute"
        aria-label={pref.muted ? "Unmute sound" : "Mute sound"}
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
              preload="auto"
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
              aria-label="Opening pack animation"
            >
                <div className="pack-open-grain" aria-hidden="true" />
              <div className="pack-open-visual gacha-reveal-pack-motion-visual">
                <div className="pack-open-aura" aria-hidden="true" />
                <span className="pack-open-scanline" aria-hidden="true" />
                <span className="pack-open-flash" aria-hidden="true" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="pack-open-cutout-motion"
                  src="/ynot-pack-open-cutout.webp"
                  alt=""
                  aria-hidden="true"
                />
                <div className="pack-open-pack-shell" aria-hidden="true">
                  <div className="pack-open-pack pack-open-pack-base">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ynot-open-pack-bg-removed.png" alt="" />
                  </div>
                  <div className="pack-open-pack-split pack-open-pack-top">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ynot-open-pack-bg-removed.png" alt="" />
                  </div>
                  <div className="pack-open-pack-split pack-open-pack-body">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ynot-open-pack-bg-removed.png" alt="" />
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
                <span className="pack-open-slot" aria-hidden="true" />
                <span className="pack-open-burst" aria-hidden="true" />
                <span className="pack-open-rarity-ring" aria-hidden="true" />
                <div className="pack-open-card-wrap" aria-hidden="true">
                  <div className="gacha-reveal-pack-light-card" />
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
          <div className="gacha-reveal-tier-spin-card" aria-label="Prize card spinning">
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
            aria-label={`${prizeDisplayTierLabel(highestTier)} prize tier result`}
          >
            <div className="gacha-reveal-tier-face gacha-reveal-tier-face-back">
              <span>YNOT</span>
            </div>
            <div className="gacha-reveal-tier-face gacha-reveal-tier-face-front">
              <span>Prize tier</span>
              <strong>{prizeDisplayTierLabel(highestTier)}</strong>
              <small>
                {items.length} {items.length === 1 ? "pull" : "pulls"}
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
              {featuredItem?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featuredItem.imageUrl}
                  alt={featuredItem.name}
                />
              ) : (
                <div className="gacha-reveal-spotlight-placeholder">
                  {highestTierConfig.shortLabel}
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
              {prizeDisplayTierLabel(highestTier).toUpperCase()} · {items.length}{" "}
              {items.length === 1 ? "PULL" : "PULLS"}
            </p>
            <h2>Your haul</h2>
          </header>

          <ul className="gacha-reveal-grid" data-quantity={items.length}>
            {items.map((item) => {
              const tier = prizeDisplayTierConfig(item.displayTier);
              return (
                <li
                  key={item.position}
                  className="gacha-reveal-card"
                  data-tier={tier.value}
                  style={
                    {
                      "--card-ring": tier.animation.ringColor,
                      "--card-glow": tier.animation.glowColor,
                    } as CSSProperties
                  }
                >
                  <div className="gacha-reveal-card-frame">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="gacha-reveal-card-image"
                        src={item.imageUrl}
                        alt={item.name}
                        loading="eager"
                      />
                    ) : (
                      <div className="gacha-reveal-card-placeholder">
                        {tier.shortLabel}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <footer className="gacha-reveal-summary-footer">
            {onOpenAgain && openAgainOptions.length > 0 && (
              <div
                className="gacha-reveal-repeat-row"
                role="group"
                aria-label="Pull again"
              >
                {openAgainOptions.map((option) => (
                  <button
                    key={option.quantity}
                    type="button"
                    className="gacha-reveal-repeat-action"
                    disabled={option.disabled}
                    onClick={() => onOpenAgain(option.quantity)}
                  >
                    <span>Pull x{option.quantity}</span>
                    {typeof option.costCoins === "number" && (
                      <small>{option.costCoins.toLocaleString()} coins</small>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="gacha-reveal-dock" role="group" aria-label="Pack actions">
              <button
                type="button"
                className="gacha-reveal-dock-action is-primary"
                onClick={onFinish}
              >
                <span className="gacha-reveal-dock-action-label">Back to pack detail</span>
                <span className="gacha-reveal-dock-action-hint">Open again there</span>
              </button>
              <button
                type="button"
                className="gacha-reveal-dock-action is-ghost"
                onClick={onClose}
              >
                <span className="gacha-reveal-dock-action-label">View collection</span>
                <span className="gacha-reveal-dock-action-hint">Check inventory</span>
              </button>
            </div>
            <label className="gacha-reveal-toggle">
              <input
                type="checkbox"
                checked={pref.autoSkip}
                onChange={(event) => setAutoSkip(event.target.checked)}
              />
              <span>Skip animation next time</span>
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
          [ SKIP ]
        </button>
      )}
    </div>
  );
}
