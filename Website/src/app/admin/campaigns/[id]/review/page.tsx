import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminFrame, AdminIcon } from "@/features/ynot/admin";
import { AdminOwnerReview } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import {
  getLivePackRevisionReview,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

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
    campaignReadiness: false,
    campaignPrizeLineups: true,
    ownerApprovalRequests: true,
    wallet: false,
  });
  const campaign = data.campaigns.find(
    (entry) => entry.id === id || entry.slug === id,
  );
  if (!campaign) return notFound();

  // Dev-auth bypass mirrors AdminGate so owner-only pages can be reviewed
  // locally only when the explicit dev flag is set.
  const viewerIsOwner =
    data.viewer.adminRole === "owner" || isDevAuthAllowed();

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
            <Link href="/admin/campaigns" className="btn" prefetch={false}>
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
    (entry) => entry.campaign.id === campaign.id,
  );
  const liveRevision = await getLivePackRevisionReview(campaign.id);

  if (campaign.status === "live" && liveRevision) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminOwnerReview
          viewer={data.viewer}
          campaign={campaign}
          prizes={liveRevision.prizes}
          approvalRequest={approvalRequest ?? null}
          liveRevision={liveRevision}
        />
      </AdminGate>
    );
  }

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
