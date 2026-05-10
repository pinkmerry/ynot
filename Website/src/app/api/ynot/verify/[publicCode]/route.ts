import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ publicCode: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const { publicCode } = await context.params;
  if (!publicCode) return Response.json({ error: "publicCode is required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_gacha_open_verification", { p_public_code: publicCode });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ verification: data ?? { available: false } });
}
