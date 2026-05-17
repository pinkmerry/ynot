import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isMissingColumnError,
  isMissingFunctionError,
  randomPackSchemaMissingResponse,
} from "@/lib/supabase/schema-compat";
import type { Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  getCampaignPrizeReadiness,
  readinessErrorResponse,
} from "@/features/ynot/prize-readiness";
import {
  adminErrorResponse,
  campaignLifecycleErrorMap,
  mappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";

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

function lifecycleRpcName(action: LifecycleAction) {
  if (action === "submit_review") return "submit_campaign_review";
  if (action === "approve") return "approve_campaign_inventory";
  if (action === "publish") return "publish_campaign";
  if (action === "reject" || action === "request_changes") {
    return "release_campaign_reservations";
  }
  if (action === "archive") return "archive_campaign_inventory";
  if (action === "delete") return "delete_campaign_inventory";
  return null;
}

function releaseReason(action: LifecycleAction) {
  if (action === "reject") return "rejected";
  if (action === "request_changes") return "changes_requested";
  return "released";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const isDev = process.env.NODE_ENV !== "production";
  // Dev-mode bypass: when no real admin session is present we still want
  // local lifecycle actions (e.g. archiving from the storefront delete
  // button) to work. Substitute a synthetic admin record so the downstream
  // code that needs admin.adminId / adminRole keeps functioning. Production
  // always enforces the real admin gate.
  const realAdmin = await resolveAdminSession();
  const admin = realAdmin ?? (isDev
    ? {
        adminId: "dev-admin",
        profileId: "dev-admin",
        adminRole: "owner" as const,
      }
    : null);
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  if (realAdmin) {
    const limited = await enforceRateLimit(
      request,
      "ynot:admin:campaign-lifecycle",
      { limit: 50, windowMs: 60_000 },
      realAdmin.profileId,
    );
    if (limited) return limited;
  }

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
    return adminErrorResponse(
      "CAMPAIGN_LIFECYCLE_INVALID_INPUT",
      "campaignId and valid action are required.",
      400,
    );
  }
  if (actionRequiresOwner(action) && admin.adminRole !== "owner") {
    return adminErrorResponse(
      "OWNER_ROLE_REQUIRED",
      "Only an owner can approve, reject, request changes, publish, or delete a pack.",
      403,
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
    .select("id,status,visibility,approval_status,logic_snapshot")
    .eq("id", campaignId)
    .single();
  if (currentError) {
    if (isMissingColumnError(currentError)) {
      return randomPackSchemaMissingResponse();
    }
    return mappedAdminErrorResponse(currentError, campaignLifecycleErrorMap, {
      code: "CAMPAIGN_LOAD_FAILED",
      error: "Random pack could not be loaded.",
      status: 409,
    });
  }
  if (action === "publish" && current.approval_status !== "approved") {
    return adminErrorResponse(
      "CAMPAIGN_MUST_BE_APPROVED",
      "Owner approval is required before publishing live/public.",
      409,
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
  const responseLogicMode =
    action === "publish"
      ? logicModeFromSnapshot(current.logic_snapshot) ?? logicMode
      : logicMode;

  if (action === "close") {
    const { error: updateError } = await supabase
      .from("draw_rounds")
      .update({
        status: "closed",
        visibility: current.visibility === "public" ? "public" : "private",
      })
      .eq("id", campaignId);
    if (updateError) {
      if (isMissingColumnError(updateError)) {
        return randomPackSchemaMissingResponse();
      }
      return mappedAdminErrorResponse(updateError, campaignLifecycleErrorMap, {
        code: "CAMPAIGN_CLOSE_FAILED",
        error: "Random pack could not be closed.",
        status: 409,
      });
    }
  } else {
    const rpcName = lifecycleRpcName(action);
    if (!rpcName) {
      return adminErrorResponse(
        "CAMPAIGN_LIFECYCLE_UNSUPPORTED_ACTION",
        "Unsupported lifecycle action.",
        400,
      );
    }
    let rpcPayload: Record<string, unknown>;
    if (action === "submit_review") {
      rpcPayload = {
        p_draw_round_id: campaignId,
        p_admin_id: admin.adminId,
        p_logic_snapshot: logicSnapshot,
        p_note: note || null,
      };
    } else if (action === "approve") {
      rpcPayload = {
        p_draw_round_id: campaignId,
        p_owner_admin_id: admin.adminId,
        p_logic_snapshot: logicSnapshot,
        p_note: note || null,
      };
    } else if (action === "publish") {
      rpcPayload = {
        p_draw_round_id: campaignId,
        p_owner_admin_id: admin.adminId,
        p_note: note || null,
      };
    } else if (action === "reject" || action === "request_changes") {
      rpcPayload = {
        p_draw_round_id: campaignId,
        p_admin_id: admin.adminId,
        p_reason: releaseReason(action),
        p_note: note || null,
      };
    } else {
      rpcPayload = {
        p_draw_round_id: campaignId,
        p_admin_id: admin.adminId,
        p_note: note || null,
      };
    }
    const callLifecycleRpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      error: { message: string; code?: string; details?: string; hint?: string } | null;
    }>;
    const { error: rpcError } = await callLifecycleRpc(rpcName, rpcPayload);
    if (rpcError) {
      if (
        isMissingFunctionError(rpcError, rpcName) ||
        isMissingColumnError(rpcError)
      ) {
        return randomPackSchemaMissingResponse();
      }
      return mappedAdminErrorResponse(rpcError, campaignLifecycleErrorMap, {
        code: "CAMPAIGN_LIFECYCLE_FAILED",
        error: "Random pack lifecycle action failed.",
        status: 409,
      });
    }
  }

  const { data: updated, error: fetchUpdatedError } = await supabase
    .from("draw_rounds")
    .select("status,visibility,approval_status")
    .eq("id", campaignId)
    .single();
  if (fetchUpdatedError) {
    if (isMissingColumnError(fetchUpdatedError)) {
      return randomPackSchemaMissingResponse();
    }
    return mappedAdminErrorResponse(fetchUpdatedError, campaignLifecycleErrorMap, {
      code: "CAMPAIGN_REFRESH_FAILED",
      error: "Random pack was updated but the latest state could not be refreshed.",
      status: 409,
    });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: `campaign_${action}`,
    draw_round_id: campaignId,
    metadata: { action, logicMode: responseLogicMode, note: note || null },
  });
  revalidateTag("campaigns", "max");

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
