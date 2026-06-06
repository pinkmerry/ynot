import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache } from "next/cache";

import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { getCardCatalog, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import type { Database } from "@/lib/supabase/types";
import { collectionItemActionToken } from "@/lib/ynot/collection-action-tokens";
import { paymentMethodActionToken } from "@/lib/ynot/payment-method-action-tokens";
import type {
  YnotAdminUserDetail,
  YnotCampaign,
  YnotCollectionItem,
  YnotDashboardData,
  YnotDataIssue,
  YnotAddress,
  YnotApprovalStatus,
  YnotCategory,
  YnotExchangeOrder,
  YnotGachaOpenHistory,
  YnotLastPrizePreview,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPlatformHealth,
  YnotPrizePoolItem,
  YnotPrizePreview,
  YnotRandomLogicMode,
  YnotRankingRow,
  YnotShippingAddressSnapshot,
  YnotShippingItem,
  YnotShippingRequest,
  YnotShippingTimelineEvent,
  YnotTierAnimation,
  YnotTopUp,
  YnotViewer,
  YnotWallet,
} from "./types";
import { featuredCampaigns } from "./storefront-content";
import { allowDemoStorefront } from "./runtime-flags";
import {
  getCampaignPrizeReadiness,
  type CampaignPrizeReadiness,
} from "./prize-readiness";
import { normalizeOpenQuantityOptions } from "./open-quantity";
import {
  prizeDisplayTierLabel,
  prizeDisplayTierOrder,
  prizeDisplayTierValue,
} from "./prize-tier";
import {
  stockUnitDisplayLabel,
  stockUnitGroupKey,
  stockSkuGroupsFromSummaryRows,
  stockUnitSku,
  type StockSkuSummaryRow,
  type StockSkuUsageDetail,
} from "./stock-sku-usage";
import {
  publicSubSkuImageUrl,
  stockImageUrlByOpenItemId,
  stockImageUrlByPrizeId,
  type PublicPrizeUnitImageRow,
  type PublicStockUnitImageRow,
} from "./public-subsku-images";
import { normalizeBundleQuantity, publicBundleQuantity } from "./bundle-quantity";
import { getProfileAddresses } from "./server-addresses";

const dataIssueStorage = new AsyncLocalStorage<YnotDataIssue[]>();

type CardStockSummaryRow = {
  cardId: string;
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
  archivedUnits: number;
};

const defaultViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
  adminRole: null,
};

function safeCostCoins(
  row: Database["public"]["Tables"]["draw_rounds"]["Row"],
) {
  return row.cost_coins ?? Math.max(1, Math.ceil(row.price_thb / 100));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumericValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cardStockSummariesFromJson(value: unknown): CardStockSummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.cardId !== "string") return [];
    return [
      {
        cardId: item.cardId,
        totalUnits: numericValue(item.totalUnits),
        availableUnits: numericValue(item.availableUnits),
        reservedUnits: numericValue(item.reservedUnits),
        allocatedUnits: numericValue(item.allocatedUnits),
        archivedUnits: numericValue(item.archivedUnits),
      },
    ];
  });
}

function cardStockSubSkuSummariesFromJson(value: unknown): StockSkuSummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.cardId !== "string") return [];
    return [
      {
        cardId: item.cardId,
        sampleUnitId: typeof item.sampleUnitId === "string" ? item.sampleUnitId : null,
        condition: typeof item.condition === "string" ? item.condition : null,
        grade: typeof item.grade === "string" ? item.grade : null,
        gradingService:
          typeof item.gradingService === "string" ? item.gradingService : null,
        certNumber: typeof item.certNumber === "string" ? item.certNumber : null,
        gemrateId: typeof item.gemrateId === "string" ? item.gemrateId : null,
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        totalUnits: numericValue(item.totalUnits),
        availableUnits: numericValue(item.availableUnits),
        reservedUnits: numericValue(item.reservedUnits),
        allocatedUnits: numericValue(item.allocatedUnits),
      },
    ];
  });
}

function defaultCampaignTags(series: "one_piece" | "pokemon") {
  return series === "pokemon" ? ["PSA10"] : ["Manga"];
}

function safeDisplayTags(
  row: Database["public"]["Tables"]["draw_rounds"]["Row"],
) {
  const tags = row.display_tags;
  if (!Array.isArray(tags)) return defaultCampaignTags(row.series);
  const cleaned = tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  return cleaned.length ? cleaned : defaultCampaignTags(row.series);
}

type InventorySummary = {
  drawRoundId: string;
  totalSlots?: number;
  remainingSlots?: number;
  totalUnits?: number;
  availableUnits?: number;
  availableWinSlots?: number;
  eligibleUnits?: number;
  awardedUnits?: number;
  voidUnits?: number;
};

type DrawRoundRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
const approvalStatuses: readonly YnotApprovalStatus[] = [
  "not_submitted",
  "pending_review",
  "approved",
  "rejected",
  "changes_requested",
];
const randomLogicModes: readonly YnotRandomLogicMode[] = [
  "pure_random",
  "weighted_templates",
  "inventory_gated",
];

function inferredApprovalStatus(status: YnotCampaign["status"]) {
  return status === "live" || status === "closed" || status === "archived"
    ? "approved"
    : "not_submitted";
}

function normalizeApprovalStatus(
  value: unknown,
  fallback: YnotApprovalStatus,
): YnotApprovalStatus {
  return approvalStatuses.includes(value as YnotApprovalStatus)
    ? (value as YnotApprovalStatus)
    : fallback;
}

function normalizeRandomLogicMode(value: unknown): YnotRandomLogicMode {
  if (randomLogicModes.includes(value as YnotRandomLogicMode)) {
    return value as YnotRandomLogicMode;
  }
  if (isRecord(value)) {
    const mode = value.mode ?? value.logicMode;
    if (randomLogicModes.includes(mode as YnotRandomLogicMode)) {
      return mode as YnotRandomLogicMode;
    }
  }
  return "pure_random";
}

function inventorySummariesFromJson(value: unknown): InventorySummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.drawRoundId !== "string") return [];
    return [
      {
        drawRoundId: item.drawRoundId,
        totalSlots: optionalNumericValue(item.totalSlots),
        remainingSlots: optionalNumericValue(item.remainingSlots),
        totalUnits: optionalNumericValue(item.totalUnits) ?? 0,
        availableUnits: optionalNumericValue(item.availableUnits) ?? 0,
        availableWinSlots: optionalNumericValue(item.availableWinSlots),
        eligibleUnits: optionalNumericValue(item.eligibleUnits),
        awardedUnits: optionalNumericValue(item.awardedUnits) ?? 0,
        voidUnits: optionalNumericValue(item.voidUnits) ?? 0,
      },
    ];
  });
}

function soldPctForCampaign(row: DrawRoundRow, inventory?: InventorySummary) {
  const remainingSlots =
    inventory?.remainingSlots ?? row.total_slots;
  const soldSlots = Math.max(0, row.total_slots - remainingSlots);
  if (row.total_slots <= 0) return 100;
  return Math.min(100, (soldSlots / row.total_slots) * 100);
}

function isAdminHidden(metadata: unknown) {
  return isRecord(metadata) && metadata.adminHidden === true;
}

function isOwnerRemoved(metadata: unknown) {
  return isRecord(metadata) && typeof metadata.ownerRemovedAt === "string";
}

function metadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return undefined;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataInteger(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return null;
  const parsed = Math.round(Number(metadata[key]));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function metadataNumber(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return undefined;
  const parsed = Number(metadata[key]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function displayTierFromPrizeMetadata(
  prize: Pick<
    Database["public"]["Tables"]["draw_round_prizes"]["Row"],
    "metadata" | "tier" | "rank"
  >,
) {
  const displayTier = metadataString(prize.metadata, "displayTier");
  if (displayTier) return prizeDisplayTierValue(displayTier);
  const displayGroup = metadataString(prize.metadata, "displayGroup");
  if (displayGroup) return prizeDisplayTierValue(displayGroup);
  if (prize.tier === "high" && prize.rank <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  return "bronze";
}

function soldPctForYnotCampaign(campaign: YnotCampaign) {
  const remainingSlots = campaign.remainingSlots ?? campaign.totalSlots;
  if (campaign.totalSlots <= 0) return 100;
  return Math.round(
    Math.min(
      100,
      (Math.max(0, campaign.totalSlots - remainingSlots) /
        campaign.totalSlots) *
        100,
    ),
  );
}

function effectivePrizeWeight(
  prize: Database["public"]["Tables"]["draw_round_prizes"]["Row"],
  logicMode: YnotRandomLogicMode,
) {
  if (logicMode === "pure_random") return 1;
  return Math.max(0, Number(prize.weight ?? 1) || 0);
}

function effectivePrizeUnlockAtSoldPct(
  prize: Database["public"]["Tables"]["draw_round_prizes"]["Row"],
  logicMode: YnotRandomLogicMode,
) {
  if (logicMode !== "inventory_gated") return 0;
  return Math.min(
    100,
    Math.max(0, Number(prize.unlock_at_sold_pct ?? 0) || 0),
  );
}

type PrizeLineupCardRow = {
  id: string;
  name: string;
  card_code?: string | null;
  grade?: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  prize_category?: string | null;
};

type PrizePoolCardRow = PrizeLineupCardRow & {
  catalog_category?: CardCatalogItem["catalogCategory"] | null;
  language?: string | null;
  variant?: string | null;
};

type PrizePoolStockUnitRow = Pick<
  Database["public"]["Tables"]["card_stock_units"]["Row"],
  | "id"
  | "card_id"
  | "condition"
  | "grade"
  | "grading_service"
  | "cert_number"
  | "gemrate_id"
  | "image_url"
  | "status"
>;

type PrizePoolUnitRow = Pick<
  Database["public"]["Tables"]["draw_round_prize_units"]["Row"],
  "card_stock_unit_id" | "draw_round_prize_id" | "status"
>;

type PrizeUnitCounts = {
  total: number;
  available: number;
  awarded: number;
  void: number;
};

function plannedPrizeUnitCounts(
  prize: Database["public"]["Tables"]["draw_round_prizes"]["Row"],
): PrizeUnitCounts {
  const plannedQuantity = Number(prize.planned_quantity ?? 0) || 0;
  return {
    total: plannedQuantity,
    available: plannedQuantity,
    awarded: 0,
    void: 0,
  };
}

function prizeStockMetadata(
  prize: Pick<Database["public"]["Tables"]["draw_round_prizes"]["Row"], "metadata">,
) {
  return {
    intendedStockUnitKey: metadataString(prize.metadata, "stockUnitGroupKey") ?? null,
    intendedStockSku: metadataString(prize.metadata, "stockSku") ?? null,
    intendedStockLabel: metadataString(prize.metadata, "stockLabel") ?? null,
  };
}

type PrizeLineupOptions = {
  includeLocked?: boolean;
  includeSensitiveOdds?: boolean;
  includeStockTarget?: boolean;
};

function privatePrizePreviewFields(
  prize: Database["public"]["Tables"]["draw_round_prizes"]["Row"],
  options: PrizeLineupOptions,
): Partial<
  Pick<
    YnotPrizePreview,
    | "weight"
    | "unlockAtSoldPct"
    | "intendedStockUnitKey"
    | "intendedStockSku"
    | "intendedStockLabel"
  >
> {
  return {
    ...(options.includeSensitiveOdds
      ? {
          weight: Number(prize.weight ?? 1),
          unlockAtSoldPct: Number(prize.unlock_at_sold_pct ?? 0),
        }
      : {}),
    ...(options.includeStockTarget ? prizeStockMetadata(prize) : {}),
  };
}

function cardForStockSku(card: PrizePoolCardRow): CardCatalogItem {
  return {
    catalogCardId: card.id,
    code: card.card_code ?? card.id,
    modelCode: card.card_code ?? undefined,
    language: card.language ?? undefined,
    name: card.name,
    grade: card.grade ?? "",
    series: "One Piece",
    variant: card.variant ?? undefined,
    stockUnits: [],
  };
}

function stockUnitForSku(unit: PrizePoolStockUnitRow) {
  return {
    id: unit.id,
    condition: unit.condition,
    grade: unit.grade,
    gradingService: unit.grading_service,
    certNumber: unit.cert_number,
    gemrateId: unit.gemrate_id,
    imageUrl: unit.image_url ?? null,
    status: unit.status,
  };
}

function prizePoolStockUnitUsages(
  prizeUnits: PrizePoolUnitRow[],
  stockUnitById: Map<string, PrizePoolStockUnitRow>,
  cardById: Map<string, PrizePoolCardRow>,
) {
  const usageByPrize = new Map<string, Map<string, StockSkuUsageDetail>>();
  for (const prizeUnit of prizeUnits) {
    if (!prizeUnit.card_stock_unit_id) continue;
    const stockUnit = stockUnitById.get(prizeUnit.card_stock_unit_id);
    if (!stockUnit) continue;
    const card = cardById.get(stockUnit.card_id);
    if (!card) continue;
    const displayUnit = stockUnitForSku(stockUnit);
    const groupKey = stockUnitGroupKey(displayUnit);
    const prizeUsage =
      usageByPrize.get(prizeUnit.draw_round_prize_id) ??
      new Map<string, StockSkuUsageDetail>();
    const existing =
      prizeUsage.get(groupKey) ??
      ({
        groupKey,
        sku: stockUnitSku(cardForStockSku(card), displayUnit),
        label: stockUnitDisplayLabel(displayUnit),
        totalUnits: 0,
        availableUnits: 0,
        awardedUnits: 0,
        voidUnits: 0,
      } satisfies StockSkuUsageDetail);

    existing.totalUnits += 1;
    if (prizeUnit.status === "available" || prizeUnit.status === "reserved") {
      existing.availableUnits += 1;
    }
    if (prizeUnit.status === "awarded") existing.awardedUnits += 1;
    if (prizeUnit.status === "void") existing.voidUnits += 1;
    prizeUsage.set(groupKey, existing);
    usageByPrize.set(prizeUnit.draw_round_prize_id, prizeUsage);
  }

  return new Map(
    [...usageByPrize.entries()].map(([prizeId, usages]) => [
      prizeId,
      [...usages.values()].sort((left, right) => left.sku.localeCompare(right.sku)),
    ]),
  );
}

async function readSupabaseRows<T>(
  label: string,
  query: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  try {
    const { data, error } = await query();
    if (error) {
      recordDataIssue(label, error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    recordDataIssue(label, error);
    return [];
  }
}

async function readPrizeUnitImageUrlsByPrizeId(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  prizeIds: string[],
  label: string,
) {
  if (!prizeIds.length) return new Map<string, string>();
  // Resolve ONE representative image per prize straight from the stock units
  // allocated to each prize, fetching ONLY units that actually carry an image.
  // Going via every prize unit instead pulled the round's whole slot table —
  // ~1000 rows for a 1000-slot pack, of which maybe 25 have an image — which
  // inflated the worker's CPU/memory toward the Cloudflare 1102 "exceeded resource
  // limits" failure (and, when collected into one IN(...), a 400 from URL length).
  // The image-bearing allocated units are a small set, fetched in bounded batches.
  const out = new Map<string, string>();
  const PRIZE_BATCH = 150;
  for (let i = 0; i < prizeIds.length; i += PRIZE_BATCH) {
    const batch = prizeIds.slice(i, i + PRIZE_BATCH);
    const rows = await readSupabaseRows<{
      allocated_draw_round_prize_id: string | null;
      image_url: string | null;
    }>(
      `${label}_allocated_images`,
      () =>
        supabase
          .from("card_stock_units")
          .select("allocated_draw_round_prize_id,image_url")
          .in("allocated_draw_round_prize_id", batch)
          .not("image_url", "is", null),
    );
    for (const row of rows) {
      const prizeId = row.allocated_draw_round_prize_id;
      const img =
        typeof row.image_url === "string" && row.image_url.trim()
          ? row.image_url.trim()
          : null;
      if (prizeId && img && !out.has(prizeId)) out.set(prizeId, img);
    }
  }
  return out;
}

// Last One Prize is stored on draw_rounds, not in draw_round_prizes. It counts
// as the final reward slot, but this preview remains display-only: resolve the
// chosen sub-SKU image without exposing the private filter metadata.
async function resolveLastPrizePreview(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: DrawRoundRow,
): Promise<YnotLastPrizePreview | null> {
  const cardId = row.last_prize_card_id;
  if (!cardId) return null;
  const metadata = row.last_prize_metadata;
  const filter =
    isRecord(metadata) && isRecord(metadata.stockUnitFilter)
      ? metadata.stockUnitFilter
      : null;
  const certNumber =
    filter && typeof filter.certNumber === "string"
      ? filter.certNumber.trim()
      : "";
  const grade =
    filter && typeof filter.grade === "string" ? filter.grade.trim() : "";

  const cards = await readSupabaseRows<{
    id: string;
    card_code: string | null;
    name: string | null;
    image_url: string | null;
  }>("last_prize_card", () =>
    supabase
      .from("cards")
      .select("id,card_code,name,image_url")
      .eq("id", cardId)
      .limit(1),
  );
  const card = cards[0];
  if (!card) return null;

  const units = await readSupabaseRows<{
    image_url: string | null;
    cert_number: string | null;
    grade: string | null;
    status: string | null;
  }>("last_prize_stock_units", () =>
    supabase
      .from("card_stock_units")
      .select("image_url,cert_number,grade,status")
      .eq("card_id", cardId)
      .neq("status", "deleted"),
  );
  // Prefer the exact sub-SKU the admin selected (cert match, then grade match),
  // and among candidates prefer one that actually has an image.
  const withImage = (u: { image_url: string | null }) => Boolean(u.image_url);
  const certMatches = certNumber
    ? units.filter((u) => (u.cert_number ?? "").trim() === certNumber)
    : [];
  const gradeMatches = grade
    ? units.filter((u) => (u.grade ?? "").trim() === grade)
    : [];
  const pickFrom = (list: typeof units) =>
    list.find(withImage) ?? list[0] ?? null;
  const matchedUnit =
    pickFrom(certMatches) ?? pickFrom(gradeMatches) ?? pickFrom(units);

  const cardImageUrl =
    publicSubSkuImageUrl(matchedUnit?.image_url) ??
    publicSubSkuImageUrl(card.image_url) ??
    null;

  return {
    cardName: card.name ?? card.card_code ?? "Last prize",
    cardCode: card.card_code ?? null,
    cardImageUrl,
  };
}

// Public, client-fetched resolver for the pack detail page. The same query run
// inline on the (heavy) detail page gets starved by the Cloudflare Worker
// subrequest budget and silently returns null, so the customer page fetches the
// last-prize preview separately — its own request has a fresh budget.
export async function getLastPrizePreviewForCampaign(
  slugOrId: string,
): Promise<YnotLastPrizePreview | null> {
  if (!isSupabaseConfigured()) return null;
  const lookup = slugOrId.trim();
  if (!lookup) return null;
  const supabase = createServiceSupabaseClient();
  const column = looksLikeUuid(lookup) ? "id" : "slug";
  const rows = await readSupabaseRows<DrawRoundRow>("last_prize_lookup", () =>
    supabase.from("draw_rounds").select("*").eq(column, lookup).limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  return resolveLastPrizePreview(supabase, row);
}

function isOwnerReviewLineupRow(row: DrawRoundRow) {
  const approvalStatus = normalizeApprovalStatus(
    row.approval_status,
    inferredApprovalStatus(row.status),
  );
  return (
    approvalStatus === "pending_review" ||
    (approvalStatus === "approved" &&
      (row.status === "draft" || row.visibility !== "public"))
  );
}

// Representative ("inventory preview") image for a card: any non-deleted stock
// unit of the card that carries an image. Last-resort fallback for a prize whose
// allocated slab has no photo AND whose card has no catalog image — some packs are
// built from un-photographed units while a photographed copy sits elsewhere in
// stock. Mirrors the admin catalog's inventory-preview. Bounded + batched by card.
async function readCardRepresentativeImages(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  cardIds: string[],
  label: string,
) {
  const uniq = [...new Set(cardIds)];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const BATCH = 100;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH);
    const rows = await readSupabaseRows<{
      card_id: string | null;
      image_url: string | null;
    }>(
      `${label}_card_rep_images`,
      () =>
        supabase
          .from("card_stock_units")
          .select("card_id,image_url")
          .in("card_id", batch)
          .in("status", ["available", "allocated", "reserved"])
          .not("image_url", "is", null),
    );
    for (const row of rows) {
      const cardId = row.card_id;
      const img =
        typeof row.image_url === "string" && row.image_url.trim()
          ? row.image_url.trim()
          : null;
      if (cardId && img && !out.has(cardId)) out.set(cardId, img);
    }
  }
  return out;
}

async function getPublicPrizeLineupsBatch(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  rows: DrawRoundRow[],
  inventoryByCampaign: Map<string, InventorySummary>,
  options: PrizeLineupOptions = {},
): Promise<Map<string, YnotPrizePreview[]>> {
  const out = new Map<string, YnotPrizePreview[]>();
  if (!rows.length) return out;

  const campaignIds = rows.map((row) => row.id);
  const { data: prizes, error: prizesError } = await supabase
    .from("draw_round_prizes")
    .select("*")
    .in("draw_round_id", campaignIds)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });
  if (prizesError) throw prizesError;
  const prizeRows = prizes ?? [];

  const visiblePrizesByCampaign = new Map<string, typeof prizeRows>();
  for (const row of rows) {
    const inventory = inventoryByCampaign.get(row.id);
    const soldPct = soldPctForCampaign(row, inventory);
    const logicMode = normalizeRandomLogicMode(row.logic_snapshot);
    const visible = prizeRows
      .filter((prize) => prize.draw_round_id === row.id)
      .filter(
        (prize) =>
          !isAdminHidden(prize.metadata) &&
          (options.includeLocked ||
            (effectivePrizeWeight(prize, logicMode) > 0 &&
              effectivePrizeUnlockAtSoldPct(prize, logicMode) <= soldPct)),
      );
    if (visible.length) visiblePrizesByCampaign.set(row.id, visible);
  }

  if (!visiblePrizesByCampaign.size) {
    for (const row of rows) out.set(row.id, []);
    return out;
  }

  const allVisible = Array.from(visiblePrizesByCampaign.values()).flat();
  const cardIds = [...new Set(allVisible.map((prize) => prize.card_id))];

  const cards = cardIds.length
    ? await readSupabaseRows<PrizeLineupCardRow>(
        "campaign_prize_lineup_cards",
        () =>
          supabase
            .from("cards")
            .select(
              "id,name,card_code,grade,image_url,image_storage_path,prize_category",
            )
            .in("id", cardIds),
      )
    : [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const prizeImageByPrizeId = await readPrizeUnitImageUrlsByPrizeId(
    supabase,
    allVisible.map((prize) => prize.id),
    "campaign_prize_lineup_images",
  );
  const lineupPreviewImageByCardId = await readCardRepresentativeImages(
    supabase,
    allVisible
      .filter(
        (prize) =>
          !prizeImageByPrizeId.get(prize.id) &&
          !cardById.get(prize.card_id)?.image_url,
      )
      .map((prize) => prize.card_id),
    "campaign_prize_lineup",
  );

  for (const row of rows) {
    const visible = visiblePrizesByCampaign.get(row.id) ?? [];
    const previews: YnotPrizePreview[] = visible
      .map((prize) => {
        const counts = plannedPrizeUnitCounts(prize);
        const displayTier = displayTierFromPrizeMetadata(prize);
        const card = cardById.get(prize.card_id);
        return {
          id: prize.id,
          cardId: prize.card_id,
          cardCode: card?.card_code ?? null,
          cardGrade: card?.grade ?? null,
          cardImageUrl:
            publicSubSkuImageUrl(prizeImageByPrizeId.get(prize.id)) ??
            publicSubSkuImageUrl(card?.image_url) ??
            publicSubSkuImageUrl(
              lineupPreviewImageByCardId.get(prize.card_id),
            ),
          cardImageStoragePath: card?.image_storage_path ?? null,
          cardPrizeCategory: card?.prize_category ?? null,
          cardName: card?.name ?? "Mystery reward",
          tier: prize.tier,
          rank: prize.rank,
          valueThb: prize.value_thb,
          convertCoinValue: Math.max(0, Math.round(Number(prize.convert_coin_value ?? 0))),
          bundleQuantity: publicBundleQuantity(prize.bundle_quantity),
          plannedQuantity: counts.total,
          availableUnits: counts.available || undefined,
          totalUnits: counts.total || undefined,
          prizeCategory: metadataString(prize.metadata, "prizeCategory"),
          prizeCategoryLabel: metadataString(
            prize.metadata,
            "prizeCategoryLabel",
          ),
          sourceType: metadataString(prize.metadata, "sourceType"),
          displayGroup: metadataString(prize.metadata, "displayGroup"),
          displayTier,
          displayTierLabel:
            metadataString(prize.metadata, "displayTierLabel") ??
            prizeDisplayTierLabel(displayTier),
          tierRank: metadataNumber(prize.metadata, "tierRank") ?? prize.rank,
          ...privatePrizePreviewFields(prize, options),
        };
      })
      .sort((left, right) => {
        const tierOrder =
          prizeDisplayTierOrder(left.displayTier) -
          prizeDisplayTierOrder(right.displayTier);
        if (tierOrder !== 0) return tierOrder;
        return (left.tierRank ?? left.rank) - (right.tierRank ?? right.rank);
      });
    out.set(row.id, previews);
  }
  return out;
}

async function getPublicPrizeLineup(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: DrawRoundRow,
  inventory?: InventorySummary,
  options: PrizeLineupOptions = {},
): Promise<YnotPrizePreview[]> {
  const soldPct = soldPctForCampaign(row, inventory);
  const { data: prizes, error } = await supabase
    .from("draw_round_prizes")
    .select("*")
    .eq("draw_round_id", row.id)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });
  if (error) throw error;

  const logicMode = normalizeRandomLogicMode(row.logic_snapshot);
  const visiblePrizes = (prizes ?? []).filter(
    (prize) =>
      !isAdminHidden(prize.metadata) &&
      (options.includeLocked ||
        (effectivePrizeWeight(prize, logicMode) > 0 &&
          effectivePrizeUnlockAtSoldPct(prize, logicMode) <= soldPct)),
  );
  if (!visiblePrizes.length) return [];

  const cardIds = [...new Set(visiblePrizes.map((prize) => prize.card_id))];
  const cards = cardIds.length
    ? await readSupabaseRows<PrizeLineupCardRow>(
        "campaign_detail_prize_lineup_cards",
        () =>
          supabase
            .from("cards")
            .select(
              "id,name,card_code,grade,image_url,image_storage_path,prize_category",
            )
            .in("id", cardIds),
      )
    : [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const prizeImageByPrizeId = await readPrizeUnitImageUrlsByPrizeId(
    supabase,
    visiblePrizes.map((prize) => prize.id),
    "campaign_detail_prize_lineup_images",
  );
  const lineupPreviewImageByCardId = await readCardRepresentativeImages(
    supabase,
    visiblePrizes
      .filter(
        (prize) =>
          !prizeImageByPrizeId.get(prize.id) &&
          !cardById.get(prize.card_id)?.image_url,
      )
      .map((prize) => prize.card_id),
    "campaign_detail_prize_lineup",
  );

  return visiblePrizes
    .map((prize) => {
      const counts = plannedPrizeUnitCounts(prize);
      const displayTier = displayTierFromPrizeMetadata(prize);
      const card = cardById.get(prize.card_id);
      return {
        id: prize.id,
        cardId: prize.card_id,
        cardCode: card?.card_code ?? null,
        cardGrade: card?.grade ?? null,
        cardImageUrl:
          publicSubSkuImageUrl(prizeImageByPrizeId.get(prize.id)) ??
          publicSubSkuImageUrl(card?.image_url) ??
          publicSubSkuImageUrl(lineupPreviewImageByCardId.get(prize.card_id)),
        cardImageStoragePath: card?.image_storage_path ?? null,
        cardPrizeCategory: card?.prize_category ?? null,
        cardName: card?.name ?? "Mystery reward",
        tier: prize.tier,
        rank: prize.rank,
        valueThb: prize.value_thb,
        convertCoinValue: Math.max(0, Math.round(Number(prize.convert_coin_value ?? 0))),
        bundleQuantity: publicBundleQuantity(prize.bundle_quantity),
        plannedQuantity: counts.total,
        availableUnits: counts.available || undefined,
        totalUnits: counts.total || undefined,
        prizeCategory: metadataString(prize.metadata, "prizeCategory"),
        prizeCategoryLabel: metadataString(prize.metadata, "prizeCategoryLabel"),
        sourceType: metadataString(prize.metadata, "sourceType"),
        displayGroup: metadataString(prize.metadata, "displayGroup"),
        displayTier,
        displayTierLabel:
          metadataString(prize.metadata, "displayTierLabel") ??
          prizeDisplayTierLabel(displayTier),
        tierRank: metadataNumber(prize.metadata, "tierRank") ?? prize.rank,
        ...privatePrizePreviewFields(prize, options),
      };
    })
    .sort((left, right) => {
      const tierOrder =
        prizeDisplayTierOrder(left.displayTier) -
        prizeDisplayTierOrder(right.displayTier);
      if (tierOrder !== 0) return tierOrder;
      return (left.tierRank ?? left.rank) - (right.tierRank ?? right.rank);
    });
}

async function getPublicPrizeLineupsIndividually(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  rows: DrawRoundRow[],
  inventoryByCampaign: Map<string, InventorySummary>,
  options: PrizeLineupOptions = {},
): Promise<Map<string, YnotPrizePreview[]>> {
  const out = new Map<string, YnotPrizePreview[]>();
  for (const row of rows) {
    try {
      out.set(
        row.id,
        await getPublicPrizeLineup(
          supabase,
          row,
          inventoryByCampaign.get(row.id),
          options,
        ),
      );
    } catch (error) {
      recordDataIssue(`campaign_owner_prize_lineup_${row.slug}`, error);
      out.set(row.id, []);
    }
  }
  return out;
}

function toYnotCampaign(
  row: DrawRoundRow,
  linkedCategories: YnotCategory[] = [],
  inventory?: InventorySummary,
  prizeLineup?: YnotPrizePreview[],
  readiness?: CampaignPrizeReadiness | null,
): YnotCampaign {
  const approvalStatus = normalizeApprovalStatus(
    row.approval_status,
    inferredApprovalStatus(row.status),
  );
  const plannedPrizeUnits = (prizeLineup ?? []).reduce(
    (sum, prize) =>
      sum +
      (Number(prize.plannedQuantity ?? prize.totalUnits ?? 0) || 0),
    0,
  );
  const plannedPrizeUnitFallback =
    plannedPrizeUnits > 0 ? plannedPrizeUnits : undefined;
  const materializedTotalUnits =
    inventory?.totalUnits === undefined ? undefined : inventory.totalUnits;
  const materializedAvailableUnits =
    inventory?.availableUnits === undefined ? undefined : inventory.availableUnits;
  const remainingSlots = readiness?.remainingSlots ?? inventory?.remainingSlots;
  const availablePrizeUnits =
    readiness?.availablePrizeUnits ??
    materializedAvailableUnits ??
    plannedPrizeUnitFallback ??
    inventory?.availableUnits;
  const eligiblePrizeUnits =
    readiness?.eligiblePrizeUnits ??
    (approvalStatus === "pending_review" ? availablePrizeUnits : undefined);
  const soldOut =
    readiness?.soldOut ??
    Boolean(
      (remainingSlots !== undefined && remainingSlots <= 0) ||
        (availablePrizeUnits !== undefined && availablePrizeUnits <= 0),
    );
  const adminRemoved = isOwnerRemoved(row.test_metadata);
  const hasOpenableInventory = readiness
    ? (readiness.eligiblePrizeUnits ?? 0) > 0 && readiness.ready !== false
    : (availablePrizeUnits ?? 0) > 0 &&
      (remainingSlots ?? row.total_slots) > 0;
  const openable =
    row.status === "live" &&
    row.visibility === "public" &&
    approvalStatus === "approved" &&
    !adminRemoved &&
    !soldOut &&
    hasOpenableInventory;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    approvalStatus,
    titleTh: row.title_th,
    titleEn: row.title_en,
    series: row.series,
    priceThb: row.price_thb,
    costCoins: safeCostCoins(row),
    mode: row.mode,
    visibility: row.visibility,
    totalSlots: row.total_slots,
    remainingSlots,
    totalPrizeUnits:
      readiness?.totalPrizeUnits ??
      materializedTotalUnits ??
      plannedPrizeUnitFallback ??
      inventory?.totalUnits,
    availablePrizeUnits,
    eligiblePrizeUnits,
    initialEligiblePrizeUnits: readiness?.initialEligiblePrizeUnits,
    awardedPrizeUnits: inventory?.awardedUnits,
    voidPrizeUnits: inventory?.voidUnits,
    readinessBlockers: readiness?.blockers,
    openable,
    soldOut,
    adminRemoved,
    packCode: row.pack_code,
    hasLastPrize: Boolean(row.last_prize_card_id),
    lastPrizeCardId: row.last_prize_card_id ?? null,
    lastPrizeStockUnitKey:
      metadataString(row.last_prize_metadata, "stockUnitGroupKey") ?? null,
    lastPrizeCatalogCategory:
      metadataString(row.last_prize_metadata, "catalogCategory") ?? null,
    lastPrizeConvertCoinValue:
      metadataInteger(row.last_prize_metadata, "convertCoinValue"),
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    approvalRequestedAt: row.approval_requested_at,
    approvedAt: row.approved_at,
    approvalNotes: row.approval_notes,
    logicMode: normalizeRandomLogicMode(row.logic_snapshot),
    isTest: row.is_test,
    categoryIds: linkedCategories.map((category) => category.id),
    categorySlugs: linkedCategories.map((category) => category.slug),
    categoryLabel:
      linkedCategories.map((category) => category.nameEn).join(", ") ||
      (row.series === "pokemon" ? "Pokemon" : "One Piece"),
    displayTags: safeDisplayTags(row),
    bannerImageUrl: row.banner_image_url ?? null,
    bannerImageStoragePath: row.banner_image_storage_path ?? null,
    openQuantityOptions: normalizeOpenQuantityOptions(row.logic_snapshot),
    prizeLineup,
    convertDeadlineDays:
      typeof row.convert_deadline_days === "number" && row.convert_deadline_days > 0
        ? row.convert_deadline_days
        : null,
  };
}

function publicPrizePreview(prize: YnotPrizePreview, index: number): YnotPrizePreview {
  return {
    id: `public-prize-${index + 1}`,
    cardCode: prize.cardCode,
    cardGrade: prize.cardGrade,
    cardImageUrl: prize.cardImageUrl,
    // Raw prize tier ("high"/"normal") is intentionally omitted; customers see
    // rarity only through displayTier / displayTierLabel below.
    cardPrizeCategory: prize.cardPrizeCategory,
    cardName: prize.cardName,
    rank: index + 1,
    valueThb: prize.valueThb,
    convertCoinValue: prize.convertCoinValue,
    bundleQuantity: prize.bundleQuantity,
    prizeCategory: prize.prizeCategory,
    prizeCategoryLabel: prize.prizeCategoryLabel,
    displayTier: prize.displayTier,
    displayTierLabel: prize.displayTierLabel,
  };
}

function publicPrizeLineup(prizes?: YnotPrizePreview[]) {
  return prizes?.map(publicPrizePreview);
}

function publicYnotCampaign(campaign: YnotCampaign): YnotCampaign {
  const prizeLineup = publicPrizeLineup(campaign.prizeLineup);
  return {
    id: campaign.slug,
    slug: campaign.slug,
    status: campaign.status,
    titleTh: campaign.titleTh,
    titleEn: campaign.titleEn,
    series: campaign.series,
    priceThb: campaign.priceThb,
    costCoins: campaign.costCoins,
    mode: campaign.mode,
    visibility: campaign.visibility,
    totalSlots: campaign.totalSlots,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    remainingSlots: campaign.remainingSlots,
    openable: campaign.openable,
    soldOut: campaign.soldOut,
    categorySlugs: campaign.categorySlugs,
    categoryLabel: campaign.categoryLabel,
    heroLabel: campaign.heroLabel,
    displayTags: campaign.displayTags,
    bannerImageUrl: campaign.bannerImageUrl ?? null,
    openQuantityOptions: campaign.openQuantityOptions,
    convertDeadlineDays: campaign.convertDeadlineDays,
    hasLastPrize:
      campaign.hasLastPrize ??
      Boolean(campaign.lastPrizeCardId || campaign.lastPrizePreview),
    ...(campaign.lastPrizePreview
      ? { lastPrizePreview: campaign.lastPrizePreview }
      : {}),
    ...(prizeLineup ? { prizeLineup } : {}),
  };
}

function localOwnerMockPrizeLineup(
  campaignId: string,
  logicMode: YnotRandomLogicMode,
): YnotPrizePreview[] {
  const usesSoldUnlock = logicMode === "inventory_gated";
  const usesWeights =
    logicMode === "weighted_templates" || logicMode === "inventory_gated";
  const unlockAtSoldPct = usesSoldUnlock ? 30 : 0;
  const topWeight = usesWeights ? 0.25 : 1;
  const highWeight = usesWeights ? 0.75 : 1;
  const normalWeight = usesWeights ? 8 : 1;
  const prize = (
    suffix: string,
    cardName: string,
    tier: "normal" | "high",
    rank: number,
    totalUnits: number,
    weight: number,
    displayGroup: "top" | "high" | "normal",
  ): YnotPrizePreview => {
    const displayTier = prizeDisplayTierValue(displayGroup);
    return {
      id: `${campaignId}-${suffix}`,
      cardId: `mock-card-${campaignId}-${suffix}`,
      cardName,
      tier,
      rank,
      availableUnits: totalUnits,
      totalUnits,
      weight,
      unlockAtSoldPct: displayGroup === "normal" ? 0 : unlockAtSoldPct,
      prizeCategory: "psa10_card",
      prizeCategoryLabel: "PSA10 card",
      sourceType: "card",
      displayGroup,
      displayTier,
      displayTierLabel: prizeDisplayTierLabel(displayTier),
      tierRank: rank,
    };
  };

  return [
    prize(
      "top-1",
      "Charizard ex SAR PSA10",
      "high",
      1,
      1,
      topWeight,
      "top",
    ),
    prize(
      "top-2",
      "Pikachu Master Ball Reverse PSA10",
      "high",
      2,
      1,
      topWeight,
      "top",
    ),
    prize(
      "top-3",
      "Luffy Manga Parallel PSA10",
      "high",
      3,
      1,
      topWeight,
      "top",
    ),
    prize(
      "high-4",
      "Nami Alt Art PSA10",
      "high",
      4,
      2,
      highWeight,
      "high",
    ),
    prize(
      "high-5",
      "Zoro Secret Rare PSA10",
      "high",
      5,
      2,
      highWeight,
      "high",
    ),
    prize(
      "high-6",
      "Pokemon Trainer SAR PSA10",
      "high",
      6,
      3,
      highWeight,
      "high",
    ),
    prize(
      "normal-1",
      "Playable foil card",
      "normal",
      1,
      18,
      normalWeight,
      "normal",
    ),
    prize(
      "normal-2",
      "Booster pack reward",
      "normal",
      2,
      24,
      normalWeight,
      "normal",
    ),
    prize(
      "normal-3",
      "Store credit reward",
      "normal",
      3,
      32,
      normalWeight,
      "normal",
    ),
  ];
}

function localOwnerMockApprovalRequests(): YnotOwnerApprovalRequest[] {
  const mockConfigs: Array<{
    id: string;
    title: string;
    logicMode: YnotRandomLogicMode;
    soldPct: number;
    totalSlots: number;
    totalPrizeUnits: number;
    summary: string[];
  }> = [
    {
      id: "mock-owner-pack-pure-random",
      title: "Owner Mock Pure Random",
      logicMode: "pure_random",
      soldPct: 8,
      totalSlots: 80,
      totalPrizeUnits: 80,
      summary: [
        "Every unlocked prize unit has equal odds.",
        "All public-safe rewards are visible immediately.",
        "Approve keeps the pack draft/private until publish.",
      ],
    },
    {
      id: "mock-owner-pack-locked-30",
      title: "Owner Mock 30% Locked Chase",
      logicMode: "inventory_gated",
      soldPct: 18,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        "Rank 1-3 chase rewards stay private before 30% sold.",
        "Locked prize units remain in Postgres but cannot drop.",
        "Base rewards remain available for early openings.",
      ],
    },
    {
      id: "mock-owner-pack-unlocked-30",
      title: "Owner Mock 30% Unlocked",
      logicMode: "inventory_gated",
      soldPct: 30,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        "Sold checkpoint is reached, so locked rewards can enter odds.",
        "High-tier rewards use their configured weights after unlock.",
        "Customer preview can show only unlocked rewards.",
      ],
    },
    {
      id: "mock-owner-pack-weighted-high",
      title: "Owner Mock Weighted High Tier",
      logicMode: "weighted_templates",
      soldPct: 64,
      totalSlots: 120,
      totalPrizeUnits: 120,
      summary: [
        "High-tier and normal rewards can use different weights.",
        "Weight zero disables a prize from the drop pool.",
        "Weighted random is enforced in the database RPC.",
      ],
    },
  ];

  return mockConfigs.map((config, index) => {
    const soldSlots = Math.round(
      (config.soldPct / 100) * config.totalSlots,
    );
    const availableUnits = Math.max(
      0,
      config.totalPrizeUnits - soldSlots,
    );
    const campaign: YnotCampaign = {
      id: config.id,
      slug: config.id,
      status: "draft",
      approvalStatus: "pending_review",
      titleTh: config.title,
      titleEn: config.title,
      series: "pokemon",
      priceThb: 150 + index * 10,
      costCoins: 150 + index * 10,
      mode: "instant_gacha",
      visibility: "private",
      totalSlots: config.totalSlots,
      sortOrder: index + 1,
      startsAt: "2026-05-11T10:00:00.000Z",
      endsAt: null,
      createdAt: "2026-05-11T10:00:00.000Z",
      approvalRequestedAt: `2026-05-11T10:${String(5 + index).padStart(2, "0")}:00.000Z`,
      approvalNotes: "Local owner approval mock for random logic testing.",
      logicMode: config.logicMode,
      remainingSlots: Math.max(0, config.totalSlots - soldSlots),
      totalPrizeUnits: config.totalPrizeUnits,
      availablePrizeUnits: availableUnits,
      awardedPrizeUnits: soldSlots,
      voidPrizeUnits: 0,
      categoryLabel: "Pokemon",
      isTest: true,
      heroLabel:
        config.logicMode === "inventory_gated"
          ? "Mock locked high-tier rewards / base rewards"
          : "Mock weighted reward setup / base rewards",
      displayTags: ["Owner review", "Local mock"],
      prizeLineup: localOwnerMockPrizeLineup(config.id, config.logicMode),
      demo: true,
    };

    return {
      id: `mock-owner-approval-${config.id}`,
      campaign,
      approvalStatus: "pending_review",
      logicMode: config.logicMode,
      requestedByLabel: "Local Admin Studio",
      requestedAt: campaign.approvalRequestedAt ?? "2026-05-11T10:05:00.000Z",
      soldPct: config.soldPct,
      notificationLabel: "Owner review needed",
      mock: true,
      summary: config.summary,
    };
  });
}

