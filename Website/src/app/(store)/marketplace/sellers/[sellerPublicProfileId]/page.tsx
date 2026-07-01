import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import {
  getPublicSellerTrustProfile,
  getSellerPublicListings,
} from "@/lib/marketplace/seller-trust";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function sellerKindLabel(kind: string) {
  return kind === "official_shop" ? "Official shop" : "Verified user seller";
}

function conditionLabel(listing: {
  snapshot_payload: {
    conditionCode?: string | null;
    gradeService?: string;
    gradeValue?: string;
    variantLabel?: string;
  } | null;
}) {
  const gradeService = listing.snapshot_payload?.gradeService;
  const gradeValue = listing.snapshot_payload?.gradeValue;
  if (gradeService && gradeValue) return `${gradeService} ${gradeValue}`;
  return (
    listing.snapshot_payload?.variantLabel ??
    listing.snapshot_payload?.conditionCode ??
    "Condition checked"
  );
}

export default async function MarketplaceSellerPage({
  params,
}: {
  params: Promise<{ sellerPublicProfileId: string }>;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const config = marketplaceConfig();
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true;

  if (!allowed) redirect("/packs");
  if (config.unavailableReason !== null || !config.actions.browse) {
    redirect("/marketplace");
  }

  const { sellerPublicProfileId } = await params;
  const [seller, listingPage, data] = await Promise.all([
    getPublicSellerTrustProfile(sellerPublicProfileId),
    getSellerPublicListings(sellerPublicProfileId, {
      inStockOnly: true,
      limit: 24,
    }),
    getYnotDashboardSlice({
      wallet: Boolean(profile?.profileId),
    }),
  ]);

  if (!seller) notFound();

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <div className="store-home-grid marketplace-detail-page">
        <div className="store-main-stack">
          <Link href="/marketplace" className="marketplace-back-link" prefetch={false}>
            Marketplace
          </Link>

          <section className="marketplace-listing-section" aria-labelledby="seller-title">
            <div>
              <span className="marketplace-card-eyebrow">
                {sellerKindLabel(seller.seller_kind)}
              </span>
              <h1 id="seller-title">{seller.display_name}</h1>
              <p>
                Seller profile for active YNOT marketplace listings. Buyer support,
                messages, payment, and fulfilment stay inside YNOT so private seller
                contact details are not shared.
              </p>
            </div>
            <dl className="marketplace-listing-detail-grid">
              <div>
                <dt>Status</dt>
                <dd>{seller.status}</dd>
              </div>
              <div>
                <dt>Fulfilled orders</dt>
                <dd>{seller.fulfilled_order_count.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Positive ratings</dt>
                <dd>
                  {seller.positive_rating_count.toLocaleString()} /{" "}
                  {seller.rating_count.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Active listings</dt>
                <dd>{seller.active_listing_count.toLocaleString()}</dd>
              </div>
            </dl>
          </section>

          <section className="marketplace-listing-section" aria-labelledby="seller-listings-title">
            <div>
              <span className="marketplace-card-eyebrow">Active offers</span>
              <h2 id="seller-listings-title">Listings from this seller</h2>
            </div>
            <div className="marketplace-grid">
              {listingPage.listings.map((listing) => (
                <Link
                  href={`/marketplace/listings/${listing.listing_id}`}
                  className="marketplace-card"
                  key={listing.listing_id}
                  prefetch={false}
                >
                  <div className="marketplace-card-art">
                    {listing.photo_urls?.[0] ? (
                      <img src={listing.photo_urls[0]} alt="" />
                    ) : (
                      <span>{listing.title.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="marketplace-card-body">
                    <div className="marketplace-card-meta-row">
                      <span className="marketplace-card-eyebrow">
                        {conditionLabel(listing)}
                      </span>
                      <span>{sellerKindLabel(listing.listing_source)}</span>
                    </div>
                    <strong className="marketplace-card-title">
                      {listing.title}
                    </strong>
                    <div className="marketplace-card-foot">
                      <span className="marketplace-card-price">
                        {thb(listing.item_price_satang)}
                      </span>
                      <span className="marketplace-card-cta">See listing</span>
                    </div>
                  </div>
                </Link>
              ))}
              {listingPage.listings.length === 0 ? (
                <p className="marketplace-empty-copy">
                  No active listings from this seller match the current market.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </YnotShell>
  );
}
