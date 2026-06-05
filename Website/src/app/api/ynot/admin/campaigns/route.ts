import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isMissingColumnError,
  isMissingFunctionError,
} from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  getPrizeStockSummaries,
  normalizePrizeDrafts,
  validatePrizeDraftsForSave,
  type PrizeDraftInput,
} from "@/features/ynot/prize-readiness";
import { normalizeOpenQuantityOptions } from "@/features/ynot/open-quantity";
import {
  catalogCategoryForPrizeCategory,
  isRandomPsa10PrizeCard,
  prizeCategoryForCatalogCategory,
  prizeCategoryLabel,
  prizeSourceType,
} from "@/features/ynot/prize-category";
import {
  catalogCategoryLabel,
  catalogCategoryValue,
} from "@/features/ynot/card-catalog-metadata";
import { normalizeBundleQuantity } from "@/features/ynot/bundle-quantity";
import {
  canPrizeDisplayTierUseRandomPsa10,
  prizeDisplayTierValue,
} from "@/features/ynot/prize-tier";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

const campaignBannerBucketName = "lucky-draw-assets";
const campaignBannerPathPattern =
  /^campaign-banners\/\d{4}-\d{2}-\d{2}\/\d+-[0-9a-f-]{36}-[a-z0-9._-]+\.(jpg|png|webp)$/;

type CampaignBody = {
  campaignId?: unknown;
  slug?: unknown;
  titleTh?: unknown;
  titleEn?: unknown;
  series?: unknown;
  status?: unknown;
  visibility?: unknown;
  mode?: unknown;
  priceThb?: unknown;
  costCoins?: unknown;
  bannerImageUrl?: unknown;
  bannerImageStoragePath?: unknown;
  totalSlots?: unknown;
  displayTags?: unknown;
  sortOrder?: unknown;
  categoryIds?: unknown;
  openQuantityOptions?: unknown;
  bundleConfig?: unknown;
  slotGrid?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
  convertDeadlineDays?: unknown;
  initialPrizes?: unknown;
  lastPrizeCardId?: unknown;
  lastPrizeMetadata?: unknown;
};

function convertDeadlineValue(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(3650, parsed);
}

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugValue(value: unknown) {
  const slug = text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `campaign-${Date.now().toString(36)}`;
}

function campaignTitleValues(body: CampaignBody) {
  const titleTh = text(body.titleTh);
  const titleEn = text(body.titleEn);
  const fallback = titleTh || titleEn;
  return {
    titleTh: titleTh || fallback,
    titleEn: titleEn || fallback,
  };
}

function validateCampaignTitle(body: CampaignBody, required: boolean) {
  const hasTitleInput =
    body.titleTh !== undefined || body.titleEn !== undefined;
  if (!required && !hasTitleInput) return null;
  const { titleTh, titleEn } = campaignTitleValues(body);
  if (!titleTh && !titleEn) {
    return "Thai title or English title is required.";
  }
  return null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function displayTagsValue(value: unknown, series: "one_piece" | "pokemon") {
  const fallback = series === "pokemon" ? ["PSA10", "New Exclusive"] : ["Manga", "New Exclusive"];
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : fallback;
  const tags = source
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => text(tag, 28))
    .filter(Boolean)
    .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 4);
  return tags.length ? tags : fallback;
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

function prizeDraftDisplayTier(prize: PrizeDraftInput) {
  const displayTier = metadataString(prize.metadata, "displayTier");
  if (displayTier) return prizeDisplayTierValue(displayTier);
  const displayGroup = metadataString(prize.metadata, "displayGroup");
  if (displayGroup) return prizeDisplayTierValue(displayGroup);
  if (prize.tier === "high" && prize.rank <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  return "bronze";
}

function logicSnapshotWithOpenOptions(
  current: unknown,
  openQuantityOptions: unknown,
  extras?: { bundleConfig?: unknown; slotGrid?: unknown },
): Json {
  const base = isRecord(current) ? current : { mode: "pure_random" };
  const snapshot: Record<string, unknown> = {
    ...base,
    mode: typeof base.mode === "string" ? base.mode : "pure_random",
    openQuantityOptions: normalizeOpenQuantityOptions(openQuantityOptions),
  };
  if (extras?.bundleConfig !== undefined) {
    snapshot.bundleConfig = Array.isArray(extras.bundleConfig)
      ? extras.bundleConfig
      : isRecord(extras.bundleConfig)
      ? extras.bundleConfig
      : base.bundleConfig;
  }
  if (extras?.slotGrid !== undefined) {
    snapshot.slotGrid = isRecord(extras.slotGrid)
      ? extras.slotGrid
      : base.slotGrid;
  }
  return snapshot as Json;
}

function idArrayValue(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return source
    .filter((item): item is string => typeof item === "string")
    .map((item) => text(item, 80))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 8);
}

