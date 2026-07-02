import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicAnswerPage } from "@/features/ynot/PublicAnswerPage";
import {
  canonicalUrl,
  getPublicAnswerPage,
  publicAnswerSlugs,
} from "@/lib/seo/public-answer-pages";

type HelpPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return publicAnswerSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: HelpPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const page = getPublicAnswerPage(slug);
    return {
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
        type: "article",
      },
      twitter: {
        card: "summary",
        title: page.title.en,
        description: page.description.en,
      },
    };
  } catch {
    return {
      title: "YNOT Help",
      robots: {
        index: false,
        follow: false,
      },
    };
  }
}

export default async function HelpAnswerPage({ params }: HelpPageProps) {
  const { slug } = await params;
  let page;
  try {
    page = getPublicAnswerPage(slug);
  } catch {
    notFound();
  }
  return <PublicAnswerPage page={page} />;
}
