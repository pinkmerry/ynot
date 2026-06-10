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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuidText(value: unknown) {
  const clean = text(value, 80);
  return UUID_PATTERN.test(clean) ? clean : "";
}

function quantity(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1000
    ? parsed
    : null;
}

function openErrorMessage(message?: string) {
  if (!message) return "Box stock could not be opened.";
  if (message.includes("conversion_rule_required")) {
    return "Set which pack this box contains before opening it.";
  }
  if (message.includes("not_enough_available_container_stock")) {
    return "Not enough available boxes to open.";
  }
  if (message.includes("conversion_cross_card_not_allowed")) {
    return "Box and pack Sub SKUs must belong to the same product.";
  }
  if (message.includes("invalid_conversion_rule_unit_kind")) {
    return "Only box Sub SKUs can be opened into pack Sub SKUs.";
  }
  if (message.includes("invalid_open_quantity")) {
    return "Open quantity must be between 1 and 1000 boxes.";
  }
  return "Box stock could not be opened.";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:stock-skus:open-container",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parentStockSkuId = uuidText(body?.parentStockSkuId);
  const openQuantity = quantity(body?.quantity);
  if (!parentStockSkuId || !openQuantity) {
    return Response.json(
      { error: "parentStockSkuId and quantity are required." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("open_stock_container", {
    p_parent_stock_sku_id: parentStockSkuId,
    p_quantity: openQuantity,
    p_admin_id: admin.adminId,
    p_note: text(body?.note, 300) || null,
  });
  if (error) {
    if (isMissingFunctionError(error, "open_stock_container")) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json(
      { error: openErrorMessage(error.message), code: "OPEN_CONTAINER_FAILED" },
      { status: 409 },
    );
  }

  revalidateTag("campaigns", "max");
  revalidateTag("cards", "max");
  return Response.json({ ok: true, result: data });
}
