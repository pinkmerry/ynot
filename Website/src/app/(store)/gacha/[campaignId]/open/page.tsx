import { redirect } from "next/navigation";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { GachaOpenPanelLazy } from "@/features/ynot/cr/GachaOpenPanelLazy";
import { getOpenCampaignForReveal, getTierAnimations, getYnotDashboardSlice } from "@/features/ynot/data";
import { normalizeOpenIntentId } from "@/features/ynot/open-intent";

export const dynamic = "force-dynamic";

export default async function GachaOpenPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ qty?: string; auto?: string; intent?: string }>;
}) {
  const [{ campaignId }, query, data] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as { qty?: string; auto?: string; intent?: string }),
    getYnotDashboardSlice({ wallet: true }),
  ]);
  const [campaign, tierAnimations] = await Promise.all([
    getOpenCampaignForReveal(campaignId, data.viewer),
    getTierAnimations(),
  ]);
  const initialQuantity = Math.max(1, Math.min(100, Math.round(Number(query.qty) || 1)));
  const autoStart = query.auto === "1";
  const intent = normalizeOpenIntentId(query.intent);
  if (campaign && campaign.openable && autoStart) {
    return (
      <GachaOpenPanelLazy
        campaign={campaign}
        authenticated={data.viewer.authenticated}
        initialQuantity={initialQuantity}
        tierAnimations={tierAnimations}
        autoStart
        openIntentId={intent}
        immersive
      />
    );
  }
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow="03 · Open Pack"
        title="Open gacha"
        description="Pick a live campaign before opening."
      />
      <EmptyState title="No campaign" body="Pick a live campaign before opening." />
    </YnotShell>
  );
}
