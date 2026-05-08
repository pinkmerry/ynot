import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type PrizeBody = {
  campaignId?: unknown;
  cardId?: unknown;
  tier?: unknown;
  rank?: unknown;
  valueThb?: unknown;
  tone?: unknown;
  prizeId?: unknown;
};

type PrizeTier = Database["public"]["Tables"]["draw_round_prizes"]["Row"]["tier"];
type PrizeTone = NonNullable<Database["public"]["Tables"]["draw_round_prizes"]["Row"]["tone"]>;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tierValue(value: unknown): PrizeTier {
  return value === "high" ? "high" : "normal";
}

function toneValue(value: unknown): PrizeTone | null {
  return value === "red" || value === "gold" || value === "blue" || value === "green" || value === "rose" || value === "violet" ? value : null;
}

function rankValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

function moneyValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? Math.round(parsed) : null;
}

async function bodyJson(request: Request): Promise<PrizeBody | null> {
  return request.json().catch(() => null) as Promise<PrizeBody | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const campaignId = text(body.campaignId, 80);
  const cardId = text(body.cardId, 80);
  const tier = tierValue(body.tier);
  const rank = rankValue(body.rank);
  if (!campaignId || !cardId || !rank) return Response.json({ error: "campaignId, cardId, and rank are required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const patch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] = {
    draw_round_id: campaignId,
    card_id: cardId,
    tier,
    rank,
    value_thb: moneyValue(body.valueThb),
    tone: toneValue(body.tone),
  };

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .upsert(patch, { onConflict: "draw_round_id,tier,rank" })
    .select("id,draw_round_id,card_id,tier,rank,value_thb,tone")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_saved",
    draw_round_id: campaignId,
    metadata: { prizeId: data.id, cardId, tier, rank },
  });

  return Response.json({ ok: true, prize: data });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await bodyJson(request);
  const prizeId = text(body?.prizeId, 80);
  if (!prizeId) return Response.json({ error: "prizeId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("draw_round_prizes")
    .delete()
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
