import { getYnotDashboardSlice } from "./data";
import { featuredCampaigns } from "./storefront-content";
import type { YnotCampaign } from "./types";

type SeriesParam = YnotCampaign["series"];

function campaignTitle(campaign: YnotCampaign) {
  return campaign.titleEn || campaign.titleTh || campaign.slug;
}

export function selectPublicSeriesSeoCampaigns(
  campaigns: YnotCampaign[],
  series: SeriesParam,
) {
  return campaigns
    .filter((campaign) => campaign.series === series)
    .sort((a, b) => {
      const aRank = a.openable ? 0 : a.soldOut ? 2 : 1;
      const bRank = b.openable ? 0 : b.soldOut ? 2 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return campaignTitle(a).localeCompare(campaignTitle(b));
    })
    .slice(0, 8);
}

export async function getPublicSeriesSeoData(series: SeriesParam) {
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "public",
    campaignLimit: null,
    includeSoldOutCampaigns: true,
    wallet: false,
  });
  const sourceCampaigns = data.configured ? data.campaigns : featuredCampaigns;

  return {
    viewer: data.viewer,
    campaigns: selectPublicSeriesSeoCampaigns(sourceCampaigns, series),
  };
}
