import type { ReactNode } from "react";
import { Shell } from "@/features/ynot/cr/Shell";
import { YPackExperience } from "@/features/ynot/cr/YPackExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  isPublicPackSeoCampaign,
  toPublicPackSeoItem,
} from "@/features/ynot/pack-seo";
import {
  buildPacksBrowseJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

type PackCatalogSeries = string;

function filterSeoSeries<T extends { series: string }>(
  campaigns: T[],
  series: PackCatalogSeries,
) {
  if (series === "all") return campaigns;
  return campaigns.filter((campaign) => campaign.series === series);
}

export async function PackCatalogRoute({
  canonicalPath = "/packs",
  catalogHeading,
  initialSeries = "all",
  initialTag = "",
  pageLead,
  pageTitle,
}: {
  canonicalPath?: string;
  catalogHeading?: ReactNode;
  initialSeries?: PackCatalogSeries;
  initialTag?: string;
  pageLead?: ReactNode;
  pageTitle?: ReactNode;
}) {
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "public",
    includeSoldOutCampaigns: true,
    campaignLimit: null,
    wallet: true,
  });

  const visibleCampaigns = data.campaigns.filter(
    (campaign) =>
      campaign.status === "live" || campaign.demo || campaign.status === "closed",
  );
  const seoCampaigns = filterSeoSeries(
    visibleCampaigns.filter(isPublicPackSeoCampaign).map(toPublicPackSeoItem),
    initialSeries,
  );
  const jsonLd = buildPacksBrowseJsonLd(seoCampaigns, {
    path: canonicalPath,
    series: initialSeries,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd.collectionPage),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd.breadcrumb),
        }}
      />
      <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
        <Shell>
          <YPackExperience
            key={`${initialSeries}:${initialTag}`}
            campaigns={visibleCampaigns}
            balanceCoins={data.wallet.balanceCoins}
            catalogHeading={catalogHeading}
            initialSeries={initialSeries}
            initialTag={initialTag}
            pageLead={pageLead}
            pageTitle={pageTitle}
          />
        </Shell>
      </YnotShell>
    </>
  );
}
