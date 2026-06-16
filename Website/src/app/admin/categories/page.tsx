import { AdminCategoryWorkspace } from "@/features/ynot/admin/AdminCategoryWorkspace";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminFrame,
  AdminIcon,
  AdminKPI,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignLimit: null,
    categories: true,
  });
  const active = data.categories.filter((c) => c.isActive).length;
  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/categories"
        trail={["Admin", "Pack studio", "Categories"]}
        eyebrow="Admin categories"
        title="Pack categories"
        desc="Storefront category filters customers see in /packs and Home. Inactive categories are hidden from the public catalog."
        actions={
          <span className="btn btn-primary">
            <AdminIcon name="plus" />
            New category
          </span>
        }
      >
        <div className="kpi-grid">
          <AdminKPI label="Total categories" value={data.categories.length} color="var(--a-gold)" />
          <AdminKPI label="Active" value={active} color="var(--a-mint)" />
          <AdminKPI label="Hidden" value={data.categories.length - active} color="var(--a-muted)" />
          <AdminKPI label="Packs assigned" value={data.campaigns.length} color="var(--a-sky)" />
        </div>

        <AdminCategoryWorkspace
          campaigns={data.campaigns}
          initialCategories={data.categories}
        />
      </AdminFrame>
    </AdminGate>
  );
}
