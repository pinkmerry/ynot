import type { CardCatalogItem } from "@/lib/lucky-draw/types";

export type CatalogStockUnit = NonNullable<CardCatalogItem["stockUnits"]>[number];

export type StockSkuGroup = {
  key: string;
  label: string;
  sku: string;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
  units: CatalogStockUnit[];
};

export type StockSkuSummaryRow = {
  cardId: string;
  sampleUnitId?: string | null;
  condition?: string | null;
  grade?: string | null;
  gradingService?: string | null;
  certNumber?: string | null;
  gemrateId?: string | null;
  imageUrl?: string | null;
  totalUnits?: number | null;
  availableUnits?: number | null;
  reservedUnits?: number | null;
  allocatedUnits?: number | null;
};

export type StockSkuUsageDetail = {
  groupKey: string;
  sku: string;
  label: string;
  totalUnits: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
};

export type StockSkuPrizeUsageSource = {
  id: string;
  campaignTitle: string;
  displayTier?: string | null;
  displayGroup?: string | null;
  tier: "normal" | "high";
  rank: number;
  tierRank?: number | null;
  plannedQuantity: number;
  totalUnits: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
  intendedStockUnitKey?: string | null;
  intendedStockSku?: string | null;
  intendedStockLabel?: string | null;
  stockUnitUsages?: StockSkuUsageDetail[];
};

export type StockSkuPackUsage = {
  prizeId: string;
  campaignTitle: string;
  displayTier?: string | null;
  displayGroup?: string | null;
  tier: "normal" | "high";
  rank: number;
  tierRank?: number | null;
  sku: string;
  label: string;
  units: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
  source: "materialized" | "intended";
};

export type StockUnitSelectionMetadata = {
  stockUnitGroupKey: string;
  stockSku: string;
  stockLabel: string;
  stockUnitFilter: {
    condition: string;
    grade: string;
    gradingService: string;
    certNumber: string;
    gemrateId: string;
  };
};

function normalizedText(value: unknown, max = 48) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeSkuPart(value: unknown) {
  const clean = normalizedText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || null;
}

function gradingServiceLabel(value: unknown) {
  if (value === "psa") return "PSA";
  if (value === "bgs") return "BGS";
  if (value === "cgc") return "CGC";
  if (value === "other") return "Other";
  return typeof value === "string" ? value.toUpperCase() : "";
}

function conditionLabel(value: unknown) {
  if (value === "sealed") return "Sealed";
  if (value === "graded") return "Graded";
  return "Raw";
}

