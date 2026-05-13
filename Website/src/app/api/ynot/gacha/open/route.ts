import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(request, "ynot:gacha:open", { limit: 30, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { campaignId?: unknown; quantity?: unknown; idempotencyKey?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  const quantity = Number(body?.quantity ?? 1);
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID();
  if (!campaignId) return Response.json({ error: "Campaign is required." }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("open_gacha_campaign", { p_profile_id: session.profileId, p_draw_round_id: campaignId, p_quantity: quantity, p_idempotency_key: idempotencyKey });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ result: data });
}
