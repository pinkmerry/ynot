"use client";

import { Metric, Pill } from "@/components/ui/lucky-draw";
import type { ChaseCard,DrawConfig,FeaturedCard,Lang } from "@/lib/lucky-draw/types";
import {
BadgeCheck,
CreditCard,
ExternalLink,
Globe2,
LogIn,
Play,
Radio,
ShieldCheck,
Ticket,
Video
} from "lucide-react";
import {
copy,
drawStatusLabel,
money
} from "../model";
import { CardArtwork } from "../shared/CardArtwork";

export function HomeView({
  draw,
  lang,
  lineVerified,
  remaining,
  progress,
  sold,
  featuredCards,
  chaseCards,
  onLogin,
  onCheckout,
  onPick,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineVerified: boolean;
  remaining: number;
  progress: number;
  sold: number;
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  onLogin: () => void;
  onCheckout: () => void;
  onPick: () => void;
}) {
  const t = copy[lang];
  const roundCards = [...chaseCards, ...featuredCards];
  return (
    <>
      <div className="glass overflow-hidden rounded-[28px]">
        <div className="relative w-full overflow-hidden bg-black aspect-video">
          {draw.youtubeUrl ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={draw.youtubeUrl}
              title="Lucky Draw live stream"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(244,197,66,0.13),transparent_42%),linear-gradient(135deg,#13172a,#080912)] px-4 text-center">
              <div className="max-w-full">
                <Video className="mx-auto h-10 w-10 text-[var(--gold)]" />
                <p className="mt-3 text-lg font-black">{t.watchStream}</p>
                <p className="mx-auto mt-1 max-w-[26ch] text-wrap text-sm leading-snug text-[var(--muted)]">Add the YouTube embed URL in Admin</p>
              </div>
            </div>
          )}
          <div className={`absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase text-white ${draw.status === "live" ? "bg-rose-500 status-live" : "bg-slate-700"}`}>
            <Radio className="h-3.5 w-3.5" />
            {draw.status === "live" ? t.liveNow : drawStatusLabel(draw.status, lang)}
          </div>
        </div>
        <div className="space-y-4 border-t border-white/10 bg-black/10 p-4 sm:p-5">
          <CardPoster lang={lang} cards={roundCards} onPick={onPick} />
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill icon={<Video />} text={draw.series} />
            <Pill icon={<Globe2 />} text={t.browserReady} />
            <Pill icon={<ShieldCheck />} text={t.lineReady} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.activeDraw}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
            {lang === "th" ? draw.titleTh : draw.titleEn}
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label={t.pricePerDraw} value={`${money(draw.price)} THB`} />
            <Metric label={t.remaining} value={`${remaining}/${draw.totalSlots}`} />
            <Metric label={t.sold} value={`${sold} (${progress}%)`} />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[linear-gradient(135deg,var(--gold-2),var(--gold))]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="gold-button flex h-14 items-center justify-center gap-2 rounded-2xl font-black" disabled={draw.status !== "live"} onClick={onCheckout}>
              <CreditCard className="h-5 w-5" />
              {t.buyNow}
            </button>
            <button className="plain-button flex h-14 items-center justify-center gap-2 rounded-2xl font-black" onClick={onPick}>
              <Ticket className="h-5 w-5" />
              {t.pickNumbers}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <a className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold" href={draw.facebookUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t.openFacebook}
            </a>
            <a className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold" href={draw.youtubeUrl ? draw.youtubeUrl.replace("/embed/", "/") : "#admin-stream"} target="_blank" rel="noreferrer">
              <Play className="h-4 w-4" />
              {t.openYoutube}
            </a>
          </div>
        </div>
      </div>

      <div className="soft-card rounded-[24px] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">{t.lineStatus}</p>
            <p className="text-sm text-[var(--muted)]">{lineVerified ? t.verifiedLine : t.lineReady}</p>
          </div>
          <button className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLogin}>
            {lineVerified ? <BadgeCheck className="h-4 w-4 text-emerald-300" /> : <LogIn className="h-4 w-4" />}
            {lineVerified ? t.reconnectLine : t.loginLine}
          </button>
        </div>
      </div>
    </>
  );
}

function CardPoster({ lang, cards, onPick }: { lang: Lang; cards: FeaturedCard[]; onPick: () => void }) {
  const t = copy[lang];
  const visibleCards = cards.slice(0, 20);
  return (
    <section className="poster-panel overflow-hidden rounded-[24px]">
      <div className="poster-heading">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">{t.roundCards}</p>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">
            {t.roundCardsSub} · {t.showingCards} {visibleCards.length}/{cards.length} · {t.maxCards}
          </p>
        </div>
        <button className="text-xs font-black text-[var(--gold)]" onClick={onPick}>
          {t.pickNumbers}
        </button>
      </div>
      <div className={`poster-grid ${visibleCards.length > 12 ? "poster-grid-dense" : ""}`}>
        {visibleCards.map((card, index) => (
          <MiniCard key={`${card.name}-${index}`} card={card} />
        ))}
      </div>
    </section>
  );
}

function MiniCard({ card }: { card: FeaturedCard }) {
  return (
    <article className="mini-card">
      <div className="card-art-preview">
        <CardArtwork card={card} />
      </div>
      <div className="min-w-0 px-2 py-2">
        <p className="truncate text-[11px] font-bold text-white/85">
          <span className={`series-dot ${card.series === "Pokemon" ? "series-pokemon" : "series-one-piece"}`} />
          {card.name}
        </p>
      </div>
    </article>
  );
}
