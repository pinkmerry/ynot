import { Shell } from "@/features/ynot/cr/Shell";
import { HistoryExperience } from "@/features/ynot/cr/HistoryExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

// /collection now renders the same light-theme card history surface as
// /profile so the two routes stay in sync. /collection focuses customers on
// the "what you own / sell / ship" actions; /profile is the same screen
// reached via the avatar menu. Both wrap the global YnotShell header so the
// top bar and footer match every other store page.
export default async function CollectionPage() {
  await requireCurrentProfile("/collection");
  const data = await getYnotDashboardSlice({
    collection: true,
    addresses: true,
    wallet: true,
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        <HistoryExperience
          collection={data.collection}
          addresses={data.addresses}
        />
      </Shell>
    </YnotShell>
  );
}