function campaignPatch(body: CampaignBody): Database["public"]["Tables"]["draw_rounds"]["Update"] {
  const priceThb = Math.max(1, Math.round(numberValue(body.priceThb, 100)));
  const totalSlots = Math.max(1, Math.round(numberValue(body.totalSlots, 100)));
  const costCoins = Math.max(1, Math.round(numberValue(body.costCoins, Math.ceil(priceThb / 100))));
  const series = body.series === undefined ? undefined : enumValue(body.series, ["one_piece", "pokemon"] as const, "pokemon");
  const titles = campaignTitleValues(body);

  return {
    slug: body.slug === undefined ? undefined : slugValue(body.slug),
    title_th: body.titleTh === undefined ? undefined : titles.titleTh,
    title_en: body.titleEn === undefined ? undefined : titles.titleEn,
    series,
    status: body.status === undefined ? undefined : enumValue(body.status, ["draft", "live", "closed", "archived"] as const, "draft"),
    visibility: body.visibility === undefined ? undefined : enumValue(body.visibility, ["public", "hidden", "private"] as const, "private"),
    mode: body.mode === undefined ? undefined : enumValue(body.mode, ["slot_pick", "instant_gacha"] as const, "instant_gacha"),
    price_thb: body.priceThb === undefined ? undefined : priceThb,
    cost_coins: body.costCoins === undefined ? undefined : costCoins,
    total_slots: body.totalSlots === undefined ? undefined : totalSlots,
    display_tags: body.displayTags === undefined ? undefined : displayTagsValue(body.displayTags, series ?? "pokemon"),
    sort_order: body.sortOrder === undefined ? undefined : Math.round(numberValue(body.sortOrder, 100)),
    is_test: body.isTest === undefined ? undefined : booleanValue(body.isTest),
    seed_run_id: body.seedRunId === undefined ? undefined : text(body.seedRunId, 80) || null,
    convert_deadline_days: convertDeadlineValue(body.convertDeadlineDays),
    last_prize_card_id:
      body.lastPrizeCardId === undefined
        ? undefined
        : text(body.lastPrizeCardId, 80) || null,
    last_prize_metadata:
      body.lastPrizeMetadata === undefined
        ? undefined
        : isRecord(body.lastPrizeMetadata)
          ? (body.lastPrizeMetadata as Json)
          : null,
  };
}

function lastPrizeNormalPrizeTarget(
  totalSlots: number,
  lastPrizeCardId?: string | null,
) {
  const normalizedTotalSlots = Math.max(1, Math.round(Number(totalSlots) || 1));
  return Math.max(0, normalizedTotalSlots - (lastPrizeCardId ? 1 : 0));
}

function nextLastPrizeCardId(
  patch: Database["public"]["Tables"]["draw_rounds"]["Update"],
  currentLastPrizeCardId?: string | null,
) {
  if (patch.last_prize_card_id !== undefined) {
    return patch.last_prize_card_id ?? null;
  }
  return currentLastPrizeCardId ?? null;
}

function publishAttemptMessage() {
  return "Direct live/public publish is locked. Submit the random pack for owner review, then publish from the owner approval queue.";
}

function isDirectPublishPatch(
  patch: Database["public"]["Tables"]["draw_rounds"]["Update"],
) {
  return (
    patch.status === "live" ||
    patch.visibility === "public"
  );
}

type CampaignBannerImagePatchResult =
  | {
      ok: true;
      patch: Pick<
        Database["public"]["Tables"]["draw_rounds"]["Update"],
        "banner_image_url" | "banner_image_storage_path"
      >;
    }
  | { ok: false; response: Response };

async function verifyUploadedCampaignBannerImage(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  requestedPath: string,
) {
  const slashIndex = requestedPath.lastIndexOf("/");
  const folder = requestedPath.slice(0, slashIndex);
  const fileName = requestedPath.slice(slashIndex + 1);
  const { data, error } = await supabase.storage
    .from(campaignBannerBucketName)
    .list(folder, { limit: 1, search: fileName });

  if (error) {
    return {
      ok: false as const,
      response: adminErrorResponse(
        "CAMPAIGN_BANNER_STORAGE_VERIFY_FAILED",
        "Could not verify the uploaded pack banner image.",
        500,
        { detail: error.message },
      ),
    };
  }

  const exists = (data ?? []).some((item) => item.name === fileName);
  if (!exists) {
    return {
      ok: false as const,
      response: adminErrorResponse(
        "CAMPAIGN_BANNER_UPLOAD_NOT_FOUND",
        "Pack banner image upload was not found. Upload it again before saving.",
        400,
      ),
    };
  }

  return { ok: true as const };
}

