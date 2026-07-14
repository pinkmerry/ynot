"use client";

import { useMarketplaceCart } from "@/features/ynot/MarketplaceCartProvider";
import { MpIcon } from "../shared/MpIcon";

export function MarketplaceCartTrigger() {
  const { summary, drawerOpen, openCartDrawer } = useMarketplaceCart();

  return (
    <button
      type="button"
      className="mp-icon-btn mp-cart-trigger"
      onClick={openCartDrawer}
      aria-label={`Cart, ${summary.cartCount} ${summary.cartCount === 1 ? "item" : "items"}`}
      aria-haspopup="dialog"
      aria-controls={drawerOpen ? "marketplace-cart-drawer" : undefined}
      aria-expanded={drawerOpen}
    >
      <MpIcon name="bag" size={16} aria-hidden="true" focusable="false" />
      {summary.cartCount > 0 ? (
        <span className="mp-cart-count" aria-hidden="true">
          {summary.cartCount > 99 ? "99+" : summary.cartCount}
        </span>
      ) : null}
    </button>
  );
}
