import type { Metadata } from "next";
import { PublicAnswerPage } from "@/features/ynot/PublicAnswerPage";
import {
  canonicalUrl,
  getPublicAnswerPage,
} from "@/lib/seo/public-answer-pages";

const aboutPage = getPublicAnswerPage("about");

export const metadata: Metadata = {
  title: aboutPage.title.en,
  description: aboutPage.description.en,
  alternates: {
    canonical: canonicalUrl(aboutPage.path),
  },
  openGraph: {
    title: aboutPage.title.en,
    description: aboutPage.description.en,
    url: canonicalUrl(aboutPage.path),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: aboutPage.title.en,
    description: aboutPage.description.en,
  },
};

export default function AboutPage() {
  return <PublicAnswerPage page={aboutPage} />;
}
