import Link from "next/link";
import { MarketplaceListingActionsClient } from "./MarketplaceListingActionsClient";

type MarketplaceStickyCommerceBarProps = {
  listingId: string;
  conditionLabel: string;
  priceLabel: string;
  available: boolean;
  checkoutEnabled: boolean;
  canUseAccountActions: boolean;
  canCheckout: boolean;
};

export function MarketplaceStickyCommerceBar({
  listingId,
  conditionLabel,
  priceLabel,
  available,
  checkoutEnabled,
  canUseAccountActions,
  canCheckout,
}: MarketplaceStickyCommerceBarProps) {
  const canBuy = available && checkoutEnabled;
  const disabledLabel = available ? "Checkout unavailable" : "Sold out";

  return (
    <aside className="marketplace-listing-action-bar" aria-label="Listing purchase actions">
      <div>
        <span>{available ? conditionLabel : "No stock available"}</span>
        <strong>{priceLabel}</strong>
      </div>
      {canBuy ? (
        canCheckout ? (
          <a href="#marketplace-checkout" className="btn btn-primary">
            Buy now
          </a>
        ) : (
          <Link href="/login" className="btn btn-primary" prefetch={false}>
            Sign in to buy
          </Link>
        )
      ) : (
        <span className="btn btn-primary marketplace-disabled-action" aria-disabled="true">
          {disabledLabel}
        </span>
      )}
      <MarketplaceListingActionsClient
        listingId={listingId}
        canUseAccountActions={canUseAccountActions}
        cartDisabled={!canBuy}
        cartDisabledLabel={disabledLabel}
      />
    </aside>
  );
}
