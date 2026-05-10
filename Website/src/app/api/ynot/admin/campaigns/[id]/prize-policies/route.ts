import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { authErrorResponse, requireAdminOrOwner } from "@/lib/auth/require-role";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Bulk-set spin policy on a campaign's prizes:
 *
 *   PUT /api/ynot/admin/campaigns/[id]/prize-policies
 *   {
 *     "individualWeights": { "<prizeId>": 1, ... }     // ranks 1-3 (per-prize)
 *     "tierWeights":       { "normal": 100, "high": 5 } // ranks >= 4 (per-tier)
 *     "unlockBands": [
 *       { "rankStart": 1, "rankEnd": 3, "unlockAtSoldPct": 30 },
 *       ...
 *     ]
 *   }
 *
 * The campaign must be unlocked (locked_at is null). The endpoint translates
 * unlockBands into a per-prize unlock_at_sold_pct write so the runtime spin
 * RPC only ever reads from draw_round_prizes (no band lookup at draw time).
 */

type Body = {
  individualWeights?: Record<string, unknown>;
  tierWeights?: Record<string, unknown>;
  unlockBands?: Array<{ rankStart?: unknown; rankEnd?: unknown; unlockAtSoldPct?: unknown }>;
};

type Tier = "normal" | "high";

function clampWeight(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return n;
}

function clampPct(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let admin;
  try {
    admin = await requireAdminOrOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const { id: campaignId } = await params;
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:prize-policies",
    { limit: 30, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Body;
  const supabase = createServiceSupabaseClient();

  // Lock check + ownership for non-owner admins
  const { data: campaign, error: lookupError } = await supabase
    .from("draw_rounds")
    .select("id,status,locked_at,created_by")
    .eq("id", campaignId)
    .single();
  if (lookupError || !campaign) {
    return Response.json({ error: "campaign_not_found" }, { status: 404 });
  }
  if (campaign.locked_at) {
    return Response.json({ error: "campaign_locked" }, { status: 409 });
  }
  if (campaign.status !== "draft") {
    return Response.json({ error: "campaign_requires_draft_for_prize_edit" }, { status: 409 });
  }
  if (admin.adminRole === "admin" && (campaign.status !== "draft" || campaign.created_by !== admin.adminId)) {
    return Response.json({ error: "not_draft_owner" }, { status: 403 });
  }

  // Fetch all prizes for this campaign (we may need ranks for tier/band logic)
  const { data: prizes, error: prizesError } = await supabase
    .from("draw_round_prizes")
    .select("id,tier,rank,weight,unlock_at_sold_pct")
    .eq("draw_round_id", campaignId);
  if (prizesError) return Response.json({ error: prizesError.message }, { status: 500 });
  if (!prizes || prizes.length === 0) {
    return Response.json({ error: "no_prizes" }, { status: 409 });
  }

  // ---- Compute desired (weight, unlock_at_sold_pct) per prize ----
  const tierWeights: Partial<Record<Tier, number>> = {};
  if (body.tierWeights && typeof body.tierWeights === "object") {
    const normal = clampWeight((body.tierWeights as Record<string, unknown>).normal);
    const high = clampWeight((body.tierWeights as Record<string, unknown>).high);
    if (normal !== null) tierWeights.normal = normal;
    if (high !== null) tierWeights.high = high;
  }

  const individualWeights = new Map<string, number>();
  if (body.individualWeights && typeof body.individualWeights === "object") {
    for (const [prizeId, value] of Object.entries(body.individualWeights)) {
      const w = clampWeight(value);
      if (w !== null) individualWeights.set(prizeId, w);
    }
  }

  type Band = { rankStart: number; rankEnd: number; unlockAtSoldPct: number };
  const bands: Band[] = [];
  if (Array.isArray(body.unlockBands)) {
    for (const raw of body.unlockBands) {
      const rs = Number(raw?.rankStart);
      const re = Number(raw?.rankEnd);
      const pct = clampPct(raw?.unlockAtSoldPct);
      if (Number.isInteger(rs) && Number.isInteger(re) && rs > 0 && re >= rs && pct !== null) {
        bands.push({ rankStart: rs, rankEnd: re, unlockAtSoldPct: pct });
      }
    }
  }

  // For each prize: decide weight and unlock
  const updates: Array<{ id: string; weight?: number; unlock_at_sold_pct?: number }> = [];
  for (const prize of prizes) {
    const update: { id: string; weight?: number; unlock_at_sold_pct?: number } = { id: prize.id };

    // Weight: ranks 1-3 use individualWeights[prizeId], ranks 4+ use tierWeights[tier]
    if (prize.rank >= 1 && prize.rank <= 3) {
      const w = individualWeights.get(prize.id);
      if (w !== undefined) update.weight = w;
    } else if (prize.rank >= 4) {
      const w = tierWeights[prize.tier as Tier];
      if (w !== undefined) update.weight = w;
    }

    // Unlock: pick first matching band
    if (bands.length > 0) {
      const match = bands.find((b) => prize.rank >= b.rankStart && prize.rank <= b.rankEnd);
      if (match) update.unlock_at_sold_pct = match.unlockAtSoldPct;
    }

    if (update.weight !== undefined || update.unlock_at_sold_pct !== undefined) {
      updates.push(update);
    }
  }

  // Apply updates one by one (Supabase doesn't support bulk update with different values)
  let appliedCount = 0;
  for (const upd of updates) {
    const patch: { weight?: number; unlock_at_sold_pct?: number } = {};
    if (upd.weight !== undefined) patch.weight = upd.weight;
    if (upd.unlock_at_sold_pct !== undefined) patch.unlock_at_sold_pct = upd.unlock_at_sold_pct;
    const { error: updError } = await supabase
      .from("draw_round_prizes")
      .update(patch)
      .eq("id", upd.id);
    if (updError) {
      return Response.json({ error: updError.message, appliedCount }, { status: 500 });
    }
    appliedCount++;
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_policies_updated",
    draw_round_id: campaignId,
    metadata: {
      tierWeights,
      individualWeights: Object.fromEntries(individualWeights),
      bands,
      appliedCount,
    },
  });

  return Response.json({ ok: true, appliedCount });
}
