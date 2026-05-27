import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { GachaOpenPanel } from "@/features/ynot/client";
import { getCampaign, getTierAnimations, getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function GachaOpenPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ qty?: string; auto?: string }>;
}) {
  const [{ campaignId }, query, data, tierAnimations] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { qty?: string; auto?: string }),
    getYnotDashboardSlice(),
    getTierAnimations(),
  ]);
  const campaign = await getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer: data.viewer });
  const initialQuantity = Math.max(1, Math.min(100, Math.round(Number(query.qty) || 1)));
  const autoStart = query.auto === "1";
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader eyebrow="03 · Open Pack (Cinematic)" title={campaign ? `Open ${campaign.titleTh}` : "Open gacha"} description="Confirm · tension · reveal · summary · skip available." />
      {campaign ? (
        <GachaOpenPanel
          campaign={campaign}
          authenticated={data.viewer.authenticated}
          initialQuantity={initialQuantity}
          tierAnimations={tierAnimations}
          autoStart={autoStart}
        />
      ) : (
        <EmptyState title="No campaign" body="Pick a live campaign before opening." />
      )}
    </YnotShell>
  );
}
