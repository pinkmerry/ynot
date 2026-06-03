import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONDITIONS = new Set(["sealed", "raw", "graded"]);
const GRADING_SERVICES = new Set(["psa", "bgs", "cgc", "other"]);

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stockUnitErrorMessage(message?: string) {
  if (!message) return "Stock unit could not be updated.";
  if (message.includes("active_admin_required")) return "Admin access is required.";
  if (message.includes("stock_unit_required")) return "unitId is required.";
  if (message.includes("stock_unit_not_editable")) return "Unit not found or not editable (must be available).";
  if (message.includes("stock_unit_not_removable")) return "Unit not found or not removable (must be available).";
  if (message.includes("invalid_condition")) return "Choose a valid stock condition.";
  if (message.includes("graded_stock_identity_required")) return "Choose a grade and grading service for graded stock.";
  if (message.includes("invalid_grading_service")) return "Choose a valid grading service.";
  if (message.includes("stock_cert_number_already_used")) return "That cert number is already used by another unit.";
  return "Stock unit could not be updated.";
}

type UnitBody = {
  unitId?: unknown;
  condition?: unknown;
  grade?: unknown;
  gradingService?: unknown;
  certNumber?: unknown;
  gemrateId?: unknown;
  imageUrl?: unknown;
  imageStoragePath?: unknown;
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
  if (!CONDITIONS.has(conditionRaw)) {
    return Response.json(
      { error: "Choose a valid stock condition." },
      { status: 400 },
    );
  }
  const condition = conditionRaw;
  const gradingRaw = text(body?.gradingService, 16).toLowerCase();
  const grade = condition === "graded" ? text(body?.grade, 40) || null : null;
  const gradingService =
    condition === "graded" && GRADING_SERVICES.has(gradingRaw)
      ? gradingRaw
      : null;
  const certNumber =
    condition === "graded" ? text(body?.certNumber, 60) || null : null;
  const gemrateId =
    condition === "graded" ? text(body?.gemrateId, 60) || null : null;
  if (condition === "graded" && (!grade || !gradingService)) {
    return Response.json(
      { error: "Choose a grade and grading service for graded stock." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.rpc("edit_card_stock_unit", {
    p_unit_id: unitId,
    p_admin_id: admin.adminId,
    p_condition: condition,
    p_grade: grade,
    p_grading_service: gradingService,
    p_cert_number: certNumber,
    p_gemrate_id: gemrateId,
    p_image_url: text(body?.imageUrl, 600) || null,
    p_image_storage_path: text(body?.imageStoragePath, 400) || null,
  });

  if (error) {
    return Response.json(
      { error: stockUnitErrorMessage(error.message), code: "UNIT_UPDATE_FAILED" },
      { status: 409 },
    );
  }

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
  const { error } = await supabase.rpc("delete_card_stock_unit", {
    p_unit_id: unitId,
    p_admin_id: admin.adminId,
  });

  if (error) {
    return Response.json(
      { error: stockUnitErrorMessage(error.message), code: "UNIT_DELETE_FAILED" },
      { status: 409 },
    );
  }

  revalidateTag("campaigns", "max");
  return Response.json({ ok: true });
}
