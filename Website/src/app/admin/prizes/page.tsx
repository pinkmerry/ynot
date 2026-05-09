import { AdminCardForm, AdminPrizePoolForm } from "@/features/ynot/client";
import { AdminSectionShell, PageHeader } from "@/features/ynot/components";
import {
  getAdminCards,
  getAdminPrizePool,
  getYnotDashboardData,
} from "@/features/ynot/data";

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
        title="Card and prize catalog"
        description="Create cards, then assign them into campaign prize pools so website gacha opens can award real collection items."
      />
      <div className="admin-page-grid admin-page-grid-studio">
        <AdminCardForm />
        <AdminPrizePoolForm
          campaigns={data.campaigns}
          cards={cards}
          prizes={prizes}
        />
        <section className="admin-panel admin-full-span soft-card">
          <div className="admin-panel-head">
            <div>
              <p className="section-label">Card catalog</p>
              <h3 className="title-m">Cards ready for prize pools</h3>
            </div>
            <span className="status-pill">{cards.length} cards</span>
          </div>
          <div className="admin-card-catalog-grid">
            {cards.map((card) => (
              <article key={card.id} className="admin-list-card">
                <p className="font-black">{card.name}</p>
                <p className="admin-muted-line">
                  {card.series} · {card.grade} · {card.code ?? "no code"}
                </p>
              </article>
            ))}
          </div>
          {!cards.length && (
            <p className="admin-empty-note">No cards loaded yet.</p>
          )}
        </section>
      </div>
    </AdminSectionShell>
  );
}
