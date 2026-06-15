import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingFunctionError } from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import {
  prizeDisplayTierOptions,
  prizeDisplayTierValue,
  type PrizeDisplayTier,
} from "./prize-tier";
import {
  normalizeBundleQuantity,
  plannedQuantityForPrize,
  stockUnitsToWinSlots,
} from "./bundle-quantity";
import {
  buildPrizeStockSelectionIssues,
  buildPrizeStockShortages,
  stockCardIdForPrize,
  stockSelectionBlockers,
  stockShortageBlockers,
  type PrizeStockSummary,
  type StockReadinessPrize,
} from "./stock-readiness";
import {
  aggregateNonVoidPrizeUnitCounts,
  type PrizeUnitStatusRow,
} from "./prize-unit-counts";
import { finalPrizeAwareOpenableWinSlots } from "./open-quantity";

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
  availableWinSlots?: number;
  eligibleUnits?: number;
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

type StockSubSkuSummaryRow = {
  cardId: string;
  stockUnitGroupKey: string;
  availableUnits: number;
};

export type PrizeDraftInput = {
  cardId: string;
  tier: "normal" | "high";
  rank: number;
  valueThb: number | null;
  convertCoinValue: number;
  quantity: number;
  bundleQuantity?: number | string | null;
  weight: number;
  unlockAtSoldPct: number;
  metadata?: Json;
};

export type CampaignPrizeReadiness = {
  campaignId: string;
  ready: boolean;
  blockers: string[];
  identityMismatchCount: number;
  identityMismatchCheckFailed?: boolean;
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

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
        totalSlots: optionalNumber(item.totalSlots),
        remainingSlots: optionalNumber(item.remainingSlots),
        totalUnits: numberOrZero(item.totalUnits),
        availableUnits: numberOrZero(item.availableUnits),
        availableWinSlots: optionalNumber(item.availableWinSlots),
        eligibleUnits: optionalNumber(item.eligibleUnits),
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

function stockSubSkuSummariesFromJson(value: unknown): StockSubSkuSummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.cardId !== "string") return [];
    const stockUnitGroupKey =
      typeof item.stockUnitGroupKey === "string" ? item.stockUnitGroupKey : "";
    if (!stockUnitGroupKey) return [];
    return [
      {
        cardId: item.cardId,
        stockUnitGroupKey,
        availableUnits: numberOrZero(item.availableUnits),
      },
    ];
  });
}

async function getPrizeStockSummaryRows(
  supabase: SupabaseClient,
  cardIds: string[],
) {
  const { data: batchData, error: batchError } = await supabase.rpc(
    "get_admin_prize_stock_summaries",
    { p_card_ids: cardIds },
  );
  if (!batchError) {
    const batch = isRecord(batchData) ? batchData : {};
    return {
      stockRows: stockSummariesFromJson(batch.stockSummaries),
      subSkuRows: stockSubSkuSummariesFromJson(batch.subSkuSummaries),
    };
  }
  if (!isMissingFunctionError(batchError, "get_admin_prize_stock_summaries")) {
    throw batchError;
  }

  const [stockResponses, subSkuResponses] = await Promise.all([
    Promise.all(
      cardIds.map((cardId) =>
        supabase.rpc("get_card_stock_summary", { p_card_id: cardId }),
      ),
    ),
    Promise.all(
      cardIds.map((cardId) =>
        supabase.rpc("get_admin_card_stock_subsku_summary", { p_card_id: cardId }),
      ),
    ),
  ]);
  const stockError = stockResponses.find((response) => response.error)?.error;
  if (stockError) throw stockError;
  const subSkuError = subSkuResponses.find((response) => response.error)?.error;
  if (subSkuError) throw subSkuError;

  return {
    stockRows: stockResponses.flatMap((response) =>
      stockSummariesFromJson(response.data),
    ),
    subSkuRows: subSkuResponses.flatMap((response) =>
      stockSubSkuSummariesFromJson(response.data),
    ),
  };
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

function stockGroupKeyFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return "";
  if (typeof metadata.stockUnitGroupKey === "string") {
    return metadata.stockUnitGroupKey.trim();
  }
  const filter = metadata.stockUnitFilter;
  if (!isRecord(filter)) return "";
  return [
    typeof filter.condition === "string" && filter.condition.trim()
      ? filter.condition.trim()
      : "raw",
    typeof filter.grade === "string" ? filter.grade.trim() : "",
    typeof filter.gradingService === "string" ? filter.gradingService.trim() : "",
    typeof filter.certNumber === "string" ? filter.certNumber.trim() : "",
    typeof filter.gemrateId === "string" ? filter.gemrateId.trim() : "",
  ].join("\u001f");
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
  identityMismatchCount?: number;
  identityMismatchCheckFailed?: boolean;
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
  if (input.identityMismatchCheckFailed) {
    blockers.push(
      "Prize stock identity checker failed. Retry the check before publishing.",
    );
  }
  if ((input.identityMismatchCount ?? 0) > 0) {
    blockers.push(
      "Prize stock identity mismatch detected. Review intended card vs materialized stock before publishing.",
    );
  }
  blockers.push(...(input.stockBlockers ?? []));
  return blockers;
}

