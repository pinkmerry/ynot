"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type OpenMode = "single" | "batch";
type OpenStage = "idle" | "charging" | "revealed";
type OpenPhase = "ready" | "seal" | "scan" | "tear" | "pull";
type PullRarity = "normal" | "rare" | "blackout" | "jackpot";
type PreviewSpeed = 1 | 2 | 4;

const previewSpeeds: PreviewSpeed[] = [1, 2, 4];

const sampleResults = Array.from({ length: 10 }, (_, index) => ({
  id: `sample-${index + 1}`,
  label: index === 2 ? "MANGA HIT" : index === 7 ? "PSA 10" : "SLAB",
  rarity: index === 2 ? "jackpot" : index === 7 ? "blackout" : "normal",
}));

function rollRarity(): PullRarity {
  const roll = Math.random();
  if (roll > 0.96) return "jackpot";
  if (roll > 0.88) return "blackout";
  if (roll > 0.72) return "rare";
  return "normal";
}

function getOpenDuration(mode: OpenMode, rarity: PullRarity) {
  if (mode === "batch") return 7600;
  if (rarity === "jackpot") return 8400;
  if (rarity === "blackout") return 7600;
  if (rarity === "rare") return 7600;
  return 7200;
}

function getPhaseLabel(stage: OpenStage, phase: OpenPhase, mode: OpenMode, rarity: PullRarity) {
  if (stage === "idle") return "Ready";
  if (stage === "revealed") {
    if (mode === "batch") return "Results";
    if (rarity === "jackpot") return "Museum jackpot";
    if (rarity === "blackout") return "Blackout hit";
    if (rarity === "rare") return "Rare pull";
    return "You pulled";
  }

  if (phase === "seal") return "Sealing chamber";
  if (phase === "scan") return mode === "batch" ? "Scanning 10 packs" : "Scanning slab";
  if (phase === "tear") return "Breaking seal";
  if (phase === "pull") return mode === "batch" ? "Revealing results" : "Pulling card";
  return mode === "batch" ? "Opening 10 packs" : "Opening pack";
}

export function PackOpenPrototype() {
  const [stage, setStage] = useState<OpenStage>("idle");
  const [phase, setPhase] = useState<OpenPhase>("ready");
  const [mode, setMode] = useState<OpenMode>("single");
  const [rarity, setRarity] = useState<PullRarity>("normal");
  const [previewSpeed, setPreviewSpeed] = useState<PreviewSpeed>(1);

  useEffect(() => {
    if (stage !== "charging") return;
    const duration = getOpenDuration(mode, rarity) / previewSpeed;

    const timers = [
      window.setTimeout(() => setPhase("scan"), duration * 0.2),
      window.setTimeout(() => setPhase("tear"), duration * 0.5),
      window.setTimeout(() => setPhase("pull"), duration * 0.88),
      window.setTimeout(() => setStage("revealed"), duration),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mode, previewSpeed, rarity, stage]);

  function startOpen(nextMode: OpenMode, forcedRarity?: PullRarity) {
    setMode(nextMode);
    setRarity(forcedRarity ?? (nextMode === "batch" ? "rare" : rollRarity()));
    setPhase("seal");
    setStage("charging");
  }

  function reset() {
    setStage("idle");
    setPhase("ready");
  }

  const isOpening = stage === "charging";
  const isRevealed = stage === "revealed";
  const status = getPhaseLabel(stage, phase, mode, rarity);

  return (
    <main
      className={`pack-open-prototype ${stage} ${mode} phase-${phase} rarity-${rarity} speed-${previewSpeed}`}
    >
      <div className="pack-open-grain" aria-hidden />
      <header className="pack-open-header">
        <Link href="/packs" className="pack-open-link">
          Back
        </Link>
        <span>YNOT OPEN</span>
        <button className="pack-open-link" type="button" onClick={reset}>
          Reset
        </button>
      </header>

      <section className="pack-open-stage" aria-label="Pack opening prototype">
        <div className="pack-open-copy">
          <span>Slab Pack Series I</span>
          <h1>Open the sealed pack</h1>
          <p>Luxury prototype using one pack image, one card image, and web motion.</p>
        </div>

        <div className="pack-open-visual" aria-live="polite">
          <div className="pack-open-aura" aria-hidden />
          <span className="pack-open-scanline" aria-hidden />
          <span className="pack-open-flash" aria-hidden />
          {isOpening && (
            <img
              className="pack-open-cutout-motion"
              src="/ynot-pack-open-cutout.webp"
              alt=""
              aria-hidden
            />
          )}
          <div className="pack-open-pack-shell" aria-hidden={isRevealed}>
            <div className="pack-open-pack pack-open-pack-base">
              <Image
                src="/ynot-open-pack-bg-removed.png"
                alt="YNOT sealed slab pack"
                width={896}
                height={1200}
                priority
              />
            </div>
            <div className="pack-open-pack-split pack-open-pack-top">
              <Image
                src="/ynot-open-pack-bg-removed.png"
                alt=""
                width={896}
                height={1200}
                priority
              />
            </div>
            <div className="pack-open-pack-split pack-open-pack-body">
              <Image
                src="/ynot-open-pack-bg-removed.png"
                alt=""
                width={896}
                height={1200}
                priority
              />
            </div>
            <span className="pack-open-tear" />
            <span className="pack-open-mouth-shadow" aria-hidden />
            <span className="pack-open-crinkles" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className="pack-open-sheen" />
          </div>
          <span className="pack-open-slot" aria-hidden />
          <span className="pack-open-burst" aria-hidden />
          <span className="pack-open-rarity-ring" aria-hidden />

          <div className="pack-open-card-wrap" aria-hidden={!isRevealed && !isOpening}>
            <Image
              src="/ynot-open-card-sample-cropped.png"
              alt="Sample PSA card reveal"
              width={727}
              height={1217}
              priority
            />
          </div>

          {mode === "batch" && (
            <div className="pack-open-batch-grid" aria-hidden={!isRevealed}>
              {sampleResults.map((result, index) => (
                <span
                  key={result.id}
                  className={`pack-open-mini-card rarity-${result.rarity}`}
                  style={{ "--mini-index": index } as CSSProperties}
                >
                  {result.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="pack-open-controls">
          <div className="pack-open-status">{status}</div>
          <div className="pack-open-speed-control" aria-label="Preview speed">
            <span>Preview speed</span>
            <div>
              {previewSpeeds.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={previewSpeed === speed ? "is-active" : undefined}
                  onClick={() => setPreviewSpeed(speed)}
                  aria-pressed={previewSpeed === speed}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {stage === "idle" ? (
            <div className="pack-open-actions">
              <button type="button" onClick={() => startOpen("single")}>
                Open 1
              </button>
              <button type="button" onClick={() => startOpen("batch")}>
                Open 10
              </button>
              <button type="button" onClick={() => startOpen("single", "normal")}>
                Clean reveal
              </button>
              <button type="button" onClick={() => startOpen("single", "rare")}>
                Silver rare
              </button>
              <button type="button" onClick={() => startOpen("single", "blackout")}>
                Blackout hit
              </button>
              <button type="button" onClick={() => startOpen("single", "jackpot")}>
                Museum jackpot
              </button>
            </div>
          ) : (
            <div className="pack-open-actions">
              {stage === "charging" && (
                <button type="button" onClick={() => setStage("revealed")}>
                  Skip
                </button>
              )}
              {stage === "revealed" && (
                <>
                  <button type="button" onClick={() => startOpen(mode)}>
                    Open again
                  </button>
                  <button type="button" onClick={reset}>
                    Done
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
