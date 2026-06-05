import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isMissingColumnError,
  isMissingFunctionError,
  randomPackSchemaMissingResponse,
} from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import {
  catalogCategoryForPrizeCategory,
  isRandomPsa10PrizeCard,
  prizeCategoryForCatalogCategory,
  prizeCategoryLabel,
  prizeCategoryValue,
  prizeSourceType,
} from "@/features/ynot/prize-category";
import {
  catalogCategoryLabel,
  catalogCategoryValue,
} from "@/features/ynot/card-catalog-metadata";
import {
  canPrizeDisplayTierUseRandomPsa10,
  prizeDisplayTierLabel,
  prizeDisplayTierValue,
} from "@/features/ynot/prize-tier";
import { getPrizeStockSummaries } from "@/features/ynot/prize-readiness";
import {
  bundledStockUnitRequirement,
  normalizeBundleQuantity,
} from "@/features/ynot/bundle-quantity";
import {
  buildPrizeStockSelectionIssues,
  buildPrizeStockShortages,
  stockSelectionBlockers,
  stockShortageBlockers,
  type StockReadinessPrize,
} from "@/features/ynot/stock-readiness";

export const dynamic = "force-dynamic";

type PrizeBody = {
  campaignId?: unknown;
  cardId?: unknown;
  tier?: unknown;
  rank?: unknown;
  valueThb?: unknown;
  weight?: unknown;
  unlockAtSoldPct?: unknown;
  prizeId?: unknown;
  quantity?: unknown;
  bundleQuantity?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
  metadata?: unknown;
  catalogCategory?: unknown;
  prizeCategory?: unknown;
  sourceType?: unknown;
  displayGroup?: unknown;
  displayTier?: unknown;
};

type PrizeTier = Database["public"]["Tables"]["draw_round_prizes"]["Row"]["tier"];
type PrizeRow = Database["public"]["Tables"]["draw_round_prizes"]["Row"];
type PrizeSaveRow = Pick<
  PrizeRow,
  | "id"
  | "draw_round_id"
  | "card_id"
  | "tier"
  | "rank"
  | "value_thb"
  | "weight"
  | "unlock_at_sold_pct"
  | "planned_quantity"
  | "bundle_quantity"
  | "metadata"
>;
type AdminSession = NonNullable<Awaited<ReturnType<typeof resolveAdminSession>>>;
type Supabase = ReturnType<typeof createServiceSupabaseClient>;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tierValue(value: unknown): PrizeTier {
  return value === "high" ? "high" : "normal";
}

function rankValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

function moneyValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? Math.round(parsed) : null;
}

function quantityValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : null;
}

function weightValue(value: unknown) {
  if (value === undefined || value === null || value === "") return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000
    ? Number(parsed.toFixed(4))
    : null;
}

