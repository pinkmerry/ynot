import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { getAdminCards } from "@/features/ynot/data";
import { prizeCategoryValue } from "@/features/ynot/prize-category";
import {
  cardConditionValue,
  cardGradeOptions,
  catalogCategoryValue,
  gradingServiceValue,
  releaseYearValue,
} from "@/features/ynot/card-catalog-metadata";

export const dynamic = "force-dynamic";

// Admin catalog cards (with stock + sub-SKU groups) for client-side fetching.
// The pack editor loads this in its own request so getAdminCards' stock RPCs do
// not share a Cloudflare Worker subrequest budget with the heavy prize-lineup
// dashboard slice (which would otherwise starve them and empty the catalog).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:cards-list",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;
  const cards = await getAdminCards();
  return Response.json({ cards });
}

const adminCardMutationRateLimit = { limit: 180, windowMs: 60_000 };

type CardBody = {
  cardId?: unknown;
  modelCode?: unknown;
  code?: unknown;
  cardNumber?: unknown;
  name?: unknown;
  series?: unknown;
  grade?: unknown;
  language?: unknown;
  releaseYear?: unknown;
  cardSet?: unknown;
  variant?: unknown;
  printLabel?: unknown;
  catalogCategory?: unknown;
  condition?: unknown;
  gradingService?: unknown;
  certNumber?: unknown;
  gemrateId?: unknown;
  prizeCategory?: unknown;
  imageUrl?: unknown;
  imageStoragePath?: unknown;
  confirmOverwrite?: unknown;
  isTest?: unknown;
  assetSource?: unknown;
  assetLicense?: unknown;
  assetManifestKey?: unknown;
  seedRunId?: unknown;
};

type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];
type CardUpdate = Database["public"]["Tables"]["cards"]["Update"];

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cardCode(value: unknown) {
  // Keep "/" so Pokemon-style codes like "110/080" survive (card# / set total).
  // The sub-SKU key/SKU stays slash-free because normalizeSkuPart compacts it.
  const clean = text(value, 48)
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return clean || null;
}

function searchName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, " ").replace(/\s+/g, " ").trim() || "card";
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function hasPayloadValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function gradeValue(value: unknown) {
  const clean = text(value, 80);
  return clean || "Ungraded";
}

function isSealedMainSkuCategory(category: unknown) {
  const catalogCategory = catalogCategoryValue(category);
  return catalogCategory === "boxes" || catalogCategory === "packs";
}

function sealedMainSkuNameRequiredMessage(category: unknown) {
  return catalogCategoryValue(category) === "packs"
    ? "Pack name is required."
    : "Box name is required.";
}

function isAllowedSealedProductSeries(value: unknown) {
  const clean = text(value, 80).toLowerCase().replace(/[_-]+/g, " ");
  return clean === "pokemon" || clean === "one piece";
}

function validateCardBody(body: CardBody) {
  const grade = text(body.grade, 80);
  if (
    grade &&
    grade !== "Ungraded" &&
    !cardGradeOptions.includes(grade as (typeof cardGradeOptions)[number])
  ) {
    return "Grade must use one of the configured PSA dropdown options.";
  }
  if (hasPayloadValue(body.releaseYear) && releaseYearValue(body.releaseYear) === null) {
    return "Release year must be a valid year.";
  }
  if (
    hasPayloadValue(body.catalogCategory) &&
    (typeof body.catalogCategory !== "string" || !body.catalogCategory.trim())
  ) {
    return "Catalog category is required.";
  }
  if (isSealedMainSkuCategory(body.catalogCategory)) {
    if (!hasPayloadValue(body.name)) {
      return sealedMainSkuNameRequiredMessage(body.catalogCategory);
    }
    if (!isAllowedSealedProductSeries(body.series)) {
      return "Series must be Pokemon or One Piece for sealed Main SKUs.";
    }
  }
  if (
    hasPayloadValue(body.condition) &&
    cardConditionValue(body.condition) !== body.condition
  ) {
    return "Condition must be Sealed, Raw, or Graded.";
  }
  if (
    hasPayloadValue(body.gradingService) &&
    !gradingServiceValue(body.gradingService)
  ) {
    return "Grading service must be PSA, BGS, CGC, or Other.";
  }
  return null;
}

