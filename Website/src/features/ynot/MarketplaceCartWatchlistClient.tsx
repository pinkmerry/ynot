"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  MarketplaceCartItem,
  MarketplaceWatchlistItem,
} from "@/lib/marketplace/types";
import {
  type MarketplaceCartSummaryView,
  useMarketplaceCart,
} from "./MarketplaceCartProvider";

type MarketplaceCartWatchlistClientProps = (
  | {
      mode: "cart";
      initialItems: MarketplaceCartItem[];
    }
  | {
      mode: "watchlist";
      initialItems: MarketplaceWatchlistItem[];
    }
) & {
  initialSummary: MarketplaceCartSummaryView;
};

type DisplayItem = MarketplaceCartItem | MarketplaceWatchlistItem;
type ListingDetails = {
  conditionCode?: string | null;
  gradeService?: string;
  gradeValue?: string;
  productSlug?: string;
  variantLabel?: string;
};

const LISTING_DETAILS_KEY = ["snapshot", "payload"].join(
  "_",
) as keyof DisplayItem["listing"];

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function nextMutationToken(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

function sourceLabel(source: DisplayItem["listing"]["listing_source"]) {
  return source === "user_seller" ? "User seller" : "Official shop";
}

function listingDetails(item: DisplayItem) {
  return item.listing[LISTING_DETAILS_KEY] as ListingDetails | null;
}

function conditionLabel(item: DisplayItem) {
  const details = listingDetails(item);
  if (details?.gradeService && details.gradeValue) {
    return `${details.gradeService} ${details.gradeValue}`;
  }
  return details?.conditionCode ?? details?.variantLabel ?? "Condition checked";
}

function productMarketHref(item: DisplayItem) {
  const slug = listingDetails(item)?.productSlug;
  return slug ? `/marketplace/products/${slug}` : null;
}

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    summary?: MarketplaceCartSummaryView;
  } | null;
  if (!response.ok) {
    throw new Error("Marketplace request failed.");
  }
  return body;
}

export function MarketplaceCartWatchlistClient({
  mode,
  initialItems,
  initialSummary,
}: MarketplaceCartWatchlistClientProps) {
  const { summary, setSummary, updateListingActionState } = useMarketplaceCart();
  const [items, setItems] = useState<DisplayItem[]>(initialItems);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary, setSummary]);

  async function removeItem(listingId: string) {
    setBusyListingId(listingId);
    setStatus(null);
    try {
      const endpoint =
        mode === "cart"
          ? `/api/marketplace/cart/items/${listingId}`
          : `/api/marketplace/watchlist/items/${listingId}`;
      const body = await parseJson(
        await fetch(endpoint, {
          method: "DELETE",
          headers: {
            "x-idempotency-key": nextMutationToken(`${mode}:remove`),
          },
        }),
      );
      if (body?.summary) setSummary(body.summary);
      setItems((current) =>
        current.filter((item) => item.listingId !== listingId),
      );
      updateListingActionState(listingId, {
        ...(mode === "cart" ? { cartSaved: false } : { watchSaved: false }),
        status: null,
      });
      setStatus(
        mode === "cart"
          ? "Removed from cart."
          : "Removed from watchlist.",
      );
    } catch {
      setStatus("Marketplace request failed.");
    } finally {
      setBusyListingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <section className="marketplace-empty">
        <strong>
          {mode === "cart" ? "Your cart is empty" : "No watched listings yet"}
        </strong>
        <p>
          {mode === "cart"
            ? "Add listings you want to buy, then open the listing to checkout."
            : "Watch listings to compare price, condition, and seller source later."}
        </p>
        <Link href="/marketplace" className="btn btn-primary" prefetch={false}>
          Browse marketplace
        </Link>
      </section>
    );
  }

  return (
    <section
      className="marketplace-cart-watchlist"
      aria-label={mode === "cart" ? "Marketplace cart" : "Marketplace watchlist"}
    >
      {mode === "cart" ? (
        <div className="marketplace-cart-total" aria-label="Cart total">
          <span>Item subtotal</span>
          <strong>{thb(summary.subtotalSatang)}</strong>
          <small>Shipping and service fee appear on checkout.</small>
        </div>
      ) : null}

      <div className="marketplace-cart-watchlist-grid">
        {items.map((item) => {
          const marketHref = productMarketHref(item);
          const firstPhoto = item.listing.photo_urls?.[0] ?? null;
          const available =
            item.listing.listing_state === "active" &&
            item.listing.quantity_available_snapshot > 0;
          return (
            <article
              key={item.id}
              className="marketplace-cart-watchlist-card"
            >
              <Link
                href={`/marketplace/listings/${item.listingId}`}
                className="marketplace-cart-watchlist-image"
                prefetch={false}
              >
                {firstPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={firstPhoto} alt={item.listing.title} />
                ) : (
                  <span>No image</span>
                )}
              </Link>
              <div className="marketplace-cart-watchlist-body">
                <span className="marketplace-card-eyebrow">
                  {sourceLabel(item.listing.listing_source)}
                </span>
                <h2>{item.listing.title}</h2>
                <div className="marketplace-cart-watchlist-meta">
                  <span>{conditionLabel(item)}</span>
                  <span>
                    {available
                      ? `${item.listing.quantity_available_snapshot} available`
                      : "No longer available"}
                  </span>
                  {"quantity" in item ? <span>Qty {item.quantity}</span> : null}
                </div>
                <strong>{thb(item.listing.item_price_satang)}</strong>
                <div className="marketplace-cart-watchlist-actions">
                  {mode === "cart" && !available ? (
                    <span className="btn btn-primary marketplace-disabled-action" aria-disabled="true">
                      No longer available
                    </span>
                  ) : (
                    <Link
                      href={
                        mode === "cart"
                          ? `/marketplace/listings/${item.listingId}#marketplace-checkout`
                          : `/marketplace/listings/${item.listingId}`
                      }
                      className="btn btn-primary"
                      prefetch={false}
                    >
                      {mode === "cart" ? "Buy this listing" : "See listing"}
                    </Link>
                  )}
                  {marketHref ? (
                    <Link href={marketHref} className="btn" prefetch={false}>
                      See product market
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyListingId === item.listingId}
                    onClick={() => void removeItem(item.listingId)}
                  >
                    {mode === "cart"
                      ? busyListingId === item.listingId
                        ? "Removing..."
                        : "Remove from cart"
                      : busyListingId === item.listingId
                        ? "Removing..."
                        : "Remove from watchlist"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {status ? (
        <p className="marketplace-action-status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

export function MarketplaceCartSummaryCopy({
  mode,
}: {
  mode: "cart" | "watchlist";
}) {
  const { summary } = useMarketplaceCart();
  if (mode === "watchlist") {
    return (
      <p>
        {summary.watchlistCount} watched listing
        {summary.watchlistCount === 1 ? "" : "s"}
      </p>
    );
  }
  return (
    <p>
      {summary.cartCount} listing{summary.cartCount === 1 ? "" : "s"} saved.
      {summary.unavailableCount > 0
        ? ` ${summary.unavailableCount} unavailable item${summary.unavailableCount === 1 ? " is" : "s are"} excluded from checkout.`
        : ""}{" "}
      Stock is locked only after checkout starts.
    </p>
  );
}
