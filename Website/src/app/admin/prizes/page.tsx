import { PrizeCatalogScreen } from "@/features/ynot/admin/prize-catalog";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import { AdminCard, AdminFrame } from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminCards(),
    getAdminPrizePool(),
  ]);
  const isOwner = data.viewer.adminRole === "owner";

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/prizes"
        trail={["Admin", "Pack studio", "Prize catalog"]}
        title="Prize catalog"
        desc="Your cards, sealed boxes and packs — and exactly where every unit is: in stock, loaded into a pack, or won and sitting in a customer's bag."
      >
        <AdminCard className="admin-prize-catalog-card">
          <div className="card-pad">
            <PrizeCatalogScreen cards={cards} prizes={prizes} isOwner={isOwner} />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
