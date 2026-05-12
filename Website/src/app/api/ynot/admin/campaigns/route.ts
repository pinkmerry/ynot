import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import type { Database, Json } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  normalizePrizeDrafts,
  validatePrizeDraftsForSave,
  type PrizeDraftInput,
} from "@/features/ynot/prize-readiness";
import { normalizeOpenQuantityOptions } from "@/features/ynot/open-quantity";
import {
  isRandomPsa10PrizeCard,
  prizeCategoryValue,
} from "@/features/ynot/prize-category";
import {
  canPrizeDisplayTierUseRandomPsa10,
  prizeDisplayTierValue,
} from "@/features/ynot/prize-tier";

export const dynamic = "force-dynamic";

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
  totalSlots?: unknown;
  displayTags?: unknown;
  sortOrder?: unknown;
  categoryIds?: unknown;
  openQuantityOptions?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
  initialPrizes?: unknown;
};

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
): Json {
  const base = isRecord(current) ? current : { mode: "pure_random" };
  return {
    ...base,
    mode: typeof base.mode === "string" ? base.mode : "pure_random",
    openQuantityOptions: normalizeOpenQuantityOptions(openQuantityOptions),
  } as Json;
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

  return {
    slug: body.slug === undefined ? undefined : slugValue(body.slug),
    title_th: body.titleTh === undefined ? undefined : text(body.titleTh) || "แคมเปญใหม่",
    title_en: body.titleEn === undefined ? undefined : text(body.titleEn) || text(body.titleTh) || "New campaign",
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
  };
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
    .select("id,name,card_code,search_code,prize_category")
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
    return (
      prizeCategoryValue(metadata.prizeCategory) !==
      prizeCategoryValue(card.prize_category)
    );
  });
  if (mismatched) {
    throw new Error("One or more selected prize items do not match the selected prize category.");
  }
  const psa10TierMismatched = prizes.some((prize) => {
    const metadata = isRecord(prize.metadata) ? prize.metadata : {};
    const prizeCategory = prizeCategoryValue(metadata.prizeCategory);
    if (prizeCategory !== "psa10_card") return false;
    const card = cardsById.get(prize.cardId);
    if (!card) return true;
    const displayTier = prizeDraftDisplayTier(prize);
    const isRandomPsa10 = isRandomPsa10PrizeCard(card);
    return canPrizeDisplayTierUseRandomPsa10(displayTier)
      ? !isRandomPsa10
      : isRandomPsa10;
  });
  if (psa10TierMismatched) {
    throw new Error(
      "PSA10 prize item does not match the selected display tier. Bronze uses Random PSA10; Rainbow, Gold, and Silver use specific PSA10 cards.",
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
    prizes.map((prize) => ({
      draw_round_id: campaignId,
      card_id: prize.cardId,
      tier: prize.tier,
      rank: prize.rank,
      value_thb: prize.valueThb,
      weight: prize.weight,
      unlock_at_sold_pct: prize.unlockAtSoldPct,
      is_test: isTest,
      seed_run_id: seedRunId,
      metadata: prize.metadata ?? {},
    }));

  const { data, error } = await supabase
    .from("draw_round_prizes")
    .upsert(prizeRows, { onConflict: "draw_round_id,tier,rank" })
    .select("id,tier,rank");
  if (error) throw error;

  const prizeIdByKey = new Map(
    (data ?? []).map((prize) => [`${prize.tier}:${prize.rank}`, prize.id]),
  );
  for (const prize of prizes) {
    const prizeId = prizeIdByKey.get(`${prize.tier}:${prize.rank}`);
    if (!prizeId) throw new Error("Prize inventory could not be linked.");
    const { error: unitError } = await supabase.rpc(
      "ensure_draw_round_prize_units",
      {
        p_draw_round_prize_id: prizeId,
        p_total_units: prize.quantity,
        p_admin_id: adminId,
        p_seed_run_id: seedRunId,
      },
    );
    if (unitError) throw unitError;
  }
}

async function bodyJson(request: Request): Promise<CampaignBody | null> {
  return request.json().catch(() => null) as Promise<CampaignBody | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch = campaignPatch(body);
  const requestedPublish = isDirectPublishPatch(patch);
  const insert: Database["public"]["Tables"]["draw_rounds"]["Insert"] = {
    slug: slugValue(body.slug),
    title_th: text(body.titleTh) || "แคมเปญใหม่",
    title_en: text(body.titleEn) || text(body.titleTh) || "New campaign",
    series: patch.series ?? "pokemon",
    status: "draft",
    visibility: "private",
    mode: patch.mode ?? "instant_gacha",
    price_thb: patch.price_thb ?? 100,
    cost_coins: patch.cost_coins ?? 1,
    total_slots: patch.total_slots ?? 100,
    display_tags: patch.display_tags ?? displayTagsValue(body.displayTags, patch.series ?? "pokemon"),
    sort_order: patch.sort_order ?? 100,
    order_code_prefix: "YN",
    created_by: admin.adminId,
    is_test: patch.is_test ?? false,
    seed_run_id: patch.seed_run_id ?? null,
    logic_snapshot: logicSnapshotWithOpenOptions(
      { mode: "pure_random" },
      body.openQuantityOptions,
    ),
  };
  const initialPrizes = initialPrizesForAdminRole(
    normalizePrizeDrafts(body.initialPrizes),
    admin.adminRole,
  );
  const prizeValidation = validatePrizeDraftsForSave(
    initialPrizes,
    insert.total_slots,
  );
  if (!prizeValidation.ready) {
    return Response.json(
      {
        error: prizeValidation.blockers[0],
        blockers: prizeValidation.blockers,
      },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("draw_rounds").insert(insert).select("id,slug").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

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
    return Response.json(
      {
        error:
          setupError instanceof Error
            ? setupError.message
            : "Campaign prize setup failed.",
      },
      { status: 409 },
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
  return Response.json({ ok: true, campaign: data, prizeValidation });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const campaignId = text(body?.campaignId, 80);
  if (!body || !campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });

  const patch = campaignPatch(body);
  if (isDirectPublishPatch(patch)) {
    return Response.json({ error: publishAttemptMessage() }, { status: 409 });
  }
  const supabase = createServiceSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("draw_rounds")
    .select("id,status,logic_snapshot")
    .eq("id", campaignId)
    .single();
  if (currentError) return Response.json({ error: currentError.message }, { status: 409 });
  if (current.status !== "draft") {
    return Response.json(
      { error: "Random pack settings can only be changed while the pack is draft/private." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const reviewPatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
    ...patch,
    ...(body.openQuantityOptions === undefined
      ? {}
      : {
          logic_snapshot: logicSnapshotWithOpenOptions(
            current.logic_snapshot,
            body.openQuantityOptions,
          ),
        }),
    approval_status: "pending_review",
    approval_requested_by: admin.adminId,
    approval_requested_at: now,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    approval_notes: "Campaign settings changed. Owner review is required before publish.",
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
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (body.categoryIds !== undefined) {
    try {
      await replaceCampaignCategories(supabase, campaignId, idArrayValue(body.categoryIds));
    } catch (categoryError) {
      return Response.json({ error: categoryError instanceof Error ? categoryError.message : "Campaign category assignment failed." }, { status: 409 });
    }
  }
  if (reviewPatch.total_slots) await supabase.rpc("create_draw_slots", { p_draw_round_id: campaignId });
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_updated",
    draw_round_id: campaignId,
    metadata: { patch: reviewPatch, approvalStatus: "pending_review" },
  });
  return Response.json({
    ok: true,
    approvalStatus: "pending_review",
    status: "draft",
    visibility: "private",
  });
}
