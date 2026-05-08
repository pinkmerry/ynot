import { AdminGate, PageHeader, StatusBadge, YnotShell } from "@/features/ynot/components";
import { getAdminAuditEvents, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const [data, events] = await Promise.all([getYnotDashboardData(), getAdminAuditEvents()]);
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin audit" title="Operational event log" description="Audit rows provide evidence for auth linking, top-up review, gacha opens, exchange, shipping, and admin changes." /><section className="soft-card rounded-[28px] p-5"><div className="grid gap-3">{events.map((event) => <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><p className="font-black">{event.event_type}</p><StatusBadge status={new Date(event.created_at).toLocaleString()} /></div><pre className="mt-3 max-h-36 overflow-auto rounded-xl bg-black/25 p-3 text-xs text-[var(--muted)]">{JSON.stringify(event.metadata, null, 2)}</pre></article>)}</div>{!events.length && <p className="text-sm text-[var(--muted)]">No audit events loaded.</p>}</section></YnotShell></AdminGate>;
}
