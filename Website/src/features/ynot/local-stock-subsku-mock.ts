export type LocalStockSubSkuKind = "box" | "pack" | "card";

export type LocalStockSubSku = {
  id: string;
  sku: string;
  label: string;
  unitKind: LocalStockSubSkuKind;
  imageUrl: string;
  childStockSkuId?: string;
  childQuantity?: number;
};

export type LocalStockReward = {
  id: string;
  cardName: string;
  cardCode: string;
  tier: "rainbow" | "gold" | "silver" | "bronze";
  sourceStockSkuId: string;
  sourceStockSku: string;
  imageUrl: string;
  pullNumber: number;
};

export type LocalStockSubSkuState = {
  boxStock: number;
  loosePackStock: number;
  openedBoxCount: number;
  soldPackCount: number;
  pullNumber: number;
  bag: LocalStockReward[];
  history: LocalStockReward[];
  events: string[];
};

export type LocalStockTotals = {
  availableBoxes: number;
  availableLoosePacks: number;
  availablePackEquivalent: number;
  boxPackEquivalent: number;
  openedBoxCount: number;
  soldPackCount: number;
  bagCount: number;
};

export const localStockSubSkus = {
  box: {
    id: "local-op16-box-sku",
    sku: "OP16-JP-BOX",
    label: "OP16 Japanese Booster Box",
    unitKind: "box",
    imageUrl: "/ynot-pack-pokemon.jpg",
    childStockSkuId: "local-op16-pack-sku",
    childQuantity: 24,
  },
  pack: {
    id: "local-op16-pack-sku",
    sku: "OP16-JP-PACK",
    label: "OP16 Japanese Booster Pack",
    unitKind: "pack",
    imageUrl: "/ynot-open-pack-bg-removed.png",
  },
} satisfies Record<"box" | "pack", LocalStockSubSku>;

export const localStockSubSkuInitialState: LocalStockSubSkuState = {
  boxStock: 2,
  loosePackStock: 10,
  openedBoxCount: 0,
  soldPackCount: 0,
  pullNumber: 0,
  bag: [],
  history: [],
  events: [
    "Start: 2 sealed boxes x 24 packs plus 10 loose packs = 58 packs available.",
  ],
};

export const localStockRewardPool = [
  {
    cardName: "Charizard ex SAR",
    cardCode: "SV4A-349",
    tier: "rainbow",
    imageUrl: "/test-assets/ynot-test-card-gold.svg",
  },
  {
    cardName: "Pikachu Master Ball Reverse",
    cardCode: "SV2A-025",
    tier: "gold",
    imageUrl: "/test-assets/ynot-test-card-blue.svg",
  },
  {
    cardName: "Luffy Leader Parallel",
    cardCode: "OP16-001",
    tier: "silver",
    imageUrl: "/test-assets/ynot-test-pack-one-piece.svg",
  },
  {
    cardName: "OP16 Base Reward",
    cardCode: "OP16-BASE",
    tier: "bronze",
    imageUrl: "/test-assets/ynot-test-pack-pokemon.svg",
  },
] satisfies Array<Omit<LocalStockReward, "id" | "pullNumber" | "sourceStockSku" | "sourceStockSkuId">>;

function cleanCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function cloneState(state: LocalStockSubSkuState): LocalStockSubSkuState {
  return {
    ...state,
    bag: [...state.bag],
    history: [...state.history],
    events: [...state.events],
  };
}

export function localStockSubSkuTotals(
  state: LocalStockSubSkuState,
): LocalStockTotals {
  const availableBoxes = cleanCount(state.boxStock);
  const availableLoosePacks = cleanCount(state.loosePackStock);
  const packsPerBox = cleanCount(localStockSubSkus.box.childQuantity);
  const boxPackEquivalent = availableBoxes * packsPerBox;
  return {
    availableBoxes,
    availableLoosePacks,
    availablePackEquivalent: boxPackEquivalent + availableLoosePacks,
    boxPackEquivalent,
    openedBoxCount: cleanCount(state.openedBoxCount),
    soldPackCount: cleanCount(state.soldPackCount),
    bagCount: state.bag.length,
  };
}

export function openLocalStockBoxes(
  state: LocalStockSubSkuState,
  quantity: number,
) {
  const next = cloneState(state);
  const openCount = Math.min(cleanCount(quantity), next.boxStock);
  if (openCount <= 0) {
    next.events.unshift("No sealed box is available to open.");
    return next;
  }
  const createdPacks = openCount * cleanCount(localStockSubSkus.box.childQuantity);
  next.boxStock -= openCount;
  next.loosePackStock += createdPacks;
  next.openedBoxCount += openCount;
  next.events.unshift(
    `Opened ${openCount} box${openCount === 1 ? "" : "es"} into ${createdPacks} packs.`,
  );
  return next;
}

function rewardForPull(pullNumber: number): LocalStockReward {
  const base = localStockRewardPool[(pullNumber - 1) % localStockRewardPool.length];
  return {
    ...base,
    id: `local-pull-${pullNumber}`,
    pullNumber,
    sourceStockSkuId: localStockSubSkus.pack.id,
    sourceStockSku: localStockSubSkus.pack.sku,
  };
}

export function openLocalStockPacks(
  state: LocalStockSubSkuState,
  quantity: number,
) {
  let next = cloneState(state);
  const requested = cleanCount(quantity);
  if (requested <= 0) return next;

  while (next.loosePackStock < requested && next.boxStock > 0) {
    next = openLocalStockBoxes(next, 1);
  }

  const openedPacks = Math.min(requested, next.loosePackStock);
  if (openedPacks <= 0) {
    next.events.unshift("No pack stock is available to sell or open.");
    return next;
  }

  const rewards = Array.from({ length: openedPacks }, () => {
    const pullNumber = next.pullNumber + 1;
    next.pullNumber = pullNumber;
    return rewardForPull(pullNumber);
  });
  next.loosePackStock -= openedPacks;
  next.soldPackCount += openedPacks;
  next.bag = [...rewards, ...next.bag];
  next.history = [...rewards, ...next.history];
  next.events.unshift(
    `Sold/opened ${openedPacks} pack${openedPacks === 1 ? "" : "s"} from ${localStockSubSkus.pack.sku}.`,
  );
  return next;
}
