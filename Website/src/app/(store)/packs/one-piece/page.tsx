import type { Metadata } from "next";
import { PackCatalogRoute } from "@/features/ynot/PackCatalogRoute";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "One Piece Card Thailand | YNOT Open Y-Packs",
  description:
    "Browse public YNOT Open One Piece card Y-Packs in Thailand with visible pack names, wallet coin cost, stock signals, reward context, and pack detail pages.",
  alternates: {
    canonical: canonicalUrl("/packs/one-piece"),
  },
  openGraph: {
    title: "One Piece Card Thailand | YNOT Open Y-Packs",
    description:
      "Browse One Piece card Y-Packs on YNOT Open with wallet coin cost, stock signals, reward context, and public pack details.",
    url: canonicalUrl("/packs/one-piece"),
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "One Piece Card Thailand | YNOT Open Y-Packs",
    description:
      "Public One Piece card Y-Pack catalog for Thailand collectors on YNOT Open.",
  },
};

export default function OnePiecePackCatalogPage() {
  return (
    <PackCatalogRoute
      canonicalPath="/packs/one-piece"
      initialSeries="one_piece"
    />
  );
}
