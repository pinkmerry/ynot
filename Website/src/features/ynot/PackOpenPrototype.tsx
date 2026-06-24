"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useStoreLanguage } from "./StorePreferences";
import { I18nText, localized, type Language } from "./i18n";

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

function PackOpenCutoutMotionImage() {
  return (
    <picture>
      <source srcSet="/ynot-pack-open-cutout.avif" type="image/avif" />
      <img
        className="pack-open-cutout-motion"
        src="/ynot-pack-open-cutout.webp"
        alt=""
        aria-hidden
      />
    </picture>
  );
}

function prototypeResultLabel(label: string, language: Language) {
  if (label === "SLAB") return localized({ en: "SLAB", th: "สแลบ" }, language);
  if (label === "MANGA HIT") return localized({ en: "MANGA HIT", th: "การ์ดมังงะ" }, language);
  return label;
}

function getPhaseLabel(
  stage: OpenStage,
  phase: OpenPhase,
  mode: OpenMode,
  rarity: PullRarity,
  language: Language,
) {
  if (stage === "idle") return localized({ en: "Ready", th: "พร้อมเปิด" }, language);
  if (stage === "revealed") {
    if (mode === "batch") return localized({ en: "Results", th: "ผลลัพธ์" }, language);
    if (rarity === "jackpot") return localized({ en: "Museum jackpot", th: "แจ็กพอตระดับโชว์เคส" }, language);
    if (rarity === "blackout") return localized({ en: "Blackout hit", th: "ฮิตระดับพิเศษ" }, language);
    if (rarity === "rare") return localized({ en: "Rare pull", th: "รางวัลแรร์" }, language);
    return localized({ en: "You pulled", th: "คุณเปิดได้" }, language);
  }

  if (phase === "seal") return localized({ en: "Sealing chamber", th: "กำลังเตรียมซอง" }, language);
  if (phase === "scan") {
    return mode === "batch"
      ? localized({ en: "Scanning 10 packs", th: "กำลังสแกน 10 แพ็ก" }, language)
      : localized({ en: "Scanning slab", th: "กำลังสแกนสแลบ" }, language);
  }
  if (phase === "tear") return localized({ en: "Breaking seal", th: "กำลังฉีกซีล" }, language);
  if (phase === "pull") {
    return mode === "batch"
      ? localized({ en: "Revealing results", th: "กำลังเผยผลลัพธ์" }, language)
      : localized({ en: "Pulling card", th: "กำลังดึงการ์ด" }, language);
  }
  return mode === "batch"
    ? localized({ en: "Opening 10 packs", th: "กำลังเปิด 10 แพ็ก" }, language)
    : localized({ en: "Opening pack", th: "กำลังเปิดแพ็ก" }, language);
}

export function PackOpenPrototype() {
  const language = useStoreLanguage();
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
  const status = getPhaseLabel(stage, phase, mode, rarity, language);

  return (
    <main
      className={`pack-open-prototype ${stage} ${mode} phase-${phase} rarity-${rarity} speed-${previewSpeed}`}
    >
      <div className="pack-open-grain" aria-hidden />
      <header className="pack-open-header">
        <Link href="/packs" className="pack-open-link">
          <I18nText en="Back" th="กลับ" />
        </Link>
        <span>YNOT OPEN</span>
        <button className="pack-open-link" type="button" onClick={reset}>
          <I18nText en="Reset" th="รีเซ็ต" />
        </button>
      </header>

      <section
        className="pack-open-stage"
        aria-label={localized({ en: "Pack opening prototype", th: "ต้นแบบหน้าเปิดแพ็ก" }, language)}
      >
        <div className="pack-open-copy">
          <span><I18nText en="Slab Pack Series I" th="ซีรีส์สแลบแพ็ก I" /></span>
          <h1><I18nText en="Open the sealed pack" th="เปิดแพ็กที่ซีลไว้" /></h1>
          <p>
            <I18nText
              en="Luxury prototype using one pack image, one card image, and web motion."
              th="ต้นแบบแอนิเมชันหรูที่ใช้ภาพแพ็ก ภาพการ์ด และ motion บนเว็บ"
            />
          </p>
        </div>

        <div className="pack-open-visual" aria-live="polite">
          <div className="pack-open-aura" aria-hidden />
          <span className="pack-open-scanline" aria-hidden />
          <span className="pack-open-flash" aria-hidden />
          {isOpening && (
            <PackOpenCutoutMotionImage />
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
            <div className="gacha-reveal-pack-light-card" />
          </div>

          {mode === "batch" && (
            <div className="pack-open-batch-grid" aria-hidden={!isRevealed}>
              {sampleResults.map((result, index) => (
                <span
                  key={result.id}
                  className={`pack-open-mini-card rarity-${result.rarity}`}
                  style={{ "--mini-index": index } as CSSProperties}
                >
                  {prototypeResultLabel(result.label, language)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="pack-open-controls">
          <div className="pack-open-status">{status}</div>
          <div
            className="pack-open-speed-control"
            aria-label={localized({ en: "Preview speed", th: "ความเร็วตัวอย่าง" }, language)}
          >
            <span><I18nText en="Preview speed" th="ความเร็วตัวอย่าง" /></span>
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
                <I18nText en="Open 1" th="เปิด 1" />
              </button>
              <button type="button" onClick={() => startOpen("batch")}>
                <I18nText en="Open 10" th="เปิด 10" />
              </button>
              <button type="button" onClick={() => startOpen("single", "normal")}>
                <I18nText en="Clean reveal" th="เปิดแบบปกติ" />
              </button>
              <button type="button" onClick={() => startOpen("single", "rare")}>
                <I18nText en="Silver rare" th="แรร์ซิลเวอร์" />
              </button>
              <button type="button" onClick={() => startOpen("single", "blackout")}>
                <I18nText en="Blackout hit" th="ฮิตพิเศษ" />
              </button>
              <button type="button" onClick={() => startOpen("single", "jackpot")}>
                <I18nText en="Museum jackpot" th="แจ็กพอตโชว์เคส" />
              </button>
            </div>
          ) : (
            <div className="pack-open-actions">
              {stage === "charging" && (
                <button type="button" onClick={() => setStage("revealed")}>
                  <I18nText en="Skip" th="ข้าม" />
                </button>
              )}
              {stage === "revealed" && (
                <>
                  <button type="button" onClick={() => startOpen(mode)}>
                    <I18nText en="Open again" th="เปิดอีกครั้ง" />
                  </button>
                  <button type="button" onClick={reset}>
                    <I18nText en="Done" th="เสร็จแล้ว" />
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
