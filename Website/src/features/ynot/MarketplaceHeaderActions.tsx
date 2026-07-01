"use client";

import Link from "next/link";
import { Heart, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { useMarketplaceCart } from "./MarketplaceCartProvider";

export function MarketplaceHeaderActions({ showAdmin }: { showAdmin?: boolean }) {
  const { openCartDrawer, summary } = useMarketplaceCart();
  return (
    <div className="marketplace-header-actions" aria-label="Marketplace actions">
      <button
        type="button"
        className="marketplace-pill-icon"
        onClick={openCartDrawer}
      >
        <ShoppingBag size={18} aria-hidden="true" />
        <span>Cart</span>
        {summary.cartCount > 0 ? <b>{summary.cartCount}</b> : null}
      </button>
      <Link href="/marketplace/watchlist" className="marketplace-pill-icon" prefetch={false}>
        <Heart size={18} aria-hidden="true" />
        <span>Watchlist</span>
        {summary.watchlistCount > 0 ? <b>{summary.watchlistCount}</b> : null}
      </Link>
      <Link href="/marketplace/seller" className="marketplace-pill-icon" prefetch={false}>
        <Store size={18} aria-hidden="true" />
        <span>Sell</span>
      </Link>
      {showAdmin ? (
        <Link href="/admin/marketplace" className="marketplace-pill-icon" prefetch={false}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Admin</span>
        </Link>
      ) : null}
    </div>
  );
}
