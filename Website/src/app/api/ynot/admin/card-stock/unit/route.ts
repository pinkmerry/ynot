import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONDITIONS = new Set(["sealed", "raw", "graded"]);
const GRADING_SERVICES = new Set(["psa", "bgs", "cgc", "other"]);

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type UnitBody = {
  unitId?: unknown;
  condition?: unknown;
  grade?: unknown;
  gradingService?: unknown;
  certNumber?: unknown;
  gemrateId?: unknown;
};

async function guard(request: Request) {
  if (!isSupabaseConfigured()) {
    return {
      error: Response.json(
        { error: "Supabase is not configured." },
        { status: 503 },
      ),
    };
  }
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
    "ynot:admin:card-stock-unit",
    { limit: 80, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return { error: limited };
  return { admin };
}

// Edit a single available stock unit's physical identity.
export async function PATCH(request: Request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  const admin = gate.admin;

  const body = (await request.json().catch(() => null)) as UnitBody | null;
  const unitId = text(body?.unitId, 80);
  if (!unitId) {
    return Response.json({ error: "unitId is required." }, { status: 400 });
  }

  const conditionRaw = text(body?.condition, 16).toLowerCase();
  const gradingRaw = text(body?.gradingService, 16).toLowerCase();
  const patch: Record<string, string | null> = {
    grade: text(body?.grade, 40) || null,
    cert_number: text(body?.certNumber, 60) || null,
    gemrate_id: text(body?.gemrateId, 60) || null,
    grading_service: GRADING_SERVICES.has(gradingRaw) ? gradingRaw : null,
  };
  if (CONDITIONS.has(conditionRaw)) patch.condition = conditionRaw;

  // A cert pins one physical slab — reject if another unit already holds it.
  const supabase = createServiceSupabaseClient();
  if (patch.cert_number) {
    const { data: clash } = await supabase
      .from("card_stock_units")
      .select("id")
      .eq("cert_number", patch.cert_number)
      .neq("id", unitId)
      .limit(1);
    if (clash && clash.length > 0) {
      return Response.json(
        { error: "That cert number is already used by another unit." },
        { status: 409 },
      );
    }
  }

  // Only available units may be edited — reserved/allocated are locked to a pool.
  const { data: updated, error } = await supabase
    .from("card_stock_units")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", unitId)
    .eq("status", "available")
    .select("id,card_id")
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "Unit could not be updated.", code: "UNIT_UPDATE_FAILED" },
      { status: 409 },
    );
  }
  if (!updated) {
    return Response.json(
      { error: "Unit not found or not editable (must be available)." },
      { status: 409 },
    );
  }

  await supabase.from("card_stock_ledger").insert({
    stock_unit_id: updated.id,
    card_id: updated.card_id,
    event_type: "stock_created",
    actor_admin_id: admin.adminId,
    metadata: { action: "unit_edited", patch },
  });
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_stock_unit_edited",
    metadata: { unitId, patch },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true });
}

// Remove (soft-delete) a single available stock unit.
export async function DELETE(request: Request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  const admin = gate.admin;

  const body = (await request.json().catch(() => null)) as UnitBody | null;
  const unitId = text(body?.unitId, 80);
  if (!unitId) {
    return Response.json({ error: "unitId is required." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: removed, error } = await supabase
    .from("card_stock_units")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", unitId)
    .eq("status", "available")
    .select("id,card_id")
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "Unit could not be removed.", code: "UNIT_DELETE_FAILED" },
      { status: 409 },
    );
  }
  if (!removed) {
    return Response.json(
      { error: "Unit not found or not removable (must be available)." },
      { status: 409 },
    );
  }

  await supabase.from("card_stock_ledger").insert({
    stock_unit_id: removed.id,
    card_id: removed.card_id,
    event_type: "deleted",
    actor_admin_id: admin.adminId,
    metadata: { action: "unit_deleted" },
  });
  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_stock_unit_deleted",
    metadata: { unitId },
  });
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true });
}
