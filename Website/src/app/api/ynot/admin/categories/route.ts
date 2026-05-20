import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

type CategoryBody = {
  categoryId?: unknown;
  slug?: unknown;
  nameTh?: unknown;
  nameEn?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  icon?: unknown;
  legacySeries?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
};

type CategoryRow = Database["public"]["Tables"]["store_categories"]["Row"];

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function slugValue(value: unknown, fallback: string) {
  const slug = text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function apiError(error: unknown, fallback = "Category request failed.") {
  const maybe = error as { code?: string; message?: string; details?: string | null; hint?: string | null };
  if (maybe?.code === "23505") {
    return Response.json(
      {
        ok: false,
        code: "CATEGORY_DUPLICATE_SLUG",
        error: "This category slug is already used. Choose another slug or update the existing category.",
        detail: maybe.message,
      },
      { status: 409 },
    );
  }
  if (
    maybe?.code === "PGRST205" ||
    maybe?.code === "42P01" ||
    /schema cache|relation "store_categories" does not exist|table "store_categories" does not exist/i.test(
      maybe?.message ?? "",
    )
  ) {
    return Response.json(
      {
        ok: false,
        code: "CATEGORY_SCHEMA_MISSING",
        error: "Category database table is missing in this Supabase project. Apply the admin category migration before creating categories.",
        detail: maybe.message,
      },
      { status: 424 },
    );
  }
  if (maybe?.code === "23503") {
    return Response.json(
      {
        ok: false,
        code: "CATEGORY_INVALID_REFERENCE",
        error: "One category reference is invalid. Refresh the admin page and try again.",
        detail: maybe.message,
      },
      { status: 409 },
    );
  }
  return Response.json(
    {
      ok: false,
      code: maybe?.code ?? "CATEGORY_SAVE_FAILED",
      error: maybe?.message ?? fallback,
      detail: maybe?.details ?? null,
      hint: maybe?.hint ?? null,
    },
    { status: 409 },
  );
}

function toCategory(row: CategoryRow) {
  return {
    id: row.id,
    slug: row.slug,
    nameTh: row.name_th,
    nameEn: row.name_en,
    description: row.description,
    imageUrl: row.image_url,
    icon: row.icon,
    legacySeries: row.legacy_series,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isTest: row.is_test,
  };
}

function legacySeriesValue(value: unknown): "pokemon" | "one_piece" | null {
  return value === "pokemon" || value === "one_piece" ? value : null;
}

async function bodyJson(request: Request): Promise<CategoryBody | null> {
  return request.json().catch(() => null) as Promise<CategoryBody | null>;
}

function categoryPatch(body: CategoryBody): Database["public"]["Tables"]["store_categories"]["Insert"] {
  const nameTh = text(body.nameTh, 120) || text(body.nameEn, 120);
  const nameEn = text(body.nameEn, 120) || nameTh;
  return {
    slug: slugValue(body.slug, nameEn.toLowerCase().replace(/\s+/g, "-")),
    name_th: nameTh,
    name_en: nameEn,
    description: text(body.description, 500) || null,
    image_url: text(body.imageUrl, 1000) || null,
    icon: text(body.icon, 20) || null,
    legacy_series: legacySeriesValue(body.legacySeries),
    sort_order: numberValue(body.sortOrder, 100),
    is_active: booleanValue(body.isActive, true),
    is_test: booleanValue(body.isTest, false),
    seed_run_id: text(body.seedRunId, 80) || null,
  };
}

function validateCategoryBody(body: CategoryBody) {
  const nameTh = text(body.nameTh, 120);
  const nameEn = text(body.nameEn, 120);
  const slug = slugValue(body.slug, nameEn.toLowerCase().replace(/\s+/g, "-"));
  if (!nameTh && !nameEn) return "Thai name or English name is required.";
  if (!slug) return "URL slug is required.";
  if (slug.length < 2) return "URL slug must be at least 2 characters.";
  return null;
}

async function requireAdmin(request: Request) {
  if (!isSupabaseConfigured()) {
    return {
      response: adminErrorResponse(
        "SUPABASE_NOT_CONFIGURED",
        "Supabase is not configured.",
        503,
      ),
    };
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return {
      response: adminErrorResponse(
        "ADMIN_ACCESS_REQUIRED",
        "Admin access is required.",
        403,
      ),
    };
  }
  const limited = await enforceRateLimit(request, "ynot:admin:categories", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return { response: limited };
  return { admin };
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("store_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return apiError(error);
  return Response.json({ ok: true, categories: (data ?? []).map(toCategory) });
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
  const body = await bodyJson(request);
  if (!body) return adminErrorResponse("CATEGORY_INVALID_JSON", "Invalid JSON body.", 400);
  const validation = validateCategoryBody(body);
  if (validation) return Response.json({ ok: false, code: "CATEGORY_INVALID_INPUT", error: validation }, { status: 400 });

  const patch = categoryPatch(body);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("store_categories")
    .insert({ ...patch, created_by_admin_id: guard.admin.adminId })
    .select("*")
    .single();
  if (error) return apiError(error);

  await supabase.from("audit_events").insert({
    actor_admin_id: guard.admin.adminId,
    event_type: "category_saved",
    metadata: { categoryId: data.id, slug: data.slug, isTest: data.is_test },
  });
  revalidateTag("categories", "max");
  return Response.json({ ok: true, category: toCategory(data) });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
  const body = await bodyJson(request);
  const categoryId = text(body?.categoryId, 80);
  if (!categoryId)
    return adminErrorResponse(
      "CATEGORY_ID_REQUIRED",
      "categoryId is required.",
      400,
    );

  const supabase = createServiceSupabaseClient();

  // Eligibility check: refuse delete when any campaign links to this category.
  // The UI also disables Delete in that case, but we re-check on the server in
  // case the page is stale.
  const { count: linkedPackCount, error: linkError } = await supabase
    .from("draw_round_categories")
    .select("draw_round_id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (linkError) return apiError(linkError);
  if ((linkedPackCount ?? 0) > 0) {
    return Response.json(
      {
        ok: false,
        code: "CATEGORY_IN_USE",
        error: `Cannot delete: ${linkedPackCount} pack${linkedPackCount === 1 ? "" : "s"} still assigned to this category.`,
        packCount: linkedPackCount,
      },
      { status: 409 },
    );
  }

  const { data: current, error: fetchError } = await supabase
    .from("store_categories")
    .select("slug,name_en,is_test")
    .eq("id", categoryId)
    .maybeSingle();
  if (fetchError) return apiError(fetchError);
  if (!current)
    return adminErrorResponse(
      "CATEGORY_NOT_FOUND",
      "Category not found.",
      404,
    );

  const { error: deleteError } = await supabase
    .from("store_categories")
    .delete()
    .eq("id", categoryId);
  if (deleteError) return apiError(deleteError);

  await supabase.from("audit_events").insert({
    actor_admin_id: guard.admin.adminId,
    event_type: "category_deleted",
    metadata: {
      categoryId,
      slug: current.slug,
      nameEn: current.name_en,
      isTest: current.is_test,
    },
  });
  revalidateTag("categories", "max");
  return Response.json({ ok: true, categoryId });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
  const body = await bodyJson(request);
  const categoryId = text(body?.categoryId, 80);
  if (!body || !categoryId) return adminErrorResponse("CATEGORY_ID_REQUIRED", "categoryId is required.", 400);
  const validation = validateCategoryBody(body);
  if (validation) return Response.json({ ok: false, code: "CATEGORY_INVALID_INPUT", error: validation }, { status: 400 });

  const patch = categoryPatch(body);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("store_categories")
    .update(patch)
    .eq("id", categoryId)
    .select("*")
    .single();
  if (error) return apiError(error);

  await supabase.from("audit_events").insert({
    actor_admin_id: guard.admin.adminId,
    event_type: "category_updated",
    metadata: { categoryId: data.id, slug: data.slug, isTest: data.is_test },
  });
  revalidateTag("categories", "max");
  return Response.json({ ok: true, category: toCategory(data) });
}
