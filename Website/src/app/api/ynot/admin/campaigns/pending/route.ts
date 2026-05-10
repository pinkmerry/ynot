import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { authErrorResponse, requireOwner } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    await requireOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("draw_rounds")
    .select(
      "id,slug,title_th,title_en,series,mode,spin_mode,spin_config,price_thb,cost_coins,total_slots,status,submitted_for_approval_at,submitted_by,created_by,created_at",
    )
    .eq("status", "pending_approval")
    .order("submitted_for_approval_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ campaigns: data ?? [] });
}
