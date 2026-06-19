import { redirect } from "next/navigation";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, viewer] = await Promise.all([params, getYnotViewer()]);
  const [data, campaign] = await Promise.all([
    getYnotDashboardSlice({ wallet: true }),
    getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer }),
  ]);
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow="Y-Pack Detail"
        title="Campaign not found"
        description="This Y-Pack is not available or the database migration has not been applied."
      />
      <EmptyState
        title="Missing campaign"
        body="Go back to all packs and choose another Y-Pack."
      />
    </YnotShell>
  );
}
