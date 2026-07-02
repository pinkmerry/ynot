import type { Metadata } from "next";
import { normalizeHomeSeries, normalizeHomeSort, normalizeHomeTag, YnotHomeExperience, YnotShell } from "@/features/ynot/components";
import { getYnotPublicHomeData } from "@/features/ynot/data";
import {
  buildHomePageJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "YNOT Open Official Site - Thailand TCG Y-Packs",
  description:
    "YNOT Open official website at ynotopen.com for Thailand TCG Y-Packs, Pokemon and One Piece card collectors, wallet coins, exchange, and shipping support.",
  alternates: {
    canonical: "https://www.ynotopen.com",
  },
  openGraph: {
    title: "YNOT Open Official Site - Thailand TCG Y-Packs",
    description:
      "Official YNOT Open website for online TCG Y-Packs, Pokemon and One Piece collectors, wallet coins, reward collection, exchange, and shipping in Thailand.",
    url: "https://www.ynotopen.com",
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT Open Official Site - Thailand TCG Y-Packs",
    description:
      "Official YNOT Open website for online TCG Y-Packs, wallet coins, and trading card reward management in Thailand.",
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const homeFilter = {
    series: normalizeHomeSeries(params?.series),
    tag: normalizeHomeTag(params?.tag),
    sort: normalizeHomeSort(params?.sort),
  };
  const data = await getYnotPublicHomeData();
  const homepageJsonLd = buildHomePageJsonLd();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homepageJsonLd) }}
      />
      <YnotShell
        viewer={data.viewer}
        shellClassName="ynot-home-mint"
      >
        <YnotHomeExperience data={data} homeFilter={homeFilter} />
      </YnotShell>
    </>
  );
}
