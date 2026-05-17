"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type OpenMode = "single" | "batch";
type OpenStage = "idle" | "charging" | "revealed";
type PullRarity = "normal" | "rare" | "blackout" | "jackpot";

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
  if (mode === "batch") return 2600;
  if (rarity === "jackpot") return 5200;
  if (rarity === "blackout") return 4700;
  if (rarity === "rare") return 4100;
  return 3200;
}

export function PackOpenPrototype() {
  const [stage, setStage] = useState<OpenStage>("idle");
  const [mode, setMode] = useState<OpenMode>("single");
  const [rarity, setRarity] = useState<PullRarity>("normal");

  useEffect(() => {
    if (stage !== "charging") return;
    const timer = window.setTimeout(() => setStage("revealed"), getOpenDuration(mode, rarity));
    return () => window.clearTimeout(timer);
  }, [mode, rarity, stage]);

  function startOpen(nextMode: OpenMode, forcedRarity?: PullRarity) {
    setMode(nextMode);
    setRarity(forcedRarity ?? (nextMode === "batch" ? "rare" : rollRarity()));
    setStage("charging");
  }

  function reset() {
    setStage("idle");
  }

  const isOpening = stage === "charging";
  const isRevealed = stage === "revealed";

  return (
    <main className={`pack-open-prototype ${stage} ${mode} rarity-${rarity}`}>
      <div className="pack-open-grain" aria-hidden />
      <header className="pack-open-header">
        <a href="/packs" className="pack-open-link">
          Back
        </a>
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
          <div className="pack-open-pack-shell" aria-hidden={isRevealed}>
            <div className="pack-open-pack pack-open-pack-base">
              <Image
                src="/ynot-open-pack-tight.png"
                alt="YNOT sealed slab pack"
                width={720}
                height={1146}
                priority
              />
            </div>
            <div className="pack-open-pack-split pack-open-pack-left">
              <Image
                src="/ynot-open-pack-tight.png"
                alt=""
                width={720}
                height={1146}
                priority
              />
            </div>
            <div className="pack-open-pack-split pack-open-pack-right">
              <Image
                src="/ynot-open-pack-tight.png"
                alt=""
                width={720}
                height={1146}
                priority
              />
            </div>
            <span className="pack-open-tear" />
            <span className="pack-open-sheen" />
          </div>
          <span className="pack-open-slot" aria-hidden />
          <span className="pack-open-burst" aria-hidden />
          <span className="pack-open-rarity-ring" aria-hidden />

          <div className="pack-open-card-wrap" aria-hidden={!isRevealed && !isOpening}>
            <Image
              src="/ynot-open-card-sample.png"
              alt="Sample PSA card reveal"
              width={1058}
              height={1474}
              priority
            />
          </div>

          {mode === "batch" && (
            <div className="pack-open-batch-grid" aria-hidden={!isRevealed}>
              {sampleResults.map((result) => (
                <span
                  key={result.id}
                  className={`pack-open-mini-card rarity-${result.rarity}`}
                >
                  {result.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="pack-open-controls">
          <div className="pack-open-status">
            {stage === "idle" && "Ready"}
            {stage === "charging" && (mode === "single" ? "Opening pack" : "Opening 10 packs")}
            {stage === "revealed" &&
              (mode === "single"
                ? rarity === "jackpot"
                  ? "Museum jackpot"
                  : rarity === "blackout"
                    ? "Blackout hit"
                    : rarity === "rare"
                    ? "Rare pull"
                    : "You pulled"
                : "Results")}
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
