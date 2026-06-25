import "server-only";

import { addressActionToken } from "@/lib/ynot/address-action-tokens";
import { collectionItemActionToken } from "@/lib/ynot/collection-action-tokens";
import type {
  YnotAddress,
  YnotCollectionItem,
  YnotExchangeOrder,
  YnotGachaOpenHistory,
  YnotGachaOpenResult,
  YnotPublicPrizeDisplayTier,
  YnotRewardFulfillmentPolicy,
  YnotShippingItem,
  YnotShippingRequest,
} from "./types";

export const LOCAL_PREVIEW_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
export const LOCAL_PREVIEW_SOLD_STATE_COOKIE = "ynot-preview-sold-state";
export const LOCAL_PREVIEW_WALLET_BALANCE = 50_000;

type PreviewOpenInput = {
  campaignSlug?: string | null;
  campaignTitle?: string | null;
  profileId: string;
  result: YnotGachaOpenResult;
};

type PreviewAddressInput = {
  addressLine1: string;
  addressLine2?: string | null;
  country: string;
  deliveryNote?: string | null;
  district?: string | null;
  isDefault: boolean;
  label: string;
  phone?: string | null;
  postalCode?: string | null;
  province?: string | null;
  recipientName?: string | null;
  subdistrict?: string | null;
};

type PreviewConversionQuote = {
  collectionItemIds: string[];
  expiresAt: string;
  itemCount: number;
  profileId: string;
  quoteToken: string;
  selectionMode: "selected" | "all_eligible";
  totalCoins: number;
};

type PreviewConversionJob = {
  jobId: string;
  status: "completed";
  itemCount: number;
  totalCoins: number;
  convertedCount: number;
  creditedTotalCoins: number;
  completed: true;
  replayed: false;
};

type PreviewShippingQuote = {
  address: {
    label: string | null;
    recipientName: string | null;
    phone: string | null;
    summary: string | null;
  };
  addressId: string;
  collectionItemIds: string[];
  expiresAt: string;
  itemCount: number;
  minimumCoinValue: number;
  note: string | null;
  profileId: string;
  quoteToken: string;
  selectedCoinValue: number;
  selectionMode: "selected" | "all_eligible";
  totalCoinValue: number;
};

type PreviewShippingJob = {
  completed: true;
  itemCount: number;
  jobId: string;
  preparedCount: number;
  publicCode: string;
  replayed: false;
  status: "submitted";
  totalCoinValue: number;
};

export type PreviewPullAllQuote = {
  campaignSlug: string;
  costPerReward: number;
  expiresAt: string;
  packTitle: string;
  profileId: string;
  soldPct: number;
  startToken: string;
  targetRewards: number;
  totalCostCoins: number;
};

type PreviewPullAllHighlight = {
  name: string;
  imageUrl: string | null;
  displayTier: YnotPublicPrizeDisplayTier;
  valueThb: number | null;
  isLastPrize?: boolean;
};

export type PreviewPullAllSession = {
  public_code: string;
  status: "completed";
  target_slots: number;
  processed_slots: number;
  open_items_awarded: number;
  collection_items_created: number;
  total_cost_coins: number;
  highlight_rewards_public: PreviewPullAllHighlight[];
  highlights_seen_at: string | null;
};

type PreviewRewardStore = {
  addressesByProfile: Map<string, YnotAddress[]>;
  bulkOpenQuotesByToken: Map<string, PreviewPullAllQuote>;
  bulkOpenSessionsByProfile: Map<string, PreviewPullAllSession[]>;
  collectionByProfile: Map<string, YnotCollectionItem[]>;
  conversionByQuoteToken: Map<string, PreviewConversionQuote>;
  currentConversionByProfile: Map<string, PreviewConversionJob>;
  exchangesByProfile: Map<string, YnotExchangeOrder[]>;
  historyByProfile: Map<string, YnotGachaOpenHistory[]>;
  openedSlotsByProfileCampaign: Map<string, number>;
  shippingByProfile: Map<string, YnotShippingRequest[]>;
  shippingByQuoteToken: Map<string, PreviewShippingQuote>;
  currentShippingByProfile: Map<string, PreviewShippingJob>;
  walletBonusCoinsByProfile: Map<string, number>;
};

const storeSymbol = Symbol.for("ynot.localPreviewRewardStore");
const previewAddressInternalId = "preview-address-home";