function ownerApprovalRequestFromCampaign(
  campaign: YnotCampaign,
): YnotOwnerApprovalRequest | null {
  const approvalStatus =
    campaign.approvalStatus ?? inferredApprovalStatus(campaign.status);
  const needsPublish =
    approvalStatus === "approved" &&
    (campaign.status === "draft" || campaign.visibility !== "public");
  if (approvalStatus !== "pending_review" && !needsPublish) return null;
  const readinessLine = campaign.readinessBlockers?.length
    ? `Prize readiness blocked: ${campaign.readinessBlockers[0]}`
    : campaign.readinessBlockers
      ? "Prize inventory is ready for owner review and publish."
      : "Open Random Pack Studio to run the full prize readiness check.";
  return {
    id: `owner-approval-${campaign.id}`,
    campaign,
    approvalStatus,
    logicMode: campaign.logicMode ?? "pure_random",
    requestedByLabel: "Admin Studio",
    requestedAt:
      campaign.approvalRequestedAt ??
      campaign.createdAt ??
      new Date(0).toISOString(),
    soldPct: soldPctForYnotCampaign(campaign),
    notificationLabel: needsPublish
      ? "Owner publish needed"
      : "Owner review needed",
    summary: [
      "Campaign is held from public live status until owner approval.",
      "Only public-safe status details are shown outside the owner queue.",
      "Publish must happen through the owner lifecycle route after approval.",
      readinessLine,
    ],
  };
}

function getOwnerApprovalRequests(
  viewer: YnotViewer,
  campaigns: YnotCampaign[],
): YnotOwnerApprovalRequest[] {
  if (viewer.adminRole !== "owner") return [];
  const requests = campaigns.flatMap((campaign) => {
    const request = ownerApprovalRequestFromCampaign(campaign);
    return request ? [request] : [];
  });
  return allowDemoStorefront()
    ? [...localOwnerMockApprovalRequests(), ...requests]
    : requests;
}

export async function getYnotViewer(): Promise<YnotViewer> {
  const session = await resolveCurrentProfile();
  const admin = await resolveAdminSession(session);
  if (!session) return defaultViewer;
  return {
    authenticated: true,
    profileId: session.profileId,
    displayName: session.displayName ?? "YNot Customer",
    authSource: session.authSource,
    isAdmin: Boolean(admin),
    adminRole: admin?.adminRole ?? null,
  };
}

function dataIssueMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      "message",
      "details",
      "hint",
      "code",
      "name",
      "status",
      "statusText",
    ]
      .map((key) => {
        const value = record[key];
        return typeof value === "string" || typeof value === "number"
          ? `${key}=${value}`
          : null;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function recordDataIssue(label: string, error: unknown) {
  const issue: YnotDataIssue = {
    label,
    message: dataIssueMessage(error),
    recordedAt: new Date().toISOString(),
  };
  dataIssueStorage.getStore()?.push(issue);
  console.warn("ynot_data_read_unavailable", issue);
}

async function readOrEmpty<T>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    recordDataIssue(label, error);
    return [];
  }
}

type CampaignQueryOptions = {
  includePrivate?: boolean;
  includeSoldOutPublic?: boolean;
  limit?: number | null;
  includeReadiness?: boolean;
  includePrizeLineups?: boolean;
  campaignIdOrSlug?: string;
};

async function getCampaignsImpl(
  options: CampaignQueryOptions = {},
): Promise<YnotCampaign[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaigns", async () => {
    const limit = options.limit ?? null;
    const includeReadiness = options.includeReadiness ?? true;
    const includePrizeLineups =
      options.includePrizeLineups ?? Boolean(options.includePrivate);
    const campaignIdOrSlug = options.campaignIdOrSlug?.trim();
    const includeSoldOutPublic =
      options.includeSoldOutPublic ?? Boolean(campaignIdOrSlug);
    const loadRows = (requireApproval: boolean) => {
      let query = supabase
        .from("draw_rounds")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (campaignIdOrSlug) {
        query = looksLikeUuid(campaignIdOrSlug)
          ? query.eq("id", campaignIdOrSlug)
          : query.eq("slug", campaignIdOrSlug);
      }
      if (typeof limit === "number") query = query.limit(limit);

      if (options.includePrivate) {
        // Exclude archived packs even from the admin storefront view so the
        // delete/archive button visibly removes the card. Archived rows
        // remain in the database and can be restored via the lifecycle
        // queue.
        return query.in("status", ["live", "closed", "draft"]);
      }
      query = query.eq("visibility", "public");
      query = includeSoldOutPublic
        ? query.in("status", ["live", "closed"])
        : query.eq("status", "live");
      return requireApproval
        ? query.eq("approval_status", "approved")
        : query;
    };

    let { data, error } = await loadRows(true);
    if (
      error &&
      !options.includePrivate &&
      isMissingColumnError(error, "approval_status")
    ) {
      ({ data, error } = await loadRows(false));
    }
    if (error) throw error;
    const rows = (data ?? []).filter(
      (row) => options.includePrivate || row.is_test !== true,
    );
    const campaignIds = rows.map((row) => row.id);
    const [categories, categoryLinks, inventoryRows] = await Promise.all([
      getStoreCategories({ includeTest: Boolean(options.includePrivate) }),
      readOrEmpty("campaign_categories", async () => {
        if (!campaignIds.length) return [];
        const { data: links, error: linksError } = await supabase
          .from("draw_round_categories")
          .select("*")
          .in("draw_round_id", campaignIds);
        if (linksError) throw linksError;
        return links ?? [];
      }),
      readOrEmpty("campaign_inventory_summary", async () => {
        if (!campaignIds.length) return [];
        const inventoryCampaignId =
          campaignIds.length === 1 ? campaignIds[0] : null;
        const { data: inventory, error: inventoryError } = await supabase.rpc(
          "get_draw_round_inventory_summary",
          {
            p_draw_round_id: inventoryCampaignId,
            p_profile_id: null,
          },
        );
        if (inventoryError) throw inventoryError;
        return inventorySummariesFromJson(inventory);
      }),
    ]);
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const categoryLinksByCampaign = new Map<string, typeof categoryLinks>();
    for (const link of categoryLinks) {
      const existing = categoryLinksByCampaign.get(link.draw_round_id) ?? [];
      existing.push(link);
      categoryLinksByCampaign.set(link.draw_round_id, existing);
    }
    const inventoryByCampaign = new Map(
      inventoryRows.map((summary) => [summary.drawRoundId, summary]),
    );
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const readinessRows = includeReadiness
      ? await Promise.all(
          campaignIds.map(async (campaignId) => {
            try {
              return await getCampaignPrizeReadiness(supabase, campaignId, {
                row: rowById.get(campaignId),
                inventory: inventoryByCampaign.get(campaignId),
              });
            } catch (error) {
              recordDataIssue("campaign_prize_readiness", error);
              return null;
            }
          }),
        )
      : [];
    const readinessByCampaign = new Map(
      readinessRows
        .filter(
          (readiness): readiness is CampaignPrizeReadiness =>
            readiness !== null,
        )
        .map((readiness) => [readiness.campaignId, readiness]),
    );

    let prizeLineupsByCampaign = new Map<string, YnotPrizePreview[]>();
    if (options.includePrivate && includePrizeLineups) {
      // Owner-review packs always need their lineup. Live/closed packs need it
      // too now that admins can edit a published pack in place — without this
      // they're excluded and the editor falls back to a blank default template.
      // This block is admin-only (includePrivate) and the batch builder is O(2)
      // queries regardless of how many campaigns match, so widening is cheap.
      const prizeLineupRows = rows.filter(
        (row) =>
          isOwnerReviewLineupRow(row) ||
          row.status === "live" ||
          row.status === "closed",
      );
      try {
        prizeLineupsByCampaign = await getPublicPrizeLineupsBatch(
          supabase,
          prizeLineupRows,
          inventoryByCampaign,
          {
            includeLocked: true,
            includeSensitiveOdds: true,
            includeStockTarget: true,
          },
        );
      } catch (error) {
        recordDataIssue("campaign_owner_prize_lineup", error);
        prizeLineupsByCampaign = await getPublicPrizeLineupsIndividually(
          supabase,
          prizeLineupRows,
          inventoryByCampaign,
          {
            includeLocked: true,
            includeSensitiveOdds: true,
            includeStockTarget: true,
          },
        );
      }
    }

    const campaigns = rows.map((row) => {
      const links = categoryLinksByCampaign.get(row.id) ?? [];
      const linkedCategories = links
        .map((link) => categoriesById.get(link.category_id))
        .filter((category): category is YnotCategory => Boolean(category));
      const inventory = inventoryByCampaign.get(row.id);
      const campaign = toYnotCampaign(
        row,
        linkedCategories,
        inventory,
        prizeLineupsByCampaign.get(row.id),
        readinessByCampaign.get(row.id),
      );
      return options.includePrivate ? campaign : publicYnotCampaign(campaign);
    });
    return options.includePrivate
      ? campaigns
      : campaigns.filter(
          (campaign) =>
            campaign.openable ||
            (includeSoldOutPublic && campaign.soldOut),
        );
  });
}

