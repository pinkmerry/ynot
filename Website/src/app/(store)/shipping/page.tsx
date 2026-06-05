import { ShippingRequestExperience } from "@/features/ynot/client";
import { OrderList, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  await requireCurrentProfile("/shipping");
  const data = await getYnotDashboardSlice({
    collection: true,
    addresses: true,
    shipping: true,
  });
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader eyebrow="07 · Real Shipping" title="Pick cards to ship" description="4 stages: pick → address → confirm → success." />
      <div className="phone-page-shell shipping-phone grid gap-4 xl:grid-cols-[0.8fr_1fr]">
        <div className="inner-phone-header">
          <div className="phone-rule" aria-hidden><span /><span /><span /></div>
          <div className="template-top-bar centered"><h2>Pick cards to ship</h2></div>
          <div className="ranking-tabs collection-tabs"><span className="active">Pending</span><span>Awaiting ship</span><span>Shipped</span></div>
        </div>
        <ShippingRequestExperience collection={data.collection} addresses={data.addresses} />
        <OrderList title="Shipping history" orders={data.shipping} />
      </div>
    </YnotShell>
  );
}
