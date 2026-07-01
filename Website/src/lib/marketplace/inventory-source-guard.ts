import "server-only";

export type MarketplaceInventorySourceKind =
  | "official_stock"
  | "seller_consignment"
  | "marketplace_purchase";

const MARKETPLACE_INVENTORY_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "official_stock",
  "seller_consignment",
  "marketplace_purchase",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MarketplaceInventorySourceError extends Error {
  code = "marketplace_invalid_inventory_source";
  status = 422;
}

export function isMarketplaceInventorySourceKind(
  value: unknown,
): value is MarketplaceInventorySourceKind {
  return (
    typeof value === "string" &&
    MARKETPLACE_INVENTORY_SOURCE_KINDS.has(value)
  );
}

export function assertMarketplaceInventorySource(input: {
  sourceKind: unknown;
  inventorySourceId: unknown;
}) {
  if (!isMarketplaceInventorySourceKind(input.sourceKind)) {
    throw new MarketplaceInventorySourceError(
      "Marketplace inventory must use a marketplace-owned source kind.",
    );
  }

  if (
    typeof input.inventorySourceId !== "string" ||
    !UUID_RE.test(input.inventorySourceId.trim())
  ) {
    throw new MarketplaceInventorySourceError(
      "Marketplace inventory must reference a marketplace-owned inventory source row.",
    );
  }

  return {
    sourceKind: input.sourceKind,
    inventorySourceId: input.inventorySourceId.trim().toLowerCase(),
  };
}
