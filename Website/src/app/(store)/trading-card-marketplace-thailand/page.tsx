import type { Metadata } from "next";
import { PublicAnswerPage } from "@/features/ynot/PublicAnswerPage";
import {
  canonicalUrl,
  getPublicAnswerPage,
} from "@/lib/seo/public-answer-pages";

const marketplaceGuide = getPublicAnswerPage("trading-card-marketplace-thailand");

export const metadata: Metadata = {
  title: marketplaceGuide.title.en,
  description: marketplaceGuide.description.en,
  alternates: {
    canonical: canonicalUrl(marketplaceGuide.path),
  },
  openGraph: {
    title: marketplaceGuide.title.en,
    description: marketplaceGuide.description.en,
    url: canonicalUrl(marketplaceGuide.path),
    siteName: "YNOT",
    type: "article",
  },
  twitter: {
    card: "summary",
    title: marketplaceGuide.title.en,
    description: marketplaceGuide.description.en,
  },
};

export default function TradingCardMarketplaceThailandPage() {
  return <PublicAnswerPage page={marketplaceGuide} />;
}
