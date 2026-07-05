import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { I18nText, i18n } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";
import { serializeJsonLd } from "@/lib/seo/public-answer-pages";

export const metadata: Metadata = {
  title: "Contact YNOT Support",
  description:
    "Contact YNOT support for help with Y-Packs, wallet top-ups, collection, exchange, and shipping references.",
  alternates: {
    canonical: "https://www.ynotopen.com/contact",
  },
};

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": "https://www.ynotopen.com/contact#webpage",
  name: "Contact YNOT Support",
  url: "https://www.ynotopen.com/contact",
  description:
    "Official YNOT support route for Y-Packs, wallet top-ups, collection, exchange, shipping, and order references.",
  isPartOf: {
    "@id": "https://www.ynotopen.com/#website",
  },
  about: {
    "@id": "https://www.ynotopen.com/#organization",
  },
  mainEntity: {
    "@type": "ContactPoint",
    contactType: "customer support",
    name: "YNOT support through ynotopen.com/contact and Instagram @_yfifteen",
    url: "https://www.ynotopen.com/contact",
    areaServed: {
      "@type": "Country",
      name: "Thailand",
    },
    availableLanguage: ["en", "th"],
    sameAs: "https://www.instagram.com/_yfifteen/",
  },
};

export default function ContactPage() {
  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(contactJsonLd) }}
      />
      <PageHeader
        eyebrow={i18n("Support", "ซัพพอร์ต")}
        title={i18n("Contact YNOT", "ติดต่อ YNOT")}
        description={i18n(
          "Need help with packs, wallet top ups, collection, exchange, or shipping? Start with the channel below and include your account name plus the pack or order reference if you have one.",
          "ต้องการความช่วยเหลือเรื่องแพ็ก วอลเล็ต คอลเลกชัน แลกเหรียญ หรือจัดส่ง เริ่มจากช่องทางด้านล่างและแจ้งชื่อบัญชีพร้อมเลขอ้างอิงแพ็กหรือออเดอร์ถ้ามี",
        )}
      />

      <section
        className="profile-dashboard personal-info-page"
        aria-label="Contact support / ติดต่อซัพพอร์ต"
      >
        <div className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Support channel" th="ช่องทางซัพพอร์ต" />
            </span>
            <strong>
              <I18nText en="Instagram direct message" th="ข้อความ Instagram" />
            </strong>
            <p>
              <I18nText
                en="Message the YNOT team on the official Instagram account @_yfifteen for account and order help. Keep payment slips, order references, and pack names ready so the team can check your case faster."
                th="ส่งข้อความหา YNOT ทาง Instagram ทางการ @_yfifteen เพื่อขอความช่วยเหลือเรื่องบัญชีและออเดอร์ เตรียมสลิป เลขอ้างอิง และชื่อแพ็กไว้เพื่อให้ทีมตรวจสอบได้เร็วขึ้น"
              />
            </p>
          </div>
          <div className="product-actions">
            <a
              className="primary-action"
              href="https://www.instagram.com/_yfifteen/"
              rel="noreferrer"
              target="_blank"
            >
              <I18nText
                en="Open @_yfifteen Instagram"
                th="เปิด Instagram @_yfifteen"
              />
            </a>
            <Link className="secondary-action" href="/packs">
              <I18nText en="Browse Y-Packs" th="ดู Y-Packs" />
            </Link>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <p className="section-label">
              <I18nText en="Wallet help" th="ช่วยเหลือเรื่องวอลเล็ต" />
            </p>
            <p className="txt-s mt-2">
              <I18nText
                en="Include the top-up amount and time when asking about coin balance."
                th="แจ้งจำนวนเงินและเวลาที่เติมเมื่อสอบถามเรื่องยอดเหรียญ"
              />
            </p>
          </div>
          <div className="metric-card">
            <p className="section-label">
              <I18nText en="Pack help" th="ช่วยเหลือเรื่องแพ็ก" />
            </p>
            <p className="txt-s mt-2">
              <I18nText
                en="Include the Y-Pack name and open reference when asking about a pull."
                th="แจ้งชื่อ Y-Pack และเลขอ้างอิงการเปิดเมื่อสอบถามเรื่องรางวัล"
              />
            </p>
          </div>
          <div className="metric-card">
            <p className="section-label">
              <I18nText en="Shipping help" th="ช่วยเหลือเรื่องจัดส่ง" />
            </p>
            <p className="txt-s mt-2">
              <I18nText
                en="Include your shipping request reference when asking about delivery."
                th="แจ้งเลขคำขอจัดส่งเมื่อสอบถามเรื่องการจัดส่ง"
              />
            </p>
          </div>
        </div>
      </section>
    </YnotShell>
  );
}
