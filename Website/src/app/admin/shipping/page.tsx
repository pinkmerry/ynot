import { AdminShippingActions } from "@/features/ynot/client";
import { AdminGate, PageHeader, StatusBadge, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin shipping" title="Fulfillment workflow" description="Update packing/shipped/delivered status and tracking details for submitted shipping requests." /><section className="soft-card rounded-[28px] p-5"><div className="grid gap-3">{data.shipping.length ? data.shipping.map((request) => <div key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><p className="font-mono font-bold">{request.publicCode}</p><StatusBadge status={request.status} /></div><p className="mt-2 text-sm text-[var(--muted)]">Tracking: {request.trackingProvider ?? "-"} {request.trackingNumber ?? ""}</p><AdminShippingActions request={request} /></div>) : <p className="text-sm text-[var(--muted)]">No shipping requests.</p>}</div></section></YnotShell></AdminGate>;
}
