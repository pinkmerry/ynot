import type { CardCatalogItem } from "@/lib/lucky-draw/types";

export type CatalogStockUnit = NonNullable<CardCatalogItem["stockUnits"]>[number];

export type StockSkuGroup = {
  key: string;
  label: string;
  sku: string;
  stockSkuId?: string | null;
  sourceStockSkuId?: string | null;
  legacyStockUnitGroupKey?: string | boolean | null;
  unitKind?: string | null;
  identityKnown?: boolean;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
  packEquivalent?: number | null;
  availablePackEquivalent?: number | null;
  conversionRuleId?: string | null;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
  units: CatalogStockUnit[];
};

export type StockSkuSummaryRow = {
  cardId: string;
  stockSkuId?: string | null;
  sourceStockSkuId?: string | null;
  stockUnitGroupKey?: string | null;
  legacyStockUnitGroupKey?: string | boolean | null;
  sampleUnitId?: string | null;
  sku?: string | null;
  label?: string | null;
  unitKind?: string | null;
  condition?: string | null;
  grade?: string | null;
  gradingService?: string | null;
  certNumber?: string | null;
  gemrateId?: string | null;
  imageUrl?: string | null;
  sampleUnitImageUrl?: string | null;
  imageStoragePath?: string | null;
  totalUnits?: number | null;
  availableUnits?: number | null;
  reservedUnits?: number | null;
  allocatedUnits?: number | null;
  archivedUnits?: number | null;
  packEquivalent?: number | null;
  availablePackEquivalent?: number | null;
  conversionRuleId?: string | null;
  childStockSkuId?: string | null;
  childSku?: string | null;
  childLabel?: string | null;
  childQuantity?: number | null;
};

export type StockSkuUsageDetail = {
  groupKey: string;
  sku: string;
  label: string;
  actualStockCardId?: string | null;
  actualStockSkuId?: string | null;
  identityMismatch?: boolean;
  totalUnits: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
};

export type StockSkuPrizeUsageSource = {
  id: string;
  cardId?: string | null;
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
  actualStockCardId?: string | null;
  actualStockSkuId?: string | null;
  identityMismatch?: boolean;
  units: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
  source: "materialized" | "intended";
};

export type PrizeUnitIdentityMismatchReasonFlags = {
  unitCardMismatch: boolean;
  stockCardMismatch: boolean;
  missingStockUnit: boolean;
  stockFilterMismatch: boolean;
};

export type ParsedPrizeUnitIdentityMismatch = {
  drawRoundId: string;
  prizeId: string;
  prizeUnitId: string;
  status: string;
  prizeCardId?: string | null;
  unitCardId?: string | null;
  stockCardId?: string | null;
  stockUnitId?: string | null;
  stockSkuId?: string | null;
  stockLabel?: string | null;
  intendedStockUnitGroupKey?: string | null;
  intendedStockSkuId?: string | null;
  intendedStockSku?: string | null;
  intendedStockLabel?: string | null;
  intendedStockUnitFilter?: Record<string, unknown> | null;
  reason: PrizeUnitIdentityMismatchReasonFlags;
  primaryReason?:
    | "unitCardMismatch"
    | "stockCardMismatch"
    | "missingStockUnit"
    | "stockFilterMismatch";
};

