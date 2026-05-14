import {
  AdminCardCatalogPanel,
  AdminCardForm,
  AdminPrizeInventoryPanel,
  AdminPrizePoolForm,
} from "@/features/ynot/client";
import { AdminSectionShell, PageHeader } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardSlice,
} from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardSlice({ campaigns: true }),
    getAdminCards(),
    getAdminPrizePool(),
  ]);

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/prizes">
      <PageHeader
        eyebrow="Admin prizes"
        title="Prize catalog"
        description="Create PSA10 cards, sealed products, electronics, and other prize items, then assign them into campaign prize pools."
      />
      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCardForm />
        <AdminPrizePoolForm
          campaigns={data.campaigns}
          cards={cards}
        />
      </div>
      <AdminCardCatalogPanel cards={cards} prizes={prizes} />
      <AdminPrizeInventoryPanel cards={cards} prizes={prizes} />
    </AdminSectionShell>
  );
}
