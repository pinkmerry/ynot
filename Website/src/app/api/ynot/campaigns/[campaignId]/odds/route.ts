import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { campaignId } = await context.params;
  if (!campaignId) return Response.json({ error: "Campaign is required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_draw_round_public_odds", { p_draw_round_id: campaignId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ odds: data ?? { available: false } });
}
