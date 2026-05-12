import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError, randomPackSchemaMissingResponse } from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  getCampaignPrizeReadiness,
  readinessErrorResponse,
} from "@/features/ynot/prize-readiness";

export const dynamic = "force-dynamic";

type LifecycleAction =
  | "submit_review"
  | "approve"
  | "reject"
  | "request_changes"
  | "publish"
  | "close"
  | "archive"
  | "delete";

type RandomLogicMode =
  | "pure_random"
  | "weighted_templates"
  | "inventory_gated";

const lifecycleActions: readonly LifecycleAction[] = [
  "submit_review",
  "approve",
  "reject",
  "request_changes",
  "publish",
  "close",
  "archive",
  "delete",
];
const randomLogicModes: readonly RandomLogicMode[] = [
  "pure_random",
  "weighted_templates",
  "inventory_gated",
];

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonRecord(value: Json): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function lifecycleAction(value: unknown): LifecycleAction | null {
  return lifecycleActions.includes(value as LifecycleAction)
    ? (value as LifecycleAction)
    : null;
}

function randomLogicMode(value: unknown): RandomLogicMode {
  return randomLogicModes.includes(value as RandomLogicMode)
    ? (value as RandomLogicMode)
    : "pure_random";
}

function isLocalMockCampaign(campaignId: string) {
  return (
    process.env.NODE_ENV !== "production" &&
    campaignId.startsWith("mock-owner-pack-")
  );
}

function actionRequiresOwner(action: LifecycleAction) {
  return (
    action === "approve" ||
    action === "reject" ||
    action === "request_changes" ||
    action === "publish" ||
    action === "delete"
  );
}

function randomLogicLabel(logicMode: RandomLogicMode) {
  if (logicMode === "weighted_templates") return "Weighted high tier";
  if (logicMode === "inventory_gated") return "30% sold unlock";
  return "Pure random";
}

function logicModeFromSnapshot(snapshot: unknown): RandomLogicMode | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const mode = (snapshot as Record<string, unknown>).mode;
  return randomLogicModes.includes(mode as RandomLogicMode)
    ? (mode as RandomLogicMode)
    : null;
}

function mockLifecycleResult(
  action: LifecycleAction,
  logicMode: RandomLogicMode,
) {
  if (action === "approve") {
    return {
      approvalStatus: "approved",
      status: "draft",
      visibility: "private",
      logicMode,
      message: `${randomLogicLabel(logicMode)} approved. The pack is still draft/private until publish.`,
    };
  }
  if (action === "reject") {
    return {
      approvalStatus: "rejected",
      status: "draft",
      visibility: "private",
      logicMode,
      message: "Mock pack rejected and held from publish.",
    };
  }
  if (action === "request_changes") {
    return {
      approvalStatus: "changes_requested",
      status: "draft",
      visibility: "private",
      logicMode,
      message: "Mock pack returned for changes.",
    };
  }
  if (action === "publish") {
    return {
      approvalStatus: "approved",
      status: "live",
      visibility: "public",
      logicMode,
      message: `${randomLogicLabel(logicMode)} mock pack published locally as live/public.`,
    };
  }
  if (action === "close") {
    return {
      approvalStatus: "approved",
      status: "closed",
      visibility: "public",
      logicMode,
      message: "Mock pack closed locally.",
    };
  }
  if (action === "archive") {
    return {
      approvalStatus: "approved",
      status: "archived",
      visibility: "private",
      logicMode,
      message: "Mock pack archived locally.",
    };
  }
  if (action === "delete") {
    return {
      approvalStatus: "approved",
      status: "archived",
      visibility: "private",
      logicMode,
      message: "Mock pack removed locally and kept in history.",
    };
  }
  return {
    approvalStatus: "pending_review",
    status: "draft",
    visibility: "private",
    logicMode,
    message: `${randomLogicLabel(logicMode)} submitted for owner review.`,
  };
}

