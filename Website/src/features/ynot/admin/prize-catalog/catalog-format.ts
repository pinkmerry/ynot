import type { CardCatalogItem } from "@/lib/lucky-draw/types";

export type StockBuckets = {
  available: number; // free to build packs
  packs: number; // loaded into gacha packs (reserved + ...)
  bags: number; // won, in customers' bags
  removed: number; // archived
  total: number;
};

// Map the existing 4 stock-status buckets onto the prototype's vocabulary.
//
// Semantics confirmed against data.ts getAdminCards (lines 5013-5016) and the
// stock_skus_and_container_conversion migration (card_stock_units.status enum):
//   DB "reserved"  = committed to a campaign/pack but not yet drawn → "In packs"
//   DB "allocated" = drawn/won, owned by a customer                → "In bags"
export function toStockBuckets(card: {
  stockAvailable?: number;
  stockReserved?: number;
  stockAllocated?: number;
  stockArchived?: number;
}): StockBuckets {
  const available = card.stockAvailable ?? 0;
  const packs = card.stockReserved ?? 0;
  const bags = card.stockAllocated ?? 0;
  const removed = card.stockArchived ?? 0;
  return { available, packs, bags, removed, total: available + packs + bags + removed };
}

export const fmtInt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US");

export const unitNoun = (category: string | null | undefined) =>
  category === "Sealed Boxes" ? "boxes" : category === "Sealed Packs" ? "packs" : "cards";

export type StockStateKey = keyof Pick<StockBuckets, "available" | "packs" | "bags" | "removed">;
export const STOCK_STATE_LABEL: Record<StockStateKey, string> = {
  available: "Available",
  packs: "In packs",
  bags: "In bags",
  removed: "Removed",
};
