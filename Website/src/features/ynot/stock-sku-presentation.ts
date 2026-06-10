import type { StockSkuGroup } from "./stock-sku-usage";

export type MainSkuCategoryType = "card" | "box" | "pack" | "other";

export type MainSkuActionLabels = {
  create: string;
  edit: string;
  delete: string;
  addStock: string;
  addSubSku: string;
  stockSummary: string;
  randomPackStock: string;
  randomPackAssignments: string;
};

export type MainSkuStockSummary = {
  totalUnits: number;
  availableUnits: number;
  boxes: {
    totalUnits: number;
    availableUnits: number;
  };
  packs: {
    totalUnits: number;
    availableUnits: number;
  };
  packEquivalentFromBoxes: number;
  totalPossiblePacks: number;
  headline: string;
};

export type SubSkuStockRow = {
  key: string;
  sku: string;
  type: MainSkuCategoryType;
  typeLabel: string;
  availableUnits: number;
  totalUnits: number;
  availableLabel: string;
  totalLabel: string;
  conversionLabel: string;
  warning: string | null;
};

function cleanCount(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function mainSkuCategoryType(category: unknown): MainSkuCategoryType {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (normalized === "single cards" || normalized.includes("card")) return "card";
  if (normalized === "booster boxes" || normalized.includes("box")) return "box";
  if (normalized === "packs" || normalized.includes("pack")) return "pack";
  return "other";
}

export function stockUnitKindType(value: unknown): MainSkuCategoryType {
  if (value === "card" || value === "box" || value === "pack") return value;
  return "other";
}

export function mainSkuActionLabels(category: unknown): MainSkuActionLabels {
  void category;
  return {
    create: "Create Main SKU",
    edit: "Edit Main SKU",
    delete: "Delete Main SKU",
    addStock: "Add Sub-SKU stock",
    addSubSku: "Create Sub-SKU",
    stockSummary: "Main SKU stock",
    randomPackStock: "Random pack stock",
    randomPackAssignments: "Random pack assignments",
  };
}

export function stockUnitKindLabel(kind: unknown) {
  const type = stockUnitKindType(kind);
  if (type === "card") return "Card";
  if (type === "box") return "Box";
  if (type === "pack") return "Pack";
  return "Other";
}

export function stockUnitNoun(kind: unknown, count: unknown) {
  const type = stockUnitKindType(kind);
  const quantity = cleanCount(count);
  if (type === "box") return quantity === 1 ? "box" : "boxes";
  if (type === "pack") return quantity === 1 ? "pack" : "packs";
  if (type === "card") return quantity === 1 ? "card" : "cards";
  return quantity === 1 ? "item" : "items";
}

export function stockQuantityLabel(count: unknown, kind: unknown) {
  const quantity = cleanCount(count);
  return `${quantity} ${stockUnitNoun(kind, quantity)}`;
}

function groupPackEquivalentFromBoxes(group: StockSkuGroup) {
  const totalUnits = cleanCount(group.totalUnits);
  const childQuantity = cleanCount(group.childQuantity);
  return childQuantity > 0 ? totalUnits * childQuantity : 0;
}

export function mainSkuStockSummary(groups: StockSkuGroup[]): MainSkuStockSummary {
  const boxes = { totalUnits: 0, availableUnits: 0 };
  const packs = { totalUnits: 0, availableUnits: 0 };
  let totalUnits = 0;
  let availableUnits = 0;
  let packEquivalentFromBoxes = 0;

  for (const group of groups) {
    const type = stockUnitKindType(group.unitKind);
    const groupTotal = cleanCount(group.totalUnits);
    const groupAvailable = cleanCount(group.availableUnits);
    totalUnits += groupTotal;
    availableUnits += groupAvailable;

    if (type === "box") {
      boxes.totalUnits += groupTotal;
      boxes.availableUnits += groupAvailable;
      packEquivalentFromBoxes += groupPackEquivalentFromBoxes(group);
    }

    if (type === "pack") {
      packs.totalUnits += groupTotal;
      packs.availableUnits += groupAvailable;
    }
  }

  return {
    totalUnits,
    availableUnits,
    boxes,
    packs,
    packEquivalentFromBoxes,
    totalPossiblePacks: packEquivalentFromBoxes + packs.totalUnits,
    headline: `${stockQuantityLabel(boxes.availableUnits, "box")} left · ${stockQuantityLabel(
      packs.availableUnits,
      "pack",
    )} left`,
  };
}

export function stockSkuConversionLabel(group: StockSkuGroup) {
  const type = stockUnitKindType(group.unitKind);
  if (type === "pack") return "Direct pack stock";
  if (type === "card") return "Single item stock";
  if (type !== "box") return "No conversion";

  const childQuantity = cleanCount(group.childQuantity);
  const childSku = cleanText(group.childSku);
  if (!childSku || childQuantity <= 0) return "Pack conversion not set";
  return `1 box = ${childQuantity} ${childSku}`;
}

export function stockSkuWarning(group: StockSkuGroup) {
  if (
    stockUnitKindType(group.unitKind) === "box" &&
    stockSkuConversionLabel(group) === "Pack conversion not set"
  ) {
    return "Set packs per box and choose a child Pack Sub-SKU before opening boxes.";
  }
  return null;
}

export function subSkuStockRows(groups: StockSkuGroup[]): SubSkuStockRow[] {
  return groups.map((group) => {
    const type = stockUnitKindType(group.unitKind);
    const totalUnits = cleanCount(group.totalUnits);
    const availableUnits = cleanCount(group.availableUnits);
    return {
      key: group.key,
      sku: group.sku,
      type,
      typeLabel: stockUnitKindLabel(type),
      availableUnits,
      totalUnits,
      availableLabel: stockQuantityLabel(availableUnits, type),
      totalLabel: stockQuantityLabel(totalUnits, type),
      conversionLabel: stockSkuConversionLabel(group),
      warning: stockSkuWarning(group),
    };
  });
}
