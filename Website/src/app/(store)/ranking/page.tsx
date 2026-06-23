import { PageHeader, RankingTable, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { i18n } from "@/features/ynot/i18n";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const data = await getYnotDashboardSlice({ rankings: true });
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow={i18n("05 · Ranking", "05 · อันดับ")}
        title={i18n("Ranking", "อันดับ")}
        description={i18n(
          "4 time ranges · Top 1 hero + ranks 2-10.",
          "4 ช่วงเวลา · อันดับ 1 แบบเด่น + อันดับ 2-10",
        )}
      />
      <RankingTable rankings={data.rankings} />
    </YnotShell>
  );
}
