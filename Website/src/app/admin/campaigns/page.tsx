import { AdminCampaignActionPanel, AdminCampaignForm } from "@/features/ynot/client";
import { AdminGate, CampaignGrid, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin campaigns" title="Campaign inventory" description="Create, publish, close, and archive shared draw_rounds so LIFF and website stay aligned." /><div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><AdminCampaignForm /><AdminCampaignActionPanel campaigns={data.campaigns} /><div className="xl:col-span-2"><CampaignGrid campaigns={data.campaigns} /></div></div></YnotShell></AdminGate>;
}
