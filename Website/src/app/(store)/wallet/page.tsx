import { Shell } from "@/features/ynot/cr/Shell";
import { WalletExperience } from "@/features/ynot/cr/WalletExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  await requireCurrentProfile("/wallet");
  const data = await getYnotDashboardSlice({
    wallet: true,
    paymentMethods: true,
    topUps: true,
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        <WalletExperience
          wallet={data.wallet}
          paymentMethods={data.paymentMethods}
          topUps={data.topUps}
        />
      </Shell>
    </YnotShell>
  );
}
