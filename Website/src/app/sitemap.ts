import type { MetadataRoute } from "next";
import { getCampaigns } from "@/features/ynot/data";
import { packSitemapEntries } from "@/features/ynot/pack-seo";
import { getPublicSitemapEntries } from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const campaigns = await getCampaigns({
      includeSoldOutPublic: true,
      limit: null,
    });
    return getPublicSitemapEntries(packSitemapEntries(campaigns)) as MetadataRoute.Sitemap;
  } catch {
    return getPublicSitemapEntries() as MetadataRoute.Sitemap;
  }
}
