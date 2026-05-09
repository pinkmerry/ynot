import { CollectionActionPanel } from "@/features/ynot/client";
import { ExchangeCatalogPanel, OrderList, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function ExchangePage() {
  await requireCurrentProfile("/exchange");
  const data = await getYnotDashboardData();
  return <YnotShell viewer={data.viewer}><PageHeader eyebrow="06 · Exchange" title="Exchange" description="Request coin exchange from real collection items. Admin review records the final approved value." /><ExchangeCatalogPanel wallet={data.wallet} collectionCount={data.collection.length} requestCount={data.exchanges.length} /><div className="phone-page-shell grid gap-4 xl:grid-cols-[0.8fr_1fr]"><CollectionActionPanel collection={data.collection} addresses={data.addresses} /><OrderList title="Exchange history" orders={data.exchanges} /></div></YnotShell>;
}
