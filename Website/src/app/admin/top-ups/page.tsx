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

type TopUpFilter =
  | "all"
  | "pending"
  | "valid"
  | "mismatch"
  | "duplicate"
  | "provider_error"
  | "rejected"
  | "approved";

const topUpFilters: { key: TopUpFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "valid", label: "Valid" },
  { key: "mismatch", label: "Mismatch" },
  { key: "duplicate", label: "Duplicate" },
  { key: "provider_error", label: "Provider" },
  { key: "rejected", label: "Rejected" },
  { key: "approved", label: "Approved" },
];

function normalizeTopUpFilter(value: string | undefined): TopUpFilter {
  return topUpFilters.some((filter) => filter.key === value)
    ? (value as TopUpFilter)
    : "all";
}

export default async function AdminTopUpsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as { filter?: string }));
  const activeFilter = normalizeTopUpFilter(params.filter);
  const data = await getYnotDashboardSlice({ adminTopUps: true });
  const pending = data.adminTopUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  );
  const awaitingSlip = data.adminTopUps.filter((t) => t.status === "pending_slip");
  const approved = data.adminTopUps.filter((t) => t.status === "approved");
  const validPrecheck = data.adminTopUps.filter(
    (t) => t.slipVerification?.status === "valid",
  );
  const mismatch = data.adminTopUps.filter((t) =>
    ["amount_mismatch", "receiver_mismatch", "date_mismatch"].includes(
      t.slipVerification?.status ?? "",
    ),
  );
  const duplicate = data.adminTopUps.filter(
    (t) => t.slipVerification?.status === "duplicate",
  );
  const providerError = data.adminTopUps.filter(
    (t) => t.slipVerification?.status === "provider_error",
  );
  const volume = approved.reduce((s, t) => s + t.amountThb, 0);
  const filterCounts: Record<TopUpFilter, number> = {
    all: pending.length,
    pending: pending.filter((t) => t.status === "pending_review").length,
    valid: validPrecheck.length,
    mismatch: mismatch.length,
    duplicate: duplicate.length,
    provider_error: providerError.length,
    rejected: data.adminTopUps.filter((t) => t.status === "rejected").length,
    approved: approved.length,
  };
  const visibleTopUps = data.adminTopUps.filter((topUp) => {
    if (activeFilter === "all") return pending.includes(topUp);
    if (activeFilter === "pending") return topUp.status === "pending_review";
    if (activeFilter === "valid") return topUp.slipVerification?.status === "valid";
    if (activeFilter === "mismatch") {
      return ["amount_mismatch", "receiver_mismatch", "date_mismatch"].includes(
        topUp.slipVerification?.status ?? "",
      );
    }
    if (activeFilter === "duplicate") return topUp.slipVerification?.status === "duplicate";
    if (activeFilter === "provider_error") return topUp.slipVerification?.status === "provider_error";
    return topUp.status === activeFilter;
  });

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
            title={`${topUpFilters.find((filter) => filter.key === activeFilter)?.label ?? "All"} · ${visibleTopUps.length}`}
            actions={
              <div className="tabs">
                {topUpFilters.map((filter) => (
                  <a
                    className={`t ${activeFilter === filter.key ? "active" : ""}`}
                    href={`/admin/top-ups?filter=${filter.key}`}
                    key={filter.key}
                  >
                    {filter.label} · {filterCounts[filter.key]}
                  </a>
                ))}
              </div>
            }
          />
          <div className="list">
            {visibleTopUps.length === 0 ? (
              <div className="list-row text-mute">No top-ups in this filter.</div>
            ) : (
              visibleTopUps.map((t) => (
                <div className="list-row" key={t.id ?? t.publicCode}>
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
                      <span className="mono">{t.profileId?.slice(0, 8) ?? "Unknown"}…</span>
                      {" "}· {new Date(t.createdAt).toLocaleString()}
                    </div>
                    <div className="row-sub">
                      Method:{" "}
                      <span className="mono">
                        {t.paymentMethod?.displayName ?? "Unknown method"}
                      </span>{" "}
                      · Slip:{" "}
                      <span className="mono">
                        {t.slipVerification?.status ?? "not uploaded"}
                      </span>
                      {t.slipVerification?.providerCode
                        ? ` · ${t.slipVerification.providerCode}`
                        : ""}
                    </div>
                    {t.slipVerification?.providerMessage && (
                      <div
                        className="text-mute"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        {t.slipVerification.providerMessage}
                      </div>
                    )}
                    {t.customerNote && (
                      <div
                        className="text-mute"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        “{t.customerNote}”
                      </div>
                    )}
                  </div>
                  {t.id && <AdminTopUpActions topUpId={t.id} />}
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
