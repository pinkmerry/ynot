import type { Metadata } from "next";
import { SeriesSeoLandingPage } from "@/features/ynot/SeriesSeoLandingPage";
import {
  canonicalUrl,
  getPublicSeriesLandingPage,
} from "@/lib/seo/public-answer-pages";

const page = getPublicSeriesLandingPage("pokemon-card");

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: page.title.en,
  description: page.description.en,
  alternates: {
    canonical: canonicalUrl(page.path),
  },
  openGraph: {
    title: page.title.en,
    description: page.description.en,
    url: canonicalUrl(page.path),
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: page.title.en,
    description: page.description.en,
  },
};

export default function PokemonCardLandingPage() {
  return <SeriesSeoLandingPage page={page} />;
}
