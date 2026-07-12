import Link from "next/link";
import { AlertButton } from "../browse/AlertButton";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import { ProductMarketClient } from "./ProductMarketClient";
import { ReportListingButton } from "./ReportListingButton";
import { listMarketplaceProductBrowsePage } from "@/lib/marketplace/product-browse";
import type { MarketplaceProductMarketView } from "@/lib/marketplace/product-market";

/**
 * Marketplace product-detail page — ports ProtoDetail
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-2.jsx:10-162):
 * breadcrumb, art + thumbnails, spec grid, stats strip, grade tabs + listing
 * rows with Buy, price history + latest sales, similar cards, and the
 * sold/empty state.
 *
 * Server component: everything here reads directly off the already-loaded
 * MarketplaceProductMarketView (real product/listings/priceHistory — no
 * invented fields) plus one extra server-side read for the similar-cards
 * strip. Only the grade-linked GradeTabs/PriceHistoryPanel pair
 * (ProductMarketClient) and ReportListingButton cross the client boundary.
 */

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface ProductDetailProps {
  market: MarketplaceProductMarketView;
  selectedGrade: string | null;
}

function productMeta(market: MarketplaceProductMarketView) {
  return [market.product.card_code, market.product.set_name, market.product.language, market.product.brand].filter(
    (value): value is string => Boolean(value),
  );
}

function galleryImages(market: MarketplaceProductMarketView) {
  const images = [
    market.product.hero_image_url,
    ...market.variants.flatMap((variant) => variant.image_urls),
  ].filter((value): value is string => Boolean(value));
  // De-dupe while preserving order (hero image often reappears as a
  // variant's first image).
  return Array.from(new Set(images));
}

function lastSaleSatang(market: MarketplaceProductMarketView) {
  // priceHistory ships newest-first (see getMarketplaceProductMarket /
  // listMarketplaceProductPriceHistory — both order by sold_at descending),
  // so index 0 is the most recent sale.
  return market.priceHistory[0]?.item_price_satang ?? null;
}

function ninetyDayAverageSatang(market: MarketplaceProductMarketView) {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const withinWindow = market.priceHistory.filter((point) => Date.parse(point.sold_at) >= cutoff);
  if (withinWindow.length === 0) return null;
  const total = withinWindow.reduce((sum, point) => sum + point.item_price_satang, 0);
  return Math.round(total / withinWindow.length);
}

function defaultConditionLabel(market: MarketplaceProductMarketView, selectedGrade: string | null) {
  if (!selectedGrade) return "All grades";
  const variant = market.variants.find(
    (candidate) => candidate.grade_value === selectedGrade || candidate.condition_bucket === selectedGrade,
  );
  if (!variant) return selectedGrade;
  return variant.grade_service && variant.grade_value
    ? `${variant.grade_service} ${variant.grade_value}`
    : variant.variant_label;
}

function similarCardsMeta(product: {
  card_code: string | null;
  set_name: string | null;
  language: string | null;
  brand: string | null;
}) {
  return [product.card_code, product.set_name, product.language, product.brand].filter(
    (value): value is string => Boolean(value),
  );
}

async function loadSimilarProducts(market: MarketplaceProductMarketView) {
  const searchTerm = market.product.set_name ?? market.product.series_name ?? market.product.brand ?? undefined;
  const page = await listMarketplaceProductBrowsePage({
    q: searchTerm,
    inStockOnly: true,
    limit: 8,
    cursor: null,
    sort: "recommended",
  });
  return page.products.filter((product) => product.product_id !== market.product.id).slice(0, 4);
}

