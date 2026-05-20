import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminRankingsPage() {
  const data = await getYnotDashboardSlice({ rankings: true });
  const top = data.rankings[0];
  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/rankings"
        trail={["Admin", "People", "Rankings"]}
        eyebrow="Admin rankings"
        title="Customer leaderboards"
        desc="Public leaderboards are derived from these rules. Reset or freeze a board before campaign endings to lock in winners."
        actions={
          <>
            <span className="btn">Recalculate</span>
            <span className="btn btn-primary">
              <AdminIcon name="plus" />
              New board
            </span>
          </>
        }
      >
        <div className="kpi-grid">
          <AdminKPI label="Rows" value={data.rankings.length} color="var(--a-gold)" />
          <AdminKPI
            label="Top spender"
            value={top ? top.displayName : "—"}
            delta={top ? `${top.value.toLocaleString()} ${top.metric}` : ""}
            color="var(--a-mint)"
          />
          <AdminKPI label="Active boards" value={1} color="var(--a-sky)" />
          <AdminKPI label="Refresh interval" value="5m" color="var(--a-amber)" />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Leaderboard"
            title="Top 50"
            actions={
              <div className="tabs">
                <span className="t active">30d</span>
                <span className="t">7d</span>
                <span className="t">All-time</span>
              </div>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Customer</th>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {data.rankings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24 }}>
                      No ranking rows. Generate a snapshot first.
                    </td>
                  </tr>
                ) : (
                  data.rankings.map((row) => {
                    const initials =
                      (row.displayName ?? "U")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase() || "U";
                    return (
                      <tr key={`${row.rank}-${row.displayName}`}>
                        <td>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 700,
                              fontSize: 12,
                              background:
                                row.rank === 1
                                  ? "linear-gradient(135deg,#df9824,#f4c542)"
                                  : row.rank === 2
                                    ? "linear-gradient(135deg,#7d7f96,#c8c8d8)"
                                    : row.rank === 3
                                      ? "linear-gradient(135deg,#7a4f2a,#cf8750)"
                                      : "rgba(255,255,255,0.05)",
                              color:
                                row.rank <= 3 ? "#161616" : "var(--a-muted)",
                            }}
                          >
                            {row.rank}
                          </div>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <span
                              className="thumb sq"
                              style={{
                                background:
                                  "linear-gradient(135deg,#4b3da1,#b452c7)",
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              {initials}
                            </span>
                            <div className="row-title">{row.displayName}</div>
                          </div>
                        </td>
                        <td className="muted" style={{ fontSize: 11 }}>
                          {row.metric}
                        </td>
                        <td className="num tnum" style={{ fontWeight: 600 }}>
                          {row.value.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
