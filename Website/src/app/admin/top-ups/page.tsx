import { AdminTopUpActions } from "@/features/ynot/client";
import { AdminGate, PageHeader, StatusBadge, TopUpTable, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminTopUpsPage() {
  const data = await getYnotDashboardData();
  const pending = data.adminTopUps.filter((topUp) => topUp.status === "pending_review" || topUp.status === "pending_slip");
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin top-ups" title="Manual payment confirmation" description="Review bank/QR slip uploads, approve or reject manually, and credit wallet coins exactly once through the database RPC." /><section className="soft-card rounded-[28px] p-5"><h3 className="text-lg font-black">Pending review</h3><div className="mt-4 grid gap-3">{pending.length ? pending.map((topUp) => <div key={topUp.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><p className="font-mono font-bold">{topUp.publicCode}</p><StatusBadge status={topUp.status} /></div><p className="mt-2 text-sm text-[var(--muted)]">฿{topUp.amountThb.toLocaleString()} · {topUp.coinAmount.toLocaleString()} coins · profile {topUp.profileId.slice(0, 8)}</p><AdminTopUpActions topUpId={topUp.id} /></div>) : <p className="text-sm text-[var(--muted)]">No pending top-ups.</p>}</div></section><section className="soft-card rounded-[28px] p-5"><h3 className="text-lg font-black">All top-ups</h3><TopUpTable topUps={data.adminTopUps} admin /></section></YnotShell></AdminGate>;
}