async function countPrizeUnitIdentityMismatches(
  supabase: SupabaseClient,
  campaignId: string,
) {
  try {
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc(
      "get_draw_round_prize_unit_identity_mismatches",
      { p_draw_round_id: campaignId },
    );
    if (error) {
      console.warn("YNOT prize identity checker failed", error);
      return { count: 0, failed: true };
    }
    return { count: Array.isArray(data) ? data.length : 0, failed: false };
  } catch (error) {
    console.warn("YNOT prize identity checker failed", error);
    return { count: 0, failed: true };
  }
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

  const [
    { data: cards, error: cardsError },
    { stockRows, subSkuRows },
  ] = await Promise.all([
    supabase
      .from("cards")
      .select("id,name,card_code,search_code")
      .in("id", cardIds),
    getPrizeStockSummaryRows(supabase, cardIds),
  ]);
  if (cardsError) throw cardsError;

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  const stockByCardId = new Map(
    stockRows.map((row) => [row.cardId, row]),
  );
  const subSkuRowsByCardId = new Map<string, StockSubSkuSummaryRow[]>();
  for (const row of subSkuRows) {
    const current = subSkuRowsByCardId.get(row.cardId) ?? [];
    current.push(row);
    subSkuRowsByCardId.set(row.cardId, current);
  }

  const reservedByCardId = new Map<string, number>();
  const reservedByCardAndGroup = new Map<string, number>();
  if (options.includeCampaignReservations && options.campaignId) {
    const campaignId = options.campaignId;
    const { data: currentPrizes, error: prizesError } = await supabase
      .from("draw_round_prizes")
      .select("id,card_id,metadata")
      .eq("draw_round_id", campaignId);
    if (prizesError) throw prizesError;
    const cardIdByPrizeId = new Map(
      (currentPrizes ?? []).map((prize) => [prize.id, prize.card_id]),
    );
    const groupKeyByPrizeId = new Map(
      (currentPrizes ?? []).map((prize) => [
        prize.id,
        stockGroupKeyFromMetadata(prize.metadata),
      ]),
    );
    const reservationCounts = await Promise.all(
      [...cardIdByPrizeId.keys()].map(async (prizeId) => ({
        cardId: cardIdByPrizeId.get(prizeId),
        groupKey: groupKeyByPrizeId.get(prizeId) ?? "",
        reservedCount: await countCampaignReservations(
          supabase,
          campaignId,
          prizeId,
        ),
      })),
    );
    for (const { cardId, groupKey, reservedCount } of reservationCounts) {
      if (!cardId) continue;
      reservedByCardId.set(cardId, (reservedByCardId.get(cardId) ?? 0) + reservedCount);
      if (groupKey) {
        const targetKey = `${cardId}\u001e${groupKey}`;
        reservedByCardAndGroup.set(
          targetKey,
          (reservedByCardAndGroup.get(targetKey) ?? 0) + reservedCount,
        );
      }
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
      stockSkuGroups: (subSkuRowsByCardId.get(cardId) ?? []).map((row) => ({
        key: row.stockUnitGroupKey,
        availableUnits: row.availableUnits,
        reservedForCampaign:
          reservedByCardAndGroup.get(`${cardId}\u001e${row.stockUnitGroupKey}`) ?? 0,
      })),
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
    const convertCoinValue = Math.min(
      10_000_000,
      Math.max(0, Math.round(numberOrZero(row.convertCoinValue))),
    );
    return [
      {
        cardId,
        tier,
        rank,
        valueThb: numberOrZero(row.valueThb) > 0 ? Math.round(numberOrZero(row.valueThb)) : null,
        convertCoinValue,
        quantity,
        bundleQuantity: normalizeBundleQuantity(
          row.bundleQuantity ?? row.bundle_quantity,
        ),
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
  const totalPrizeUnits = prizes.reduce(
    (sum, prize) => sum + plannedQuantityForPrize(prize),
    0,
  );
  const initialEligiblePrizeUnits = prizes
    .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, 0))
    .reduce((sum, prize) => sum + plannedQuantityForPrize(prize), 0);
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
      ...stockSelectionBlockers(
        buildPrizeStockSelectionIssues({
          prizes,
          stockSummaries: stockReadiness.stockSummaries,
        }),
      ),
    );
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
  preloaded?: {
    row?: DrawRoundRow;
    inventory?: InventorySummary;
    includeIdentityMismatches?: boolean;
    prizes?: PrizeRow[];
  },
): Promise<CampaignPrizeReadiness> {
  // Callers on the pack-detail / storefront paths have usually just loaded the
  // draw_round row and run the inventory-summary RPC. Reuse those to skip two
  // redundant round-trips per render: there is no cross-request cache on the
  // current Cloudflare deployment, so every render otherwise re-fetches the row
  // and re-runs the RPC that the caller already has. When the caller has already
  // fetched the raw prize rows (e.g. shared with getPublicPrizeLineup on the
  // pack-detail path), they can be passed in via preloaded.prizes to skip the
  // third round-trip.
  let row = preloaded?.row;
  if (!row) {
    const { data, error: campaignError } = await supabase
      .from("draw_rounds")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (campaignError) throw campaignError;
    row = data;
  }

  const [inventory, prizes] = await Promise.all([
    preloaded?.inventory !== undefined
      ? Promise.resolve(preloaded.inventory)
      : (async () => {
          const { data, error } = await supabase.rpc(
            "get_draw_round_inventory_summary",
            { p_draw_round_id: campaignId, p_profile_id: null },
          );
          if (error) throw error;
          return inventorySummariesFromJson(data)[0];
        })(),
    preloaded?.prizes !== undefined
      ? Promise.resolve(preloaded.prizes)
      : (async () => {
          const { data, error } = await supabase
            .from("draw_round_prizes")
            .select("*")
            .eq("draw_round_id", campaignId);
          if (error) throw error;
          return data ?? [];
        })(),
  ]);
  const soldPct = soldPctForCampaign(row, inventory);
  const logicMode = randomLogicMode(row.logic_snapshot);
  const visiblePrizes = (prizes ?? []).filter(
    (prize) => !isAdminHidden(prize.metadata),
  );
  const prizeIds = visiblePrizes.map((prize) => prize.id);

  const prizeById = new Map<string, PrizeRow>(
    visiblePrizes.map((prize) => [prize.id, prize]),
  );
  const usePlannedInventory =
    row.status === "draft" && row.approval_status !== "approved";
  let totalPrizeUnits = 0;
  let availablePrizeUnits = 0;
  let eligiblePrizeUnits = 0;
  let initialEligiblePrizeUnits = 0;
  const nonVoidUnitsByPrizeId = new Map<string, number>();

  if (!usePlannedInventory) {
    // Read all non-void units for the whole campaign and aggregate per-prize
    // counts in memory, instead of 2 count(*) round-trips per prize (the old
    // N+1 storm). Page through with .range() because PostgREST caps a single
    // response at max_rows (1000 in this project's config); a non-paginated
    // select would silently truncate large packs and undercount. Order by a
    // unique column so page boundaries are stable. Uses the
    // draw_round_prize_units_round_status_idx (draw_round_id, status) index.
    const UNIT_PAGE_SIZE = 1000;
    const unitRows: PrizeUnitStatusRow[] = [];
    for (let offset = 0; ; offset += UNIT_PAGE_SIZE) {
      const { data: page, error: pageError } = await supabase
        .from("draw_round_prize_units")
        .select("draw_round_prize_id,status")
        .eq("draw_round_id", campaignId)
        .neq("status", "void")
        .order("id", { ascending: true })
        .range(offset, offset + UNIT_PAGE_SIZE - 1);
      if (pageError) throw pageError;
      if (!page?.length) break;
      unitRows.push(...page);
      if (page.length < UNIT_PAGE_SIZE) break;
    }
    const prizeUnitCounts = aggregateNonVoidPrizeUnitCounts(prizeIds, unitRows);

    for (const { prizeId, nonVoidCount, availableCount } of prizeUnitCounts) {
      const prize = prizeById.get(prizeId);
      if (!prize) continue;
      const plannedQuantity = plannedQuantityForPrize(prize);
      const totalWinSlots = stockUnitsToWinSlots(
        nonVoidCount,
        prize.bundle_quantity,
        plannedQuantity,
      );
      const availableWinSlots = stockUnitsToWinSlots(
        availableCount,
        prize.bundle_quantity,
        plannedQuantity,
      );
      if (totalWinSlots <= 0) continue;
      totalPrizeUnits += totalWinSlots;
      nonVoidUnitsByPrizeId.set(prizeId, nonVoidCount);
      if (availableWinSlots <= 0) continue;
      availablePrizeUnits += availableWinSlots;
      if (prizeEligibleAtSoldPct(prize, logicMode, soldPct)) {
        eligiblePrizeUnits += availableWinSlots;
      }
      if (prizeEligibleAtSoldPct(prize, logicMode, 0)) {
        initialEligiblePrizeUnits += availableWinSlots;
      }
    }
  }

  let stockBlockers: string[] = [];
  if (usePlannedInventory) {
    totalPrizeUnits = visiblePrizes.reduce(
      (sum, prize) => sum + plannedQuantityForPrize(prize),
      0,
    );
    availablePrizeUnits = totalPrizeUnits;
    eligiblePrizeUnits = visiblePrizes
      .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, soldPct))
      .reduce(
        (sum, prize) => sum + plannedQuantityForPrize(prize),
        0,
      );
    initialEligiblePrizeUnits = visiblePrizes
      .filter((prize) => prizeEligibleAtSoldPct(prize, logicMode, 0))
      .reduce(
        (sum, prize) => sum + plannedQuantityForPrize(prize),
        0,
      );
    const stockSummaries = await getPrizeStockSummaries(supabase, visiblePrizes, {
      campaignId,
      includeCampaignReservations: row.approval_status === "pending_review",
    });
    stockBlockers =
      row.approval_status === "pending_review"
        ? [
            ...stockSelectionBlockers(
              buildPrizeStockSelectionIssues({
                prizes: visiblePrizes,
                stockSummaries,
              }),
            ),
            ...reservationCoverageBlockers(visiblePrizes, stockSummaries),
          ]
        : [
            ...stockSelectionBlockers(
              buildPrizeStockSelectionIssues({
                prizes: visiblePrizes,
                stockSummaries,
              }),
            ),
            ...stockShortageBlockers(
              buildPrizeStockShortages({
                prizes: visiblePrizes,
                stockSummaries,
              }),
            ),
          ];
  }

  const remainingSlots = Math.max(
    0,
    inventory?.remainingSlots ?? row.total_slots,
  );
  const lastPrizeTotalUnits = row.last_prize_card_id ? 1 : 0;
  const lastPrizeAvailableUnits =
    row.last_prize_card_id && !row.last_prize_awarded_at ? 1 : 0;
  // Last Prize is awarded on the final customer open, so it must count toward
  // reward coverage for packs intentionally materialized with one fewer normal
  // prize unit than total slots.
  const totalRewardUnits = totalPrizeUnits + lastPrizeTotalUnits;
  const availableRewardUnits =
    inventory?.availableWinSlots ??
    finalPrizeAwareOpenableWinSlots({
      remainingSlots,
      normalOpenableWinSlots: availablePrizeUnits,
      finalPrizeAvailableUnits: lastPrizeAvailableUnits,
    });
  const eligibleRewardUnits =
    inventory?.eligibleUnits ??
    finalPrizeAwareOpenableWinSlots({
      remainingSlots,
      normalOpenableWinSlots: eligiblePrizeUnits,
      finalPrizeAvailableUnits: lastPrizeAvailableUnits,
    });
  const unitBackedPrizes = usePlannedInventory
    ? visiblePrizes.filter(
        (prize) => plannedQuantityForPrize(prize) > 0,
      )
    : visiblePrizes.filter(
        (prize) => (nonVoidUnitsByPrizeId.get(prize.id) ?? 0) > 0,
      );
  const displayTierCounts = countByDisplayTier(unitBackedPrizes);
  const readiness = {
    campaignId,
    soldPct,
    soldOut: remainingSlots <= 0 || availableRewardUnits <= 0,
    totalSlots: row.total_slots,
    remainingSlots,
    prizeRows: unitBackedPrizes.length,
    highPrizeRows: unitBackedPrizes.filter((prize) => prize.tier === "high").length,
    topPrizeRows: displayTierCounts.rainbow,
    highPoolRows: displayTierCounts.gold + displayTierCounts.silver,
    normalPrizeRows: unitBackedPrizes.filter((prize) => prize.tier === "normal").length,
    totalPrizeUnits: totalRewardUnits,
    availablePrizeUnits: availableRewardUnits,
    eligiblePrizeUnits: eligibleRewardUnits,
    initialEligiblePrizeUnits,
  };
  const identityMismatchCheck = preloaded?.includeIdentityMismatches
    ? await countPrizeUnitIdentityMismatches(supabase, campaignId)
    : { count: 0, failed: false };
  const blockers = buildReadinessBlockers({
    ...readiness,
    identityMismatchCount: identityMismatchCheck.count,
    identityMismatchCheckFailed: identityMismatchCheck.failed,
    stockBlockers,
  });
  return {
    ...readiness,
    identityMismatchCount: identityMismatchCheck.count,
    identityMismatchCheckFailed: identityMismatchCheck.failed || undefined,
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
