import { AdminCardForm, AdminPrizePoolForm } from "@/features/ynot/client";
import { AdminSectionShell, PageHeader } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardData,
} from "@/features/ynot/data";
import { prizeCategoryLabel } from "@/features/ynot/prize-category";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([
    getYnotDashboardData(),
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
          prizes={prizes}
          viewerRole={data.viewer.adminRole}
        />
        <section className="admin-panel admin-full-span soft-card">
          <div className="admin-panel-head">
            <div>
              <p className="section-label">Prize catalog</p>
              <h3 className="title-m">Prize items ready for pools</h3>
            </div>
            <span className="status-pill">{cards.length} items</span>
          </div>
          <div className="admin-card-catalog-grid">
            {cards.map((card) => (
              <article key={card.id} className="admin-list-card">
                <p className="font-black">{card.name}</p>
                <p className="admin-muted-line">
                  {card.series} · {card.grade} · {card.code ?? "no code"} ·{" "}
                  {prizeCategoryLabel(card.prizeCategory)}
                </p>
              </article>
            ))}
          </div>
          {!cards.length && (
            <p className="admin-empty-note">No prize items loaded yet.</p>
          )}
        </section>
      </div>
    </AdminSectionShell>
  );
}
