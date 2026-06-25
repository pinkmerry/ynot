export const defaultBundleQuantity = 1;
export const maxBundleQuantity = 100;

export function normalizeBundleQuantity(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : defaultBundleQuantity;
  if (!Number.isFinite(numeric)) return defaultBundleQuantity;
  const integer = Math.trunc(numeric);
  if (integer < defaultBundleQuantity) return defaultBundleQuantity;
  if (integer > maxBundleQuantity) return maxBundleQuantity;
  return integer;
}

export function publicBundleQuantity(value: unknown): number | undefined {
  const normalized = normalizeBundleQuantity(value);
  return normalized > defaultBundleQuantity ? normalized : undefined;
}

export function publicPlannedQuantityBadge(value: unknown): number | undefined {
  const planned = plannedQuantityForPrize({ quantity: value });
  if (planned <= defaultBundleQuantity) return undefined;
  return planned;
}

export function plannedQuantityForPrize(prize: {
  quantity?: unknown;
  plannedQuantity?: unknown;
  planned_quantity?: unknown;
}): number {
  const raw = prize.quantity ?? prize.plannedQuantity ?? prize.planned_quantity ?? 0;
  const numeric = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export function bundledStockUnitRequirement(prize: {
  quantity?: unknown;
  plannedQuantity?: unknown;
  planned_quantity?: unknown;
  bundleQuantity?: unknown;
  bundle_quantity?: unknown;
}): number {
  const planned = plannedQuantityForPrize(prize);
  const bundle = normalizeBundleQuantity(prize.bundleQuantity ?? prize.bundle_quantity);
  return planned * bundle;
}

export function stockUnitsToWinSlots(
  stockUnits: unknown,
  bundleQuantity: unknown,
  plannedQuantity?: unknown,
): number {
  const physical =
    typeof stockUnits === "number"
      ? stockUnits
      : Number.parseInt(String(stockUnits ?? 0), 10);
  if (!Number.isFinite(physical) || physical <= 0) return 0;
  const slots = Math.floor(
    Math.trunc(physical) / normalizeBundleQuantity(bundleQuantity),
  );
  if (plannedQuantity === undefined) return slots;
  const planned = plannedQuantityForPrize({ quantity: plannedQuantity });
  return Math.min(slots, planned);
}

export function bundledConvertCoinValue(
  perUnitConvertCoinValue: unknown,
  bundleQuantity: unknown,
): number {
  const perUnit =
    typeof perUnitConvertCoinValue === "number"
      ? perUnitConvertCoinValue
      : Number.parseInt(String(perUnitConvertCoinValue ?? 0), 10);
  if (!Number.isFinite(perUnit) || perUnit <= 0) return 0;
  return Math.trunc(perUnit) * normalizeBundleQuantity(bundleQuantity);
}
