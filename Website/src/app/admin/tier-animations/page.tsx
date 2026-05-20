import { AdminGate } from "@/features/ynot/components";
import {
  getAllTierAnimationsForAdmin,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import { AdminTierAnimationForm } from "./AdminTierAnimationForm";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminTierAnimationsPage() {
  const [data, tiers] = await Promise.all([
    getYnotDashboardSlice({}),
    getAllTierAnimationsForAdmin(),
  ]);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/tier-animations"
        trail={["Admin", "Pack studio", "Tier animations"]}
        eyebrow="Reveal videos"
        title="Reveal animations"
        desc="Upload reveal video + poster + audio per tier. These play during instant-gacha reveals on customer devices."
        actions={
          <span className="btn">
            <AdminIcon name="upload" />
            Upload assets
          </span>
        }
      >
        {tiers.length === 0 ? (
          <AdminCard>
            <div className="card-pad text-mute">
              No tier rows found. Apply the gacha reveal migration first.
            </div>
          </AdminCard>
        ) : (
          <div className="split-2">
            {tiers.map((tier) => (
              <AdminCard key={tier.tier}>
                <AdminCardHead
                  label={tier.tier}
                  title={`${tier.tier} reveal`}
                />
                <div className="card-pad">
                  <AdminTierAnimationForm tier={tier} />
                </div>
              </AdminCard>
            ))}
          </div>
        )}
      </AdminFrame>
    </AdminGate>
  );
}
