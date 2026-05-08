import { AdminExchangeActions } from "@/features/ynot/client";
import { AdminGate, PageHeader, StatusBadge, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminExchangePage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin exchange" title="Review exchange requests" description="Approve or reject card exchange requests. The next RPC hardening slice will credit wallet ledger on approval in the same transaction." /><section className="soft-card rounded-[28px] p-5"><div className="grid gap-3">{data.exchanges.length ? data.exchanges.map((order) => <div key={order.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><p className="font-mono font-bold">{order.publicCode}</p><StatusBadge status={order.status} /></div><p className="mt-2 text-sm text-[var(--muted)]">Requested value {order.requestedCoinValue.toLocaleString()} coins</p><AdminExchangeActions order={order} /></div>) : <p className="text-sm text-[var(--muted)]">No exchange requests.</p>}</div></section></YnotShell></AdminGate>;
}
