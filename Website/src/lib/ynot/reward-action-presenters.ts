import type { YnotShippingRequest } from "@/features/ynot/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function publicNumber(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value))
    ? Math.max(0, Math.round(Number(value)))
    : fallback;
}

function publicCodeId(value: Record<string, unknown>) {
  return typeof value.publicCode === "string" && value.publicCode
    ? value.publicCode
    : null;
}

export function presentConversionStartResult(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  return {
    status: typeof value.status === "string" ? value.status : "converted",
    totalCoins: publicNumber(value.totalCoins),
    itemCount: publicNumber(value.itemCount),
    replayed: value.replayed === true,
  };
}

export function presentConversionQuote(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  return {
    quoteToken: typeof value.quoteToken === "string" ? value.quoteToken : "",
    selectionMode:
      value.selectionMode === "all_eligible" ? "all_eligible" : "selected",
    itemCount: publicNumber(value.itemCount),
    totalCoins: publicNumber(value.totalCoins),
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
  };
}

export function presentConversionProgress(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  const status = typeof value.status === "string" ? value.status : "queued";
  const itemCount = publicNumber(value.itemCount);
  const convertedCount = publicNumber(value.convertedCount);
  const totalCoins = publicNumber(value.totalCoins);
  const creditedTotalCoins = publicNumber(value.creditedTotalCoins);
  return {
    id: publicCodeId(value),
    status,
    itemCount,
    convertedCount,
    totalCoins,
    creditedTotalCoins,
    completed: value.completed === true || status === "completed",
    failed: value.failed === true || status === "failed",
    replayed: value.replayed === true,
  };
}

export function presentConversionCurrent(row: unknown) {
  if (!isRecord(row)) return null;
  const status = typeof row.status === "string" ? row.status : "queued";
  return {
    status,
    itemCount: publicNumber(row.item_count),
    totalCoins: publicNumber(row.total_coins),
    convertedCount: publicNumber(row.converted_count),
    creditedTotalCoins: publicNumber(row.credited_total_coins),
    completed: status === "completed",
    failed: status === "failed",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export function presentShippingLegacyResult(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  return {
    status: typeof value.status === "string" ? value.status : "submitted",
    publicCode: typeof value.publicCode === "string" ? value.publicCode : "",
    itemCount: publicNumber(value.itemCount),
    replayed: value.replayed === true,
  };
}

function presentAddressSummary(raw: unknown) {
  const address = isRecord(raw) ? raw : {};
  return {
    label: typeof address.label === "string" ? address.label : null,
    recipientName:
      typeof address.recipientName === "string" ? address.recipientName : null,
    phone: typeof address.phone === "string" ? address.phone : null,
    summary: typeof address.summary === "string" ? address.summary : null,
  };
}

export function presentShippingQuote(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  return {
    quoteToken: typeof value.quoteToken === "string" ? value.quoteToken : "",
    selectionMode:
      value.selectionMode === "all_eligible" ? "all_eligible" : "selected",
    itemCount: publicNumber(value.itemCount),
    totalCoinValue: publicNumber(value.totalCoinValue),
    selectedCoinValue: publicNumber(value.selectedCoinValue),
    minimumCoinValue: publicNumber(value.minimumCoinValue, 1000),
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    address: presentAddressSummary(value.address),
  };
}

export function presentShippingProgress(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  const status = typeof value.status === "string" ? value.status : "preparing";
  return {
    id: publicCodeId(value),
    status,
    publicCode: typeof value.publicCode === "string" ? value.publicCode : "",
    itemCount: publicNumber(value.itemCount),
    preparedCount: publicNumber(value.preparedCount),
    totalCoinValue: publicNumber(value.totalCoinValue),
    completed: value.completed === true || status === "submitted",
    replayed: value.replayed === true,
  };
}

export function presentShippingCurrent(row: unknown) {
  if (!isRecord(row)) return null;
  const status = typeof row.status === "string" ? row.status : "preparing";
  return {
    status,
    publicCode: typeof row.public_code === "string" ? row.public_code : "",
    itemCount: publicNumber(row.item_count),
    preparedCount: publicNumber(row.prepared_count),
    totalCoinValue: publicNumber(row.total_coin_value),
    completed: status === "submitted",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export function presentShippingHistoryCurrent(
  request: YnotShippingRequest,
): YnotShippingRequest {
  return {
    id: request.publicCode,
    publicCode: request.publicCode,
    profileId: undefined,
    status: request.status,
    trackingProvider: request.trackingProvider,
    trackingNumber: request.trackingNumber,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    customerNote: request.customerNote,
    adminNote: null,
    shippingFeeCoins: request.shippingFeeCoins,
    itemCount: request.itemCount,
    preparedCount: request.preparedCount,
    totalCoinValue: request.totalCoinValue,
    customer: null,
    addressSnapshot: request.addressSnapshot,
    items: request.items,
    timeline: [],
  };
}
