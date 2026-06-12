import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminFrame, AdminIcon } from "@/features/ynot/admin";
import { LivePackMonitor } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import { getLivePackMonitor, getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function LivePackMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, monitor] = await Promise.all([
    getYnotDashboardSlice({
      campaigns: true,
      campaignVisibility: "admin",
      campaignIdOrSlug: id,
      campaignLimit: 1,
      campaignReadiness: false,
      wallet: false,
    }),
    getLivePackMonitor(id),
  ]);
  const campaign = data.campaigns.find((entry) => entry.id === id);
  if (!campaign || !monitor) return notFound();

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/campaigns"
        trail={["Admin", "Pack studio", "Random packs", `Monitor · ${campaign.slug}`]}
        eyebrow="Live pack monitor"
        title={`Monitor · ${campaign.titleEn || campaign.titleTh}`}
        desc="Manual-refresh dashboard for live status, prizes left, prizes out, and recent customer wins."
        actions={
          <>
            <Link href={`/admin/campaigns/${campaign.id}/edit`} className="btn">
              <AdminIcon name="edit" /> Edit live pack
            </Link>
            <Link href="/admin/campaigns" className="btn">
              <AdminIcon name="chev-r" /> Back to packs
            </Link>
          </>
        }
      >
        <LivePackMonitor campaignId={campaign.id} initialMonitor={monitor} />
      </AdminFrame>
    </AdminGate>
  );
}
