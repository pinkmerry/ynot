import { AdminShippingActions } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
  StatusBadge,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const data = await getYnotDashboardSlice({ shipping: true });
  const active = data.shipping.filter(
    (request) => request.status === "submitted" || request.status === "packing",
  ).length;

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/shipping">
      <PageHeader
        eyebrow="Admin shipping"
        title="Fulfillment workflow"
        description="Update packing/shipped/delivered status and tracking details for submitted shipping requests."
      />
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Shipping queue</p>
            <h3 className="title-m">Card shipment requests</h3>
          </div>
          <span className="status-pill warn">{active} active</span>
        </div>
        <div className="admin-list-stack">
          {data.shipping.length ? (
            data.shipping.map((request) => (
              <article key={request.id} className="admin-list-card">
                <div className="admin-row-head">
                  <p className="font-mono font-bold">{request.publicCode}</p>
                  <StatusBadge status={request.status} />
                </div>
                <p className="admin-muted-line">
                  Tracking: {request.trackingProvider ?? "-"} {request.trackingNumber ?? ""}
                </p>
                <AdminShippingActions request={request} />
              </article>
            ))
          ) : (
            <p className="admin-empty-note">No shipping requests.</p>
          )}
        </div>
      </section>
    </AdminSectionShell>
  );
}