export type StockUnitSelectionMetadata = {
  stockUnitGroupKey: string;
  stockSkuId?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function reasonFlagsFromValue(value: unknown): PrizeUnitIdentityMismatchReasonFlags {
  if (isRecord(value)) {
    return {
      unitCardMismatch: value.unitCardMismatch === true,
      stockCardMismatch: value.stockCardMismatch === true,
      missingStockUnit: value.missingStockUnit === true,
      stockFilterMismatch: value.stockFilterMismatch === true,
    };
  }
  return {
    unitCardMismatch: value === "unitCardMismatch",
    stockCardMismatch: value === "stockCardMismatch",
    missingStockUnit: value === "missingStockUnit",
    stockFilterMismatch: value === "stockFilterMismatch",
  };
}

function primaryReasonFromFlags(
  reason: PrizeUnitIdentityMismatchReasonFlags,
): ParsedPrizeUnitIdentityMismatch["primaryReason"] {
  if (reason.unitCardMismatch) return "unitCardMismatch";
  if (reason.missingStockUnit) return "missingStockUnit";
  if (reason.stockCardMismatch) return "stockCardMismatch";
  if (reason.stockFilterMismatch) return "stockFilterMismatch";
  return undefined;
}

export function normalizePrizeUnitIdentityMismatches(
  value: unknown,
): ParsedPrizeUnitIdentityMismatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const drawRoundId = optionalString(item.drawRoundId);
    const prizeId = optionalString(item.prizeId);
    const prizeUnitId = optionalString(item.prizeUnitId);
    const status = optionalString(item.status);
    const reason = reasonFlagsFromValue(item.reason);
    const primaryReason =
      optionalString(item.primaryReason) ?? primaryReasonFromFlags(reason);
    if (
      !drawRoundId ||
      !prizeId ||
      !prizeUnitId ||
      !status ||
      (!reason.unitCardMismatch &&
        !reason.stockCardMismatch &&
        !reason.missingStockUnit &&
        !reason.stockFilterMismatch)
    ) {
      return [];
    }
    return [
      {
        drawRoundId,
        prizeId,
        prizeUnitId,
        status,
        prizeCardId: optionalString(item.prizeCardId),
        unitCardId: optionalString(item.unitCardId),
        stockCardId: optionalString(item.stockCardId),
        stockUnitId: optionalString(item.stockUnitId),
        stockSkuId: optionalString(item.stockSkuId),
        stockLabel: optionalString(item.stockLabel),
        intendedStockUnitGroupKey: optionalString(item.intendedStockUnitGroupKey),
        intendedStockSkuId: optionalString(item.intendedStockSkuId),
        intendedStockSku: optionalString(item.intendedStockSku),
        intendedStockLabel: optionalString(item.intendedStockLabel),
        intendedStockUnitFilter: isRecord(item.intendedStockUnitFilter)
          ? item.intendedStockUnitFilter
          : null,
        reason,
        ...(primaryReason === "unitCardMismatch" ||
        primaryReason === "stockCardMismatch" ||
        primaryReason === "missingStockUnit" ||
        primaryReason === "stockFilterMismatch"
          ? { primaryReason }
          : {}),
      },
    ];
  });
}

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
  if (language === "korean") return "KR";
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
    "certNumber" | "condition" | "gemrateId" | "grade" | "gradingService" | "language"
  >,
) {
  const condition = unit.condition || "raw";
  const base =
    condition !== "graded"
      ? [condition, "", "", "", ""]
      : [condition, unit.grade || "", unit.gradingService || "", unit.certNumber || "", unit.gemrateId || ""];
  if (unit.language) base.push(unit.language);
  return base.join("\u001f");
}

function languageShort(language: string) {
  switch (language.toLowerCase()) {
    case "english": return "EN";
    case "japanese": return "JP";
    case "korean": return "KR";
    case "chinese": return "CN";
    default: return language.toUpperCase();
  }
}

