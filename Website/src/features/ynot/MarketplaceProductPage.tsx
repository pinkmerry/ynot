import Link from "next/link";
import type { MarketplaceListingSnapshot } from "@/lib/marketplace/types";

type ProductMarket = {
  product: {
    id: string;
    product_slug: string;
    title: string;
    brand: string | null;
    category: string | null;
    series_name: string | null;
    set_name: string | null;
    card_code: string | null;
    language: string | null;
    hero_image_url: string | null;
    active_listing_count: number;
    lowest_price_satang: number | null;
    sold_count: number;
  };
  variants: Array<{
    id: string;
    variant_slug: string;
    variant_label: string;
    condition_bucket: string;
    grade_service: string | null;
    grade_value: string | null;
    active_listing_count: number;
    image_urls: string[];
  }>;
  listings: MarketplaceListingSnapshot[];
  priceHistory: Array<{
    id: string;
    item_price_satang: number;
    currency: string;
    sold_at: string;
    condition_bucket: string;
    grade_service: string | null;
    grade_value: string | null;
  }>;
};

const TRUST_ITEMS = [
  "Authentic",
  "Seller protection",
  "Secure transfer",
  "Verified inventory",
];

function thb(amountSatang: number | null) {
  if (amountSatang === null) return "No offers yet";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function filterHref(productSlug: string, grade: string | null) {
  const params = new URLSearchParams();
  if (grade?.startsWith("raw_")) {
    params.set("condition", grade);
  } else if (grade) {
    params.set("grade", grade);
  }
  const query = params.toString();
  return `/marketplace/products/${productSlug}${query ? `?${query}` : ""}`;
}

function listingHref(listing: MarketplaceListingSnapshot) {
  return `/marketplace/listings/${listing.listing_id}`;
}

function listingPhoto(listing: MarketplaceListingSnapshot) {
  return listing.photo_urls?.[0] ?? null;
}

function listingGradeLabel(listing: MarketplaceListingSnapshot) {
  return (
    listing.snapshot_payload?.conditionCode ??
    listing.snapshot_payload?.variantLabel ??
    listing.snapshot_payload?.sourceBadge ??
    "Item"
  );
}

export function MarketplaceProductPage({
  market,
  selectedGrade = null,
}: {
  market: ProductMarket;
  selectedGrade?: string | null;
}) {
  const heroImage = market.product.hero_image_url;
  const thumbnailUrls = [
    heroImage,
    ...market.variants.flatMap((variant) => variant.image_urls.slice(0, 1)),
  ].filter((value): value is string => Boolean(value));
  const meta = [
    market.product.brand,
    market.product.set_name,
    market.product.card_code,
    market.product.language,
  ].filter(Boolean);
  const variantFilters = [
    {
      label: "All",
      value: null,
      count: market.product.active_listing_count,
    },
    ...market.variants.map((variant) => ({
      label: variant.variant_label,
      value: variant.condition_bucket,
      count: variant.active_listing_count,
    })),
  ];
  const visibleHistory = market.priceHistory.slice(0, 6);
  const relatedVariants = market.variants.slice(0, 8);

  return (
    <div className="marketplace-product-page">
      <div className="marketplace-product-shell">
        <Link href="/marketplace" className="marketplace-back-link" prefetch={false}>
          Back to marketplace
        </Link>

        <section className="marketplace-product-gallery" aria-label="Product images">
          <div
            className="marketplace-product-art"
            aria-label={market.product.title}
            style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
          >
            {!heroImage ? <span>{market.product.title.slice(0, 1)}</span> : null}
          </div>
          {thumbnailUrls.length > 0 ? (
            <div className="marketplace-product-thumbnails" aria-label="Product thumbnails">
              {thumbnailUrls.slice(0, 16).map((url, index) => (
                <span
                  key={`${url}-${index}`}
                  className={index === 0 ? "is-active" : undefined}
                  style={{ backgroundImage: `url(${url})` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="marketplace-product-summary">
          <h1>{market.product.title}</h1>
          {meta.length > 0 ? <p>{meta.join(" / ")}</p> : null}

          <div className="marketplace-variant-strip" aria-label="Variant filters">
            {variantFilters.map((filter, index) => {
              const active = filter.value === selectedGrade;
              return (
                <Link
                  key={`${filter.label}-${index}`}
                  href={filterHref(market.product.product_slug, filter.value)}
                  className={
                    active
                      ? "marketplace-variant-chip is-active"
                      : "marketplace-variant-chip"
                  }
                  prefetch={false}
                >
                  <span>{filter.label}</span>
                  <small>{filter.count}</small>
                </Link>
              );
            })}
          </div>

          <strong className="marketplace-product-price">
            {thb(market.product.lowest_price_satang)}~
          </strong>
          <div className="marketplace-product-badges">
            <span>Authentic</span>
            <span>Offer comparison</span>
          </div>
          <div className="marketplace-product-service-strip">
            Compare every seller offer for this card before choosing the exact listing to buy.
          </div>
          <div className="marketplace-product-trust-row">
            {TRUST_ITEMS.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Available Offers</h2>
            <span>{market.listings.length} offer{market.listings.length === 1 ? "" : "s"}</span>
          </div>
          <div className="marketplace-product-listings">
            {market.listings.map((listing) => {
              const photo = listingPhoto(listing);
              return (
                <Link
                  key={listing.listing_id}
                  href={listingHref(listing)}
                  className="marketplace-product-listing-tile"
                  prefetch={false}
                >
                  <span
                    className="marketplace-product-listing-image"
                    style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                  >
                    <span className="marketplace-product-ribbon">
                      {listing.snapshot_payload?.sourceBadge ?? "YNOT"}
                    </span>
                    <span className="marketplace-product-grade">
                      {listingGradeLabel(listing)}
                    </span>
                  </span>
                  <strong>{thb(listing.item_price_satang)}</strong>
                  <span>{listing.title}</span>
                  <small>View listing</small>
                </Link>
              );
            })}
            {market.listings.length === 0 ? (
              <div className="marketplace-empty">
                <strong>No offers for this filter</strong>
                <p>Try another variant or check again when sellers add more offers.</p>
              </div>
            ) : null}
          </div>
          {market.listings.length > 8 ? (
            <Link
              href={`/marketplace/products/${market.product.product_slug}?limit=24`}
              className="marketplace-see-more"
              prefetch={false}
            >
              See more offers
            </Link>
          ) : null}
        </section>

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Recent Sales Data</h2>
            <span>{market.priceHistory.length} points</span>
          </div>
          <div className="marketplace-price-history" aria-label="Recent sales data">
            {visibleHistory.map((point) => (
              <div key={point.id} className="marketplace-price-history-row">
                <span>{new Date(point.sold_at).toLocaleDateString("en-US")}</span>
                <span>{point.grade_value ?? point.condition_bucket}</span>
                <strong>{thb(point.item_price_satang)}</strong>
              </div>
            ))}
            {market.priceHistory.length === 0 ? (
              <div className="marketplace-empty">
                <strong>Not enough sales yet</strong>
                <p>Sold prices will appear here after completed marketplace orders are recorded.</p>
              </div>
            ) : null}
          </div>
          <div className="marketplace-history-gate">
            <strong>Sign up for free to view deeper market data</strong>
            <Link
              href={`/login?next=/marketplace/products/${market.product.product_slug}`}
              prefetch={false}
            >
              Log in
            </Link>
          </div>
        </section>

        {relatedVariants.length > 0 ? (
          <section className="marketplace-product-section">
            <div className="marketplace-product-section-head">
              <h2>Related Variants</h2>
            </div>
            <div className="marketplace-related-strip">
              {relatedVariants.map((variant) => (
                <Link
                  key={variant.variant_slug}
                  href={filterHref(market.product.product_slug, variant.condition_bucket)}
                  className="marketplace-related-card"
                  prefetch={false}
                >
                  <span
                    style={
                      variant.image_urls[0]
                        ? { backgroundImage: `url(${variant.image_urls[0]})` }
                        : undefined
                    }
                  />
                  <strong>{variant.variant_label}</strong>
                  <small>{variant.active_listing_count} offers</small>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="marketplace-product-section">
          <div className="marketplace-product-section-head">
            <h2>Item Description</h2>
          </div>
          <dl className="marketplace-product-metadata">
            <div><dt>Brand</dt><dd>{market.product.brand ?? "-"}</dd></div>
            <div><dt>Category</dt><dd>{market.product.category ?? "Trading Cards"}</dd></div>
            <div><dt>Series</dt><dd>{market.product.series_name ?? "-"}</dd></div>
            <div><dt>Set</dt><dd>{market.product.set_name ?? "-"}</dd></div>
            <div><dt>Product Code</dt><dd>{market.product.card_code ?? "-"}</dd></div>
            <div><dt>Condition</dt><dd>Check condition and grade on each listing page</dd></div>
          </dl>
        </section>
      </div>

      <div className="marketplace-product-sticky-bar" aria-label="Marketplace product action">
        <span className="marketplace-product-favorite" aria-label="Watch count">
          Sold {market.product.sold_count}
        </span>
        <Link
          href={`/marketplace/products/${market.product.product_slug}`}
          className="marketplace-product-primary-action"
          prefetch={false}
        >
          <span>{thb(market.product.lowest_price_satang)}~</span>
          <strong>View all offers ({market.product.active_listing_count})</strong>
        </Link>
      </div>
    </div>
  );
}
