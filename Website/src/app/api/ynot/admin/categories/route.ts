import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

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
  if (maybe?.code === "PGRST205" || maybe?.code === "42P01" || /store_categories|schema cache|does not exist/i.test(maybe?.message ?? "")) {
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
  if (!isSupabaseConfigured()) return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const admin = await resolveAdminSession();
  if (!admin) return { response: Response.json({ error: "Admin access is required." }, { status: 403 }) };
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
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  const validation = validateCategoryBody(body);
  if (validation) return Response.json({ ok: false, code: "CATEGORY_INVALID_INPUT", error: validation }, { status: 400 });

  const patch = categoryPatch(body);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("store_categories")
    .upsert({ ...patch, created_by_admin_id: guard.admin.adminId }, { onConflict: "slug" })
    .select("*")
    .single();
  if (error) return apiError(error);

  await supabase.from("audit_events").insert({
    actor_admin_id: guard.admin.adminId,
    event_type: "category_saved",
    metadata: { categoryId: data.id, slug: data.slug, isTest: data.is_test },
  });
  return Response.json({ ok: true, category: toCategory(data) });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;
  const body = await bodyJson(request);
  const categoryId = text(body?.categoryId, 80);
  if (!body || !categoryId) return Response.json({ error: "categoryId is required." }, { status: 400 });
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
  return Response.json({ ok: true, category: toCategory(data) });
}
