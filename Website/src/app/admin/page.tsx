import { AdminGate, AdminSummary, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin" title="Operations dashboard" description="Owner/admin/staff access is database-backed by admin_users and rechecked server-side for every admin route and mutation." /><AdminSummary data={data} /></YnotShell></AdminGate>;
}
