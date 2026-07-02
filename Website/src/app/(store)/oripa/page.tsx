import type { Metadata } from "next";
import Link from "next/link";
import { PackCatalogRoute } from "@/features/ynot/PackCatalogRoute";
import { I18nText } from "@/features/ynot/i18n";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

const canonicalPath = "/oripa";
const title = "Online Oripa & TCG Mystery Packs Thailand | YNOT";
const description =
  "Browse YNOT online oripa-style TCG mystery packs for Pokemon and One Piece collectors in Thailand with wallet coin cost, stock signals, and reward context.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: canonicalUrl(canonicalPath),
  },
  openGraph: {
    title,
    description,
    url: canonicalUrl(canonicalPath),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description:
      "YNOT online oripa-style TCG mystery packs for Pokemon and One Piece collectors in Thailand.",
  },
};

function OripaSeoContent() {
  return (
    <>
      <div className="cr-pack-seo-grid">
        <section className="cr-section" aria-labelledby="oripa-about-heading">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 3 }}>
              <span className="cr-eyebrow">
                <I18nText en="About" th="เกี่ยวกับ" />
              </span>
              <h2 id="oripa-about-heading" className="cr-h2">
                <I18nText
                  en="Online oripa-style Y-Packs for Thailand collectors"
                  th="Y-Packs แบบ online oripa สำหรับนักสะสมในไทย"
                />
              </h2>
            </div>
          </div>
          <div className="cr-section-body cr-stack">
            <p className="cr-lead" style={{ maxWidth: "68ch" }}>
              <I18nText
                en="YNOT uses Y-Packs for a TCG mystery-pack opening experience: browse live packs, check the series, coin cost, visible reward context, and remaining stock, then open only when the live detail page matches what you want."
                th="YNOT ใช้ Y-Packs สำหรับประสบการณ์เปิดแพ็กการ์ดแบบ mystery pack: ดูแพ็กที่เปิดอยู่ ตรวจซีรีส์ ราคาเหรียญ บริบทรางวัลที่แสดง และสต็อกคงเหลือ แล้วเปิดเฉพาะเมื่อหน้ารายละเอียดจริงตรงกับที่ต้องการ"
              />
            </p>
            <div className="cr-pack-seo-links">
              <Link className="cr-btn cr-btn-primary" href="/packs/pokemon">
                <I18nText en="Pokemon Y-Packs" th="Pokemon Y-Packs" />
              </Link>
              <Link className="cr-btn" href="/packs/one-piece">
                <I18nText en="One Piece Y-Packs" th="One Piece Y-Packs" />
              </Link>
              <Link className="cr-btn" href="/help/how-ynot-packs-work">
                <I18nText en="How Y-Packs work" th="วิธีใช้ Y-Packs" />
              </Link>
            </div>
          </div>
        </section>

        <section className="cr-section" aria-labelledby="oripa-check-heading">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 3 }}>
              <span className="cr-eyebrow">
                <I18nText en="Before opening" th="ก่อนเปิดแพ็ก" />
              </span>
              <h2 id="oripa-check-heading" className="cr-h2">
                <I18nText
                  en="What to check on each pack"
                  th="สิ่งที่ควรตรวจในแต่ละแพ็ก"
                />
              </h2>
            </div>
          </div>
          <div className="cr-section-body">
            <ul className="cr-pack-seo-list">
              <li>
                <I18nText
                  en="Series and pack name: Pokemon, One Piece, sports, or other live YNOT categories."
                  th="ซีรีส์และชื่อแพ็ก: Pokemon, One Piece, กีฬา หรือหมวดอื่นที่เปิดอยู่บน YNOT"
                />
              </li>
              <li>
                <I18nText
                  en="Wallet coin cost, open availability, remaining stock, and sold-out status."
                  th="ราคาเหรียญวอลเล็ต สถานะเปิดได้ สต็อกคงเหลือ และสถานะหมดแล้ว"
                />
              </li>
              <li>
                <I18nText
                  en="Visible reward context and detail page information before using coins."
                  th="บริบทรางวัลที่แสดงและข้อมูลหน้ารายละเอียดก่อนใช้เหรียญ"
                />
              </li>
            </ul>
          </div>
        </section>
      </div>

      <section className="cr-section" aria-labelledby="oripa-search-heading">
        <div className="cr-section-head">
          <div className="cr-stack" style={{ gap: 3 }}>
            <span className="cr-eyebrow">
              <I18nText en="Search intent" th="เจตนาการค้นหา" />
            </span>
            <h2 id="oripa-search-heading" className="cr-h2">
              <I18nText
                en="Use YNOT for online TCG mystery packs, not official card databases"
                th="ใช้ YNOT สำหรับ TCG mystery packs ออนไลน์ ไม่ใช่ฐานข้อมูลการ์ดทางการ"
              />
            </h2>
          </div>
        </div>
        <div className="cr-section-body cr-stack">
          <p className="cr-lead" style={{ maxWidth: "78ch" }}>
            <I18nText
              en="Collectors searching for oripa, online mystery packs, Pokemon card mystery packs Thailand, One Piece random packs, or TCG lucky draw Bangkok can start here. For official rules, card lists, products, and tournaments, use the official Pokemon or One Piece Card Game sources."
              th="นักสะสมที่ค้นหา oripa, online mystery packs, Pokemon card mystery packs Thailand, One Piece random packs หรือ TCG lucky draw Bangkok สามารถเริ่มจากหน้านี้ได้ หากต้องการกฎ รายการการ์ด สินค้า และทัวร์นาเมนต์ทางการ ให้ใช้แหล่งทางการของ Pokemon หรือ One Piece Card Game"
            />
          </p>
          <div className="cr-pack-seo-links">
            <Link className="cr-btn" href="/pokemon-card">
              <I18nText en="Pokemon card hub" th="ศูนย์รวม Pokemon card" />
            </Link>
            <Link className="cr-btn" href="/one-piece-card">
              <I18nText en="One Piece card hub" th="ศูนย์รวม One Piece card" />
            </Link>
            <Link className="cr-btn" href="/help/is-ynot-legit">
              <I18nText en="YNOT trust checks" th="วิธีตรวจความน่าเชื่อถือ YNOT" />
            </Link>
            <Link className="cr-btn" href="/contact">
              <I18nText en="Contact support" th="ติดต่อซัพพอร์ต" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default function OripaPage() {
  return (
    <PackCatalogRoute
      canonicalPath={canonicalPath}
      catalogHeading={
        <I18nText
          en="Current online TCG mystery packs"
          th="TCG mystery packs ออนไลน์ตอนนี้"
        />
      }
      pageLead={
        <I18nText
          en="Browse YNOT online oripa-style Y-Packs with live categories, sort controls, wallet coin cost, stock signals, and public pack detail pages."
          th="ดู YNOT Y-Packs แบบ online oripa พร้อมหมวดที่เปิดอยู่ ตัวเรียง ราคาเหรียญ สัญญาณสต็อก และหน้ารายละเอียดแพ็กสาธารณะ"
        />
      }
      pageTitle={
        <I18nText
          en="Online Oripa & TCG Mystery Packs"
          th="Online Oripa และ TCG Mystery Packs"
        />
      }
      seoContent={<OripaSeoContent />}
    />
  );
}
