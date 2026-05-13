import {
  AdminSectionShell,
  PageHeader,
  RankingTable,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminRankingsPage() {
  const data = await getYnotDashboardSlice({ rankings: true });
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/rankings">
      <PageHeader
        eyebrow="Admin rankings"
        title="Ranking snapshots"
        description="Review public-safe ranking rows before publishing/moderating future snapshots. The public ranking page uses the same sanitized snapshot data."
      />
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Leaderboard preview</p>
            <h3 className="title-m">Current ranking data</h3>
          </div>
          <span className="status-pill">{data.rankings.length} rows</span>
        </div>
        <RankingTable rankings={data.rankings} />
      </section>
    </AdminSectionShell>
  );
}
