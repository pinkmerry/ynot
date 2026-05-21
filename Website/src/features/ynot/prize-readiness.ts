import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import {
  prizeDisplayTierOptions,
  prizeDisplayTierValue,
  type PrizeDisplayTier,
} from "./prize-tier";
import {
  buildPrizeStockShortages,
  stockCardIdForPrize,
  stockShortageBlockers,
  type PrizeStockSummary,
  type StockReadinessPrize,
} from "./stock-readiness";

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;
type DrawRoundRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
type PrizeRow = Database["public"]["Tables"]["draw_round_prizes"]["Row"];
type RandomLogicMode = "pure_random" | "weighted_templates" | "inventory_gated";

type InventorySummary = {
  drawRoundId: string;
  totalSlots?: number;
  remainingSlots?: number;
  totalUnits?: number;
  availableUnits?: number;
  awardedUnits?: number;
  voidUnits?: number;
};

type StockSummaryRow = {
  cardId: string;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
  archivedUnits: number;
  deletedUnits: number;
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
  highPoolRows: number;
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

function metadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return undefined;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function displayTierForPrize(prize: PrizeRow | PrizeDraftInput) {
  const displayTier = metadataString(prize.metadata, "displayTier");
  if (displayTier) return prizeDisplayTierValue(displayTier);
  const displayGroup = metadataString(prize.metadata, "displayGroup");
  if (displayGroup) return prizeDisplayTierValue(displayGroup);
  if (prize.tier === "high" && prize.rank <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  return "bronze";
}

function countByDisplayTier(prizes: Array<PrizeRow | PrizeDraftInput>) {
  return prizeDisplayTierOptions.reduce(
    (counts, option) => ({
      ...counts,
      [option.value]: prizes.filter(
        (prize) => displayTierForPrize(prize) === option.value,
      ).length,
    }),
    {} as Record<PrizeDisplayTier, number>,
  );
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomLogicMode(value: unknown): RandomLogicMode {
  if (!isRecord(value)) return "pure_random";
  const mode = value.mode ?? value.logicMode;
  if (
    mode === "pure_random" ||
    mode === "weighted_templates" ||
    mode === "inventory_gated"
  ) {
    return mode;
  }
  return "pure_random";
}

function effectivePrizeWeight(prize: PrizeRow | PrizeDraftInput, logicMode: RandomLogicMode) {
  if (logicMode === "pure_random") return 1;
  return Math.max(0, numberOrZero("weight" in prize ? prize.weight : 1));
}

function effectivePrizeUnlockAtSoldPct(
  prize: PrizeRow | PrizeDraftInput,
  logicMode: RandomLogicMode,
) {
  if (logicMode !== "inventory_gated") return 0;
  const rawValue =
    "unlock_at_sold_pct" in prize
      ? prize.unlock_at_sold_pct
      : prize.unlockAtSoldPct;
  return Math.min(100, Math.max(0, numberOrZero(rawValue)));
}

function prizeEligibleAtSoldPct(
  prize: PrizeRow | PrizeDraftInput,
  logicMode: RandomLogicMode,
  soldPct: number,
) {
  return (
    effectivePrizeWeight(prize, logicMode) > 0 &&
    effectivePrizeUnlockAtSoldPct(prize, logicMode) <= soldPct
  );
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

function stockSummariesFromJson(value: unknown): StockSummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.cardId !== "string") return [];
    return [
      {
        cardId: item.cardId,
        totalUnits: numberOrZero(item.totalUnits),
        availableUnits: numberOrZero(item.availableUnits),
        reservedUnits: numberOrZero(item.reservedUnits),
        allocatedUnits: numberOrZero(item.allocatedUnits),
        archivedUnits: numberOrZero(item.archivedUnits),
        deletedUnits: numberOrZero(item.deletedUnits),
      },
    ];
  });
}

