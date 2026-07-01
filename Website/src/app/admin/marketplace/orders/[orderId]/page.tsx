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
import { getAdminMarketplaceOrderDetail } from "@/lib/marketplace/seller-trust";
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

export default async function AdminMarketplaceOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const config = marketplaceConfig();
  const { orderId } = await params;

  if (!admin || (config.ownerOnly && admin.adminRole !== "owner")) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/marketplace"
          trail={["Admin", "Marketplace", "Order"]}
          surface="marketplace"
          eyebrow="Marketplace"
          title="Owner-only prelaunch"
          desc="Marketplace order evidence is locked to owner accounts during MVP testing."
        >
          <AdminCard>
            <AdminCardHead label="Access" title="Owner account required" />
            <p className="muted">This page stops before marketplace service-role reads.</p>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  let order: Awaited<ReturnType<typeof getAdminMarketplaceOrderDetail>>;
  try {
    order = await getAdminMarketplaceOrderDetail({ admin, orderId });
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_order_not_found"
    ) {
      notFound();
    }
    throw error;
  }
  const productSlug = order.listing?.snapshot_payload?.productSlug;
  const productHref = productSlug
    ? productMarketHref(productSlug)
    : null;
  const variantHref = productSlug
    ? productMarketHref(productSlug, order.listing?.snapshot_payload?.conditionBucket)
    : null;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/marketplace"
        trail={["Admin", "Marketplace", "Order"]}
        surface="marketplace"
        eyebrow="Marketplace order"
        title={shortId(order.id)}
        desc="Admin-only order detail for payment review, buyer/seller references, request evidence, listing references, and fulfilment state."
        actions={
          <Link href="/admin/marketplace" className="btn btn-sm" prefetch={false}>
            Back to marketplace
          </Link>
        }
      >
        <AdminCard>
          <AdminCardHead
            label="Order state"
            title={order.listing?.title ?? order.id}
            actions={<AdminStatusPill status={order.payment_state} />}
          />
          {detailRows([
            ["Order ID", order.id],
            ["Pending payment", order.pending_payment_order_id],
            ["Listing ID", order.listing_id],
            ["Inventory item", order.inventory_item_id],
            ["Product ID", order.listing?.product_id],
            ["Variant ID", order.listing?.variant_id],
            ["Buyer account", order.buyer_marketplace_account_id],
            ["Seller account", order.seller_marketplace_account_id],
            ["Source", order.listing_source],
            ["Payment state", order.payment_state],
            ["Fulfilment state", order.fulfilment_state],
            ["Refund state", order.refund_state],
            ["Request ID", order.request_id],
            ["Created", dateLabel(order.created_at)],
            ["Updated", dateLabel(order.updated_at)],
          ])}
          <div className="actions" style={{ marginTop: 16 }}>
            <Link
              href={`/admin/marketplace/listings/${order.listing_id}`}
              className="btn btn-sm"
              prefetch={false}
            >
              Open listing evidence
            </Link>
            <Link
              href={`/marketplace/listings/${order.listing_id}`}
              className="btn btn-sm"
              prefetch={false}
            >
              Open public listing
            </Link>
            {productHref ? (
              <Link href={productHref} className="btn btn-sm" prefetch={false}>
                Open product market
              </Link>
            ) : null}
            {variantHref ? (
              <Link href={variantHref} className="btn btn-sm" prefetch={false}>
                Open variant filter
              </Link>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Request evidence" title="Idempotency guard" />
          {detailRows([
            ["Request ID", order.request_id],
            ["Scope", order.idempotency?.scope],
            ["Idempotency key", order.idempotency?.idempotency_key_preview],
            ["Request hash", order.idempotency?.request_hash_preview],
            ["Locked", dateLabel(order.idempotency?.locked_at ?? null)],
            ["Expires", dateLabel(order.idempotency?.expires_at ?? null)],
          ])}
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Money" title="Payment review totals" />
          {detailRows([
            ["Item price", fmtTHB(order.item_price_satang / 100)],
            ["Shipping fee", fmtTHB(order.shipping_fee_satang / 100)],
            ["Buyer service fee", fmtTHB(order.buyer_service_fee_satang / 100)],
            ["Buyer total", fmtTHB(order.buyer_total_satang / 100)],
            ["Seller fee", fmtTHB(order.seller_fee_satang / 100)],
            ["Seller payout", fmtTHB(order.seller_payout_satang / 100)],
            ["Seller payout state", order.seller_payout_state],
          ])}
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Status history"
            title={`Audit events · ${order.auditTimeline.length}`}
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
                {order.auditTimeline.map((event) => (
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
                {order.auditTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24 }}>
                      No order audit events yet.
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
