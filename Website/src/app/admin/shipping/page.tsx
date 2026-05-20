import { AdminShippingActions } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const data = await getYnotDashboardSlice({ shipping: true });
  const submitted = data.shipping.filter((r) => r.status === "submitted");
  const packing = data.shipping.filter((r) => r.status === "packing");
  const shipped = data.shipping.filter((r) => r.status === "shipped");
  const delivered = data.shipping.filter((r) => r.status === "delivered");
  const active = submitted.length + packing.length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/shipping"
        trail={["Admin", "Operations", "Shipping"]}
        eyebrow="Admin shipping"
        title="Shipping fulfilment"
        desc="Pack, label, and dispatch winner shipments. Customer status updates push automatically from these state changes."
        badges={{ "/admin/shipping": active || undefined }}
        actions={
          <span className="btn btn-primary">
            <AdminIcon name="upload" />
            Bulk tracking
          </span>
        }
      >
        <div className="kpi-grid">
          <AdminKPI label="Submitted" value={submitted.length} color="var(--a-amber)" />
          <AdminKPI label="Packing" value={packing.length} color="var(--a-sky)" />
          <AdminKPI label="Shipped" value={shipped.length} color="var(--a-mint)" />
          <AdminKPI label="Delivered" value={delivered.length} color="var(--a-gold)" />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Queue"
            title={`Shipping requests · ${data.shipping.length}`}
            actions={
              <div className="tabs">
                <span className="t active">All · {data.shipping.length}</span>
                <span className="t">Submitted · {submitted.length}</span>
                <span className="t">Packing · {packing.length}</span>
                <span className="t">Shipped · {shipped.length}</span>
                <span className="t">Delivered · {delivered.length}</span>
              </div>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.shipping.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 24 }}>
                      No shipping requests.
                    </td>
                  </tr>
                ) : (
                  data.shipping.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {req.publicCode}
                        </span>
                      </td>
                      <td>
                        <AdminStatusPill status={req.status} />
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {req.trackingProvider ?? "—"}{" "}
                        {req.trackingNumber ? `· ${req.trackingNumber}` : ""}
                      </td>
                      <td className="mono muted" style={{ fontSize: 11 }}>
                        {new Date(req.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <AdminShippingActions request={req} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
