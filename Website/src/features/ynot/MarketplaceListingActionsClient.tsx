"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type MarketplaceCartSummaryView,
  useMarketplaceCart,
} from "./MarketplaceCartProvider";

type MarketplaceListingActionsClientProps = {
  listingId: string;
  canUseAccountActions: boolean;
  cartDisabled?: boolean;
  cartDisabledLabel?: string;
};

function nextMutationToken(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    summary?: MarketplaceCartSummaryView;
    cart?: { status?: string };
    watchlist?: { status?: string };
  } | null;
  if (!response.ok) {
    throw new Error("Marketplace request failed.");
  }
  return body;
}

export function MarketplaceListingActionsClient({
  listingId,
  canUseAccountActions,
  cartDisabled = false,
  cartDisabledLabel = "Cart unavailable",
}: MarketplaceListingActionsClientProps) {
  const { openCartDrawer, setSummary } = useMarketplaceCart();
  const [busy, setBusy] = useState<"cart" | "watch" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cartSaved, setCartSaved] = useState(false);
  const [watchSaved, setWatchSaved] = useState(false);

  async function addToCart() {
    if (!canUseAccountActions || cartDisabled) return;
    setBusy("cart");
    setStatus(null);
    try {
      const body = await parseJson(
        await fetch("/api/marketplace/cart/items", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-idempotency-key": nextMutationToken("cart:add"),
          },
          body: JSON.stringify({ listingId }),
        }),
      );
      if (body?.summary) setSummary(body.summary);
      setStatus(
        body?.cart?.status === "already_in_cart"
          ? "Already in cart."
          : "Added to cart.",
      );
      setCartSaved(true);
      openCartDrawer();
    } catch {
      setStatus("Could not update cart. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function watchListing() {
    if (!canUseAccountActions) return;
    setBusy("watch");
    setStatus(null);
    try {
      const body = await parseJson(
        await fetch(`/api/marketplace/watchlist/items/${listingId}`, {
          method: "POST",
          headers: {
            "x-idempotency-key": nextMutationToken("watchlist:watch"),
          },
        }),
      );
      if (body?.summary) setSummary(body.summary);
      setStatus(
        body?.watchlist?.status === "already_watched"
          ? "Already in watchlist."
          : "Saved to watchlist.",
      );
      setWatchSaved(true);
    } catch {
      setStatus("Could not update watchlist. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="marketplace-listing-secondary-actions">
      {canUseAccountActions ? (
        <>
          <button
            type="button"
            className="btn"
            disabled={busy === "cart" || cartDisabled}
            onClick={addToCart}
          >
            {cartDisabled
              ? cartDisabledLabel
              : busy === "cart"
                ? "Adding..."
                : cartSaved
                  ? "In cart"
                  : "Add to cart"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === "watch"}
            onClick={watchListing}
          >
            {busy === "watch"
              ? "Updating..."
              : watchSaved
                ? "Watching"
                : "Watch listing"}
          </button>
        </>
      ) : (
        <>
          {cartDisabled ? (
            <button type="button" className="btn" disabled>
              {cartDisabledLabel}
            </button>
          ) : (
            <Link href="/login" className="btn" prefetch={false}>
              Sign in to add to cart
            </Link>
          )}
          <Link href="/login" className="btn" prefetch={false}>
            Sign in to watch
          </Link>
        </>
      )}
      {status ? (
        <p className="marketplace-action-status" role="status">
          {status}{" "}
          {watchSaved && !cartSaved ? (
            <Link href="/marketplace/watchlist" prefetch={false}>
              View watchlist
            </Link>
          ) : (
            <Link href="/marketplace/cart" prefetch={false}>
              View cart
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
