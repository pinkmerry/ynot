import Link from "next/link";
import { CheckoutFlow } from "@/features/marketplace-ui/checkout/CheckoutFlow";
import { MarketplaceListingActionsClient } from "./MarketplaceListingActionsClient";
import { MarketplaceListingGallery } from "./MarketplaceListingGallery";
import { MarketplaceStickyCommerceBar } from "./MarketplaceStickyCommerceBar";
import type {
  MarketplaceListingSnapshot,
  MarketplacePaymentInstructions,
} from "@/lib/marketplace/types";

export type MarketplaceListingCheckoutAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  summary: string;
  deliveryNote: string | null;
};

type MarketplaceListingDetailPageProps = {
  listing: MarketplaceListingSnapshot;
  checkoutAddresses: MarketplaceListingCheckoutAddress[];
  canUseAccountActions: boolean;
  canCheckout: boolean;
  checkoutEnabled: boolean;
  paymentInstructions: MarketplacePaymentInstructions;
};

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function itemTypeLabel(value: string | undefined) {
  switch (value) {
    case "sealed_box":
      return "Sealed box";
    case "sealed_pack":
      return "Sealed pack";
    default:
      return "Card";
  }
}

function conditionLabel(listing: MarketplaceListingSnapshot) {
  const gradeService = listing.snapshot_payload?.gradeService;
  const gradeValue = listing.snapshot_payload?.gradeValue;
  if (gradeService && gradeValue) return `${gradeService} ${gradeValue}`;
  return listing.snapshot_payload?.conditionCode ?? "Condition checked";
}

function sourceSummary(source: string) {
  if (source === "user_seller") {
    return "Member seller item checked for YNOT marketplace checkout.";
  }
  return "YNOT official shop stock, ready for payment review and shipment.";
}

function brandLabel(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("one piece") || normalized.includes("zoro")) return "One Piece";
  if (normalized.includes("pokemon") || normalized.includes("pikachu")) return "Pokemon";
  return "Trading cards";
}

