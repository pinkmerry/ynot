import Link from "next/link";
import { CampaignDetailPanel, EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, data] = await Promise.all([params, getYnotDashboardData()]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader eyebrow="02 · Gacha Detail" title={campaign?.titleTh ?? "Campaign not found"} description="Pre-pull · S/A/B/C/D tiers · stock status · server-recorded results." action={campaign ? <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>Pull now</Link> : undefined} />
      {campaign ? <CampaignDetailPanel campaign={campaign} /> : <EmptyState title="Missing campaign" body="This campaign is not available or the database migration has not been applied." />}
    </YnotShell>
  );
}
