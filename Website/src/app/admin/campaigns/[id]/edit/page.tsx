import { notFound } from "next/navigation";
import Link from "next/link";

import { AdminCampaignForm } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import { getAdminCards, getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, cards] = await Promise.all([
    getYnotDashboardSlice({
      campaigns: true,
      campaignVisibility: "admin",
      campaignLimit: null,
      categories: true,
    }),
    getAdminCards(),
  ]);
  const campaign = data.campaigns.find((entry) => entry.id === id);
  if (!campaign) return notFound();

  if (campaign.status !== "draft") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/campaigns"
          trail={["Admin", "Pack studio", "Random packs", "Edit"]}
          eyebrow="Edit random pack"
          title={campaign.titleEn || campaign.titleTh || "Pack editor"}
          desc={`This pack is "${campaign.status}". Only packs in draft state can be edited. Archive the pack and create a new draft to make changes.`}
          actions={
            <Link href="/admin/campaigns" className="btn">
              <AdminIcon name="chev-r" /> Back to all packs
            </Link>
          }
        >
          <AdminCard>
            <div className="card-pad text-mute">
              Locked — only drafts are editable. Archive this pack first.
            </div>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/campaigns"
        trail={["Admin", "Pack studio", "Random packs", "Edit"]}
        eyebrow="Edit random pack"
        title={`Editing: ${campaign.titleEn || campaign.titleTh || campaign.slug}`}
        desc="Update every campaign field and prize allocation. Saving puts the pack back into draft/private and requires a fresh owner approval before it can go live again."
        actions={
          <Link href="/admin/campaigns" className="btn">
            ← Back to all packs
          </Link>
        }
      >
        <AdminCard>
          <AdminCardHead label="Draft pack" title="Pack studio · edit" />
          <div className="card-pad">
            <AdminCampaignForm
              categories={data.categories}
              cards={cards}
              editingCampaign={campaign}
              editingPrizes={campaign.prizeLineup ?? []}
              editingCategoryId={campaign.categoryIds?.[0]}
            />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
