import type { CardCatalogItem } from "@/lib/lucky-draw/types";

export type StockCategory = "card" | "box" | "pack";
export type ConditionMode = "graded" | "raw";
export type GradingService = "psa" | "bgs" | "cgc" | "other";

export type DrawerState =
  | { kind: "closed" }
  | {
      kind: "open";
      step: 1 | 2 | 3;
      category: StockCategory | null;
      targetCard: CardCatalogItem | null;
      createMode: boolean;
    };

/** Map a catalog display string to our StockCategory discriminant. */
export function catalogCategoryToStock(cat: string | undefined): StockCategory {
  if (cat === "Sealed Boxes") return "box";
  if (cat === "Sealed Packs") return "pack";
  return "card";
}

export function stockCategoryLabel(cat: StockCategory): string {
  return cat === "card"
    ? "Single Card"
    : cat === "box"
      ? "Sealed Box"
      : "Sealed Pack";
}

export function stockCategoryToUnit(
  cat: StockCategory,
): "card" | "box" | "pack" {
  return cat;
}
