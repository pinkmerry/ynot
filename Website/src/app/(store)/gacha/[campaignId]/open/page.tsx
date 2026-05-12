import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { GachaOpenPanel } from "@/features/ynot/client";
import { getCampaign, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaOpenPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ qty?: string }>;
}) {
  const [{ campaignId }, query, data] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { qty?: string }),
    getYnotDashboardData(),
  ]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  const initialQuantity = Math.max(1, Math.min(100, Math.round(Number(query.qty) || 1)));
  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader eyebrow="03 · Open Pack (Cinematic)" title={campaign ? `Open ${campaign.titleTh}` : "Open gacha"} description="5 stages: confirm → fade → tension → reveal → result · click to start." />
      {campaign ? <GachaOpenPanel campaign={campaign} authenticated={data.viewer.authenticated} initialQuantity={initialQuantity} /> : <EmptyState title="No campaign" body="Pick a live campaign before opening." />}
    </YnotShell>
  );
}
