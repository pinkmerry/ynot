import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { authErrorResponse, requireAdminOrOwner } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    await requireAdminOrOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const { id } = await params;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_approvals")
    .select("id,action,actor_admin_id,actor_role,from_status,to_status,notes,payload_diff,created_at")
    .eq("draw_round_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data ?? [] });
}
