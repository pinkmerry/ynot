import { AdminExchangeActions } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
  StatusBadge,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminExchangePage() {
  const data = await getYnotDashboardSlice({ exchanges: true });
  const submitted = data.exchanges.filter((order) => order.status === "submitted").length;

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/exchange">
      <PageHeader
        eyebrow="Admin exchange"
        title="Review exchange requests"
        description="Approve or reject card exchange requests. The next RPC hardening slice will credit wallet ledger on approval in the same transaction."
      />
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Exchange queue</p>
            <h3 className="title-m">Customer card-to-coin requests</h3>
          </div>
          <span className="status-pill warn">{submitted} submitted</span>
        </div>
        <div className="admin-list-stack">
          {data.exchanges.length ? (
            data.exchanges.map((order) => (
              <article key={order.id} className="admin-list-card">
                <div className="admin-row-head">
                  <p className="font-mono font-bold">{order.publicCode}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="admin-muted-line">
                  Requested value {order.requestedCoinValue.toLocaleString()} coins
                </p>
                <AdminExchangeActions order={order} />
              </article>
            ))
          ) : (
            <p className="admin-empty-note">No exchange requests.</p>
          )}
        </div>
      </section>
    </AdminSectionShell>
  );
}
