import { CollectionConvertPanel } from "@/features/ynot/client";
import { ExchangeCatalogPanel, OrderList, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { i18n } from "@/features/ynot/i18n";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function ExchangePage() {
  await requireCurrentProfile("/exchange");
  const data = await getYnotDashboardSlice({
    wallet: true,
    collection: true,
    addresses: true,
    exchanges: true,
  });
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow={i18n("06 · Exchange", "06 · แลกเหรียญ")}
        title={i18n("Exchange", "แลกเหรียญ")}
        description={i18n(
          "Convert collection cards into coins instantly. The coin value was set by the admin when each pack was created.",
          "แปลงการ์ดในคอลเลกชันเป็นเหรียญทันที มูลค่าเหรียญถูกกำหนดโดยแอดมินตอนสร้างแพ็ก",
        )}
      />
      <ExchangeCatalogPanel
        wallet={data.wallet}
        collectionCount={data.collection.length}
        requestCount={data.exchanges.length}
      />
      <div className="phone-page-shell grid gap-4 xl:grid-cols-[0.8fr_1fr]">
        <CollectionConvertPanel
          collection={data.collection}
          addresses={data.addresses}
        />
        <OrderList title={i18n("Exchange history", "ประวัติการแลก")} orders={data.exchanges} />
      </div>
    </YnotShell>
  );
}
