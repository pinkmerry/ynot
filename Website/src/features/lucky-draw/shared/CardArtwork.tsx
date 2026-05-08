"use client";

import Image from "next/image";
import type { FeaturedCard } from "@/lib/lucky-draw/types";

export function CardArtwork({ card, compact }: { card: FeaturedCard; compact?: boolean }) {
  if (card.photoUrl) {
    return (
      <Image
        src={card.photoUrl}
        alt={card.name}
        fill
        sizes={compact ? "96px" : "180px"}
        className="object-cover"
      />
    );
  }

  return (
    <div
      className={[
        "absolute inset-0 grid place-items-center p-2 text-center text-xs font-black",
        card.tone === "gold" ? "bg-amber-400/20 text-amber-100" : "",
        card.tone === "red" ? "bg-rose-500/20 text-rose-100" : "",
        card.tone === "blue" ? "bg-sky-500/20 text-sky-100" : "",
        card.tone === "green" ? "bg-emerald-500/20 text-emerald-100" : "",
        card.tone === "rose" ? "bg-pink-500/20 text-pink-100" : "",
        card.tone === "violet" ? "bg-violet-500/20 text-violet-100" : "",
      ].join(" ")}
    >
      <span>{compact ? card.code || card.name.slice(0, 8) : card.name}</span>
    </div>
  );
}
