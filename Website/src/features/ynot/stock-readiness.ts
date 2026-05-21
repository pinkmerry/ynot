export type StockReadinessPrize = {
  cardId?: string | null;
  card_id?: string | null;
  cardName?: string | null;
  cardCode?: string | null;
  quantity?: number | null;
  plannedQuantity?: number | null;
  planned_quantity?: number | null;
  metadata?: unknown;
};

export type PrizeStockSummary = {
  cardId: string;
  cardName?: string | null;
  cardCode?: string | null;
  stockAvailable?: number | null;
  reservedForCampaign?: number | null;
};

export type PrizeStockShortage = {
  cardId: string;
  label: string;
  requiredUnits: number;
  availableUnits: number;
  reservedUnits: number;
  usableUnits: number;
  shortageUnits: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isStockReadinessAdminHidden(metadata: unknown) {
  return isRecord(metadata) && metadata.adminHidden === true;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function stockCardIdForPrize(prize: StockReadinessPrize) {
  return stringOrEmpty(prize.cardId ?? prize.card_id);
}

export function stockUnitsForPrize(prize: StockReadinessPrize) {
  return Math.max(
    0,
    Math.round(
      numberOrZero(
        prize.quantity ?? prize.plannedQuantity ?? prize.planned_quantity,
      ),
    ),
  );
}

function labelForPrize(
  cardId: string,
  prize: StockReadinessPrize | undefined,
  summary: PrizeStockSummary | undefined,
) {
  const code = stringOrEmpty(summary?.cardCode ?? prize?.cardCode);
  const name = stringOrEmpty(summary?.cardName ?? prize?.cardName);
  return [code, name].filter(Boolean).join(" - ") || cardId;
}

export function buildPrizeStockShortages({
  ignoreAdminHidden = true,
  includeReservedForCampaign = false,
  prizes,
  stockSummaries,
}: {
  ignoreAdminHidden?: boolean;
  includeReservedForCampaign?: boolean;
  prizes: StockReadinessPrize[];
  stockSummaries: PrizeStockSummary[];
}) {
  const requiredByCardId = new Map<string, number>();
  const prizeByCardId = new Map<string, StockReadinessPrize>();

  for (const prize of prizes) {
    if (ignoreAdminHidden && isStockReadinessAdminHidden(prize.metadata)) {
      continue;
    }
    const cardId = stockCardIdForPrize(prize);
    const quantity = stockUnitsForPrize(prize);
    if (!cardId || quantity <= 0) continue;
    requiredByCardId.set(cardId, (requiredByCardId.get(cardId) ?? 0) + quantity);
    if (!prizeByCardId.has(cardId)) prizeByCardId.set(cardId, prize);
  }

  const summaryByCardId = new Map(
    stockSummaries.map((summary) => [summary.cardId, summary]),
  );

  return Array.from(requiredByCardId.entries()).flatMap(
    ([cardId, requiredUnits]) => {
      const summary = summaryByCardId.get(cardId);
      const availableUnits = Math.max(
        0,
        Math.round(numberOrZero(summary?.stockAvailable)),
      );
      const reservedUnits = includeReservedForCampaign
        ? Math.max(
            0,
            Math.round(numberOrZero(summary?.reservedForCampaign)),
          )
        : 0;
      const usableUnits = availableUnits + reservedUnits;
      if (requiredUnits <= usableUnits) return [];
      return [
        {
          cardId,
          label: labelForPrize(cardId, prizeByCardId.get(cardId), summary),
          requiredUnits,
          availableUnits,
          reservedUnits,
          usableUnits,
          shortageUnits: requiredUnits - usableUnits,
        },
      ];
    },
  );
}

export function stockShortageMessage(shortage: PrizeStockShortage) {
  const availableText =
    shortage.reservedUnits > 0
      ? `${shortage.usableUnits.toLocaleString()} usable stock units (${shortage.availableUnits.toLocaleString()} global available + ${shortage.reservedUnits.toLocaleString()} already reserved for this pack)`
      : `${shortage.availableUnits.toLocaleString()} global stock units`;
  return `Card "${shortage.label}" needs ${shortage.requiredUnits.toLocaleString()} prize units but only ${availableText} are available.`;
}

export function stockShortageBlockers(shortages: PrizeStockShortage[]) {
  return shortages.map(stockShortageMessage);
}
