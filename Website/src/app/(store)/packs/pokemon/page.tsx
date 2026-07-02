import type { Metadata } from "next";
import { PackCatalogRoute } from "@/features/ynot/PackCatalogRoute";
import { I18nText } from "@/features/ynot/i18n";
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
    siteName: "YNOT Open",
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
      catalogHeading={
        <I18nText
          en="Current public Pokemon card Y-Packs"
          th="Pokemon card Y-Packs สาธารณะตอนนี้"
        />
      }
      initialSeries="pokemon"
      pageLead={
        <I18nText
          en="Browse current public Pokemon card Y-Packs on YNOT Open with wallet coin cost, stock signals, reward context, and pack detail pages."
          th="ดู Pokemon card Y-Packs สาธารณะบน YNOT Open พร้อมราคาเหรียญ สถานะสต็อก บริบทรางวัล และหน้ารายละเอียดแพ็ก"
        />
      }
      pageTitle={
        <I18nText
          en="Pokemon Card Y-Packs Thailand"
          th="Pokemon Card Y-Packs Thailand"
        />
      }
    />
  );
}
