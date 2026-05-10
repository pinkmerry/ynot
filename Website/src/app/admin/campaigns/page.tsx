import { AdminCampaignActionPanel, AdminCampaignForm } from "@/features/ynot/client";
import {
  AdminSectionShell,
  CampaignGrid,
  PageHeader,
} from "@/features/ynot/components";
import { PendingApprovalQueue } from "@/features/ynot/components/PendingApprovalQueue";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const data = await getYnotDashboardData();
  const isOwner = data.viewer?.adminRole === "owner";

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
            <h3 className="title-m">Draft → Pending → Approved → Live</h3>
          </div>
          <span className="status-pill ready">{isOwner ? "Owner tool" : "Admin tool"}</span>
        </div>
        <div className="admin-roadmap-grid">
          <div>
            <strong>1. Draft</strong>
            <p>Admin: ตั้งค่า category, title, price, spin mode, prizes</p>
          </div>
          <div>
            <strong>2. Submit for approval</strong>
            <p>Admin กดส่งให้ owner review</p>
          </div>
          <div>
            <strong>3. Approve & Publish</strong>
            <p>Owner เท่านั้นที่ approve และกด publish (lock spin config)</p>
          </div>
          <div>
            <strong>4. Live</strong>
            <p>Spin config ถูก lock ไม่สามารถแก้ได้แล้ว แก้ได้แค่รูป/label</p>
          </div>
        </div>
      </section>

      {isOwner ? (
        <section className="admin-panel admin-full-span soft-card">
          <div className="admin-panel-head">
            <div>
              <p className="section-label">Owner inbox</p>
              <h3 className="title-m">Pending approval</h3>
            </div>
          </div>
          <PendingApprovalQueue />
        </section>
      ) : null}

      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCampaignForm categories={data.categories} />
        <AdminCampaignActionPanel campaigns={data.campaigns} viewer={data.viewer} />
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
