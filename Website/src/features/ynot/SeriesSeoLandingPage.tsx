import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { I18nText } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";
import {
  type PublicSeriesPackListItem,
  type PublicSeriesLandingPage as PublicSeriesLandingPageContent,
  buildSeriesLandingPageJsonLd,
  seriesPackCatalogPath,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

function campaignTitle(campaign: PublicSeriesPackListItem) {
  return campaign.titleEn || campaign.titleTh || campaign.slug;
}

function campaignStatusText(campaign: PublicSeriesPackListItem) {
  if (campaign.soldOut) return "Sold out";
  if (campaign.openable) return "Live";
  if (campaign.status === "live") return "Live";
  return campaign.status;
}

function campaignStockText(campaign: PublicSeriesPackListItem) {
  if (
    typeof campaign.remainingSlots === "number" &&
    typeof campaign.totalSlots === "number"
  ) {
    return `${campaign.remainingSlots} / ${campaign.totalSlots} slots remaining`;
  }
  return "Check pack page for current stock";
}

export function SeriesSeoLandingPage({
  campaigns = [],
  page,
  viewer = guestViewer,
}: {
  campaigns?: PublicSeriesPackListItem[];
  page: PublicSeriesLandingPageContent;
  viewer?: YnotViewer;
}) {
  const jsonLd = buildSeriesLandingPageJsonLd(page, campaigns);
  const browseHref = seriesPackCatalogPath(page.seriesParam);

  return (
    <YnotShell viewer={viewer} viewerMode="literal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd.collectionPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd.faq) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd.breadcrumb) }}
      />

      <section className="page-intro">
        <div className="min-w-0">
          <p className="section-label">
            <I18nText en={page.eyebrow.en} th={page.eyebrow.th} />
          </p>
          <h1 className="page-title">
            <I18nText en={page.headline.en} th={page.headline.th} />
          </h1>
          <p className="page-description">
            <I18nText en={page.description.en} th={page.description.th} />
          </p>
        </div>
        <div className="page-action">
          <Link className="secondary-action" href={browseHref} prefetch={false}>
            <I18nText en="Browse Live Y-Packs" th="ดู Y-Packs ที่เปิดอยู่" />
          </Link>
        </div>
      </section>

      <article
        className="profile-dashboard personal-info-page"
        aria-labelledby="series-hub-title"
      >
        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Search intent" th="เจตนาการค้นหา" />
            </span>
            <strong id="series-hub-title">
              <I18nText en={page.headline.en} th={page.headline.th} />
            </strong>
            <p>
              <I18nText en={page.intro.en} th={page.intro.th} />
            </p>
            <p>
              <I18nText en={page.answer.en} th={page.answer.th} />
            </p>
          </div>
          <div className="product-actions">
            <Link className="primary-action" href={browseHref} prefetch={false}>
              <I18nText en="Open Filtered Packs" th="เปิดหน้าแพ็กที่กรองไว้" />
            </Link>
            <Link className="secondary-action" href="/contact" prefetch={false}>
              <I18nText en="Ask YNOT Support" th="ถามซัพพอร์ต YNOT" />
            </Link>
          </div>
        </section>

        {page.sourceLinks && page.sourceLinks.length > 0 ? (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Source checks" th="แหล่งอ้างอิง" />
              </span>
              <strong>
                <I18nText en="Official, shop, and marketplace references" th="แหล่งทางการ ร้านค้า และมาร์เก็ตเพลส" />
              </strong>
              <p>
                <I18nText
                  en="These links show the search landscape this page is separating: official publishers, retail catalogs, marketplace pages, and YNOT Y-Pack intent."
                  th="ลิงก์เหล่านี้แสดงภาพรวมผลค้นหาที่หน้านี้แยกออกจากกัน ได้แก่ แหล่งทางการ แคตตาล็อกร้านค้า หน้ามาร์เก็ตเพลส และเจตนา Y-Pack ของ YNOT"
                />
              </p>
            </div>
            <div className="stack-list">
              {page.sourceLinks.map((source) => (
                <a
                  className="activity-card"
                  href={source.href}
                  key={source.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="section-label">
                    <I18nText en={source.title.en} th={source.title.th} />
                  </span>
                  <span className="txt-s mt-2">
                    <I18nText en={source.description.en} th={source.description.th} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Best match" th="เหมาะกับอะไร" />
            </span>
            <strong>
              <I18nText en="Match the query to the right destination" th="จับคู่คำค้นกับปลายทางที่ถูกต้อง" />
            </strong>
          </div>
          <div className="metric-grid">
            {page.searchIntents.map((intent) => (
              <div className="metric-card" key={intent.title.en}>
                <p className="section-label">
                  <I18nText en={intent.title.en} th={intent.title.th} />
                </p>
                <p className="txt-s mt-2">
                  <I18nText en={intent.body.en} th={intent.body.th} />
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Search landscape" th="ภาพรวมผลค้นหา" />
            </span>
            <strong>
              <I18nText en="How to choose the right result" th="เลือกผลลัพธ์ให้ตรงเจตนา" />
            </strong>
            <p>
              <I18nText
                en="Broad card searches mix official publishers, card shops, community markets, and YNOT. This page separates those intents so search engines and AI answers can route users correctly."
                th="คำค้นการ์ดแบบกว้างมีทั้งแหล่งทางการ ร้านการ์ด ตลาดชุมชน และ YNOT หน้านี้แยกเจตนาเหล่านั้นเพื่อให้ search engines และระบบคำตอบ AI ส่งผู้ใช้ไปถูกทาง"
              />
            </p>
          </div>
          <div className="metric-grid">
            {page.searchLandscape.map((landscape) => (
              <div className="metric-card" key={landscape.title.en}>
                <p className="section-label">
                  <I18nText en={landscape.title.en} th={landscape.title.th} />
                </p>
                <p className="txt-s mt-2">
                  <I18nText en={landscape.body.en} th={landscape.body.th} />
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Start here" th="เริ่มตรงนี้" />
            </span>
            <strong>
              <I18nText en="Useful YNOT links for this search" th="ลิงก์ YNOT ที่เกี่ยวข้องกับคำค้นนี้" />
            </strong>
          </div>
          <div className="stack-list">
            {page.relatedLinks.map((link) => (
              <Link
                className="activity-card"
                href={link.href}
                key={link.href}
                prefetch={false}
              >
                <span className="section-label">
                  <I18nText en={link.title.en} th={link.title.th} />
                </span>
                <span className="txt-s mt-2">
                  <I18nText en={link.description.en} th={link.description.th} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Current public Y-Packs" th="Y-Packs สาธารณะตอนนี้" />
            </span>
            <strong>
              <I18nText en="Live pack evidence for this category" th="หลักฐานแพ็กที่เปิดให้ดูในหมวดนี้" />
            </strong>
            <p>
              <I18nText
                en="These public pack links give search engines and AI answer systems the current YNOT category context: pack name, coin cost, stock signal, and pack detail URL."
                th="ลิงก์แพ็กสาธารณะเหล่านี้ให้บริบทหมวดหมู่ YNOT ปัจจุบันกับ search engines และระบบคำตอบ AI ได้แก่ชื่อแพ็ก ราคาเหรียญ สัญญาณสต็อก และ URL รายละเอียดแพ็ก"
              />
            </p>
          </div>
          {campaigns.length > 0 ? (
            <div className="stack-list">
              {campaigns.map((campaign) => (
                <Link
                  className="activity-card"
                  href={`/packs/${campaign.slug}`}
                  key={campaign.slug}
                  prefetch={false}
                >
                  <span className="section-label">
                    {campaignStatusText(campaign)} ·{" "}
                    {campaign.categoryLabel ?? page.headline.en}
                  </span>
                  <strong>{campaignTitle(campaign)}</strong>
                  <span className="txt-s mt-2">
                    {campaign.costCoins} YNOT wallet coins ·{" "}
                    {campaignStockText(campaign)}
                  </span>
                  {campaign.heroLabel ? (
                    <span className="txt-s mt-2">{campaign.heroLabel}</span>
                  ) : null}
                  {campaign.displayTags && campaign.displayTags.length > 0 ? (
                    <span className="tag-filter-list mt-2" aria-label="Pack tags">
                      {campaign.displayTags.slice(0, 4).map((tag) => (
                        <span className="tag-chip" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="activity-card">
              <span className="section-label">
                <I18nText en="No public packs currently listed" th="ยังไม่มีแพ็กสาธารณะในตอนนี้" />
              </span>
              <p className="txt-s mt-2">
                <I18nText
                  en="Use the filtered packs page to check the latest public Y-Pack availability for this category."
                  th="ใช้หน้าแพ็กที่กรองไว้เพื่อตรวจความพร้อมของ Y-Pack สาธารณะล่าสุดในหมวดนี้"
                />
              </p>
              <Link className="secondary-action mt-2" href={browseHref} prefetch={false}>
                <I18nText en="Check Filtered Packs" th="ตรวจหน้าแพ็กที่กรองไว้" />
              </Link>
            </div>
          )}
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Proof" th="หลักฐานประกอบ" />
            </span>
            <strong>
              <I18nText en="Why this page belongs in search" th="ทำไมหน้านี้ควรอยู่ในผลค้นหา" />
            </strong>
          </div>
          <div className="metric-grid">
            {page.proofPoints.map((proof) => (
              <div className="metric-card" key={proof.en}>
                <p className="txt-s">
                  <I18nText en={proof.en} th={proof.th} />
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Related searches" th="คำค้นที่เกี่ยวข้อง" />
            </span>
            <strong>
              <I18nText en="Keywords this page answers" th="คำค้นที่หน้านี้ตอบ" />
            </strong>
          </div>
          <div className="tag-filter-list" aria-label="Related search terms">
            {page.queryTargets.map((term) => (
              <span className="tag-chip" key={term}>
                {term}
              </span>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="FAQ" th="คำถามที่พบบ่อย" />
            </span>
            <strong>
              <I18nText en="Common questions" th="คำถามทั่วไป" />
            </strong>
          </div>
          <div className="stack-list">
            {page.faqs.map((faq) => (
              <details className="activity-card" key={faq.question.en}>
                <summary className="section-label">
                  <I18nText en={faq.question.en} th={faq.question.th} />
                </summary>
                <p className="txt-s mt-2">
                  <I18nText en={faq.answer.en} th={faq.answer.th} />
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Reviewed by" th="ตรวจทานโดย" />
            </span>
            <strong>{page.owner}</strong>
            <p>
              <I18nText
                en={`Updated ${page.updatedAt}. This hub is written for public search and AI answer systems, with private account actions kept behind sign-in.`}
                th={`อัปเดต ${page.updatedAt} หน้านี้เขียนสำหรับการค้นหาสาธารณะและระบบคำตอบ AI โดยเก็บการทำงานเฉพาะบัญชีไว้หลังเข้าสู่ระบบ`}
              />
            </p>
          </div>
        </section>
      </article>
    </YnotShell>
  );
}
