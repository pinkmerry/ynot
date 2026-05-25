import { CollectionConvertPanel } from "@/features/ynot/client";
import { CoinIcon, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; action?: string }>;
}) {
  await requireCurrentProfile("/collection");
  const data = await getYnotDashboardSlice({
    wallet: true,
    collection: true,
    addresses: true,
  });
  const query: { from?: string; action?: string } =
    (await (searchParams ?? Promise.resolve({}))) ?? {};
  const ownedCount = data.collection.filter(
    (item) => item.status === "owned",
  ).length;
  const exchangedCount = data.collection.filter(
    (item) =>
      item.status === "exchange_requested" || item.status === "exchanged",
  ).length;
  const shippingCount = data.collection.filter(
    (item) =>
      item.status === "shipping_requested" || item.status === "shipped",
  ).length;

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow="04 · Collection · Acquisition"
        title="Collection"
        description="Real owned cards from your account. Select cards to convert to coins or request shipping."
      />
      <div className="collection-convert-page">
        <header className="collection-convert-page-head">
          <div className="collection-convert-page-titles">
            <h2>Acquisition</h2>
            <p>
              <span>{ownedCount} owned</span>
              <span aria-hidden="true">·</span>
              <span>{exchangedCount} converted</span>
              <span aria-hidden="true">·</span>
              <span>{shippingCount} shipping</span>
            </p>
          </div>
          <span className="collection-convert-page-balance">
            <CoinIcon />
            {data.wallet.balanceCoins.toLocaleString()}
          </span>
        </header>
        <CollectionConvertPanel
          collection={data.collection}
          addresses={data.addresses}
          prefilterOpenId={query.from ?? null}
          autoConvertOnLoad={query.action === "convert"}
        />
      </div>
    </YnotShell>
  );
}
