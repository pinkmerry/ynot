"use client";

import { Row } from "@/components/ui/lucky-draw";
import type { DrawConfig, Lang, Order } from "@/lib/lucky-draw/types";
import {
Settings,
UserRound
} from "lucide-react";
import {
copy,
money
} from "../model";

export function StatusPanel({
  draw,
  lang,
  lineVerified,
  remaining,
  sold,
  orders,
  onLogin,
  onProfile,
  isAdmin,
  onAdmin,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineVerified: boolean;
  remaining: number;
  sold: number;
  orders: Order[];
  onLogin: () => void;
  onProfile: () => void;
  isAdmin: boolean;
  onAdmin: () => void;
}) {
  const t = copy[lang];
  return (
    <>
      <div className="glass rounded-[28px] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">Control</p>
        <button className="plain-button mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onLogin}>
          <UserRound className="h-4 w-4" />
          {lineVerified ? t.reconnectLine : t.loginLine}
        </button>
        <button className="plain-button mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onProfile}>
          <UserRound className="h-4 w-4" />
          {t.profile}
        </button>
        {isAdmin && (
          <button className="plain-button mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onAdmin}>
            <Settings className="h-4 w-4" />
            {t.openAdmin}
          </button>
        )}
      </div>
      <div className="glass rounded-[28px] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">Snapshot</p>
        <div className="mt-4 space-y-3">
          <Row label={t.pricePerDraw} value={`${money(draw.price)} THB`} strong />
          <Row label={t.remaining} value={String(remaining)} strong />
          <Row label={t.sold} value={String(sold)} strong />
          <Row label={t.orders} value={String(orders.length)} strong />
        </div>
      </div>
    </>
  );
}