async function countPrizeUnits(
  supabase: SupabaseClient,
  prizeId: string,
  status?: Database["public"]["Tables"]["draw_round_prize_units"]["Row"]["status"],
) {
  let query = supabase
    .from("draw_round_prize_units")
    .select("id", { count: "exact", head: true })
    .eq("draw_round_prize_id", prizeId);
  if (status) query = query.eq("status", status);
  else query = query.neq("status", "void");
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countCampaignReservations(
  supabase: SupabaseClient,
  campaignId: string,
  prizeId: string,
) {
  const { count, error } = await supabase
    .from("card_stock_reservations")
    .select("id", { count: "exact", head: true })
    .eq("draw_round_id", campaignId)
    .eq("draw_round_prize_id", prizeId)
    .in("status", ["reserved", "allocated"]);
  if (error) throw error;
  return count ?? 0;
}

function soldPctForCampaign(row: DrawRoundRow, inventory?: InventorySummary) {
  const remainingSlots = inventory?.remainingSlots ?? row.total_slots;
  const soldSlots = Math.max(0, row.total_slots - remainingSlots);
  if (row.total_slots <= 0) return 100;
  return Math.min(100, (soldSlots / row.total_slots) * 100);
}

function buildReadinessBlockers(input: {
  totalSlots: number;
  remainingSlots: number;
  prizeRows: number;
  topPrizeRows: number;
  highPoolRows: number;
  normalPrizeRows: number;
  totalPrizeUnits: number;
  availablePrizeUnits: number;
  eligiblePrizeUnits: number;
  initialEligiblePrizeUnits: number;
  stockBlockers?: string[];
}) {
  const blockers: string[] = [];
  if (input.remainingSlots <= 0) {
    blockers.push("This pack has no remaining packs to sell.");
  }
  if (input.prizeRows <= 0) {
    blockers.push("Add prize inventory before saving, review, approval, or publish.");
  }
  if (input.totalPrizeUnits <= 0) {
    blockers.push("Set planned prize quantity for the configured prize rows.");
  }
  if (input.totalPrizeUnits !== input.totalSlots) {
    blockers.push("Prize quantity must equal the total pack quantity.");
  }
  if (input.availablePrizeUnits < input.remainingSlots) {
    blockers.push("Available or planned prize units must cover every remaining pack.");
  }
  if (input.initialEligiblePrizeUnits <= 0) {
    blockers.push("At least one available prize must be eligible when the pack launches.");
  }
  if (input.eligiblePrizeUnits <= 0) {
    blockers.push("No available prize is currently unlocked for customer pulls.");
  }
  blockers.push(...(input.stockBlockers ?? []));
  return blockers;
}

export async function getPrizeStockSummaries(
  supabase: SupabaseClient,
  prizes: StockReadinessPrize[],
  options: {
    campaignId?: string;
    includeCampaignReservations?: boolean;
  } = {},
): Promise<PrizeStockSummary[]> {
  const cardIds = [
    ...new Set(prizes.map(stockCardIdForPrize).filter(Boolean)),
  ];
  if (!cardIds.length) return [];

  const [{ data: cards, error: cardsError }, { data: stockRows, error: stockError }] =
    await Promise.all([
      supabase
        .from("cards")
        .select("id,name,card_code,search_code")
        .in("id", cardIds),
      supabase.rpc("get_card_stock_summary", { p_card_id: null }),
    ]);
  if (cardsError) throw cardsError;
  if (stockError) throw stockError;

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  const stockByCardId = new Map(
    stockSummariesFromJson(stockRows).map((row) => [row.cardId, row]),
  );

  const reservedByCardId = new Map<string, number>();
  if (options.includeCampaignReservations && options.campaignId) {
    const campaignId = options.campaignId;
    const { data: currentPrizes, error: prizesError } = await supabase
      .from("draw_round_prizes")
      .select("id,card_id")
      .eq("draw_round_id", campaignId);
    if (prizesError) throw prizesError;
    const cardIdByPrizeId = new Map(
      (currentPrizes ?? []).map((prize) => [prize.id, prize.card_id]),
    );
    const reservationCounts = await Promise.all(
      [...cardIdByPrizeId.keys()].map(async (prizeId) => ({
        cardId: cardIdByPrizeId.get(prizeId),
        reservedCount: await countCampaignReservations(
          supabase,
          campaignId,
          prizeId,
        ),
      })),
    );
    for (const { cardId, reservedCount } of reservationCounts) {
      if (!cardId) continue;
      reservedByCardId.set(cardId, (reservedByCardId.get(cardId) ?? 0) + reservedCount);
    }
  }

  return cardIds.map((cardId) => {
    const card = cardById.get(cardId);
    const stock = stockByCardId.get(cardId);
    return {
      cardId,
      cardName: card?.name ?? null,
      cardCode: card?.card_code ?? card?.search_code ?? null,
      stockAvailable: stock?.availableUnits ?? 0,
      reservedForCampaign: reservedByCardId.get(cardId) ?? 0,
    };
  });
}

function reservationCoverageBlockers(
  prizes: StockReadinessPrize[],
  stockSummaries: PrizeStockSummary[],
) {
  return buildPrizeStockShortages({
    includeReservedForCampaign: true,
    prizes,
    stockSummaries: stockSummaries.map((summary) => ({
      ...summary,
      stockAvailable: 0,
    })),
  }).map((shortage) => {
    const plannedUnits = shortage.requiredUnits;
    const reservedUnits = shortage.reservedUnits;
    return `Reserved stock for Card "${shortage.label}" covers ${reservedUnits.toLocaleString()}/${plannedUnits.toLocaleString()} planned prize units. Refresh and re-submit owner review.`;
  });
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
    const weight = Math.max(0, numberOrDefault(row.weight, 1));
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
  logicMode: RandomLogicMode = "pure_random",
  stockReadiness?: {
    includeReservedForCampaign?: boolean;
    stockSummaries: PrizeStockSummary[];
  },
) {
  const totalPrizeUnits = prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  const initialEligiblePrizeUnits = prizes
    .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, 0))
    .reduce((sum, prize) => sum + prize.quantity, 0);
  const highPrizeRows = prizes.filter((prize) => prize.tier === "high").length;
  const displayTierCounts = countByDisplayTier(prizes);
  const topPrizeRows = displayTierCounts.rainbow;
  const highPoolRows = displayTierCounts.gold + displayTierCounts.silver;
  const normalPrizeRows = prizes.filter((prize) => prize.tier === "normal").length;
  const blockers: string[] = [];
  if (!prizes.length) {
    blockers.push("Choose prize inventory before saving the random pack draft.");
  }
  if (totalPrizeUnits !== totalSlots) {
    blockers.push("Prize quantity must equal the total pack quantity.");
  }
  if (initialEligiblePrizeUnits <= 0) {
    blockers.push("Add at least one prize that is eligible when the pack launches.");
  }
  if (stockReadiness) {
    blockers.push(
      ...stockShortageBlockers(
        buildPrizeStockShortages({
          includeReservedForCampaign:
            stockReadiness.includeReservedForCampaign,
          prizes,
          stockSummaries: stockReadiness.stockSummaries,
        }),
      ),
    );
  }
  return {
    ready: blockers.length === 0,
    blockers,
    totalPrizeUnits,
    initialEligiblePrizeUnits,
    highPrizeRows,
    topPrizeRows,
    highPoolRows,
    normalPrizeRows,
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
  const logicMode = randomLogicMode(row.logic_snapshot);
  const visiblePrizes = (prizes ?? []).filter(
    (prize) => !isAdminHidden(prize.metadata),
  );
  const prizeIds = visiblePrizes.map((prize) => prize.id);

  const prizeById = new Map<string, PrizeRow>(
    visiblePrizes.map((prize) => [prize.id, prize]),
  );
  let totalPrizeUnits = 0;
  let availablePrizeUnits = 0;
  let eligiblePrizeUnits = 0;
  let initialEligiblePrizeUnits = 0;
  const nonVoidUnitsByPrizeId = new Map<string, number>();

  const prizeUnitCounts = await Promise.all(
    prizeIds.map(async (prizeId) => {
      const [nonVoidCount, availableCount] = await Promise.all([
        countPrizeUnits(supabase, prizeId),
        countPrizeUnits(supabase, prizeId, "available"),
      ]);
      return { prizeId, nonVoidCount, availableCount };
    }),
  );

  for (const { prizeId, nonVoidCount, availableCount } of prizeUnitCounts) {
    if (nonVoidCount <= 0) continue;
    totalPrizeUnits += nonVoidCount;
    nonVoidUnitsByPrizeId.set(prizeId, nonVoidCount);
    if (availableCount <= 0) continue;
    availablePrizeUnits += availableCount;
    const prize = prizeById.get(prizeId);
    if (!prize) continue;
    if (prizeEligibleAtSoldPct(prize, logicMode, soldPct)) {
      eligiblePrizeUnits += availableCount;
    }
    if (prizeEligibleAtSoldPct(prize, logicMode, 0)) {
      initialEligiblePrizeUnits += availableCount;
    }
  }

  const usePlannedInventory =
    totalPrizeUnits === 0 &&
    row.status === "draft" &&
    row.approval_status !== "approved";
  let stockBlockers: string[] = [];
  if (usePlannedInventory) {
    totalPrizeUnits = visiblePrizes.reduce(
      (sum, prize) => sum + Math.max(0, Number(prize.planned_quantity ?? 0)),
      0,
    );
    availablePrizeUnits = totalPrizeUnits;
    eligiblePrizeUnits = visiblePrizes
      .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, soldPct))
      .reduce(
        (sum, prize) => sum + Math.max(0, Number(prize.planned_quantity ?? 0)),
        0,
      );
    initialEligiblePrizeUnits = visiblePrizes
      .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, 0))
      .reduce(
        (sum, prize) => sum + Math.max(0, Number(prize.planned_quantity ?? 0)),
        0,
      );
    const stockSummaries = await getPrizeStockSummaries(supabase, visiblePrizes, {
      campaignId,
      includeCampaignReservations: row.approval_status === "pending_review",
    });
    stockBlockers =
      row.approval_status === "pending_review"
        ? reservationCoverageBlockers(visiblePrizes, stockSummaries)
        : stockShortageBlockers(
            buildPrizeStockShortages({
              prizes: visiblePrizes,
              stockSummaries,
            }),
          );
  }

  const remainingSlots = Math.max(
    0,
    inventory?.remainingSlots ?? row.total_slots,
  );
  const unitBackedPrizes = usePlannedInventory
    ? visiblePrizes.filter(
        (prize) => Math.max(0, Number(prize.planned_quantity ?? 0)) > 0,
      )
    : visiblePrizes.filter(
        (prize) => (nonVoidUnitsByPrizeId.get(prize.id) ?? 0) > 0,
      );
  const displayTierCounts = countByDisplayTier(unitBackedPrizes);
  const readiness = {
    campaignId,
    soldPct,
    soldOut: remainingSlots <= 0 || availablePrizeUnits <= 0,
    totalSlots: row.total_slots,
    remainingSlots,
    prizeRows: unitBackedPrizes.length,
    highPrizeRows: unitBackedPrizes.filter((prize) => prize.tier === "high").length,
    topPrizeRows: displayTierCounts.rainbow,
    highPoolRows: displayTierCounts.gold + displayTierCounts.silver,
    normalPrizeRows: unitBackedPrizes.filter((prize) => prize.tier === "normal").length,
    totalPrizeUnits,
    availablePrizeUnits,
    eligiblePrizeUnits,
    initialEligiblePrizeUnits,
  };
  const blockers = buildReadinessBlockers({ ...readiness, stockBlockers });
  return {
    ...readiness,
    ready: blockers.length === 0,
    blockers,
  };
}

export function readinessErrorResponse(readiness: CampaignPrizeReadiness) {
  return Response.json(
    {
      ok: false,
      code: "CAMPAIGN_PRIZE_READINESS_BLOCKED",
      error: readiness.blockers[0] ?? "Prize inventory is not ready.",
      blockers: readiness.blockers,
      readiness,
    },
    { status: 409 },
  );
}
