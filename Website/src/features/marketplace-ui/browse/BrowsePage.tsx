import Link from "next/link";
import { MpBadge, MpEmpty } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import type {
  MarketplaceBrowseFilterCounts,
  MarketplaceBrowseFilterKey,
  MarketplaceProductBrowseSummary,
} from "@/lib/marketplace/product-browse";
import type { MarketplaceQueryPlan, MarketplaceProductSort } from "@/lib/marketplace/query-plan";
import { FilterRail } from "./FilterRail";

/**
 * Marketplace browse page — visuals ported from the design prototype's
 * ProtoBrowse (/Users/pinkmerry/Downloads/ynott/project/
 * marketplace-proto-1.jsx:163-296): heading + market tabs + filter rail +
 * product grid + empty state.
 *
 * Server component: it renders the real, already-loaded product page data
 * (no mock MP_LISTINGS) and only crosses the client boundary for the filter
 * rail's interactive controls (FilterRail). The prototype's inline seller
 * listing rows (protoListingsFor) do not apply here — this page renders
 * grouped *products*, not individual seller listings; per-listing detail
 * lives on the product page.
 *
 * Field names below come straight from MarketplaceProductBrowseSummary
 * (src/lib/marketplace/product-browse.ts) — the public-safe grouped-product
 * projection, not raw listing rows. That type has no per-product
 * condition/grade (grade/condition are listing-level attributes projected
 * separately — see PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS in
 * public-projection.ts), so each card's badge reflects official-vs-community
 * source mix instead of a specific PSA grade; a true grade badge belongs on
 * the product-detail page where individual listings are enumerated.
 */

export interface BrowsePageProps {
  query: MarketplaceQueryPlan;
  products: MarketplaceProductBrowseSummary[];
  filterCounts: MarketplaceBrowseFilterCounts;
  selectedFilterKey: MarketplaceBrowseFilterKey;
  selectedSort: MarketplaceProductSort;
}

/**
 * Human label for the non-source category filter keys
 * (selectedMarketplaceFilter() in page.tsx collapses q/grade/condition into
 * one of these). Source ("official_shop"/"user_seller") is already shown by
 * the market tabs, so it renders no extra chip here — this only surfaces the
 * finer category filter (e.g. "PSA 10") the market tabs can't express.
 */
function activeCategoryFilterLabel(filterKey: MarketplaceBrowseFilterKey) {
  switch (filterKey) {
    case "pokemon":
      return "Pokémon";
    case "one_piece":
      return "One Piece";
    case "psa10":
      return "PSA 10";
    case "raw":
      return "Raw";
    case "holo":
      return "Holo";
    case "promo":
      return "Promo";
    default:
      return null;
  }
}

function productMeta(product: MarketplaceProductBrowseSummary) {
  return [product.card_code, product.set_name, product.language, product.brand].filter(
    (value): value is string => Boolean(value),
  );
}

function productSourceBadge(product: MarketplaceProductBrowseSummary) {
  if (product.official_listing_count > 0 && product.user_seller_listing_count === 0) {
    return (
      <MpBadge kind="official">
        <MpIcon name="shield" size={10} /> Official
      </MpBadge>
    );
  }
  if (product.user_seller_listing_count > 0 && product.official_listing_count === 0) {
    return <MpBadge kind="community">Community</MpBadge>;
  }
  return <MpBadge kind="official">Official + community</MpBadge>;
}

function clearFiltersHref(source: MarketplaceQueryPlan["source"]) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

export function BrowsePage({
  query,
  products,
  filterCounts,
  selectedFilterKey,
  selectedSort,
}: BrowsePageProps) {
  const market = query.source === "official_shop" ? "official" : "community";
  const officialCount = filterCounts.official_shop?.productCount ?? 0;
  const communityCount = filterCounts.user_seller?.productCount ?? 0;
  const categoryLabel = activeCategoryFilterLabel(selectedFilterKey);

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 18 }}>
        <div className="mp-stack" style={{ gap: 6 }}>
          <span className="mp-eyebrow">Marketplace</span>
          <h1 className="mp-h1">
            {market === "official" ? "Official YNOTT shop" : "Community market"}
          </h1>
          <p className="mp-lead">
            {market === "official"
              ? "Authorized goods sold directly by YNOTT — sourced, graded and shipped from our vault. Guaranteed authentic."
              : "Cards listed by collectors like you. Every card ships to YNOTT first for in-hand verification before it reaches the buyer."}
          </p>
        </div>
        <span className="mp-spacer" />
        {market === "community" ? (
          <Link href="/marketplace/seller" className="mp-btn mp-btn-primary">
            <MpIcon name="tag" size={14} /> Sell a card
          </Link>
        ) : null}
      </div>

      <div className="mp-market-tabs">
        <Link
          href="/marketplace?source=official_shop"
          className={"mp-market-tab official" + (market === "official" ? " on" : "")}
        >
          <MpIcon name="shield" size={14} /> Official YNOTT shop
          <span className="ct">{officialCount}</span>
        </Link>
        <Link
          href="/marketplace?source=user_seller"
          className={"mp-market-tab" + (market === "community" ? " on" : "")}
        >
          <MpIcon name="swap" size={14} /> Community market
          <span className="ct">{communityCount}</span>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 26, alignItems: "start" }}>
        <FilterRail
          source={query.source}
          q={query.q ?? ""}
          condition={query.condition}
          grade={query.grade}
          sort={selectedSort}
          filterCounts={filterCounts}
        />

        <div className="mp-stack" style={{ gap: 16 }}>
          <div className="mp-row">
            <span className="mp-small mp-mute">
              <b style={{ color: "var(--mp-ink)" }}>
                {products.length} product{products.length !== 1 ? "s" : ""}
              </b>
              {categoryLabel ? <span> · {categoryLabel}</span> : null}
              {query.q ? <span> - &quot;{query.q}&quot;</span> : null}
            </span>
            <span className="mp-spacer" />
          </div>

          {products.length === 0 ? (
            <MpEmpty
              glyph="search"
              title="Nothing matches that - yet"
              hint="Try removing a filter. Price alerts are set from an individual card's page once you find it."
            >
              <div className="mp-row" style={{ marginTop: 6 }}>
                <Link href={clearFiltersHref(query.source)} className="mp-btn mp-btn-primary">
                  Clear filters
                </Link>
              </div>
            </MpEmpty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {products.map((product) => {
                const meta = productMeta(product);
                return (
                  <Link
                    key={product.product_id}
                    href={`/marketplace/products/${product.product_slug}`}
                    className="mp-card"
                  >
                    <div
                      className="mp-card-art"
                      style={
                        product.hero_image_url
                          ? { backgroundImage: `url(${product.hero_image_url})` }
                          : undefined
                      }
                    >
                      <span className="corner">{productSourceBadge(product)}</span>
                      {!product.hero_image_url ? (
                        <span className="ph">{product.title.slice(0, 24)}</span>
                      ) : null}
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
          )}
        </div>
      </div>
    </>
  );
}
