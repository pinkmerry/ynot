import type { MetadataRoute } from "next";
import { getPublicSitemapEntries } from "@/lib/seo/public-answer-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  return getPublicSitemapEntries() as MetadataRoute.Sitemap;
}
