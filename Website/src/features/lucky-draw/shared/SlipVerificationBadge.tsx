"use client";

import { ShieldCheck } from "lucide-react";
import type { Lang, Order } from "@/lib/lucky-draw/types";
import { slipVerificationClass, slipVerificationLabel } from "../model";

export function SlipVerificationBadge({ lang, order }: { lang: Lang; order: Order }) {
  if (order.slipProvider === "manual_line" && order.slipVerificationStatus === "manual_review") {
    return null;
  }

  return (
    <span className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${slipVerificationClass(order.slipVerificationStatus)}`}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{slipVerificationLabel(order.slipVerificationStatus, lang)}</span>
      {order.slipProviderCode && <span className="font-mono opacity-75">{order.slipProviderCode}</span>}
    </span>
  );
}
