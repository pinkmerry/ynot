import {
  AdminCampaignForm,
  AdminCampaignTable,
  OwnerApprovalQueue,
} from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
} from "@/features/ynot/components";
import { getAdminCards, getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const [data, cards] = await Promise.all([
    getYnotDashboardSlice({
      campaigns: true,
      campaignVisibility: "admin",
      campaignLimit: null,
      categories: true,
      ownerApprovalRequests: true,
    }),
    getAdminCards(),
  ]);
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/campaigns">
      <PageHeader
        eyebrow="Admin random packs"
        title="Random Pack Studio"
        description="Create draft random packs, submit owner review, and keep customer-facing publish actions behind the owner approval queue."
      />

      <section className="admin-panel admin-workflow-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Pack workflow</p>
            <h3 className="title-m">One clean flow from draft to live</h3>
          </div>
          <span className="status-pill ready">Owner tool</span>
        </div>
        <div className="admin-roadmap-grid">
          <div>
            <strong>1. Draft</strong>
            <p>Set category, title, price, slots, mode, and customer card labels.</p>
          </div>
          <div>
            <strong>2. Prize pool</strong>
            <p>Add cards in Prize Catalog before going fully live.</p>
          </div>
          <div>
            <strong>3. Publish</strong>
            <p>Submit owner review; owner approval publishes the pack live.</p>
          </div>
          <div>
            <strong>4. Operate</strong>
            <p>Monitor opens, exchange, shipping, and audit evidence from admin tools.</p>
          </div>
        </div>
      </section>

      {data.viewer.adminRole === "owner" && (
        <OwnerApprovalQueue
          requests={data.ownerApprovalRequests}
          viewerRole={data.viewer.adminRole}
        />
      )}

      <AdminCampaignTable campaigns={data.campaigns} />

      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCampaignForm categories={data.categories} cards={cards} />
      </div>
    </AdminSectionShell>
  );
}
