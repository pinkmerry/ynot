import { Shell } from "@/features/ynot/cr/Shell";
import { HistoryExperience } from "@/features/ynot/cr/HistoryExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await requireCurrentProfile("/profile");
  const data = await getYnotDashboardSlice({
    collection: true,
    addresses: true,
    gachaOpens: true,
    wallet: true,
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        <HistoryExperience
          collection={data.collection}
          addresses={data.addresses}
          gachaOpens={data.gachaOpens}
          viewer={{ displayName: data.viewer.displayName }}
        />
      </Shell>
    </YnotShell>
  );
}
