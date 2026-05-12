import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError, randomPackSchemaMissingResponse } from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type PrizeBody = {
  campaignId?: unknown;
  cardId?: unknown;
  tier?: unknown;
  rank?: unknown;
  valueThb?: unknown;
  weight?: unknown;
  unlockAtSoldPct?: unknown;
  prizeId?: unknown;
  quantity?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
  metadata?: unknown;
  prizeCategory?: unknown;
  sourceType?: unknown;
  displayGroup?: unknown;
};

type PrizeTier = Database["public"]["Tables"]["draw_round_prizes"]["Row"]["tier"];
type AdminSession = NonNullable<Awaited<ReturnType<typeof resolveAdminSession>>>;
type Supabase = ReturnType<typeof createServiceSupabaseClient>;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tierValue(value: unknown): PrizeTier {
  return value === "high" ? "high" : "normal";
}

function rankValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

function moneyValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? Math.round(parsed) : null;
}

function quantityValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : null;
}

function weightValue(value: unknown) {
  if (value === undefined || value === null || value === "") return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000
    ? Number(parsed.toFixed(4))
    : null;
}

function percentValue(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? Number(parsed.toFixed(2))
    : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataValue(body: PrizeBody): Json {
  const metadata = isRecord(body.metadata) ? { ...body.metadata } : {};
  const prizeCategory = text(body.prizeCategory, 40);
  const sourceType = text(body.sourceType, 40);
  const displayGroup = text(body.displayGroup, 40);
  if (prizeCategory) metadata.prizeCategory = prizeCategory;
  if (sourceType) metadata.sourceType = sourceType;
  if (displayGroup) metadata.displayGroup = displayGroup;
  return metadata as Json;
}

async function bodyJson(request: Request): Promise<PrizeBody | null> {
  return request.json().catch(() => null) as Promise<PrizeBody | null>;
}

async function markCampaignNeedsOwnerReview(
  supabase: Supabase,
  campaignId: string,
  admin: AdminSession,
  reason: string,
) {
  const { data: campaign, error: campaignError } = await supabase
    .from("draw_rounds")
    .select("id,status,visibility,approval_status")
    .eq("id", campaignId)
    .single();
  if (campaignError && isMissingColumnError(campaignError, "approval_status")) {
    const { data: legacyCampaign, error: legacyError } = await supabase
      .from("draw_rounds")
      .select("id,status,visibility")
      .eq("id", campaignId)
      .single();
    if (legacyError) {
      return Response.json({ error: legacyError.message }, { status: 409 });
    }
    if (legacyCampaign.status !== "draft") {
      return Response.json(
        { error: "Prize logic can only be changed while the random pack is draft/private." },
        { status: 409 },
      );
    }
    return null;
  }
  if (campaignError) return Response.json({ error: campaignError.message }, { status: 409 });
  if (campaign.status !== "draft") {
    return Response.json(
      { error: "Prize logic can only be changed while the random pack is draft/private." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("draw_rounds")
    .update({
      approval_status: "pending_review",
      approval_requested_by: admin.adminId,
      approval_requested_at: now,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      approval_notes: reason,
      status: "draft",
      visibility: "private",
    })
    .eq("id", campaignId);
  if (error && isMissingColumnError(error)) return null;
  if (error) return Response.json({ error: error.message }, { status: 409 });

  return null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:prizes", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  const hasOwnerOnlyOddsFields =
    body.valueThb !== undefined ||
    body.weight !== undefined ||
    body.unlockAtSoldPct !== undefined;
  if (hasOwnerOnlyOddsFields && admin.adminRole !== "owner") {
    return Response.json(
      { error: "Only an owner can set prize value, weight, or sold unlock odds." },
      { status: 403 },
    );
  }

  const campaignId = text(body.campaignId, 80);
  const cardId = text(body.cardId, 80);
  const tier = tierValue(body.tier);
  const rank = rankValue(body.rank);
  const quantity = quantityValue(body.quantity);
  const valueThb =
    body.valueThb === undefined ? undefined : moneyValue(body.valueThb);
  const weight = body.weight === undefined ? undefined : weightValue(body.weight);
  const unlockAtSoldPct =
    body.unlockAtSoldPct === undefined
      ? undefined
      : percentValue(body.unlockAtSoldPct);
  const metadata = metadataValue(body);
  if (!campaignId || !cardId || !rank) return Response.json({ error: "campaignId, cardId, and rank are required." }, { status: 400 });
  if (body.quantity !== undefined && quantity === null) return Response.json({ error: "quantity must be an integer from 0 to 10000." }, { status: 400 });
  if (weight === null) return Response.json({ error: "weight must be a number from 0 to 100000." }, { status: 400 });
  if (unlockAtSoldPct === null) return Response.json({ error: "unlockAtSoldPct must be a number from 0 to 100." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const reviewReset = await markCampaignNeedsOwnerReview(
    supabase,
    campaignId,
    admin,
    "Prize weight, unlock, or inventory changed. Owner review is required before publish.",
  );
  if (reviewReset) return reviewReset;

  const basePatch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] = {
    draw_round_id: campaignId,
    card_id: cardId,
    tier,
    rank,
    metadata,
  };
  const patch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] = {
    ...basePatch,
  };
  if (valueThb !== undefined) patch.value_thb = valueThb;
  if (weight !== undefined) patch.weight = weight;
  if (unlockAtSoldPct !== undefined) patch.unlock_at_sold_pct = unlockAtSoldPct;
  if (body.isTest !== undefined || body.seedRunId !== undefined) {
    patch.is_test = booleanValue(body.isTest);
    patch.seed_run_id = text(body.seedRunId, 80) || null;
  }

  let { data, error } = await supabase
    .from("draw_round_prizes")
    .upsert(patch, { onConflict: "draw_round_id,tier,rank" })
    .select(
      "id,draw_round_id,card_id,tier,rank,value_thb,weight,unlock_at_sold_pct,metadata",
    )
    .single();
  if (error && isMissingColumnError(error)) {
    if ((weight ?? 1) !== 1 || (unlockAtSoldPct ?? 0) !== 0) {
      return randomPackSchemaMissingResponse();
    }
    ({ data, error } = await supabase
      .from("draw_round_prizes")
      .upsert(basePatch, { onConflict: "draw_round_id,tier,rank" })
      .select("id,draw_round_id,card_id,tier,rank,value_thb,metadata")
      .single());
    if (data) {
      data = {
        ...data,
        weight: 1,
        unlock_at_sold_pct: 0,
      } as typeof data;
    }
  }
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (!data) {
    return Response.json(
      { error: "Prize could not be saved." },
      { status: 409 },
    );
  }
  let inventory = null;
  if (quantity !== null) {
    const { data: inventoryData, error: inventoryError } = await supabase.rpc("ensure_draw_round_prize_units", {
      p_draw_round_prize_id: data.id,
      p_total_units: quantity,
      p_admin_id: admin.adminId,
      p_seed_run_id: text(body.seedRunId, 80) || null,
    });
    if (inventoryError) return Response.json({ error: inventoryError.message }, { status: 409 });
    inventory = inventoryData;
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_saved",
    draw_round_id: campaignId,
    metadata: {
      prizeId: data.id,
      cardId,
      tier,
      rank,
      quantity,
      weight: weight ?? "unchanged",
      unlockAtSoldPct: unlockAtSoldPct ?? "unchanged",
      prizeMetadata: metadata,
      approvalStatus: "pending_review",
    },
  });

  return Response.json({ ok: true, prize: data, inventory });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:prizes", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const prizeId = text(body?.prizeId, 80);
  if (!prizeId) return Response.json({ error: "prizeId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: existingPrize, error: fetchError } = await supabase
    .from("draw_round_prizes")
    .select("id,draw_round_id,card_id,tier,rank")
    .eq("id", prizeId)
    .single();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 409 });

  const reviewReset = await markCampaignNeedsOwnerReview(
    supabase,
    existingPrize.draw_round_id,
    admin,
    "Prize was removed from the pool. Owner review is required before publish.",
  );
  if (reviewReset) return reviewReset;

  await supabase
    .from("draw_round_prize_units")
    .update({ status: "void", voided_at: new Date().toISOString(), metadata: { reason: "admin_prize_deleted", voidedByAdminId: admin.adminId } })
    .eq("draw_round_prize_id", prizeId)
    .eq("status", "available");

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .update({ metadata: { adminHidden: true, hiddenByAdminId: admin.adminId, hiddenAt: new Date().toISOString() } })
    .eq("id", prizeId)
    .select("id,draw_round_id,card_id,tier,rank")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_deleted",
    draw_round_id: data.draw_round_id,
    metadata: { prizeId: data.id, cardId: data.card_id, tier: data.tier, rank: data.rank, approvalStatus: "pending_review" },
  });

  return Response.json({ ok: true });
}
