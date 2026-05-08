"use client";

import { useMemo } from "react";
import type { DrawConfig, Order } from "@/lib/lucky-draw/types";

export function useLuckyDrawDerivedState(draw: DrawConfig, orders: Order[], query: string) {
  const takenSlots = useMemo(
    () => new Set(orders.flatMap((order) => order.slots)),
    [orders],
  );

  const remaining = draw.totalSlots - takenSlots.size;
  const progress = Math.round((takenSlots.size / draw.totalSlots) * 100);
  const filteredOrders = useMemo(
    () => orders.filter((order) => {
      const text = `${order.id} ${order.lineName} ${order.status} ${order.slots.join(",")}`.toLowerCase();
      return text.includes(query.toLowerCase());
    }),
    [orders, query],
  );

  return { takenSlots, remaining, progress, filteredOrders };
}
