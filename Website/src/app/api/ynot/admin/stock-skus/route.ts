import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import {
  isMissingFunctionError,
  randomPackSchemaMissingResponse,
} from "@/lib/supabase/schema-compat";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UNIT_KINDS = new Set(["card", "pack", "box", "other"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalUuid(value: unknown) {
  const clean = text(value, 80);
  if (!clean) return { value: null, invalid: false };
  return UUID_PATTERN.test(clean)
    ? { value: clean, invalid: false }
    : { value: null, invalid: true };
}

function positiveInt(value: unknown, max = 1000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : null;
}

function hasOwn(body: Record<string, unknown> | null, key: string) {
  return Boolean(body && Object.prototype.hasOwnProperty.call(body, key));
}

async function guard(request: Request, key: string) {
  if (!isSupabaseConfigured()) {
    return {
      error: Response.json(
        { error: "Supabase is not configured." },
        { status: 503 },
      ),
    };
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return { error: crossOrigin };
  const admin = await resolveAdminSession();
  if (!admin) {
    return {
      error: Response.json(
        { error: "Admin access is required." },
        { status: 403 },
      ),
    };
  }
  const limited = await enforceRateLimit(
    request,
    key,
    { limit: 180, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return { error: limited };
  return { admin };
}

function stockSkuErrorMessage(message?: string) {
  if (!message) return "Stock SKU could not be saved.";
  if (message.includes("invalid_stock_sku_kind")) {
    return "Choose a valid Sub-SKU type.";
  }
  if (message.includes("card_required")) return "Choose a product first.";
  if (message.includes("invalid_child_quantity")) {
    return "Packs per box must be between 1 and 1000.";
  }
  if (message.includes("stock_sku_not_found")) return "Stock SKU was not found.";
  if (message.includes("child_stock_sku_not_found")) {
    return "Child Sub-SKU was not found.";
  }
  if (message.includes("child_stock_sku_must_be_pack")) {
    return "A box must convert into a pack Sub-SKU.";
  }
  if (message.includes("child_stock_sku_conversion_in_use")) {
    return "This pack Sub-SKU is used by a box conversion rule.";
  }
  if (message.includes("stock_sku_unit_kind_locked")) {
    return "Remove or move active stock before changing this Sub-SKU type.";
  }
  if (message.includes("conversion_cross_card_not_allowed")) {
    return "Box and pack Sub-SKUs must belong to the same product.";
  }
  return "Stock SKU could not be saved.";
}

export async function GET(request: Request) {
  const gate = await guard(request, "ynot:admin:stock-skus:list");
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const requestedCardId = optionalUuid(url.searchParams.get("cardId"));
  if (requestedCardId.invalid) {
    return Response.json({ error: "Choose a valid product." }, { status: 400 });
  }
  const cardId = requestedCardId.value;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_admin_stock_sku_summary", {
    p_card_id: cardId,
  });
  if (error) {
    if (isMissingFunctionError(error, "get_admin_stock_sku_summary")) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json(
      {
        error: "Stock SKUs could not be loaded.",
        code: "STOCK_SKUS_LIST_FAILED",
      },
      { status: 409 },
    );
  }
  return Response.json({
    ok: true,
    stockSkus: Array.isArray(data) ? data : [],
  });
}

export async function POST(request: Request) {
  const gate = await guard(request, "ynot:admin:stock-skus:save");
  if (gate.error) return gate.error;
  const admin = gate.admin;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const unitKindRaw = text(body?.unitKind, 20);
  const unitKind = unitKindRaw || null;
  if (unitKind !== null && !UNIT_KINDS.has(unitKind)) {
    return Response.json(
      { error: "Choose a valid Sub-SKU type." },
      { status: 400 },
    );
  }
  const requestedStockSkuId = optionalUuid(body?.stockSkuId);
  const requestedCardId = optionalUuid(body?.cardId);
  const requestedChildStockSkuId = optionalUuid(body?.childStockSkuId);
  if (requestedStockSkuId.invalid) {
    return Response.json(
      { error: "Choose a valid Sub-SKU." },
      { status: 400 },
    );
  }
  if (requestedCardId.invalid) {
    return Response.json({ error: "Choose a valid product." }, { status: 400 });
  }
  if (requestedChildStockSkuId.invalid) {
    return Response.json(
      { error: "Choose a valid child Sub-SKU." },
      { status: 400 },
    );
  }
  const stockSkuId = requestedStockSkuId.value;
  const cardId = requestedCardId.value;
  const childStockSkuId = requestedChildStockSkuId.value;
  const clearConversionRule = body?.clearConversionRule === true;
  const childQuantity =
    body?.childQuantity === undefined ||
    body?.childQuantity === null ||
    body?.childQuantity === ""
      ? null
      : positiveInt(body.childQuantity, 1000);
  const sku = text(body?.sku, 80);
  const label = text(body?.label, 160);

  if (!stockSkuId && !cardId) {
    return Response.json({ error: "Choose a product first." }, { status: 400 });
  }
  if (!sku) {
    return Response.json({ error: "Sub-SKU code is required." }, { status: 400 });
  }
  if (!label) {
    return Response.json({ error: "Sub-SKU label is required." }, { status: 400 });
  }
  if (unitKind === "box" && childStockSkuId && !childQuantity) {
    return Response.json(
      { error: "Packs per box must be between 1 and 1000." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("upsert_stock_sku", {
    p_stock_sku_id: stockSkuId,
    p_card_id: cardId,
    p_sku_code: sku,
    p_label: label,
    p_unit_kind: unitKind,
    p_image_url: hasOwn(body, "imageUrl") ? text(body?.imageUrl, 600) : null,
    p_image_storage_path: hasOwn(body, "imageStoragePath")
      ? text(body?.imageStoragePath, 400)
      : null,
    p_parent_stock_sku_id: null,
    p_child_stock_sku_id: childStockSkuId,
    p_child_quantity: childQuantity,
    p_admin_id: admin.adminId,
    p_clear_conversion_rule: clearConversionRule,
  });
  if (error) {
    if (isMissingFunctionError(error, "upsert_stock_sku")) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json(
      { error: stockSkuErrorMessage(error.message), code: "STOCK_SKU_SAVE_FAILED" },
      { status: 409 },
    );
  }

  revalidateTag("campaigns", "max");
  revalidateTag("cards", "max");
  return Response.json({ ok: true, stockSku: data });
}
