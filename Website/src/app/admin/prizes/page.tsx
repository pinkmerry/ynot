import {
  AdminCardCatalogPanel,
  AdminCardForm,
} from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminKPI,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminCards(),
    getAdminPrizePool(),
  ]);

  const totalUnits = prizes.reduce((sum, p) => sum + (p.totalUnits ?? 0), 0);
  const globalStockUnits = cards.reduce(
    (sum, card) => sum + (card.stockTotal ?? 0),
    0,
  );
  const availableUnits = prizes.reduce(
    (sum, p) => sum + (p.availableUnits ?? 0),
    0,
  );
  const awardedUnits = prizes.reduce(
    (sum, p) => sum + (p.awardedUnits ?? 0),
    0,
  );

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/prizes"
        trail={["Admin", "Pack studio", "Prize catalog"]}
        eyebrow="Admin prizes"
        title="Prize catalog"
        desc="Create PSA10 cards, sealed products, electronics, and other prize items for the random pack editor."
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Cards in catalog"
            value={cards.length.toLocaleString()}
            color="var(--a-gold)"
          />
          <AdminKPI
            label="Global stock units"
            value={globalStockUnits.toLocaleString()}
            color="var(--a-mint)"
          />
          <AdminKPI
            label="In prize pools"
            value={totalUnits.toLocaleString()}
            delta={`${availableUnits.toLocaleString()} available`}
            color="var(--a-sky)"
          />
          <AdminKPI
            label="Awarded total"
            value={awardedUnits.toLocaleString()}
            color="var(--a-amber)"
          />
        </div>

        <AdminCard className="admin-prize-create-card">
          <AdminCardHead label="Add card" title="Create catalog item" />
          <div className="card-pad">
            <AdminCardForm cards={cards} prizes={prizes} />
          </div>
        </AdminCard>

        <AdminCard className="admin-prize-catalog-card">
          <div className="card-pad">
            <AdminCardCatalogPanel cards={cards} prizes={prizes} />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
