import {
  AdminSectionShell,
  PageHeader,
  StatusBadge,
} from "@/features/ynot/components";
import { getAdminAuditEvents, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const [data, events] = await Promise.all([
    getYnotDashboardData(),
    getAdminAuditEvents(),
  ]);

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/audit">
      <PageHeader
        eyebrow="Admin audit"
        title="Operational event log"
        description="Audit rows provide evidence for auth linking, top-up review, gacha opens, exchange, shipping, and admin changes."
      />
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Audit events</p>
            <h3 className="title-m">Recent operational evidence</h3>
          </div>
          <span className="status-pill">{events.length} events</span>
        </div>
        <div className="admin-list-stack">
          {events.map((event) => (
            <article key={event.id} className="admin-list-card">
              <div className="admin-row-head">
                <p className="font-black">{event.event_type}</p>
                <StatusBadge status={new Date(event.created_at).toLocaleString()} />
              </div>
              <pre className="admin-code-block">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </article>
          ))}
        </div>
        {!events.length && <p className="admin-empty-note">No audit events loaded.</p>}
      </section>
    </AdminSectionShell>
  );
}