async function campaignBannerImagePatch(
  body: CampaignBody,
  supabase: ReturnType<typeof createServiceSupabaseClient>,
): Promise<CampaignBannerImagePatchResult> {
  if (
    body.bannerImageUrl === undefined &&
    body.bannerImageStoragePath === undefined
  ) {
    return { ok: true, patch: {} };
  }

  const requestedPath = text(body.bannerImageStoragePath, 1000);
  const requestedUrl = text(body.bannerImageUrl, 1000);
  if (!requestedPath && !requestedUrl) {
    return {
      ok: true,
      patch: {
        banner_image_url: null,
        banner_image_storage_path: null,
      },
    };
  }

  if (!requestedPath) {
    return {
      ok: false,
      response: adminErrorResponse(
        "CAMPAIGN_BANNER_STORAGE_PATH_REQUIRED",
        "Pack banner image must be uploaded before it can be saved.",
        400,
      ),
    };
  }

  if (!campaignBannerPathPattern.test(requestedPath)) {
    return {
      ok: false,
      response: adminErrorResponse(
        "CAMPAIGN_BANNER_STORAGE_PATH_INVALID",
        "Pack banner image must come from the admin banner upload flow.",
        400,
      ),
    };
  }

  const verifiedUpload = await verifyUploadedCampaignBannerImage(
    supabase,
    requestedPath,
  );
  if (!verifiedUpload.ok) return verifiedUpload;

  const { data } = supabase.storage
    .from(campaignBannerBucketName)
    .getPublicUrl(requestedPath);

  if (requestedUrl && requestedUrl !== data.publicUrl) {
    return {
      ok: false,
      response: adminErrorResponse(
        "CAMPAIGN_BANNER_URL_INVALID",
        "Pack banner URL does not match the uploaded storage object.",
        400,
      ),
    };
  }

  return {
    ok: true,
    patch: {
      banner_image_url: data.publicUrl,
      banner_image_storage_path: requestedPath,
    },
  };
}

function initialPrizesForAdminRole(
  prizes: PrizeDraftInput[],
  adminRole: "owner" | "admin" | "staff",
) {
  if (adminRole === "owner") return prizes;
  return prizes.map((prize) => ({
    ...prize,
    valueThb: null,
    weight: 1,
    unlockAtSoldPct: 0,
  }));
}

async function replaceCampaignCategories(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  categoryIds: string[],
) {
  const rows: Database["public"]["Tables"]["draw_round_categories"]["Insert"][] = categoryIds.map((categoryId, index) => ({
    draw_round_id: campaignId,
    category_id: categoryId,
    is_primary: index === 0,
  }));
  const { error: deleteError } = await supabase.from("draw_round_categories").delete().eq("draw_round_id", campaignId);
  if (deleteError) throw deleteError;
  if (!rows.length) return;
  const { error: insertError } = await supabase.from("draw_round_categories").insert(rows);
  if (insertError) throw insertError;
}

async function cleanupCreatedCampaign(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
) {
  await supabase.from("draw_round_prize_units").delete().eq("draw_round_id", campaignId);
  await supabase.from("draw_round_prizes").delete().eq("draw_round_id", campaignId);
  await supabase.from("draw_round_categories").delete().eq("draw_round_id", campaignId);
  await supabase.from("draw_slots").delete().eq("draw_round_id", campaignId);
  await supabase.from("draw_rounds").delete().eq("id", campaignId);
}

async function assertPrizeCardsExist(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  prizes: PrizeDraftInput[],
) {
  const cardIds = [...new Set(prizes.map((prize) => prize.cardId))];
  const { data, error } = await supabase
    .from("cards")
    .select("id,name,card_code,search_code,prize_category,catalog_category")
    .in("id", cardIds);
  if (error) throw error;
  const cardsById = new Map((data ?? []).map((card) => [card.id, card]));
  const existing = new Set(cardsById.keys());
  const missing = cardIds.filter((cardId) => !existing.has(cardId));
  if (missing.length) {
    throw new Error("One or more selected prize cards no longer exist.");
  }
  const mismatched = prizes.some((prize) => {
    const card = cardsById.get(prize.cardId);
    if (!card) return true;
    const metadata = isRecord(prize.metadata) ? prize.metadata : {};
    const selectedCatalogCategory = catalogCategoryValue(
      metadata.catalogCategory,
      catalogCategoryForPrizeCategory(metadata.prizeCategory),
    );
    const cardCatalogCategory = catalogCategoryValue(
      card.catalog_category,
      catalogCategoryForPrizeCategory(card.prize_category),
    );
    return selectedCatalogCategory !== cardCatalogCategory;
  });
  if (mismatched) {
    throw new Error("One or more selected prize items do not match the selected sub-category.");
  }
  const randomPsa10TierMismatched = prizes.some((prize) => {
    const metadata = isRecord(prize.metadata) ? prize.metadata : {};
    const catalogCategory = catalogCategoryValue(
      metadata.catalogCategory,
      catalogCategoryForPrizeCategory(metadata.prizeCategory),
    );
    const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
    if (prizeCategory !== "psa10_card") return false;
    const card = cardsById.get(prize.cardId);
    if (!card) return true;
    const displayTier = prizeDraftDisplayTier(prize);
    const isRandomPsa10 = isRandomPsa10PrizeCard(card);
    return isRandomPsa10 && !canPrizeDisplayTierUseRandomPsa10(displayTier);
  });
  if (randomPsa10TierMismatched) {
    throw new Error(
      "Random PSA10 can only be used on Bronze. Specific catalog prize items can be used on any tier.",
    );
  }
}