const defaultPreviewAddress: PreviewAddressInput = {
  label: "Local preview home",
  recipientName: "Preview User",
  phone: "080-000-0000",
  addressLine1: "123 Localhost Road",
  addressLine2: "Mock Building 8F",
  subdistrict: "Khlong Toei",
  district: "Khlong Toei",
  province: "Bangkok",
  postalCode: "10110",
  country: "Thailand",
  deliveryNote: "Local demo address only",
  isDefault: true,
};

function previewStore(): PreviewRewardStore {
  const globalRecord = globalThis as typeof globalThis & {
    [storeSymbol]?: Partial<PreviewRewardStore>;
  };
  const store = (globalRecord[storeSymbol] ??= {});

  store.addressesByProfile ??= new Map();
  store.bulkOpenQuotesByToken ??= new Map();
  store.bulkOpenSessionsByProfile ??= new Map();
  store.collectionByProfile ??= new Map();
  store.conversionByQuoteToken ??= new Map();
  store.currentConversionByProfile ??= new Map();
  store.exchangesByProfile ??= new Map();
  store.historyByProfile ??= new Map();
  store.openedSlotsByProfileCampaign ??= new Map();
  store.shippingByProfile ??= new Map();
  store.shippingByQuoteToken ??= new Map();
  store.currentShippingByProfile ??= new Map();
  store.walletBonusCoinsByProfile ??= new Map();

  return store as PreviewRewardStore;
}

function isPreviewProfile(profileId: string | undefined): profileId is string {
  return profileId === LOCAL_PREVIEW_PROFILE_ID;
}

function previewCampaignOpenKey(profileId: string, campaignSlug: string) {
  return `${profileId}:${campaignSlug}`;
}

function previewAfter60RemainingSlots(totalSlots: number) {
  const slots = Math.max(1, Math.floor(Number(totalSlots) || 100));
  return Math.max(1, Math.min(35, Math.floor(slots * 0.35)));
}

