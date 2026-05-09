import { getTopUps } from "@/features/ynot/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  return Response.json({ topUps: await getTopUps(undefined, true) });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:top-ups", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { topUpId?: unknown; action?: unknown; note?: unknown } | null;
  const topUpId = typeof body?.topUpId === "string" ? body.topUpId : "";
  const action = body?.action === "approve" || body?.action === "reject" ? body.action : null;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  if (!topUpId || !action) return Response.json({ error: "topUpId and action are required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = action === "approve"
    ? await supabase.rpc("approve_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note })
    : await supabase.rpc("reject_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ result: data });
}
