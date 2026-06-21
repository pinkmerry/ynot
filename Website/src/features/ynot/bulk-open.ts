import {
  toPublicRewardHighlight,
  type PublicRewardDisplayTier,
  type PublicRewardHighlight,
} from "./public-reward-projection";

export const BULK_OPEN_HIGHLIGHT_LIMIT = 100;
export const BULK_OPEN_RESULTS_PAGE_SIZE_DEFAULT = 100;
export const BULK_OPEN_RESULTS_PAGE_SIZE_MAX = 1000;
export const BULK_OPEN_PROCESS_BUDGET_MAX = 1000;

export const bulkOpenStatuses = [
  "queued",
  "processing",
  "retry_required",
  "completed",
] as const;

export const bulkOpenActiveStatuses = [
  "queued",
  "processing",
  "retry_required",
] as const;

export type BulkOpenStatus = (typeof bulkOpenStatuses)[number];
export type BulkOpenActiveStatus = (typeof bulkOpenActiveStatuses)[number];
export type BulkOpenStatusLabel = "starting" | "landing" | "finishing" | "complete";
export type BulkOpenPublicDisplayTier = PublicRewardDisplayTier;

export type PublicBulkOpenHighlight = PublicRewardHighlight;

export type PublicBulkOpenSessionSummary = {
  publicCode: string;
  status: BulkOpenStatus;
  statusLabel: BulkOpenStatusLabel;
  totalPurchasedRewards: number;
  landedRewards: number;
  settlingRewards: number;
  percentComplete: number;
  totalCostCoins: number;
  highlights: PublicBulkOpenHighlight[];
};

export type PublicBulkOpenStartSession = PublicBulkOpenSessionSummary & {
  replayed?: boolean;
};

const bulkOpenStatusSet = new Set<string>(bulkOpenStatuses);
const bulkOpenActiveStatusSet = new Set<string>(bulkOpenActiveStatuses);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readNonNegativeInteger(value: unknown) {
  const number = readNumber(value);
  return number === null ? 0 : Math.max(0, Math.floor(number));
}

function readOptionalNonNegativeInteger(
  source: Record<string, unknown>,
  key: string,
) {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  const number = readNumber(source[key]);
  return number === null ? null : Math.max(0, Math.floor(number));
}

function tierPriority(tier: BulkOpenPublicDisplayTier) {
  switch (tier) {
    case "last_prize":
      return 0;
    case "rainbow":
      return 1;
    case "gold":
      return 2;
    case "silver":
      return 3;
    case "bronze":
      return 4;
  }
}

export function normalizeBulkOpenStatus(value: unknown): BulkOpenStatus | null {
  return typeof value === "string" && bulkOpenStatusSet.has(value)
    ? (value as BulkOpenStatus)
    : null;
}

export function isBulkOpenActiveStatus(
  value: unknown,
): value is BulkOpenActiveStatus {
  return typeof value === "string" && bulkOpenActiveStatusSet.has(value);
}

export function bulkOpenCustomerStatusLabel(
  status: BulkOpenStatus,
): BulkOpenStatusLabel {
  switch (status) {
    case "queued":
      return "starting";
    case "processing":
      return "landing";
    case "retry_required":
      return "finishing";
    case "completed":
      return "complete";
  }
}

export function normalizeBulkOpenResultsPageSize(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return BULK_OPEN_RESULTS_PAGE_SIZE_DEFAULT;
  }
  return Math.max(
    1,
    Math.min(BULK_OPEN_RESULTS_PAGE_SIZE_MAX, Math.floor(number)),
  );
}

export function normalizeBulkOpenProcessBudget(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return BULK_OPEN_PROCESS_BUDGET_MAX;
  }
  return Math.max(
    1,
    Math.min(BULK_OPEN_PROCESS_BUDGET_MAX, Math.floor(number)),
  );
}

export function toPublicBulkOpenHighlights(
  highlights: unknown,
): PublicBulkOpenHighlight[] {
  if (!Array.isArray(highlights)) return [];
  return highlights
    .filter(isRecord)
    .map(toPublicRewardHighlight)
    .sort((left, right) => {
      const tierDelta =
        tierPriority(left.displayTier) - tierPriority(right.displayTier);
      if (tierDelta !== 0) return tierDelta;
      return (right.valueThb ?? 0) - (left.valueThb ?? 0);
    })
    .slice(0, BULK_OPEN_HIGHLIGHT_LIMIT);
}

export function toPublicBulkOpenSessionSummary(
  session: unknown,
): PublicBulkOpenSessionSummary | null {
  const source = isRecord(session) ? session : {};
  const status = normalizeBulkOpenStatus(source.status);
  if (!status) return null;
  const totalPurchasedRewards = readNonNegativeInteger(source.target_slots);
  const processedSlots = readNonNegativeInteger(source.processed_slots);
  const collectionItemsCreated = readOptionalNonNegativeInteger(
    source,
    "collection_items_created",
  );
  const openItemsAwarded = readOptionalNonNegativeInteger(
    source,
    "open_items_awarded",
  );
  const landedRewards = Math.min(
    collectionItemsCreated ?? openItemsAwarded ?? processedSlots,
    totalPurchasedRewards,
  );
  const settlingRewards = Math.max(0, totalPurchasedRewards - landedRewards);
  const percentComplete =
    totalPurchasedRewards > 0
      ? Math.min(100, Number(((landedRewards / totalPurchasedRewards) * 100).toFixed(2)))
      : 0;

  const totalCost =
    readOptionalNonNegativeInteger(source, "total_cost_coins") ??
    readOptionalNonNegativeInteger(source, "total_cost_snapshot") ??
    0;

  return {
    publicCode: readString(source.public_code),
    status,
    statusLabel: bulkOpenCustomerStatusLabel(status),
    totalPurchasedRewards,
    landedRewards,
    settlingRewards,
    percentComplete,
    totalCostCoins: totalCost,
    highlights: toPublicBulkOpenHighlights(source.highlight_rewards_public),
  };
}
