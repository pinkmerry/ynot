import { AdminTopUpActions } from "@/features/ynot/client";
import { AdminGate, TopUpTable } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminTopUpsPage() {
  const data = await getYnotDashboardSlice({ adminTopUps: true });
  const pending = data.adminTopUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  );
  const awaitingSlip = data.adminTopUps.filter((t) => t.status === "pending_slip");
  const approved = data.adminTopUps.filter((t) => t.status === "approved");
  const volume = approved.reduce((s, t) => s + t.amountThb, 0);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/top-ups"
        trail={["Admin", "Operations", "Top-ups"]}
        eyebrow="Admin top-ups"
        title="Manual payment confirmation"
        desc="Review bank/QR slip uploads, approve or reject manually, and credit wallet coins exactly once through the database RPC."
        badges={{ "/admin/top-ups": pending.length || undefined }}
        actions={
          <span className="btn">
            <AdminIcon name="filter" />
            Filters
          </span>
        }
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Pending review"
            value={pending.filter((t) => t.status === "pending_review").length}
            delta={pending.length ? "needs action" : "all clear"}
            deltaDir={pending.length ? "down" : "up"}
            color="var(--a-rose)"
          />
          <AdminKPI
            label="Awaiting slip"
            value={awaitingSlip.length}
            color="var(--a-amber)"
          />
          <AdminKPI
            label="Approved"
            value={approved.length}
            color="var(--a-mint)"
          />
          <AdminKPI
            label="Volume · approved"
            value={fmtTHB(volume)}
            color="var(--a-gold)"
          />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Payment queue"
            title={`Pending review · ${pending.length}`}
            actions={
              <div className="tabs">
                <span className="t active">All · {pending.length}</span>
                <span className="t">
                  Pending ·{" "}
                  {pending.filter((t) => t.status === "pending_review").length}
                </span>
                <span className="t">Slip · {awaitingSlip.length}</span>
              </div>
            }
          />
          <div className="list">
            {pending.length === 0 ? (
              <div className="list-row text-mute">No pending top-ups.</div>
            ) : (
              pending.map((t) => (
                <div className="list-row" key={t.id}>
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
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {t.publicCode}
                      </span>
                      <AdminStatusPill status={t.status} />
                    </div>
                    <div className="row-sub">
                      <span className="tnum">
                        {fmtTHB(t.amountThb)} · {t.coinAmount.toLocaleString()}{" "}
                        coins
                      </span>{" "}
                      · profile{" "}
                      <span className="mono">{t.profileId.slice(0, 8)}…</span>
                      {" "}· {new Date(t.createdAt).toLocaleString()}
                    </div>
                    {t.customerNote && (
                      <div
                        className="text-mute"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        “{t.customerNote}”
                      </div>
                    )}
                  </div>
                  <AdminTopUpActions topUpId={t.id} />
                </div>
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="All top-ups" title="History" />
          <div className="card-pad">
            <TopUpTable topUps={data.adminTopUps} admin />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
