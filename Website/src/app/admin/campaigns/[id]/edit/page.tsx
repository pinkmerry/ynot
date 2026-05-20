import { notFound } from "next/navigation";
import Link from "next/link";

import { AdminCampaignForm } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
} from "@/features/ynot/components";
import { getAdminCards, getYnotDashboardSlice } from "@/features/ynot/data";

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

  // Only draft packs can be edited. Approved/live packs need to be archived
  // before the inventory is allowed to change.
  if (campaign.status !== "draft") {
    return (
      <AdminSectionShell viewer={data.viewer} activeHref="/admin/campaigns">
        <PageHeader
          eyebrow="Edit random pack"
          title={campaign.titleEn || campaign.titleTh || "Pack editor"}
          description={`This pack is "${campaign.status}". Only packs in draft state can be edited. Archive the pack and create a new draft to make changes.`}
        />
        <div className="admin-edit-page-back">
          <Link href="/admin/campaigns">← Back to all packs</Link>
        </div>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/campaigns">
      <PageHeader
        eyebrow="Edit random pack"
        title={`Editing: ${campaign.titleEn || campaign.titleTh || campaign.slug}`}
        description="Update every campaign field and prize allocation. Saving puts the pack back into draft/private and requires a fresh owner approval before it can go live again."
      />
      <div className="admin-edit-page-back">
        <Link href="/admin/campaigns">← Back to all packs</Link>
      </div>
      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCampaignForm
          categories={data.categories}
          cards={cards}
          editingCampaign={campaign}
          editingPrizes={campaign.prizeLineup ?? []}
          editingCategoryId={campaign.categoryIds?.[0]}
        />
      </div>
    </AdminSectionShell>
  );
}
