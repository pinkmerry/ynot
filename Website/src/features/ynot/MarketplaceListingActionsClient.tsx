"use client";

import Link from "next/link";
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
  const {
    listingActionStates,
    openCartDrawer,
    setSummary,
    updateListingActionState,
  } = useMarketplaceCart();
  const {
    busy = null,
    status = null,
    cartSaved = false,
    watchSaved = false,
  } = listingActionStates[listingId] ?? {};

  async function addToCart() {
    if (!canUseAccountActions || cartDisabled) return;
    updateListingActionState(listingId, { busy: "cart", status: null });
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
      updateListingActionState(listingId, {
        cartSaved: true,
        status:
          body?.cart?.status === "already_in_cart"
            ? "Already in cart."
            : "Added to cart.",
      });
      openCartDrawer();
    } catch {
      updateListingActionState(listingId, {
        status: "Could not update cart. Please try again.",
      });
    } finally {
      updateListingActionState(listingId, { busy: null });
    }
  }

  async function watchListing() {
    if (!canUseAccountActions) return;
    updateListingActionState(listingId, { busy: "watch", status: null });
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
      updateListingActionState(listingId, {
        watchSaved: true,
        status:
          body?.watchlist?.status === "already_watched"
            ? "Already in watchlist."
            : "Saved to watchlist.",
      });
    } catch {
      updateListingActionState(listingId, {
        status: "Could not update watchlist. Please try again.",
      });
    } finally {
      updateListingActionState(listingId, { busy: null });
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
              View cart & checkout
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
