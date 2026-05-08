import { AdminGate, PageHeader, RankingTable, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminRankingsPage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin rankings" title="Ranking snapshots" description="Review public-safe ranking rows before publishing/moderating future snapshots. The public ranking page uses the same sanitized snapshot data." /><RankingTable rankings={data.rankings} /></YnotShell></AdminGate>;
}
