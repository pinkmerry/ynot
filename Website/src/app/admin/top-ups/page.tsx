import { AdminTopUpActions } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
  StatusBadge,
  TopUpTable,
} from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminTopUpsPage() {
  const data = await getYnotDashboardData();
  const pending = data.adminTopUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  );

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/top-ups">
      <PageHeader
        eyebrow="Admin top-ups"
        title="Manual payment confirmation"
        description="Review bank/QR slip uploads, approve or reject manually, and credit wallet coins exactly once through the database RPC."
      />
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Payment queue</p>
            <h3 className="title-m">Pending review</h3>
          </div>
          <span className="status-pill warn">{pending.length} waiting</span>
        </div>
        <div className="admin-list-stack">
          {pending.length ? (
            pending.map((topUp) => (
              <article key={topUp.id} className="admin-list-card">
                <div className="admin-row-head">
                  <p className="font-mono font-bold">{topUp.publicCode}</p>
                  <StatusBadge status={topUp.status} />
                </div>
                <p className="admin-muted-line">
                  ฿{topUp.amountThb.toLocaleString()} · {topUp.coinAmount.toLocaleString()} coins · profile {topUp.profileId.slice(0, 8)}
                </p>
                <AdminTopUpActions topUpId={topUp.id} />
              </article>
            ))
          ) : (
            <p className="admin-empty-note">No pending top-ups.</p>
          )}
        </div>
      </section>
      <section className="admin-panel admin-table-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">History</p>
            <h3 className="title-m">All top-ups</h3>
          </div>
        </div>
        <TopUpTable topUps={data.adminTopUps} admin />
      </section>
    </AdminSectionShell>
  );
}
