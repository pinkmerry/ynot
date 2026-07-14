"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CheckoutFlow,
  type CheckoutFlowAddress,
  type CheckoutFlowListing,
} from "@/features/marketplace-ui/checkout/CheckoutFlow";
import type {
  MarketplaceCartItem,
  MarketplacePaymentInstructions,
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
      checkoutAddresses: CheckoutFlowAddress[];
      checkoutEnabled: boolean;
      paymentInstructions: MarketplacePaymentInstructions;
    }
  | {
      mode: "watchlist";
      initialItems: MarketplaceWatchlistItem[];
      checkoutAddresses?: never;
      checkoutEnabled?: never;
      paymentInstructions?: never;
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

function isAvailable(item: DisplayItem) {
  return (
    item.listing.listing_state === "active" &&
    item.listing.quantity_available_snapshot > 0
  );
}

function initialCartSelection(items: DisplayItem[]) {
  const officialListingIds = items
    .filter(
      (item) =>
        isAvailable(item) && item.listing.listing_source === "official_shop",
    )
    .slice(0, 3)
    .map((item) => item.listingId);
  if (officialListingIds.length > 0) return officialListingIds;
  const firstAvailable = items.find(isAvailable);
  return firstAvailable ? [firstAvailable.listingId] : [];
}

function checkoutListing(item: MarketplaceCartItem): CheckoutFlowListing {
  return {
    listingId: item.listingId,
    title: item.listing.title,
    photoUrl: item.listing.photo_urls?.[0] ?? null,
    itemPriceSatang: item.listing.item_price_satang,
    gradeLabel: conditionLabel(item),
    isOfficial: item.listing.listing_source === "official_shop",
    listingSource: item.listing.listing_source,
  };
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

export function MarketplaceCartWatchlistClient(
  props: MarketplaceCartWatchlistClientProps,
) {
  const { mode, initialItems, initialSummary } = props;
  const {
    summary,
    setSummary,
    refreshCartSummary,
    updateListingActionState,
  } = useMarketplaceCart();
  const [items, setItems] = useState<DisplayItem[]>(initialItems);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>(() =>
    mode === "cart" ? initialCartSelection(initialItems) : [],
  );
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedItems =
    mode === "cart"
      ? (items.filter((item) =>
          selectedListingIds.includes(item.listingId),
        ) as MarketplaceCartItem[])
      : [];
  const multiSelectionHasUserSeller =
    selectedItems.length > 1 &&
    selectedItems.some(
      (item) => item.listing.listing_source !== "official_shop",
    );
  const canProceedToCheckout =
    mode === "cart" &&
    Boolean(props.checkoutEnabled) &&
    selectedListingIds.length >= 1 &&
    selectedListingIds.length <= 3 &&
    !multiSelectionHasUserSeller;

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
      setSelectedListingIds((current) =>
        current.filter((selectedId) => selectedId !== listingId),
      );
      setCheckoutVisible(false);
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

  function toggleCheckoutListing(item: DisplayItem) {
    if (!isAvailable(item)) return;
    setCheckoutVisible(false);
    setStatus(null);
    setSelectedListingIds((current) => {
      if (current.includes(item.listingId)) {
        return current.filter((listingId) => listingId !== item.listingId);
      }
      if (current.length >= 3) {
        setStatus("You can check out up to 3 items at once.");
        return current;
      }
      const currentItems = items.filter((candidate) =>
        current.includes(candidate.listingId),
      );
      if (
        current.length > 0 &&
        (item.listing.listing_source !== "official_shop" ||
          currentItems.some(
            (candidate) =>
              candidate.listing.listing_source !== "official_shop",
          ))
      ) {
        setStatus(
          "User-seller items still use individual checkout. Select that item by itself.",
        );
        return current;
      }
      return [...current, item.listingId];
    });
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
        <>
          <div className="marketplace-cart-total" aria-label="Cart total">
            <span>Item subtotal</span>
            <strong>{thb(summary.subtotalSatang)}</strong>
            <small>Shipping and service fee appear on checkout.</small>
          </div>
          <div className="marketplace-cart-checkout-toolbar">
            <div>
              <strong>Select up to 3 items</strong>
              <p>
                Official-shop items can be checked out together. User-seller
                items still use individual checkout.
              </p>
              <span>{selectedListingIds.length} selected</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canProceedToCheckout}
              onClick={() => setCheckoutVisible(true)}
            >
              Proceed to checkout
            </button>
          </div>
        </>
      ) : null}

      {mode === "cart" && checkoutVisible && selectedItems.length > 0 ? (
        <section
          id="marketplace-cart-checkout"
          className="marketplace-listing-section marketplace-listing-checkout-section"
          aria-labelledby="marketplace-cart-checkout-title"
        >
          <div>
            <span className="marketplace-card-eyebrow">Cart checkout</span>
            <h2 id="marketplace-cart-checkout-title">Review selected items</h2>
            <p>
              Confirm your shipping address before stock is locked and the
              final server-calculated total is shown.
            </p>
          </div>
          {selectedItems.length === 1 ? (
            <CheckoutFlow
              listing={checkoutListing(selectedItems[0])}
              checkoutEndpoint={
                selectedItems[0].listing.listing_source === "user_seller"
                  ? "/api/marketplace/checkout/user-seller"
                  : "/api/marketplace/checkout/official"
              }
              shippingAddresses={props.checkoutAddresses}
              paymentInstructions={props.paymentInstructions}
              onCartStateChanged={refreshCartSummary}
            />
          ) : (
            <CheckoutFlow
              listings={selectedItems.map(checkoutListing)}
              checkoutEndpoint="/api/marketplace/checkout/groups"
              shippingAddresses={props.checkoutAddresses}
              paymentInstructions={props.paymentInstructions}
              onCartStateChanged={refreshCartSummary}
            />
          )}
        </section>
      ) : null}

      <div className="marketplace-cart-watchlist-grid">
        {items.map((item) => {
          const marketHref = productMarketHref(item);
          const firstPhoto = item.listing.photo_urls?.[0] ?? null;
          const available = isAvailable(item);
          const selected = selectedListingIds.includes(item.listingId);
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
                {mode === "cart" ? (
                  <label className="marketplace-cart-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!available}
                      onChange={() => toggleCheckoutListing(item)}
                    />
                    <span>{selected ? "Selected for checkout" : "Select for checkout"}</span>
                  </label>
                ) : null}
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
