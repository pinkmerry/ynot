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
  // Fetch sequentially, not in Promise.all: the prize-lineup dashboard slice
  // fires many concurrent Supabase requests, and running getAdminCards (which
  // includes the sub-SKU stock summary RPC) alongside it can exceed the
  // Cloudflare Worker simultaneous-connection limit, silently dropping the
  // sub-SKU summary so every prize row shows "No sub-SKU stock". Serializing the
  // two keeps getAdminCards' stock RPC from competing for connections.
  const data = await getYnotDashboardSlice({
    campaigns: true,
    campaignVisibility: "admin",
    campaignIdOrSlug: id,
    campaignLimit: 1,
    categories: true,
    campaignPrizeLineups: true,
  });
  const cards = await getAdminCards();
  const campaign = data.campaigns.find((entry) => entry.id === id);
  if (!campaign) return notFound();

  const isLiveEdit = campaign.status === "live";
  if (campaign.status !== "draft" && !isLiveEdit) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/campaigns"
          trail={["Admin", "Pack studio", "Random packs", "Edit"]}
          eyebrow="Edit random pack"
          title={campaign.titleEn || campaign.titleTh || "Pack editor"}
          desc={`This pack is "${campaign.status}". Only draft or live packs can be edited. Archive the pack and create a new draft to make changes.`}
          actions={
            <Link href="/admin/campaigns" className="btn">
              <AdminIcon name="chev-r" /> Back to all packs
            </Link>
          }
        >
          <AdminCard>
            <div className="card-pad text-mute">
              Locked — only draft or live packs are editable.
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
        eyebrow={isLiveEdit ? "Edit LIVE random pack" : "Edit random pack"}
        title={`Editing: ${campaign.titleEn || campaign.titleTh || campaign.slug}`}
        desc={
          isLiveEdit
            ? "⚠️ This pack is LIVE. Changes apply immediately to customers — prize/slot edits re-materialize stock atomically (awarded prizes are kept). The pack stays live; no re-approval needed."
            : "Update every campaign field and prize allocation. Saving puts the pack back into draft/private and requires a fresh owner approval before it can go live again."
        }
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