function updatedLabel(value: string | null) {
  if (!value) return "Recently listed";
  return new Date(value).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function productCodeLabel(listing: MarketplaceListingSnapshot) {
  const titleCode = listing.title.match(/\b[A-Z]{1,5}\d{0,2}-\d{3}[A-Z]?\b/i)?.[0];
  if (titleCode) return titleCode.toUpperCase();
  const productSlug = listing.snapshot_payload?.productSlug;
  return productSlug ? productSlug.split("-").slice(0, 2).join("-").toUpperCase() : "Card";
}

function sourceHref(productSlug: string | undefined, source: "official_shop" | "user_seller") {
  if (!productSlug) return `/marketplace?source=${source}`;
  return `/marketplace/products/${productSlug}?source=${source}`;
}

function sourceBadge(listing: MarketplaceListingSnapshot) {
  return listing.listing_source === "user_seller"
    ? "Seller consignment"
    : "Official shop";
}

function actionUnavailableLabel(available: boolean, checkoutEnabled: boolean) {
  if (!available) return "Sold out";
  if (!checkoutEnabled) return "Checkout unavailable";
  return null;
}

export function MarketplaceListingDetailPage({
  listing,
  checkoutAddresses,
  canUseAccountActions,
  canCheckout,
  checkoutEnabled,
  paymentInstructions,
}: MarketplaceListingDetailPageProps) {
  const photos = (listing.photo_urls ?? [])
    .filter((photo): photo is string => Boolean(photo))
    .slice(0, 10);
  const productSlug = listing.snapshot_payload?.productSlug;
  const variantLabel =
    listing.snapshot_payload?.variantLabel ?? conditionLabel(listing);
  const itemType = itemTypeLabel(listing.snapshot_payload?.itemType);
  const currentCondition = conditionLabel(listing);
  const isOfficial = listing.listing_source === "official_shop";
  const available =
    listing.listing_state === "active" && listing.quantity_available_snapshot > 0;
  const sourceLabel = listing.snapshot_payload?.sourceBadge ?? sourceBadge(listing);
  const checkoutEndpoint =
    listing.listing_source === "user_seller"
      ? "/api/marketplace/checkout/user-seller"
      : "/api/marketplace/checkout/official";
  const priceLabel = thb(listing.item_price_satang);
  const productMarketHref = productSlug
    ? `/marketplace/products/${productSlug}`
    : "/marketplace";
  const supportHref = `/contact?topic=marketplace-listing&listingId=${encodeURIComponent(
    listing.listing_id,
  )}`;
  const unavailableLabel = actionUnavailableLabel(available, checkoutEnabled);
  const canBuy = available && checkoutEnabled;
  const cartDisabledLabel = available ? "Cart unavailable" : "Sold out";

  return (
    <div className="store-home-grid marketplace-detail-page marketplace-listing-detail-page">
      <div className="store-main-stack">
        <Link href="/marketplace" className="marketplace-back-link" prefetch={false}>
          Marketplace
        </Link>

        <section className="marketplace-listing-hero" aria-labelledby="listing-title">
          <MarketplaceListingGallery photos={photos} title={listing.title} />

          <div className="marketplace-listing-summary">
            <div className="marketplace-listing-source-row">
              <span
                className={`marketplace-source-badge marketplace-source-badge--${listing.listing_source}`}
              >
                {sourceLabel}
              </span>
              <div
                className="marketplace-listing-source-selector"
                aria-label="Choose seller source"
              >
                <Link
                  href={sourceHref(productSlug, "official_shop")}
                  className={isOfficial ? "is-active" : undefined}
                  prefetch={false}
                >
                  Official shop
                </Link>
                <Link
                  href={sourceHref(productSlug, "user_seller")}
                  className={!isOfficial ? "is-active" : undefined}
                  prefetch={false}
                >
                  User seller
                </Link>
              </div>
            </div>

            <h1 id="listing-title">{listing.title}</h1>
            <div className="marketplace-listing-price-row">
              <strong>{priceLabel}</strong>
              <span>{variantLabel}</span>
            </div>
            {!available ? (
              <div className="marketplace-listing-unavailable" role="status">
                This listing is no longer available to buy. You can still watch it
                or compare current offers for this card.
              </div>
            ) : null}
            <div className="marketplace-detail-meta">
              <span>{productCodeLabel(listing)}</span>
              <span>{itemType}</span>
              <span>{currentCondition}</span>
              <span>{listing.quantity_available_snapshot} available</span>
            </div>
            <div className="marketplace-listing-trust-row" aria-label="Marketplace guarantees">
              <span>Authenticity checked</span>
              <span>{isOfficial ? "Official stock" : "Seller item"}</span>
              <span>Secure payment review</span>
              <span>Tracked shipment</span>
            </div>
            <p className="marketplace-listing-description">
              {listing.public_description ??
                "Review the actual item photos, condition, source, and checkout total before payment."}
            </p>
            <div className="marketplace-listing-info-strip">
              <strong>Actual item photos</strong>
              <span>
                Sellers can upload up to 10 images. Check the front, back,
                corners, slab, and label before checkout.
              </span>
            </div>
            <dl className="marketplace-listing-facts">
              <div>
                <dt>Brand</dt>
                <dd>{brandLabel(listing.title)}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>Trading Cards</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{currentCondition}</dd>
              </div>
              <div>
                <dt>Seller source</dt>
                <dd>
                  {listing.seller_public_profile_id ? (
                    <Link
                      href={`/marketplace/sellers/${listing.seller_public_profile_id}`}
                      prefetch={false}
                    >
                      {isOfficial ? "Official shop" : "User seller"}
                    </Link>
                  ) : isOfficial ? (
                    "Official shop"
                  ) : (
                    "User seller"
                  )}
                </dd>
              </div>
              <div>
                <dt>Checkout fee</dt>
                <dd>Shown before payment</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{updatedLabel(listing.updated_at)}</dd>
              </div>
            </dl>
            <div className="marketplace-listing-actions">
              {unavailableLabel ? (
                <span
                  className="btn btn-primary marketplace-disabled-action"
                  aria-disabled="true"
                >
                  {unavailableLabel}
                </span>
              ) : canCheckout ? (
                <a href="#marketplace-checkout" className="btn btn-primary">
                  Buy now
                </a>
              ) : (
                <Link href="/login" className="btn btn-primary" prefetch={false}>
                  Sign in to buy
                </Link>
              )}
              <MarketplaceListingActionsClient
                listingId={listing.listing_id}
                canUseAccountActions={canUseAccountActions}
                cartDisabled={!canBuy}
                cartDisabledLabel={cartDisabledLabel}
              />
              <Link href={supportHref} className="btn" prefetch={false}>
                Ask seller support
              </Link>
              {productSlug ? (
                <>
                  <Link href={productMarketHref} className="btn" prefetch={false}>
                    See product market
                  </Link>
                  <Link
                    href={`${productMarketHref}?limit=24`}
                    className="btn"
                    prefetch={false}
                  >
                    View all offers
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="marketplace-listing-section" aria-labelledby="listing-condition-title">
          <div>
            <span className="marketplace-card-eyebrow">Item details</span>
            <h2 id="listing-condition-title">Condition and seller notes</h2>
            <p>
              Photos show the actual item for this listing. Review the uploaded
              images and condition label before creating the payment order.
            </p>
          </div>
          <dl className="marketplace-listing-detail-grid">
            <div>
              <dt>Product code</dt>
              <dd>{productCodeLabel(listing)}</dd>
            </div>
            <div>
              <dt>Variant</dt>
              <dd>{variantLabel}</dd>
            </div>
            <div>
              <dt>Inventory source</dt>
              <dd>{sourceSummary(listing.listing_source)}</dd>
            </div>
            <div>
              <dt>Listing ID</dt>
              <dd>{listing.listing_id}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>Quoted before payment</dd>
            </div>
            <div>
              <dt>Photo limit</dt>
              <dd>Maximum 10 uploaded item images</dd>
            </div>
          </dl>
        </section>

        <section
          className="marketplace-listing-section marketplace-listing-checkout-section"
          id="marketplace-checkout"
          aria-labelledby="marketplace-checkout-title"
        >
          <div>
            <span className="marketplace-card-eyebrow">Checkout</span>
            <h2 id="marketplace-checkout-title">Review purchase details</h2>
            <p>
              Confirm shipping, service fee, and payment review before the order
              is created.
            </p>
          </div>
          {canCheckout && checkoutEnabled && available ? (
            <CheckoutFlow
              listing={{
                listingId: listing.listing_id,
                title: listing.title,
                photoUrl: photos[0] ?? null,
                itemPriceSatang: listing.item_price_satang,
                gradeLabel: currentCondition,
                isOfficial,
                listingSource: listing.listing_source,
              }}
              checkoutEndpoint={checkoutEndpoint}
              shippingAddresses={checkoutAddresses}
              paymentInstructions={paymentInstructions}
            />
          ) : canCheckout ? (
            <p className="marketplace-listing-unavailable" role="status">
              {available
                ? "Checkout is unavailable right now."
                : "This listing is no longer available to buy."}
            </p>
          ) : (
            <Link href="/login" className="btn btn-primary" prefetch={false}>
              Sign in to checkout
            </Link>
          )}
        </section>
      </div>
      <MarketplaceStickyCommerceBar
        listingId={listing.listing_id}
        conditionLabel={currentCondition}
        priceLabel={priceLabel}
        available={available}
        checkoutEnabled={checkoutEnabled}
        canCheckout={canCheckout}
        canUseAccountActions={canUseAccountActions}
      />
    </div>
  );
}
