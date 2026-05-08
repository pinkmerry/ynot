"use client";

import { Empty } from "@/components/ui/lucky-draw";
import type { Lang, Order } from "@/lib/lucky-draw/types";
import {
ChevronRight,
ClipboardList,
Eye,
Search
} from "lucide-react";
import {
copy,
money,
orderLabel,
statusClass
} from "../model";
import { SlipVerificationBadge } from "../shared/SlipVerificationBadge";

export function OrdersView({
  lang,
  orders,
  query,
  filteredOrders,
  onQuery,
  onPick,
}: {
  lang: Lang;
  orders: Order[];
  query: string;
  filteredOrders: Order[];
  onQuery: (value: string) => void;
  onPick: (id: string) => void;
}) {
  const t = copy[lang];
  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.orders}</p>
          <h2 className="mt-2 text-2xl font-black">{orders.length} Orders</h2>
        </div>
        <ClipboardList className="h-8 w-8 text-[var(--gold)]" />
      </div>
      <label className="mt-5 flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4">
        <Search className="h-4 w-4 text-[var(--muted)]" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          placeholder={t.searchOrder}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="mt-5 space-y-3">
        {filteredOrders.length === 0 && <Empty text={t.noOrders} />}
        {filteredOrders.map((order) => (
          <OrderCard key={order.id} lang={lang} order={order} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}


function OrderCard({ lang, order, onPick }: { lang: Lang; order: Order; onPick: (id: string) => void }) {
  const t = copy[lang];
  const canPick = order.status === "approved";
  const canViewPicked = order.status === "picked";
  return (
    <article className="soft-card rounded-3xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black">{order.id}</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(order.status)}`}>
              {orderLabel(order.status, lang)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {order.lineName} / {order.quantity} {t.draws} / {money(order.amount)} THB
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {order.slots.length
              ? `${t.selected}: ${order.slots.join(", ")}`
              : `${t.uploadSlip}: ${order.hasSlipFile ? order.slipName : t.manualSlip}`}
          </p>
          <SlipVerificationBadge lang={lang} order={order} />
        </div>
        <button
          className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 font-bold"
          disabled={!canPick && !canViewPicked}
          onClick={() => onPick(order.id)}
        >
          {canPick ? <ChevronRight className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {canPick ? t.pickNumbers : canViewPicked ? t.viewPicked : orderLabel(order.status, lang)}
        </button>
      </div>
    </article>
  );
}
