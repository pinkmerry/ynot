import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { CampaignStatusBadge } from "./CampaignWorkflowActions";

type PendingRow = {
  id: string;
  slug: string;
  title_th: string;
  title_en: string;
  spin_mode: string | null;
  submitted_for_approval_at: string | null;
  submitted_by: string | null;
  series: string;
  cost_coins: number | null;
  total_slots: number | null;
};

export async function PendingApprovalQueue() {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("draw_rounds")
    .select(
      "id,slug,title_th,title_en,series,cost_coins,total_slots,spin_mode,submitted_for_approval_at,submitted_by",
    )
    .eq("status", "pending_approval")
    .order("submitted_for_approval_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
        โหลด pending queue ไม่สำเร็จ: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as PendingRow[];
  if (rows.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
        ยังไม่มีแคมเปญที่รออนุมัติ
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/admin/campaigns?focus=${row.id}`}
          className="block rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 transition hover:border-amber-400"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                {row.title_th || row.slug}
                <CampaignStatusBadge status="pending_approval" />
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {row.series} · {row.cost_coins ?? "?"} coins · {row.total_slots ?? "?"} slots ·
                spin: {row.spin_mode ?? "pure_random"}
              </div>
            </div>
            <div className="text-right text-[11px] text-zinc-500">
              {row.submitted_for_approval_at
                ? new Date(row.submitted_for_approval_at).toLocaleString("th-TH")
                : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
