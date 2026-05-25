import { cookies } from "next/headers";
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
  adminErrorResponse,
  campaignLifecycleErrorMap,
  mappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";
import {
  DEMO_PACK_ARCHIVED_COOKIE,
  parseDemoPackArchivedCookie,
} from "@/features/ynot/demo-pack-order";

export const dynamic = "force-dynamic";

type LifecycleAction =
  | "submit_review"
  | "save_logic"
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

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

type OwnerPrizeOddsOverride = {
  id: string;
  weight?: number;
  unlockAtSoldPct?: number;
};

const lifecycleActions: readonly LifecycleAction[] = [
  "submit_review",
  "save_logic",
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

function boundedNumber(value: unknown, min: number, max: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function roundedNumber(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
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
  if (process.env.NODE_ENV === "production") return false;
  // "mock-owner-pack-*" — synthetic ids used by owner-review fixtures.
  // "storefront-*"     — ids from the hardcoded demo storefront fallback in
  //                       storefront-content.ts (Pokemon Gold #07 etc.).
  return (
    campaignId.startsWith("mock-owner-pack-") ||
    campaignId.startsWith("storefront-")
  );
}

function actionRequiresOwner(action: LifecycleAction) {
  return (
    action === "save_logic" ||
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

function ownerPrizeOddsOverrides(value: unknown) {
  if (!isRecord(value) || !isRecord(value.byCard)) {
    return { overrides: [] as OwnerPrizeOddsOverride[], response: null };
  }

  const overrides: OwnerPrizeOddsOverride[] = [];
  for (const [rawPrizeId, rawPatch] of Object.entries(value.byCard)) {
    const prizeId = text(rawPrizeId, 80);
    if (!prizeId || !isRecord(rawPatch)) continue;

    const update: OwnerPrizeOddsOverride = { id: prizeId };
    if ("weight" in rawPatch) {
      const weight = boundedNumber(rawPatch.weight, 0, 100000);
      if (weight === null) {
        return {
          overrides: [],
          response: adminErrorResponse(
            "PRIZE_ODDS_INVALID_VALUES",
            "Weight must be a number from 0 to 100000 and unlock percent must be 0 to 100.",
            400,
          ),
        };
      }
      update.weight = roundedNumber(weight, 4);
    }

    if ("unlockAtSoldPct" in rawPatch) {
      const unlockAtSoldPct = boundedNumber(rawPatch.unlockAtSoldPct, 0, 100);
      if (unlockAtSoldPct === null) {
        return {
          overrides: [],
          response: adminErrorResponse(
            "PRIZE_ODDS_INVALID_VALUES",
            "Weight must be a number from 0 to 100000 and unlock percent must be 0 to 100.",
            400,
          ),
        };
      }
      update.unlockAtSoldPct = Math.round(unlockAtSoldPct);
    }

    if (update.weight !== undefined || update.unlockAtSoldPct !== undefined) {
      overrides.push(update);
    }
  }

  return { overrides, response: null };
}

async function applyOwnerPrizeOddsOverrides(
  supabase: ServiceSupabaseClient,
  campaignId: string,
  overrides: OwnerPrizeOddsOverride[],
) {
  if (!overrides.length) return { applied: 0, response: null };

  const deduped = new Map<string, OwnerPrizeOddsOverride>();
  for (const override of overrides) {
    deduped.set(override.id, { ...deduped.get(override.id), ...override });
  }
  const prizeIds = [...deduped.keys()];
  const { data: existingPrizes, error: loadError } = await supabase
    .from("draw_round_prizes")
    .select("id,weight,unlock_at_sold_pct")
    .eq("draw_round_id", campaignId)
    .in("id", prizeIds);

  if (loadError) {
    if (isMissingColumnError(loadError)) {
      return { applied: 0, response: randomPackSchemaMissingResponse() };
    }
    return {
      applied: 0,
      response: mappedAdminErrorResponse(loadError, campaignLifecycleErrorMap, {
        code: "PRIZE_ODDS_LOAD_FAILED",
        error: "Owner prize odds could not be loaded.",
        status: 409,
      }),
    };
  }

  const existingById = new Map(
    (existingPrizes ?? []).map((prize) => [prize.id, prize]),
  );
  if (existingById.size !== prizeIds.length) {
    return {
      applied: 0,
      response: adminErrorResponse(
        "PRIZE_ODDS_INVALID_PRIZE",
        "One or more owner odds rows do not belong to this pack.",
        400,
      ),
    };
  }

  let applied = 0;
  for (const override of deduped.values()) {
    const existing = existingById.get(override.id);
    if (!existing) continue;

    const patch: { weight?: number; unlock_at_sold_pct?: number } = {};
    if (
      override.weight !== undefined &&
      Number(existing.weight ?? 0) !== override.weight
    ) {
      patch.weight = override.weight;
    }
    if (
      override.unlockAtSoldPct !== undefined &&
      Number(existing.unlock_at_sold_pct ?? 0) !== override.unlockAtSoldPct
    ) {
      patch.unlock_at_sold_pct = override.unlockAtSoldPct;
    }
    if (!Object.keys(patch).length) continue;

    const { error: updateError } = await supabase
      .from("draw_round_prizes")
      .update(patch)
      .eq("id", override.id)
      .eq("draw_round_id", campaignId);

    if (updateError) {
      if (isMissingColumnError(updateError)) {
        return { applied, response: randomPackSchemaMissingResponse() };
      }
      return {
        applied,
        response: mappedAdminErrorResponse(updateError, campaignLifecycleErrorMap, {
          code: "PRIZE_ODDS_SAVE_FAILED",
          error: "Owner prize odds could not be saved.",
          status: 409,
        }),
      };
    }
    applied += 1;
  }

  return { applied, response: null };
}

function mockLifecycleResult(
  action: LifecycleAction,
  logicMode: RandomLogicMode,
) {
  if (action === "save_logic") {
    return {
      approvalStatus: "pending_review",
      status: "draft",
      visibility: "private",
      logicMode,
      message: `${randomLogicLabel(logicMode)} saved for owner review.`,
    };
  }
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
  if (action === "save_logic") {
    return `${randomLogicLabel(logicMode)} saved for owner review.`;
  }
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

function lifecycleResult(input: {
  campaignId: string;
  action: LifecycleAction;
  note: string;
  logicMode: RandomLogicMode;
  updated: {
    approval_status: string | null;
    status: string;
    visibility: string;
  };
  message?: string;
}) {
  return Response.json({
    ok: true,
    campaignId: input.campaignId,
    action: input.action,
    note: input.note || null,
    mock: false,
    approvalStatus: input.updated.approval_status,
    status: input.updated.status,
    visibility: input.updated.visibility,
    logicMode: input.logicMode,
    message:
      input.message ?? realLifecycleMessage(input.action, input.logicMode),
  });
}

function safeRevalidateCampaigns() {
  try {
    revalidateTag("campaigns", "max");
  } catch (error) {
    console.warn(
      "ynot_campaign_revalidate_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
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
  // button) to work. Look up the first owner profile in the database so the
  // RPC receives a valid UUID; fall back to the well-known nil UUID if
  // there is no admin row yet. Production always enforces the real admin
  // gate.
  const realAdmin = await resolveAdminSession();
  let admin: Awaited<ReturnType<typeof resolveAdminSession>> = realAdmin;
  if (!admin && isDev) {
    let devAdminId = "00000000-0000-0000-0000-000000000000";
    try {
      const supabaseProbe = createServiceSupabaseClient();
      const probe = (await supabaseProbe
        .from("ynot_admins")
        .select("profile_id")
        .eq("role", "owner")
        .limit(1)
        .maybeSingle()) as { data: { profile_id?: string | null } | null };
      const candidate = probe.data?.profile_id;
      if (typeof candidate === "string" && candidate.length > 0) {
        devAdminId = candidate;
      }
    } catch {
      // best-effort lookup — fall back to the nil UUID if the probe fails
    }
    admin = {
      adminId: devAdminId,
      profileId: devAdminId,
      adminRole: "owner",
      authSource: "supabase",
    } as Awaited<ReturnType<typeof resolveAdminSession>>;
  }
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
        overrides?: unknown;
        bundles?: unknown;
        slotGrid?: unknown;
        guarantees?: unknown;
      }
    | null;
  const campaignId = text(body?.campaignId, 80);
  const action = lifecycleAction(body?.action);
  const logicMode = randomLogicMode(body?.logicMode);
  const note = text(body?.note, 500);
  const overridesPatch = isRecord(body?.overrides) ? body.overrides : null;
  const bundlesPatch = Array.isArray(body?.bundles) ? body.bundles : null;
  const slotGridPatch = isRecord(body?.slotGrid) ? body.slotGrid : null;
  const guaranteesPatch = isRecord(body?.guarantees) ? body.guarantees : null;

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
      "Only an owner can save review logic, approve, reject, request changes, publish, or delete a pack.",
      403,
    );
  }
  if (isLocalMockCampaign(campaignId)) {
    // For demo storefront packs, persist the archive in a cookie so the
    // storefront can hide them on the next render. Other lifecycle actions
    // on demo packs are still no-ops.
    if (action === "archive" && campaignId.startsWith("storefront-")) {
      const cookieStore = await cookies();
      const existing = parseDemoPackArchivedCookie(
        cookieStore.get(DEMO_PACK_ARCHIVED_COOKIE)?.value,
      );
      existing.add(campaignId);
      cookieStore.set(
        DEMO_PACK_ARCHIVED_COOKIE,
        JSON.stringify([...existing]),
        {
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
          sameSite: "lax",
        },
      );
    }
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

  if (action === "approve" && current.approval_status === "approved") {
    return lifecycleResult({
      campaignId,
      action,
      note,
      logicMode,
      updated: current,
      message: "Pack is already approved. Publish it to make it live/public.",
    });
  }
  if (
    action === "publish" &&
    current.status === "live" &&
    current.visibility === "public"
  ) {
    return lifecycleResult({
      campaignId,
      action,
      note,
      logicMode: logicModeFromSnapshot(current.logic_snapshot) ?? logicMode,
      updated: current,
      message: "Pack is already published live/public.",
    });
  }

  const now = new Date().toISOString();
  const previousSnapshot = jsonRecord(current.logic_snapshot);
  const previousOverrides = isRecord(previousSnapshot.ownerOverrides)
    ? previousSnapshot.ownerOverrides
    : {};
  const mergedOverrides = overridesPatch
    ? { ...previousOverrides, ...overridesPatch, updatedAt: now, updatedBy: admin.adminId }
    : previousOverrides;
  const baseLogicSnapshot: Record<string, unknown> = {
    ...previousSnapshot,
    mode: logicMode,
    label: randomLogicLabel(logicMode),
    selectedByAdminId: admin.adminId,
    selectedAt: now,
  };
  if (bundlesPatch) baseLogicSnapshot.bundles = bundlesPatch;
  if (slotGridPatch) baseLogicSnapshot.slotGrid = slotGridPatch;
  if (guaranteesPatch) baseLogicSnapshot.guarantees = guaranteesPatch;
  if (overridesPatch || Object.keys(previousOverrides).length) {
    baseLogicSnapshot.ownerOverrides = mergedOverrides;
  }
  // On approve/publish, freeze the current snapshot (minus the .published key
  // itself) as the diff baseline for the next review cycle.
  if (action === "approve" || action === "publish") {
    const { published: _previousPublished, ...freezable } = baseLogicSnapshot;
    void _previousPublished;
    baseLogicSnapshot.published = {
      ...freezable,
      publishedAt: now,
      publishedBy: admin.adminId,
    };
  }
  const logicSnapshot = baseLogicSnapshot as unknown as Json;
  const shouldApplyOwnerPrizeOdds =
    action === "save_logic" ||
    action === "submit_review" ||
    action === "approve" ||
    action === "publish";
  const parsedOwnerPrizeOdds = shouldApplyOwnerPrizeOdds
    ? ownerPrizeOddsOverrides(mergedOverrides)
    : { overrides: [] as OwnerPrizeOddsOverride[], response: null };
  if (parsedOwnerPrizeOdds.response) return parsedOwnerPrizeOdds.response;
  const ownerPrizeOdds = parsedOwnerPrizeOdds.overrides;
  let appliedPrizeOddsOverrides = 0;
  const responseLogicMode =
    action === "publish"
      ? logicModeFromSnapshot(current.logic_snapshot) ?? logicMode
      : logicMode;

  if (action === "save_logic") {
    if (current.status !== "draft" || current.approval_status === "approved") {
      return adminErrorResponse(
        "CAMPAIGN_LOGIC_LOCKED",
        "Random logic can only be saved while the pack is a draft waiting on owner review.",
        409,
      );
    }
    const oddsResult = await applyOwnerPrizeOddsOverrides(
      supabase,
      campaignId,
      ownerPrizeOdds,
    );
    if (oddsResult.response) return oddsResult.response;
    appliedPrizeOddsOverrides = oddsResult.applied;
    const { error: updateError } = await supabase
      .from("draw_rounds")
      .update({
        logic_snapshot: logicSnapshot,
      })
      .eq("id", campaignId);
    if (updateError) {
      if (isMissingColumnError(updateError)) {
        return randomPackSchemaMissingResponse();
      }
      return mappedAdminErrorResponse(updateError, campaignLifecycleErrorMap, {
        code: "CAMPAIGN_LOGIC_SAVE_FAILED",
        error: "Random logic could not be saved.",
        status: 409,
      });
    }
  } else if (action === "close") {
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
    if (
      action === "submit_review" ||
      action === "approve" ||
      action === "publish"
    ) {
      const oddsResult = await applyOwnerPrizeOddsOverrides(
        supabase,
        campaignId,
        ownerPrizeOdds,
      );
      if (oddsResult.response) return oddsResult.response;
      appliedPrizeOddsOverrides = oddsResult.applied;
    }
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

  const { error: auditError } = await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: `campaign_${action}`,
    draw_round_id: campaignId,
    metadata: {
      action,
      logicMode: responseLogicMode,
      note: note || null,
      appliedPrizeOddsOverrides,
    },
  });
  if (auditError) {
    console.warn("ynot_campaign_audit_insert_failed", auditError.message);
  }
  safeRevalidateCampaigns();

  return lifecycleResult({
    campaignId,
    action,
    note,
    updated,
    logicMode: responseLogicMode,
  });
}