const getPublicCampaignsCached = unstable_cache(
  () =>
    getCampaignsImpl({
      includePrivate: false,
      limit: null,
      includeReadiness: false,
    }),
  ["ynot-campaigns-public-v4-all"],
  { tags: ["campaigns"], revalidate: 60 },
);

const getPublicCampaignsWithSoldOutCached = unstable_cache(
  () =>
    getCampaignsImpl({
      includePrivate: false,
      includeSoldOutPublic: true,
      limit: null,
      includeReadiness: false,
    }),
  ["ynot-campaigns-public-v1-related-sold-out"],
  { tags: ["campaigns"], revalidate: 60 },
);

export async function getCampaigns(
  options: CampaignQueryOptions = {},
): Promise<YnotCampaign[]> {
  if (options.includePrivate) return getCampaignsImpl(options);
  if (options.campaignIdOrSlug) return getCampaignsImpl(options);
  const campaigns = await (options.includeSoldOutPublic
    ? getPublicCampaignsWithSoldOutCached()
    : getPublicCampaignsCached());
  return typeof options.limit === "number"
    ? campaigns.slice(0, options.limit)
    : campaigns;
}

async function getStoreCategoriesImpl(
  includeTest: boolean,
): Promise<YnotCategory[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("store_categories", async () => {
    let query = supabase
      .from("store_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (!includeTest)
      query = query.eq("is_active", true).eq("is_test", false);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      nameTh: row.name_th,
      nameEn: row.name_en,
      description: row.description,
      imageUrl: row.image_url,
      icon: row.icon,
      legacySeries: row.legacy_series,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      isTest: row.is_test,
    }));
  });
}

const getPublicStoreCategoriesCached = unstable_cache(
  () => getStoreCategoriesImpl(false),
  ["ynot-store-categories-public-v1"],
  { tags: ["categories"], revalidate: 300 },
);

export async function getStoreCategories(
  options: { includeTest?: boolean } = {},
): Promise<YnotCategory[]> {
  if (options.includeTest) return getStoreCategoriesImpl(true);
  return getPublicStoreCategoriesCached();
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function canReadTestCampaign(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  viewer?: YnotViewer,
) {
  if (viewer?.isAdmin) return true;
  if (!viewer?.profileId) return false;
  const { data, error } = await supabase
    .from("draw_round_testers")
    .select("profile_id")
    .eq("draw_round_id", campaignId)
    .eq("profile_id", viewer.profileId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// Customer-facing pack detail for a public, APPROVED, NON-TEST campaign. This
// is identical for every non-admin viewer, so it is cached by slug. The
// function is viewer-independent on purpose: it must not read cookies/headers
// (unstable_cache forbids that) and it returns ONLY publicYnotCampaign(...),
// so house odds / logicMode / raw tiers / stock identity / internal UUIDs are
// stripped before anything is cached. Admins and test-campaign testers never
// reach this path (see getCampaign), so a private detail view can never be
// written into or served from this shared cache.
async function loadPublicCampaignDetailImpl(
  slug: string,
): Promise<YnotCampaign | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceSupabaseClient();
  const rows = await readOrEmpty("campaign_detail_public", async () => {
    const baseSelect = () =>
      supabase
        .from("draw_rounds")
        .select("*")
        .in("status", ["live", "closed"])
        .eq("visibility", "public")
        .eq("is_test", false)
        .eq("slug", slug)
        .limit(1);
    let { data, error } = await baseSelect().eq("approval_status", "approved");
    if (error && isMissingColumnError(error, "approval_status")) {
      ({ data, error } = await baseSelect());
    }
    if (error) throw error;
    return data ?? [];
  });
  const row = rows[0];
  if (!row) return null;

  const [categories, categoryLinks, inventoryRows] = await Promise.all([
    getStoreCategories({ includeTest: false }),
    readOrEmpty("campaign_detail_public_categories", async () => {
      const { data: links, error: linksError } = await supabase
        .from("draw_round_categories")
        .select("*")
        .eq("draw_round_id", row.id);
      if (linksError) throw linksError;
      return links ?? [];
    }),
    readOrEmpty("campaign_detail_public_inventory", async () => {
      const { data: inventory, error: inventoryError } = await supabase.rpc(
        "get_draw_round_inventory_summary",
        { p_draw_round_id: row.id, p_profile_id: null },
      );
      if (inventoryError) throw inventoryError;
      return inventorySummariesFromJson(inventory);
    }),
  ]);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const linkedCategories = categoryLinks
    .map((link) => categoriesById.get(link.category_id))
    .filter((category): category is YnotCategory => Boolean(category));
  const inventory = inventoryRows[0];
  // Public-only projection: sensitive odds, locked prizes, and stock targets
  // are excluded here. The dynamic path (getCampaign for admins) uses
  // includePrivateDetail to gate these same fields.
  const publicPrizeLineup = await getPublicPrizeLineup(supabase, row, inventory, {
    includeLocked: false,
    includeSensitiveOdds: false,
    includeStockTarget: false,
  });
  let publicReadiness: CampaignPrizeReadiness | null = null;
  try {
    publicReadiness = await getCampaignPrizeReadiness(supabase, row.id, {
      row,
      inventory,
    });
  } catch (error) {
    recordDataIssue("campaign_detail_public_prize_readiness", error);
  }
  const campaign = toYnotCampaign(
    row,
    linkedCategories,
    inventory,
    publicPrizeLineup,
    publicReadiness,
  );
  if (!campaign.openable && !campaign.soldOut) return null;
  return publicYnotCampaign(campaign);
}

// Tagged "campaigns" so EVERY existing admin mutation that already calls
// revalidateTag("campaigns", "max") (publish, approve, odds, stock, lifecycle,
// cost, reorder) busts this cache too. 30s TTL is the safety net for customer
// opens that change stock; the open_gacha_campaign RPC remains the atomic
// source of truth, so a briefly-stale "openable" badge cannot oversell.
const getPublicCampaignDetailCached = (slug: string): Promise<YnotCampaign | null> =>
  unstable_cache(
    () => loadPublicCampaignDetailImpl(slug),
    ["ynot-campaign-detail-public-v2", slug],
    { tags: ["campaigns", "campaign-detail"], revalidate: 30 },
  )();

const OPEN_CAMPAIGN_SELECT = [
  "id",
  "slug",
  "status",
  "approval_status",
  "logic_snapshot",
  "series",
  "title_th",
  "title_en",
  "price_thb",
  "total_slots",
  "last_prize_card_id",
  "banner_image_url",
  "mode",
  "cost_coins",
  "visibility",
  "starts_at",
  "ends_at",
  "is_test",
  "test_metadata",
  "convert_deadline_days",
].join(",");

type OpenCampaignRow = Pick<
  DrawRoundRow,
  | "id"
  | "slug"
  | "status"
  | "approval_status"
  | "logic_snapshot"
  | "series"
  | "title_th"
  | "title_en"
  | "price_thb"
  | "total_slots"
  | "last_prize_card_id"
  | "banner_image_url"
  | "mode"
  | "cost_coins"
  | "visibility"
  | "starts_at"
  | "ends_at"
  | "is_test"
  | "test_metadata"
  | "convert_deadline_days"
>;

function toOpenRevealCampaign(
  row: OpenCampaignRow,
  inventory?: InventorySummary,
): YnotCampaign {
  const approvalStatus = normalizeApprovalStatus(
    row.approval_status,
    inferredApprovalStatus(row.status),
  );
  const remainingSlots = inventory?.remainingSlots ?? row.total_slots;
  const logicMode = normalizeRandomLogicMode(row.logic_snapshot);
  const availablePrizeUnits =
    inventory?.availableWinSlots ?? inventory?.availableUnits ?? 0;
  const eligiblePrizeUnits = inventory?.eligibleUnits;
  const hasOpenableInventory =
    eligiblePrizeUnits === undefined
      ? logicMode === "inventory_gated"
        ? false
        : availablePrizeUnits > 0
      : eligiblePrizeUnits > 0;
  const soldOut = remainingSlots <= 0 || availablePrizeUnits <= 0;
  const adminRemoved = isOwnerRemoved(row.test_metadata);
  const openable =
    row.status === "live" &&
    row.visibility === "public" &&
    approvalStatus === "approved" &&
    !adminRemoved &&
    !soldOut &&
    hasOpenableInventory;

  return {
    id: row.slug,
    slug: row.slug,
    status: row.status,
    approvalStatus,
    titleTh: row.title_th,
    titleEn: row.title_en,
    series: row.series,
    priceThb: row.price_thb,
    costCoins: row.cost_coins ?? Math.max(1, Math.ceil(row.price_thb / 100)),
    mode: row.mode,
    visibility: row.visibility,
    totalSlots: row.total_slots,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    remainingSlots,
    availablePrizeUnits,
    eligiblePrizeUnits,
    logicMode,
    openable,
    soldOut,
    bannerImageUrl: row.banner_image_url ?? null,
    openQuantityOptions: normalizeOpenQuantityOptions(row.logic_snapshot),
    convertDeadlineDays:
      typeof row.convert_deadline_days === "number" &&
      row.convert_deadline_days > 0
        ? row.convert_deadline_days
        : null,
    hasLastPrize: Boolean(row.last_prize_card_id),
  };
}

export async function getOpenCampaignForReveal(
  campaignIdOrSlug: string,
  viewer: YnotViewer,
) {
  const campaignLookup = campaignIdOrSlug.trim();
  if (!campaignLookup) return null;
  if (!isSupabaseConfigured()) {
    return (
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) => campaign.slug === campaignLookup,
          )
        : undefined) ?? null
    );
  }

  const supabase = createServiceSupabaseClient();
  return readOrEmpty("open_campaign_for_reveal", async () => {
    const includePrivateDetail = viewer.isAdmin;
    const rawCampaignLookup = looksLikeUuid(campaignLookup);
    if (rawCampaignLookup && !includePrivateDetail) return [];
    const loadRow = (requireApproval: boolean) => {
      let query = supabase
        .from("draw_rounds")
        .select(OPEN_CAMPAIGN_SELECT)
        .limit(1);
      query = includePrivateDetail
        ? query.in("status", ["live", "closed", "draft"])
        : query.in("status", ["live", "closed"]).eq("visibility", "public");
      if (requireApproval && !includePrivateDetail)
        query = query.eq("approval_status", "approved");
      return rawCampaignLookup
        ? query.eq("id", campaignLookup)
        : query.eq("slug", campaignLookup);
    };
    let { data, error } = await loadRow(true);
    if (error && isMissingColumnError(error, "approval_status")) {
      ({ data, error } = await loadRow(false));
    }
    if (error) throw error;
    const row = data?.[0] as OpenCampaignRow | undefined;
    if (!row) return [];
    if (
      row.is_test &&
      !includePrivateDetail &&
      !(await canReadTestCampaign(supabase, row.id, viewer))
    )
      return [];

    const inventoryRows = await readOrEmpty("open_campaign_for_reveal_inventory", async () => {
      const { data: inventory, error: inventoryError } = await supabase.rpc(
        "get_draw_round_inventory_summary",
        {
          p_draw_round_id: row.id,
          p_profile_id: viewer.profileId ?? null,
        },
      );
      if (inventoryError) throw inventoryError;
      return inventorySummariesFromJson(inventory);
    });
    const campaign = toOpenRevealCampaign(row, inventoryRows[0]);
    const customerCampaign = campaign;
    if (!includePrivateDetail && !campaign.openable && !campaign.soldOut)
      return [];
    return [customerCampaign];
  }).then(
    (campaigns) =>
      campaigns[0] ??
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) => campaign.slug === campaignLookup,
          )
        : undefined) ??
      null,
  );
}

export async function getCampaign(
  campaignIdOrSlug: string,
  options: {
    allowTestForCurrentViewer?: boolean;
    bypassPublicCache?: boolean;
    viewer?: YnotViewer;
  } = {},
) {
  const campaignLookup = campaignIdOrSlug.trim();
  if (!options.allowTestForCurrentViewer) {
    if (looksLikeUuid(campaignLookup)) return null;
    const campaigns = await getCampaigns();
    return (
      campaigns.find((campaign) => campaign.slug === campaignLookup) ??
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) => campaign.slug === campaignLookup,
          )
        : undefined) ??
      null
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) => campaign.slug === campaignLookup,
          )
        : undefined) ?? null
    );
  }

  const viewer = options.viewer ?? (await getYnotViewer());

  // Non-admin viewers of a public, non-test pack (looked up by slug) usually
  // get the cached public projection. Open-entry pages can opt out so stale
  // cached openable state cannot auto-start a sold-out pack.
  if (!options.bypassPublicCache && !viewer.isAdmin && !looksLikeUuid(campaignLookup)) {
    const cached = await getPublicCampaignDetailCached(campaignLookup);
    if (cached) return cached;
  }

  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaign_detail", async () => {
    const includePrivateDetail = viewer.isAdmin;
    const rawCampaignLookup = looksLikeUuid(campaignLookup);
    if (rawCampaignLookup && !includePrivateDetail) return [];
    const loadRow = (requireApproval: boolean) => {
      let query = supabase
        .from("draw_rounds")
        .select("*")
        .limit(1);
      query = includePrivateDetail
        ? query.in("status", ["live", "closed", "draft"])
        : query.in("status", ["live", "closed"]).eq("visibility", "public");
      if (requireApproval && !includePrivateDetail)
        query = query.eq("approval_status", "approved");
      return rawCampaignLookup
        ? query.eq("id", campaignLookup)
        : query.eq("slug", campaignLookup);
    };
    let { data, error } = await loadRow(true);
    if (error && isMissingColumnError(error, "approval_status")) {
      ({ data, error } = await loadRow(false));
    }
    if (error) throw error;
    const row = data?.[0];
    if (!row) return [];
    if (
      row.is_test &&
      !includePrivateDetail &&
      !(await canReadTestCampaign(supabase, row.id, viewer))
    )
      return [];

    const [categories, categoryLinks, inventoryRows] = await Promise.all([
      getStoreCategories({
        includeTest: Boolean(row.is_test || viewer.isAdmin),
      }),
      readOrEmpty("campaign_detail_categories", async () => {
        const { data: links, error: linksError } = await supabase
          .from("draw_round_categories")
          .select("*")
          .eq("draw_round_id", row.id);
        if (linksError) throw linksError;
        return links ?? [];
      }),
      readOrEmpty("campaign_detail_inventory", async () => {
        const { data: inventory, error: inventoryError } = await supabase.rpc(
          "get_draw_round_inventory_summary",
          {
            p_draw_round_id: row.id,
            p_profile_id: viewer.profileId ?? null,
          },
        );
        if (inventoryError) throw inventoryError;
        return inventorySummariesFromJson(inventory);
      }),
    ]);
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const linkedCategories = categoryLinks
      .map((link) => categoriesById.get(link.category_id))
      .filter((category): category is YnotCategory => Boolean(category));
    const inventory = inventoryRows[0];
    const prizeLineup = await getPublicPrizeLineup(supabase, row, inventory, {
      includeLocked: includePrivateDetail,
      includeSensitiveOdds: includePrivateDetail,
      includeStockTarget: includePrivateDetail,
    });
    let readiness: CampaignPrizeReadiness | null = null;
    try {
      readiness = await getCampaignPrizeReadiness(supabase, row.id, {
        row,
        inventory,
      });
    } catch (error) {
      recordDataIssue("campaign_detail_prize_readiness", error);
    }
    const campaign = toYnotCampaign(
      row,
      linkedCategories,
      inventory,
      prizeLineup,
      readiness,
    );
    campaign.lastPrizePreview = await resolveLastPrizePreview(supabase, row);
    const customerCampaign = includePrivateDetail ? campaign : publicYnotCampaign(campaign);
    if (!includePrivateDetail && !campaign.openable && !campaign.soldOut) return [];
    return [customerCampaign];
  }).then(
    (campaigns) =>
      campaigns[0] ??
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) => campaign.slug === campaignLookup,
          )
        : undefined) ??
      null,
  );
}

