import { AdminControlCenter, AdminSectionShell, PageHeader } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

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
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin">
      <PageHeader
        eyebrow="Admin"
        title="Admin Control Center"
        description="Manage random packs, categories, users, wallet top-ups, shipping, exchange, settings, audit, and health from one owner dashboard."
      />
      <AdminControlCenter data={data} />
    </AdminSectionShell>
  );
}
