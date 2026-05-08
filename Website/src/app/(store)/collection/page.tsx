import { CollectionActionPanel } from "@/features/ynot/client";
import { CollectionGrid, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  await requireCurrentProfile("/collection");
  const data = await getYnotDashboardData();
  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader eyebrow="04 · Collection · Acquisition" title="Collection" description="3 tabs · multi-select to redeem coin or request shipping." />
      <div className="phone-page-shell collection-phone grid gap-4 xl:grid-cols-[1fr_0.75fr]">
        <div className="inner-phone-header">
          <div className="template-top-bar"><h2>Collection</h2><span className="coin-pill">● 4,614</span></div>
          <div className="phone-rule" aria-hidden><span /><span /><span /></div>
          <div className="ranking-tabs collection-tabs"><span className="active">Pending 24</span><span>Awaiting ship 3</span><span>Shipped 12</span></div>
          <div className="collection-toolbar"><span>▾ Filter</span><span>▦ View</span></div>
        </div>
        <CollectionGrid collection={data.collection} />
        <CollectionActionPanel collection={data.collection} addresses={data.addresses} />
      </div>
    </YnotShell>
  );
}
