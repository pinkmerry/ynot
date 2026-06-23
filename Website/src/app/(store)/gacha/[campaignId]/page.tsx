import { redirect } from "next/navigation";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice, getYnotViewer } from "@/features/ynot/data";
import { i18n } from "@/features/ynot/i18n";

export const dynamic = "force-dynamic";

export default async function GachaDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const [{ campaignId }, viewer] = await Promise.all([params, getYnotViewer()]);
  const [data, campaign] = await Promise.all([
    getYnotDashboardSlice({ wallet: true }),
    getCampaign(campaignId, { allowTestForCurrentViewer: true, viewer }),
  ]);
  if (campaign) {
    redirect(`/packs/${campaign.slug}`);
  }
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow={i18n("Y-Pack Detail", "รายละเอียด Y-Pack")}
        title={i18n("Campaign not found", "ไม่พบแคมเปญ")}
        description={i18n(
          "This Y-Pack is not available or the database migration has not been applied.",
          "Y-Pack นี้ไม่พร้อมใช้งาน หรือยังไม่ได้อัปเดตฐานข้อมูลที่จำเป็น",
        )}
      />
      <EmptyState
        title={i18n("Missing campaign", "ไม่พบแคมเปญ")}
        body={i18n(
          "Go back to all packs and choose another Y-Pack.",
          "กลับไปหน้า Y-Packs แล้วเลือกแพ็กอื่น",
        )}
      />
    </YnotShell>
  );
}