type CardDuplicateRow = Pick<
  Database["public"]["Tables"]["cards"]["Row"],
  "id" | "name" | "card_code" | "series" | "grade" | "image_url" | "image_storage_path"
>;

type CardUsageSummary = {
  stockTotal: number;
  stockAvailable: number;
  stockReserved: number;
  stockAllocated: number;
  prizeAssignmentCount: number;
};

function duplicateCardPayload(card: CardDuplicateRow) {
  return {
    id: card.id,
    name: card.name,
    code: card.card_code,
    modelCode: card.card_code,
    series: card.series,
    grade: card.grade,
    imageUrl: card.image_url,
    imageStoragePath: card.image_storage_path,
  };
}

function assertApprovedTestAsset(body: CardBody) {
  if (!booleanValue(body.isTest)) return null;
  const imageUrl = text(body.imageUrl, 1000);
  const manifestKey = text(body.assetManifestKey, 160);
  const source = text(body.assetSource, 300);
  const license = text(body.assetLicense, 160);
  if (!manifestKey || !source || !license) {
    return "Test cards require assetManifestKey, assetSource, and assetLicense so production test assets are auditable.";
  }
  if (/japan-toreca\\.com/i.test(imageUrl) || /japan-toreca/i.test(source)) {
    return "Japan Toreca images are not approved for production test data. Use generated/original/licensed assets only.";
  }
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/test-assets/")) return null;
  try {
    const parsed = new URL(imageUrl);
    const allowedHost =
      parsed.hostname.endsWith(".supabase.co") ||
      ["ynotopen.com", "www.ynotopen.com", "localhost"].includes(parsed.hostname);
    return allowedHost ? null : "External test-card image hosts are blocked unless copied to approved storage or /test-assets/ with manifest evidence.";
  } catch {
    return "Test-card image URL must be a /test-assets/ path or approved HTTPS storage URL.";
  }
}

async function bodyJson(request: Request): Promise<CardBody | null> {
  return request.json().catch(() => null) as Promise<CardBody | null>;
}

