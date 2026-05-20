import Link from "next/link";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminBar,
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";
import type { YnotCampaign } from "@/features/ynot/types";

export const dynamic = "force-dynamic";

const LOGIC_LABEL: Record<string, string> = {
  pure_random: "pure random",
  weighted_templates: "weighted templates",
  inventory_gated: "inventory gated",
};

function thumbStyle(series: YnotCampaign["series"]) {
  return series === "pokemon"
    ? "linear-gradient(135deg,#3a2156,#1c2c5c)"
    : "linear-gradient(135deg,#2a1d33,#4a1b2a)";
}

function thumbLabel(series: YnotCampaign["series"]) {
  return series === "pokemon" ? "PKM" : "OP";
}

export default async function AdminPage() {
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignLimit: null,
    paymentMethods: true,
    exchanges: true,
    shipping: true,
    rankings: true,
    adminTopUps: true,
    ownerApprovalRequests: true,
  });

  const liveCampaigns = data.campaigns.filter((c) => c.status === "live");
  const draftCampaigns = data.campaigns.filter((c) => c.status === "draft");
  const closedCampaigns = data.campaigns.filter((c) => c.status === "closed");
  const pendingTopUps = data.adminTopUps.filter(
    (t) => t.status === "pending_review" || t.status === "pending_slip",
  );
  const shippingActive = data.shipping.filter(
    (s) => s.status === "submitted" || s.status === "packing",
  );
  const submittedShipping = data.shipping.filter((s) => s.status === "submitted");
  const exchangeReady = data.exchanges.filter(
    (e) => e.status === "submitted" || e.status === "approved",
  );

  const grossToday = data.adminTopUps
    .filter((t) => t.status === "approved")
    .reduce((sum, t) => sum + t.amountThb, 0);
  const coinsSold = data.adminTopUps
    .filter((t) => t.status === "approved")
    .reduce((sum, t) => sum + t.coinAmount, 0);
  const packsOpened = data.campaigns.reduce(
    (sum, c) => sum + Math.max(0, c.totalSlots - (c.totalSlots ?? 0)),
    0,
  );
  const avgPrize =
    data.campaigns.length === 0
      ? 0
      : Math.round(
          data.campaigns.reduce((sum, c) => sum + c.priceThb, 0) /
            data.campaigns.length,
        );

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin"
        trail={["Admin", "Dashboard"]}
        eyebrow="Admin"
        title="Control center"
        desc="Owner dashboard for live packs, payments, fulfilment, and platform health."
        badges={{
          "/admin/top-ups": pendingTopUps.length || undefined,
          "/admin/shipping": shippingActive.length || undefined,
          "/admin/exchange": exchangeReady.length || undefined,
        }}
        actions={
          <>
            <span className="text-mute" style={{ fontSize: 11 }}>
              Auto-refresh on
            </span>
            <Link href="/admin/campaigns" className="btn btn-primary">
              <AdminIcon name="plus" />
              New random pack
            </Link>
          </>
        }
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Gross revenue · today"
            value={fmtTHB(grossToday)}
            delta={grossToday ? "approved top-ups" : "no approved top-ups yet"}
            color="var(--a-gold)"
            spark={[12, 18, 15, 22, 28, 24, 30, 38, 34, 42, 52, 58]}
          />
          <AdminKPI
            label="Coins credited · today"
            value={coinsSold.toLocaleString()}
            delta={coinsSold ? "matches approved slips" : "—"}
            color="var(--a-sky)"
            spark={[20, 22, 21, 26, 28, 29, 30, 31, 38, 36, 44, 46]}
          />
          <AdminKPI
            label="Active campaigns"
            value={liveCampaigns.length.toLocaleString()}
            delta={`${draftCampaigns.length} draft · ${closedCampaigns.length} closed`}
            color="var(--a-mint)"
            spark={[2, 4, 5, 8, 11, 14, 18, 22, 28, 30, 32, 34]}
          />
          <AdminKPI
            label="Avg pack price"
            value={avgPrize ? fmtTHB(avgPrize) : "—"}
            delta={`${data.campaigns.length} packs in catalog`}
            color="var(--a-rose)"
            spark={[44, 40, 38, 42, 36, 32, 30, 28, 30, 26, 24, 22]}
          />
        </div>

        <div className="split-aside">
          <AdminCard>
            <AdminCardHead
              label="Live packs"
              title={`Random packs · ${data.campaigns.length}`}
              actions={
                <>
                  <div className="tabs">
                    <span className="t active">
                      All · {data.campaigns.length}
                    </span>
                    <span className="t">Live · {liveCampaigns.length}</span>
                    <span className="t">Draft · {draftCampaigns.length}</span>
                    <span className="t">Closed · {closedCampaigns.length}</span>
                  </div>
                  <Link href="/admin/campaigns" className="btn btn-sm">
                    <AdminIcon name="filter" size={12} />
                    Filter
                  </Link>
                </>
              }
            />
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pack</th>
                    <th>Status</th>
                    <th>Logic</th>
                    <th>Slots</th>
                    <th>Price</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.slice(0, 6).map((c) => (
                    <tr key={c.id}>
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
                            style={{ background: thumbStyle(c.series) }}
                          >
                            {thumbLabel(c.series)}
                          </span>
                          <span>
                            <span className="row-title">
                              {c.titleEn || c.titleTh}
                            </span>
                            <span
                              className="row-sub mono"
                              style={{ display: "block" }}
                            >
                              {c.slug}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <AdminStatusPill status={c.status} />
                      </td>
                      <td>
                        <span className="chip">
                          {LOGIC_LABEL[c.logicMode ?? ""] ??
                            c.mode.replace("_", " ")}
                        </span>
                      </td>
                      <td className="num tnum">
                        {c.totalSlots?.toLocaleString() ?? "—"}
                      </td>
                      <td className="num tnum">{fmtTHB(c.priceThb)}</td>
                      <td className="muted mono" style={{ fontSize: 11 }}>
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <Link
                          href={`/admin/campaigns/${c.id}/edit`}
                          className="btn btn-sm btn-ghost"
                          aria-label="More"
                        >
                          <AdminIcon name="chev-r" size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.campaigns.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted" style={{ padding: 24 }}>
                        No packs yet. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHead
              label="Action required"
              title={`Queue · ${pendingTopUps.length + shippingActive.length + exchangeReady.length + data.ownerApprovalRequests.length} items`}
              actions={
                <Link href="/admin/top-ups" className="btn btn-sm">
                  Open all
                </Link>
              }
            />
            <div className="list">
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(244,197,66,0.12)",
                    color: "var(--a-gold)",
                  }}
                >
                  <AdminIcon name="coin" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {pendingTopUps.length} top-ups pending review
                  </div>
                  <div className="row-sub">
                    {fmtTHB(
                      pendingTopUps.reduce((s, t) => s + t.amountThb, 0),
                    )}{" "}
                    across {pendingTopUps.length} slips
                  </div>
                </div>
                <Link href="/admin/top-ups" className="btn btn-sm">
                  Review
                </Link>
              </div>
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(108,166,255,0.12)",
                    color: "var(--a-sky)",
                  }}
                >
                  <AdminIcon name="truck" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {shippingActive.length} shipping requests to pack
                  </div>
                  <div className="row-sub">
                    {submittedShipping.length} submitted ·{" "}
                    {shippingActive.length - submittedShipping.length} in
                    packing
                  </div>
                </div>
                <Link href="/admin/shipping" className="btn btn-sm">
                  Open queue
                </Link>
              </div>
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(244,161,66,0.12)",
                    color: "var(--a-amber)",
                  }}
                >
                  <AdminIcon name="sparkles" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {data.ownerApprovalRequests.length} packs awaiting owner
                    review
                  </div>
                  <div className="row-sub">
                    {data.ownerApprovalRequests[0]?.campaign.titleEn ??
                      "Nothing waiting"}
                  </div>
                </div>
                <Link href="/admin/campaigns" className="btn btn-sm">
                  Review
                </Link>
              </div>
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(68,209,126,0.12)",
                    color: "var(--a-mint)",
                  }}
                >
                  <AdminIcon name="check" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {exchangeReady.length} exchange orders ready
                  </div>
                  <div className="row-sub">
                    {exchangeReady.reduce(
                      (s, e) => s + e.requestedCoinValue,
                      0,
                    ).toLocaleString()}{" "}
                    coin value · approve &amp; credit
                  </div>
                </div>
                <Link href="/admin/exchange" className="btn btn-sm">
                  Open
                </Link>
              </div>
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--a-muted)",
                  }}
                >
                  <AdminIcon name="pulse" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    Platform health checks
                  </div>
                  <div className="row-sub">
                    Open diagnostics only when needed to keep dashboard fast.
                  </div>
                </div>
                <Link href="/admin/health" className="btn btn-sm">
                  Open health
                </Link>
              </div>
            </div>
          </AdminCard>
        </div>

        <div className="split-aside-r">
          <AdminCard>
            <AdminCardHead
              label="Health"
              title="On-demand checks"
              actions={
                <Link href="/admin/health" className="btn btn-sm">
                  Open health
                </Link>
              }
            />
            <div className="list">
              <div className="list-row">
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(108,166,255,0.12)",
                    color: "var(--a-sky)",
                  }}
                >
                  <AdminIcon name="pulse" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    Full diagnostics load on the health page
                  </div>
                  <div className="row-sub">
                    Use this dashboard for daily queues; open health when you
                    need platform, database, or configuration checks.
                  </div>
                </div>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHead
              label="Owner approval"
              title={`${data.ownerApprovalRequests.length} drafts`}
              actions={
                <Link href="/admin/campaigns" className="btn btn-sm">
                  Open queue →
                </Link>
              }
            />
            <div className="list">
              {data.ownerApprovalRequests.slice(0, 4).map((req) => (
                <div className="list-row" key={req.id}>
                  <span
                    className="thumb"
                    style={{ background: thumbStyle(req.campaign.series) }}
                  >
                    {thumbLabel(req.campaign.series)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      {req.campaign.titleEn || req.campaign.titleTh}
                    </div>
                    <div className="row-sub mono" style={{ fontSize: 11 }}>
                      {req.campaign.slug} · {req.requestedByLabel}
                    </div>
                  </div>
                  <AdminStatusPill status={req.approvalStatus} />
                </div>
              ))}
              {data.ownerApprovalRequests.length === 0 && (
                <div className="list-row">
                  <span className="dot-status pass" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>Approval queue clear</div>
                    <div className="row-sub">
                      No drafts waiting on owner review.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AdminCard>
        </div>

        <AdminCard>
          <AdminCardHead label="Today" title="Snapshot" />
          <div
            className="card-pad"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
              gap: 16,
            }}
          >
            <div>
              <p className="section-label">Packs opened (synthetic)</p>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {packsOpened.toLocaleString()}
              </div>
            </div>
            <div>
              <p className="section-label">Wallet float</p>
              <div className="tnum" style={{ fontSize: 18, fontWeight: 600 }}>
                {data.wallet?.balanceCoins?.toLocaleString() ?? "—"}c
              </div>
            </div>
            <div>
              <p className="section-label">Active rankings</p>
              <div className="tnum" style={{ fontSize: 18, fontWeight: 600 }}>
                {data.rankings.length}
              </div>
            </div>
            <div>
              <p className="section-label">Data issues</p>
              <div className="tnum" style={{ fontSize: 18, fontWeight: 600 }}>
                {data.dataIssues.length}
              </div>
            </div>
          </div>
          {data.campaigns[0] && (
            <div className="card-pad" style={{ borderTop: "1px solid var(--a-border-soft)" }}>
              <p className="section-label">Top live pack</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 6,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="row-title">
                    {data.campaigns[0].titleEn || data.campaigns[0].titleTh}
                  </div>
                  <div className="row-sub">
                    Total slots {data.campaigns[0].totalSlots.toLocaleString()} ·{" "}
                    {fmtTHB(data.campaigns[0].priceThb)} per slot
                  </div>
                </div>
                <div style={{ minWidth: 200 }}>
                  <AdminBar value={50} tone="mint" />
                </div>
              </div>
            </div>
          )}
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
