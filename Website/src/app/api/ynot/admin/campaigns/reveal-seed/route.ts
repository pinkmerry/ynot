import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:reveal-seed", { limit: 20, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { campaignId?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("reveal_draw_round_seed", {
    p_draw_round_id: campaignId,
    p_admin_id: admin.adminId,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true, result: data });
}
