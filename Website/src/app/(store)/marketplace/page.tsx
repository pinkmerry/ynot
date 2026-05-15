import { MarketplaceExperience, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const data = await getYnotDashboardSlice({
    wallet: true,
    collection: true,
  });
  return (
    <YnotShell
      viewer={data.viewer}
      walletBalance={data.wallet.balanceCoins}
    >
      <MarketplaceExperience data={data} />
    </YnotShell>
  );
}
