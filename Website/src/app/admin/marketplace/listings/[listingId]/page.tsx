import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getAdminMarketplaceListingDetail } from "@/lib/marketplace/seller-trust";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

function productMarketHref(productSlug: string, conditionBucket?: string | null) {
  const params = new URLSearchParams();
  if (conditionBucket?.startsWith("raw_")) {
    params.set("condition", conditionBucket);
  } else if (conditionBucket) {
    params.set("grade", conditionBucket);
  }
  const query = params.toString();
  return `/marketplace/products/${productSlug}${query ? `?${query}` : ""}`;
}

function detailRows(rows: Array<[string, string | number | null | undefined]>) {
  return (
    <dl className="marketplace-listing-detail-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AdminMarketplaceListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const config = marketplaceConfig();
  const { listingId } = await params;

  if (!admin || (config.ownerOnly && admin.adminRole !== "owner")) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/marketplace"
          trail={["Admin", "Marketplace", "Listing"]}
          surface="marketplace"
          eyebrow="Marketplace"
          title="Owner-only prelaunch"
          desc="Marketplace listing evidence is locked to owner accounts during MVP testing."
        >
          <AdminCard>
            <AdminCardHead label="Access" title="Owner account required" />
            <p className="muted">This page stops before marketplace service-role reads.</p>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  let listing: Awaited<ReturnType<typeof getAdminMarketplaceListingDetail>>;
  try {
    listing = await getAdminMarketplaceListingDetail({ admin, listingId });
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_listing_not_found"
    ) {
      notFound();
    }
    throw error;
  }
  const productSlug = listing.snapshot_payload?.productSlug;
  const variantFilterHref = productSlug
    ? productMarketHref(productSlug, listing.snapshot_payload?.conditionBucket)
    : null;
  const photos = (listing.photo_urls ?? []).slice(0, 10);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/marketplace"
        trail={["Admin", "Marketplace", "Listing"]}
        surface="marketplace"
        eyebrow="Marketplace listing"
        title={listing.title}
        desc="Admin-only evidence view for listing state, seller account reference, images, product link, and status history."
        actions={
          <Link href="/admin/marketplace" className="btn btn-sm" prefetch={false}>
            Back to marketplace
          </Link>
        }
      >
        <AdminCard>
          <AdminCardHead
            label="Listing state"
            title={listing.public_slug ?? listing.listing_id}
            actions={<AdminStatusPill status={listing.listing_state} />}
          />
          {detailRows([
            ["Listing ID", listing.listing_id],
            ["Seller account", listing.seller_marketplace_account_id],
            ["Public seller", listing.seller_public_profile_id],
            ["Inventory item", listing.inventory_item_id],
            ["Product ID", listing.product_id],
            ["Variant ID", listing.variant_id],
            ["Source", listing.listing_source],
            ["Condition", listing.snapshot_payload?.conditionCode],
            ["Grade", listing.snapshot_payload?.gradeValue],
            ["Quantity", listing.quantity_available_snapshot],
            ["Price", fmtTHB(listing.item_price_satang / 100)],
            ["Updated", dateLabel(listing.updated_at)],
          ])}
          <div className="actions" style={{ marginTop: 16 }}>
            <Link
              href={`/marketplace/listings/${listing.listing_id}`}
              className="btn btn-sm"
              prefetch={false}
            >
              Open public listing
            </Link>
            {productSlug ? (
              <Link
                href={`/marketplace/products/${productSlug}`}
                className="btn btn-sm"
                prefetch={false}
              >
                Open product market
              </Link>
            ) : null}
            {variantFilterHref ? (
              <Link
                href={variantFilterHref}
                className="btn btn-sm"
                prefetch={false}
              >
                Open variant filter
              </Link>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Images"
            title={`Uploaded listing images · ${photos.length}`}
          />
          <div className="marketplace-grid">
            {photos.map((photo, index) => (
              <figure className="marketplace-card" key={`${photo}-${index}`}>
                <div className="marketplace-card-art">
                  <img src={photo} alt="" />
                </div>
                <figcaption className="marketplace-card-body">
                  <span className="marketplace-card-eyebrow">
                    Image {index + 1}
                  </span>
                </figcaption>
              </figure>
            ))}
            {photos.length === 0 ? (
              <p className="muted">No public listing images are attached.</p>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Status history"
            title={`Audit events · ${listing.auditTimeline.length}`}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Payload</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {listing.auditTimeline.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <span className="row-title">{event.eventType}</span>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        {event.source} {shortId(event.id)}
                      </span>
                    </td>
                    <td>{event.actorRole ?? "-"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {JSON.stringify(event.payload)}
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {dateLabel(event.createdAt)}
                    </td>
                  </tr>
                ))}
                {listing.auditTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24 }}>
                      No listing audit events yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
