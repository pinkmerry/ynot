import { CollectionActionPanel } from "@/features/ynot/client";
import { CollectionGrid, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  await requireCurrentProfile("/collection");
  const data = await getYnotDashboardData();
  const ownedCount = data.collection.filter((item) => item.status === "owned").length;
  const exchangeRequestedCount = data.collection.filter((item) => item.status === "exchange_requested").length;
  const shippingRequestedCount = data.collection.filter((item) => item.status === "shipping_requested").length;
  const shippedCount = data.collection.filter((item) => item.status === "shipped").length;

  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader eyebrow="04 · Collection · Acquisition" title="Collection" description="Real owned cards from your account. Select cards to request coin exchange or shipping." />
      <div className="phone-page-shell collection-phone grid gap-4 xl:grid-cols-[1fr_0.75fr]">
        <div className="inner-phone-header">
          <div className="template-top-bar"><h2>Collection</h2><span className="coin-pill">● {data.wallet.balanceCoins.toLocaleString()}</span></div>
          <div className="phone-rule" aria-hidden><span /><span /><span /></div>
          <div className="ranking-tabs collection-tabs"><span className="active">Owned {ownedCount}</span><span>Exchange {exchangeRequestedCount}</span><span>Ship {shippingRequestedCount}</span><span>Shipped {shippedCount}</span></div>
          <div className="collection-toolbar"><span>▾ Filter</span><span>▦ View</span></div>
        </div>
        <CollectionGrid collection={data.collection} />
        <CollectionActionPanel collection={data.collection} addresses={data.addresses} />
      </div>
    </YnotShell>
  );
}
