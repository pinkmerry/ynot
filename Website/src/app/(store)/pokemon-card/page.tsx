import type { Metadata } from "next";
import { SeriesSeoLandingPage } from "@/features/ynot/SeriesSeoLandingPage";
import { getPublicSeriesSeoData } from "@/features/ynot/series-seo-campaigns";
import {
  canonicalUrl,
  getPublicSeriesLandingPage,
} from "@/lib/seo/public-answer-pages";

const page = getPublicSeriesLandingPage("pokemon-card");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: page.title.en,
  description: page.description.en,
  keywords: page.queryTargets,
  alternates: {
    canonical: canonicalUrl(page.path),
  },
  openGraph: {
    title: page.title.en,
    description: page.description.en,
    url: canonicalUrl(page.path),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: page.title.en,
    description: page.description.en,
  },
};

export default async function PokemonCardLandingPage() {
  const data = await getPublicSeriesSeoData(page.seriesParam);

  return (
    <SeriesSeoLandingPage
      campaigns={data.campaigns}
      page={page}
      viewer={data.viewer}
    />
  );
}
