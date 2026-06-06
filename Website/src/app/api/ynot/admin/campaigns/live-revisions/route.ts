import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

type LiveRevisionAction = "approve" | "reject" | "publish";

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function actionValue(value: unknown): LiveRevisionAction | null {
  return value === "approve" || value === "reject" || value === "publish"
    ? value
    : null;
}

function liveRevisionErrorMessage(message?: string) {
  if (!message) return "Live revision could not be updated.";
  if (message.includes("live_revision_owner_required"))
    return "Only the owner can approve or publish live pack revisions.";
  if (message.includes("live_revision_must_be_approved"))
    return "Approve this live revision before publishing.";
  if (message.includes("live_revision_base_changed"))
    return "The live pack changed after this revision was created. Save the edit again before publishing.";
  if (message.includes("campaign_not_live_editable"))
    return "This pack is not live anymore.";
  return message;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin || admin.adminRole !== "owner") {
    return adminErrorResponse(
      "OWNER_ACCESS_REQUIRED",
      "Only the owner can approve or publish live pack revisions.",
      403,
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaign-live-revisions",
    { limit: 60, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    revisionId?: unknown;
    action?: unknown;
    note?: unknown;
  } | null;
  const revisionId = text(body?.revisionId, 80);
  const action = actionValue(body?.action);
  const note = text(body?.note);
  if (!revisionId || !action) {
    return adminErrorResponse(
      "LIVE_REVISION_ACTION_INVALID",
      "Revision id and action are required.",
      400,
    );
  }

  const supabase = createServiceSupabaseClient();
  if (action === "publish") {
    const { data, error } = await supabase.rpc(
      "publish_live_campaign_revision",
      {
        p_revision_id: revisionId,
        p_owner_admin_id: admin.adminId,
        p_note: note || null,
      },
    );
    if (error) {
      return adminErrorResponse(
        error.code ?? "LIVE_REVISION_PUBLISH_FAILED",
        liveRevisionErrorMessage(error.message),
        409,
        { detail: error.details ?? null, hint: error.hint ?? null },
      );
    }
    revalidateTag("campaigns", "max");
    return Response.json({ ok: true, result: data, status: "published" });
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";
  const { data, error } = await supabase
    .from("draw_round_live_revisions")
    .update({
      status: nextStatus,
      reviewed_by_admin_id: admin.adminId,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq("id", revisionId)
    .in("status", ["pending_review", "approved"])
    .select("id,draw_round_id,status")
    .maybeSingle();
  if (error || !data) {
    return adminErrorResponse(
      error?.code ?? "LIVE_REVISION_UPDATE_FAILED",
      error ? liveRevisionErrorMessage(error.message) : "Live revision was not found.",
      409,
      error ? { detail: error.details ?? null, hint: error.hint ?? null } : undefined,
    );
  }
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: `campaign_live_revision_${nextStatus}`,
    draw_round_id: data.draw_round_id,
    metadata: { revisionId },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, revision: data });
}
