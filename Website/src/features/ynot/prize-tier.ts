export type PrizeDisplayTier = "rainbow" | "gold" | "silver" | "bronze";
export type PublicPrizeDisplayTier = PrizeDisplayTier | "last_prize";

export type PrizeTierAnimationConfig = {
  durationMs: number;
  ringColor: string;
  glowColor: string;
  particleCount: number;
  screenShake: boolean;
  holdToContinue: boolean;
};

type PrizeDisplayTierOption<T extends PublicPrizeDisplayTier = PrizeDisplayTier> = {
  value: T;
  label: string;
  shortLabel: string;
  dbTier: "high" | "normal";
  defaultCount: number;
  defaultQuantity: number;
  defaultWeight: number;
  defaultUnlockAtSoldPct: number;
  allowsRandomPsa10: boolean;
  animation: PrizeTierAnimationConfig;
};

export const prizeDisplayTierOptions: Array<PrizeDisplayTierOption> = [
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

const lastPrizeDisplayTierOption: PrizeDisplayTierOption<"last_prize"> = {
  value: "last_prize",
  label: "Last Prize",
  shortLabel: "LP",
  dbTier: "normal",
  defaultCount: 0,
  defaultQuantity: 1,
  defaultWeight: 0,
  defaultUnlockAtSoldPct: 100,
  allowsRandomPsa10: false,
  animation: {
    durationMs: 4900,
    ringColor: "linear-gradient(135deg,#fff0a8 0%,#ffd76a 35%,#e0a316 100%)",
    glowColor: "rgba(224,163,22,0.9)",
    particleCount: 72,
    screenShake: true,
    holdToContinue: true,
  },
};

export function prizeDisplayTierValue(value: unknown): PrizeDisplayTier {
  if (prizeDisplayTierValues.includes(value as PrizeDisplayTier)) {
    return value as PrizeDisplayTier;
  }
  if (value === "top") return "rainbow";
  if (value === "high") return "gold";
  if (value === "normal") return "bronze";
  return "bronze";
}

export function publicPrizeDisplayTierValue(value: unknown): PublicPrizeDisplayTier {
  if (value === "last_prize") return "last_prize";
  return prizeDisplayTierValue(value);
}

export function prizeDisplayTierLabel(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return (
    prizeDisplayTierOptions.find((option) => option.value === tier)?.label ??
    "Bronze"
  );
}

export function publicPrizeDisplayTierLabel(value: unknown) {
  const tier = publicPrizeDisplayTierValue(value);
  if (tier === "last_prize") return lastPrizeDisplayTierOption.label;
  return prizeDisplayTierLabel(tier);
}

export function prizeDisplayTierConfig(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return (
    prizeDisplayTierOptions.find((option) => option.value === tier) ??
    prizeDisplayTierOptions[prizeDisplayTierOptions.length - 1]
  );
}

export function publicPrizeDisplayTierConfig(
  value: unknown,
): PrizeDisplayTierOption<PublicPrizeDisplayTier> {
  const tier = publicPrizeDisplayTierValue(value);
  if (tier === "last_prize") return lastPrizeDisplayTierOption;
  return prizeDisplayTierConfig(tier);
}

export function prizeDisplayTierOrder(value: unknown) {
  const tier = prizeDisplayTierValue(value);
  return Math.max(
    0,
    prizeDisplayTierOptions.findIndex((option) => option.value === tier),
  );
}

export function publicPrizeDisplayTierOrder(value: unknown) {
  const tier = publicPrizeDisplayTierValue(value);
  if (tier === "last_prize") return -1;
  return prizeDisplayTierOrder(tier);
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

export function highestPublicPrizeDisplayTier(
  values: ReadonlyArray<unknown>,
): PublicPrizeDisplayTier {
  if (!values.length) return "bronze";
  return values.reduce<PublicPrizeDisplayTier>((best, candidate) => {
    const candidateTier = publicPrizeDisplayTierValue(candidate);
    return publicPrizeDisplayTierOrder(candidateTier) < publicPrizeDisplayTierOrder(best)
      ? candidateTier
      : best;
  }, "bronze");
}
