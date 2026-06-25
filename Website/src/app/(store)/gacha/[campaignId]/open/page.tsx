import { redirect } from "next/navigation";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { GachaOpenPanelLazy } from "@/features/ynot/cr/GachaOpenPanelLazy";
import { Shell } from "@/features/ynot/cr/Shell";
import { getOpenCampaignForReveal, getTierAnimations, getYnotDashboardSlice } from "@/features/ynot/data";
import { i18n } from "@/features/ynot/i18n";
import { normalizeOpenIntentId } from "@/features/ynot/open-intent";

export const dynamic = "force-dynamic";

export default async function GachaOpenPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ qty?: string; auto?: string; intent?: string; pullAll?: string }>;
}) {
  const [{ campaignId }, query, data] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as { qty?: string; auto?: string; intent?: string; pullAll?: string }),
    getYnotDashboardSlice({ wallet: true }),
  ]);
  const [campaign, tierAnimations] = await Promise.all([
    getOpenCampaignForReveal(campaignId, data.viewer),
    getTierAnimations(),
  ]);
  const initialQuantity = Math.max(1, Math.min(100, Math.round(Number(query.qty) || 1)));
  const autoStart = query.auto === "1";
  const pullAllReveal = query.pullAll === "1";
  const intent = normalizeOpenIntentId(query.intent);
  if (campaign && ((campaign.openable && autoStart) || pullAllReveal)) {
    return (
      <Shell className="cr-root-immersive">
        <GachaOpenPanelLazy
          campaign={campaign}
          authenticated={data.viewer.authenticated}
          initialQuantity={initialQuantity}
          tierAnimations={tierAnimations}
          balanceCoins={data.wallet.balanceCoins}
          autoStart
          openIntentId={intent}
          pullAllReveal={pullAllReveal}
          immersive
        />
      </Shell>
    );
  }
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow={i18n("03 · Open Pack", "03 · เปิดแพ็ก")}
        title={i18n("Open gacha", "เปิดกาชา")}
        description={i18n(
          "Pick a live campaign before opening.",
          "เลือกแคมเปญที่เปิดอยู่ก่อนเริ่มเปิดแพ็ก",
        )}
      />
      <EmptyState
        title={i18n("No campaign", "ไม่มีแคมเปญ")}
        body={i18n(
          "Pick a live campaign before opening.",
          "เลือกแคมเปญที่เปิดอยู่ก่อนเริ่มเปิดแพ็ก",
        )}
      />
    </YnotShell>
  );
}
