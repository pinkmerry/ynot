import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;
type DrawRoundRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
type PrizeRow = Database["public"]["Tables"]["draw_round_prizes"]["Row"];

type InventorySummary = {
  drawRoundId: string;
  totalSlots?: number;
  remainingSlots?: number;
  totalUnits?: number;
  availableUnits?: number;
  awardedUnits?: number;
  voidUnits?: number;
};

export type PrizeDraftInput = {
  cardId: string;
  tier: "normal" | "high";
  rank: number;
  valueThb: number | null;
  quantity: number;
  weight: number;
  unlockAtSoldPct: number;
  metadata?: Json;
};

export type CampaignPrizeReadiness = {
  campaignId: string;
  ready: boolean;
  blockers: string[];
  soldPct: number;
  soldOut: boolean;
  totalSlots: number;
  remainingSlots: number;
  prizeRows: number;
  highPrizeRows: number;
  topPrizeRows: number;
  normalPrizeRows: number;
  totalPrizeUnits: number;
  availablePrizeUnits: number;
  eligiblePrizeUnits: number;
  initialEligiblePrizeUnits: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAdminHidden(metadata: unknown) {
  return isRecord(metadata) && metadata.adminHidden === true;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inventorySummariesFromJson(value: unknown): InventorySummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.drawRoundId !== "string") return [];
    return [
      {
        drawRoundId: item.drawRoundId,
        totalSlots: numberOrZero(item.totalSlots) || undefined,
        remainingSlots: numberOrZero(item.remainingSlots) || undefined,
        totalUnits: numberOrZero(item.totalUnits),
        availableUnits: numberOrZero(item.availableUnits),
        awardedUnits: numberOrZero(item.awardedUnits),
        voidUnits: numberOrZero(item.voidUnits),
      },
    ];
  });
}

function soldPctForCampaign(row: DrawRoundRow, inventory?: InventorySummary) {
  const remainingSlots = inventory?.remainingSlots ?? row.total_slots;
  const soldSlots = Math.max(0, row.total_slots - remainingSlots);
  if (row.total_slots <= 0) return 100;
  return Math.min(100, (soldSlots / row.total_slots) * 100);
}

function buildReadinessBlockers(input: {
  remainingSlots: number;
  prizeRows: number;
  totalPrizeUnits: number;
  availablePrizeUnits: number;
  eligiblePrizeUnits: number;
  initialEligiblePrizeUnits: number;
}) {
  const blockers: string[] = [];
  if (input.remainingSlots <= 0) {
    blockers.push("This pack has no remaining packs to sell.");
  }
  if (input.prizeRows <= 0) {
    blockers.push("Add prize inventory before saving, review, approval, or publish.");
  }
  if (input.totalPrizeUnits <= 0) {
    blockers.push("Create prize units for the configured prize rows.");
  }
  if (input.availablePrizeUnits < input.remainingSlots) {
    blockers.push("Available prize units must cover every remaining pack.");
  }
  if (input.initialEligiblePrizeUnits <= 0) {
    blockers.push("At least one available prize must have weight above 0 and unlock at 0% sold.");
  }
  if (input.eligiblePrizeUnits <= 0) {
    blockers.push("No available prize is currently unlocked for customer pulls.");
  }
  return blockers;
}

export function normalizePrizeDrafts(value: unknown): PrizeDraftInput[] {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return rows.flatMap((row): PrizeDraftInput[] => {
    if (!isRecord(row)) return [];
    const cardId = typeof row.cardId === "string" ? row.cardId.trim() : "";
    const tier = row.tier === "high" ? "high" : "normal";
    const rank = Math.max(1, Math.round(numberOrZero(row.rank)));
    const quantity = Math.max(0, Math.round(numberOrZero(row.quantity)));
    const weight = Math.max(0, numberOrZero(row.weight));
    const unlockAtSoldPct = Math.min(
      100,
      Math.max(0, Math.round(numberOrZero(row.unlockAtSoldPct))),
    );
    const key = `${tier}:${rank}`;
    if (!cardId || quantity <= 0 || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        cardId,
        tier,
        rank,
        valueThb: numberOrZero(row.valueThb) > 0 ? Math.round(numberOrZero(row.valueThb)) : null,
        quantity,
        weight,
        unlockAtSoldPct,
        metadata: (isRecord(row.metadata) ? row.metadata : {}) as Json,
      },
    ];
  });
}