export function displayStockUnitQuantity(unit: { quantity?: number | null }) {
  const quantity = Number(unit.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 1;
}

export function compactSkuPart(value: unknown, fallback = "") {
  return normalizeSkuPart(value) ?? fallback;
}

export function cardLanguageSkuPart(card: Pick<CardCatalogItem, "language">) {
  const language = String(card.language ?? "").trim().toLowerCase();
  if (language === "japanese") return "JP";
  if (language === "english") return "EN";
  if (language === "chinese") return "CN";
  return "";
}

export function gradeSkuPart(unit: Pick<CatalogStockUnit, "grade" | "gradingService">) {
  const service =
    compactSkuPart(unit.gradingService) ||
    compactSkuPart(String(unit.grade ?? "").match(/\b(PSA|BGS|CGC)\b/i)?.[1]) ||
    "GRADED";
  const gradeNumber = String(unit.grade ?? "").match(/(\d+(?:\.\d+)?)/)?.[1];
  if (!gradeNumber) return service;
  return `${service}${gradeNumber.replace(".", "")}`;
}

export function stockUnitSku(
  card: Pick<CardCatalogItem, "catalogCardId" | "code" | "language" | "modelCode" | "variant">,
  unit: Pick<CatalogStockUnit, "condition" | "grade" | "gradingService">,
) {
  const base =
    compactSkuPart(card.modelCode ?? card.code) ||
    compactSkuPart(card.catalogCardId) ||
    "CARD";
  const parts = [base];
  const language = cardLanguageSkuPart(card);
  if (language && !base.split("-").includes(language)) parts.push(language);
  const variant = compactSkuPart(card.variant);
  if (variant && !base.includes(variant)) parts.push(variant);
  if (unit.condition === "graded") parts.push(gradeSkuPart(unit));
  else parts.push(unit.condition === "sealed" ? "SEALED" : "RAW");
  return parts.filter(Boolean).join("-");
}

export function stockUnitGroupKey(
  unit: Pick<
    CatalogStockUnit,
    "certNumber" | "condition" | "gemrateId" | "grade" | "gradingService"
  >,
) {
  const condition = unit.condition || "raw";
  if (condition !== "graded") {
    return [condition, "", "", "", ""].join("\u001f");
  }
  return [
    condition,
    unit.grade || "",
    unit.gradingService || "",
    unit.certNumber || "",
    unit.gemrateId || "",
  ].join("\u001f");
}

export function stockUnitDisplayLabel(
  unit: Pick<CatalogStockUnit, "certNumber" | "condition" | "grade" | "gradingService">,
) {
  if (unit.condition === "graded") {
    return [
      unit.gradingService
        ? gradingServiceLabel(unit.gradingService) || unit.gradingService.toUpperCase()
        : "Graded",
      unit.grade || "No grade",
      unit.certNumber ? `#${unit.certNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return conditionLabel(unit.condition);
}

function countValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

export function stockSkuGroupsFromSummaryRows(
  card: CardCatalogItem,
  rows: StockSkuSummaryRow[],
): StockSkuGroup[] {
  return rows
    .filter((row) => row.cardId === card.catalogCardId)
    .map((row) => {
      const totalUnits = countValue(row.totalUnits);
      const unit = {
        id: row.sampleUnitId || stockUnitGroupKey({
          condition: row.condition || "raw",
          grade: row.grade || null,
          gradingService: row.gradingService || null,
          certNumber: row.certNumber || null,
          gemrateId: row.gemrateId || null,
        }),
        condition: row.condition || "raw",
        grade: row.grade || null,
        gradingService: row.gradingService || null,
        certNumber: row.certNumber || null,
        gemrateId: row.gemrateId || null,
        imageUrl: row.imageUrl || null,
        imageStoragePath: null,
        status: "summary",
        quantity: totalUnits,
      } satisfies CatalogStockUnit;
      return {
        key: stockUnitGroupKey(unit),
        label: stockUnitDisplayLabel(unit),
        sku: stockUnitSku(card, unit),
        totalUnits,
        availableUnits: countValue(row.availableUnits),
        reservedUnits: countValue(row.reservedUnits),
        allocatedUnits: countValue(row.allocatedUnits),
        units: [unit],
      };
    })
    .filter((group) => group.totalUnits > 0)
    .sort((left, right) => left.sku.localeCompare(right.sku));
}

export function stockSkuGroups(card: CardCatalogItem): StockSkuGroup[] {
  const precomputed = (card as { stockSkuGroups?: StockSkuGroup[] }).stockSkuGroups;
  if (Array.isArray(precomputed)) return precomputed;
  const groups = new Map<string, StockSkuGroup>();
  for (const unit of card.stockUnits ?? []) {
    const key = stockUnitGroupKey(unit);
    const quantity = displayStockUnitQuantity(unit);
    const group =
      groups.get(key) ??
      ({
        key,
        label: stockUnitDisplayLabel(unit),
        sku: stockUnitSku(card, unit),
        totalUnits: 0,
        availableUnits: 0,
        reservedUnits: 0,
        allocatedUnits: 0,
        units: [],
      } satisfies StockSkuGroup);

    group.totalUnits += quantity;
    if (unit.status === "available") group.availableUnits += quantity;
    if (unit.status === "reserved") group.reservedUnits += quantity;
    if (unit.status === "allocated") group.allocatedUnits += quantity;
    group.units.push(unit);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.sku.localeCompare(right.sku),
  );
}

export function stockUnitSelectionMetadata(
  card: CardCatalogItem,
  groupKey: string,
): StockUnitSelectionMetadata | null {
  const group = stockSkuGroups(card).find((candidate) => candidate.key === groupKey);
  if (!group) return null;
  const unit = group.units[0];
  const condition = unit?.condition || "raw";
  return {
    stockUnitGroupKey: group.key,
    stockSku: group.sku,
    stockLabel: group.label,
    stockUnitFilter: {
      condition,
      grade: condition === "graded" ? unit?.grade || "" : "",
      gradingService: condition === "graded" ? unit?.gradingService || "" : "",
      certNumber: condition === "graded" ? unit?.certNumber || "" : "",
      gemrateId: condition === "graded" ? unit?.gemrateId || "" : "",
    },
  };
}

export function stockSkuPackUsageByGroup(
  groups: StockSkuGroup[],
  prizes: StockSkuPrizeUsageSource[],
) {
  const usageByGroup = new Map<string, StockSkuPackUsage[]>();
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  for (const group of groups) usageByGroup.set(group.key, []);

  for (const prize of prizes) {
    let matchedMaterializedUsage = false;
    for (const usage of prize.stockUnitUsages ?? []) {
      if (!groupByKey.has(usage.groupKey)) continue;
      matchedMaterializedUsage = true;
      usageByGroup.get(usage.groupKey)?.push({
        prizeId: prize.id,
        campaignTitle: prize.campaignTitle,
        displayTier: prize.displayTier,
        displayGroup: prize.displayGroup,
        tier: prize.tier,
        rank: prize.rank,
        tierRank: prize.tierRank,
        sku: usage.sku,
        label: usage.label,
        units: Math.max(0, Math.trunc(Number(usage.totalUnits || 0))),
        availableUnits: Math.max(0, Math.trunc(Number(usage.availableUnits || 0))),
        awardedUnits: Math.max(0, Math.trunc(Number(usage.awardedUnits || 0))),
        voidUnits: Math.max(0, Math.trunc(Number(usage.voidUnits || 0))),
        source: "materialized",
      });
    }

    if (matchedMaterializedUsage || !prize.intendedStockUnitKey) continue;
    const group = groupByKey.get(prize.intendedStockUnitKey);
    if (!group) continue;
    usageByGroup.get(group.key)?.push({
      prizeId: prize.id,
      campaignTitle: prize.campaignTitle,
      displayTier: prize.displayTier,
      displayGroup: prize.displayGroup,
      tier: prize.tier,
      rank: prize.rank,
      tierRank: prize.tierRank,
      sku: prize.intendedStockSku || group.sku,
      label: prize.intendedStockLabel || group.label,
      units: Math.max(0, Math.trunc(Number(prize.plannedQuantity || 0))),
      availableUnits: Math.max(0, Math.trunc(Number(prize.availableUnits || 0))),
      awardedUnits: Math.max(0, Math.trunc(Number(prize.awardedUnits || 0))),
      voidUnits: Math.max(0, Math.trunc(Number(prize.voidUnits || 0))),
      source: "intended",
    });
  }

  return usageByGroup;
}
