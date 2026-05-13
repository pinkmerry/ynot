import { normalizeHomeSeries, normalizeHomeSort, normalizeHomeTag, YnotHomeExperience, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function HomePage({
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
    wallet: true,
  });
  return (
    <YnotShell viewer={data.viewer} homeFilter={homeFilter} walletBalance={data.wallet.balanceCoins}>
      <YnotHomeExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
