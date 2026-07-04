import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/features/ynot/cr/Shell";
import { PackDetailArena } from "@/features/ynot/cr/PackDetailArena";
import { PageHead } from "@/features/ynot/cr/UiKit";
import { YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";
import { I18nText, i18n } from "@/features/ynot/i18n";
import {
  buildMissingPackMetadata,
  buildPackDetailMetadata,
  isPublicPackSeoCampaign,
  toPublicPackSeoItem,
} from "@/features/ynot/pack-seo";
import {
  buildPackDetailJsonLd,
  serializeJsonLd,
} from "@/lib/seo/public-answer-pages";

export const dynamic = "force-dynamic";

type PackDetailParams = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PackDetailParams): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign(slug);
  if (!isPublicPackSeoCampaign(campaign)) {
    return buildMissingPackMetadata(slug);
  }
  return buildPackDetailMetadata(campaign);
}

export default async function PackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ opened?: string }>;
}) {
  const [{ slug }, viewer, query] = await Promise.all([
    params,
    getYnotViewer(),
    searchParams ?? Promise.resolve<{ opened?: string }>({}),
  ]);
  const [data, campaign] = await Promise.all([
    getYnotDashboardSlice({ wallet: true }),
    getCampaign(slug, {
      allowTestForCurrentViewer: true,
      bypassPublicCache: query?.opened === "1",
      viewer,
    }),
  ]);
  const publicSeoCampaign = isPublicPackSeoCampaign(campaign)
    ? toPublicPackSeoItem(campaign)
    : null;
  const jsonLd = publicSeoCampaign
    ? buildPackDetailJsonLd(publicSeoCampaign)
    : null;

  return (
    <>
      {jsonLd ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: serializeJsonLd(jsonLd.service),
            }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: serializeJsonLd(jsonLd.breadcrumb),
            }}
          />
        </>
      ) : null}
      <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
        <Shell>
          {campaign ? (
            <PackDetailArena
              campaign={campaign}
              balanceCoins={data.wallet.balanceCoins}
            />
          ) : (
            <div className="cr-page">
              <PageHead
                title={i18n("Pack not found", "ไม่พบแพ็ก")}
                lead={i18n(
                  "This pack may have been removed or doesn't exist yet.",
                  "แพ็กนี้อาจถูกลบหรือยังไม่มีในระบบ",
                )}
                back={{ href: "/packs" }}
              />
              <div
                className="cr-section"
                style={{ padding: 40, textAlign: "center" }}
              >
                <strong style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                  <I18nText
                    en="No pack matches that link"
                    th="ไม่พบแพ็กจากลิงก์นี้"
                  />
                </strong>
                <small
                  className="cr-mute"
                  style={{ display: "block", marginBottom: 18 }}
                >
                  <I18nText
                    en="Browse all live Y-Packs from the main list."
                    th="ดู Y-Packs ที่เปิดอยู่ทั้งหมดจากรายการหลัก"
                  />
                </small>
                <Link className="cr-btn cr-btn-primary" href="/packs">
                  <I18nText en="Back to Y-Packs" th="กลับไป Y-Packs" />
                </Link>
              </div>
            </div>
          )}
        </Shell>
      </YnotShell>
    </>
  );
}
