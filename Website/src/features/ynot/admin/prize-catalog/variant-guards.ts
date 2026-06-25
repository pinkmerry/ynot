import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { YnotPrizePoolItem } from "@/features/ynot/types";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

/**
 * Check whether a variant is referenced ("loaded") by any campaign prize.
 * A variant is loaded if any prize's `intendedStockSku`, `intendedStockUnitKey`,
 * or `stockUnitUsages[].sku` / `stockUnitUsages[].actualStockSkuId` matches
 * the group's sku, key, or stockSkuId.
 *
 * Shared between EditVariantModal and PrizeCatalogScreen so the logic
 * stays DRY across the full-edit modal and the quick-remove action.
 */
export function isVariantLoadedInCampaign(
  group: StockSkuGroupElement,
  prizes: YnotPrizePoolItem[],
): boolean {
  if (prizes.length === 0) return false;
  const groupSku = group.sku;
  const groupSkuId = group.stockSkuId ?? null;
  const groupKey = group.key;

  return prizes.some((prize) => {
    // Check intendedStockSku (sku string match)
    if (prize.intendedStockSku && prize.intendedStockSku === groupSku) return true;
    // Check intendedStockUnitKey (group key match)
    if (prize.intendedStockUnitKey && prize.intendedStockUnitKey === groupKey) return true;
    // Check stockUnitUsages array for sku or actualStockSkuId
    if (prize.stockUnitUsages) {
      return prize.stockUnitUsages.some(
        (usage) =>
          usage.sku === groupSku ||
          (groupSkuId && usage.actualStockSkuId === groupSkuId),
      );
    }
    return false;
  });
}
