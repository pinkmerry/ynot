"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MpIcon } from "../shared/MpIcon";

/**
 * Reusable "notify me" button for a single product. POSTs to the real
 * /api/marketplace/alerts route (backed by
 * src/app/api/ynot/marketplace/alerts/route.ts) with the idempotency header
 * that route's prepareMarketplaceMutation()/marketplaceIdempotencyKey()
 * requires (see src/lib/marketplace/request-guard.ts — "idempotency-key",
 * with "x-idempotency-key" accepted as a fallback there, but we always send
 * the primary header name).
 *
 * This component is defined here (browse) but is product-scoped: it takes a
 * productId and is meant to be rendered from a product-detail page, not from
 * the browse grid itself (alerts are not productless — see BrowsePage's empty
 * state, which links to an individual card page instead of wiring an alert
 * here).
 *
 * Kept self-contained: it owns its own pending/toast-message state rather
 * than depending on a toast provider, so it can be dropped into any surface
 * (product detail page, empty state hint, etc.) without extra wiring.
 */

export interface AlertButtonProps {
  productId: string;
  label?: string;
}

type AlertButtonStatus =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "unauthenticated" };

async function postProductAlert(productId: string) {
  const response = await fetch("/api/marketplace/alerts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({ productId }),
  });

  if (response.status === 401) {
    return { ok: false as const, unauthenticated: true as const };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  if (!response.ok || record.ok !== true) {
    const message =
      typeof record.error === "string" ? record.error : "Could not save this alert.";
    return { ok: false as const, unauthenticated: false as const, message };
  }

  return { ok: true as const };
}

export function AlertButton({ productId, label }: AlertButtonProps) {
  const [status, setStatus] = useState<AlertButtonStatus>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await postProductAlert(productId);
      if (result.ok) {
        setStatus({ kind: "success" });
        return;
      }
      if (result.unauthenticated) {
        setStatus({ kind: "unauthenticated" });
        return;
      }
      setStatus({ kind: "error", message: result.message });
    });
  }

  if (status.kind === "unauthenticated") {
    return (
      <Link href="/login" className="mp-btn">
        <MpIcon name="bell" size={13} /> Log in to set an alert
      </Link>
    );
  }

  return (
    <div className="mp-stack" style={{ gap: 6 }}>
      <button
        type="button"
        className="mp-btn mp-btn-primary"
        onClick={handleClick}
        disabled={isPending || status.kind === "success"}
      >
        <MpIcon name="bell" size={13} />
        {status.kind === "success" ? "Alert saved" : (label ?? "Notify me when listed")}
      </button>
      {status.kind === "error" ? (
        <span className="mp-small" style={{ color: "var(--mp-rose)" }}>
          {status.message}
        </span>
      ) : null}
    </div>
  );
}
