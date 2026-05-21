import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminFrame, AdminIcon } from "@/features/ynot/admin";
import { AdminOwnerReview } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function OwnerReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignIdOrSlug: id,
    campaignLimit: 1,
    campaignPrizeLineups: true,
    ownerApprovalRequests: true,
  });
  const campaign = data.campaigns.find((entry) => entry.id === id);
  if (!campaign) return notFound();

  // Dev-mode bypass mirrors AdminGate and the lifecycle route so owner-only
  // pages can be reviewed locally without a real admin session.
  const viewerIsOwner =
    data.viewer.adminRole === "owner" || process.env.NODE_ENV !== "production";

  if (!viewerIsOwner) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/campaigns"
          trail={["Admin", "Pack studio", "Random packs", "Review"]}
          eyebrow="Owner approval"
          title="Owner-only"
          desc="Only the owner can review and publish random packs. Ask the owner to approve this draft."
          actions={
            <Link href="/admin/campaigns" className="btn">
              <AdminIcon name="chev-r" /> Back to packs
            </Link>
          }
        >
          <AdminCard>
            <div className="card-pad text-mute">
              You are signed in as {data.viewer.adminRole ?? "user"}. Only the
              owner can approve, reject, or publish a pack.
            </div>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  const approvalRequest = data.ownerApprovalRequests.find(
    (entry) => entry.campaign.id === id,
  );

  return (
    <AdminGate viewer={data.viewer}>
      <AdminOwnerReview
        viewer={data.viewer}
        campaign={campaign}
        prizes={campaign.prizeLineup ?? []}
        approvalRequest={approvalRequest ?? null}
      />
    </AdminGate>
  );
}
