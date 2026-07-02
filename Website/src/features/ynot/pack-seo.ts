import type { Metadata } from "next";
import {
  canonicalUrl,
  type PublicPackSeoItem,
} from "@/lib/seo/public-answer-pages";
import type { YnotCampaign } from "./types";

const siteName = "YNOT";
const defaultImage = canonicalUrl("/ynot-logo-512.png");

type PackSitemapEntry = {
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly";
};

function cleanText(value: string | null | undefined, fallback: string, maxLength = 160) {
  const cleaned = value
    ?.replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function seriesLabel(campaign: Pick<YnotCampaign, "series">) {
  return campaign.series === "pokemon" ? "Pokemon card" : "One Piece card";
}

function packTitle(campaign: Pick<YnotCampaign, "titleEn" | "titleTh" | "slug">) {
  return cleanText(campaign.titleEn || campaign.titleTh, campaign.slug, 90);
}

function packImage(campaign: Pick<YnotCampaign, "bannerImageUrl">) {
  const imageUrl = campaign.bannerImageUrl?.trim();
  if (!imageUrl) return defaultImage;
  try {
    return new URL(imageUrl, "https://www.ynotopen.com").toString();
  } catch {
    return defaultImage;
  }
}

function packDescription(campaign: YnotCampaign) {
  const title = packTitle(campaign);
  const stock =
    typeof campaign.remainingSlots === "number" &&
    typeof campaign.totalSlots === "number"
      ? `${campaign.remainingSlots} of ${campaign.totalSlots} slots visible`
      : `${campaign.totalSlots} total slots`;

  return cleanText(
    `${title} is a ${seriesLabel(campaign)} Y-Pack on YNOT Open. Open or review it with ${campaign.costCoins} YNOT wallet coins per pack, ${stock}.`,
    `${title} Y-Pack on YNOT Open.`,
    170,
  );
}

export function isPublicPackSeoCampaign(
  campaign: YnotCampaign | null | undefined,
): campaign is YnotCampaign {
  return Boolean(
    campaign &&
      campaign.visibility === "public" &&
      !campaign.demo &&
      !campaign.isTest &&
      (campaign.status === "live" || campaign.status === "closed"),
  );
}

export function toPublicPackSeoItem(campaign: YnotCampaign): PublicPackSeoItem {
  return {
    slug: campaign.slug,
    status: campaign.status,
    titleTh: campaign.titleTh,
    titleEn: campaign.titleEn,
    series: campaign.series,
    costCoins: campaign.costCoins,
    totalSlots: campaign.totalSlots,
    remainingSlots: campaign.remainingSlots,
    openable: campaign.openable,
    soldOut: campaign.soldOut,
    categoryLabel: campaign.categoryLabel,
    heroLabel: campaign.heroLabel,
    displayTags: campaign.displayTags,
    bannerImageUrl: campaign.bannerImageUrl,
  };
}

export function buildPackDetailMetadata(campaign: YnotCampaign): Metadata {
  const title = `${packTitle(campaign)} - ${seriesLabel(campaign)} Y-Pack`;
  const description = packDescription(campaign);
  const canonical = canonicalUrl(`/packs/${campaign.slug}`);
  const image = packImage(campaign);

  return {
    metadataBase: new URL("https://www.ynotopen.com"),
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName,
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: image === defaultImage ? "summary" : "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export function buildMissingPackMetadata(slug: string): Metadata {
  return {
    metadataBase: new URL("https://www.ynotopen.com"),
    title: "YNOT Pack Not Found",
    description:
      "Browse public YNOT Open Y-Packs for Pokemon and One Piece card openings on ynotopen.com.",
    alternates: {
      canonical: canonicalUrl(`/packs/${encodeURIComponent(slug)}`),
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export function packSitemapEntries(campaigns: YnotCampaign[]): PackSitemapEntry[] {
  return campaigns.filter(isPublicPackSeoCampaign).map((campaign) => ({
    path: `/packs/${campaign.slug}`,
    priority: campaign.status === "live" && !campaign.soldOut ? 0.86 : 0.72,
    changeFrequency: campaign.status === "live" && !campaign.soldOut ? "daily" : "weekly",
  }));
}