async function getPaymentMethodsImpl(): Promise<YnotPaymentMethod[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("payment_methods", async () => {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return hideLegacyMainTransfer((data ?? []).map(toPaymentMethod));
  });
}

const getPaymentMethodsCached = unstable_cache(
  getPaymentMethodsImpl,
  ["ynot-payment-methods-v4-auto-slip-approval"],
  { tags: ["payment-methods"], revalidate: 300 },
);

export async function getPaymentMethods(): Promise<YnotPaymentMethod[]> {
  return getPaymentMethodsCached();
}

export async function publicPaymentMethod(
  method: YnotPaymentMethod,
): Promise<YnotPaymentMethod> {
  const publicMethod: YnotPaymentMethod = {
    ...method,
    id: await paymentMethodActionToken(method.id),
  };
  delete publicMethod.code;
  return publicMethod;
}

export async function publicPaymentMethods(
  methods: YnotPaymentMethod[],
): Promise<YnotPaymentMethod[]> {
  return Promise.all(methods.map(publicPaymentMethod));
}

export async function getAllPaymentMethods(): Promise<YnotPaymentMethod[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("payment_methods-admin", async () => {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return hideLegacyMainTransfer((data ?? []).map(toPaymentMethod));
  });
}

function toPaymentMethod(
  row: Database["public"]["Tables"]["payment_methods"]["Row"],
): YnotPaymentMethod {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    displayName: displayPaymentMethodName(row.type, row.display_name),
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    promptpayId: row.promptpay_id,
    qrImagePath: row.qr_image_path,
    instructions: displayPaymentInstructions(row.type, row.instructions),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function displayPaymentMethodName(
  type: Database["public"]["Tables"]["payment_methods"]["Row"]["type"],
  displayName: string | null | undefined,
) {
  if (type === "bank_transfer") return "Bank Transfer";
  return displayName?.trim() || "PromptPay QR";
}

function displayPaymentInstructions(
  type: Database["public"]["Tables"]["payment_methods"]["Row"]["type"],
  instructions: string | null | undefined,
) {
  const clean = instructions?.trim();
  if (!clean) return null;
  if (type === "bank_transfer" && /admin (review|confirmation)/i.test(clean)) {
    return "Transfer manually, then upload the slip for automatic verification.";
  }
  return clean;
}

function hideLegacyMainTransfer(methods: YnotPaymentMethod[]) {
  const hasCanonicalBankTransfer = methods.some(
    (method) =>
      method.type === "bank_transfer" && method.code === "bank-transfer",
  );
  if (!hasCanonicalBankTransfer) return methods;
  return methods.filter(
    (method) =>
      !(method.type === "bank_transfer" && method.code === "main-transfer"),
  );
}

const PREVIEW_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
const PREVIEW_WALLET_BALANCE = 50_000;

export async function getWallet(profileId?: string): Promise<YnotWallet> {
  if (!profileId || !isSupabaseConfigured())
    return { balanceCoins: 0, version: 0 };
  // Dev preview bypass — the stub session id from
  // /api/dev/preview-auth doesn't have a real wallet row, so without an
  // override the storefront looks broken on localhost (all open buttons
  // become "Top up", confirm modals say "Need X more coins"). Give the
  // preview user enough coins to exercise the gacha + sell flows. Never
  // applies in production.
  if (
    isDevAuthAllowed() &&
    profileId === PREVIEW_PROFILE_ID
  ) {
    return { balanceCoins: PREVIEW_WALLET_BALANCE, version: 0 };
  }
  const supabase = createServiceSupabaseClient();
  const rows = await readOrEmpty("wallet", async () => {
    const { data, error } = await supabase
      .from("wallet_accounts")
      .select("*")
      .eq("profile_id", profileId)
      .limit(1);
    if (error) throw error;
    return data ?? [];
  });
  const wallet = rows[0];
  return {
    balanceCoins: wallet?.balance_coins ?? 0,
    version: wallet?.version ?? 0,
  };
}

export async function getTopUps(
  profileId?: string,
  includeAll = false,
  options: { includeSensitiveSlipDetails?: boolean } = {},
): Promise<YnotTopUp[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const includeSensitiveSlipDetails =
    options.includeSensitiveSlipDetails ?? includeAll;
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("topups", async () => {
    let query = supabase
      .from("top_up_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const paymentMethodIds = Array.from(
      new Set(rows.map((row) => row.payment_method_id).filter(Boolean)),
    ) as string[];
    const topUpIds = rows.map((row) => row.id);
    const [paymentMethods, slips] = await Promise.all([
      paymentMethodIds.length
        ? supabase
            .from("payment_methods")
            .select("id,code,type,display_name")
            .in("id", paymentMethodIds)
        : Promise.resolve({ data: [], error: null }),
      topUpIds.length
        ? supabase
            .from("payment_slips")
            .select(
              "id,top_up_request_id,verification_status,provider_code,provider_message,verified_at,uploaded_at",
            )
            .in("top_up_request_id", topUpIds)
            .order("uploaded_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (paymentMethods.error) throw paymentMethods.error;
    if (slips.error) throw slips.error;
    const paymentMethodById = new Map(
      (paymentMethods.data ?? []).map((method) => [method.id, method]),
    );
    const latestSlipByTopUpId = new Map<
      string,
      Database["public"]["Tables"]["payment_slips"]["Row"]
    >();
    for (const slip of slips.data ?? []) {
      if (slip.top_up_request_id && !latestSlipByTopUpId.has(slip.top_up_request_id)) {
        latestSlipByTopUpId.set(
          slip.top_up_request_id,
          slip as Database["public"]["Tables"]["payment_slips"]["Row"],
        );
      }
    }
    return rows.map((row) =>
      toTopUp(row, {
        paymentMethod: row.payment_method_id
          ? paymentMethodById.get(row.payment_method_id) ?? null
          : null,
        slip: latestSlipByTopUpId.get(row.id) ?? null,
        includeSensitiveSlipDetails,
      }),
    );
  });
}

export function toTopUp(
  row: Database["public"]["Tables"]["top_up_requests"]["Row"],
  options: {
    paymentMethod?: Pick<
      Database["public"]["Tables"]["payment_methods"]["Row"],
      "id" | "code" | "type" | "display_name"
    > | null;
    slip?: Pick<
      Database["public"]["Tables"]["payment_slips"]["Row"],
      | "id"
      | "verification_status"
      | "provider_code"
      | "provider_message"
      | "verified_at"
      | "uploaded_at"
    > | null;
    includeSensitiveSlipDetails?: boolean;
  } = {},
): YnotTopUp {
  const includeSensitiveSlipDetails =
    options.includeSensitiveSlipDetails === true;
  return {
    id: row.id,
    publicCode: row.public_code,
    profileId: row.profile_id,
    amountThb: row.amount_thb,
    coinAmount: row.coin_amount,
    status: row.status,
    adminNote: includeSensitiveSlipDetails ? row.admin_note : null,
    customerNote: row.customer_note,
    paymentMethod: options.paymentMethod
      ? {
          id: options.paymentMethod.id,
          code: options.paymentMethod.code,
          type: options.paymentMethod.type,
          displayName: displayPaymentMethodName(
            options.paymentMethod.type,
            options.paymentMethod.display_name,
          ),
        }
      : null,
    slipVerification: options.slip
      ? {
          ...(includeSensitiveSlipDetails ? { id: options.slip.id } : {}),
          status: options.slip.verification_status,
          ...(includeSensitiveSlipDetails
            ? {
                providerCode: options.slip.provider_code,
                providerMessage: options.slip.provider_message,
              }
            : {}),
          verifiedAt: options.slip.verified_at,
          uploadedAt: options.slip.uploaded_at,
        }
      : null,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export function publicTopUp(topUp: YnotTopUp): YnotTopUp {
  const publicFields: YnotTopUp = { ...topUp };
  delete publicFields.id;
  delete publicFields.profileId;
  delete publicFields.adminNote;
  return {
    ...publicFields,
    paymentMethod: topUp.paymentMethod
      ? {
          type: topUp.paymentMethod.type,
          displayName: topUp.paymentMethod.displayName,
        }
      : null,
    slipVerification: topUp.slipVerification
      ? {
          status: topUp.slipVerification.status,
          verifiedAt: topUp.slipVerification.verifiedAt,
          uploadedAt: topUp.slipVerification.uploadedAt,
        }
      : null,
  };
}

export async function getCollection(
  profileId?: string,
): Promise<YnotCollectionItem[]> {
  if (!profileId) return [];
  const collectionLimit =
    isDevAuthAllowed() &&
    profileId === process.env.YNOT_PREVIEW_PROFILE_ID?.trim()
      ? 1000
      : 200;
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  const [items, cards] = await Promise.all([
    readOrEmpty("collection", async () => {
      const { data, error } = await supabase
        .from("collection_items")
        .select("*")
        .eq("profile_id", profileId)
        .order("acquired_at", { ascending: false })
        .limit(collectionLimit);
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("collection_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
  ]);

  // Look up the source pack title for each item via gacha_opens.draw_round_id.
  const gachaSourceIds = Array.from(
    new Set(
      items
        .filter((row) => row.source_type === "gacha_open" && row.source_id)
        .map((row) => row.source_id as string),
    ),
  );
  const opensById = new Map<string, { draw_round_id: string }>();
  if (gachaSourceIds.length) {
    const { data: opens } = await supabase
      .from("gacha_opens")
      .select("id,draw_round_id")
      .in("id", gachaSourceIds);
    for (const open of opens ?? []) {
      opensById.set(open.id, { draw_round_id: open.draw_round_id });
    }
  }
  const drawRoundIds = Array.from(
    new Set(Array.from(opensById.values()).map((value) => value.draw_round_id)),
  );
  const campaignById = new Map<
    string,
    { titleTh: string | null; titleEn: string | null; slug: string | null }
  >();
  if (drawRoundIds.length) {
    const { data: rounds } = await supabase
      .from("draw_rounds")
      .select("id,title_th,title_en,slug")
      .in("id", drawRoundIds);
    for (const round of rounds ?? []) {
      campaignById.set(round.id, {
        titleTh: round.title_th,
        titleEn: round.title_en,
        slug: round.slug,
      });
    }
  }

  const openItems = gachaSourceIds.length
    ? await readOrEmpty("collection_gacha_open_items", async () => {
        const { data, error } = await supabase
          .from("gacha_open_items")
          .select(
            "id,gacha_open_id,card_id,draw_round_prize_id,tier,value_thb,result_position,bundle_quantity",
          )
          .in("gacha_open_id", gachaSourceIds)
          .order("result_position", { ascending: true });
        if (error) throw error;
        return data ?? [];
      })
    : [];

  const prizeIds = Array.from(
    new Set(
      openItems
        .map((openItem) => openItem.draw_round_prize_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const prizesById = new Map<
    string,
    Pick<
      Database["public"]["Tables"]["draw_round_prizes"]["Row"],
      "id" | "tier" | "rank" | "value_thb" | "metadata"
    >
  >();
  if (prizeIds.length) {
    const prizes = await readOrEmpty("collection_source_prizes", async () => {
      const { data, error } = await supabase
        .from("draw_round_prizes")
        .select("id,tier,rank,value_thb,metadata")
        .in("id", prizeIds);
      if (error) throw error;
      return data ?? [];
    });
    for (const prize of prizes ?? []) {
      prizesById.set(prize.id, prize);
    }
  }

  const openItemsByOpenAndCard = new Map<string, typeof openItems>();
  for (const openItem of openItems) {
    const key = `${openItem.gacha_open_id}:${openItem.card_id}`;
    const group = openItemsByOpenAndCard.get(key) ?? [];
    group.push(openItem);
    openItemsByOpenAndCard.set(key, group);
  }
  const openItemsById = new Map(openItems.map((openItem) => [openItem.id, openItem]));

  // Resolve the specific won stock unit per collection item so the displayed
  // grade/cert and source position reflect the exact prize unit the player
  // received, not another copy of the same card from the same pull.
  const wonUnitByItemId = new Map<
    string,
    {
      grade: string | null;
      condition: string | null;
      gradingService: string | null;
      imageUrl: string | null;
    }
  >();
  const sourceOpenItemIdByCollectionItem = new Map<string, string>();
  const collectionItemIds = items
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));
  const stockUnitIdByItem = new Map<string, string>();
  const stockUnitIds = new Set<string>();
  for (const item of items) {
    if (item.gacha_open_item_id) {
      sourceOpenItemIdByCollectionItem.set(item.id, item.gacha_open_item_id);
    }
    if (item.card_stock_unit_id) {
      stockUnitIdByItem.set(item.id, item.card_stock_unit_id);
      stockUnitIds.add(item.card_stock_unit_id);
    }
  }
  if (collectionItemIds.length) {
    const missingExactLinkItemIds = collectionItemIds.filter(
      (itemId) =>
        !stockUnitIdByItem.has(itemId) ||
        !sourceOpenItemIdByCollectionItem.has(itemId),
    );
    if (missingExactLinkItemIds.length) {
      // Legacy fallback: pre-link rows can still resolve via prize units.
      const prizeUnitRows = await readOrEmpty(
        "collection_prize_units",
        async () => {
          const { data, error } = await supabase
            .from("draw_round_prize_units")
            .select("collection_item_id,gacha_open_item_id,card_stock_unit_id")
            .in("collection_item_id", missingExactLinkItemIds);
          if (error) throw error;
          return data ?? [];
        },
      );
      for (const row of prizeUnitRows) {
        const itemId = row.collection_item_id;
        const openItemId = row.gacha_open_item_id;
        const unitId = row.card_stock_unit_id;
        if (
          itemId &&
          openItemId &&
          !sourceOpenItemIdByCollectionItem.has(itemId)
        ) {
          sourceOpenItemIdByCollectionItem.set(itemId, openItemId);
        }
        if (itemId && unitId && !stockUnitIdByItem.has(itemId)) {
          stockUnitIdByItem.set(itemId, unitId);
          stockUnitIds.add(unitId);
        }
      }
    }
    // 2) load those units' identity, then map back to the collection item
    if (stockUnitIds.size) {
      const units = await readOrEmpty("collection_stock_units", async () => {
        const { data, error } = await supabase
          .from("card_stock_units")
          .select("id,grade,condition,grading_service,image_url")
          .in("id", [...stockUnitIds]);
        if (error) throw error;
        return data ?? [];
      });
      const unitById = new Map(units.map((unit) => [unit.id, unit]));
      for (const [itemId, unitId] of stockUnitIdByItem) {
        const unit = unitById.get(unitId);
        if (unit) {
          wonUnitByItemId.set(itemId, {
            grade: unit.grade ?? null,
            condition: unit.condition ?? null,
            gradingService: unit.grading_service ?? null,
            imageUrl: unit.image_url ?? null,
          });
        }
      }
    }
  }

  const actionTokenByItemId = new Map<string, string>();
  await Promise.all(
    collectionItemIds.map(async (itemId) => {
      actionTokenByItemId.set(
        itemId,
        await collectionItemActionToken(profileId, itemId),
      );
    }),
  );

  const collectionItemRowsByOpenItemId = new Map<string, typeof items>();
  for (const item of items) {
    const openItemId = sourceOpenItemIdByCollectionItem.get(item.id);
    if (!openItemId) continue;
    const group = collectionItemRowsByOpenItemId.get(openItemId) ?? [];
    group.push(item);
    collectionItemRowsByOpenItemId.set(openItemId, group);
  }
  for (const group of collectionItemRowsByOpenItemId.values()) {
    group.sort((left, right) =>
      (left.serial_no ?? left.id).localeCompare(right.serial_no ?? right.id),
    );
  }

  const cardsById = new Map(cards.map((card) => [card.catalogCardId, card]));
  return Promise.all(items.map(async (item) => {
    const card = cardsById.get(item.card_id);
    const wonUnit = wonUnitByItemId.get(item.id);
    const open = item.source_id ? opensById.get(item.source_id) : null;
    const campaign = open ? campaignById.get(open.draw_round_id) : null;
    const directOpenItemId = sourceOpenItemIdByCollectionItem.get(item.id);
    const sourceOpenItem = directOpenItemId
      ? openItemsById.get(directOpenItemId)
      : item.source_id
        ? openItemsByOpenAndCard.get(`${item.source_id}:${item.card_id}`)?.shift()
        : undefined;
    const bundleGroupRows = directOpenItemId
      ? collectionItemRowsByOpenItemId.get(directOpenItemId) ?? []
      : [];
    const bundleQuantity = publicBundleQuantity(
      sourceOpenItem?.bundle_quantity ?? bundleGroupRows.length,
    );
    const bundleGroupItemIds = bundleQuantity
      ? bundleGroupRows
          .map((row) => actionTokenByItemId.get(row.id))
          .filter((id): id is string => Boolean(id))
      : undefined;
    const bundleIndex = bundleQuantity
      ? Math.max(
          1,
          bundleGroupRows.findIndex((row) => row.id === item.id) + 1,
        )
      : undefined;
    const sourcePrize = sourceOpenItem?.draw_round_prize_id
      ? prizesById.get(sourceOpenItem.draw_round_prize_id)
      : undefined;
    const sourcePrizeTier = sourcePrize
      ? displayTierFromPrizeMetadata(sourcePrize)
      : sourceOpenItem
        ? prizeDisplayTierValue(sourceOpenItem.tier)
        : null;
    return {
      id: await collectionItemActionToken(profileId, item.id),
      cardName: card?.name ?? "Mystery card",
      cardCode: card?.code,
      cardGrade: wonUnit?.grade ?? card?.grade ?? null,
      cardCondition: wonUnit?.condition ?? card?.condition ?? null,
      cardGradingService:
        wonUnit?.gradingService ?? card?.gradingService ?? null,
      cardPrizeCategory: card?.prizeCategory ?? null,
      cardSeries: card?.series ?? null,
      imageUrl: publicSubSkuImageUrl(wonUnit?.imageUrl, card?.photoUrl),
      bundleQuantity,
      bundleIndex,
      bundleGroupId: bundleQuantity
        ? bundleGroupItemIds?.[0] ?? actionTokenByItemId.get(item.id) ?? null
        : null,
      bundleGroupItemIds,
      status: item.status,
      serialNo: item.serial_no,
      acquiredAt: item.acquired_at,
      convertCoinValue:
        typeof item.convert_coin_value_snapshot === "number"
          ? Math.max(0, Math.round(item.convert_coin_value_snapshot))
          : null,
      convertExpiresAt: item.convert_expires_at ?? null,
      sourceCampaignTitle: campaign
        ? campaign.titleEn ?? campaign.titleTh ?? null
        : null,
      sourceCampaignSlug: campaign?.slug ?? null,
      sourcePrizeTier,
      sourcePrizeTierLabel: sourcePrizeTier
        ? metadataString(sourcePrize?.metadata, "displayTierLabel") ??
          prizeDisplayTierLabel(sourcePrizeTier)
        : null,
      sourcePrizeValueThb:
        sourceOpenItem?.value_thb ?? sourcePrize?.value_thb ?? null,
      sourceOpenPosition: sourceOpenItem?.result_position ?? null,
    };
  }));
}

export async function getGachaOpenHistory(
  profileId?: string,
): Promise<YnotGachaOpenHistory[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  const opens = await readOrEmpty("gacha_opens", async () => {
    const { data, error } = await supabase
      .from("gacha_opens")
      .select("*")
      .eq("profile_id", profileId)
      .order("opened_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

  if (!opens.length) return [];

  const openIds = opens.map((open) => open.id);
  const campaignIds = Array.from(
    new Set(opens.map((open) => open.draw_round_id)),
  );
  const [items, cards, campaigns] = await Promise.all([
    readOrEmpty("gacha_open_items", async () => {
      const { data, error } = await supabase
        .from("gacha_open_items")
        .select("*")
        .in("gacha_open_id", openIds)
        .order("result_position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("gacha_history_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
    readOrEmpty("gacha_history_campaigns", async () => {
      const { data, error } = await supabase
        .from("draw_rounds")
        .select("id,slug,title_th,title_en")
        .in("id", campaignIds);
      if (error) throw error;
      return data ?? [];
    }),
  ]);

  // Join the source prize so rewards can carry an accurate customer-facing
  // displayTier (rainbow/gold/silver/bronze) instead of the raw "high"/"normal"
  // weighting class. Mirrors how getCollection resolves prize display tiers.
  const prizeIds = Array.from(
    new Set(
      items
        .map((item) => item.draw_round_prize_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const prizesById = new Map<
    string,
    Pick<
      Database["public"]["Tables"]["draw_round_prizes"]["Row"],
      "id" | "tier" | "rank" | "metadata"
    >
  >();
  if (prizeIds.length) {
    const prizes = await readOrEmpty("gacha_history_source_prizes", async () => {
      const { data, error } = await supabase
        .from("draw_round_prizes")
        .select("id,tier,rank,metadata")
        .in("id", prizeIds);
      if (error) throw error;
      return data ?? [];
    });
    for (const prize of prizes ?? []) {
      prizesById.set(prize.id, prize);
    }
  }

  const rewardPrizeUnits = openIds.length
    ? await readOrEmpty("gacha_history_prize_unit_images", async () => {
        const { data, error } = await supabase
          .from("draw_round_prize_units")
          .select("gacha_open_item_id,card_stock_unit_id,status")
          .in("gacha_open_id", openIds);
        if (error) throw error;
        return data ?? [];
      })
    : [];
  const rewardStockUnitIds = [
    ...new Set(
      rewardPrizeUnits
        .map((unit) => unit.card_stock_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const rewardStockUnits = rewardStockUnitIds.length
    ? await readOrEmpty("gacha_history_stock_unit_images", async () => {
        const { data, error } = await supabase
          .from("card_stock_units")
          .select("id,image_url")
          .in("id", rewardStockUnitIds);
        if (error) throw error;
        return data ?? [];
      })
    : [];
  const rewardImageByOpenItemId = stockImageUrlByOpenItemId(
    rewardPrizeUnits as PublicPrizeUnitImageRow[],
    rewardStockUnits as PublicStockUnitImageRow[],
  );

  const cardsById = new Map(cards.map((card) => [card.catalogCardId, card]));
  const campaignsById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const itemsByOpenId = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsByOpenId.get(item.gacha_open_id) ?? [];
    group.push(item);
    itemsByOpenId.set(item.gacha_open_id, group);
  }

  return opens.map((open) => {
    const publicCode = open.public_code;
    const campaign = campaignsById.get(open.draw_round_id);
    const rewards = (itemsByOpenId.get(open.id) ?? []).map((item, index) => {
      const card = cardsById.get(item.card_id);
      const prize = item.draw_round_prize_id
        ? prizesById.get(item.draw_round_prize_id)
        : undefined;
      const displayTier = prize
        ? displayTierFromPrizeMetadata(prize)
        : prizeDisplayTierValue(item.tier);
      return {
        id: `${publicCode}-${item.result_position ?? index + 1}`,
        cardName: card?.name ?? "Mystery reward",
        cardCode: card?.code,
        imageUrl: publicSubSkuImageUrl(
          rewardImageByOpenItemId.get(item.id),
          card?.photoUrl,
        ),
        bundleQuantity: publicBundleQuantity(item.bundle_quantity),
        displayTier,
        valueThb: item.value_thb,
        resultPosition: item.result_position,
      };
    });

    return {
      id: publicCode,
      publicCode,
      campaignSlug: campaign?.slug,
      campaignTitle: campaign?.title_en ?? campaign?.title_th ?? "Mystery pack",
      costCoins: open.cost_coins,
      quantity: open.quantity,
      status: open.status,
      openedAt: open.opened_at,
      createdAt: open.created_at,
      rewards,
    };
  });
}

export async function getExchanges(
  profileId?: string,
  includeAll = false,
): Promise<YnotExchangeOrder[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("exchanges", async () => {
    let query = supabase
      .from("exchange_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      publicCode: row.public_code,
      status: row.status,
      requestedCoinValue: row.requested_coin_value,
      approvedCoinValue: row.approved_coin_value,
      createdAt: row.created_at,
      adminNote: row.admin_note,
    }));
  });
}

function publicExchangeOrder(order: YnotExchangeOrder): YnotExchangeOrder {
  return {
    ...order,
    id: order.publicCode,
    adminNote: null,
  };
}

function shippingAddressSnapshotFromValue(
  value: unknown,
): YnotShippingAddressSnapshot | null {
  if (!isRecord(value)) return null;
  const snapshot = {
    label: metadataString(value, "label") ?? null,
    recipientName: metadataString(value, "recipientName") ?? null,
    phone: metadataString(value, "phone") ?? null,
    addressLine1: metadataString(value, "addressLine1") ?? null,
    addressLine2: metadataString(value, "addressLine2") ?? null,
    subdistrict: metadataString(value, "subdistrict") ?? null,
    district: metadataString(value, "district") ?? null,
    province: metadataString(value, "province") ?? null,
    postalCode: metadataString(value, "postalCode") ?? null,
    country: metadataString(value, "country") ?? null,
    deliveryNote: metadataString(value, "deliveryNote") ?? null,
  };
  return Object.values(snapshot).some((field) => field !== null)
    ? snapshot
    : null;
}

function shippingAddressSnapshotFromAddress(
  address?: Database["public"]["Tables"]["user_addresses"]["Row"],
): YnotShippingAddressSnapshot | null {
  if (!address) return null;
  return {
    label: address.label,
    recipientName: address.recipient_name,
    phone: address.phone,
    addressLine1: address.address_line1,
    addressLine2: address.address_line2,
    subdistrict: address.subdistrict,
    district: address.district,
    province: address.province,
    postalCode: address.postal_code,
    country: address.country,
    deliveryNote: address.delivery_note,
  };
}

function addressSnapshotFromRow(
  row: Database["public"]["Tables"]["shipping_requests"]["Row"],
  address?: Database["public"]["Tables"]["user_addresses"]["Row"],
): YnotShippingAddressSnapshot | null {
  return (
    shippingAddressSnapshotFromValue(row.address_snapshot) ??
    shippingAddressSnapshotFromAddress(address)
  );
}

function shippingTimelineLabel(eventType: string, status?: string | null) {
  if (eventType === "shipping_submitted") return "Shipping requested";
  if (eventType === "shipping_status_updated") {
    if (status === "packing") return "Marked packing";
    if (status === "ready_for_pickup") return "Marked ready for pickup";
    if (status === "picked_up") return "Marked picked up";
    if (status === "shipped") return "Marked shipped";
    if (status === "delivered") return "Marked delivered";
    if (status === "cancelled") return "Cancelled";
  }
  return eventType.replaceAll("_", " ");
}

function shippingTimelineEvent(
  row: Database["public"]["Tables"]["audit_events"]["Row"],
): YnotShippingTimelineEvent {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const status = metadataString(metadata, "status") ?? null;
  return {
    id: row.id,
    eventType: row.event_type,
    label: shippingTimelineLabel(row.event_type, status),
    createdAt: row.created_at,
    previousStatus: metadataString(metadata, "previousStatus") ?? null,
    status,
    trackingProvider: metadataString(metadata, "trackingProvider") ?? null,
    trackingNumber: metadataString(metadata, "trackingNumber") ?? null,
    note: metadataString(metadata, "adminNote") ?? null,
  };
}

export async function getShipping(
  profileId?: string,
  includeAll = false,
): Promise<YnotShippingRequest[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  if (includeAll && !(await resolveAdminSession())) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("shipping", async () => {
    let query = supabase
      .from("shipping_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(includeAll ? 200 : 80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];

    const requestIds = rows.map((row) => row.id);
    const profileIds = Array.from(new Set(rows.map((row) => row.profile_id)));
    const addressIds = Array.from(
      new Set(
        rows
          .map((row) => row.address_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [shippingItems, profiles, addresses, auditRows] = await Promise.all([
      readOrEmpty("shipping_request_items", async () => {
        const { data, error } = await supabase
          .from("shipping_request_items")
          .select("*")
          .in("shipping_request_id", requestIds)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return data ?? [];
      }),
      readOrEmpty("shipping_profiles", async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id,email,display_name,line_display_name,line_user_id,phone,profile_status,created_at,last_seen_at",
          )
          .in("id", profileIds);
        if (error) throw error;
        return data ?? [];
      }),
      addressIds.length
        ? readOrEmpty("shipping_addresses", async () => {
            const { data, error } = await supabase
              .from("user_addresses")
              .select("*")
              .in("id", addressIds);
            if (error) throw error;
            return data ?? [];
          })
        : Promise.resolve(
            [] as Database["public"]["Tables"]["user_addresses"]["Row"][],
          ),
      readOrEmpty("shipping_audit_events", async () => {
        const { data, error } = await supabase
          .from("audit_events")
          .select("*")
          .in("shipping_request_id", requestIds)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return data ?? [];
      }),
    ]);

    const collectionItemIds = Array.from(
      new Set(shippingItems.map((item) => item.collection_item_id)),
    );
    const collectionItems = collectionItemIds.length
      ? await readOrEmpty("shipping_collection_items", async () => {
          const { data, error } = await supabase
            .from("collection_items")
            .select("*")
            .in("id", collectionItemIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const sourceOpenItemIdByCollectionItem = new Map<string, string>();
    const imageByCollectionItemId = new Map<string, string>();
    const stockUnitIdByCollectionItem = new Map<string, string>();
    const stockUnitIds = new Set<string>();
    for (const item of collectionItems) {
      if (item.gacha_open_item_id) {
        sourceOpenItemIdByCollectionItem.set(item.id, item.gacha_open_item_id);
      }
      if (item.card_stock_unit_id) {
        stockUnitIdByCollectionItem.set(item.id, item.card_stock_unit_id);
        stockUnitIds.add(item.card_stock_unit_id);
      }
    }
    if (collectionItemIds.length) {
      const missingExactLinkItemIds = collectionItemIds.filter(
        (itemId) =>
          !stockUnitIdByCollectionItem.has(itemId) ||
          !sourceOpenItemIdByCollectionItem.has(itemId),
      );
      if (missingExactLinkItemIds.length) {
        const prizeUnitRows = await readOrEmpty(
          "shipping_prize_units",
          async () => {
            const { data, error } = await supabase
              .from("draw_round_prize_units")
              .select("collection_item_id,gacha_open_item_id,card_stock_unit_id")
              .in("collection_item_id", missingExactLinkItemIds);
            if (error) throw error;
            return data ?? [];
          },
        );
        for (const row of prizeUnitRows) {
          const itemId = row.collection_item_id;
          if (
            itemId &&
            row.gacha_open_item_id &&
            !sourceOpenItemIdByCollectionItem.has(itemId)
          ) {
            sourceOpenItemIdByCollectionItem.set(
              itemId,
              row.gacha_open_item_id,
            );
          }
          if (
            itemId &&
            row.card_stock_unit_id &&
            !stockUnitIdByCollectionItem.has(itemId)
          ) {
            stockUnitIdByCollectionItem.set(itemId, row.card_stock_unit_id);
            stockUnitIds.add(row.card_stock_unit_id);
          }
        }
      }
      const stockUnits = stockUnitIds.size
        ? await readOrEmpty("shipping_stock_unit_images", async () => {
            const { data, error } = await supabase
              .from("card_stock_units")
              .select("id,image_url")
              .in("id", [...stockUnitIds]);
            if (error) throw error;
            return data ?? [];
          })
        : [];
      const stockImageById = new Map(
        stockUnits
          .map((unit) => [unit.id, publicSubSkuImageUrl(unit.image_url)])
          .filter(
            (entry): entry is [string, string] => Boolean(entry[0] && entry[1]),
          ),
      );
      for (const [itemId, stockUnitId] of stockUnitIdByCollectionItem) {
        const imageUrl = stockImageById.get(stockUnitId);
        if (imageUrl) {
          imageByCollectionItemId.set(itemId, imageUrl);
        }
      }
    }
    const gachaSourceIds = Array.from(
      new Set(
        collectionItems
          .filter((item) => item.source_type === "gacha_open" && item.source_id)
          .map((item) => item.source_id as string),
      ),
    );

    const gachaOpens = gachaSourceIds.length
      ? await readOrEmpty("shipping_gacha_opens", async () => {
          const { data, error } = await supabase
            .from("gacha_opens")
            .select("*")
            .in("id", gachaSourceIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];
    const drawRoundIds = Array.from(
      new Set(gachaOpens.map((open) => open.draw_round_id)),
    );
    const [campaigns, openItems, cards] = await Promise.all([
      drawRoundIds.length
        ? readOrEmpty("shipping_draw_rounds", async () => {
            const { data, error } = await supabase
              .from("draw_rounds")
              .select("id,slug,title_th,title_en")
              .in("id", drawRoundIds);
            if (error) throw error;
            return data ?? [];
          })
        : Promise.resolve([]),
      gachaSourceIds.length
        ? readOrEmpty("shipping_gacha_open_items", async () => {
            const { data, error } = await supabase
              .from("gacha_open_items")
              .select(
                "id,gacha_open_id,card_id,draw_round_prize_id,tier,value_thb,result_position",
              )
              .in("gacha_open_id", gachaSourceIds)
              .order("result_position", { ascending: true });
            if (error) throw error;
            return data ?? [];
          })
        : Promise.resolve([]),
      readOrEmpty("shipping_card_catalog", async () => getCardCatalog(supabase)),
    ]);

    const prizeIds = Array.from(
      new Set(
        openItems
          .map((openItem) => openItem.draw_round_prize_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const prizes = prizeIds.length
      ? await readOrEmpty("shipping_source_prizes", async () => {
          const { data, error } = await supabase
            .from("draw_round_prizes")
            .select("id,tier,rank,value_thb,metadata")
            .in("id", prizeIds);
          if (error) throw error;
          return data ?? [];
        })
      : [];

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const addressById = new Map(addresses.map((address) => [address.id, address]));
    const collectionItemById = new Map(
      collectionItems.map((item) => [item.id, item]),
    );
    const cardsById = new Map(cards.map((card) => [card.catalogCardId, card]));
    const openById = new Map(gachaOpens.map((open) => [open.id, open]));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const prizesById = new Map(prizes.map((prize) => [prize.id, prize]));

    const openItemsById = new Map(
      openItems.map((openItem) => [openItem.id, openItem]),
    );

    const shippingItemsByRequestId = new Map<string, YnotShippingItem[]>();
    for (const shippingItem of shippingItems) {
      const item = collectionItemById.get(shippingItem.collection_item_id);
      const card = cardsById.get(shippingItem.card_id ?? item?.card_id ?? "");
      const open = item?.source_id ? openById.get(item.source_id) : undefined;
      const campaign = open ? campaignById.get(open.draw_round_id) : undefined;
      const directOpenItemId = item
        ? sourceOpenItemIdByCollectionItem.get(item.id)
        : undefined;
      const sourceOpenItem = directOpenItemId
        ? openItemsById.get(directOpenItemId)
        : undefined;
      const sourcePrize = sourceOpenItem?.draw_round_prize_id
        ? prizesById.get(sourceOpenItem.draw_round_prize_id)
        : undefined;
      const sourcePrizeTier = sourcePrize
        ? displayTierFromPrizeMetadata(sourcePrize)
        : sourceOpenItem
          ? prizeDisplayTierValue(sourceOpenItem.tier)
          : null;
      const group = shippingItemsByRequestId.get(shippingItem.shipping_request_id) ?? [];
      group.push({
        cardName: card?.name ?? "Mystery card",
        cardCode: card?.code ?? null,
        imageUrl: item ? imageByCollectionItemId.get(item.id) ?? null : null,
        status: item?.status ?? null,
        serialNo: item?.serial_no ?? null,
        acquiredAt: item?.acquired_at ?? null,
        sourceCampaignTitle: campaign
          ? campaign.title_en ?? campaign.title_th ?? null
          : null,
        sourceCampaignSlug: campaign?.slug ?? null,
        sourceOpenCode: open?.public_code ?? null,
        sourceOpenPosition: sourceOpenItem?.result_position ?? null,
        sourcePrizeTierLabel: sourcePrizeTier
          ? metadataString(sourcePrize?.metadata, "displayTierLabel") ??
            prizeDisplayTierLabel(sourcePrizeTier)
          : null,
        sourcePrizeValueThb:
          sourceOpenItem?.value_thb ?? sourcePrize?.value_thb ?? null,
      });
      shippingItemsByRequestId.set(shippingItem.shipping_request_id, group);
    }

    const timelineByShippingRequestId = new Map<
      string,
      YnotShippingTimelineEvent[]
    >();
    for (const row of auditRows) {
      if (!row.shipping_request_id) continue;
      const group = timelineByShippingRequestId.get(row.shipping_request_id) ?? [];
      group.push(shippingTimelineEvent(row));
      timelineByShippingRequestId.set(row.shipping_request_id, group);
    }

    return rows.map((row) => {
      const profile = profileById.get(row.profile_id);
      return {
        id: row.id,
        publicCode: row.public_code,
        profileId: row.profile_id,
        status: row.status,
        trackingProvider: row.tracking_provider,
        trackingNumber: row.tracking_number,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        customerNote: row.customer_note,
        adminNote: row.admin_note,
        shippingFeeCoins: row.shipping_fee_coins,
        customer: profile
          ? {
              profileId: profile.id,
              displayName:
                profile.display_name ??
                profile.line_display_name ??
                "YNot Customer",
              email: profile.email,
              lineDisplayName: profile.line_display_name,
              lineUserId: profile.line_user_id,
              phone: profile.phone,
              status: profile.profile_status,
              createdAt: profile.created_at,
              lastSeenAt: profile.last_seen_at,
            }
          : null,
        addressSnapshot: addressSnapshotFromRow(
          row,
          row.address_id ? addressById.get(row.address_id) : undefined,
        ),
        items: shippingItemsByRequestId.get(row.id) ?? [],
        timeline: timelineByShippingRequestId.get(row.id) ?? [],
      };
    });
  });
}

function publicShippingRequest(
  request: YnotShippingRequest,
): YnotShippingRequest {
  return {
    ...request,
    id: request.publicCode,
    profileId: undefined,
    customer: null,
    timeline: [],
    adminNote: null,
  };
}

export async function getAddresses(profileId?: string): Promise<YnotAddress[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  return readOrEmpty("addresses", () => getProfileAddresses(profileId));
}

async function getRankingsImpl(): Promise<YnotRankingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("rankings", async () => {
    const { data, error } = await supabase
      .from("ranking_snapshots")
      .select("rank,value,metric,profiles(display_name,line_display_name)")
      .order("rank", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      return {
        rank: row.rank,
        value: row.value,
        metric: row.metric,
        displayName:
          profile?.display_name ?? profile?.line_display_name ?? "YNot Player",
      };
    });
  });
}

const getRankingsCached = unstable_cache(
  getRankingsImpl,
  ["ynot-rankings-v1"],
  { tags: ["rankings"], revalidate: 60 },
);

export async function getRankings(): Promise<YnotRankingRow[]> {
  return getRankingsCached();
}

type TierAnimationRow = {
  tier: string;
  video_url: string | null;
  poster_url: string | null;
  sound_url: string | null;
  duration_ms: number;
  is_active: boolean;
};

export async function getTierAnimations(): Promise<YnotTierAnimation[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  try {
    const { data, error } = await (supabase.from as unknown as (
      name: string,
    ) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => Promise<{ data: TierAnimationRow[] | null; error: unknown }>;
      };
    })("tier_animations")
      .select("tier,video_url,poster_url,sound_url,duration_ms,is_active")
      .eq("is_active", true);
    if (error || !data) return [];
    return data
      .filter((row) =>
        ["bronze", "silver", "gold", "rainbow"].includes(row.tier),
      )
      .map((row) => ({
        tier: row.tier as YnotTierAnimation["tier"],
        videoUrl: row.video_url,
        posterUrl: row.poster_url,
        soundUrl: row.sound_url,
        durationMs: row.duration_ms,
        isActive: row.is_active,
      }));
  } catch {
    return [];
  }
}

export async function getAllTierAnimationsForAdmin(): Promise<
  YnotTierAnimation[]
> {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  try {
    const { data, error } = await (supabase.from as unknown as (
      name: string,
    ) => {
      select: (columns: string) => {
        order: (
          column: string,
        ) => Promise<{ data: TierAnimationRow[] | null; error: unknown }>;
      };
    })("tier_animations")
      .select("tier,video_url,poster_url,sound_url,duration_ms,is_active")
      .order("tier");
    if (error || !data) return [];
    const order = ["rainbow", "gold", "silver", "bronze"];
    return data
      .filter((row) => order.includes(row.tier))
      .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))
      .map((row) => ({
        tier: row.tier as YnotTierAnimation["tier"],
        videoUrl: row.video_url,
        posterUrl: row.poster_url,
        soundUrl: row.sound_url,
        durationMs: row.duration_ms,
        isActive: row.is_active,
      }));
  } catch {
    return [];
  }
}

export async function getAdminUsers() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_users", async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id,email,display_name,line_display_name,profile_status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (profilesError) throw profilesError;
    const profileIds = (profiles ?? []).map((profile) => profile.id);
    const { data: admins, error: adminsError } = profileIds.length
      ? await supabase
          .from("admin_users")
          .select("id,profile_id,role,is_active,created_at")
          .in("profile_id", profileIds)
      : { data: [], error: null };
    if (adminsError) throw adminsError;
    const adminByProfile = new Map(
      (admins ?? []).map((admin) => [admin.profile_id, admin]),
    );
    return (profiles ?? []).map((profile) => {
      const admin = adminByProfile.get(profile.id);
      return {
        id: profile.id,
        email: profile.email,
        displayName:
          profile.display_name ?? profile.line_display_name ?? "YNot Customer",
        status: profile.profile_status,
        adminRole: admin?.role ?? null,
        adminActive: Boolean(admin?.is_active),
        createdAt: profile.created_at,
      };
    });
  });
}

export async function getAdminUserDetail(
  profileId: string,
): Promise<YnotAdminUserDetail | null> {
  if (!profileId || !isSupabaseConfigured()) return null;
  const admin = await resolveAdminSession();
  if (!admin) return null;
  const supabase = createServiceSupabaseClient();
  const profileRows = await readOrEmpty("admin_user_detail_profile", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .limit(1);
    if (error) throw error;
    return data ?? [];
  });
  const profile = profileRows[0];
  if (!profile) return null;

  const [
    wallet,
    addresses,
    collection,
    gachaOpens,
    shipping,
    topUps,
    walletLedger,
    auditRows,
  ] = await Promise.all([
    getWallet(profileId),
    getAddresses(profileId),
    getCollection(profileId),
    getGachaOpenHistory(profileId),
    getShipping(profileId),
    getTopUps(profileId, false, { includeSensitiveSlipDetails: true }),
    readOrEmpty("admin_user_wallet_ledger", async () => {
      const { data, error } = await supabase
        .from("coin_ledger")
        .select(
          "id,entry_type,amount_coins,balance_before,balance_after,reference_type,created_at",
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("admin_user_audit", async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("*")
        .eq("actor_profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    }),
  ]);
  const auditTimelineById = new Map<string, YnotShippingTimelineEvent>();
  for (const event of auditRows.map(shippingTimelineEvent)) {
    auditTimelineById.set(event.id, event);
  }
  for (const request of shipping) {
    for (const event of request.timeline ?? []) {
      auditTimelineById.set(event.id, event);
    }
  }
  const auditTimeline = Array.from(auditTimelineById.values()).sort(
    (a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
  );

  return {
    profile: {
      profileId: profile.id,
      displayName:
        profile.display_name ??
        profile.line_display_name ??
        profile.full_name ??
        "YNot Customer",
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      email: profile.email,
      lineDisplayName: profile.line_display_name,
      lineUserId: profile.line_user_id,
      phone: profile.phone,
      status: profile.profile_status,
      preferredLanguage: profile.preferred_language,
      createdAt: profile.created_at,
      lastSeenAt: profile.last_seen_at,
    },
    wallet,
    addresses,
    collection,
    gachaOpens,
    shipping,
    topUps,
    walletLedger: walletLedger.map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type,
      amountCoins: entry.amount_coins,
      balanceBefore: entry.balance_before,
      balanceAfter: entry.balance_after,
      referenceType: entry.reference_type,
      createdAt: entry.created_at,
    })),
    auditTimeline,
  };
}

export async function getAdminAuditEvents({
  limit = 120,
}: { limit?: number } = {}) {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const safeLimit = Math.max(1, Math.min(120, Math.floor(limit)));
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("audit_events", async () => {
    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return data ?? [];
  });
}

// Retry a transient query. Cloudflare Workers + the Supabase pooler can drop or
// reject a request under concurrent load, which previously surfaced as an empty
// admin catalog / "No sub-SKU stock" in the pack editor. An immediate retry
// almost always succeeds once connections free up.
async function retryQuery<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function getAdminCards() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_cards", async () => {
    const cards = await retryQuery(() => getCardCatalog(supabase));
    if (!cards.length) return cards;
    const stockRows = await readOrEmpty("card_stock_summary", () =>
      retryQuery(async () => {
        const { data, error } = await supabase.rpc("get_card_stock_summary", {
          p_card_id: null,
        });
        if (error) throw error;
        return cardStockSummariesFromJson(data);
      }),
    );
    const stockByCard = new Map(stockRows.map((row) => [row.cardId, row]));
    const subSkuRows = await readOrEmpty("card_stock_subsku_summary", () =>
      retryQuery(async () => {
        const { data, error } = await supabase.rpc(
          "get_admin_card_stock_subsku_summary",
          { p_card_id: null },
        );
        if (error) throw error;
        return cardStockSubSkuSummariesFromJson(data);
      }),
    );

    return cards.map((card) => {
      const stock = stockByCard.get(card.catalogCardId);
      return {
        ...card,
        stockTotal: stock?.totalUnits ?? 0,
        stockAvailable: stock?.availableUnits ?? 0,
        stockReserved: stock?.reservedUnits ?? 0,
        stockAllocated: stock?.allocatedUnits ?? 0,
        stockArchived: stock?.archivedUnits ?? 0,
        stockSkuGroups: stockSkuGroupsFromSummaryRows(card, subSkuRows),
        stockUnits: [],
      };
    });
  });
}

// Admin prize lineup for a single campaign, loaded on its own so the pack
// editor can fetch it client-side. The full dashboard slice loads inventory +
// readiness for a live pack (many materialized units) and can exhaust the
// Cloudflare Worker subrequest budget before the lineup query runs, leaving the
// editor with an empty lineup. This path is light (~3 queries) and runs in its
// own request with a fresh budget.
export async function getAdminCampaignPrizeLineup(
  campaignId: string,
): Promise<YnotPrizePreview[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_campaign_prize_lineup", async () => {
    const { data: row, error } = await retryQuery(async () =>
      supabase.from("draw_rounds").select("*").eq("id", campaignId).maybeSingle(),
    );
    if (error) throw error;
    if (!row) return [];
    return retryQuery(() =>
      getPublicPrizeLineup(supabase, row as DrawRoundRow, undefined, {
        includeLocked: true,
        includeSensitiveOdds: true,
        includeStockTarget: true,
      }),
    );
  });
}

export async function getAdminPrizePool(): Promise<YnotPrizePoolItem[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("prize_pool", async () => {
    const { data: prizes, error } = await supabase
      .from("draw_round_prizes")
      .select("*")
      .order("draw_round_id", { ascending: true })
      .order("tier", { ascending: true })
      .order("rank", { ascending: true })
      .limit(240);
    if (error) throw error;
    const visiblePrizes = (prizes ?? []).filter(
      (prize) => !isAdminHidden(prize.metadata),
    );
    if (!visiblePrizes.length) return [];

    const campaignIds = [
      ...new Set(visiblePrizes.map((prize) => prize.draw_round_id)),
    ];
    const cardIds = [...new Set(visiblePrizes.map((prize) => prize.card_id))];
    const [{ data: campaigns, error: campaignsError }, cards] = await Promise.all([
      supabase
        .from("draw_rounds")
        .select("id,slug,title_th,title_en")
        .in("id", campaignIds),
      readSupabaseRows<PrizePoolCardRow>("prize_pool_cards", () =>
        supabase
          .from("cards")
          .select(
            "id,name,card_code,grade,image_url,image_storage_path,prize_category,catalog_category,language,variant",
          )
          .in("id", cardIds),
      ),
    ]);
    if (campaignsError) throw campaignsError;

    const campaignById = new Map(
      (campaigns ?? []).map((campaign) => [campaign.id, campaign]),
    );
    const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
    const prizeIds = visiblePrizes.map((prize) => prize.id);
    const prizeUnits = prizeIds.length
      ? await readSupabaseRows<PrizePoolUnitRow>("prize_pool_stock_units", () =>
          supabase
            .from("draw_round_prize_units")
            .select("draw_round_prize_id,card_stock_unit_id,status")
            .in("draw_round_prize_id", prizeIds),
        )
      : [];
    const stockUnitIds = [
      ...new Set(
        prizeUnits
          .map((unit) => unit.card_stock_unit_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const stockUnits = stockUnitIds.length
      ? await readSupabaseRows<PrizePoolStockUnitRow>(
          "prize_pool_stock_unit_identities",
          () =>
            supabase
              .from("card_stock_units")
              .select(
                "id,card_id,condition,grade,grading_service,cert_number,gemrate_id,image_url,status",
              )
              .in("id", stockUnitIds),
        )
      : [];
    const stockUsageByPrizeId = prizePoolStockUnitUsages(
      prizeUnits,
      new Map(stockUnits.map((unit) => [unit.id, unit])),
      cardById,
    );
    const prizeImageByPrizeId = stockImageUrlByPrizeId(prizeUnits, stockUnits);
    return visiblePrizes.map((prize) => {
      const campaign = campaignById.get(prize.draw_round_id);
      const card = cardById.get(prize.card_id);
      const counts = plannedPrizeUnitCounts(prize);
      const displayTier = displayTierFromPrizeMetadata(prize);
      return {
        id: prize.id,
        campaignId: prize.draw_round_id,
        campaignSlug: campaign?.slug ?? prize.draw_round_id,
        campaignTitle: campaign?.title_th ?? campaign?.title_en ?? "Campaign",
        cardId: prize.card_id,
        cardName: card?.name ?? "Card",
        cardCode: card?.card_code ?? null,
        cardGrade: card?.grade ?? null,
        cardImageUrl:
          publicSubSkuImageUrl(prizeImageByPrizeId.get(prize.id)) ??
          publicSubSkuImageUrl(card?.image_url),
        cardImageStoragePath: card?.image_storage_path ?? null,
        cardPrizeCategory: card?.prize_category ?? null,
        tier: prize.tier,
        rank: prize.rank,
        valueThb: prize.value_thb,
        convertCoinValue: Math.max(0, Math.round(Number(prize.convert_coin_value ?? 0))),
        bundleQuantity: normalizeBundleQuantity(prize.bundle_quantity),
        weight: Number(prize.weight ?? 1),
        unlockAtSoldPct: Number(prize.unlock_at_sold_pct ?? 0),
        prizeCategory: metadataString(prize.metadata, "prizeCategory"),
        prizeCategoryLabel: metadataString(prize.metadata, "prizeCategoryLabel"),
        sourceType: metadataString(prize.metadata, "sourceType"),
        displayGroup: metadataString(prize.metadata, "displayGroup"),
        displayTier,
        displayTierLabel:
          metadataString(prize.metadata, "displayTierLabel") ??
          prizeDisplayTierLabel(displayTier),
        tierRank: metadataNumber(prize.metadata, "tierRank") ?? prize.rank,
        ...prizeStockMetadata(prize),
        stockUnitUsages: stockUsageByPrizeId.get(prize.id) ?? [],
        plannedQuantity: counts.total,
        totalUnits: counts.total,
        availableUnits: counts.available,
        awardedUnits: counts.awarded,
        voidUnits: counts.void,
      };
    });
  });
}

export async function getAdminMergeRequests() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("merge_requests", async () => {
    const { data, error } = await supabase
      .from("account_merge_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;
    return data ?? [];
  });
}

type HealthStatus = YnotPlatformHealth["checks"][number]["status"];

function envCheck(
  key: string,
  label: string,
  requiredInProduction = true,
): YnotPlatformHealth["checks"][number] {
  const configured = Boolean(process.env[key]?.trim());
  const production = process.env.NODE_ENV === "production";
  const required = requiredInProduction && production;
  const status: HealthStatus = configured ? "pass" : required ? "fail" : "warn";
  return {
    key: `env:${key}`,
    label,
    status,
    detail: configured
      ? `${key} is configured.`
      : `${key} is missing${required ? " and required in production" : " for full live verification"}.`,
  };
}

async function tableHealthCheck(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  table: keyof Database["public"]["Tables"],
  label: string,
): Promise<YnotPlatformHealth["checks"][number]> {
  const { error } = await supabase.from(table).select("*").limit(1);
  return {
    key: `table:${String(table)}`,
    label,
    status: error ? "fail" : "pass",
    detail: error
      ? `${String(table)} unavailable: ${error.message}`
      : `${String(table)} table is reachable.`,
  };
}

function withDataIssueHealth(
  health: YnotPlatformHealth | undefined,
  dataIssues: YnotDataIssue[],
): YnotPlatformHealth | undefined {
  if (!health) return undefined;
  const dataReadCheck: YnotPlatformHealth["checks"][number] = dataIssues.length
    ? {
        key: "data-read-issues",
        label: "Dashboard data reads",
        status: "warn",
        detail: `${dataIssues.length} read path(s) degraded to an empty state: ${dataIssues.map((issue) => issue.label).join(", ")}. Check server logs before production launch.`,
      }
    : {
        key: "data-read-issues",
        label: "Dashboard data reads",
        status: "pass",
        detail:
          "Dashboard reads completed without degraded empty-state fallbacks in this request.",
      };
  return { ...health, checks: [...health.checks, dataReadCheck] };
}

export async function getPlatformHealth(
  isAdmin: boolean,
): Promise<YnotPlatformHealth | undefined> {
  if (!isAdmin) return undefined;
  const checks: YnotPlatformHealth["checks"] = [
    envCheck("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"),
    envCheck(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "Supabase publishable key",
    ),
    envCheck("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    envCheck("NEXT_PUBLIC_SITE_URL", "Public site URL"),
    envCheck("LINE_SESSION_SECRET", "LINE session signing secret"),
    envCheck("LINE_LOGIN_CHANNEL_ID", "LINE login channel ID", false),
    envCheck("LINE_LOGIN_CHANNEL_SECRET", "LINE login channel secret", false),
    envCheck("SLIP2GO_SECRET_KEY", "Slip2Go secret key", false),
    {
      key: "demo-storefront",
      label: "Demo storefront fallback",
      status: allowDemoStorefront() ? "warn" : "pass",
      detail: allowDemoStorefront()
        ? "Demo packs are enabled for local/explicit preview. Disable NEXT_PUBLIC_ENABLE_DEMO_STOREFRONT in production."
        : "Demo packs are disabled; public storefront requires real published campaigns.",
    },
    {
      key: "rate-limit-backend",
      label: "Production rate-limit backend",
      status:
        process.env.RATE_LIMIT_BACKEND === "supabase"
          ? "pass"
          : process.env.NODE_ENV === "production"
            ? "fail"
            : "warn",
      detail:
        process.env.RATE_LIMIT_BACKEND === "supabase"
          ? "Durable Supabase-backed API rate limiting is configured."
          : "Set RATE_LIMIT_BACKEND=supabase after applying the api_rate_limits migration before enabling production wallet/gacha/admin mutations.",
    },
  ];

  if (!isSupabaseConfigured()) {
    checks.push({
      key: "schema:skipped",
      label: "Schema checks",
      status: "fail",
      detail:
        "Supabase is not configured, so table readiness cannot be checked.",
    });
    return { generatedAt: new Date().toISOString(), checks };
  }

  const supabase = createServiceSupabaseClient();
  const tableChecks = await Promise.all([
    tableHealthCheck(supabase, "profiles", "Profile table"),
    tableHealthCheck(supabase, "user_identities", "Identity bridge table"),
    tableHealthCheck(supabase, "user_addresses", "Address table"),
    tableHealthCheck(supabase, "admin_users", "Admin role table"),
    tableHealthCheck(supabase, "draw_rounds", "Campaign table"),
    tableHealthCheck(supabase, "store_categories", "Store category table"),
    tableHealthCheck(
      supabase,
      "draw_round_categories",
      "Campaign/category join table",
    ),
    tableHealthCheck(
      supabase,
      "draw_round_testers",
      "Test-pack whitelist table",
    ),
    tableHealthCheck(supabase, "draw_round_prizes", "Prize pool table"),
    tableHealthCheck(
      supabase,
      "draw_round_prize_units",
      "Prize inventory units table",
    ),
    tableHealthCheck(supabase, "cards", "Card catalog table"),
    tableHealthCheck(supabase, "payment_methods", "Payment method table"),
    tableHealthCheck(supabase, "payment_slips", "Payment slip table"),
    tableHealthCheck(supabase, "top_up_requests", "Top-up request table"),
    tableHealthCheck(supabase, "wallet_accounts", "Wallet table"),
    tableHealthCheck(supabase, "coin_ledger", "Coin ledger table"),
    tableHealthCheck(supabase, "idempotency_keys", "Idempotency table"),
    tableHealthCheck(supabase, "gacha_opens", "Gacha opens table"),
    tableHealthCheck(supabase, "gacha_open_items", "Gacha open items table"),
    tableHealthCheck(supabase, "collection_items", "Collection table"),
    tableHealthCheck(supabase, "exchange_orders", "Exchange table"),
    tableHealthCheck(supabase, "exchange_order_items", "Exchange items table"),
    tableHealthCheck(supabase, "shipping_requests", "Shipping table"),
    tableHealthCheck(
      supabase,
      "shipping_request_items",
      "Shipping items table",
    ),
    tableHealthCheck(supabase, "ranking_snapshots", "Ranking table"),
    tableHealthCheck(supabase, "audit_events", "Audit events table"),
    tableHealthCheck(supabase, "app_realtime_events", "Private realtime table"),
    tableHealthCheck(supabase, "api_rate_limits", "API rate limit table"),
    tableHealthCheck(supabase, "seed_runs", "Seed run registry table"),
    tableHealthCheck(
      supabase,
      "seed_run_items",
      "Seed run item registry table",
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    checks: [...checks, ...tableChecks],
  };
}

const DEFAULT_WALLET = { balanceCoins: 0, version: 0 } as const;

export async function getYnotPublicHomeData(): Promise<YnotDashboardData> {
  // Keep the public homepage below Cloudflare Worker limits: no wallet,
  // campaign, inventory, or collection reads during "/" render. Viewer
  // resolution is still needed so the shared header reflects Supabase and LINE
  // login state consistently with every other page.
  const viewer = await getYnotViewer();
  return {
    configured: isSupabaseConfigured(),
    viewer,
    campaigns: [],
    categories: [],
    paymentMethods: [],
    wallet: { ...DEFAULT_WALLET },
    topUps: [],
    gachaOpens: [],
    collection: [],
    exchanges: [],
    shipping: [],
    addresses: [],
    rankings: [],
    adminTopUps: [],
    ownerApprovalRequests: [],
    dataIssues: [],
  };
}

export type YnotDashboardSelector = {
  campaigns?: boolean;
  campaignVisibility?: "public" | "admin";
  campaignLimit?: number | null;
  categories?: boolean;
  paymentMethods?: boolean;
  wallet?: boolean;
  topUps?: boolean;
  gachaOpens?: boolean;
  collection?: boolean;
  exchanges?: boolean;
  shipping?: boolean;
  addresses?: boolean;
  rankings?: boolean;
  adminTopUps?: boolean;
  ownerApprovalRequests?: boolean;
  campaignReadiness?: boolean;
  campaignPrizeLineups?: boolean;
  campaignIdOrSlug?: string;
  includeSoldOutCampaigns?: boolean;
  platformHealth?: boolean;
};

const DASHBOARD_SELECTOR_ALL: YnotDashboardSelector = {
  campaigns: true,
  categories: true,
  paymentMethods: true,
  wallet: true,
  topUps: true,
  gachaOpens: true,
  collection: true,
  exchanges: true,
  shipping: true,
  addresses: true,
  rankings: true,
  adminTopUps: true,
  ownerApprovalRequests: true,
  platformHealth: true,
};

export async function getYnotDashboardSlice(
  selector: YnotDashboardSelector = {},
): Promise<YnotDashboardData> {
  const wantHealth = !!selector.platformHealth;
  // Owner approvals are derived from campaigns; auto-pull campaigns if needed.
  const needCampaigns = !!selector.campaigns || !!selector.ownerApprovalRequests;

  const dataIssues: YnotDataIssue[] = [];

  const run = async (): Promise<YnotDashboardData> => {
    const viewer = await getYnotViewer();
    const profileId = viewer.profileId;
    const campaignVisibility =
      selector.campaignVisibility ??
      (selector.ownerApprovalRequests ? "admin" : "public");
    // YnotShell renders walletBalance on most customer pages. Admin pages can
    // opt out to avoid one extra Supabase call during heavy server renders.
    const wantWallet = selector.wallet ?? viewer.authenticated;
    const [
      campaigns,
      categories,
      paymentMethods,
      wallet,
      topUps,
      gachaOpens,
      collection,
      exchanges,
      shipping,
      addresses,
      rankings,
      adminTopUps,
      platformHealth,
    ] = await Promise.all([
      needCampaigns
        ? campaignVisibility === "admin"
          ? getCampaigns({
              includePrivate: viewer.isAdmin || isDevAuthAllowed(),
              includeSoldOutPublic: selector.includeSoldOutCampaigns,
              limit: selector.campaignLimit,
              includeReadiness: selector.campaignReadiness,
              includePrizeLineups: selector.campaignPrizeLineups,
              campaignIdOrSlug: selector.campaignIdOrSlug,
            })
          : getCampaigns({
              includePrivate: false,
              includeSoldOutPublic: selector.includeSoldOutCampaigns,
              limit: selector.campaignLimit,
              campaignIdOrSlug: selector.campaignIdOrSlug,
            })
        : Promise.resolve([] as YnotCampaign[]),
      selector.categories
        ? getStoreCategories({ includeTest: viewer.isAdmin })
        : Promise.resolve([] as YnotCategory[]),
      selector.paymentMethods
        ? getPaymentMethods().then(publicPaymentMethods)
        : Promise.resolve([] as YnotPaymentMethod[]),
      wantWallet
        ? getWallet(profileId)
        : Promise.resolve({ ...DEFAULT_WALLET }),
      selector.topUps
        ? getTopUps(profileId).then((topUps) => topUps.map(publicTopUp))
        : Promise.resolve([] as YnotTopUp[]),
      selector.gachaOpens
        ? getGachaOpenHistory(profileId)
        : Promise.resolve([] as YnotGachaOpenHistory[]),
      selector.collection
        ? getCollection(profileId)
        : Promise.resolve([] as YnotCollectionItem[]),
      selector.exchanges
        ? getExchanges(profileId).then((orders) =>
            viewer.isAdmin ? orders : orders.map(publicExchangeOrder),
          )
        : Promise.resolve([] as YnotExchangeOrder[]),
      selector.shipping
        ? getShipping(profileId).then((requests) =>
            viewer.isAdmin ? requests : requests.map(publicShippingRequest),
          )
        : Promise.resolve([] as YnotShippingRequest[]),
      selector.addresses
        ? getAddresses(profileId)
        : Promise.resolve([] as YnotAddress[]),
      selector.rankings
        ? getRankings()
        : Promise.resolve([] as YnotRankingRow[]),
      selector.adminTopUps && viewer.isAdmin
        ? getTopUps(undefined, true)
        : Promise.resolve([] as YnotTopUp[]),
      wantHealth
        ? getPlatformHealth(viewer.isAdmin)
        : Promise.resolve(undefined as YnotPlatformHealth | undefined),
    ]);

    const ownerApprovalRequests = selector.ownerApprovalRequests
      ? getOwnerApprovalRequests(viewer, campaigns)
      : [];

    return {
      configured: isSupabaseConfigured(),
      viewer,
      campaigns,
      categories,
      paymentMethods,
      wallet,
      topUps,
      gachaOpens,
      collection,
      exchanges,
      shipping,
      addresses,
      rankings,
      adminTopUps,
      ownerApprovalRequests,
      platformHealth: wantHealth
        ? withDataIssueHealth(platformHealth, dataIssues)
        : undefined,
      dataIssues,
    };
  };

  return wantHealth ? dataIssueStorage.run(dataIssues, run) : run();
}

export function getYnotDashboardData(): Promise<YnotDashboardData> {
  return getYnotDashboardSlice(DASHBOARD_SELECTOR_ALL);
}
