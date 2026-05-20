import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminKPI,
  AdminPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const data = await getYnotDashboardSlice({ platformHealth: true });
  const checks = data.platformHealth?.checks ?? [];
  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const overall = fail > 0 ? "FAIL" : warn > 0 ? "WARN" : "OK";

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/health"
        trail={["Admin", "Platform", "Health"]}
        eyebrow="Admin health"
        title="Platform health"
        desc="Aggregated checks across infrastructure, data integrity, and customer-facing flows. Generated every 60 seconds."
        actions={<span className="btn">Run now</span>}
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Overall"
            value={overall}
            delta={`${pass} pass · ${warn} warn · ${fail} fail`}
            color={
              overall === "OK"
                ? "var(--a-mint)"
                : overall === "WARN"
                  ? "var(--a-amber)"
                  : "var(--a-rose)"
            }
          />
          <AdminKPI label="Checks" value={checks.length} color="var(--a-gold)" />
          <AdminKPI label="Warnings" value={warn} color="var(--a-amber)" />
          <AdminKPI label="Failures" value={fail} color="var(--a-rose)" />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Checks"
            title="System status"
            actions={
              <span className="text-mute" style={{ fontSize: 11 }}>
                Generated{" "}
                {data.platformHealth?.generatedAt
                  ? new Date(data.platformHealth.generatedAt).toLocaleTimeString()
                  : "—"}
              </span>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Detail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted" style={{ padding: 24 }}>
                      No health checks configured.
                    </td>
                  </tr>
                ) : (
                  checks.map((check) => (
                    <tr key={check.key}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span
                            className={`dot-status ${
                              check.status === "pass"
                                ? "pass"
                                : check.status === "warn"
                                  ? "warn"
                                  : "fail"
                            }`}
                          />
                          <div>
                            <div className="row-title">{check.label}</div>
                            <div
                              className="row-sub mono"
                              style={{ fontSize: 11 }}
                            >
                              {check.key}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">{check.detail}</td>
                      <td>
                        <AdminPill
                          kind={
                            check.status === "pass"
                              ? "live"
                              : check.status === "warn"
                                ? "warn"
                                : "fail"
                          }
                        >
                          {check.status.toUpperCase()}
                        </AdminPill>
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
