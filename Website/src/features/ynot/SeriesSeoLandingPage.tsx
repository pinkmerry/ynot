import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { I18nText } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";
import {
  type PublicSeriesLandingPage as PublicSeriesLandingPageContent,
  buildSeriesLandingPageJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

export function SeriesSeoLandingPage({
  page,
}: {
  page: PublicSeriesLandingPageContent;
}) {
  const jsonLd = buildSeriesLandingPageJsonLd(page);
  const browseHref = `/packs?series=${page.seriesParam}`;

  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
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
