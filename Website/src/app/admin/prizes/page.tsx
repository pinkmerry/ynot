import {
  AdminCardCatalogPanel,
  AdminCardForm,
  AdminPrizeInventoryPanel,
  AdminPrizePoolForm,
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
  AdminIcon,
  AdminKPI,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardSlice({
      campaigns: true,
      campaignVisibility: "admin",
      campaignLimit: null,
    }),
    getAdminCards(),
    getAdminPrizePool(),
  ]);

  const totalUnits = prizes.reduce((sum, p) => sum + (p.totalUnits ?? 0), 0);
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
        desc="Create PSA10 cards, sealed products, electronics, and other prize items, then assign them into campaign prize pools."
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Cards in catalog"
            value={cards.length.toLocaleString()}
            color="var(--a-gold)"
          />
          <AdminKPI
            label="Active prize units"
            value={totalUnits.toLocaleString()}
            color="var(--a-mint)"
          />
          <AdminKPI
            label="Available right now"
            value={availableUnits.toLocaleString()}
            color="var(--a-sky)"
          />
          <AdminKPI
            label="Awarded total"
            value={awardedUnits.toLocaleString()}
            color="var(--a-amber)"
          />
        </div>

        <div className="split-aside">
          <AdminCard>
            <AdminCardHead label="Add card" title="Create catalog item" />
            <div className="card-pad">
              <AdminCardForm />
            </div>
          </AdminCard>
          <AdminCard>
            <AdminCardHead
              label="Assign to pack"
              title="Prize pool composition"
              actions={<button type="button" className="btn btn-sm">Switch pack</button>}
            />
            <div className="card-pad">
              <AdminPrizePoolForm campaigns={data.campaigns} cards={cards} />
            </div>
          </AdminCard>
        </div>

        <AdminCard>
          <AdminCardHead
            label="Cards catalog"
            title={`${cards.length} cards · tier-agnostic`}
            actions={
              <span className="chip">
                <AdminIcon name="filter" size={11} /> Filter
              </span>
            }
          />
          <div className="card-pad">
            <AdminCardCatalogPanel cards={cards} prizes={prizes} />
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Prize pool inventory"
            title="Per-pack assignments · tier set here"
          />
          <div className="card-pad">
            <AdminPrizeInventoryPanel cards={cards} prizes={prizes} />
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
