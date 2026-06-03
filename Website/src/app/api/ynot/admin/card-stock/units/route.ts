import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function groupKeyParts(groupKey: string) {
  const [condition = "raw", grade = "", gradingService = "", certNumber = "", gemrateId = ""] =
    groupKey.split("\u001f");
  return {
    condition: condition || "raw",
    grade,
    gradingService,
    certNumber,
    gemrateId,
  };
}

export async function GET(request: Request) {
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
    "ynot:admin:card-stock-units",
    { limit: 160, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const cardId = text(url.searchParams.get("cardId"), 80);
  const groupKey = text(url.searchParams.get("groupKey"), 240);
  const limit = Math.min(
    200,
    Math.max(1, Math.trunc(Number(url.searchParams.get("limit") ?? 100) || 100)),
  );
  if (!cardId || !groupKey) {
    return Response.json(
      { error: "cardId and groupKey are required." },
      { status: 400 },
    );
  }

  const group = groupKeyParts(groupKey);
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from("card_stock_units")
    .select(
      "id,condition,grade,grading_service,cert_number,gemrate_id,image_url,image_storage_path,status,quantity",
    )
    .eq("card_id", cardId)
    .eq("status", "available")
    .eq("condition", group.condition)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (group.condition === "graded") {
    query = group.grade
      ? query.eq("grade", group.grade)
      : query.or("grade.is.null,grade.eq.");
    query = group.gradingService
      ? query.eq("grading_service", group.gradingService)
      : query.or("grading_service.is.null,grading_service.eq.");
    query = group.certNumber
      ? query.eq("cert_number", group.certNumber)
      : query.or("cert_number.is.null,cert_number.eq.");
    query = group.gemrateId
      ? query.eq("gemrate_id", group.gemrateId)
      : query.or("gemrate_id.is.null,gemrate_id.eq.");
  }

  const { data, error } = await query;
  if (error) {
    return Response.json(
      {
        error: "Stock units could not be loaded.",
        code: "UNITS_LIST_FAILED",
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    units: (data ?? []).map((unit) => ({
      id: unit.id,
      condition: unit.condition,
      grade: unit.grade,
      gradingService: unit.grading_service,
      certNumber: unit.cert_number,
      gemrateId: unit.gemrate_id,
      imageUrl: unit.image_url,
      imageStoragePath: unit.image_storage_path,
      status: unit.status,
      quantity: unit.quantity ?? 1,
    })),
  });
}
