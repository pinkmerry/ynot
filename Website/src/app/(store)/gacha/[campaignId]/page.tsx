import Link from "next/link";
import { CampaignDetailPanel, EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, data] = await Promise.all([params, getYnotDashboardSlice()]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  const showAdminEdit = data.viewer.isAdmin || process.env.NODE_ENV !== "production";
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader eyebrow="02 · Gacha Detail" title={campaign?.titleTh ?? "Campaign not found"} description="Pre-pull · S/A/B/C/D tiers · stock status · server-recorded results." action={campaign?.openable ? <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>Pull now</Link> : undefined} />
      {campaign ? <CampaignDetailPanel campaign={campaign} showAdminEdit={showAdminEdit} /> : <EmptyState title="Missing campaign" body="This campaign is not available or the database migration has not been applied." />}
    </YnotShell>
  );
}
