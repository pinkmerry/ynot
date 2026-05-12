import { PageHeader, RankingTable, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const data = await getYnotDashboardData();
  return <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}><PageHeader eyebrow="05 · Ranking" title="Ranking" description="4 time ranges · Top 1 hero + ranks 2-10." /><RankingTable rankings={data.rankings} /></YnotShell>;
}
