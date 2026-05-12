export type PrizeDisplayTier = "rainbow" | "gold" | "silver" | "bronze";

export const prizeDisplayTierOptions: Array<{
  value: PrizeDisplayTier;
  label: string;
  shortLabel: string;
  dbTier: "high" | "normal";
  defaultCount: number;
  defaultQuantity: number;
  defaultWeight: number;
  defaultUnlockAtSoldPct: number;
  allowsRandomPsa10: boolean;
}> = [
  {
    value: "rainbow",
    label: "Rainbow",
    shortLabel: "RB",
    dbTier: "high",
    defaultCount: 1,
    defaultQuantity: 1,
    defaultWeight: 0.25,
    defaultUnlockAtSoldPct: 30,
    allowsRandomPsa10: false,
  },
  {
    value: "gold",
    label: "Gold",
    shortLabel: "G",
    dbTier: "high",
    defaultCount: 2,
    defaultQuantity: 1,
    defaultWeight: 0.5,
    defaultUnlockAtSoldPct: 20,
    allowsRandomPsa10: false,
  },
  {
    value: "silver",
    label: "Silver",
    shortLabel: "S",
    dbTier: "high",
    defaultCount: 10,
    defaultQuantity: 1,
    defaultWeight: 1,
    defaultUnlockAtSoldPct: 0,
    allowsRandomPsa10: false,
  },
  {
    value: "bronze",
    label: "Bronze",
    shortLabel: "B",
    dbTier: "normal",
    defaultCount: 1,
    defaultQuantity: 1,
    defaultWeight: 10,
    defaultUnlockAtSoldPct: 0,
    allowsRandomPsa10: true,
  },
];

export const prizeDisplayTierValues = prizeDisplayTierOptions.map(
  (option) => option.value,
);

export function prizeDisplayTierValue(value: unknown): PrizeDisplayTier {
  if (prizeDisplayTierValues.includes(value as PrizeDisplayTier)) {
    return value as PrizeDisplayTier;
  }
  if (value === "top") return "rainbow";
  if (value === "high") return "gold";
  if (value === "normal") return "bronze";
  return "bronze";
}

export function prizeDisplayTierLabel(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return (
    prizeDisplayTierOptions.find((option) => option.value === tier)?.label ??
    "Bronze"
  );
}

export function prizeDisplayTierConfig(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return (
    prizeDisplayTierOptions.find((option) => option.value === tier) ??
    prizeDisplayTierOptions[prizeDisplayTierOptions.length - 1]
  );
}

export function prizeDisplayTierOrder(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return Math.max(
    0,
    prizeDisplayTierOptions.findIndex((option) => option.value === tier),
  );
}

export function dbTierForPrizeDisplayTier(value: unknown) {
  return prizeDisplayTierConfig(value).dbTier;
}

export function canPrizeDisplayTierUseRandomPsa10(value: unknown) {
  return prizeDisplayTierConfig(value).allowsRandomPsa10;
}
