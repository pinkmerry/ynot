import type { Metadata } from "next";
import { PackCatalogRoute } from "@/features/ynot/PackCatalogRoute";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse YNOT Open Y-Packs",
  description:
    "Browse public YNOT Open Pokemon and One Piece card Y-Packs with wallet coin cost, visible stock signals, reward context, and pack detail pages.",
  alternates: {
    canonical: "https://www.ynotopen.com/packs",
  },
  openGraph: {
    title: "Browse YNOT Open Y-Packs",
    description:
      "Browse public YNOT Open card Y-Packs with wallet coin cost, visible stock signals, reward context, and detail pages.",
    url: "https://www.ynotopen.com/packs",
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Browse YNOT Open Y-Packs",
    description:
      "Browse Pokemon and One Piece card Y-Packs on YNOT Open with wallet coin cost and public pack detail pages.",
  },
};

const validSeriesParams = new Set([
  "all",
  "pokemon",
  "one_piece",
  "football",
  "basketball",
  "soccer",
  "baseball",
  "magical",
  "super",
  "multi_sport",
]);

export default async function PacksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const seriesParam = Array.isArray(params?.series)
    ? params.series[0]
    : params?.series;
  const initialSeries =
    seriesParam && validSeriesParams.has(seriesParam) ? seriesParam : "all";
  // The tag filter is sourced from each pack's customer card tags
  // (draw_rounds.display_tags), so any tag value is valid here — the
  // experience resolves it against the tags actually present and ignores
  // unknown values. Trim/cap only to keep the remount key sane.
  const tagParam = Array.isArray(params?.tag) ? params.tag[0] : params?.tag;
  const initialTag =
    typeof tagParam === "string" && tagParam.trim()
      ? tagParam.trim().slice(0, 40)
      : "";

  return (
    <PackCatalogRoute
      canonicalPath="/packs"
      initialSeries={initialSeries}
      initialTag={initialTag}
    />
  );
}
