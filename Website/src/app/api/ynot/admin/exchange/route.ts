import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { exchangeOrderId?: unknown; action?: unknown; note?: unknown; coinValue?: unknown } | null;
  const exchangeOrderId = typeof body?.exchangeOrderId === "string" ? body.exchangeOrderId : "";
  const action = body?.action === "approve" || body?.action === "reject" ? body.action : null;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const coinValue = Number(body?.coinValue ?? 0);
  if (!exchangeOrderId || !action) return Response.json({ error: "exchangeOrderId and action are required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();

  const { error } = action === "approve"
    ? await supabase.rpc("approve_exchange_order", {
        p_exchange_order_id: exchangeOrderId,
        p_admin_id: admin.adminId,
        p_approved_coin_value: Number.isFinite(coinValue) && coinValue > 0 ? coinValue : null,
        p_admin_note: note,
      })
    : await supabase.rpc("reject_exchange_order", {
        p_exchange_order_id: exchangeOrderId,
        p_admin_id: admin.adminId,
        p_admin_note: note,
      });

  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true });
}