async function saveInitialPrizes(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  adminId: string,
  prizes: PrizeDraftInput[],
  isTest: boolean,
  seedRunId: string | null,
) {
  await assertPrizeCardsExist(supabase, prizes);
  const prizeRows: Database["public"]["Tables"]["draw_round_prizes"]["Insert"][] =
    prizes.map((prize) => {
      const metadata = isRecord(prize.metadata) ? prize.metadata : {};
      const catalogCategory = catalogCategoryValue(
        metadata.catalogCategory,
        catalogCategoryForPrizeCategory(metadata.prizeCategory),
      );
      const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
      return {
        draw_round_id: campaignId,
        card_id: prize.cardId,
        tier: prize.tier,
        rank: prize.rank,
        value_thb: prize.valueThb,
        convert_coin_value: prize.convertCoinValue,
        weight: prize.weight,
        unlock_at_sold_pct: prize.unlockAtSoldPct,
        planned_quantity: prize.quantity,
        bundle_quantity: normalizeBundleQuantity(prize.bundleQuantity),
        is_test: isTest,
        seed_run_id: seedRunId,
        metadata: {
          ...metadata,
          catalogCategory,
          catalogCategoryLabel: catalogCategoryLabel(catalogCategory),
          prizeCategory,
          prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
          sourceType: prizeSourceType(prizeCategory),
          plannedByAdminId: adminId,
        } as Json,
      };
    });

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .upsert(prizeRows, { onConflict: "draw_round_id,tier,rank" })
    .select("id,tier,rank");
  if (error) throw error;

  if ((data ?? []).length !== prizes.length) {
    throw new Error("Prize inventory could not be linked.");
  }
}

// Build the prize rows passed to edit_live_campaign_inventory. Mirrors
// saveInitialPrizes' metadata computation but emits the camelCase shape the RPC
// reads via jsonb_to_recordset.
function liveEditPrizeRpcRows(
  prizes: PrizeDraftInput[],
  adminId: string,
  isTest: boolean,
  seedRunId: string | null,
) {
  return prizes.map((prize) => {
    const metadata = isRecord(prize.metadata) ? prize.metadata : {};
    const catalogCategory = catalogCategoryValue(
      metadata.catalogCategory,
      catalogCategoryForPrizeCategory(metadata.prizeCategory),
    );
    const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
    return {
      cardId: prize.cardId,
      tier: prize.tier,
      rank: prize.rank,
      valueThb: prize.valueThb,
      convertCoinValue: prize.convertCoinValue,
      weight: prize.weight,
      unlockAtSoldPct: prize.unlockAtSoldPct,
      plannedQuantity: prize.quantity,
      "bundleQuantity": normalizeBundleQuantity(prize.bundleQuantity),
      isTest,
      seedRunId,
      metadata: {
        ...metadata,
        catalogCategory,
        catalogCategoryLabel: catalogCategoryLabel(catalogCategory),
        prizeCategory,
        prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
        sourceType: prizeSourceType(prizeCategory),
        plannedByAdminId: adminId,
      },
    };
  });
}

function liveCampaignEditErrorMessage(message?: string) {
  if (!message) return "Live pack could not be updated.";
  if (message.includes("campaign_not_live_editable"))
    return "This pack is not live, so it cannot be edited in place.";
  if (message.includes("prize_has_awarded_units"))
    return "A prize you removed already has awarded units — hide it instead of removing it.";
  if (message.includes("cannot_reduce_below_awarded"))
    return "You cannot set a prize quantity below the number already awarded to customers.";
  if (message.includes("prize_identity_locked_after_award"))
    return "You cannot change a prize's card or sub-SKU after units have been awarded.";
  if (message.includes("cannot_reduce_slots_below_consumed"))
    return "You cannot reduce slots below the number already opened or awarded.";
  if (message.includes("insufficient_card_stock"))
    return "Not enough matching stock to materialize the new prize quantities.";
  if (message.includes("launch_prize_pool_required"))
    return "A live pack needs at least one prize unit in the pool.";
  return message;
}

