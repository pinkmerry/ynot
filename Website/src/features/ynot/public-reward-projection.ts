import { publicBundleQuantity } from "./bundle-quantity";
import {
  publicPrizeDisplayTierValue,
  type PublicPrizeDisplayTier,
} from "./prize-tier";

export type PublicRewardDisplayTier = PublicPrizeDisplayTier;

export type PublicRewardOpenItemInput = {
  name?: unknown;
  stockUnitImageUrl?: unknown;
  imageUrl?: unknown;
  catalogImageUrl?: unknown;
  displayTier?: unknown;
  tier?: unknown;
  valueThb?: unknown;
  position?: unknown;
  bundleQuantity?: unknown;
  isLastPrize?: unknown;
};

export type PublicRewardOpenItem = {
  name: string;
  imageUrl: string | null;
  displayTier: PublicRewardDisplayTier;
  valueThb: number | null;
  position: number;
  isLastPrize?: boolean;
  bundleQuantity?: number;
};

export type PublicRewardHighlightInput = {
  name?: unknown;
  stockUnitImageUrl?: unknown;
  imageUrl?: unknown;
  catalogImageUrl?: unknown;
  displayTier?: unknown;
  valueThb?: unknown;
  isLastPrize?: unknown;
};

export type PublicRewardHighlight = {
  name: string;
  imageUrl: string | null;
  displayTier: PublicRewardDisplayTier;
  valueThb: number | null;
  isLastPrize?: boolean;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function readTrimmedString(value: unknown, fallback: string) {
  return cleanText(value) ?? fallback;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readPositiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function publicDisplayTierFromPublicValue(value: unknown): PublicRewardDisplayTier | null {
  if (
    value === "last_prize" ||
    value === "rainbow" ||
    value === "gold" ||
    value === "silver" ||
    value === "bronze"
  ) {
    return value;
  }
  return null;
}

export function publicRewardImageUrl(
  stockUnitImageUrl: unknown,
  fallbackImageUrl?: unknown,
) {
  return cleanText(stockUnitImageUrl) ?? cleanText(fallbackImageUrl);
}

export function toPublicRewardOpenItem(
  item: PublicRewardOpenItemInput,
  index: number,
): PublicRewardOpenItem {
  const isLastPrize = item.isLastPrize === true;
  const explicitDisplayTier = publicDisplayTierFromPublicValue(item.displayTier);
  const displayTier = isLastPrize
    ? "last_prize"
    : explicitDisplayTier ?? publicPrizeDisplayTierValue(item.tier);
  const publicItem: PublicRewardOpenItem = {
    name: readString(item.name, "Mystery card"),
    imageUrl: publicRewardImageUrl(
      item.stockUnitImageUrl,
      item.imageUrl ?? item.catalogImageUrl,
    ),
    displayTier,
    valueThb: readNumber(item.valueThb),
    position: readPositiveInteger(item.position, index + 1),
    bundleQuantity: publicBundleQuantity(item.bundleQuantity),
  };
  if (isLastPrize) publicItem.isLastPrize = true;
  return publicItem;
}

export function toPublicRewardHighlight(
  highlight: PublicRewardHighlightInput,
): PublicRewardHighlight {
  const isLastPrize = highlight.isLastPrize === true;
  const displayTier = isLastPrize
    ? "last_prize"
    : publicDisplayTierFromPublicValue(highlight.displayTier) ?? "bronze";
  const publicHighlight: PublicRewardHighlight = {
    name: readTrimmedString(highlight.name, "Mystery reward"),
    imageUrl: publicRewardImageUrl(
      highlight.stockUnitImageUrl,
      highlight.imageUrl ?? highlight.catalogImageUrl,
    ),
    displayTier,
    valueThb: readNumber(highlight.valueThb),
  };
  if (isLastPrize || displayTier === "last_prize") {
    publicHighlight.isLastPrize = true;
  }
  return publicHighlight;
}
