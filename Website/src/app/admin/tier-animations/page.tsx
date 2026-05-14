import { AdminSectionShell, PageHeader } from "@/features/ynot/components";
import {
  getAllTierAnimationsForAdmin,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import { AdminTierAnimationForm } from "./AdminTierAnimationForm";

export const dynamic = "force-dynamic";

export default async function AdminTierAnimationsPage() {
  const [data, tiers] = await Promise.all([
    getYnotDashboardSlice({}),
    getAllTierAnimationsForAdmin(),
  ]);

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/tier-animations">
      <PageHeader
        eyebrow="Reveal videos"
        title="Pack Opening Animations"
        description="Upload the four tier reveal videos that play when a player opens a pack. The highest tier in a multi-pull decides which video plays."
      />
      <div className="admin-tier-grid">
        {tiers.length === 0 ? (
          <p className="admin-empty">
            No tier rows found. Apply the gacha reveal migration first.
          </p>
        ) : (
          tiers.map((tier) => (
            <AdminTierAnimationForm key={tier.tier} tier={tier} />
          ))
        )}
      </div>
    </AdminSectionShell>
  );
}
