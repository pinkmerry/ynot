import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { I18nText } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";
import {
  type PublicAnswerPage as PublicAnswerPageContent,
  buildAnswerPageJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

export function PublicAnswerPage({
  page,
}: {
  page: PublicAnswerPageContent;
}) {
  const jsonLd = buildAnswerPageJsonLd(page);

  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd.article) }}
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
            <I18nText en="YNOT help" th="ศูนย์ช่วยเหลือ YNOT" />
          </p>
          <h1 className="page-title">
            <I18nText en={page.title.en} th={page.title.th} />
          </h1>
          <p className="page-description">
            <I18nText en={page.description.en} th={page.description.th} />
          </p>
        </div>
        <div className="page-action">
          <Link className="secondary-action" href="/packs" prefetch={false}>
            <I18nText en="Browse Y-Packs" th="ดู Y-Packs" />
          </Link>
        </div>
      </section>

      <article className="profile-dashboard personal-info-page" aria-labelledby="public-answer-title">
        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Direct answer" th="คำตอบสั้น" />
            </span>
            <strong id="public-answer-title">
              <I18nText en={page.title.en} th={page.title.th} />
            </strong>
            <p>
              <I18nText en={page.answer.en} th={page.answer.th} />
            </p>
          </div>
          <div className="product-actions">
            <Link className="primary-action" href="/packs" prefetch={false}>
              <I18nText en="Open public packs" th="เปิดหน้าแพ็กสาธารณะ" />
            </Link>
            <Link className="secondary-action" href="/contact" prefetch={false}>
              <I18nText en="Contact support" th="ติดต่อซัพพอร์ต" />
            </Link>
          </div>
        </section>

        {page.steps && page.steps.length > 0 && (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Steps" th="ขั้นตอน" />
              </span>
              <strong>
                <I18nText en="How the flow works" th="ขั้นตอนการใช้งาน" />
              </strong>
            </div>
            <div className="metric-grid">
              {page.steps.map((step, index) => (
                <div className="metric-card" key={step.en}>
                  <p className="section-label">
                    <I18nText en={`Step ${index + 1}`} th={`ขั้นตอน ${index + 1}`} />
                  </p>
                  <p className="txt-s mt-2">
                    <I18nText en={step.en} th={step.th} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Proof" th="หลักฐานประกอบ" />
            </span>
            <strong>
              <I18nText en="Why this answer is reliable" th="เหตุผลที่คำตอบนี้เชื่อถือได้" />
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

        {page.sourceLinks && page.sourceLinks.length > 0 && (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Source links" th="ลิงก์หลักฐาน" />
              </span>
              <strong>
                <I18nText en="Public event and social proof" th="หลักฐานอีเวนต์และโซเชียลสาธารณะ" />
              </strong>
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
        )}

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
                en={`Updated ${page.updatedAt}. This page is written for public search and AI answer systems, with private account actions kept behind sign-in.`}
                th={`อัปเดต ${page.updatedAt} หน้านี้เขียนสำหรับการค้นหาสาธารณะและระบบคำตอบ AI โดยเก็บการทำงานเฉพาะบัญชีไว้หลังเข้าสู่ระบบ`}
              />
            </p>
          </div>
        </section>
      </article>
    </YnotShell>
  );
}
