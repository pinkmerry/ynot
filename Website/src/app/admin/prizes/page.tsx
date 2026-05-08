import { AdminCardForm, AdminPrizePoolForm } from "@/features/ynot/client";
import { AdminGate, PageHeader, YnotShell } from "@/features/ynot/components";
import { getAdminCards, getAdminPrizePool, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminPrizesPage() {
  const [data, cards, prizes] = await Promise.all([getYnotDashboardData(), getAdminCards(), getAdminPrizePool()]);
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin prizes" title="Card and prize catalog" description="Create cards, then assign them into campaign prize pools so website gacha opens can award real collection items." /><div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><AdminCardForm /><AdminPrizePoolForm campaigns={data.campaigns} cards={cards} prizes={prizes} /><section className="soft-card rounded-[28px] p-5 xl:col-span-2"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <article key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="font-black">{card.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{card.series} · {card.grade} · {card.code ?? "no code"}</p></article>)}</div>{!cards.length && <p className="text-sm text-[var(--muted)]">No cards loaded yet.</p>}</section></div></YnotShell></AdminGate>;
}
