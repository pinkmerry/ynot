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
    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(145deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))] p-2 text-center text-xs font-black text-white/80">
      <span>{compact ? card.code || card.name.slice(0, 8) : card.name}</span>
    </div>
  );
}
