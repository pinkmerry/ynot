import { getTopUps } from "@/features/ynot/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { emitSecurityAlert } from "@/lib/security/alerts";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

// Approvals over this THB threshold trigger a security alert. Tune to whatever
// "unusual for our user base" looks like.
const LARGE_TOP_UP_THB_THRESHOLD = 5000;
const approvableSlipStatuses = new Set(["valid", "manual_review"]);

async function approvalBlocker(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  topUpId: string,
) {
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
    .select("id,status,public_code")
    .eq("id", topUpId)
    .maybeSingle();
  if (topUpError) throw topUpError;
  if (!topUp) return "Top-up request was not found.";
  if (topUp.status === "approved") return null;
  if (topUp.status !== "pending_review" && topUp.status !== "pending_slip") {
    return "Only pending top-up requests can be approved.";
  }

  const { data: slip, error: slipError } = await supabase
    .from("payment_slips")
    .select("id,verification_status,duplicate_of_slip_id,provider_message")
    .eq("top_up_request_id", topUp.id)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (slipError) throw slipError;
  if (!slip) return "Cannot approve a top-up without an uploaded slip.";
  if (slip.duplicate_of_slip_id || !approvableSlipStatuses.has(slip.verification_status)) {
    const status = slip.verification_status.replace(/_/g, " ");
    return `Slip check is ${status}; reject it or ask the customer to upload a fresh slip.`;
  }

  return null;
}

export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  return Response.json({ topUps: await getTopUps(undefined, true) });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
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
  if (action === "approve") {
    const blocker = await approvalBlocker(supabase, topUpId);
    if (blocker) return Response.json({ error: blocker }, { status: 409 });
  }
  const { data, error } = action === "approve"
    ? await supabase.rpc("approve_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note })
    : await supabase.rpc("reject_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note });
  if (error) return Response.json({ error: error.message }, { status: 409 });

  if (action === "approve") {
    const { data: approved } = await supabase
      .from("top_up_requests")
      .select("amount_thb,profile_id,public_code")
      .eq("id", topUpId)
      .maybeSingle();
    if (approved && Number(approved.amount_thb ?? 0) >= LARGE_TOP_UP_THB_THRESHOLD) {
      emitSecurityAlert({
        event: "top_up_approved_large",
        actor: {
          profileId: admin.profileId,
          adminId: admin.adminId,
          role: admin.adminRole,
        },
        target: { profileId: approved.profile_id },
        details: {
          publicCode: approved.public_code,
          amountThb: approved.amount_thb,
          threshold: LARGE_TOP_UP_THB_THRESHOLD,
        },
      });
    }
  }

  return Response.json({ result: data });
}