function cardPatch(
  body: CardBody,
  options: { partial?: boolean } = {},
): CardUpdate {
  const partial = options.partial === true;
  const patch: CardUpdate = {};
  if (!partial || body.modelCode !== undefined || body.code !== undefined) {
    const code = cardCode(body.modelCode ?? body.code);
    patch.card_code = code;
    patch.search_code = code?.toLowerCase() ?? null;
  }
  if (!partial || body.cardNumber !== undefined) {
    patch.card_number = text(body.cardNumber, 80) || null;
  }
  if (!partial || body.name !== undefined) {
    const name = text(body.name) || "Untitled Card";
    patch.name = name;
    patch.search_name = searchName(name);
  }
  if (!partial || body.series !== undefined) {
    // Brand is free text; keep the two built-in brands as their legacy db
    // values and store any custom brand name verbatim.
    const brand = text(body.series, 80);
    patch.series =
      brand.toLowerCase() === "pokemon"
        ? "pokemon"
        : brand.toLowerCase() === "one piece"
          ? "one_piece"
          : brand || "pokemon";
  }
  if (!partial || body.grade !== undefined) {
    patch.grade = gradeValue(body.grade);
  }
  if (!partial || body.prizeCategory !== undefined) {
    patch.prize_category = prizeCategoryValue(body.prizeCategory);
  }
  if (!partial || body.imageUrl !== undefined) {
    patch.image_url = text(body.imageUrl, 1000) || null;
  }
  if (!partial || body.imageStoragePath !== undefined) {
    patch.image_storage_path = text(body.imageStoragePath, 1000) || null;
  }
  if (!options.partial || body.language !== undefined) {
    patch.language = text(body.language, 80) || null;
  }
  if (!options.partial || body.releaseYear !== undefined) {
    patch.release_year = releaseYearValue(body.releaseYear);
  }
  if (!options.partial || body.cardSet !== undefined) {
    patch.card_set = text(body.cardSet, 160) || null;
  }
  if (!options.partial || body.variant !== undefined) {
    patch.variant = text(body.variant, 160) || null;
  }
  if (!options.partial || body.printLabel !== undefined) {
    patch.print_label = text(body.printLabel, 160) || null;
  }
  if (!options.partial || body.catalogCategory !== undefined) {
    // Store the human label / custom name as-is; fulfilment logic canonicalizes
    // built-ins back to their slug when needed.
    patch.catalog_category = text(body.catalogCategory, 160) || "Single Cards";
  }
  if (!options.partial || body.condition !== undefined) {
    patch.condition = cardConditionValue(body.condition);
  }
  if (!options.partial || body.gradingService !== undefined) {
    patch.grading_service = gradingServiceValue(body.gradingService);
  }
  if (!options.partial || body.certNumber !== undefined) {
    patch.cert_number = text(body.certNumber, 120) || null;
  }
  if (!options.partial || body.gemrateId !== undefined) {
    patch.gemrate_id = text(body.gemrateId, 160) || null;
  }
  if (
    body.isTest !== undefined ||
    body.seedRunId !== undefined ||
    body.assetSource !== undefined ||
    body.assetLicense !== undefined ||
    body.assetManifestKey !== undefined
  ) {
    const isTest = booleanValue(body.isTest);
    patch.is_test = isTest;
    patch.seed_run_id = text(body.seedRunId, 80) || null;
    patch.asset_source = text(body.assetSource, 300) || null;
    patch.asset_license = text(body.assetLicense, 160) || null;
    patch.asset_manifest_key = text(body.assetManifestKey, 160) || null;
  }
  return patch;
}

async function cardUsageSummary(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  cardId: string,
): Promise<{ usage?: CardUsageSummary; error?: string }> {
  const { data: stockRows, error: stockError } = await supabase
    .from("card_stock_units")
    .select("status")
    .eq("card_id", cardId)
    .limit(50000);
  if (stockError) return { error: stockError.message };

  const { count: prizeAssignmentCount, error: prizeError } = await supabase
    .from("draw_round_prizes")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId);
  if (prizeError) return { error: prizeError.message };

  const usage: CardUsageSummary = {
    stockTotal: stockRows?.length ?? 0,
    stockAvailable: 0,
    stockReserved: 0,
    stockAllocated: 0,
    prizeAssignmentCount: prizeAssignmentCount ?? 0,
  };
  for (const row of stockRows ?? []) {
    if (row.status === "available") usage.stockAvailable += 1;
    if (row.status === "reserved") usage.stockReserved += 1;
    if (row.status === "allocated") usage.stockAllocated += 1;
  }
  return { usage };
}