export function nextPreviewOpenRemaining({
  campaignSlug,
  profileId,
  quantity,
  totalSlots,
}: {
  campaignSlug: string;
  profileId: string;
  quantity: number;
  totalSlots: number;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const key = previewCampaignOpenKey(profileId, campaignSlug);
  const openedBefore = store.openedSlotsByProfileCampaign.get(key) ?? 0;
  const startingRemaining = previewAfter60RemainingSlots(totalSlots);
  const quantityToOpen = Math.max(0, Math.floor(quantity));
  const remainingBefore = Math.max(0, startingRemaining - openedBefore);
  const openedNow = Math.min(quantityToOpen, remainingBefore);
  const remainingAfter = Math.max(0, remainingBefore - openedNow);
  store.openedSlotsByProfileCampaign.set(key, openedBefore + openedNow);
  return {
    remainingSlots: remainingAfter,
    availablePrizeUnits: remainingAfter,
    eligibleUnits: remainingAfter,
    availableWinSlots: remainingAfter,
  };
}

function tierLabel(tier: YnotPublicPrizeDisplayTier | null | undefined) {
  if (!tier) return null;
  return tier
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function itemCoinValue(item: YnotCollectionItem) {
  const value = Number(item.convertCoinValue ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function previewConvertCoinValue(item: YnotGachaOpenResult["items"][number]) {
  const value = Number(item.valueThb ?? 0);
  if (Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  switch (item.displayTier) {
    case "last_prize":
    case "rainbow":
      return 500;
    case "gold":
      return 250;
    case "silver":
      return 100;
    case "bronze":
    default:
      return 25;
  }
}

function previewFulfillmentPolicy(
  convertCoinValue: number,
): YnotRewardFulfillmentPolicy {
  return convertCoinValue > 0 ? "ship_or_convert" : "ship_only";
}

function isConvertiblePreviewReward(item: YnotCollectionItem) {
  if (item.status !== "owned") return false;
  if (!item.canConvert) return false;
  if (itemCoinValue(item) <= 0) return false;
  if (!item.convertExpiresAt) return true;
  return Date.parse(item.convertExpiresAt) > Date.now();
}

async function toPreviewAddress(
  profileId: string,
  internalId: string,
  input: PreviewAddressInput,
): Promise<YnotAddress> {
  return {
    id: await addressActionToken(profileId, internalId),
    label: input.label,
    recipientName: input.recipientName ?? null,
    phone: input.phone ?? null,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    subdistrict: input.subdistrict ?? null,
    district: input.district ?? null,
    province: input.province ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    deliveryNote: input.deliveryNote ?? null,
    isDefault: input.isDefault,
  };
}

async function ensurePreviewAddresses(profileId: string) {
  const store = previewStore();
  const existing = store.addressesByProfile.get(profileId);
  if (existing?.length) return existing;

  const seeded = [
    await toPreviewAddress(
      profileId,
      previewAddressInternalId,
      defaultPreviewAddress,
    ),
  ];
  store.addressesByProfile.set(profileId, seeded);
  return seeded;
}

function selectedPreviewItems(
  profileId: string,
  collectionItemIds: string[],
) {
  const collection = previewStore().collectionByProfile.get(profileId) ?? [];
  const byId = new Map(collection.map((item) => [item.id, item]));
  const selected = collectionItemIds
    .map((id) => byId.get(id))
    .filter((item): item is YnotCollectionItem => Boolean(item));
  if (
    selected.length !== collectionItemIds.length ||
    selected.some((item) => item.status !== "owned" || !item.canShip)
  ) {
    throw new Error("collection_item_not_shippable");
  }
  return selected;
}

function shippablePreviewItemsForQuote(
  profileId: string,
  selectionMode: "selected" | "all_eligible",
  collectionItemIds: string[],
) {
  if (selectionMode === "all_eligible") {
    return (previewStore().collectionByProfile.get(profileId) ?? []).filter(
      (item) => item.status === "owned" && item.canShip,
    );
  }
  return selectedPreviewItems(profileId, collectionItemIds);
}

function previewShippingCoinValue(items: YnotCollectionItem[]) {
  return items.reduce((sum, item) => {
    if (item.fulfillmentPolicy !== "ship_or_convert") return sum;
    return sum + itemCoinValue(item);
  }, 0);
}

function previewShippingAddressSummary(address: YnotAddress) {
  const summary = [
    address.addressLine1,
    address.addressLine2,
    address.subdistrict,
    address.district,
    address.province,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    label: address.label ?? null,
    recipientName: address.recipientName ?? null,
    phone: address.phone ?? null,
    summary: summary || null,
  };
}

function updatePreviewCollectionItems(
  profileId: string,
  collectionItemIds: string[],
  status: YnotCollectionItem["status"],
) {
  const store = previewStore();
  const selectedIds = new Set(collectionItemIds);
  const collection = store.collectionByProfile.get(profileId) ?? [];
  store.collectionByProfile.set(
    profileId,
    collection.map((item) =>
      selectedIds.has(item.id) ? { ...item, status } : item,
    ),
  );
}

function previewShippingItem(item: YnotCollectionItem): YnotShippingItem {
  return {
    cardName: item.cardName,
    cardCode: item.cardCode ?? null,
    imageUrl: item.imageUrl ?? null,
    status: "shipping_requested",
    serialNo: item.serialNo ?? null,
    acquiredAt: item.acquiredAt,
    sourceCampaignTitle: item.sourceCampaignTitle ?? null,
    sourceCampaignSlug: item.sourceCampaignSlug ?? null,
    sourceOpenPosition: item.sourceOpenPosition ?? null,
    sourcePrizeTierLabel: item.sourcePrizeTierLabel ?? null,
    sourcePrizeValueThb: item.sourcePrizeValueThb ?? null,
  };
}

function previewSelectionForQuote(
  profileId: string,
  selectionMode: "selected" | "all_eligible",
  collectionItemIds: string[],
) {
  const collection = previewStore().collectionByProfile.get(profileId) ?? [];
  if (selectionMode === "all_eligible") {
    return collection.filter(isConvertiblePreviewReward);
  }
  const byId = new Map(collection.map((item) => [item.id, item]));
  const selected = collectionItemIds
    .map((id) => byId.get(id))
    .filter((item): item is YnotCollectionItem => Boolean(item));
  if (
    selected.length !== collectionItemIds.length ||
    selected.some((item) => !isConvertiblePreviewReward(item))
  ) {
    throw new Error("collection_items_not_convertible");
  }
  return selected;
}

export async function recordPreviewOpenResult({
  campaignSlug,
  campaignTitle,
  profileId,
  result,
}: PreviewOpenInput) {
  if (!isPreviewProfile(profileId) || !Array.isArray(result.items)) {
    return;
  }

  const store = previewStore();
  const now = new Date().toISOString();
  const publicCode = result.publicCode || `PREVIEW-${Date.now()}`;
  const title = campaignTitle || "Local preview pack";
  const slug = campaignSlug || null;
  const collectionRows = await Promise.all(
    result.items.map(async (item, index): Promise<YnotCollectionItem> => {
      const position = item.position ?? index + 1;
      const displayTier = item.displayTier ?? null;
      const internalItemId = crypto.randomUUID();
      const convertCoinValue = previewConvertCoinValue(item);
      const fulfillmentPolicy = previewFulfillmentPolicy(convertCoinValue);
      return {
        id: await collectionItemActionToken(profileId, internalItemId),
        cardName: item.name || "Mystery reward",
        imageUrl: item.imageUrl ?? null,
        bundleQuantity: item.bundleQuantity,
        status: "owned",
        serialNo: `${publicCode}-${String(position).padStart(3, "0")}`,
        acquiredAt: now,
        fulfillmentPolicy,
        canShip:
          fulfillmentPolicy === "ship_or_convert" ||
          fulfillmentPolicy === "ship_only",
        canConvert:
          fulfillmentPolicy === "ship_or_convert" ||
          fulfillmentPolicy === "convert_only",
        convertCoinValue,
        sourceCampaignTitle: title,
        sourceCampaignSlug: slug,
        sourcePrizeTier: displayTier,
        sourcePrizeTierLabel: tierLabel(displayTier),
        sourceIsLastPrize: item.isLastPrize === true,
        sourcePrizeValueThb: item.valueThb ?? null,
        sourceOpenPosition: position,
      };
    }),
  );

  const historyRow: YnotGachaOpenHistory = {
    id: publicCode,
    publicCode,
    campaignSlug: slug,
    campaignTitle: title,
    costCoins: result.costCoins ?? 0,
    quantity: result.items.length,
    status: "completed",
    openedAt: now,
    createdAt: now,
    rewards: result.items.map((item, index) => ({
      id: `${publicCode}-${item.position ?? index + 1}`,
      cardName: item.name || "Mystery reward",
      imageUrl: item.imageUrl ?? null,
      bundleQuantity: item.bundleQuantity,
      displayTier: item.displayTier ?? null,
      isLastPrize: item.isLastPrize === true,
      valueThb: item.valueThb ?? null,
      resultPosition: item.position ?? index + 1,
    })),
  };

  const existingCollection = store.collectionByProfile.get(profileId) ?? [];
  const existingHistory = store.historyByProfile.get(profileId) ?? [];
  store.collectionByProfile.set(profileId, [
    ...collectionRows,
    ...existingCollection,
  ].slice(0, 500));
  store.historyByProfile.set(profileId, [
    historyRow,
    ...existingHistory,
  ].slice(0, 100));
}

export async function seedPreviewRewardPolicySmokePack(
  profileId = LOCAL_PREVIEW_PROFILE_ID,
) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const now = new Date().toISOString();
  const publicCode = `POLICY-SMOKE-${Date.now()}`;
  const campaignTitle = "Reward Policy Smoke Pack";
  const campaignSlug = "reward-policy-smoke";
  const rewards: Array<{
    cardName: string;
    convertCoinValue: number;
    fulfillmentPolicy: YnotRewardFulfillmentPolicy;
    sourcePrizeTier: YnotPublicPrizeDisplayTier;
    sourcePrizeTierLabel: string;
  }> = [
    {
      cardName: "Smoke Ship Only Reward",
      convertCoinValue: 0,
      fulfillmentPolicy: "ship_only",
      sourcePrizeTier: "bronze",
      sourcePrizeTierLabel: "Bronze",
    },
    {
      cardName: "Smoke Sell Only Reward",
      convertCoinValue: 1200,
      fulfillmentPolicy: "convert_only",
      sourcePrizeTier: "silver",
      sourcePrizeTierLabel: "Silver",
    },
    {
      cardName: "Smoke Ship Or Sell Low Reward",
      convertCoinValue: 500,
      fulfillmentPolicy: "ship_or_convert",
      sourcePrizeTier: "gold",
      sourcePrizeTierLabel: "Gold",
    },
    {
      cardName: "Smoke Ship Or Sell High Reward",
      convertCoinValue: 1200,
      fulfillmentPolicy: "ship_or_convert",
      sourcePrizeTier: "rainbow",
      sourcePrizeTierLabel: "Rainbow",
    },
  ];
  const collectionRows = await Promise.all(
    rewards.map(async (reward, index): Promise<YnotCollectionItem> => {
      const position = index + 1;
      const internalItemId = crypto.randomUUID();
      return {
        id: await collectionItemActionToken(
          profileId,
          internalItemId,
        ),
        cardName: reward.cardName,
        imageUrl: null,
        status: "owned",
        serialNo: `${publicCode}-${String(position).padStart(3, "0")}`,
        acquiredAt: now,
        fulfillmentPolicy: reward.fulfillmentPolicy,
        canShip:
          reward.fulfillmentPolicy === "ship_or_convert" ||
          reward.fulfillmentPolicy === "ship_only",
        canConvert:
          reward.fulfillmentPolicy === "ship_or_convert" ||
          reward.fulfillmentPolicy === "convert_only",
        convertCoinValue: reward.convertCoinValue,
        sourceCampaignTitle: campaignTitle,
        sourceCampaignSlug: campaignSlug,
        sourcePrizeTier: reward.sourcePrizeTier,
        sourcePrizeTierLabel: reward.sourcePrizeTierLabel,
        sourceIsLastPrize: false,
        sourcePrizeValueThb: reward.convertCoinValue,
        sourceOpenPosition: position,
      };
    }),
  );

  const historyRow: YnotGachaOpenHistory = {
    id: publicCode,
    publicCode,
    campaignSlug,
    campaignTitle,
    costCoins: 0,
    quantity: collectionRows.length,
    status: "completed",
    openedAt: now,
    createdAt: now,
    rewards: collectionRows.map((item, index) => ({
      id: `${publicCode}-${index + 1}`,
      cardName: item.cardName,
      imageUrl: item.imageUrl ?? null,
      displayTier: item.sourcePrizeTier ?? "bronze",
      isLastPrize: false,
      valueThb: item.convertCoinValue ?? 0,
      resultPosition: index + 1,
    })),
  };

  const existingCollection = store.collectionByProfile.get(profileId) ?? [];
  const existingHistory = store.historyByProfile.get(profileId) ?? [];
  store.collectionByProfile.set(profileId, [
    ...collectionRows,
    ...existingCollection.filter(
      (item) => item.sourceCampaignSlug !== campaignSlug,
    ),
  ].slice(0, 500));
  store.historyByProfile.set(profileId, [
    historyRow,
    ...existingHistory.filter((row) => row.campaignSlug !== campaignSlug),
  ].slice(0, 100));

  return {
    campaignSlug,
    campaignTitle,
    publicCode,
    rewardCount: collectionRows.length,
  };
}

export function previewCollectionForProfile(
  profileId: string | undefined,
  limit = 500,
) {
  if (!isPreviewProfile(profileId)) return [];
  return (previewStore().collectionByProfile.get(profileId) ?? []).slice(0, limit);
}

export function previewOpenHistoryForProfile(
  profileId: string | undefined,
  limit = 100,
) {
  if (!isPreviewProfile(profileId)) return [];
  return (previewStore().historyByProfile.get(profileId) ?? []).slice(0, limit);
}

export async function previewAddressesForProfile(
  profileId: string | undefined,
) {
  if (!isPreviewProfile(profileId)) return [];
  return ensurePreviewAddresses(profileId);
}

export async function savePreviewAddressForProfile(
  profileId: string | undefined,
  input: PreviewAddressInput,
) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const existing = await ensurePreviewAddresses(profileId);
  const address = await toPreviewAddress(
    profileId,
    `preview-address-${crypto.randomUUID()}`,
    input,
  );
  const rows = input.isDefault
    ? [address, ...existing.map((row) => ({ ...row, isDefault: false }))]
    : [...existing, address];
  store.addressesByProfile.set(profileId, rows.slice(0, 20));
  return address;
}

export function preparePreviewConversionQuote({
  collectionItemIds,
  profileId,
  selectionMode,
}: {
  collectionItemIds: string[];
  profileId: string;
  selectionMode: "selected" | "all_eligible";
}) {
  if (!isPreviewProfile(profileId)) return null;
  const selected = previewSelectionForQuote(
    profileId,
    selectionMode,
    collectionItemIds,
  );
  if (!selected.length) throw new Error("collection_items_required");
  const quote: PreviewConversionQuote = {
    collectionItemIds: selected.map((item) => item.id),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    itemCount: selected.length,
    profileId,
    quoteToken: crypto.randomUUID(),
    selectionMode,
    totalCoins: selected.reduce((sum, item) => sum + itemCoinValue(item), 0),
  };
  previewStore().conversionByQuoteToken.set(quote.quoteToken, quote);
  return quote;
}

export function startPreviewConversion({
  profileId,
  quoteToken,
}: {
  profileId: string;
  quoteToken: string;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const quote = store.conversionByQuoteToken.get(quoteToken);
  if (!quote || quote.profileId !== profileId || Date.parse(quote.expiresAt) <= Date.now()) {
    throw new Error("reward_conversion_quote_expired");
  }

  updatePreviewCollectionItems(profileId, quote.collectionItemIds, "exchanged");

  const now = new Date().toISOString();
  const job: PreviewConversionJob = {
    jobId: crypto.randomUUID(),
    status: "completed",
    itemCount: quote.itemCount,
    totalCoins: quote.totalCoins,
    convertedCount: quote.itemCount,
    creditedTotalCoins: quote.totalCoins,
    completed: true,
    replayed: false,
  };
  const order: YnotExchangeOrder = {
    id: job.jobId,
    publicCode: `PX-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0")}`,
    status: "completed",
    requestedCoinValue: quote.totalCoins,
    approvedCoinValue: quote.totalCoins,
    createdAt: now,
    adminNote: null,
  };
  const walletBonus = store.walletBonusCoinsByProfile.get(profileId) ?? 0;
  const exchanges = store.exchangesByProfile.get(profileId) ?? [];
  store.conversionByQuoteToken.delete(quoteToken);
  store.currentConversionByProfile.set(profileId, job);
  store.exchangesByProfile.set(profileId, [order, ...exchanges].slice(0, 100));
  store.walletBonusCoinsByProfile.set(profileId, walletBonus + quote.totalCoins);
  return job;
}

export function preparePreviewPullAllQuote({
  campaignSlug,
  costPerReward,
  packTitle,
  profileId,
  soldPct,
  targetRewards,
}: {
  campaignSlug: string;
  costPerReward: number;
  packTitle: string;
  profileId: string;
  soldPct: number;
  targetRewards: number;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const normalizedTarget = Math.max(1, Math.floor(targetRewards));
  const normalizedCost = Math.max(1, Math.floor(costPerReward));
  const startToken = crypto.randomUUID();
  const quote: PreviewPullAllQuote = {
    campaignSlug,
    costPerReward: normalizedCost,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    packTitle,
    profileId,
    soldPct,
    startToken,
    targetRewards: normalizedTarget,
    totalCostCoins: normalizedTarget * normalizedCost,
  };
  previewStore().bulkOpenQuotesByToken.set(startToken, quote);
  return {
    startToken,
    token: startToken,
    pack: {
      slug: quote.campaignSlug,
      title: quote.packTitle,
    },
    targetRewards: quote.targetRewards,
    totalCostCoins: quote.totalCostCoins,
    costPerReward: quote.costPerReward,
    expiresAt: quote.expiresAt,
    soldPct: quote.soldPct,
  };
}

function previewPullAllHighlights(
  result: YnotGachaOpenResult,
): PreviewPullAllHighlight[] {
  return result.items.slice(0, 100).map((item) => {
    const highlight: PreviewPullAllHighlight = {
      name: item.name || "Mystery reward",
      imageUrl: item.imageUrl ?? null,
      displayTier: item.isLastPrize ? "last_prize" : item.displayTier,
      valueThb: item.valueThb ?? null,
    };
    if (item.isLastPrize) highlight.isLastPrize = true;
    return highlight;
  });
}

function fallbackPreviewPullAllResult(
  quote: PreviewPullAllQuote,
): YnotGachaOpenResult {
  const tiers: YnotPublicPrizeDisplayTier[] = [
    "rainbow",
    "gold",
    "silver",
    "bronze",
  ];
  const items = Array.from({ length: quote.targetRewards }, (_, index) => {
    const displayTier = tiers[index % tiers.length] ?? "bronze";
    return {
      name: `Preview Pull All reward ${index + 1}`,
      imageUrl: null,
      displayTier,
      valueThb:
        displayTier === "rainbow"
          ? 500
          : displayTier === "gold"
            ? 250
            : displayTier === "silver"
              ? 100
              : 25,
      position: index + 1,
    };
  });
  const publicCode = `BO-${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  return {
    status: "completed",
    openId: publicCode,
    publicCode,
    costCoins: quote.totalCostCoins,
    items,
    replayed: false,
  };
}

export function previewPullAllQuoteForToken({
  profileId,
  startToken,
}: {
  profileId: string;
  startToken: string;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const quote = previewStore().bulkOpenQuotesByToken.get(startToken);
  if (!quote || quote.profileId !== profileId || Date.parse(quote.expiresAt) <= Date.now()) {
    return null;
  }
  return quote;
}

export async function startPreviewPullAllSession({
  campaignTitle,
  profileId,
  result,
  startToken,
}: {
  campaignTitle?: string | null;
  profileId: string;
  result?: YnotGachaOpenResult | null;
  startToken: string;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const quote = previewPullAllQuoteForToken({ profileId, startToken });
  if (!quote) return null;

  const pullAllResult = result ?? fallbackPreviewPullAllResult(quote);
  await recordPreviewOpenResult({
    campaignSlug: quote.campaignSlug,
    campaignTitle: campaignTitle || quote.packTitle,
    profileId,
    result: pullAllResult,
  });

  const session: PreviewPullAllSession = {
    public_code: pullAllResult.publicCode,
    status: "completed",
    target_slots: quote.targetRewards,
    processed_slots: quote.targetRewards,
    open_items_awarded: quote.targetRewards,
    collection_items_created: quote.targetRewards,
    total_cost_coins: quote.totalCostCoins,
    highlight_rewards_public: previewPullAllHighlights(pullAllResult),
    highlights_seen_at: null,
  };
  const sessions = store.bulkOpenSessionsByProfile.get(profileId) ?? [];
  store.bulkOpenQuotesByToken.delete(startToken);
  store.bulkOpenSessionsByProfile.set(profileId, [session, ...sessions].slice(0, 20));
  return session;
}

export function previewCurrentPullAllSessionForProfile(
  profileId: string | undefined,
) {
  if (!isPreviewProfile(profileId)) return null;
  return (
    previewStore()
      .bulkOpenSessionsByProfile.get(profileId)
      ?.find((session) => !session.highlights_seen_at) ?? null
  );
}

export function markPreviewPullAllHighlightsSeen({
  profileId,
  publicCode,
}: {
  profileId: string;
  publicCode: string;
}) {
  if (!isPreviewProfile(profileId)) return { ok: false, updated: false };
  const store = previewStore();
  const sessions = store.bulkOpenSessionsByProfile.get(profileId) ?? [];
  let updated = false;
  store.bulkOpenSessionsByProfile.set(
    profileId,
    sessions.map((session) => {
      if (session.public_code !== publicCode) return session;
      if (session.highlights_seen_at) return session;
      updated = true;
      return { ...session, highlights_seen_at: new Date().toISOString() };
    }),
  );
  return { ok: true, updated };
}

export function previewCurrentConversionForProfile(
  profileId: string | undefined,
) {
  if (!isPreviewProfile(profileId)) return null;
  return previewStore().currentConversionByProfile.get(profileId) ?? null;
}

export function previewCurrentShippingForProfile(
  profileId: string | undefined,
) {
  if (!isPreviewProfile(profileId)) return null;
  return previewStore().currentShippingByProfile.get(profileId) ?? null;
}

export function previewWalletBonusForProfile(profileId: string | undefined) {
  if (!isPreviewProfile(profileId)) return 0;
  return previewStore().walletBonusCoinsByProfile.get(profileId) ?? 0;
}

export function previewExchangesForProfile(
  profileId: string | undefined,
  limit = 80,
) {
  if (!isPreviewProfile(profileId)) return [];
  return (previewStore().exchangesByProfile.get(profileId) ?? []).slice(0, limit);
}

export async function requestPreviewShipping({
  addressId,
  collectionItemIds,
  idempotencyKey,
  note,
  profileId,
}: {
  addressId: string;
  collectionItemIds: string[];
  idempotencyKey: string;
  note?: string | null;
  profileId: string;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const quote = await preparePreviewShippingQuote({
    addressId,
    collectionItemIds,
    note,
    profileId,
    selectionMode: "selected",
  });
  if (!quote) return null;
  return startPreviewShipping({
    profileId,
    quoteToken: quote.quoteToken,
    requestId: idempotencyKey,
  });
}

export async function preparePreviewShippingQuote({
  addressId,
  collectionItemIds,
  note,
  profileId,
  selectionMode,
}: {
  addressId: string;
  collectionItemIds: string[];
  note?: string | null;
  profileId: string;
  selectionMode: "selected" | "all_eligible";
}) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const addresses = await ensurePreviewAddresses(profileId);
  const address = addresses.find((row) => row.id === addressId);
  if (!address) throw new Error("valid_shipping_address_required");

  const selected = shippablePreviewItemsForQuote(
    profileId,
    selectionMode,
    collectionItemIds,
  );
  if (!selected.length) throw new Error("collection_item_not_shippable");
  const selectedCoinValue = previewShippingCoinValue(selected);
  const hasShipOnly = selected.some(
    (item) => item.fulfillmentPolicy === "ship_only",
  );
  if (!hasShipOnly && selectedCoinValue < 1000) {
    throw new Error("shipping_minimum_not_met");
  }

  const quote: PreviewShippingQuote = {
    address: previewShippingAddressSummary(address),
    addressId,
    collectionItemIds: selected.map((item) => item.id),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    itemCount: selected.length,
    minimumCoinValue: 1000,
    note: note ?? null,
    profileId,
    quoteToken: crypto.randomUUID(),
    selectedCoinValue,
    selectionMode,
    totalCoinValue: selectedCoinValue,
  };
  store.shippingByQuoteToken.set(quote.quoteToken, quote);
  return quote;
}

export function startPreviewShipping({
  profileId,
  quoteToken,
  requestId,
}: {
  profileId: string;
  quoteToken: string;
  requestId?: string;
}) {
  if (!isPreviewProfile(profileId)) return null;
  const store = previewStore();
  const quote = store.shippingByQuoteToken.get(quoteToken);
  if (!quote || quote.profileId !== profileId || Date.parse(quote.expiresAt) <= Date.now()) {
    throw new Error("shipping_quote_expired");
  }

  const selected = selectedPreviewItems(profileId, quote.collectionItemIds);
  updatePreviewCollectionItems(profileId, quote.collectionItemIds, "shipping_requested");

  const now = new Date().toISOString();
  const request: YnotShippingRequest = {
    id: requestId ?? crypto.randomUUID(),
    publicCode: `PS-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0")}`,
    profileId,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
    customerNote: quote.note,
    adminNote: null,
    shippingFeeCoins: 0,
    itemCount: selected.length,
    preparedCount: selected.length,
    totalCoinValue: quote.totalCoinValue,
    addressSnapshot: {
      ...quote.address,
      addressLine1: quote.address.summary,
    },
    items: selected.map(previewShippingItem),
    timeline: [
      {
        id: `preview-timeline-${crypto.randomUUID()}`,
        eventType: "shipping_submitted",
        label: "Shipping requested",
        createdAt: now,
        actorLabel: "Preview User",
        status: "submitted",
      },
    ],
  };
  const requests = store.shippingByProfile.get(profileId) ?? [];
  store.shippingByProfile.set(profileId, [request, ...requests].slice(0, 100));
  store.shippingByQuoteToken.delete(quoteToken);
  const job: PreviewShippingJob = {
    completed: true,
    jobId: request.id,
    itemCount: selected.length,
    preparedCount: selected.length,
    publicCode: request.publicCode,
    replayed: false,
    status: "submitted",
    totalCoinValue: quote.totalCoinValue,
  };
  store.currentShippingByProfile.set(profileId, job);
  return job;
}

export function previewShippingForProfile(
  profileId: string | undefined,
  limit = 80,
) {
  if (!isPreviewProfile(profileId)) return [];
  return (previewStore().shippingByProfile.get(profileId) ?? []).slice(0, limit);
}

export function clearPreviewRewardsForProfile(profileId = LOCAL_PREVIEW_PROFILE_ID) {
  const store = previewStore();
  store.addressesByProfile.delete(profileId);
  store.bulkOpenSessionsByProfile.delete(profileId);
  store.collectionByProfile.delete(profileId);
  store.currentConversionByProfile.delete(profileId);
  store.currentShippingByProfile.delete(profileId);
  store.exchangesByProfile.delete(profileId);
  store.historyByProfile.delete(profileId);
  store.shippingByProfile.delete(profileId);
  store.walletBonusCoinsByProfile.delete(profileId);
  for (const key of store.openedSlotsByProfileCampaign.keys()) {
    if (key.startsWith(`${profileId}:`)) {
      store.openedSlotsByProfileCampaign.delete(key);
    }
  }
  for (const [quoteToken, quote] of store.conversionByQuoteToken) {
    if (quote.profileId === profileId) store.conversionByQuoteToken.delete(quoteToken);
  }
  for (const [quoteToken, quote] of store.shippingByQuoteToken) {
    if (quote.profileId === profileId) store.shippingByQuoteToken.delete(quoteToken);
  }
  for (const [startToken, quote] of store.bulkOpenQuotesByToken) {
    if (quote.profileId === profileId) store.bulkOpenQuotesByToken.delete(startToken);
  }
}
