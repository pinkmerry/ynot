import { AdminCategoryForm } from "@/features/ynot/client";
import {
  AdminCategoryManager,
  AdminGate,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
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

        <AdminCard>
          <AdminCardHead label="Create" title="New category" />
          <div className="card-pad">
            <AdminCategoryForm categories={data.categories} />
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead label="Order" title="Display order on /packs" />
          <div className="card-pad">
            <AdminCategoryManager
              campaigns={data.campaigns}
              categories={data.categories}
            />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
