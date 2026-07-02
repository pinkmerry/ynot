import type { Metadata } from "next";
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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse YNOT Open Y-Packs",
  description:
    "Browse public YNOT Open Pokemon and One Piece card Y-Packs with wallet coin cost, visible stock signals, reward context, and pack detail pages.",
  alternates: {
    canonical: "https://www.ynotopen.com/packs",
  },
  openGraph: {
    title: "Browse YNOT Open Y-Packs",
    description:
      "Browse public YNOT Open card Y-Packs with wallet coin cost, visible stock signals, reward context, and detail pages.",
    url: "https://www.ynotopen.com/packs",
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Browse YNOT Open Y-Packs",
    description:
      "Browse Pokemon and One Piece card Y-Packs on YNOT Open with wallet coin cost and public pack detail pages.",
  },
};

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
  // The tag filter is sourced from each pack's customer card tags
  // (draw_rounds.display_tags), so any tag value is valid here — the
  // experience resolves it against the tags actually present and ignores
  // unknown values. Trim/cap only to keep the remount key sane.
  const tagParam = Array.isArray(params?.tag) ? params.tag[0] : params?.tag;
  const initialTag =
    typeof tagParam === "string" && tagParam.trim()
      ? tagParam.trim().slice(0, 40)
      : "";

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
  const seoCampaigns = visibleCampaigns
    .filter(isPublicPackSeoCampaign)
    .map(toPublicPackSeoItem);
  const jsonLd = buildPacksBrowseJsonLd(seoCampaigns, { series: initialSeries });

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
            initialSeries={initialSeries}
            initialTag={initialTag}
          />
        </Shell>
      </YnotShell>
    </>
  );
}
