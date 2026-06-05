import {
  bundledStockUnitRequirement,
  normalizeBundleQuantity,
  plannedQuantityForPrize,
} from "./bundle-quantity";

export type StockReadinessPrize = {
  cardId?: string | null;
  card_id?: string | null;
  cardName?: string | null;
  cardCode?: string | null;
  quantity?: number | string | null;
  plannedQuantity?: number | string | null;
  planned_quantity?: number | string | null;
  bundleQuantity?: number | string | null;
  bundle_quantity?: number | string | null;
  metadata?: unknown;
};

export type PrizeStockSummary = {
  cardId: string;
  cardName?: string | null;
  cardCode?: string | null;
  stockAvailable?: number | null;
  reservedForCampaign?: number | null;
  stockSkuGroups?: PrizeStockSkuSummary[];
};

export type PrizeStockSkuSummary = {
  key: string;
  sku?: string | null;
  label?: string | null;
  availableUnits?: number | null;
  reservedForCampaign?: number | null;
};

export type PrizeStockShortage = {
  cardId: string;
  stockUnitGroupKey?: string;
  stockSku?: string | null;
  label: string;
  requiredUnits: number;
  availableUnits: number;
  reservedUnits: number;
  usableUnits: number;
  shortageUnits: number;
};

export type PrizeStockSelectionIssue = {
  cardId: string;
  label: string;
  availableSubSkuCount: number;
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

export function bundleQuantityForPrize(prize: StockReadinessPrize) {
  return normalizeBundleQuantity(prize.bundleQuantity ?? prize.bundle_quantity);
}

export function stockUnitsForPrize(prize: StockReadinessPrize) {
  const planned = plannedQuantityForPrize(prize);
  const bundle = bundleQuantityForPrize(prize);
  return bundledStockUnitRequirement({
    ...prize,
    quantity: planned,
    bundleQuantity: bundle,
  });
}

function labelForPrize(
  cardId: string,
  prize: StockReadinessPrize | undefined,
  summary: PrizeStockSummary | undefined,
  stockGroup?: PrizeStockSkuSummary | undefined,
) {
  const code = stringOrEmpty(summary?.cardCode ?? prize?.cardCode);
  const name = stringOrEmpty(summary?.cardName ?? prize?.cardName);
  const cardLabel = [code, name].filter(Boolean).join(" - ") || cardId;
  const stockLabel = stringOrEmpty(
    stockGroup?.label ?? stockSelectionLabelForPrize(prize),
  );
  return stockLabel ? `${cardLabel} / ${stockLabel}` : cardLabel;
}

function stockSelectionMetadata(prize: StockReadinessPrize | undefined) {
  return isRecord(prize?.metadata) ? prize.metadata : null;
}

function stockSelectionLabelForPrize(prize: StockReadinessPrize | undefined) {
  const metadata = stockSelectionMetadata(prize);
  return stringOrEmpty(metadata?.stockLabel);
}

function stockGroupKeyFromFilter(filter: unknown) {
  if (!isRecord(filter)) return "";
  const condition = stringOrEmpty(filter.condition);
  if (!condition) return "";
  return [
    condition,
    stringOrEmpty(filter.grade),
    stringOrEmpty(filter.gradingService),
    stringOrEmpty(filter.certNumber),
    stringOrEmpty(filter.gemrateId),
  ].join("\u001f");
}

function stockGroupKeyForPrize(prize: StockReadinessPrize) {
  const metadata = stockSelectionMetadata(prize);
  if (!metadata) return "";
  return (
    stringOrEmpty(metadata.stockUnitGroupKey) ||
    stockGroupKeyFromFilter(metadata.stockUnitFilter)
  );
}

export function buildPrizeStockSelectionIssues({
  ignoreAdminHidden = true,
  prizes,
  stockSummaries,
}: {
  ignoreAdminHidden?: boolean;
  prizes: StockReadinessPrize[];
  stockSummaries: PrizeStockSummary[];
}) {
  const summaryByCardId = new Map(
    stockSummaries.map((summary) => [summary.cardId, summary]),
  );
  const seen = new Set<string>();

  return prizes.flatMap((prize): PrizeStockSelectionIssue[] => {
    if (ignoreAdminHidden && isStockReadinessAdminHidden(prize.metadata)) {
      return [];
    }
    const cardId = stockCardIdForPrize(prize);
    const quantity = plannedQuantityForPrize(prize);
    if (!cardId || quantity <= 0 || stockGroupKeyForPrize(prize)) return [];

    const summary = summaryByCardId.get(cardId);
    const stockSkuGroups = summary?.stockSkuGroups ?? [];
    if (!stockSkuGroups.length || seen.has(cardId)) return [];
    seen.add(cardId);

    return [
      {
        cardId,
        label: labelForPrize(cardId, prize, summary),
        availableSubSkuCount: stockSkuGroups.length,
      },
    ];
  });
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
  const requiredByTarget = new Map<string, number>();
  const prizeByTarget = new Map<string, StockReadinessPrize>();

  for (const prize of prizes) {
    if (ignoreAdminHidden && isStockReadinessAdminHidden(prize.metadata)) {
      continue;
    }
    const cardId = stockCardIdForPrize(prize);
    const quantity = stockUnitsForPrize(prize);
    if (!cardId || quantity <= 0) continue;
    const groupKey = stockGroupKeyForPrize(prize);
    const targetKey = `${cardId}\u001e${groupKey}`;
    requiredByTarget.set(targetKey, (requiredByTarget.get(targetKey) ?? 0) + quantity);
    if (!prizeByTarget.has(targetKey)) prizeByTarget.set(targetKey, prize);
  }

  const summaryByCardId = new Map(
    stockSummaries.map((summary) => [summary.cardId, summary]),
  );

  return Array.from(requiredByTarget.entries()).flatMap(
    ([targetKey, requiredUnits]) => {
      const [cardId, groupKey = ""] = targetKey.split("\u001e");
      const prize = prizeByTarget.get(targetKey);
      const summary = summaryByCardId.get(cardId);
      const stockGroup = groupKey
        ? summary?.stockSkuGroups?.find((group) => group.key === groupKey)
        : undefined;
      const availableUnits = Math.max(
        0,
        Math.round(
          numberOrZero(
            groupKey ? stockGroup?.availableUnits : summary?.stockAvailable,
          ),
        ),
      );
      const reservedUnits = includeReservedForCampaign
        ? Math.max(
            0,
            Math.round(
              numberOrZero(
                groupKey
                  ? stockGroup?.reservedForCampaign
                  : summary?.reservedForCampaign,
              ),
            ),
          )
        : 0;
      const usableUnits = availableUnits + reservedUnits;
      if (requiredUnits <= usableUnits) return [];
      return [
        {
          cardId,
          ...(groupKey ? { stockUnitGroupKey: groupKey } : {}),
          stockSku:
            stockGroup?.sku ?? stringOrEmpty(stockSelectionMetadata(prize)?.stockSku) ?? null,
          label: labelForPrize(cardId, prize, summary, stockGroup),
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

export function stockSelectionIssueMessage(issue: PrizeStockSelectionIssue) {
  return `Card "${issue.label}" must select one stock sub-SKU before it can be used in a random pack.`;
}

export function stockSelectionBlockers(issues: PrizeStockSelectionIssue[]) {
  return issues.map(stockSelectionIssueMessage);
}
