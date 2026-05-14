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

export const dynamic = "force-dynamic";

type CardStockBody = {
  cardId?: unknown;
  quantityDelta?: unknown;
  reason?: unknown;
  sourceId?: unknown;
};

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    { limit: 80, windowMs: 60_000 },
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
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("adjust_card_stock_units", {
    p_card_id: cardId,
    p_quantity_delta: delta,
    p_admin_id: admin.adminId,
    p_source_type: reason,
    p_source_id: sourceId,
    p_metadata: {
      adjustedByAdminId: admin.adminId,
      reason,
      sourceId,
    } satisfies Json,
  });

  if (error) {
    if (isMissingFunctionError(error, "adjust_card_stock_units")) {
      return randomPackSchemaMissingResponse();
    }
    return Response.json({ error: error.message }, { status: 409 });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_stock_adjusted",
    metadata: {
      cardId,
      quantityDelta: delta,
      reason,
      sourceId,
    },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, stock: data });
}
