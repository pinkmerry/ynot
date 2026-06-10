export type StockSkuUnitKind = "card" | "pack" | "box" | "other";

export type StockSkuConversionSummaryRow = {
  stockSkuId: string;
  sku: string;
  unitKind: StockSkuUnitKind | string | null;
  totalUnits?: number | null;
  availableUnits?: number | null;
  childStockSkuId?: string | null;
  childQuantity?: number | null;
};

export type StockSkuPackEquivalentRow = {
  stockSkuId: string;
  sku: string;
  unitKind: StockSkuUnitKind;
  packEquivalent: number | null;
  availablePackEquivalent: number | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

export function normalizeStockSkuUnitKind(value: unknown): StockSkuUnitKind {
  if (value === "card" || value === "pack" || value === "box" || value === "other") {
    return value;
  }
  return "other";
}

export function childUnitsFromContainerOpen({
  containerCount,
  childQuantity,
}: {
  containerCount: unknown;
  childQuantity: unknown;
}) {
  return positiveInteger(containerCount) * positiveInteger(childQuantity);
}

function rowPackEquivalent(row: StockSkuConversionSummaryRow, countField: "totalUnits" | "availableUnits") {
  const unitKind = normalizeStockSkuUnitKind(row.unitKind);
  const count = positiveInteger(row[countField]);
  if (unitKind === "pack") return count;
  if (unitKind === "box" && cleanText(row.childStockSkuId)) {
    const childQuantity = positiveInteger(row.childQuantity);
    return childQuantity > 0 ? count * childQuantity : null;
  }
  return null;
}

export function stockSkuPackEquivalent(rows: StockSkuConversionSummaryRow[]) {
  const equivalentRows: StockSkuPackEquivalentRow[] = rows.map((row) => {
    const unitKind = normalizeStockSkuUnitKind(row.unitKind);
    return {
      stockSkuId: row.stockSkuId,
      sku: row.sku,
      unitKind,
      packEquivalent: rowPackEquivalent(row, "totalUnits"),
      availablePackEquivalent: rowPackEquivalent(row, "availableUnits"),
    };
  });

  return {
    totalPackEquivalent: equivalentRows.reduce(
      (sum, row) => sum + (row.packEquivalent ?? 0),
      0,
    ),
    availablePackEquivalent: equivalentRows.reduce(
      (sum, row) => sum + (row.availablePackEquivalent ?? 0),
      0,
    ),
    rows: equivalentRows,
  };
}

export function stockSkuPublicImageUrl({
  stockUnitImageUrl,
  stockSkuImageUrl,
  productImageUrl,
}: {
  stockUnitImageUrl?: unknown;
  stockSkuImageUrl?: unknown;
  productImageUrl?: unknown;
}) {
  return cleanText(stockUnitImageUrl) ?? cleanText(stockSkuImageUrl) ?? cleanText(productImageUrl);
}
