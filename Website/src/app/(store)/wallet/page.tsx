import { Shell } from "@/features/ynot/cr/Shell";
import { WalletExperience } from "@/features/ynot/cr/WalletExperience";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  await requireCurrentProfile("/wallet");
  const data = await getYnotDashboardSlice({
    wallet: true,
    paymentMethods: true,
    topUps: true,
    collection: true,
  });

  return (
    <Shell
      viewer={{
        displayName: data.viewer.displayName,
        authenticated: data.viewer.authenticated,
      }}
      balanceCoins={data.wallet.balanceCoins}
      collectionCount={data.collection.length}
    >
      <WalletExperience
        wallet={data.wallet}
        paymentMethods={data.paymentMethods}
        topUps={data.topUps}
      />
    </Shell>
  );
}
