export type PrizeDisplayTier = "rainbow" | "gold" | "silver" | "bronze";

export type PrizeTierAnimationConfig = {
  durationMs: number;
  ringColor: string;
  glowColor: string;
  particleCount: number;
  screenShake: boolean;
  holdToContinue: boolean;
};

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
  animation: PrizeTierAnimationConfig;
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
    animation: {
      durationMs: 4500,
      ringColor: "linear-gradient(135deg,#ff3df0 0%,#ffd93d 25%,#3dffb1 50%,#3db1ff 75%,#a23dff 100%)",
      glowColor: "rgba(255,217,61,0.9)",
      particleCount: 60,
      screenShake: true,
      holdToContinue: true,
    },
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
    animation: {
      durationMs: 3000,
      ringColor: "linear-gradient(135deg,#ffe66e 0%,#ffb84d 50%,#ff8c1a 100%)",
      glowColor: "rgba(255,184,77,0.85)",
      particleCount: 30,
      screenShake: true,
      holdToContinue: false,
    },
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
    animation: {
      durationMs: 2000,
      ringColor: "linear-gradient(135deg,#e8eef2 0%,#a8b3bd 100%)",
      glowColor: "rgba(232,238,242,0.7)",
      particleCount: 12,
      screenShake: false,
      holdToContinue: false,
    },
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
    animation: {
      durationMs: 1500,
      ringColor: "linear-gradient(135deg,#c98e5c 0%,#8a5a36 100%)",
      glowColor: "rgba(201,142,92,0.55)",
      particleCount: 0,
      screenShake: false,
      holdToContinue: false,
    },
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

export function prizeTierAnimationConfig(value: unknown) {
  return prizeDisplayTierConfig(value).animation;
}

export function highestPrizeDisplayTier(
  values: ReadonlyArray<unknown>,
): PrizeDisplayTier {
  if (!values.length) return "bronze";
  return values.reduce<PrizeDisplayTier>((best, candidate) => {
    const candidateTier = prizeDisplayTierValue(candidate);
    return prizeDisplayTierOrder(candidateTier) < prizeDisplayTierOrder(best)
      ? candidateTier
      : best;
  }, "bronze");
}
