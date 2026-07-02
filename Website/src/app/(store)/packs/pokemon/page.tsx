import type { Metadata } from "next";
import { PackCatalogRoute } from "@/features/ynot/PackCatalogRoute";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pokemon Card Thailand | YNOT Open Y-Packs",
  description:
    "Browse public YNOT Open Pokemon card Y-Packs in Thailand with visible pack names, wallet coin cost, stock signals, reward context, and pack detail pages.",
  alternates: {
    canonical: canonicalUrl("/packs/pokemon"),
  },
  openGraph: {
    title: "Pokemon Card Thailand | YNOT Open Y-Packs",
    description:
      "Browse Pokemon card Y-Packs on YNOT Open with wallet coin cost, stock signals, reward context, and public pack details.",
    url: canonicalUrl("/packs/pokemon"),
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pokemon Card Thailand | YNOT Open Y-Packs",
    description:
      "Public Pokemon card Y-Pack catalog for Thailand collectors on YNOT Open.",
  },
};

export default function PokemonPackCatalogPage() {
  return (
    <PackCatalogRoute
      canonicalPath="/packs/pokemon"
      initialSeries="pokemon"
    />
  );
}
