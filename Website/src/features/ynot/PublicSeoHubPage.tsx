import Link from "next/link";
import { YnotShell } from "@/features/ynot/components";
import { I18nText } from "@/features/ynot/i18n";
import type { YnotViewer } from "@/features/ynot/types";

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

export type PublicSeoHub = {
  eyebrow: LocaleCopy;
  title: LocaleCopy;
  description: LocaleCopy;
  queryTargets?: string[];
  primaryHref: string;
  primaryLabel: LocaleCopy;
  groups: PublicSeoHubGroup[];
};

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

export function PublicSeoHubPage({ hub }: { hub: PublicSeoHub }) {
  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
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
      </article>
    </YnotShell>
  );
}
