import { AdminGate } from "@/features/ynot/components";
import { getAdminAuditEvents, getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  event_type?: string | null;
  created_at?: string | null;
  metadata?: unknown;
  actor_id?: string | null;
  [key: string]: unknown;
};

function eventScope(eventType: string): string {
  const [scope] = eventType.split(".");
  return scope || "system";
}

function pillKindForScope(scope: string): Parameters<typeof AdminPill>[0]["kind"] {
  switch (scope) {
    case "campaign":
      return "closed";
    case "topup":
      return "live";
    case "prize":
      return "warn";
    case "shipping":
      return "closed";
    case "settings":
      return "draft";
    case "user":
      return "warn";
    default:
      return "default";
  }
}

export default async function AdminAuditPage() {
  const [data, eventsRaw] = await Promise.all([
    getYnotDashboardSlice(),
    getAdminAuditEvents(),
  ]);
  const events = eventsRaw as AuditRow[];

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/audit"
        trail={["Admin", "Platform", "Audit log"]}
        eyebrow="Admin audit"
        title="Audit log"
        desc="Immutable event log of admin actions, ledger mutations, and system events. Retained for 365 days."
        actions={
          <span className="btn">
            <AdminIcon name="filter" />
            Filters
          </span>
        }
      >
        <AdminCard>
          <AdminCardHead
            label="Filter"
            title={`Last ${events.length} events`}
            actions={
              <div className="tabs">
                <span className="t active">All · {events.length}</span>
              </div>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24 }}>
                      No audit events loaded.
                    </td>
                  </tr>
                ) : (
                  events.slice(0, 50).map((event) => {
                    const eventType = String(event.event_type ?? "system.event");
                    const scope = eventScope(eventType);
                    const [, op] = eventType.split(".");
                    const created = event.created_at
                      ? new Date(event.created_at)
                      : null;
                    const actor =
                      typeof event.actor_id === "string"
                        ? event.actor_id.slice(0, 12) + "…"
                        : "system";
                    return (
                      <tr key={event.id}>
                        <td className="mono muted" style={{ fontSize: 11 }}>
                          {created ? created.toLocaleString() : "—"}
                        </td>
                        <td>
                          <span
                            className="mono"
                            style={{ fontSize: 12 }}
                          >
                            {actor}
                          </span>
                        </td>
                        <td>
                          <AdminPill kind={pillKindForScope(scope)}>
                            {scope}
                          </AdminPill>{" "}
                          <span
                            className="mono text-mute"
                            style={{ fontSize: 11, marginLeft: 6 }}
                          >
                            {op ?? "—"}
                          </span>
                        </td>
                        <td>
                          <details>
                            <summary
                              style={{
                                cursor: "pointer",
                                color: "var(--a-fg-dim)",
                                fontSize: 12,
                              }}
                            >
                              View metadata
                            </summary>
                            <pre className="pre-block" style={{ marginTop: 8 }}>
                              {JSON.stringify(event.metadata ?? {}, null, 2)}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--a-border-soft)",
              fontSize: 11,
              color: "var(--a-muted)",
            }}
          >
            Showing 1–{Math.min(events.length, 50)} of {events.length} events
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
