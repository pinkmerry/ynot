"use client";

import type { DrawConfig, Lang, Order } from "@/lib/lucky-draw/types";
import {
Check,
Loader2,
Ticket
} from "lucide-react";
import {
copy,
orderLabel
} from "../model";

export function PickView({
  draw,
  lang,
  orders,
  activeOrderId,
  selectedSlots,
  takenSlots,
  isConfirming,
  onOrder,
  onSlot,
  onConfirm,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  activeOrderId: string;
  selectedSlots: number[];
  takenSlots: Set<number>;
  isConfirming: boolean;
  onOrder: (id: string) => void;
  onSlot: (slot: number) => void;
  onConfirm: () => void;
}) {
  const t = copy[lang];
  const pickableOrders = orders.filter((order) => order.status === "approved" || order.status === "picked");
  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const alreadyPicked = activeOrder?.status === "picked";
  const canPick = activeOrder?.status === "approved" && !isConfirming;
  const slots = Array.from({ length: draw.totalSlots }, (_, index) => index + 1);
  const activeOrderSlots = new Set(activeOrder?.slots ?? []);
  const selectedCount = alreadyPicked ? activeOrder?.slots.length ?? 0 : selectedSlots.length;

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.pickNumbers}</p>
          <h2 className="mt-2 text-2xl font-black">{alreadyPicked ? t.alreadyPicked : canPick ? t.chooseExact : t.lockedPick}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {activeOrder
              ? `${activeOrder.id} · ${t.selected} ${selectedCount} / ${activeOrder.quantity}`
              : t.noOrders}
          </p>
        </div>
        <select
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
          value={activeOrderId}
          onChange={(event) => onOrder(event.target.value)}
        >
          {pickableOrders.length === 0 && <option value={activeOrderId}>{t.pending}</option>}
          {pickableOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id} · {order.lineName} · {order.quantity} {t.draws} · {orderLabel(order.status, lang)}
            </option>
          ))}
        </select>
      </div>

      <div className="slot-grid mt-5">
        {slots.map((slot) => {
          const owned = activeOrderSlots.has(slot);
          const taken = takenSlots.has(slot) && !owned;
          const picked = selectedSlots.includes(slot) || owned;
          return (
            <button
              key={slot}
              className={[
                "slot-button aspect-square rounded-2xl border text-sm font-black transition",
                taken ? "border-white/5 bg-black/35 text-white/20" : "",
                !taken && picked ? "border-[var(--gold)] bg-[var(--gold)] text-slate-950 shadow-[0_0_22px_rgba(244,197,66,0.35)]" : "",
                !taken && !picked ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:border-emerald-200" : "",
                !canPick && !taken ? "opacity-45" : "",
              ].join(" ")}
              disabled={taken || !canPick}
              onClick={() => onSlot(slot)}
            >
              {slot}
            </button>
          );
        })}
      </div>

      <button
        className="gold-button mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black disabled:cursor-not-allowed disabled:opacity-70"
        disabled={!activeOrder || isConfirming || activeOrder.status !== "approved" || selectedSlots.length !== activeOrder.quantity}
        aria-busy={isConfirming}
        onClick={onConfirm}
      >
        {isConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : alreadyPicked ? <Check className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
        {isConfirming ? t.savingPick : alreadyPicked ? t.alreadyPicked : t.confirmPick}
      </button>
    </div>
  );
}