function realLifecycleMessage(action: LifecycleAction, logicMode: RandomLogicMode) {
  if (action === "approve") {
    return `${randomLogicLabel(logicMode)} approved. The pack is still draft/private until publish.`;
  }
  if (action === "reject") return "Pack rejected and held from publish.";
  if (action === "request_changes") return "Pack returned for changes.";
  if (action === "publish") {
    return `${randomLogicLabel(logicMode)} pack published as live/public.`;
  }
  if (action === "close") return "Pack closed.";
  if (action === "archive") return "Pack archived privately.";
  if (action === "delete") return "Pack removed from active admin/public lists and kept archived for history.";
  return `${randomLogicLabel(logicMode)} submitted for owner review.`;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaign-lifecycle",
    { limit: 50, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as
    | {
        campaignId?: unknown;
        action?: unknown;
        note?: unknown;
        logicMode?: unknown;
      }
    | null;
  const campaignId = text(body?.campaignId, 80);
  const action = lifecycleAction(body?.action);
  const logicMode = randomLogicMode(body?.logicMode);
  const note = text(body?.note, 500);

  if (!campaignId || !action) {
    return Response.json(
      { error: "campaignId and valid action are required." },
      { status: 400 },
    );
  }
  if (actionRequiresOwner(action) && admin.adminRole !== "owner") {
    return Response.json(
      { error: "Only an owner can approve, reject, request changes, publish, or delete a pack." },
      { status: 403 },
    );
  }
  if (isLocalMockCampaign(campaignId)) {
    return Response.json({
      ok: true,
      campaignId,
      action,
      note: note || null,
      mock: true,
      ...mockLifecycleResult(action, logicMode),
    });
  }

  const supabase = createServiceSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("draw_rounds")
    .select("id,status,visibility,approval_status,logic_snapshot,test_metadata")
    .eq("id", campaignId)
    .single();
  if (currentError) {
    if (isMissingColumnError(currentError)) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json({ error: currentError.message }, { status: 409 });
  }
  if (action === "publish" && current.approval_status !== "approved") {
    return Response.json(
      { error: "Owner approval is required before publishing live/public." },
      { status: 409 },
    );
  }
  if (action === "submit_review" || action === "approve" || action === "publish") {
    const readiness = await getCampaignPrizeReadiness(supabase, campaignId);
    if (!readiness.ready) return readinessErrorResponse(readiness);
  }

  const now = new Date().toISOString();
  const logicSnapshot = {
    ...jsonRecord(current.logic_snapshot),
    mode: logicMode,
    label: randomLogicLabel(logicMode),
    selectedByAdminId: admin.adminId,
    selectedAt: now,
  };
  const patch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {};

  if (action === "submit_review") {
    patch.logic_snapshot = logicSnapshot;
    patch.approval_status = "pending_review";
    patch.approval_requested_by = admin.adminId;
    patch.approval_requested_at = now;
    patch.approval_notes = note || null;
    patch.status = "draft";
    patch.visibility = "private";
  }
  if (action === "approve") {
    patch.logic_snapshot = logicSnapshot;
    patch.approval_status = "approved";
    patch.approved_by = admin.adminId;
    patch.approved_at = now;
    patch.rejected_by = null;
    patch.rejected_at = null;
    patch.approval_notes = note || null;
    patch.status = "draft";
    patch.visibility = "private";
  }
  if (action === "reject") {
    patch.approval_status = "rejected";
    patch.rejected_by = admin.adminId;
    patch.rejected_at = now;
    patch.approval_notes = note || null;
    patch.status = "draft";
    patch.visibility = "private";
  }
  if (action === "request_changes") {
    patch.approval_status = "changes_requested";
    patch.rejected_by = admin.adminId;
    patch.rejected_at = now;
    patch.approval_notes = note || null;
    patch.status = "draft";
    patch.visibility = "private";
  }
  if (action === "publish") {
    patch.approval_status = "approved";
    patch.status = "live";
    patch.visibility = "public";
  }
  if (action === "close") {
    patch.status = "closed";
    patch.visibility = current.visibility === "public" ? "public" : "private";
  }
  if (action === "archive") {
    patch.status = "archived";
    patch.visibility = "private";
  }
  if (action === "delete") {
    patch.status = "archived";
    patch.visibility = "private";
    patch.test_metadata = {
      ...jsonRecord(current.test_metadata),
      ownerRemovedAt: now,
      ownerRemovedByAdminId: admin.adminId,
      ownerRemovedNote: note || null,
    };
  }

  const responseLogicMode =
    action === "publish"
      ? logicModeFromSnapshot(current.logic_snapshot) ?? logicMode
      : logicMode;

  const { data: updated, error: updateError } = await supabase
    .from("draw_rounds")
    .update(patch)
    .eq("id", campaignId)
    .select("status,visibility,approval_status")
    .single();
  if (updateError) {
    if (isMissingColumnError(updateError)) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json({ error: updateError.message }, { status: 409 });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: `campaign_${action}`,
    draw_round_id: campaignId,
    metadata: { action, logicMode: responseLogicMode, note: note || null },
  });

  return Response.json({
    ok: true,
    campaignId,
    action,
    note: note || null,
    mock: false,
    approvalStatus: updated.approval_status,
    status: updated.status,
    visibility: updated.visibility,
    logicMode: responseLogicMode,
    message: realLifecycleMessage(action, responseLogicMode),
  });
}
