"use client";

import Link from "next/link";
import { useState } from "react";
import { MpBadge, MpBtn, MpEmpty } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { OrderTimeline, type BuyerTimelineOrder } from "./OrderTimeline";

/**
 * "I'm buying" tab — buyer orders with pending-payment ones surfaced first
 * (resume link), the rest expandable to the timeline + dispute affordance.
 * Ported from marketplace-proto-5.jsx buyer tab.
 */

export type BuyingOrderRow = BuyerTimelineOrder & {
  listing_source: "official_shop" | "user_seller";
  buyer_total_satang: number;
  payment_state: string;
  created_at: string;
  title: string | null;
};

function stateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function isPending(order: BuyingOrderRow) {
  return (
    order.payment_state === "pending_payment" ||
    order.payment_state === "payment_submitted"
  );
}

export function BuyingTab({ orders }: { orders: BuyingOrderRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <MpEmpty
        glyph="tag"
        title="No orders yet"
        hint="Buy a card from the marketplace to see it here."
      >
        <Link href="/marketplace">
          <MpBtn variant="primary">Browse marketplace</MpBtn>
        </Link>
      </MpEmpty>
    );
  }

  const sorted = [...orders].sort((a, b) => {
    const ap = isPending(a) ? 0 : 1;
    const bp = isPending(b) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <div className="mp-buying-tab">
      {sorted.map((order) => {
        const pending = isPending(order);
        const open = expanded === order.id;
        return (
          <div key={order.id} className="mp-order-row">
            <div className="mp-order-head">
              <MpBadge kind={order.listing_source === "user_seller" ? "community" : "official"}>
                {order.listing_source === "user_seller" ? "Community" : "Official shop"}
              </MpBadge>
              <strong>{order.title ?? `Order ${order.id.slice(0, 8)}`}</strong>
              <span>{formatThb(order.buyer_total_satang)}</span>
              <span className="mp-small mp-mute">{stateLabel(order.payment_state)}</span>
              {pending ? (
                <Link href={`/marketplace/orders/${order.id}`}>
                  <MpBtn variant="primary" size="sm">
                    Continue payment
                  </MpBtn>
                </Link>
              ) : (
                <MpBtn
                  size="sm"
                  onClick={() => setExpanded(open ? null : order.id)}
                  aria-expanded={open}
                >
                  {open ? "Hide" : "Details"}
                </MpBtn>
              )}
            </div>
            {open && !pending ? <OrderTimeline order={order} /> : null}
          </div>
        );
      })}
    </div>
  );
}
