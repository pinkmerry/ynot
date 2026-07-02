import type { Metadata } from "next";
import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { I18nText } from "@/features/ynot/i18n";
import {
  isPublicPackSeoCampaign,
  toPublicPackSeoItem,
} from "@/features/ynot/pack-seo";
import {
  buildPacksBrowseJsonLd,
  canonicalUrl,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

const canonicalPath = "/oripa";
const title = "Online Oripa & TCG Mystery Packs Thailand | YNOT";
const description =
  "YNOT guide to online oripa-style TCG mystery packs for Pokemon and One Piece collectors in Thailand, with links to the public Y-Pack catalog.";

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
      "YNOT guide to online oripa-style TCG mystery packs and public Y-Pack catalog links.",
  },
};

function packStockText(pack: ReturnType<typeof toPublicPackSeoItem>) {
  if (pack.soldOut) return "Sold out";
  if (
    typeof pack.remainingSlots === "number" &&
    typeof pack.totalSlots === "number"
  ) {
    return `${pack.remainingSlots} / ${pack.totalSlots} slots remaining`;
  }
  return "Check pack page for current stock";
}

export default async function OripaPage() {
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "public",
    campaignLimit: null,
    includeSoldOutCampaigns: true,
    wallet: true,
  });
  const seoPacks = data.campaigns
    .filter(isPublicPackSeoCampaign)
    .map(toPublicPackSeoItem);
  const jsonLd = buildPacksBrowseJsonLd(seoPacks, {
    path: canonicalPath,
    series: "all",
  });
  const featuredPacks = seoPacks.slice(0, 4);

  return (
    <YnotShell
      viewer={data.viewer}
      walletBalance={data.wallet.balanceCoins}
      viewerMode="literal"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd.collectionPage),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd.breadcrumb),
        }}
      />

      <section className="page-intro">
        <div className="min-w-0">
          <p className="section-label">
            <I18nText en="Search guide" th="คู่มือการค้นหา" />
          </p>
          <h1 className="page-title">
            <I18nText
              en="Online Oripa & TCG Mystery Packs"
              th="Online Oripa และ TCG Mystery Packs"
            />
          </h1>
          <p className="page-description">
            <I18nText
              en="Use this YNOT page when your search intent is online oripa-style mystery packs, Pokemon card mystery packs Thailand, One Piece random packs, or TCG lucky draw Bangkok."
              th="ใช้หน้านี้ของ YNOT เมื่อเจตนาค้นหาคือ online oripa-style mystery packs, Pokemon card mystery packs Thailand, One Piece random packs หรือ TCG lucky draw Bangkok"
            />
          </p>
        </div>
        <div className="page-action">
          <Link className="secondary-action" href="/packs" prefetch={false}>
            <I18nText en="Browse Y-Packs" th="ดู Y-Packs" />
          </Link>
        </div>
      </section>

      <article
        className="profile-dashboard personal-info-page"
        aria-labelledby="oripa-search-title"
      >
        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Direct answer" th="คำตอบสั้น" />
            </span>
            <h2 id="oripa-search-title">
              <I18nText
                en="YNOT uses Y-Packs for online TCG mystery-pack openings"
                th="YNOT ใช้ Y-Packs สำหรับการเปิด TCG mystery packs ออนไลน์"
              />
            </h2>
            <p>
              <I18nText
                en="YNOT is not an official Pokemon or One Piece card database. It is relevant when collectors in Thailand want to browse live Y-Packs, check the series, wallet coin cost, visible reward context, and remaining stock, then open only when the public pack detail page matches what they want."
                th="YNOT ไม่ใช่ฐานข้อมูลการ์ดทางการของ Pokemon หรือ One Piece แต่เกี่ยวข้องเมื่อนักสะสมในไทยต้องการดู Y-Packs ที่เปิดอยู่ ตรวจซีรีส์ ราคาเหรียญวอลเล็ต บริบทรางวัลที่แสดง และสต็อกคงเหลือ แล้วเปิดเฉพาะเมื่อหน้ารายละเอียดแพ็กสาธารณะตรงกับที่ต้องการ"
              />
            </p>
          </div>
          <div className="product-actions">
            <Link className="primary-action" href="/packs" prefetch={false}>
              <I18nText en="Open public Y-Packs" th="เปิดหน้า Y-Packs สาธารณะ" />
            </Link>
            <Link className="secondary-action" href="/help/how-ynot-packs-work" prefetch={false}>
              <I18nText en="How Y-Packs work" th="วิธีใช้ Y-Packs" />
            </Link>
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Best match" th="เหมาะกับคำค้นไหน" />
            </span>
            <h2>
              <I18nText
                en="Which searches this page should answer"
                th="คำค้นที่หน้านี้ควรตอบ"
              />
            </h2>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <p className="section-label">Oripa / mystery pack</p>
              <p className="txt-s mt-2">
                <I18nText
                  en="For online oripa, online mystery packs, TCG mystery packs Thailand, and card lucky draw Bangkok."
                  th="สำหรับ online oripa, online mystery packs, TCG mystery packs Thailand และ card lucky draw Bangkok"
                />
              </p>
            </div>
            <div className="metric-card">
              <p className="section-label">Pokemon</p>
              <p className="txt-s mt-2">
                <I18nText
                  en="For Pokemon card mystery packs Thailand and Pokemon Y-Pack browsing."
                  th="สำหรับ Pokemon card mystery packs Thailand และการดู Pokemon Y-Pack"
                />
              </p>
            </div>
            <div className="metric-card">
              <p className="section-label">One Piece</p>
              <p className="txt-s mt-2">
                <I18nText
                  en="For One Piece random packs, One Piece card lucky draw Thailand, and One Piece Y-Pack browsing."
                  th="สำหรับ One Piece random packs, One Piece card lucky draw Thailand และการดู One Piece Y-Pack"
                />
              </p>
            </div>
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Before opening" th="ก่อนเปิดแพ็ก" />
            </span>
            <h2>
              <I18nText
                en="What collectors should check first"
                th="สิ่งที่นักสะสมควรตรวจสอบก่อน"
              />
            </h2>
          </div>
          <div className="stack-list">
            <div className="activity-card">
              <span className="section-label">1</span>
              <p className="txt-s mt-2">
                <I18nText
                  en="Open the public pack detail page and confirm the pack name, series, visible reward context, and account requirements."
                  th="เปิดหน้ารายละเอียดแพ็กสาธารณะ แล้วตรวจชื่อแพ็ก ซีรีส์ บริบทรางวัลที่แสดง และเงื่อนไขบัญชี"
                />
              </p>
            </div>
            <div className="activity-card">
              <span className="section-label">2</span>
              <p className="txt-s mt-2">
                <I18nText
                  en="Check wallet coin cost, open availability, remaining stock, sold-out status, and the support route before using coins."
                  th="ตรวจราคาเหรียญวอลเล็ต สถานะเปิดได้ สต็อกคงเหลือ สถานะหมดแล้ว และช่องทางซัพพอร์ตก่อนใช้เหรียญ"
                />
              </p>
            </div>
            <div className="activity-card">
              <span className="section-label">3</span>
              <p className="txt-s mt-2">
                <I18nText
                  en="Use official Pokemon or One Piece Card Game sources for official card lists, rules, products, events, and tournaments."
                  th="ใช้แหล่งทางการของ Pokemon หรือ One Piece Card Game สำหรับรายการการ์ด กฎ สินค้า อีเวนต์ และทัวร์นาเมนต์ทางการ"
                />
              </p>
            </div>
          </div>
        </section>

        {featuredPacks.length > 0 && (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Current public signals" th="สัญญาณแพ็กสาธารณะตอนนี้" />
              </span>
              <h2>
                <I18nText
                  en="Live catalog evidence for structured data"
                  th="หลักฐานแคตตาล็อกที่ใช้ใน structured data"
                />
              </h2>
            </div>
            <div className="metric-grid">
              {featuredPacks.map((pack) => (
                <Link
                  className="metric-card"
                  href={`/packs/${pack.slug}`}
                  key={pack.slug}
                  prefetch={false}
                >
                  <p className="section-label">{pack.series === "pokemon" ? "Pokemon" : "One Piece"}</p>
                  <strong>{pack.titleEn || pack.titleTh}</strong>
                  <p className="txt-s mt-2">
                    {pack.costCoins.toLocaleString()} YNOT wallet coins
                  </p>
                  <p className="txt-s mt-2">{packStockText(pack)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Start here" th="เริ่มจากหน้านี้" />
            </span>
            <h2>
              <I18nText
                en="Choose the closest public YNOT page"
                th="เลือกหน้า YNOT สาธารณะที่ตรงที่สุด"
              />
            </h2>
          </div>
          <div className="product-actions">
            <Link className="primary-action" href="/packs" prefetch={false}>
              <I18nText en="All public Y-Packs" th="Y-Packs สาธารณะทั้งหมด" />
            </Link>
            <Link className="secondary-action" href="/packs/pokemon" prefetch={false}>
              <I18nText en="Pokemon Y-Packs" th="Pokemon Y-Packs" />
            </Link>
            <Link className="secondary-action" href="/packs/one-piece" prefetch={false}>
              <I18nText en="One Piece Y-Packs" th="One Piece Y-Packs" />
            </Link>
            <Link className="secondary-action" href="/help/is-ynot-legit" prefetch={false}>
              <I18nText en="YNOT trust checks" th="วิธีตรวจความน่าเชื่อถือ YNOT" />
            </Link>
          </div>
        </section>
      </article>
    </YnotShell>
  );
}
