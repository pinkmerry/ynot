import {
  normalizeHomeSeries,
  normalizeHomeSort,
  normalizeHomeTag,
  PackCatalogExperience,
  PageHeader,
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
      homeFilterBaseHref="/packs"
      walletBalance={data.wallet.balanceCoins}
    >
      <PageHeader
        eyebrow="01 · Mystery Packs"
        title="All packs"
        description="Browse every live public pack that is ready to open."
      />
      <PackCatalogExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
