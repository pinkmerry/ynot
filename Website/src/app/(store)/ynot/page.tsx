import type { Metadata } from "next";
import { PublicAnswerPage } from "@/features/ynot/PublicAnswerPage";
import {
  canonicalUrl,
  getPublicAnswerPage,
} from "@/lib/seo/public-answer-pages";

const ynotPage = getPublicAnswerPage("ynot-official-site");

export const metadata: Metadata = {
  title: ynotPage.title.en,
  description: ynotPage.description.en,
  alternates: {
    canonical: canonicalUrl(ynotPage.path),
  },
  openGraph: {
    title: ynotPage.title.en,
    description: ynotPage.description.en,
    url: canonicalUrl(ynotPage.path),
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: ynotPage.title.en,
    description: ynotPage.description.en,
  },
};

export default function YnotOfficialSitePage() {
  return <PublicAnswerPage page={ynotPage} />;
}
