import { Shell } from "@/features/ynot/cr/Shell";
import { AllPullsExperience } from "@/features/ynot/cr/AllPullsExperience";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function AllPullsPage() {
  await requireCurrentProfile("/profile/all-pulls");
  const data = await getYnotDashboardSlice({
    collection: true,
    gachaOpens: true,
    wallet: true,
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
      <AllPullsExperience
        collection={data.collection}
        gachaOpens={data.gachaOpens}
      />
    </Shell>
  );
}