function percentValue(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? Number(parsed.toFixed(2))
    : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return "";
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function metadataPositiveInteger(
  metadata: unknown,
  key: string,
  fallback: number,
) {
  if (!isRecord(metadata)) return fallback;
  const parsed = Number(metadata[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function metadataValue(body: PrizeBody): Json {
  const metadata = isRecord(body.metadata) ? { ...body.metadata } : {};
  const rawCatalogCategory = body.catalogCategory ?? metadata.catalogCategory;
  const fallbackPrizeCategory = prizeCategoryValue(
    body.prizeCategory ?? metadata.prizeCategory,
  );
  const catalogCategory = catalogCategoryValue(
    rawCatalogCategory,
    catalogCategoryForPrizeCategory(fallbackPrizeCategory),
  );
  const hasCatalogCategory =
    rawCatalogCategory !== undefined &&
    rawCatalogCategory !== null &&
    rawCatalogCategory !== "";
  const prizeCategory = hasCatalogCategory
    ? prizeCategoryForCatalogCategory(catalogCategory)
    : fallbackPrizeCategory;
  const sourceType = prizeSourceType(prizeCategory);
  const displayGroup = text(body.displayGroup, 40);
  const tierRank = rankValue(metadata.tierRank) ?? rankValue(body.rank) ?? 1;
  const displayTier = prizeDisplayTierValue(
    text(body.displayTier, 40) || metadata.displayTier || displayGroup,
  );
  metadata.catalogCategory = catalogCategory;
  metadata.catalogCategoryLabel = catalogCategoryLabel(catalogCategory);
  metadata.prizeCategory = prizeCategory;
  metadata.prizeCategoryLabel = prizeCategoryLabel(prizeCategory);
  metadata.sourceType = sourceType;
  metadata.displayTier = displayTier;
  metadata.displayTierLabel = prizeDisplayTierLabel(displayTier);
  metadata.displayGroup = displayGroup || displayTier;
  metadata.tierRank = tierRank;
  return metadata as Json;
}

function displayTierForPrizeRow(row: Pick<PrizeRow, "tier" | "rank" | "metadata">) {
  const displayTier = metadataString(row.metadata, "displayTier");
  if (displayTier) return prizeDisplayTierValue(displayTier);
  const displayGroup = metadataString(row.metadata, "displayGroup");
  if (displayGroup) return prizeDisplayTierValue(displayGroup);
  if (row.tier === "high" && row.rank <= 3) return "rainbow";
  if (row.tier === "high") return "gold";
  return "bronze";
}

function tierRankForPrizeRow(row: Pick<PrizeRow, "rank" | "metadata">) {
  return metadataPositiveInteger(row.metadata, "tierRank", row.rank);
}

function isUniqueConstraintError(error: { code?: string } | null) {
  return error?.code === "23505";
}

async function resolvePrizeRank(
  supabase: Supabase,
  campaignId: string,
  tier: PrizeTier,
  requestedRank: number,
  displayTier: string,
  tierRank: number,
) {
  const { data, error } = await supabase
    .from("draw_round_prizes")
    .select("id,tier,rank,metadata")
    .eq("draw_round_id", campaignId)
    .eq("tier", tier)
    .order("rank", { ascending: true });
  if (error) throw error;

  const existingRows = data ?? [];
  const existingDisplayRow = existingRows.find(
    (row) =>
      displayTierForPrizeRow(row) === prizeDisplayTierValue(displayTier) &&
      tierRankForPrizeRow(row) === tierRank,
  );
  if (existingDisplayRow) {
    return { existingPrizeId: existingDisplayRow.id, rank: existingDisplayRow.rank };
  }

  const usedRanks = new Set(existingRows.map((row) => row.rank));
  let rank = requestedRank;
  while (usedRanks.has(rank)) rank += 1;
  return { existingPrizeId: null, rank };
}

async function savePrizeRow(
  supabase: Supabase,
  patch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"],
  basePatch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"],
  existingPrizeId: string | null,
  weight: number | undefined,
  unlockAtSoldPct: number | undefined,
  requiresPlannedQuantity: boolean,
  bundleQuantity: number,
) {
  const selectColumns =
    "id,draw_round_id,card_id,tier,rank,value_thb,weight,unlock_at_sold_pct,planned_quantity,bundle_quantity,metadata";
  const savePatch = (rowPatch: typeof patch) =>
    existingPrizeId
      ? supabase
          .from("draw_round_prizes")
          .update(rowPatch)
          .eq("id", existingPrizeId)
          .select(selectColumns)
          .single()
      : supabase
          .from("draw_round_prizes")
          .insert(rowPatch)
          .select(selectColumns)
          .single();

  let { data, error } = await savePatch(patch);
  if (error && isMissingColumnError(error)) {
    if (
      requiresPlannedQuantity ||
      bundleQuantity !== 1 ||
      (weight ?? 1) !== 1 ||
      (unlockAtSoldPct ?? 0) !== 0
    ) {
      return { data: null, error, schemaMissing: true };
    }
    const fallbackPatch = basePatch;
    ({ data, error } = existingPrizeId
      ? await supabase
          .from("draw_round_prizes")
          .update(fallbackPatch)
          .eq("id", existingPrizeId)
          .select("id,draw_round_id,card_id,tier,rank,value_thb,metadata")
          .single()
      : await supabase
          .from("draw_round_prizes")
          .insert(fallbackPatch)
          .select("id,draw_round_id,card_id,tier,rank,value_thb,metadata")
          .single());
    if (data) {
      data = {
        ...data,
        weight: 1,
        unlock_at_sold_pct: 0,
        bundle_quantity: 1,
      } as PrizeSaveRow;
    }
  }
  return { data: data as PrizeSaveRow | null, error, schemaMissing: false };
}

async function bodyJson(request: Request): Promise<PrizeBody | null> {
  return request.json().catch(() => null) as Promise<PrizeBody | null>;
}

async function validatePlannedPrizeStock(
  supabase: Supabase,
  campaignId: string,
  existingPrizeId: string | null,
  selectedPrize: StockReadinessPrize,
) {
  const { data: currentPrizes, error } = await supabase
    .from("draw_round_prizes")
    .select("id,card_id,planned_quantity,bundle_quantity,metadata")
    .eq("draw_round_id", campaignId);
  if (error) {
    return Response.json(
      {
        error: "Prize stock could not be validated.",
        code: "CAMPAIGN_PRIZE_STOCK_CHECK_FAILED",
      },
      { status: 409 },
    );
  }

  const existingPrize = existingPrizeId
    ? (currentPrizes ?? []).find((prize) => prize.id === existingPrizeId)
    : null;
  const selectedQuantity =
    selectedPrize.quantity === null || selectedPrize.quantity === undefined
      ? Math.max(0, Math.round(Number(existingPrize?.planned_quantity ?? 0)))
      : Math.max(0, Math.round(Number(selectedPrize.quantity)));
  const selectedBundleQuantity = normalizeBundleQuantity(
    selectedPrize.bundleQuantity ?? existingPrize?.bundle_quantity ?? 1,
  );
  const plannedPrizes: StockReadinessPrize[] = (currentPrizes ?? [])
    .filter((prize) => prize.id !== existingPrizeId)
    .map((prize) => ({
      card_id: prize.card_id,
      planned_quantity: prize.planned_quantity,
      bundle_quantity: prize.bundle_quantity,
      metadata: prize.metadata,
    }));
  if (selectedQuantity > 0) {
    plannedPrizes.push({
      ...selectedPrize,
      quantity: selectedQuantity,
      bundleQuantity: selectedBundleQuantity,
    });
  }
  if (!plannedPrizes.length) return null;

  try {
    const stockSummaries = await getPrizeStockSummaries(supabase, plannedPrizes);
    const blockers = [
      ...stockSelectionBlockers(
        buildPrizeStockSelectionIssues({
          prizes: plannedPrizes,
          stockSummaries,
        }),
      ),
      ...stockShortageBlockers(
        buildPrizeStockShortages({
          prizes: plannedPrizes,
          stockSummaries,
        }),
      ),
    ];
    if (blockers.length) {
      return Response.json(
        {
          error: blockers[0],
          code: "CAMPAIGN_PRIZE_STOCK_INVALID",
          blockers,
        },
        { status: 400 },
      );
    }
  } catch {
    return Response.json(
      {
        error: "Prize stock could not be validated.",
        code: "CAMPAIGN_PRIZE_STOCK_CHECK_FAILED",
      },
      { status: 409 },
    );
  }

  return null;
}

async function markCampaignNeedsOwnerReview(
  supabase: Supabase,
  campaignId: string,
  admin: AdminSession,
  reason: string,
) {
  const { data: campaign, error: campaignError } = await supabase
    .from("draw_rounds")
    .select("id,status,visibility,approval_status")
    .eq("id", campaignId)
    .single();
  if (campaignError && isMissingColumnError(campaignError, "approval_status")) {
    const { data: legacyCampaign, error: legacyError } = await supabase
      .from("draw_rounds")
      .select("id,status,visibility")
      .eq("id", campaignId)
      .single();
    if (legacyError) {
      return Response.json({ error: legacyError.message }, { status: 409 });
    }
    if (legacyCampaign.status !== "draft") {
      return Response.json(
        { error: "Prize logic can only be changed while the random pack is draft/private." },
        { status: 409 },
      );
    }
    return null;
  }
  if (campaignError) return Response.json({ error: campaignError.message }, { status: 409 });
  if (campaign.status !== "draft") {
    return Response.json(
      { error: "Prize logic can only be changed while the random pack is draft/private." },
      { status: 409 },
    );
  }
  if (campaign.approval_status === "approved") {
    return Response.json(
      { error: "Approved pack inventory is locked. Archive it or create a new draft before changing prizes." },
      { status: 409 },
    );
  }
  if (campaign.approval_status === "pending_review") {
    const { error: releaseError } = await supabase.rpc(
      "release_campaign_reservations",
      {
        p_draw_round_id: campaignId,
        p_admin_id: admin.adminId,
        p_reason: "changes_requested",
        p_note: reason,
      },
    );
    if (
      releaseError &&
      !isMissingColumnError(releaseError) &&
      !isMissingFunctionError(releaseError, "release_campaign_reservations")
    ) {
      return Response.json({ error: releaseError.message }, { status: 409 });
    }
  }

  const { error } = await supabase
    .from("draw_rounds")
    .update({
      approval_status: "not_submitted",
      approval_requested_by: null,
      approval_requested_at: null,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      approval_notes: reason,
      status: "draft",
      visibility: "private",
    })
    .eq("id", campaignId);
  if (error && isMissingColumnError(error)) return null;
  if (error) return Response.json({ error: error.message }, { status: 409 });

  return null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:prizes", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  const hasOwnerOnlyOddsFields =
    body.valueThb !== undefined ||
    body.weight !== undefined ||
    body.unlockAtSoldPct !== undefined;
  if (hasOwnerOnlyOddsFields && admin.adminRole !== "owner") {
    return Response.json(
      { error: "Only an owner can set prize value, weight, or sold unlock odds." },
      { status: 403 },
    );
  }

  const campaignId = text(body.campaignId, 80);
  const cardId = text(body.cardId, 80);
  const tier = tierValue(body.tier);
  const rank = rankValue(body.rank);
  const quantity = quantityValue(body.quantity);
  const bundleQuantity = normalizeBundleQuantity(body.bundleQuantity);
  const valueThb =
    body.valueThb === undefined ? undefined : moneyValue(body.valueThb);
  const weight = body.weight === undefined ? undefined : weightValue(body.weight);
  const unlockAtSoldPct =
    body.unlockAtSoldPct === undefined
      ? undefined
      : percentValue(body.unlockAtSoldPct);
  const metadata = metadataValue(body);
  const catalogCategory = catalogCategoryValue(
    isRecord(metadata) ? metadata.catalogCategory : undefined,
  );
  const prizeCategory = prizeCategoryValue(
    isRecord(metadata) ? metadata.prizeCategory : body.prizeCategory,
  );
  const displayTier = prizeDisplayTierValue(
    isRecord(metadata) ? metadata.displayTier : undefined,
  );
  const tierRank = metadataPositiveInteger(metadata, "tierRank", rank ?? 1);
  if (!campaignId || !cardId || !rank) return Response.json({ error: "campaignId, cardId, and rank are required." }, { status: 400 });
  if (body.quantity !== undefined && quantity === null) return Response.json({ error: "quantity must be an integer from 0 to 10000." }, { status: 400 });
  if (weight === null) return Response.json({ error: "weight must be a number from 0 to 100000." }, { status: 400 });
  if (unlockAtSoldPct === null) return Response.json({ error: "unlockAtSoldPct must be a number from 0 to 100." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: card, error: cardError } = await supabase
    .from("cards")
    .select("id,name,card_code,search_code,prize_category,catalog_category")
    .eq("id", cardId)
    .single();
  if (cardError) return Response.json({ error: cardError.message }, { status: 409 });
  const cardCatalogCategory = catalogCategoryValue(
    card.catalog_category,
    catalogCategoryForPrizeCategory(card.prize_category),
  );
  if (cardCatalogCategory !== catalogCategory) {
    return Response.json(
      { error: "Prize item does not match the selected sub-category." },
      { status: 400 },
    );
  }
  if (prizeCategory === "psa10_card") {
    const isRandomPsa10 = isRandomPsa10PrizeCard(card);
    if (isRandomPsa10 && !canPrizeDisplayTierUseRandomPsa10(displayTier)) {
      return Response.json(
        {
          error:
            "Random PSA10 can only be used on Bronze. Specific catalog prize items can be used on any tier.",
        },
        { status: 400 },
      );
    }
  }

  const reviewReset = await markCampaignNeedsOwnerReview(
    supabase,
    campaignId,
    admin,
    "Prize weight, unlock, or inventory changed. Owner review is required before publish.",
  );
  if (reviewReset) return reviewReset;

  let data: PrizeSaveRow | null = null;
  let error: { message: string; code?: string } | null = null;
  let savedRank = rank;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allocation = await resolvePrizeRank(
      supabase,
      campaignId,
      tier,
      attempt === 0 ? rank : savedRank + 1,
      displayTier,
      tierRank,
    );
    savedRank = allocation.rank;
    const stockValidation = await validatePlannedPrizeStock(
      supabase,
      campaignId,
      allocation.existingPrizeId,
      {
        cardId,
        quantity,
        bundleQuantity,
        metadata,
      },
    );
    if (stockValidation) return stockValidation;
    const basePatch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] =
      {
        draw_round_id: campaignId,
        card_id: cardId,
        tier,
        rank: savedRank,
        metadata,
      };
    const patch: Database["public"]["Tables"]["draw_round_prizes"]["Insert"] = {
      ...basePatch,
    };
    if (valueThb !== undefined) patch.value_thb = valueThb;
    if (weight !== undefined) patch.weight = weight;
    if (unlockAtSoldPct !== undefined) {
      patch.unlock_at_sold_pct = unlockAtSoldPct;
    }
    if (quantity !== null) {
      patch.planned_quantity = quantity;
    }
    patch.bundle_quantity = bundleQuantity;
    if (body.isTest !== undefined || body.seedRunId !== undefined) {
      patch.is_test = booleanValue(body.isTest);
      patch.seed_run_id = text(body.seedRunId, 80) || null;
    }

    const result = await savePrizeRow(
      supabase,
      patch,
      basePatch,
      allocation.existingPrizeId,
      weight,
      unlockAtSoldPct,
      quantity !== null,
      bundleQuantity,
    );
    if (result.schemaMissing) return randomPackSchemaMissingResponse();
    data = result.data;
    error = result.error;
    if (!error || allocation.existingPrizeId || !isUniqueConstraintError(error)) {
      break;
    }
  }
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (!data) {
    return Response.json(
      { error: "Prize could not be saved." },
      { status: 409 },
    );
  }
  const inventory =
    quantity === null
      ? null
      : {
          plannedQuantity: data.planned_quantity,
          bundleQuantity: data.bundle_quantity,
          requiredStockUnits: bundledStockUnitRequirement(data),
          materialized: false,
        };

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_saved",
    draw_round_id: campaignId,
    metadata: {
      prizeId: data.id,
      cardId,
      tier,
      rank: savedRank,
      tierRank,
      quantity,
      bundleQuantity,
      requiredStockUnits: bundledStockUnitRequirement({
        quantity: data.planned_quantity,
        bundleQuantity: data.bundle_quantity,
      }),
      weight: weight ?? "unchanged",
      unlockAtSoldPct: unlockAtSoldPct ?? "unchanged",
      catalogCategory,
      prizeCategory,
      displayTier,
      approvalStatus: "not_submitted",
    },
  });

  return Response.json({ ok: true, prize: data, inventory });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:prizes", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const prizeId = text(body?.prizeId, 80);
  if (!prizeId) return Response.json({ error: "prizeId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: existingPrize, error: fetchError } = await supabase
    .from("draw_round_prizes")
    .select("id,draw_round_id,card_id,tier,rank")
    .eq("id", prizeId)
    .single();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 409 });

  const reviewReset = await markCampaignNeedsOwnerReview(
    supabase,
    existingPrize.draw_round_id,
    admin,
    "Prize was removed from the pool. Owner review is required before publish.",
  );
  if (reviewReset) return reviewReset;

  await supabase
    .from("draw_round_prize_units")
    .update({ status: "void", voided_at: new Date().toISOString(), metadata: { reason: "admin_prize_deleted", voidedByAdminId: admin.adminId } })
    .eq("draw_round_prize_id", prizeId)
    .eq("status", "available");

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .update({
      planned_quantity: 0,
      metadata: {
        adminHidden: true,
        hiddenByAdminId: admin.adminId,
        hiddenAt: new Date().toISOString(),
      },
    })
    .eq("id", prizeId)
    .select("id,draw_round_id,card_id,tier,rank")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_prize_deleted",
    draw_round_id: data.draw_round_id,
    metadata: { prizeId: data.id, cardId: data.card_id, tier: data.tier, rank: data.rank, approvalStatus: "not_submitted" },
  });

  return Response.json({ ok: true });
}
