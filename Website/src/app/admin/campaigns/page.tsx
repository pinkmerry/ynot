import { AdminCampaignActionPanel, AdminCampaignForm } from "@/features/ynot/client";
import {
  AdminSectionShell,
  CampaignGrid,
  PageHeader,
} from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const data = await getYnotDashboardData();
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/campaigns">
      <PageHeader
        eyebrow="Admin random packs"
        title="Random Pack Studio"
        description="Create, tag, price, publish, close, and archive customer-facing random packs. Website and LIFF should read these same draw_rounds records."
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
            <p>Switch status to Live and visibility to Public when ready.</p>
          </div>
          <div>
            <strong>4. Operate</strong>
            <p>Monitor opens, exchange, shipping, and audit evidence from admin tools.</p>
          </div>
        </div>
      </section>

      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCampaignForm categories={data.categories} />
        <AdminCampaignActionPanel campaigns={data.campaigns} />
        <section className="admin-panel admin-full-span soft-card">
          <div className="admin-panel-head">
            <div>
              <p className="section-label">Customer preview</p>
              <h3 className="title-m">Current random packs</h3>
            </div>
          </div>
          <CampaignGrid campaigns={data.campaigns} />
        </section>
      </div>
    </AdminSectionShell>
  );
}