export async function ProductDetail({ market, selectedGrade }: ProductDetailProps) {
  const images = galleryImages(market);
  const heroImage = images[0] ?? null;
  const meta = productMeta(market);
  const hasActiveListings = market.listings.length > 0;
  const lastSale = lastSaleSatang(market);
  const ninetyDayAverage = ninetyDayAverageSatang(market);
  const salesCount = market.priceHistory.length;
  const conditionLabel = defaultConditionLabel(market, selectedGrade);
  const similarProducts = await loadSimilarProducts(market);
  const reportListingId = market.listings[0]?.listing_id ?? null;

  return (
    <div className="mp-stack" style={{ gap: 30 }}>
      <div className="mp-row mp-small mp-mute" style={{ gap: 6 }}>
        <Link href="/marketplace" style={{ fontWeight: 600 }} prefetch={false}>
          Marketplace
        </Link>
        <span>/</span>
        {market.product.set_name ? (
          <>
            <span>{market.product.set_name}</span>
            <span>/</span>
          </>
        ) : null}
        <span style={{ color: "var(--mp-ink)", fontWeight: 600 }}>{market.product.title}</span>
      </div>

      <div className="mp-detail-grid">
        <div className="mp-stack" style={{ gap: 12 }}>
          <div
            className="mp-art-lg"
            aria-label={market.product.title}
            style={heroImage ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!heroImage ? <span className="ph">[ {market.product.title.slice(0, 24)} ]</span> : null}
          </div>
          {images.length > 1 ? (
            <div className="mp-thumbs" aria-label="Product thumbnails">
              {images.slice(0, 8).map((url, index) => (
                <span
                  key={`${url}-${index}`}
                  className={`mp-thumb${index === 0 ? " on" : ""}`}
                  style={{ backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}
          <div className="mp-spec" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="k">Card number</div>
              <div className="v">{market.product.card_code ?? "-"}</div>
            </div>
            <div>
              <div className="k">Category</div>
              <div className="v">{market.product.category ?? "Trading Cards"}</div>
            </div>
            <div>
              <div className="k">Series</div>
              <div className="v">{market.product.series_name ?? "-"}</div>
            </div>
            <div>
              <div className="k">Set</div>
              <div className="v">{market.product.set_name ?? "-"}</div>
            </div>
            <div>
              <div className="k">Language</div>
              <div className="v">{market.product.language ?? "-"}</div>
            </div>
            <div>
              <div className="k">Brand</div>
              <div className="v">{market.product.brand ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className="mp-stack" style={{ gap: 20 }}>
          <div className="mp-stack" style={{ gap: 7 }}>
            {meta.length > 0 ? <span className="mp-card-set" style={{ fontSize: 11 }}>{meta.join(" · ")}</span> : null}
            <h1 className="mp-h1" style={{ fontSize: 27 }}>
              {market.product.title}
            </h1>
          </div>

          <div className="mp-stats">
            <div>
              <div className="k">Last sale</div>
              <div className="v">{lastSale !== null ? formatThb(lastSale) : "—"}</div>
            </div>
            <div>
              <div className="k">90-day avg</div>
              <div className="v">{ninetyDayAverage !== null ? formatThb(ninetyDayAverage) : "—"}</div>
            </div>
            <div>
              <div className="k">Lowest ask</div>
              <div className="v">
                {market.product.lowest_price_satang !== null ? formatThb(market.product.lowest_price_satang) : "—"}
              </div>
            </div>
            <div>
              <div className="k">Sales</div>
              <div className="v">{salesCount}</div>
            </div>
          </div>

          {!hasActiveListings ? (
            <div className="mp-panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24 }}>
              <span className="mp-badge mp-badge-sold" style={{ alignSelf: "flex-start", padding: "5px 11px" }}>
                Sold out
              </span>
              <h2 className="mp-h2" style={{ fontSize: 22 }}>
                This one found a home
              </h2>
              <p className="mp-lead" style={{ fontSize: 13 }}>
                {lastSale !== null ? (
                  <>
                    The last copy sold for{" "}
                    <b className="mp-mono" style={{ color: "var(--mp-ink)" }}>
                      {formatThb(lastSale)}
                    </b>
                    . This page stays live so you can track what it trades for.
                  </>
                ) : (
                  "There are no active listings for this card right now. This page stays live so you can track what it trades for."
                )}
              </p>
              <div className="mp-row" style={{ marginTop: 4 }}>
                <AlertButton productId={market.product.id} label="Alert me on the next one" />
                <Link href="/marketplace" className="mp-btn" prefetch={false}>
                  Browse similar
                </Link>
              </div>
            </div>
          ) : (
            <ProductMarketClient
              listings={market.listings}
              priceHistory={market.priceHistory}
              defaultConditionLabel={conditionLabel}
              initialSelectedGrade={selectedGrade}
            />
          )}

          {reportListingId ? (
            <div style={{ marginTop: 4 }}>
              <ReportListingButton listingId={reportListingId} />
            </div>
          ) : null}
        </div>
      </div>

      {similarProducts.length > 0 ? (
        <div className="mp-stack" style={{ gap: 14 }}>
          <div className="mp-row">
            <h2 className="mp-h2">Similar cards</h2>
            <span className="mp-spacer" />
            <Link
              href="/marketplace"
              className="mp-small"
              style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}
              prefetch={false}
            >
              Browse all <MpIcon name="chev-r" size={12} />
            </Link>
          </div>
          <div className="mp-detail-cards-grid">
            {similarProducts.map((product) => {
              const meta = similarCardsMeta(product);
              return (
                <Link key={product.product_id} href={`/marketplace/products/${product.product_slug}`} className="mp-card" prefetch={false}>
                  <div
                    className="mp-card-art"
                    style={product.hero_image_url ? { backgroundImage: `url(${product.hero_image_url})` } : undefined}
                  >
                    {!product.hero_image_url ? <span className="ph">{product.title.slice(0, 24)}</span> : null}
                  </div>
                  <div className="mp-card-body">
                    <span className="mp-card-set">{product.series_name ?? product.category ?? "Trading card"}</span>
                    <span className="mp-card-title">{product.title}</span>
                    <span className="mp-card-meta">
                      {meta.length ? meta.slice(0, 3).join(" · ") : `${product.variant_count} variants`}
                    </span>
                    <div className="mp-card-foot">
                      <span className="mp-price">
                        <span className="thb">From</span>
                        <span className="coins">{formatThb(product.lowest_price_satang)}</span>
                      </span>
                      <span className="mp-seller-mini">
                        {product.active_listing_count} offer{product.active_listing_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
