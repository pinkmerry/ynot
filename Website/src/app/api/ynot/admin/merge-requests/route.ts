import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MergeBody = {
  mergeRequestId?: unknown;
  action?: unknown;
  note?: unknown;
};

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await request.json().catch(() => null) as MergeBody | null;
  const mergeRequestId = text(body?.mergeRequestId, 80);
  const action = body?.action === "approve" || body?.action === "reject" ? body.action : null;
  const note = text(body?.note);
  if (!mergeRequestId || !action) return Response.json({ error: "mergeRequestId and action are required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = action === "approve"
    ? await supabase.rpc("complete_account_merge_request", {
        p_merge_request_id: mergeRequestId,
        p_admin_id: admin.adminId,
        p_admin_note: note || null,
      })
    : await supabase.rpc("reject_account_merge_request", {
        p_merge_request_id: mergeRequestId,
        p_admin_id: admin.adminId,
        p_admin_note: note || null,
      });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true });
}
