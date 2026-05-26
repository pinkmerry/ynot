import { Shell } from "@/features/ynot/cr/Shell";
import { YPackExperience } from "@/features/ynot/cr/YPackExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

const validSeriesParams = new Set([
  "all",
  "pokemon",
  "one_piece",
  "football",
  "basketball",
  "soccer",
  "baseball",
  "magical",
  "super",
  "multi_sport",
]);

export default async function PacksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const seriesParam = Array.isArray(params?.series)
    ? params.series[0]
    : params?.series;
  const initialSeries =
    seriesParam && validSeriesParams.has(seriesParam) ? seriesParam : "all";

  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignLimit: null,
    campaignReadiness: false,
    wallet: true,
  });

  const visibleCampaigns = data.campaigns.filter(
    (campaign) =>
      campaign.status === "live" || campaign.demo || campaign.status === "closed",
  );

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        <YPackExperience
          campaigns={visibleCampaigns}
          balanceCoins={data.wallet.balanceCoins}
          initialSeries={initialSeries}
        />
      </Shell>
    </YnotShell>
  );
}
