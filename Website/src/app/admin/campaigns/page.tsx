import {
  AdminCampaignForm,
  AdminCampaignTable,
  OwnerApprovalQueue,
} from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import { getAdminCards, getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const [data, cards] = await Promise.all([
    getYnotDashboardSlice({
      campaigns: true,
      campaignVisibility: "admin",
      campaignLimit: null,
      categories: true,
      campaignReadiness: false,
      campaignPrizeLineups: true,
      ownerApprovalRequests: true,
      wallet: false,
    }),
    getAdminCards(),
  ]);

  const live = data.campaigns.filter((c) => c.status === "live").length;
  const drafts = data.campaigns.filter((c) => c.status === "draft").length;
  const closed = data.campaigns.filter((c) => c.status === "closed").length;
  const waiting = data.ownerApprovalRequests.length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/campaigns"
        trail={["Admin", "Pack studio", "Random packs"]}
        eyebrow="Admin random packs"
        title="Random Pack Studio"
        desc="Draft a random pack, configure its draw logic, then submit owner review. The owner publishes from the approval queue."
        actions={
          <span className="chip mono">
            <AdminIcon name="sparkles" size={11} /> {data.campaigns.length} total
          </span>
        }
      >
        <div className="kpi-grid">
          <AdminKPI label="Total packs" value={data.campaigns.length} color="var(--a-gold)" />
          <AdminKPI label="Live" value={live} color="var(--a-mint)" />
          <AdminKPI
            label="Drafts"
            value={drafts}
            delta={`${closed} closed`}
            color="var(--a-amber)"
          />
          <AdminKPI
            label="Waiting on owner"
            value={waiting}
            delta={waiting ? "Review queue open" : "All clear"}
            deltaDir={waiting ? "down" : "up"}
            color="var(--a-sky)"
          />
        </div>

        <AdminCard>
          <div
            className="card-pad"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 16,
            }}
          >
            {[
              {
                n: "01",
                t: "Draft",
                d: "Set title, mode, slot/pull count, pricing, and customer labels.",
              },
              {
                n: "02",
                t: "Prize pool",
                d: "Assign catalog cards as prizes; set tier, weight, unlock %.",
              },
              {
                n: "03",
                t: "Review",
                d: "Submit owner review. Owner can edit logic and simulate draws.",
              },
              {
                n: "04",
                t: "Operate",
                d: "Monitor opens, exchange, shipping, and audit evidence.",
              },
            ].map((s, i, arr) => (
              <div
                key={s.n}
                style={{ display: "flex", gap: 10, position: "relative" }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--a-gold)", fontWeight: 600 }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.t}</div>
                  <div
                    className="text-mute"
                    style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5 }}
                  >
                    {s.d}
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      right: -8,
                      top: 6,
                      color: "var(--a-muted-2)",
                    }}
                  >
                    <AdminIcon name="chev-r" size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </AdminCard>

        {data.viewer.adminRole === "owner" && data.ownerApprovalRequests.length > 0 && (
          <AdminCard>
            <AdminCardHead
              label="Owner approval queue"
              title={`${waiting} drafts waiting on owner`}
            />
            <div className="card-pad">
              <OwnerApprovalQueue
                requests={data.ownerApprovalRequests}
                viewerRole={data.viewer.adminRole}
              />
            </div>
          </AdminCard>
        )}

        <AdminCard>
          <AdminCardHead
            label="Current random packs"
            title={`${data.campaigns.length} packs across visibility`}
            actions={
              <div className="tabs">
                <span className="t active">All</span>
                <span className="t">Public</span>
                <span className="t">Hidden</span>
                <span className="t">Private</span>
              </div>
            }
          />
          <div className="card-pad">
            <AdminCampaignTable campaigns={data.campaigns} />
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Draft pack" title="Pack studio" />
          <div className="card-pad">
            <AdminCampaignForm categories={data.categories} cards={cards} />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