async function duplicateCardResponse(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  card: CardDuplicateRow,
) {
  const { usage, error } = await cardUsageSummary(supabase, card.id);
  if (error) return Response.json({ error }, { status: 409 });
  const usageSummary =
    usage ??
    ({
      stockTotal: 0,
      stockAvailable: 0,
      stockReserved: 0,
      stockAllocated: 0,
      prizeAssignmentCount: 0,
    } satisfies CardUsageSummary);
  const hasUsage =
    usageSummary.stockTotal > 0 || usageSummary.prizeAssignmentCount > 0;
  return Response.json(
    {
      ok: false,
      code: "CARD_ALREADY_EXISTS",
      requiresConfirmation: true,
      matchedCard: duplicateCardPayload(card),
      usage: usageSummary,
      message: hasUsage
        ? "This card already exists and has inventory or pack usage. Confirm overwrite to update the existing catalog card while keeping inventory linked."
        : "This card already exists. Confirm overwrite to update the existing catalog card.",
    },
    { status: 409 },
  );
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", adminCardMutationRateLimit, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  const validationError = validateCardBody(body);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  const assetError = assertApprovedTestAsset(body);
  if (assetError) return Response.json({ error: assetError }, { status: 400 });

  const patch = cardPatch(body) as CardInsert;
  const supabase = createServiceSupabaseClient();
  // Duplicate product names / model codes are allowed (e.g. several box
  // variations under one model code), so every create inserts a NEW card. To
  // change an existing card, use "Edit card" (PATCH) which targets it by id.
  const { data, error } = await supabase
    .from("cards")
    .insert(patch)
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_saved", collection_item_id: null, metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", adminCardMutationRateLimit, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const cardId = text(body?.cardId, 80);
  if (!cardId) return Response.json({ error: "cardId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // Eligibility: refuse delete if the card is referenced by any active
  // prize row in a pack (deleting it would orphan the prize slot). The
  // UI also disables the button in that case but we re-check on the
  // server so a stale page can't bypass it.
  const { count: prizeCount, error: prizeError } = await supabase
    .from("draw_round_prizes")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId);
  if (prizeError) return Response.json({ error: prizeError.message }, { status: 409 });
  if ((prizeCount ?? 0) > 0) {
    return Response.json(
      {
        ok: false,
        code: "CARD_IN_PRIZE_POOL",
        error: `Cannot delete: ${prizeCount} pack prize slot${prizeCount === 1 ? "" : "s"} still reference this card.`,
        prizeCount,
      },
      { status: 409 },
    );
  }

  // Eligibility: refuse delete if any stock unit is still active
  // (available / reserved / allocated). Allocated units are owned by
  // a customer — deleting the card would orphan their collection row.
  const { data: stockRows, error: stockError } = await supabase
    .from("card_stock_units")
    .select("status")
    .eq("card_id", cardId)
    .limit(50000);
  if (stockError) return Response.json({ error: stockError.message }, { status: 409 });
  const activeStock = (stockRows ?? []).filter(
    (row) => row.status === "available" || row.status === "reserved" || row.status === "allocated",
  );
  if (activeStock.length > 0) {
    const breakdown = { available: 0, reserved: 0, allocated: 0 };
    for (const row of activeStock) {
      breakdown[row.status as keyof typeof breakdown] += 1;
    }
    return Response.json(
      {
        ok: false,
        code: "CARD_HAS_ACTIVE_STOCK",
        error: `Cannot delete: ${activeStock.length} active stock unit${activeStock.length === 1 ? "" : "s"} still exist (${breakdown.allocated} allocated to customers, ${breakdown.reserved} reserved, ${breakdown.available} available). Allocated units cannot be removed.`,
        activeStockCount: activeStock.length,
        breakdown,
      },
      { status: 409 },
    );
  }

  // Load the current card so the audit row carries identifying info
  // even after the row is gone.
  const { data: current, error: fetchError } = await supabase
    .from("cards")
    .select("id,name,card_code,series,is_test")
    .eq("id", cardId)
    .maybeSingle();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 409 });
  if (!current) return Response.json({ error: "Card not found." }, { status: 404 });

  const { error: deleteError } = await supabase.from("cards").delete().eq("id", cardId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_deleted",
    metadata: {
      cardId: current.id,
      code: current.card_code,
      name: current.name,
      series: current.series,
      isTest: current.is_test,
    },
  });
  return Response.json({ ok: true, cardId });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", adminCardMutationRateLimit, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const cardId = text(body?.cardId, 80);
  if (!body || !cardId) return Response.json({ error: "cardId is required." }, { status: 400 });
  const validationError = validateCardBody(body);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  const assetError = assertApprovedTestAsset(body);
  if (assetError) return Response.json({ error: assetError }, { status: 400 });

  const patch = cardPatch(body, { partial: true });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("cards").update(patch).eq("id", cardId).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_updated", metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}