export function validatePrizeDraftsForSave(
  prizes: PrizeDraftInput[],
  totalSlots: number,
) {
  const totalPrizeUnits = prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  const initialEligiblePrizeUnits = prizes
    .filter((prize) => prize.weight > 0 && prize.unlockAtSoldPct <= 0)
    .reduce((sum, prize) => sum + prize.quantity, 0);
  const highPrizeRows = prizes.filter((prize) => prize.tier === "high").length;
  const blockers: string[] = [];
  if (!prizes.length) {
    blockers.push("Choose prize inventory before saving the random pack draft.");
  }
  if (totalPrizeUnits < totalSlots) {
    blockers.push("Prize quantity must be at least the total pack quantity.");
  }
  if (initialEligiblePrizeUnits <= 0) {
    blockers.push("Add at least one base prize that unlocks at 0% and has weight above 0.");
  }
  if (highPrizeRows <= 0) {
    blockers.push("Choose at least one high-tier or top prize for owner review.");
  }
  return {
    ready: blockers.length === 0,
    blockers,
    totalPrizeUnits,
    initialEligiblePrizeUnits,
    highPrizeRows,
  };
}

export async function getCampaignPrizeReadiness(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignPrizeReadiness> {
  const { data: row, error: campaignError } = await supabase
    .from("draw_rounds")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campaignError) throw campaignError;

  const [{ data: inventoryJson, error: inventoryError }, { data: prizes, error: prizesError }] =
    await Promise.all([
      supabase.rpc("get_draw_round_inventory_summary", {
        p_draw_round_id: campaignId,
        p_profile_id: null,
      }),
      supabase
        .from("draw_round_prizes")
        .select("*")
        .eq("draw_round_id", campaignId),
    ]);
  if (inventoryError) throw inventoryError;
  if (prizesError) throw prizesError;

  const inventory = inventorySummariesFromJson(inventoryJson)[0];
  const soldPct = soldPctForCampaign(row, inventory);
  const visiblePrizes = (prizes ?? []).filter(
    (prize) => !isAdminHidden(prize.metadata),
  );
  const prizeIds = visiblePrizes.map((prize) => prize.id);

  const unitRows = prizeIds.length
    ? await supabase
        .from("draw_round_prize_units")
        .select("draw_round_prize_id,status")
        .in("draw_round_prize_id", prizeIds)
        .limit(10000)
    : { data: [], error: null };
  if (unitRows.error) throw unitRows.error;

  const prizeById = new Map<string, PrizeRow>(
    visiblePrizes.map((prize) => [prize.id, prize]),
  );
  let totalPrizeUnits = 0;
  let availablePrizeUnits = 0;
  let eligiblePrizeUnits = 0;
  let initialEligiblePrizeUnits = 0;

  for (const unit of unitRows.data ?? []) {
    if (unit.status === "void") continue;
    totalPrizeUnits += 1;
    if (unit.status !== "available") continue;
    availablePrizeUnits += 1;
    const prize = prizeById.get(unit.draw_round_prize_id);
    if (!prize || Number(prize.weight ?? 1) <= 0) continue;
    const unlockAtSoldPct = Number(prize.unlock_at_sold_pct ?? 0);
    if (unlockAtSoldPct <= soldPct) eligiblePrizeUnits += 1;
    if (unlockAtSoldPct <= 0) initialEligiblePrizeUnits += 1;
  }

  const remainingSlots = Math.max(
    0,
    inventory?.remainingSlots ?? row.total_slots,
  );
  const readiness = {
    campaignId,
    soldPct,
    soldOut: remainingSlots <= 0 || availablePrizeUnits <= 0,
    totalSlots: row.total_slots,
    remainingSlots,
    prizeRows: visiblePrizes.length,
    highPrizeRows: visiblePrizes.filter((prize) => prize.tier === "high").length,
    topPrizeRows: visiblePrizes.filter(
      (prize) => prize.tier === "high" && prize.rank >= 1 && prize.rank <= 3,
    ).length,
    normalPrizeRows: visiblePrizes.filter((prize) => prize.tier === "normal").length,
    totalPrizeUnits,
    availablePrizeUnits,
    eligiblePrizeUnits,
    initialEligiblePrizeUnits,
  };
  const blockers = buildReadinessBlockers(readiness);
  return {
    ...readiness,
    ready: blockers.length === 0,
    blockers,
  };
}

export function readinessErrorResponse(readiness: CampaignPrizeReadiness) {
  return Response.json(
    {
      error: readiness.blockers[0] ?? "Prize inventory is not ready.",
      blockers: readiness.blockers,
      readiness,
    },
    { status: 409 },
  );
}
