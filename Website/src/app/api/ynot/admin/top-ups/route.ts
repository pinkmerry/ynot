import { getTopUps } from "@/features/ynot/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { emitSecurityAlert } from "@/lib/security/alerts";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

// Approvals at or above this THB threshold trigger a security alert. Set at
// 1000 THB so every Collector and Whale approval (the two highest packages
// at 1000 and 3000 THB respectively) lands in the security inbox. The
// previous value of 5000 was above the maximum legitimate package and the
// alert never fired.
const LARGE_TOP_UP_THB_THRESHOLD = 1000;

// Per-profile velocity: when the SAME profile gets approved this many
// top-ups (or more) inside the rolling window, fire a separate alert.
// The DB-level approve_top_up_request RPC blocks the explicit double-credit
// attack (same slip image, twice), but a determined attacker can submit
// multiple DIFFERENT slips for the same payment by re-photographing the
// receipt — the per-slip dedup misses that. This catches it in real time.
// Threshold = "this is the 2nd or later approval in the window".
const PROFILE_VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROFILE_VELOCITY_COUNT_THRESHOLD = 2;
const approvableSlipStatuses = new Set(["valid", "manual_review"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function topUpReviewErrorMessage(message?: string) {
  if (!message) return "Could not review this top-up request.";
  if (message.includes("admin_access_required")) {
    return "Admin access is required.";
  }
  if (message.includes("top_up_not_found")) {
    return "Top-up request was not found.";
  }
  if (message.includes("top_up_not_reviewable")) {
    return "Only pending top-up requests can be reviewed.";
  }
  if (message.includes("top_up_slip_required")) {
    return "Cannot approve a top-up without an uploaded slip.";
  }
  if (message.includes("top_up_slip_not_approvable")) {
    return "Slip check is not approvable; reject it or ask the customer to upload a fresh slip.";
  }
  if (message.includes("approved_top_up_cannot_be_rejected")) {
    return "Approved top-ups cannot be rejected.";
  }
  return "Could not review this top-up request.";
}

type ApprovalBlock =
  | null
  | { message: string; alert?: never }
  | {
      // Suspicious block: admin is trying to push through a slip that the
      // upload pipeline already flagged as duplicate/fraud/mismatch. The
      // caller should page the security inbox.
      message: string;
      alert: { slipStatus: string; slipId: string; duplicateOfSlipId: string | null };
    };

async function approvalBlocker(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  topUpId: string,
): Promise<ApprovalBlock> {
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
    .select("id,status,public_code")
    .eq("id", topUpId)
    .maybeSingle();
  if (topUpError) throw topUpError;
  if (!topUp) return { message: "Top-up request was not found." };
  if (topUp.status === "approved") return null;
  if (topUp.status !== "pending_review" && topUp.status !== "pending_slip") {
    return { message: "Only pending top-up requests can be approved." };
  }

  const { data: slip, error: slipError } = await supabase
    .from("payment_slips")
    .select("id,verification_status,duplicate_of_slip_id,provider_message")
    .eq("top_up_request_id", topUp.id)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (slipError) throw slipError;
  if (!slip) return { message: "Cannot approve a top-up without an uploaded slip." };
  if (slip.duplicate_of_slip_id || !approvableSlipStatuses.has(slip.verification_status)) {
    const status = slip.verification_status.replace(/_/g, " ");
    return {
      message: `Slip check is ${status}; reject it or ask the customer to upload a fresh slip.`,
      alert: {
        slipStatus: slip.verification_status,
        slipId: slip.id,
        duplicateOfSlipId: slip.duplicate_of_slip_id,
      },
    };
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
  if (!UUID_RE.test(topUpId)) {
    return Response.json({ error: "Invalid top-up request." }, { status: 400 });
  }
  const supabase = createServiceSupabaseClient();
  if (action === "approve") {
    const blocker = await approvalBlocker(supabase, topUpId);
    if (blocker) {
      if (blocker.alert) {
        emitSecurityAlert({
          event: "top_up_approval_blocked",
          actor: {
            profileId: admin.profileId,
            adminId: admin.adminId,
            role: admin.adminRole,
          },
          details: {
            topUpId,
            reason: "slip_check_not_approvable",
            ...blocker.alert,
          },
        });
      }
      return Response.json({ error: blocker.message }, { status: 409 });
    }
  }
  const { data, error } = action === "approve"
    ? await supabase.rpc("approve_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note })
    : await supabase.rpc("reject_top_up_request", { p_top_up_request_id: topUpId, p_admin_id: admin.adminId, p_admin_note: note });
  if (error) {
    // RPC-level fallback: the JS approvalBlocker should catch slip issues
    // first, but if a race or schema drift slips past, the DB will still
    // raise. Page the security inbox on the same condition.
    if (action === "approve" && /top_up_slip_not_approvable|top_up_slip_required/.test(error.message ?? "")) {
      emitSecurityAlert({
        event: "top_up_approval_blocked",
        actor: {
          profileId: admin.profileId,
          adminId: admin.adminId,
          role: admin.adminRole,
        },
        details: {
          topUpId,
          reason: "rpc_raised",
          rpcError: error.message,
        },
      });
    }
    return Response.json({ error: topUpReviewErrorMessage(error.message) }, { status: 409 });
  }

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

    // Velocity alert: count top-up credits for the SAME profile in the
    // rolling window (including this one we just approved). If the count
    // hits the threshold, page the security inbox. This catches the
    // re-photographed-slip variant of the F1 attack, where the slip-hash
    // dedup misses because each upload has a different file_sha256.
    if (approved?.profile_id) {
      const windowStart = new Date(
        Date.now() - PROFILE_VELOCITY_WINDOW_MS,
      ).toISOString();
      const { count: recentApprovals, error: velocityError } = await supabase
        .from("coin_ledger")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", approved.profile_id)
        .eq("entry_type", "top_up")
        .gte("created_at", windowStart);
      if (velocityError) {
        console.warn(
          "top_up_velocity_lookup_failed",
          velocityError.message ?? "unknown",
        );
      } else if (
        typeof recentApprovals === "number" &&
        recentApprovals >= PROFILE_VELOCITY_COUNT_THRESHOLD
      ) {
        emitSecurityAlert({
          event: "top_up_velocity_unusual",
          actor: {
            profileId: admin.profileId,
            adminId: admin.adminId,
            role: admin.adminRole,
          },
          target: { profileId: approved.profile_id },
          details: {
            publicCode: approved.public_code,
            amountThb: approved.amount_thb,
            totalApprovalsLast24h: recentApprovals,
            windowHours: PROFILE_VELOCITY_WINDOW_MS / (60 * 60 * 1000),
            threshold: PROFILE_VELOCITY_COUNT_THRESHOLD,
          },
        });
      }
    }
  }

  return Response.json({
    result: {
      status: action === "approve" ? "approved" : "rejected",
      replayed:
        data && typeof data === "object" && "replayed" in data
          ? (data as { replayed?: unknown }).replayed === true
          : false,
    },
  });
}
