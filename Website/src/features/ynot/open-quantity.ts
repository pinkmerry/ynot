export const allowedOpenQuantityOptions = [1, 10, 100] as const;
export const defaultOpenQuantityOptions = [...allowedOpenQuantityOptions];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeOpenQuantityOptions(value: unknown): number[] {
  const source =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.openQuantityOptions)
        ? value.openQuantityOptions
        : defaultOpenQuantityOptions;
  const options = source
    .map((option) => Math.max(1, Math.min(100, Math.round(Number(option)))))
    .filter((option) => Number.isFinite(option))
    .filter((option) =>
      allowedOpenQuantityOptions.includes(
        option as (typeof allowedOpenQuantityOptions)[number],
      ),
    )
    .filter((option, index, all) => all.indexOf(option) === index)
    .sort((left, right) => left - right)
    .slice(0, allowedOpenQuantityOptions.length);
  return options.length ? options : defaultOpenQuantityOptions;
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown) {
  const numeric = optionalFiniteNumber(value);
  if (numeric === undefined) return 0;
  return Math.max(0, Math.floor(numeric));
}

export type FinalPrizeOpenabilityInput = {
  remainingSlots?: number;
  normalOpenableWinSlots?: number;
  finalPrizeAvailableUnits?: number;
};

export function finalPrizeAwareOpenableWinSlots({
  remainingSlots,
  normalOpenableWinSlots,
  finalPrizeAvailableUnits = 0,
}: FinalPrizeOpenabilityInput) {
  const remaining = optionalFiniteNumber(remainingSlots);
  const normal = nonNegativeInteger(normalOpenableWinSlots);
  const finalPrize = nonNegativeInteger(finalPrizeAvailableUnits) > 0 ? 1 : 0;

  if (remaining === undefined) return normal + finalPrize;

  const safeRemaining = Math.max(0, Math.floor(remaining));
  if (safeRemaining <= 0) return 0;

  const normalOnly = Math.min(safeRemaining, normal);
  const canFinishWithFinalPrize =
    finalPrize > 0 && safeRemaining <= normal + finalPrize;

  return canFinishWithFinalPrize
    ? Math.min(safeRemaining, normal + finalPrize)
    : normalOnly;
}

export type OpenQuantityLimitInput = FinalPrizeOpenabilityInput & {
  remainingSlots?: number;
  eligibleUnits?: number;
  eligiblePrizeUnits?: number;
  availableWinSlots?: number;
  availablePrizeUnits?: number;
};

export function openQuantityLimit(input: OpenQuantityLimitInput) {
  if (
    optionalFiniteNumber(input.normalOpenableWinSlots) !== undefined ||
    optionalFiniteNumber(input.finalPrizeAvailableUnits) !== undefined
  ) {
    return finalPrizeAwareOpenableWinSlots(input);
  }

  const remaining = optionalFiniteNumber(input.remainingSlots);
  const inventory =
    optionalFiniteNumber(input.eligibleUnits) ??
    optionalFiniteNumber(input.eligiblePrizeUnits) ??
    optionalFiniteNumber(input.availableWinSlots) ??
    optionalFiniteNumber(input.availablePrizeUnits);

  if (remaining === undefined && inventory === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  if (remaining !== undefined && inventory === undefined) {
    return 0;
  }

  const safeRemaining =
    remaining === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(remaining));
  const safeInventory =
    inventory === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(inventory));

  return Math.min(safeRemaining, safeInventory);
}

export function isOpenQuantityAvailable(
  quantity: number,
  input: OpenQuantityLimitInput,
) {
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  return safeQuantity <= openQuantityLimit(input);
}
