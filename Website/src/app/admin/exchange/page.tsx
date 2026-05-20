import { AdminExchangeActions } from "@/features/ynot/client";
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

export default async function AdminExchangePage() {
  const data = await getYnotDashboardSlice({ exchanges: true });
  const submitted = data.exchanges.filter((o) => o.status === "submitted");
  const approved = data.exchanges.filter((o) => o.status === "approved");
  const completed = data.exchanges.filter((o) => o.status === "completed");
  const rejected = data.exchanges.filter((o) => o.status === "rejected");

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/exchange"
        trail={["Admin", "Operations", "Exchange"]}
        eyebrow="Admin exchange"
        title="Coin purchases"
        desc="Customers buy coins with cash or bank transfer to open random packs. Confirm payments to credit coins; auto-match runs every 60s."
        badges={{ "/admin/exchange": submitted.length || undefined }}
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Pending confirm"
            value={submitted.length}
            delta={submitted.length ? "needs action" : "all clear"}
            deltaDir={submitted.length ? "down" : "up"}
            color="var(--a-amber)"
          />
          <AdminKPI
            label="Approved"
            value={approved.length}
            color="var(--a-mint)"
          />
          <AdminKPI
            label="Completed"
            value={completed.length}
            color="var(--a-gold)"
          />
          <AdminKPI
            label="Rejected"
            value={rejected.length}
            color="var(--a-rose)"
          />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Pending confirm"
            title={`${submitted.length} customer payment${submitted.length === 1 ? "" : "s"} waiting`}
            actions={
              <span className="text-mute" style={{ fontSize: 11 }}>
                Click{" "}
                <span className="chip mono" style={{ fontSize: 10 }}>
                  Confirm
                </span>{" "}
                to credit coins.
              </span>
            }
          />
          <div className="list">
            {submitted.length === 0 ? (
              <div className="list-row text-mute">No pending exchange orders.</div>
            ) : (
              submitted.map((order) => (
                <div className="list-row" key={order.id}>
                  <span
                    className="thumb sq"
                    style={{
                      background: "rgba(244,197,66,0.10)",
                      color: "var(--a-gold)",
                    }}
                  >
                    <AdminIcon name="coin" size={16} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {order.publicCode}
                      </span>
                      <AdminStatusPill status={order.status} />
                    </div>
                    <div className="row-sub">
                      Requested value{" "}
                      <span className="tnum" style={{ color: "var(--a-gold)" }}>
                        {order.requestedCoinValue.toLocaleString()} coins
                      </span>{" "}
                      · {new Date(order.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <AdminExchangeActions order={order} />
                </div>
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="All purchases"
            title="Customers buying coins"
            actions={
              <div className="tabs">
                <span className="t active">All · {data.exchanges.length}</span>
                <span className="t">Pending · {submitted.length}</span>
                <span className="t">Approved · {approved.length}</span>
                <span className="t">Completed · {completed.length}</span>
                <span className="t">Rejected · {rejected.length}</span>
              </div>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Approved</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.exchanges.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 24 }}>
                      No exchange orders yet.
                    </td>
                  </tr>
                ) : (
                  data.exchanges.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {order.publicCode}
                        </span>
                      </td>
                      <td>
                        <AdminStatusPill status={order.status} />
                      </td>
                      <td className="num tnum">
                        {order.requestedCoinValue.toLocaleString()}c
                      </td>
                      <td className="num tnum">
                        {order.approvedCoinValue
                          ? `${order.approvedCoinValue.toLocaleString()}c`
                          : "—"}
                      </td>
                      <td className="mono muted" style={{ fontSize: 11 }}>
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <AdminExchangeActions order={order} />
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
