import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { GachaOpenPanel } from "@/features/ynot/client";
import { getCampaign, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaOpenPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, data] = await Promise.all([params, getYnotDashboardData()]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader eyebrow="03 · Open Pack (Cinematic)" title={campaign ? `Open ${campaign.titleTh}` : "Open gacha"} description="5 stages: confirm → fade → tension → reveal → result · click to start." />
      {campaign ? <GachaOpenPanel campaign={campaign} authenticated={data.viewer.authenticated} /> : <EmptyState title="No campaign" body="Pick a live campaign before opening." />}
    </YnotShell>
  );
}
