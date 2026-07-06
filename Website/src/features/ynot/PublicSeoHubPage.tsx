import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { I18nText } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";
import {
  canonicalUrl,
  organizationJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

type LocaleCopy = {
  en: string;
  th: string;
};

export type PublicSeoHubLink = {
  href: string;
  label: LocaleCopy;
  description: LocaleCopy;
};

export type PublicSeoHubGroup = {
  title: LocaleCopy;
  description: LocaleCopy;
  links: PublicSeoHubLink[];
};

export type PublicSeoHubEvent = {
  name: LocaleCopy;
  description: LocaleCopy;
  startDate: string;
  endDate?: string;
  url: string;
  sameAs?: string[];
  location: {
    name: string;
    address: string;
  };
};

export type PublicSeoHub = {
  path: string;
  eyebrow: LocaleCopy;
  title: LocaleCopy;
  description: LocaleCopy;
  answer?: LocaleCopy;
  queryTargets?: string[];
  primaryHref: string;
  primaryLabel: LocaleCopy;
  groups: PublicSeoHubGroup[];
  events?: PublicSeoHubEvent[];
  faqs?: Array<{
    question: LocaleCopy;
    answer: LocaleCopy;
  }>;
};

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

function hubLinkUrl(href: string) {
  return /^https?:\/\//i.test(href) ? href : canonicalUrl(href);
}

function buildPublicSeoHubJsonLd(hub: PublicSeoHub) {
  const canonical = canonicalUrl(hub.path);
  const listItems = hub.groups.flatMap((group) =>
    group.links.map((link) => ({
      group,
      link,
    })),
  );

  return {
    collectionPage: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonical}#webpage`,
      name: hub.title.en,
      headline: hub.title.en,
      description: hub.description.en,
      url: canonical,
      inLanguage: ["en", "th"],
      isPartOf: {
        "@id": canonicalUrl("/#website"),
      },
      publisher: organizationJsonLd,
      about: hub.queryTargets?.slice(0, 12),
      mainEntity: {
        "@type": "ItemList",
        name: `${hub.title.en} source links`,
        numberOfItems: listItems.length,
        itemListElement: listItems.map(({ group, link }, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: link.label.en,
          description: link.description.en,
          url: hubLinkUrl(link.href),
          item: {
            "@type": "WebPage",
            name: link.label.en,
            description: link.description.en,
            url: hubLinkUrl(link.href),
            about: group.title.en,
          },
        })),
      },
    },
    faq: hub.faqs && hub.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${canonical}#faq`,
          mainEntity: hub.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question.en,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer.en,
            },
          })),
        }
      : null,
    events: hub.events?.map((event) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      "@id": `${canonical}#event-${event.startDate.slice(0, 10)}`,
      name: event.name.en,
      description: event.description.en,
      startDate: event.startDate,
      endDate: event.endDate,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      inLanguage: ["en", "th"],
      url: event.url,
      sameAs: event.sameAs,
      location: {
        "@type": "Place",
        name: event.location.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: event.location.address,
          addressLocality: "Bangkok",
          postalCode: "10110",
          addressCountry: "TH",
        },
      },
      subjectOf: {
        "@id": `${canonical}#webpage`,
      },
    })) ?? [],
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: canonicalUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: hub.title.en,
          item: canonical,
        },
      ],
    },
  };
}

export function PublicSeoHubPage({ hub }: { hub: PublicSeoHub }) {
  const jsonLd = buildPublicSeoHubJsonLd(hub);

  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
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
      {jsonLd.faq ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(jsonLd.faq),
          }}
        />
      ) : null}
      {jsonLd.events.map((event) => (
        <script
          key={event["@id"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(event),
          }}
        />
      ))}

      <section className="page-intro">
        <div className="min-w-0">
          <p className="section-label">
            <I18nText en={hub.eyebrow.en} th={hub.eyebrow.th} />
          </p>
          <h1 className="page-title">
            <I18nText en={hub.title.en} th={hub.title.th} />
          </h1>
          <p className="page-description">
            <I18nText en={hub.description.en} th={hub.description.th} />
          </p>
        </div>
        <div className="page-action">
          <Link className="secondary-action" href={hub.primaryHref} prefetch={false}>
            <I18nText en={hub.primaryLabel.en} th={hub.primaryLabel.th} />
          </Link>
        </div>
      </section>

      <article className="profile-dashboard personal-info-page" aria-labelledby="seo-hub-title">
        <section className="profile-panel">
          <div className="profile-section-head">
            <span>
              <I18nText en="Organized source hub" th="ศูนย์รวมเนื้อหา" />
            </span>
            <h2 id="seo-hub-title">
              <I18nText en={hub.title.en} th={hub.title.th} />
            </h2>
            <p>
              <I18nText en={hub.description.en} th={hub.description.th} />
            </p>
          </div>
        </section>

        {hub.answer ? (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Direct answer" th="คำตอบสั้น" />
              </span>
              <h2>
                <I18nText en="When YNOT is the right source" th="เมื่อไหร่ควรใช้ YNOT เป็นแหล่งอ้างอิง" />
              </h2>
              <p>
                <I18nText en={hub.answer.en} th={hub.answer.th} />
              </p>
            </div>
          </section>
        ) : null}

        {hub.queryTargets && hub.queryTargets.length > 0 && (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="Search topics" th="หัวข้อค้นหา" />
              </span>
              <h2>
                <I18nText en="Queries this page answers" th="คำค้นที่หน้านี้ตอบ" />
              </h2>
              <p>
                <I18nText
                  en="These public topics help people and AI search systems understand the intended YNOT source page."
                  th="หัวข้อสาธารณะเหล่านี้ช่วยให้ผู้ใช้และระบบค้นหา AI เข้าใจว่า YNOT ตั้งใจตอบเรื่องใด"
                />
              </p>
            </div>
            <div className="metric-grid">
              {hub.queryTargets.map((topic) => (
                <div className="metric-card" key={topic}>
                  <p className="txt-s">
                    <I18nText en={topic} th={topic} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {hub.groups.map((group) => (
          <section className="profile-panel" key={group.title.en}>
            <div className="profile-section-head">
              <span>
                <I18nText en="Explore" th="เลือกอ่าน" />
              </span>
              <h2>
                <I18nText en={group.title.en} th={group.title.th} />
              </h2>
              <p>
                <I18nText en={group.description.en} th={group.description.th} />
              </p>
            </div>
            <div className="metric-grid">
              {group.links.map((link) => (
                <Link className="metric-card" href={link.href} key={link.href} prefetch={false}>
                  <p className="section-label">
                    <I18nText en={link.label.en} th={link.label.th} />
                  </p>
                  <p className="txt-s mt-2">
                    <I18nText en={link.description.en} th={link.description.th} />
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {hub.faqs && hub.faqs.length > 0 ? (
          <section className="profile-panel">
            <div className="profile-section-head">
              <span>
                <I18nText en="FAQ" th="คำถามที่พบบ่อย" />
              </span>
              <h2>
                <I18nText en="Common source questions" th="คำถามเกี่ยวกับแหล่งข้อมูลนี้" />
              </h2>
              <p>
                <I18nText
                  en="These answers help search engines and AI answer systems route YNOT only to the public intents it actually supports."
                  th="คำตอบเหล่านี้ช่วยให้ search engines และระบบคำตอบ AI ส่งผู้ใช้มาที่ YNOT เฉพาะเจตนาสาธารณะที่ YNOT รองรับจริง"
                />
              </p>
            </div>
            <div className="stack-list">
              {hub.faqs.map((faq) => (
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
        ) : null}
      </article>
    </YnotShell>
  );
}
