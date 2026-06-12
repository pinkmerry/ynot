import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

type LiveRevisionAction = "save_logic" | "approve" | "reject" | "publish";
type LiveRevisionLogicMode =
  | "pure_random"
  | "weighted_templates"
  | "inventory_gated";
type LiveRevisionCardEdit = {
  weight?: number;
  unlockAtSoldPct?: number;
};

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function actionValue(value: unknown): LiveRevisionAction | null {
  return (
    value === "save_logic" ||
    value === "approve" ||
    value === "reject" ||
    value === "publish"
  )
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stableJsonString(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonString(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonString(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function logicModeValue(value: unknown): LiveRevisionLogicMode {
  return value === "pure_random" ||
    value === "weighted_templates" ||
    value === "inventory_gated"
    ? value
    : "weighted_templates";
}

function liveRevisionPrizeKey(item: Record<string, unknown>) {
  const tier = item.tier === "high" ? "high" : "normal";
  const rank = Math.round(Number(item.rank));
  return Number.isFinite(rank) && rank > 0 ? `${tier}:${rank}` : "";
}

function sanitizedCardEdits(value: unknown): Record<string, LiveRevisionCardEdit> {
  if (!isRecord(value)) return {};
  const out: Record<string, LiveRevisionCardEdit> = {};
  for (const [key, editValue] of Object.entries(value)) {
    if (!isRecord(editValue)) continue;
    const edit: LiveRevisionCardEdit = {};
    const weight = finiteNumber(editValue.weight);
    if (weight !== null && weight >= 0) edit.weight = weight;
    const unlockAtSoldPct = finiteNumber(editValue.unlockAtSoldPct);
    if (
      unlockAtSoldPct !== null &&
      unlockAtSoldPct >= 0 &&
      unlockAtSoldPct <= 100
    ) {
      edit.unlockAtSoldPct = unlockAtSoldPct;
    }
    if (edit.weight !== undefined || edit.unlockAtSoldPct !== undefined) {
      out[text(key, 120)] = edit;
    }
  }
  return out;
}

function liveRevisionPrizeSnapshotWithOverrides(
  prizeSnapshot: unknown,
  cardEdits: Record<string, LiveRevisionCardEdit>,
) {
  if (!Array.isArray(prizeSnapshot)) return [];
  return prizeSnapshot.map((item) => {
    if (!isRecord(item)) return item;
    const prizeKey = liveRevisionPrizeKey(item);
    const edit = prizeKey ? cardEdits[prizeKey] : undefined;
    if (!edit) return item;
    return {
      ...item,
      ...(edit.weight !== undefined ? { weight: edit.weight } : {}),
      ...(edit.unlockAtSoldPct !== undefined
        ? { unlockAtSoldPct: edit.unlockAtSoldPct }
        : {}),
    };
  });
}

function liveRevisionLogicSnapshot(
  current: unknown,
  logicMode: LiveRevisionLogicMode,
  cardEdits: Record<string, LiveRevisionCardEdit>,
  guarantees: unknown,
) {
  const base = isRecord(current) ? current : {};
  const currentOverrides = isRecord(base.ownerOverrides)
    ? base.ownerOverrides
    : {};
  return {
    ...base,
    mode: logicMode,
    ownerOverrides: {
      ...currentOverrides,
      byCard: cardEdits,
      guarantees: isRecord(guarantees) ? guarantees : {},
    },
  } as Json;
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
  if (message.includes("reserved_stock_identity_mismatch"))
    return "Reserved stock no longer matches the intended prize identity. Refresh stock selection before publishing.";
  if (message.includes("prize_unit_identity_mismatch"))
    return "Prize stock identity mismatch detected. Review intended card vs materialized stock before publishing.";
  if (message.includes("last_prize_identity_locked_after_award"))
    return "Last Prize has already been awarded. Edit future rewards or pack settings separately; the awarded Last Prize card and convert settings are locked.";
  return message;
}

function liveRevisionChangesAwardedLastPrize(
  scalarPatch: unknown,
  campaign: {
    last_prize_awarded_at: string | null;
    last_prize_card_id: string | null;
    last_prize_metadata: Json | null;
  },
) {
  if (!campaign.last_prize_awarded_at || !isRecord(scalarPatch)) return false;
  if (hasOwn(scalarPatch, "last_prize_card_id")) {
    const rawCardId = scalarPatch.last_prize_card_id;
    const nextCardId =
      typeof rawCardId === "string" ? rawCardId.trim() || null : null;
    if (nextCardId !== (campaign.last_prize_card_id ?? null)) return true;
  }
  if (
    hasOwn(scalarPatch, "last_prize_metadata") &&
    stableJsonString(scalarPatch.last_prize_metadata) !==
      stableJsonString(campaign.last_prize_metadata)
  ) {
    return true;
  }
  return false;
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
    logicMode?: unknown;
    overrides?: unknown;
    guarantees?: unknown;
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
  if (action === "save_logic" || action === "approve") {
    const { data: revision, error: revisionError } = await supabase
      .from("draw_round_live_revisions")
      .select("id,draw_round_id,status,logic_snapshot,prize_snapshot")
      .eq("id", revisionId)
      .in("status", ["pending_review", "approved"])
      .maybeSingle();
    if (revisionError || !revision) {
      return adminErrorResponse(
        revisionError?.code ?? "LIVE_REVISION_UPDATE_FAILED",
        revisionError
          ? liveRevisionErrorMessage(revisionError.message)
          : "Live revision was not found.",
        409,
        revisionError
          ? { detail: revisionError.details ?? null, hint: revisionError.hint ?? null }
          : undefined,
      );
    }
    const { data: campaign, error: campaignError } = await supabase
      .from("draw_rounds")
      .select("logic_snapshot")
      .eq("id", revision.draw_round_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return adminErrorResponse(
        campaignError?.code ?? "LIVE_REVISION_CAMPAIGN_NOT_FOUND",
        campaignError
          ? liveRevisionErrorMessage(campaignError.message)
          : "Live pack was not found.",
        409,
        campaignError
          ? { detail: campaignError.details ?? null, hint: campaignError.hint ?? null }
          : undefined,
      );
    }

    const overrides = isRecord(body?.overrides) ? body.overrides : {};
    const cardEdits = sanitizedCardEdits(
      isRecord(overrides) ? overrides.byCard : null,
    );
    const logicMode = logicModeValue(body?.logicMode);
    const prizeSnapshot = liveRevisionPrizeSnapshotWithOverrides(
      revision.prize_snapshot,
      cardEdits,
    );
    if (!prizeSnapshot.length) {
      return adminErrorResponse(
        "LIVE_REVISION_PRIZES_REQUIRED",
        "Live revision prize rows are required before saving logic.",
        400,
      );
    }

    const nextStatus = action === "approve" ? "approved" : "pending_review";
    const reviewedAt = action === "approve" ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("draw_round_live_revisions")
      .update({
        logic_snapshot: liveRevisionLogicSnapshot(
          revision.logic_snapshot ?? campaign.logic_snapshot,
          logicMode,
          cardEdits,
          body?.guarantees,
        ),
        prize_snapshot: prizeSnapshot as Json,
        status: nextStatus,
        reviewed_by_admin_id: action === "approve" ? admin.adminId : null,
        reviewed_at: reviewedAt,
        review_note: note || null,
      })
      .eq("id", revisionId)
      .in("status", ["pending_review", "approved"])
      .select("id,draw_round_id,status")
      .maybeSingle();
    if (error || !data) {
      return adminErrorResponse(
        error?.code ?? "LIVE_REVISION_UPDATE_FAILED",
        error
          ? liveRevisionErrorMessage(error.message)
          : "Live revision was not found.",
        409,
        error ? { detail: error.details ?? null, hint: error.hint ?? null } : undefined,
      );
    }
    await supabase.from("audit_events").insert({
      actor_admin_id: admin.adminId,
      event_type:
        action === "approve"
          ? "campaign_live_revision_approved"
          : "campaign_live_revision_logic_saved",
      draw_round_id: data.draw_round_id,
      metadata: { revisionId, logicMode, savedWithApproval: action === "approve" },
    });
    revalidateTag("campaigns", "max");
    return Response.json({ ok: true, revision: data });
  }

  if (action === "publish") {
    const { data: revision, error: revisionError } = await supabase
      .from("draw_round_live_revisions")
      .select("id,draw_round_id,scalar_patch,status")
      .eq("id", revisionId)
      .maybeSingle();
    if (revisionError || !revision) {
      return adminErrorResponse(
        revisionError?.code ?? "LIVE_REVISION_NOT_FOUND",
        revisionError
          ? liveRevisionErrorMessage(revisionError.message)
          : "Live revision was not found.",
        409,
        revisionError
          ? { detail: revisionError.details ?? null, hint: revisionError.hint ?? null }
          : undefined,
      );
    }
    const { data: campaign, error: campaignError } = await supabase
      .from("draw_rounds")
      .select("last_prize_awarded_at,last_prize_card_id,last_prize_metadata")
      .eq("id", revision.draw_round_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return adminErrorResponse(
        campaignError?.code ?? "LIVE_REVISION_CAMPAIGN_NOT_FOUND",
        campaignError
          ? liveRevisionErrorMessage(campaignError.message)
          : "Live pack was not found.",
        409,
        campaignError
          ? { detail: campaignError.details ?? null, hint: campaignError.hint ?? null }
          : undefined,
      );
    }
    if (liveRevisionChangesAwardedLastPrize(revision.scalar_patch, campaign)) {
      return adminErrorResponse(
        "LAST_PRIZE_IDENTITY_LOCKED",
        liveRevisionErrorMessage("last_prize_identity_locked_after_award"),
        409,
      );
    }
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

  const nextStatus = "rejected";
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
