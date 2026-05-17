import {
  normalizeHomeSeries,
  normalizeHomeSort,
  normalizeHomeTag,
  PacksExperience,
  YnotShell,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function PacksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const homeFilter = {
    series: normalizeHomeSeries(params?.series),
    tag: normalizeHomeTag(params?.tag),
    sort: normalizeHomeSort(params?.sort),
  };
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "public",
    campaignLimit: null,
    wallet: true,
  });
  return (
    <YnotShell
      viewer={data.viewer}
      homeFilter={homeFilter}
      walletBalance={data.wallet.balanceCoins}
      showHeaderCoin
    >
      <PacksExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
