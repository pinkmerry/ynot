import { CampaignDetailPanel, EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice } from "@/features/ynot/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export default async function GachaDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, data] = await Promise.all([params, getYnotDashboardSlice()]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  const showAdminEdit = data.viewer.isAdmin || isDevAuthAllowed();
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      {campaign ? (
        <CampaignDetailPanel campaign={campaign} showAdminEdit={showAdminEdit} />
      ) : (
        <>
          <PageHeader
            eyebrow="Y-Pack Detail"
            title="Campaign not found"
            description="This Y-Pack is not available or the database migration has not been applied."
          />
          <EmptyState
            title="Missing campaign"
            body="Go back to all packs and choose another Y-Pack."
          />
        </>
      )}
    </YnotShell>
  );
}
