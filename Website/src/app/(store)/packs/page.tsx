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
  // Use "admin" visibility so that when an admin promotes a draft/closed/test
  // pack into the featured slot it actually surfaces here. Non-admin viewers
  // still see only public packs because getCampaigns falls back to
  // includePrivate: viewer.isAdmin inside this branch.
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignLimit: null,
    campaignReadiness: false,
    wallet: true,
  });
  return (
    <YnotShell
      viewer={data.viewer}
      homeFilter={homeFilter}
      homeFilterBaseHref="/packs"
      walletBalance={data.wallet.balanceCoins}
      showHeaderCoin
    >
      <PacksExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
