import "server-only";

import type { Metadata } from "next";
import type { MarketplaceListingSnapshot } from "./listings";
import type { MarketplaceProductMarketView } from "./product-market";

const SITE_ORIGIN = "https://www.ynotopen.com";
const SITE_NAME = "YNOT";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/icons/icon-512.png`;

type JsonLdObject = Record<string, unknown>;

export type MarketplaceViewContentEvent = {
  event: "marketplace_view_content";
  contentType: "product_market" | "listing";
  productId: string | null;
  productSlug: string | null;
  listingId: string | null;
  variantId: string | null;
  category: string;
  variants: string[];
  source: string | null;
  sellerKind: string | null;
  priceRangeSatang: {
    min: number | null;
    max: number | null;
    currency: "THB";
  };
};

type ViewContentInput =
  | { productMarket: MarketplaceProductMarketView; listing?: never }
  | { listing: MarketplaceListingSnapshot; productMarket?: never };

function cleanText(value: string | null | undefined, fallback: string, maxLength = 180) {
  const cleaned = value
    ?.replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function absoluteUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  try {
    return new URL(pathOrUrl, SITE_ORIGIN).toString();
  } catch {
    return null;
  }
}

function canonicalProductUrl(slug: string) {
  return `${SITE_ORIGIN}/marketplace/products/${encodeURIComponent(slug)}`;
}

function canonicalListingUrl(id: string) {
  return `${SITE_ORIGIN}/marketplace/listings/${encodeURIComponent(id)}`;
}

function satangToPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return (Math.max(value, 0) / 100).toFixed(2);
}

function listingVariantLabel(listing: MarketplaceListingSnapshot) {
  return (
    listing.snapshot_payload?.variantLabel ??
    listing.snapshot_payload?.conditionCode ??
    listing.snapshot_payload?.conditionBucket ??
    "Checked condition"
  );
}

function listingCategory(listing: MarketplaceListingSnapshot) {
  const itemType = listing.snapshot_payload?.itemType;
  if (itemType === "sealed_box") return "Trading card sealed box";
  if (itemType === "sealed_pack") return "Trading card sealed pack";
  return "Trading Cards";
}

function listingSellerKind(source: MarketplaceListingSnapshot["listing_source"]) {
  return source === "official_shop" ? "official_shop" : "user_seller";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function productImages(market: MarketplaceProductMarketView) {
  const images = uniqueStrings([
    market.product.hero_image_url,
    ...market.variants.flatMap((variant) => variant.image_urls),
    ...market.listings.flatMap((listing) => listing.photo_urls ?? []),
  ])
    .map(absoluteUrl)
    .filter((url): url is string => Boolean(url));
  return images.length > 0 ? images.slice(0, 6) : [DEFAULT_IMAGE];
}

function listingImages(listing: MarketplaceListingSnapshot) {
  const images = uniqueStrings(listing.photo_urls ?? [])
    .map(absoluteUrl)
    .filter((url): url is string => Boolean(url));
  return images.length > 0 ? images.slice(0, 10) : [DEFAULT_IMAGE];
}

function metadataImages(urls: string[]) {
  return urls.map((url) => ({ url }));
}

function productPriceRange(market: MarketplaceProductMarketView) {
  const prices = market.listings
    .map((listing) => listing.item_price_satang)
    .filter((value) => Number.isFinite(value));
  if (prices.length === 0 && typeof market.product.lowest_price_satang === "number") {
    prices.push(market.product.lowest_price_satang);
  }
  return {
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
    currency: "THB" as const,
  };
}

export function buildMarketplaceProductMetadata(
  market: MarketplaceProductMarketView,
): Metadata {
  const title = cleanText(market.product.title, "Marketplace product");
  const category = cleanText(market.product.category, "Trading Cards", 80);
  const lowest = satangToPrice(market.product.lowest_price_satang);
  const description = lowest
    ? `${category} market offers from ฿${lowest}. Compare variants, grades, current offers, and recent sale history on YNOT.`
    : `${category} market offers, variants, grades, and recent sale history on YNOT.`;
  const canonical = canonicalProductUrl(market.product.product_slug);
  const images = productImages(market);

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: `${title} | YNOT Marketplace`,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "website",
      images: metadataImages(images),
    },
    twitter: {
      card: images[0] === DEFAULT_IMAGE ? "summary" : "summary_large_image",
      title,
      description,
      images: images.slice(0, 1),
    },
  };
}

export function buildMarketplaceListingMetadata(
  listing: MarketplaceListingSnapshot,
): Metadata {
  const title = cleanText(listing.title, "Marketplace listing");
  const variant = cleanText(listingVariantLabel(listing), "Checked condition", 80);
  const price = satangToPrice(listing.item_price_satang);
  const source =
    listing.listing_source === "official_shop" ? "official shop" : "user seller";
  const description = price
    ? `${variant} listing from ${source} for ฿${price}. Review actual item photos, condition, and checkout details on YNOT.`
    : `${variant} listing from ${source}. Review actual item photos, condition, and checkout details on YNOT.`;
  const canonical = canonicalListingUrl(listing.listing_id);
  const images = listingImages(listing);

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: `${title} | YNOT Marketplace`,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "website",
      images: metadataImages(images),
    },
    twitter: {
      card: images[0] === DEFAULT_IMAGE ? "summary" : "summary_large_image",
      title,
      description,
      images: images.slice(0, 1),
    },
  };
}

export function buildMarketplaceProductJsonLd(
  market: MarketplaceProductMarketView,
): JsonLdObject {
  const canonical = canonicalProductUrl(market.product.product_slug);
  const images = productImages(market);
  const priceRange = productPriceRange(market);
  const lowPrice = satangToPrice(priceRange.min);
  const variants = uniqueStrings(market.variants.map((variant) => variant.variant_label));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cleanText(market.product.title, "Marketplace product", 120),
    image: images,
    description: cleanText(
      market.product.set_name ?? market.product.series_name ?? market.product.category,
      "Trading card market page on YNOT",
      180,
    ),
    sku: market.product.card_code ?? market.product.product_slug,
    brand: market.product.brand
      ? { "@type": "Brand", name: cleanText(market.product.brand, "Trading Cards", 80) }
      : undefined,
    category: cleanText(market.product.category, "Trading Cards", 80),
    additionalProperty: variants.slice(0, 8).map((value) => ({
      "@type": "PropertyValue",
      name: "Variant",
      value,
    })),
    offers: {
      "@type": "AggregateOffer",
      url: canonical,
      priceCurrency: "THB",
      lowPrice,
      highPrice: satangToPrice(priceRange.max) ?? lowPrice,
      offerCount: market.product.active_listing_count,
      availability:
        market.product.active_listing_count > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
}

export function buildMarketplaceListingJsonLd(
  listing: MarketplaceListingSnapshot,
): JsonLdObject {
  const canonical = canonicalListingUrl(listing.listing_id);
  const images = listingImages(listing);
  const price = satangToPrice(listing.item_price_satang);
  const condition =
    listing.snapshot_payload?.gradeValue || listing.snapshot_payload?.conditionCode
      ? "https://schema.org/UsedCondition"
      : "https://schema.org/NewCondition";

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cleanText(listing.title, "Marketplace listing", 120),
    image: images,
    description: cleanText(
      listing.public_description,
      "Trading card listing with actual item photos on YNOT.",
      180,
    ),
    sku: listing.public_slug ?? listing.listing_id,
    category: listingCategory(listing),
    offers: {
      "@type": "Offer",
      url: canonical,
      price,
      priceCurrency: listing.currency,
      availability:
        listing.quantity_available_snapshot > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: condition,
      seller: {
        "@type": listing.listing_source === "official_shop" ? "Organization" : "Person",
        name:
          listing.listing_source === "official_shop"
            ? "YNOT official shop"
            : "YNOT marketplace seller",
      },
    },
  };
}

export function buildMarketplaceViewContentEvent(
  input: ViewContentInput,
): MarketplaceViewContentEvent {
  if (input.productMarket) {
    const market = input.productMarket;
    const priceRange = productPriceRange(market);
    const sources = uniqueStrings(market.listings.map((listing) => listing.listing_source));
    return {
      event: "marketplace_view_content",
      contentType: "product_market",
      productId: market.product.id,
      productSlug: market.product.product_slug,
      listingId: null,
      variantId: null,
      category: cleanText(market.product.category, "Trading Cards", 80),
      variants: uniqueStrings(market.variants.map((variant) => variant.variant_label)).slice(
        0,
        12,
      ),
      source: sources.length === 1 ? sources[0] : "mixed",
      sellerKind: sources.length === 1 ? sources[0] : "mixed",
      priceRangeSatang: priceRange,
    };
  }

  const listing = input.listing;
  return {
    event: "marketplace_view_content",
    contentType: "listing",
    productId: listing.product_id,
    productSlug:
      typeof listing.snapshot_payload?.productSlug === "string"
        ? listing.snapshot_payload.productSlug
        : null,
    listingId: listing.listing_id,
    variantId: listing.variant_id,
    category: listingCategory(listing),
    variants: [listingVariantLabel(listing)],
    source: listing.listing_source,
    sellerKind: listingSellerKind(listing.listing_source),
    priceRangeSatang: {
      min: listing.item_price_satang,
      max: listing.item_price_satang,
      currency: "THB",
    },
  };
}

export function serializeMarketplaceJsonLd(payload: JsonLdObject) {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
