"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useMarketplaceCart } from "./MarketplaceCartProvider";

type DrawerItem = {
  id: string;
  listingId: string;
  listing: {
    title: string;
    itemPriceSatang: number;
    currency: "THB";
    photoUrls: string[];
    listingSource: "official_shop" | "user_seller";
    listingState: string;
    quantityAvailableSnapshot: number;
  };
};

type DrawerBody = {
  cart?: DrawerItem[];
  summary?: {
    cartCount: number;
    watchlistCount: number;
    subtotalSatang: number;
    unavailableCount: number;
    currency: "THB";
    updatedAt: string | null;
  };
};

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

export function MarketplaceCartDrawer() {
  const {
    closeCartDrawer,
    drawerOpen,
    summary,
    setSummary,
    updateListingActionState,
  } = useMarketplaceCart();
  const [items, setItems] = useState<DrawerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setNotice(null);
    });
    fetch("/api/marketplace/cart", { headers: { accept: "application/json" } })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as DrawerBody | null;
        if (!response.ok) throw new Error("Could not load cart.");
        if (!cancelled) {
          setItems(result?.cart ?? []);
          if (result?.summary) setSummary(result.summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotice("Could not load cart.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, setSummary]);

  async function removeItem(listingId: string) {
    setBusyListingId(listingId);
    setNotice(null);
    try {
      const response = await fetch(`/api/marketplace/cart/items/${listingId}`, {
        method: "DELETE",
        headers: {
          "x-idempotency-key": nextMutationToken("cart:remove"),
        },
      });
      const result = (await response.json().catch(() => null)) as DrawerBody | null;
      if (!response.ok) throw new Error("Could not remove item.");
      setItems((current) => current.filter((item) => item.listingId !== listingId));
      if (result?.summary) setSummary(result.summary);
      updateListingActionState(listingId, { cartSaved: false, status: null });
      setNotice("Removed from cart.");
    } catch {
      setNotice("Could not remove item.");
    } finally {
      setBusyListingId(null);
    }
  }

  if (!drawerOpen) return null;

  return (
    <aside className="marketplace-cart-drawer" aria-label="Cart">
      <div className="marketplace-cart-drawer-panel">
        <div className="marketplace-cart-drawer-head">
          <div>
            <strong>Cart</strong>
            <span>
              {summary.cartCount} listing
              {summary.cartCount === 1 ? "" : "s"} saved
            </span>
          </div>
          <button
            type="button"
            className="marketplace-icon-button"
            aria-label="Close cart"
            onClick={closeCartDrawer}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {loading ? <p className="marketplace-muted">Loading cart</p> : null}
        {notice ? (
          <p className="marketplace-action-status" role="status">
            {notice}
          </p>
        ) : null}
        {!loading && items.length === 0 ? (
          <div className="marketplace-empty compact">
            <strong>Your cart is empty</strong>
            <Link href="/marketplace" onClick={closeCartDrawer}>
              Browse marketplace
            </Link>
          </div>
        ) : null}
        <div className="marketplace-cart-drawer-list">
          {items.slice(0, 5).map((item) => {
            const image = item.listing.photoUrls?.[0] ?? "";
            const available =
              item.listing.listingState === "active" &&
              item.listing.quantityAvailableSnapshot > 0;
            return (
              <div key={item.id} className="marketplace-cart-drawer-row">
                <Link
                  href={`/marketplace/listings/${item.listingId}`}
                  className="marketplace-cart-drawer-link"
                  onClick={closeCartDrawer}
                >
                  <span style={image ? { backgroundImage: `url(${image})` } : undefined} />
                  <div>
                    <strong>{item.listing.title}</strong>
                    <small>
                      {available
                        ? item.listing.listingSource === "official_shop"
                          ? "Official shop"
                          : "User seller"
                        : "No longer available"}
                    </small>
                  </div>
                  <b>{thb(item.listing.itemPriceSatang)}</b>
                </Link>
                <button
                  type="button"
                  className="marketplace-cart-drawer-remove"
                  disabled={busyListingId === item.listingId}
                  onClick={() => void removeItem(item.listingId)}
                >
                  {busyListingId === item.listingId ? "Removing" : "Remove"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="marketplace-cart-drawer-foot">
          <span>Item subtotal</span>
          <strong>{thb(summary.subtotalSatang)}</strong>
          <Link href="/marketplace/cart" className="btn btn-primary" onClick={closeCartDrawer}>
            View cart
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="marketplace-cart-drawer-backdrop"
        aria-label="Close cart"
        onClick={closeCartDrawer}
      />
    </aside>
  );
}