export function stockUnitDisplayLabel(
  unit: Pick<CatalogStockUnit, "certNumber" | "condition" | "grade" | "gradingService" | "language">,
) {
  const base = unit.condition === "graded"
    ? [
        unit.gradingService
          ? gradingServiceLabel(unit.gradingService) || unit.gradingService.toUpperCase()
          : "Graded",
        unit.grade || "No grade",
        unit.certNumber ? `#${unit.certNumber}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : conditionLabel(unit.condition);
  if (unit.language) return `${base} · ${languageShort(unit.language)}`;
  return base;
}

function countValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function optionalCountValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function cleanSummaryText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stockSkuGroupKeyForUnit(unit: CatalogStockUnit) {
  const explicitKey = (unit as { stockUnitGroupKey?: string | null }).stockUnitGroupKey;
  if (explicitKey) return explicitKey;
  const stockSkuId = (unit as { stockSkuId?: string | null }).stockSkuId;
  return stockSkuId ? `stock-sku:${stockSkuId}` : stockUnitGroupKey(unit);
}

function parsedLegacyStockUnitKey(value: unknown) {
  if (typeof value !== "string" || !value || value.startsWith("stock-sku:")) {
    return null;
  }
  const [condition, grade, gradingService, certNumber, gemrateId] =
    value.split("\u001f");
  if (!condition) return null;
  return {
    condition,
    grade: cleanSummaryText(grade),
    gradingService: cleanSummaryText(gradingService),
    certNumber: cleanSummaryText(certNumber),
    gemrateId: cleanSummaryText(gemrateId),
  };
}

function summaryStockUnitIdentity(row: StockSkuSummaryRow) {
  const legacy =
    parsedLegacyStockUnitKey(legacyStockUnitGroupKey(row)) ??
    parsedLegacyStockUnitKey(row.stockUnitGroupKey);
  const explicitCondition = cleanSummaryText(row.condition) ?? legacy?.condition ?? null;
  const condition =
    explicitCondition ??
    (row.unitKind === "box" || row.unitKind === "pack" || row.unitKind === "other"
      ? "sealed"
      : "raw");
  const known =
    Boolean(explicitCondition) ||
    row.unitKind === "box" ||
    row.unitKind === "pack" ||
    row.unitKind === "other";
  if (condition !== "graded") {
    return {
      known,
      condition,
      grade: null,
      gradingService: null,
      certNumber: null,
      gemrateId: null,
    };
  }
  return {
    known,
    condition,
    grade: cleanSummaryText(row.grade) ?? legacy?.grade ?? null,
    gradingService:
      cleanSummaryText(row.gradingService) ?? legacy?.gradingService ?? null,
    certNumber: cleanSummaryText(row.certNumber) ?? legacy?.certNumber ?? null,
    gemrateId: cleanSummaryText(row.gemrateId) ?? legacy?.gemrateId ?? null,
  };
}

function legacyStockUnitGroupKey(row: StockSkuSummaryRow) {
  return typeof row.legacyStockUnitGroupKey === "string" &&
    row.legacyStockUnitGroupKey
    ? row.legacyStockUnitGroupKey
    : null;
}

export function findStockSkuGroupByKey(
  groups: StockSkuGroup[],
  groupKey: string | null | undefined,
) {
  if (!groupKey) return null;
  const exact = groups.find((group) => group.key === groupKey);
  if (exact) return exact;
  const legacyMatches = groups.filter(
    (group) =>
      typeof group.legacyStockUnitGroupKey === "string" &&
      group.legacyStockUnitGroupKey === groupKey,
  );
  return (
    legacyMatches.find((group) => group.unitKind !== "box") ??
    legacyMatches[0] ??
    null
  );
}

export function resolveStockSkuGroupKey(
  groups: StockSkuGroup[],
  groupKey: string | null | undefined,
) {
  return findStockSkuGroupByKey(groups, groupKey)?.key ?? "";
}

export function stockSkuGroupsFromSummaryRows(
  card: CardCatalogItem,
  rows: StockSkuSummaryRow[],
): StockSkuGroup[] {
  const cardRows = rows.filter((row) => row.cardId === card.catalogCardId);
  const firstClassStockSkuIds = new Set(
    cardRows.flatMap((row) => (row.stockSkuId ? [row.stockSkuId] : [])),
  );
  return cardRows
    .flatMap((row) => {
      const totalUnits = countValue(row.totalUnits);
      const archivedUnits = countValue(row.archivedUnits);
      const activeTotalUnits = Math.max(0, totalUnits - archivedUnits);
      const stockSkuId = row.stockSkuId || null;
      const sourceStockSkuId = row.sourceStockSkuId || null;
      if (
        !stockSkuId &&
        sourceStockSkuId &&
        firstClassStockSkuIds.has(sourceStockSkuId)
      ) {
        return [];
      }
      const firstClassKey = stockSkuId ? `stock-sku:${stockSkuId}` : null;
      const explicitKey = row.stockUnitGroupKey || firstClassKey;
      const fallbackImageUrl = row.imageUrl || row.sampleUnitImageUrl || null;
      const childQuantity = optionalCountValue(row.childQuantity);
      const packEquivalent = optionalCountValue(row.packEquivalent);
      const identity = summaryStockUnitIdentity(row);
      const unit = {
        id: row.sampleUnitId || explicitKey || stockUnitGroupKey({
          condition: identity.condition,
          grade: identity.grade,
          gradingService: identity.gradingService,
          certNumber: identity.certNumber,
          gemrateId: identity.gemrateId,
        }),
        stockSkuId: stockSkuId || sourceStockSkuId,
        stockUnitGroupKey: explicitKey || null,
        unitKind: row.unitKind || null,
        condition: identity.condition,
        grade: identity.grade,
        gradingService: identity.gradingService,
        certNumber: identity.certNumber,
        gemrateId: identity.gemrateId,
        imageUrl: fallbackImageUrl,
        imageStoragePath: row.imageStoragePath || null,
        status: "summary",
        quantity: activeTotalUnits,
      } satisfies CatalogStockUnit;
      const key = explicitKey || stockUnitGroupKey(unit);
      if (!stockSkuId && activeTotalUnits <= 0) return [];
      const activePackEquivalent =
        archivedUnits > 0 && row.unitKind === "pack"
          ? activeTotalUnits
          : archivedUnits > 0 && row.unitKind === "box" && childQuantity !== null
            ? activeTotalUnits * childQuantity
            : packEquivalent;
      return {
        key,
        label: row.label || stockUnitDisplayLabel(unit),
        sku: row.sku || stockUnitSku(card, unit),
        stockSkuId,
        sourceStockSkuId,
        legacyStockUnitGroupKey: legacyStockUnitGroupKey(row),
        unitKind: row.unitKind || null,
        identityKnown: identity.known,
        imageUrl: fallbackImageUrl,
        imageStoragePath: row.imageStoragePath || null,
        totalUnits: activeTotalUnits,
        availableUnits: countValue(row.availableUnits),
        reservedUnits: countValue(row.reservedUnits),
        allocatedUnits: countValue(row.allocatedUnits),
        packEquivalent: activePackEquivalent,
        availablePackEquivalent: optionalCountValue(row.availablePackEquivalent),
        conversionRuleId: row.conversionRuleId || null,
        childStockSkuId: row.childStockSkuId || null,
        childSku: row.childSku || null,
        childLabel: row.childLabel || null,
        childQuantity,
        units: [unit],
      };
    })
    .sort((left, right) => left.sku.localeCompare(right.sku));
}

export function stockSkuGroups(card: CardCatalogItem): StockSkuGroup[] {
  const precomputed = (card as { stockSkuGroups?: StockSkuGroup[] }).stockSkuGroups;
  if (Array.isArray(precomputed)) return precomputed;
  const groups = new Map<string, StockSkuGroup>();
  for (const unit of card.stockUnits ?? []) {
    const key = stockSkuGroupKeyForUnit(unit);
    const quantity = displayStockUnitQuantity(unit);
    const group =
      groups.get(key) ??
      ({
        key,
        label: stockUnitDisplayLabel(unit),
        sku: stockUnitSku(card, unit),
        stockSkuId: (unit as { stockSkuId?: string | null }).stockSkuId ?? null,
        unitKind: (unit as { unitKind?: string | null }).unitKind ?? null,
        identityKnown: true,
        imageUrl: unit.imageUrl ?? null,
        imageStoragePath: unit.imageStoragePath ?? null,
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

export function preferredPrizeStockSkuGroup(groups: StockSkuGroup[]) {
  const availableGroups = groups.filter((group) => group.availableUnits > 0);
  return (
    availableGroups.find((group) => group.unitKind === "pack") ??
    groups.find((group) => group.unitKind === "pack") ??
    availableGroups.find((group) => group.unitKind !== "box") ??
    groups.find((group) => group.unitKind !== "box") ??
    availableGroups[0] ??
    groups[0] ??
    null
  );
}

export function stockUnitSelectionMetadata(
  card: CardCatalogItem,
  groupKey: string,
): StockUnitSelectionMetadata | null {
  const group = findStockSkuGroupByKey(stockSkuGroups(card), groupKey);
  if (!group) return null;
  const unit = group.units[0];
  const condition = unit?.condition || "raw";
  return {
    stockUnitGroupKey: group.key,
    ...(group.stockSkuId ? { stockSkuId: group.stockSkuId } : {}),
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
  for (const group of groups) usageByGroup.set(group.key, []);

  for (const prize of prizes) {
    let matchedMaterializedUsage = false;
    for (const usage of prize.stockUnitUsages ?? []) {
      const group = findStockSkuGroupByKey(groups, usage.groupKey);
      if (!group) continue;
      matchedMaterializedUsage = true;
      usageByGroup.get(group.key)?.push({
        prizeId: prize.id,
        campaignTitle: prize.campaignTitle,
        displayTier: prize.displayTier,
        displayGroup: prize.displayGroup,
        tier: prize.tier,
        rank: prize.rank,
        tierRank: prize.tierRank,
        sku: group?.sku ?? usage.sku,
        label: group?.label ?? usage.label,
        actualStockCardId: usage.actualStockCardId ?? null,
        actualStockSkuId: usage.actualStockSkuId ?? null,
        identityMismatch:
          usage.identityMismatch ??
          Boolean(
            prize.cardId &&
              usage.actualStockCardId &&
              prize.cardId !== usage.actualStockCardId,
          ),
        units: Math.max(0, Math.trunc(Number(usage.totalUnits || 0))),
        availableUnits: Math.max(0, Math.trunc(Number(usage.availableUnits || 0))),
        awardedUnits: Math.max(0, Math.trunc(Number(usage.awardedUnits || 0))),
        voidUnits: Math.max(0, Math.trunc(Number(usage.voidUnits || 0))),
        source: "materialized",
      });
    }

    if (matchedMaterializedUsage || !prize.intendedStockUnitKey) continue;
    const group = findStockSkuGroupByKey(groups, prize.intendedStockUnitKey);
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
      actualStockCardId: null,
      actualStockSkuId: null,
      identityMismatch: false,
      units: Math.max(0, Math.trunc(Number(prize.plannedQuantity || 0))),
      availableUnits: Math.max(0, Math.trunc(Number(prize.availableUnits || 0))),
      awardedUnits: Math.max(0, Math.trunc(Number(prize.awardedUnits || 0))),
      voidUnits: Math.max(0, Math.trunc(Number(prize.voidUnits || 0))),
      source: "intended",
    });
  }

  return usageByGroup;
}
