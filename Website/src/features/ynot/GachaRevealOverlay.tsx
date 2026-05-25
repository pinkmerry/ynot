"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  highestPrizeDisplayTier,
  prizeDisplayTierConfig,
  prizeDisplayTierLabel,
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

type RevealStage = "tension" | "reveal" | "summary";

type Props = {
  result: YnotGachaOpenResult;
  quantity: number;
  onBackToQuantity: () => void;
  onClose: () => void;
  onOpenAgain: () => void;
  tierAnimations?: YnotTierAnimation[];
  isPending?: boolean;
};

const TENSION_MS = 1200;

function findTierAnimation(
  animations: YnotTierAnimation[] | undefined,
  tier: PrizeDisplayTier,
): YnotTierAnimation | null {
  return animations?.find((a) => a.tier === tier && a.isActive) ?? null;
}

function pickInitialStage(autoSkip: boolean): RevealStage {
  if (typeof window === "undefined") return "tension";
  if (autoSkip) return "summary";
  if (prefersReducedMotion()) return "summary";
  return "tension";
}

export function GachaRevealOverlay({
  result,
  quantity,
  onBackToQuantity,
  onClose,
  onOpenAgain,
  tierAnimations,
  isPending,
}: Props) {
  const { pref, setAutoSkip, setMuted } = useGachaAnimationPref();
  const [stage, setStage] = useState<RevealStage>(() =>
    pickInitialStage(pref.autoSkip),
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
  const tierAsset = findTierAnimation(tierAnimations, highestTier);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (stage !== "tension") return;
    const timer = setTimeout(() => setStage("reveal"), TENSION_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "reveal") return;
    if (animation.holdToContinue) return;
    const timer = setTimeout(
      () => setStage("summary"),
      animation.durationMs,
    );
    return () => clearTimeout(timer);
  }, [stage, animation.durationMs, animation.holdToContinue]);

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
          aria-label="Back to choose pull quantity"
          onClick={onBackToQuantity}
        >
          <ArrowLeft aria-hidden="true" />
          <span>Choose pulls</span>
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

      {stage === "tension" && (
        <div className="gacha-reveal-stage gacha-reveal-tension">
          <div
            className="gacha-reveal-pack"
            style={
              {
                "--tier-ring": animation.ringColor,
                "--tier-glow": animation.glowColor,
              } as React.CSSProperties
            }
          >
            <div className="gacha-reveal-pack-core">
              <span className="gacha-reveal-pack-label">OPENING</span>
              <span className="gacha-reveal-pack-count">×{quantity}</span>
            </div>
          </div>
          <p className="gacha-reveal-tagline">
            {isPending ? "Securing prize from the vault…" : "Tearing the seal…"}
          </p>
        </div>
      )}

      {stage === "reveal" && (
        <div
          className="gacha-reveal-stage gacha-reveal-show"
          data-shake={animation.screenShake ? "1" : "0"}
        >
          {tierAsset?.videoUrl ? (
            <video
              className="gacha-reveal-video"
              src={tierAsset.videoUrl}
              poster={tierAsset.posterUrl ?? undefined}
              autoPlay
              muted={pref.muted}
              playsInline
              onEnded={() =>
                !animation.holdToContinue && setStage("summary")
              }
            />
          ) : (
            <div
              className="gacha-reveal-mock"
              style={
                {
                  "--tier-ring": animation.ringColor,
                  "--tier-glow": animation.glowColor,
                  "--tier-duration": `${animation.durationMs}ms`,
                } as React.CSSProperties
              }
            >
              <div className="gacha-reveal-mock-ring" />
              <div className="gacha-reveal-mock-flash" />
              <div className="gacha-reveal-mock-label">
                <span>{prizeDisplayTierLabel(highestTier).toUpperCase()}</span>
                <small>
                  {items.length === 1
                    ? "PRIZE INCOMING"
                    : `${items.length} CARDS · HIGHEST: ${prizeDisplayTierLabel(highestTier).toUpperCase()}`}
                </small>
              </div>
            </div>
          )}

          {animation.holdToContinue && (
            <button
              type="button"
              className="gacha-reveal-continue"
              onClick={() => setStage("summary")}
            >
              Tap to reveal cards
            </button>
          )}
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
                    } as React.CSSProperties
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
            <div className="gacha-reveal-dock" role="group" aria-label="Pack actions">
              <button
                type="button"
                className="gacha-reveal-dock-action is-primary"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.assign(`/collection?from=${result.openId}&action=convert`);
                  }
                }}
              >
                <span className="gacha-reveal-dock-action-label">Convert to coins</span>
                <span className="gacha-reveal-dock-action-hint">Pick cards on the next screen</span>
              </button>
              <button
                type="button"
                className="gacha-reveal-dock-action is-ghost"
                onClick={onOpenAgain}
                disabled={Boolean(isPending)}
              >
                <span className="gacha-reveal-dock-action-label">
                  {isPending ? "Opening…" : `Open ${quantity} again`}
                </span>
                <span className="gacha-reveal-dock-action-hint">Same quantity, fresh pull</span>
              </button>
            </div>
            <button
              type="button"
              className="gacha-reveal-secondary"
              onClick={onClose}
            >
              View collection
            </button>
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
