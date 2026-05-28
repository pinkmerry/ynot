import { redirect } from "next/navigation";
import { MarketplaceExperience, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const viewer = await getYnotViewer();
  if (!viewer.isAdmin && !isDevAuthAllowed()) {
    redirect("/packs");
  }

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
