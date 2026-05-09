import { AdminCategoryForm } from "@/features/ynot/client";
import {
  AdminCategoryManager,
  AdminSectionShell,
  PageHeader,
} from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const data = await getYnotDashboardData();
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/categories">
      <PageHeader
        eyebrow="Admin categories"
        title="Category Manager"
        description="Control the visible storefront category model now, and prepare the future DB-backed category manager without reimplementing the admin UX later."
      />
      <div className="admin-page-grid">
        <AdminCategoryForm categories={data.categories} />
        <AdminCategoryManager
          campaigns={data.campaigns}
          categories={data.categories}
        />
      </div>
    </AdminSectionShell>
  );
}
