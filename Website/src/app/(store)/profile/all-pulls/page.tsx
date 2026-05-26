import { Shell } from "@/features/ynot/cr/Shell";
import { AllPullsExperience } from "@/features/ynot/cr/AllPullsExperience";
import { YnotShell } from "@/features/ynot/components";
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
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        <AllPullsExperience
          collection={data.collection}
          gachaOpens={data.gachaOpens}
        />
      </Shell>
    </YnotShell>
  );
}