async function bodyJson(request: Request): Promise<CampaignBody | null> {
  return request.json().catch(() => null) as Promise<CampaignBody | null>;
}

/**
 * Lightweight admin campaign list. Used by the storefront "+ Add new pack"
 * picker so admins can promote an existing draft / archived / closed pack
 * into a featured slot without leaving the storefront.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: true, campaigns: [] });
  }
  // Explicit dev-auth bypass mirrors the storefront shortcut without making
  // every non-production request an admin request by default.
  const isDev = isDevAuthAllowed();
  const admin = await resolveAdminSession();
  if (!admin && !isDev) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  if (admin) {
    const limited = await enforceRateLimit(
      request,
      "ynot:admin:campaigns-list",
      { limit: 60, windowMs: 60_000 },
      admin.profileId,
    );
    if (limited) return limited;
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("draw_rounds")
    .select(
      "id,slug,title_th,title_en,series,status,visibility,sort_order,cost_coins,total_slots,is_test",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    return adminErrorResponse(
      error.code ?? "CAMPAIGN_LIST_FAILED",
      error.message,
      500,
    );
  }
  return Response.json({
    ok: true,
    campaigns: (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      titleTh: row.title_th,
      titleEn: row.title_en,
      series: row.series,
      status: row.status,
      visibility: row.visibility,
      sortOrder: row.sort_order,
      costCoins: row.cost_coins,
      totalSlots: row.total_slots,
      isTest: row.is_test,
    })),
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) {
    return adminErrorResponse(
      "CAMPAIGN_INVALID_JSON",
      "Invalid JSON body.",
      400,
    );
  }
  const titleError = validateCampaignTitle(body, true);
  if (titleError) {
    return adminErrorResponse("CAMPAIGN_TITLE_REQUIRED", titleError, 400);
  }

  const patch = campaignPatch(body);
  const titles = campaignTitleValues(body);
  const requestedPublish = isDirectPublishPatch(patch);
  const supabase = createServiceSupabaseClient();
  const bannerPatch = await campaignBannerImagePatch(body, supabase);
  if (!bannerPatch.ok) return bannerPatch.response;
  const insert: Database["public"]["Tables"]["draw_rounds"]["Insert"] = {
    slug: slugValue(body.slug),
    title_th: titles.titleTh,
    title_en: titles.titleEn,
    series: patch.series ?? "pokemon",
    status: "draft",
    visibility: "private",
    mode: patch.mode ?? "instant_gacha",
    price_thb: patch.price_thb ?? 100,
    cost_coins: patch.cost_coins ?? 1,
    ...bannerPatch.patch,
    total_slots: patch.total_slots ?? 100,
    convert_deadline_days:
      patch.convert_deadline_days === undefined ? 14 : patch.convert_deadline_days,
    last_prize_card_id: patch.last_prize_card_id ?? null,
    last_prize_metadata: patch.last_prize_metadata ?? null,
    display_tags: patch.display_tags ?? displayTagsValue(body.displayTags, patch.series ?? "pokemon"),
    sort_order: patch.sort_order ?? 100,
    order_code_prefix: "YN",
    created_by: admin.adminId,
    is_test: patch.is_test ?? false,
    seed_run_id: patch.seed_run_id ?? null,
    logic_snapshot: logicSnapshotWithOpenOptions(
      { mode: "pure_random" },
      body.openQuantityOptions,
      { bundleConfig: body.bundleConfig, slotGrid: body.slotGrid },
    ),
  };
  const initialPrizes = initialPrizesForAdminRole(
    normalizePrizeDrafts(body.initialPrizes),
    admin.adminRole,
  );
  let prizeValidation: ReturnType<typeof validatePrizeDraftsForSave>;
  try {
    if (initialPrizes.length) await assertPrizeCardsExist(supabase, initialPrizes);
    const stockSummaries = await getPrizeStockSummaries(supabase, initialPrizes);
    prizeValidation = validatePrizeDraftsForSave(
      initialPrizes,
      lastPrizeNormalPrizeTarget(
        insert.total_slots,
        patch.last_prize_card_id ?? null,
      ),
      "pure_random",
      { stockSummaries },
    );
  } catch (prizeError) {
    return adminErrorResponse(
      "CAMPAIGN_PRIZE_INVALID",
      prizeError instanceof Error
        ? prizeError.message
        : "Prize inventory is not ready.",
      400,
    );
  }
  if (!prizeValidation.ready) {
    return adminErrorResponse(
      "CAMPAIGN_PRIZE_INVALID",
      prizeValidation.blockers[0] ?? "Prize inventory is not ready.",
      400,
      { blockers: prizeValidation.blockers },
    );
  }

  const { data, error } = await supabase.from("draw_rounds").insert(insert).select("id,slug").single();
  if (error) {
    return adminErrorResponse(
      error.code ?? "CAMPAIGN_CREATE_FAILED",
      error.message,
      409,
      { detail: error.details ?? null, hint: error.hint ?? null },
    );
  }

  try {
    if (body.categoryIds !== undefined) {
      await replaceCampaignCategories(supabase, data.id, idArrayValue(body.categoryIds));
    }
    const { error: slotError } = await supabase.rpc("create_draw_slots", { p_draw_round_id: data.id });
    if (slotError) throw slotError;
    await saveInitialPrizes(
      supabase,
      data.id,
      admin.adminId,
      initialPrizes,
      insert.is_test ?? false,
      insert.seed_run_id ?? null,
    );
  } catch (setupError) {
    await cleanupCreatedCampaign(supabase, data.id);
    return adminErrorResponse(
      "CAMPAIGN_PRIZE_SETUP_FAILED",
      setupError instanceof Error
        ? setupError.message
        : "Campaign prize setup failed.",
      409,
    );
  }
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_created",
    draw_round_id: data.id,
    metadata: {
      slug: data.slug,
      isTest: insert.is_test,
      requestedStatus: patch.status ?? null,
      requestedVisibility: patch.visibility ?? null,
      ownerReviewRequired: requestedPublish,
      initialPrizeRows: initialPrizes.length,
      initialPrizeUnits: prizeValidation.totalPrizeUnits,
    },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, campaign: data, prizeValidation });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const campaignId = text(body?.campaignId, 80);
  if (!body || !campaignId) {
    return adminErrorResponse(
      "CAMPAIGN_ID_REQUIRED",
      "campaignId is required.",
      400,
    );
  }
  const titleError = validateCampaignTitle(body, false);
  if (titleError) {
    return adminErrorResponse("CAMPAIGN_TITLE_REQUIRED", titleError, 400);
  }

  const patch = campaignPatch(body);
  if (isDirectPublishPatch(patch)) {
    return adminErrorResponse(
      "CAMPAIGN_DIRECT_PUBLISH_LOCKED",
      publishAttemptMessage(),
      409,
    );
  }
  const supabase = createServiceSupabaseClient();
  const bannerPatch = await campaignBannerImagePatch(body, supabase);
  if (!bannerPatch.ok) return bannerPatch.response;
  const { data: current, error: currentError } = await supabase
    .from("draw_rounds")
    .select("id,status,approval_status,logic_snapshot,total_slots,last_prize_card_id,last_prize_metadata")
    .eq("id", campaignId)
    .single();
  if (currentError) {
    return adminErrorResponse(
      currentError.code ?? "CAMPAIGN_LOAD_FAILED",
      currentError.message,
      409,
      {
        detail: currentError.details ?? null,
        hint: currentError.hint ?? null,
      },
    );
  }
  if (current.status === "live") {
    // In-place edit of a LIVE pack. Prize/slot changes go through the atomic
    // re-materialization RPC (which locks the round to serialize against opens);
    // cosmetic/scalar fields are applied with a normal update. total_slots is
    // owned by the RPC (= sum of planned quantities), never the form.
    const livePrizes = Array.isArray(body.initialPrizes)
      ? initialPrizesForAdminRole(
          normalizePrizeDrafts(body.initialPrizes),
          admin.adminRole,
        )
      : null;
    const preRpcLastPrizePatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {};
    if (patch.last_prize_card_id !== undefined) {
      preRpcLastPrizePatch.last_prize_card_id = patch.last_prize_card_id;
    }
    if (patch.last_prize_metadata !== undefined) {
      preRpcLastPrizePatch.last_prize_metadata = patch.last_prize_metadata;
    }
    const shouldPreApplyLastPrize =
      livePrizes !== null && Object.keys(preRpcLastPrizePatch).length > 0;
    if (livePrizes === null && Object.keys(preRpcLastPrizePatch).length > 0) {
      return adminErrorResponse(
        "CAMPAIGN_LAST_PRIZE_LIVE_EDIT_REQUIRES_PRIZES",
        "Last Prize live edits must include the prize rows so total slots can be rebalanced.",
        400,
      );
    }
    if (shouldPreApplyLastPrize) {
      const { error: lastPrizePreApplyError } = await supabase
        .from("draw_rounds")
        .update(preRpcLastPrizePatch)
        .eq("id", campaignId);
      if (lastPrizePreApplyError) {
        return adminErrorResponse(
          lastPrizePreApplyError.code ?? "CAMPAIGN_LAST_PRIZE_UPDATE_FAILED",
          lastPrizePreApplyError.message,
          409,
          {
            detail: lastPrizePreApplyError.details ?? null,
            hint: lastPrizePreApplyError.hint ?? null,
          },
        );
      }
    }
    if (livePrizes) {
      try {
        if (livePrizes.length) await assertPrizeCardsExist(supabase, livePrizes);
      } catch (prizeError) {
        return adminErrorResponse(
          "CAMPAIGN_PRIZE_INVALID",
          prizeError instanceof Error
            ? prizeError.message
            : "Prize inventory is not ready.",
          400,
        );
      }
      const { error: rpcError } = await supabase.rpc(
        "edit_live_campaign_inventory",
        {
          p_draw_round_id: campaignId,
          p_admin_id: admin.adminId,
          p_prizes: liveEditPrizeRpcRows(
            livePrizes,
            admin.adminId,
            Boolean(body.isTest),
            text(body.seedRunId, 80) || null,
          ),
        },
      );
      if (rpcError) {
        if (shouldPreApplyLastPrize) {
          await supabase
            .from("draw_rounds")
            .update({
              last_prize_card_id: current.last_prize_card_id,
              last_prize_metadata: current.last_prize_metadata,
            })
            .eq("id", campaignId);
        }
        return adminErrorResponse(
          rpcError.code ?? "LIVE_PACK_EDIT_FAILED",
          liveCampaignEditErrorMessage(rpcError.message),
          409,
          { detail: rpcError.details ?? null, hint: rpcError.hint ?? null },
        );
      }
    }
    const livePatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
      ...patch,
      ...bannerPatch.patch,
    };
    if (shouldPreApplyLastPrize) {
      delete livePatch.last_prize_card_id;
      delete livePatch.last_prize_metadata;
    }
    delete livePatch.total_slots;
    delete livePatch.status;
    delete livePatch.visibility;
    if (
      body.openQuantityOptions !== undefined ||
      body.bundleConfig !== undefined ||
      body.slotGrid !== undefined
    ) {
      livePatch.logic_snapshot = logicSnapshotWithOpenOptions(
        current.logic_snapshot,
        body.openQuantityOptions,
        {
          bundleConfig: (body as Record<string, unknown>).bundleConfig,
          slotGrid: (body as Record<string, unknown>).slotGrid,
        },
      );
    }
    if (Object.keys(livePatch).length) {
      const { error: updateError } = await supabase
        .from("draw_rounds")
        .update(livePatch)
        .eq("id", campaignId);
      if (updateError) {
        return adminErrorResponse(
          updateError.code ?? "CAMPAIGN_UPDATE_FAILED",
          updateError.message,
          409,
          { detail: updateError.details ?? null, hint: updateError.hint ?? null },
        );
      }
    }
    if (body.categoryIds !== undefined) {
      try {
        await replaceCampaignCategories(
          supabase,
          campaignId,
          idArrayValue(body.categoryIds),
        );
      } catch (categoryError) {
        return adminErrorResponse(
          "CAMPAIGN_CATEGORY_ASSIGNMENT_FAILED",
          categoryError instanceof Error
            ? categoryError.message
            : "Campaign category assignment failed.",
          409,
        );
      }
    }
    await supabase.from("audit_events").insert({
      actor_admin_id: admin.adminId,
      event_type: "campaign_updated_live",
      draw_round_id: campaignId,
      metadata: { live: true, replacedPrizes: Array.isArray(body.initialPrizes) },
    });
    revalidateTag("campaigns", "max");
    return Response.json({ ok: true, status: "live", visibility: "public" });
  }
  if (current.status !== "draft") {
    return adminErrorResponse(
      "CAMPAIGN_MUST_BE_DRAFT",
      "Random pack settings can only be changed while the pack is draft/private.",
      409,
    );
  }
  if (current.approval_status === "approved") {
    return adminErrorResponse(
      "CAMPAIGN_INVENTORY_LOCKED",
      "Approved pack inventory is locked. Archive it or create a new draft before changing settings.",
      409,
    );
  }
  const replacementPrizes = Array.isArray(body.initialPrizes)
    ? initialPrizesForAdminRole(
        normalizePrizeDrafts(body.initialPrizes),
        admin.adminRole,
      )
    : null;
  if (replacementPrizes) {
    try {
      if (replacementPrizes.length) {
        await assertPrizeCardsExist(supabase, replacementPrizes);
      }
      const stockSummaries = await getPrizeStockSummaries(
        supabase,
        replacementPrizes,
        {
          campaignId,
          includeCampaignReservations:
            current.approval_status === "pending_review",
        },
      );
      const prizeValidation = validatePrizeDraftsForSave(
        replacementPrizes,
        lastPrizeNormalPrizeTarget(
          patch.total_slots ?? current.total_slots,
          nextLastPrizeCardId(patch, current.last_prize_card_id),
        ),
        "pure_random",
        {
          includeReservedForCampaign:
            current.approval_status === "pending_review",
          stockSummaries,
        },
      );
      if (!prizeValidation.ready) {
        return adminErrorResponse(
          "CAMPAIGN_PRIZE_INVALID",
          prizeValidation.blockers[0] ?? "Prize inventory is not ready.",
          400,
          { blockers: prizeValidation.blockers },
        );
      }
    } catch (prizeError) {
      return adminErrorResponse(
        "CAMPAIGN_PRIZE_INVALID",
        prizeError instanceof Error
          ? prizeError.message
          : "Prize inventory is not ready.",
        400,
      );
    }
  }
  if (current.approval_status === "pending_review") {
    const { error: releaseError } = await supabase.rpc(
      "release_campaign_reservations",
      {
        p_draw_round_id: campaignId,
        p_admin_id: admin.adminId,
        p_reason: "settings_changed",
        p_note: "Campaign settings changed before owner approval.",
      },
    );
    if (
      releaseError &&
      !isMissingColumnError(releaseError) &&
      !isMissingFunctionError(releaseError, "release_campaign_reservations")
    ) {
      return adminErrorResponse(
        releaseError.code ?? "CAMPAIGN_RESERVATION_RELEASE_FAILED",
        releaseError.message,
        409,
        { detail: releaseError.details ?? null, hint: releaseError.hint ?? null },
      );
    }
  }

  const reviewPatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
    ...patch,
    ...bannerPatch.patch,
    ...(body.openQuantityOptions === undefined &&
    body.bundleConfig === undefined &&
    body.slotGrid === undefined
      ? {}
      : {
          logic_snapshot: logicSnapshotWithOpenOptions(
            current.logic_snapshot,
            body.openQuantityOptions,
            {
              bundleConfig: (body as Record<string, unknown>).bundleConfig,
              slotGrid: (body as Record<string, unknown>).slotGrid,
            },
          ),
        }),
    approval_status: "not_submitted",
    approval_requested_by: null,
    approval_requested_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    approval_notes: "Campaign settings changed. Submit owner review to reserve stock before publish.",
    status: "draft",
    visibility: "private",
  };
  let { error } = await supabase
    .from("draw_rounds")
    .update(reviewPatch)
    .eq("id", campaignId);
  if (error && isMissingColumnError(error)) {
    const legacyPatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
      ...patch,
      status: "draft",
      visibility: "private",
    };
    ({ error } = await supabase
      .from("draw_rounds")
      .update(legacyPatch)
      .eq("id", campaignId));
  }
  if (error) {
    return adminErrorResponse(
      error.code ?? "CAMPAIGN_UPDATE_FAILED",
      error.message,
      409,
      { detail: error.details ?? null, hint: error.hint ?? null },
    );
  }
  if (body.categoryIds !== undefined) {
    try {
      await replaceCampaignCategories(supabase, campaignId, idArrayValue(body.categoryIds));
    } catch (categoryError) {
      return adminErrorResponse(
        "CAMPAIGN_CATEGORY_ASSIGNMENT_FAILED",
        categoryError instanceof Error
          ? categoryError.message
          : "Campaign category assignment failed.",
        409,
      );
    }
  }
  if (reviewPatch.total_slots) await supabase.rpc("create_draw_slots", { p_draw_round_id: campaignId });

  // Replace prize list if caller supplied initialPrizes. Approval state is
  // already enforced above (must be draft / not approved), so it's safe to
  // delete + reinsert here without risking a published pack.
  if (replacementPrizes) {
    try {
      await supabase
        .from("draw_round_prize_units")
        .delete()
        .eq("draw_round_id", campaignId);
      await supabase
        .from("draw_round_prizes")
        .delete()
        .eq("draw_round_id", campaignId);
      if (replacementPrizes.length) {
        await saveInitialPrizes(
          supabase,
          campaignId,
          admin.adminId,
          replacementPrizes,
          Boolean(body.isTest),
          text(body.seedRunId, 80) || null,
        );
      }
    } catch (prizeError) {
      return adminErrorResponse(
        "CAMPAIGN_PRIZE_UPDATE_FAILED",
        prizeError instanceof Error
          ? prizeError.message
          : "Prize list could not be saved.",
        409,
      );
    }
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_updated",
    draw_round_id: campaignId,
    metadata: {
      patch: reviewPatch,
      approvalStatus: "not_submitted",
      replacedPrizes: Array.isArray(body.initialPrizes),
    },
  });
  revalidateTag("campaigns", "max");
  return Response.json({
    ok: true,
    approvalStatus: "not_submitted",
    status: "draft",
    visibility: "private",
  });
}
