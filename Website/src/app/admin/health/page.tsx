import { AdminSectionShell, PageHeader, PlatformHealthPanel } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const data = await getYnotDashboardSlice({ platformHealth: true });
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/health">
      <PageHeader
        eyebrow="Admin health"
        title="Production readiness signals"
        description="Technical DB, provider, environment, rate-limit, and degraded-read checks live here so the main admin dashboard stays operational."
      />
      <PlatformHealthPanel health={data.platformHealth} />
    </AdminSectionShell>
  );
}
