import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type PrizeBody = {
  campaignId?: unknown;
  cardId?: unknown;
  tier?: unknown;
  rank?: unknown;
  valueThb?: unknown;
  prizeId?: unknown;
  quantity?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
};

type PrizeTier = Database["public"]["Tables"]["draw_round_prizes"]["Row"]["tier"];

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

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function bodyJson(request: Request): Promise<PrizeBody | null> {
  return request.json().catch(() => null) as Promise<PrizeBody | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:prizes", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const campaignId = text(body.campaignId, 80);
  const cardId = text(body.cardId, 80);
  const tier = tierValue(body.tier);
  const rank = rankValue(body.rank);
  const quantity = quantityValue(body.quantity);
  if (!campaignId || !cardId || !rank) return Response.json({ error: "campaignId, cardId, and rank are required." }, { status: 400 });
  if (body.quantity !== undefined && quantity === null) return Response.json({ error: "quantity must be an integer from 0 to 10000." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const patch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] = {
    draw_round_id: campaignId,
    card_id: cardId,
    tier,
    rank,
    value_thb: moneyValue(body.valueThb),
  };
  if (body.isTest !== undefined || body.seedRunId !== undefined) {
    patch.is_test = booleanValue(body.isTest);
    patch.seed_run_id = text(body.seedRunId, 80) || null;
  }

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .upsert(patch, { onConflict: "draw_round_id,tier,rank" })
    .select("id,draw_round_id,card_id,tier,rank,value_thb")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });
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
    metadata: { prizeId: data.id, cardId, tier, rank, quantity },
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
  const { error: fetchError } = await supabase
    .from("draw_round_prizes")
    .select("id,draw_round_id,card_id,tier,rank")
    .eq("id", prizeId)
    .single();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 409 });

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
    metadata: { prizeId: data.id, cardId: data.card_id, tier: data.tier, rank: data.rank },
  });

  return Response.json({ ok: true });
}
