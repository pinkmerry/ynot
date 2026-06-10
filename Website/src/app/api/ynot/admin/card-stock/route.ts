import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  isMissingFunctionError,
  randomPackSchemaMissingResponse,
} from "@/lib/supabase/schema-compat";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  cardStockErrorMap,
  mappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

type CardStockBody = {
  cardId?: unknown;
  quantityDelta?: unknown;
  reason?: unknown;
  sourceId?: unknown;
  // Unit-level identity (set when ADDING graded slabs / raw stock). Ignored
  // for negative deltas (archiving) — units to archive are picked by status.
  condition?: unknown;
  grade?: unknown;
  gradingService?: unknown;
  certNumber?: unknown;
  gemrateId?: unknown;
  imageUrl?: unknown;
  imageStoragePath?: unknown;
  stockUnitGroupKey?: unknown;
  stockSkuId?: unknown;
};

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const CONDITIONS = new Set(["sealed", "raw", "graded"]);
const GRADING_SERVICES = new Set(["psa", "bgs", "cgc", "other"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function groupKeyParts(groupKey: string) {
  const [condition = "", grade = "", gradingService = "", certNumber = "", gemrateId = ""] =
    groupKey.split("\u001f");
  return {
    condition: condition || "",
    grade,
    gradingService,
    certNumber,
    gemrateId,
  };
}

function quantityDelta(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed !== 0 && Math.abs(parsed) <= 10000
    ? parsed
    : null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:card-stock",
    { limit: 240, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as CardStockBody | null;
  const cardId = text(body?.cardId, 80);
  const delta = quantityDelta(body?.quantityDelta);
  if (!cardId || delta === null) {
    return Response.json(
      { error: "cardId and non-zero quantityDelta are required." },
      { status: 400 },
    );
  }

  const reason = text(body?.reason, 80) || "admin_adjustment";
  const sourceId = text(body?.sourceId, 120) || null;
  const requestedStockSkuId = text(body?.stockSkuId, 80);
  if (requestedStockSkuId && !UUID_PATTERN.test(requestedStockSkuId)) {
    return Response.json(
      { error: "Choose a valid Sub SKU before adjusting stock." },
      { status: 400 },
    );
  }
  const stockSkuId = requestedStockSkuId || null;
  const stockUnitGroupKey = text(body?.stockUnitGroupKey, 240);
  if (delta < 0 && !stockSkuId && !stockUnitGroupKey) {
    return Response.json(
      { error: "Choose a stock sub-SKU before removing stock." },
      { status: 400 },
    );
  }
  const removeGroup =
    delta < 0 && !stockSkuId ? groupKeyParts(stockUnitGroupKey) : null;
  if (removeGroup && !CONDITIONS.has(removeGroup.condition)) {
    return Response.json(
      { error: "The selected stock sub-SKU is invalid." },
      { status: 400 },
    );
  }

  // Positive deltas create units; negative deltas must target one sub-SKU.
  const conditionRaw = text(body?.condition, 16).toLowerCase();
  if (conditionRaw && !CONDITIONS.has(conditionRaw)) {
    return Response.json({ error: "Choose a valid condition." }, { status: 400 });
  }
  const condition =
    delta > 0
      ? conditionRaw || (stockSkuId ? null : "raw")
      : removeGroup?.condition ?? null;
  const gradingRaw = text(body?.gradingService, 16).toLowerCase();
  const gradingService =
    delta > 0
      ? GRADING_SERVICES.has(gradingRaw)
        ? gradingRaw
        : null
      : removeGroup?.condition === "graded"
        ? removeGroup.gradingService || null
        : null;
  const grade =
    delta > 0
      ? text(body?.grade, 40) || null
      : removeGroup?.condition === "graded"
        ? removeGroup.grade || null
        : null;
  const certNumber =
    delta > 0
      ? text(body?.certNumber, 60) || null
      : removeGroup?.condition === "graded"
        ? removeGroup.certNumber || null
        : null;
  const gemrateId =
    delta > 0
      ? text(body?.gemrateId, 60) || null
      : removeGroup?.condition === "graded"
        ? removeGroup.gemrateId || null
        : null;
  const imageUrl = delta > 0 ? text(body?.imageUrl, 600) || null : null;
  const imageStoragePath =
    delta > 0 ? text(body?.imageStoragePath, 400) || null : null;

  if (delta > 0 && condition === "graded" && (!grade || !gradingService)) {
    return Response.json(
      { error: "Choose a grade and grading service for graded stock." },
      { status: 400 },
    );
  }

  // A cert pins one physical slab; reject bulk-with-cert before hitting the RPC.
  if (certNumber && delta !== 1) {
    return Response.json(
      { error: "A cert number can only be attached to a single unit." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const rpcName = stockSkuId
    ? "adjust_stock_sku_units"
    : "adjust_card_stock_units";
  const adjustment = stockSkuId
    ? await supabase.rpc("adjust_stock_sku_units", {
        p_stock_sku_id: stockSkuId,
        p_quantity_delta: delta,
        p_admin_id: admin.adminId,
        p_source_type: reason,
        p_source_id: sourceId,
        p_metadata: {
          adjustedByAdminId: admin.adminId,
          reason,
          sourceId,
          stockSkuId,
          stockUnitGroupKey: stockUnitGroupKey || null,
        } satisfies Json,
        p_condition: condition,
        p_grade: grade,
        p_grading_service: gradingService,
        p_cert_number: certNumber,
        p_gemrate_id: gemrateId,
        p_image_url: imageUrl,
        p_image_storage_path: imageStoragePath,
      })
    : await supabase.rpc("adjust_card_stock_units", {
        p_card_id: cardId,
        p_quantity_delta: delta,
        p_admin_id: admin.adminId,
        p_source_type: reason,
        p_source_id: sourceId,
        p_metadata: {
          adjustedByAdminId: admin.adminId,
          reason,
          sourceId,
          stockUnitGroupKey: stockUnitGroupKey || null,
        } satisfies Json,
        p_condition: condition,
        p_grade: grade,
        p_grading_service: gradingService,
        p_cert_number: certNumber,
        p_gemrate_id: gemrateId,
        p_image_url: imageUrl,
        p_image_storage_path: imageStoragePath,
      });
  const { data, error } = adjustment;

  if (error) {
    if (isMissingFunctionError(error, rpcName)) {
      return randomPackSchemaMissingResponse();
    }
    return mappedAdminErrorResponse(error, cardStockErrorMap, {
      code: "CARD_STOCK_ADJUST_FAILED",
      error: "Global stock could not be adjusted.",
      status: 409,
    });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_stock_adjusted",
    metadata: {
      cardId,
      quantityDelta: delta,
      reason,
      sourceId,
      stockSkuId,
      stockUnitGroupKey: stockUnitGroupKey || null,
    },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, stock: data });
}
